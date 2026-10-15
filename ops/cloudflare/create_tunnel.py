"""Cria somente um Tunnel local inativo; não configura DNS, rotas ou serviços."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import sys
import urllib.request

NAME = "pulso-private"
API = "https://api.cloudflare.com/client/v4"
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", re.I)


class PreparationError(Exception):
    pass


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(method, url, token, body):
    # Destino e operações fixos: nem redirecionamentos podem receber a credencial.
    if method not in ("GET", "POST") or not re.fullmatch(
        re.escape(API) + r"/accounts/[a-f0-9]{32}/cfd_tunnel(?:\?name=pulso-private&is_deleted=false)?", url
    ):
        raise PreparationError("cloudflare_request_rejected")
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json",
    })
    try:
        with urllib.request.build_opener(NoRedirects()).open(req, timeout=20) as response:
            content = response.read(1_000_001)
        if len(content) > 1_000_000:
            raise ValueError()
        return json.loads(content)
    except Exception:
        # Nunca repassar exceção, corpo da API, headers ou valores dos segredos.
        raise PreparationError("cloudflare_request_failed") from None


def _call(requester, method, url, token, body=None):
    try:
        response = requester(method, url, token, body)
        if not isinstance(response, dict) or response.get("success") is not True:
            raise ValueError()
        return response["result"]
    except Exception:
        raise PreparationError("cloudflare_request_failed") from None


def _write(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def create_tunnel(account_id, token_file, output_directory, requester=request):
    destination = Path(output_directory)
    source = Path(token_file)
    if not re.fullmatch(r"[a-f0-9]{32}", account_id) or destination.exists() or destination.is_symlink() or source.is_symlink():
        raise PreparationError("cloudflare_input_rejected")
    try:
        if os.name != "nt" and source.stat().st_mode & 0o077:
            raise ValueError()
        token = source.read_bytes()
        if len(token) > 256:
            raise ValueError()
        token = token.decode("ascii").strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{30,256}", token):
            raise ValueError()
    except Exception:
        raise PreparationError("cloudflare_token_file_rejected") from None
    url = API + "/accounts/" + account_id + "/cfd_tunnel"
    existing = _call(requester, "GET", url + "?name=pulso-private&is_deleted=false", token)
    # Falhar diante de qualquer resultado evita duplicação/alteração de recursos existentes.
    if not isinstance(existing, list) or existing:
        raise PreparationError("cloudflare_existing_tunnel_requires_review")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination.mkdir(mode=0o700)
    body = {"name": NAME, "config_src": "local", "tunnel_secret": base64.b64encode(secrets.token_bytes(32)).decode("ascii")}
    # Diário privado preservado antes do POST: um timeout não deve causar perda da chave
    # nem nova tentativa cega. Nunca repetir automaticamente ou apagar um Tunnel.
    _write(destination / "request.private.json", {"accountId": account_id, "request": body})
    result = _call(requester, "POST", url, token, body)
    if not isinstance(result, dict) or not UUID.fullmatch(result.get("id", "")) or result.get("account_tag") != account_id or result.get("name") != NAME or result.get("config_src") != "local" or result.get("connections") != [] or result.get("status") != "inactive":
        raise PreparationError("cloudflare_creation_requires_review")
    credentials = {"AccountTag": account_id, "TunnelID": result["id"], "TunnelSecret": body["tunnel_secret"]}
    _write(destination / "tunnel_credentials", credentials)
    metadata = {"accountId": account_id, "tunnelId": result["id"], "name": NAME, "configSource": "local", "status": "inactive", "routesCreated": False, "connectorStarted": False}
    _write(destination / "metadata.json", metadata)
    return metadata


def main():
    parser = argparse.ArgumentParser(description="Preparar Tunnel local, sem DNS, rotas ou conexão.")
    parser.add_argument("account_id")
    parser.add_argument("token_file", help="Arquivo privado; nunca passar o valor do token na linha de comando.")
    parser.add_argument("output_directory", help="Diretório privado novo; não sobrescrever saída anterior.")
    args = parser.parse_args()
    try:
        metadata = create_tunnel(args.account_id, args.token_file, args.output_directory)
        print(json.dumps({"event": "tunnel_prepared", **metadata}))
        return 0
    except PreparationError as error:
        print(json.dumps({"event": str(error)}), file=sys.stderr)
    except Exception:
        print('{"event":"cloudflare_preparation_failed"}', file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

"""Testes totalmente offline, com credenciais fictícias e diretório descartável."""
import base64
import importlib.util
import json
from pathlib import Path
import secrets
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("pulso_tunnel", Path(__file__).resolve().parents[2] / "ops/cloudflare/create_tunnel.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ACCOUNT = "a" * 32
ID = "b70ff985-a4ef-4643-bbbc-4a0ed4fc8415"


class TunnelPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pulso-tunnel-unit-")
        self.root = Path(self.temporary.name).resolve()
        self.assertEqual(self.root.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith("pulso-tunnel-unit-"))
        self.token = secrets.token_urlsafe(30)
        self.source = self.root / "api_token"
        self.source.write_text(self.token, encoding="ascii")
        self.source.chmod(0o600)
        self.output = self.root / "prepared"
        self.calls = []

    def tearDown(self):
        self.assertEqual(self.root.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith("pulso-tunnel-unit-"))
        self.temporary.cleanup()

    def valid_request(self, method, url, token, body):
        self.calls.append((method, url, body))
        self.assertEqual(token, self.token)
        self.assertNotIn(self.token, url)
        if method == "GET":
            return {"success": True, "result": []}
        self.assertEqual(body["config_src"], "local")
        return {"success": True, "result": {"id": ID, "account_tag": ACCOUNT, "name": "pulso-private", "config_src": "local", "connections": [], "status": "inactive"}}

    def test_creates_only_inactive_local_tunnel_and_private_credentials(self):
        metadata = module.create_tunnel(ACCOUNT, self.source, self.output, self.valid_request)
        self.assertEqual([call[0] for call in self.calls], ["GET", "POST"])
        self.assertTrue(all("/cfd_tunnel" in call[1] and "/dns" not in call[1] for call in self.calls))
        credentials = json.loads((self.output / "tunnel_credentials").read_text())
        self.assertEqual(credentials["AccountTag"], ACCOUNT)
        self.assertEqual(credentials["TunnelID"], ID)
        self.assertEqual(len(base64.b64decode(credentials["TunnelSecret"])), 32)
        self.assertNotIn(self.token, json.dumps(metadata))
        self.assertNotIn("TunnelSecret", json.dumps(metadata))
        self.assertFalse(metadata["routesCreated"])
        self.assertFalse(metadata["connectorStarted"])

    def test_refuses_existing_directory_before_request(self):
        self.output.mkdir()
        with self.assertRaises(module.PreparationError):
            module.create_tunnel(ACCOUNT, self.source, self.output, self.valid_request)
        self.assertEqual(self.calls, [])

    def test_existing_tunnel_is_preserved_without_post(self):
        with self.assertRaisesRegex(module.PreparationError, "existing_tunnel"):
            module.create_tunnel(ACCOUNT, self.source, self.output, lambda *args: {"success": True, "result": [{"id": ID}]})
        self.assertFalse(self.output.exists())

    def test_rejects_injected_account_and_multiline_token(self):
        with self.assertRaises(module.PreparationError):
            module.create_tunnel(ACCOUNT + "/dns_records", self.source, self.output, self.valid_request)
        self.source.write_text(self.token + "\nAuthorization: bad", encoding="ascii")
        with self.assertRaises(module.PreparationError):
            module.create_tunnel(ACCOUNT, self.source, self.output, self.valid_request)
        self.assertEqual(self.calls, [])

    def test_failed_creation_keeps_private_journal_and_does_not_retry(self):
        def timeout(method, url, token, body):
            if method == "GET":
                return {"success": True, "result": []}
            raise RuntimeError(self.token + body["tunnel_secret"])
        with self.assertRaises(module.PreparationError) as failure:
            module.create_tunnel(ACCOUNT, self.source, self.output, timeout)
        self.assertNotIn(self.token, str(failure.exception))
        self.assertTrue((self.output / "request.private.json").is_file())
        self.assertFalse((self.output / "tunnel_credentials").exists())
        with self.assertRaises(module.PreparationError):
            module.create_tunnel(ACCOUNT, self.source, self.output, self.valid_request)
        self.assertEqual(self.calls, [])

    def test_rejects_remote_or_connected_result(self):
        for config, connections, status in [("cloudflare", [], "inactive"), ("local", [{}], "healthy")]:
            output = self.root / ("remote" if config == "cloudflare" else "connected")
            def unexpected(method, url, token, body):
                result = self.valid_request(method, url, token, body)
                if method == "POST":
                    result["result"].update(config_src=config, connections=connections, status=status)
                return result
            with self.assertRaises(module.PreparationError):
                module.create_tunnel(ACCOUNT, self.source, output, unexpected)
            self.assertFalse((output / "tunnel_credentials").exists())

    def test_rejects_non_cloudflare_url_before_transmitting_token(self):
        with self.assertRaises(module.PreparationError):
            module.request("POST", "https://example.invalid/", self.token, {})


if __name__ == "__main__":
    unittest.main()

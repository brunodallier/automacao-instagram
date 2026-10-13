import type {
  InstagramConnectionResult,
  InstagramConnectionStatus,
} from "./types";

// A replaceable server-side credential source prepares future token rotation.
// No exchange, refresh, token persistence or expiry inference occurs here.
export type InstagramCredential = { accessToken: string; apiVersion: string };
export interface InstagramCredentialProvider {
  getCredential(): Promise<InstagramCredential | null>;
}

export class InstagramConfigurationError extends Error {}

export function environmentCredentialProvider(
  env: Record<string, string | undefined>,
): InstagramCredentialProvider {
  return {
    async getCredential() {
      const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
      if (!accessToken) return null;
      const apiVersion = env.INSTAGRAM_API_VERSION?.trim() || "v25.0";
      if (!/^v\d{2}\.\d+$/.test(apiVersion) || /\s/.test(accessToken))
        throw new InstagramConfigurationError();
      return { accessToken, apiVersion };
    },
  };
}

const messages: Record<InstagramConnectionStatus, string> = {
  NOT_CONFIGURED:
    "O token do Instagram ainda não foi configurado no ambiente local.",
  CONFIGURATION_ERROR:
    "Revise a configuração local do Instagram e reinicie o servidor.",
  CONNECTED:
    "A API oficial confirmou o acesso de leitura ao perfil. Envios e webhooks continuam desabilitados.",
  TOKEN_EXPIRED:
    "A Meta informou que o token expirou. Substitua-o no ambiente local e reinicie o servidor.",
  AUTHENTICATION_ERROR:
    "A Meta recusou o token. Confira a autorização da conta e substitua a credencial no ambiente local.",
  PERMISSION_ERROR:
    "A Meta recusou o acesso ao perfil. Confira a permissão instagram_business_basic e a autorização da conta.",
  RATE_LIMITED:
    "O limite de consultas da Meta foi atingido. Aguarde antes de verificar novamente.",
  UNAVAILABLE:
    "Não foi possível consultar o Instagram agora. Verifique sua conexão e tente novamente.",
  INVALID_RESPONSE:
    "A API não retornou um perfil válido. Revise o token e a versão da API configurados.",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function checkInstagramConnection(
  provider: InstagramCredentialProvider,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<InstagramConnectionResult> {
  let checkedAt: string | null = null;
  const result = (
    status: InstagramConnectionStatus,
  ): InstagramConnectionResult => ({
    status,
    message: messages[status],
    checkedAt,
    account: null,
  });
  let credential: InstagramCredential | null;
  try {
    credential = await provider.getCredential();
  } catch {
    // Never forward provider errors: future secret stores may include secrets.
    return result("CONFIGURATION_ERROR");
  }
  if (!credential) return result("NOT_CONFIGURED");
  // Validate every provider, including future implementations. Host is fixed.
  if (
    !/^v\d{2}\.\d+$/.test(credential.apiVersion) ||
    !credential.accessToken ||
    /\s/.test(credential.accessToken)
  )
    return result("CONFIGURATION_ERROR");
  checkedAt = now().toISOString();
  const signal = AbortSignal.timeout(8000);
  try {
    const url = new URL(
      `https://graph.instagram.com/${credential.apiVersion}/me`,
    );
    url.searchParams.set("fields", "user_id,username");
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    const payload = record(await response.json().catch(() => null));
    if (signal.aborted) return result("UNAVAILABLE");
    const error = record(payload.error);
    const code = error.code;
    // Do not infer expiry from a delay, an HTTP status or upstream free text.
    if (code === 190 && error.error_subcode === 463)
      return result("TOKEN_EXPIRED");
    if (code === 190 || code === 102 || response.status === 401)
      return result("AUTHENTICATION_ERROR");
    if (
      [4, 17, 32, 613, 80002].includes(code as number) ||
      response.status === 429
    )
      return result("RATE_LIMITED");
    if (code === 10 || code === 200 || response.status === 403)
      return result("PERMISSION_ERROR");
    if (response.status >= 500 || code === 1 || code === 2)
      return result("UNAVAILABLE");
    if (!response.ok || Object.keys(error).length)
      return result("INVALID_RESPONSE");
    // Only the requested identity is exposed; never serialize the raw payload.
    // Preserve large IDs as strings, avoiding JavaScript numeric rounding.
    const id = payload.user_id;
    const username = payload.username;
    if (
      typeof id !== "string" ||
      !/^\d{1,30}$/.test(id) ||
      typeof username !== "string" ||
      !/^[A-Za-z0-9._]{1,30}$/.test(username) ||
      id.includes(credential.accessToken) ||
      username.includes(credential.accessToken)
    )
      return result("INVALID_RESPONSE");
    return { ...result("CONNECTED"), account: { id, username } };
  } catch {
    // No URL/header/body/exception is logged or returned.
    return result("UNAVAILABLE");
  }
}

const reject = () => { throw new Error("Configuração Cloudflare inválida ou acesso insuficientemente restrito."); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = /^[a-f0-9]{64}$/i;
export function buildTunnelConfiguration({ hostname, teamName, tunnelId, audience }) {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/i.test(hostname ?? "") || !/^[a-z0-9][a-z0-9-]{1,62}$/i.test(teamName ?? "") || !uuid.test(tunnelId ?? "") || !hex.test(audience ?? "")) reject();
  return {
    tunnel: tunnelId,
    "credentials-file": "/run/secrets/tunnel_credentials",
    metrics: "127.0.0.1:2000",
    "loglevel": "warn",
    ingress: [
      { hostname, path: "^/(api/health|api/webhooks|webhooks)(/|$)", service: "http_status:404" },
      { hostname, service: "http://caddy:8080", originRequest: { httpHostHeader: hostname, access: { required: true, teamName, audTag: [audience] } } },
      { service: "http_status:404" },
    ],
  };
}
export function validateAccessState({ hostname, ownerEmail, app, policies, identityProviders }) {
  if (app?.type !== "self_hosted" || app.domain !== hostname || !hex.test(app.aud ?? "") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail ?? "")) reject();
  if (!Array.isArray(policies) || policies.length !== 1) reject();
  const policy = policies[0];
  const include = policy.include;
  if (policy.decision !== "allow" || !Array.isArray(include) || include.length !== 1 || Object.keys(include[0]).join() !== "email" || include[0].email?.email?.toLowerCase() !== ownerEmail.toLowerCase() || (policy.exclude?.length ?? 0) !== 0 || (policy.require?.length ?? 0) !== 0) reject();
  if (!Array.isArray(app.allowed_idps) || app.allowed_idps.length !== 1 || app.allowed_idps[0] === "" || app.allow_authenticate_via_warp === true) reject();
  const idp = identityProviders?.find((provider) => provider.id === app.allowed_idps[0]);
  if (idp?.type !== "onetimepin") reject();
  return { audience: app.aud, identityProvider: idp.id };
}
export function validateTunnelCredentials(credentials, tunnelId, accountId) {
  if (credentials?.TunnelID !== tunnelId || credentials?.AccountTag !== accountId || !/^[a-f0-9]{32}$/i.test(accountId ?? "") || !uuid.test(tunnelId ?? "") || typeof credentials.TunnelSecret !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(credentials.TunnelSecret) || Buffer.from(credentials.TunnelSecret, "base64").length !== 32) reject();
}

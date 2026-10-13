import {
  checkInstagramConnection,
  type InstagramCredentialProvider,
} from "./connection";

export class InstagramMediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export type ReelMetadata = {
  externalId: string;
  caption?: string | null;
  publishedAt?: Date | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
  mediaType: string;
  mediaProductType?: string | null;
  classification: "PRODUCT_TYPE" | "PERMALINK";
};
export type InstagramMediaSnapshot = {
  account: { id: string; username: string };
  reels: ReelMetadata[];
  pages: number;
  publications: number;
  unclassifiedVideos: number;
  unavailableFields: string[];
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const fail = () =>
  new InstagramMediaError(
    "INVALID_RESPONSE",
    "A Meta retornou publicações inválidas. Os Reels armazenados foram preservados.",
  );
function safeUrl(
  value: unknown,
  kind: "permalink" | "thumbnail",
  secret: string,
): string | null {
  if (
    typeof value !== "string" ||
    value.includes(secret) ||
    value.includes(encodeURIComponent(secret))
  )
    return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (kind === "permalink") {
      if (!["www.instagram.com", "instagram.com"].includes(url.hostname))
        return null;
      url.search = "";
      url.hash = "";
    } else if (
      !url.hostname.endsWith(".cdninstagram.com") &&
      !url.hostname.endsWith(".fbcdn.net")
    )
      return null;
    if (url.searchParams.has("access_token")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function readReel(
  value: unknown,
  secret: string,
): { reel: ReelMetadata | null; unclassified: boolean } {
  const data = object(value);
  if (
    typeof data.id !== "string" ||
    !/^\d{1,30}$/.test(data.id) ||
    data.id.includes(secret)
  )
    throw fail();
  if (
    typeof data.media_type !== "string" ||
    !["VIDEO", "IMAGE", "CAROUSEL_ALBUM"].includes(data.media_type)
  )
    throw fail();
  const permalink = safeUrl(data.permalink, "permalink", secret);
  const product =
    typeof data.media_product_type === "string"
      ? data.media_product_type
      : null;
  // VIDEO alone never means Reel. Use the product, or a canonical /reel/ permalink when product is absent.
  const fromProduct = product === "REELS";
  const fromPermalink =
    !product &&
    data.media_type === "VIDEO" &&
    !!permalink &&
    /^\/reel\/[^/]+\/?$/.test(new URL(permalink).pathname);
  if (data.media_type !== "VIDEO" || (!fromProduct && !fromPermalink))
    return {
      reel: null,
      unclassified: data.media_type === "VIDEO" && !product,
    };
  if (
    data.caption !== undefined &&
    data.caption !== null &&
    typeof data.caption !== "string"
  )
    throw fail();
  let publishedAt: Date | null | undefined;
  if (data.timestamp === null) publishedAt = null;
  else if (data.timestamp !== undefined) {
    if (
      typeof data.timestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(data.timestamp)
    )
      throw fail();
    publishedAt = new Date(data.timestamp);
    if (!Number.isFinite(publishedAt.getTime())) throw fail();
  }
  const caption =
    typeof data.caption === "string"
      ? data.caption.replaceAll(secret, "[credencial removida]")
      : data.caption === null
        ? null
        : undefined;
  return {
    unclassified: false,
    reel: {
      externalId: data.id,
      mediaType: data.media_type,
      classification: fromProduct ? "PRODUCT_TYPE" : "PERMALINK",
      ...(caption !== undefined ? { caption } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(permalink ? { permalink } : {}),
      ...(data.thumbnail_url
        ? {
            thumbnailUrl:
              safeUrl(data.thumbnail_url, "thumbnail", secret) ?? undefined,
          }
        : {}),
      ...(product ? { mediaProductType: product } : {}),
    },
  };
}

export async function fetchInstagramReels(
  provider: InstagramCredentialProvider,
  fetcher: typeof fetch = fetch,
): Promise<InstagramMediaSnapshot> {
  let credential;
  try {
    credential = await provider.getCredential();
  } catch {
    throw new InstagramMediaError(
      "CONFIGURATION_ERROR",
      "Revise a configuração local do Instagram.",
      422,
    );
  }
  if (!credential)
    throw new InstagramMediaError(
      "NOT_CONFIGURED",
      "Configure a conexão do Instagram antes de sincronizar.",
      422,
    );
  const profile = await checkInstagramConnection(
    { getCredential: async () => credential },
    fetcher,
  );
  if (!profile.account)
    throw new InstagramMediaError(
      profile.status,
      profile.message,
      profile.status === "RATE_LIMITED" ? 429 : 422,
    );
  const fields = [
    "id",
    "caption",
    "media_type",
    "media_product_type",
    "permalink",
    "timestamp",
    "thumbnail_url",
  ];
  const optional = new Set(["caption", "media_product_type", "thumbnail_url"]);
  const unavailableFields: string[] = [];
  const seenCursors = new Set<string>();
  const reels = new Map<string, ReelMetadata>();
  let cursor: string | undefined;
  let pages = 0,
    publications = 0,
    unclassifiedVideos = 0;
  while (true) {
    if (pages >= 1000)
      throw new InstagramMediaError(
        "PAGINATION_LIMIT",
        "A sincronização excedeu o limite de segurança de páginas e não foi aplicada. Os dados anteriores foram preservados.",
      );
    const url = new URL(
      `https://graph.instagram.com/${credential.apiVersion}/${profile.account.id}/media`,
    );
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("after", cursor);
    let response: Response;
    let data: Record<string, unknown>;
    try {
      const signal = AbortSignal.timeout(8000);
      response = await fetcher(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        redirect: "error",
        signal,
      });
      data = object(await response.json());
      if (signal.aborted) throw new Error();
    } catch {
      throw new InstagramMediaError(
        "UNAVAILABLE",
        "Não foi possível concluir a consulta ao Instagram. Os Reels armazenados foram preservados.",
      );
    }
    const error = object(data.error);
    const code = error.code;
    if (code === 190 && error.error_subcode === 463)
      throw new InstagramMediaError(
        "TOKEN_EXPIRED",
        "A Meta informou que o token expirou. Os Reels armazenados foram preservados.",
        422,
      );
    if (code === 190 || code === 102 || response.status === 401)
      throw new InstagramMediaError(
        "AUTHENTICATION_ERROR",
        "A Meta recusou a autenticação. Revise a conexão local; os Reels anteriores permanecem disponíveis.",
        422,
      );
    if (
      [4, 17, 32, 613, 80002].includes(code as number) ||
      response.status === 429
    )
      throw new InstagramMediaError(
        "RATE_LIMITED",
        "Limite de consultas da Meta atingido. Aguarde para sincronizar novamente; os dados anteriores foram preservados.",
        429,
      );
    if (code === 10 || code === 200 || response.status === 403)
      throw new InstagramMediaError(
        "PERMISSION_ERROR",
        "A Meta recusou a leitura das publicações. Confira a autorização da conta.",
        422,
      );
    if (response.status >= 500 || code === 1 || code === 2)
      throw new InstagramMediaError(
        "UNAVAILABLE",
        "A Meta está temporariamente indisponível. Os Reels anteriores foram preservados.",
      );
    if (!response.ok || Object.keys(error).length) {
      // Examine only known field names; never surface the upstream error text.
      const message = typeof error.message === "string" ? error.message : "";
      const missing =
        code === 100 &&
        /nonexisting field|unknown field|unsupported field|not supported|does not exist/i.test(
          message,
        )
          ? fields.find(
              (field) =>
                optional.has(field) &&
                new RegExp(`\\b${field}\\b`).test(message),
            )
          : undefined;
      if (missing) {
        fields.splice(fields.indexOf(missing), 1);
        unavailableFields.push(missing);
        continue;
      }
      throw new InstagramMediaError(
        "FIELDS_UNAVAILABLE",
        "A Meta não permitiu consultar os campos necessários. Nenhuma atualização parcial foi aplicada.",
      );
    }
    if (!Array.isArray(data.data)) throw fail();
    pages++;
    publications += data.data.length;
    for (const item of data.data) {
      const read = readReel(item, credential.accessToken);
      if (read.unclassified) unclassifiedVideos++;
      if (read.reel) reels.set(read.reel.externalId, read.reel);
    }
    const paging = object(data.paging);
    if (!paging.next) break;
    // Meta's next URL may contain a token. Never fetch, persist or return it.
    const after = object(paging.cursors).after;
    if (
      typeof after !== "string" ||
      !after ||
      after.length > 4096 ||
      after.includes(credential.accessToken) ||
      after.includes(encodeURIComponent(credential.accessToken)) ||
      seenCursors.has(after)
    )
      throw new InstagramMediaError(
        "PAGINATION_ERROR",
        "Não foi possível percorrer todas as páginas da Meta. Os Reels armazenados foram preservados.",
      );
    seenCursors.add(after);
    cursor = after;
  }
  return {
    account: profile.account,
    reels: [...reels.values()],
    pages,
    publications,
    unclassifiedVideos,
    unavailableFields,
  };
}

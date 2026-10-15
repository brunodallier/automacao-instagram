import {
  checkInstagramConnection,
  type InstagramCredentialProvider,
  type InstagramCredential,
} from "../connection";
import { createHash } from "node:crypto";
import { graphId, allowSend, type ExecutionSettings } from "./config";
import { fetchInstagramReels, type ReelMetadata } from "../media";
export type SendOutcome =
  | { kind: "API_ACCEPTED"; remoteId: string; recipientId?: string }
  | {
      kind: "REJECTED";
      category: string;
      code?: number;
      subcode?: number;
      retryAfterMs?: number;
      fallbackJustified: boolean;
    }
  | { kind: "UNKNOWN"; category: string };
export type CommentDetails = {
  id: string;
  text: string;
  createdAt: Date;
  authorId?: string;
  parentId?: string;
};
export type ReelDetails = {
  id: string;
  isReel: boolean;
  publishedAt: Date | null;
  catalogue?: ReelMetadata;
};
export interface InstagramTransport {
  comment(id: string): Promise<CommentDetails>;
  reel(id: string): Promise<ReelDetails>;
  send(
    accountId: string,
    kind: string,
    commentId: string,
    body: Record<string, unknown>,
  ): Promise<SendOutcome>;
}
export class InstagramReadError extends Error {
  constructor(
    public category: string,
    public retryable = false,
  ) {
    super(category);
  }
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const remoteId = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 300 &&
  !/[\s\p{Cc}]/u.test(v);
// A resposta de erro e sua mensagem não atravessam a fronteira da API/logs.
export function classifySendResponse(
  status: number,
  data: unknown,
  retryAfter: string | null = null,
): SendOutcome {
  const value = record(data),
    error = record(value.error);
  if (value.error && (remoteId(value.message_id) || remoteId(value.id)))
    return { kind: "UNKNOWN", category: "CONFLICTING_RESPONSE" };
  if (status >= 200 && status < 300 && !value.error) {
    if (remoteId(value.message_id) && graphId(value.recipient_id))
      return {
        kind: "API_ACCEPTED",
        remoteId: value.message_id,
        recipientId: value.recipient_id,
      };
    if (remoteId(value.id)) return { kind: "API_ACCEPTED", remoteId: value.id };
    return { kind: "UNKNOWN", category: "INVALID_SUCCESS" };
  }
  if (status >= 500)
    return { kind: "UNKNOWN", category: "UPSTREAM_UNCONFIRMED" };
  const code =
    typeof error.code === "number" &&
    Number.isInteger(error.code) &&
    error.code > 0
      ? error.code
      : undefined;
  const subcode =
    typeof error.error_subcode === "number" &&
    Number.isInteger(error.error_subcode) &&
    error.error_subcode >= 0
      ? error.error_subcode
      : undefined;
  if (code === undefined)
    return { kind: "UNKNOWN", category: "UNIDENTIFIED_RESPONSE" };
  const base = {
    kind: "REJECTED" as const,
    code,
    subcode,
    fallbackJustified: false,
  };
  if (code === 190) return { ...base, category: "AUTHENTICATION" };
  if (code === 10 || code === 200) return { ...base, category: "PERMISSION" };
  if ([4, 17, 32, 613].includes(code) || status === 429) {
    const seconds = Number(retryAfter);
    return {
      ...base,
      category: "RATE_LIMIT",
      retryAfterMs:
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds * 1000, 3600000)
          : 60000,
    };
  }
  // Não inferir privacidade, bloqueio ou entrega com base em texto livre da API.
  // A alternativa exige revisão explícita do erro definitivo por um proprietário.
  return { ...base, category: "META_REJECTED" };
}
export function graphTransport(
  provider: InstagramCredentialProvider,
  settings: ExecutionSettings,
  fetcher: typeof fetch = fetch,
): InstagramTransport {
  let verifiedFingerprint = "",
    verifiedUntil = 0;
  async function identity() {
    const credential = await provider.getCredential();
    if (!credential) throw new InstagramReadError("CONFIGURATION");
    const fingerprint = createHash("sha256")
      .update(credential.accessToken + credential.apiVersion)
      .digest("hex");
    if (verifiedFingerprint !== fingerprint || verifiedUntil <= Date.now()) {
      const result = await checkInstagramConnection(
        { getCredential: async () => credential },
        fetcher,
      );
      if (result.status !== "CONNECTED")
        throw new InstagramReadError(
          ["AUTHENTICATION_ERROR", "TOKEN_EXPIRED"].includes(result.status)
            ? "AUTHENTICATION"
            : result.status === "PERMISSION_ERROR"
              ? "PERMISSION"
              : "ACCOUNT_VERIFICATION",
          ["UNAVAILABLE", "RATE_LIMITED", "INVALID_RESPONSE"].includes(
            result.status,
          ),
        );
      if (result.account?.id !== settings.accountId)
        throw new InstagramReadError("ACCOUNT_MISMATCH");
      verifiedFingerprint = fingerprint;
      verifiedUntil = Date.now() + 300000;
    }
    return credential;
  }
  async function call(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    fields?: string,
    verified?: InstagramCredential,
  ) {
    const credential = verified ?? (await provider.getCredential());
    if (
      !credential ||
      !/^v\d{2}\.\d+$/.test(credential.apiVersion) ||
      !credential.accessToken ||
      /\s/.test(credential.accessToken)
    )
      throw new InstagramReadError("CONFIGURATION");
    const url = new URL(
      `https://graph.instagram.com/${credential.apiVersion}/${path}`,
    );
    if (fields) url.searchParams.set("fields", fields);
    const response = await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    if (raw.length > 65536) throw new InstagramReadError("INVALID_RESPONSE");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new InstagramReadError("INVALID_RESPONSE");
    }
    return {
      status: response.status,
      data,
      retryAfter: response.headers.get("retry-after"),
    };
  }
  async function read(id: string, fields: string) {
    if (!graphId(id)) throw new InstagramReadError("INVALID_ID");
    try {
      const result = await call(id, "GET", undefined, fields);
      if (
        result.status < 200 ||
        result.status >= 300 ||
        record(result.data).error
      ) {
        const outcome = classifySendResponse(
          result.status,
          result.data,
          result.retryAfter,
        );
        throw new InstagramReadError(
          outcome.kind === "REJECTED" ? outcome.category : "READ_UNAVAILABLE",
          outcome.kind !== "REJECTED" || outcome.category === "RATE_LIMIT",
        );
      }
      return record(result.data);
    } catch (error) {
      if (error instanceof InstagramReadError) throw error;
      throw new InstagramReadError("READ_UNAVAILABLE", true);
    }
  }
  return {
    async comment(id) {
      const v = await read(id, "id,text,timestamp");
      const date = new Date(typeof v.timestamp === "string" ? v.timestamp : "");
      if (
        v.id !== id ||
        typeof v.text !== "string" ||
        !Number.isFinite(date.getTime())
      )
        throw new InstagramReadError("INVALID_COMMENT");
      return { id, text: v.text, createdAt: date };
    },
    async reel(id) {
      // A lista autenticada prova a propriedade. Menções em mídia de terceiros não acionam o motor.
      try {
        const owned = await fetchInstagramReels(provider, fetcher);
        if (owned.account.id !== settings.accountId)
          throw new InstagramReadError("ACCOUNT_MISMATCH");
        const item = owned.reels.find((r) => r.externalId === id);
        return {
          id,
          isReel: !!item,
          publishedAt: item?.publishedAt ?? null,
          catalogue: item,
        };
      } catch (error) {
        if (error instanceof InstagramReadError) throw error;
        throw new InstagramReadError("READ_UNAVAILABLE", true);
      }
    },
    async send(accountId, kind, commentId, body) {
      const recipient = record(body.recipient).id;
      if (
        !graphId(accountId) ||
        !graphId(commentId) ||
        !allowSend(
          settings,
          accountId,
          commentId,
          typeof recipient === "string" ? recipient : undefined,
        )
      )
        return {
          kind: "REJECTED",
          category: "SEND_GATE",
          fallbackJustified: false,
        };
      let credential: InstagramCredential;
      try {
        credential = await identity();
      } catch (error) {
        return {
          kind: "REJECTED",
          category:
            error instanceof InstagramReadError
              ? error.category
              : "CONFIGURATION",
          retryAfterMs:
            error instanceof InstagramReadError && error.retryable
              ? 60000
              : undefined,
          fallbackJustified: false,
        };
      }
      try {
        const result = await call(
          kind === "PUBLIC_REPLY"
            ? `${commentId}/replies`
            : `${accountId}/messages`,
          "POST",
          body,
          undefined,
          credential,
        );
        const outcome = classifySendResponse(
          result.status,
          result.data,
          result.retryAfter,
        );
        // Uma resposta de DM precisa dos dois IDs; só um id de comentário não comprova DM aceita.
        if (
          outcome.kind === "API_ACCEPTED" &&
          kind === "PUBLIC_REPLY" &&
          !graphId(outcome.remoteId)
        )
          return { kind: "UNKNOWN", category: "INVALID_SUCCESS" };
        if (
          outcome.kind === "API_ACCEPTED" &&
          kind !== "PUBLIC_REPLY" &&
          !outcome.recipientId
        )
          return { kind: "UNKNOWN", category: "INVALID_SUCCESS" };
        return outcome;
      } catch (error) {
        return error instanceof InstagramReadError &&
          error.category === "CONFIGURATION"
          ? {
              kind: "REJECTED",
              category: "CONFIGURATION",
              fallbackJustified: false,
            }
          : { kind: "UNKNOWN", category: "NETWORK_UNCONFIRMED" };
      }
    },
  };
}

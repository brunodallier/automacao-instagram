import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { graphId, type ExecutionSettings } from "./config";
import {
  eventHash,
  boundedWebhookBody,
  secureEqual,
  validWebhookSignature,
} from "./security";
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const mid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 300 &&
  !/[\s\p{Cc}]/u.test(v);
export type NormalizedEvent = {
  accountId: string;
  key: string;
  kind: "COMMENT" | "MESSAGE" | "POSTBACK" | "SEEN";
  occurredAt: Date;
  data: Record<string, string>;
};
function timestamp(value: unknown, now: Date) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return null;
  const date = new Date(value < 100000000000 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) &&
    date.getTime() <= now.getTime() + 300000
    ? date
    : null;
}
export function normalizeWebhook(
  input: unknown,
  now = new Date(),
): NormalizedEvent[] {
  const result: NormalizedEvent[] = [];
  let count = 0,
    entries = 0;
  for (const envelope of Array.isArray(input) ? input : [input]) {
    const body = record(envelope);
    if (body.object !== "instagram" || !Array.isArray(body.entry))
      throw new Error("INVALID_ENVELOPE");
    for (const raw of body.entry) {
      if (++entries > 1000) throw new Error("TOO_MANY_EVENTS");
      const entry = record(raw);
      if (!graphId(entry.id)) continue;
      const accountId = entry.id;
      const changes = entry.field
        ? [{ field: entry.field, value: entry.value }]
        : list(entry.changes);
      for (const changeRaw of changes) {
        if (++count > 1000) throw new Error("TOO_MANY_EVENTS");
        const change = record(changeRaw);
        if (change.field !== "comments") continue;
        const v = record(change.value),
          commentId = v.id ?? v.comment_id,
          mediaId = record(v.media).id;
        const date = timestamp(entry.time, now);
        if (
          !graphId(commentId) ||
          !graphId(mediaId) ||
          !date ||
          v.parent_id ||
          record(v.from).id === accountId
        )
          continue;
        result.push({
          accountId,
          key: eventHash(`${accountId}:COMMENT:${commentId}`),
          kind: "COMMENT",
          occurredAt: date,
          data: { commentId, mediaId },
        });
      }
      for (const messageRaw of list(entry.messaging)) {
        if (++count > 1000) throw new Error("TOO_MANY_EVENTS");
        const item = record(messageRaw),
          sender = record(item.sender).id,
          recipient = record(item.recipient).id,
          date = timestamp(item.timestamp, now);
        if (
          !graphId(sender) ||
          recipient !== accountId ||
          sender === accountId ||
          !date
        )
          continue;
        const message = record(item.message),
          postback = record(item.postback),
          read = record(item.read);
        if (
          message.is_echo ||
          message.is_self ||
          message.is_deleted ||
          message.is_unsupported
        )
          continue;
        if (mid(message.mid))
          result.push({
            accountId,
            key: eventHash(`${accountId}:MESSAGE:${message.mid}`),
            kind: "MESSAGE",
            occurredAt: date,
            data: { senderId: sender, mid: message.mid },
          });
        else if (
          mid(postback.mid) &&
          typeof postback.payload === "string" &&
          /^pulso:[A-Za-z0-9_-]{43}$/.test(postback.payload)
        )
          result.push({
            accountId,
            key: eventHash(
              `${accountId}:POSTBACK:${sender}:${postback.payload}`,
            ),
            kind: "POSTBACK",
            occurredAt: date,
            data: {
              senderId: sender,
              mid: postback.mid,
              payload: postback.payload,
            },
          });
        else if (mid(read.mid))
          result.push({
            accountId,
            key: eventHash(`${accountId}:SEEN:${sender}:${read.mid}`),
            kind: "SEEN",
            occurredAt: date,
            data: { senderId: sender, mid: read.mid },
          });
      }
    }
  }
  return result;
}
export async function ingestWebhook(
  client: PrismaClient,
  events: NormalizedEvent[],
  settings: ExecutionSettings,
) {
  const accounts = await client.socialAccount.findMany({
    where: {
      platform: "INSTAGRAM",
      externalId: { in: [...new Set(events.map((event) => event.accountId))] },
    },
  });
  const data = events.flatMap((event) => {
    if (event.accountId !== settings.accountId) return [];
    const matched = accounts.filter((a) => a.externalId === event.accountId);
    if (matched.length !== 1) return [];
    return [
      {
        id: randomUUID(),
        socialAccountId: matched[0].id,
        eventKey: event.key,
        kind: event.kind,
        occurredAt: event.occurredAt,
        data: event.data,
      },
    ];
  });
  if (!data.length) return 0;
  return client.$transaction(async (tx) => {
    const created = await tx.instagramWebhookEvent.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: { id: true, socialAccountId: true, eventKey: true },
    });
    if (created.length)
      await tx.instagramJob.createMany({
        data: created.map((event) => ({
          socialAccountId: event.socialAccountId,
          eventId: event.id,
          dedupeKey: `event:${event.eventKey}`,
          kind: "EVENT",
        })),
        skipDuplicates: true,
      });
    return created.length;
  });
}
export function webhookHandlers(
  client: PrismaClient,
  settings: ExecutionSettings,
  now: () => Date = () => new Date(),
) {
  const configured = () =>
    settings.webhookEnabled &&
    settings.appSecret.length >= 16 &&
    settings.verifyToken.length >= 32 &&
    graphId(settings.accountId);
  const response = (status: number, body = "") =>
    new Response(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  return {
    async GET(request: Request) {
      if (!configured()) return response(404);
      const url = new URL(request.url),
        challenge = url.searchParams.get("hub.challenge") ?? "",
        token = url.searchParams.get("hub.verify_token") ?? "";
      if (
        url.searchParams.get("hub.mode") !== "subscribe" ||
        !/^\d{1,100}$/.test(challenge) ||
        !secureEqual(token, settings.verifyToken)
      )
        return response(403);
      return response(200, challenge);
    },
    async POST(request: Request) {
      if (!configured()) return response(404);
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return response(415);
      const signature = request.headers.get("x-hub-signature-256");
      if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature))
        return response(401);
      try {
        const raw = await boundedWebhookBody(request);
        if (
          !validWebhookSignature(
            raw,
            request.headers.get("x-hub-signature-256"),
            settings.appSecret,
          )
        )
          return response(401);
        let events: NormalizedEvent[];
        try {
          events = normalizeWebhook(JSON.parse(raw.toString("utf8")), now());
        } catch {
          return response(400);
        }
        await ingestWebhook(client, events, settings);
        return response(200, "EVENT_RECEIVED");
      } catch (error) {
        if (error instanceof Error && error.message === "BODY_TIMEOUT")
          return response(408);
        if (error instanceof Error && error.message === "BODY_TOO_LARGE")
          return response(413);
        // Falha de persistência não recebe 200: a Meta poderá reenviar sem perda/duplicação.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError ||
          error instanceof Error
        )
          return response(503);
        return response(503);
      }
    },
  };
}

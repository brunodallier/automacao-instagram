import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  validWebhookSignature,
  boundedWebhookBody,
  MAX_WEBHOOK_BYTES,
} from "../../src/lib/instagram/execution/security";
import {
  normalizeWebhook,
  webhookHandlers,
} from "../../src/lib/instagram/execution/webhook";
import { classifySendResponse } from "../../src/lib/instagram/execution/transport";
import {
  executionSettings,
  executionConfigured,
  allowSend,
  webhookDiagnosticsEnabled,
} from "../../src/lib/instagram/execution/config";
import type { PrismaClient } from "../../src/generated/prisma/client";
const now = new Date("2026-10-14T15:00:00Z"),
  secret = "fixture-secret-not-a-real-app-secret";
const config = {
  ...executionSettings({}),
  accountId: "123",
  webhookEnabled: true,
  appSecret: secret,
  verifyToken: "fixture-verification-token-of-thirty-two-characters",
};
const comment = {
  object: "instagram",
  entry: [
    {
      id: "123",
      time: now.getTime() / 1000,
      field: "comments",
      value: {
        id: "456",
        from: { id: "789" },
        media: { id: "101" },
        text: "Quero",
      },
    },
  ],
};
describe("webhooks oficiais", () => {
  it("diagnóstico fica desligado por padrão, exige prazo válido e expira automaticamente", () => {
    const clock = now.getTime();
    expect(webhookDiagnosticsEnabled({}, clock)).toBe(false);
    expect(webhookDiagnosticsEnabled({ INSTAGRAM_WEBHOOK_DIAGNOSTICS: "true" }, clock)).toBe(false);
    for (const deadline of ["NaN", "Infinity", String(clock), String(clock - 1), String(clock + 86400001)])
      expect(webhookDiagnosticsEnabled({ INSTAGRAM_WEBHOOK_DIAGNOSTICS: "true", INSTAGRAM_WEBHOOK_DIAGNOSTICS_UNTIL: deadline }, clock)).toBe(false);
    expect(webhookDiagnosticsEnabled({ INSTAGRAM_WEBHOOK_DIAGNOSTICS: "true", INSTAGRAM_WEBHOOK_DIAGNOSTICS_UNTIL: String(clock + 3600000) }, clock)).toBe(true);
  });
  it("valida HMAC sobre os bytes originais, inclusive UTF8, sem aceitar SHA1", () => {
    const raw = Buffer.from('{"text":"ação 🌊"}'),
      signature =
        "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(validWebhookSignature(raw, signature, secret)).toBe(true);
    expect(
      validWebhookSignature(
        Buffer.concat([raw, Buffer.from(" ")]),
        signature,
        secret,
      ),
    ).toBe(false);
    expect(validWebhookSignature(raw, signature, "outro-segredo")).toBe(false);
    expect(validWebhookSignature(raw, "sha1=" + "a".repeat(40), secret)).toBe(
      false,
    );
    expect(validWebhookSignature(raw, null, secret)).toBe(false);
  });
  it("aceita as duas formas documentadas de comentário sem mudar a chave de deduplicação", () => {
    const direct = normalizeWebhook(comment, now);
    const entry = comment.entry[0];
    const changed = {
      object: "instagram",
      entry: [
        {
          id: entry.id,
          time: entry.time,
          changes: [
            {
              field: "comments",
              value: {
                comment_id: "456",
                media: { id: "101" },
                from: { id: "789" },
              },
            },
          ],
        },
      ],
    };
    expect(direct).toHaveLength(1);
    expect(normalizeWebhook([changed], now)[0].key).toBe(direct[0].key);
    expect(direct[0].data).toEqual({ commentId: "456", mediaId: "101" });
  });
  it("aceita lote de mil mudanças e recusa o limite seguinte", () => {
    const value = { id: "456", media: { id: "101" } },
      entry = {
        id: "123",
        time: now.getTime() / 1000,
        changes: Array.from({ length: 1000 }, (_, i) => ({
          field: "comments",
          value: { ...value, id: String(i + 1000) },
        })),
      };
    expect(
      normalizeWebhook({ object: "instagram", entry: [entry] }, now),
    ).toHaveLength(1000);
    expect(() =>
      normalizeWebhook(
        {
          object: "instagram",
          entry: [{ ...entry, changes: [...entry.changes, entry.changes[0]] }],
        },
        now,
      ),
    ).toThrow("TOO_MANY_EVENTS");
  });
  it("ignora eco, mensagem excluída, autor da conta, live e timestamp inválido", () => {
    const envelope = {
      object: "instagram",
      entry: [
        {
          id: "123",
          time: now.getTime() / 1000,
          messaging: [
            {
              sender: { id: "789" },
              recipient: { id: "123" },
              timestamp: now.getTime(),
              message: { mid: "mid", is_echo: true },
            },
          ],
          changes: [
            { field: "live_comments", value: { id: "1", media: { id: "2" } } },
            {
              field: "comments",
              value: { id: "3", media: { id: "2" }, from: { id: "123" } },
            },
          ],
        },
      ],
    };
    expect(normalizeWebhook(envelope, now)).toEqual([]);
    expect(() =>
      normalizeWebhook({ object: "page", entry: [] }, now),
    ).toThrow();
    expect(
      normalizeWebhook(
        {
          ...comment,
          entry: [{ ...comment.entry[0], time: now.getTime() + 3600000 }],
        },
        now,
      ),
    ).toEqual([]);
  });
  it("limita o corpo real mesmo quando Content-Length é falso ou ausente", async () => {
    const request = new Request("https://fixture.invalid", {
      method: "POST",
      body: "a".repeat(MAX_WEBHOOK_BYTES + 1),
      headers: { "Content-Length": "1" },
    });
    await expect(boundedWebhookBody(request)).rejects.toThrow("BODY_TOO_LARGE");
  });
  it("confirma challenge só com token correto e mantém tudo fechado por padrão", async () => {
    const handlers = webhookHandlers({} as PrismaClient, config);
    const url = new URL("https://fixture.invalid/api/webhooks/instagram");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.challenge", "12345");
    url.searchParams.set("hub.verify_token", config.verifyToken);
    const response = await handlers.GET(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
    url.searchParams.set("hub.verify_token", "errado");
    expect((await handlers.GET(new Request(url))).status).toBe(403);
    expect(
      (
        await webhookHandlers({} as PrismaClient, executionSettings({})).POST(
          new Request("https://fixture.invalid", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  });
  it("não retorna 200 quando o evento não foi duravelmente persistido", async () => {
    const client = {
      socialAccount: {
        findMany: vi.fn(async () => {
          throw Error("erro privado que não deve aparecer");
        }),
      },
    } as unknown as PrismaClient;
    const raw = JSON.stringify(comment),
      signature =
        "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    const response = await webhookHandlers(client, config, () => now).POST(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
        },
        body: raw,
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("privado");
  });
  it("distingue assinatura ausente, malformada e divergente sem exportar valores", async () => {
    const sink = vi.fn();
    const client = { socialAccount: { findMany: vi.fn(async () => []) } } as unknown as PrismaClient;
    const handlers = webhookHandlers(client, config, () => now, sink);
    const raw = '{\r\n "object": "instagram", "entry": [], "fixture": "ação 🌊 não registrar" \r\n}\n';
    const signature = "sha256=" + createHmac("sha256", secret).update(Buffer.from(raw)).digest("hex");
    const send = (value?: string, body = raw, legacy = false) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (value !== undefined) headers.set("x-hub-signature-256", value);
      if (legacy) headers.set("x-hub-signature", "sha1=fixture-private-signature");
      return handlers.POST(new Request("https://fixture.invalid", { method: "POST", headers, body }));
    };
    expect((await send(undefined, raw, true)).status).toBe(401);
    expect(sink.mock.calls.at(-1)?.[0]).toEqual({ signature256Present: false, signature256FormatValid: false, legacySignaturePresent: true, rawBodyRead: false, result: "MISSING_SIGNATURE" });
    expect((await send("")).status).toBe(401);
    expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ signature256Present: true, signature256FormatValid: false, result: "INVALID_SIGNATURE_FORMAT" });
    expect((await send("sha256=malformed-private")).status).toBe(401);
    expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ signature256Present: true, signature256FormatValid: false, rawBodyRead: false, result: "INVALID_SIGNATURE_FORMAT" });
    expect((await send("sha256=" + "0".repeat(64))).status).toBe(401);
    expect(sink.mock.calls.at(-1)?.[0]).toMatchObject({ signature256FormatValid: true, rawBodyRead: true, result: "HMAC_MISMATCH" });
    expect((await send(signature)).status).toBe(200);
    expect(sink.mock.calls.at(-1)?.[0]).toEqual({ signature256Present: true, signature256FormatValid: true, legacySignaturePresent: false, rawBodyRead: true, result: "VALID_SIGNATURE" });
    expect((await send(signature, raw + " ")).status).toBe(401);
    const reserialized = "sha256=" + createHmac("sha256", secret).update(JSON.stringify(JSON.parse(raw))).digest("hex");
    expect((await send(reserialized)).status).toBe(401);
    const serialized = JSON.stringify(sink.mock.calls);
    for (const privateValue of [secret, signature, reserialized, raw, "não registrar", "malformed-private", "fixture-private-signature"])
      expect(serialized).not.toContain(privateValue);
    expect(client.socialAccount.findMany).toHaveBeenCalledTimes(1);
  });
  it("falha no diagnóstico não relaxa autenticação nem produz confirmação falsa", async () => {
    const handlers = webhookHandlers({} as PrismaClient, config, () => now, () => { throw Error("fixture-private-error"); });
    expect((await handlers.POST(new Request("https://fixture.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status).toBe(401);
  });
});
describe("resultado real da API e travas de envio", () => {
  it.each(["UNCONFIRMED", "API_ACCEPTED", "DELAYED"])(
    "%s não implica entrega nem alternativa",
    () => {
      expect(classifySendResponse(200, {})).toMatchObject({ kind: "UNKNOWN" });
      expect(classifySendResponse(500, { error: { code: 4 } })).toMatchObject({
        kind: "UNKNOWN",
      });
    },
  );
  it("mantém autenticação/permissões e rejeições definitivas distintas de rate limit", () => {
    expect(
      classifySendResponse(400, {
        error: { code: 190, message: "fixture-private-data" },
      }),
    ).toEqual({
      kind: "REJECTED",
      code: 190,
      subcode: undefined,
      category: "AUTHENTICATION",
      fallbackJustified: false,
    });
    expect(classifySendResponse(400, { error: { code: 200 } })).toMatchObject({
      category: "PERMISSION",
      fallbackJustified: false,
    });
    expect(
      classifySendResponse(429, { error: { code: 4 } }, "30"),
    ).toMatchObject({ category: "RATE_LIMIT", retryAfterMs: 30000 });
    expect(
      classifySendResponse(400, {
        error: {
          code: 100,
          error_subcode: 999,
          message: "fixture-private-data",
        },
      }),
    ).toMatchObject({
      category: "META_REJECTED",
      subcode: 999,
      fallbackJustified: false,
    });
  });
  it("controlado exige conta, comentário e destinatário; live exige validação explícita", () => {
    const controlled = {
      ...config,
      mode: "controlled" as const,
      testCommentId: "456",
      testRecipientId: "789",
    };
    expect(executionConfigured(controlled)).toBe(true);
    expect(allowSend(controlled, "123", "456", "789")).toBe(true);
    expect(allowSend(controlled, "123", "455", "789")).toBe(false);
    expect(allowSend(controlled, "123", "456", "788")).toBe(false);
    expect(
      executionConfigured({
        ...controlled,
        mode: "live",
        metaValidated: false,
      }),
    ).toBe(false);
    expect(executionSettings({ INSTAGRAM_SEND_MODE: "unexpected" }).mode).toBe(
      "disabled",
    );
  });
});

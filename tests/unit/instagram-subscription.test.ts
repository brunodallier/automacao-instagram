import { describe, it, expect, vi } from "vitest";
import {
  checkWebhookSubscription,
  subscribeWebhookAccount,
  INSTAGRAM_WEBHOOK_FIELDS,
} from "../../src/lib/instagram/execution/subscriptions";
import { runtimeCredentialProvider } from "../../src/lib/instagram/execution/credentials";
import { graphTransport } from "../../src/lib/instagram/execution/transport";
import { executionSettings } from "../../src/lib/instagram/execution/config";
import type { readFileSync } from "node:fs";
const provider = {
  getCredential: async () => ({
    accessToken: "fixture-not-real",
    apiVersion: "v25.0",
  }),
};
const identity = () =>
  Response.json({ user_id: "123", username: "fixtureuser" });
describe("inscrição de webhooks e credenciais", () => {
  it("consulta exclusivamente por GET e não mostra o token no resultado ou URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).not.toContain("fixture-not-real");
      expect(options?.method ?? "GET").toBe("GET");
      return new URL(String(url)).pathname.endsWith("/me")
        ? identity()
        : Response.json({
            data: [{ id: "456", subscribed_fields: INSTAGRAM_WEBHOOK_FIELDS }],
          });
    });
    expect(
      await checkWebhookSubscription(provider, "123", fetcher),
    ).toMatchObject({ status: "SUBSCRIBED", apps: [{ id: "456" }] });
  });
  it("não configura a conta sem aprovação explícita", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await subscribeWebhookAccount(provider, "123", false, fetcher),
    ).toEqual({ applied: false, status: "APPROVAL_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("recusa troca de conta e preserva campos existentes fora do escopo", async () => {
    const wrong = vi.fn<typeof fetch>(async () =>
      Response.json({ user_id: "999", username: "otheruser" }),
    );
    expect(
      await checkWebhookSubscription(provider, "123", wrong),
    ).toMatchObject({ status: "ACCOUNT_MISMATCH" });
    const existing = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname.endsWith("/me")
        ? identity()
        : Response.json({
            data: [{ id: "456", subscribed_fields: ["story_insights"] }],
          }),
    );
    expect(
      await subscribeWebhookAccount(provider, "123", true, existing),
    ).toMatchObject({
      applied: false,
      status: "EXISTING_SUBSCRIPTIONS_REVIEW_REQUIRED",
    });
  });
  it("setup autorizado usa Bearer e corpo JSON, sem token na URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).not.toContain("fixture-not-real");
      if (new URL(String(url)).pathname.endsWith("/me")) return identity();
      if (options?.method === "POST") {
        expect(options.headers).toMatchObject({
          Authorization: "Bearer fixture-not-real",
        });
        expect(JSON.parse(options.body as string)).toEqual({
          subscribed_fields: INSTAGRAM_WEBHOOK_FIELDS.join(","),
        });
        return Response.json({ success: true });
      }
      return Response.json({ data: [] });
    });
    expect(
      await subscribeWebhookAccount(provider, "123", true, fetcher),
    ).toMatchObject({ applied: true, status: "SUBSCRIBED" });
  });
  it("relê arquivo de token e sanitiza erros do armazenamento privado", async () => {
    let value = "fixture-first";
    const reader = vi.fn(() => value) as unknown as typeof readFileSync;
    const source = runtimeCredentialProvider(
      {
        INSTAGRAM_ACCESS_TOKEN_FILE: "/private/fixture",
        INSTAGRAM_ACCESS_TOKEN: "snapshot-old",
      },
      reader,
    );
    expect((await source.getCredential())?.accessToken).toBe("fixture-first");
    value = "fixture-second";
    expect((await source.getCredential())?.accessToken).toBe("fixture-second");
    const failed = runtimeCredentialProvider(
      { INSTAGRAM_ACCESS_TOKEN_FILE: "/private/fixture" },
      (() => {
        throw Error("fixture-sensitive-details");
      }) as unknown as typeof readFileSync,
    );
    await expect(failed.getCredential()).rejects.not.toThrow("sensitive");
  });
  it("adapter de envio impede POST quando a identidade do token não é a conta vinculada", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ user_id: "999", username: "otheruser" }),
    );
    const settings = {
      ...executionSettings({}),
      mode: "controlled" as const,
      webhookEnabled: true,
      accountId: "123",
      testCommentId: "456",
      testRecipientId: "789",
    };
    expect(
      await graphTransport(provider, settings, fetcher).send(
        "123",
        "PRIVATE_REPLY",
        "456",
        { recipient: { comment_id: "456" }, message: { text: "teste" } },
      ),
    ).toMatchObject({ kind: "REJECTED", category: "ACCOUNT_MISMATCH" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

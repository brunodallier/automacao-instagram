import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkInstagramConnection,
  environmentCredentialProvider,
} from "@/lib/instagram/connection";

// Disposable, nonfunctional credentials; never read the installation's token.
const credential = () => ({
  INSTAGRAM_ACCESS_TOKEN: randomUUID(),
  INSTAGRAM_API_VERSION: "v25.0",
});
const at = () => new Date("2026-10-13T12:00:00.000Z");
afterEach(() => vi.restoreAllMocks());

describe("consulta de leitura ao Instagram", () => {
  it("não faz requisição sem token e não inventa uma data de consulta", async () => {
    const fetcher = vi.fn();
    const result = await checkInstagramConnection(
      environmentCredentialProvider({}),
      fetcher,
    );
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.checkedAt).toBeNull();
    expect(result.account).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("envia somente GET para host fixo, sem token na URL, sem cache ou redirects", async () => {
    const env = credential();
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          user_id: "17841400000000001",
          username: "pulso_teste",
          access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
      );
    const result = await checkInstagramConnection(
      environmentCredentialProvider(env),
      fetcher,
      at,
    );
    const [input, options] = fetcher.mock.calls[0];
    const url = new URL(input);
    expect(url.origin).toBe("https://graph.instagram.com");
    expect(url.pathname).toBe("/v25.0/me");
    expect([...url.searchParams.entries()]).toEqual([
      ["fields", "user_id,username"],
    ]);
    expect(String(input).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(false);
    expect(options.method).toBe("GET");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
    expect(
      options.headers.Authorization === `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,
    ).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      status: "CONNECTED",
      message: expect.any(String),
      checkedAt: at().toISOString(),
      account: { id: "17841400000000001", username: "pulso_teste" },
    });
    expect(JSON.stringify(result).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(
      false,
    );
  });

  it.each([
    [400, { code: 190, error_subcode: 463 }, "TOKEN_EXPIRED"],
    [400, { code: 190, error_subcode: 467 }, "AUTHENTICATION_ERROR"],
    [401, {}, "AUTHENTICATION_ERROR"],
    [403, { code: 10 }, "PERMISSION_ERROR"],
    [400, { code: 200 }, "PERMISSION_ERROR"],
    [429, {}, "RATE_LIMITED"],
    [400, { code: 4 }, "RATE_LIMITED"],
    [503, {}, "UNAVAILABLE"],
    [400, { code: 100 }, "INVALID_RESPONSE"],
  ])(
    "mapeia HTTP %s e erro Meta sem divulgar o payload",
    async (status, error, expected) => {
      const env = credential();
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {
              error: {
                ...error,
                message: env.INSTAGRAM_ACCESS_TOKEN,
                fbtrace_id: env.INSTAGRAM_ACCESS_TOKEN,
              },
            },
            { status },
          ),
        );
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const failure = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await checkInstagramConnection(
        environmentCredentialProvider(env),
        fetcher,
        at,
      );
      expect(result.status).toBe(expected);
      expect(result.account).toBeNull();
      expect(JSON.stringify(result).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(
        false,
      );
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
    },
  );

  it("não interpreta mensagem livre ou timeout como token expirado", async () => {
    const env = credential();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new Error(`Token expired ${env.INSTAGRAM_ACCESS_TOKEN}`),
      );
    const result = await checkInstagramConnection(
      environmentCredentialProvider(env),
      fetcher,
      at,
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(JSON.stringify(result).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(
      false,
    );
  });

  it.each([
    { user_id: 17841400000000001, username: "pulso" },
    { user_id: "17841400000000001" },
    { id: "17841400000000001", username: "pulso" },
    { user_id: "invalid", username: "pulso" },
    { user_id: "17841400000000001", username: "<script>" },
  ])("recusa perfil incompleto ou identidade inválida", async (payload) => {
    const result = await checkInstagramConnection(
      environmentCredentialProvider(credential()),
      vi.fn().mockResolvedValue(Response.json(payload)),
    );
    expect(result.status).toBe("INVALID_RESPONSE");
    expect(result.account).toBeNull();
  });

  it("trata JSON inválido e bloqueia eco do segredo até em campos de identidade", async () => {
    const env = {
      ...credential(),
      INSTAGRAM_ACCESS_TOKEN: randomUUID().replaceAll("-", "").slice(0, 20),
    };
    const invalid = await checkInstagramConnection(
      environmentCredentialProvider(env),
      vi.fn().mockResolvedValue(new Response("not json")),
    );
    expect(invalid.status).toBe("INVALID_RESPONSE");
    const echoed = await checkInstagramConnection(
      environmentCredentialProvider(env),
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            user_id: "17841400000000001",
            username: env.INSTAGRAM_ACCESS_TOKEN,
          }),
        ),
    );
    expect(echoed.status).toBe("INVALID_RESPONSE");
    expect(JSON.stringify(echoed).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(
      false,
    );
  });

  it.each(["https://other-host.invalid", "v25.0/../", "invalid"])(
    "recusa versão inválida sem usar o transporte",
    async (version) => {
      const env = { ...credential(), INSTAGRAM_API_VERSION: version };
      const fetcher = vi.fn();
      const result = await checkInstagramConnection(
        environmentCredentialProvider(env),
        fetcher,
      );
      expect(result.status).toBe("CONFIGURATION_ERROR");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("permite substituir o provedor na futura rotação sem divulgar falhas do cofre", async () => {
    const env = credential();
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          user_id: "17841400000000001",
          username: "pulso_teste",
        }),
      );
    const provider = {
      getCredential: vi
        .fn()
        .mockResolvedValue({
          accessToken: env.INSTAGRAM_ACCESS_TOKEN,
          apiVersion: "v25.0",
        }),
    };
    expect((await checkInstagramConnection(provider, fetcher)).status).toBe(
      "CONNECTED",
    );
    provider.getCredential.mockRejectedValue(
      new Error(env.INSTAGRAM_ACCESS_TOKEN),
    );
    const result = await checkInstagramConnection(provider, fetcher);
    expect(result.status).toBe("CONFIGURATION_ERROR");
    expect(JSON.stringify(result).includes(env.INSTAGRAM_ACCESS_TOKEN)).toBe(
      false,
    );
  });
});

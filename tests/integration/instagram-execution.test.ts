import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { testClient } from "../helpers/database";
import { automationService } from "../../src/lib/automations";
import { automationEngine } from "../../src/lib/instagram/execution/engine";
import {
  ingestWebhook,
  normalizeWebhook,
  webhookHandlers,
} from "../../src/lib/instagram/execution/webhook";
import {
  graphTransport,
  type InstagramTransport,
  type SendOutcome,
} from "../../src/lib/instagram/execution/transport";
import type { ExecutionSettings } from "../../src/lib/instagram/execution/config";
import type { AutomationDraft } from "../../src/lib/automation-draft";
import { listActivities } from "../../src/lib/instagram/execution/activity";

const client = testClient();
let workspaceId: string,
  accountId: string,
  clock: Date,
  engine: ReturnType<typeof automationEngine>;
let settings: ExecutionSettings,
  transport: InstagramTransport,
  sends: { kind: string; body: Record<string, unknown> }[],
  outcomes: SendOutcome[];
const accountExternal = "17841000123456789",
  commentId = "18000000000001",
  mediaId = "18000000000002",
  recipientId = "18000000000003";
function draft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    name: "MVP",
    scope: "GLOBAL",
    keywords: ["quero"],
    steps: [{ kind: "SEND_DM", format: "TEXT", text: "Olá 🌊", buttons: [] }],
    publicReplies: {
      enabled: true,
      strategy: "ROTATING",
      variations: ["Resposta A", "Resposta B", "", "", ""],
      fallback: {
        enabled: true,
        text: "Não consegui enviar a DM; escreva para nós.",
      },
    },
    ...overrides,
  };
}
const message = (text: string) => ({
  kind: "SEND_DM" as const,
  format: "TEXT" as const,
  text,
  buttons: [],
});
function comment(id = commentId) {
  return {
    object: "instagram",
    entry: [
      {
        id: accountExternal,
        time: Math.floor(clock.getTime() / 1000),
        changes: [
          {
            field: "comments",
            value: {
              id,
              from: { id: recipientId },
              text: "QUERO",
              media: { id: mediaId },
            },
          },
        ],
      },
    ],
  };
}
function incoming(data: Record<string, unknown>, sender = recipientId) {
  return {
    object: "instagram",
    entry: [
      {
        id: accountExternal,
        time: Math.floor(clock.getTime() / 1000),
        messaging: [
          {
            sender: { id: sender },
            recipient: { id: accountExternal },
            timestamp: clock.getTime(),
            ...data,
          },
        ],
      },
    ],
  };
}
async function ingest(payload: unknown) {
  return ingestWebhook(client, normalizeWebhook(payload, clock), settings);
}
async function drain() {
  for (let i = 0; i < 100; i++) {
    clock = new Date(clock.getTime() + 1000);
    if (!(await engine.processOne())) return;
  }
  throw Error("Fila não drenou");
}
async function activate(value = draft()) {
  await engine.heartbeat();
  const service = automationService(client, settings);
  const automation = await service.create(workspaceId, value);
  await service.activate(workspaceId, automation.id);
  return automation;
}
beforeAll(async () => {});
afterAll(async () => {
  await client.$disconnect();
});
beforeEach(async () => {
  clock = new Date();
  sends = [];
  outcomes = [];
  const workspace = await client.workspace.create({
    data: { name: `execution-${randomUUID()}` },
  });
  workspaceId = workspace.id;
  const account = await client.socialAccount.create({
    data: {
      workspaceId,
      platform: "INSTAGRAM",
      externalId: accountExternal,
      status: "CONNECTED",
    },
  });
  accountId = account.id;
  await client.instagramReel.create({
    data: {
      socialAccountId: accountId,
      externalId: mediaId,
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      classification: "META_REELS",
      publishedAt: new Date(clock.getTime() - 86400000),
      syncedAt: clock,
    },
  });
  settings = {
    mode: "live",
    accountId: accountExternal,
    webhookEnabled: true,
    appSecret: "fixture-app-secret-never-valid-at-meta",
    verifyToken: "fixture-verify-token-never-valid-at-meta",
    testCommentId: "",
    testRecipientId: "",
    metaValidated: true,
  };
  transport = {
    comment: vi.fn(async (id) => ({
      id,
      text: "Quero receber",
      createdAt: new Date(clock.getTime() - 60000),
      authorId: recipientId,
    })),
    reel: vi.fn(async (id) => ({ id, isReel: true, publishedAt: clock })),
    send: vi.fn<InstagramTransport["send"]>(
      async (_account, kind, _comment, body) => {
        sends.push({ kind, body });
        return (
          outcomes.shift() ?? {
            kind: "API_ACCEPTED",
            remoteId: `fixture-mid-${sends.length}`,
            recipientId: kind === "PUBLIC_REPLY" ? undefined : recipientId,
          }
        );
      },
    ),
  };
  engine = automationEngine(client, { settings, transport, now: () => clock });
});
afterEach(async () => {
  await client.instagramReel.deleteMany({
    where: { socialAccountId: accountId },
  });
  await client.workspace.delete({ where: { id: workspaceId } });
});
describe("fluxo real do motor em PostgreSQL isolado", () => {
  it("recebe assinatura real HMAC, persiste antes do 200 e deduplica reentregas", async () => {
    await activate();
    const handlers = webhookHandlers(client, settings, () => clock),
      raw = JSON.stringify(comment()),
      signature =
        "sha256=" +
        createHmac("sha256", settings.appSecret).update(raw).digest("hex");
    const req = () =>
      new Request("https://fixture.invalid/api/webhooks/instagram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
        },
        body: raw,
      });
    expect((await handlers.POST(req())).status).toBe(200);
    expect((await handlers.POST(req())).status).toBe(200);
    expect(
      await client.instagramWebhookEvent.count({
        where: { socialAccountId: accountId },
      }),
    ).toBe(1);
    await drain();
    expect(sends.map((s) => s.kind)).toEqual(["PRIVATE_REPLY", "PUBLIC_REPLY"]);
    expect(sends[0].body).toMatchObject({
      recipient: { comment_id: commentId },
      message: { text: "Olá 🌊" },
    });
    expect(
      await client.instagramActivity.count({
        where: { run: { workspaceId }, kind: "API_ACCEPTED" },
      }),
    ).toBe(2);
    expect(
      await client.instagramActivity.count({
        where: { run: { workspaceId }, kind: "MESSAGE_SEEN" },
      }),
    ).toBe(0);
  });
  it("escolhe automação específica antes da global e preserva as tags", async () => {
    await activate(draft({ name: "Global" }));
    const reel = await client.instagramReel.findUniqueOrThrow({
      where: {
        socialAccountId_externalId: {
          socialAccountId: accountId,
          externalId: mediaId,
        },
      },
    });
    const tag = await client.tag.create({
      data: { workspaceId, name: "Lead", normalizedName: "lead" },
    });
    await activate(
      draft({
        name: "Específica",
        scope: "SPECIFIC_REELS",
        reelIds: [reel.id],
        steps: [{ kind: "ADD_TAG", tagId: tag.id }, message("Específica 🌊")],
      }),
    );
    await ingest(comment());
    await drain();
    expect(sends[0].body).toMatchObject({ message: { text: "Específica 🌊" } });
    expect(
      await client.instagramContactTag.count({ where: { tagId: tag.id } }),
    ).toBe(1);
  });
  it("aguarda resposta elegível; URL, eco e seen não liberam a segunda DM", async () => {
    await activate(draft({ steps: [message("Primeira"), message("Segunda")] }));
    await ingest(comment());
    await drain();
    expect(sends.filter((s) => s.kind !== "PUBLIC_REPLY")).toHaveLength(1);
    await ingest(incoming({ referral: { ref: "URL_CLICK" } }));
    await ingest(
      incoming({ message: { mid: "echo", text: "eco", is_echo: true } }),
    );
    await ingest(incoming({ read: { mid: "fixture-mid-1" } }));
    await drain();
    expect(sends.filter((s) => s.kind !== "PUBLIC_REPLY")).toHaveLength(1);
    await ingest(
      incoming({ message: { mid: "inbound-1", text: "Continuar" } }),
    );
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
    expect(sends.at(-1)?.body).toMatchObject({
      recipient: { id: recipientId },
      message: { text: "Segunda" },
    });
  });
  it("envia botões URL/postback e executa uma continuação uma única vez", async () => {
    await activate(
      draft({
        steps: [
          message("Primeira"),
          {
            ...message("Escolha"),
            buttons: [
              {
                label: "Site",
                action: "OPEN_URL",
                url: "https://example.com",
                nextMessage: null,
              },
              {
                label: "Continuar",
                action: "NEXT_MESSAGE",
                url: "",
                nextMessage: {
                  format: "TEXT",
                  text: "Continuação 🌊",
                  buttons: [],
                },
              },
            ],
          },
        ],
      }),
    );
    await ingest(comment());
    await drain();
    await ingest(
      incoming({ message: { mid: "inbound-btn", text: "Quero continuar" } }),
    );
    await drain();
    const template = sends.find((s) => s.kind === "DM")!.body.message as {
      attachment: {
        payload: {
          buttons: { type: string; url?: string; payload?: string }[];
        };
      };
    };
    expect(template.attachment.payload.buttons[0]).toMatchObject({
      type: "web_url",
      url: "https://example.com",
    });
    const payload = template.attachment.payload.buttons[1].payload!;
    expect(payload).toMatch(/^pulso:[A-Za-z0-9_-]{43}$/);
    await ingest(
      incoming(
        { postback: { mid: "postback-wrong", payload } },
        "18000000000999",
      ),
    );
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
    const click = incoming({ postback: { mid: "postback-right", payload } });
    await ingest(click);
    await ingest(click);
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(2);
    expect(sends.at(-1)?.body).toMatchObject({
      message: { text: "Continuação 🌊" },
    });
  });
  it("persiste atraso e reavalia janela antes de enviar", async () => {
    await activate(
      draft({
        steps: [{ kind: "DELAY", delaySeconds: 30 }, message("Após atraso")],
      }),
    );
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(0);
    expect(
      await client.instagramJob.count({
        where: {
          run: { workspaceId },
          state: "READY",
          availableAt: { gt: clock },
        },
      }),
    ).toBe(1);
    clock = new Date(clock.getTime() + 30000);
    await drain();
    expect(sends[0].body).toMatchObject({ message: { text: "Após atraso" } });
  });
  it("não repete timeout ou resposta 500 nem publica alternativa por inferência", async () => {
    await activate();
    outcomes.push({ kind: "UNKNOWN", category: "NETWORK_UNCONFIRMED" });
    await ingest(comment());
    await drain();
    await drain();
    expect(sends).toHaveLength(1);
    expect(
      await client.instagramAutomationRun.findFirst({ where: { workspaceId } }),
    ).toMatchObject({ state: "REVIEW", initialStatus: "UNKNOWN" });
    expect(
      await client.instagramOutbound.count({
        where: { run: { workspaceId }, kind: "PUBLIC_REPLY" },
      }),
    ).toBe(0);
  });
  it("repete somente rate limit explicitamente rejeitado, com backoff persistente", async () => {
    await activate();
    outcomes.push({
      kind: "REJECTED",
      category: "RATE_LIMIT",
      code: 4,
      retryAfterMs: 60000,
      fallbackJustified: false,
    });
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(1);
    clock = new Date(clock.getTime() + 60000);
    await drain();
    expect(sends.map((s) => s.kind)).toEqual([
      "PRIVATE_REPLY",
      "PRIVATE_REPLY",
      "PUBLIC_REPLY",
    ]);
    expect(
      await client.instagramOutbound.count({
        where: { run: { workspaceId }, kind: "PRIVATE_REPLY" },
      }),
    ).toBe(1);
  });
  it("pausar ou editar a automação cancela os envios pendentes", async () => {
    const automation = await activate();
    await ingest(comment());
    clock = new Date(clock.getTime() + 1000);
    await engine.processOne();
    await automationService(client, settings).pause(workspaceId, automation.id);
    await drain();
    expect(sends).toHaveLength(0);
    expect(
      await client.instagramAutomationRun.findFirst({ where: { workspaceId } }),
    ).toMatchObject({ state: "CANCELLED" });
  });
  it("não envia para comentário vencido e não usa entry.time como criação", async () => {
    await activate();
    transport.comment = vi.fn(async (id) => ({
      id,
      text: "quero",
      createdAt: new Date(clock.getTime() - 8 * 86400000),
    }));
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(0);
    expect(
      await client.instagramAutomationRun.count({ where: { workspaceId } }),
    ).toBe(0);
  });
  it("retomada após reserva de envio exige revisão e não repete HTTP", async () => {
    await activate();
    await ingest(comment());
    clock = new Date(clock.getTime() + 1000);
    await engine.processOne();
    clock = new Date(clock.getTime() + 1000);
    await engine.processOne();
    const outbound = await client.instagramOutbound.findFirstOrThrow({
        where: { run: { workspaceId } },
      }),
      job = await client.instagramJob.findFirstOrThrow({
        where: { outboundId: outbound.id },
      });
    await client.instagramOutbound.update({
      where: { id: outbound.id },
      data: { status: "DISPATCHING", dispatchToken: "interrupted" },
    });
    await client.instagramJob.update({
      where: { id: job.id },
      data: {
        state: "RUNNING",
        leaseToken: "interrupted",
        leaseUntil: new Date(clock.getTime() - 1000),
      },
    });
    await drain();
    expect(sends).toHaveLength(0);
    expect(
      await client.instagramOutbound.findUnique({ where: { id: outbound.id } }),
    ).toMatchObject({ status: "UNKNOWN", errorCategory: "WORKER_INTERRUPTED" });
  });
  it("cliente de envio usa Bearer no cabeçalho, URL fixa e resultados sem credenciais", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      expect(options?.headers).toMatchObject({
        Authorization: "Bearer fixture-never-valid",
      });
      if (new URL(String(url)).pathname === "/v25.0/me")
        return Response.json({
          user_id: accountExternal,
          username: "fixtureowner",
        });
      expect(String(url)).toBe(
        `https://graph.instagram.com/v25.0/${accountExternal}/messages`,
      );
      return Response.json({
        recipient_id: recipientId,
        message_id: "accepted-mid",
      });
    });
    const adapter = graphTransport(
      {
        getCredential: async () => ({
          accessToken: "fixture-never-valid",
          apiVersion: "v25.0",
        }),
      },
      settings,
      fetcher,
    );
    expect(
      await adapter.send(accountExternal, "PRIVATE_REPLY", commentId, {
        recipient: { comment_id: commentId },
        message: { text: "Texto" },
      }),
    ).toEqual({ kind: "API_ACCEPTED", recipientId, remoteId: "accepted-mid" });
    expect(await adapter.send("9999", "DM", commentId, {})).toMatchObject({
      kind: "REJECTED",
      category: "SEND_GATE",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("modo desativado e limite controlado bloqueiam qualquer envio", async () => {
    const blocked = automationEngine(client, {
      settings: { ...settings, mode: "disabled" },
      transport,
      now: () => clock,
    });
    expect(await blocked.processOne()).toBe(false);
    const adapter = graphTransport(
      {
        getCredential: async () => ({
          accessToken: "fixture-never-valid",
          apiVersion: "v25.0",
        }),
      },
      {
        ...settings,
        mode: "controlled",
        testCommentId: "9999",
        testRecipientId: recipientId,
      },
      vi.fn(async () => {
        throw Error("Não deveria consultar API");
      }),
    );
    expect(
      await adapter.send(accountExternal, "PRIVATE_REPLY", commentId, {
        recipient: { comment_id: commentId },
      }),
    ).toMatchObject({ category: "SEND_GATE" });
  });
  it("resposta alternativa requer erro identificado e justificativa, nunca timeout", async () => {
    await activate();
    outcomes.push({
      kind: "REJECTED",
      category: "META_REJECTED",
      code: 100,
      subcode: 999,
      fallbackJustified: false,
    });
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(1);
    const outbound = await client.instagramOutbound.findFirstOrThrow({
      where: { run: { workspaceId }, kind: "PRIVATE_REPLY" },
    });
    await expect(
      engine.approveFallback(
        "workspace-inexistente",
        outbound.id,
        "Erro de destinatário confirmado.",
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      engine.approveFallback(workspaceId, outbound.id, ""),
    ).rejects.toMatchObject({ status: 400 });
    await engine.approveFallback(
      workspaceId,
      outbound.id,
      "Erro do destinatário identificado e confirmado na revisão de teste.",
    );
    await engine.approveFallback(
      workspaceId,
      outbound.id,
      "Revisão repetida não duplica.",
    );
    await drain();
    expect(sends.map((s) => s.kind)).toEqual(["PRIVATE_REPLY", "PUBLIC_REPLY"]);
    expect(sends[1].body).toMatchObject({
      message: "Não consegui enviar a DM; escreva para nós.",
    });
    expect(
      await client.instagramOutbound.count({
        where: { run: { workspaceId }, kind: "PUBLIC_REPLY" },
      }),
    ).toBe(1);
  });
  it("timeout continua impedindo alternativa mesmo após tentativa de revisão", async () => {
    await activate();
    outcomes.push({ kind: "UNKNOWN", category: "NETWORK_UNCONFIRMED" });
    await ingest(comment());
    await drain();
    const outbound = await client.instagramOutbound.findFirstOrThrow({
      where: { run: { workspaceId } },
    });
    await expect(
      engine.approveFallback(
        workspaceId,
        outbound.id,
        "Não tenho confirmação de entrega",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(sends).toHaveLength(1);
  });
  it("rotação usa somente variações preenchidas e persiste entre comentários", async () => {
    await activate();
    await ingest(comment());
    await drain();
    await ingest(comment("18000000000011"));
    await drain();
    expect(
      sends.filter((s) => s.kind === "PUBLIC_REPLY").map((s) => s.body.message),
    ).toEqual(["Resposta A", "Resposta B"]);
    expect(
      await client.instagramAutomationRun.count({ where: { workspaceId } }),
    ).toBe(2);
  });
  it("duas instâncias do worker e duplicatas não enviam a mesma operação duas vezes", async () => {
    await activate();
    await Promise.all([ingest(comment()), ingest(comment())]);
    const second = automationEngine(client, {
      settings,
      transport,
      now: () => clock,
    });
    for (let i = 0; i < 30; i++) {
      clock = new Date(clock.getTime() + 1000);
      const processed = await Promise.all([
        engine.processOne(),
        second.processOne(),
      ]);
      if (processed.every((v) => !v)) break;
    }
    expect(sends.filter((s) => s.kind === "PRIVATE_REPLY")).toHaveLength(1);
    expect(sends.filter((s) => s.kind === "PUBLIC_REPLY")).toHaveLength(1);
  });
  it("nenhuma tarefa concorrente ou interação antecipa um atraso já agendado", async () => {
    await activate(
      draft({
        steps: [{ kind: "DELAY", delaySeconds: 120 }, message("Atrasada")],
      }),
    );
    await ingest(comment());
    await drain();
    const run = await client.instagramAutomationRun.findFirstOrThrow({
      where: { workspaceId },
    });
    await client.instagramJob.create({
      data: {
        socialAccountId: accountId,
        runId: run.id,
        kind: "ADVANCE",
        dedupeKey: "fixture-extra-advance",
        availableAt: clock,
      },
    });
    await drain();
    expect(sends).toHaveLength(0);
    clock = new Date(clock.getTime() + 120000);
    await drain();
    expect(sends.filter((s) => s.kind === "PRIVATE_REPLY")).toHaveLength(1);
  });
  it("interação anterior à resposta privada não libera continuação", async () => {
    await activate(draft({ steps: [message("Inicial"), message("Seguinte")] }));
    await ingest(incoming({ message: { mid: "inbound-antiga", text: "Olá" } }));
    await drain();
    await ingest(comment());
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(0);
    await ingest(
      incoming({ message: { mid: "inbound-nova", text: "Recebi" } }),
    );
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
  });
  it("janela expirada após atraso não é bypassada e não dispara alternativa", async () => {
    await activate(
      draft({
        steps: [
          message("Inicial"),
          message("Intermediária"),
          { kind: "DELAY", delaySeconds: 86400 },
          message("Final"),
        ],
      }),
    );
    await ingest(comment());
    await drain();
    await ingest(
      incoming({ message: { mid: "inbound-delay", text: "Continuar" } }),
    );
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
    clock = new Date(clock.getTime() + 86400000);
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
    expect(
      await client.instagramAutomationRun.findFirst({ where: { workspaceId } }),
    ).toMatchObject({ state: "WAITING_INTERACTION" });
  });
  it("postback vencido e payload de outro template não retomam a execução", async () => {
    await activate(
      draft({
        steps: [
          message("Inicial"),
          {
            ...message("Botão"),
            buttons: [
              {
                label: "Continuar",
                action: "NEXT_MESSAGE",
                url: "",
                nextMessage: {
                  format: "TEXT",
                  text: "Não deve enviar vencida",
                  buttons: [],
                },
              },
            ],
          },
        ],
      }),
    );
    await ingest(comment());
    await drain();
    await ingest(
      incoming({ message: { mid: "inbound-expiry", text: "Continuar" } }),
    );
    await drain();
    const body = sends.find((s) => s.kind === "DM")!.body.message as {
        attachment: { payload: { buttons: { payload: string }[] } };
      },
      payload = body.attachment.payload.buttons[0].payload;
    clock = new Date(clock.getTime() + 86400000);
    await ingest(incoming({ postback: { mid: "click-expired", payload } }));
    await drain();
    expect(sends.filter((s) => s.kind === "DM")).toHaveLength(1);
  });
  it.each([
    ["AUTHENTICATION", 190, "EXPIRED"],
    ["PERMISSION", 10, "ERROR"],
  ])(
    "falha %s suspende a conta sem resposta pública falsa",
    async (category, code, status) => {
      await activate();
      outcomes.push({
        kind: "REJECTED",
        category,
        code,
        fallbackJustified: false,
      });
      await ingest(comment());
      await drain();
      expect(
        await client.socialAccount.findUnique({ where: { id: accountId } }),
      ).toMatchObject({ status });
      expect(sends).toHaveLength(1);
      await ingest(comment("18000000000022"));
      await drain();
      expect(sends).toHaveLength(1);
      expect(
        await client.instagramWebhookEvent.count({
          where: { socialAccountId: accountId },
        }),
      ).toBe(2);
      expect(
        await client.instagramJob.count({
          where: { socialAccountId: accountId, state: "READY" },
        }),
      ).toBeGreaterThan(0);
    },
  );
  it("atividades são filtradas por workspace e não retornam corpos ou tokens de botões", async () => {
    await activate();
    await ingest(comment());
    await drain();
    const own = await listActivities(client, workspaceId),
      other = await listActivities(client, "outro-workspace");
    expect(own.items.length).toBeGreaterThan(0);
    expect(other.items).toEqual([]);
    expect(JSON.stringify(own)).not.toContain("fixture-never-valid");
    expect(JSON.stringify(own)).not.toContain('"body"');
    expect(JSON.stringify(own)).not.toContain('"tokenHash"');
  });
  it("Reels futuros usam a publicação real, não a hora do comentário", async () => {
    await activate(draft({ scope: "FUTURE_REELS" }));
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(0);
    const publication = new Date(Date.now() + 1000);
    await client.instagramReel.updateMany({
      where: { socialAccountId: accountId },
      data: { publishedAt: publication },
    });
    clock = new Date(publication.getTime() + 2000);
    await ingest(comment("18000000000012"));
    await drain();
    expect(sends.filter((s) => s.kind === "PRIVATE_REPLY")).toHaveLength(1);
  });
  it("mudança durante um HTTP aceito não reverte a revisão salva nem libera continuação", async () => {
    const automation = await activate(
      draft({ steps: [message("Versão antiga"), message("Não deve seguir")] }),
    );
    transport.send = vi.fn(async (_account, kind, _comment, body) => {
      sends.push({ kind, body });
      await automationService(client, settings).update(
        workspaceId,
        automation.id,
        draft({ steps: [message("Nova versão")] }),
      );
      return {
        kind: "API_ACCEPTED" as const,
        remoteId: "fixture-mid-race",
        recipientId,
      };
    });
    await ingest(comment());
    await drain();
    expect(sends).toHaveLength(1);
    expect(
      await client.automation.findUnique({ where: { id: automation.id } }),
    ).toMatchObject({ status: "DRAFT" });
    expect(
      await client.instagramAutomationRun.findFirst({ where: { workspaceId } }),
    ).toMatchObject({ state: "CANCELLED" });
  });
});

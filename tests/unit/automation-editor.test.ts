import { describe, expect, it } from "vitest";
import {
  automationDraftSchema,
  emptyButton,
  emptyMessage,
  emptyPublicReplies,
  readStoredStep,
  type AutomationDraft,
} from "@/lib/automation-draft";
import {
  activationIssues,
  canDeliverMessage,
  characterCount,
  isHttpsUrl,
  matchingKeywords,
  utf8Bytes,
} from "@/lib/automation-rules";

function draft(): AutomationDraft {
  return {
    name: "Meu fluxo",
    scope: "GLOBAL",
    keywords: ["quero"],
    publicReplies: emptyPublicReplies(),
    steps: [
      { kind: "SEND_DM", ...emptyMessage(), text: "Conteúdo personalizado" },
    ],
  };
}
describe("rascunho e revisão de ativação", () => {
  it("salva nome, DM, palavra-chave e botão incompletos sem exigir URL", () => {
    const value = {
      name: "",
      scope: "GLOBAL",
      keywords: [],
      steps: [{ kind: "SEND_DM", text: "", buttons: [emptyButton()] }],
    };
    const parsed = automationDraftSchema.parse(value);
    expect(parsed.name).toBe("");
    expect(parsed.steps[0]).toMatchObject({
      text: "",
      buttons: [{ url: "", label: "" }],
    });
    expect(activationIssues(parsed).length).toBeGreaterThan(0);
  });
  it("preserva texto, URL e títulos exatamente como foram escritos", () => {
    const value = draft();
    value.steps = [
      {
        kind: "SEND_DM",
        ...emptyMessage(),
        text: "  Minha mensagem\ncom espaçamento  ",
        buttons: [
          { ...emptyButton(), label: "  Meu botão  ", url: "https://" },
        ],
      },
    ];
    expect(automationDraftSchema.parse(value).steps).toEqual(value.steps);
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({ path: "steps.0.buttons.0.url" }),
    );
  });
  it("permite mensagem sem botões e valida texto simples", () => {
    expect(activationIssues(draft())).toEqual([]);
    const value = draft();
    value.steps = [{ kind: "SEND_DM", ...emptyMessage(), text: "" }];
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({ path: "steps.0.text" }),
    );
  });
  it("preserva caminhos diferentes com URL e mensagens aninhadas", () => {
    const buttons = [
      { ...emptyButton(), label: "Site", url: "https://example.com" },
      {
        ...emptyButton(),
        label: "Continuar",
        action: "NEXT_MESSAGE",
        nextMessage: {
          ...emptyMessage(),
          text: "Segunda",
          buttons: [
            {
              ...emptyButton(),
              label: "Terceira",
              action: "NEXT_MESSAGE",
              nextMessage: { ...emptyMessage(), text: "Terceira" },
            },
          ],
        },
      },
    ];
    const parsed = automationDraftSchema.parse({
      ...draft(),
      steps: [{ kind: "SEND_DM", text: "Primeira", buttons }],
    });
    expect(parsed.steps[0]).toMatchObject({
      buttons: [
        { action: "OPEN_URL" },
        {
          action: "NEXT_MESSAGE",
          nextMessage: { buttons: [{ nextMessage: { text: "Terceira" } }] },
        },
      ],
    });
    expect(
      activationIssues(parsed).filter((issue) => issue.path.endsWith(".url")),
    ).toEqual([]);
  });
  it("rejeita estado ativo, campos extras e estruturas inesperadas no rascunho", () => {
    expect(
      automationDraftSchema.safeParse({ ...draft(), status: "ACTIVE" }).success,
    ).toBe(false);
    expect(
      automationDraftSchema.safeParse({
        ...draft(),
        steps: [{ kind: "SEND_DM", text: "Mensagem", buttons: "inválido" }],
      }).success,
    ).toBe(false);
    expect(
      automationDraftSchema.safeParse({
        ...draft(),
        steps: [{ kind: "ADD_TAG", tagId: "a/b" }],
      }).success,
    ).toBe(false);
  });
  it("rejeita excesso de botões e de profundidade com erro controlado", () => {
    const message = emptyMessage();
    message.buttons = Array.from({ length: 4 }, emptyButton);
    expect(
      automationDraftSchema.safeParse({
        ...draft(),
        steps: [{ kind: "SEND_DM", ...message }],
      }).success,
    ).toBe(false);
    let next = emptyMessage();
    for (let i = 0; i < 30; i++)
      next = {
        ...emptyMessage(),
        buttons: [
          { ...emptyButton(), action: "NEXT_MESSAGE", nextMessage: next },
        ],
      };
    expect(
      automationDraftSchema.safeParse({
        ...draft(),
        steps: [{ kind: "SEND_DM", ...next }],
      }).success,
    ).toBe(false);
  });
  it("converte a etapa antiga de botões sem perder links ou texto", () => {
    const legacy = readStoredStep({
      id: "old",
      position: 0,
      kind: "BUTTONS",
      text: "Texto antigo",
      delaySeconds: null,
      tagId: null,
      buttons: [{ label: "Título antigo", url: "https://example.com/antigo" }],
    });
    expect(legacy).toMatchObject({
      kind: "BUTTONS",
      text: "Texto antigo",
      buttons: [
        {
          action: "OPEN_URL",
          label: "Título antigo",
          url: "https://example.com/antigo",
          nextMessage: null,
        },
      ],
    });
  });
});
describe("limites e regras de mensagem", () => {
  it("conta UTF-8 e caracteres Unicode sem confundir bytes com letras", () => {
    expect(characterCount("á😊")).toBe(2);
    expect(utf8Bytes("á😊")).toBe(6);
    const value = draft();
    value.steps = [
      { kind: "SEND_DM", ...emptyMessage(), text: "😊".repeat(251) },
    ];
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({
        path: "steps.0.text",
        message: expect.stringContaining("1.000 bytes"),
      }),
    );
    value.steps = [
      { kind: "SEND_DM", ...emptyMessage(), text: "😊".repeat(250) },
    ];
    expect(activationIssues(value)).toEqual([]);
  });
  it("valida HTTPS e rejeita esquemas executáveis e credenciais em URLs", () => {
    for (const url of [
      "",
      "https://",
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:pass@example.com",
    ])
      expect(isHttpsUrl(url)).toBe(false);
    for (const url of [
      "https://example.com/path?q=1#x",
      "https://chat.whatsapp.com/abc",
    ])
      expect(isHttpsUrl(url)).toBe(true);
  });
  it("distingue limite de texto com botões e conserva títulos antigos longos no rascunho", () => {
    const value = draft();
    value.steps.push({
      kind: "SEND_DM",
      ...emptyMessage(),
      text: "á".repeat(641),
      buttons: [
        { ...emptyButton(), label: "x".repeat(21), url: "https://example.com" },
      ],
    });
    expect(automationDraftSchema.safeParse(value).success).toBe(true);
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({
        path: "steps.1.text",
        message: expect.stringContaining("640"),
      }),
    );
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({ path: "steps.1.buttons.0.label" }),
    );
  });
  it("rejeita botões iniciais e permite a segunda DM que o motor aguardará", () => {
    const value = draft();
    value.steps = [
      {
        kind: "SEND_DM",
        ...emptyMessage(),
        text: "Minha primeira",
        buttons: [
          { ...emptyButton(), label: "Continuar", action: "NEXT_MESSAGE" },
        ],
      },
      { kind: "SEND_DM", ...emptyMessage(), text: "Outra" },
    ];
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({ path: "steps.0.buttons" }),
    );
    expect(activationIssues(value)).toContainEqual(
      expect.objectContaining({ path: "steps.0.buttons.0.nextMessage" }),
    );
    expect(activationIssues(value)).not.toContainEqual(
      expect.objectContaining({
        path: "steps.1.text",
      }),
    );
  });
  it("compara comentários por palavras completas, caixa e espaços normalizados", () => {
    expect(
      matchingKeywords("QUERO   receber o link!", ["quero", "receber o link"]),
    ).toEqual(["quero", "receber o link"]);
    expect(matchingKeywords("nãoquero", ["quero"])).toEqual([]);
    expect(matchingKeywords("catalogo", ["catálogo"])).toEqual([]);
  });
  it("aplica janela de sete dias e uma única resposta privada", () => {
    const now = Date.UTC(2026, 9, 9);
    expect(
      canDeliverMessage("PRIVATE_REPLY", { now, commentCreatedAt: now - 1000 }),
    ).toBe(true);
    expect(
      canDeliverMessage("PRIVATE_REPLY", {
        now,
        commentCreatedAt: now - 8 * 86400000,
      }),
    ).toBe(false);
    expect(
      canDeliverMessage("PRIVATE_REPLY", {
        now,
        commentCreatedAt: now,
        privateReplyAlreadySent: true,
      }),
    ).toBe(false);
  });
  it("bloqueia URL click, ausência de interação elegível e janela expirada", () => {
    const now = Date.UTC(2026, 9, 9);
    expect(canDeliverMessage("AUTHORIZED_CONVERSATION", { now })).toBe(false);
    expect(
      canDeliverMessage("AUTHORIZED_CONVERSATION", {
        now,
        lastEligibleInteractionAt: now,
        verifiedInteraction: "URL_CLICK",
      }),
    ).toBe(false);
    expect(
      canDeliverMessage("AUTHORIZED_CONVERSATION", {
        now,
        lastEligibleInteractionAt: now - 86400000,
        verifiedInteraction: "INBOUND_MESSAGE",
      }),
    ).toBe(false);
    expect(
      canDeliverMessage("AUTHORIZED_CONVERSATION", {
        now,
        lastEligibleInteractionAt: now - 1000,
        verifiedInteraction: "POSTBACK",
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  automationDraftSchema,
  emptyPublicReplies,
} from "@/lib/automation-draft";
import { activationIssues } from "@/lib/automation-rules";
import {
  fallbackPublicReply,
  publicReplyIssues,
  rotatingPublicReply,
} from "@/lib/public-replies";

describe("configuração independente de respostas públicas", () => {
  it("cria cinco variações vazias sem respostas padronizadas", () => {
    const draft = automationDraftSchema.parse({
      name: "",
      scope: "GLOBAL",
      keywords: [],
      steps: [],
    });
    expect(draft.publicReplies).toEqual(emptyPublicReplies());
    expect(draft.publicReplies.variations).toEqual(["", "", "", "", ""]);
  });
  it("importa blocos antigos na ordem original, preservando espaços e vazios", () => {
    const draft = automationDraftSchema.parse({
      name: "Antigo",
      scope: "GLOBAL",
      keywords: [],
      steps: [
        { kind: "PUBLIC_REPLY", text: "  Primeira 😊  " },
        { kind: "SEND_DM", text: "DM preservada" },
        { kind: "PUBLIC_REPLY", text: "" },
        { kind: "PUBLIC_REPLY", text: "Terceira" },
      ],
    });
    expect(draft.publicReplies.variations).toEqual([
      "  Primeira 😊  ",
      "",
      "Terceira",
      "",
      "",
    ]);
    expect(draft.publicReplies.enabled).toBe(true);
    expect(draft.publicReplies.fallback).toEqual({ enabled: false, text: "" });
    expect(draft.steps.map((step) => step.kind)).toEqual(["SEND_DM"]);
  });
  it("salva configuração pública e alternativa incompletas como rascunho", () => {
    const config = {
      ...emptyPublicReplies(),
      enabled: true,
      fallback: { enabled: true, text: "" },
    };
    const draft = automationDraftSchema.parse({
      name: "",
      scope: "GLOBAL",
      keywords: [],
      steps: [],
      publicReplies: config,
    });
    expect(draft.publicReplies).toEqual(config);
    expect(activationIssues(draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "publicReplies.variations" }),
        expect.objectContaining({ path: "publicReplies.fallback.text" }),
      ]),
    );
  });
  it("alterna somente as variações preenchidas e respeita a desativação", () => {
    const config = {
      ...emptyPublicReplies(),
      enabled: true,
      variations: ["", "  Minha resposta  ", " ", "Outra resposta", ""],
    };
    expect(
      [0, 1, 2].map((cursor) => rotatingPublicReply(config, cursor)),
    ).toEqual(["  Minha resposta  ", "Outra resposta", "  Minha resposta  "]);
    expect(rotatingPublicReply({ ...config, enabled: false }, 0)).toBeNull();
    expect(
      rotatingPublicReply({ ...config, variations: ["", " "] }, 0),
    ).toBeNull();
  });
  it("valida 500 caracteres Unicode e preserva textos longos para edição", () => {
    const config = {
      ...emptyPublicReplies(),
      enabled: true,
      variations: ["😊".repeat(500), "", "", "", ""],
      fallback: { enabled: true, text: "x".repeat(501) },
    };
    expect(publicReplyIssues(config).map((issue) => issue.path)).toEqual([
      "publicReplies.fallback.text",
    ]);
    config.variations[0] += "a";
    expect(publicReplyIssues(config).map((issue) => issue.path)).toContain(
      "publicReplies.variations.0",
    );
    expect(
      publicReplyIssues({
        ...config,
        enabled: false,
        fallback: { ...config.fallback, enabled: false },
      }),
    ).toEqual([]);
    expect(
      automationDraftSchema.parse({
        name: "",
        scope: "GLOBAL",
        keywords: [],
        steps: [],
        publicReplies: config,
      }).publicReplies,
    ).toEqual(config);
  });
  it("aceita variações adicionais, sem ultrapassar o limite estrutural", () => {
    const input = {
      name: "",
      scope: "GLOBAL",
      keywords: [],
      steps: [],
      publicReplies: {
        ...emptyPublicReplies(),
        variations: Array<string>(6).fill(""),
      },
    };
    expect(
      automationDraftSchema.parse(input).publicReplies.variations,
    ).toHaveLength(6);
    expect(
      automationDraftSchema.safeParse({
        ...input,
        publicReplies: {
          ...input.publicReplies,
          variations: Array<string>(101).fill(""),
        },
      }).success,
    ).toBe(false);
  });
  it.each([
    "UNCONFIRMED",
    "API_ACCEPTED",
    "DELAYED",
    "TEMPORARY_FAILURE",
  ] as const)("não usa a alternativa para %s", (kind) => {
    const config = {
      ...emptyPublicReplies(),
      fallback: { enabled: true, text: "Minha alternativa" },
    };
    expect(fallbackPublicReply(config, { kind })).toBeNull();
  });
  it("exige erro definitivo identificado e justificativa, com controle independente", () => {
    const config = {
      ...emptyPublicReplies(),
      fallback: { enabled: true, text: "Minha alternativa" },
    };
    const outcome = {
      kind: "DEFINITIVE_FAILURE" as const,
      identifiedError: "Erro verificado",
      fallbackJustified: true,
    };
    expect(fallbackPublicReply(config, outcome)).toBe("Minha alternativa");
    expect(
      fallbackPublicReply(config, { ...outcome, identifiedError: " " }),
    ).toBeNull();
    expect(
      fallbackPublicReply(config, { ...outcome, fallbackJustified: false }),
    ).toBeNull();
    expect(
      fallbackPublicReply(
        { ...config, fallback: { ...config.fallback, enabled: false } },
        outcome,
      ),
    ).toBeNull();
    expect(
      fallbackPublicReply(
        { ...config, fallback: { enabled: true, text: "x".repeat(501) } },
        outcome,
      ),
    ).toBeNull();
  });
});

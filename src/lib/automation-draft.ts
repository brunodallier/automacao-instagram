import { z } from "zod";

export const EDITOR_LIMITS = {
  steps: 20,
  messages: 60,
  depth: 8,
  buttons: 3,
  publicReplies: 100,
} as const;

// A content discriminator keeps future media formats separate from text.
// Only TEXT is accepted until media editing and delivery are implemented.
export type MessageDraft = {
  format: "TEXT";
  text: string;
  buttons: MessageButton[];
};
export type MessageButton = {
  label: string;
  action: "OPEN_URL" | "NEXT_MESSAGE";
  url: string;
  nextMessage: MessageDraft | null;
};

export function emptyMessage(): MessageDraft {
  return { format: "TEXT", text: "", buttons: [] };
}
export function emptyButton(): MessageButton {
  return { label: "", action: "OPEN_URL", url: "", nextMessage: null };
}

export function emptyPublicReplies() {
  return {
    enabled: false,
    strategy: "ROTATING" as const,
    variations: Array<string>(5).fill(""),
    fallback: { enabled: false, text: "" },
  };
}
export const publicReplyConfigSchema = z
  .object({
    enabled: z.boolean(),
    strategy: z.literal("ROTATING"),
    variations: z
      .array(z.string().max(8000))
      .max(EDITOR_LIMITS.publicReplies)
      .transform((values) => [
        ...values,
        ...Array<string>(Math.max(0, 5 - values.length)).fill(""),
      ]),
    fallback: z
      .object({ enabled: z.boolean(), text: z.string().max(8000) })
      .strict(),
  })
  .strict();
export type PublicReplyConfig = z.infer<typeof publicReplyConfigSchema>;

// Legacy public blocks stay readable, independently of the private conversation.
export function readPublicReplies(
  value: unknown,
  legacyTexts: string[] = [],
): PublicReplyConfig {
  if (value !== null && value !== undefined)
    return publicReplyConfigSchema.parse(value);
  return {
    ...emptyPublicReplies(),
    enabled: legacyTexts.length > 0,
    variations: [
      ...legacyTexts,
      ...Array<string>(Math.max(0, 5 - legacyTexts.length)).fill(""),
    ],
  };
}

const messageFields = {
  format: z.literal("TEXT").default("TEXT"),
  text: z.string().max(8000, "Use no máximo 8.000 caracteres no rascunho."),
  buttons: z
    .lazy(() => z.array(messageButtonSchema).max(EDITOR_LIMITS.buttons))
    .default([]),
};
export const messageDraftSchema: z.ZodType<MessageDraft> = z.lazy(() =>
  z.object(messageFields).strict(),
);
export const messageButtonSchema: z.ZodType<MessageButton> = z.lazy(() =>
  z
    .object({
      label: z.string().max(200),
      action: z.enum(["OPEN_URL", "NEXT_MESSAGE"]).default("OPEN_URL"),
      url: z.string().max(2000).default(""),
      nextMessage: messageDraftSchema.nullable().default(null),
    })
    .strict(),
);

export const automationScopeSchema = z.enum([
  "GLOBAL",
  "FUTURE_REELS",
  "SPECIFIC_REELS",
]);
export const automationStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ERROR",
]);
const draftId = z
  .string()
  .max(100)
  .regex(/^[a-zA-Z0-9_-]*$/);
export const automationStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SEND_DM"), ...messageFields }).strict(),
  // Compatibility with steps saved by the old editor.
  z.object({ kind: z.literal("BUTTONS"), ...messageFields }).strict(),
  z
    .object({ kind: z.literal("PUBLIC_REPLY"), text: z.string().max(8000) })
    .strict(),
  z
    .object({
      kind: z.literal("DELAY"),
      delaySeconds: z.number().int().min(0).max(86400).nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("ADD_TAG"), tagId: draftId.nullable() }).strict(),
]);

export function normalizeAutomationKeyword(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
}
const draftObjectSchema = z
  .object({
    name: z.string().max(80, "Use no máximo 80 caracteres no nome."),
    scope: automationScopeSchema,
    keywords: z
      .array(
        z
          .string()
          .transform((value) =>
            value.normalize("NFKC").trim().replace(/\s+/gu, " "),
          )
          .pipe(
            z
              .string()
              .min(1)
              .max(40)
              .refine(
                (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
                "A palavra-chave contém caracteres inválidos.",
              ),
          ),
      )
      .max(10, "Use no máximo 10 palavras-chave."),
    steps: z.array(automationStepSchema).max(EDITOR_LIMITS.steps),
    publicReplies: publicReplyConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const keywords = value.keywords.map(normalizeAutomationKeyword);
    if (new Set(keywords).size !== keywords.length)
      context.addIssue({
        code: "custom",
        path: ["keywords"],
        message: "As palavras-chave não podem se repetir.",
      });
  })
  .transform((value) => ({
    ...value,
    publicReplies: readPublicReplies(
      value.publicReplies,
      value.steps.flatMap((step) =>
        step.kind === "PUBLIC_REPLY" ? [step.text] : [],
      ),
    ),
    steps: value.steps.filter((step) => step.kind !== "PUBLIC_REPLY"),
  }));

// Bound the tree before invoking recursive Zod parsing, including malicious inputs.
function boundedTree(value: unknown) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.depth > 32 || ++nodes > 3000) return false;
    if (entry.value && typeof entry.value === "object") {
      for (const child of Object.values(entry.value))
        if (child && typeof child === "object")
          stack.push({ value: child, depth: entry.depth + 1 });
    }
  }
  return true;
}
export const automationDraftSchema = z
  .unknown()
  .superRefine((value, context) => {
    if (!boundedTree(value))
      context.addIssue({
        code: "custom",
        message:
          "O rascunho tem níveis demais. Divida a sequência em menos continuações.",
      });
  })
  .pipe(draftObjectSchema)
  .superRefine((value, context) => {
    let total = 0;
    function visit(message: MessageDraft, depth: number) {
      total++;
      if (depth > EDITOR_LIMITS.depth)
        context.addIssue({
          code: "custom",
          path: ["steps"],
          message: "Use no máximo oito níveis de mensagens.",
        });
      for (const button of message.buttons)
        if (button.nextMessage) visit(button.nextMessage, depth + 1);
    }
    for (const step of value.steps)
      if (step.kind === "SEND_DM" || step.kind === "BUTTONS") visit(step, 1);
    if (total > EDITOR_LIMITS.messages)
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Use no máximo 60 mensagens por rascunho.",
      });
  });

export type AutomationDraft = z.infer<typeof automationDraftSchema>;
export type AutomationStepDraft = AutomationDraft["steps"][number];
export type StoredStep = {
  id: string;
  position: number;
  kind: z.infer<typeof automationStepSchema>["kind"];
  text: string | null;
  delaySeconds: number | null;
  tagId: string | null;
  buttons: unknown;
};

export function readStoredStep(
  step: StoredStep,
): z.infer<typeof automationStepSchema> {
  if (step.kind === "SEND_DM" || step.kind === "BUTTONS") {
    // Defaults enrich old {label,url} buttons without changing their content.
    const buttons = z.array(messageButtonSchema).parse(step.buttons ?? []);
    return { kind: step.kind, format: "TEXT", text: step.text ?? "", buttons };
  }
  if (step.kind === "DELAY")
    return { kind: step.kind, delaySeconds: step.delaySeconds };
  if (step.kind === "ADD_TAG") return { kind: step.kind, tagId: step.tagId };
  return { kind: step.kind, text: step.text ?? "" };
}

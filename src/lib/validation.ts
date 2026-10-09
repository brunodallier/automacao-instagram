import { z } from "zod";

export const tagSchema = z
  .object({
    name: z
      .string({ error: "Informe um nome para a tag." })
      .transform((value) =>
        value.normalize("NFKC").trim().replace(/\s+/gu, " "),
      )
      .pipe(
        z
          .string()
          .min(1, "Informe um nome para a tag.")
          .max(50, "Use no máximo 50 caracteres.")
          .refine(
            (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
            "O nome contém caracteres inválidos.",
          ),
      ),
  })
  .strict();

export function normalizeTagName(name: string) {
  return name.normalize("NFKC").toLocaleLowerCase("pt-BR");
}

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido.")
    .max(254),
  password: z.string().min(1, "Informe sua senha.").max(128, "Senha inválida."),
});

export const ownerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use pelo menos 2 caracteres no nome.")
    .max(80),
  email: loginSchema.shape.email,
  password: z
    .string()
    .min(12, "A senha deve ter pelo menos 12 caracteres.")
    .max(128),
  workspaceName: z.string().trim().min(2).max(80),
});

export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const automationStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ERROR",
]);
export const automationScopeSchema = z.enum([
  "GLOBAL",
  "FUTURE_REELS",
  "SPECIFIC_REELS",
]);
const keywordSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(
    z
      .string()
      .min(1, "A palavra-chave não pode ficar vazia.")
      .max(40, "Use no máximo 40 caracteres por palavra-chave.")
      .refine(
        (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
        "A palavra-chave contém caracteres inválidos.",
      ),
  );

const buttonSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Dê um nome ao botão.")
      .max(30, "Use no máximo 30 caracteres no botão."),
    url: z
      .string()
      .trim()
      .url("Informe um link válido.")
      .max(500, "Use um link menor."),
  })
  .strict();

export const automationStepSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("SEND_DM"),
      text: z
        .string()
        .trim()
        .min(1, "A mensagem da DM não pode ficar vazia.")
        .max(2000, "Use no máximo 2.000 caracteres."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("PUBLIC_REPLY"),
      text: z
        .string()
        .trim()
        .min(1, "A resposta pública não pode ficar vazia.")
        .max(500, "Use no máximo 500 caracteres."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("DELAY"),
      delaySeconds: z
        .number()
        .int()
        .min(1, "O atraso mínimo é de 1 segundo.")
        .max(86400, "O atraso máximo é de 24 horas."),
    })
    .strict(),
  z.object({ kind: z.literal("ADD_TAG"), tagId: idSchema }).strict(),
  z
    .object({
      kind: z.literal("BUTTONS"),
      text: z
        .string()
        .trim()
        .min(1, "Descreva a mensagem dos botões.")
        .max(500, "Use no máximo 500 caracteres."),
      buttons: z
        .array(buttonSchema)
        .min(1, "Adicione pelo menos um botão.")
        .max(3, "Use no máximo três botões."),
    })
    .strict(),
]);

export const automationDraftSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Dê um nome para a automação.")
      .max(80, "Use no máximo 80 caracteres."),
    scope: automationScopeSchema,
    keywords: z
      .array(keywordSchema)
      .max(10, "Use no máximo 10 palavras-chave."),
    steps: z.array(automationStepSchema).max(20, "Use no máximo 20 etapas."),
  })
  .strict()
  .superRefine((value, context) => {
    const normalized = value.keywords.map((keyword) =>
      keyword.normalize("NFKC").toLocaleLowerCase("pt-BR"),
    );
    if (new Set(normalized).size !== normalized.length)
      context.addIssue({
        code: "custom",
        path: ["keywords"],
        message: "As palavras-chave não podem se repetir.",
      });
    if (value.scope === "SPECIFIC_REELS")
      context.addIssue({
        code: "custom",
        path: ["scope"],
        message: "Conecte o Instagram para selecionar Reels específicos.",
      });
  });

export function normalizeAutomationKeyword(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
}

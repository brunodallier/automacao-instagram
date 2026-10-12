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

export const ownerPasswordRequirements =
  "Use de 6 a 14 caracteres, com pelo menos uma letra maiúscula, uma letra minúscula, um número e um caractere especial (pontuação ou símbolo). Espaços não contam como caractere especial.";

// Somente criação/redefinição: o login mantém a compatibilidade com senhas antigas.
// Não aparar nem normalizar a senha; contar caracteres Unicode, não unidades UTF-16.
export const ownerPasswordSchema = z
  .string({ error: "Informe a senha." })
  .refine(
    (value) => Array.from(value).length >= 6,
    "A senha deve ter pelo menos 6 caracteres.",
  )
  .refine(
    (value) => Array.from(value).length <= 14,
    "A senha deve ter no máximo 14 caracteres.",
  )
  .regex(/\p{Lu}/u, "A senha deve conter pelo menos uma letra maiúscula.")
  .regex(/\p{Ll}/u, "A senha deve conter pelo menos uma letra minúscula.")
  .regex(/\p{Nd}/u, "A senha deve conter pelo menos um número.")
  .regex(
    /[\p{P}\p{S}]/u,
    "A senha deve conter pelo menos um caractere especial (pontuação ou símbolo).",
  );

export const ownerPasswordConfirmationSchema = z
  .object({ password: ownerPasswordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    error: "As senhas não coincidem.",
  });

export const ownerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use pelo menos 2 caracteres no nome.")
    .max(80),
  email: loginSchema.shape.email,
  password: ownerPasswordSchema,
  workspaceName: z.string().trim().min(2).max(80),
});

export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);

export {
  automationDraftSchema,
  automationStepSchema,
  automationScopeSchema,
  automationStatusSchema,
  normalizeAutomationKeyword,
} from "@/lib/automation-draft";

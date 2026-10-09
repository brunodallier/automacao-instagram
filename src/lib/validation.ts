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

export {
  automationDraftSchema,
  automationStepSchema,
  automationScopeSchema,
  automationStatusSchema,
  normalizeAutomationKeyword,
} from "@/lib/automation-draft";

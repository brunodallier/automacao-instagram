import { describe, expect, it } from "vitest";
import {
  loginSchema,
  normalizeTagName,
  ownerPasswordConfirmationSchema,
  ownerPasswordSchema,
  ownerSchema,
  tagSchema,
} from "@/lib/validation";

describe("validação de tags", () => {
  it.each(["", "   ", "\t\n", "a".repeat(51), "Nome\u0000", "Tag\u200b"])(
    "recusa nome inválido %j",
    (name) => {
      expect(tagSchema.safeParse({ name }).success).toBe(false);
    },
  );
  it("normaliza espaços e variantes Unicode sem perder o nome exibido", () => {
    expect(tagSchema.parse({ name: "  Cliente   ＶＩＰ  " }).name).toBe(
      "Cliente VIP",
    );
    expect(normalizeTagName("Cliente VIP")).toBe(
      normalizeTagName("cliente vip"),
    );
  });
  it("aceita acentos e 50 caracteres", () => {
    expect(tagSchema.parse({ name: "Ação e interesse" }).name).toBe(
      "Ação e interesse",
    );
    expect(tagSchema.safeParse({ name: "a".repeat(50) }).success).toBe(true);
  });
  it("recusa campos extras para impedir atribuição de outro workspace", () => {
    expect(
      tagSchema.safeParse({ name: "Cliente", workspaceId: "outro" }).success,
    ).toBe(false);
  });
});

describe("validação de acesso", () => {
  it("normaliza o e-mail e exige e-mail válido", () => {
    expect(
      loginSchema.parse({
        email: " PROPRIETARIO@EXAMPLE.COM ",
        password: "qualquer",
      }).email,
    ).toBe("proprietario@example.com");
    expect(
      loginSchema.safeParse({ email: "invalido", password: "" }).success,
    ).toBe(false);
  });
  it("mantém o login com senhas antigas sem exigir a nova composição", () => {
    for (const password of ["a".repeat(15), "a".repeat(128)]) {
      const result = loginSchema.safeParse({
        email: "owner@example.com",
        password,
      });
      expect(result.success).toBe(true);
      expect(ownerPasswordSchema.safeParse(password).success).toBe(false);
    }
    expect(
      loginSchema.safeParse({
        email: "owner@example.com",
        password: "a".repeat(129),
      }).success,
    ).toBe(false);
  });
});

describe("política de criação e redefinição de senha", () => {
  it.each([
    { name: "6 caracteres", password: "Aa1!bc" },
    { name: "14 caracteres", password: "Aa1!abcdefghij" },
    { name: "letras acentuadas", password: "Áá1!bc" },
    { name: "símbolo Unicode como um caractere", password: "Aa1🙂bc" },
    {
      name: "14 caracteres incluindo símbolo Unicode",
      password: "Aa1🙂abcdefghij",
    },
  ])("aceita $name", ({ password }) => {
    expect(ownerPasswordSchema.parse(password)).toBe(password);
    expect(
      ownerSchema.safeParse({
        name: "Proprietário de teste",
        email: "owner@example.com",
        workspaceName: "Teste",
        password,
      }).success,
    ).toBe(true);
  });
  it.each([
    {
      name: "menos de 6",
      password: "Aa1!b",
      message: "A senha deve ter pelo menos 6 caracteres.",
    },
    {
      name: "mais de 14",
      password: "Aa1!abcdefghijk",
      message: "A senha deve ter no máximo 14 caracteres.",
    },
    {
      name: "sem maiúscula",
      password: "aa1!bc",
      message: "A senha deve conter pelo menos uma letra maiúscula.",
    },
    {
      name: "sem minúscula",
      password: "AA1!BC",
      message: "A senha deve conter pelo menos uma letra minúscula.",
    },
    {
      name: "sem número",
      password: "Aa!!bc",
      message: "A senha deve conter pelo menos um número.",
    },
    {
      name: "sem especial",
      password: "Aa12bc",
      message:
        "A senha deve conter pelo menos um caractere especial (pontuação ou símbolo).",
    },
    {
      name: "espaço não substitui especial",
      password: "Aa1 bc",
      message:
        "A senha deve conter pelo menos um caractere especial (pontuação ou símbolo).",
    },
  ])("recusa $name e informa o requisito", ({ password, message }) => {
    const result = ownerPasswordSchema.safeParse(password);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(message);
      expect(messages.join("\n")).not.toContain(password);
    }
  });
  it("informa todos os requisitos ausentes", () => {
    const result = ownerPasswordSchema.safeParse("abcdef");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(3);
  });
  it("exige confirmação idêntica sem aparar ou normalizar a senha", () => {
    expect(
      ownerPasswordConfirmationSchema.safeParse({
        password: "Aa1!bc",
        confirmation: "Aa1!bc",
      }).success,
    ).toBe(true);
    const result = ownerPasswordConfirmationSchema.safeParse({
      password: "Aa1!bc",
      confirmation: "Aa1!bC",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["confirmation"],
          message: "As senhas não coincidem.",
        }),
      ]);
    const withSpace = " Aa1!bc ";
    expect(ownerPasswordSchema.parse(withSpace)).toBe(withSpace);
    expect(
      ownerPasswordConfirmationSchema.safeParse({
        password: withSpace,
        confirmation: withSpace.trim(),
      }).success,
    ).toBe(false);
  });
});

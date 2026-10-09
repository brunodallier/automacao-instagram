import { describe, expect, it } from "vitest";
import {
  loginSchema,
  normalizeTagName,
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
  it("exige senha longa para configurar o proprietário", () => {
    expect(ownerSchema.shape.password.safeParse("curta").success).toBe(false);
    expect(ownerSchema.shape.password.safeParse("a".repeat(129)).success).toBe(
      false,
    );
    expect(ownerSchema.shape.password.safeParse("a".repeat(12)).success).toBe(
      true,
    );
  });
});

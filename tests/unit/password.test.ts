import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hash de senha", () => {
  it("gera salt único e valida somente a senha correta", async () => {
    const password = randomBytes(24).toString("base64url");
    const [first, second] = await Promise.all([
      hashPassword(password),
      hashPassword(password),
    ]);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(randomBytes(24).toString("hex"), first)).toBe(
      false,
    );
  });
  it.each([
    "",
    "plaintext",
    "scrypt$1$8$1$bad$hash",
    "scrypt$32768$8$1$bad$hash",
  ])("recusa hash corrompido", async (hash) => {
    expect(await verifyPassword("qualquer", hash)).toBe(false);
  });
});

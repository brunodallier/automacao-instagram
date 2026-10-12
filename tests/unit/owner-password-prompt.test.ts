import { afterEach, expect, it, vi } from "vitest";
import { password } from "@inquirer/prompts";
import { ownerPasswordRequirements } from "@/lib/validation";
import {
  OwnerPasswordInputError,
  promptOwnerPassword,
} from "../../scripts/owner-password-prompt";

vi.mock("@inquirer/prompts", () => ({ password: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(password).mockReset();
});

it("mascara ambos os campos, informa a política e valida cada entrada", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(password)
    .mockResolvedValueOnce("Aa1!bc")
    .mockResolvedValueOnce("Aa1!bc");
  await expect(
    promptOwnerPassword("Nova senha:", "Confirme a nova senha:"),
  ).resolves.toEqual({ password: "Aa1!bc", confirmation: "Aa1!bc" });
  const [first, second] = vi
    .mocked(password)
    .mock.calls.map(([config]) => config);
  expect(first.mask).toBe("*");
  expect(second.mask).toBe("*");
  expect(await first.validate!("Aa1!bc")).toBe(true);
  expect(await first.validate!("aa1!bc")).toBe(
    "A senha deve conter pelo menos uma letra maiúscula.",
  );
  expect(await second.validate!("Aa1!bc")).toBe(true);
  expect(await second.validate!("Aa1!bC")).toBe("As senhas não coincidem.");
  expect(output).toHaveBeenCalledWith(ownerPasswordRequirements);
  expect(output.mock.calls.flat().join("\n")).not.toContain("Aa1!bc");
});

it("recusa confirmação divergente sem registrar a senha", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(password)
    .mockResolvedValueOnce("Aa1!bc")
    .mockResolvedValueOnce("Aa1!bC");
  await expect(
    promptOwnerPassword("Senha:", "Confirme a senha:"),
  ).rejects.toThrow("As senhas não coincidem.");
  expect(output.mock.calls.flat().join("\n")).not.toContain("Aa1!bc");
  expect(output.mock.calls.flat().join("\n")).not.toContain("Aa1!bC");
});

it("não retorna uma senha inválida mesmo se o prompt for substituído", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(password)
    .mockResolvedValueOnce("aa1!bc")
    .mockResolvedValueOnce("aa1!bc");
  await expect(
    promptOwnerPassword("Senha:", "Confirme a senha:"),
  ).rejects.toBeInstanceOf(OwnerPasswordInputError);
});

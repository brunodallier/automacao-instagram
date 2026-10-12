import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { configureFirstOwner } from "@/lib/bootstrap-owner";
import { verifyPassword } from "@/lib/password";
import { resetOwnerPassword } from "@/lib/reset-owner-password";
import { testClient } from "../helpers/database";

const client = testClient();
let userId: string;
let workspaceId: string;
const password = `Aa1!${randomBytes(5).toString("hex")}`;
const fixture = {
  name: "Proprietário de teste",
  email: `bootstrap-${randomUUID()}@example.com`,
  password,
  workspaceName: "Configuração inicial de teste",
};

afterAll(async () => {
  if (userId) await client.user.deleteMany({ where: { id: userId } });
  if (workspaceId)
    await client.workspace.deleteMany({ where: { id: workspaceId } });
  await client.$disconnect();
});

describe("configuração inicial privada", () => {
  it("recusa senha fora da política sem criar usuário ou espaço", async () => {
    const before = {
      users: await client.user.count(),
      workspaces: await client.workspace.count(),
    };
    await expect(
      configureFirstOwner(client, { ...fixture, password: "abcdef" }),
    ).rejects.toThrow("maiúscula");
    expect(await client.user.count()).toBe(before.users);
    expect(await client.workspace.count()).toBe(before.workspaces);
  });
  it("permite somente um proprietário mesmo com duas configurações concorrentes", async () => {
    if (await client.user.count())
      throw new Error(
        "Este teste precisa de um banco de testes sem proprietários existentes.",
      );
    const results = await Promise.allSettled([
      configureFirstOwner(client, fixture),
      configureFirstOwner(client, {
        ...fixture,
        email: `outro-${randomUUID()}@example.com`,
      }),
    ]);
    const successful = results.filter(
      (result) => result.status === "fulfilled",
    );
    // Salva IDs antes das asserções para garantir limpeza das próprias fixtures.
    for (const result of successful)
      if (result.status === "fulfilled") {
        userId = result.value.id;
        workspaceId = result.value.memberships[0].workspaceId;
      }
    expect(successful).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const owner = await client.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(owner.passwordHash).not.toBe(password);
    expect(await verifyPassword(password, owner.passwordHash)).toBe(true);
    expect(await client.tag.count({ where: { workspaceId } })).toBe(0);
    await expect(configureFirstOwner(client, fixture)).rejects.toThrow(
      "O proprietário já está configurado",
    );
  });
});

describe("redefinição privada de senha", () => {
  it("recusa senhas inválidas ou confirmação divergente sem alterar o proprietário", async () => {
    const before = await client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: true },
    });
    for (const input of [
      { password: "abcdef", confirmation: "abcdef" },
      { password: "Aa1!bc", confirmation: "Aa1!bC" },
      { password: "Aa1!abcdefghijk", confirmation: "Aa1!abcdefghijk" },
    ])
      await expect(
        resetOwnerPassword(client, before.email, input),
      ).rejects.toThrow();
    expect(
      await client.user.findUniqueOrThrow({
        where: { id: userId },
        include: { memberships: true },
      }),
    ).toEqual(before);
    expect(await verifyPassword(password, before.passwordHash)).toBe(true);
  });
  it("aceita os limites, preserva a conta e revoga sessões em cada redefinição", async () => {
    let previousPassword = password;
    for (const newPassword of [
      `Aa1!${randomBytes(1).toString("hex")}`,
      `Aa1!${randomBytes(5).toString("hex")}`,
    ]) {
      const before = await client.user.findUniqueOrThrow({
        where: { id: userId },
        include: { memberships: true },
      });
      const workspaceBefore = await client.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      await resetOwnerPassword(client, before.email.toUpperCase(), {
        password: newPassword,
        confirmation: newPassword,
      });
      const after = await client.user.findUniqueOrThrow({
        where: { id: userId },
        include: { memberships: true },
      });
      expect(after.sessionVersion).toBe(before.sessionVersion + 1);
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(await verifyPassword(newPassword, after.passwordHash)).toBe(true);
      expect(await verifyPassword(previousPassword, after.passwordHash)).toBe(
        false,
      );
      expect(after).toEqual({
        ...before,
        passwordHash: after.passwordHash,
        sessionVersion: before.sessionVersion + 1,
        updatedAt: expect.any(Date),
      });
      expect(
        await client.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
        }),
      ).toEqual(workspaceBefore);
      previousPassword = newPassword;
    }
  });
});

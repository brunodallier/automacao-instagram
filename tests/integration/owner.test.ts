import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { configureFirstOwner } from "@/lib/bootstrap-owner";
import { verifyPassword } from "@/lib/password";
import { testClient } from "../helpers/database";

const client = testClient();
let userId: string;
let workspaceId: string;
const password = randomBytes(24).toString("hex");
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

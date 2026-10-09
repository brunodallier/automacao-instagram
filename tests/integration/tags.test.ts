import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tagService } from "@/lib/tags";
import { createDatabaseClient } from "@/lib/db";
import { fixtureName, testClient } from "../helpers/database";

const client = testClient();
const service = tagService(client);
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  workspaceId = (
    await client.workspace.create({ data: { name: fixtureName() } })
  ).id;
  otherWorkspaceId = (
    await client.workspace.create({ data: { name: fixtureName() } })
  ).id;
});
afterAll(async () => {
  if (workspaceId && otherWorkspaceId)
    await client.workspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspaceId] } },
    });
  await client.$disconnect();
});

describe("tags em PostgreSQL real", () => {
  it("começa sem tags pré-cadastradas", async () => {
    expect(await service.list(workspaceId)).toEqual([]);
  });
  it("cria, persiste em uma nova conexão e renomeia preservando ID e criação", async () => {
    const tag = await service.create(workspaceId, { name: "  Cliente   VIP " });
    expect(tag.name).toBe("Cliente VIP");
    const secondClient = createDatabaseClient(process.env.TEST_DATABASE_URL!);
    try {
      expect(
        (await tagService(secondClient).list(workspaceId)).some(
          (item) => item.id === tag.id,
        ),
      ).toBe(true);
    } finally {
      await secondClient.$disconnect();
    }
    const renamed = await service.rename(workspaceId, tag.id, {
      name: "Interesse confirmado",
    });
    expect(renamed.id).toBe(tag.id);
    expect(renamed.createdAt).toEqual(tag.createdAt);
    expect(renamed.name).toBe("Interesse confirmado");
    await service.remove(workspaceId, tag.id);
    expect(await client.tag.findUnique({ where: { id: tag.id } })).toBeNull();
  });
  it("impede duplicações mesmo com requisições concorrentes", async () => {
    const results = await Promise.allSettled([
      service.create(workspaceId, { name: "Contato" }),
      service.create(workspaceId, { name: "CONTATO" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failed.reason.status).toBe(409);
  });
  it("impede renomear para nome duplicado", async () => {
    const tag = await service.create(workspaceId, { name: "Outro nome" });
    await expect(
      service.rename(workspaceId, tag.id, { name: "contato" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("isola as tags por espaço de trabalho", async () => {
    const tag = await service.create(otherWorkspaceId, { name: "Contato" });
    expect(
      (await service.list(workspaceId)).some((item) => item.id === tag.id),
    ).toBe(false);
    await expect(
      service.rename(workspaceId, tag.id, { name: "Invasão" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(workspaceId, tag.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await client.tag.findUnique({ where: { id: tag.id } }))?.name).toBe(
      "Contato",
    );
  });
  it("valida no backend nomes vazios, longos, IDs inválidos e campos extras", async () => {
    for (const name of [" ", "a".repeat(51), "Tag\u200b"])
      await expect(service.create(workspaceId, { name })).rejects.toMatchObject(
        { status: 400 },
      );
    await expect(
      service.create(workspaceId, {
        name: "Outra",
        workspaceId: otherWorkspaceId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.rename(workspaceId, "../x", { name: "Outra" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.remove(workspaceId, "naoexiste"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

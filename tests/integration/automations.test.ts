import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { automationService } from "@/lib/automations";
import { testClient, fixtureName } from "../helpers/database";

const client = testClient();
const service = automationService(client);
let workspaceId: string;
let otherWorkspaceId: string;
let tagId: string;

beforeAll(async () => {
  workspaceId = (
    await client.workspace.create({ data: { name: fixtureName() } })
  ).id;
  otherWorkspaceId = (
    await client.workspace.create({ data: { name: fixtureName() } })
  ).id;
  tagId = (
    await client.tag.create({
      data: { workspaceId, name: "Interesse", normalizedName: "interesse" },
    })
  ).id;
});
afterAll(async () => {
  await client.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await client.$disconnect();
});

const draft = () => ({
  name: "Enviar catálogo",
  scope: "FUTURE_REELS" as const,
  keywords: ["quero", "catálogo"],
  steps: [
    { kind: "SEND_DM" as const, text: "Oi! Aqui está o catálogo." },
    { kind: "DELAY" as const, delaySeconds: 30 },
    { kind: "ADD_TAG" as const, tagId },
    {
      kind: "BUTTONS" as const,
      text: "Escolha um caminho",
      buttons: [{ label: "Ver catálogo", url: "https://example.com/catalogo" }],
    },
  ],
});

describe("rascunhos de automação", () => {
  it("persiste gatilhos e etapas em sequência", async () => {
    const saved = await service.create(workspaceId, draft());
    expect(saved.status).toBe("DRAFT");
    expect(saved.scope).toBe("FUTURE_REELS");
    expect(
      saved.keywords.map((keyword: { value: string }) => keyword.value),
    ).toEqual(["quero", "catálogo"]);
    expect(saved.steps.map((step: { kind: string }) => step.kind)).toEqual([
      "SEND_DM",
      "DELAY",
      "ADD_TAG",
      "BUTTONS",
    ]);
    expect(saved.steps[2].tagId).toBe(tagId);
    expect(saved.steps[3].buttons).toEqual([
      { label: "Ver catálogo", url: "https://example.com/catalogo" },
    ]);
    expect((await service.list(workspaceId)).map((item) => item.id)).toContain(
      saved.id,
    );
  });
  it("não aceita escopo específico antes da conexão nem palavras repetidas", async () => {
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "Reel específico",
        scope: "SPECIFIC_REELS",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "Repetida",
        keywords: ["quero", " QUERO "],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("não aceita tag pertencente a outro workspace", async () => {
    const foreignTagId = (
      await client.tag.create({
        data: {
          workspaceId: otherWorkspaceId,
          name: "Privada",
          normalizedName: "privada",
        },
      })
    ).id;
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "Tag de outro espaço",
        steps: [{ kind: "ADD_TAG", tagId: foreignTagId }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("isola automações por workspace e mantém ID ao atualizar", async () => {
    const saved = await service.create(workspaceId, {
      ...draft(),
      name: "Editar depois",
    });
    const updated = await service.update(workspaceId, saved.id, {
      ...draft(),
      name: "Editada",
      keywords: ["preço"],
      steps: [{ kind: "PUBLIC_REPLY", text: "Vou te chamar no privado." }],
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.status).toBe("DRAFT");
    expect(updated.name).toBe("Editada");
    await expect(service.get(otherWorkspaceId, saved.id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      service.remove(otherWorkspaceId, saved.id),
    ).rejects.toMatchObject({ status: 404 });
    await service.remove(workspaceId, saved.id);
  });
  it("valida conteúdo de mensagens, links, atrasos e campos extras", async () => {
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "x",
        steps: [{ kind: "SEND_DM", text: "" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "Link inválido",
        steps: [
          {
            kind: "BUTTONS",
            text: "Escolha",
            buttons: [{ label: "Abrir", url: "sem-link" }],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(workspaceId, {
        ...draft(),
        name: "Atraso inválido",
        steps: [{ kind: "DELAY", delaySeconds: 0 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(workspaceId, { ...draft(), extra: true } as unknown),
    ).rejects.toMatchObject({ status: 400 });
  });
});

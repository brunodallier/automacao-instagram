import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { automationService } from "@/lib/automations";
import {
  emptyButton,
  emptyMessage,
  readStoredStep,
} from "@/lib/automation-draft";
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
  scope: "FUTURE_REELS",
  keywords: ["quero", "catálogo"],
  steps: [
    { kind: "SEND_DM", text: "Oi! Aqui está o catálogo." },
    { kind: "DELAY", delaySeconds: 30 },
    { kind: "ADD_TAG", tagId },
    {
      kind: "BUTTONS",
      text: "Escolha um caminho",
      buttons: [{ label: "Ver catálogo", url: "https://example.com/catalogo" }],
    },
  ],
});
describe("rascunhos de automação", () => {
  it("persiste gatilhos e etapas em sequência", async () => {
    const saved = await service.create(workspaceId, draft());
    expect(saved.status).toBe("DRAFT");
    expect(saved.keywords.map((keyword) => keyword.value)).toEqual([
      "quero",
      "catálogo",
    ]);
    expect(saved.steps.map((step) => step.kind)).toEqual([
      "SEND_DM",
      "DELAY",
      "ADD_TAG",
      "BUTTONS",
    ]);
    expect(saved.steps[2].tagId).toBe(tagId);
    expect(saved.steps[3].buttons).toEqual([
      expect.objectContaining({
        label: "Ver catálogo",
        url: "https://example.com/catalogo",
        action: "OPEN_URL",
      }),
    ]);
    expect((await service.list(workspaceId)).map((item) => item.id)).toContain(
      saved.id,
    );
  });
  it("salva e reabre nome provisório, mensagem vazia, URL parcial e campos incompletos", async () => {
    const saved = await service.create(workspaceId, {
      name: "",
      scope: "GLOBAL",
      keywords: [],
      steps: [
        {
          kind: "SEND_DM",
          text: "",
          buttons: [{ label: "", url: "https://" }],
        },
        { kind: "DELAY", delaySeconds: null },
        { kind: "ADD_TAG", tagId: "" },
      ],
    });
    const persisted = await service.get(workspaceId, saved.id);
    expect(persisted.name).toBe("");
    expect(persisted.steps[0]).toMatchObject({
      text: "",
      buttons: [{ url: "https://" }],
    });
    expect(persisted.steps[2].tagId).toBeNull();
    expect(
      (await client.automation.findUniqueOrThrow({ where: { id: saved.id } }))
        .nameIsProvisional,
    ).toBe(true);
    await expect(service.activate(workspaceId, saved.id)).rejects.toMatchObject(
      { status: 400 },
    );
    const renamed = await service.update(workspaceId, saved.id, {
      ...draft(),
      name: "Título escolhido",
    });
    expect(renamed.name).toBe("Título escolhido");
    expect(renamed.id).toBe(saved.id);
  });
  it("preserva mensagens com diferentes botões e continuações ao editar e reabrir", async () => {
    const message = {
      kind: "SEND_DM",
      ...emptyMessage(),
      text: "  Minha mensagem\npersonalizada  ",
      buttons: [
        { ...emptyButton(), label: "Meu site", url: "https://example.com/meu" },
        {
          ...emptyButton(),
          label: "Continuar",
          action: "NEXT_MESSAGE",
          nextMessage: {
            ...emptyMessage(),
            text: "Segunda mensagem",
            buttons: [
              {
                ...emptyButton(),
                label: "Mais detalhes",
                action: "NEXT_MESSAGE",
                nextMessage: { ...emptyMessage(), text: "Terceira mensagem" },
              },
            ],
          },
        },
      ],
    };
    const saved = await service.create(workspaceId, {
      ...draft(),
      steps: [message],
    });
    const loaded = await service.get(workspaceId, saved.id);
    expect(loaded.steps.map(readStoredStep)).toEqual([message]);
    const updated = await service.update(workspaceId, saved.id, {
      ...draft(),
      name: "Editada",
      steps: loaded.steps.map(readStoredStep),
    });
    expect(updated.steps.map(readStoredStep)).toEqual([message]);
  });
  it("permite escopo específico incompleto no rascunho e bloqueia ativação", async () => {
    const saved = await service.create(workspaceId, {
      ...draft(),
      scope: "SPECIFIC_REELS",
    });
    expect(saved.scope).toBe("SPECIFIC_REELS");
    await expect(service.activate(workspaceId, saved.id)).rejects.toMatchObject(
      {
        status: 400,
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "scope" }),
        ]),
      },
    );
    await expect(
      service.create(workspaceId, {
        ...draft(),
        keywords: ["quero", " QUERO "],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("não aceita tag de outro workspace em create ou update", async () => {
    const foreign = await client.tag.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Privada",
        normalizedName: "privada",
      },
    });
    const input = {
      ...draft(),
      steps: [{ kind: "ADD_TAG", tagId: foreign.id }],
    };
    await expect(service.create(workspaceId, input)).rejects.toMatchObject({
      status: 400,
    });
    const saved = await service.create(workspaceId, draft());
    await expect(
      service.update(workspaceId, saved.id, input),
    ).rejects.toMatchObject({ status: 400 });
    expect((await service.get(workspaceId, saved.id)).steps).toEqual(
      saved.steps,
    );
  });
  it("isola leitura, edição, ativação e exclusão por workspace", async () => {
    const saved = await service.create(workspaceId, draft());
    await expect(service.get(otherWorkspaceId, saved.id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      service.update(otherWorkspaceId, saved.id, draft()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.activate(otherWorkspaceId, saved.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.remove(otherWorkspaceId, saved.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.get(workspaceId, saved.id)).id).toBe(saved.id);
  });
  it("mantém rascunhos antigos de botões acessíveis sem migração destrutiva", async () => {
    const old = await client.automation.create({
      data: {
        workspaceId,
        name: "Rascunho antigo",
        keywords: { create: { value: "legado", normalizedValue: "legado" } },
        steps: {
          create: {
            position: 0,
            kind: "BUTTONS",
            text: "Conteúdo antigo",
            buttons: [
              {
                label: "Título antigo com 30 caracteres",
                url: "https://example.com/antigo",
              },
            ],
          },
        },
      },
    });
    const loaded = await service.get(workspaceId, old.id);
    expect(loaded.name).toBe("Rascunho antigo");
    const steps = loaded.steps.map(readStoredStep);
    const updated = await service.update(workspaceId, old.id, {
      name: loaded.name,
      scope: loaded.scope,
      keywords: loaded.keywords.map((keyword) => keyword.value),
      steps,
    });
    expect(updated.id).toBe(old.id);
    expect(updated.steps.map(readStoredStep)).toEqual(steps);
  });
  it("separa validação de rascunho de ativação e não habilita envio real", async () => {
    const invalid = await service.create(workspaceId, {
      ...draft(),
      steps: [
        {
          kind: "SEND_DM",
          text: "Texto",
          buttons: [{ label: "Abrir", url: "http://example.com" }],
        },
      ],
    });
    await expect(
      service.activate(workspaceId, invalid.id),
    ).rejects.toMatchObject({
      status: 400,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "steps.0.buttons.0.url" }),
      ]),
    });
    const valid = await service.create(workspaceId, {
      ...draft(),
      steps: [{ kind: "SEND_DM", text: "Meu texto" }],
    });
    await expect(service.activate(workspaceId, valid.id)).rejects.toMatchObject(
      { status: 409 },
    );
    expect((await service.get(workspaceId, valid.id)).status).toBe("DRAFT");
    await expect(
      service.create(workspaceId, { ...draft(), status: "ACTIVE" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejeita estruturas inseguras sem apagar o rascunho existente", async () => {
    const saved = await service.create(workspaceId, draft());
    await expect(
      service.update(workspaceId, saved.id, {
        ...draft(),
        steps: [
          {
            kind: "SEND_DM",
            text: "Texto",
            buttons: [{ label: "Botão", action: "EXECUTE_SCRIPT" }],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await service.get(workspaceId, saved.id)).steps).toEqual(
      saved.steps,
    );
  });
});

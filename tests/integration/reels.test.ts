import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testClient } from "../helpers/database";
import { reelService } from "@/lib/instagram/reels";
import { automationService } from "@/lib/automations";
import { environmentCredentialProvider } from "@/lib/instagram/connection";
import type { InstagramMediaSnapshot } from "@/lib/instagram/media";
const client = testClient();
const service = reelService(client);
const automations = automationService(client);
let workspaceId: string, otherWorkspaceId: string;
const snapshot = (caption = "Ação 🚀 漢字"): InstagramMediaSnapshot => ({
  account: { id: "17841400000000001", username: "pulso_teste" },
  reels: [
    {
      externalId: "17900000000000001",
      caption,
      publishedAt: new Date("2026-10-01T12:00:00Z"),
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      classification: "PRODUCT_TYPE",
      permalink: "https://www.instagram.com/reel/Example/",
    },
  ],
  pages: 2,
  publications: 51,
  unclassifiedVideos: 0,
  unavailableFields: [],
});
const draft = { name: "", scope: "SPECIFIC_REELS", keywords: [], steps: [] };
beforeAll(async () => {
  workspaceId = (
    await client.workspace.create({ data: { name: randomUUID() } })
  ).id;
  otherWorkspaceId = (
    await client.workspace.create({ data: { name: randomUUID() } })
  ).id;
});
afterAll(async () => {
  await client.instagramReel.deleteMany({
    where: {
      socialAccount: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
    },
  });
  await client.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await client.$disconnect();
});
describe("catálogo de Reels e automações", () => {
  it("persiste UTF8 por conta/workspace e mantém IDs ao repetir", async () => {
    await service.apply(workspaceId, snapshot());
    const first = await service.list(workspaceId);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].caption).toBe("Ação 🚀 漢字");
    await service.apply(workspaceId, snapshot("Editada 😊"));
    const second = await service.list(workspaceId);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).toBe(first.items[0].id);
    expect(second.items[0].caption).toBe("Editada 😊");
    expect((await service.list(otherWorkspaceId)).items).toHaveLength(0);
  });
  it("salva e reabre múltiplas seleções; reedição conserva associações", async () => {
    await service.apply(workspaceId, {
      ...snapshot(),
      reels: [
        ...snapshot().reels,
        { ...snapshot().reels[0], externalId: "17900000000000002" },
      ],
    });
    const ids = (await service.list(workspaceId)).items.map((item) => item.id);
    const saved = await automations.create(workspaceId, {
      ...draft,
      reelIds: ids,
    });
    expect(saved.reels).toHaveLength(2);
    const reopened = await automations.get(workspaceId, saved.id);
    expect(reopened.reels.map((r) => r.instagramReelId).sort()).toEqual(
      ids.sort(),
    );
    const beforeIds = saved.reels.map((r) => r.id).sort();
    const updated = await automations.update(workspaceId, saved.id, {
      ...draft,
      reelIds: ids,
    });
    expect(updated.reels.map((r) => r.id).sort()).toEqual(beforeIds);
    const legacyClient = await automations.update(workspaceId, saved.id, draft);
    expect(legacyClient.reels.map((r) => r.id).sort()).toEqual(beforeIds);
    const deselected = await automations.update(workspaceId, saved.id, {
      ...draft,
      reelIds: [ids[0]],
    });
    expect(deselected.reels).toHaveLength(1);
    const cleared = await automations.update(workspaceId, saved.id, {
      ...draft,
      reelIds: [],
    });
    expect(cleared.reels).toHaveLength(0);
  });
  it("recusa Reel de outro workspace sem mudar o rascunho", async () => {
    await service.apply(otherWorkspaceId, snapshot());
    const foreign = (await service.list(otherWorkspaceId)).items[0];
    await expect(
      automations.create(workspaceId, { ...draft, reelIds: [foreign.id] }),
    ).rejects.toMatchObject({ status: 400 });
    const own = (await service.list(workspaceId)).items[0];
    const saved = await automations.create(workspaceId, {
      ...draft,
      reelIds: [own.id],
    });
    await expect(
      automations.update(workspaceId, saved.id, {
        ...draft,
        reelIds: [foreign.id],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await automations.get(workspaceId, saved.id)).reels.map((r) => r.id),
    ).toEqual(saved.reels.map((r) => r.id));
  });
  it("preserva catálogo, metadados ausentes e associações em erros ou páginas vazias", async () => {
    const own = (await service.list(workspaceId)).items[0];
    const saved = await automations.create(workspaceId, {
      ...draft,
      reelIds: [own.id],
    });
    await service.apply(workspaceId, { ...snapshot(), reels: [] });
    expect((await service.list(workspaceId)).items.length).toBeGreaterThan(0);
    await service.apply(workspaceId, {
      ...snapshot(),
      reels: [
        {
          externalId: own.externalId,
          mediaType: "VIDEO",
          classification: "PRODUCT_TYPE",
        },
      ],
    });
    expect(
      (await service.list(workspaceId)).items.find((r) => r.id === own.id)
        ?.caption,
    ).toBe(own.caption);
    const before = await service.list(workspaceId);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user_id: "17841400000000001",
          username: "pulso_teste",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "17900000000000003",
              media_type: "VIDEO",
              media_product_type: "REELS",
            },
          ],
          paging: { next: "unused", cursors: { after: "second" } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 190, error_subcode: 463 } },
          { status: 400 },
        ),
      );
    await expect(
      service.sync(
        workspaceId,
        environmentCredentialProvider({ INSTAGRAM_ACCESS_TOKEN: randomUUID() }),
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(await service.list(workspaceId)).toEqual(before);
    expect(
      (await automations.get(workspaceId, saved.id)).reels.map((r) => r.id),
    ).toEqual(saved.reels.map((r) => r.id));
  });
  it("preserva vínculos legados sem catálogo ao salvar seleção explícita", async () => {
    const saved = await automations.create(workspaceId, draft);
    const legacy = await client.automationReel.create({
      data: {
        automationId: saved.id,
        externalId: "legacy-preserved",
        title: "Histórico",
      },
    });
    const updated = await automations.update(workspaceId, saved.id, {
      ...draft,
      reelIds: [],
    });
    expect(updated.reels).toEqual([
      expect.objectContaining({ id: legacy.id, instagramReelId: null }),
    ]);
  });
  it("associa vínculo legado reconhecido ao catálogo sem recriar o registro", async () => {
    const saved = await automations.create(workspaceId, draft);
    const legacy = await client.automationReel.create({
      data: {
        automationId: saved.id,
        externalId: snapshot().reels[0].externalId,
        title: "Título anterior",
      },
    });
    await service.apply(workspaceId, snapshot());
    const loaded = await client.automationReel.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(loaded.id).toBe(legacy.id);
    expect(loaded.title).toBe("Título anterior");
    expect(loaded.instagramReelId).not.toBeNull();
  });
});

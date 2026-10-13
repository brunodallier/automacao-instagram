import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { environmentCredentialProvider } from "@/lib/instagram/connection";
import { fetchInstagramReels, readReel } from "@/lib/instagram/media";
import { prioritizeEligibleAutomations } from "@/lib/automation-contract";

const profile = () =>
  Response.json({ user_id: "17841400000000001", username: "pulso_teste" });
const video = (id = "17900000000000001") => ({
  id,
  media_type: "VIDEO",
  media_product_type: "REELS",
  caption: "Ação 🚀",
  timestamp: "2026-10-01T12:00:00+0000",
  permalink: "https://www.instagram.com/reel/Example/",
  thumbnail_url: "https://scontent.cdninstagram.com/thumbnail.jpg",
});
const secret = () => randomUUID();
const provider = (token: string) =>
  environmentCredentialProvider({
    INSTAGRAM_ACCESS_TOKEN: token,
    INSTAGRAM_API_VERSION: "v25.0",
  });

describe("publicações do Instagram Login", () => {
  it("identifica VIDEO/REELS e recupera metadados, sem tratar todos os vídeos como Reels", () => {
    const token = secret();
    const result = readReel(video(), token).reel!;
    expect(result.mediaType).toBe("VIDEO");
    expect(result.classification).toBe("PRODUCT_TYPE");
    expect(result.caption).toBe("Ação 🚀");
    expect(result.publishedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(
      readReel({ ...video(), media_product_type: "FEED" }, token).reel,
    ).toBeNull();
    expect(
      readReel({ ...video(), media_type: "CAROUSEL_ALBUM" }, token).reel,
    ).toBeNull();
  });
  it("usa apenas o permalink canônico quando o produto não está disponível", () => {
    const token = secret();
    expect(
      readReel({ ...video(), media_product_type: undefined }, token).reel
        ?.classification,
    ).toBe("PERMALINK");
    const unknown = readReel(
      {
        ...video(),
        media_product_type: undefined,
        permalink: "https://www.instagram.com/p/Example/",
      },
      token,
    );
    expect(unknown.reel).toBeNull();
    expect(unknown.unclassified).toBe(true);
    expect(
      readReel(
        {
          id: "17900000000000001",
          media_type: "VIDEO",
          media_product_type: "REELS",
        },
        token,
      ).reel,
    ).toMatchObject({ externalId: "17900000000000001" });
  });
  it("não encaminha segredo em metadados e bloqueia URLs arbitrárias", () => {
    const token = secret();
    const result = readReel(
      {
        ...video(),
        caption: "Texto " + token,
        thumbnail_url: "https://other.invalid/" + token,
        permalink:
          "https://www.instagram.com/reel/Example/?access_token=" + token,
      },
      token,
    ).reel;
    expect(JSON.stringify(result).includes(token)).toBe(false);
    expect(
      readReel(
        { ...video(), thumbnail_url: "https://other.invalid/image.jpg" },
        token,
      ).reel?.thumbnailUrl,
    ).toBeUndefined();
  });
  it("percorre páginas antigas com cursor, deduplica e nunca segue next com token", async () => {
    const token = secret();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(
        Response.json({
          data: [video()],
          paging: {
            cursors: { after: "cursor-two" },
            next: "https://evil.invalid/?access_token=" + token,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [video(), video("17900000000000002")] }),
      );
    const result = await fetchInstagramReels(provider(token), fetcher);
    expect(result.pages).toBe(2);
    expect(result.publications).toBe(3);
    expect(result.reels).toHaveLength(2);
    const url = new URL(fetcher.mock.calls[2][0]);
    expect(url.origin).toBe("https://graph.instagram.com");
    expect(url.searchParams.get("after")).toBe("cursor-two");
    expect(
      fetcher.mock.calls.every(
        ([input, options]) =>
          !String(input).includes(token) &&
          options.method === "GET" &&
          options.redirect === "error" &&
          options.cache === "no-store",
      ),
    ).toBe(true);
    expect(JSON.stringify(result).includes(token)).toBe(false);
  });
  it("adapta um campo opcional recusado e conserva a classificação por permalink", async () => {
    const token = secret();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 100,
              message: "Tried accessing nonexisting field (media_product_type)",
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ ...video(), media_product_type: undefined }],
        }),
      );
    const result = await fetchInstagramReels(provider(token), fetcher);
    expect(result.unavailableFields).toEqual(["media_product_type"]);
    expect(result.reels[0].classification).toBe("PERMALINK");
    expect(
      new URL(fetcher.mock.calls[2][0]).searchParams
        .get("fields")
        ?.includes("media_product_type"),
    ).toBe(false);
  });
  it.each([
    [190, 463, "TOKEN_EXPIRED"],
    [190, 467, "AUTHENTICATION_ERROR"],
    [4, 0, "RATE_LIMITED"],
    [10, 0, "PERMISSION_ERROR"],
    [1, 0, "UNAVAILABLE"],
  ])(
    "interrompe paginação com erro %s sem expor a credencial",
    async (code, subcode, expected) => {
      const token = secret();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(profile())
        .mockResolvedValueOnce(
          Response.json({
            data: [video()],
            paging: { next: "unused", cursors: { after: "second" } },
          }),
        )
        .mockResolvedValueOnce(
          Response.json(
            { error: { code, error_subcode: subcode, message: token } },
            { status: 400 },
          ),
        );
      try {
        await fetchInstagramReels(provider(token), fetcher);
        throw new Error("Expected failure");
      } catch (error) {
        expect((error as { code: string }).code).toBe(expected);
        expect(String(error).includes(token)).toBe(false);
      }
    },
  );
  it.each([
    { next: "unused" },
    { next: "unused", cursors: { after: "again" } },
  ])("recusa paginação sem cursor ou repetida", async (paging) => {
    const token = secret();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockImplementation(async () =>
        Response.json({ data: [video()], paging }),
      );
    await expect(
      fetchInstagramReels(provider(token), fetcher),
    ).rejects.toMatchObject({ code: "PAGINATION_ERROR" });
  });
  it("não inventa perfil, publicações ou datas quando os dados são inválidos", async () => {
    const token = secret();
    expect(() =>
      readReel({ ...video(), timestamp: "invalid" }, token),
    ).toThrow();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(Response.json({ data: null }));
    await expect(
      fetchInstagramReels(provider(token), fetcher),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("conserva a prioridade das específicas entre candidatas já elegíveis", () => {
    const global = { id: "global", scope: "GLOBAL" as const };
    const specific = { id: "specific", scope: "SPECIFIC_REELS" as const };
    expect(prioritizeEligibleAutomations([global, specific])).toEqual([
      specific,
    ]);
    expect(prioritizeEligibleAutomations([global])).toEqual([global]);
  });
});

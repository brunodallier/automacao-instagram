import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/instagram/conexao/route";
import { getOwnerContext } from "@/lib/session";
import { getInstagramConnection } from "@/lib/instagram/server";

vi.mock("@/lib/session", () => ({ getOwnerContext: vi.fn() }));
vi.mock("@/lib/instagram/server", () => ({ getInstagramConnection: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("recusa acesso anônimo antes de consultar a Meta e evita cache", async () => {
  vi.mocked(getOwnerContext).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(getInstagramConnection).not.toHaveBeenCalled();
});

it("retorna somente a projeção segura para o proprietário", async () => {
  vi.mocked(getOwnerContext).mockResolvedValue({
    user: {},
    workspace: {},
  } as Awaited<ReturnType<typeof getOwnerContext>>);
  const result = {
    status: "CONNECTED" as const,
    message: "Leitura verificada.",
    account: { id: "17841400000000001", username: "pulso_teste" },
    checkedAt: "2026-10-13T12:00:00.000Z",
  };
  vi.mocked(getInstagramConnection).mockResolvedValue(result);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("não registra nem devolve exceções internas da sessão", async () => {
  vi.mocked(getOwnerContext).mockRejectedValue(new Error("private details"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await GET();
  expect(response.status).toBe(503);
  expect((await response.text()).includes("private details")).toBe(false);
  expect(getInstagramConnection).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

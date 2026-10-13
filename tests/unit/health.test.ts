import { afterEach, expect, it, vi } from "vitest";
import { GET as ready } from "@/app/api/health/ready/route";
import { GET as live } from "@/app/api/health/live/route";
const mocks = vi.hoisted(() => ({ query: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, user: { findFirst: mocks.user } } }));
afterEach(() => vi.resetAllMocks());

it("liveness não consulta banco nem expõe detalhes", async () => {
  const response = await live();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "live" });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("readiness exige banco UTF8 e schema acessível, sem exigir criação de usuário", async () => {
  mocks.query.mockResolvedValue([{ encoding: "UTF8" }]);
  mocks.user.mockResolvedValue(null);
  const response = await ready();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("readiness recusa WIN1252", async () => {
  mocks.query.mockResolvedValue([{ encoding: "WIN1252" }]);
  mocks.user.mockResolvedValue(null);
  expect((await ready()).status).toBe(503);
});
it.each(["connection", "schema"])("readiness trata falha de %s sem credenciais em resposta ou logs", async (failure) => {
  mocks.query.mockResolvedValue([{ encoding: "UTF8" }]);
  mocks.user.mockResolvedValue(null);
  (failure === "connection" ? mocks.query : mocks.user).mockRejectedValue(new Error("private-connection-details"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await ready();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "not_ready" });
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

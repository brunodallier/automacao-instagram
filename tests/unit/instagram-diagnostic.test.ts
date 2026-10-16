import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
import { readFile } from "node:fs/promises";
import { webhookDiagnosticCandidate } from "../../src/lib/instagram/execution/diagnostic";

describe("candidato privado do diagnóstico", () => {
  beforeEach(() => vi.resetAllMocks());
  it("não lê arquivo quando o diagnóstico está desligado ou expirado", async () => {
    expect(await webhookDiagnosticCandidate(false)).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });
  it("carrega somente candidato com formato esperado e falha sem afetar a autenticação", async () => {
    const mocked = vi.mocked(readFile);
    mocked.mockResolvedValueOnce("abcdef0123456789abcdef0123456789\n");
    expect(await webhookDiagnosticCandidate(true)).toBe("abcdef0123456789abcdef0123456789");
    mocked.mockResolvedValueOnce("invalid");
    expect(await webhookDiagnosticCandidate(true)).toBeUndefined();
    mocked.mockRejectedValueOnce(Error("private filesystem detail"));
    expect(await webhookDiagnosticCandidate(true)).toBeUndefined();
  });
});

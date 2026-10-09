import "server-only";
import { NextResponse } from "next/server";
import { TagError } from "@/lib/tags";

export function verifyMutationOrigin(request: Request) {
  const expected = process.env.NEXTAUTH_URL;
  const origin = request.headers.get("origin");
  if (!expected || !origin || origin !== new URL(expected).origin) {
    throw new TagError("Origem da solicitação não permitida.", 403);
  }
}

export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new TagError("Envie os dados em JSON.", 400);
  const raw = await request.text();
  if (raw.length > 65536) throw new TagError("Solicitação muito grande.", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TagError("Dados inválidos.", 400);
  }
}

function isApiError(
  error: unknown,
): error is { message: string; status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    "status" in error &&
    typeof error.message === "string" &&
    typeof error.status === "number"
  );
}

export function apiError(error: unknown) {
  if (error instanceof TagError || isApiError(error))
    return NextResponse.json(
      {
        error: error.message,
        ...(error instanceof Error && "issues" in error
          ? { issues: error.issues }
          : {}),
      },
      { status: error.status },
    );
  console.error(
    "Falha em operação autenticada. Verifique a disponibilidade do banco.",
  );
  return NextResponse.json(
    { error: "Não foi possível concluir. Tente novamente em instantes." },
    { status: 503 },
  );
}

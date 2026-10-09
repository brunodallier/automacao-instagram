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
  if (raw.length > 2048) throw new TagError("Solicitação muito grande.", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TagError("Dados inválidos.", 400);
  }
}

export function apiError(error: unknown) {
  if (error instanceof TagError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(
    "Falha em operação de tags. Verifique a disponibilidade do banco.",
  );
  return NextResponse.json(
    { error: "Não foi possível concluir. Tente novamente em instantes." },
    { status: 503 },
  );
}

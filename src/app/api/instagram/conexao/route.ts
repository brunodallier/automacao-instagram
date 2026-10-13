import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { getInstagramConnection } from "@/lib/instagram/server";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!(await getOwnerContext()))
      return NextResponse.json(
        { error: "Entre na sua conta para continuar." },
        { status: 401, headers },
      );
    return NextResponse.json(await getInstagramConnection(), { headers });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível verificar a conexão agora." },
      { status: 503, headers },
    );
  }
}

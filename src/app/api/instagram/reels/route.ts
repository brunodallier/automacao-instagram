import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { verifyMutationOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { environmentCredentialProvider } from "@/lib/instagram/connection";
import { reelService } from "@/lib/instagram/reels";
import { InstagramMediaError } from "@/lib/instagram/media";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const context = await getOwnerContext();
    if (!context)
      return NextResponse.json(
        { error: "Entre na sua conta para continuar." },
        { status: 401, headers },
      );
    return NextResponse.json(await reelService(db).list(context.workspace.id), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar os Reels armazenados." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    const context = await getOwnerContext();
    if (!context)
      return NextResponse.json(
        { error: "Entre na sua conta para continuar." },
        { status: 401, headers },
      );
    try {
      verifyMutationOrigin(request);
    } catch {
      return NextResponse.json(
        { error: "Origem da solicitação não permitida." },
        { status: 403, headers },
      );
    }
    const result = await reelService(db).sync(
      context.workspace.id,
      environmentCredentialProvider(process.env),
    );
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof InstagramMediaError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    return NextResponse.json(
      {
        error:
          "Não foi possível atualizar os Reels. Os dados anteriores foram preservados.",
      },
      { status: 503, headers },
    );
  }
}

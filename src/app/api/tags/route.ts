import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { tagService, TagError } from "@/lib/tags";
import { apiError, readJson, verifyMutationOrigin } from "@/lib/api";

export async function GET() {
  try {
    const context = await getOwnerContext();
    if (!context) throw new TagError("Entre na sua conta para continuar.", 401);
    return NextResponse.json(await tagService(db).list(context.workspace.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context) throw new TagError("Entre na sua conta para continuar.", 401);
    const tag = await tagService(db).create(
      context.workspace.id,
      await readJson(request),
    );
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

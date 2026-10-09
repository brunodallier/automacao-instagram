import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { tagService, TagError } from "@/lib/tags";
import { apiError, readJson, verifyMutationOrigin } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context) throw new TagError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    return NextResponse.json(
      await tagService(db).rename(
        context.workspace.id,
        id,
        await readJson(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context) throw new TagError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    await tagService(db).remove(context.workspace.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

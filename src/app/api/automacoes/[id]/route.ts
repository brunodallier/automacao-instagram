import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { apiError, readJson, verifyMutationOrigin } from "@/lib/api";
import { automationService, AutomationError } from "@/lib/automations";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    return NextResponse.json(
      await automationService(db).get(context.workspace.id, id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    return NextResponse.json(
      await automationService(db).update(
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
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    await automationService(db).remove(context.workspace.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

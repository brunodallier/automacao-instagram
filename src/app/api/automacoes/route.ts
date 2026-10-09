import { NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { apiError, readJson, verifyMutationOrigin } from "@/lib/api";
import { automationService, AutomationError } from "@/lib/automations";

export async function GET() {
  try {
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    return NextResponse.json(
      await automationService(db).list(context.workspace.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    return NextResponse.json(
      await automationService(db).create(
        context.workspace.id,
        await readJson(request),
      ),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

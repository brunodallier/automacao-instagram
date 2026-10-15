import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { AutomationError } from "@/lib/automations";
import { listActivities } from "@/lib/instagram/execution/activity";
import { idSchema } from "@/lib/validation";
export async function GET(request: Request) {
  try {
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    if (cursor && !idSchema.safeParse(cursor).success)
      throw new AutomationError("Cursor inválido.", 400);
    return Response.json(
      await listActivities(db, context.workspace.id, cursor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

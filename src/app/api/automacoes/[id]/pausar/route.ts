import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { apiError, verifyMutationOrigin } from "@/lib/api";
import { AutomationError, automationService } from "@/lib/automations";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    return Response.json(
      await automationService(db).pause(
        context.workspace.id,
        (await params).id,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

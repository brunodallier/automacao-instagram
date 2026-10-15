import { getOwnerContext } from "@/lib/session";
import { db } from "@/lib/db";
import { apiError, readJson, verifyMutationOrigin } from "@/lib/api";
import { AutomationError } from "@/lib/automations";
import { automationEngine } from "@/lib/instagram/execution/engine";
import { executionSettings } from "@/lib/instagram/execution/config";
import { runtimeCredentialProvider } from "@/lib/instagram/execution/credentials";
import { graphTransport } from "@/lib/instagram/execution/transport";
import { idSchema } from "@/lib/validation";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    verifyMutationOrigin(request);
    const context = await getOwnerContext();
    if (!context)
      throw new AutomationError("Entre na sua conta para continuar.", 401);
    const { id } = await params;
    if (!idSchema.safeParse(id).success)
      throw new AutomationError("Registro inválido.", 400);
    const input = (await readJson(request)) as Record<string, unknown>;
    if (!input || typeof input.justification !== "string")
      throw new AutomationError(
        "Informe a justificativa do erro identificado.",
        400,
      );
    const settings = executionSettings(),
      engine = automationEngine(db, {
        settings,
        transport: graphTransport(
          runtimeCredentialProvider(process.env),
          settings,
        ),
      });
    await engine.approveFallback(context.workspace.id, id, input.justification);
    return Response.json({ queued: true });
  } catch (error) {
    return apiError(error);
  }
}

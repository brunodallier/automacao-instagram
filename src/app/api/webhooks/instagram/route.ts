import { db } from "@/lib/db";
import {
  executionSettings,
  webhookDiagnosticsEnabled,
} from "@/lib/instagram/execution/config";
import {
  webhookHandlers,
  type WebhookSignatureDiagnostic,
} from "@/lib/instagram/execution/webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return webhookHandlers(db, executionSettings()).GET(request);
}
export async function POST(request: Request) {
  const diagnose = webhookDiagnosticsEnabled()
      ? (entry: WebhookSignatureDiagnostic) => {
          console.info(JSON.stringify({
            event: "PULSO_WEBHOOK_SIGNATURE_DIAGNOSTIC",
            at: new Date().toISOString(),
            ...entry,
          }));
        }
      : undefined;
  return webhookHandlers(db, executionSettings(), undefined, diagnose).POST(request);
}

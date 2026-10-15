import { db } from "@/lib/db";
import { executionSettings } from "@/lib/instagram/execution/config";
import { webhookHandlers } from "@/lib/instagram/execution/webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return webhookHandlers(db, executionSettings()).GET(request);
}
export async function POST(request: Request) {
  return webhookHandlers(db, executionSettings()).POST(request);
}

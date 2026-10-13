import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await db.$queryRaw<{ encoding: string }[]>`SELECT current_setting('server_encoding') AS encoding`;
    await db.user.findFirst({ select: { id: true } });
    if (result[0]?.encoding !== "UTF8") throw new Error();
    return NextResponse.json({ status: "ready" }, { headers });
  } catch { return NextResponse.json({ status: "not_ready" }, { status: 503, headers }); }
}

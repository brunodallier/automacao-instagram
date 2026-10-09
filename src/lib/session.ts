import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import type { NextApiRequest } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const getOwnerContext = cache(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const token = await getToken({
    req: {
      cookies: Object.fromEntries(
        cookieStore.getAll().map(({ name, value }) => [name, value]),
      ),
      headers: Object.fromEntries(headerStore.entries()),
    } as NextApiRequest,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });
  if (
    !token?.sub ||
    typeof token.sessionVersion !== "number" ||
    typeof token.authenticatedAt !== "number" ||
    Date.now() - token.authenticatedAt >= 8 * 60 * 60 * 1000
  )
    return null;
  const membership = await db.workspaceMembership.findFirst({
    where: {
      userId: token.sub,
      role: "OWNER",
      user: { sessionVersion: token.sessionVersion },
    },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      workspace: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return membership
    ? { user: membership.user, workspace: membership.workspace }
    : null;
});

export async function requireOwner() {
  const context = await getOwnerContext();
  if (!context) redirect("/login");
  return context;
}

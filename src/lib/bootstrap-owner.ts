import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/password";
import { ownerSchema } from "@/lib/validation";

export class OwnerSetupError extends Error {}

export async function configureFirstOwner(
  client: PrismaClient,
  input: unknown,
) {
  const parsed = ownerSchema.safeParse(input);
  if (!parsed.success)
    throw new OwnerSetupError(
      parsed.error.issues.map((issue) => issue.message).join("\n"),
    );
  const { name, email, password, workspaceName } = parsed.data;
  const passwordHash = await hashPassword(password);
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(48172001)`;
    if (await tx.user.count())
      throw new OwnerSetupError(
        "O proprietário já está configurado. Não há cadastro público.",
      );
    return tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            workspace: { create: { name: workspaceName } },
          },
        },
      },
      select: { id: true, memberships: { select: { workspaceId: true } } },
    });
  });
}

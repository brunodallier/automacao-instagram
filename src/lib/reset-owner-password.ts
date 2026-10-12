import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/password";
import { loginSchema, ownerPasswordConfirmationSchema } from "@/lib/validation";

export class OwnerPasswordResetError extends Error {}

export async function resetOwnerPassword(
  client: PrismaClient,
  email: unknown,
  input: unknown,
) {
  const parsedEmail = loginSchema.shape.email.safeParse(email);
  const parsedPassword = ownerPasswordConfirmationSchema.safeParse(input);
  if (!parsedEmail.success || !parsedPassword.success)
    throw new OwnerPasswordResetError(
      [
        ...(!parsedEmail.success ? parsedEmail.error.issues : []),
        ...(!parsedPassword.success ? parsedPassword.error.issues : []),
      ]
        .map((issue) => issue.message)
        .join("\n"),
    );
  return client.user.update({
    where: { email: parsedEmail.data },
    data: {
      passwordHash: await hashPassword(parsedPassword.data.password),
      sessionVersion: { increment: 1 },
    },
    select: { id: true },
  });
}

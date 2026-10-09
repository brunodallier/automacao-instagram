import "dotenv/config";
import { input, password } from "@inquirer/prompts";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { loginSchema, ownerSchema } from "../src/lib/validation";

async function main() {
  const email = loginSchema.shape.email.parse(
    await input({ message: "E-mail do proprietário:" }),
  );
  const value = ownerSchema.shape.password.parse(
    await password({
      message: "Nova senha (mínimo 12 caracteres):",
      mask: "*",
    }),
  );
  if (
    value !== (await password({ message: "Confirme a nova senha:", mask: "*" }))
  )
    throw new Error("As senhas não coincidem.");
  await db.user.update({
    where: { email },
    data: {
      passwordHash: await hashPassword(value),
      sessionVersion: { increment: 1 },
    },
  });
  console.log("Senha atualizada. As sessões anteriores foram revogadas.");
}
main()
  .catch(() => {
    console.error(
      "Não foi possível alterar a senha. Confira os dados e o banco.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

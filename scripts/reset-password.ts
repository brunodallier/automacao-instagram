import "dotenv/config";
import { input } from "@inquirer/prompts";
import { db } from "../src/lib/db";
import { loginSchema } from "../src/lib/validation";
import {
  OwnerPasswordResetError,
  resetOwnerPassword,
} from "../src/lib/reset-owner-password";
import {
  OwnerPasswordInputError,
  promptOwnerPassword,
} from "./owner-password-prompt";

async function main() {
  const email = loginSchema.shape.email.parse(
    await input({ message: "E-mail do proprietário:" }),
  );
  const credentials = await promptOwnerPassword(
    "Nova senha:",
    "Confirme a nova senha:",
  );
  await resetOwnerPassword(db, email, credentials);
  console.log("Senha atualizada. As sessões anteriores foram revogadas.");
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof OwnerPasswordInputError ||
        error instanceof OwnerPasswordResetError
        ? error.message
        : "Não foi possível alterar a senha. Confira os dados e o banco.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

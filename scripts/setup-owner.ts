import "dotenv/config";
import { input, password } from "@inquirer/prompts";
import { db } from "../src/lib/db";
import { ownerSchema } from "../src/lib/validation";
import { configureFirstOwner } from "../src/lib/bootstrap-owner";

async function main() {
  if (await db.user.count())
    throw new Error(
      "O proprietário já está configurado. Não há cadastro público.",
    );
  const result = ownerSchema.safeParse({
    name: await input({ message: "Nome do proprietário:" }),
    email: await input({ message: "E-mail:" }),
    workspaceName: await input({ message: "Nome do espaço de trabalho:" }),
    password: await password({
      message: "Senha (mínimo 12 caracteres):",
      mask: "*",
    }),
  });
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => issue.message).join("\n"),
    );
  const confirmation = await password({
    message: "Confirme a senha:",
    mask: "*",
  });
  if (confirmation !== result.data.password)
    throw new Error("As senhas não coincidem.");
  await configureFirstOwner(db, result.data);
  console.log(
    "Proprietário criado. Acesse /login. Nenhuma tag foi pré-cadastrada.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && !("code" in error)
        ? error.message
        : "Não foi possível configurar o proprietário. Verifique o banco e as migrations.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

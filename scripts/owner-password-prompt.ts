import { password } from "@inquirer/prompts";
import {
  ownerPasswordConfirmationSchema,
  ownerPasswordRequirements,
  ownerPasswordSchema,
} from "../src/lib/validation";

export class OwnerPasswordInputError extends Error {}

export async function promptOwnerPassword(
  message: string,
  confirmationMessage: string,
) {
  console.log(ownerPasswordRequirements);
  const value = await password({
    message,
    mask: "*",
    validate: (candidate) => {
      const result = ownerPasswordSchema.safeParse(candidate);
      return result.success
        ? true
        : result.error.issues.map((issue) => issue.message).join("\n");
    },
  });
  const confirmation = await password({
    message: confirmationMessage,
    mask: "*",
    validate: (candidate) => candidate === value || "As senhas não coincidem.",
  });
  const result = ownerPasswordConfirmationSchema.safeParse({
    password: value,
    confirmation,
  });
  if (!result.success)
    throw new OwnerPasswordInputError(
      result.error.issues.map((issue) => issue.message).join("\n"),
    );
  return result.data;
}

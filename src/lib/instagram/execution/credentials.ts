import { readFileSync } from "node:fs";
import {
  environmentCredentialProvider,
  InstagramConfigurationError,
  type InstagramCredentialProvider,
} from "../connection";
// Arquivos privados podem ser rotacionados sem guardar tokens no banco ou nos jobs.
export function runtimeCredentialProvider(
  env: Record<string, string | undefined> = process.env,
  read: typeof readFileSync = readFileSync,
): InstagramCredentialProvider {
  return {
    async getCredential() {
      const settings = { ...env };
      if (env.INSTAGRAM_ACCESS_TOKEN_FILE) {
        try {
          settings.INSTAGRAM_ACCESS_TOKEN = String(
            read(env.INSTAGRAM_ACCESS_TOKEN_FILE, "utf8"),
          ).trim();
        } catch {
          throw new InstagramConfigurationError();
        }
      }
      return environmentCredentialProvider(settings).getCredential();
    },
  };
}

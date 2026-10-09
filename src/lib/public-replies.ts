import type { PublicReplyConfig } from "@/lib/automation-draft";
import { characterCount, type DraftIssue } from "@/lib/automation-rules";

// Existing local editor policy; not a claimed Instagram API character limit.
export const PUBLIC_REPLY_LIMIT = 500;

export function publicReplyIssues(config: PublicReplyConfig): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (config.enabled) {
    if (!config.variations.some((text) => text.trim()))
      issues.push({
        path: "publicReplies.variations",
        message: "Preencha pelo menos uma resposta pública antes de ativar.",
      });
    config.variations.forEach((text, index) => {
      if (characterCount(text) > PUBLIC_REPLY_LIMIT)
        issues.push({
          path: `publicReplies.variations.${index}`,
          message:
            "Use até 500 caracteres na resposta pública (limite do editor).",
        });
    });
  }
  if (config.fallback.enabled) {
    if (!config.fallback.text.trim())
      issues.push({
        path: "publicReplies.fallback.text",
        message: "Preencha a resposta alternativa antes de ativar.",
      });
    if (characterCount(config.fallback.text) > PUBLIC_REPLY_LIMIT)
      issues.push({
        path: "publicReplies.fallback.text",
        message:
          "Use até 500 caracteres na resposta alternativa (limite do editor).",
      });
  }
  return issues;
}

export type DmOutcome =
  | { kind: "UNCONFIRMED" | "API_ACCEPTED" | "DELAYED" | "TEMPORARY_FAILURE" }
  | {
      kind: "DEFINITIVE_FAILURE";
      identifiedError: string;
      fallbackJustified: boolean;
    };

// No inference from API acceptance, time elapsed, or unconfirmed delivery.
export function fallbackPublicReply(
  config: PublicReplyConfig,
  outcome: DmOutcome,
): string | null {
  if (
    config.fallback.enabled &&
    config.fallback.text.trim() &&
    characterCount(config.fallback.text) <= PUBLIC_REPLY_LIMIT &&
    outcome.kind === "DEFINITIVE_FAILURE" &&
    outcome.identifiedError.trim() &&
    outcome.fallbackJustified
  )
    return config.fallback.text;
  return null;
}

// The caller owns the rotation cursor; this selection imposes no DM execution order.
export function rotatingPublicReply(
  config: PublicReplyConfig,
  cursor: number,
): string | null {
  if (!config.enabled) return null;
  const filled = config.variations.filter(
    (text) => text.trim() && characterCount(text) <= PUBLIC_REPLY_LIMIT,
  );
  return filled.length
    ? filled[
        ((Math.floor(cursor) % filled.length) + filled.length) % filled.length
      ]
    : null;
}

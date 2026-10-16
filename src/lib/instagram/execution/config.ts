export type ExecutionSettings = {
  mode: "disabled" | "controlled" | "live";
  accountId: string;
  webhookEnabled: boolean;
  appSecret: string;
  verifyToken: string;
  testCommentId: string;
  testRecipientId: string;
  metaValidated: boolean;
};
export function executionSettings(
  env: Record<string, string | undefined> = process.env,
): ExecutionSettings {
  const mode = env.INSTAGRAM_SEND_MODE;
  return {
    mode: mode === "controlled" || mode === "live" ? mode : "disabled",
    accountId: env.INSTAGRAM_EXECUTION_ACCOUNT_ID?.trim() ?? "",
    webhookEnabled: env.INSTAGRAM_WEBHOOK_ENABLED === "true",
    appSecret: env.INSTAGRAM_APP_SECRET?.trim() ?? "",
    verifyToken: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim() ?? "",
    testCommentId: env.INSTAGRAM_TEST_COMMENT_ID?.trim() ?? "",
    testRecipientId: env.INSTAGRAM_TEST_RECIPIENT_ID?.trim() ?? "",
    metaValidated: env.INSTAGRAM_META_VALIDATED === "true",
  };
}
export const graphId = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,120}$/.test(value);
export function webhookDiagnosticsEnabled(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
) {
  const until = Number(env.INSTAGRAM_WEBHOOK_DIAGNOSTICS_UNTIL);
  return (
    env.INSTAGRAM_WEBHOOK_DIAGNOSTICS === "true" &&
    Number.isFinite(until) && until > now && until <= now + 86400000
  );
}
export function executionConfigured(settings: ExecutionSettings) {
  return (
    settings.mode !== "disabled" &&
    graphId(settings.accountId) &&
    settings.webhookEnabled &&
    (settings.mode === "controlled"
      ? graphId(settings.testCommentId) && graphId(settings.testRecipientId)
      : settings.metaValidated)
  );
}
export function allowSend(
  settings: ExecutionSettings,
  accountId: string,
  commentId: string,
  recipientId?: string | null,
) {
  return (
    executionConfigured(settings) &&
    settings.accountId === accountId &&
    (settings.mode === "live" ||
      (settings.testCommentId === commentId &&
        (!recipientId || settings.testRecipientId === recipientId)))
  );
}

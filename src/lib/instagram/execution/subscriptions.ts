import {
  checkInstagramConnection,
  type InstagramCredentialProvider,
} from "../connection";
import { graphId } from "./config";
export const INSTAGRAM_WEBHOOK_FIELDS = [
  "comments",
  "messages",
  "messaging_postbacks",
  "messaging_seen",
] as const;
export type SubscriptionCheck = {
  status:
    | "SUBSCRIBED"
    | "NOT_SUBSCRIBED"
    | "PARTIAL"
    | "UNAVAILABLE"
    | "ACCOUNT_MISMATCH";
  apps: { id: string; fields: string[] }[];
};
export async function checkWebhookSubscription(
  provider: InstagramCredentialProvider,
  accountId: string,
  fetcher: typeof fetch = fetch,
): Promise<SubscriptionCheck> {
  const failed = (status: SubscriptionCheck["status"]): SubscriptionCheck => ({
    status,
    apps: [],
  });
  try {
    if (!graphId(accountId)) return failed("ACCOUNT_MISMATCH");
    const credential = await provider.getCredential();
    if (!credential) return failed("UNAVAILABLE");
    const fixed = { getCredential: async () => credential },
      identity = await checkInstagramConnection(fixed, fetcher);
    if (identity.status !== "CONNECTED") return failed("UNAVAILABLE");
    if (identity.account?.id !== accountId) return failed("ACCOUNT_MISMATCH");
    const response = await fetcher(
      `https://graph.instagram.com/${credential.apiVersion}/${accountId}/subscribed_apps`,
      {
        headers: { Authorization: `Bearer ${credential.accessToken}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return failed("UNAVAILABLE");
    const data = (await response.json()) as { data?: unknown[] };
    if (!Array.isArray(data.data)) return failed("UNAVAILABLE");
    const apps = data.data.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const app = value as { id?: unknown; subscribed_fields?: unknown };
      if (!graphId(app.id)) return [];
      return [
        {
          id: app.id,
          fields: Array.isArray(app.subscribed_fields)
            ? app.subscribed_fields.filter(
                (v): v is string =>
                  typeof v === "string" && /^[a-z_]{1,80}$/.test(v),
              )
            : [],
        },
      ];
    });
    return {
      status: apps.some((app) =>
        INSTAGRAM_WEBHOOK_FIELDS.every((field) => app.fields.includes(field)),
      )
        ? "SUBSCRIBED"
        : apps.length
          ? "PARTIAL"
          : "NOT_SUBSCRIBED",
      apps,
    };
  } catch {
    return failed("UNAVAILABLE");
  }
}
export async function subscribeWebhookAccount(
  provider: InstagramCredentialProvider,
  accountId: string,
  approved: boolean,
  fetcher: typeof fetch = fetch,
) {
  if (!approved) return { applied: false, status: "APPROVAL_REQUIRED" };
  try {
    const credential = await provider.getCredential();
    if (!credential || !graphId(accountId))
      return { applied: false, status: "CONFIGURATION_ERROR" };
    const identity = await checkInstagramConnection(
      { getCredential: async () => credential },
      fetcher,
    );
    if (identity.status !== "CONNECTED" || identity.account?.id !== accountId)
      return { applied: false, status: "ACCOUNT_MISMATCH" };
    const existing = await checkWebhookSubscription(
      { getCredential: async () => credential },
      accountId,
      fetcher,
    );
    if (
      ["UNAVAILABLE", "ACCOUNT_MISMATCH"].includes(existing.status) ||
      existing.apps.some(
        (app) =>
          !app.fields.length ||
          app.fields.some(
            (field) =>
              !INSTAGRAM_WEBHOOK_FIELDS.some((wanted) => wanted === field),
          ),
      )
    )
      return {
        applied: false,
        status: "EXISTING_SUBSCRIPTIONS_REVIEW_REQUIRED",
      };
    const response = await fetcher(
      `https://graph.instagram.com/${credential.apiVersion}/${accountId}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscribed_fields: INSTAGRAM_WEBHOOK_FIELDS.join(","),
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = (await response.json()) as { success?: unknown };
    return {
      applied: response.ok && data.success === true,
      status: response.ok && data.success === true ? "SUBSCRIBED" : "REJECTED",
    };
  } catch {
    return { applied: false, status: "UNCONFIRMED" };
  }
}

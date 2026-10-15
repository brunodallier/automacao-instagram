import "dotenv/config";
import { runtimeCredentialProvider } from "../src/lib/instagram/execution/credentials";
import { executionSettings } from "../src/lib/instagram/execution/config";
import {
  checkWebhookSubscription,
  subscribeWebhookAccount,
  INSTAGRAM_WEBHOOK_FIELDS,
} from "../src/lib/instagram/execution/subscriptions";
const settings = executionSettings(),
  provider = runtimeCredentialProvider();
if (process.argv.includes("--apply")) {
  const approved = process.env.INSTAGRAM_SUBSCRIPTION_SETUP_APPROVED === "true";
  if (!approved) {
    console.log(
      "Inscrição não executada. Exige autorização específica após publicação autorizada do callback HTTPS.",
    );
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify(
        await subscribeWebhookAccount(provider, settings.accountId, true),
      ),
    );
} else {
  const result = await checkWebhookSubscription(provider, settings.accountId);
  console.log(
    JSON.stringify(
      {
        ...result,
        requiredFields: INSTAGRAM_WEBHOOK_FIELDS,
        readOnly: true,
        meaning:
          "A consulta de inscrição não comprova recebimento de eventos, envio ou entrega.",
      },
      null,
      2,
    ),
  );
}

import "dotenv/config";
import {
  checkInstagramConnection,
  environmentCredentialProvider,
} from "../src/lib/instagram/connection";

const result = await checkInstagramConnection(
  environmentCredentialProvider(process.env),
);
console.log(result.message);
if (result.account) {
  console.log(`Conta: @${result.account.username}`);
  console.log(`ID: ${result.account.id}`);
}
if (result.checkedAt) console.log(`Consulta: ${result.checkedAt}`);
if (result.status !== "CONNECTED") process.exitCode = 1;

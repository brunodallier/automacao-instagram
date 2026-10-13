import "server-only";
import {
  checkInstagramConnection,
  environmentCredentialProvider,
} from "./connection";

export function getInstagramConnection() {
  return checkInstagramConnection(environmentCredentialProvider(process.env));
}

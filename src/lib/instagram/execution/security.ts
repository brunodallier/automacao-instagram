import { createHmac, timingSafeEqual, createHash } from "node:crypto";
// Limite local que admite lotes documentados; não é um limite declarado da Meta.
export const MAX_WEBHOOK_BYTES = 10_000_000;
export function secureEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest(),
    b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
export function validWebhookSignature(
  raw: Buffer,
  signature: string | null,
  appSecret: string,
) {
  if (!appSecret || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature))
    return false;
  return timingSafeEqual(
    createHmac("sha256", appSecret).update(raw).digest(),
    Buffer.from(signature.slice(7), "hex"),
  );
}
export async function boundedWebhookBody(request: Request): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES)
    throw new Error("BODY_TOO_LARGE");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0,
    timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => {});
  }, 15000);
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        if (timedOut) throw new Error("BODY_TIMEOUT");
        break;
      }
      size += next.value.byteLength;
      if (size > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function eventHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

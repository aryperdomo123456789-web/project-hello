import { createHmac, timingSafeEqual } from "node:crypto";

export type MagoBotSignatureInput = {
  timestamp: number;
  signature: string;
};

export function parseMagoBotSignature(request: Request): MagoBotSignatureInput | null {
  const rawTimestamp = request.headers.get("x-mago-timestamp")?.trim();
  const rawSignature = request.headers.get("x-mago-signature")?.trim().toLowerCase();
  if (!rawTimestamp || !rawSignature || !/^\d+$/.test(rawTimestamp)) return null;

  const timestamp = Number(rawTimestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  const signature = rawSignature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  return { timestamp, signature };
}

export function isMagoBotTimestampFresh(
  timestamp: number,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return Math.abs(nowSeconds - timestamp) <= maxAgeSeconds;
}

export function verifyMagoBotSignature(
  rawBody: string,
  timestamp: number,
  receivedSignature: string,
  secret: string,
): boolean {
  if (!secret || !/^[a-f0-9]{64}$/i.test(receivedSignature)) return false;
  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(receivedSignature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

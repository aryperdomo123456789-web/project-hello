import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getServerEnv } from "@/server/env.server";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const raw = process.env["INTEGRATION_ENCRYPTION_KEY"] ?? "";
  if (!raw) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY não configurada; não é seguro salvar credenciais");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes");
  }
  return key;
}

export function encryptIntegrationCredentials(value: Record<string, string>): string {
  // Force environment validation before touching credentials.
  getServerEnv();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptIntegrationCredentials(value: string): Record<string, string> {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Formato de credencial de integração inválido");
  }
  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(tagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Envelope de credencial de integração inválido");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Credencial de integração não é um objeto");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.some(([key, item]) => !/^[A-Za-z0-9_]+$/.test(key) || typeof item !== "string")) {
    throw new Error("Credencial de integração contém formato inválido");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

export function maskCredential(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function maskCredentialRecord(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, maskCredential(item) ?? ""]),
  );
}

import { describe, expect, it, beforeEach } from "vitest";

import { INTEGRATION_DEFINITIONS } from "@/services/integration-registry.server";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  maskCredential,
} from "@/server/integration-secrets.server";

describe("integration secrets", () => {
  beforeEach(() => {
    process.env["INTEGRATION_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
  });

  it("encrypts and decrypts credentials without changing values", () => {
    const source = { apiKey: "secret-value", accountId: "acct-123" };
    const envelope = encryptIntegrationCredentials(source);
    expect(envelope).not.toContain("secret-value");
    expect(decryptIntegrationCredentials(envelope)).toEqual(source);
  });

  it("rejects a malformed or tampered envelope", () => {
    const envelope = encryptIntegrationCredentials({ apiKey: "secret-value" });
    expect(() => decryptIntegrationCredentials(`${envelope}tampered`)).toThrow();
    expect(() => decryptIntegrationCredentials("v1.invalid.invalid.invalid")).toThrow();
  });

  it("masks credentials for UI previews", () => {
    expect(maskCredential("APP_USR-1234567890")).toBe("APP_••••7890");
    expect(maskCredential("short")).toBe("sh••••");
    expect(maskCredential(undefined)).toBeUndefined();
  });
});

describe("integration registry", () => {
  it("contains the requested providers and explicit runtime states", () => {
    const providers = new Set(INTEGRATION_DEFINITIONS.map((item) => item.provider));
    for (const provider of [
      "deepseek",
      "gemini",
      "groq",
      "cohere",
      "tavily",
      "jina",
      "openrouter",
      "mistral",
      "huggingface",
      "cloudflare_workers",
      "firecrawl",
      "exa",
      "langfuse",
      "siliconflow",
      "whisper",
      "lamatok",
      "mercadopago",
      "evolution",
      "meta_cloud",
      "mago_bot_api",
    ]) {
      expect(providers.has(provider as (typeof INTEGRATION_DEFINITIONS)[number]["provider"])).toBe(
        true,
      );
    }
    expect(
      INTEGRATION_DEFINITIONS.find((item) => item.provider === "evolution")?.runtimeStatus,
    ).toBe("stub");
    expect(
      INTEGRATION_DEFINITIONS.find((item) => item.provider === "deepseek")?.runtimeStatus,
    ).toBe("integrated");
    expect(
      INTEGRATION_DEFINITIONS.find((item) => item.provider === "mago_bot_api")?.runtimeStatus,
    ).toBe("prepared");
  });
});

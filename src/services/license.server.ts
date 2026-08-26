import { getServerEnv } from "@/server/env.server";

export type LicenseScope = "whatsapp:connect" | "whatsapp:send" | "whatsapp:webhook";

type LicenseValidation = {
  valid: boolean;
  status?: string;
  reason?: string | null;
};

type CachedLicense = {
  expiresAt: number;
  value: LicenseValidation;
};

const cache = new Map<LicenseScope, CachedLicense>();

async function validateLicenseRemote(scope: LicenseScope): Promise<LicenseValidation> {
  const env = getServerEnv();

  if (env.LICENSE_MODE === "local") {
    return { valid: true, status: "local_mode" };
  }

  if (env.WHATSAPP_PROVIDER === "stub" && !env.WHATSAPP_LICENSE_TOKEN) {
    return { valid: true, status: "development_stub" };
  }

  if (!env.WHATSAPP_LICENSE_TOKEN) {
    return {
      valid: false,
      status: "missing_token",
      reason: "WHATSAPP_LICENSE_TOKEN não configurado",
    };
  }

  try {
    const response = await fetch(`${env.LICENSE_API_BASE_URL}/v1/licenses/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: env.WHATSAPP_LICENSE_TOKEN,
        project_slug: env.LICENSE_PROJECT_SLUG,
        scope,
        domain: env.LICENSE_DOMAIN,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        valid: false,
        status: `license_http_${response.status}`,
        reason: "Central de licenças indisponível",
      };
    }

    return (await response.json()) as LicenseValidation;
  } catch {
    return {
      valid: false,
      status: "license_network_error",
      reason: "Não foi possível validar a licença agora",
    };
  }
}

export async function validateLicense(scope: LicenseScope): Promise<LicenseValidation> {
  const now = Date.now();
  const cached = cache.get(scope);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await validateLicenseRemote(scope);
  const ttl = value.valid ? 60_000 : 10_000;
  cache.set(scope, { value, expiresAt: now + ttl });
  return value;
}

export async function assertLicense(scope: LicenseScope) {
  const result = await validateLicense(scope);
  if (!result.valid) {
    throw new Error(result.reason ?? `Licença sem o scope ${scope}`);
  }
  return result;
}

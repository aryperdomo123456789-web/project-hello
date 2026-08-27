import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { IntegrationProvider } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole } from "@/server/auth.server";
import {
  clearOrganizationIntegration,
  disableOrganizationIntegration,
  listOrganizationIntegrations,
  saveOrganizationIntegration,
  testOrganizationIntegration,
} from "@/services/integrations.server";
import { getIntegrationDefinition } from "@/services/integration-registry.server";

const providerSchema = z.enum([
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
  "mago_bot_api",
  "evolution",
  "meta_cloud",
  "custom",
]);

const credentialsSchema = z
  .record(z.string().regex(/^[A-Za-z0-9_]{1,64}$/), z.string().trim().max(4096))
  .refine((record) => Object.keys(record).length <= 12, "Muitos campos de credencial");

const saveSchema = z.object({
  provider: providerSchema,
  endpointUrl: z.string().trim().max(500).optional().or(z.literal("")),
  model: z.string().trim().max(160).optional().or(z.literal("")),
  isEnabled: z.boolean(),
  credentials: credentialsSchema,
});

const providerInputSchema = z.object({ provider: providerSchema });

type ProviderInput = z.infer<typeof providerInputSchema>;

export type IntegrationSummaryDTO = Awaited<
  ReturnType<typeof listOrganizationIntegrations>
>[number];

export const listIntegrationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRole("owner", "admin");
  return listOrganizationIntegrations(actor.organizationId);
});

export const saveIntegrationFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin");
    const result = await saveOrganizationIntegration(actor.organizationId, actor.id, data);
    await writeAudit(actor, {
      action: "integration.saved",
      resourceType: "provider_integration",
      resourceId: `${actor.organizationId}:${data.provider}`,
      metadata: {
        provider: data.provider,
        enabled: result.isEnabled,
        endpointConfigured: Boolean(result.endpointUrl),
        credentialFields: Object.keys(data.credentials),
      },
    });
    return result;
  });

export const disableIntegrationFn = createServerFn({ method: "POST" })
  .validator(providerInputSchema)
  .handler(async ({ data }: { data: ProviderInput }) => {
    const actor = await requireRole("owner", "admin");
    const result = await disableOrganizationIntegration(
      actor.organizationId,
      actor.id,
      data.provider,
    );
    await writeAudit(actor, {
      action: "integration.disabled",
      resourceType: "provider_integration",
      resourceId: `${actor.organizationId}:${data.provider}`,
      metadata: { provider: data.provider },
    });
    return result;
  });

export const clearIntegrationFn = createServerFn({ method: "POST" })
  .validator(providerInputSchema)
  .handler(async ({ data }: { data: ProviderInput }) => {
    const actor = await requireRole("owner", "admin");
    const result = await clearOrganizationIntegration(
      actor.organizationId,
      actor.id,
      data.provider,
    );
    await writeAudit(actor, {
      action: "integration.cleared",
      resourceType: "provider_integration",
      resourceId: `${actor.organizationId}:${data.provider}`,
      metadata: { provider: data.provider },
    });
    return result;
  });

export const testIntegrationFn = createServerFn({ method: "POST" })
  .validator(providerInputSchema)
  .handler(async ({ data }: { data: ProviderInput }) => {
    const actor = await requireRole("owner", "admin");
    const result = await testOrganizationIntegration(actor.organizationId, data.provider);
    await writeAudit(actor, {
      action: "integration.tested",
      resourceType: "provider_integration",
      resourceId: `${actor.organizationId}:${data.provider}`,
      metadata: {
        provider: data.provider,
        status: result.status,
        probeAvailable: result.probeAvailable,
      },
    });
    return result;
  });

export const getIntegrationDefinitionFn = createServerFn({ method: "GET" })
  .validator(providerInputSchema)
  .handler(({ data }) => getIntegrationDefinition(data.provider as IntegrationProvider));

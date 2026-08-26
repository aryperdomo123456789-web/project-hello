import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { providerIntegrations, type IntegrationProvider } from "@/db/schema";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  maskCredentialRecord,
} from "@/server/integration-secrets.server";
import {
  getIntegrationDefinition,
  INTEGRATION_DEFINITIONS,
  type IntegrationDefinition,
} from "@/services/integration-registry.server";

export type IntegrationSummary = {
  provider: IntegrationProvider;
  label: string;
  category: IntegrationDefinition["category"];
  description: string;
  capabilities: string[];
  docsUrl: string;
  runtimeStatus: IntegrationDefinition["runtimeStatus"];
  status: "not_configured" | "configured" | "healthy" | "degraded" | "error" | "disabled";
  isEnabled: boolean;
  endpointUrl?: string;
  model?: string;
  credentialPreview?: Record<string, string>;
  credentialFields: IntegrationDefinition["fields"];
  lastCheckedAt?: string;
  lastError?: string;
};

function toIso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function buildSummary(
  definition: IntegrationDefinition,
  row: typeof providerIntegrations.$inferSelect | undefined,
): IntegrationSummary {
  let credentialPreview: Record<string, string> | undefined;
  let decryptionError: string | undefined;
  const lastCheckedAt = toIso(row?.lastCheckedAt ?? null);
  if (row?.credentialsEncrypted) {
    try {
      credentialPreview = maskCredentialRecord(
        decryptIntegrationCredentials(row.credentialsEncrypted),
      );
    } catch {
      decryptionError = "Não foi possível ler o envelope de credencial";
    }
  }
  const effectiveLastError = row?.lastError ?? decryptionError;
  return {
    provider: definition.provider,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    capabilities: definition.capabilities,
    docsUrl: definition.docsUrl,
    runtimeStatus: definition.runtimeStatus,
    status: decryptionError ? "error" : (row?.status ?? "not_configured"),
    isEnabled: row?.isEnabled ?? false,
    ...(row?.endpointUrl ? { endpointUrl: row.endpointUrl } : {}),
    ...(row?.model ? { model: row.model } : {}),
    ...(credentialPreview ? { credentialPreview } : {}),
    credentialFields: definition.fields,
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(effectiveLastError ? { lastError: effectiveLastError } : {}),
  };
}

export async function listOrganizationIntegrations(
  organizationId: string,
): Promise<IntegrationSummary[]> {
  const rows = await db
    .select()
    .from(providerIntegrations)
    .where(eq(providerIntegrations.organizationId, organizationId))
    .orderBy(asc(providerIntegrations.provider));
  const rowMap = new Map(rows.map((row) => [row.provider, row]));
  return INTEGRATION_DEFINITIONS.map((definition) =>
    buildSummary(definition, rowMap.get(definition.provider)),
  );
}

export type SaveIntegrationInput = {
  provider: IntegrationProvider;
  endpointUrl?: string | undefined;
  model?: string | undefined;
  isEnabled: boolean;
  credentials: Record<string, string>;
};

function normalizeEndpoint(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Endpoint deve usar HTTP ou HTTPS");
  if (url.username || url.password)
    throw new Error("Endpoint não pode conter usuário ou senha na URL");
  return url.toString().replace(/\/$/, "");
}

function normalizeCredentials(value: Record<string, string>): Record<string, string> {
  const entries = Object.entries(value)
    .map(([key, item]) => [key, item.trim()] as const)
    .filter(([, item]) => item.length > 0);
  if (entries.length > 12) throw new Error("Integração excede o limite de campos de credencial");
  if (entries.some(([key, item]) => !/^[A-Za-z0-9_]{1,64}$/.test(key) || item.length > 4096)) {
    throw new Error("Campo de credencial inválido ou longo demais");
  }
  return Object.fromEntries(entries);
}

export async function saveOrganizationIntegration(
  organizationId: string,
  actorUserId: string,
  input: SaveIntegrationInput,
): Promise<IntegrationSummary> {
  const definition = getIntegrationDefinition(input.provider);
  const endpointUrl = normalizeEndpoint(input.endpointUrl ?? definition.defaultEndpoint);
  const credentials = normalizeCredentials(input.credentials);
  const missing = definition.fields
    .filter((field) => field.required && !credentials[field.key])
    .map((field) => field.label);

  const [existing] = await db
    .select()
    .from(providerIntegrations)
    .where(
      and(
        eq(providerIntegrations.organizationId, organizationId),
        eq(providerIntegrations.provider, input.provider),
      ),
    )
    .limit(1);
  const encrypted = Object.keys(credentials).length
    ? encryptIntegrationCredentials(credentials)
    : existing?.credentialsEncrypted;
  if (!encrypted && missing.length > 0) {
    throw new Error(`Informe os campos obrigatórios: ${missing.join(", ")}`);
  }

  const [row] = await db
    .insert(providerIntegrations)
    .values({
      organizationId,
      provider: input.provider,
      label: definition.label,
      description: definition.description,
      credentialsEncrypted: encrypted ?? null,
      endpointUrl: endpointUrl ?? null,
      model: input.model?.trim() || null,
      capabilities: definition.capabilities,
      status: encrypted ? "configured" : "not_configured",
      isEnabled: Boolean(input.isEnabled && encrypted),
      lastCheckedAt: null,
      lastError: null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: [providerIntegrations.organizationId, providerIntegrations.provider],
      set: {
        label: definition.label,
        description: definition.description,
        ...(encrypted !== undefined ? { credentialsEncrypted: encrypted } : {}),
        endpointUrl: endpointUrl ?? null,
        model: input.model?.trim() || null,
        capabilities: definition.capabilities,
        status: encrypted ? "configured" : "not_configured",
        isEnabled: Boolean(input.isEnabled && encrypted),
        lastCheckedAt: null,
        lastError: null,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("Não foi possível salvar a integração");
  return buildSummary(definition, row);
}

export async function clearOrganizationIntegration(
  organizationId: string,
  actorUserId: string,
  provider: IntegrationProvider,
): Promise<IntegrationSummary> {
  const definition = getIntegrationDefinition(provider);
  const [row] = await db
    .update(providerIntegrations)
    .set({
      credentialsEncrypted: null,
      isEnabled: false,
      status: "not_configured",
      lastCheckedAt: null,
      lastError: null,
      updatedBy: actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerIntegrations.organizationId, organizationId),
        eq(providerIntegrations.provider, provider),
      ),
    )
    .returning();
  if (!row) throw new Error("Integração não configurada");
  return buildSummary(definition, row);
}

export async function disableOrganizationIntegration(
  organizationId: string,
  actorUserId: string,
  provider: IntegrationProvider,
): Promise<IntegrationSummary> {
  const definition = getIntegrationDefinition(provider);
  const [row] = await db
    .update(providerIntegrations)
    .set({ isEnabled: false, status: "disabled", updatedBy: actorUserId, updatedAt: new Date() })
    .where(
      and(
        eq(providerIntegrations.organizationId, organizationId),
        eq(providerIntegrations.provider, provider),
      ),
    )
    .returning();
  if (!row) throw new Error("Integração não configurada");
  return buildSummary(definition, row);
}

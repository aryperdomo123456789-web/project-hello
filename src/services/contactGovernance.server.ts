import { and, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/db/client.server";
import { contactBlacklist, contactPolicies, contacts } from "@/db/schema";

export const OPT_OUT_KEYWORDS = ["SAIR", "PARAR", "CANCELAR"] as const;

export type GovernanceBlockCode = "blacklisted" | "opted_out";

export class GovernanceBlockedError extends Error {
  readonly code: GovernanceBlockCode;
  readonly phoneE164: string;

  constructor(code: GovernanceBlockCode, phoneE164: string) {
    super(
      code === "blacklisted"
        ? "Número bloqueado pela blacklist"
        : "Contato optou por não receber mensagens",
    );
    this.name = "GovernanceBlockedError";
    this.code = code;
    this.phoneE164 = phoneE164;
  }
}

export function normalizePhoneE164(value: string, defaultCountryCode = "55") {
  const raw = value.trim();
  if (!raw) throw new Error("Telefone vazio");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits.startsWith(defaultCountryCode) && digits.length <= 11) {
    digits = `${defaultCountryCode}${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Telefone deve estar em formato E.164 válido");
  }
  return `+${digits}`;
}

export function isOptOutMessage(text: string | null | undefined) {
  const normalized = text
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return Boolean(
    normalized && OPT_OUT_KEYWORDS.includes(normalized as (typeof OPT_OUT_KEYWORDS)[number]),
  );
}

export async function isPhoneBlacklisted(organizationId: string, phone: string, now = new Date()) {
  const phoneE164 = normalizePhoneE164(phone);
  const [entry] = await db
    .select({ id: contactBlacklist.id })
    .from(contactBlacklist)
    .where(
      and(
        eq(contactBlacklist.organizationId, organizationId),
        eq(contactBlacklist.phoneE164, phoneE164),
        or(isNull(contactBlacklist.expiresAt), gt(contactBlacklist.expiresAt, now)),
      ),
    )
    .limit(1);
  return Boolean(entry);
}

async function resolveContactId(organizationId: string, phone: string, contactId?: string | null) {
  if (contactId) return contactId;
  const phoneE164 = normalizePhoneE164(phone);
  const digits = phoneE164.replace(/^\+/, "");
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        or(
          eq(contacts.phone, phone),
          eq(contacts.phone, phoneE164),
          eq(contacts.waId, digits),
          eq(contacts.waId, phoneE164),
        ),
      ),
    )
    .limit(1);
  return contact?.id ?? null;
}

export async function assertOutboundAllowed(input: {
  organizationId: string;
  recipient: string;
  contactId?: string | null;
}) {
  const phoneE164 = normalizePhoneE164(input.recipient);
  if (await isPhoneBlacklisted(input.organizationId, phoneE164)) {
    throw new GovernanceBlockedError("blacklisted", phoneE164);
  }

  const resolvedContactId = await resolveContactId(
    input.organizationId,
    input.recipient,
    input.contactId,
  );
  if (resolvedContactId) {
    const [policy] = await db
      .select({ optedOut: contactPolicies.optedOut })
      .from(contactPolicies)
      .where(
        and(
          eq(contactPolicies.organizationId, input.organizationId),
          eq(contactPolicies.contactId, resolvedContactId),
        ),
      )
      .limit(1);
    if (policy?.optedOut) throw new GovernanceBlockedError("opted_out", phoneE164);
  }
  return { allowed: true as const, phoneE164, contactId: resolvedContactId };
}

export async function markContactOptedOut(organizationId: string, contactId: string) {
  await db
    .insert(contactPolicies)
    .values({ organizationId, contactId, optedOut: true })
    .onConflictDoUpdate({
      target: [contactPolicies.organizationId, contactPolicies.contactId],
      set: { optedOut: true, updatedAt: new Date() },
    });
}

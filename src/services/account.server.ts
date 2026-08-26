import { eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { memberships, organizations, queues, users } from "@/db/schema";
import { getOrganizationPlanCatalog } from "@/services/plan-catalog.server";
import { hashPassword, type AppRole, type AuthUser } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import { getServerEnv } from "@/server/env.server";
import { consumeRateLimit } from "@/server/rate-limit.server";
import { getAppSession } from "@/server/session.server";

export type SignupPlan = "starter" | "growth" | "scale";

function slugify(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "workspace";
}

function createOrganizationSlug(name: string) {
  return `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createSelfServeAccount(input: {
  organizationName: string;
  fullName: string;
  email: string;
  password: string;
  plan: SignupPlan;
}) {
  const email = input.email.trim().toLowerCase();
  const rate = await consumeRateLimit(
    `signup:${email}`,
    getServerEnv().RATE_LIMIT_SIGNUP_PER_HOUR,
    60 * 60,
  );
  if (!rate.allowed) throw new Error("Muitas tentativas de cadastro. Tente novamente mais tarde.");

  const organizationSlug = createOrganizationSlug(input.organizationName);
  const passwordHash = await hashPassword(input.password);
  const result = await db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingUser) throw new Error("Este e-mail já possui uma conta. Use a entrada da equipe.");

    const [organization] = await tx
      .insert(organizations)
      .values({
        name: input.organizationName.trim(),
        slug: organizationSlug,
        plan: input.plan,
        billingStatus: "trialing",
        billingProvider: "none",
      })
      .returning();
    if (!organization) throw new Error("Não foi possível criar a organização");

    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        isActive: true,
      })
      .returning();
    if (!user) throw new Error("Não foi possível criar o usuário owner");

    await tx.insert(memberships).values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      availability: "online",
      status: "active",
    });

    for (const queue of [
      { name: "Comercial", slug: "comercial" },
      { name: "Suporte", slug: "suporte" },
      { name: "Financeiro", slug: "financeiro" },
    ]) {
      await tx.insert(queues).values({ organizationId: organization.id, ...queue });
    }

    return { organization, user };
  });

  await getOrganizationPlanCatalog(result.organization.id);
  const authUser: AuthUser = {
    id: result.user.id,
    email: result.user.email,
    fullName: result.user.fullName,
    organizationId: result.organization.id,
    organizationName: result.organization.name,
    role: "owner" satisfies AppRole,
  };
  const session = await getAppSession();
  await session.update({
    userId: authUser.id,
    organizationId: authUser.organizationId,
    issuedAt: Date.now(),
  });
  await writeAudit(authUser, {
    action: "account.self_serve_created",
    resourceType: "organization",
    resourceId: result.organization.id,
    metadata: { plan: input.plan },
  });

  return {
    ok: true as const,
    organizationName: authUser.organizationName,
    plan: input.plan,
  };
}

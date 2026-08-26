import { and, eq } from "drizzle-orm";
import { compare, hash } from "bcryptjs";

import { db } from "@/db/client.server";
import { memberships, organizations, users } from "@/db/schema";
import { consumeRateLimit } from "@/server/rate-limit.server";
import { getServerEnv } from "./env.server";
import { getAppSession } from "./session.server";

export type AppRole = "owner" | "admin" | "manager" | "supervisor" | "agent";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  role: AppRole;
};

async function resolveUser(
  userId: string,
  preferredOrganizationId?: string,
): Promise<AuthUser | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1);

  if (!user) return null;

  const membershipsForUser = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
      organizationName: organizations.name,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));

  const membership =
    membershipsForUser.find((item) => item.organizationId === preferredOrganizationId) ??
    membershipsForUser[0];
  if (!membership) return null;

  return {
    ...user,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    role: membership.role,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getAppSession();
  if (!session.data.userId) return null;
  return resolveUser(session.data.userId, session.data.organizationId);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}

export async function requireRole(...allowedRoles: AppRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) throw new Error("Permissão insuficiente");
  return user;
}

export async function loginUser(emailInput: string, password: string, organizationId?: string) {
  const email = emailInput.trim().toLowerCase();
  const rate = await consumeRateLimit(
    `login:${email}`,
    getServerEnv().RATE_LIMIT_LOGIN_PER_MINUTE,
    60,
  );
  if (!rate.allowed)
    return { ok: false as const, error: "Muitas tentativas. Tente novamente em instantes" };
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.isActive || !(await compare(password, user.passwordHash))) {
    return { ok: false as const, error: "E-mail ou senha inválidos" };
  }

  const currentUser = await resolveUser(user.id, organizationId);
  if (!currentUser) return { ok: false as const, error: "Usuário sem organização ativa" };

  const session = await getAppSession();
  await session.update({
    userId: currentUser.id,
    organizationId: currentUser.organizationId,
    issuedAt: Date.now(),
  });
  return { ok: true as const, user: currentUser };
}

export async function logoutUser() {
  const session = await getAppSession();
  await session.clear();
  return { ok: true as const };
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

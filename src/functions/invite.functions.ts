import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { memberships, organizationInvites, organizations, users } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { hashPassword, type AppRole } from "@/server/auth.server";
import { getAppSession } from "@/server/session.server";

const acceptSchema = z.object({
  token: z.string().min(32).max(128),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
});

export type InviteAcceptanceDTO = {
  ok: true;
  email: string;
  organizationName: string;
  role: AppRole;
};

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(acceptSchema)
  .handler(async ({ data }) => {
    const tokenHash = createHash("sha256").update(data.token).digest("hex");
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({
          id: organizationInvites.id,
          organizationId: organizationInvites.organizationId,
          email: organizationInvites.email,
          role: organizationInvites.role,
          expiresAt: organizationInvites.expiresAt,
          organizationName: organizations.name,
        })
        .from(organizationInvites)
        .innerJoin(organizations, eq(organizations.id, organizationInvites.organizationId))
        .where(
          and(eq(organizationInvites.tokenHash, tokenHash), isNull(organizationInvites.acceptedAt)),
        )
        .limit(1);
      if (!invite || invite.expiresAt <= now) throw new Error("Convite inválido ou expirado");

      const [existing] = await tx
        .select({ id: users.id, passwordHash: users.passwordHash, fullName: users.fullName })
        .from(users)
        .where(eq(users.email, invite.email))
        .limit(1);
      let userId = existing?.id;
      let fullName = data.fullName;
      if (existing) {
        if (!(await compare(data.password, existing.passwordHash)))
          throw new Error("Este e-mail já existe. Use a senha atual para aceitar o convite.");
        fullName = existing.fullName || data.fullName;
        await tx
          .update(users)
          .set({ fullName, isActive: true, updatedAt: now })
          .where(eq(users.id, existing.id));
      } else {
        const [created] = await tx
          .insert(users)
          .values({
            email: invite.email,
            passwordHash: await hashPassword(data.password),
            fullName,
          })
          .returning({ id: users.id });
        if (!created) throw new Error("Não foi possível criar o usuário");
        userId = created.id;
      }
      if (!userId) throw new Error("Usuário inválido");

      const [membership] = await tx
        .insert(memberships)
        .values({
          organizationId: invite.organizationId,
          userId,
          role: invite.role,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [memberships.organizationId, memberships.userId],
          set: { role: invite.role, status: "active" },
        })
        .returning({ userId: memberships.userId });
      if (!membership) throw new Error("Não foi possível ativar o acesso");

      const [consumed] = await tx
        .update(organizationInvites)
        .set({ acceptedAt: now })
        .where(and(eq(organizationInvites.id, invite.id), isNull(organizationInvites.acceptedAt)))
        .returning({ id: organizationInvites.id });
      if (!consumed) throw new Error("Convite já consumido");
      return { userId, ...invite, fullName };
    });

    const session = await getAppSession();
    await session.update({
      userId: result.userId,
      organizationId: result.organizationId,
      issuedAt: Date.now(),
    });
    const auditUser = {
      id: result.userId,
      email: result.email,
      fullName: result.fullName,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
      role: result.role,
    } satisfies {
      id: string;
      email: string;
      fullName: string;
      organizationId: string;
      organizationName: string;
      role: AppRole;
    };
    await writeAudit(auditUser, {
      action: "team.invite_accepted",
      resourceType: "organization_invite",
      resourceId: result.id,
      metadata: { role: result.role },
    });
    return {
      ok: true,
      email: result.email,
      organizationName: result.organizationName,
      role: result.role,
    } satisfies InviteAcceptanceDTO;
  });

import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { memberships, organizationInvites, organizations, users } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole } from "@/server/auth.server";

const memberIdSchema = z.object({ userId: z.string().uuid() });
const availabilitySchema = z.enum(["online", "away", "offline"]);
const inviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  role: z.enum(["supervisor", "agent"]).default("agent"),
});
const memberSettingsSchema = memberIdSchema.extend({
  availability: availabilitySchema,
  maxConcurrentChats: z.number().int().min(1).max(100),
});

export type TeamMemberDTO = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  availability: string;
  maxConcurrentChats: number;
};

export const listTeamMembersFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("owner", "admin", "manager", "supervisor");
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: memberships.role,
      availability: memberships.availability,
      maxConcurrentChats: memberships.maxConcurrentChats,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.organizationId, user.organizationId), eq(memberships.status, "active")),
    )
    .orderBy(asc(users.fullName));
  return rows satisfies TeamMemberDTO[];
});

export const createTeamInviteFn = createServerFn({ method: "POST" })
  .validator(inviteSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);
    const [invite] = await db
      .insert(organizationInvites)
      .values({
        organizationId: user.organizationId,
        email: data.email,
        role: data.role,
        tokenHash,
        invitedBy: user.id,
        expiresAt,
      })
      .returning({
        id: organizationInvites.id,
        email: organizationInvites.email,
        role: organizationInvites.role,
        expiresAt: organizationInvites.expiresAt,
      });
    if (!invite) throw new Error("Não foi possível criar convite");
    await writeAudit(user, {
      action: "team.invite_created",
      resourceType: "organization_invite",
      resourceId: invite.id,
      metadata: { email: data.email, role: data.role },
    });
    return {
      ...invite,
      invitePath: `/accept-invite?token=${token}`,
      expiresAt: invite.expiresAt.toISOString(),
    };
  });

export const updateTeamMemberFn = createServerFn({ method: "POST" })
  .validator(memberSettingsSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager");
    const [member] = await db
      .update(memberships)
      .set({ availability: data.availability, maxConcurrentChats: data.maxConcurrentChats })
      .where(
        and(
          eq(memberships.organizationId, actor.organizationId),
          eq(memberships.userId, data.userId),
          eq(memberships.status, "active"),
        ),
      )
      .returning({ userId: memberships.userId });
    if (!member) throw new Error("Membro não encontrado");
    await writeAudit(actor, {
      action: "team.member_settings_updated",
      resourceType: "membership",
      resourceId: data.userId,
      metadata: { availability: data.availability, maxConcurrentChats: data.maxConcurrentChats },
    });
    return { ok: true as const };
  });

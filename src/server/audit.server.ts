import { db } from "@/db/client.server";
import { auditLogs } from "@/db/schema";
import type { AuthUser } from "./auth.server";

export async function writeAudit(
  user: AuthUser | null,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  },
) {
  await db.insert(auditLogs).values({
    organizationId: user?.organizationId,
    actorUserId: user?.id,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
  });
}

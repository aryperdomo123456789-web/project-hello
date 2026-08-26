import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { channelConnections } from "@/db/schema";
import { assertLicense } from "@/services/license.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";
import { getServerEnv } from "../server/env.server";
import { requireUser } from "../server/auth.server";

const connectionNameSchema = z.object({ name: z.string().trim().min(2).max(80) });
const connectionIdSchema = z.object({ connectionId: z.string().uuid() });

export type ConnectionDTO = {
  id: string;
  name: string;
  slug: string;
  provider: string;
  providerInstanceId: string | null;
  displayPhone: string | null;
  status: string;
  connectedAt: string | null;
  lastSeenAt: string | null;
};

function toConnectionDto(connection: typeof channelConnections.$inferSelect): ConnectionDTO {
  return {
    id: connection.id,
    name: connection.name,
    slug: connection.slug,
    provider: connection.provider,
    providerInstanceId: connection.providerInstanceId,
    displayPhone: connection.displayPhone,
    status: connection.status,
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    lastSeenAt: connection.lastSeenAt?.toISOString() ?? null,
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export const listConnectionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.organizationId, user.organizationId));
  return rows.map(toConnectionDto);
});

export const createConnectionFn = createServerFn({ method: "POST" })
  .validator(connectionNameSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");

    const adapter = getWhatsAppAdapter();
    const providerInstance = await adapter.createInstance(data.name);
    const baseSlug = slugify(data.name) || `whatsapp-${Date.now()}`;
    const slug = `${baseSlug}-${providerInstance.id.slice(-6)}`;

    const [connection] = await db
      .insert(channelConnections)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        slug,
        provider: getServerEnv().WHATSAPP_PROVIDER,
        providerInstanceId: providerInstance.id,
        displayPhone: providerInstance.phone,
        status: providerInstance.status === "connected" ? "connected" : "connecting",
      })
      .returning();

    if (!connection) throw new Error("Não foi possível salvar a conexão");
    return toConnectionDto(connection);
  });

export const getConnectionQrFn = createServerFn({ method: "POST" })
  .validator(connectionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");

    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, data.connectionId),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .limit(1);

    if (!connection) throw new Error("Conexão não encontrada");
    const qr = await getWhatsAppAdapter().getQrCode(connection.providerInstanceId ?? connection.id);

    await db
      .update(channelConnections)
      .set({ status: "connecting", updatedAt: new Date() })
      .where(eq(channelConnections.id, connection.id));

    return { ...qr, connectionId: connection.id };
  });

export const disconnectConnectionFn = createServerFn({ method: "POST" })
  .validator(connectionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");

    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, data.connectionId),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .limit(1);

    if (!connection) throw new Error("Conexão não encontrada");
    await getWhatsAppAdapter().disconnectInstance(connection.providerInstanceId ?? connection.id);
    await db
      .update(channelConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(channelConnections.id, connection.id));

    return { ok: true as const };
  });

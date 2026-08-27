import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { channelConnections } from "@/db/schema";
import { assertLicense } from "@/services/license.server";
import { assertPlanCapacity } from "@/entitlements/limits.server";
import {
  createChannel as createChannelGateway,
  disconnectChannel as disconnectChannelGateway,
  getChannelStatus,
  getQrCode,
  reconnectChannel as reconnectChannelGateway,
  type ChannelGatewayChannel,
} from "@/services/magoBotChannelGateway.server";
import { getServerEnv } from "../server/env.server";
import { requireUser } from "../server/auth.server";

const connectionNameSchema = z.object({ name: z.string().trim().min(2).max(80) });
const connectionIdSchema = z.object({ connectionId: z.string().uuid() });

type ConnectionTransport = "mago_bot_api" | "legacy_provider";

export type ConnectionDTO = {
  id: string;
  name: string;
  slug: string;
  provider: string;
  transport: ConnectionTransport;
  providerInstanceId: string | null;
  apiChannelId: string | null;
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
    transport: connection.apiChannelId ? "mago_bot_api" : "legacy_provider",
    providerInstanceId: connection.providerInstanceId,
    apiChannelId: connection.apiChannelId,
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

function connectionPatch(result: ChannelGatewayChannel) {
  return {
    provider: result.provider,
    providerInstanceId: result.providerInstanceId,
    ...(result.apiTenantId !== undefined ? { apiTenantId: result.apiTenantId } : {}),
    ...(result.apiProjectId !== undefined ? { apiProjectId: result.apiProjectId } : {}),
    ...(result.apiResourceId !== undefined ? { apiResourceId: result.apiResourceId } : {}),
    ...(result.apiChannelId !== undefined ? { apiChannelId: result.apiChannelId } : {}),
    ...(result.displayPhone !== undefined ? { displayPhone: result.displayPhone } : {}),
    status: result.status,
    ...(result.status === "connected" ? { connectedAt: new Date() } : {}),
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
}

async function findConnection(connectionId: string, organizationId: string) {
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, connectionId),
        eq(channelConnections.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!connection) throw new Error("Conexão não encontrada");
  return connection;
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
    await assertPlanCapacity(user.organizationId, "connections");

    const providerChannel = await createChannelGateway(
      user.organizationId,
      data.name,
      `channel-create:${user.organizationId}:${crypto.randomUUID()}`,
    );
    const baseSlug = slugify(data.name) || `whatsapp-${Date.now()}`;
    const slug = `${baseSlug}-${providerChannel.providerInstanceId.slice(-6)}`;

    const [connection] = await db
      .insert(channelConnections)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        slug,
        provider: providerChannel.provider,
        providerInstanceId: providerChannel.providerInstanceId,
        apiTenantId: providerChannel.apiTenantId ?? null,
        apiProjectId: providerChannel.apiProjectId ?? null,
        apiResourceId: providerChannel.apiResourceId ?? null,
        apiChannelId: providerChannel.apiChannelId ?? null,
        displayPhone: providerChannel.displayPhone ?? null,
        status: providerChannel.status,
        connectedAt: providerChannel.status === "connected" ? new Date() : null,
        lastSeenAt: new Date(),
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
    const connection = await findConnection(data.connectionId, user.organizationId);
    const qr = await getQrCode(user.organizationId, connection);

    await db
      .update(channelConnections)
      .set({ status: "connecting", lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      );

    return { ...qr, connectionId: connection.id };
  });

export const getConnectionStatusFn = createServerFn({ method: "POST" })
  .validator(connectionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");
    const connection = await findConnection(data.connectionId, user.organizationId);
    const status = await getChannelStatus(user.organizationId, connection);
    const [updated] = await db
      .update(channelConnections)
      .set(connectionPatch(status))
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .returning();
    return updated ? toConnectionDto(updated) : toConnectionDto(connection);
  });

export const reconnectConnectionFn = createServerFn({ method: "POST" })
  .validator(connectionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");
    const connection = await findConnection(data.connectionId, user.organizationId);
    const result = await reconnectChannelGateway(
      user.organizationId,
      connection,
      `channel-reconnect:${connection.id}:${crypto.randomUUID()}`,
    );
    const [updated] = await db
      .update(channelConnections)
      .set(connectionPatch(result))
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .returning();
    return updated ? toConnectionDto(updated) : toConnectionDto(connection);
  });

export const disconnectConnectionFn = createServerFn({ method: "POST" })
  .validator(connectionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:connect");
    const connection = await findConnection(data.connectionId, user.organizationId);
    const result = await disconnectChannelGateway(
      user.organizationId,
      connection,
      `channel-disconnect:${connection.id}:${crypto.randomUUID()}`,
    );
    const [updated] = await db
      .update(channelConnections)
      .set(connectionPatch(result))
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .returning();

    return {
      ok: true as const,
      connection: updated ? toConnectionDto(updated) : toConnectionDto(connection),
    };
  });

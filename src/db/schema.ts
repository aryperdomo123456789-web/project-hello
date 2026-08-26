import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "manager",
  "supervisor",
  "agent",
]);

export const connectionProviderEnum = pgEnum("connection_provider", [
  "stub",
  "evolution",
  "custom",
  "meta",
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "disconnected",
  "connecting",
  "connected",
  "error",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "queued",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_internal",
  "resolved",
  "closed",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound", "system"]);

export const messageStatusEnum = pgEnum("message_status", [
  "received",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const flowStatusEnum = pgEnum("flow_status", ["draft", "published", "paused", "archived"]);

export const flowExecutionStatusEnum = pgEnum("flow_execution_status", [
  "running",
  "waiting_input",
  "waiting_timer",
  "waiting_external",
  "handoff",
  "paused_by_human",
  "completed",
  "failed",
  "cancelled",
]);

export const effectStatusEnum = pgEnum("effect_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    plan: text("plan").notNull().default("starter"),
    billingStatus: text("billing_status").notNull().default("trialing"),
    billingProvider: text("billing_provider").notNull().default("none"),
    billingCustomerRef: text("billing_customer_ref"),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).defaultNow().notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_uq").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("agent"),
    status: text("status").notNull().default("active"),
    availability: text("availability").notNull().default("offline"),
    maxConcurrentChats: integer("max_concurrent_chats").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const organizationInvites = pgTable(
  "organization_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRoleEnum("role").notNull().default("agent"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_invites_token_hash_uq").on(table.tokenHash),
    index("organization_invites_org_email_idx").on(table.organizationId, table.email),
  ],
);

export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    provider: connectionProviderEnum("provider").notNull().default("stub"),
    providerInstanceId: text("provider_instance_id"),
    displayPhone: text("display_phone"),
    status: connectionStatusEnum("status").notNull().default("disconnected"),
    credentialsEncrypted: text("credentials_encrypted"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_connections_org_slug_uq").on(table.organizationId, table.slug),
    index("channel_connections_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const queues = pgTable(
  "queues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    strategy: text("strategy").notNull().default("least_load"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    slaFirstResponseMinutes: integer("sla_first_response_minutes").notNull().default(15),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("queues_org_slug_uq").on(table.organizationId, table.slug)],
);

export const queueMembers = pgTable(
  "queue_members",
  {
    queueId: uuid("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weight: integer("weight").notNull().default(1),
    skills: jsonb("skills")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.queueId, table.userId] }),
    index("queue_members_org_user_idx").on(table.organizationId, table.userId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    waId: text("wa_id").notNull(),
    phone: text("phone"),
    name: text("name").notNull().default("Contato"),
    avatarUrl: text("avatar_url"),
    email: text("email"),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contacts_org_wa_uq").on(table.organizationId, table.waId),
    index("contacts_org_name_idx").on(table.organizationId, table.name),
  ],
);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "failed",
]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    messageTemplate: text("message_template").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    dailyLimit: integer("daily_limit").notNull().default(100),
    frequencyHours: integer("frequency_hours").notNull().default(24),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("campaigns_org_status_idx").on(table.organizationId, table.status, table.scheduledAt),
  ],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_recipients_campaign_contact_uq").on(table.campaignId, table.contactId),
    index("campaign_recipients_ready_idx").on(
      table.organizationId,
      table.status,
      table.nextEligibleAt,
    ),
  ],
);

export const contactPolicies = pgTable(
  "contact_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    optedOut: boolean("opted_out").notNull().default(false),
    quietUntil: timestamp("quiet_until", { withTimezone: true }),
    frequencyHours: integer("frequency_hours").notNull().default(24),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_policies_org_contact_uq").on(table.organizationId, table.contactId),
  ],
);

export const contactTasks = pgTable(
  "contact_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("contact_tasks_org_status_due_idx").on(table.organizationId, table.status, table.dueAt),
    index("contact_tasks_contact_idx").on(table.contactId, table.status),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => channelConnections.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    queueId: uuid("queue_id").references(() => queues.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: conversationStatusEnum("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    subject: text("subject"),
    version: integer("version").notNull().default(0),
    automationPausedAt: timestamp("automation_paused_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversations_inbox_idx").on(table.organizationId, table.status, table.lastMessageAt),
    index("conversations_connection_contact_idx").on(table.channelConnectionId, table.contactId),
    index("conversations_assignee_idx").on(table.organizationId, table.assigneeId, table.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => channelConnections.id, { onDelete: "restrict" }),
    externalId: text("external_id"),
    clientMessageId: text("client_message_id"),
    direction: messageDirectionEnum("direction").notNull(),
    status: messageStatusEnum("status").notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("messages_external_uq").on(
      table.organizationId,
      table.channelConnectionId,
      table.externalId,
    ),
    uniqueIndex("messages_client_id_uq").on(table.organizationId, table.clientMessageId),
    index("messages_conversation_time_idx").on(table.conversationId, table.sentAt),
  ],
);

export const conversionEvents = pgTable(
  "conversion_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull().default("won"),
    source: text("source").notNull().default("manual"),
    revenueCents: integer("revenue_cents").notNull().default(0),
    currency: text("currency").notNull().default("BRL"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversion_events_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("conversion_events_org_source_idx").on(
      table.organizationId,
      table.source,
      table.occurredAt,
    ),
    index("conversion_events_contact_idx").on(table.organizationId, table.contactId),
  ],
);

export type ConversionEvent = typeof conversionEvents.$inferSelect;

export const marketingSpend = pgTable(
  "marketing_spend",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("BRL"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("marketing_spend_org_period_idx").on(
      table.organizationId,
      table.periodStart,
      table.periodEnd,
    ),
    index("marketing_spend_org_source_idx").on(
      table.organizationId,
      table.source,
      table.periodStart,
    ),
  ],
);

export type MarketingSpend = typeof marketingSpend.$inferSelect;

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageRetentionDays: integer("message_retention_days").notNull().default(365),
    webhookRetentionDays: integer("webhook_retention_days").notNull().default(90),
    auditRetentionDays: integer("audit_retention_days").notNull().default(730),
    qualityRetentionDays: integer("quality_retention_days").notNull().default(730),
    sequenceRetentionDays: integer("sequence_retention_days").notNull().default(365),
    legalHold: boolean("legal_hold").notNull().default(false),
    dryRunOnly: boolean("dry_run_only").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("retention_policies_org_uq").on(table.organizationId)],
);

export type RetentionPolicy = typeof retentionPolicies.$inferSelect;

export const retentionRuns = pgTable(
  "retention_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    cutoff: jsonb("cutoff").$type<Record<string, string>>().notNull(),
    counts: jsonb("counts").$type<Record<string, number>>().notNull(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("retention_runs_idempotency_uq").on(table.idempotencyKey),
    index("retention_runs_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export type RetentionRun = typeof retentionRuns.$inferSelect;

export const conversationRatings = pgTable(
  "conversation_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    source: text("source").notNull().default("operator"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_ratings_conversation_uq").on(table.conversationId),
    index("conversation_ratings_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    channelConnectionId: uuid("channel_connection_id").references(() => channelConnections.id, {
      onDelete: "cascade",
    }),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_events_provider_external_uq").on(table.provider, table.externalEventId),
    index("webhook_events_status_idx").on(table.status, table.receivedAt),
  ],
);

export const flows = pgTable(
  "flows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("custom"),
    status: flowStatusEnum("status").notNull().default("draft"),
    draftGraph: jsonb("draft_graph")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("flows_org_slug_uq").on(table.organizationId, table.slug)],
);

export const flowVersions = pgTable(
  "flow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    editorGraph: jsonb("editor_graph").$type<Record<string, unknown>>().notNull(),
    compiledGraph: jsonb("compiled_graph").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    publishedBy: uuid("published_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flow_versions_flow_version_uq").on(table.flowId, table.version),
    uniqueIndex("flow_versions_flow_checksum_uq").on(table.flowId, table.checksum),
  ],
);

export const flowBindings = pgTable(
  "flow_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => channelConnections.id, { onDelete: "cascade" }),
    flowVersionId: uuid("flow_version_id")
      .notNull()
      .references(() => flowVersions.id, { onDelete: "restrict" }),
    trigger: text("trigger").notNull().default("conversation_started"),
    priority: integer("priority").notNull().default(100),
    active: boolean("active").notNull().default(true),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flow_bindings_one_active_uq")
      .on(table.channelConnectionId, table.trigger)
      .where(sql`${table.active} = true`),
  ],
);

export const flowExecutions = pgTable(
  "flow_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    flowVersionId: uuid("flow_version_id")
      .notNull()
      .references(() => flowVersions.id, { onDelete: "restrict" }),
    status: flowExecutionStatusEnum("status").notNull().default("running"),
    currentNodeId: text("current_node_id").notNull(),
    context: jsonb("context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lockVersion: integer("lock_version").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    waitingUntil: timestamp("waiting_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureDetail: text("failure_detail"),
  },
  (table) => [
    uniqueIndex("flow_executions_one_active_uq")
      .on(table.conversationId)
      .where(
        sql`${table.status} in ('running', 'waiting_input', 'waiting_timer', 'waiting_external', 'handoff', 'paused_by_human')`,
      ),
    index("flow_executions_waiting_idx").on(table.status, table.waitingUntil),
  ],
);

export const flowExecutionEvents = pgTable(
  "flow_execution_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => flowExecutions.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flow_execution_events_external_uq").on(table.executionId, table.externalEventId),
  ],
);

export const flowNodeRuns = pgTable(
  "flow_node_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => flowExecutions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").notNull(),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    output: jsonb("output")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("flow_node_runs_execution_node_attempt_uq").on(
      table.executionId,
      table.nodeId,
      table.attempt,
    ),
  ],
);

export const flowEffects = pgTable(
  "flow_effects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nodeRunId: uuid("node_run_id")
      .notNull()
      .references(() => flowNodeRuns.id, { onDelete: "cascade" }),
    effectType: text("effect_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: effectStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("flow_effects_idempotency_uq").on(table.idempotencyKey),
    index("flow_effects_ready_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const assignmentEvents = pgTable(
  "assignment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "set null" }),
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "set null" }),
    fromQueueId: uuid("from_queue_id").references(() => queues.id, { onDelete: "set null" }),
    toQueueId: uuid("to_queue_id").references(() => queues.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("assignment_events_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_notes_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const quickReplies = pgTable(
  "quick_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortcut: text("shortcut").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("geral"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("quick_replies_org_shortcut_uq").on(table.organizationId, table.shortcut),
    index("quick_replies_org_active_idx").on(table.organizationId, table.isActive),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_org_time_idx").on(table.organizationId, table.createdAt)],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type OrganizationInvite = typeof organizationInvites.$inferSelect;
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ContactTask = typeof contactTasks.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type ContactPolicy = typeof contactPolicies.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ConversationRating = typeof conversationRatings.$inferSelect;
export type Flow = typeof flows.$inferSelect;
export type FlowVersion = typeof flowVersions.$inferSelect;
export type FlowExecution = typeof flowExecutions.$inferSelect;
export type ConversationNote = typeof conversationNotes.$inferSelect;
export type QuickReply = typeof quickReplies.$inferSelect;

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id").references(() => flows.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull().default("manual"),
    status: text("status").notNull().default("draft"),
    contentHash: text("content_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_documents_org_status_idx").on(table.organizationId, table.status),
    uniqueIndex("knowledge_documents_org_hash_uq").on(table.organizationId, table.contentHash),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    embedding: jsonb("embedding")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_chunks_document_position_uq").on(table.documentId, table.position),
    index("knowledge_chunks_org_document_idx").on(table.organizationId, table.documentId),
  ],
);

export const internalTeamMessages = pgTable(
  "internal_team_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("internal_team_messages_org_time_idx").on(table.organizationId, table.createdAt),
    index("internal_team_messages_recipient_idx").on(table.organizationId, table.recipientUserId),
  ],
);

export type InternalTeamMessage = typeof internalTeamMessages.$inferSelect;

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    queueId: uuid("queue_id").references(() => queues.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    number: integer("number").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("outros"),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("open"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tickets_org_number_uq").on(table.organizationId, table.number),
    index("tickets_org_status_priority_idx").on(
      table.organizationId,
      table.status,
      table.priority,
      table.slaDueAt,
    ),
    index("tickets_contact_idx").on(table.organizationId, table.contactId, table.createdAt),
    index("tickets_assignee_idx").on(table.organizationId, table.assigneeId, table.status),
  ],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ticket_events_ticket_time_idx").on(table.ticketId, table.createdAt)],
);

export type Ticket = typeof tickets.$inferSelect;
export type TicketEvent = typeof ticketEvents.$inferSelect;

export const conversationQualityReviews = pgTable(
  "conversation_quality_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull().default("rules"),
    score: integer("score").notNull(),
    sentiment: text("sentiment").notNull().default("neutral"),
    intent: text("intent").notNull().default("other"),
    summary: text("summary").notNull(),
    policyViolations: jsonb("policy_violations")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    recommendations: jsonb("recommendations")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_quality_reviews_conversation_uq").on(table.conversationId),
    index("conversation_quality_reviews_org_score_idx").on(
      table.organizationId,
      table.score,
      table.createdAt,
    ),
  ],
);

export type ConversationQualityReview = typeof conversationQualityReviews.$inferSelect;

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("received"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_events_provider_external_uq").on(table.provider, table.externalEventId),
    index("billing_events_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const sequenceStatusEnum = pgEnum("sequence_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const sequenceStepTypeEnum = pgEnum("sequence_step_type", [
  "message",
  "task",
  "tag",
  "handoff",
]);

export const sequenceEnrollmentStatusEnum = pgEnum("sequence_enrollment_status", [
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: sequenceStatusEnum("status").notNull().default("draft"),
    trigger: text("trigger").notNull().default("manual"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sequences_org_status_idx").on(table.organizationId, table.status)],
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    type: sequenceStepTypeEnum("type").notNull(),
    body: text("body"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sequence_steps_sequence_position_uq").on(table.sequenceId, table.position),
    index("sequence_steps_org_sequence_idx").on(table.organizationId, table.sequenceId),
  ],
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    status: sequenceEnrollmentStatusEnum("status").notNull().default("active"),
    currentStep: integer("current_step").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    context: jsonb("context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sequence_enrollments_active_contact_uq")
      .on(table.sequenceId, table.contactId)
      .where(sql`${table.status} in ('active', 'paused')`),
    index("sequence_enrollments_ready_idx").on(table.status, table.nextRunAt),
    index("sequence_enrollments_org_contact_idx").on(table.organizationId, table.contactId),
  ],
);

export const sequenceEvents = pgTable(
  "sequence_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => sequenceSteps.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sequence_events_idempotency_uq").on(table.idempotencyKey),
    index("sequence_events_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

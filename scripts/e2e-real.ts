import postgres from "postgres";
import Redis from "ioredis";

const PRODUCTION_HOSTS = new Set(["107.150.35.226", "mago-bot.com", "www.mago-bot.com"]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatório para o E2E real`);
  return value;
}

function assertSafeDatabaseUrl(value: string) {
  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\/+/, "").toLowerCase();
  if (PRODUCTION_HOSTS.has(url.hostname))
    throw new Error("E2E recusado: DATABASE_URL aponta para host de produção");
  if (!/(test|e2e|ci)/.test(databaseName))
    throw new Error("E2E recusado: o nome do banco deve conter test, e2e ou ci");
}

function assertSafeRedisUrl(value: string) {
  const url = new URL(value);
  if (PRODUCTION_HOSTS.has(url.hostname))
    throw new Error("E2E recusado: E2E_REDIS_URL aponta para Redis de produção");
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} excedeu ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const databaseUrl = required("E2E_DATABASE_URL");
  const redisUrl = required("E2E_REDIS_URL");
  assertSafeDatabaseUrl(databaseUrl);
  assertSafeRedisUrl(redisUrl);

  const sql = postgres(databaseUrl, { max: 2, connect_timeout: 5 });
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  let organizationIds: string[] = [];

  try {
    await withTimeout(sql`select 1 as connected`, 30_000, "PostgreSQL connect");
    await withTimeout(redis.connect(), 30_000, "Redis connect");
    const redisStatus = await withTimeout(redis.ping(), 10_000, "Redis ping");
    if (redisStatus !== "PONG") throw new Error("Redis não respondeu PONG");

    const requiredTables = [
      "organizations",
      "users",
      "memberships",
      "messages",
      "provider_integrations",
    ];
    const tableRows = await withTimeout(
      sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any(${sql.array(requiredTables)})
      `,
      30_000,
      "PostgreSQL schema check",
    );
    const existing = new Set(tableRows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !existing.has(table));
    if (missing.length) throw new Error(`Tabelas ausentes: ${missing.join(", ")}`);

    console.log(JSON.stringify({ postgres: "ok", redis: "ok", tables: requiredTables }, null, 2));

    if (process.env["E2E_ALLOW_MUTATIONS"] !== "true") {
      console.log(
        "E2E read-only concluído; defina E2E_ALLOW_MUTATIONS=true para o teste reversível de isolamento",
      );
      return;
    }

    const marker = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const organizations = await withTimeout(
      sql<{ id: string; slug: string }[]>`
        insert into organizations (name, slug, status, plan, billing_status, billing_provider)
        values
          (${`E2E A ${marker}`}, ${`${marker}-a`}, 'active', 'starter', 'trialing', 'none'),
          (${`E2E B ${marker}`}, ${`${marker}-b`}, 'active', 'starter', 'trialing', 'none')
        returning id, slug
      `,
      30_000,
      "PostgreSQL tenant setup",
    );
    organizationIds = organizations.map((organization) => organization.id);
    const [tenantA, tenantB] = organizations;
    if (!tenantA || !tenantB) throw new Error("Não foi possível criar tenants E2E");

    const visibleToA = await withTimeout(
      sql<{ id: string }[]>`
        select id
        from organizations
        where id = ${tenantA.id}
          and slug = ${tenantA.slug}
      `,
      30_000,
      "PostgreSQL tenant A check",
    );
    const visibleToB = await withTimeout(
      sql<{ id: string }[]>`
        select id
        from organizations
        where id = ${tenantB.id}
          and slug = ${tenantB.slug}
      `,
      30_000,
      "PostgreSQL tenant B check",
    );
    if (visibleToA.length !== 1 || visibleToB.length !== 1)
      throw new Error("Falha no isolamento básico entre organizações");

    const crossTenantAttempt = await withTimeout(
      sql<{ id: string }[]>`
        select id
        from organizations
        where id = ${tenantA.id}
          and slug = ${tenantB.slug}
      `,
      30_000,
      "PostgreSQL cross-tenant check",
    );
    if (crossTenantAttempt.length !== 0)
      throw new Error("Falha: filtro cross-tenant retornou dados");

    console.log(
      JSON.stringify({ postgres: "ok", redis: "ok", crossTenantIsolation: "ok" }, null, 2),
    );
  } finally {
    if (organizationIds.length) {
      await withTimeout(
        sql`delete from organizations where id = any(${sql.array(organizationIds)})`,
        30_000,
        "PostgreSQL E2E cleanup",
      ).catch(() => undefined);
    }
    redis.disconnect();
    await withTimeout(sql.end({ timeout: 5 }), 10_000, "PostgreSQL close").catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E falhou");
    process.exit(1);
  });

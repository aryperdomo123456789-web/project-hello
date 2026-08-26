import "dotenv/config";
import { eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { hashPassword } from "@/server/auth.server";
import { memberships, organizations, queues, users } from "@/db/schema";

const orgName = process.env["BOOTSTRAP_ORG_NAME"] ?? "Mago Bot";
const orgSlug = (process.env["BOOTSTRAP_ORG_SLUG"] ?? "mago-bot").toLowerCase();
const adminEmail = (process.env["BOOTSTRAP_ADMIN_EMAIL"] ?? "admin@mago-bot.com").toLowerCase();
const adminPassword = process.env["BOOTSTRAP_ADMIN_PASSWORD"];
const adminName = process.env["BOOTSTRAP_ADMIN_NAME"] ?? "Administrador";

if (!adminPassword || adminPassword.length < 12) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres");
}

async function main() {
  const existingOrganization = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  const organization =
    existingOrganization[0] ??
    (await db.insert(organizations).values({ name: orgName, slug: orgSlug }).returning())[0];

  if (!organization) throw new Error("Não foi possível criar a organização");

  const existingUser = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  const user =
    existingUser[0] ??
    (
      await db
        .insert(users)
        .values({
          email: adminEmail,
          passwordHash: await hashPassword(adminPassword),
          fullName: adminName,
        })
        .returning()
    )[0];

  if (!user) throw new Error("Não foi possível criar o administrador");

  await db
    .insert(memberships)
    .values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      availability: "online",
    })
    .onConflictDoNothing();

  for (const queue of [
    { name: "Comercial", slug: "comercial" },
    { name: "Suporte", slug: "suporte" },
    { name: "Financeiro", slug: "financeiro" },
  ]) {
    await db
      .insert(queues)
      .values({ organizationId: organization.id, ...queue })
      .onConflictDoNothing();
  }

  console.log(JSON.stringify({ organizationId: organization.id, adminEmail, queues: 3 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://mago_bot:mago_bot@127.0.0.1:5432/mago_bot",
  },
  strict: true,
  verbose: true,
});

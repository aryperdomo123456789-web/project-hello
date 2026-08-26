import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";
import { getServerEnv } from "@/server/env.server";

let sqlClient: ReturnType<typeof postgres> | undefined;

function getSqlClient() {
  if (!sqlClient) {
    const env = getServerEnv();
    const options = {
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
      prepare: false,
      ...(env.DATABASE_SSL === "true" ? { ssl: "require" as const } : {}),
    };
    sqlClient = postgres(env.DATABASE_URL, options);
  }
  return sqlClient;
}

export const db = drizzle(getSqlClient(), { schema });
export { getSqlClient };

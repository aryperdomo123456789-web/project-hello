import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { getServerEnv } from "@/server/env.server";
import { getRedisConnection } from "@/queue/redis.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const checks = {
          database: false,
          redis: false,
        };
        try {
          await db.execute(sql`select 1`);
          checks.database = true;
        } catch {
          // O estado detalhado não sai para a internet.
        }
        try {
          const result = await Promise.race([
            getRedisConnection().ping(),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Redis timeout")), 1_500),
            ),
          ]);
          checks.redis = result === "PONG";
        } catch {
          // Redis indisponível deixa o worker degradado, mas não revela credenciais.
        }
        const ok = checks.database && checks.redis;
        return Response.json(
          {
            ok,
            service: "mago-bot",
            environment: getServerEnv().NODE_ENV,
            checks,
            timestamp: new Date().toISOString(),
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});

import IORedis from "ioredis";

import { getServerEnv } from "@/server/env.server";

let connection: IORedis | undefined;

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(getServerEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return connection;
}

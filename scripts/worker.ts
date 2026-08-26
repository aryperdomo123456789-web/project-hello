import "dotenv/config";

import { createBackgroundWorker } from "@/queue/worker.server";

const worker = createBackgroundWorker();
const once = process.argv.includes("--once");
let settled = false;

worker.on("completed", (job) => {
  console.info(`[worker] job ${job.id} concluído`);
  if (once && !settled) {
    settled = true;
    void worker.close().then(() => process.exit(0));
  }
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "desconhecido"} falhou: ${error.message}`);
  if (once && !settled) {
    settled = true;
    void worker.close().then(() => process.exit(1));
  }
});

async function shutdown(signal: string) {
  console.info(`[worker] encerrando por ${signal}`);
  await worker.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.info(`[worker] Mago Bot background worker ativo${once ? " (once)" : ""}`);

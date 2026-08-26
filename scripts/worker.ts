import "dotenv/config";

import { createBackgroundWorker } from "@/queue/worker.server";
import { runReadySequenceEnrollments } from "@/queue/sequence-worker.server";

const worker = createBackgroundWorker();
const sequenceScheduler = setInterval(() => {
  void runReadySequenceEnrollments().catch((error) => {
    console.error("[sequence-worker] scheduler error", error);
  });
}, 30_000);
sequenceScheduler.unref();
void runReadySequenceEnrollments().catch((error) => {
  console.error("[sequence-worker] initial run error", error);
});
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
  clearInterval(sequenceScheduler);
  await worker.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.info(`[worker] Mago Bot background worker ativo${once ? " (once)" : ""}`);

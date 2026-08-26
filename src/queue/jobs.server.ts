import { Queue } from "bullmq";

import { getRedisConnection } from "./redis.server";

export const MAGO_QUEUE_NAME = "mago-bot-background";

export type FlowEffectJob = {
  kind: "flow_effect";
  effectId: string;
};

let queue: Queue<FlowEffectJob> | undefined;

function getQueue() {
  if (!queue) {
    queue = new Queue<FlowEffectJob>(MAGO_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 6,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
  }
  return queue;
}

export async function enqueueFlowEffect(effectId: string) {
  return getQueue().add("flow-effect", { kind: "flow_effect", effectId }, { jobId: effectId });
}

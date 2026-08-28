export const CAMPAIGN_BATCH_SIZE = 25;
export const CAMPAIGN_MAX_ATTEMPTS = 3;

export type CampaignContactPolicy = {
  optedOut: boolean;
  quietUntil?: Date | null | undefined;
  lastContactAt?: Date | null | undefined;
  frequencyHours: number;
};

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Horário de campanha inválido: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Horário de campanha inválido: ${value}`);
  return hour * 60 + minute;
}

export function campaignIdempotencyKey(campaignId: string, recipientId: string, attempt: number) {
  return `campaign:${campaignId}:${recipientId}:${attempt}`;
}

export function renderCampaignMessage(template: string, name: string, phone: string) {
  return template.replaceAll("{{name}}", name).replaceAll("{{phone}}", phone);
}

export function splitCampaignBatch<T>(items: T[], batchSize = CAMPAIGN_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Tamanho de lote inválido");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

export function canConsumeCampaignRateLimit(currentCount: number, limitPerMinute: number) {
  return Number.isFinite(currentCount) && currentCount >= 1 && currentCount <= limitPerMinute;
}

export function isWithinCampaignWindow(
  now: Date,
  start: string,
  end: string,
  timeZone: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;
  const windowStart = parseClock(start);
  const windowEnd = parseClock(end);
  if (windowStart === windowEnd) return true;
  if (windowStart < windowEnd) return current >= windowStart && current < windowEnd;
  return current >= windowStart || current < windowEnd;
}

export function shouldDeferCampaignContact(
  now: Date,
  policy: CampaignContactPolicy | null | undefined,
  blacklisted = false,
): {
  defer: boolean;
  reason?: "blacklisted" | "opted_out" | "quiet_until" | "frequency";
  nextEligibleAt?: Date;
} {
  if (blacklisted) return { defer: true, reason: "blacklisted" };
  if (policy?.optedOut) return { defer: true, reason: "opted_out" };
  if (policy?.quietUntil && policy.quietUntil > now) {
    return { defer: true, reason: "quiet_until", nextEligibleAt: policy.quietUntil };
  }
  if (policy?.lastContactAt) {
    const frequencyHours = Math.max(1, policy.frequencyHours || 24);
    const nextEligibleAt = new Date(
      policy.lastContactAt.getTime() + frequencyHours * 60 * 60 * 1000,
    );
    if (nextEligibleAt > now) return { defer: true, reason: "frequency", nextEligibleAt };
  }
  return { defer: false };
}

export function campaignRetryDelayMs(attempt: number) {
  return Math.min(15 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

export function campaignRateLimitRetryDelayMs(now = new Date()) {
  return Math.max(1_000, 60_000 - (now.getTime() % 60_000) + 500);
}

export function campaignDailyLimitRetryDelayMs(now = new Date()) {
  const nextDay = new Date(now);
  nextDay.setUTCHours(24, 0, 0, 500);
  return Math.max(60_000, nextDay.getTime() - now.getTime());
}

export function campaignWindowRetryDelayMs(now: Date, timeZone: string, start: string) {
  const targetMinutes = parseClock(start);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const currentMinutes = (get("hour") % 24) * 60 + get("minute");
  const days = currentMinutes < targetMinutes ? 0 : 1;
  const currentUtc = now.getTime();
  const estimatedLocalTarget = new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day") + days,
      Math.floor(targetMinutes / 60),
      targetMinutes % 60,
    ),
  );
  return Math.max(60_000, estimatedLocalTarget.getTime() - currentUtc);
}

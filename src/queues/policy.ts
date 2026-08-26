export type QueueStrategy = "least_load" | "round_robin" | "skill" | "customer_history";

export type BusinessHours = {
  timezone: string;
  weekdays: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 0, { start: string; end: string }>>;
};

export type QueueAgent = {
  userId: string;
  load: number;
  maxConcurrentChats: number;
  online: boolean;
  skills: string[];
};

export type SlaState = "within_sla" | "warning" | "breached";

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return null;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isWithinBusinessHours(date: Date, hours: BusinessHours) {
  const slot = hours.weekdays[date.getDay() as keyof BusinessHours["weekdays"]];
  if (!slot) return false;
  const start = minutesFromTime(slot.start);
  const end = minutesFromTime(slot.end);
  if (start === null || end === null || start === end) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function chooseQueueAgent(
  agents: QueueAgent[],
  strategy: QueueStrategy = "least_load",
  requiredSkill?: string,
  preferredUserId?: string,
) {
  const eligible = agents.filter((agent) => agent.online && agent.load < agent.maxConcurrentChats);
  if (eligible.length === 0) return null;

  if (strategy === "skill" && requiredSkill) {
    const skilled = eligible.filter((agent) => agent.skills.includes(requiredSkill));
    return skilled.sort((left, right) => left.load - right.load)[0] ?? null;
  }

  if (strategy === "customer_history" && preferredUserId) {
    const preferred = eligible.find((agent) => agent.userId === preferredUserId);
    if (preferred) return preferred;
  }

  if (strategy === "round_robin")
    return [...eligible].sort((left, right) => left.load - right.load)[0] ?? null;
  return (
    [...eligible].sort(
      (left, right) => left.load - right.load || left.userId.localeCompare(right.userId),
    )[0] ?? null
  );
}

export function calculateSlaState(waitingMinutes: number, firstResponseLimitMinutes: number) {
  if (!Number.isFinite(waitingMinutes) || !Number.isFinite(firstResponseLimitMinutes)) {
    return "within_sla" as const;
  }
  if (waitingMinutes >= firstResponseLimitMinutes) return "breached" as const;
  if (waitingMinutes >= firstResponseLimitMinutes * 0.8) return "warning" as const;
  return "within_sla" as const;
}

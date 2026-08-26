export type PlanId = "starter" | "growth" | "scale";

export type PlanLimits = {
  connections: number;
  agents: number;
  monthlyMessages: number;
  activeFlows: number;
  retentionDays: number;
};

export const PLAN_CATALOG: Record<
  PlanId,
  { name: string; description: string; limits: PlanLimits; features: string[] }
> = {
  starter: {
    name: "Starter",
    description: "Para validar o atendimento com uma equipe enxuta.",
    limits: { connections: 2, agents: 3, monthlyMessages: 5000, activeFlows: 5, retentionDays: 30 },
    features: ["Inbox única", "Filas básicas", "Especialistas por número", "Relatórios essenciais"],
  },
  growth: {
    name: "Growth",
    description: "Para equipes que precisam de automação e supervisão.",
    limits: {
      connections: 10,
      agents: 20,
      monthlyMessages: 50000,
      activeFlows: 30,
      retentionDays: 180,
    },
    features: [
      "Tudo do Starter",
      "SLA e distribuição por skill",
      "Notas e respostas rápidas",
      "Auditoria e métricas",
    ],
  },
  scale: {
    name: "Scale",
    description: "Para operações multiunidade com governança e alto volume.",
    limits: {
      connections: 50,
      agents: 100,
      monthlyMessages: 500000,
      activeFlows: 200,
      retentionDays: 730,
    },
    features: ["Tudo do Growth", "Workers e retries", "Governança avançada", "Suporte prioritário"],
  },
};

export function getPlanCatalog(plan: string | null | undefined) {
  const planId: PlanId = plan === "growth" || plan === "scale" ? plan : "starter";
  return { id: planId, ...PLAN_CATALOG[planId] };
}

export function usageRatio(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(1, Math.max(0, used / limit));
}

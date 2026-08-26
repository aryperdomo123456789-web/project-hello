import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Cpu,
  CreditCard,
  Layers3,
  Plug,
  ShieldCheck,
  Users,
} from "lucide-react";

import { getBillingSummaryFn } from "@/functions/billing.functions";
import { getAiBudgetSummaryFn, updateAiBudgetFn } from "@/functions/ai-usage.functions";
import type { AiBudgetSummary } from "@/services/aiUsage.server";
import { listIntegrationsFn, type IntegrationSummaryDTO } from "@/functions/integrations.functions";
import { getWorkspacePlanFn, type WorkspacePlanDTO } from "@/functions/organization.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export type OwnerDestination =
  "Configurações" | "Integrações" | "Saúde" | "Equipe" | "Relatórios" | "Conexões";

export function OwnerControlCenter({
  onNavigate,
}: {
  onNavigate: (tab: OwnerDestination) => void;
}) {
  const getWorkspacePlan = useServerFn(getWorkspacePlanFn);
  const getBillingSummary = useServerFn(getBillingSummaryFn);
  const getAiUsage = useServerFn(getAiBudgetSummaryFn);
  const updateAiBudget = useServerFn(updateAiBudgetFn);
  const listIntegrations = useServerFn(listIntegrationsFn);
  const [plan, setPlan] = useState<WorkspacePlanDTO | null>(null);
  const [billing, setBilling] = useState<Awaited<ReturnType<typeof getBillingSummaryFn>> | null>(
    null,
  );
  const [aiUsage, setAiUsage] = useState<AiBudgetSummary | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextPlan, nextBilling, nextAiUsage, nextIntegrations] = await Promise.all([
        getWorkspacePlan(),
        getBillingSummary(),
        getAiUsage(),
        listIntegrations(),
      ]);
      setPlan(nextPlan);
      setBilling(nextBilling);
      setAiUsage(nextAiUsage);
      setBudgetInput((nextAiUsage.monthlyBudgetCents / 100).toFixed(2));
      setIntegrations(nextIntegrations);
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar a central do proprietário.");
      captureDiagnostic(cause, {
        source: "async",
        component: "OwnerControlCenter",
        payload: { operation: "load_owner_control_center" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [getAiUsage, getBillingSummary, getWorkspacePlan, listIntegrations]);

  async function handleBudgetSave() {
    const amount = Number(budgetInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Informe um teto mensal válido em reais.");
      return;
    }
    try {
      const next = await updateAiBudget({ data: { monthlyBudgetCents: Math.round(amount * 100) } });
      setAiUsage(next);
      setBudgetInput((next.monthlyBudgetCents / 100).toFixed(2));
      setError(null);
    } catch (cause) {
      setError("Não foi possível atualizar o teto mensal de IA.");
      captureDiagnostic(cause, {
        source: "async",
        component: "OwnerControlCenter",
        payload: { operation: "update_ai_budget" },
        recoverable: true,
      });
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-full animate-pulse bg-slate-50 p-8 text-sm text-slate-400">
        Carregando governança...
      </div>
    );
  }

  if (error || !plan || !billing) {
    return (
      <div className="h-full bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p>{error ?? "Dados de governança indisponíveis."}</p>
          <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const configured = integrations.filter((item) => item.status !== "not_configured").length;
  const healthy = integrations.filter((item) => item.status === "healthy").length;
  const trialLabel = billing.isTrialActive
    ? `Trial ativo · ${billing.daysRemaining} dias restantes`
    : `Billing · ${billing.billingStatus}`;

  const actions: Array<{
    label: string;
    description: string;
    destination: OwnerDestination;
    icon: typeof Plug;
    tone: string;
  }> = [
    {
      label: "Planos, billing e retenção",
      description: "Editar catálogo, acompanhar trial e executar dry-run de retenção.",
      destination: "Configurações",
      icon: CreditCard,
      tone: "text-cyan-700 bg-cyan-50",
    },
    {
      label: "Central de APIs",
      description: `${configured} configuradas · ${healthy} saudáveis`,
      destination: "Integrações",
      icon: Plug,
      tone: "text-violet-700 bg-violet-50",
    },
    {
      label: "Equipe e permissões",
      description: "Convites, papéis, filas e capacidade operacional.",
      destination: "Equipe",
      icon: Users,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Saúde e incidentes",
      description: "Monitorar web, worker, Redis, banco, jobs e canais.",
      destination: "Saúde",
      icon: Activity,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Relatórios e ROI",
      description: "QA, conversão, receita informada, custo e atribuição.",
      destination: "Relatórios",
      icon: BarChart3,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      label: "Canais conectados",
      description: `${plan.usage.connections} números no workspace`,
      destination: "Conexões",
      icon: Layers3,
      tone: "text-rose-700 bg-rose-50",
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                Área exclusiva do owner
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Central de governança</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Controle a operação inteira de {plan.organizationName} com permissões, integrações,
                custos, saúde e auditoria no mesmo lugar.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-cyan-200">
              <ShieldCheck className="h-7 w-7" />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold">
            <span className="rounded-full bg-white/10 px-3 py-2">Plano {plan.planName}</span>
            <span className="rounded-full bg-white/10 px-3 py-2">{trialLabel}</span>
            <span className="rounded-full bg-emerald-400/15 px-3 py-2 text-emerald-200">
              Ambiente protegido
            </span>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Bot className="h-4 w-4" />}
            value={plan.usage.activeFlows}
            label="Fluxos publicados"
          />
          <StatCard icon={<Plug className="h-4 w-4" />} value={healthy} label="APIs saudáveis" />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            value={plan.usage.agents}
            label="Membros ativos"
          />
        </div>

        {aiUsage && (
          <section className="rounded-3xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
                  Governança de IA
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Consumo deste mês</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Chamadas e tokens reais do workspace; custo é estimado apenas para modelos com
                  tarifa conhecida.
                </p>
              </div>
              <Cpu className="h-6 w-6 text-violet-700" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <UsageStat value={aiUsage.calls} label="Chamadas" />
              <UsageStat value={aiUsage.inputTokens + aiUsage.outputTokens} label="Tokens" />
              <UsageStat
                value={`R$ ${(aiUsage.usedCents / 100).toFixed(2)}`}
                label="Custo estimado"
              />
              <UsageStat
                value={
                  aiUsage.remainingCents === null
                    ? "Sem teto"
                    : `R$ ${(aiUsage.remainingCents / 100).toFixed(2)}`
                }
                label="Saldo do teto"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-violet-200 bg-white/60 p-4">
              <label className="min-w-56 flex-1 text-xs font-bold text-slate-700">
                Teto mensal de IA (R$)
                <input
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                  placeholder="0,00 = sem teto"
                  aria-label="Teto mensal de IA em reais"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleBudgetSave()}
                className="rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-violet-800"
              >
                Salvar teto
              </button>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Ações administrativas
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                Tudo que o owner precisa controlar
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              Todas as mutações passam por RBAC e auditoria
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onNavigate(action.destination)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
                >
                  <span className={`rounded-xl p-3 ${action.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{action.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {action.description}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-cyan-600" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function UsageStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-white/70 p-4">
      <p className="text-lg font-black tabular-nums text-slate-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">{label}</p>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="inline-flex rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</span>
      <p className="mt-3 text-2xl font-black tabular-nums text-slate-900">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

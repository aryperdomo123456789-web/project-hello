import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, CreditCard, Rocket, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getWorkspacePlanFn, type WorkspacePlanDTO } from "@/functions/organization.functions";
import { captureDiagnostic } from "@/lib/diagnostics";
import { usageRatio } from "@/entitlements/plans";

type OnboardingTab = "Conexões" | "Automações" | "Laboratório" | "Equipe";

export function PlanOverview({ onNavigate }: { onNavigate?: (tab: OnboardingTab) => void }) {
  const getWorkspacePlan = useServerFn(getWorkspacePlanFn);
  const [data, setData] = useState<WorkspacePlanDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getWorkspacePlan());
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar o plano da organização");
      captureDiagnostic(cause, {
        source: "async",
        component: "PlanOverview",
        payload: { operation: "load_workspace_plan" },
        recoverable: true,
      });
    }
  }, [getWorkspacePlan]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="m-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="m-8 animate-pulse rounded-xl border bg-white p-8 text-sm text-slate-400">
        Carregando configuração da organização...
      </div>
    );
  }

  const meters = [
    { label: "Números", used: data.usage.connections, limit: data.limits.connections },
    { label: "Agentes", used: data.usage.agents, limit: data.limits.agents },
    { label: "Fluxos publicados", used: data.usage.activeFlows, limit: data.limits.activeFlows },
  ];
  const onboardingSteps: Array<{
    label: string;
    description: string;
    tab: OnboardingTab;
    done: boolean;
  }> = [
    {
      label: "Conectar um número",
      description: "Crie ou conecte uma entrada de atendimento.",
      tab: "Conexões",
      done: data.usage.connections > 0,
    },
    {
      label: "Publicar um especialista",
      description: "Escolha vendas, suporte, financeiro ou outro fluxo.",
      tab: "Automações",
      done: data.usage.activeFlows > 0,
    },
    {
      label: "Testar a jornada",
      description: "Rode o laboratório antes do canal real.",
      tab: "Laboratório",
      done: false,
    },
    {
      label: "Preparar a equipe",
      description: "Convide agentes e configure a operação.",
      tab: "Equipe",
      done: data.usage.agents > 1,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Onboarding e governança
          </p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">{data.organizationName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ative a operação por etapas e acompanhe o uso antes de aumentar a capacidade.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                  Plano atual
                </p>
                <h3 className="mt-2 text-3xl font-bold">{data.planName}</h3>
                <p className="mt-2 text-sm text-slate-300">{data.description}</p>
              </div>
              <Rocket className="h-7 w-7 text-cyan-300" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {meters.map((meter) => (
                <UsageMeter key={meter.label} {...meter} dark />
              ))}
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900">Ativação recomendada</h3>
            </div>
            <ol className="mt-5 space-y-3 text-sm text-slate-600">
              {onboardingSteps.map((step, index) => (
                <li key={step.label}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.(step.tab)}
                    className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold text-slate-400">
                        {index + 1}
                      </span>
                    )}
                    <span className="flex-1">
                      <strong
                        className={step.done ? "text-emerald-700 line-through" : "text-slate-900"}
                      >
                        {step.label}
                      </strong>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {step.description}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Capacidade contratada</h3>
              <p className="mt-1 text-xs text-slate-500">
                Os limites são avaliados no servidor por organização.
              </p>
            </div>
            <CreditCard className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {meters.map((meter) => (
              <UsageMeter key={meter.label} {...meter} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Incluído no plano</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.features.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full bg-emerald-50 p-1 text-emerald-600">
                  <Check className="h-3 w-3" />
                </span>
                {feature}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  dark = false,
}: {
  label: string;
  used: number;
  limit: number;
  dark?: boolean;
}) {
  const ratio = usageRatio(used, limit);
  return (
    <div className={dark ? "rounded-xl bg-white/10 p-3" : "rounded-xl border bg-slate-50 p-4"}>
      <div className="flex items-center justify-between text-xs">
        <span className={dark ? "text-slate-300" : "text-slate-500"}>{label}</span>
        <strong className={dark ? "text-white" : "text-slate-900"}>
          {used}/{limit}
        </strong>
      </div>
      <div
        className={
          dark
            ? "mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
            : "mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
        }
      >
        <div
          className={`h-full rounded-full ${ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, CreditCard, Rocket, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getWorkspacePlanFn, type WorkspacePlanDTO } from "@/functions/organization.functions";
import {
  createMercadoPagoCheckoutFn,
  getBillingSummaryFn,
  setCancelAtPeriodEndFn,
} from "@/functions/billing.functions";
import {
  getLatestRetentionRunFn,
  getRetentionPolicyFn,
  runRetentionDryRunFn,
  updateRetentionPolicyFn,
  type RetentionPolicyDTO,
} from "@/functions/retention.functions";
import { captureDiagnostic } from "@/lib/diagnostics";
import { usageRatio } from "@/entitlements/plans";
import { PlanCatalogEditor } from "@/components/settings/PlanCatalogEditor";

type OnboardingTab = "Conexões" | "Automações" | "Laboratório" | "Equipe";

export function PlanOverview({ onNavigate }: { onNavigate?: (tab: OnboardingTab) => void }) {
  const getWorkspacePlan = useServerFn(getWorkspacePlanFn);
  const getBillingSummary = useServerFn(getBillingSummaryFn);
  const setCancelAtPeriodEnd = useServerFn(setCancelAtPeriodEndFn);
  const createMercadoPagoCheckout = useServerFn(createMercadoPagoCheckoutFn);
  const getRetentionPolicy = useServerFn(getRetentionPolicyFn);
  const updateRetentionPolicy = useServerFn(updateRetentionPolicyFn);
  const runRetentionDryRun = useServerFn(runRetentionDryRunFn);
  const getLatestRetentionRun = useServerFn(getLatestRetentionRunFn);
  const [data, setData] = useState<WorkspacePlanDTO | null>(null);
  const [billing, setBilling] = useState<Awaited<ReturnType<typeof getBillingSummaryFn>> | null>(
    null,
  );
  const [billingAction, setBillingAction] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retention, setRetention] = useState<RetentionPolicyDTO | null>(null);
  const [retentionRun, setRetentionRun] =
    useState<Awaited<ReturnType<typeof getLatestRetentionRunFn>>>(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [plan, billingSummary, retentionPolicy, latestRetentionRun] = await Promise.all([
        getWorkspacePlan(),
        getBillingSummary(),
        getRetentionPolicy(),
        getLatestRetentionRun(),
      ]);
      setData(plan);
      setBilling(billingSummary);
      setRetention(retentionPolicy);
      setRetentionRun(latestRetentionRun);
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
  }, [getBillingSummary, getLatestRetentionRun, getRetentionPolicy, getWorkspacePlan]);

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
      done: data.usage.testedRuns > 0,
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

        {billing && (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                Assinatura
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {billing.isTrialActive
                  ? `Trial ativo · ${billing.daysRemaining} dias restantes`
                  : `Status: ${billing.billingStatus}`}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {billing.isTrialActive
                  ? `Seu trial termina em ${new Date(billing.trialEndsAt).toLocaleDateString("pt-BR")}.`
                  : billing.cancelAtPeriodEnd
                    ? "Cancelamento programado para o fim do ciclo."
                    : "A assinatura é controlada pelo provedor de billing configurado."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checkoutBusy}
                onClick={async () => {
                  setCheckoutBusy(true);
                  try {
                    const checkout = await createMercadoPagoCheckout({
                      data: { plan: billing.plan },
                    });
                    if (checkout.initPoint) window.location.assign(checkout.initPoint);
                    else setError("Mercado Pago não retornou o link de checkout");
                  } catch (cause) {
                    setError(
                      "Não foi possível abrir o Checkout Mercado Pago. Verifique configuração e preços do sandbox.",
                    );
                    captureDiagnostic(cause, {
                      source: "async",
                      component: "PlanOverview",
                      payload: { operation: "create_mercadopago_checkout", plan: billing.plan },
                      recoverable: true,
                    });
                  } finally {
                    setCheckoutBusy(false);
                  }
                }}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                {checkoutBusy ? "Abrindo..." : "Abrir checkout de teste"}
              </button>
              <button
                type="button"
                disabled={billingAction}
                onClick={async () => {
                  setBillingAction(true);
                  try {
                    const next = await setCancelAtPeriodEnd({
                      data: { cancel: !billing.cancelAtPeriodEnd },
                    });
                    setBilling((current) =>
                      current ? { ...current, cancelAtPeriodEnd: next.cancelAtPeriodEnd } : current,
                    );
                  } catch (cause) {
                    captureDiagnostic(cause, {
                      source: "async",
                      component: "PlanOverview",
                      payload: { operation: "toggle_cancel_at_period_end" },
                      recoverable: true,
                    });
                    setError("Não foi possível atualizar a assinatura");
                  } finally {
                    setBillingAction(false);
                  }
                }}
                className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
              >
                {billingAction
                  ? "Salvando"
                  : billing.cancelAtPeriodEnd
                    ? "Reverter cancelamento"
                    : "Programar cancelamento"}
              </button>
            </div>
          </section>
        )}

        {retention && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Privacidade e governança
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Retenção de dados</h3>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  Pisos e teto são aplicados no servidor. A limpeza continua bloqueada em dry-run
                  até backup e revisão operacional.
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <form
              className="mt-5 grid gap-4 md:grid-cols-5"
              onSubmit={async (event) => {
                event.preventDefault();
                setRetentionBusy(true);
                setRetentionMessage(null);
                try {
                  const saved = await updateRetentionPolicy({ data: retention });
                  setRetention(saved);
                  setRetentionMessage("Política salva com auditoria registrada.");
                } catch (cause) {
                  setRetentionMessage("Apenas owner/admin pode salvar esta política.");
                  captureDiagnostic(cause, {
                    source: "async",
                    component: "PlanOverview",
                    payload: { operation: "update_retention_policy" },
                    recoverable: true,
                  });
                } finally {
                  setRetentionBusy(false);
                }
              }}
            >
              {(
                [
                  "messageRetentionDays",
                  "webhookRetentionDays",
                  "auditRetentionDays",
                  "qualityRetentionDays",
                  "sequenceRetentionDays",
                ] as const
              ).map((field) => (
                <label key={field} className="text-xs font-semibold text-slate-600">
                  {field === "messageRetentionDays"
                    ? "Mensagens"
                    : field === "webhookRetentionDays"
                      ? "Webhooks"
                      : field === "auditRetentionDays"
                        ? "Auditoria"
                        : field === "qualityRetentionDays"
                          ? "QA"
                          : "Sequências"}
                  <input
                    type="number"
                    min={
                      field === "auditRetentionDays" || field === "qualityRetentionDays" ? 180 : 30
                    }
                    max={3650}
                    value={retention[field]}
                    onChange={(event) =>
                      setRetention((current) =>
                        current ? { ...current, [field]: Number(event.target.value) } : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              ))}
              <div className="flex flex-wrap items-end gap-3 md:col-span-5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={retention.legalHold}
                    onChange={(event) =>
                      setRetention((current) =>
                        current ? { ...current, legalHold: event.target.checked } : current,
                      )
                    }
                  />{" "}
                  Legal hold
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={retention.dryRunOnly}
                    onChange={(event) =>
                      setRetention((current) =>
                        current ? { ...current, dryRunOnly: event.target.checked } : current,
                      )
                    }
                  />{" "}
                  Somente dry-run
                </label>
                <button
                  type="submit"
                  disabled={retentionBusy}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {retentionBusy ? "Salvando..." : "Salvar política"}
                </button>
                <button
                  type="button"
                  disabled={retentionBusy}
                  onClick={async () => {
                    setRetentionBusy(true);
                    try {
                      const report = await runRetentionDryRun();
                      setRetentionRun({
                        id: report.runId ?? "",
                        mode: "dry_run",
                        status: "completed",
                        counts: report.counts,
                        cutoff: report.cutoffs,
                        createdAt: new Date().toISOString(),
                      });
                      setRetentionMessage("Dry-run concluído; nenhum dado foi removido.");
                    } catch (cause) {
                      setRetentionMessage("Não foi possível executar o dry-run.");
                      captureDiagnostic(cause, {
                        source: "async",
                        component: "PlanOverview",
                        payload: { operation: "retention_dry_run" },
                        recoverable: true,
                      });
                    } finally {
                      setRetentionBusy(false);
                    }
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800"
                >
                  Executar dry-run
                </button>
              </div>
            </form>
            {retentionMessage && (
              <p className="mt-3 text-xs font-medium text-slate-600">{retentionMessage}</p>
            )}
            {retentionRun && (
              <p className="mt-2 text-xs text-slate-500">
                Último run: {retentionRun.mode} · {retentionRun.status} ·{" "}
                {Object.entries(retentionRun.counts)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </p>
            )}
          </section>
        )}

        <PlanCatalogEditor />

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

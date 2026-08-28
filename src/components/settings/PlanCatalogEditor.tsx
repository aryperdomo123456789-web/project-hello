import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, Save, ShieldCheck } from "lucide-react";

import { meFn } from "@/functions/auth.functions";
import { getPlanCatalogFn, updatePlanCatalogFn } from "@/functions/plan-catalog.functions";
import type { PlanCatalogItemDTO } from "@/services/plan-catalog.server";
import { captureDiagnostic } from "@/lib/diagnostics";

const PLAN_ORDER = ["starter", "growth", "scale"] as const;
type PlanId = (typeof PLAN_ORDER)[number];
type EditablePlan = PlanCatalogItemDTO;

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function centsFromMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function PlanCatalogEditor() {
  const getMe = useServerFn(meFn);
  const getCatalog = useServerFn(getPlanCatalogFn);
  const updatePlan = useServerFn(updatePlanCatalogFn);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("growth");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planId === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const load = useCallback(async () => {
    try {
      const user = await getMe();
      const owner = user?.role === "owner";
      setIsOwner(owner);
      if (owner) setPlans(await getCatalog());
    } catch (cause) {
      setIsOwner(false);
      captureDiagnostic(cause, {
        source: "async",
        component: "PlanCatalogEditor",
        payload: { operation: "load_plan_catalog" },
        recoverable: true,
      });
    }
  }, [getCatalog, getMe]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isOwner !== true) return null;
  if (!selectedPlan) {
    return (
      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6 text-sm text-violet-900">
        Carregando catálogo comercial...
      </section>
    );
  }

  const updateSelected = (patch: Partial<EditablePlan>) => {
    setPlans((current) =>
      current.map((plan) => (plan.planId === selectedPlanId ? { ...plan, ...patch } : plan)),
    );
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await updatePlan({
        data: {
          planId: selectedPlan.planId,
          name: selectedPlan.name,
          description: selectedPlan.description,
          priceCents: selectedPlan.priceCents,
          stripePriceId: selectedPlan.stripePriceId ?? "",
          limits: selectedPlan.limits,
          features: selectedPlan.features,
          highlighted: selectedPlan.highlighted,
          isActive: selectedPlan.isActive,
        },
      });
      setPlans((current) => current.map((plan) => (plan.planId === saved.planId ? saved : plan)));
      setMessage(`${saved.name} salvo com auditoria registrada.`);
    } catch (cause) {
      setMessage("Não foi possível salvar. Apenas o owner pode editar o catálogo.");
      captureDiagnostic(cause, {
        source: "async",
        component: "PlanCatalogEditor",
        payload: { operation: "update_plan_catalog", plan: selectedPlan.planId },
        recoverable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
            Controle exclusivo do owner
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">Preços e planos comerciais</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Personalize nome, descrição, preço, capacidade e benefícios. Toda alteração é auditada;
            assinaturas existentes não mudam retroativamente.
          </p>
        </div>
        <Crown className="h-6 w-6 text-violet-600" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = plans.find((item) => item.planId === planId);
          if (!plan) return null;
          return (
            <button
              key={plan.planId}
              type="button"
              onClick={() => setSelectedPlanId(plan.planId)}
              className={`rounded-xl border p-4 text-left transition ${
                selectedPlanId === plan.planId
                  ? "border-violet-500 bg-violet-50 shadow-sm"
                  : "border-slate-200 bg-slate-50 hover:border-violet-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {plan.planId}
                </span>
                {plan.highlighted && (
                  <span className="text-[10px] font-bold text-violet-700">Destaque</span>
                )}
              </div>
              <p className="mt-2 font-bold text-slate-900">{plan.name}</p>
              <p className="mt-1 text-lg font-black text-violet-700">
                {plan.priceCents > 0
                  ? `R$ ${moneyFromCents(plan.priceCents)}/mês`
                  : "Preço não definido"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {plan.limits.connections} números · {plan.limits.agents} agentes
              </p>
            </button>
          );
        })}
      </div>

      <form className="mt-6 grid gap-4" onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_180px]">
          <label className="text-xs font-semibold text-slate-600">
            Nome público
            <input
              value={selectedPlan.name}
              onChange={(event) => updateSelected({ name: event.target.value })}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Descrição
            <input
              value={selectedPlan.description}
              onChange={(event) => updateSelected({ description: event.target.value })}
              maxLength={280}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Preço mensal (R$)
            <input
              inputMode="decimal"
              value={moneyFromCents(selectedPlan.priceCents)}
              onChange={(event) =>
                updateSelected({ priceCents: centsFromMoney(event.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-slate-900"
            />
          </label>
        </div>

        <label className="text-xs font-semibold text-slate-600">
          Stripe Price ID (opcional)
          <input
            value={selectedPlan.stripePriceId ?? ""}
            onChange={(event) => updateSelected({ stripePriceId: event.target.value.trim() })}
            placeholder="price_..."
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900"
          />
          <span className="mt-1 block font-normal text-slate-500">
            Identificador público do preço recorrente no Stripe; nunca cole uma chave secreta aqui.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["connections", "Números"],
              ["agents", "Agentes"],
              ["monthlyMessages", "Mensagens/mês"],
              ["activeFlows", "Fluxos"],
              ["retentionDays", "Retenção (dias)"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="text-xs font-semibold text-slate-600">
              {label}
              <input
                type="number"
                min={field === "retentionDays" ? 1 : field === "monthlyMessages" ? 0 : 1}
                value={selectedPlan.limits[field]}
                onChange={(event) =>
                  updateSelected({
                    limits: { ...selectedPlan.limits, [field]: Number(event.target.value) },
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>
          ))}
        </div>

        <label className="text-xs font-semibold text-slate-600">
          Benefícios — um por linha
          <textarea
            rows={5}
            value={selectedPlan.features.join("\n")}
            onChange={(event) =>
              updateSelected({
                features: event.target.value
                  .split("\n")
                  .map((feature) => feature.trim())
                  .filter(Boolean),
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedPlan.highlighted}
              onChange={(event) => updateSelected({ highlighted: event.target.checked })}
            />
            Destacar plano
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedPlan.isActive}
              onChange={(event) => updateSelected({ isActive: event.target.checked })}
            />
            Disponível para novas assinaturas
          </label>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="h-4 w-4" /> BRL · preço salvo em centavos
          </span>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar plano"}
          </button>
        </div>
        {message && <p className="text-xs font-medium text-slate-600">{message}</p>}
        <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />O Checkout usa o Price
          ID Stripe quando configurado; Mercado Pago continua disponível como alternativa. Segredos
          ficam somente no ambiente server-side.
        </p>
      </form>
    </section>
  );
}

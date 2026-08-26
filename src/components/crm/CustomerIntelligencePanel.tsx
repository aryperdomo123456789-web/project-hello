import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowUpRight, BrainCircuit, RefreshCw, Target } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getCustomerIntelligenceFn } from "@/functions/customer-intelligence.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

interface CustomerIntelligencePanelProps {
  contactId: string;
}

const lifecycleLabels: Record<string, string> = {
  new: "Novo",
  engaged: "Engajado",
  at_risk: "Em risco",
  active: "Ativo",
  customer: "Cliente",
};

const intentLabels: Record<string, string> = {
  sales: "Vendas",
  support: "Suporte",
  finance: "Financeiro",
  scheduling: "Agendamento",
  other: "Não classificado",
};

export function CustomerIntelligencePanel({ contactId }: CustomerIntelligencePanelProps) {
  const getIntelligence = useServerFn(getCustomerIntelligenceFn);
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomerIntelligenceFn>> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getIntelligence({ data: { contactId } }));
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar os sinais do contato");
      captureDiagnostic(cause, {
        source: "async",
        component: "CustomerIntelligencePanel",
        payload: { operation: "get_customer_intelligence", contactId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [contactId, getIntelligence]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="border-b bg-gradient-to-br from-indigo-50 to-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-950">
          <BrainCircuit className="h-4 w-4 text-indigo-700" /> Customer Intelligence
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg p-1.5 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          title="Atualizar sinais"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-1 font-bold underline">
            Tentar novamente
          </button>
        </div>
      ) : data ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-indigo-200 bg-white">
              <span className="text-xl font-bold text-indigo-700">{data.leadScore}</span>
              <span className="absolute -bottom-2 rounded bg-indigo-700 px-1.5 py-0.5 text-[9px] font-bold text-white">
                score
              </span>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-slate-800">
                <Target className="h-3.5 w-3.5 text-indigo-600" />
                {intentLabels[data.intent] ?? data.intent}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {lifecycleLabels[data.lifecycle] ?? data.lifecycle}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-indigo-700">
                <ArrowUpRight className="h-3 w-3" />
                Próxima ação recomendada
              </p>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-slate-700">
            {data.nextBestAction}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg bg-white/80 p-2">
              <p className="text-slate-400">Conversas</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{data.stats.conversations}</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2">
              <p className="text-slate-400">Tickets abertos</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{data.stats.openTickets}</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2">
              <p className="text-slate-400">Follow-ups</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{data.stats.openTasks}</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2">
              <p className="text-slate-400">Satisfação</p>
              <p className="mt-1 text-sm font-bold text-slate-800">
                {data.stats.averageRating ?? "—"}
              </p>
            </div>
          </div>
          {data.signals.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {data.signals.slice(0, 4).map((signal) => (
                <p key={signal} className="flex gap-1.5 text-[10px] text-slate-600">
                  <Activity className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" />
                  {signal}
                </p>
              ))}
            </div>
          )}
          {data.stats.openTickets > 0 && (
            <p className="mt-3 flex items-center gap-1 rounded-lg bg-amber-100 p-2 text-[10px] font-semibold text-amber-900">
              <AlertCircle className="h-3 w-3" />
              Há atendimento pendente neste contato.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Carregando sinais da jornada...</p>
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Server, Wifi } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { getMetricsFn, type MetricsDTO } from "@/functions/metrics.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

type HealthResponse = {
  ok?: boolean;
  checks?: { database?: string; redis?: string };
  requestId?: string;
};

export function OperationalHealthView() {
  const getMetrics = useServerFn(getMetricsFn);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResponse, metricsResponse] = await Promise.all([
        fetch("/api/health", { headers: { Accept: "application/json" } }),
        getMetrics(),
      ]);
      const body: unknown = await healthResponse.json().catch(() => ({}));
      const parsed = body && typeof body === "object" ? (body as HealthResponse) : {};
      if (!healthResponse.ok) throw new Error("Health check retornou indisponibilidade");
      setHealth(parsed);
      setMetrics(metricsResponse);
    } catch (cause) {
      setError("A saúde operacional não pôde ser atualizada");
      captureDiagnostic(cause, {
        source: "network",
        component: "OperationalHealthView",
        payload: { operation: "refresh_operational_health" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [getMetrics]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checks = [
    {
      label: "Aplicação web",
      value: health?.ok ? "operational" : health ? "degraded" : "pending",
      icon: <Server className="h-5 w-5" />,
    },
    {
      label: "PostgreSQL",
      value: health?.checks?.database ?? "pending",
      icon: <Activity className="h-5 w-5" />,
    },
    {
      label: "Redis / worker",
      value: health?.checks?.redis ?? "pending",
      icon: <Wifi className="h-5 w-5" />,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              Supervisão operacional
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Saúde da central</h2>
            <p className="mt-1 text-sm text-slate-500">
              Veja degradação antes do operador descobrir no grito.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        {error && (
          <div
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {checks.map((check) => (
            <HealthCard key={check.label} {...check} />
          ))}
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Fila pendente" value={metrics?.queuedConversations ?? 0} />
          <Metric
            label="Fora do SLA"
            value={metrics?.waitingOverSla ?? 0}
            warning={Boolean(metrics?.waitingOverSla)}
          />
          <Metric
            label="Maior espera"
            value={`${metrics?.oldestQueuedMinutes ?? 0} min`}
            warning={Boolean(metrics?.oldestQueuedMinutes && metrics.oldestQueuedMinutes > 15)}
          />
          <Metric label="Agentes online" value={metrics?.onlineAgents ?? 0} />
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Runbook rápido</h3>
              <p className="mt-1 text-xs text-slate-500">
                Procedimento de resposta para uma degradação, sem caça ao culpado.
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Step number="1" title="Confirmar" text="Verifique o request ID e o health check." />
            <Step number="2" title="Conter" text="Pause automações ou devolva a conversa à fila." />
            <Step
              number="3"
              title="Recuperar"
              text="Reprocesse o job e valide o histórico antes de responder."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function HealthCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  const ok = value === "operational" || value === "ok" || value === "healthy";
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</span>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${ok ? "bg-emerald-50 text-emerald-700" : value === "pending" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-4 text-sm font-bold text-slate-900">{label}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number | string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${warning ? "border-amber-200 bg-amber-50" : "bg-white"}`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${warning ? "text-amber-800" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
        {number}
      </span>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

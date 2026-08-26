import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Clock,
  Link2,
  MessageSquare,
  Users,
  Workflow,
  Star,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetricsFn, type MetricsDTO } from "@/functions/metrics.functions";
import { getRatingMetricsFn, type RatingMetricsDTO } from "@/functions/rating.functions";
import { exportConversationsCsvFn } from "@/functions/report.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function ReportsView() {
  const getMetrics = useServerFn(getMetricsFn);
  const getRatingMetrics = useServerFn(getRatingMetricsFn);
  const exportConversationsCsv = useServerFn(exportConversationsCsvFn);
  const [metrics, setMetrics] = useState<MetricsDTO | null>(null);
  const [ratingMetrics, setRatingMetrics] = useState<RatingMetricsDTO | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      const result = await getMetrics();
      setMetrics(result);
      setMetricsError(null);
    } catch (error) {
      setMetricsError("Não foi possível atualizar os indicadores");
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "load_metrics" },
        recoverable: true,
      });
    }
  }, [getMetrics]);

  const loadRatingMetrics = useCallback(async () => {
    try {
      setRatingMetrics(await getRatingMetrics({ data: { days: 30 } }));
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "load_rating_metrics" },
        recoverable: true,
      });
    }
  }, [getRatingMetrics]);

  useEffect(() => {
    void loadMetrics();
    void loadRatingMetrics();
  }, [loadMetrics, loadRatingMetrics]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportConversationsCsv();
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "export_conversations" },
        recoverable: true,
      });
    } finally {
      setExporting(false);
    }
  }

  const value = (number: number | undefined) =>
    number === undefined ? "—" : number.toLocaleString("pt-BR");
  const queueData = metrics?.byQueue.length ? metrics.byQueue : [{ name: "Sem dados", value: 0 }];
  const volumeData = [{ name: "Hoje", atendimentos: metrics?.inboundToday ?? 0 }];

  return (
    <div className="h-full space-y-8 overflow-y-auto p-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Relatórios Operacionais</h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground">
              Dados da sua organização, sem número inventado para impressionar apresentação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
        {metricsError && (
          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <span>{metricsError}. Exibindo o último estado disponível.</span>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              className="font-bold underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Total de conversas"
          value={value(metrics?.totalConversations)}
          color="blue"
        />
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Aguardando fila"
          value={value(metrics?.queuedConversations)}
          color="amber"
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="Resolvidas hoje"
          value={value(metrics?.resolvedToday)}
          color="green"
        />
        <MetricCard
          icon={<Link2 className="h-5 w-5" />}
          label="Números conectados"
          value={value(metrics?.connectedConnections)}
          color="purple"
        />
        <MetricCard
          icon={<Star className="h-5 w-5" />}
          label="Satisfação média"
          value={
            ratingMetrics
              ? `${ratingMetrics.average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5`
              : "—"
          }
          color="amber"
        />
      </div>
      <p className="-mt-4 text-xs text-slate-400">
        Avaliações nos últimos 30 dias:{" "}
        {ratingMetrics ? ratingMetrics.total.toLocaleString("pt-BR") : "—"}
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Fora do SLA"
          value={value(metrics?.waitingOverSla)}
          tone={metrics?.waitingOverSla ? "danger" : "default"}
        />
        <StatusCard
          icon={<Clock className="h-5 w-5" />}
          label="Maior espera"
          value={metrics ? `${metrics.oldestQueuedMinutes} min` : "—"}
          tone={
            metrics?.oldestQueuedMinutes && metrics.oldestQueuedMinutes > 15 ? "warning" : "default"
          }
        />
        <StatusCard
          icon={<Users className="h-5 w-5" />}
          label="Agentes online"
          value={value(metrics?.onlineAgents)}
          tone="default"
        />
        <StatusCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Atendimentos atribuídos"
          value={value(metrics?.assignedConversations)}
          tone="default"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border-none bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Mensagens recebidas hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Conversas por fila</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={queueData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {queueData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length] ?? "#3b82f6"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4">
                {queueData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-xs font-medium text-slate-500">
                      {item.name}: {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatusCard
          icon={<Workflow className="h-5 w-5" />}
          label="Automações ativas"
          value={value(metrics?.activeAutomations)}
        />
        <StatusCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Entradas hoje"
          value={value(metrics?.inboundToday)}
        />
        <StatusCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="Taxa de resolução"
          value={metrics ? `${metrics.resolutionRate.toLocaleString("pt-BR")}%` : "—"}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "amber" | "green" | "purple";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <Card className="border-none bg-white shadow-sm">
      <CardContent className="pt-6">
        <div
          className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${colors[color]}`}
        >
          {icon}
        </div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      </CardContent>
    </Card>
  );
}

function StatusCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card className="border-none bg-white shadow-sm">
      <CardContent className="flex items-center gap-4 py-5">
        <div
          className={`rounded-lg p-3 ${tone === "danger" ? "bg-red-50 text-red-600" : tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

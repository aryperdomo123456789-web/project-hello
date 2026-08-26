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
  DollarSign,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetricsFn, type MetricsDTO } from "@/functions/metrics.functions";
import { getRatingMetricsFn, type RatingMetricsDTO } from "@/functions/rating.functions";
import { exportConversationsCsvFn } from "@/functions/report.functions";
import { captureDiagnostic } from "@/lib/diagnostics";
import {
  createConversionEventFn,
  createMarketingSpendFn,
  getPerformanceAnalyticsFn,
  type PerformanceAnalyticsDTO,
} from "@/functions/performance.functions";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function ReportsView() {
  const getMetrics = useServerFn(getMetricsFn);
  const getRatingMetrics = useServerFn(getRatingMetricsFn);
  const exportConversationsCsv = useServerFn(exportConversationsCsvFn);
  const getPerformanceAnalytics = useServerFn(getPerformanceAnalyticsFn);
  const createConversionEvent = useServerFn(createConversionEventFn);
  const createMarketingSpend = useServerFn(createMarketingSpendFn);
  const [metrics, setMetrics] = useState<MetricsDTO | null>(null);
  const [ratingMetrics, setRatingMetrics] = useState<RatingMetricsDTO | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [performance, setPerformance] = useState<PerformanceAnalyticsDTO | null>(null);
  const [performanceDays, setPerformanceDays] = useState(30);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [spendSource, setSpendSource] = useState("facebook");
  const [spendAmount, setSpendAmount] = useState("");
  const [conversionContactId, setConversionContactId] = useState("");
  const [conversionSource, setConversionSource] = useState("manual");
  const [conversionRevenue, setConversionRevenue] = useState("");

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

  const loadPerformance = useCallback(async () => {
    setPerformanceLoading(true);
    try {
      setPerformance(await getPerformanceAnalytics({ data: { days: performanceDays } }));
      setPerformanceError(null);
    } catch (error) {
      setPerformanceError("Não foi possível atualizar o painel de performance");
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "load_performance", days: performanceDays },
        recoverable: true,
      });
    } finally {
      setPerformanceLoading(false);
    }
  }, [getPerformanceAnalytics, performanceDays]);

  useEffect(() => {
    void loadMetrics();
    void loadRatingMetrics();
  }, [loadMetrics, loadRatingMetrics]);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

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

  async function handleSpendSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(spendAmount.replace(",", "."));
    if (!spendSource.trim() || !Number.isFinite(amount) || amount < 0) return;
    try {
      const now = new Date();
      await createMarketingSpend({
        data: {
          source: spendSource.trim(),
          amountCents: Math.round(amount * 100),
          periodStart: new Date(
            now.getTime() - performanceDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
          periodEnd: now.toISOString(),
        },
      });
      setSpendAmount("");
      await loadPerformance();
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "create_marketing_spend" },
        recoverable: true,
      });
    }
  }

  async function handleConversionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revenue = Number(conversionRevenue.replace(",", "."));
    if (
      !conversionContactId.trim() ||
      !conversionSource.trim() ||
      !Number.isFinite(revenue) ||
      revenue < 0
    )
      return;
    try {
      await createConversionEvent({
        data: {
          contactId: conversionContactId.trim(),
          source: conversionSource.trim(),
          revenueCents: Math.round(revenue * 100),
          eventType: "won",
        },
      });
      setConversionContactId("");
      setConversionRevenue("");
      await loadPerformance();
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "ReportsView",
        payload: { operation: "create_conversion_event" },
        recoverable: true,
      });
    }
  }

  const value = (number: number | undefined) =>
    number === undefined ? "—" : number.toLocaleString("pt-BR");
  const money = (cents: number | undefined) =>
    cents === undefined
      ? "—"
      : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

      <PerformanceSection
        performance={performance}
        days={performanceDays}
        loading={performanceLoading}
        error={performanceError}
        onDaysChange={setPerformanceDays}
        onReload={() => void loadPerformance()}
        spendSource={spendSource}
        spendAmount={spendAmount}
        onSpendSourceChange={setSpendSource}
        onSpendAmountChange={setSpendAmount}
        onSpendSubmit={handleSpendSubmit}
        conversionContactId={conversionContactId}
        conversionSource={conversionSource}
        conversionRevenue={conversionRevenue}
        onConversionContactIdChange={setConversionContactId}
        onConversionSourceChange={setConversionSource}
        onConversionRevenueChange={setConversionRevenue}
        onConversionSubmit={handleConversionSubmit}
        money={money}
      />

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

function PerformanceSection({
  performance,
  days,
  loading,
  error,
  onDaysChange,
  onReload,
  spendSource,
  spendAmount,
  onSpendSourceChange,
  onSpendAmountChange,
  onSpendSubmit,
  conversionContactId,
  conversionSource,
  conversionRevenue,
  onConversionContactIdChange,
  onConversionSourceChange,
  onConversionRevenueChange,
  onConversionSubmit,
  money,
}: {
  performance: PerformanceAnalyticsDTO | null;
  days: number;
  loading: boolean;
  error: string | null;
  onDaysChange: (days: number) => void;
  onReload: () => void;
  spendSource: string;
  spendAmount: string;
  onSpendSourceChange: (value: string) => void;
  onSpendAmountChange: (value: string) => void;
  onSpendSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  conversionContactId: string;
  conversionSource: string;
  conversionRevenue: string;
  onConversionContactIdChange: (value: string) => void;
  onConversionSourceChange: (value: string) => void;
  onConversionRevenueChange: (value: string) => void;
  onConversionSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  money: (cents: number | undefined) => string;
}) {
  const conversion = performance?.conversion;
  return (
    <Card className="border-none bg-white shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <DollarSign className="h-5 w-5 text-emerald-600" /> Performance, conversão e ROI
          </CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Receita e custos digitados pela operação; nada de número mágico de guru.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            aria-label="Período de performance"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>365 dias</option>
          </select>
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Atualizar performance"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MiniMetric label="Eventos" value={valueNumber(conversion?.totalEvents)} />
          <MiniMetric label="Ganhos" value={valueNumber(conversion?.wonEvents)} />
          <MiniMetric label="Receita" value={money(conversion?.revenueCents)} />
          <MiniMetric label="Custo" value={money(conversion?.spendCents)} />
          <MiniMetric
            label="ROI"
            value={
              conversion?.roiPercent === null || conversion?.roiPercent === undefined
                ? "—"
                : `${conversion.roiPercent.toLocaleString("pt-BR")} %`
            }
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-3 font-semibold text-slate-800">Por fonte</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fonte</th>
                    <th className="px-3 py-2">Ganhos</th>
                    <th className="px-3 py-2">Receita</th>
                    <th className="px-3 py-2">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion?.bySource.map((row) => (
                    <tr key={row.source} className="border-t">
                      <td className="px-3 py-2 font-medium">{row.source}</td>
                      <td className="px-3 py-2">{row.conversions}</td>
                      <td className="px-3 py-2">{money(row.revenueCents)}</td>
                      <td className="px-3 py-2">
                        {row.roiPercent === null
                          ? "—"
                          : `${row.roiPercent.toLocaleString("pt-BR")} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!conversion?.bySource.length && (
                <p className="px-3 py-4 text-sm text-slate-500">
                  Registre custos e conversões para liberar atribuição real.
                </p>
              )}
            </div>
          </div>
          <div>
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-blue-600" /> QA histórico por equipe
            </h4>
            <div className="space-y-2">
              {performance?.quality
                .filter((row) => row.reviews > 0)
                .map((row) => (
                  <div
                    key={row.userId}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{row.agentName}</p>
                      <p className="text-xs text-slate-500">
                        {row.role} · {row.reviews} avaliações
                      </p>
                    </div>
                    <span className="font-bold text-blue-700">
                      {row.averageScore.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/100
                    </span>
                  </div>
                ))}
            </div>
            {!performance?.quality.some((row) => row.reviews > 0) && (
              <p className="text-sm text-slate-500">Nenhuma avaliação histórica no período.</p>
            )}
          </div>
        </div>
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 lg:grid-cols-2">
          <form onSubmit={onSpendSubmit} className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Registrar custo de marketing</p>
            <div className="flex gap-2">
              <input
                value={spendSource}
                onChange={(event) => onSpendSourceChange(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                placeholder="facebook, google..."
              />
              <input
                value={spendAmount}
                onChange={(event) => onSpendAmountChange(event.target.value)}
                className="w-28 rounded-lg border bg-white px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="R$"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
            >
              Salvar custo
            </button>
          </form>
          <form onSubmit={onConversionSubmit} className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Registrar conversão ganha</p>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={conversionContactId}
                onChange={(event) => onConversionContactIdChange(event.target.value)}
                className="col-span-2 rounded-lg border bg-white px-3 py-2 text-sm"
                placeholder="ID do contato (CRM)"
              />
              <input
                value={conversionRevenue}
                onChange={(event) => onConversionRevenueChange(event.target.value)}
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="R$"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={conversionSource}
                onChange={(event) => onConversionSourceChange(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                placeholder="fonte da conversão"
              />
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Salvar conversão
              </button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function valueNumber(number: number | undefined) {
  return number === undefined ? "—" : number.toLocaleString("pt-BR");
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
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

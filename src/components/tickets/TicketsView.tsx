import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, RefreshCw, Ticket, Timer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listTicketsFn, updateTicketFn, type TicketDTO } from "@/functions/ticket.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

const statusLabels: Record<string, string> = {
  open: "Aberto",
  pending: "Pendente",
  in_progress: "Em andamento",
  resolved: "Resolvido",
  closed: "Fechado",
};

const priorityLabels = ["Normal", "Baixa", "Média", "Alta", "Crítica"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function isOverdue(ticket: TicketDTO) {
  return Boolean(
    ticket.slaDueAt &&
    new Date(ticket.slaDueAt).getTime() < Date.now() &&
    ticket.status !== "resolved" &&
    ticket.status !== "closed",
  );
}

export function TicketsView() {
  const listTickets = useServerFn(listTicketsFn);
  const updateTicket = useServerFn(updateTicketFn);
  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTickets({
        data: { limit: 100, ...(status === "all" ? {} : { status: status as "open" }) },
      });
      setTickets(Array.isArray(result) ? result : []);
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar os tickets");
      captureDiagnostic(cause, {
        source: "async",
        component: "TicketsView",
        payload: { operation: "list_tickets", status },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listTickets, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatus(
    ticket: TicketDTO,
    nextStatus: "open" | "pending" | "in_progress" | "resolved" | "closed",
  ) {
    try {
      await updateTicket({ data: { ticketId: ticket.id, status: nextStatus } });
      setTickets((current) =>
        current.map((item) => (item.id === ticket.id ? { ...item, status: nextStatus } : item)),
      );
      toast.success(`Ticket #${ticket.number} atualizado`);
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "TicketsView",
        payload: { operation: "update_ticket_status", ticketId: ticket.id, nextStatus },
        recoverable: true,
      });
      toast.error("Não foi possível atualizar o ticket");
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Operação estruturada
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Tickets e SLA</h2>
            <p className="mt-1 text-sm text-slate-500">
              Transforme conversas em tarefas rastreáveis com prioridade, prazo e responsável.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {(["all", "open", "pending", "in_progress", "resolved"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`rounded-xl border p-4 text-left shadow-sm transition ${status === item ? "border-indigo-400 bg-indigo-50" : "bg-white hover:border-indigo-200"}`}
            >
              <p className="text-xs font-bold uppercase text-slate-400">
                {item === "all" ? "Todos" : statusLabels[item]}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {item === "all"
                  ? tickets.length
                  : tickets.filter((ticket) => ticket.status === item).length}
              </p>
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">
              Tentar novamente
            </button>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-5">
              <p className="text-sm font-bold text-slate-900">Fila de tickets</p>
              <p className="mt-1 text-xs text-slate-500">
                Ordenados por prioridade e última alteração.
              </p>
            </div>
            <div className="divide-y">
              {tickets.map((ticket) => {
                const overdue = isOverdue(ticket);
                return (
                  <article
                    key={ticket.id}
                    className="flex flex-wrap items-center gap-4 p-5 hover:bg-slate-50"
                  >
                    <div className="flex w-16 items-center gap-2 text-sm font-bold text-indigo-700">
                      <Ticket className="h-4 w-4" />#{ticket.number}
                    </div>
                    <div className="min-w-64 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{ticket.subject}</p>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          {ticket.category}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {ticket.contactName} · {ticket.queueName ?? "Sem fila"} ·{" "}
                        {ticket.assigneeName ?? "Sem responsável"}
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs font-bold ${overdue ? "text-red-600" : "text-slate-500"}`}
                      title={overdue ? "SLA vencido" : "Prazo do SLA"}
                    >
                      {overdue ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Timer className="h-4 w-4" />
                      )}
                      {formatDate(ticket.slaDueAt)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                        {ticket.priority >= 4 ? (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        ) : ticket.priority > 0 ? (
                          <CircleDot className="h-3 w-3 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        {priorityLabels[ticket.priority] ?? "Normal"}
                      </span>
                      <select
                        value={ticket.status}
                        onChange={(event) =>
                          void handleStatus(
                            ticket,
                            event.target.value as
                              "open" | "pending" | "in_progress" | "resolved" | "closed",
                          )
                        }
                        className="h-8 rounded-lg border bg-white px-2 text-xs"
                      >
                        <option value="open">Aberto</option>
                        <option value="pending">Pendente</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="resolved">Resolvido</option>
                        <option value="closed">Fechado</option>
                      </select>
                    </div>
                  </article>
                );
              })}
              {tickets.length === 0 && (
                <div className="p-12 text-center text-sm text-slate-400">
                  Nenhum ticket encontrado. Crie um ticket a partir de uma conversa para iniciar o
                  rastreamento.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

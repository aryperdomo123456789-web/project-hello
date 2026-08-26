import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  FlaskConical,
  Send,
  Smartphone,
} from "lucide-react";

import {
  DEFAULT_SIMULATION_CHANNELS,
  simulateDuplicate,
  simulateInbound,
  simulateProviderFailure,
  simulateReply,
  type SimulationChannel,
  type SimulationEvent,
} from "@/simulator/simulation";

export function SimulationLab() {
  const [channels, setChannels] = useState<SimulationChannel[]>(DEFAULT_SIMULATION_CHANNELS);
  const [selectedChannelId, setSelectedChannelId] = useState(
    DEFAULT_SIMULATION_CHANNELS[0]?.id ?? "",
  );
  const [message, setMessage] = useState("Quero saber o preço do plano");
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const inboundEvents = useMemo(
    () => events.filter((event) => event.direction === "inbound"),
    [events],
  );

  function pushEvent(event: SimulationEvent) {
    setEvents((current) => [event, ...current].slice(0, 50));
  }

  function handleReceive() {
    if (!selectedChannel) return;
    pushEvent(simulateInbound(selectedChannel, message));
  }

  function handleReply(event: SimulationEvent) {
    pushEvent(simulateReply(event));
  }

  function handleDuplicate(event: SimulationEvent) {
    pushEvent(simulateDuplicate(event));
  }

  function handleFailure(event: SimulationEvent) {
    pushEvent(simulateProviderFailure(event));
  }

  function reset() {
    setEvents([]);
    setChannels(DEFAULT_SIMULATION_CHANNELS);
    setSelectedChannelId(DEFAULT_SIMULATION_CHANNELS[0]?.id ?? "");
  }

  return (
    <div className="h-full min-h-[680px] overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-700">
              <FlaskConical className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-widest">
                Sandbox de operação
              </span>
            </div>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Laboratório multi-WhatsApp</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Simule números diferentes entrando na mesma central sem tocar em WhatsApp real. O
              objetivo é provar roteamento, especialista, idempotência e retry antes da Evolution.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Limpar laboratório
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-600" />
              <h3 className="font-bold text-slate-900">Números simulados</h3>
            </div>
            <div className="space-y-2">
              {channels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedChannelId === channel.id ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <p className="text-sm font-bold text-slate-900">{channel.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{channel.displayPhone}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                    {channel.specialist}
                  </p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <strong>Sem Evolution:</strong> este laboratório substitui o canal real por eventos
              determinísticos de teste.
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-slate-900 p-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                    Entrada selecionada
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {selectedChannel?.name ?? "Nenhum número"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {selectedChannel?.displayPhone ?? "Selecione um número"} ·{" "}
                    {selectedChannel?.queue ?? "Sem fila"}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  sandbox ativo
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400"
                  placeholder="Mensagem de teste"
                />
                <button
                  type="button"
                  onClick={handleReceive}
                  disabled={!selectedChannel}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Receber
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Eventos" value={String(events.length)} />
              <Stat label="Entradas" value={String(inboundEvents.length)} />
              <Stat label="Números" value={String(channels.length)} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Trilha de eventos</h3>
                <span className="text-xs text-slate-400">inbox única · contexto preservado</span>
              </div>
              {events.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-slate-400">
                  Envie uma mensagem de teste para começar.
                </div>
              ) : (
                events.map((event) => (
                  <article key={event.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">
                            {event.channelName}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                            {event.direction}
                          </span>
                          <Status status={event.status} />
                        </div>
                        <p className="mt-2 font-semibold text-slate-900">{event.text}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {event.specialist} · {event.queue} · {event.phone}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.direction === "inbound" && (
                          <Action
                            onClick={() => handleReply(event)}
                            icon={<Bot className="h-3.5 w-3.5" />}
                          >
                            Responder
                          </Action>
                        )}
                        {event.direction === "inbound" && (
                          <Action
                            onClick={() => handleDuplicate(event)}
                            icon={<Copy className="h-3.5 w-3.5" />}
                          >
                            Repetir webhook
                          </Action>
                        )}
                        {event.direction === "inbound" && (
                          <Action
                            onClick={() => handleFailure(event)}
                            icon={<AlertTriangle className="h-3.5 w-3.5" />}
                          >
                            Simular falha
                          </Action>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Rastreamento
                      </p>
                      <ol className="mt-2 space-y-1 text-xs text-slate-600">
                        {event.trace.map((item, index) => (
                          <li key={`${event.id}-${index}`}>
                            <span className="mr-2 font-bold text-blue-600">{index + 1}.</span>
                            {item}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Status({ status }: { status: SimulationEvent["status"] }) {
  const styles = {
    received: "bg-blue-50 text-blue-700",
    routed: "bg-emerald-50 text-emerald-700",
    replied: "bg-cyan-50 text-cyan-700",
    duplicated: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${styles[status]}`}
    >
      <CheckCircle2 className="h-3 w-3" />
      {status}
    </span>
  );
}

function Action({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
    >
      {icon}
      {children}
    </button>
  );
}

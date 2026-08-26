import { useCallback, useEffect, useState } from "react";
import { Clock3, Pause, Play, Plus, Save, Send, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  createSequenceFn,
  listSequencesFn,
  previewSequenceFn,
  setSequenceStatusFn,
  type SequenceDTO,
} from "@/functions/sequence.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

type DraftStep = {
  type: "message" | "task" | "tag" | "handoff";
  delayMinutes: number;
  body: string;
};

const INITIAL_STEP: DraftStep = { type: "message", delayMinutes: 0, body: "" };

export function SequencesView() {
  const listSequences = useServerFn(listSequencesFn);
  const createSequence = useServerFn(createSequenceFn);
  const setSequenceStatus = useServerFn(setSequenceStatusFn);
  const previewSequence = useServerFn(previewSequenceFn);
  const [sequences, setSequences] = useState<SequenceDTO[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<
    "manual" | "tag_added" | "ticket_resolved" | "conversation_resolved"
  >("manual");
  const [steps, setSteps] = useState<DraftStep[]>([INITIAL_STEP]);
  const [preview, setPreview] = useState<{
    name: string;
    steps: Array<{ position: number; type: string; body: string | null; scheduledAt: string }>;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setSequences(await listSequences());
    } catch (cause) {
      setStatus("Não foi possível carregar as sequências");
      captureDiagnostic(cause, {
        source: "async",
        component: "SequencesView",
        payload: { operation: "list_sequences" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listSequences]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    try {
      if (!name.trim()) {
        setStatus("Informe um nome para a sequência");
        return;
      }
      if (steps.some((step) => !step.body.trim() && ["message", "task"].includes(step.type))) {
        setStatus("Preencha o conteúdo dos passos");
        return;
      }
      await createSequence({
        data: {
          name,
          trigger,
          steps: steps.map((step, position) => ({ ...step, position, config: {} })),
        },
      });
      setName("");
      setSteps([INITIAL_STEP]);
      setStatus("Sequência criada como rascunho");
      await load();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Não foi possível criar a sequência");
      captureDiagnostic(cause, {
        source: "async",
        component: "SequencesView",
        payload: { operation: "create_sequence" },
        recoverable: true,
      });
    }
  }

  async function toggle(sequence: SequenceDTO) {
    try {
      const nextStatus = sequence.status === "active" ? "paused" : "active";
      await setSequenceStatus({ data: { id: sequence.id, status: nextStatus } });
      await load();
    } catch (cause) {
      setStatus("Não foi possível alterar a sequência");
      captureDiagnostic(cause, {
        source: "async",
        component: "SequencesView",
        payload: { operation: "toggle_sequence", sequenceId: sequence.id },
        recoverable: true,
      });
    }
  }

  async function showPreview(sequence: SequenceDTO) {
    try {
      setPreview(await previewSequence({ data: { id: sequence.id } }));
    } catch (cause) {
      setStatus("Não foi possível simular a sequência");
      captureDiagnostic(cause, {
        source: "async",
        component: "SequencesView",
        payload: { operation: "preview_sequence", sequenceId: sequence.id },
        recoverable: true,
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Automação comportamental
          </p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">Sequências e follow-ups</h2>
          <p className="mt-1 text-sm text-slate-500">
            Planeje a próxima ação da equipe sem depender de um canal conectado.
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-900">Nova sequência</h3>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Nome
                <input
                  className="mt-1.5 w-full rounded-lg border p-2.5 text-sm"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Recuperação de lead"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Gatilho
                <select
                  className="mt-1.5 w-full rounded-lg border bg-white p-2.5 text-sm"
                  value={trigger}
                  onChange={(event) => setTrigger(event.target.value as typeof trigger)}
                >
                  <option value="manual">Manual</option>
                  <option value="tag_added">Tag adicionada</option>
                  <option value="ticket_resolved">Ticket resolvido</option>
                  <option value="conversation_resolved">Conversa resolvida</option>
                </select>
              </label>
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={index} className="rounded-xl border bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">Passo {index + 1}</span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSteps((current) =>
                              current.filter((_, stepIndex) => stepIndex !== index),
                            )
                          }
                          className="text-xs font-bold text-red-600"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px]">
                      <select
                        className="rounded-lg border bg-white p-2 text-sm"
                        value={step.type}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, stepIndex) =>
                              stepIndex === index
                                ? { ...item, type: event.target.value as DraftStep["type"] }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="message">Mensagem</option>
                        <option value="task">Criar tarefa</option>
                        <option value="tag">Adicionar tag</option>
                        <option value="handoff">Transferir equipe</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-4 w-4" />
                        <input
                          className="w-full rounded-lg border p-2 text-sm"
                          type="number"
                          min={0}
                          max={43200}
                          value={step.delayMinutes}
                          onChange={(event) =>
                            setSteps((current) =>
                              current.map((item, stepIndex) =>
                                stepIndex === index
                                  ? { ...item, delayMinutes: Number(event.target.value) || 0 }
                                  : item,
                              ),
                            )
                          }
                        />{" "}
                        min
                      </label>
                    </div>
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-lg border bg-white p-2 text-sm"
                      value={step.body}
                      onChange={(event) =>
                        setSteps((current) =>
                          current.map((item, stepIndex) =>
                            stepIndex === index ? { ...item, body: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder={
                        step.type === "message"
                          ? "Olá, {{name}}! Posso ajudar?"
                          : "Descrição da ação"
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSteps((current) => [...current, { ...INITIAL_STEP, delayMinutes: 1440 }])
                  }
                  className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar passo
                </button>
                <button
                  type="button"
                  onClick={() => void create()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
                >
                  <Save className="h-4 w-4" />
                  Salvar rascunho
                </button>
              </div>
              {status && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {status}
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Sequências cadastradas</h3>
                <p className="text-xs text-slate-500">Ative só depois de revisar o preview.</p>
              </div>
              <Send className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">Carregando...</p>
              ) : sequences.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                  Nenhuma sequência criada.
                </p>
              ) : (
                sequences.map((sequence) => (
                  <article key={sequence.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-slate-900">{sequence.name}</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {sequence.steps.length} passos · gatilho {sequence.trigger}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${sequence.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {sequence.status}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void showPreview(sequence)}
                        className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      {sequence.status !== "draft" && sequence.status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => void toggle(sequence)}
                          className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <Pause className="h-3 w-3" />
                          Pausar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void toggle(sequence)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                        >
                          <Play className="h-3 w-3" />
                          Ativar
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
        {preview && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h3 className="font-bold text-slate-900">Preview: {preview.name}</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {preview.steps.map((step) => (
                <div key={step.position} className="rounded-xl border bg-white p-3 text-sm">
                  <p className="font-bold text-slate-800">
                    Passo {step.position + 1} · {step.type}
                  </p>
                  <p className="mt-1 text-slate-600">{step.body || "Ação operacional"}</p>
                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    {new Date(step.scheduledAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

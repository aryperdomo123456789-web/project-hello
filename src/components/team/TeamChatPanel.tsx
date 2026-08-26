import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  listTeamMessagesFn,
  sendTeamMessageFn,
  type TeamMessageDTO,
} from "@/functions/team-chat.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export function TeamChatPanel() {
  const listMessages = useServerFn(listTeamMessagesFn);
  const sendMessage = useServerFn(sendTeamMessageFn);
  const [messages, setMessages] = useState<TeamMessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMessages({ data: { limit: 50 } });
      setMessages(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar o chat interno");
      captureDiagnostic(cause, {
        source: "async",
        component: "TeamChatPanel",
        payload: { operation: "list_team_messages" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listMessages]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const message = await sendMessage({ data: { body: text } });
      setMessages((current) => [...current, message]);
      setBody("");
      toast.success("Mensagem enviada para a equipe");
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "TeamChatPanel",
        payload: { operation: "send_team_message" },
        state: { bodyLength: text.length },
        recoverable: true,
      });
      toast.error("Não foi possível enviar a mensagem");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="font-bold text-slate-900">Chat interno</h3>
            <p className="text-xs text-slate-500">
              Converse com a equipe sem contaminar o histórico do cliente.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Atualizar chat interno"
          className="rounded-lg border p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4">
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-2 font-bold underline">
              Tentar novamente
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Nenhuma mensagem interna ainda.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xs text-slate-700">{message.authorName}</strong>
                <time className="text-[10px] text-slate-400">
                  {new Date(message.createdAt).toLocaleString("pt-BR")}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{message.body}</p>
            </article>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          maxLength={4000}
          rows={2}
          placeholder="Escreva para a equipe... (Ctrl/Cmd + Enter envia)"
          className="min-h-12 flex-1 resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={sending || !body.trim()}
          className="self-end rounded-lg bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50"
          aria-label="Enviar mensagem interna"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

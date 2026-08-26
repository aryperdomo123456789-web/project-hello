import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  MoreVertical,
  Paperclip,
  Phone,
  Send,
  Smile,
  UserCheck,
  Video,
} from "lucide-react";

import type { Contact, Message } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ChatMessageAreaProps {
  contact: Contact;
  messages: Message[];
  onSendMessage: (text: string) => void;
  automationPaused: boolean;
  onClaim: () => void;
  onRelease: () => void;
  onResolve: () => void;
  onResumeAutomation: () => void;
  queueOptions: Array<{ id: string; name: string }>;
  onTransferToQueue: (queueId: string) => void;
}

export function ChatMessageArea({
  contact,
  messages,
  onSendMessage,
  automationPaused,
  onClaim,
  onRelease,
  onResolve,
  onResumeAutomation,
  queueOptions,
  onTransferToQueue,
}: ChatMessageAreaProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText("");
  };

  return (
    <div className="relative flex h-full flex-1 flex-col bg-[#f0f2f5]">
      <header className="z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600">
            {contact.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-bold leading-tight text-slate-900">{contact.name}</h3>
            <span className="text-xs font-medium text-slate-500">
              {contact.phone} · {automationPaused ? "Atendimento humano" : "Automação disponível"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          {!automationPaused ? (
            <button
              onClick={onClaim}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <UserCheck className="h-4 w-4" /> Assumir
            </button>
          ) : (
            <>
              <button
                onClick={onResumeAutomation}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-200"
              >
                <Bot className="h-4 w-4" /> Retomar robô
              </button>
              <button
                onClick={onRelease}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Devolver à fila
              </button>
            </>
          )}
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) onTransferToQueue(event.target.value);
            }}
            className="h-9 max-w-32 rounded-lg border bg-white px-2 text-xs text-slate-600"
            aria-label="Transferir para fila"
          >
            <option value="">Transferir</option>
            {queueOptions.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
          <button
            onClick={onResolve}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Resolver
          </button>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <button className="rounded-full p-2 transition-colors hover:bg-slate-100">
            <Video className="h-5 w-5" />
          </button>
          <button className="rounded-full p-2 transition-colors hover:bg-slate-100">
            <Phone className="h-5 w-5" />
          </button>
          <button className="rounded-full p-2 transition-colors hover:bg-slate-100">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto bg-[#e5ddd5] p-6 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-full bg-white/80 px-6 py-3 text-sm text-slate-500 shadow-sm">
              Nenhuma mensagem persistida para {contact.name}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex w-full", msg.sender === "me" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "relative max-w-[70%] rounded-xl p-3 shadow-sm",
                  msg.sender === "me"
                    ? "rounded-tr-none bg-[#dcf8c6] text-slate-900"
                    : "rounded-tl-none bg-white text-slate-900",
                )}
              >
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                  {msg.sender === "me" && (
                    <span className="text-[10px] text-blue-500">
                      {msg.type === "text" ? "✓✓" : "•"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <footer className="flex items-center gap-3 border-t bg-white p-4">
        <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <Smile className="h-6 w-6" />
        </button>
        <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <Paperclip className="h-6 w-6" />
        </button>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Digite uma mensagem..."
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSend();
            }}
            className="w-full rounded-full bg-slate-100 py-3 pl-4 pr-12 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {text.trim() ? (
          <button
            onClick={handleSend}
            className="rounded-full bg-blue-600 p-3 text-white shadow-lg transition-transform hover:bg-blue-700 active:scale-95"
          >
            <Send className="h-5 w-5" />
          </button>
        ) : (
          <button className="cursor-not-allowed rounded-full bg-slate-200 p-3 text-slate-500">
            <MicIcon />
          </button>
        )}
      </footer>
    </div>
  );
}

function MicIcon() {
  return <span className="text-sm font-bold">•••</span>;
}

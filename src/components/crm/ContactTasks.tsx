import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, ListTodo, Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  completeContactTaskFn,
  createContactTaskFn,
  listContactTasksFn,
  type ContactTaskDTO,
} from "@/functions/task.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export function ContactTasks({
  contactId,
  conversationId,
}: {
  contactId: string;
  conversationId?: string;
}) {
  const listTasks = useServerFn(listContactTasksFn);
  const createTask = useServerFn(createContactTaskFn);
  const completeTask = useServerFn(completeContactTaskFn);
  const [tasks, setTasks] = useState<ContactTaskDTO[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listTasks({ data: { contactId } });
      setTasks(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "ContactTasks",
        payload: { operation: "list_contact_tasks", contactId, conversationId },
        recoverable: true,
      });
    }
  }, [contactId, listTasks]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const task = await createTask({
        data: {
          contactId,
          ...(conversationId ? { conversationId } : {}),
          title: title.trim(),
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        },
      });
      setTasks((current) => [...current, task]);
      setTitle("");
      setDueAt("");
      toast.success("Follow-up criado");
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "ContactTasks",
        payload: { operation: "create_contact_task", contactId },
        state: { titleLength: title.trim().length },
        recoverable: true,
      });
      toast.error("Não foi possível criar o follow-up");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(taskId: string) {
    try {
      await completeTask({ data: { taskId } });
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, status: "completed" } : task)),
      );
      toast.success("Follow-up concluído");
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "ContactTasks",
        payload: { operation: "complete_contact_task", taskId },
        recoverable: true,
      });
      toast.error("Não foi possível concluir o follow-up");
    }
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  return (
    <section className="border-t p-6">
      <div className="flex items-center gap-2 text-slate-900">
        <ListTodo className="h-4 w-4" />
        <h4 className="text-xs font-bold uppercase tracking-widest">Follow-ups</h4>
      </div>
      <div className="mt-3 space-y-2">
        {openTasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2 rounded-lg border bg-slate-50 p-2">
            <button
              type="button"
              aria-label={`Concluir ${task.title}`}
              onClick={() => void handleComplete(task.id)}
              className="mt-0.5 rounded-full border bg-white p-1 text-emerald-600 hover:bg-emerald-50"
            >
              <Check className="h-3 w-3" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-700">{task.title}</p>
              {task.dueAt && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                  <CalendarClock className="h-3 w-3" />
                  {new Date(task.dueAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ))}
        {openTasks.length === 0 && (
          <p className="text-xs text-slate-400">Nenhum follow-up pendente.</p>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleCreate();
          }}
          placeholder="Novo follow-up..."
          className="h-9 w-full rounded-lg border px-3 text-xs outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[10px] text-slate-500"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!title.trim() || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      </div>
    </section>
  );
}

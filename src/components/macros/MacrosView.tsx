import { useCallback, useEffect, useState } from "react";
import { Archive, Edit3, Plus, RotateCcw, Save, Search, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  archiveMacroFn,
  createMacroFn,
  listMacrosFn,
  updateMacroFn,
  type MacroDTO,
} from "@/functions/macro.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

const EMPTY_FORM = { name: "", shortcut: "", body: "", category: "geral" };
type FormState = typeof EMPTY_FORM;

export function MacrosView() {
  const listMacros = useServerFn(listMacrosFn);
  const createMacro = useServerFn(createMacroFn);
  const updateMacro = useServerFn(updateMacroFn);
  const archiveMacro = useServerFn(archiveMacroFn);
  const [macros, setMacros] = useState<MacroDTO[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setMacros(await listMacros());
      setStatus("");
    } catch (cause) {
      setStatus("Não foi possível carregar as macros");
      captureDiagnostic(cause, {
        source: "async",
        component: "MacrosView",
        payload: { operation: "list_macros" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listMacros]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = macros.filter((macro) => {
    const haystack =
      `${macro.name} ${macro.shortcut} ${macro.body} ${macro.category}`.toLowerCase();
    return (showArchived || macro.isActive) && haystack.includes(query.toLowerCase());
  });

  function editMacro(macro: MacroDTO) {
    setEditingId(macro.id);
    setForm({
      name: macro.name,
      shortcut: macro.shortcut,
      body: macro.body,
      category: macro.category,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    try {
      setStatus("");
      const saved = editingId
        ? await updateMacro({ data: { id: editingId, ...form } })
        : await createMacro({ data: form });
      setMacros((current) =>
        editingId
          ? current.map((macro) => (macro.id === saved.id ? saved : macro))
          : [saved, ...current],
      );
      setStatus(editingId ? "Macro atualizada" : "Macro criada");
      resetForm();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Não foi possível salvar a macro");
      captureDiagnostic(cause, {
        source: "async",
        component: "MacrosView",
        payload: { operation: editingId ? "update_macro" : "create_macro" },
        recoverable: true,
      });
    }
  }

  async function toggle(macro: MacroDTO) {
    try {
      const saved = await archiveMacro({ data: { id: macro.id, isActive: !macro.isActive } });
      setMacros((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause) {
      setStatus("Não foi possível alterar a macro");
      captureDiagnostic(cause, {
        source: "async",
        component: "MacrosView",
        payload: { operation: "toggle_macro", macroId: macro.id },
        recoverable: true,
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Produtividade da equipe
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Macros e respostas rápidas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Padronize respostas sem deixar o atendente robótico.
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Nova macro
          </button>
        </header>
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl border bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Buscar macro, atalho ou categoria"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Arquivadas
              </label>
            </div>
            {status && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {status}
              </p>
            )}
            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">Carregando macros...</p>
              ) : visible.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                  <Wand2 className="mx-auto mb-2 h-5 w-5" />
                  Nenhuma macro encontrada.
                </div>
              ) : (
                visible.map((macro) => (
                  <article
                    key={macro.id}
                    className={`rounded-xl border p-4 ${macro.isActive ? "bg-white" : "bg-slate-50 opacity-70"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">{macro.name}</h3>
                          <code className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                            /{macro.shortcut}
                          </code>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                            {macro.category}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                          {macro.body}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => editMacro(macro)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={macro.isActive ? "Arquivar" : "Restaurar"}
                          onClick={() => void toggle(macro)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                        >
                          {macro.isActive ? (
                            <Archive className="h-4 w-4" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
          <section className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-900">
                {editingId ? "Editar macro" : "Criar macro"}
              </h3>
            </div>
            <div className="mt-5 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Nome
                <input
                  className="mt-1.5 w-full rounded-lg border p-2.5 text-sm"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Saudação inicial"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Atalho
                <input
                  className="mt-1.5 w-full rounded-lg border p-2.5 text-sm"
                  value={form.shortcut}
                  onChange={(event) =>
                    setForm({ ...form, shortcut: event.target.value.replace(/^\//, "") })
                  }
                  placeholder="saudacao"
                />
                <span className="mt-1 block font-normal normal-case text-slate-400">
                  Use letras, números, ponto, hífen ou sublinhado.
                </span>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Categoria
                <input
                  className="mt-1.5 w-full rounded-lg border p-2.5 text-sm"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="geral"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Mensagem
                <textarea
                  className="mt-1.5 min-h-32 w-full rounded-lg border p-2.5 text-sm"
                  value={form.body}
                  onChange={(event) => setForm({ ...form, body: event.target.value })}
                  placeholder="Olá, {{name}}! Como posso ajudar?"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
                >
                  <Save className="h-4 w-4" />
                  Salvar
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

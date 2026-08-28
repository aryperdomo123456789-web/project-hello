import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, FileUp, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  addBlacklistEntryFn,
  importBlacklistFn,
  listBlacklistFn,
  removeBlacklistEntryFn,
  type ContactBlacklistDTO,
} from "@/functions/contact.functions";

function parseBlacklistCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0]?.toLowerCase() ?? "";
  const hasHeader =
    first.includes("phone") || first.includes("telefone") || first.includes("whatsapp");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .slice(0, 5000)
    .map((line) => {
      const [phone = "", reason = "importado"] = line.split(/[;,]/).map((value) => value.trim());
      return { phone, reason: reason || "importado" };
    })
    .filter((row) => row.phone.length > 0);
}

export function ContactGovernancePanel() {
  const listBlacklist = useServerFn(listBlacklistFn);
  const addBlacklistEntry = useServerFn(addBlacklistEntryFn);
  const importBlacklist = useServerFn(importBlacklistFn);
  const removeBlacklistEntry = useServerFn(removeBlacklistEntryFn);
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ContactBlacklistDTO[]>([]);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("manual");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listBlacklist();
      setEntries(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar a blacklist");
    }
  }, [listBlacklist]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!phone.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const entry = await addBlacklistEntry({ data: { phone, reason } });
      setEntries((current) => [
        entry,
        ...current.filter((item) => item.phoneE164 !== entry.phoneE164),
      ]);
      setPhone("");
      setFeedback("Número bloqueado para esta organização.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível bloquear o número");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(file: File) {
    setLoading(true);
    setFeedback(null);
    try {
      const rows = parseBlacklistCsv(await file.text());
      if (!rows.length) throw new Error("CSV sem números válidos");
      const result = await importBlacklist({ data: { rows } });
      setEntries((current) => {
        const merged = new Map(current.map((item) => [item.phoneE164, item]));
        for (const item of result.entries) merged.set(item.phoneE164, item);
        return [...merged.values()];
      });
      setFeedback(`${result.imported} número(s) processado(s) na blacklist.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível importar a blacklist");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove(id: string) {
    setLoading(true);
    try {
      await removeBlacklistEntry({ data: { id } });
      setEntries((current) => current.filter((item) => item.id !== id));
      setFeedback("Número removido da blacklist.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível remover o número");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Ban className="h-4 w-4 text-rose-600" /> Governança de contatos
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Blacklist é isolada por organização e usa telefone normalizado em E.164. Opt-outs
            recebidos por SAIR, PARAR ou CANCELAR também bloqueiam novos envios.
          </p>
        </div>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
          {entries.length} bloqueado(s)
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+55 11 99999-9999"
          className="h-10 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-rose-500"
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo"
          className="h-10 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-rose-500"
        />
        <button
          type="button"
          disabled={loading || !phone.trim()}
          onClick={() => void handleAdd()}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Bloquear
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:border-rose-300 disabled:opacity-50"
        >
          <FileUp className="h-3.5 w-3.5" /> Importar CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
      </div>

      {feedback && (
        <p className="mt-3 text-xs font-semibold text-slate-600" role="status">
          {feedback}
        </p>
      )}

      <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
        {entries.length ? (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-xs"
            >
              <div>
                <p className="font-bold text-slate-800">{entry.phoneE164}</p>
                <p className="text-slate-500">
                  {entry.reason} · desde {new Date(entry.bannedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remover ${entry.phoneE164}`}
                disabled={loading}
                onClick={() => void handleRemove(entry.id)}
                className="rounded-md p-2 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Nenhum número em blacklist manual.
          </p>
        )}
      </div>
    </section>
  );
}

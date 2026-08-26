import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { importContactsFn } from "@/functions/contact.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("O CSV precisa conter cabeçalho e ao menos uma linha");
  const headers = lines[0]!.split(",").map((header) => header.trim().toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const waIdIndex = indexOf("waid") >= 0 ? indexOf("waid") : indexOf("whatsapp");
  if (waIdIndex < 0) throw new Error("O CSV precisa de uma coluna waId ou whatsapp");

  return lines.slice(1, 1001).flatMap((line) => {
    const values = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    const waId = values[waIdIndex]?.trim();
    if (!waId) return [];
    const phone = values[indexOf("phone")]?.trim();
    const name = values[indexOf("name")]?.trim();
    const email = values[indexOf("email")]?.trim();
    const tags = values[indexOf("tags")]
      ?.split(";")
      .map((tag) => tag.trim())
      .filter(Boolean);
    return [
      {
        waId,
        ...(phone ? { phone } : {}),
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(tags?.length ? { tags } : {}),
      },
    ];
  });
}

export function ContactImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importContacts = useServerFn(importContactsFn);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setLoading(true);
    setStatus(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("Nenhum contato válido encontrado");
      const result = await importContacts({ data: { rows } });
      setStatus(`${result.imported} contato(s) importado(s)`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao importar contatos");
      captureDiagnostic(error, {
        source: "async",
        component: "ContactImportButton",
        payload: { operation: "import_contacts", fileName: file.name, fileSize: file.size },
        recoverable: true,
      });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload className="h-4 w-4" />
        {loading ? "Importando..." : "Importar CSV"}
      </button>
      {status && <span className="max-w-48 text-xs text-slate-500">{status}</span>}
    </div>
  );
}

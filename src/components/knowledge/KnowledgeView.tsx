import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Globe2, Loader2, Search, Upload } from "lucide-react";

import {
  createKnowledgeDocumentFn,
  createKnowledgeFromUrlFn,
  searchKnowledgeFn,
} from "@/functions/knowledge.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export function KnowledgeView() {
  const createDocument = useServerFn(createKnowledgeDocumentFn);
  const createFromUrl = useServerFn(createKnowledgeFromUrlFn);
  const search = useServerFn(searchKnowledgeFn);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchKnowledgeFn>>>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleManual() {
    setLoading("manual");
    try {
      const result = await createDocument({ data: { title, content } });
      setStatus(
        result.created ? `${result.chunks} trechos publicados.` : "Documento já existente.",
      );
      if (result.created) {
        setTitle("");
        setContent("");
      }
    } catch (error) {
      setStatus("Não foi possível publicar o documento.");
      captureDiagnostic(error, {
        source: "async",
        component: "KnowledgeView",
        payload: { operation: "create_manual" },
        recoverable: true,
      });
    } finally {
      setLoading(null);
    }
  }

  async function handleUrl() {
    setLoading("url");
    try {
      const result = await createFromUrl({ data: { url } });
      setStatus(
        result.created ? `${result.chunks} trechos importados da fonte.` : "Fonte já importada.",
      );
      if (result.created) setUrl("");
    } catch (error) {
      setStatus("Não foi possível importar a URL.");
      captureDiagnostic(error, {
        source: "network",
        component: "KnowledgeView",
        payload: { operation: "create_from_url" },
        recoverable: true,
      });
    } finally {
      setLoading(null);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading("search");
    try {
      setResults(await search({ data: { query, limit: 5 } }));
    } catch (error) {
      setStatus("Não foi possível buscar na base.");
      captureDiagnostic(error, {
        source: "async",
        component: "KnowledgeView",
        payload: { operation: "search" },
        recoverable: true,
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto p-8">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <BookOpen className="h-7 w-7 text-blue-600" /> Base de Conhecimento
        </h2>
        <p className="mt-1 text-muted-foreground">
          Alimente especialistas com conteúdo da sua organização. Nada é enviado ao cliente
          automaticamente.
        </p>
      </header>
      {status && (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
          role="status"
        >
          {status}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="font-bold">Adicionar conteúdo manual</h3>
          <div className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título da política, FAQ ou catálogo"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              maxLength={180}
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Cole o conteúdo que o especialista poderá consultar..."
              className="min-h-40 w-full rounded-lg border px-3 py-2 text-sm"
              maxLength={200000}
            />
            <button
              type="button"
              onClick={() => void handleManual()}
              disabled={loading !== null || title.trim().length < 2 || content.trim().length < 20}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />{" "}
              {loading === "manual" ? "Publicando..." : "Publicar conhecimento"}
            </button>
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="font-bold">Importar uma fonte</h3>
          <p className="mt-1 text-xs text-slate-500">
            O servidor extrai conteúdo limpo e registra a URL original para auditoria.
          </p>
          <div className="mt-4 space-y-3">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://empresa.com/faq"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              inputMode="url"
            />
            <button
              type="button"
              onClick={() => void handleUrl()}
              disabled={loading !== null || !url.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 disabled:opacity-50"
            >
              <Globe2 className="h-4 w-4" /> {loading === "url" ? "Importando..." : "Importar URL"}
            </button>
          </div>
        </section>
      </div>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-bold">Testar recuperação</h3>
        <div className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSearch();
            }}
            placeholder="Ex.: qual o prazo de troca?"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading !== null || !query.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> Buscar
          </button>
        </div>
        {loading === "search" && <Loader2 className="mt-4 h-5 w-5 animate-spin text-blue-600" />}
        <div className="mt-4 space-y-3">
          {results.map((result) => (
            <article key={result.id} className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-bold text-blue-700">
                {Math.round(result.score * 100)}% · {result.title}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{result.content}</p>
              {result.sourceUrl && (
                <p className="mt-1 truncate text-xs text-slate-500">{result.sourceUrl}</p>
              )}
            </article>
          ))}
          {query && !loading && results.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum trecho encontrado nesta organização.</p>
          )}
        </div>
      </section>
    </div>
  );
}

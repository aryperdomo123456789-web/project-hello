import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import {
  captureDiagnostic,
  clearDiagnostics,
  getDiagnostics,
  installGlobalDiagnosticInterceptors,
  isDiagnosticsEnabled,
  registerDiagnosticRetry,
  requestDiagnosticRetry,
  subscribeDiagnostics,
  type DiagnosticRecord,
} from "@/lib/diagnostics";

const json = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export function ComponentFallback({
  title = "Esta área encontrou um problema",
  description = "O restante do painel continua disponível. Tente recarregar somente este componente.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Recarregar componente
        </button>
      )}
    </div>
  );
}

type BoundaryProps = {
  children: ReactNode;
  boundaryName: string;
  fallback?: ReactNode | ((retry: () => void) => ReactNode);
};

type BoundaryState = {
  error: Error | null;
  diagnosticId: string | null;
};

export class ResilientBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null, diagnosticId: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, diagnosticId: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const diagnostic = captureDiagnostic(error, {
      source: "render",
      component: this.props.boundaryName,
      payload: { componentStack: errorInfo.componentStack },
      handled: true,
      recoverable: true,
    });
    this.setState({ diagnosticId: diagnostic.id });
    registerDiagnosticRetry(diagnostic.id, () => this.retry());
  }

  override componentWillUnmount() {
    if (this.state.diagnosticId) registerDiagnosticRetry(this.state.diagnosticId, undefined);
  }

  private retry = () => {
    this.setState({ error: null, diagnosticId: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;
    if (typeof this.props.fallback === "function") return this.props.fallback(this.retry);
    if (this.props.fallback) return this.props.fallback;
    return <ComponentFallback onRetry={this.retry} />;
  }
}

type DiagnosticContextValue = {
  diagnostics: DiagnosticRecord[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  enabled: boolean;
  clear: () => void;
};

const DiagnosticContext = createContext<DiagnosticContextValue | null>(null);

export function useDiagnostics() {
  const context = useContext(DiagnosticContext);
  if (!context) throw new Error("useDiagnostics precisa estar dentro de DiagnosticProvider");
  return context;
}

function formatDiagnostic(record: DiagnosticRecord) {
  return [
    `Mago Bot diagnostic ${record.id}`,
    `Quando: ${record.timestamp}`,
    `Origem: ${record.source}`,
    `Mensagem: ${record.message}`,
    `Componente: ${record.location.component ?? "não identificado"}`,
    `Arquivo: ${record.location.file ?? "não identificado"}:${record.location.line ?? "?"}:${record.location.column ?? "?"}`,
    `Rota: ${record.route ?? "não identificada"}`,
    "\nStack:\n",
    record.stack,
    "\nEstado:\n",
    json(record.state),
    "\nPayload:\n",
    json(record.payload),
    "\nPlano de ação:\n",
    record.actionPlan.map((step, index) => `${index + 1}. ${step}`).join("\n"),
  ].join("\n");
}

function DiagnosticDrawer() {
  const { diagnostics, drawerOpen, setDrawerOpen, enabled, clear } = useDiagnostics();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = diagnostics.find((item) => item.id === selectedId) ?? diagnostics[0];

  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(!drawerOpen)}
        className="fixed bottom-4 right-4 z-[100] rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-xl hover:bg-slate-800"
        aria-label="Abrir diagnóstico"
      >
        Diagnóstico {diagnostics.length > 0 ? `(${diagnostics.length})` : ""}
      </button>
      {drawerOpen && (
        <aside className="fixed inset-y-0 right-0 z-[99] flex w-full max-w-xl flex-col border-l border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                Runtime diagnostics
              </p>
              <h2 className="mt-1 text-lg font-bold">Gaveta de falhas</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                Limpar logs
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[13rem_1fr]">
            <div className="overflow-y-auto border-b border-slate-800 p-3 md:border-b-0 md:border-r">
              {diagnostics.length === 0 ? (
                <p className="p-2 text-xs text-slate-400">Nenhum erro capturado.</p>
              ) : (
                <div className="space-y-2">
                  {diagnostics.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-lg border p-2 text-left ${selected?.id === item.id ? "border-cyan-400 bg-slate-800" : "border-slate-800 hover:bg-slate-900"}`}
                    >
                      <p className="truncate text-xs font-semibold">{item.message}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {item.source} · {new Date(item.timestamp).toLocaleTimeString("pt-BR")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected ? (
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-slate-400">
                  <span>ID {selected.id}</span>
                  <span>{selected.source}</span>
                  <span>{selected.location.component ?? "componente desconhecido"}</span>
                </div>
                <h3 className="mt-3 break-words text-base font-bold text-white">
                  {selected.message}
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  {selected.location.file ?? "Arquivo não identificado"}:
                  {selected.location.line ?? "?"}:{selected.location.column ?? "?"}
                </p>
                <section className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Stack trace
                  </p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-slate-300">
                    {selected.stack || "Sem stack disponível"}
                  </pre>
                </section>
                <section className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Estado local sanitizado
                  </p>
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-slate-300">
                    {json(selected.state)}
                  </pre>
                </section>
                <section className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Payload sanitizado
                  </p>
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-slate-300">
                    {json(selected.payload)}
                  </pre>
                </section>
                <section className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Plano de ação
                  </p>
                  <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-300">
                    {selected.actionPlan.map((step, index) => (
                      <li key={`${selected.id}-step-${index}`}>
                        <span className="mr-2 font-bold text-cyan-300">{index + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(formatDiagnostic(selected))}
                    className="rounded-md bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300"
                  >
                    Copiar diagnóstico completo
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDiagnosticRetry(selected.id)}
                    disabled={!selected.recoverable}
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Tentar recarregar componente
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-400">
                Selecione um diagnóstico para ver detalhes.
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

export function DiagnosticProvider({ children }: { children: ReactNode }) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticRecord[]>(() => getDiagnostics());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    installGlobalDiagnosticInterceptors();
    setEnabled(isDiagnosticsEnabled());
    const unsubscribe = subscribeDiagnostics(setDiagnostics);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const open = () => {
      setEnabled(true);
      setDrawerOpen(true);
    };
    window.addEventListener("mago:open-diagnostics", open);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mago:open-diagnostics", open);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const clear = useCallback(() => {
    clearDiagnostics();
    setDrawerOpen(false);
  }, []);
  const value = useMemo(
    () => ({ diagnostics, drawerOpen, setDrawerOpen, enabled, clear }),
    [diagnostics, drawerOpen, enabled, clear],
  );

  return (
    <DiagnosticContext.Provider value={value}>
      {children}
      <DiagnosticDrawer />
    </DiagnosticContext.Provider>
  );
}

export function openDiagnostics() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mago:open-diagnostics"));
}

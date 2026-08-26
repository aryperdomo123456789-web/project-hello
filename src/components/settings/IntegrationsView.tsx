import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Power,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  clearIntegrationFn,
  disableIntegrationFn,
  listIntegrationsFn,
  saveIntegrationFn,
  testIntegrationFn,
  type IntegrationSummaryDTO,
} from "@/functions/integrations.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

const runtimeLabels: Record<IntegrationSummaryDTO["runtimeStatus"], string> = {
  integrated: "Integrado",
  optional: "Opcional",
  prepared: "Preparado",
  planned: "Planejado",
  stub: "Stub / homologação",
};

const statusLabels: Record<IntegrationSummaryDTO["status"], string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  healthy: "Saudável",
  degraded: "Degradado",
  error: "Erro",
  disabled: "Desativado",
};

const statusClasses: Record<IntegrationSummaryDTO["status"], string> = {
  not_configured: "bg-slate-100 text-slate-600",
  configured: "bg-blue-50 text-blue-700",
  healthy: "bg-emerald-50 text-emerald-700",
  degraded: "bg-amber-50 text-amber-700",
  error: "bg-rose-50 text-rose-700",
  disabled: "bg-slate-100 text-slate-500",
};

export function IntegrationsView() {
  const listIntegrations = useServerFn(listIntegrationsFn);
  const saveIntegration = useServerFn(saveIntegrationFn);
  const disableIntegration = useServerFn(disableIntegrationFn);
  const clearIntegration = useServerFn(clearIntegrationFn);
  const testIntegration = useServerFn(testIntegrationFn);
  const [items, setItems] = useState<IntegrationSummaryDTO[]>([]);
  const [selected, setSelected] = useState<IntegrationSummaryDTO | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [model, setModel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listIntegrations());
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar a Central de APIs.");
      captureDiagnostic(cause, {
        source: "async",
        component: "IntegrationsView",
        payload: { operation: "list_integrations" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listIntegrations]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, IntegrationSummaryDTO[]>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {});
  }, [items]);

  function openEditor(item: IntegrationSummaryDTO) {
    setSelected(item);
    setEndpointUrl(item.endpointUrl ?? "");
    setModel(item.model ?? "");
    setCredentials({});
    setIsEnabled(item.isEnabled);
    setMessage(null);
    setError(null);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await saveIntegration({
        data: {
          provider: selected.provider,
          endpointUrl,
          model,
          isEnabled,
          credentials,
        },
      });
      setItems((current) =>
        current.map((item) => (item.provider === result.provider ? result : item)),
      );
      setSelected(result);
      setCredentials({});
      setMessage("Integração salva com cifragem server-side e auditoria registrada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a integração.");
      captureDiagnostic(cause, {
        source: "async",
        component: "IntegrationsView",
        payload: { operation: "save_integration", provider: selected.provider },
        recoverable: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!selected) return;
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await testIntegration({ data: { provider: selected.provider } });
      setItems((current) =>
        current.map((item) => (item.provider === result.provider ? result : item)),
      );
      setSelected(result);
      setMessage(
        result.status === "healthy"
          ? "Conexão validada com sucesso; o provider respondeu dentro do prazo."
          : (result.lastError ?? "O provider respondeu, mas precisa de atenção."),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível testar a integração.");
      captureDiagnostic(cause, {
        source: "network",
        component: "IntegrationsView",
        payload: { operation: "test_integration", provider: selected.provider },
        recoverable: true,
      });
    } finally {
      setTesting(false);
    }
  }

  async function disable() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await disableIntegration({ data: { provider: selected.provider } });
      setItems((current) =>
        current.map((item) => (item.provider === result.provider ? result : item)),
      );
      setSelected(result);
      setIsEnabled(false);
      setMessage(
        "Integração desativada. As credenciais permanecem cifradas para eventual reativação.",
      );
    } catch (cause) {
      setError("Não foi possível desativar a integração.");
      captureDiagnostic(cause, {
        source: "async",
        component: "IntegrationsView",
        payload: { operation: "disable_integration", provider: selected.provider },
        recoverable: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await clearIntegration({ data: { provider: selected.provider } });
      setItems((current) =>
        current.map((item) => (item.provider === result.provider ? result : item)),
      );
      setSelected(result);
      setCredentials({});
      setIsEnabled(false);
      setMessage("Credenciais removidas do banco. Nenhum valor secreto foi exibido.");
    } catch (cause) {
      setError("Não foi possível limpar a integração.");
      captureDiagnostic(cause, {
        source: "async",
        component: "IntegrationsView",
        payload: { operation: "clear_integration", provider: selected.provider },
        recoverable: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="m-8 animate-pulse rounded-2xl border bg-white p-8 text-sm text-slate-500">
        Carregando Central de APIs...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
              Governança de integrações
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Central de APIs</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Um cockpit único para providers de IA, busca, observabilidade, billing e WhatsApp. As
              chaves ficam cifradas no servidor; o navegador recebe apenas status e máscara.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Secrets server-side
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            icon={<KeyRound className="h-5 w-5" />}
            label="Providers no catálogo"
            value={String(items.length)}
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Configurados"
            value={String(items.filter((item) => item.status !== "not_configured").length)}
          />
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label="Com runtime integrado"
            value={String(items.filter((item) => item.runtimeStatus === "integrated").length)}
          />
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {Object.entries(grouped).map(([category, integrations]) => (
          <section key={category} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{category}</h3>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                {integrations.length}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {integrations.map((item) => (
                <article
                  key={item.provider}
                  className="flex min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-cyan-300">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{item.label}</h4>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {runtimeLabels[item.runtimeStatus]}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClasses[item.status]}`}
                    >
                      {statusLabels[item.status]}
                    </span>
                  </div>
                  <p className="mt-4 flex-1 text-xs leading-5 text-slate-600">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div>
                      {item.credentialPreview ? (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Chave cadastrada · mascarada
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sem credencial salva</span>
                      )}
                      {item.lastCheckedAt && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          Testado em {new Date(item.lastCheckedAt).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditor(item)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700"
                    >
                      Configurar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        {selected && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Configurar ${selected.label}`}
          >
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                    Configurar provider
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900">{selected.label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{selected.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {selected.credentialFields.map((field) => (
                  <label key={field.key} className="block text-xs font-bold text-slate-700">
                    {field.label}
                    {field.required ? " *" : ""}
                    {selected.credentialPreview?.[field.key] && (
                      <span className="ml-2 font-normal text-emerald-700">
                        Atual: {selected.credentialPreview[field.key]} · vazio mantém a atual
                      </span>
                    )}
                    <input
                      type={field.secret ? "password" : "text"}
                      autoComplete="new-password"
                      value={credentials[field.key] ?? ""}
                      onChange={(event) =>
                        setCredentials((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder={
                        selected.credentialPreview?.[field.key]
                          ? "Deixe vazio para manter"
                          : field.placeholder
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none ring-cyan-500 focus:ring-2"
                    />
                  </label>
                ))}
                {selected.endpointUrl !== undefined ||
                selected.provider === "evolution" ||
                selected.provider === "meta_cloud" ||
                selected.provider === "custom" ||
                selected.provider === "langfuse" ? (
                  <label className="block text-xs font-bold text-slate-700">
                    Endpoint/Base URL
                    <input
                      value={endpointUrl}
                      onChange={(event) => setEndpointUrl(event.target.value)}
                      placeholder="https://..."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none ring-cyan-500 focus:ring-2"
                    />
                  </label>
                ) : null}
                {selected.provider !== "mercadopago" &&
                  selected.provider !== "evolution" &&
                  selected.provider !== "meta_cloud" && (
                    <label className="block text-xs font-bold text-slate-700">
                      Modelo (opcional)
                      <input
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        placeholder="Modelo usado pelo runtime"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none ring-cyan-500 focus:ring-2"
                      />
                    </label>
                  )}
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(event) => setIsEnabled(event.target.checked)}
                  />
                  Habilitar para esta organização
                </label>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <strong>Importante:</strong> salvar a chave nesta tela não significa que o
                  provider já esteja conectado ao runtime. O status “Integrado” indica que existe
                  código de execução; “Preparado” ou “Planejado” exige implementação e homologação
                  antes de uso.
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  {selected.status !== "not_configured" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void disable()}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      <Power className="h-4 w-4" />
                      Desativar
                    </button>
                  )}
                  {selected.status !== "not_configured" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void clear()}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Limpar credenciais
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {selected.probeAvailable && (
                    <button
                      type="button"
                      disabled={busy || testing || !selected.credentialPreview}
                      onClick={() => void testConnection()}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                      {testing ? "Testando..." : "Testar conexão"}
                    </button>
                  )}
                  <a
                    href={selected.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Docs
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar integração
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="rounded-xl bg-cyan-50 p-2 text-cyan-700">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-2xl font-black text-slate-900">{value}</p>
      </div>
    </div>
  );
}

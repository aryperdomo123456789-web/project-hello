import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Megaphone, Pause, Play, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  createCampaignFn,
  listCampaignsFn,
  pauseCampaignFn,
  simulateCampaignFn,
  startCampaignFn,
  type CampaignDTO,
} from "@/functions/campaign.functions";
import { listContactsCRMFn, type ContactCRMDTO } from "@/functions/contact.functions";
import { listConnectionsFn, type ConnectionDTO } from "@/functions/channel.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export function CampaignsView() {
  const listCampaigns = useServerFn(listCampaignsFn);
  const listContacts = useServerFn(listContactsCRMFn);
  const listConnections = useServerFn(listConnectionsFn);
  const createCampaign = useServerFn(createCampaignFn);
  const startCampaign = useServerFn(startCampaignFn);
  const pauseCampaign = useServerFn(pauseCampaignFn);
  const simulateCampaign = useServerFn(simulateCampaignFn);
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [contacts, setContacts] = useState<ContactCRMDTO[]>([]);
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [channelConnectionId, setChannelConnectionId] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("Olá {{name}}, temos uma novidade para você.");
  const [dailyLimit, setDailyLimit] = useState("100");
  const [frequencyHours, setFrequencyHours] = useState("24");
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("10");
  const [sendWindowStart, setSendWindowStart] = useState("08:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("20:00");
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    eligible: number;
    skipped: number;
    blockedByOptOut: number;
    mode: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [campaignRows, contactRows, connectionRows] = await Promise.all([
        listCampaigns(),
        listContacts(),
        listConnections(),
      ]);
      setCampaigns(Array.isArray(campaignRows) ? campaignRows : []);
      const safeConnections = Array.isArray(connectionRows) ? connectionRows : [];
      setConnections(safeConnections);
      setChannelConnectionId(
        (current) =>
          current ||
          safeConnections.find((item) => item.status === "connected")?.id ||
          safeConnections[0]?.id ||
          "",
      );
      const safeContacts = Array.isArray(contactRows) ? contactRows : [];
      setContacts(safeContacts);
      setSelectedContacts((current) =>
        current.filter((id) => safeContacts.some((contact) => contact.id === id)),
      );
    } catch (error) {
      setStatus("Não foi possível carregar campanhas e contatos");
      captureDiagnostic(error, {
        source: "async",
        component: "CampaignsView",
        payload: { operation: "load_campaigns" },
        recoverable: true,
      });
    }
  }, [listCampaigns, listContacts, listConnections]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCount = selectedContacts.length;
  const canCreate =
    name.trim().length >= 2 &&
    template.trim().length > 0 &&
    selectedCount > 0 &&
    channelConnectionId.length > 0 &&
    !loading;
  const selectedContactSet = useMemo(() => new Set(selectedContacts), [selectedContacts]);

  function toggleContact(contactId: string) {
    setSelectedContacts((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  async function handleCreate() {
    if (!canCreate) return;
    setLoading(true);
    setStatus(null);
    try {
      const campaign = await createCampaign({
        data: {
          name: name.trim(),
          messageTemplate: template.trim(),
          contactIds: selectedContacts,
          channelConnectionId,
          dailyLimit: Number(dailyLimit) || 100,
          frequencyHours: Number(frequencyHours) || 24,
          rateLimitPerMinute: Number(rateLimitPerMinute) || 10,
          sendWindowStart,
          sendWindowEnd,
        },
      });
      setCampaigns((current) => [...current, campaign]);
      setName("");
      setStatus(
        "Campanha criada. Revise a prévia e clique em Disparar para iniciar o broadcast controlado.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar a campanha");
      captureDiagnostic(error, {
        source: "async",
        component: "CampaignsView",
        payload: { operation: "create_campaign", selectedCount, channelConnectionId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(campaignId: string) {
    setLoading(true);
    setStatus(null);
    try {
      const updated = await startCampaign({ data: { campaignId } });
      setCampaigns((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus(
        "Broadcast enfileirado. O worker respeitará janela, opt-out, frequência e rate limit.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a campanha");
      captureDiagnostic(error, {
        source: "async",
        component: "CampaignsView",
        payload: { operation: "start_campaign", campaignId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePause(campaignId: string) {
    setLoading(true);
    setStatus(null);
    try {
      const updated = await pauseCampaign({ data: { campaignId } });
      setCampaigns((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus("Campanha pausada. Nenhum novo destinatário será processado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível pausar a campanha");
      captureDiagnostic(error, {
        source: "async",
        component: "CampaignsView",
        payload: { operation: "pause_campaign", campaignId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview(campaignId: string) {
    setLoading(true);
    setStatus(null);
    try {
      const result = await simulateCampaign({ data: { campaignId } });
      setPreview(result);
      setStatus("Prévia calculada sem disparo externo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível simular a campanha");
      captureDiagnostic(error, {
        source: "async",
        component: "CampaignsView",
        payload: { operation: "simulate_campaign", campaignId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Campanhas controladas
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Follow-up sem spam</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Crie campanhas com canal explícito, opt-out, frequência, janela de horário e rate
              limit. A prévia é segura; o disparo só começa após sua confirmação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-700 hover:border-blue-300"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </header>

        {status && (
          <div
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
            role="status"
          >
            {status}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-900">Nova campanha</h3>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Nome
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Reativação de leads"
                  className="mt-1 h-10 w-full rounded-lg border px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Mensagem
                <textarea
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="mt-1 block text-xs font-normal text-slate-400">
                  Use {"{{name}}"} e {"{{phone}}"} para personalizar.
                </span>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Canal de envio
                <select
                  value={channelConnectionId}
                  onChange={(event) => setChannelConnectionId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border bg-white px-3 font-normal"
                >
                  <option value="">Selecione um canal</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name} · {connection.status} ·{" "}
                      {connection.transport === "mago_bot_api" ? "API Mago Bot" : "legado"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Limite/dia
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={dailyLimit}
                    onChange={(event) => setDailyLimit(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Frequência (horas)
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={frequencyHours}
                    onChange={(event) => setFrequencyHours(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Rate limit/minuto
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={rateLimitPerMinute}
                    onChange={(event) => setRateLimitPerMinute(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Janela inicial
                  <input
                    type="time"
                    value={sendWindowStart}
                    onChange={(event) => setSendWindowStart(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Janela final
                  <input
                    type="time"
                    value={sendWindowEnd}
                    onChange={(event) => setSendWindowEnd(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Contatos ({selectedCount} selecionado(s))
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedContacts(
                        selectedContacts.length === contacts.length
                          ? []
                          : contacts.map((contact) => contact.id),
                      )
                    }
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {selectedContacts.length === contacts.length ? "Limpar" : "Selecionar todos"}
                  </button>
                </div>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {contacts.length ? (
                    contacts.slice(0, 100).map((contact) => (
                      <label
                        key={contact.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedContactSet.has(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                        />
                        <span className="truncate">
                          {contact.name}{" "}
                          <span className="text-xs text-slate-400">
                            {contact.phone ?? contact.waId}
                          </span>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="p-3 text-xs text-slate-400">
                      Importe contatos no CRM antes de criar uma campanha.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => void handleCreate()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Criar campanha
              </button>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-900">Campanhas criadas</h3>
            <div className="mt-4 space-y-3">
              {campaigns.length ? (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{campaign.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.status} · limite {campaign.dailyLimit}/dia · rate{" "}
                          {campaign.rateLimitPerMinute}/min · enviados {campaign.sentCount} · falhas{" "}
                          {campaign.failedCount}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(campaign.status === "draft" ||
                          campaign.status === "paused" ||
                          campaign.status === "scheduled") && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleStart(campaign.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
                          >
                            <Play className="h-3.5 w-3.5" /> Disparar
                          </button>
                        )}
                        {campaign.status === "running" && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handlePause(campaign.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline"
                          >
                            <Pause className="h-3.5 w-3.5" /> Pausar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void handlePreview(campaign.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" /> Prévia
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhuma campanha criada ainda.
                </p>
              )}
            </div>
            {preview && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-bold">Prévia de elegibilidade</p>
                <p className="mt-2">
                  Elegíveis: <strong>{preview.eligible}</strong> · Ignorados:{" "}
                  <strong>{preview.skipped}</strong> · Opt-out:{" "}
                  <strong>{preview.blockedByOptOut}</strong>
                </p>
                <p className="mt-2 text-xs">
                  Modo: {preview.mode}. Esta etapa não dispara mensagens.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Power, PowerOff, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureDiagnostic } from "@/lib/diagnostics";
import {
  createConnectionFn,
  disconnectConnectionFn,
  getConnectionQrFn,
  getConnectionStatusFn,
  listConnectionsFn,
  reconnectConnectionFn,
  type ConnectionDTO,
} from "@/functions/channel.functions";

function qrSrc(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;
  if (normalized.startsWith("https://")) return normalized;
  if (/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    return `data:image/png;base64,${normalized.replace(/\s/g, "")}`;
  }
  return null;
}

function reportConnectionError(
  error: unknown,
  operation: string,
  payload: Record<string, unknown> = {},
) {
  captureDiagnostic(error, {
    source: "network",
    component: "ConnectionsView",
    payload: { operation, ...payload },
    recoverable: true,
  });
}

function statusLabel(status: string, rawStatus?: string | null) {
  if (rawStatus === "open" || status === "connected") return "Conectado";
  if (rawStatus === "qrcode" || rawStatus === "qr" || status === "connecting")
    return "Aguardando QR";
  if (rawStatus === "close" || rawStatus === "closed" || status === "disconnected")
    return "Desconectado";
  if (status === "error") return "Erro";
  return rawStatus || "Desconhecido";
}

export function ConnectionsView() {
  const listConnections = useServerFn(listConnectionsFn);
  const createConnection = useServerFn(createConnectionFn);
  const getConnectionQr = useServerFn(getConnectionQrFn);
  const getConnectionStatus = useServerFn(getConnectionStatusFn);
  const reconnectConnection = useServerFn(reconnectConnectionFn);
  const disconnectConnection = useServerFn(disconnectConnectionFn);
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrConnectionId, setQrConnectionId] = useState<string | null>(null);
  const [qrConnectionName, setQrConnectionName] = useState("");
  const [qrStatus, setQrStatus] = useState("connecting");
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptRef = useRef(0);
  const pollingActiveRef = useRef(false);

  const loadConnections = useCallback(async () => {
    try {
      const rows = await listConnections();
      setConnections(Array.isArray(rows) ? rows : []);
      setViewError(null);
    } catch (error) {
      setViewError("Não foi possível carregar as conexões");
      reportConnectionError(error, "list_connections");
      toast.error(error instanceof Error ? error.message : "Erro ao carregar conexões");
    }
  }, [listConnections]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function handleCreateConnection() {
    const name = newName.trim() || window.prompt("Nome do número de WhatsApp:")?.trim() || "";
    if (!name) return;

    setLoading(true);
    try {
      const connection = await createConnection({ data: { name } });
      setConnections((current) => [connection, ...current]);
      setNewName("");
      toast.success("Conexão criada. Gere o QR Code para parear o WhatsApp.");
    } catch (error) {
      reportConnectionError(error, "create_connection", { nameLength: name.length });
      toast.error(error instanceof Error ? error.message : "Erro ao criar conexão");
    } finally {
      setLoading(false);
    }
  }

  const stopQrPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const scheduleQrPolling = useCallback(
    (connectionId: string) => {
      stopQrPolling();
      pollingActiveRef.current = true;
      const attempt = pollAttemptRef.current;
      const delay = Math.min(1_000 * 2 ** attempt, 10_000);
      pollTimerRef.current = setTimeout(() => {
        void (async () => {
          if (!pollingActiveRef.current) return;
          try {
            const updated = await getConnectionStatus({ data: { connectionId } });
            setConnections((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setQrStatus(updated.rawStatus ?? updated.status);
            if (updated.status === "connected") {
              stopQrPolling();
              setShowQrModal(false);
              toast.success("WhatsApp conectado com sucesso.");
              return;
            }
            if (attempt % 2 === 0) {
              const qr = await getConnectionQr({ data: { connectionId } });
              const imageSource = qrSrc(qr.base64);
              if (imageSource) setQrCodeData(imageSource);
              setQrExpiresAt(qr.expiresAt ?? null);
            }
            pollAttemptRef.current = Math.min(attempt + 1, 6);
            scheduleQrPolling(connectionId);
          } catch (error) {
            reportConnectionError(error, "poll_connection_status", { connectionId, attempt });
            pollAttemptRef.current = Math.min(attempt + 1, 6);
            scheduleQrPolling(connectionId);
          }
        })();
      }, delay);
    },
    [getConnectionQr, getConnectionStatus, stopQrPolling],
  );

  useEffect(() => () => stopQrPolling(), [stopQrPolling]);

  async function handleConnect(connection: ConnectionDTO) {
    setLoading(true);
    try {
      const qr = await getConnectionQr({ data: { connectionId: connection.id } });
      const imageSource = qrSrc(qr.base64);
      if (!imageSource) throw new Error("O provedor retornou um QR Code inválido");
      setQrCodeData(imageSource);
      setQrConnectionId(connection.id);
      setQrConnectionName(connection.name);
      setQrStatus(connection.rawStatus ?? "qrcode");
      setQrExpiresAt(qr.expiresAt ?? null);
      pollAttemptRef.current = 0;
      setShowQrModal(true);
      setConnections((current) =>
        current.map((item) =>
          item.id === connection.id ? { ...item, status: "connecting", rawStatus: "qrcode" } : item,
        ),
      );
      scheduleQrPolling(connection.id);
    } catch (error) {
      reportConnectionError(error, "get_connection_qr", { connectionId: connection.id });
      toast.error(error instanceof Error ? error.message : "Erro ao obter QR Code");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatus(connection: ConnectionDTO) {
    setLoading(true);
    try {
      const updated = await getConnectionStatus({ data: { connectionId: connection.id } });
      setConnections((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(`Status atualizado: ${statusLabel(updated.status, updated.rawStatus)}`);
    } catch (error) {
      reportConnectionError(error, "get_connection_status", { connectionId: connection.id });
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar status");
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnect(connection: ConnectionDTO) {
    setLoading(true);
    try {
      const updated = await reconnectConnection({ data: { connectionId: connection.id } });
      setConnections((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Reconexão iniciada. Aguarde o status ou gere um novo QR Code.");
    } catch (error) {
      reportConnectionError(error, "reconnect_connection", { connectionId: connection.id });
      toast.error(error instanceof Error ? error.message : "Erro ao reconectar");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(connection: ConnectionDTO) {
    if (!window.confirm(`Desconectar ${connection.name}?`)) return;
    setLoading(true);
    try {
      await disconnectConnection({ data: { connectionId: connection.id } });
      setConnections((current) =>
        current.map((item) =>
          item.id === connection.id ? { ...item, status: "disconnected" } : item,
        ),
      );
      toast.success("Conexão desconectada.");
    } catch (error) {
      reportConnectionError(error, "disconnect_connection", { connectionId: connection.id });
      toast.error(error instanceof Error ? error.message : "Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 p-8 animate-in fade-in duration-500">
      {viewError && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <span>{viewError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadConnections()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Conexões & Números</h2>
          <p className="text-muted-foreground">
            Cada número pode ter seu próprio especialista e fluxo de atendimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            placeholder="Nome do número"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreateConnection();
            }}
          />
          <Button
            onClick={() => void handleCreateConnection()}
            disabled={loading}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Nova conexão
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="shadow-sm md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" /> Segurança
            </CardTitle>
            <CardDescription>As credenciais ficam no servidor, não no navegador.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Provedor configurado no ambiente</p>
              <p className="mt-1">
                O painel nunca salva API key em localStorage. O backend controla licença, conexão e
                envio.
              </p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-800">
              <p className="font-semibold">Regra de ouro</p>
              <p className="mt-1">
                Um número, um fluxo ativo. A inbox pode ser única, mas a automação não mistura
                operações.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:col-span-2">
          {connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-slate-50 p-12 text-slate-500">
              <Link className="mb-4 h-12 w-12 opacity-20" />
              <p>Nenhum número conectado. Crie o primeiro para começar.</p>
            </div>
          ) : (
            connections.map((connection) => (
              <Card
                key={connection.id}
                className="overflow-hidden transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`rounded-full p-3 ${connection.status === "connected" ? "bg-green-100 text-green-600" : connection.status === "connecting" ? "bg-yellow-100 text-yellow-600" : "bg-slate-100 text-slate-600"}`}
                    >
                      <Power className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold">{connection.name}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            connection.status === "connected"
                              ? ("success" as never)
                              : connection.status === "connecting"
                                ? ("warning" as never)
                                : "secondary"
                          }
                        >
                          {statusLabel(connection.status, connection.rawStatus)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {connection.displayPhone ?? connection.provider}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {connection.transport === "mago_bot_api" ? "API Mago Bot" : "Modo legado"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleStatus(connection)}
                      disabled={loading}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Status
                    </Button>
                    {connection.status !== "connected" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleConnect(connection)}
                          disabled={loading}
                          className="gap-2"
                        >
                          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Gerar
                          QR Code
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleReconnect(connection)}
                          disabled={loading}
                          className="gap-2"
                        >
                          <Power className="h-4 w-4" /> Reconectar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDisconnect(connection)}
                        disabled={loading}
                        className="gap-2"
                      >
                        <PowerOff className="h-4 w-4" /> Desconectar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {showQrModal && qrCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
              <CardTitle>Conectar {qrConnectionName}</CardTitle>
              <CardDescription>Abra o WhatsApp no celular e escaneie este QR Code.</CardDescription>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Badge
                  variant={
                    qrStatus === "open" || qrStatus === "connected"
                      ? ("success" as never)
                      : ("warning" as never)
                  }
                >
                  {statusLabel(qrStatus === "open" ? "connected" : "connecting", qrStatus)}
                </Badge>
                {qrConnectionId && (
                  <span className="text-[10px] text-slate-400">polling ativo</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-6">
              <div className="mb-4 rounded-xl border bg-white p-4 shadow-inner">
                <img
                  src={qrSrc(qrCodeData) ?? ""}
                  alt={`QR Code de ${qrConnectionName}`}
                  className="h-64 w-64"
                />
              </div>
              {qrExpiresAt && (
                <p className="mb-4 text-center text-xs text-slate-500">
                  QR válido até {new Date(qrExpiresAt).toLocaleTimeString("pt-BR")}. O painel renova
                  automaticamente.
                </p>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  stopQrPolling();
                  setShowQrModal(false);
                  setQrConnectionId(null);
                }}
                className="w-full"
              >
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

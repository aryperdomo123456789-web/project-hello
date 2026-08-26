import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, Power, PowerOff, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createConnectionFn,
  disconnectConnectionFn,
  getConnectionQrFn,
  listConnectionsFn,
  type ConnectionDTO,
} from "@/functions/channel.functions";

function qrSrc(value: string) {
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://"))
    return value;
  return `data:image/png;base64,${value}`;
}

function statusLabel(status: string) {
  if (status === "connected") return "Conectado";
  if (status === "connecting") return "Aguardando QR";
  if (status === "error") return "Erro";
  return "Desconectado";
}

export function ConnectionsView() {
  const listConnections = useServerFn(listConnectionsFn);
  const createConnection = useServerFn(createConnectionFn);
  const getConnectionQr = useServerFn(getConnectionQrFn);
  const disconnectConnection = useServerFn(disconnectConnectionFn);
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrConnectionName, setQrConnectionName] = useState("");

  async function loadConnections() {
    try {
      setConnections(await listConnections());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar conexões");
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

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
      toast.error(error instanceof Error ? error.message : "Erro ao criar conexão");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(connection: ConnectionDTO) {
    setLoading(true);
    try {
      const qr = await getConnectionQr({ data: { connectionId: connection.id } });
      setQrCodeData(qr.base64);
      setQrConnectionName(connection.name);
      setShowQrModal(true);
      setConnections((current) =>
        current.map((item) =>
          item.id === connection.id ? { ...item, status: "connecting" } : item,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao obter QR Code");
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
      toast.error(error instanceof Error ? error.message : "Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 p-8 animate-in fade-in duration-500">
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
                          {statusLabel(connection.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {connection.displayPhone ?? connection.provider}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {connection.status !== "connected" ? (
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
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-6">
              <div className="mb-6 rounded-xl border bg-white p-4 shadow-inner">
                <img
                  src={qrSrc(qrCodeData)}
                  alt={`QR Code de ${qrConnectionName}`}
                  className="h-64 w-64"
                />
              </div>
              <Button variant="secondary" onClick={() => setShowQrModal(false)} className="w-full">
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

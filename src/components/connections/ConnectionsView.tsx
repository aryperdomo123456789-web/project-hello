import { useState, useEffect } from 'react';
import { evolutionApi } from '@/services/evolutionApi';
import { Instance } from '@/types/evolution';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Link, Power, PowerOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export function ConnectionsView() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    try {
      const data = await evolutionApi.fetchInstances();
      setInstances(data);
    } catch (error) {
      toast.error('Erro ao carregar instâncias');
    }
  };

  const handleSaveConfig = () => {
    evolutionApi.setConfig(apiUrl, apiKey);
    toast.success('Configuração da Evolution API salva com sucesso!');
  };

  const handleCreateInstance = async () => {
    const name = prompt('Nome da nova instância:');
    if (!name) return;
    
    setLoading(true);
    try {
      const newInstance = await evolutionApi.createInstance(name);
      setInstances([...instances, newInstance]);
      toast.success('Instância criada! Conecte agora para gerar o QR Code.');
    } catch (error) {
      toast.error('Erro ao criar instância');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (id: string) => {
    setLoading(true);
    try {
      const qr = await evolutionApi.getQrCode(id);
      setQrCodeData(qr.base64);
      setShowQrModal(id);
    } catch (error) {
      toast.error('Erro ao obter QR Code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Tem certeza que deseja desconectar?')) return;
    try {
      await evolutionApi.disconnectInstance(id);
      setInstances(instances.map(i => i.id === id ? { ...i, status: 'disconnected' } : i));
      toast.success('Instância desconectada');
    } catch (error) {
      toast.error('Erro ao desconectar');
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Conexões & Instâncias</h2>
          <p className="text-muted-foreground">Gerencie suas instâncias do WhatsApp via Evolution API.</p>
        </div>
        <Button onClick={handleCreateInstance} disabled={loading} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Instância
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Configurações Globais */}
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" /> API Config
            </CardTitle>
            <CardDescription>Defina as credenciais globais da sua API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiUrl">Evolution API URL</Label>
              <Input 
                id="apiUrl" 
                placeholder="https://api.seuservidor.com" 
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">Global API Key</Label>
              <Input 
                id="apiKey" 
                type="password" 
                placeholder="Sua chave secreta" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveConfig} className="w-full">Salvar Configuração</Button>
          </CardContent>
        </Card>

        {/* Listagem de Instâncias */}
        <div className="md:col-span-2 grid grid-cols-1 gap-4">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-slate-50 text-slate-500">
              <Link className="w-12 h-12 mb-4 opacity-20" />
              <p>Nenhuma instância encontrada. Crie uma para começar.</p>
            </div>
          ) : (
            instances.map((instance) => (
              <Card key={instance.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${
                      instance.status === 'connected' ? 'bg-green-100 text-green-600' : 
                      instance.status === 'connecting' ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Power className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{instance.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={
                          instance.status === 'connected' ? 'success' as any : 
                          instance.status === 'connecting' ? 'warning' as any : 'secondary'
                        }>
                          {instance.status === 'connected' ? 'Conectado' : 
                           instance.status === 'connecting' ? 'Aguardando QR' : 'Desconectado'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">ID: {instance.id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {instance.status !== 'connected' ? (
                      <Button variant="outline" size="sm" onClick={() => handleConnect(instance.id)} disabled={loading} className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 
                        {instance.status === 'connecting' ? 'Gerar QR Code' : 'Conectar'}
                      </Button>
                    ) : (
                      <Button variant="destructive" size="sm" onClick={() => handleDisconnect(instance.id)} className="gap-2">
                        <PowerOff className="w-4 h-4" /> Desconectar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* QR Code Modal Simulation */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
              <CardTitle>Escaneie o QR Code</CardTitle>
              <CardDescription>Abra o WhatsApp no seu celular e escaneie para conectar a instância.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-6">
              <div className="bg-white p-4 rounded-xl border shadow-inner mb-6">
                <img src={qrCodeData || ''} alt="QR Code" className="w-64 h-64" />
              </div>
              <Button variant="secondary" onClick={() => setShowQrModal(null)} className="w-full">
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { Instance, QrCodeResponse, SendMessagePayload } from '@/types/evolution';

// Mock de configuração para simulação
let config = {
  apiUrl: '',
  apiKey: '',
};

export const evolutionApi = {
  setConfig: (apiUrl: string, apiKey: string) => {
    config = { apiUrl, apiKey };
  },

  createInstance: async (name: string): Promise<Instance> => {
    console.log(`[EvolutionAPI] Criando instância: ${name}`);
    // Simulação de delay
    await new Promise(r => setTimeout(r, 1000));
    return {
      id: Math.random().toString(36).substr(2, 9),
      name,
      status: 'connecting',
    };
  },

  getQrCode: async (instanceId: string): Promise<QrCodeResponse> => {
    console.log(`[EvolutionAPI] Obtendo QR Code para: ${instanceId}`);
    await new Promise(r => setTimeout(r, 800));
    return {
      code: 'dummy-qr-code-string',
      base64: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LovableEvolutionAPI',
    };
  },

  sendMessage: async (instanceId: string, payload: SendMessagePayload) => {
    console.log(`[EvolutionAPI] Enviando mensagem via ${instanceId}:`, payload);
    await new Promise(r => setTimeout(r, 500));
    return { status: 'sent' };
  },

  disconnectInstance: async (instanceId: string) => {
    console.log(`[EvolutionAPI] Desconectando: ${instanceId}`);
    await new Promise(r => setTimeout(r, 500));
    return { status: 'disconnected' };
  },

  fetchInstances: async (): Promise<Instance[]> => {
    // Simulação de lista de instâncias
    return [
      { id: '1', name: 'Comercial 01', status: 'connected' },
      { id: '2', name: 'Suporte Técnico', status: 'disconnected' },
    ];
  }
};

export interface Instance {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  webhookUrl?: string;
}

export interface QrCodeResponse {
  code: string;
  base64: string;
}

export interface SendMessagePayload {
  number: string;
  text: string;
}

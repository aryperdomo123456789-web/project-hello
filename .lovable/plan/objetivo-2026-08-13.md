---
name: Integração Evolution API
description: Estruturar a camada de integração com Evolution API, incluindo serviços, tipos e tela de gerenciamento de instâncias.
type: feature
---

## Objetivo
Implementar a gestão de instâncias do WhatsApp via Evolution API no SaaS OmniChat.

## Arquitetura e Componentes
1.  **Serviços (`src/services/evolutionApi.ts`)**:
    *   Cliente centralizado para chamadas à Evolution API.
    *   Métodos: `createInstance`, `getQrCode`, `sendMessage`, `disconnectInstance`, `fetchInstances`.
    *   Uso de variáveis de ambiente para `API_URL` e `GLOBAL_KEY`.

2.  **Tipagem (`src/types/evolution.ts`)**:
    *   Interfaces para `Instance`, `QrCodeResponse`, `WebhookPayload`.
    *   Enums para status de conexão.

3.  **UI de Conexões (`src/components/connections/`)**:
    *   `InstanceList`: Listagem de instâncias com status em tempo real.
    *   `ConnectionForm`: Modal/Formulário para configurar endpoint e chave global.
    *   `QrCodeModal`: Exibição do QR Code para pareamento.

4.  **Integração no Dashboard**:
    *   Navegação para a aba de "Conexões".
    *   Exibição do status global na Topbar.

## Detalhes Técnicos
*   Utilização de `TanStack Query` (opcional, mas recomendado para estado de servidor) ou `useState/useEffect` para dados simulados/reais.
*   Tratamento de erros e feedback visual (loading/error states).

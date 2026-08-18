# Plano Completo de Produção - SaaS OmniChat (Baseado no SAC Mais)

Este documento detalha a arquitetura, funcionalidades e o roteiro de desenvolvimento para a plataforma de multiatendimento omnichannel.

## 1. Visão Geral do Produto
O SaaS OmniChat é uma solução profissional de atendimento que permite centralizar múltiplos atendentes em um único número de WhatsApp, com gestão por setores, automações inteligentes e relatórios analíticos.

## 2. Arquitetura Técnica
- **Frontend:** React 19, TanStack Start, Tailwind CSS (Modo Claro/Escuro).
- **Backend:** TanStack Server Functions integradas com a Evolution API.
- **Banco de Dados & Auth:** Lovable Cloud (PostgreSQL + RLS + Auth).
- **Integração:** Evolution API (v2) para gerenciamento de instâncias WhatsApp.

## 3. Módulos e Funcionalidades

### A. Módulo de Atendimento (Chat)
- **Interface Tripartite:** Lista de conversas, Janela de Chat, Perfil do Contato.
- **Filtros Avançados:** Abas de "Abertas", "Aguardando" e "Resolvidas".
- **Rich Media:** Envio de áudios, anexos e respostas rápidas.

### B. Gestão de CRM & Setores
- **Setores:** Criação de departamentos (Comercial, Suporte, Financeiro).
- **Permissões:** Controle de acesso de atendentes por setor.
- **Kanban:** Visualização de funil de vendas integrado ao chat.

### C. Conexões & Instâncias
- **Multi-instância:** Gerenciamento de múltiplas conexões da Evolution API.
- **Status em Tempo Real:** Monitoramento de conexão via Webhooks.
- **Pareamento Facilitado:** Geração de QR Code via interface.

### D. Automação (Chatbots)
- **Fluxos Visuais:** Construtor de bots com botões e listas.
- **Interação Humana:** Transbordo inteligente para atendentes humanos.
- **Mensagens Automáticas:** Boas-vindas e ausência.

### E. Dashboard & Relatórios
- **KPIs:** Tempo Médio de Atendimento (TMA), Tempo Médio de Espera (TME).
- **Performance:** Volume de atendimentos por atendente/setor.
- **CSAT:** Avaliação de satisfação do cliente após resolução.

## 4. Cronograma de Implementação

1. **Fase 1 (Atual):** Estrutura Base & Mock Data (Design System, Sidebar, Chat Layout).
2. **Fase 2:** Integração com Evolution API (Serviços, Gerenciamento de Instâncias, QR Code).
3. **Fase 3:** Persistência de Dados & Auth (Lovable Cloud, RLS, Perfis).
4. **Fase 4:** Motor de Chat Real-time (Webhooks, Estados de Mensagens).
5. **Fase 5:** Setores, Kanban & Relatórios Analíticos.
6. **Fase 6:** Módulo de Chatbots & Automações.

## 5. Boas Práticas
- Clean Architecture com separação de lógica de negócio e UI.
- Tipagem estrita com TypeScript.
- Rastreabilidade de logs e auditoria de ações de atendentes.

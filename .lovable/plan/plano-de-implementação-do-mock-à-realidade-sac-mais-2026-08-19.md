# Plano de Implementação: Do Mock à Realidade (SAC Mais)

Transformar a estrutura visual mockada em um sistema funcional e modular seguindo as diretrizes do SAC Mais.

## 1. Módulo de Chat Avançado (Atendimento)
- **Componentização:** Criar `ChatList`, `ChatMessageArea` e `ContactDetails` como componentes independentes.
- **Estado de Conversa:** Implementar `useChat` hook para gerenciar a conversa ativa e histórico.
- **Filtros:** Adicionar abas funcionais (Abertas, Aguardando, Resolvidas) e busca por tags/setores.
- **Rich Media:** Simular envio de áudio e anexos com feedback visual.

## 2. CRM & Kanban (Contatos/CRM)
- **Visualização Kanban:** Criar `KanbanBoard` com colunas representando o funil de vendas.
- **Drag & Drop:** Implementar movimentação de contatos entre estágios (mockado com estado local).
- **Notas Internas:** Adicionar seção de histórico e anotações no perfil do contato.

## 3. Automações & Chatbots
- **Bot Builder Mock:** Interface para visualizar fluxos de automação.
- **Status da Evolution:** Integrar o status real da conexão no Topbar e na tela de Conexões.

## 4. Dashboard Analítico
- **KPIs:** Implementar cartões com métricas reais/simuladas (TMA, TME, Avaliações).
- **Gráficos:** Usar `recharts` ou similar para volume de atendimentos.

## Detalhes Técnicos
- **Clean Arch:** Mover lógica de dados para `src/lib/services` e hooks.
- **UI/UX:** Garantir suporte a Dark Mode completo e transições suaves.
- **Tipagem:** Validar todas as interfaces da Evolution API v2.

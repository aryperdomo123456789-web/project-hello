# Mago Bot — plano de produto em escala

## Visão

O Mago Bot será uma central própria de atendimento: várias conexões de WhatsApp entram numa inbox única, mas cada número mantém sua identidade, fila, especialista, horários, regras e histórico. A operação deve ser simples para o atendente e transparente para o gestor.

## Jornada principal

Uma mensagem recebida identifica a organização, a conexão, o contato e a conversa. O sistema deduplica o evento, decide se a conversa é nova ou existente, executa o especialista publicado para aquele número quando a automação está ativa e, se houver transbordo, entrega a conversa à fila correta. O atendente visualiza contexto, assume com posse atômica, responde pela mesma conexão e encerra ou devolve a conversa. Nenhuma mensagem deve ser processada duas vezes e nenhum atendente deve assumir silenciosamente uma conversa já pertencente a outro.

## Telas prioritárias

| Tela | Resultado esperado |
|---|---|
| Inbox | Busca, abas por estado, conexão de origem, fila, prioridade, responsável e histórico |
| Conexões | Criar, parear, verificar saúde, escolher especialista e consultar último evento |
| Automações | Catálogo, editor visual, simulador, versões, publicação e vínculo por número |
| Filas | Regras de distribuição, capacidade, SLA, agentes online e supervisão |
| CRM | Contato, tags, histórico, funil, notas e tarefas |
| Relatórios | Volume, primeira resposta, resolução, abandono, fila, canal e especialista |
| Configurações | Equipe, permissões, licenciamento, webhooks, backup e auditoria |

## Regras superiores

A inbox é única, mas o contexto nunca é misturado. Toda conversa pertence a uma organização e a uma conexão. Toda automação publicada é imutável. Toda transferência gera evento de auditoria. Toda ação externa possui chave idempotente. Quando o atendente assume, a automação pausa; quando a conversa é devolvida, a fila volta a ser elegível; quando o cliente responde após resolução, a política de reabertura deve ser explícita.

## Diferenciais sobre o benchmark

O Mago Bot vai além de centralizar canais ao tornar a unidade de automação o número de WhatsApp. O gestor poderá simular um atendimento antes da publicação, testar a execução com eventos fictícios, comparar versões, fazer rollback e medir o resultado por especialista. A camada de provedor será intercambiável, deixando Meta oficial, Evolution ou outro adaptador fora do núcleo de atendimento.

## Critérios de escala

O beta só será liberado após passar por um cenário com pelo menos duas conexões, três filas, múltiplos atendentes, mensagens duplicadas, reconexão do provedor, falha de envio, transferência concorrente e retomada de automação. A entrada de novos canais deve reutilizar o mesmo modelo de conversa e eventos, sem duplicar regras de negócio por provedor.

## Referências

[1]: https://sacmais.com.br/ — Benchmark funcional do SAC Mais.

[2]: https://sacmais.com.br/blog/distribuicao-automatica-de-atendimentos-cinco-modelos-para-testar/ — Modelos de distribuição de atendimentos.

[3]: https://sacmais.com.br/blog/controle-fila-importancia-aplicacao-digital/ — Controle de filas, prioridade e métricas.

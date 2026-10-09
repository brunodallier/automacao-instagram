# Validação da plataforma e do aperfeiçoamento do editor

Verificações realizadas em 9 de outubro de 2026, no Windows, com Node.js 24.14.1.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 30 testes unitários aprovados |
| `npm run test:integration` | 16 testes aprovados em PostgreSQL real |
| `npm run test:e2e` | 17 testes aprovados em Chromium, usando build de produção |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado, sem erros ou avisos do lint |
| `npm run build` | Aprovado |
| Migrations | Quatro migrations aplicadas com sucesso |
| `npm audit --omit=dev` | Nenhum alerta |
| Auditoria completa | Registro anterior: cinco alertas de desenvolvimento; não reexecutada nesta revisão |

Foram verificadas visualmente as capturas do login e painel desktop, tags, painel mobile, configurações mobile e editor desktop/mobile. As capturas usam um proprietário temporário de teste e conteúdo criado pelas fixtures; não representam uma conta conectada ou execuções reais de automações.

O ambiente usa PostgreSQL 18.4 na porta 55432, com bancos separados para aplicação e testes. Antes da migration aditiva do editor, os dados da aplicação foram guardados em um snapshot dentro de `.tmp`, ignorado pelo Git. O PostgreSQL e o servidor de desenvolvimento ficam ativos para teste local; essa instância não substitui a configuração permanente documentada no README.

O PostgreSQL usava o fuso America/Sao_Paulo. A validação do bloqueio de login levou à adoção de datas com fuso e do relógio do banco em todas as operações da janela de tentativas. O teste verifica bloqueio, expiração da janela e recuperação do acesso após a expiração.

Todos os usuários, espaços, tags e automações das fixtures são removidos pelos testes no banco separado. O proprietário já existente na aplicação foi preservado.

Ao terminar, os registros das dez tabelas de dados da aplicação foram comparados com o snapshot anterior à migration. Nenhuma diferença de dados foi encontrada; somente o histórico de migrations recebeu a nova entrada.

Os casos do editor cobrem mensagens vazias e personalizadas, contagem UTF-8, botões mistos, continuações com seus próprios botões, edição de título, remoção, duplicação, troca de ação sem perda de conteúdo, salvamento/reabertura, prévia sem salvar, comentários que acionam ou não acionam, tags/atrasos sem efeitos, limites, URLs inválidas, isolamento e recusa de ativação. Um rascunho gravado diretamente no formato antigo `BUTTONS` foi reaberto, editado e salvo no navegador sem perder título ou URL.

OAuth da Meta, sincronização de Reels, webhooks, filas e motor de execução permanecem fora desta entrega. O editor salvo nesta etapa trabalha com rascunhos e prévia local.

# Validação das Etapas 1 e 2

Verificações realizadas em 9 de outubro de 2026, no Windows, com Node.js 24.14.1.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 16 testes unitários aprovados |
| `npm run test:integration` | 12 testes aprovados em PostgreSQL real |
| `npm run test:e2e` | 11 testes aprovados em Chromium, usando build de produção |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado, sem erros ou avisos do lint |
| `npm run build` | Aprovado |
| Migrations | Três migrations aplicadas com sucesso |
| `npm audit --omit=dev` | Nenhum alerta |
| Auditoria completa | Cinco alertas na cadeia de ferramentas de desenvolvimento; detalhes no README |

Foram verificadas visualmente as capturas do login e painel desktop, tags, painel mobile e configurações mobile. As capturas usam um proprietário temporário de teste e métricas zeradas; não representam uma conta conectada ou execuções reais de automações.

O Docker estava instalado, mas seu serviço não iniciou no ambiente. Para executar os testes sem simulá-los, foi iniciada uma instância local temporária de PostgreSQL 18.4, na porta 55432, com dois bancos separados. As credenciais aleatórias, os dados e o runtime de validação estão em arquivos ignorados pelo Git. Esse serviço temporário foi encerrado ao concluir a validação; ele não substitui a configuração permanente documentada no README.

O PostgreSQL usava o fuso America/Sao_Paulo. A validação do bloqueio de login levou à adoção de datas com fuso e do relógio do banco em todas as operações da janela de tentativas. O teste verifica bloqueio, expiração da janela e recuperação do acesso após a expiração.

Todos os usuários, espaços e tags das fixtures foram removidos pelos testes. Nenhum proprietário real foi criado, pois o usuário deve escolher seu e-mail e sua senha pelo comando `npm run owner:setup`.

OAuth da Meta, sincronização de Reels, webhooks, filas e motor de execução permanecem fora desta entrega. O editor salvo nesta etapa trabalha com rascunhos e prévia local.

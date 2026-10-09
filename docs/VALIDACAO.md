# Validação da plataforma e da organização do editor

Verificações realizadas em 9 de outubro de 2026, no Windows, com Node.js 24.14.1.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 41 testes unitários aprovados |
| `npm run test:integration` | 20 testes aprovados em PostgreSQL real |
| `npm run test:e2e` | 20 testes aprovados em Chromium, usando build de produção |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado, sem erros ou avisos do lint |
| `npm run build` | Aprovado |
| Migrations | Cinco migrations aplicadas com sucesso |
| `npm audit --omit=dev` | Nenhum alerta na revisão anterior; dependências não alteradas nesta revisão |
| Auditoria completa | Registro anterior: cinco alertas de desenvolvimento; não reexecutada nesta revisão |

Foram verificadas visualmente as capturas da nova etapa de respostas públicas em desktop e dos botões compactos com continuação no celular. As capturas anteriores do login, painel, tags e configurações continuam disponíveis. As capturas usam um proprietário temporário de teste e conteúdo criado pelas fixtures; não representam uma conta conectada ou execuções reais de automações.

O ambiente usa PostgreSQL 18.4 na porta 55432, com bancos separados para aplicação e testes. Antes da migration aditiva do editor, os dados da aplicação foram guardados em um snapshot dentro de `.tmp`, ignorado pelo Git. O PostgreSQL e o servidor de desenvolvimento ficam ativos para teste local; essa instância não substitui a configuração permanente documentada no README.

A instância local existente usa encoding `WIN1252`. Textos em português foram persistidos e reabertos; emojis foram verificados nos contadores e na prévia, mas não são representáveis nesse banco. O teste direto de migration foi ajustado para caracteres representáveis após confirmar essa limitação. Não houve conversão do banco nem alteração de seus dados; uma instalação que precise persistir emojis deve usar PostgreSQL com encoding `UTF8`.

O PostgreSQL usava o fuso America/Sao_Paulo. A validação do bloqueio de login levou à adoção de datas com fuso e do relógio do banco em todas as operações da janela de tentativas. O teste verifica bloqueio, expiração da janela e recuperação do acesso após a expiração.

Todos os usuários, espaços, tags e automações das fixtures são removidos pelos testes no banco separado. O proprietário já existente na aplicação foi preservado.

Imediatamente após a migration, os registros das dez tabelas de dados da aplicação foram comparados com o snapshot anterior. Nenhum valor de coluna existente foi alterado nem registro removido. A nova coluna recebeu a configuração da resposta pública já existente; o histórico de migrations recebeu a quinta entrada. A aplicação tinha um proprietário, um workspace, uma automação, três palavras-chave e quatro blocos, incluindo uma resposta pública antiga. Os testes usam o banco separado e preservam esses dados.

Os casos do editor cobrem mensagens vazias e personalizadas, contagem UTF-8, botões mistos, continuações com seus próprios botões, edição de título, remoção, duplicação, troca de ação sem perda de conteúdo, salvamento/reabertura, prévia sem salvar, comentários que acionam ou não acionam, tags/atrasos sem efeitos, limites, URLs inválidas, isolamento e recusa de ativação. Um rascunho gravado diretamente no formato antigo `BUTTONS` foi reaberto, editado e salvo no navegador sem perder título ou URL.

Os novos casos verificam a ordem das quatro seções, cinco respostas inicialmente vazias e editáveis, adição de variação, ativação/desativação sem apagar textos, alternativa incompleta salva como rascunho, reabertura e limite público. A rotação ignora campos vazios; erro temporário, atraso e aceitação da API não escolhem a alternativa. O teste da migration executa o SQL versionado em um schema temporário dentro de uma transação, confirma a preservação de todos os blocos e testa ordenação, vazios, texto longo, mais de cinco variações e automação sem resposta pública.

Rascunhos antigos com blocos públicos foram reabertos e salvos na etapa própria, mantendo a DM e seus botões. Atualizações que omitem a nova configuração foram verificadas para não apagar as respostas; clientes antigos que ainda enviam blocos públicos preservam os controles, a alternativa e as variações adicionais. Em mobile, os campos dos botões têm 36 px de altura, recolher reduz o contêiner a menos da metade e as ações de URL/continuação funcionam recolhidas. Expandir, editar, remover um botão anterior, salvar e reabrir mantêm a continuação. Não houve rolagem horizontal a 390 px.

OAuth da Meta, sincronização de Reels, webhooks, filas e motor de execução permanecem fora desta entrega. O editor salvo nesta etapa trabalha com rascunhos e prévia local.

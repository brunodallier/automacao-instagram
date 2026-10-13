# Instagram Login — verificação de leitura

Esta etapa consulta exclusivamente o perfil autorizado por **Instagram API with Instagram Login**, em `graph.instagram.com`. Não utiliza Facebook Login, Page Access Token ou Instagram Basic Display.

A etapa seguinte de leitura já oferece [sincronização e seleção de Reels](REELS.md), reutilizando a mesma configuração privada. Os limites abaixo sobre ausência de envios, webhooks e renovação automática continuam válidos.

## Configuração local

1. Abra o `.env` na raiz do projeto usando seu editor local. Preserve todas as variáveis existentes, especialmente `DATABASE_URL`, `NEXTAUTH_SECRET` e `TEST_DATABASE_URL`.
2. Localize `INSTAGRAM_ACCESS_TOKEN=""` e cole o token entre as aspas, diretamente no editor. O token deve ser o da conta profissional autorizada por Instagram Login com `instagram_business_basic`. Não envie a credencial pelo chat, não use `NEXT_PUBLIC_` e não a insira em comandos ou URLs. `.env` e `.env.local` já são ignorados pelo Git; `.env.example` contém somente campos vazios.
3. Mantenha `INSTAGRAM_API_VERSION="v25.0"`, a versão fixa inicialmente configurada. Host e endpoint não são configuráveis pelo cliente. Ao trocar a versão no futuro, valide a compatibilidade da API e mantenha o formato `vNN.N`.
4. Salve e reinicie o servidor: `Ctrl+C` no terminal de desenvolvimento e `npm run dev -- --hostname 127.0.0.1 --port 3000`.
5. Entre em `http://localhost:3000/painel`. A seção **Conexão Instagram** mostra o resultado da consulta e permite usar **Verificar conexão**. Em caso de sucesso, aparecem **Leitura verificada**, `@usuário`, ID e horário. A data usa o fuso de São Paulo.

O comando `npm run instagram:check` lê o mesmo `.env`, faz a mesma consulta e informa somente resultado, usuário, ID e horário. Não recebe o token como argumento, não imprime a credencial e encerra com código 1 quando a leitura não é confirmada. Se você optar por `.env.local` no Next.js, o comando precisa receber essa configuração por ambiente; para esta instalação, use `.env` para manter ambos alinhados.

O valor do token não é enviado ao navegador, armazenado no PostgreSQL, copiado para `SocialAccount` ou persistido nos relatórios. O status é uma consulta atual, sem histórico fictício de conexão. A conta retornada é a autorizada pelo token da instalação; nesta fase o Pulso continua privado, com um único proprietário. Na instalação local, as permissões do `.env` foram restringidas ao usuário do Windows e SYSTEM; o arquivo continua sendo uma configuração privada, não um cofre criptografado.

## Consulta e segurança

- Somente `GET https://graph.instagram.com/v25.0/me?fields=user_id,username`.
- Token no cabeçalho `Authorization: Bearer`, exclusivamente no servidor.
- Timeout de oito segundos, redirects bloqueados e cache persistente desabilitado.
- A rota local `GET /api/instagram/conexao` exige sessão válida do proprietário e responde com `Cache-Control: private, no-store`.
- O painel usa uma fronteira de Suspense para que a consulta externa não bloqueie as métricas e a navegação. O botão não dispara várias verificações enquanto uma estiver pendente.
- Apenas estado, mensagem controlada pelo Pulso, data e identidade validada são devolvidos. Mensagens, corpos de erro, headers, objetos de credenciais e exceções brutas nunca são registrados ou serializados para o cliente.
- IDs são conservados como strings. Respostas incompletas ou com identidade inválida não confirmam conexão. Não é usada uma conta fictícia como fallback.

As permissões `instagram_business_manage_comments` e `instagram_business_manage_messages` não são exercitadas nesta etapa. Ler o perfil comprova acesso básico naquele momento; não comprova capacidade de enviar mensagens, comentar, receber eventos ou executar automações. Não são consultados inbox, comentários, seguidores, mídia ou insights.

O indicador global informa **Envios desabilitados**. O resultado da leitura fica na seção Conexão Instagram do painel; isso evita que um rótulo fixo de conexão no cabeçalho contradiga a consulta atual.

## Estados e recuperação

| Estado | Significado e ação |
| --- | --- |
| Não conectado | Token ausente. Preencha o ambiente local e reinicie. Nenhuma chamada à Meta foi realizada. |
| Revise a configuração | Versão ou credencial local inválida, ou falha do provedor de credenciais. Corrija localmente e reinicie. |
| Leitura verificada | A Meta retornou o ID e o usuário do perfil autorizado. |
| Token expirado | A Meta identificou erro 190 com subcódigo 463. Obtenha outro token no painel da Meta, substitua localmente e reinicie. |
| Token recusado | A Meta recusou a autenticação. Confira o tipo do token, a conta autorizada e eventual revogação. Não se presume expiração sem a identificação correspondente. |
| Acesso recusado | A consulta foi recusada por permissão. Confira `instagram_business_basic` e a autorização da conta/aplicativo. |
| Limite de consultas | Aguarde antes de repetir. Não há retries automáticos que consumam mais chamadas. |
| Consulta indisponível | Rede, timeout, erro temporário ou servidor da Meta indisponível. Isso não confirma expiração nem altera dados da conta. |
| Resposta inválida | A API não forneceu o perfil esperado. Revise versão e tipo do token. |

Se o navegador não conseguir atualizar a consulta, o painel identifica a falha e mantém o último resultado visível, com seu horário. Esse resultado não passa a ser uma confirmação nova.

## Preparação para renovação futura

`InstagramCredentialProvider.getCredential()` separa a origem privada da credencial do cliente de leitura. A implementação atual resolve o token do ambiente a cada consulta. Um provedor futuro poderá recuperar o token renovado de um cofre sem alterar a projeção pública ou o endpoint de leitura.

Renovação precisará de uma operação própria no servidor, armazenamento seguro, controle de concorrência, metadados de emissão/expiração e reconexão quando aplicável. A consulta `/me` não retorna validade temporal do token; o Pulso não assume prazo de expiração, não simula renovação e não troca tokens automaticamente. Segredos de aplicativo não são necessários nem solicitados nesta entrega. Também não há OAuth no Pulso, scheduler, endpoint de refresh, envio, webhooks ou mudanças nas regras do editor.

## Testes

Testes unitários usam apenas credenciais descartáveis sem validade e transporte simulado. Cobrem ausência de configuração, envio por cabeçalho, ausência de token na URL/resultado/logs, validação de identidade e versão, erros da Meta, timeout/rede e autorização da rota.

O servidor dos testes de navegador recebe `INSTAGRAM_ACCESS_TOKEN=""`, mesmo quando o ambiente local tem um token real. As fixtures exercitam os estados visuais por interceptação somente da rota local, sem chamadas reais à Meta. Login, editor, botões, respostas públicas, prévia e simulador continuam nas suítes existentes. Uma consulta real deve ser feita separadamente, após a inserção manual do token, e nunca ser simulada como sucesso.

Referências: [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Business Login e tokens](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/), [tratamento de erros Graph API](https://developers.facebook.com/docs/graph-api/guides/error-handling/). O acesso automatizado às páginas da Meta apresentou limitação HTTP 429 durante esta implementação. Em 13 de outubro de 2026, após a configuração manual, a chamada real confirmou o perfil autorizado, com token exclusivamente no cabeçalho e a versão `v25.0`. O comando local, a API autenticada e o painel foram verificados sem registrar a credencial.

# Execução de automações do Pulso

Implementação preparada em 14/10/2026. O fluxo passou por testes com PostgreSQL e contêineres descartáveis, usando uma API Graph simulada. **Nenhum envio real, publicação, alteração DNS ou migração do banco local foi feito.** A validação controlada na Meta continua necessária antes do lançamento.

## O que foi implementado

- Webhook GET para desafio e POST com HMAC-SHA256 sobre os bytes originais; comparação segura, limite local de 10 MB/1.000 atualizações e prazo de leitura de 15 segundos. O endpoint fica fechado por padrão.
- Persistência atômica de eventos e tarefas antes do HTTP 200. Falha do banco retorna 503 para permitir reentrega da Meta. IDs únicos deduplicam eventos, comentários, operações e continuações.
- Roteamento para a conta Instagram fixada e seu workspace; contas desconhecidas ou ambiguamente vinculadas não executam. Eventos válidos de conta com token expirado são preservados, mas o processamento fica suspenso.
- Fila PostgreSQL com leases, `FOR UPDATE SKIP LOCKED`, retomada, atrasos persistentes e controle de concorrência. Duas instâncias não assumem a mesma tarefa simultaneamente.
- Escolha por Reel, palavra-chave e escopo; automações específicas prevalecem sobre globais. Reels futuros usam a data real de publicação e a ativação. Apenas uma automação elegível responde privadamente a cada comentário.
- Primeira resposta privada por `recipient.comment_id`; mensagens seguintes por IGSID, somente após interação elegível. A propriedade de Reels novos é confirmada pela lista autenticada da conta.
- Respostas públicas normais em rotação entre variações preenchidas; cursor persistente e independente da ordem das quatro etapas do editor.
- Botões de site e postback. Continuações usam identificadores opacos aleatórios, vinculados ao destinatário, à conta e ao template aceito. A primeira escolha consome o grupo; repetição, expiração ou outro destinatário não executam.
- Tags associadas a contatos, atrasos e continuação de mensagens; rascunhos e simulador mantidos. A janela é reavaliada antes de cada envio.
- Ativar e pausar automações. Ativação exige rascunho compatível, instalação/configuração prontas e heartbeat recente; editar, pausar ou excluir cancela trabalho pendente daquela versão. A execução usa uma cópia imutável do conteúdo.
- Página **Atividades**, métricas reais e saúde do worker. APIs exigem proprietário/workspace; mutações verificam origem. Não exibem tokens, corpos HTTP ou payloads de botões.

## Limites e interpretação dos resultados

A Private Reply admite uma mensagem por comentário dentro de sete dias. O Pulso exige primeira mensagem em texto; a documentação desse formato não confirma botões na primeira resposta. Os botões permanecem editáveis e simuláveis, mas nesse ponto impedem ativação até revisão do conteúdo. Botões são enviados depois de resposta elegível. Mensagens adicionais no nível principal aguardam essa interação; o sistema não inventa uma resposta do destinatário.

A continuação usa a janela normal de 24 horas. Clique em URL, eco, visualização e aceitação HTTP não abrem a janela. Exceções de outros produtos, como anúncios de clique para Direct, não são utilizadas. Texto simples mantém 1.000 bytes UTF8; template mantém 640 caracteres e até três botões. Título de botão de 20 caracteres e resposta pública de 500 caracteres são políticas conservadoras locais, não limites oficiais confirmados nesses documentos. [Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies/), [Messaging API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/), [Button Template](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template/).

`API_ACCEPTED` significa somente que a Meta retornou os IDs esperados. A leitura só é registrada quando um evento assinado correspondente chega; ausência desse evento não comprova falha. Timeout, erro 5xx, resposta inválida ou interrupção após reservar o envio geram `UNKNOWN` e revisão. **Não há promessa de envio exatamente uma vez na rede**: a Graph API não oferece uma chave de idempotência documentada para esses envios. O Pulso evita repetir operações incertas, aceitando que elas possam precisar de investigação manual.

Somente rate limit com rejeição explícita é repetido automaticamente, com backoff persistente e até oito tentativas. Leituras transitórias podem ser repetidas. O limite local conservador é uma tentativa de envio por segundo por conta, além dos limites aplicados pela Meta. Token inválido/expirado e permissão recusada suspendem a conta; filas e dados não são apagados. Após reconectar por leitura, revisar filas e janelas antes de reabilitar.

A resposta pública alternativa nunca é disparada por atraso, aceite, timeout ou erro genérico. A atividade precisa ser uma rejeição identificada da primeira DM com código da Meta, configuração alternativa válida e justificativa explícita do proprietário após conferir o caso. Autenticação, rate limit e resultados incertos não permitem essa alternativa. A aprovação apenas enfileira a operação; o worker continua sujeito ao modo e às regras de envio. Existe uma única posição pública por execução, evitando publicar também uma segunda alternativa se a resposta normal já foi reservada.

## Configuração privada e bloqueios

O `.env` local foi preservado e recebeu campos adicionais sem substituir credenciais existentes. `INSTAGRAM_APP_SECRET` ainda está vazio. Inserir o **App Secret do mesmo aplicativo Meta** diretamente no arquivo local; não enviar no chat. `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` já foi gerado privadamente. A migração nova **não** foi aplicada ao banco local nesta entrega.

| Configuração | Comportamento |
| --- | --- |
| `INSTAGRAM_SEND_MODE=disabled` | Padrão; worker em standby, nenhum envio |
| `INSTAGRAM_SEND_MODE=controlled` | Exige conta, comentário e destinatário numéricos fixados para um teste previamente autorizado |
| `INSTAGRAM_SEND_MODE=live` | Exige `INSTAGRAM_META_VALIDATED=true`, definido somente após validação real e autorização |
| `INSTAGRAM_EXECUTION_ACCOUNT_ID` | ID real da conta já vinculada; deve corresponder à identidade do token |
| `INSTAGRAM_TEST_COMMENT_ID`, `INSTAGRAM_TEST_RECIPIENT_ID` | Restringem o modo controlado; não inventar IDs nem usar comentário de terceiro sem autorização |
| `INSTAGRAM_WEBHOOK_ENABLED` | `false` por padrão; habilitar apenas após preparar callback seguro |
| `INSTAGRAM_APP_SECRET` | Segredo do aplicativo, usado somente para assinatura de webhook |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Segredo independente para o desafio, pelo menos 32 caracteres |
| `INSTAGRAM_SUBSCRIPTION_SETUP_APPROVED` | `false`; não altera inscrições automaticamente |

Em produção, usar arquivos `deploy/secrets/instagram_token`, `instagram_app_secret` e `instagram_webhook_verify_token`, com permissão restrita. Os dois últimos podem existir vazios enquanto o recebimento estiver bloqueado. App Secret e verify token vão somente ao web; o worker recebe token Instagram e conexão do banco. Credenciais não entram em imagem/Git/URLs/logs. O provider relê o arquivo do token a cada operação; após mudança, a identidade da conta é novamente verificada antes de POST. Renovação automática/OAuth continuam pendentes; não são necessários para o ensaio com o token válido atual.

### Webhook separado do painel

O Caddy do MVP mantém a senha adicional no painel inteiro e o login interno do Pulso. Bloqueia webhooks/saúde no hostname humano. `compose.webhooks.yaml` prepara um **hostname separado**, definido por `PULSO_WEBHOOK_DOMAIN`, exclusivamente para GET/POST `/api/webhooks/instagram`; demais caminhos retornam 404. Esse overlay foi testado localmente, mas não está habilitado na VPS nem possui registro DNS autorizado.

O callback só pode ser publicado depois de autorização específica e HTTPS válido. Não adicionar bypass genérico da autenticação do painel; não abrir PostgreSQL, 3000 ou administração do Caddy. O log remove URI/query e cabeçalhos: a verificação padrão da Meta traz `hub.verify_token` na query, que não deve ser copiada para relatórios, capturas ou comandos. O access token de Graph permanece exclusivamente no cabeçalho Bearer.

## Estado real da Meta

A consulta somente de leitura `npm run instagram:webhooks:check` retornou **NOT_SUBSCRIBED**, sem aplicativos inscritos, em 14/10/2026. Isso confirma uma pendência real; não comprova recebimento, envio ou entrega. Não foi executado POST de inscrição.

Após publicar o callback com autorização, configurar a modalidade **Instagram API with Instagram Login**, o callback HTTPS e os campos `comments`, `messages`, `messaging_postbacks`, `messaging_seen`. Confirmar as permissões `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages` e os papéis/contas de teste aplicáveis.

A documentação atual de setup de webhooks exige Advanced Access para `comments`/`live_comments`, aplicativo Live e requisitos de verificação/revisão quando aplicáveis. A referência mais antiga de moderação diferencia Standard Access para contas próprias adicionadas ao aplicativo. Essas páginas não bastam para inferir que o aplicativo atual já pode receber todos os eventos em produção. Conferir a configuração real no Meta for Developers e demonstrar o evento assinado; perfil e Reels legíveis não comprovam essas permissões. [Setup de webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup), [exemplos de payloads](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples), [moderação de comentários](https://developers.facebook.com/documentation/instagram-platform/comment-moderation).

O comando de inscrição está preparado, mas exige aprovação específica no ambiente privado e execução explícita de `scripts/instagram-webhooks.ts --apply`. Recusa campos existentes fora do escopo, conta diferente e leitura inconclusiva. Não repetir automaticamente se o POST terminar sem confirmação; consultar novamente antes de decidir.

## Dados e migração aditiva

`202610141500_instagram_execution` adiciona tabelas de estado, contatos/tags, eventos, execuções, saídas, continuações, tarefas, atividades e heartbeat. Não altera conteúdo das tabelas anteriores, senhas, editor, Reels ou rascunhos. Relações/índices únicos sustentam isolamento e deduplicação. Excluir automação não apaga o histórico de execução.

Aplicada somente em bancos descartáveis durante os testes. O banco local `automacao_instagram_utf8` permanece UTF8, com seis migrations, 87 Reels, duas automações e um proprietário; comparação privada por SHA256 confirmou todas as tabelas e hash preservados. As novas telas detectam schema ausente sem bloquear leitura/rascunhos antigos.

Na implantação autorizada: backup oficial consistente, checksum/inventário, restauração em destino vazio, comparação integral e somente depois `prisma migrate deploy` da release aprovada. Não executar reset, recriar proprietário, substituir volume ou copiar dados sem autorização. [Implantação e reversão](HOSTINGER-MVP.md).

## Testes reproduzíveis

Docker Linux ativo; testes geram segredos/volumes descartáveis e não usam `.env`/tokens/dump reais. Executar suites Docker **sequencialmente**, porque cada uma compara recursos preexistentes e usa orçamento de memória próprio.

```powershell
npm test
npm run test:runtime
npm run typecheck
npm run lint
npm run build
npm run worker:build
npm run test:execution
node tests/docker/execution.mjs --e2e
npm run test:worker
node tests/docker/mvp.mjs --webhooks
npm run test:docker
node tests/docker/private.mjs
```

O teste de worker utiliza o binário que vai à imagem, Next.js, PostgreSQL e Graph simulada em HTTPS com CA verificada. A rede de execução não tem internet. Exercita comentário assinado, fila, resposta pública/privada, interação, template, postback, tags, atraso, deduplicação, API privada e página de atividades. Testes de integração adicionais cobrem concorrência, reinício após reserva, timeout, rate limit, expiração, edição durante envio, prioridade, isolamento, rotação e fallback. Caddy testa TLS, duas autenticações, CSRF, hostname separado e bloqueio dos demais caminhos. Backup testa recuperação integral criptografada em banco descartável. Esses resultados não substituem testes na Meta.

### Resultado final da validação — 15/10/2026

| Verificação | Resultado |
| --- | --- |
| Unitários | 120 aprovados |
| Integração em PostgreSQL UTF8 descartável | 54 aprovados |
| Navegador desktop/celular, editor e simulador | 24 aprovados, incluindo proteção das novas APIs e página Atividades |
| Runtime/segredos | 8 aprovados |
| Helpers da preparação Cloudflare preservada | 7 testes Python aprovados |
| TypeScript, lint, build Next e bundle do worker | Aprovados |
| Worker real em container contra Graph HTTPS simulada | Fluxo completo aprovado, sem internet/credenciais reais |
| Caddy MVP e hostname separado de webhook | TLS, duas autenticações, assinatura, isolamento e persistência aprovados |
| Docker original/backup | Reinício, UTF8, rascunhos, backup agendado criptografado e restauração integral aprovados |
| Topologia futura de Tunnel | Sem portas publicadas, login preservado e conector desligado |
| Falhas de backup | Configuração ausente/senha errada recusadas sem corromper o repositório |
| Dependências de produção | `npm audit --omit=dev`: zero vulnerabilidades |

A auditoria completa mantém os alertas conhecidos da cadeia de lint de desenvolvimento, descritos no README; nenhuma correção forçada ou downgrade foi aplicado. As suites removem somente recursos próprios; as verificações dos demais contêineres passaram. Banco local novamente comparado por SHA256, sem alterações. Os envios continuam `disabled`, webhooks desabilitados e App Secret vazio. DNS, VPS, dados reais e inscrições da Meta não foram modificados por esses testes.

## Ensaio real proposto — depende de autorização

1. Proprietário preenche App Secret **somente no arquivo privado**. Conferir as permissões/modalidade e a possibilidade de receber eventos no aplicativo atual.
2. Autorizar publicação somente do callback HTTPS separado; autorizar/aplicar a migração aditiva no ambiente de teste escolhido e inscrição da conta. Com envios bloqueados, demonstrar desafio e recebimento assinado de um comentário em Reel próprio. Não publicar o painel ou migrar seus dados por consequência dessa autorização.
3. Usar uma conta de teste distinta como destinatário, com papéis/acessos exigidos pela Meta. Confirmar Reel, comentário, IGSID, palavra-chave, textos exatos e intervalo do teste. Manter automações de produção em rascunho; criar somente uma automação controlada e limitar os IDs no ambiente privado.
4. **Solicitar autorização expressa antes do primeiro envio real**, apresentando exatamente uma DM inicial e uma resposta pública. Somente após essa aprovação ativar `controlled`; concluir envio, aceitação e observação no Instagram, distinguindo Solicitações, visualização e entrega. Bloquear envios novamente após o ensaio.
5. Para botões/continuações, destinatário responde voluntariamente. Aprovar previamente o conteúdo adicional; demonstrar link, postback e mensagem única dentro da janela, tags/atraso e pause. Testar timeout/reentrega somente no mock, sem gerar falhas artificiais ou duplicatas na conta real.
6. Revisar resultados e permissões. Aprovação do ensaio não autoriza `live`, publicação do painel, DNS, transferência do banco ou automações em terceiros.

## Pendências para lançamento

- App Secret privado, callback HTTPS autorizado, inscrição e acesso/revisão efetivos da Meta; ensaio real de private reply, resposta pública e template/postback.
- Autorizações separadas para A do Pulso no Registro.br, publicação protegida e migração dos dados. Nameservers, DNSSEC e Vercel ficam preservados.
- Destino externo de backup, credenciais restritas, envio/check e restauração antes da produção; monitoramento/alertas operacionais.
- Estratégia operacional de validade/renovação do token. Provider está separado e erros são tratados; renovação automática ainda não implementada.

OAuth, anexos, anúncios, handover/human agent, WhatsApp e Cloudflare fase 2 não fazem parte deste MVP. A infraestrutura e os fluxos estão implementados para validação; **o MVP não está declarado pronto para uso real até concluir as verificações acima**.

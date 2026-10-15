# Pulso: MVP no Registro.br

Prioridade em 14/10/2026: manter o DNS no Registro.br e adiar Cloudflare Access/Tunnel. Esta preparação não publica a aplicação nem transfere dados. Não alterar nameservers, DNSSEC ou os sites da Vercel.

## Estado real do produto

| Recurso | Estado |
| --- | --- |
| Login, sessões e proteção contra tentativas excessivas | Implementado |
| Conta Instagram e sincronização paginada de Reels | Implementado, somente leitura |
| Editor, rascunhos, seleção de Reels, palavras-chave e simulador | Implementado |
| Ativação/pausa de automações | Implementadas; configuração, schema e worker precisam estar prontos |
| Webhooks, comentários e postbacks | Implementados e testados com assinatura; callback real não publicado |
| DMs/private replies e respostas públicas | Adaptador oficial implementado e testado no mock; nenhum envio real autorizado/executado |
| Fila persistente, retries e execução | Implementados; resultados incertos exigem revisão sem reenvio automático |
| Worker | Binário testado em container; padrão standby, `executionEnabled=false` |
| Renovação automática de tokens | Provider inicial preparado; renovação não implementada |

O fluxo está implementado e testado em ambiente isolado, mas ainda não validado com envios na Meta. O ambiente local permanece com envios bloqueados e sem aplicação da migration nova. Não anunciar automações como operacionais antes do ensaio real autorizado. [Fluxos, requisitos, limitações e plano do ensaio](INSTAGRAM-MVP.md).

Pendências reais: App Secret privado, callback HTTPS separado autorizado, inscrição da conta (consulta retornou `NOT_SUBSCRIBED`), permissões/modo/revisão do aplicativo e demonstração controlada de comentários, DMs e postbacks. Renovação automática do token e destino externo de backup continuam pendentes.

Preservar prioridade das automações específicas, continuações e palavras-chave. Aceitação da API e atraso não comprovam entrega ou falha definitiva: fallback público exige erro identificado que o justifique.

## Proteção e rede

Usar `compose.production.yaml` junto de `compose.mvp.yaml`; **não combinar** com `compose.private.yaml`. Projeto de produção: `pulso-production`, separado dos futuros projetos de WhatsApp.

- Somente Caddy publica TCP 80/443; banco, porta 3000, worker e admin do Caddy não publicam portas.
- Rede `application` interna para PostgreSQL/worker/migrations. Caddy somente em `edge`; web participa das duas. Worker também usa `automation_egress` para Graph; banco não participa dela. Backup possui saída para o armazenamento externo.
- HTTPS é emitido/renovado automaticamente quando DNS e portas estiverem corretos. HSTS sem `includeSubDomains`/preload, restrito ao Pulso.
- Todo HTML, asset e API do painel exige uma senha adicional no Caddy **e**, depois, a sessão atual do Pulso. A senha/hash do proprietário permanece intacta.
- Credencial adicional independente com 32 bytes aleatórios, hash Argon2id e uso somente sobre HTTPS. Authorization é removido antes de encaminhar ao Next.js; headers/URI não entram no access log.
- Hosts incorretos/IP não encaminham ao painel. `/api/health`, `/api/webhooks`, `/webhooks` e descendentes retornam 404. Nenhuma exceção pública para a Meta está habilitada.

`compose.webhooks.yaml` prepara um hostname HTTPS separado, com apenas GET/POST `/api/webhooks/instagram` e validação de desafio/HMAC. Não está ativado e não possui DNS publicado. Sua publicação depende de autorização específica; não cria bypass no painel.

A senha adicional usa o diálogo do navegador; não é OTP por e-mail nem MFA. O login interno continua com seu rate limit. Caddy padrão não adiciona rate limit nesta configuração; a senha aleatória deve permanecer privada e ser rotacionada em caso de exposição. A memória do Caddy no overlay é 256 MB; os demais limites da KVM 2 permanecem.

Gerar credencial sem segredo nos argumentos ou stdout:

```powershell
# Pasta fora do repositório, com ACL restrita ao proprietário e SYSTEM.
node ops/mvp/prepare-access.mjs C:/Users/bruno/.codex/private/pulso-hostinger/mvp-access-20261014
```

`panel-access.private.json` fica somente no PC para consulta pelo proprietário; não enviar ao chat, GitHub ou VPS. Apenas `panel_users` (hash) vai à VPS. O gerador recusa sobrescrever arquivos existentes. No Linux, diretório 0700/arquivos 0600; no Windows conferir a ACL restrita.

## DNS preparado, ainda sem salvar

Nova entrada: **A `pulso.brunodallier.com.br` → `179.236.76.212`**.

Manter os dois A existentes: `painel.brunodallier.com.br → 179.236.76.212` e `www.rendaextra.brunodallier.com.br → 76.76.21.21`. Não criar AAAA/wildcard nem trocar `d.sec.dns.br`/`e.sec.dns.br` ou DNSSEC. O novo A está no formulário de revisão; salvar somente na janela autorizada. TTL observado dos A existentes: 3600; conferir o TTL da nova entrada após salvar.

Antes/depois do corte: conferir Pulso nos dois servidores autoritativos e em resolvers independentes; NS/DS e registros existentes inalterados; HTTPS de `www.rendaextra.brunodallier.com.br` funcional. A adição isolada de A não exige migração de DNSSEC.

## Implantação futura, somente após autorização

Preparação separada em `/srv/pulso/preparation/mvp-20261014`. Não substituir `/srv/pulso/app` nesta entrega. Utilizar release revisada, imagens identificadas por commit/digest e manter a anterior. Nenhum token da Meta ou dump real foi instalado na VPS.

```bash
cd /srv/pulso/app
dc() { sudo docker compose --env-file deploy/production.env -p pulso-production -f compose.production.yaml -f compose.mvp.yaml "$@"; }
```

O ambiente privado terá `PULSO_DOMAIN=pulso.brunodallier.com.br`, `PULSO_PUBLIC_URL=https://pulso.brunodallier.com.br` e banco/usuário `pulso`. A conexão local continua apontando para `automacao_instagram_utf8` no PC. Não imprimir configs, dumps ou secrets; não adicionar o usuário ao grupo docker. Sudo requer a senha digitada pelo proprietário no terminal local, nunca no chat.

Ordem de execução depois da autorização:

1. Validar acesso/sudo, disponibilidade de 80/443, release e secrets. Configurar destino de backup externo e testar a recuperação; a chave Restic já possui cópia fora da VPS.
2. Fazer dump oficial consistente do banco UTF8 local, validar SHA256/`pg_restore --list` e registrar IDs, totais, relacionamentos, migrations e hash do proprietário em relatório privado. Suspender gravações locais durante a cópia final; preservar instalação original para rollback.
3. Instalar secrets em diretórios 0700. App/worker/migrations precisam ler como UID 10001; PostgreSQL e backup também precisam ler sua senha. `panel_users` deve ser propriedade **root** e modo 0400/0600, pois o Caddy tem capabilities reduzidas. Não utilizar `chmod 777`.
4. Iniciar **somente o PostgreSQL novo vazio**; recusar restore se já houver dados. Restaurar com `pg_restore --exit-on-error --single-transaction --no-owner --no-acl`. Nunca `--clean`, reset ou substituição de volume existente.
5. Comparar integralmente dados/hash/relacionamentos e as seis migrations de origem. Aplicar apenas migrations pendentes da release aprovada com `migrate deploy`, incluindo `202610141500_instagram_execution` (aditiva); não executar setup/reset de proprietário. Confirmar 87 Reels, duas automações, um proprietário e Prisma, ajustando totais ao dump final.
6. Testar web/worker internamente, sem Caddy público: login realizado pelo proprietário, rascunho e edição Unicode temporários; remover somente esses testes. Executar backup/restore completo da cópia em outro banco.
7. Após todos os gates e autorização de publicação, salvar somente o A preparado, aguardar resolução correta e iniciar o Caddy. Validar certificado público, duas autenticações, CSRF, hosts, portas e logs. A senha extra é consultada no arquivo local privado.
8. Manter `INSTAGRAM_SEND_MODE=disabled` até autorizar e concluir o ensaio real descrito em `INSTAGRAM-MVP.md`. A autorização de publicar o painel não autoriza envios; modo `live` exige validação real e aprovação própria.

## Backup e reversão

O serviço preparado usa pg_dump UTF8, SHA256 e Restic criptografado a cada 24h; retenção 7 diários/4 semanais/6 mensais. **Destino externo/credenciais ainda não configurados**. Volume na própria VPS não substitui backup externo. Não ativar sem inicializar o repositório e validar restauração integral. Copiar configs/secrets/certificados de modo privado e criptografado separadamente; o serviço atual salva o banco.

Na reversão, parar somente Caddy/web/worker/backup de `pulso-production`, preservar PostgreSQL/volume e instalação local, retirar somente o A novo se autorizado. Não tocar Vercel/NS/DS. Se houve novas gravações na VPS, congelar ambas e preservar essas alterações antes de decidir retorno; não recuperar automaticamente dump antigo. Restaurar sempre em **outro banco vazio**, comparar e depois mudar conexão. Nunca `down -v`, prune global, reset ou reinstalação.

## Verificação e fase 2

```powershell
npm test
npm run test:runtime
npm run lint
npm run typecheck
npm run build
node tests/docker/mvp.mjs
node tests/docker/mvp.mjs --webhooks
npm run test:execution
npm run test:worker
# Teste original de backup criptografado e recuperação em banco descartável:
npm run test:docker
```

O teste MVP usa credenciais/volumes descartáveis e portas aleatórias em 127.0.0.1. Cliente confia explicitamente na CA local, sem desligar verificação TLS. Não lê .env/token real nem altera outros containers. Confere autenticação adicional e sessão interna, assets simultâneos, CSRF, hosts incorretos, webhooks fechados, redes/portas, migrations, Unicode, rascunhos, persistência e bloqueio de ativação com envios desabilitados. `--webhooks` testa exclusivamente o hostname adicional no ambiente descartável. Executar suites Docker sequencialmente.

Zona Cloudflare pendente, registros copiados, OTP, política do proprietário, Tunnel `pulso-private` inativo e credenciais de execução ficam preservados. Token administrativo temporário revogado com autorização em 14/10/2026. Não iniciar conector ou migração DNS nesta fase.

### Resultado da preparação de 14/10/2026

- Os resultados iniciais de infraestrutura foram complementados pelos testes de execução, fila e integração descritos em `INSTAGRAM-MVP.md`; nenhum teste dessa entrega enviou mensagens reais.
- Teste Docker MVP passou com login por senha real de um proprietário descartável, certificado verificado, duas camadas de autenticação, redirect HTTP, bloqueio de IP/host e webhooks, CSRF, assets, UTF8, rascunhos e persistência. Outros containers permaneceram com os mesmos IDs, inícios e contadores de reinício.
- Teste de falhas de backup passou. A recuperação integral criptografada do teste original já foi validada na preparação Docker; o destino externo de produção continua pendente.
- `automacao_instagram_utf8` continua UTF8 com 87 Reels, duas automações e um proprietário. Comparação SHA256 de todas as tabelas confirmou dados e hash do proprietário inalterados.
- Backup inicial local: `C:\Users\bruno\.codex\private\pulso-hostinger\source-backup-20261014\automacao_instagram_utf8.dump`, acompanhado de SHA256 e estado privado. Inventário oficial verificado, ACL limitada ao proprietário/SYSTEM. Não foi transferido ou restaurado na VPS; repetir cópia final no corte autorizado.
- Pacote público preparado na VPS em `/srv/pulso/preparation/mvp-20261014`, checksum conferido. Apenas o hash da senha adicional foi instalado em pasta privada de preparação; o arquivo com a senha permanece no PC. `/srv/pulso/app`, dados e configuração de produção não foram substituídos.
- A novo permanece **não salvo** no Registro.br. Site público Vercel respondeu 200. Nenhum serviço Pulso foi publicado.

Referências: [HTTPS automático do Caddy](https://caddyserver.com/docs/automatic-https), [Basic Auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth), [CLI de hash por stdin](https://caddyserver.com/docs/command-line), [secrets Compose](https://docs.docker.com/compose/how-tos/use-secrets/), [Restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [Instagram Platform](https://developers.facebook.com/documentation/instagram-platform/).

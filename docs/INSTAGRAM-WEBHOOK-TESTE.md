# Primeiro teste controlado: somente receber eventos

Preparado em 15/10/2026. **Nada publicado, nenhum DNS alterado, nenhuma inscrição aplicada e nenhum dado migrado.** O primeiro teste proposto recebe um comentário assinado; não envia DM ou resposta pública. O teste de envio continua exigindo autorização própria com destinatário e textos definidos.

## Validação local

- App Secret presente, com uma única atribuição e formato esperado de 32 caracteres hexadecimais. HMAC testado somente em memória; corpo adulterado e assinatura incorreta rejeitados. Nenhum valor, prefixo, sufixo, hash ou assinatura foi exibido, copiado para testes ou gravado.
- `.env` ignorado pelo Git e pelo contexto Docker, nunca rastreado no histórico disponível; conteúdo dos arquivos rastreados verificado contra as credenciais locais, sem ocorrências. ACL do `.env`: somente proprietário do Windows e SYSTEM.
- Access token existente continua validando a identidade da conta fixada por leitura. A consulta `subscribed_apps` retornou `NOT_SUBSCRIBED`; não houve POST de inscrição. Perfil legível não comprova permissões de webhook/envio.
- Source mantém `INSTAGRAM_SEND_MODE=disabled`, `INSTAGRAM_WEBHOOK_ENABLED=false` e validação Meta não presumida. Verify token está configurado privadamente; não deve ser enviado no chat.
- Desafio GET, HMAC sobre corpo original, persistência antes do HTTP 200, deduplicação e fila estão implementados/testados. Ainda falta comprovar evento proveniente do aplicativo real.

Formato e teste criptográfico local não comprovam que o App Secret pertence ao mesmo aplicativo do token. Um POST real da Meta com assinatura válida será a evidência dessa correspondência. Não gerar token de aplicativo nem colocar App Secret/access token em URLs para tentar confirmar isso.

## Infraestrutura mínima preparada

O overlay `compose.webhook-reception.yaml` é usado **somente** com `compose.production.yaml`, sem os overlays MVP, privado ou webhooks de produção. Seu Caddy aceita exclusivamente GET/POST `/api/webhooks/instagram` no hostname definido. Painel, login, assets, saúde, IP/hosts incorretos e demais rotas recebem 404.

- Projeto Compose futuro: `pulso-webhook-reception`, separado de `pulso-production` e WhatsApp.
- Novo banco UTF8 `pulso_webhook_test`, com volume próprio. Nenhum restore, proprietário, automação ou Reel é copiado/criado. Apenas um workspace técnico e o ID da conta autorizada são configurados, com status `NOT_CONNECTED` para execução.
- Worker fica fora dos serviços padrão e `disabled`, mesmo se iniciado explicitamente. O web também impõe `disabled`, desconsiderando tentativa de `live` no arquivo de ambiente.
- Token Instagram não é montado no web/worker. Web só participa de redes internas, sem saída de internet. Apenas Caddy tem saída para emissão de certificado e publica 80/443.
- São necessários App Secret e verify token privados no receptor para validar os eventos, além de credenciais **novas** do banco e um segredo aleatório de sessão técnico. A eventual transferência segura desses dois segredos da Meta à VPS depende da autorização de implantação; não foi feita nesta preparação. O access token permanece no PC.
- `scripts/prepare-webhook-reception.ts` não lê `.env`; exige argumento explícito, modo bloqueado e banco exato de homologação. Recusa proprietário, automações, Reels ou outro vínculo existente. A inicialização é idempotente para os mesmos metadados técnicos. Não recria proprietário, apaga registros ou restaura dumps.
- `deploy/webhook-reception.env.example` contém somente configuração sem segredos. Sua cópia privada `.env` e `deploy/secrets/` ficam fora do Git/Docker. Na preparação, bind permanece em `127.0.0.1`.

Essa base é para verificar recepção, não será promovida automaticamente ao banco de produção. Os eventos persistidos devem ser preservados até revisão; nenhuma limpeza automática do banco local ou da homologação está prevista.

## Plano futuro, ainda não executado

1. **Obter autorização específica** para disponibilizar somente esse receptor e adicionar A `webhooks.pulso.brunodallier.com.br → 179.236.76.212`. Não criar A do painel, alterar nameservers/DNSSEC ou tocar registros Vercel. Conferir ausência de conflito do hostname e portas antes de aplicar; em conflito, parar e revisar.
2. Usar release revisada e diretórios/segredos novos, separados. Validar que não existe volume de homologação com dados inesperados; criar banco novo vazio e aplicar somente seu schema. Configurar os dois metadados técnicos pelo helper. Sem copiar o banco, o token Instagram ou a conta do proprietário do PC.
3. Após a mesma autorização, permitir bind 80/443 exclusivamente do Caddy receptor e configurar HTTPS automático. Conferir certificado público e todos os bloqueios antes de configurar a Meta. Não iniciar painel, worker, backup de produção ou outro projeto.
4. Configurar o callback `https://webhooks.pulso.brunodallier.com.br/api/webhooks/instagram` e o verify token no aplicativo correto. Confirmar Instagram Login, permissões, papéis, modo/revisão exigidos para a conta. Configurar `comments`, `messages`, `messaging_postbacks`, `messaging_seen` e inscrever a conta; access token usado somente no PC, no cabeçalho Bearer. Preservar outras inscrições; se o estado existente for desconhecido, interromper para revisão.
5. Manter envios bloqueados. Após as configurações técnicas, o proprietário/testador faz um comentário controlado em Reel próprio. Demonstrar assinatura válida, conta/workspace corretos, evento e tarefa persistidos, nenhuma saída de mensagem e nenhuma duplicação em reentrega. O teste de exemplo do painel da Meta, isoladamente, não comprova recebimento de comentário real da conta.
6. Apresentar resultado antes de qualquer avanço. Teste real de DM/resposta pública, migração dos dados e publicação do painel exigem autorizações posteriores independentes.

O App Secret, o token e os códigos de login nunca devem aparecer em comandos, logs, capturas ou relatórios. O verify token no desafio é parte do protocolo; a query é removida do log do Caddy. Não compartilhar URL completa do desafio.

### Operação do receptor após autorização

```bash
# Configuração privada revisada, diretório/release próprios, sem secrets em argumentos.
dc() { sudo docker compose --env-file deploy/webhook-reception.env -p pulso-webhook-reception -f compose.production.yaml -f compose.webhook-reception.yaml "$@"; }
dc config --quiet
dc build web migrate
# Somente depois de confirmar destino novo/vazio e autorizar inicialização:
dc up -d postgres
dc run --rm migrate
dc run --rm tools node node_modules/tsx/dist/cli.mjs scripts/prepare-webhook-reception.ts --initialize
dc run --rm tools node node_modules/tsx/dist/cli.mjs scripts/prepare-webhook-reception.ts --check
# Somente depois de autorizar DNS/publicação do callback:
dc up -d web caddy
```

Não executar esses comandos nesta preparação. Instalar os arquivos privados com permissões adequadas aos UIDs, conforme [HOSTINGER-DOCKER.md](HOSTINGER-DOCKER.md). Não executar `owner:setup`, restore, `down -v`, prune ou reset na VPS.

### Reversão

Se desafio, TLS, assinatura, isolamento ou permissões falharem, parar apenas Caddy/web desse projeto; preservar volume e eventos para investigação. Se a conta já foi inscrita, revisar/reverter somente a inscrição criada para este teste, com autorização, preservando configurações preexistentes. Retirar somente o A novo se a reversão DNS tiver sido autorizada. Não tocar no painel, na Vercel, nos NS/DS ou no banco do PC. Não tentar corrigir falha habilitando envios ou removendo validação de assinatura.

## Teste local reproduzível

```powershell
npm run test:webhook-reception
```

Usa exclusivamente segredos aleatórios fictícios, banco/volumes descartáveis e portas aleatórias em loopback. Não lê `.env`, copia App Secret real ou contata Meta. Verifica HTTPS confiando na CA de teste, desafio, assinatura/adulteração, persistência/deduplicação após reinício, ausência de worker/token/saída de rede, bloqueio de painel/IP/rotas, recusa de inicialização com dados existentes e preservação dos demais containers. Executar sequencialmente com as outras suites Docker.

### Resultado de 15/10/2026

Passaram 120 testes unitários, oito de runtime, 54 de integração e 24 de navegador, TypeScript e lint. O build de produção Docker passou, assim como o novo receptor somente de recepção e o fluxo completo do worker contra Graph HTTPS simulada, sem internet/credenciais reais. A auditoria de dependências de produção ficou sem vulnerabilidades. Os recursos descartáveis foram removidos; os demais contêineres não foram interrompidos ou modificados.

A comparação privada do banco local confirmou todas as tabelas e hash do proprietário inalterados: UTF8, 87 Reels, duas automações, um proprietário. Credenciais locais foram comparadas em memória com os arquivos rastreados, sem ocorrências; nenhum valor ou derivação foi gravado nos relatórios. A consulta DNS local ao hostname proposto não encontrou registro; confirmar novamente nos autoritativos antes da futura criação. Nenhum A foi salvo, nenhum secret foi transferido e nenhum serviço iniciado na VPS nesta etapa.

Referências: [Meta — setup de webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup), [payloads](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples), [HTTPS Caddy](https://caddyserver.com/docs/automatic-https).

# Primeiro teste controlado: somente receber eventos

Receptor de homologação publicado com autorização em 15/10/2026. **Somente o callback HTTPS está disponível; painel e envios reais permanecem bloqueados.** Nenhum dado local foi migrado. O desafio da Meta foi confirmado pelo proprietário; a divergência do segredo HMAC foi corrigida com autorização no ambiente local e na VPS. O teste posterior `comments` v26.0 da própria Meta chegou com HMAC válido e HTTP 200 em duas entregas. Com autorização posterior, a conta fixada foi inscrita nos quatro eventos previstos; a API confirmou `SUBSCRIBED`. A homologação permaneceu com zero eventos e tarefas; a persistência de evento da conta real continua pendente. O teste de envio continua exigindo autorização própria com destinatário e textos definidos.

## Estado verificado na VPS — 15/10/2026

- A `webhooks.pulso.brunodallier.com.br` aponta para a VPS nos dois autoritativos do Registro.br e nos resolvedores públicos consultados. Nameservers, DNSSEC e registros dos sites existentes não foram alterados.
- Projeto Compose separado `pulso-webhook-reception`: PostgreSQL e web saudáveis durante a instalação, Caddy atendendo HTTPS. Worker ausente; modo de envio `disabled`, sem access token Instagram no receptor e sem saída de internet no web. Os contêineres preexistentes mantiveram seu estado e contador de reinícios no comparativo do instalador.
- Banco novo `pulso_webhook_test`, UTF8, schema aplicado e somente workspace/vínculo técnico da conta, com execução `NOT_CONNECTED`. Nenhum proprietário, Reel ou automação foi copiado. O banco local continua UTF8, com 87 Reels, duas automações e um proprietário; todas as tabelas e o hash da senha foram comparados com a referência privada, sem alterações.
- Certificado público Let's Encrypt válido para o hostname, emitido em 15/10/2026, com vencimento em 13/01/2027. Caddy gerencia a renovação automática; sua emissão/renovação depende da manutenção do DNS, conectividade e volumes de certificados.
- Teste externo pelo computador local: desafio com verify token correto retorna 200 e ecoa o desafio; token incorreto retorna 403; POST com HMAC correto retorna 200; assinatura inválida e corpo adulterado retornam 401. Foi usado envelope vazio, sem criar eventos fictícios ou enviar mensagens.
- Painel, login, assets, saúde, demais caminhos, barra final no callback e métodos não autorizados bloqueados com 404. Acesso HTTP direto pelo IP também retorna 404. Somente 80/443 publicados por este projeto; nenhuma escuta em 3000, 5432 ou 2019 no host.
- Site público `www.rendaextra.brunodallier.com.br` permaneceu HTTP 200 antes e depois da instalação.
- Dump inicial próprio da homologação criado em diretório privado da VPS, em formato custom do PostgreSQL, com catálogo validado por `pg_restore --list` e SHA-256 registrado privadamente. Isso não constitui teste de restauração completo nem backup externo. O destino externo continua pendente antes da produção; o banco local e seu backup não foram transferidos.

### Teste da Meta — 15/10/2026, horário de Brasília

O proprietário informou sucesso no botão de teste de `comments` v26.0 às 21:42:42. O monitor registrou POSTs correlacionados às 21:42:43.969, 21:43:15.129 e 21:44:16.600, todos HTTP 401. **O teste não está aprovado pelo receptor**, independentemente da mensagem apresentada no painel.

No código implantado, HTTP 401 significa cabeçalho `X-Hub-Signature-256` ausente/formato inválido ou HMAC divergente. Os logs não guardam cabeçalhos, assinaturas ou corpos e, portanto, não distinguem essas causas. Não concluir automaticamente que o segredo está errado; conferir o App Secret correspondente ao aplicativo/integração que enviou o teste é a próxima verificação necessária. A validação sobre os bytes originais do corpo permanece obrigatória.

O banco de homologação continuou com zero eventos, tarefas e saídas. Caddy, web e PostgreSQL permaneceram saudáveis, com worker ausente, envios desabilitados e web sem token Instagram/saída de internet. Ausência de erro no monitor de saúde não transforma as respostas 401 em sucesso de autenticação.

Uma sonda separada do próprio Pulso, às 21:44:31, enviou somente um envelope vazio, assinado em memória com o segredo local, e recebeu HTTP 200. O segredo local corresponde à cópia privada original da implantação. Isso demonstra que o receptor aceita o segredo configurado e o encaminhamento desse cabeçalho funciona para a sonda; **não comprova que a Meta utiliza o mesmo segredo ou que sua requisição contém o cabeçalho esperado**. Essa sonda não criou eventos e não é evidência de sucesso da Meta.

Nova consulta de leitura da inscrição da conta retornou `NOT_SUBSCRIBED`, sem aplicativos listados. Nenhuma inscrição foi aplicada. Resolver a autenticação do webhook e repetir o teste antes de avançar à inscrição para eventos reais. O monitor temporário apenas lê Docker e contagens em transação SQL explicitamente read-only; encerra automaticamente e preserva o relatório, sem serviço permanente ou alteração de sudoers.

### Diagnóstico de assinatura sem valores privados

O receptor possui observabilidade opcional, sem alterar respostas, ordem de validação ou regras de execução. Fica desligada por padrão e só é habilitada quando `INSTAGRAM_WEBHOOK_DIAGNOSTICS=true` e `INSTAGRAM_WEBHOOK_DIAGNOSTICS_UNTIL` contém um prazo futuro em milissegundos Unix, dentro das próximas 24 horas. Ao vencer o prazo, o registro para automaticamente, sem reiniciar o serviço. A homologação usa uma janela de uma hora.

Cada registro contém exclusivamente `event`, `at`, `signature256Present`, `signature256FormatValid`, `legacySignaturePresent`, `rawBodyRead`, `result`. Não inclui conteúdo, URLs, IDs da conta, IPs, cabeçalhos, assinaturas, hashes, segredos ou credenciais. O resultado distingue `MISSING_SIGNATURE`, `INVALID_SIGNATURE_FORMAT`, `HMAC_MISMATCH`, `VALID_SIGNATURE`. A presença de SHA1 é observada somente como booleano: SHA1 nunca substitui a exigência de SHA256. Falha no registro não altera a autenticação.

`rawBodyRead=true` significa que o corpo original foi lido como bytes por `boundedWebhookBody`, antes de `JSON.parse`. Não existe middleware/proxy no código nem normalização/re-serialização JSON anterior ao HMAC. O Caddy configurado remove somente Authorization e Cookie; mantém a assinatura e limita o tamanho do corpo. Essas verificações de código/configuração precisam ser confirmadas no receptor com sondas diretas e por Caddy, incluindo espaços, CRLF e Unicode, e assinatura propositalmente calculada sobre JSON re-serializado (deve falhar).

Testes locais com segredos exclusivamente fictícios passaram: 123 unitários, TypeScript, lint, build Docker de produção e teste completo de recepção isolada. A suite verifica os quatro resultados, ausência de valores privados nos logs, preservação de bytes por HTTPS/Caddy e manutenção dos bloqueios do painel, worker, token e saída de internet. O coletor possui lista fechada de campos/tipos; registros com campos adicionais são descartados.

O diagnóstico na VPS substitui apenas o container web desse projeto, mantendo imagem anterior para rollback. Não executa migrations, restaura dados, altera Caddy/DNS, credenciais ou worker. As sondas usam envelopes vazios e não criam eventos. A instalação e o novo teste da própria Meta são etapas separadas: não considerar os resultados das sondas como evidência de assinatura da Meta.

**Limite da associação com o aplicativo:** a igualdade do segredo entre o PC e o receptor pode ser verificada sem exportá-lo, por uma requisição assinada em memória aceita pelo receptor. Isso não revela a qual aplicativo Meta o segredo pertence. Não há App ID configurado localmente que permita verificar essa associação; o nome “Pulso”, o formato de 32 caracteres e a verificação GET não a comprovam. Não declarar essa correspondência confirmada sem evidência adicional do aplicativo correto. Não substituir credenciais antes de distinguir as causas do HTTP 401.

Não há evidência capturada sobre o cabeçalho do exemplo anterior, pois ele foi corretamente omitido dos logs. Uma nova tentativa observará presença e formato, inclusive a eventual presença do cabeçalho legado, sem presumir que exemplos do botão Testar tenham dispensa de assinatura. IDs de exemplo que não correspondam à conta autorizada podem ser ignorados após HMAC válido; essa situação é distinta de HTTP 401.

### Resultado do diagnóstico na VPS — 15/10/2026, 22:10 (Brasília)

A instrumentação foi instalada somente no web, com HMAC obrigatório e expiração às 23:06:37. Passaram as sondas diretas e através do Caddy, com corpo UTF8 incluindo espaços e CRLF. Assinaturas sobre JSON re-serializado, corpo adulterado, formato inválido, ausência de SHA256 e apenas SHA1 foram rejeitadas. Esses registros iniciais, às 22:06:50, são sondas do Pulso, não eventos da Meta.

Após o proprietário repetir `comments` v26.0, os novos registros às **22:10:11.996** e **22:10:43.578** mostraram:

- `signature256Present=true`, `signature256FormatValid=true` e `legacySignaturePresent=true`.
- `rawBodyRead=true`, com resultado `HMAC_MISMATCH` antes de interpretar o JSON.
- HTTP 401 nos mesmos horários no monitor do Caddy.
- Zero eventos, tarefas ou saídas no banco de homologação; serviços saudáveis e worker ausente.

Está identificada a causa imediata da rejeição: assinatura SHA256 presente e bem formada, mas divergente do HMAC calculado pelo receptor sobre os bytes recebidos com o segredo configurado. Não foi ausência de cabeçalho ou erro de formato. O cabeçalho SHA1 foi apenas observado como presente e não foi usado para aceitar o evento.

A configuração do Caddy corresponde ao arquivo revisado, e as sondas confirmaram preservação dos bytes e do cabeçalho nesse caminho. Uma sonda adicional do PC às **22:11:39** recebeu HTTP 200, confirmando novamente igualdade do segredo local e do receptor; ela usou envelope vazio, não chamou a API do Instagram e não criou eventos. Esse HTTP 200 não pertence à Meta.

A divergência ainda não comprova qual segredo/aplicativo a Meta utilizou. Falta identificar o App ID do aplicativo onde o teste foi acionado e verificar a associação com segurança, sem alterar nem expor credenciais. Não concluir que o botão Testar dispensa assinatura; o teste observado enviou SHA256 válido no formato. Nenhuma proteção, credencial, inscrição, publicação ou envio foi alterado nesta verificação.

### Verificação do App ID geral informado pelo proprietário

Uma consulta GET à Graph API v26.0, restrita a `id,name`, confirmou o nome Pulso e o mesmo App ID fornecido pelo proprietário. A autenticação foi composta em memória a partir do par existente, somente no cabeçalho HTTPS, sem credenciais na URL, emissão/renovação de token ou persistência dessa credencial. Um controle com segredo fictício foi rejeitado pela autenticação. Assim, o segredo configurado é válido para **esse App ID**, sem provar que essa seja a identificação da integração Instagram que originou o POST.

Uma leitura adicional de `/{app-id}/subscriptions` retornou HTTP 200 com lista vazia, embora o painel do produto Instagram mostre campos assinados. Essa diferença exige identificar o “Instagram App ID” na configuração de Instagram Login e comparar os contextos; não permite concluir automaticamente que falte inscrever campos ou que o segredo deva ser trocado. Nenhum POST de inscrição, mudança de segredo ou alteração de publicação foi executado. A rejeição dos eventos permanece `HMAC_MISMATCH` até nova evidência.

Referência do formato de autenticação em memória: [SDK oficial arquivado da Meta, FacebookApp::getAccessToken](https://github.com/facebookarchive/php-graph-sdk/blob/5.x/src/Facebook/FacebookApp.php). O resultado atual da associação decorre das respostas reais da API e do controle negativo, não da idade desse SDK.

### Diagnóstico com candidato do produto Instagram Login

O proprietário identificou o Instagram App ID do produto, diferente do App ID geral, e salvou seu segredo existente em arquivo privado fora do repositório. O candidato tem formato esperado e difere da configuração ativa. A consulta desse par ao Graph do Facebook retornou erro de autenticação; isso não confirma a associação nem prova que o candidato do produto Instagram esteja incorreto. Não emitir/renovar tokens ou redefinir segredos para contornar esse resultado.

Foi preparada uma comparação temporária sobre os mesmos bytes originais de cada POST. O arquivo opcional `/run/secrets/instagram_diagnostic_candidate`, montado somente para leitura, é lido apenas durante o diagnóstico habilitado com prazo finito. Não substitui `INSTAGRAM_APP_SECRET`, não é utilizado para aceitar eventos e não fica embutido na imagem. Ausência, erro de leitura, formato inválido ou expiração deixam a autenticação normal intacta.

O registro sanitizado acrescenta somente `candidateHmacMatches`: `true` ou `false` quando houve comparação, `null` quando ela não foi realizada. Mesmo se esse campo for `true`, a assinatura divergente da chave ativa continua retornando HTTP 401 antes de qualquer persistência. Nenhum corpo, cabeçalho, assinatura, segredo ou derivação é exportado. O candidato não deve ser registrado em `.env`, Git, comandos, relatórios ou logs.

Os testes devem comprovar que candidato correto não autoriza ingestão, chave ativa correta continua funcionando, corpo adulterado é rejeitado, observabilidade não vaza valores e o arquivo deixa de ser lido com o diagnóstico desligado/expirado. A comparação de um novo POST da Meta ainda é necessária para concluir a causa e solicitar autorização antes de eventual substituição da credencial ativa. Esta preparação não confirma correção do candidato nem sucesso da Meta.

Validação da comparação: 126 testes unitários, oito de runtime, TypeScript e lint passaram. A suite Docker construiu a imagem de produção e confirmou HTTPS, isolamento, HMAC, candidato sem poder de autenticação, persistência/deduplicação somente com a chave ativa e ausência de valores privados nos logs. Seus volumes descartáveis foram removidos e os demais contêineres preservados. O coletor de diagnóstico também passou pelos testes de lista explícita de campos e descarte de valores inesperados. Nada dessa suite utilizou credenciais ou dados reais.

#### Resultado do novo teste da Meta: causa comprovada

A instalação temporária ficou pronta às 22:51 de 15/10/2026, horário de Brasília. As sondas próprias das 22:51:14–15 validaram os caminhos direto e Caddy; não são eventos da Meta. Após o proprietário confirmar que repetiu `comments` v26.0, foi observado um novo POST às **22:56:52.966** (01:56:52.966 UTC de 16/10), com:

- Assinatura SHA256 presente e com formato válido; corpo original lido.
- `result=HMAC_MISMATCH` com a credencial ativa.
- `candidateHmacMatches=true` com o segredo existente do produto Instagram Login, sobre os mesmos bytes e a mesma assinatura.
- HTTP **401** no Caddy às 22:56:52.967, pois a comparação não autoriza ingestão.
- Web, Caddy e PostgreSQL saudáveis, nenhum erro no monitor e zero eventos, tarefas e saídas no banco de homologação. Worker ausente, modo de envio `disabled` e nenhum access token no receptor.

Isso comprova a causa deste 401: a credencial ativa é válida para o aplicativo geral, mas não corresponde à chave que assinou o webhook observado. O candidato do produto Instagram Login corresponde. Não é necessário gerar ou redefinir segredos na Meta. O teste refuta, para esse POST, a hipótese de ausência de assinatura ou de modificação do corpo entre os dois cálculos. A assinatura continuou obrigatória; a credencial ativa e o `.env` local não foram alterados nesta verificação.

**Plano de correção autorizado pelo proprietário:** usar o candidato comprovado como `INSTAGRAM_APP_SECRET` no receptor e no `.env` local, com backups privados das configurações anteriores. Recriar somente o serviço web para carregar o segredo, retirar o candidato da comparação e validar saúde, desafio, HMAC, bloqueio das rotas do painel, ausência de worker/token/envios e preservação dos demais containers. Não reiniciar PostgreSQL ou Caddy, alterar DNS, inscrever a conta ou publicar o aplicativo. Se a validação falhar, restaurar o segredo anterior e recriar somente o web. Depois repetir o teste da Meta para comprovar assinatura ativa válida e HTTP 200; a persistência de evento da conta real é uma verificação posterior distinta.

#### Execução da correção autorizada

A inspeção dos usos de `INSTAGRAM_APP_SECRET` confirmou somente validação HMAC e checagens de prontidão. Consulta de perfil, sincronização de Reels e autenticação de leitura usam `INSTAGRAM_ACCESS_TOKEN`, sem depender desse segredo. Não há troca OAuth ou geração de `appsecret_proof` implementada. Nenhum fluxo de autenticação foi modificado.

O `.env` local foi atualizado preservando integralmente o restante do texto e das variáveis; token e bloqueios de envio/recepção local permanecem intactos. A consulta de leitura à Meta antes e depois retornou `CONNECTED` com a mesma conta fixada. Backup: pasta privada `pulso-hostinger/webhook-secret-correction-20261015`, arquivo `.env.before.private`, fora do repositório. Tanto ele quanto o `.env` têm ACL restrita ao proprietário do Windows e SYSTEM. O arquivo intermediário da troca foi consumido; a cópia privada original do candidato permanece pendente de limpeza.

Passaram novamente 126 testes unitários e oito de runtime. Em Compose descartável, a troca do segredo com recriação exclusiva do web foi validada: chave anterior rejeitada com 401, nova aceita com 200, desafio preservado, candidato desmontado, painel bloqueado, dados mantidos e nenhuma saída. A reversão também passou: a chave anterior voltou a funcionar e a nova foi rejeitada. PostgreSQL e Caddy mantiveram IDs, início e reinícios durante a troca/reversão; outros projetos permaneceram intactos. Nenhum dado ou segredo real foi usado nesse ensaio.

O pacote administrativo `/srv/pulso/preparation/webhook-secret-correction-20261015` foi verificado e executado pelo proprietário no Web Terminal, pois o sudo da sessão SSH exige senha e a autenticação administrativa não é compartilhada entre sessões. **Execução já concluída; não repetir o instalador:**

```bash
sudo bash /srv/pulso/preparation/webhook-secret-correction-20261015/start-secret-correction.sh
```

Ele cria e confere backups privados antes de substituir atomicamente somente o arquivo de assinatura. Recria exclusivamente o web, usando a imagem já instalada; não faz build, migrations ou restore. O candidato fica desmontado, a observação sanitizada dura uma hora e o arquivo temporário do candidato na VPS é removido somente após as sondas de HTTPS/HMAC, desafio, isolamento e contagens inalteradas. O segredo anterior é mantido no backup privado; credenciais não aparecem em comandos, logs, imagens ou Git.

Falha nas verificações dispara restauração automática do segredo anterior e recriação somente do web. O procedimento manual equivalente, disponível após o backup ter sido criado, é:

```bash
sudo bash /srv/pulso/private/webhook-secret-correction-20261015/rollback-secret-correction.sh
```

Para reverter o ambiente local, recuperar somente o valor anterior de `INSTAGRAM_APP_SECRET` do backup privado, preservando eventuais edições posteriores nas outras variáveis e a ACL restrita. Não copiar configurações inteiras sobre mudanças novas.

**Resultado confirmado às 23:23 de 15/10/2026 (Brasília):** instalação em estado `READY`; web, Caddy e PostgreSQL saudáveis, sem erros no monitor. O segredo foi atualizado com backup privado; candidato desmontado e arquivo temporário removido na VPS. Contagens de eventos, tarefas, saídas, proprietários, Reels e automações da homologação permaneceram zero. PostgreSQL, Caddy e outros contêineres não foram reiniciados; worker ausente, envios desativados e nenhum access token no receptor. A cópia temporária local do candidato permanece protegida, com limpeza pendente.

Uma sonda adicional do PC, entre **23:24:20 e 23:24:22**, validou o caminho público com certificado HTTPS confiável. O HMAC produzido em memória a partir do novo segredo do `.env` local recebeu 200; o segredo anterior, corpo adulterado e requisição sem assinatura receberam 401. As rotas administrativas verificadas retornaram 404 e o site público da Vercel retornou 200. A consulta de leitura à Meta continuou `CONNECTED`, com a mesma conta e o token existente. Nova comparação confirmou somente a alteração de `INSTAGRAM_APP_SECRET` e ausência de credenciais antigas/novas nos arquivos rastreados.

Esses HTTP 200 são **sondas do Pulso com envelope vazio**, sem chamadas à API da Meta, persistência de eventos ou envio de mensagens. O monitor sanitizado está ativo até **00:23:08 de 16/10/2026 (Brasília)**. Próxima ação: repetir uma vez `comments` v26.0 na Meta e correlacionar o POST com `VALID_SIGNATURE`, HTTP 200 e o resultado de ingestão. Não confundir exemplo com IDs desconhecidos, que pode ser autenticado e ignorado, com evento da conta real persistido.

#### Teste da Meta após a correção: HMAC válido, persistência ainda não comprovada

Após o proprietário confirmar o novo teste `comments` v26.0, o monitor registrou duas entregas adicionais, distintas das sondas do Pulso:

| Horário de Brasília em 15/10/2026 | HMAC do receptor | HTTP no Caddy |
| --- | --- | --- |
| 23:28:25.610 | `VALID_SIGNATURE` | 200 às 23:28:25.614 |
| 23:28:39.981 | `VALID_SIGNATURE` | 200 às 23:28:39.983 |

Ambas tinham SHA256 presente e no formato esperado, com validação sobre o corpo original. O candidato estava desmontado (`candidateHmacMatches=null`); a autenticação foi feita pela credencial ativa corrigida. O monitor estava sem erros, os três serviços saudáveis, o web em redes internas e sem access token, o worker ausente e os envios desativados.

**Não houve evento registrado no banco de homologação:** eventos, tarefas, saídas e atividades continuaram zero. O HTTP 200 comprova autenticação, envelope válido e conclusão do processamento de ingestão; não comprova criação de registro. O código persiste apenas eventos normalizados elegíveis vinculados unicamente à conta fixada e ao workspace. Eventos de exemplo que não atendam a esses critérios são ignorados com 200. Como o diagnóstico não captura payloads ou identificadores de requisições, não é possível afirmar qual filtro ignorou esse exemplo somente a partir dos registros disponíveis. Não relaxar os vínculos nem inserir dados artificiais para produzir uma contagem positiva.

A consulta segura `npm run instagram:webhooks:check`, após esse teste, retornou novamente `NOT_SUBSCRIBED`, com `apps=[]` e `readOnly=true`. Não houve POST de inscrição. Essa pendência da conta é distinta do sucesso do teste de exemplo; ainda é necessário preparar/aprovar a inscrição para recepção e depois comprovar um comentário real elegível, com HMAC válido e evento/tarefa persistidos, mantendo o worker parado. Não publicar o aplicativo nem habilitar envios para contornar requisitos de permissões, papéis ou modo da Meta.

#### Inscrição autorizada e encerramento da sessão

Posteriormente, o proprietário autorizou exclusivamente a inscrição da conta fixada em `comments`, `messages`, `messaging_postbacks`, `messaging_seen`. A identidade e o estado anterior vazio foram conferidos antes da operação. Foi executado um único POST com o token existente no cabeçalho; a API respondeu sucesso. Leituras independentes posteriores retornaram `SUBSCRIBED` e os quatro campos. Não foi alterada a flag persistente de aprovação no `.env`, não houve emissão de token, publicação do aplicativo, novo deploy, comentário real ou envio.

A API retornou um identificador de aplicativo diferente dos identificadores previamente anotados do painel, sem fornecer nome/mapeamento. A comparação direta desses identificadores não foi tomada como equivalência. A confirmação atual é da inscrição retornada pela API para o token e a conta fixada; conferir a correspondência no painel Meta antes do lançamento. Os snapshots anteriores/posteriores e as limitações da auditoria foram guardados privadamente, fora do Git.

O estado anterior era vazio. Qualquer reversão deve remover apenas a inscrição criada, após nova autorização e nova leitura, preservando mudanças posteriores de terceiros. Não revogar o token, redefinir segredos ou excluir dados para reverter a inscrição. Nenhuma reversão foi executada.

Foi acrescentado um teste de integração em PostgreSQL descartável: exemplos assinados de outra conta ou sem timestamp retornam 200 sem inserir registros; um comentário válido da conta fixada persiste evento e tarefa mesmo com status `NOT_CONNECTED`, modo disabled e sem executar envios. Isso distingue caminhos possíveis do exemplo ignorado, mas não identifica retrospectivamente seu filtro exato, pois os payloads reais não foram capturados. Não foram inseridos dados artificiais na homologação para simular sucesso.

Encerramento com worker ausente, envios bloqueados, painel privado e dados locais preservados. Nenhuma nova implantação foi feita na auditoria. O relatório completo de segurança é privado. O próximo teste com comentário real e qualquer envio real dependem de autorização em outra sessão.

### Configuração na Meta e próxima etapa

No aplicativo correto, em Instagram → API setup with Instagram login → Webhooks, configurar:

- Callback: `https://webhooks.pulso.brunodallier.com.br/api/webhooks/instagram`.
- Verify token: valor privado de `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` no `.env` local. Copiar diretamente para o site da Meta; nunca para o chat, Git, logs ou capturas.
- A verificação GET foi confirmada pelo proprietário, assim como os campos `comments`, `messages`, `messaging_postbacks` marcados como assinados. `messaging_seen` não foi confirmado. Esses campos no aplicativo são distintos da inscrição da conta.

A consulta de leitura `npm run instagram:webhooks:check` ainda retornou `NOT_SUBSCRIBED`. Primeiro resolver o HTTP 401 do teste da Meta, conferindo privadamente o App Secret do mesmo aplicativo/integração testado; depois repetir a validação e revisar a inscrição da conta. Não publicar o aplicativo, alterar seu modo ou aplicar inscrições para contornar uma falha de assinatura. A conta/testador, permissões e modo do aplicativo ainda precisam ser conferidos para eventos reais. Um comentário controlado deverá comprovar evento autêntico persistido na homologação, sem executar a fila ou habilitar envios. Um exemplo do painel com IDs fictícios pode ser autenticado e ignorado pelo vínculo da conta; isso deve ser distinguido de uma falha de assinatura.

## Histórico da preparação anterior à publicação

As seções seguintes registram os testes locais e o plano elaborado antes da autorização de publicação. As ações concluídas na VPS estão descritas acima. Não repetir a inicialização sobre a instalação existente.

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

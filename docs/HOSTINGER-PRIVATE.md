# Pulso privado — preparação independente da migração DNS

**Fase 2 adiada:** a prioridade atual é [HOSTINGER-MVP.md](HOSTINGER-MVP.md), mantendo Registro.br e DNSSEC. Os recursos Cloudflare abaixo continuam preservados/inativos; o token administrativo temporário foi revogado com autorização em 14/10/2026. Não combinar o overlay privado com o overlay MVP.

Use `compose.production.yaml` com `compose.private.yaml` para a implantação privada. O segundo arquivo remove todas as portas publicadas do Caddy. Web, PostgreSQL e worker continuam sem portas no host. Não executar a variante pública do Compose para este ambiente.

Em 14/10/2026, o proprietário ativou Zero Trust Free; a política reutilizável restrita ao seu e-mail, com sessão de oito horas, e o provedor One-time PIN foram cadastrados e confirmados no painel. Depois da autorização específica, foi criado o Tunnel `pulso-private`, com configuração local, status inativo e nenhuma conexão. As credenciais estão em diretórios privados separados da release e têm uma cópia fora da VPS. A aplicação Access para o domínio definitivo ainda não foi criada: a zona permanece pendente e o seletor de domínios não oferece zonas inativas, conforme o requisito oficial. A política, sozinha, não protege um hostname nem publica qualquer serviço. Nenhum conector ou rota DNS foi iniciado.

```bash
# Validação sem imprimir arquivos privados, sem iniciar serviços:
sudo docker compose --env-file /srv/pulso/private/production.env -p pulso \
  -f compose.production.yaml -f compose.private.yaml config --quiet
```

O Caddy atende somente HTTP na rede Docker em 8080; HTTPS público termina no Cloudflare e trafega pelo Tunnel criptografado até o conector. Essa conexão HTTP final fica dentro do mesmo host, sem porta publicada. O proxy fixa X-Forwarded-Proto=https, remove cabeçalhos de identidade antes de encaminhar e mantém o login interno e cookies seguros da plataforma. Hostnames desconhecidos, saúde e webhooks são recusados com 404. UFW não é a única proteção: Docker pode contornar regras de UFW quando publica portas, por isso a ausência de port bindings é verificada no teste.

## Access e Tunnel

1. A organização **Zero Trust Free** já foi ativada pelo proprietário no site. O plano Free da zona DNS não ativa automaticamente esse produto. Os aceites e dados de pagamento foram tratados pelo proprietário, sem fornecer credenciais no chat. Não ativar outro produto, armazenamento ou plano pago como consequência dessa autorização.
2. Criar um provedor **One-time PIN** e uma aplicação self-hosted para o hostname exato do Pulso, sem wildcard ou restrição apenas a `/login`. Uma única política Allow inclui somente o e-mail confirmado pelo proprietário. Sem Everyone, Bypass, outros usuários ou autenticação via WARP; somente o IDp OTP habilitado. Demais usuários são negados por padrão. Não remover o login interno.
3. Criar um Tunnel nomeado com **configuração local**, sem rota DNS, sem private-network routes e sem iniciar conectores. O assistente do painel cria um Tunnel gerenciado remotamente; para conservar a configuração local testada, usar a API oficial com token temporário **Account / Cloudflare Tunnel / Edit**, restrito à conta correta e com prazo curto. Essa permissão administrativa também permite excluir túneis da conta; a automação abaixo não executa exclusões. A emissão da credencial requer autorização do proprietário. Conta, UUID, AUD e team name devem vir dos recursos reais do Cloudflare. Não usar exemplos como recursos reais. Credenciais do Tunnel são distintas de tokens de administração da API: não montar tokens administrativos nos containers.
4. Obter o estado REAL da aplicação, políticas e provedor via API/painel autenticado, e guardar privadamente no formato de `deploy/cloudflare-state.example.json`. O exemplo não é uma configuração utilizável e não contém credenciais reais. O campo TunnelSecret, quando real, nunca vai ao Git, prints, URLs ou logs.
5. Gerar arquivos privados com `node ops/cloudflare/prepare.mjs ARQUIVO-DE-ESTADO DIRETORIO-NOVO`. O programa recusa política ampla, domínio wildcard/path, outros IDps, WARP, credenciais de outra conta/Tunnel, dados inválidos e saída existente. Valida antes de gravar e publica o par de arquivos por renomeação do diretório preparado. Não altera Cloudflare, DNS ou serviços. Na VPS, pode ser executado em um container Node com rede desativada, código montado somente leitura e diretório privado de saída; não é necessário instalar Node no host.
6. Configuração gerada exige JWT com o AUD real no cloudflared (`originRequest.access.required: true`). Somente o hostname exato chega ao Caddy; saúde/webhooks e qualquer outro hostname recebem 404. O conector só participa da rede `edge`; PostgreSQL e worker ficam na rede `application`. O worker também possui saída dedicada para Graph, sem publicar portas; banco não participa dessa rede. Caddy liga `edge` e `application`.

Preparação dos arquivos, na implantação autorizada:

```bash
# Diretório deploy/cloudflare ignorado no Git; criar o vínculo com o diretório privado
# ou copiar apenas config.json, mantendo o arquivo original privado.
install -d -m 700 deploy/cloudflare
# Colocar config.json em deploy/cloudflare/config.json e tunnel_credentials em deploy/secrets/.
sudo chown 65532:65532 deploy/cloudflare/config.json deploy/secrets/tunnel_credentials
sudo chmod 400 deploy/cloudflare/config.json deploy/secrets/tunnel_credentials
```

O Compose local não aplica criptografia no host nem garante remapeamento UID de arquivos bind-mounted. Os arquivos precisam ser legíveis pelo UID 65532 real do conector; web e tools continuam com UID 10001. Não modificar permissões dos segredos já usados sem planejar a janela de implantação.

**Não iniciar o perfil `tunnel` nesta preparação.** A futura ativação exige Access real validado, zona ativa, autorização de implantação e dados restaurados/validados. Antes de criar o CNAME proxied `pulso → UUID.cfargotunnel.com`, testar o comportamento do Access. Uma rota publicada sem Access exporia a aplicação. Não usar Quick Tunnels, `trycloudflare.com`, `--url` improvisado ou bypass temporário.

O cloudflared 2026.10.0 está fixado; usa 128 MB/0,2 CPU, filesystem somente leitura, sem capabilities, no-new-privileges, logs rotacionados e restart unless-stopped. Sua saúde consulta /ready em loopback; nenhuma porta de métricas é publicada. A aplicação Access ainda precisa do hostname em zona ativa e do AUD real para gerar a configuração final do conector. O Tunnel foi criado após autorização administrativa e permanece inativo. Os testes offline não substituem um teste real de login OTP/JWT no Cloudflare.

### Criação administrativa do Tunnel, depois da autorização

`ops/cloudflare/create_tunnel.py` usa somente a biblioteca padrão Python, já disponível no Ubuntu. O token é lido de um arquivo privado, nunca passado como valor em argumentos, URL ou variáveis do container. O procedimento consulta túneis com o nome `pulso-private` e recusa qualquer recurso existente; faz um único POST com `config_src=local`. Não configura DNS, ingressos, redes privadas, conectores, serviços ou exclusões. Redirecionamentos HTTP são recusados e mensagens de erro não reproduzem respostas da API ou segredos.

```bash
# Somente depois da autorização da credencial, com ACCOUNT_ID real:
python3 ops/cloudflare/create_tunnel.py ACCOUNT_ID \
  /srv/pulso/private/cloudflare-api-token \
  /srv/pulso/private/tunnel-prepared
```

O arquivo de token precisa ter modo 600 no Linux. O diretório de saída precisa ser novo e ficar fora do clone, com modo 700. Antes do POST, a chave gerada é persistida em `request.private.json`, modo 600; esse diário é secreto, não um relatório público. A credencial e os metadados só são escritos depois de confirmar conta, UUID, nome, configuração local, status inativo e ausência de conexões. Falha de rede depois do POST pode significar que o recurso foi criado: preservar o diário e conferir o recurso na conta antes de qualquer nova tentativa. Não repetir automaticamente nem apagar túneis para resolver uma falha. Não conservar o token administrativo em containers ou backups da aplicação; permitir sua expiração/revogação após a preparação. A credencial limitada ao Tunnel permanece guardada privadamente para a futura implantação autorizada.

## Segredos de produção e backups

Foram preparados na VPS, fora do clone, novos segredos exclusivos: PostgreSQL, sessão e senha Restic. Nada foi copiado do ambiente local. O token Instagram e chaves S3 continuam vazios. O domínio definitivo foi colocado em um arquivo de ambiente pendente, que não é consumido por serviços atuais. O processo recusa sobrescrever uma preparação existente.

A senha Restic nova também tem uma cópia privada fora da VPS, no computador do proprietário, com ACL limitada ao usuário e SYSTEM. Nunca imprimir seu conteúdo ou colocar a cópia no Git. A geração da senha não significa que o backup externo esteja funcionando: faltam repositório/bucket e credenciais com acesso restrito. O perfil `backup` permanece desligado até configurar e testar o armazenamento.

Preferir bucket privado S3 compatível separado para Pulso, credenciais de objeto restritas ao bucket e prefixo dedicado. Cloudflare R2 é uma possibilidade na conta existente, mas a ativação/termos e eventual cobrança precisam ser aprovados antes de contratar/habilitar. A senha Restic deve continuar guardada fora da VPS. Antes da publicação, exigir: dump oficial validado, backup criptografado enviado, `restic check --read-data` e recuperação integral em banco isolado. Reter 7 diários, 4 semanais e 6 mensais conforme a configuração existente. Nenhum banco foi criado/restaurado na VPS e nenhum dado foi migrado nesta fase.

## Segurança e preparação do servidor

Reutilizar o SSH por chave, login root/senha bloqueados, sudo interativo, firewall existente, Docker/Compose oficiais e logs com rotação já configurados e testados. Não mudar firewall, grupo docker, instalações ou serviços desnecessariamente. Código de preparação fica separado da release ativa; segredos fora do repositório. Aplicar o UID/permissões finais com sudo somente na implantação autorizada. Manter projetos Compose, redes, volumes e credenciais do futuro WhatsApp separados; não acessar o socket Docker por TCP.

## Testes específicos desta preparação

```powershell
npm run test:runtime
node tests/docker/private.mjs
node tests/docker/backup-failures.mjs
python -m unittest discover -s tests/cloudflare -p 'test_*.py' -v
npm run lint
npm run typecheck
```

O teste privado usa um projeto Docker aleatório, banco novo descartável e segredos aleatórios de teste. Não carrega .env, dump real, token Instagram ou credenciais Cloudflare, e não abre portas no host. Usa a imagem de aplicação já construída/testada para verificar a NOVA topologia: configuração das rotas cloudflared com rede desativada, login real do Pulso pelo proxy interno, API negada sem sessão, bloqueio de saúde/webhooks, desconhecidos com 404, redes isoladas e ausência de conector ativo. Compara IDs/inícios/restarts dos outros containers antes/depois e remove apenas o projeto do próprio teste. Não simula um sucesso de OTP/JWT real; isso será testado depois da ativação da conta.

O teste adicional de falhas de backup usa somente a imagem de backup já construída, com rede desativada, volume novo identificado como descartável e senhas aleatórias. Confirma que configuração ausente, repositório não inicializado e senha incorreta falham com mensagens genéricas, sem revelar as senhas nem alterar o conteúdo do repositório. Depois de uma tentativa com chave incorreta, a chave correta continua validando a integridade. Nenhum banco ou dado real é acessado; não substitui o teste de recuperação integral já realizado nem a validação futura do armazenamento externo contratado.

## Ordem para concluir a implantação

- Continuar a preparação de Access/Tunnel assim que Zero Trust estiver ativado, independentemente do bloqueio DNS.
- Reutilizar o provedor OTP e a política existentes. O hostname público de Access requer uma zona ativa: não usar um hostname fictício ou custom hostname de SaaS para contornar a zona pendente. A criação do Tunnel via API não cria a rota DNS nem inicia a VPS.
- Manter migração do Registro.br bloqueada até confirmar o DS automático; a pergunta ao suporte está preparada, não enviada. TTL do DS, NS e registros são medidos separadamente; não usar TTL de A como espera do DS.
- Configurar backup externo e executar validação de recuperação antes de liberar produção.
- Solicitar autorização específica para transferência/restauração dos dados, corte DNS e início privado da plataforma. Preservar os bancos e dados locais para rollback.
- Nenhum webhook ou envio real habilitado. O fluxo foi implementado/testado em entrega posterior: [INSTAGRAM-MVP.md](INSTAGRAM-MVP.md). O callback preparado tem hostname separado, desafio/HMAC e deduplicação; não há bypass do Access no painel humano. Para fase 2, a rota de máquina precisará de implantação autorizada própria, mantendo as regras de assinatura.

Referências: [Access para aplicações self-hosted](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [configuração local de Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/), [validação JWT no conector](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/#access), [Cloudflare e DNSSEC](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

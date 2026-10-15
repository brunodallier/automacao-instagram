# Pulso em Docker — preparação para Hostinger KVM 2

Esta configuração prepara uma VPS Linux com 2 vCPUs e 8 GB de RAM. A infraestrutura básica da VPS foi preparada, sem implantação ou migração de dados. O `compose.yaml` de desenvolvimento e a conexão do localhost permanecem independentes. A prioridade atual é [HOSTINGER-MVP.md](HOSTINGER-MVP.md), com DNS no Registro.br e `compose.mvp.yaml` adicionando proteção independente ao Caddy. A fase futura de Cloudflare usa [HOSTINGER-PRIVATE.md](HOSTINGER-PRIVATE.md) e `compose.private.yaml`. Nunca combinar os dois overlays ou iniciar o Caddy público básico sem a proteção adicional.

## Serviços e limites

| Serviço | Função | Memória máxima | CPU máxima |
| --- | --- | --- | --- |
| web | Next.js standalone, usuário sem privilégios, filesystem somente leitura | 1536 MB | 1 |
| postgres | PostgreSQL 18.6, UTF8/C.UTF-8, checksums, volume persistente | 2048 MB | 1 |
| worker | Standby por padrão; fila persistente quando autorizado/configurado | 256 MB | 0,2 |
| caddy | HTTPS e proxy para web | 128 MB | 0,25 |
| backup, opcional | Dump oficial e backup Restic criptografado | 512 MB | 0,25 |
| migrate, temporário | `prisma migrate deploy`, antes de iniciar web/worker | 768 MB | 0,5 |

Os tetos dos serviços permanentes somam 4,375 GiB com backup no Compose básico, ou 4,5 GiB com Caddy do overlay MVP, deixando margem para Linux, Docker e cache de disco. Tetos de CPU são limites individuais compartilhados pelas duas vCPUs; não são reservas. O pool web usa até cinco conexões e o worker uma; PostgreSQL aceita até 40. O build limita o heap Node a 2 GB e o paralelismo Next a dois workers. Evite builds simultâneos, preferindo construir uma imagem por release antes de atualizar os serviços.

Isso é um ponto de partida para esta instalação privada, sem promessa de capacidade de envios ou alta disponibilidade. Worker, banco e aplicação estarão no mesmo servidor. O modo padrão `disabled` continua em standby com leitura do banco. O worker de execução foi implementado e testado com API simulada; exige modo controlado ou live autorizado, configuração e schema novos. Ele recebe somente token Instagram e banco, sem App Secret ou segredo de sessão. Possui saída dedicada para Graph; PostgreSQL permanece interno. [Fluxos e bloqueios para a validação real](INSTAGRAM-MVP.md).

## Preparação futura da VPS

1. Escolher Ubuntu LTS x86_64, configurar acesso SSH por chave e instalar Docker Engine com o plugin Compose conforme a [documentação oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Habilitar a inicialização de Docker com o sistema (`sudo systemctl enable --now docker`). Manter atualizações do sistema e das imagens planejadas.
2. Configurar DNS do domínio apontando para a VPS. Permitir TCP 80/443 e SSH restrito conforme seu acesso. Não publicar 3000, 5432 ou a porta administrativa 2019. Docker publica portas através de suas próprias regras de firewall: conferir também o firewall do provedor; não depender apenas de UFW.
3. Clonar este repositório e revisar a release escolhida. Nenhuma credencial deve entrar no clone ou na imagem.
4. Criar a configuração privada, inserir segredos manualmente e preparar o backup externo antes de liberar a plataforma.

```bash
cp deploy/production.env.example deploy/production.env
install -d -m 700 deploy/secrets deploy/backups
umask 077
```

Edite `deploy/production.env`: `PULSO_DOMAIN` é somente o domínio e `PULSO_PUBLIC_URL` a origem HTTPS completa do mesmo domínio. Os nomes de banco e usuário devem coincidir com a URL privada abaixo. Este arquivo é ignorado pelo Git; não inclua senhas nele.

Crie estes arquivos com um editor local seguro, sem `echo` de credenciais, histórico de comandos ou prints:

| Arquivo em `deploy/secrets/` | Conteúdo |
| --- | --- |
| postgres_password | Senha forte e aleatória do PostgreSQL novo |
| database_url | `postgresql://USUARIO:SENHA_CODIFICADA@postgres:5432/BANCO` |
| nextauth_secret | Segredo de sessão aleatório com pelo menos 32 caracteres |
| instagram_token | Token já autorizado, copiado privadamente; pode ficar vazio para iniciar sem integração |
| instagram_app_secret | App Secret do aplicativo Meta; pode ficar vazio com webhooks bloqueados |
| instagram_webhook_verify_token | Segredo independente do desafio; pode ficar vazio com webhooks bloqueados |
| restic_password | Senha aleatória exclusiva do backup, guardada também fora da VPS |
| s3_access_key | Chave do armazenamento externo S3 compatível |
| s3_secret_key | Segredo do armazenamento externo |

Os três últimos são necessários somente ao habilitar o perfil `backup`. Gere segredos diretamente em arquivos privados, por exemplo `openssl rand -hex 32 > deploy/secrets/nextauth_secret`. Senhas na URL precisam de percent-encoding. Não use variáveis `NEXT_PUBLIC_` para credenciais. Preserve o token existente sem transmiti-lo em URLs ou argumentos.

O Compose monta arquivos locais como secrets, **não oferece criptografia destes arquivos no host**. Restrinja o diretório a quem opera o servidor. Para web, worker e tools, o UID do container é 10001; deixe seus arquivos legíveis somente por esse UID. Os arquivos PostgreSQL/backup são lidos por processos privilegiados dentro desses containers:

```bash
sudo chown 10001:10001 deploy/secrets/database_url deploy/secrets/nextauth_secret deploy/secrets/instagram_token deploy/secrets/instagram_app_secret deploy/secrets/instagram_webhook_verify_token
sudo chmod 400 deploy/secrets/database_url deploy/secrets/nextauth_secret deploy/secrets/instagram_token deploy/secrets/instagram_app_secret deploy/secrets/instagram_webhook_verify_token
sudo chown root:root deploy/secrets/postgres_password
sudo chmod 400 deploy/secrets/postgres_password
# Após criar os segredos de backup:
sudo chown root:root deploy/secrets/restic_password deploy/secrets/s3_access_key deploy/secrets/s3_secret_key
sudo chmod 400 deploy/secrets/restic_password deploy/secrets/s3_access_key deploy/secrets/s3_secret_key
```

Nunca versionar esses arquivos, dumps ou `.env`. Quem administra Docker equivale a administrador do host e consegue ler secrets. Não compartilhar `docker inspect`, dumps, arquivos privados ou logs sem revisão.

Defina um atalho para todos os comandos seguintes, dentro do repositório:

```bash
dc() { docker compose --env-file deploy/production.env -p pulso -f compose.production.yaml "$@"; }
dc config --quiet
dc build web migrate backup
```

`config --quiet` valida sem imprimir conteúdo. Não executar `docker compose config` sem `--quiet` em ambientes que utilizem credenciais convencionais.

## Transferência segura dos dados existentes — somente na implantação autorizada

O banco atual do PC continua sendo `automacao_instagram_utf8`; ele não está montado por esta configuração. **Não inicializar outro proprietário ou resetar migrations para transferir dados.** PostgreSQL de produção terá volume próprio. A versão 18 usa `/var/lib/postgresql` como ponto de montagem, conforme a [imagem oficial](https://hub.docker.com/_/postgres).

1. Fazer um primeiro dump completo no PC com `pg_dump --format=custom --encoding=UTF8 --file=pulso-final.dump`, usando as ferramentas oficiais PostgreSQL 18 e credenciais em ambiente privado/arquivo pgpass protegido. Conferir `pg_restore --list pulso-final.dump`, checksum SHA256, contagens das tabelas e migrations. Dumps contêm dados pessoais e hashes; guardar fora do repositório com acesso restrito.
2. No corte definitivo, suspender gravações e parar a aplicação do PC; produzir **novo dump final consistente** e registrar novamente as contagens. O primeiro dump sozinho não inclui alterações posteriores. Transferir dump e manifesto SHA256 por SSH/SFTP, sem usar GitHub, mantendo o banco original intacto.
3. Iniciar apenas o novo PostgreSQL, confirmar `UTF8` e restaurar em banco **vazio**, antes de migrations. `--no-owner --no-acl` adapta somente proprietário/privilégios SQL ao novo usuário da VPS, preservando os registros da aplicação. O usuário configurado pela imagem oficial é administrador desse cluster privado; o banco não é exposto pela rede pública.

```bash
dc up -d postgres
dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SHOW server_encoding"'
# Depois de conferir o checksum do arquivo privado transferido:
dc cp deploy/backups/pulso-final.dump postgres:/tmp/pulso-final.dump
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error --single-transaction /tmp/pulso-final.dump'
```

Se o destino já tiver dados, interromper: não restaurar por cima, não usar `--clean`, `migrate reset`, `force-reset` ou `down -v`. Criar um destino de recuperação separado e revisar antes de trocar. Comparar todas as tabelas, IDs, relacionamentos, migrations e hash do proprietário por checksum privado, sem publicar valores. Conferir os Reels e automações existentes; as quantidades da migração devem refletir o dump final, não ficar fixas em 87.

4. Iniciar aplicação/worker/Caddy. Migrations são um serviço temporário; falha impede a inicialização da aplicação. Uma base restaurada atualizada não reaplica migrations antigas:

```bash
dc up -d web worker caddy
dc ps -a
dc exec -T web node ops/runtime/healthcheck.mjs
dc exec -T worker node ops/runtime/worker-healthcheck.mjs
```

Caddy obtém e renova certificados automaticamente quando DNS e portas estiverem corretos; os volumes `caddy_data` e `caddy_config` preservam certificados/configuração. Domínios locais usam CA local somente nos testes. `NEXTAUTH_URL` HTTPS mantém cookies seguros e a verificação de origem. Testar login, Reels, rascunhos e edição pelo domínio antes de liberar uso normal. Não executar `owner:setup` após restaurar um usuário existente. Para manutenção manual, `dc run --rm tools node node_modules/tsx/dist/cli.mjs scripts/reset-password.ts` mantém prompts mascarados e revogação de sessões; não executar automaticamente.

## Saúde, reinício e logs

Todos os serviços permanentes usam `restart: unless-stopped`; após falha/saída e reinício do host voltam automaticamente se Docker iniciar. Um serviço parado manualmente permanece parado. `migrate` é executado uma vez e precisa terminar com sucesso. Dependências do Compose controlam a partida inicial; não são um gerenciador de failover permanente.

- `/api/health/live`: processo HTTP ativo, sem consulta ao banco.
- `/api/health/ready`: banco acessível, schema utilizável e UTF8; falhas retornam 503 sem detalhes privados.
- Caddy bloqueia `/api/health/*` externamente. Os checks usam a rede interna.
- Worker mantém heartbeat em `/tmp`, falha o check se envelhecer e termina após cinco falhas consecutivas de banco, permitindo reinício automático.
- Backup só renova seu heartbeat depois de dump, envio, verificação e retenção concluídos.

Docker marcar `unhealthy` **não reinicia sozinho** um processo ainda ativo. Acompanhar `dc ps -a`, configurar monitoramento externo de HTTPS/disponibilidade e alertas de backup na implantação. Não há monitor remoto configurado nesta etapa.

Logs têm rotação `json-file`, 10 MB × 3 por container. Caddy remove cabeçalhos, URI e cabeçalhos de resposta do log de acesso; worker/backup usam eventos genéricos. O token permanece somente nos processos web/worker que precisam da Graph API; não entra na imagem, banco, URLs ou logs. Não habilitar logs SQL, debug de credenciais, `set -x` ou dumps de ambiente.

```bash
dc logs --tail 100 web worker caddy
docker stats --no-stream
```

## Backups fora da VPS

Escolher um serviço S3 compatível em outro provedor/conta ou região independente. Configurar `RESTIC_REPOSITORY=s3:https://ENDPOINT/BUCKET/pulso` em `deploy/production.env` e as credenciais nos arquivos privados. Usar conta de armazenamento com acesso somente ao bucket de backup. A senha Restic é essencial: sem ela não há recuperação. Guardá-la, as credenciais de recuperação e este procedimento também fora da VPS.

Somente após configurar o armazenamento, inicializar o repositório **uma vez**, testar e ativar:

```bash
dc --profile backup run --rm backup init
dc --profile backup run --rm backup once
dc --profile backup run --rm backup check
dc --profile backup up -d backup
```

O serviço executa `pg_dump` consistente, valida a estrutura com `pg_restore --list`, gera SHA256, envia dump/manifesto criptografados com Restic e verifica o repositório. Frequência inicial: 24h; retenção: 7 diários, 4 semanais e 6 mensais. O diretório `/tmp` do backup usa RAM, limitado a 256 MB: aumentar esse limite ou usar staging privado em disco quando o dump crescer, preservando margem de memória. O cache local Restic é persistente, mas não substitui o repositório externo. Falhas não geram heartbeat de sucesso; nunca apagar o banco em resposta a uma falha.

A confirmação de checksum/estrutura não basta: repetir periodicamente uma restauração integral em banco separado. A entrega testa criptografia e recuperação num repositório local isolado; conectividade, custos e permissões do armazenamento externo dependem da contratação futura.

### Recuperação

O comando de restore mantém a cópia em `/tmp/recovery` somente enquanto o container está vivo. Para exportá-la ao host privado e encerrar em seguida:

```bash
install -d -m 700 deploy/backups/recovery
dc --profile backup run --rm -v "$PWD/deploy/backups/recovery:/recovery" --entrypoint bash backup -c 'pulso-backup restore && cp -a /tmp/recovery/. /recovery/'
cd deploy/backups/recovery/tmp
sha256sum --check pulso.dump.sha256
```

Voltar ao repositório. Criar um **novo banco UTF8 vazio**, restaurar `pulso.dump` com `pg_restore --exit-on-error --single-transaction --no-owner --no-acl` e comparar dados/migrations antes de trocar `database_url`. Não modificar o banco em uso durante o ensaio. Em perda total da VPS, reconstruir o host, secrets e volume, recuperar o dump externo e validar antes de publicar DNS/acesso.

No primeiro corte, preservar banco e instalação do PC para rollback até autorização do proprietário. Se a VPS receber novas gravações, um retorno ao dump antigo perderia essas alterações; suspender uso e fazer uma cópia consistente delas antes de decidir a recuperação.

## Atualizações futuras

Produzir backup verificado antes de migrations/releases. Construir/taguear imagens por commit, registrar também seus digests e guardar a release anterior. Executar `dc up -d migrate` (ou `dc run --rm migrate` quando necessário), revisar resultado e então atualizar web/worker/Caddy. Uma migração incompatível pode impedir voltar apenas a imagem; avaliar restauração separada. Não atualizar major do PostgreSQL trocando só a tag com o volume existente: planejar dump/restore ou `pg_upgrade` em entrega própria.

Nunca executar `down -v`, `docker volume prune` ou `docker system prune --volumes` no servidor. `dc down` sem `-v` preserva volumes, mas interrompe serviços e só deve ser usado em manutenção planejada. Backups também devem cobrir secrets e configuração por outro mecanismo privado/criptografado; este serviço salva o **banco**, não tokens ou certificados.

## Teste local isolado

É necessário Docker Engine Linux ativo, Compose e Node/npm do projeto. O teste não lê `.env`, gera credenciais descartáveis, usa projeto/volumes aleatórios e portas livres em loopback. Nunca publica tokens nem contata a Meta. Ao terminar remove apenas seus próprios containers/volumes.

```bash
npm run test:runtime
npm run test:docker
npm run test:execution
npm run test:worker
# Opcional: validar uma cópia integral do banco usando dump privado já verificado:
npm run test:docker -- --dump /CAMINHO-PRIVADO/pulso.dump
```

No Windows com Engine nativo no WSL, iniciá-lo previamente com `wsl -d Ubuntu-24.04 -u root --exec systemctl start docker` e executar `npm run test:docker -- --wsl Ubuntu-24.04`, opcionalmente com `--dump`. O Engine nativo do Ubuntu usado no primeiro ensaio foi parado depois dos testes, sem inicialização automática no PC. Não executar testes de integração contra o banco real: `TEST_DATABASE_URL` precisa indicar base exclusiva de testes.

Com **Docker Desktop em execução no Windows**, utilizar diretamente `npm run test:docker` no PowerShell, sem `--wsl`. Não é necessário habilitar a integração com a distribuição Ubuntu para este fluxo. O teste foi verificado também com Docker Desktop 4.95.0, Engine 29.8.2 e Compose 5.6.0. O Engine nativo do Ubuntu usado no ensaio anterior continua independente; os testes no Desktop não reiniciam o daemon nem os outros projetos. Os arquivos privados do ensaio são criados em diretório temporário e os recursos Docker recebem um nome de projeto aleatório exclusivo.

Além da inicialização, o ensaio verifica entrega de CSS/JavaScript, páginas protegidas, IDs dos Reels do workspace, criação/edição/reabertura de rascunho incompleto e seleção de Reels específicos. Essas gravações são removidas da cópia de teste antes da comparação integral e do backup. O worker permanece em standby e o token Instagram de teste permanece vazio.

O ensaio separado `test:worker` valida o worker compilado que vai para a imagem, fila, webhook assinado, mensagens públicas/privadas e botões contra uma Graph simulada em HTTPS. A rede de execução não tem internet e usa exclusivamente credenciais fictícias. Executar suites Docker sequencialmente. O build usa esbuild com dependências necessárias incluídas; não depende de `tsx` no container runtime.

Referências: [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Compose em produção](https://docs.docker.com/compose/how-tos/production/), [secrets locais](https://docs.docker.com/compose/how-tos/use-secrets/), [políticas de reinício](https://docs.docker.com/engine/containers/start-containers-automatically/), [HTTPS do Caddy](https://caddyserver.com/docs/automatic-https), [repositórios Restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).

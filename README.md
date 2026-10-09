# Elo · Automação Instagram

Base de uma plataforma privada de automações para Instagram, com interface em português do Brasil. Esta entrega cobre a fundação segura e o editor da Etapa 2.

O proprietário pode entrar com segurança, organizar tags e criar rascunhos de automações com persistência em PostgreSQL. O editor sequencial reúne escopo, palavras-chave, mensagens com botões próprios, continuações, tags, atrasos e respostas públicas. A prévia interativa atualiza durante a edição e funciona antes de salvar. A integração Meta, OAuth, webhooks, filas e execução real continuam fora desta etapa.

Repositório: [brunodallier/automacao-instagram](https://github.com/brunodallier/automacao-instagram).

## Tecnologias

- Next.js 16.4, App Router, TypeScript e React 19.3.
- Tailwind CSS 4 e ícones Lucide React.
- PostgreSQL e Prisma ORM 7.10 com o adaptador oficial `pg`.
- Auth.js, na versão estável `next-auth` 4.24.15, com Credentials e sessões JWT criptografadas.
- Zod para validação no navegador e no servidor.
- Vitest para testes unitários e de integração; Playwright para testes de navegador.
- Fontes DM Sans e Manrope instaladas localmente, sem depender do Google Fonts em execução ou no build.

As versões resolvidas estão fixadas no `package-lock.json`. Prisma 8 e Auth.js 5 ainda eram versões de pré-lançamento na consulta realizada para esta entrega, por isso não foram adotados.

## Requisitos

- Node.js **22.13 ou superior na linha 22**, ou Node.js 24 LTS (recomendado).
- npm e Git.
- PostgreSQL 17 ou superior, local ou hospedado. Docker Desktop é uma opção para desenvolvimento.
- Um banco separado, com `test` no nome, para testes de integração e navegador.

## Instalação

```powershell
git clone https://github.com/brunodallier/automacao-instagram.git
cd automacao-instagram
npm ci
Copy-Item .env.example .env
```

Se você já está na pasta do projeto, execute apenas `npm ci` e copie o exemplo **se `.env` ainda não existir**. Não substitua um arquivo de ambiente já configurado.

O `postinstall` gera o Prisma Client em `src/generated/prisma`; esse diretório não é versionado.

## Variáveis de ambiente

Edite `.env` com valores próprios:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | URL de conexão PostgreSQL da aplicação. |
| `NEXTAUTH_URL` | Origem completa da aplicação; localmente `http://localhost:3000`. |
| `NEXTAUTH_SECRET` | Segredo aleatório com pelo menos 32 caracteres. |
| `POSTGRES_USER` | Usuário do PostgreSQL iniciado por Docker Compose. |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL iniciado por Docker Compose. |
| `POSTGRES_DB` | Banco da aplicação, padrão `automacao_instagram`. |
| `POSTGRES_PORT` | Porta local do Docker, padrão `5432`. |
| `TEST_DATABASE_URL` | URL de outro banco, exclusivo para testes. |

Gere o segredo com:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie a saída para `NEXTAUTH_SECRET`. Não use o exemplo como senha e não compartilhe nem versione `.env`. Caracteres especiais na senha da URL devem ser codificados para URL.

Em uma instalação pública, use HTTPS e ajuste `NEXTAUTH_URL` para a origem real. Isso habilita os cookies seguros do Auth.js e define a origem aceita pelas operações de tags. Guarde os segredos no serviço de hospedagem e configure backups do PostgreSQL.

## PostgreSQL

### Com Docker

Com o Docker Desktop em execução e `.env` configurado:

```powershell
docker compose up -d postgres
npm run db:migrate
```

O PostgreSQL fica acessível apenas pelo endereço local da máquina. Os dados ficam no volume `postgres_data`; não use `docker compose down -v` se quiser preservá-los.

As variáveis de usuário e senha do container são aplicadas apenas na criação inicial do volume. Para uma instância existente, mantenha as credenciais correspondentes.

### PostgreSQL existente ou hospedado

Crie um banco vazio, configure `DATABASE_URL` com um usuário autorizado a criar as tabelas e execute:

```powershell
npm run db:migrate
```

`db:migrate` aplica as migrations versionadas com `prisma migrate deploy`. Para futuras alterações no schema durante desenvolvimento, use `npm run db:dev -- --name nome_da_alteracao`; revise e versione a migration gerada.

O build gera o cliente, mas não aplica migrations nem precisa consultar um banco ativo. A execução da aplicação exige o PostgreSQL disponível.

## Primeiro proprietário

Após aplicar as migrations:

```powershell
npm run owner:setup
```

O assistente solicita nome, e-mail, nome do espaço, senha e confirmação. A senha é mascarada no terminal, deve ter de 12 a 128 caracteres e é armazenada com scrypt, salt aleatório e parâmetros `N=32768, r=8, p=1`.

A criação é feita em uma transação com trava PostgreSQL. Depois que o primeiro usuário existe, o comando recusa criar outro. Não há página ou endpoint de cadastro público, credencial padrão ou tags pré-cadastradas.

Para recuperar ou alterar a senha pela instalação:

```powershell
npm run owner:password
```

As sessões anteriores deixam de ter acesso às páginas privadas e à API após a alteração. Quem controla o terminal e a conexão do banco controla esse procedimento.

## Executar localmente

```powershell
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000), entre com o proprietário configurado e abra Tags para criar seus próprios marcadores.

Para executar a versão de produção:

```powershell
npm run build
npm start
```

## Funcionalidades entregues

- Login privado, rotas protegidas e autorização no backend.
- Sessão criptografada em cookie HttpOnly; limite absoluto de oito horas nas rotas protegidas.
- Limite persistente de dez tentativas por e-mail em uma janela de quinze minutos, compartilhado entre processos. A mensagem de falha não revela se o usuário existe.
- Painel com quatro métricas zeradas, estado de conexão e primeiros passos baseados na quantidade real de tags.
- Automações: criação, edição, exclusão e persistência de rascunhos com escopo, palavras-chave, etapas ordenadas e prévia local.
- Mensagens começam vazias, podem ser editadas, duplicadas e removidas; cada uma aceita até três botões com link HTTPS ou continuação subordinada ao clique.
- Rascunhos incompletos podem ser salvos: nome, DM, URL, próxima mensagem, tag e atraso ainda podem estar em branco. Campos inválidos para ativação recebem avisos sem apagar seu conteúdo.
- Prévia em tempo real, simulação de comentários por palavras-chave, cliques, retorno, reinício e apresentação de tags e atrasos sem executar ações reais.
- A seleção de Reels específicos fica bloqueada até a conexão real com o Instagram. O backend preserva esse escopo em rascunhos incompletos e bloqueia sua ativação.
- Tags: criação, listagem, busca, renomeação e exclusão confirmada, com validação no frontend e backend.
- Nomes de tags com até cinquenta caracteres, espaços normalizados e unicidade por espaço sem distinção entre maiúsculas e minúsculas. Acentos continuam significativos.
- A restrição única no PostgreSQL impede duplicação mesmo em gravações concorrentes. Renomear mantém o ID e a data de criação.
- Saúde do Sistema apresenta conexão, webhooks, filas, última verificação, falhas e áreas de alertas/reconexão, todos sem simular monitoramento.
- Configurações com dados reais do proprietário, espaço e áreas para conexões, segurança, notificações e integrações futuras.
- Navegação desktop e móvel, foco visível, labels de formulários, regiões de feedback, estados de carregamento e modais nativos com foco contido e cancelamento por Escape.

## Dados e autorização

O schema contém `User`, `Workspace`, `WorkspaceMembership`, `Tag`, `SocialAccount`, `LoginRateLimit`, `Automation`, `AutomationKeyword`, `AutomationStep` e `AutomationReel`. Contas sociais guardam somente metadados; não há campos de tokens da Meta nesta etapa.

Cada consulta e mutação de tag obtém o workspace pela sessão validada no servidor. O cliente não escolhe um workspace. As mutações verificam a origem da solicitação e aceitam somente o formato validado. Os formulários do Auth.js usam a proteção CSRF da biblioteca.

Automações usam a mesma autorização, incluindo a verificação de que tags selecionadas pertencem ao espaço. `Automation.nameIsProvisional` distingue o nome interno de um rascunho sem título do nome escolhido pelo usuário. A migration adiciona apenas essa coluna; nomes e registros anteriores são preservados.

`AutomationStep.text` e o JSON `buttons` armazenam as mensagens e suas continuações. Botões guardam `action`, `url` e `nextMessage`; trocar a ação preserva o conteúdo da alternativa para que o usuário possa retornar. A etapa antiga `BUTTONS` e seus objetos `{ label, url }` continuam acessíveis. A leitura associa a ação `OPEN_URL` sem exigir regravação dos registros antigos.

`WorkspaceMembership` prepara a separação de usuários e espaços futuros, mas não oferece cadastro, convite, seleção de workspace ou gestão multiusuário.

Tags têm ID estável e pertencem ao workspace. As etapas de tag referenciam `Tag.id`, nunca seu nome. `AutomationReel` prepara a associação futura com Reels sincronizados sem criar dados fictícios; a política de exclusão de tags em uso e a ativação do motor ainda deverão ser definidas.

## Testes e verificações

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Os testes unitários cobrem validação de tags, normalização, limites, entradas extras, dados de login e hashing/verificação de senha.

O editor acrescenta testes de rascunhos incompletos, contagem UTF-8, URLs HTTPS, continuações, compatibilidade antiga, janela de mensagens, validação para ativação e ausência de efeitos reais durante a simulação.

Para integração, crie um banco separado:

```powershell
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" automacao_instagram_test'
```

Configure `TEST_DATABASE_URL` usando as mesmas credenciais, mas o banco `automacao_instagram_test`. Em PostgreSQL hospedado, crie o banco conforme os recursos do provedor.

```powershell
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Os testes recusam um banco sem `test` no nome ou uma URL igual à da aplicação. Aplicam migrations nesse banco separado e removem somente os registros criados pelo próprio teste. Não substitua `DATABASE_URL` pelo banco de testes ao executar esses comandos.

- Integração: PostgreSQL real, persistência em outra conexão, concorrência, renomeação com ID preservado, duplicidade, validação e isolamento entre workspaces, além da sequência de palavras-chave e etapas das automações.
- Navegador: login, proteção das páginas e APIs, CRUD de tags, editor sequencial de automações, prévia do rascunho, recarregamento, confirmação/cancelamento da exclusão, bloqueio de origem externa, isolamento, navegação móvel, cookie HttpOnly, limite de oito horas, logout, revogação de sessão e limite de tentativas.
- O navegador executa a versão de produção na porta 3100. Rode `npm run build` antes dos testes e mantenha essa porta livre.
- Credenciais de teste são aleatórias, temporárias e não são disponibilizadas como login da aplicação.
- Capturas locais em `test-results/` e traces de falhas não são versionados.

Sem `TEST_DATABASE_URL` ou PostgreSQL acessível, os testes de integração/navegador falham com instrução de configuração; não são apresentados como aprovados.

### Auditoria de dependências

`npm audit --omit=dev` ficou sem alertas na validação desta entrega. As correções de `deepmerge-ts` e `mysql2` estão fixadas em `overrides`; geração do cliente, migration e build devem continuar sendo verificados ao atualizá-las.

A auditoria completa ainda sinaliza a cadeia de `braces`/`micromatch`/`fast-glob` usada pelo lint do Next.js. Não havia versão corrigida de `braces` no registro consultado. Esses alertas pertencem às ferramentas de desenvolvimento. ESLint 9 foi mantido porque os plugins de importação, React e acessibilidade do preset ainda não declaram suporte ao ESLint 10. Reavalie essa cadeia quando atualizar as ferramentas; não execute `npm audit fix --force` sem revisar as mudanças de versão.

## Estrutura

```text
prisma/
  schema.prisma             Modelos e relações
  migrations/               Migrations versionadas
scripts/
  setup-owner.ts            Configuração privada do primeiro usuário
  reset-password.ts         Recuperação e revogação de sessões
  test-e2e.ts               Ambiente isolado para o navegador
src/
  app/
    (private)/              Painel, automações, tags, saúde e configurações
    api/auth/               Endpoints do Auth.js
    api/tags/               CRUD autenticado e autorizado
    api/automacoes/         Rascunhos autenticados e autorizados
    login/                  Acesso do proprietário
    globals.css             Tema, componentes e responsividade
  components/               Navegação, formulários e interface
  generated/prisma/         Cliente gerado; ignorado pelo Git
  lib/                      Sessão, banco, validação, tags, rascunhos e regras de mensagens
  types/                    Tipos de sessão
tests/
  unit/                     Validação e segurança de senhas
  integration/              Operações em PostgreSQL real
  e2e/                      Fluxos reais no navegador
compose.yaml                PostgreSQL para desenvolvimento
.env.example                Configuração sem credenciais reais
```

## Próximas etapas

As capacidades verificadas na documentação oficial e as pendências práticas estão em [docs/INSTAGRAM-MENSAGENS.md](docs/INSTAGRAM-MENSAGENS.md). O endpoint autenticado `POST /api/automacoes/:id/ativar` revisa o rascunho: retorna 400 para configurações incompletas/incompatíveis e 409 para fluxos completos enquanto a integração não estiver implementada. Ele mantém o status `DRAFT` e não envia mensagens.

Para testar no navegador: abra Automações → Nova automação, adicione uma DM e escreva seu conteúdo. Use **Adicionar botão** dentro da mensagem e escolha uma ação. A prévia acompanha a edição; **Testar rascunho** libera um comentário fictício e a revisão das pendências. **Salvar rascunho** funciona mesmo antes de concluir os campos. Reabra pela listagem para continuar a edição.

A próxima etapa deve conectar a conta Instagram pela Meta, sincronizar Reels e habilitar a seleção de Reels específicos. Depois disso, serão definidos OAuth, tokens, webhooks, processamento, limites oficiais de envio, ativação, filas e recuperação de falhas.

**Regra a preservar:** automações específicas de um Reel têm prioridade sobre automações globais.

O OAuth da Meta, tokens, permissões, webhooks, processamento, limites oficiais de envio e recuperação de falhas exigirão suas próprias definições e validações. Não são habilitados automaticamente por esta entrega.

Referências oficiais: [Next.js](https://nextjs.org/docs), [Auth.js / NextAuth Credentials](https://next-auth.js.org/providers/credentials), [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).

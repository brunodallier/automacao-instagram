# Validação da plataforma Pulso

## Reels reais e seleção específica — 13 de outubro de 2026

A API Instagram Login retornou 175 publicações em quatro páginas, das quais 87 eram `VIDEO` com produto `REELS`. Os 87 foram persistidos na conta/workspace autorizados, em PostgreSQL UTF8, com legenda, data e miniatura. A leitura alcançou junho de 2022. A repetição da sincronização manteve exatamente os mesmos 87 IDs internos, sem duplicar registros. Nenhum vídeo fictício foi criado no banco da aplicação.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 97 testes unitários aprovados |
| Integração em PostgreSQL separado | 29 aprovados, em sequência |
| Navegador | 24 aprovados no build de produção |
| TypeScript, lint e build | Aprovados |
| Migration | Sexta migration, aditiva; diferença de schema revisada, sem remoção de dados |
| Backup anterior | Dump oficial verificado por checksum, catálogo e restauração completa em banco UTF8 de validação |
| Sincronização real repetida | 87 Reels em quatro páginas; IDs estáveis, nenhuma duplicata |
| API e páginas locais | POST/GET autenticados, biblioteca e editor HTTP 200; conteúdo das respostas sem credencial |
| Dados anteriores | Proprietário/hash/versão de sessão, workspace, automação, três palavras-chave, quatro blocos e demais registros anteriores preservados |

Os testes cobrem identificação por produto/permalink, exclusão de vídeos sem evidência de Reel, campos opcionais, cursores e páginas antigas, dados inválidos, token expirado, limites e falha em página posterior. A integração confirma transação sem atualização parcial, Unicode, upserts, acesso somente ao workspace correto, seleção múltipla, IDs estáveis de vínculos, compatibilidade de clientes antigos e associações legadas. A seleção específica prevalece sobre candidatas globais já elegíveis; não foi criado motor de envio.

No navegador, a biblioteca permite pesquisar, o editor habilita Reels específicos, a seleção é salva/reaberta e uma falha simulada preserva a lista. Foram verificadas autenticação, origem da mutação, apresentação móvel, prévia e simulador anteriores. As fixtures usam exclusivamente banco separado, com token real retirado do ambiente do servidor de testes.

O novo teste inicialmente encontrou também o anúncio global de rota ao procurar um alerta; o seletor foi restringido à seção da biblioteca. O teste de logout identificou uma regressão real de altura: o novo item de menu deixava o botão de sair fora da viewport em janelas baixas. A barra lateral agora permite rolagem quando necessário, preservando seu layout. A suíte completa passou com logout acessível, sem alteração nas regras de sessão ou senha.

O snapshot e os backups privados `reels-before-20261013.dump` e `reels-after-20261013.dump` ficam no diretório local de backups, fora do GitHub. A cópia anterior foi restaurada e comparada integralmente antes da migration. Os cinco registros de migrations anteriores foram preservados, com uma sexta adicionada. O banco WIN1252 original da migração anterior continua disponível. [Configuração, limitações e recuperação](REELS.md).

## Instagram Login: consulta de leitura — 13 de outubro de 2026

Foi implementada uma consulta `GET /me`, com `fields=user_id,username`, no host fixo `graph.instagram.com`. O token é resolvido no servidor a partir do ambiente privado e enviado por cabeçalho, sem aparecer em URL, resposta ao navegador ou logs. A rota local exige proprietário autenticado. A origem da credencial é substituível para uma futura renovação; nesta etapa não há OAuth no Pulso, troca/renovação de tokens, envio, webhooks ou gravação de tokens no banco.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 83 testes unitários aprovados |
| Integração em PostgreSQL UTF8 separado | 23 aprovados, executados em sequência |
| Navegador | 23 aprovados, incluindo o novo painel de conexão e as funcionalidades anteriores |
| TypeScript, lint e build | Aprovados |
| Instância local em porta 3000 | Login e painel HTTP 200; API anônima 401; consulta autenticada HTTP 200 com cache desabilitado |
| Preservação dos dados | Conteúdo completo das 11 tabelas, nove relacionamentos e cinco migrations idêntico ao snapshot anterior |
| Token real da instalação | Inserido manualmente pelo proprietário; leitura do perfil confirmada pela Meta, pelo comando local, pela API autenticada e pelo painel |

Os testes de leitura cobrem configuração ausente/inválida, credencial somente em cabeçalho, host fixo, redirects bloqueados, timeout/rede, erros de autenticação, expiração explicitamente identificada, permissões, limite de consultas, JSON inválido e identidade inválida. O corpo bruto da Meta e exceções não são devolvidos, e eco de credencial em campos de identidade é rejeitado. O teste de navegador usa credencial vazia no servidor e resultados simulados apenas na rota local; verifica estados de sucesso/expiração, usuário e ID, remoção da identidade em falha, resultado anterior identificado quando a atualização falha e ausência de overflow móvel.

Uma expectativa antiga do teste móvel referenciava o texto anterior da página Saúde. Foi atualizada para a mensagem que informa onde consultar a leitura do Instagram; a suíte completa passou após a correção. As mudanças locais de documentação da migração UTF8 foram preservadas.

O comando `npm run instagram:check` foi exercitado sem token: informou configuração ausente, encerrou com código 1 e não efetuou chamada externa. Uma sessão temporária de diagnóstico validou a autorização da rota e do painel da instalação sem solicitar ou alterar a senha do proprietário. Nenhum segredo ou token dessa sessão foi registrado. O snapshot local `instagram-before-20261013.json` contém somente contagens, digests e metadados e fica no diretório privado de backups anterior, fora do repositório.

O arquivo `.env` recebeu somente os campos locais do Instagram, sem sobrescrever as demais variáveis. Após a inserção manual do token pelo proprietário, o servidor foi reiniciado e `npm run instagram:check` confirmou o usuário e o ID reais. A rota autenticada e o HTML do painel confirmaram a mesma identidade e o estado **Leitura verificada**, sem a credencial nas respostas. Uma nova comparação confirmou que os dados existentes permanecem idênticos ao snapshot anterior. A identidade pessoal não foi copiada para a documentação versionável, e o token não foi registrado. Os exemplos dos testes não são usados como conta conectada. [Configuração manual e arquitetura](INSTAGRAM.md).

## Migração local para UTF8 — 12 de outubro de 2026

A conexão local passou de `automacao_instagram` (WIN1252) para `automacao_instagram_utf8` (UTF8), no mesmo PostgreSQL 18.4, porta 55432. O banco original foi preservado. Backups completos, configuração privada de recuperação e relatórios ficaram fora do repositório, em diretório com acesso restrito ao usuário do Windows e SYSTEM.

O backup inicial foi restaurado em um banco de validação. Após os testes, os processos da aplicação foram interrompidos, foi obtido um novo backup completo e esse backup final foi restaurado no destino definitivo. Os dois arquivos foram verificados por SHA-256, leitura do catálogo com `pg_restore --list` e restauração com `--exit-on-error --single-transaction`.

Todos os registros das 11 tabelas foram comparados por contagem e digest do conteúdo completo, inclusive os hashes de senha e o histórico integral das cinco migrations. Também conferiram definições de colunas, índices, permissões, constraints, nove chaves estrangeiras e sequências. Foram preservados um proprietário, um workspace, uma associação de proprietário, uma automação, três palavras-chave e quatro blocos. Tags, Reels, contas sociais e controle de tentativas estavam sem registros na cópia final; permaneceram assim.

Na cópia de validação e no destino definitivo, registros temporários passaram por gravação, leitura, reabertura e edição de mensagens com acentos, emojis, ideogramas, árabe, grego e acento combinante. O teste usou Prisma e as APIs reais de rascunhos, incluindo as respostas públicas em JSON. Todos os registros temporários foram removidos e uma nova comparação confirmou a igualdade dos dados originais.

| Verificação | Resultado |
| --- | --- |
| Testes unitários | 58 aprovados |
| Integração em banco UTF8 separado | 23 aprovados com `npm run test:integration -- --no-file-parallelism` |
| Navegador em banco UTF8 separado | 22 aprovados, incluindo login por senha, revogação de sessão, rascunhos, editor e simulador |
| TypeScript, lint e build | Aprovados |
| Prisma no destino | Consultas, criação, edição e remoção temporária aprovadas; cinco migrations registradas, schema atualizado |
| Sessão do proprietário após a troca | Consulta autenticada aprovada; acesso sem sessão recusado |
| Credenciais e configuração | Somente o banco em `DATABASE_URL` mudou; demais variáveis preservadas |

A execução inicial da integração detectou interferência entre suítes: um teste de contagem global observou os workspaces temporários de outra suíte. A troca foi suspensa até a repetição sequencial passar. Nenhum código de aplicação ou teste foi alterado para contornar o resultado.

O login por senha foi exercitado pelas fixtures no banco de testes. A senha real do proprietário não foi solicitada, conhecida ou redefinida: seu hash e sua versão de sessão foram preservados integralmente; a sessão do proprietário foi verificada com token temporário de diagnóstico, sem registrá-lo. Os testes automatizados usaram `automacao_instagram_utf8_test` por sobrescrita apenas no ambiente dos processos de teste. `TEST_DATABASE_URL` do arquivo privado continua inalterada.

Não foram executados resets nem migrations no banco da aplicação. As cinco migrations foram aplicadas somente no novo banco vazio de testes. Não houve alteração visual, de regras de negócio, funcionalidades ou integração Meta. [Detalhes e recuperação](MIGRACAO-UTF8.md).

## Política de senhas — 12 de outubro de 2026

A criação e a redefinição usam a mesma validação: 6–14 caracteres, maiúscula, minúscula, número e pontuação/símbolo, todos obrigatórios. Espaços não satisfazem o requisito de caractere especial. Senhas não são aparadas nem normalizadas; a confirmação deve ser idêntica.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 58 testes unitários aprovados |
| `npm run test:integration` | 23 testes aprovados em PostgreSQL real |
| `npm run test:e2e` | 22 testes aprovados em Chromium, usando build de produção |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado, sem erros ou avisos |
| `npm run build` | Aprovado |

Os testes cobrem senhas válidas nos dois limites, tamanho insuficiente/excessivo, ausência de cada categoria, acentos/símbolos Unicode, confirmação divergente, instruções do terminal, máscara nas duas entradas e mensagens sem a senha digitada. A integração confirma que entradas recusadas não alteram o usuário; redefinições válidas atualizam hash e versão de sessão na mesma operação, preservando identidade, associação ao workspace e dados do espaço.

O login conserva a validação anterior de 1–128 caracteres, sem exigir a nova composição. O navegador confirmou login real com senha antiga acima de 14 caracteres, recusa da sessão e da senha antigas após a redefinição de teste e acesso com a senha nova de 6 caracteres. Scrypt, salt aleatório, comparação segura, limite de tentativas, duração e revogação das sessões permanecem preservados. Não houve alteração de schema, migrations, dependências, interface ou automações.

O comando de redefinição não foi executado no banco da aplicação. Os testes usam exclusivamente contas temporárias no banco separado. Antes dos testes foi registrado um snapshot local de contagens e digests das dez tabelas de dados e do histórico de migrations, sem credenciais ou hashes individuais de senha. A comparação confirmou igualdade completa, inclusive do proprietário, seu hash e sua versão de sessão. O histórico mantém as cinco migrations existentes.

Para redefinir sua senha posteriormente, siga [as instruções do README](../README.md#primeiro-proprietário) e execute `npm run owner:password` diretamente no terminal. Nenhuma senha real deve ser enviada pelo chat ou inserida em argumentos de comandos.

## Redesign — 9 de outubro de 2026

Verificações realizadas em 9 de outubro de 2026, no Windows, com Node.js 24.14.1.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 41 testes unitários aprovados |
| `npm run test:integration` | 20 testes aprovados em PostgreSQL real |
| `npm run test:e2e` | 21 testes aprovados em Chromium, usando build de produção |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado, sem erros ou avisos do lint |
| `npm run build` | Aprovado |
| Migrations | Cinco migrations existentes preservadas; nenhuma adicionada ou alterada pelo redesign |
| `npm audit --omit=dev` | Nenhum alerta |
| Auditoria completa | Cinco alertas de desenvolvimento na cadeia de ferramentas já existente |

Foram revisadas as telas de login, painel, listagem de automações, editor, tags, saúde e configurações em desktop (1440 × 1000) e celular (390 × 844). As capturas atuais ficam em `.tmp/pulso-after/`; as anteriores disponíveis ficam em `.tmp/pulso-before/`. Esses diretórios não são versionados. As capturas usam um proprietário temporário e conteúdo criado pelas fixtures; não representam uma conta conectada ou execuções reais de automações. O teste aguarda o conteúdo e as fontes antes de capturar cada tela, evitando registrar apenas o skeleton de carregamento.

O teste do redesign verifica marca `pulso.`, títulos Pulso, favicon SVG, rodapé, ausência do rótulo desatualizado na navegação de Automações e ausência de rolagem horizontal da página. Também mede contraste mínimo de 4,5:1 em textos secundários, badges, dicas e ações principais, de 3:1 nas bordas de campos habilitados e altura mínima de 36 px para os campos visíveis. A revisão visual confirma métricas sem moldura, seções separadas por espaço, poucas superfícies visíveis e ausência de caixas adicionais nas continuações do editor. O login móvel mantém um título principal visível; os campos de tag e palavra-chave conservam sua altura ao passar para uma coluna. Isso não substitui uma auditoria completa de acessibilidade.

O redesign centraliza a identidade no [design system Pulso](DESIGN-SYSTEM.md). Inter e Inter Tight substituem as fontes anteriores, ambas com licença OFL 1.1 e arquivos servidos localmente. A troca de fontes foi a única alteração de dependências. Banco, encoding, schema, migrations, APIs, autenticação e lógica de automações/simulador não foram modificados.

Antes dos testes do redesign, foi salvo outro snapshot local, `.tmp/pulso-data-before-tests.json`. A comparação de todos os valores e registros das dez tabelas da aplicação, mais o histórico de migrations, confirmou igualdade completa. O proprietário, o workspace, a automação, as três palavras-chave, os quatro blocos e a configuração das respostas públicas foram preservados. Não houve aplicação de migration nem escrita no banco da aplicação nesta revisão; as fixtures usam exclusivamente o banco de testes.

O ambiente usa PostgreSQL 18.4 na porta 55432, com bancos separados para aplicação e testes. O PostgreSQL e o servidor de desenvolvimento ficam ativos para teste local em `http://localhost:3000`; essa instância não substitui a configuração permanente documentada no README.

## Verificações da entrega anterior do editor, reexecutadas

Os casos funcionais abaixo foram entregues antes do redesign e continuam passando. As alterações de migration e da janela de login descritas neste histórico pertencem àquelas entregas; não foram introduzidas pelo rebranding.

A instância local existente usa encoding `WIN1252`. Textos em português foram persistidos e reabertos; emojis foram verificados nos contadores e na prévia, mas não são representáveis nesse banco. O teste direto de migration foi ajustado para caracteres representáveis após confirmar essa limitação. Não houve conversão do banco nem alteração de seus dados; uma instalação que precise persistir emojis deve usar PostgreSQL com encoding `UTF8`.

O PostgreSQL usava o fuso America/Sao_Paulo. A validação do bloqueio de login levou à adoção de datas com fuso e do relógio do banco em todas as operações da janela de tentativas. O teste verifica bloqueio, expiração da janela e recuperação do acesso após a expiração.

Todos os usuários, espaços, tags e automações das fixtures são removidos pelos testes no banco separado. O proprietário já existente na aplicação foi preservado.

Imediatamente após a migration, os registros das dez tabelas de dados da aplicação foram comparados com o snapshot anterior. Nenhum valor de coluna existente foi alterado nem registro removido. A nova coluna recebeu a configuração da resposta pública já existente; o histórico de migrations recebeu a quinta entrada. A aplicação tinha um proprietário, um workspace, uma automação, três palavras-chave e quatro blocos, incluindo uma resposta pública antiga. Os testes usam o banco separado e preservam esses dados.

Os casos do editor cobrem mensagens vazias e personalizadas, contagem UTF-8, botões mistos, continuações com seus próprios botões, edição de título, remoção, duplicação, troca de ação sem perda de conteúdo, salvamento/reabertura, prévia sem salvar, comentários que acionam ou não acionam, tags/atrasos sem efeitos, limites, URLs inválidas, isolamento e recusa de ativação. Um rascunho gravado diretamente no formato antigo `BUTTONS` foi reaberto, editado e salvo no navegador sem perder título ou URL.

Os novos casos verificam a ordem das quatro seções, cinco respostas inicialmente vazias e editáveis, adição de variação, ativação/desativação sem apagar textos, alternativa incompleta salva como rascunho, reabertura e limite público. A rotação ignora campos vazios; erro temporário, atraso e aceitação da API não escolhem a alternativa. O teste da migration executa o SQL versionado em um schema temporário dentro de uma transação, confirma a preservação de todos os blocos e testa ordenação, vazios, texto longo, mais de cinco variações e automação sem resposta pública.

Rascunhos antigos com blocos públicos foram reabertos e salvos na etapa própria, mantendo a DM e seus botões. Atualizações que omitem a nova configuração foram verificadas para não apagar as respostas; clientes antigos que ainda enviam blocos públicos preservam os controles, a alternativa e as variações adicionais. Em mobile, os campos dos botões têm 36 px de altura, recolher reduz o contêiner a menos da metade e as ações de URL/continuação funcionam recolhidas. Expandir, editar, remover um botão anterior, salvar e reabrir mantêm a continuação. Não houve rolagem horizontal a 390 px.

OAuth da Meta, sincronização de Reels, webhooks, filas e motor de execução permanecem fora desta entrega. O editor salvo nesta etapa trabalha com rascunhos e prévia local.
## Preparação Docker / Hostinger — 13 de outubro de 2026

Produção foi preparada em um Compose separado: Next.js standalone com usuário sem privilégios, PostgreSQL 18.6 UTF8 persistente, Caddy 2.11.2, worker contínuo em standby e perfil de backup com Restic 0.19.1. Não houve implantação remota, mudança da interface, webhooks ou envio real. O Compose de desenvolvimento e `.env` existente foram preservados.

| Verificação | Resultado |
| --- | --- |
| Testes unitários | 102 aprovados |
| Testes de runtime/secrets | 4 aprovados |
| Integração PostgreSQL | 29 aprovados em banco exclusivo de testes |
| Navegador Chromium | 24 aprovados |
| TypeScript e lint | Aprovados |
| Build Windows e build Linux Docker | Aprovados |
| Auditoria de dependências de produção | Sem vulnerabilidades reportadas |
| Ensaio Docker com cópia real | Aprovado, incluindo backup criptografado e restauração integral |
| Ensaio Docker com banco vazio | Aprovado: seis migrations, proprietário temporário, HTTPS, Unicode e recuperação |

Docker Desktop não conseguiu inicializar neste PC; os testes foram executados com Docker Engine 29.1.3 / Compose 2.40.3 em Ubuntu 24.04 no WSL2. Foram usados projetos e volumes aleatórios, credenciais descartáveis, portas livres em loopback e token Instagram vazio. O teste não usa `.env`, não consulta a Meta e remove somente seus recursos ao concluir. O banco original não é acessado por esses containers.

Um dump completo oficial, privado e verificado do banco atual foi restaurado no primeiro PostgreSQL de teste. As seis migrations ficaram registradas sem reaplicação. Foram verificados HTTPS com CA local confiada somente pelo cliente de teste, sessão autenticada com JWT temporário do ambiente descartável, APIs protegidas, leitura dos Reels, acesso à tela de Reels e criação/remoção de tag com acento, emoji e ideogramas. A senha real não foi solicitada ou redefinida; os registros do usuário, hash e versão de sessão foram comparados por digest junto às demais tabelas.

O teste confirmou limites de recursos, usuário sem privilégios/filesystem readonly da aplicação, ausência do token no worker, heartbeat standby, reinício automático após encerrar o processo do worker e persistência após reiniciar PostgreSQL. Foi realizado dump com `pg_dump`, validação com `pg_restore --list`, backup Restic criptografado, leitura integral do repositório, recuperação com SHA256 e restauração em segundo banco vazio. Contagens e digests de **todas as 12 tabelas** coincidiram entre os dois bancos: 87 Reels, duas automações e um proprietário.

O repositório Restic do teste era um volume local descartável; nenhum bucket externo foi configurado. DNS real, certificado público ACME, acessos SSH/firewall e conectividade do armazenamento externo deverão ser validados na implantação autorizada. Não houve teste de capacidade de envios: o worker ainda não executa automações. Imagens locais finais: aproximadamente 95 MB (web/worker), 540 MB (tools/migrations) e 163 MB (backup). O limite agregado dos serviços permanentes com backup é 4,25 GiB; consumo real depende do uso e deve ser monitorado.

A auditoria completa mantém cinco alertas preexistentes na cadeia de desenvolvimento do ESLint (`braces`/`micromatch`/`fast-glob`); eles não aparecem em `npm audit --omit=dev`. Dependências não foram alteradas nesta entrega. Não foi executado `npm audit fix --force` ou downgrade do Next.js.

O snapshot somente de leitura do banco original confirmou igualdade de registros, schema, constraints, índices, grants, sequences e migrations antes/depois: 12 tabelas, seis migrations e 11 relacionamentos. Backup privado adicional do ensaio foi guardado fora do Git em `C:\Users\bruno\.codex\backups\pulso\20261012-utf8\docker-isolated-20261013.dump`. O banco original e os backups anteriores continuam disponíveis.

Procedimentos, limitações e próximos passos: [HOSTINGER-DOCKER.md](HOSTINGER-DOCKER.md).

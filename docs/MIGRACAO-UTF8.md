# PostgreSQL local do Pulso — migração para UTF8

Migração concluída em 12 de outubro de 2026. Este documento descreve a instância local; não contém credenciais nem substitui o backup privado.

## Estado da conexão

| Banco | Codificação | Uso |
| --- | --- | --- |
| `automacao_instagram_utf8` | UTF8 | Conexão principal do Pulso |
| `automacao_instagram` | WIN1252 | Original preservado para recuperação; não remover sem autorização do proprietário |
| `automacao_instagram_utf8_validacao_20261012` | UTF8 | Restauração inicial usada para validar a migração |
| `automacao_instagram_utf8_test` | UTF8 | Banco separado usado pelos testes desta migração |

O servidor permanece PostgreSQL 18.4 em loopback, porta 55432. A aplicação está em `http://localhost:3000/login`. Somente `DATABASE_URL` do `.env` local passou a apontar para o banco UTF8; host, porta, usuário, senha, parâmetros e demais variáveis foram preservados. O banco de testes anterior e sua configuração também foram preservados.

## Procedimento realizado

1. Inspeção somente de leitura da conexão, versão, encoding, locale e sessões do PostgreSQL.
2. Backup completo do banco original com `pg_dump` oficial 18.6, formato customizado e `--encoding=UTF8`. O PostgreSQL fez a conversão de WIN1252 para UTF8 durante a exportação; nenhum byte foi reinterpretado manualmente.
3. Registro de contagens e digests de todos os registros, histórico de migrations, constraints, índices, colunas, permissões e sequências. Não foram registrados hashes individuais de senha nos relatórios.
4. Verificação SHA-256 e leitura integral do catálogo do archive. Restauração em banco novo de validação, criado com `template0`, `ENCODING 'UTF8'`, provider `libc` e o mesmo `LC_COLLATE`/`LC_CTYPE` do original (`Portuguese_Brazil.1252`). No Windows, UTF8 é compatível com esse locale.
5. Restauração por `pg_restore --exit-on-error --single-transaction`, sem `--clean` e sem sobrescrever banco existente. Igualdade de todos os dados e objetos comparados, incluindo nove relacionamentos e cinco migrations.
6. Testes reais com registros temporários, pelo Prisma e pelas APIs, mais as suítes automatizadas em banco UTF8 separado. Remoção dos registros temporários e comparação posterior de integridade.
7. Interrupção dos servidores da aplicação; confirmação de ausência de outras conexões ao original; novo backup completo e restauração em outro banco vazio, `automacao_instagram_utf8`. Comparação do destino com o original após o backup e novamente antes de atualizar a conexão. A cópia final, e não a primeira restauração, alimentou a aplicação.
8. Alteração somente de `DATABASE_URL`, reinício do desenvolvimento e repetição do teste de sessão, rascunhos e Unicode. Comparação final confirmou que nenhum registro temporário permaneceu.

A codificação do banco original não foi alterada. Não foram executados `prisma migrate reset`, `db push`, comandos de reset ou migrations no banco da aplicação. O proprietário não foi recriado e sua senha não foi alterada. A validação detalhada consta em [VALIDACAO.md](VALIDACAO.md#migração-local-para-utf8--12-de-outubro-de-2026).

Referências oficiais: [dump](https://www.postgresql.org/docs/18/app-pgdump.html), [restore](https://www.postgresql.org/docs/18/app-pgrestore.html), [encoding e locale no Windows](https://www.postgresql.org/docs/18/multibyte.html), [CREATE DATABASE e template0](https://www.postgresql.org/docs/18/sql-createdatabase.html). As ferramentas Windows foram obtidas pelo [distribuidor indicado pelo PostgreSQL](https://www.postgresql.org/download/windows/); o servidor existente não foi reinstalado nem atualizado.

## Backup privado

Diretório local: `%USERPROFILE%\.codex\backups\pulso\20261012-utf8`.

- `initial-win1252.dump`: cópia inicial completa.
- `final-win1252.dump`: cópia final completa, usada para criar o banco atualmente conectado.
- `*.integrity.json`: tamanho e SHA-256 de cada backup.
- `*.toc.txt`: catálogos dos archives.
- `initial-state.json` e `final-state.json`: contagens, digests e metadados comparados.
- `candidate-comparison.json`, `final-comparison.json`, `before-smoke.json`, `after-smoke.json` e `switch-verification.json`: resultados das verificações.
- `env-original.private`: cópia privada da configuração anterior, exclusivamente para recuperação.

O diretório tem herança de permissões desativada e acesso concedido apenas ao usuário local e SYSTEM. Os dumps contêm dados privados e hashes de senha; a cópia de configuração contém segredos. Não devem ser enviados ao GitHub, anexados em chat ou publicados. Todos ficam fora do checkout. Helpers e ferramentas usados na operação ficam em `.tmp/`, que já era ignorado pelo Git.

## Recuperação usando o banco original

O original continua disponível e representa os dados até a troca. Retornar a ele não incorpora alterações feitas posteriormente no banco UTF8. Antes de qualquer rollback, preserve uma cópia completa atual do banco UTF8: textos com emojis não podem ser restaurados integralmente em WIN1252.

1. Interrompa o servidor de desenvolvimento com `Ctrl+C` no terminal que o executa. Interrompa também outros processos da aplicação que possam gravar no banco.
2. Faça um backup atual do banco UTF8 usando `pg_dump`, com credenciais informadas de forma privada no terminal. Use um arquivo novo, sem sobrescrever os backups existentes.
3. Abra `.env` localmente e, em `DATABASE_URL`, troque somente o nome do banco `automacao_instagram_utf8` por `automacao_instagram`. Preserve usuário, senha, host, porta, parâmetros e as outras variáveis. `env-original.private` é uma referência privada; não copie o arquivo inteiro se outras configurações tiverem mudado desde a migração.
4. Execute `npm run dev -- --hostname 127.0.0.1 --port 3000` e confirme acesso e consultas. Esse retorno usa a cópia anterior à troca; reconcilie eventuais gravações posteriores antes de voltar a usá-la permanentemente.

Não execute migrations ou resets para esse retorno. Não apague o banco UTF8 nem o original.

## Recuperação usando o dump final

Se o original ficar indisponível, o dump final pode ser restaurado em outro banco **novo**, preferencialmente UTF8. O procedimento abaixo restaura o estado da troca; use um backup atual do banco UTF8 se precisar incluir gravações posteriores.

1. Pare os processos da aplicação e preserve os bancos disponíveis. Confira o SHA-256 do arquivo contra `final-win1252.integrity.json`:

   ```powershell
   $backupFile = Join-Path $env:USERPROFILE '.codex/backups/pulso/20261012-utf8/final-win1252.dump'
   Get-FileHash -LiteralPath $backupFile -Algorithm SHA256
   ```

2. Com um administrador do PostgreSQL, crie um banco vazio com nome ainda não utilizado. Para a mesma instância Windows, a configuração validada foi:

   ```sql
   CREATE DATABASE pulso_recuperacao_utf8
     WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc
     LC_COLLATE 'Portuguese_Brazil.1252' LC_CTYPE 'Portuguese_Brazil.1252';
   ```

   Use o proprietário do banco original, consultável com `pg_get_userbyid(datdba)` em `pg_database`. Em outro sistema operacional, escolha um locale UTF8 compatível e valide a ordenação; não reutilize cegamente um locale Windows.

3. Na pasta do projeto, restaure com as ferramentas oficiais locais. O nome do usuário PostgreSQL e sua senha devem ser informados no terminal privado. A senha não aparece em argumentos:

   ```powershell
   $dbAdmin = Read-Host 'Usuário administrador do PostgreSQL'
   & '.tmp/postgresql-official-tools/pg_restore.exe' -h localhost -p 55432 -U $dbAdmin -W --dbname pulso_recuperacao_utf8 --exit-on-error --single-transaction $backupFile
   if ($LASTEXITCODE -ne 0) { throw 'Restauração falhou: não troque a conexão.' }
   ```

4. Compare registros, relacionamentos, hash do proprietário e migrations com `final-state.json`; confira `current_database()` e a codificação em `pg_database`. Teste leitura, rascunhos e Unicode antes de trocar `.env` para o banco recuperado e reiniciar o Pulso.

Nunca restaure por cima do único banco disponível, use `--clean` nesse procedimento ou remova o original sem autorização. Uma restauração malsucedida deve ficar isolada; a conexão principal só deve mudar após validação completa.

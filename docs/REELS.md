# Reels reais — sincronização e seleção

Esta etapa usa a conexão Instagram Login já configurada no Pulso. Não exige outras credenciais nem uma Página do Facebook. Todas as operações remotas são **GET** em `graph.instagram.com`; o POST local de sincronização grava apenas o catálogo do Pulso.

## Como usar

1. Entre no Pulso e abra **Meus Reels** no menu, ou use o link da conexão Instagram no painel.
2. Clique em **Sincronizar Reels**. A leitura percorre todas as páginas disponibilizadas pela Meta. Ao concluir, aparecem quantidade, horário e eventuais limitações; a pesquisa procura na legenda e no ID de todo o catálogo, incluindo os Reels antigos.
3. Crie ou edite uma automação. Na Etapa 1, marque **Reels específicos**, pesquise e selecione um ou vários vídeos. Os itens mostram miniatura quando disponível, legenda resumida e data de publicação. Salve o rascunho e reabra para conferir a seleção.

O editor também tem **Sincronizar Reels**, que atualiza a lista sem recarregar ou apagar a edição em andamento. O escopo específico é habilitado quando o workspace tem Reels sincronizados. A lista apresenta 30 itens por vez, com **Mostrar mais Reels**; isso é uma paginação visual e não limita a sincronização ou a pesquisa. A seleção admite até 1.000 itens por rascunho. Nome, mensagens e outros campos incompletos continuam permitidos no rascunho.

A regra de prioridade das automações específicas sobre as globais foi preservada em uma função pura para candidatas já elegíveis, com teste. O motor implementado valida workspace, conta, Reel, palavras-chave e demais condições antes dessa escolha. Seus testes isolados estão em [INSTAGRAM-MVP.md](INSTAGRAM-MVP.md). Envios/webhooks reais continuam bloqueados; perfil e Reels confirmados não comprovam prontidão para enviar.

## API e identificação

O perfil é validado com `GET /me?fields=user_id,username`. A identidade retornada define a conta usada em `GET /{instagram-user-id}/media`, com versão fixa do ambiente, atualmente `v25.0`, e campos:

| Campo | Uso |
| --- | --- |
| `id` | Identificador da publicação, conservado como string |
| `caption` | Legenda quando disponibilizada |
| `timestamp` | Data real de publicação, sem substituição por data de sincronização |
| `permalink` | Link canônico da publicação no Instagram |
| `thumbnail_url` | Miniatura de vídeo, quando disponibilizada |
| `media_type` | Tipo de mídia; `VIDEO` sozinho não identifica um Reel |
| `media_product_type` | Produto; `REELS` identifica o Reel quando combinado com `VIDEO` |

Em 13 de outubro de 2026, a conexão real Instagram Login da instalação aceitou todos esses campos. As páginas da documentação oficial apresentaram limitação HTTP 429 no acesso automatizado. Foram consultados os endpoints oficiais e o [SDK oficial da Meta](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ig-media.js), que declara esses campos, e a disponibilidade nesta modalidade foi confirmada pela consulta real. A existência do campo no SDK não foi usada como garantia de disponibilidade em todos os tipos de login.

Referências: [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Instagram Media](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/), [leitura de mídia da conta](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/reference/ig-user/media/).

Quando a API recusa explicitamente um campo opcional (`caption`, `media_product_type` ou `thumbnail_url`), a consulta remove somente esse campo e tenta novamente a mesma página. O resultado informa a indisponibilidade. Na ausência do produto, somente um vídeo com permalink HTTPS canônico `/reel/{código}/` é classificado como Reel, registrando essa origem da identificação. Um vídeo sem evidência suficiente não é incluído nem apresentado como Reel fictício. Produtos diferentes de `REELS`, imagens e carrosséis são excluídos.

Campos opcionais ausentes não apagam metadados conhecidos de Reels já armazenados. Se data, legenda ou miniatura não existirem, a interface informa a ausência. URLs de miniatura podem expirar; falhas mostram um indicador de miniatura indisponível, e uma nova sincronização pode atualizar a URL. Não se utiliza `media_url` de vídeo como miniatura, nem se faz download de vídeos.

## Paginação e falhas

Cada consulta solicita até 50 publicações. Enquanto a API indicar uma próxima página, o Pulso usa `paging.cursors.after` para reconstruir a requisição no host e no endpoint fixos. O valor bruto de `paging.next` nunca é seguido, armazenado ou devolvido, pois pode conter a credencial. O token continua exclusivamente no cabeçalho `Authorization`.

Cursores ausentes/repetidos, páginas inválidas, erro de autenticação, expiração identificada pela Meta, falhas de rede, erro de campos essenciais ou limites da API interrompem a sincronização. O catálogo anterior fica intacto, sem aplicar páginas parciais. Cada requisição tem timeout de oito segundos; uma barreira de segurança de 1.000 páginas interrompe consultas excessivas com erro explícito, sem afirmar uma sincronização completa. Não há loop de retry automático para limites ou indisponibilidade.

O alcance é o conjunto de publicações devolvido pela API para a conta e o token atuais. Conteúdo removido, arquivado, indisponível ou não exposto pela Meta não é inventado. Uma publicação ausente de uma leitura posterior não provoca exclusão do catálogo nem das associações. A data mais antiga local não garante que a Meta expôs absolutamente todo conteúdo histórico da conta.

## Persistência e segurança

A migration `202610131500_instagram_reels` é aditiva: cria `InstagramReel`, adiciona a data da sincronização em `SocialAccount` e uma referência nullable em `AutomationReel`. Nenhuma tabela ou coluna anterior foi removida. O banco local continua `automacao_instagram_utf8`.

O catálogo pertence a uma `SocialAccount`, que pertence ao workspace autenticado. Conta: unicidade por workspace, plataforma e ID externo. Reel: unicidade por conta e ID externo. Upserts mantêm o ID interno em novas sincronizações. Todos os dados remotos são lidos e validados antes de iniciar a transação de atualização; gravações concorrentes por conta usam lock transacional. Falhas de gravação revertem a transação. Nenhuma sincronização exclui registros armazenados.

Seleções pertencem à automação e referenciam o Reel sincronizado. O backend valida que todos os IDs selecionados pertencem ao workspace antes de criar ou editar. Reedições conservam os IDs das associações mantidas; apenas uma remoção explícita na seleção apaga um vínculo novo. Clientes antigos que omitem `reelIds` não apagam seleções. Associações legadas reconhecidas por ID externo são ligadas ao catálogo sem recriar seus registros; vínculos legados ainda não reconhecidos permanecem preservados.

`GET /api/instagram/reels` lê somente o catálogo do workspace. `POST /api/instagram/reels` exige sessão do proprietário e origem compatível com `NEXTAUTH_URL`; não aceita conta ou workspace escolhidos pelo cliente. As respostas locais são privadas, sem cache persistente. A credencial, mensagens brutas da Meta e URLs de paginação nunca são retornadas, registradas em logs ou armazenadas no PostgreSQL. Links públicos são normalizados; miniaturas usam somente HTTPS nos domínios CDN do Instagram/Meta. URLs que ecoem a credencial são recusadas.

## Validação local e recuperação

A primeira sincronização real encontrou **87 Reels em 175 publicações e quatro páginas**, com datas de junho de 2022 a outubro de 2026. Os 87 retornaram legenda, data e miniatura, sem campos opcionais recusados. A repetição manteve os mesmos IDs internos e 87 registros, sem duplicação. Os dados anteriores do proprietário, workspace, automação, palavras-chave, blocos e associações foram comparados integralmente com o snapshot anterior e preservados.

Antes da migration, foi feito backup completo com `pg_dump` oficial. O arquivo foi verificado por SHA-256, leitura do catálogo e restauração em um banco de validação UTF8, comparado integralmente com o original. O backup privado `reels-before-20261013.dump` e os relatórios ficam em `%USERPROFILE%\.codex\backups\pulso\20261012-utf8`, fora do GitHub. O banco de validação da restauração também foi preservado.

Para recuperar esse estado, pare os processos da aplicação, faça um backup atualizado, restaure a cópia anterior em outro banco UTF8 vazio e valide os dados antes de trocar a conexão. Não restaure por cima do único banco disponível e não execute resets. Essa cópia não contém os Reels sincronizados posteriormente; preserve um backup atual se precisar mantê-los. Os procedimentos gerais de backup/restore estão em [MIGRACAO-UTF8.md](MIGRACAO-UTF8.md).

Os testes usam banco separado e credenciais descartáveis, sem chamadas reais à Meta. Cobrem identificação de Reels, cursores, páginas antigas, duplicatas, campos opcionais, erros, preservação do catálogo, Unicode, workspace, associações novas/legadas, pesquisa, seleção múltipla, reabertura do rascunho, CSRF e apresentação móvel. A leitura real da instalação é uma verificação separada e não usa dados fictícios.

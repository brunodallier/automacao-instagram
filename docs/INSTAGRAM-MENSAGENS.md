# Mensagens e limites do editor

Consulta às fontes oficiais da Meta em 9 de outubro de 2026. A documentação foi acessada diretamente no site da Meta; nenhuma chamada de envio foi realizada.

## Capacidades confirmadas na documentação

**Resposta privada inicial a um comentário:** usa o ID do comentário como destinatário, admite uma resposta por comentário e tem prazo de sete dias após comentários em Reels. Uma continuação depende de resposta do destinatário e da janela de 24 horas. O envio da primeira DM e a abertura de um link não são tratados pelo Elo como autorização para outra mensagem. A referência de Private Replies demonstra texto; não confirma templates com botões nessa primeira resposta. Por isso o editor conserva esses botões, permite a prévia e sinaliza uma pendência impeditiva de ativação. Alternativa conservadora: primeira DM em texto e botões somente após interação elegível, sem mudar automaticamente o conteúdo. [Meta — Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies).

**Conversa autorizada:** o Send API documenta texto de até 1.000 bytes UTF-8. O editor conta bytes com `TextEncoder`, separadamente dos caracteres Unicode; emojis e acentos podem ocupar vários bytes. Para este fluxo acionado por comentário, a continuação exige uma interação elegível dentro de 24 horas. Há outras janelas na plataforma para casos diferentes, como anúncios de clique para Direct; elas não são usadas neste editor. A Meta também documenta imagens PNG/JPEG de até 8 MB e vídeos MP4/OGG/AVI/MOV/WebM de até 25 MB. Estes formatos são referência para a arquitetura futura; não há controles de mídia nem envio nesta entrega. [Meta — Send API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api).

**Template com botões:** suporta corpo de até 640 caracteres UTF-8 e de um a três botões. `OPEN_URL` corresponde ao tipo oficial `web_url`; `NEXT_MESSAGE` prepara uma continuação vinculada a `postback`, que depende do webhook `messaging_postbacks`. O Instagram controla o navegador usado pelo link. Na prévia local, o clique mostra a URL; um link separado permite abri-la em nova aba com `noopener noreferrer`. A página atual da Meta não especifica ali o limite do título. O Elo adota **20 caracteres como política conservadora local**, que precisa de confirmação prática para o formato e a versão escolhidos. [Meta — Button Template](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template).

## Rascunho, simulação e ativação

O salvamento valida estrutura, tamanhos de armazenamento, tipos de ações, duplicidade de palavras-chave e referências de tags no workspace. Texto e títulos não são aparados ou substituídos. URL vazia ou inválida pode ser guardada no rascunho, mas é recusada na revisão de ativação quando a ação é abrir site. HTTPS com usuário/senha embutidos ou esquemas executáveis não passa nessa revisão nem gera um link clicável na prévia.

Os limites estruturais locais são: 20 etapas, 60 mensagens contando continuações e alternativas preservadas, oito níveis de mensagens e três botões por mensagem. Texto de rascunho aceita até 8.000 unidades UTF-16, título de botão até 200 e URL até 2.000, para guardar trabalho incompleto ou conteúdo antigo maior que os limites de envio. Estes são limites de armazenamento; não autorizam envio à Meta.

A revisão exige título, palavra-chave, primeira DM, texto, títulos, URLs das ações de site e conteúdos das continuações. DMs adicionais no nível principal são sinalizadas porque não podem ser disparadas automaticamente após a Private Reply. Tags e atrasos também precisam estar definidos. O endpoint de ativação rejeita configurações inválidas e, mesmo com campos completos, retorna que a integração ainda está pendente. Não existe mudança para `ACTIVE` nesta etapa.

A prévia é local e não acessa a Meta nem contatos. As continuações visíveis após cliques são hipóteses para revisão do conteúdo, inclusive quando o formato inicial ainda depende de confirmação. Palavras-chave são comparadas sem distinguir caixa, com espaços normalizados e limites de palavras; acentos continuam significativos. Tags, respostas públicas e atrasos aparecem como etapas simuladas. Uma opção explícita permite simular uma resposta recebida para examinar DMs subsequentes.

## Persistência e integração futura

As mensagens permanecem nas colunas existentes de `AutomationStep`. O JSON de botões guarda título, ação, URL e `nextMessage`, com discriminação `format: TEXT`. Alterar uma ação mantém a URL e a continuação anteriores; somente remover explicitamente o botão ou a mensagem descarta esse conteúdo. Objetos antigos `{label,url}` recebem a ação de URL ao serem lidos. A migration adiciona apenas `nameIsProvisional` a `Automation`, sem alterar dados anteriores.

O guard puro `canDeliverMessage` diferencia `PRIVATE_REPLY` de `AUTHORIZED_CONVERSATION`. Ele exige data do comentário e ausência de resposta anterior no primeiro caso; no segundo, exige uma interação verificada e prazo válido. `URL_CLICK`, ausência de evento, datas futuras e janela expirada são recusados. Um clique no simulador nunca é usado como evento de webhook.

Antes de integrar de verdade, será necessário confirmar permissões e versão da API, assinatura e origem dos webhooks, correspondência do postback ao destinatário e ao botão, elegibilidade das interações, renderização e limite dos títulos, formatos da Private Reply e comportamento em Solicitações. A janela deve ser reavaliada antes de cada envio, inclusive após atrasos. As regras puras desta etapa não substituem esses testes. OAuth, tokens, webhooks, envios, contatos e processamento seguem pendentes.

# Design system · Pulso

## Identidade e composição

O nome institucional é **Pulso**; o wordmark é **pulso.**, em Inter Tight escura com ponto laranja. O favicon usa uma letra original e o mesmo ponto. A marca anterior e seu símbolo de elos foram removidos. Repositório, banco, rotas e identificadores técnicos conservam seus nomes.

A referência [Ventriloc — Refero Styles](https://styles.refero.design/style/f99aca3e-5289-4595-a7cc-77a72052f4b8) orienta a tipografia leve, o espaço negativo e o uso contido de cor. A composição foi adaptada ao trabalho diário em um dashboard: títulos menores, controles compactos e conteúdo alinhado. Nenhum logo, imagem, gráfico ou fonte proprietária da referência foi reutilizado.

Use o branco como superfície contínua. Separe seções com espaço e hierarquia tipográfica; não coloque cada informação em um card. Métricas ficam independentes, sem borda, fundo ou sombra individual. A conexão Instagram pode ter uma superfície Fog por reunir status e ação. A prévia da conversa recebe uma sombra suave para sugerir profundidade. Tabelas usam linhas discretas; formulários não recebem caixas externas adicionais. Os quatro passos do editor permanecem identificáveis pelo número e título, com espaços menores que os do painel.

Não crie gráficos ou métricas fictícias para preencher espaços. Os dados e seus estados vazios continuam sendo os da plataforma. Ausência de conexão, funcionalidades futuras, erros e avisos devem permanecer explícitos.

## Tokens e Tailwind CSS v4

`src/app/globals.css` centraliza cores, fontes, espaçamentos, alturas, raios e sombras em `:root`. Os componentes compartilhados usam esses tokens. O bloco `@theme inline` expõe aliases para utilitários Tailwind v4: `bg-background`, `text-foreground`, `bg-action`, `text-ember`, `bg-panel`, `bg-neutral`, `bg-paper`, `font-sans` e `font-display`. Prefira tokens e classes compartilhadas a cores locais em JSX.

| Token CSS | Valor | Uso |
| --- | --- | --- |
| `--color-graphite` | `#202020` | Texto principal, foco, botões principais |
| `--color-ember-orange` | `#FF682C` | Ponto da marca, indicadores pequenos de seleção |
| `--color-steel` | `#4D4D4D` | Texto secundário, dicas e contadores legíveis |
| `--color-slate` | `#828282` | Elementos auxiliares que não exigem contraste de texto pequeno |
| `--color-canvas-white` | `#FFFFFF` | Fundo predominante e campos |
| `--color-ash` | `#EFEFEF` | Badges e superfícies neutras |
| `--color-fog` | `#F5F5F5` | Agrupamentos discretos, hover e carregamento |
| `--color-ivory` | `#EBE6DD` | Seleção de texto e foco dos campos |
| `--color-mist` | `#E8E8E8` | Divisórias e bordas discretas |
| `--color-brass` | `#816729` | Detalhe secundário opcional |

As cores semânticas têm tokens próprios: sucesso `#236343` sobre `#F0F6F2`, erro `#A32E2E` sobre `#FFF3F1` e aviso `#72591C` sobre `#FAF6EC`. Feedback usa texto e, quando existente, ícone; laranja não identifica erro.

## Tipografia

- **Inter Tight:** wordmark, títulos e números de destaque. Pesos 400/500 e tracking de aproximadamente `-0.025em` nos títulos.
- **Inter:** textos, rótulos, campos, tabelas e botões. Pesos 400/500/600, corpo de 14 px, textos principais entre 13 e 16 px.
- Títulos de página: 28–36 px; títulos de seções: 20–24 px. Números do painel têm escala maior, sem negrito pesado. Apenas a composição editorial do login usa título maior.
- Dicas e contadores: 12 px; não reduzir o conteúdo secundário para caber no layout. As pequenas assinaturas e marcações auxiliares não substituem informação essencial.

As duas famílias são distribuídas pelo Fontsource com licença **SIL Open Font License 1.1**. São servidas localmente em WOFF/WOFF2, com `font-display: swap`; o build e a interface não dependem de download do Google Fonts. PolySans não foi usada.

## Espaçamento e superfícies

Escala `--space-*`: **4, 8, 12, 16, 20, 24, 32, 40, 48 e 64 px**. Use 4–12 px entre rótulos e campos; 12–24 px entre grupos do editor; espaços maiores para separar seções do painel. Campos usam `--control-height: 40px`; campos dos botões, `--control-compact: 36px`. Raios: `--radius-field: 4px` e `--radius-panel: 6px`.

`--shadow-soft` usa opacidade de 4% e fica restrita a superfícies que precisam se destacar, como conexão e prévia. `--shadow-overlay` usa 12% para menus e diálogos. Não aplique sombras a todas as seções. Evite gradientes, pílulas grandes, bordas duplas e caixas dentro de caixas. A assimetria de cantos pode aparecer pontualmente na área de conexão.

## Componentes e estados

- **Marca e navegação:** `Brand` e `AppShell` centralizam a identidade. Sidebar branca, ícones lineares e indicador laranja estreito no item ativo. Nome do item e fundo neutro também identificam a seleção.
- **Títulos e seções:** `PageHeading`, `EmptyState` e classes compartilhadas separam conteúdo por alinhamento e espaço. `.card` funciona como agrupamento estrutural sem criar uma caixa visual por padrão.
- **Botões:** principal Graphite com texto branco; secundário neutro ou contorno; ação destrutiva usa a cor semântica de erro. Hover, foco e estado desabilitado são visíveis. Não use laranja como fundo de todas as ações.
- **Campos:** fundo branco, borda Slate para identificar o controle com contraste de pelo menos 3:1, rótulos próximos e altura consistente. Validação, `aria-invalid`, mensagens de erro, contadores e limites existentes são preservados.
- **Editor:** respostas públicas na terceira seção; conversa privada na quarta. Blocos têm uma indicação lateral discreta. Configuração dos botões usa uma superfície Fog compacta; continuações ficam alinhadas dentro do fluxo, sem outra moldura. Recolher mantém título, ação e possibilidade de editar.
- **Prévia, menus e diálogos:** mantêm o comportamento funcional existente. Menus precisam de espaço para não serem cortados pela tabela; diálogos conservam cancelamento, confirmação e foco contido.
- **Carregamento e erro:** skeletons usam Fog/Ash; feedback tem texto legível e região de status/alerta. Respeite `prefers-reduced-motion`.

## Responsividade e acessibilidade

O painel dispõe introdução e métricas em colunas largas, reduzindo para uma coluna antes de comprimir o conteúdo. A sidebar vira navegação móvel. O editor mantém a sequência principal e desloca resumo/prévia para baixo em telas menores; as respostas públicas passam de duas colunas para uma. Abaixo de 760 px, o login apresenta marca e formulário, com um título principal visível. Botões e ações podem quebrar linha; tabelas têm rolagem própria quando necessário.

Preserve nomes acessíveis, labels, ordem de leitura, foco visível, interação por teclado e alvos confortáveis. Texto secundário pequeno usa Steel, pois Slate sobre branco não atinge 4,5:1. Laranja também não deve ser usado como texto pequeno sobre branco. Estados não dependem apenas da cor. Não oculte informação ou validações para diminuir a altura de um componente.

A validação automatizada cobre telas a **1440 × 1000** e **390 × 844**, marca/metadados/favicon, ausência de overflow horizontal, contraste mínimo de 4,5:1 em textos e controles principais e de 3:1 nas bordas dos campos habilitados. As capturas são complementadas por revisão visual; esse teste não substitui uma auditoria completa de acessibilidade.

## Limites desta entrega

O redesign altera apresentação e dependências de fontes. Não altera banco, encoding, schema, migrations, APIs, autenticação, rascunhos, palavras-chave, regras de envio, simulação ou integração Meta. Os quatro passos são a ordem de configuração da interface e não definem uma ordem de execução das respostas públicas e privadas.

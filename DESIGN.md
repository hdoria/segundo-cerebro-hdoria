---
name: Cérebro hdoria
description: Console operacional local com a identidade visual do task-manager
colors:
  primary: "#4b5bd6"
  primary-dark: "#8e9af3"
  warm-paper: "#fbfaf8"
  warm-sidebar: "#f4f3f0"
  warm-ink: "#1d1c1a"
  warm-line: "#e9e7e2"
  dark-paper: "#1a1a19"
  dark-ink: "#eceae5"
typography:
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  metadata:
    fontFamily: "Geist Mono, monospace"
    fontSize: "12px"
rounded:
  control: "6px"
  surface: "8px"
spacing:
  unit: "4px"
  compact: "8px"
  group: "12px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "4px 12px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.control}"
---

# Design System: Cérebro hdoria

## Overview

Console operacional de Hugo para inspecionar e operar o cérebro local. A identidade segue
`~/projects/task-manager`, referência `08a2a2ef9ce95391f8c31a072d319f71a10c63ee`:
superfícies quentes, ação índigo, navegação discreta e hierarquia compacta. O redesign mantém
os contratos, dados, decisões e APIs do cérebro; a interface apresenta evidências existentes.

A fonte executável dos valores é [console/design/tokens.css](console/design/tokens.css).
O inventário [console/design/tokens.js](console/design/tokens.js) lista os nomes, sem uma
segunda cópia dos valores. O frontmatter acima é um recorte documental dos tokens reais;
a implementação e os temas devem sempre consultar o CSS canônico. O catálogo local
`/design-system` usa os mesmos componentes React/shadcn das workspaces.

- Verdade antes da aparência: cada estado precisa de contrato, evento ou recibo.
- Uma gramática nas escalas Cérebro, Sistema e Run.
- Conteúdo privado exige abertura explícita; referências e contagens bastam para o mapa.
- Estado, tipo de objeto e ação têm papéis visuais distintos.

## Colors

A paleta substitui o antigo branco/cinza frio e verde principal por neutros quentes e índigo.
Claro, escuro e sistema são preferências explícitas. A seleção fica em `cb-theme`; o tema
resolvido usa `data-theme` e a classe `dark`. Sem preferência explícita, acompanha o sistema.

| Papel | Tokens canônicos | Aplicação |
| --- | --- | --- |
| Página e navegação | `--bg`, `--bg-side` | papel quente e lateral mais baixa |
| Superfícies | `--surface`, `--surface-2`, `--surface-3`, `--sunken` | agrupamento e níveis operacionais |
| Texto | `--text`, `--text-2`, `--text-3` | conteúdo, apoio e metadados |
| Divisões | `--border`, `--border-strong` | linhas finas, sem contraste excessivo |
| Ação e foco | `--accent`, `--accent-hover`, `--accent-active`, `--focus-ring` | ação principal, seleção e foco |
| Execução | `--run` | caminho observado e execução |
| Resultado | `--ok`, `--wait`, `--fail`, `--idle` | passou, pendente, falhou e declarado |

Os aliases `--brand`, `--hairline` e `--raised` preservam consumidores existentes. As variáveis
shadcn `--primary`, `--background`, `--foreground`, `--destructive` e `--ring` apontam para
os mesmos papéis; não formam uma segunda paleta.

No Canvas, `--kind-source` usa teal; `--kind-area`, azul; `--kind-system`, violeta;
`--kind-routine`, índigo; `--kind-skill`, rosa; `--kind-artifact`, texto secundário;
`--kind-gate`, âmbar; `--kind-run`, verde. Ícone/rótulo comunicam o tipo e texto/contorno
comunicam o estado. A leitura nunca depende somente da cor.

A presença cromática deve ser perceptível também em Hoje e na navegação. Ícones coloridos
identificam seções; a seleção recebe a mesma tinta. Resumos usam símbolo e cor do tipo de
informação, além do valor e rótulo. Cabeçalhos de painéis repetem esse papel em ícones
compactos. Valores zero ficam neutros; atenção exige contagem real positiva. Badges de
sucesso, pendência e falha usam texto, ponto e fundo semântico, sem substituir o estado
canônico. As superfícies de leitura continuam neutras para preservar a hierarquia.

Logos de fornecedores preservam identidade publicada pelo pacote `simple-icons`. GitHub usa
`--text` para acompanhar o tema. Essas cores de identidade não substituem a paleta da interface.

## Typography

Geist é a fonte da interface; Geist Mono fica para IDs, versões, recibos, código e medidas.
Ambas são servidas localmente de `console/fonts/`, sob SIL OFL, sem CDN.

- Corpo: `--fs` / `--fs-body`, com peso e entrelinha definidos na escala canônica.
- Metadados: `--fs-xs` / `--fs-meta`; microtexto usa `--fs-2xs` quando o contexto comporta.
- Títulos: `--fs-2xl` / `--fs-title`; destaques seguem `--fs-xl` e `--fs-stat`.
- Números comparáveis são tabulares; rótulos usam frase normal.
- Texto longo respeita `--measure-copy`; não aumentar densidade reduzindo fonte arbitrariamente.

## Layout

A escala de espaço parte de `--space-unit` e seus aliases. Breadcrumb, título, ferramentas,
listas e tabelas compartilham gutters; o mobile usa `--gutter-mobile`. Larguras de navegação,
drawer, modal, controles e áreas de leitura pertencem aos tokens de layout. Breakpoints são
`@custom-media` no arquivo canônico e são resolvidos no build.

A composição acompanha também o shell do Gr8r Studio original (`904205c`), preservado no
task-manager local (`08a2a2e`): barra superior de `--topbar-h` fora da região rolável, sidebar
de `--side-w` com marca e rodapé estáveis e navegação com scroll próprio. Breadcrumb, busca,
tema e atualização pertencem à barra global; título, subtítulo e data ficam na página.
Os grupos Dia a dia, Operação, Conhecimento e Conexões organizam a navegação; Áreas tem
seção própria. Rótulos estruturais de navegação devem permanecer visíveis no menu expandido.

Hoje usa `--page-max`, faixa de resumo e painéis em proporção 1.55:1; abaixo de 1100px,
uma coluna. Catálogos ocupam a largura disponível. Não reservar uma coluna vazia quando
não existe fila de decisões ou julgamento para apresentar. Listas dentro de painéis usam
linhas, sem um segundo cartão interno. Nomes de Sistemas permanecem completos.

Áreas e Sistemas sem marca publicada recebem uma identidade cromática estável pela chave
canônica, compartilhada entre navegação, catálogo e detalhes. Essa identidade não significa
saúde nem execução; estado continua com badge e texto próprios. Cores selecionam aliases
canônicos e `--identity-soft` resolve no escopo de cada entidade. Marcas publicadas prevalecem.

O Canvas tem host próprio sob controle do G6 e lista equivalente para teclado/leitores de tela.
O mapa Cérebro organiza Fontes, Sistemas, Áreas, Rotinas e handoffs por relações reais. Sistema
usa colunas semânticas: Fonte → Coleta → Recuperação → Skill/Capability → Output → Gates →
Julgamento. Run destaca o caminho sustentado pelo Execution Trace.

A abertura prioriza zoom legível. O inspector ocupa coluna própria; selecionar um nó reduz a
ênfase fora da vizinhança. `Ver mapa inteiro` limpa esse foco. `Reorganizar` permite mover nós
e persistir somente posições `{x,y}` locais; criar/remover arquitetura exige mudar contratos.

Raios, gaps, dimensões, zoom e enquadramento usam `--canvas-*`. Índices de etapa, relações,
coordenadas medidas e operações matemáticas permanecem dados/algoritmos, não tema.

O Cérebro (`files`, antes Biblioteca) tem uma lateral contextual recolhível com tipos declarados, tags e
pastas, uma lista compacta e o leitor na área principal. React/shadcn compõem navegação,
lista e controles; Plate atende somente ao corpo formatado e à edição das notas. Em desktop
amplo, os três painéis convivem com o menu global. Em largura intermediária a navegação
contextual abre sob demanda; no celular categorias, lista e nota são etapas com retorno.
Expandir leitura recolhe os painéis da biblioteca. Propriedades e relações declaradas abrem
em Dialog, somente leitura, sem coluna permanente. Lista, leitura e navegação têm scroll
próprio; filtros, seleção e posição são estado de sessão. Cor identifica tipo, tag e seleção,
com trechos curtos somente após uma busca explícita por conteúdo. Sem consulta, o índice não inclui trechos do corpo. Trocar contexto preserva as proteções de rascunho e Save.

## Elevation & Depth

Profundidade vem primeiro de superfícies, bordas finas e espaço. Navegação ativa usa
`--nav-active-bg` e `--nav-active-shadow`; controles, popovers e drawers usam as sombras
canônicas adequadas à função. Sem halo decorativo ou blur de fundo como identidade do produto.
Foco é visível, com `--focus-ring`; erro usa `--error-ring`.

Movimento usa os tokens `--dur-*`, `--ease*` e `--canvas-motion-*`. Redução de movimento
suprime animações da interface e transições G6. Trocar tema redesenha a aparência da mesma
instância, preservando posição, zoom, seleção e estados observados. O backing layer G6 é
transparente: a superfície CSS acompanha o tema, sem depender de fundo mutável no renderer.

## Shapes

Cantos vêm da escala `--r-*`: controles usam tipicamente `--r-sm` (6px), agrupamentos usam
`--r` (8px), e superfícies/modais podem selecionar os passos maiores já definidos. Não inserir
um raio isolado. Bordas vêm de `--stroke*`; ícones Lucide mantêm escala e traço coerentes.
Círculos de identidade no Canvas não substituem os ícones semânticos dos objetos.

## Components

Os componentes reais estão em [console/ui/components](console/ui/components), adaptados do
registry oficial shadcn/ui `new-york-v4`. [Proveniência](console/ui/PROVENANCE.md), JSONs
originais e licença MIT ficam junto do código. React e Radix implementam controles e interação;
não usar classes que apenas imitem shadcn.

- Button: variantes default, outline, secondary, ghost, link e destructive; hover, foco,
  disabled e pending preservam o significado da ação.
- Input, Textarea e NativeSelect: valores, seleção, validação, labels e eventos continuam
  ligados ao motor existente. NativeSelect mantém o seletor nativo no mobile.
- Checkbox, Tabs, Dialog e Sheet: primitivas Radix fornecem interação e foco. Drawers,
  confirmações e command palette continuam com fechamento por Escape e retorno de foco.
- Table: cabeçalhos e células compartilhados; rolagem horizontal pertence à tabela, sem
  provocar overflow da página.
- Label e Separator completam os mesmos contratos de composição.

O adapter converte markup confiável e escapado em descritores e elementos React. Não instala
markup como HTML vivo. React possui os filhos renderizados; roots descendentes são desmontados
antes de substituir o pai. O G6 possui apenas seu host dedicado. `flushSync` é limitado às
fronteiras existentes que consultam DOM/foco imediatamente após renderizar.

Avisos, indicadores e experimentos continuam vistas derivadas: marcar aviso como lido não
aprova uma decisão; valores ausentes não viram zero; histórico, período e atribuição ficam
explícitos. Hipótese, regra, veredito e conteúdo privado exigem abertura própria.

## Do's and Don'ts

- Use os tokens e componentes compartilhados em todas as workspaces e no catálogo.
- Altere o valor canônico uma vez; registre novos nomes no inventário correspondente.
- Preserve loading, erro com recuperação, vazio, disabled, teclado, mobile e reduced motion.
- Mantenha sessão, CSRF, CSP e confirmação explícita nas ações que já as exigem.
- Use texto e forma além da cor; contraste mínimo AA continua requisito de revisão visual.
- Não escreva cores, fonte, espaçamento, breakpoints, opacidade ou duração dentro de consumidores.
- Não crie valores de negócio, estados, dependências ou evidências para completar uma tela.
- Não copie conteúdo do vault para o catálogo, tokens, exemplos ou bundle.
- Não edite bundles como fonte: execute o build local e distribua os compilados.
- Notas abrem formatadas. Markdown bruto é opção secundária e editar é ação explícita com salvar e cancelar.
- Uma página tem uma única abertura principal; painéis irmãos compartilham altura mínima e baseline.
- Breadcrumb navega: ancestrais são destinos reais e a página atual usa `aria-current`.
- Laterais acomodam rótulos completos e contagens; confira com o nome mais longo.
- Código inline usa cor própria da paleta, sem se confundir com link; blocos longos ficam neutros.
- Nomes seguem o modelo mental do dono: Cérebro é o acervo de notas, Arquitetura é a visão de
  funcionamento e conexões. IDs técnicos e rotas não mudam junto com o rótulo.
- Setup que depende de algo externo (SSH, conta, token, conector) traz ajuda passo a passo com
  comandos copiáveis e um botão Testar que diz o que falta em linguagem acionável.
- Aprovação só depois de mostrar o conteúdo legível, a origem, a versão ou hash e o efeito exato.
  Aprovar um relatório não conclui tarefas citadas nem autoriza escrita externa.
- Rotina valida destino, privacidade e modo de entrega antes de chamar IA; botão e selo derivam da
  mesma validação.

Consulte [o guia de manutenção](docs/guides/console-design-system.md) para build, auditoria,
proveniência e exceções geométricas permitidas.

O Cérebro permite busca por título/conteúdo e referências recebidas derivadas de links reais. Anexos locais declarados abrem somente por escolha em Dialog. As divisórias desktop usam limites canônicos e guardam apenas larguras numéricas em `cb-library-layout-v1`; celular conserva navegação por etapas.

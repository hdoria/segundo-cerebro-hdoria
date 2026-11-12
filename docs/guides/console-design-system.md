# Manutenção do design system do Console

A direção aprovada usa a identidade de `~/projects/task-manager` e componentes reais
React/shadcn. [DESIGN.md](../../DESIGN.md) descreve os papéis; a fonte executável dos valores
é [tokens.css](../../console/design/tokens.css). Não manter escalas concorrentes em componentes.

## Fontes e proveniência

| Material | Fonte | Uso local |
| --- | --- | --- |
| Identidade task-manager | commit `08a2a2ef9ce95391f8c31a072d319f71a10c63ee`, `src/styles/tokens.css` e `src/core/design-tokens.js` | paleta quente, ação índigo, tipografia, espaços, controles e inventário |
| shadcn/ui | registry oficial `new-york-v4`, registro local de obtenção em 21/10/2026 | componentes React adaptados em `console/ui/components/` |
| Registry e licença originais | `console/ui/upstream/*.json` e `console/ui/upstream/LICENSE` | rastreabilidade e termos MIT, Copyright 2023 shadcn |
| Geist e Geist Mono | `console/fonts/`, `OFL-Geist.txt` | fontes locais sob SIL OFL |
| Base CRM | atribuição histórica em `NOTICE` | origem do design anterior; não governa a paleta atual |

A referência task-manager transfere identidade, não sua implementação vanilla de controles.
As adaptações shadcn preservam estrutura, props, primitivas Radix e hooks `data-slot`; classes
semânticas locais aplicam os tokens compartilhados. Consulte [PROVENANCE.md](../../console/ui/PROVENANCE.md).

## Contrato das fontes

- `console/design/tokens.css`: primitivas, papéis semânticos, escalas, layout, motion,
  viewport, aliases shadcn/Tailwind e valores consumidos pelo Canvas.
- `console/design/tokens.js`: `TOKEN_GROUPS` lista todos os nomes; não duplica seus valores.
  `readDesignToken(name, styles)` lê o valor computado; `readDesignNumber` exige número simples
  unitless, px ou ms, recusando valor ausente ou `calc()` não resolvido.
- `console/design/catalog.css`: aparência dos componentes compartilhados e composição do catálogo.
- `console/styles.css` e `console/experience.css`: consumidores dos mesmos tokens.
- `console/ui/components/`: componentes React/shadcn reutilizados nas workspaces e no catálogo.
- `.impeccable/design.json`: extensão documental do frontmatter de DESIGN.md; não é outra
  fonte executável de cores ou escalas.

Para consultar a contagem atual e os grupos, sem manter um número manual desatualizado:

```sh
node --input-type=module -e "import {TOKEN_GROUPS} from './console/design/tokens.js'; console.log(TOKEN_GROUPS.flatMap(group => group.tokens).length)"
```

Temas claro e escuro mudam valores sob os mesmos nomes. O seletor oferece `system`, `light`
e `dark`; `cb-theme` guarda somente a preferência local. Mudanças do tema resolvido emitem
`cerebro:theme-change` no window, inclusive quando seguem o sistema operacional.

## Renderer e limites de ownership

O motor mantém modelos, carregamento, eventos de domínio e APIs. O adapter de UI analisa
markup escapado como descritores inertes e cria elementos React pelo registry compartilhado.
Sem `dangerouslySetInnerHTML`, iframe ou segunda implementação de controles. Valores de
formulário, seleção nativa, eventos delegados e foco precisam permanecer compatíveis.

Roots React descendentes são descartados antes da substituição do pai. Fronteiras síncronas
com `flushSync` atendem consultas existentes de DOM/foco; não ampliá-las para trabalho de domínio.
O G6 controla somente o host do Canvas. Atualização de tema redesenha aparência sem executar
layout, inventar dados ou substituir posições salvas.

O catálogo em `/design-system` exibe os componentes reais e uma amostra dos valores semânticos
computados, com seletor de tema e diálogo interativo. Ele não carrega conteúdo privado do cérebro;
a lista completa de tokens está no inventário JS.

## Build e distribuição

No checkout de desenvolvimento com dependências instaladas:

```sh
npm run check:tokens
npm run build:console
```

`scripts/build-console.mjs` compila React/shadcn e Canvas com esbuild e processa Tailwind,
imports CSS e custom media com PostCSS. Os artefatos distribuídos são `console/ui.bundle.js`,
`console/canvas.bundle.js` e `console/styles.bundle.css`, acompanhados de HTML, motor e fontes
locais. Bundles não são arquivos de edição manual.

A instalação continua iniciando com Node 20+; não deve exigir npm install, build ou CDN no
ambiente do usuário. A allowlist do servidor publica assets compilados e `/design-system`,
sem expor automaticamente arquivos fonte. Sessão, CSRF, CSP e gates de ação permanecem contratos
do motor. A documentação não substitui a prova HTTP do pacote instalado.

## Auditoria e regressões

`scripts/check-console-tokens.mjs` percorre fontes CSS/JS/JSX autorais de `console/` e verifica:

- declarações ausentes no inventário, nomes inventariados sem declaração e duplicatas;
- referências CSS não definidas e breakpoints fora do arquivo canônico;
- cores e dimensões visuais literais, números visuais e utilitários arbitrários detectáveis;
- valores escondidos em aliases locais, strings de estilo e atribuições Canvas.

Arquivos gerados são excluídos desse scanner. O scanner é uma barreira mecânica de sintaxe;
leitura de código e verificação visual ainda precisam detectar valores montados dinamicamente,
contraste, overflow, foco e fidelidade à referência.

As suites focadas incluem `test-console-design-tokens.mjs`, `test-console-canvas-tokens.mjs`,
`test-console-react-ui.mjs`, `test-console-design-delivery.mjs` e
`test-console-installed-release.mjs`. Os nomes indicam cobertura, não resultados: a evidência
válida é a execução registrada no recibo da entrega e no CI correspondente.

A revisão visual usa fixtures sintéticas em desktop e 390px, nos dois temas: navegação, áreas,
campos, filtros, tabelas/histórico, avisos, source drawer/Escape, palette, confirmação e Canvas.
Nenhum julgamento ou estado de leitura do vault real é alterado para demonstrar o redesign.

## Exceções: geometria e dados

As exceções permitem representar informação real; não permitem espalhar decisões visuais.

| Valor permitido fora dos tokens | Por quê | Limite |
| --- | --- | --- |
| Coordenadas medidas e posições `{x,y}` | resultado do viewport/layout ou preferência local | não substituir raio, gap ou tamanho de projeto |
| Índices de estágio, contagem de nós e relações | topologia e proveniência do grafo | ordem do fluxo não é escala de espaço |
| `Math.PI`, média, divisores, zero e unidade | trigonometria, centralização, origem, identidade matemática ou motion desativado | limiares de zoom e durações são tokens |
| `viewBox`, paths SVG e cores publicadas de fornecedor | dados de ícone/identidade do pacote | tamanho e traço autorais usam tokens; GitHub adapta ao texto do tema |
| Percentuais medidos, proporções de grid e contagens estruturais | dimensionamento derivado ou estrutura CSS | não criar uma paleta/escala numérica paralela |
| Números, datas e frações de negócio | dados canônicos apresentados | não alterar dados para melhorar aparência |

Dimensão de nó, espessura/opacidade/dash de aresta, raios de anéis, espaços de coluna, lanes
de handoff, zoom e animação do Canvas pertencem a `--canvas-*`, mesmo sendo números usados
em JavaScript. A superfície G6 fica transparente porque a API da versão instalada não atualiza
seu background após criação; a superfície CSS responde ao tema.

Ao criar um token, altere o CSS canônico e o inventário no mesmo lote; use o papel semântico
mais próximo antes de acrescentar nomes. Atualize DESIGN.md/sidecar quando mudar o contrato
do sistema, não a cada ajuste de dados ou estado.

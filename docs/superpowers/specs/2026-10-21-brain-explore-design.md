# Buscar, conectar e abrir anexos no Cérebro

Hugo autorizou os itens 1, 2 e 4 da proposta no chat: busca por conteúdo e backlinks, divisórias ajustáveis com preferência local e visualização de PDFs/imagens relacionados. Não inclui criar notas nem editar propriedades.

## Entrega

- Busca explícita por título ou conteúdo; conteúdo é o padrão na vista Cérebro. Filtra dentro de área/tipo/tag/pasta existentes. Resultados de busca por conteúdo podem mostrar trecho curto e escapado; sem consulta, o índice continua sem corpos/snippets. Sem índice persistente, rede externa ou IA.
- Na nota aberta, uma seção recolhível de referências recebidas mostra notas permitidas que apontam para ela. Links Markdown e wikilinks reais; ambiguidade não inventa relações. Clicar usa o mesmo guard de rascunhos. Lista tem limite/paginação e sinaliza varredura parcial.
- Duas divisórias arrastáveis e operáveis por teclado no desktop entre categorias/lista/leitura. Respeitam limites e espaço mínimo do leitor. Em larguras intermediárias só a divisória aplicável; no celular nenhuma. Preferência guarda somente números de largura no navegador. Botão de restaurar tamanhos; nenhum texto de nota persistido.
- Seção recolhível de anexos declarados pela própria nota via links Markdown, imagens e wikilinks/embed. PDFs, PNG, JPEG, GIF e WebP locais, selecionados explicitamente, abrem em Dialog. Sem listagem indiscriminada de diretórios nem carregamento automático. Resolver um basename explicitamente declarado pode varrer apenas nomes, com os limites existentes. Sem SVG/HTML, upload ou execução. Links remotos não são buscados pelo servidor.

## Fronteiras

Continuam vigentes autenticação local, CSRF, acesso por root configurado, bloqueio de privado/ocultos/segredos/symlink, visibilidade de Markdown, limites de varredura e falhas públicas sem paths internos. Cada abertura revalida nota de origem, declaração atual, caminho, tamanho e tipo do anexo. Anexo máximo 20 MiB, declaração não concede acesso fora da raiz de conhecimento. PDF usa viewer nativo com fallback de abrir em aba; política de embedding limitada ao mesmo origin e endpoint binário. Cache no-store. Notas canônicas não são alteradas em homologação.

## Decisões de implementação

Preservar React/shadcn e Plate; nenhum novo pacote. API additive para search e backlinks/anexos. IDs files/anatomy inalterados. Relacionamentos são derivados das notas, não uma segunda casa de dados. Testes com dados fictícios; revisão independente; build/tokens/privacidade; prova em desktop/celular e temas; commit/push main privada e servidor4782 atualizado.

## Referências técnicas

O PDF usa o visualizador nativo; embedding é limitado por [frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors). A abertura ajustada à largura usa o [parâmetro FitH do Chromium](https://github.com/chromium/chromium/blob/main/chrome/browser/resources/pdf/open_pdf_params_parser.ts), mantendo a alternativa de nova aba para outros viewers.

O parser Markdown do backend é compilado com unified/remark-parse já presentes no projeto (MIT), sem dependência em node_modules no motor instalado. Fonte de build: scripts/build-inputs/note-markdown-parser.mjs; bundle distribuído: scripts/lib/note-markdown-parser.bundle.mjs.

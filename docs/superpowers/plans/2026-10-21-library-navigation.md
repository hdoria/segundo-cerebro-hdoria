# Biblioteca de notas — plano de implementação

> Execução autorizada pelo Hugo após aprovação da composição. Tarefas independentes têm responsáveis; integração e revisão final são separadas.

**Goal:** Navegar por biblioteca contextual e ler/editar notas na área principal.
**Architecture:** API de metadados amplia o resolver existente, sem novo banco. Workspace React controla estado de biblioteca e sessões Plate; app hospeda bundle local lazy e protege navegação global. Propriedades usam Dialog shadcn.
**Tech Stack:** Node20+, React19, shadcn/Radix, Plate53 e tokens existentes; sem dependências novas.
**Spec:** docs/superpowers/specs/2026-10-21-library-navigation-design.md (reflete desenho aprovado no chat).

## Restrições

- Somente notas fictícias em testes/previews; nenhum envio externo de conteúdo e nenhum modelo/rotina executado.
- Manter resolver/visibilidade/limites/session/CSRF e salvar no mesmo Markdown com conflitos explícitos.
- Sem anexos binários, propriedade editável ou snippets de conteúdo no índice.
- Estado visual em memória da sessão; foco, teclado, loading/erro/vazio e mobile fazem parte da entrega.

## Review focus

Respostas fora de ordem; rascunho surgindo durante navegação/consulta de wiki; atualização externa do arquivo; contagens incompletas/privacidade; retorno entre painéis e foco em modal/mobile.

## Task 1 — Metadata (worker)

Own: scripts/lib/local-file-browser.mjs, scripts/test-local-library.mjs; API wiring is root-owned.
- [x] Testar primeiro tipos/tags/pastas/ordenação/recursão/paginação, fronteiras privadas/symlink e modo legado.
- [x] Implementar contrato listLocalFiles da spec. Datas modified_at observadas no filesystem; facetas por área, resultado parcial explícito.
- [x] Verificar testes novos + navegador legados + persistência; reportar evidência.

## Task 2 — Library workspace (worker)

Own: console/ui/library-workspace.jsx, console/ui/library-session.js, console/library-workspace.css, scripts/test-library-session.mjs, scripts/test-library-workspace.mjs.
- [x] Testar transições assíncronas, draft guard, snapshots e descarte com revisão atual antes da implementação.
- [x] Implementar contrato mountLibraryWorkspace da spec; consumir createNoteSession/NoteWorkspace inline, composição React e shadcn, cores/tokens e estados.
- [x] Verificar SSR e sessões com notas fictícias. Sem alterar app/build/server/tokens/note-workspace (root).

## Task 3 — Host + propriedades (root)

Own: console/app.js, note-workspace JSX/CSS, tokens CSS/inventário, build/server/index/manifest e testes correspondentes.
- [x] Teste de integração para montagem inline e render estável, API metadata e propriedades sob demanda.
- [x] Carregar bundle library local lazy, preservar controller em render, invalidar respostas ao sair, integrar guard global/área/teclado.
- [x] Substituir propriedades details por Dialog compartilhado; sem perder rascunho e sem interceptar controles/modais.
- [x] Integrar tokens, build, nome Biblioteca e cache versions. Verificar regressões relevantes.

## Task 4 — Verificar e entregar

- [x] Revisão independente com artefatos e rubrica; corrigir achados materiais.
- [x] Browser synthetic: desktop claro/escuro, mobile, categorias, busca, nota inline, modal, Save/Cancel/conflito e retorno. Capturas apenas fictícias.
- [x] Suíte completa, sintaxe, build/tokens/privacidade e hash do vault real.
- [x] Commit convencional, merge/push main privada, CI, restart4782, arquivos servidos e integridade real conferidos.

**Condição de parada:** composição aprovada funcionando no Console, sem regressão de rascunho/salvamento, com testes/revisão e runtime verificados.

## Evidência de implementação

- Suíte local completa: 127 testes e 241 módulos verificados, zero falhas (`/tmp/cerebro-library-full-check.log`). Alterações finais de loading/foco/largura passaram novamente nas suítes de sessão, SSR, host e tokens. CI executa o código final nas três plataformas.
- Revisão independente encontrou e confirmou correções para seleção da mesma nota durante outra abertura pendente e restauração de nota removida/área diferente no celular. Guard de descarte também considera a revisão anterior ao primeiro await. Escolher filtros já ativos ou voltar manualmente à lista/categorias invalida leituras pendentes, com três regressões de resposta atrasada verificadas. Nenhum achado material restante após rechecagem.
- Primeiro frame declara carregamento, sem contagem vazia falsa. Resultados de filtros antigos não ficam selecionáveis sob um novo filtro. Refresh/Save preserva sessão do editor e posição da lista.
- Homologação fictícia: tipos, tags, pasta+tag, busca por título, Recentes com modified, nota inline, wiki, expansão, Save, descarte cancelado/confirmado, retorno à seleção e categoria, conflito externo e Reload com confirmação única.
- Propriedades em Dialog: conteúdo somente leitura, Escape e retorno de foco, sem perda de rascunho. A identidade visual de Button agora também usa a classe semântica, pois um trigger Radix asChild pode substituir data-slot; declarações e especificidade do estilo compartilhado foram preservadas.
- Desktop claro/escuro; 1024×768 (lista320px, leitor sem overflow); 390×844 (documento/leitor327px, sem overflow horizontal, foco entre etapas e na edição). Expansão só aparece onde há painéis a recolher. Sem erros ou warnings de navegador.
- Capturas `.impeccable/review/library/` contêm exclusivamente notas fictícias. Biblioteca continua no bundle lazy local; menus usam React/shadcn e Plate serve apenas o conteúdo da nota.

Merge/push, CI e o restart são concluídos após este commit; a evidência final fica no registro da entrega.

Após validar o acervo real (14 tipos, 468 tags e 25 pastas permitidas), os grupos Tipos/Tags/Pastas receberam disclosure nativo. Tags começa recolhido para manter Pastas acessível. SSR, teclado e preservação da escolha durante leitura/edição foram verificados em notas fictícias.

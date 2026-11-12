# Composição Gr8r no Console

**Objetivo aprovado:** trazer a composição visual do task-manager local e do Gr8r Studio original para o Console, mantendo o cérebro como fonte de verdade e tornando a operação clara e reconhecível.

**Referências verificadas:** task-manager local `08a2a2e`; upstream `904205c`. A barra permanente resulta de um shell de altura de viewport e conteúdo com scroll próprio. A referência usa sidebar de 252px, barra de 46px, gutter de 24px, páginas de leitura limitadas a 1160px e grades largas para catálogos. Ícones coloridos identificam entidades; badges separados indicam estado.

**Arquitetura:** preservar React/shadcn, motor, APIs, CSP, sessão, raiz do vault e ações existentes. Alterar a composição HTML/CSS e os renderers de apresentação; valores visuais continuam nos tokens canônicos. Nenhuma dependência nova. Não copiar conteúdo do vault para exemplos ou criar métricas para preencher a tela.

## Aceite e escopo

- Shell: barra superior fora do scroll com breadcrumb, busca existente, tema e refresh; título e contexto pertencem à página abaixo. Sidebar com marca e rodapé estáveis, navegação rolável e grupos identificados.
- Navegação: Dia a dia (Hoje, Avisos, Julgamento), Operação (Sistemas, Skills, Procedimentos, Canvas), Conhecimento (Cérebro, Estrutura, Arquivos, Indicadores), Conexões (comunidade Vibe Makers, Telegram, Confiança). Áreas têm seção própria e acesso preservado.
- Identidade: áreas recebem cor estável derivada de sua chave, sem representar saúde. A mesma identidade aparece na navegação e no catálogo. Sistemas sem marca publicada recebem identidade; marcas reais permanecem intactas.
- Composição: Hoje em duas colunas de painéis compactos, proporção 1.55:1; dados e estados vazios preservados; uma coluna no celular. Catálogos usam largura disponível, leitura usa limite apropriado.
- Interação: foco, palette, seleção de área, tabelas, listas alinhadas à esquerda, drawer/Escape, Canvas e refresh continuam funcionais. Atualizações assíncronas não reposicionam o scroll; mudança de página começa no topo.
- Qualidade: temas claro/escuro, desktop e 390px sem overflow de página; screenshots sintéticas, revisão independente e provas de runtime antes de concluir.

## Execução

1. [x] Atualizar shell e navegação em `console/index.html`, comportamento de breadcrumb/scroll e identidades em `console/app.js`; compor Hoje em painéis. CSS em `console/styles.css`, apenas exceções necessárias em `console/experience.css`; tokens e inventário juntos.
2. [x] Executar auditoria de tokens, build, suites do Console afetadas e validação do produto. Validar no navegador com fixture sintética a barra durante rolagem, grupos, cores, páginas Hoje/Sistemas/Áreas/Arquivos/Canvas, palette e drawer, ambos os temas e celular.
3. [x] Revisão independente do diff e das capturas; corrigir achados materiais. Atualizar `DESIGN.md` e recibo de evidências. Commit convencional, merge/push main e disponibilizar na porta4782 preservando o root atual.

## Revisão final

Verificar: sidebar curta e longa; títulos e áreas com nomes extensos; mudança de página versus rerender assíncrono; drawer acima do shell; mobile com grupos colapsados e área selecionável; Canvas com altura útil; dados ausentes continuam ausentes. Parar apenas com aceite comprovado, build distribuído e versão final acessível no runtime local.

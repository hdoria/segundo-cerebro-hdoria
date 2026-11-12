# Notas com leitura formatada e edição visual

O usuário aprovou leitura formatada por padrão, edição explícita com Plate, salvar/cancelar no mesmo Markdown do vault e acesso secundário ao original. A referência é a clareza de uma página de notas, preservando o design atual React/shadcn do Console.

## Comportamento

- Abrir uma nota mostra texto formatado e propriedades existentes separadas; nenhuma gravação ao abrir.
- Editar ativa Plate com títulos, negrito/itálico, listas e tarefas, links, código e tabelas. Salvar é explícito; cancelar descarta somente o rascunho local.
- A nota permanece no mesmo `.md`: não criar banco de notas nem converter o vault para JSON/MDX.
- YAML, BOM, finais de linha, comentários (inclusive marcadores de IA) e wikilinks devem ser preservados. Abrir e salvar sem mudança não reescreve o arquivo. Construções sem suporte nunca podem sumir silenciosamente.
- Links internos permitem navegar quando o destino local é inequívoco; inexistência/ambiguidade recebe mensagem e nunca abre uma nota adivinhada.
- Conflito de versão bloqueia salvamento e mantém o rascunho. Caminhos privados, symlinks e os limites existentes continuam protegidos. Escrita exige sessão, mesma origem, CSRF e confirmação da ação Salvar.
- Ao sair com mudanças, confirmar descarte; enquanto salva, impedir navegação que perca o estado. Requisições atrasadas não podem alterar outra nota.
- Página/painel amplo, leitura confortável, claro/escuro, celular e teclado. Propriedades são somente leitura nesta etapa.

## Fora do escopo

IA na edição, colaboração, upload, novas notas, alterações de propriedades, migração de conteúdo e execução de rotinas. Não editar notas reais durante validação.

## Pronto

Conversão com fixtures fictícias provada; salvamento seguro e conflito testados; interface validada em desktop/celular e ambos os temas; revisão independente; main privada publicada e Console 4782 atualizado sem mudança nas notas reais.

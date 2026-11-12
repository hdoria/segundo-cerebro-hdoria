# Biblioteca de notas

Aprovado pelo Hugo no chat: menu do Console → biblioteca contextual → lista de notas → nota formatada, propriedades em modal e painéis adaptados à largura. React/shadcn compõem a navegação; Plate somente lê/edita as notas.

## Resultado

A vista `files` se apresenta como Biblioteca. Mantém o menu global e acrescenta tipos declarados, tags e pastas em uma lateral recolhível. A lista compacta mostra título, tipo, tags e modificação; busca por título e ordenação por título/modificação. Todas as notas percorre o acervo; Recentes ordena pela modificação observada do arquivo. Selecionar uma nota abre o Plate na área principal. Propriedades e relações já presentes no YAML abrem em Dialog sob demanda, somente leitura. Expandir leitura recolhe os painéis da biblioteca.

Desktop amplo apresenta lateral, lista e leitor simultaneamente. Em largura intermediária a lateral fica disponível por botão; no celular categorias, lista e nota são etapas com retorno claro. Menu global mantém seu controle de recolhimento. Cores dos tipos, tags e seleção vêm dos tokens existentes. Barra global continua fixa.

## Estado e integridade

- Categoria/busca/pasta/ordenação, seleção e scroll da lista sobrevivem a renderizações e retorno à Biblioteca durante a sessão. Nenhum corpo de nota vai ao armazenamento persistente do navegador.
- Troca de categoria, nota, área ou vista protege rascunho e bloqueia saída durante Save. Confirmação de descarte se vincula à revisão atual. Respostas atrasadas não substituem seleção nem rascunho novos.
- Save/Cancel, conflito, versão/hash, BOM/EOL/YAML, comentários e blocos protegidos mantêm os contratos já implementados. Nenhuma edição real do vault nos testes.
- Metadata listada deriva apenas de Markdown permitido pelo resolver atual. Tipos/tags/contagens não incluem privados, ocultos, credenciais ou symlinks. Sem snippets do corpo na lista. Limites de scan permanecem; resultado parcial se identifica como tal.
- Anexos binários não fazem parte deste lote; notas declaradas como Artifact podem aparecer por tipo. Sem upload, criação de nota, IA, novo banco, alteração de propriedades ou alterações em Sistemas/rotinas.

## Interface entre módulos

`listLocalFiles(root,{mode:'library',directory:'',query:'',area:'',type:'',tag:'',sort:'title'|'modified',offset:0,limit:50})`: modo library é recursivo, preserva modo legado por padrão. Retorna campos legados + `complete`, `facets:{types:[{value,count}],tags:[{value,count}],folders:[{ref,name,count}]}`, `files` com `tags` e `modified_at`. Facetas representam notas permitidas na área corrente, antes dos demais filtros. Sem cache persistente. HTTP GET existente aceita os novos parâmetros.

`mountLibraryWorkspace(host,{loadFiles,readNote,saveNote,resolveLink,confirmDiscard,onSnapshot,initialSnapshot,area})` retorna `{getActiveNote(),closeNote({force}),requestLeave(),openNote(ref),setArea(area),refresh(),getSnapshot(),dispose()}`. React controla toda a biblioteca. Cada sessão de nota usa createNoteSession e NoteWorkspace inline. Nenhuma dependência de drawer para seleção/leitura.

`NoteWorkspace` aceita `inline` para geometria da área principal e oferece propriedades por Dialog. Não implementa menus da biblioteca.

## Pronto

Fluxo synthetic desktop claro/escuro e celular verificado, filtros reais, navegação/wiki, propriedades, editar/salvar/cancelar/conflito; revisão independente, regressões, build/tokens/privacidade, commit/push main privada, CI e Console4782 atualizado. Vault real e julgamentos sem alterações causadas pela homologação.

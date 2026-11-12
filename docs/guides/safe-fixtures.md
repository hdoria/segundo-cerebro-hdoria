# Fixtures sem dados privados

Use nomes fictícios e dados gerados. Nunca copie nomes de clientes, transcrições,
contratos, credenciais ou conteúdo do cofre privado para testes. O guard verifica
tokens completos de uma lista de clientes conhecida, independentemente de caixa,
inclusive nos caminhos. A política guarda somente hashes SHA-256 dos tokens
normalizados em NFKC e minúsculas; hashes não tornam identificadores anônimos.

Depois de cada clone, execute:

```sh
npm run setup:hooks
npm run check:sensitive-data
```

O primeiro comando instala `core.hooksPath=.githooks` apenas no repositório atual;
o Git não instala hooks automaticamente ao clonar. O guard usa somente módulos
nativos do Node. A CI também executa a verificação. Para testar suas regressões,
rode `node scripts/test-sensitive-data.mjs`.

A verificação padrão lê arquivos rastreados do diretório de trabalho, incluindo
arquivos novos adicionados ao índice. Arquivos privados ignorados e arquivos não
rastreados ficam fora da leitura. Para verificar um snapshot já commitado, use
`node scripts/check-sensitive-data.mjs --ref HEAD`.

A CI busca todo o histórico e também executa `npm run check:sensitive-data --
--history HEAD`, que examina cada commit alcançável. Isso captura um vazamento
apagado antes do push mesmo quando o hook local foi desativado. O modo de histórico
recusa clones rasos. Ele foi feito para este novo repositório de histórico limpo,
sem os ancestrais da instalação anterior; o custo cresce com o total de snapshots.

O hook examina todos os refs locais enviados e cada commit novo, inclusive um
commit com segredo removido no commit seguinte. Exclusões de refs são permitidas.
Em branches novas, refs de acompanhamento do mesmo remoto delimitam o histórico
já publicado; sem essas refs, todo o histórico alcançável é examinado. Um erro de
leitura, base remota ausente ou submódulo impede o push. Diagnósticos mostram só
caminho, linha e regra; tokens protegidos também são ocultados nos caminhos.

Para testar a lista de nomes, injete hashes de palavras fictícias na função pura
`scanText`; não adicione nomes reais aos testes. Exemplos sintéticos de credenciais
devem ser montados durante o teste, nunca armazenados como valores completos.
Isso permite testar a detecção sem introduzir um segredo aparente no próprio teste.

Este guard cobre texto UTF-8, blocos de chave privada com corpo base64 de pelo menos
64 caracteres e delimitadores correspondentes, e formatos plausíveis de
tokens GitHub. Binários, texto em outras codificações, segredos genéricos e clientes
fora da política exigem revisão. A lista de hashes não substitui anonimização nem
revisão humana e não detecta dados de negócio arbitrários. Cabeçalhos isolados e
placeholders repetidos não são tratados como credenciais. Hooks podem ser desativados
localmente; o check de CI deve ser
obrigatório nas regras do repositório para bloquear integração sem aprovação.

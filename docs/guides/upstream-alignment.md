# Integração seletiva do upstream

Este fork está na versão `1.40.0`. A referência para a seleção é o repositório
`gabrielzucco/cerebro-inevita`, tag `v1.40.0`, commit
`c14c12ec968c2f4350267ec6527dacf313cd29a4`.

Depois da remoção da marca upstream, `.cerebro/upstream-baseline.json` e `.cerebro/source`
passaram a apontar para `hdoria/cerebro-hdoria-clean`. Este texto continua sendo o registro
histórico da seleção feita a partir do repositório upstream acima.

Os números têm funções diferentes. `VERSION` identifica esta versão do fork.
`.cerebro/upstream-baseline.json` registra a origem consultada e a seleção incorporada.
Esse registro não declara equivalência completa com a versão upstream.

## O que entrou

Já estavam incorporados antes deste lote:

- Comunidade via CLI e MCP, com catálogo, instalação e contribuição revisada pelo dono.
- Atualizador por tag explícita, prévia e hash aprovado, preservando contexto e alterações locais.
- Proteções da instalação e revisão de pacotes e contribuições, incluindo a verificação de segredos e dados pessoais.

Este lote acrescenta:

- Retomada de um Cérebro já existente na mesma raiz, sem abrir uma segunda instalação.
- Orientação do ciclo de ativação: um sprint, fonte real e evidência para cada etapa.
- Distinção entre credencial de instalação e e-mail de acesso, sem mudar o direito de recusar.
- Orientação para a primeira atualização segura e para runtime legado.
- Endpoints estáveis do proxy para ativação e recibos técnicos, mantendo os opt-outs.
- Caminhos portáveis, tratamento de CRLF e validação dos espelhos de skills sem caches Python.

O lote 1.38.0 acrescenta navegação e busca local por título no Console próprio,
leitura do registro canônico `.cerebro/metrics/definitions.json` e snapshots,
além de abertura simplificada e suíte nativa nos três sistemas. As áreas declaradas
no vault entram mesmo sem Sistemas, e a seleção abre seu contexto.

A interface de métricas do painel original permanece excluída; o Console deste fork
exibe o contrato de indicadores por uma superfície própria. O launcher também é
próprio e não instala o painel upstream. Nenhuma definição, medição ou fonte é criada
pelo adaptador.

O lote 1.39.0 adapta os avisos operacionais ao modelo de contratos e recibos
deste Console, com preferências locais de leitura. Também preserva os detalhes
de frações e atribuição dos indicadores e acrescenta a prova de instalação nova
e atualização do pacote completo. O painel original continua fora: os avisos são
reconstruídos das fontes canônicas, e apenas o estado lido/não lido é persistido.

O lote 1.40.0 substitui a apresentação pelo design system próprio baseado no
task-manager e adota React/shadcn/ui. Ele preserva o motor e a seleção upstream
anterior. A coincidência numérica com a tag upstream não representa equivalência.

Os IDs de `included` descrevem essas capacidades. Eles registram decisões de seleção;
os testes e recibos de execução continuam sendo evidências separadas.

## O que ficou fora

- `member-panel`: painel de membros do upstream.
- `cockpit-launcher`: launcher do cockpit do upstream.
- `metrics-ui`: interface de métricas do upstream.

O Console deste fork continua sendo a interface local. As instruções usam seu launcher
real e preservam o vault, os procedimentos aprovados e as proteções de acesso e de conteúdo.

## Como o Console lê o registro

A central de Atualizações lê a referência somente de `engineRoot`. Ela não usa o
registro do diretório privado de dados, não consulta a rede ao montar a central e não grava estado.

`motor.fork_version` mantém a versão do motor, também disponível em `motor.version`
para compatibilidade. `motor.upstream_baseline.status` tem três estados:

- `recorded`: metadados locais válidos com integração seletiva declarada.
- `missing`: arquivo ausente; referência não verificada.
- `invalid`: registro malformado ou fora do esquema; referência não verificada.

O esquema exige `schema_version: 1`, repositório no formato `dono/repo`, tag de release,
commit com 40 caracteres hexadecimais, `integration: "selective"` e as listas `included`
e `excluded`. O arquivo tem limite de 16 KiB; cada lista aceita até 32 IDs de até 80 caracteres.
Links simbólicos no registro ou em sua pasta são recusados.

Todos os estados retornam `runtime_verified: false`. A presença de metadados não prova
que uma capacidade foi executada nem que o fork tem todas as funcionalidades do upstream.
As versões do fork e do upstream não são comparadas para medir equivalência.

## Atualização continua manual

O canal continua vindo de `.cerebro/source`, com a autoridade que já tinha antes.
O registro upstream não escolhe o canal, não publica release e não muda permissões.
A consulta remota é manual e `motor.can_apply` continua `false` no Console.
Aplicar pelo atualizador exige tag explícita, prévia, hash aprovado e preservação dos
caminhos do dono. Nenhum conteúdo privado é enviado por esse registro.

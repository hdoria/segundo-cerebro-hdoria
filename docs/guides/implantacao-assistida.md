# Implantar o Cérebro com a ajuda de um agente

Este guia é para quem vai montar ou migrar o Cérebro com um agente de IA rodando no seu computador, sem precisar ser técnico. Leia antes da primeira ativação, ou quando for retomar uma implantação que ficou pela metade.

Você só precisa dizer, na conversa com o agente, uma destas frases:

- "prepare meu Cérebro" para começar.
- "continue de onde parei" para retomar.

O resto o agente conduz, e pede a sua aprovação antes de qualquer coisa que grave.

Se você quer o caminho mais curto, o [COMECE-AQUI](../../COMECE-AQUI.md) resume tudo e explica a atualização segura. Aqui está o detalhe das rotas.

## Como o Cérebro fica no seu computador

O Cérebro tem duas pastas:

- o **vault**, com as suas notas. É o que você abre no Tolaria ou no Obsidian e onde o agente trabalha.
- o **motor**, o código do produto, que fica ao lado e que você quase não toca.

A atualização do motor preserva o seu contexto. Ela é um trabalho diferente de organizar a empresa no Cérebro, e não migra nada do que você sabe sobre o negócio.

## Escolha o ponto de partida

O agente identifica a sua situação e, quando há mais de uma saída razoável, pergunta. São estas:

| Situação | O que acontece |
| --- | --- |
| Não tem nada instalado | Instala um Cérebro novo |
| Já tem um Cérebro instalado | Você escolhe: usar o existente, instalar um novo em pastas novas ou migrar |
| Tem um acervo artesanal (Obsidian ou pastas suas) | Auditoria só de leitura, depois migração com mapa |
| Já começou e parou | Retoma do ponto registrado |

Se existe um Cérebro e você não disse o que quer, o agente oferece os três caminhos: **usar o existente**, **instalar novo em pastas novas** ou **migrar**. Instalar novo nunca reaproveita pastas antigas.

### Instalação nova

O agente roda o instalador do pacote com uma tag publicada, que ele confere no repositório `hdoria/segundo-cerebro-hdoria`. Precisa ser uma tag explícita, como `vX.Y.Z`; nomes como `main` ou `latest` não valem. Requisito: Node 20 ou mais novo.

```bash
node PACOTE/scripts/install.mjs --tag vX.Y.Z --vault ~/Cerebro/notas
```

Sem `--apply`, é só uma prévia, e nada é gravado. Com `--apply`, instala. Se você não informar pastas, os padrões são `~/Cerebro/notas` e `~/Cerebro/motor`; ao passar só `--vault`, o motor vai ao lado. Para escolher as duas, use `--vault` e `--motor`. Um destino dentro de outra instalação é recusado (`destination-inside-installation`).

### Cérebro já instalado

Para trazer um Cérebro existente para a versão atual, use a skill `atualizar`. Ela mostra uma prévia, o hash do plano e os conflitos, e só aplica com a sua aprovação. Preserva a sua identidade, a credencial, o contexto da empresa e as suas personalizações, e conflitos impedem a aplicação.

Pelo terminal, a partir da raiz do vault:

```bash
node .cerebro/bin/cerebro.mjs update --tag vX.Y.Z
node .cerebro/bin/cerebro.mjs update --tag vX.Y.Z --apply --approve-plan HASH
```

Instalações antigas, de pasta única, usam `--root` no lugar. Se o vault perdeu o ponteiro para o motor (por clone ou porque o motor mudou de lugar), o `update.mjs` religa com `--vault`, `--motor`, `--tag` e `--link`, também com prévia e hash aprovado antes de gravar.

### Acervo artesanal

Se o seu acervo é um Obsidian ou pastas organizadas do seu jeito, ele não tem marcadores do Cérebro, e isso não é defeito. O atualizador não serve para esse caso. O caminho é:

1. a skill `auditar-cerebro` olha tudo em modo somente leitura e diz o que existe.
2. a skill `migrar-cerebro` classifica o conteúdo e mostra o **mapa antes de copiar**. A origem fica intacta, o destino é aprovado por você e a cópia deixa um recibo local.

Instruções e agentes antigos são examinados à parte do conteúdo do negócio, para que regras velhas não virem regras do seu Cérebro sem você ver.

### Retomada

Quando você diz "continue de onde parei", o agente lê o registro em `operacao/decisoes-pendentes/onboarding.md`. É um arquivo simples com as decisões tomadas e as referências do que já foi feito. Ele nunca guarda credenciais nem conteúdo privado. Se o arquivo não existe, o agente pergunta onde você parou.

## O que o agente faz sozinho e o que pede a você

Faz sozinho, sem gravar nada no seu vault: ler, listar, auditar, mostrar prévias e propor.

Pede aprovação antes de gravar: instalar, atualizar, migrar, registrar uma fonte, vincular a conta e conectar a comunidade. Em instalação e atualização, a aprovação vem em três partes: a prévia, o hash do plano e a resolução dos conflitos.

## Prove cada etapa, uma de cada vez

Instalar, vincular a conta, registrar uma fonte, usar uma fonte e conectar a comunidade são coisas diferentes, e uma não prova a outra. Ter o Cérebro instalado não quer dizer que a conta está vinculada, e uma fonte registrada não quer dizer que ela foi usada.

### Cérebro Base

O primeiro objetivo é o **Cérebro Base**. Ele se ativa pelo uso: o agente orienta o mapa da empresa, registra fontes, usa uma fonte em um trabalho real e prova que o contexto aprovado volta a ser usado numa segunda tarefa. Só depois dessa segunda tarefa reutilizar o contexto, e com a sua confirmação, a implantação avança de nível. Antes disso, o que existe é um diagnóstico, não uma implantação completa.

### Fontes

Uma fonte passa por quatro estados, e cada um prova algo diferente:

| Estado | Prova |
| --- | --- |
| Fonte identificada | Ela existe e você sabe onde encontrá-la |
| Contrato definido | Está escrito o que ela traz, quem é o dono e como se usa |
| Acesso testado | O agente conseguiu mesmo ler a fonte |
| Fonte usada | Um trabalho real aproveitou o conteúdo dela e deixou recibo |

No primeiro trabalho, uma fonte manual basta. Automatizar exige um conector, uma rotina e evidência de que funciona.

Para registrar uma fonte para leitura manual, sem copiar nada:

```bash
node .cerebro/bin/cerebro.mjs register-source --path CAMINHO --type TIPO --label NOME --scope ESCOPO --confirm
```

Isso grava em `conexoes/configuradas/fontes.json`. Para evoluir uma fonte registrada até um contrato, use `source-contract migrate-registry` e depois `source-contract validate`. Ligar uma fonte a um sistema usa `system-source-binding plan` e depois `system-source-binding bind`. Quando o agente lê uma fonte local, a garantia registrada é `receipt-audited`.

## Vincular a conta

O vínculo liga esta instalação à sua conta na comunidade Vibe Makers. Ele é feito pela ativação: a plataforma entrega o código, e o agente roda:

```bash
node .cerebro/bin/cerebro.mjs activate --claim=CODIGO --runtime=claude-code
```

O `--runtime` aceita `claude-code`, `codex`, `gemini-cli`, `antigravity` e `outro`. A ativação cria, no vault, `.cerebro/id` e `.cerebro/install-credential`. E-mail, clone de pasta e arquivos copiados não comprovam o vínculo.

O agente só oferece o vínculo depois da primeira entrega útil. Se você registra o e-mail, ele fica em `.cerebro/acesso-email`; se recusa, em `.cerebro/acesso-dispensado`. Com a telemetria desligada, a ativação devolve `activation_local_only` e não fala com a plataforma. Tudo isso é opcional: o trabalho local segue sem vínculo.

## A comunidade vem depois

A conexão com a comunidade pelo MCP é a etapa seguinte à entrega local, e nunca um pré-requisito. Quando chegar a hora, siga [Conectar](community-mcp.md#conectar). Sem conexão, você ainda consulta o catálogo pelo terminal: `node .cerebro/bin/cerebro.mjs community list`.

### Que sistema faz sentido

Ao recomendar um sistema, o agente separa quatro coisas, para não prometer o que não existe:

- **instalado**: já está no seu vault.
- **release acessível agora**: dá para instalar hoje.
- **piloto assistido**: existe, mas em fase de teste e com acompanhamento.
- **proposta sem pacote**: é só uma ideia, sem nada instalável.

Aparecer na vitrine da comunidade não prova que o sistema está disponível para você.

## Quando algo trava

- **Node antigo:** instale o Node 20 ou mais novo.
- **Destino recusado:** escolha uma pasta fora de qualquer instalação.
- **Conflito na atualização:** o plano para; resolva e peça a prévia de novo.
- **Perdeu o ponteiro do motor:** use o `--link` descrito acima.
- **Não sabe em que passo está:** diga "continue de onde parei" e o agente lê o registro de retomada.

Os detalhes de sistemas da comunidade, com o terminal, ficam no [guia de sistemas](community-systems.md).

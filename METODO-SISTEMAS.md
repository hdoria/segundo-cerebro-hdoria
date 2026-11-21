# Sistemas: o trabalho que repete vira resultado com contrato

Tem um trabalho no seu negócio que volta toda semana e sai diferente cada vez. Você já tentou
resolver com prompt salvo, com pasta de modelos, com uma automação que dispara e ninguém olha. O
trabalho continua voltando, e a qualidade continua dependendo de quem pegou.

Sistema é o pacote que entrega esse resultado recorrente com contrato, régua e recibo. Aqui está
como você monta um. As skills `/arquiteto` e `/sistematizar` seguem este texto, e você volta nele
quando quer conferir se o que montou está de pé.

O exemplo que atravessa o texto é sintético: um escritório de projetos de iluminação que
recebe cerca de 30 pedidos de orçamento por mês. Hoje o orçamento sai em 6 dias, o preço vem de uma
planilha que às vezes está velha, e o financeiro refaz uma conta em quase metade dos casos. Esse é o
trabalho que vai virar Sistema aqui.

---

## Cérebro e Sistema fazem coisas diferentes

O Cérebro da empresa é a memória que serve vários resultados. Ele guarda mapa, decisões, números,
dores, objeções e o que já funcionou, sempre com evidência citável. O valor dele é a continuidade: o
operador pode trocar e o contexto fica.

O Sistema entrega uma coisa inteira, de ponta a ponta, toda vez que o trabalho volta. Ele tem
entrada real, pipeline com estados, régua de aceitação, decisão humana nomeada e recibo de cada
execução. O Cérebro preserva. O Sistema produz.

Um Sistema nasce dentro de um Cérebro ativado e usa o contexto dele. Sem Cérebro, o Sistema volta a
depender da cabeça de quem opera, e você perde a prova de por que o output ficou daquele jeito.

**Pré-requisito real:** o comissionamento exige a Ativação do Cérebro Base, o marco T4, que acontece
quando uma segunda tarefa real reutiliza o contexto já aprovado e o dono confirma que não precisou
explicar tudo de novo. Antes disso, `/arquiteto` e `/sistematizar` diagnosticam e propõem, e o
script recusa instalar.

---

## O que conta como Sistema

Três coisas comuns parecem Sistema e não são.

Pasta de prompts. Ela guarda texto. Ela não tem resultado declarado, estado, gate nem recibo, então
duas pessoas usam o mesmo prompt e chegam a lugares diferentes sem que ninguém saiba onde divergiu.

Agente com ferramentas. Ele executa. Ele não carrega o contrato do resultado nem a memória do que
já foi aprovado, e cada execução começa do zero.

Automação isolada. Ela dispara no horário. Ela não avalia o próprio output, não registra o que
produziu e não escala para um humano quando a entrada muda de forma.

Use o teste curto. O resultado falhou ontem. Você sabe onde achar a causa (qual estado, qual fonte,
qual gate) e qual é a menor mudança a fazer? Se a resposta é não, o que você tem é trabalho
organizado. Um Sistema responde essa pergunta abrindo um arquivo.

Resultado vago também derruba o teste. "Usar IA no comercial", "organizar os dados" e "automatizar o
atendimento" não são resultados. No exemplo do escritório, o resultado é "orçamento enviado em 1 dia
útil, com escopo conferido e preço da tabela vigente". Dá pra olhar e dizer se saiu.

---

## O contrato do resultado

Antes de qualquer ferramenta, preencha cinco campos. Eles são os mesmos de
[`templates/sistema/`](templates/sistema/) e os mesmos que o scaffold grava no `manifest.md`.

| Campo | O que você escreve | No exemplo |
|---|---|---|
| resultado | o que passa a sair pronto, em uma frase | orçamento enviado em 1 dia útil, escopo conferido e preço da tabela vigente |
| não-sucesso | o que alguém poderia chamar de sucesso e não conta | PDF bem formatado com preço que o financeiro refaz depois |
| output verificável | o artefato ou a mudança que dá pra abrir e checar | o orçamento enviado, com a referência da linha de preço usada |
| dono | o papel responsável pelo resultado, não o nome da pessoa | responsável comercial |
| setpoint | a condição mínima pra aceitar a saída | preço bate com a tabela da semana e o escopo cita o pedido do cliente |

Escreva nas palavras do dono. Se ele não consegue dizer o que não seria sucesso, o resultado ainda
está vago e a régua vai nascer frouxa.

---

## Os dois ciclos

O ciclo do Cérebro gira em volta da memória: capturar o que chega, destilar em átomo com evidência,
conectar leve e recuperar citando. Ele está escrito em [`METODO.md`](METODO.md), com a versão longa
em [`METODO-COMPLETO.md`](METODO-COMPLETO.md) pra quem quer o detalhe.

O ciclo do Sistema gira em volta de uma execução:

```text
resultado → Sistema → pipeline → execução → Recibo → Eval → Feedback → mudança aprovada → nova versão
```

Os dois são aninhados. O Sistema puxa contexto do Cérebro pra executar, e devolve ao Cérebro o que
aprendeu em cada Run. Quando a mudança que você quer testar tem incerteza relevante (você não sabe
se melhora), ela sai do ciclo normal e vira Experimento pré-registrado, e aí vale o protocolo de [`METODO-EXPERIMENTOS.md`](METODO-EXPERIMENTOS.md).

---

## As oito unidades do contrato

O contrato de um Sistema se escreve em oito peças. Cada uma tem contrato próprio e nenhuma cobre o
buraco da outra.

| Unidade | Função | O que ela não substitui |
|---|---|---|
| Sistema | o resultado recorrente, com versão e dono | memória do Cérebro |
| Pipeline | os estados por onde o trabalho passa, com entrada, saída e Gate | lista de tarefas |
| Rotina | o gatilho e a política de execução | o resultado, que a Rotina nunca redefine |
| Skill | o julgamento reutilizável, com entrada, saída, regras e exemplos aprovados | contrato do Sistema |
| Conexão | a interface fina com uma fonte ou ferramenta | o Sistema, porque conectar não cria resultado |
| Gate | o critério verificável que decide se a etapa segue | julgamento humano |
| Eval | a régua que diz se o output serve | opinião depois do fato |
| Feedback | a correção humana ligada a Run e versão | mudança automática no motor |

Duas peças atravessam as oito. O Output é o artefato que o trabalho produziu. O Recibo é a prova de
como ele foi produzido, com referências em vez de conteúdo. Toda unidade aparece no Recibo: qual
estado passou, qual Gate reprovou, qual versão da Skill rodou, qual decisão humana fechou.

### Peças vizinhas que você vai ouvir no caminho

| Termo | Função | O que ele não substitui |
|---|---|---|
| Capability | o know-how portátil da Skill, ainda sem nada da sua empresa dentro | a CONFIGURAÇÃO privada |
| Agente | o executor movido por modelo | a memória do Cérebro nem o Sistema |
| Entidade | o identificador opaco que costura o caminho do cliente entre Sistemas | a fonte de verdade, que continua onde sempre esteve |
| Run | uma execução identificada, com Recibo próprio | o resultado de negócio |
| Experimento | a mudança controlada com critério congelado antes do dado | o Eval do dia a dia |
| System Pack | o pacote distribuível, com motor versionado, configuração local, evals, instrução e rollback | a prova de que funciona na sua operação |

---

## Fontes com fronteira

Uma fonte entra no Sistema por papel, e cada papel pede seis respostas.

- **propósito:** o que essa fonte sustenta nesse trabalho
- **fonte de verdade:** onde o dado canônico mora, que não muda por causa do Sistema
- **acesso:** como se lê, com qual permissão, por quanto tempo
- **responsável:** quem responde por ela dentro da empresa
- **frescor:** quando foi confirmada pela última vez, e de quanto em quanto tempo envelhece
- **fronteira:** o que permanece na sua máquina, o que pode virar derivado e o que é proibido enviar

No exemplo, a tabela de preços é a fonte de verdade do valor, o responsável é o financeiro, o frescor
é semanal, e a fronteira diz que o PDF enviado ao cliente pode citar o preço mas nunca a margem.

**Registrar fonte não é conectar fonte.** Você pode declarar casa, finalidade, responsável e lacuna
sem abrir uma linha de conteúdo. Conexão recorrente nasce depois que o Run manual provou que ela é
necessária. O Access Grant é a concessão local que autoriza sujeito, fontes, Sistemas, ações e
prazo, e o Access Receipt registra allow, deny, falha, revogação ou degradação sem copiar conteúdo.

Quando um pacote publicado pede papéis que a sua instalação ainda não cumpre, o diagnóstico de
compatibilidade em `scripts/installation-compatibility.mjs` devolve o estado honesto da amarração
(`missing-source`, `needs-mapping`, `awaiting-approval`, `degraded`, `incompatible` ou `ready`) sem
abrir as fontes.

A régua de refino de cada fonte está em [`FONTES.md`](FONTES.md). Parar no ponteiro é saída legítima.

---

## O pipeline

Pipeline é a lista de estados por onde o trabalho passa. Cada estado diz o que recebe, o que
devolve e qual Gate confere a passagem. Um estado sem Gate é desenho bonito que não barra nada.

| Estado | O que chega | O que sai | Gate |
|---|---|---|---|
| recebido | pedido do cliente com escopo bruto | pedido registrado com identificador | o pedido tem cliente, prazo e o que ele quer |
| orçado | pedido registrado | rascunho com itens e preço | todo item aponta a linha da tabela vigente |
| conferido | rascunho | rascunho com escopo revisado | nenhuma afirmação de preço sem referência |
| aprovado | rascunho conferido | orçamento liberado | o responsável comercial disse que enviaria assim |
| enviado | orçamento liberado | orçamento na mão do cliente | registro de envio existe |
| medido | orçamento enviado | leitura do resultado | prazo e retrabalho do financeiro anotados |

Além dos estados, escreva as quatro transições que o desenho normal esconde.

- **avança quando:** o Gate do estado passou
- **volta quando:** o item não tem referência de preço, ou o escopo não cita o pedido
- **para e escala quando:** o cliente pede algo fora da tabela, ou a tabela está vencida
- **exceção conhecida:** pedido de cliente antigo com desconto contratado, que sempre vai pro humano

Toda execução carrega um identificador. O Run Record é o recibo estruturado dela, e o ledger local
em `.cerebro/ledger/runs.jsonl` acumula as execuções. Output, resultado do Eval, decisão humana e
correção entram ali como referência, nunca como conteúdo copiado. O estado do pacote vive em
`.cerebro/sistemas/<id>.json`, e o contrato registrado no control plane fica em
`.cerebro/contracts/<id>.json`. O Run Record V2 acrescenta o Context Snapshot, a lista exata do que
foi selecionado por referência, e o System Contract V2 acrescenta o Retrieval Contract. O executor
só por arquivos recusa um contrato V2 sem snapshot completo, porque fingir o recibo seria pior que
falhar.

---

## A régua: Eval em duas camadas

A régua tem quatro peças, e elas vêm antes da primeira execução.

| Peça | O que é | No exemplo |
|---|---|---|
| Sensor | de onde o número é lido | data do pedido e data do envio, mais os retrabalhos anotados pelo financeiro |
| Métrica | o que é contado | dias até o envio, e quantos orçamentos o financeiro refaz |
| Baseline | o valor de hoje, antes de mexer | 6 dias, 4 retrabalhos em 10 orçamentos |
| Setpoint | a condição mínima aceitável | 1 dia útil, no máximo 1 retrabalho em 10 |

Baseline honesto vale mais que número bonito. Se você não mediu, escreva `nao-medido` e siga.

A primeira camada do Eval é determinística. Gate é regra objetiva, do tipo que uma máquina confere
sem discutir: a fonte está acessível e autorizada, a versão foi registrada, os campos obrigatórios
existem, a evidência e a proveniência ficaram preservadas, nenhuma escrita externa aconteceu sem
aprovação. Regra inviolável vira código. Instrução boa o modelo contorna num dia ruim. Gate não.

A segunda camada é humana, e tem uma pergunta escrita:

> Você usaria isso do jeito que está, ou mudaria alguma coisa antes?

As respostas são três e cada uma tem consequência: aprovado, mudanças pedidas, rejeitado. "Mudanças
pedidas" vira correção concreta, aplicada uma vez e comparada com o output anterior.

Dois exemplos sustentam a régua. O Golden pattern é um caso aprovado que mostra como o output bom se
parece. O Golden set é a coleção de casos bons, ruins e de limite, que você usa quando quer saber se
uma mudança melhorou de verdade ou só agradou no caso fácil.

### O que continua humano

A IA organiza evidência e opções; o humano dá o martelo.

Oito decisões ficam do lado humano por desenho, não por falta de capacidade técnica: gosto,
consentimento, gasto, prioridade, fronteira do dado, publicação, promessa feita a um cliente e
mudança no motor. Um Sistema que decide qualquer uma dessas sozinho está quebrado, mesmo quando
acerta.

---

## Rotina: quando o relógio entra

Rotina declara gatilho e política de execução. Ela nunca redefine o resultado.

O gatilho é `manual` ou `schedule`. Agenda aceita cadência `daily`, `weekly` ou `monthly`, com
horário no formato `HH:MM` e fuso declarado. A lista `weekdays` existe só na cadência semanal, e
`month_days` (de 1 a 28) só na mensal, pra não inventar dia 31 em fevereiro.

A ordem é dura e existe por um motivo. Pra ligar a agenda, você precisa de um Run manual já
concluído na mesma versão da Rotina, mais o contrato aprovado por você. Rotina só manual não ativa.
Pausar põe a Rotina em `paused` e impede que a próxima ocorrência aconteça. O que já rodou continua
registrado do jeito que foi. Rotina importada de
agenda legada (cron, launchd, Actions, cliente de IA) nasce desativada, e ativar falha enquanto o
dono não registrar que pausou a agenda antiga, porque dois relógios tocando no mesmo trabalho é pior
que nenhum.

Automatizar também não valida nada. A agenda repete o que o Run manual já provou, e o Sistema
continua na mesma maturidade de antes.

O worker chama a assinatura que você já paga. Só os clientes oficiais `codex` e `claude`, já
autenticados por você na própria máquina. O prompt entra por stdin, nunca na linha de comando. O
Executor Binding guarda `auth.type = provider-session` e nunca OAuth, token ou chave de API. Cada
tentativa gera um Routine Run Receipt privado, com status e razão, sem prompt, sem output e sem erro
cru.

```bash
node .cerebro/bin/cerebro.mjs routine-runtime install caminho/routine-contract.json --confirm
node .cerebro/bin/cerebro.mjs routine-runtime run <routine-id> --confirm
node .cerebro/bin/cerebro.mjs routine-runtime activate <routine-id> \
  --evidence=routine-receipt:RECIBO --approved-by=role-owner --confirm
```

---

## A primeira versão em oito passos

1. **Escolha o resultado.** Um só, que volte sempre, dentro de decisão, venda ou entrega. Se você
   tem vários candidatos, use `/arquiteto`: ele organiza o que foi declarado, observa a menor fonte
   útil, mostra o Estado do mapa (de V0 declarado a V3 validado) e propõe até três oportunidades
   pra você confirmar.
2. **Preencha o contrato.** Os cinco campos, nas palavras do dono.
3. **Observe um caso real.** Um rastro recente, com autorização. Separe o que foi declarado, o que o
   caso sustenta e o que ainda não está provado. Não ingira o CRM inteiro pra isso.
4. **Desenhe o pipeline do jeito que o trabalho acontece hoje**, com retornos, exceções e os
   remendos manuais que ninguém documenta. O desenho ideal vem depois.
5. **Escreva a régua antes de rodar.** Sensor, Métrica, Baseline, Setpoint, gates determinísticos e a
   pergunta humana.
6. **Rode manual, uma vez, ponta a ponta.** Você no teclado, com entidade, fonte, output, Eval e
   decisão humana registrados. A primeira versão prova o contrato antes de ganhar automação.
7. **Registre o Feedback.** O que você corrigiu na mão, em qual camada, e o que deveria mudar na
   próxima execução.
8. **Repita antes de sofisticar.** Três execuções comparáveis mostram padrão. Uma mostra
   coincidência.

Conexão, agenda, skill especializada e escrita externa entram depois do passo 8, uma por vez, cada
uma com aprovação própria.

---

## O que o `/sistematizar` gera

Peça assim ao agente:

```text
Use /sistematizar. O resultado é <frase do dono>. O caso observado é <referência relativa>.
Monte contrato, pipeline, fontes e régua do jeito que o trabalho acontece hoje, me mostre em
linguagem simples e espere minha aprovação antes de instalar qualquer coisa.
```

Sem a aprovação, a skill corrige o spec e não usa `--confirm`. Com a aprovação, o comando grava o
pacote:

```bash
node .cerebro/bin/cerebro.mjs commission-system \
  operacao/arquitetura/<arquivo>.commissioning-spec.json --confirm
```

O pacote fica em `sistemas/outros-instalados/<system-id>/` com dez arquivos, nesta ordem de papel:
`manifest.md` (a vista humana do contrato), `capability.json` (o que é portátil, sem contexto
privado), `contract.json` (o envelope local legível por máquina), `configuracao.md` (a CONFIGURAÇÃO
privada), `pipeline.md`, `rotinas.md`, `skill-contract.md`, `evals.md`, `feedback.md` e
`changelog.md`.

O comissionamento é conservador de propósito. Ele valida spec e contratos, exige T4 e evidência
local, varre PII óbvia, grava `configuracao.md` e `feedback.md` em modo 0600, registra o contrato no
control plane, atualiza o catálogo local, deixa o estado em `configuring` com
`connected_sources: 0`, e escreve um recibo em `operacao/execucoes/`. Sem `--confirm`, ele imprime a
prévia e não cria arquivo. Se o pacote já existe, ele recusa: comissionamento nunca sobrescreve
pacote local.

O próximo passo é único:

```bash
/operar <system-id>
```

Os comandos do motor que você vai usar daqui pra frente, sempre pelo lançador do vault:

| Comando | Ações |
|---|---|
| `system-contract` | validate, register (exige `--confirm`), show |
| `system-run` | show, start, complete, confirm-value |
| `system-state` | mostra e move o estado local do pacote |
| `system-learn` | propose, promote, show |
| `entity` | register (exige `--type`, `--source-id`, `--key-file` e `--confirm`) e journey |
| `routine-runtime` | install, binding, run, activate, pause, due, tick, status |
| `source-contract` e `system-source-binding` | declaram a Fonte e a amarram ao papel do Sistema |
| `commission-system` | cria o pacote local a partir do spec aprovado |

A chave externa da Entidade nunca é gravada em claro. O que fica é o identificador opaco, e é ele
que costura o mesmo cliente entre o Sistema de venda e o de entrega sem duplicar o dado canônico.

Quando o Node não estiver disponível, escreva os mesmos arquivos à mão seguindo
[`templates/sistema/`](templates/sistema/) e valide campo por campo. Script não pode bloquear
entrega. Falta de T4 ou de evidência, sim.

E quando quiser conferir um envelope antes de confiar nele, use o validador do protocolo:

```bash
node scripts/protocol-validate.mjs source protocol/examples/source-contract.v1.json
node scripts/protocol-validate.mjs system protocol/examples/system-contract.v2.json
node scripts/protocol-validate.mjs run protocol/examples/run-record.v2.json
node scripts/protocol-validate.mjs grant protocol/examples/access-grant.v1.json
node scripts/protocol-validate.mjs receipt protocol/examples/access-receipt.v1.json
node scripts/protocol-validate.mjs routine protocol/examples/routine-contract.v1.json
```

---

## Como o Sistema amadurece: três camadas separadas

Muita confusão vem de empilhar três réguas diferentes na mesma palavra. Elas medem coisas distintas
e têm provas distintas.

### 1. Estado local do pacote

É o que o seu Cérebro sabe sobre aquele pacote, nesta máquina. Cinco valores:

| Estado | Significa |
|---|---|
| `package_added` | o pacote chegou, nada foi configurado |
| `configuring` | contrato e CONFIGURAÇÃO em construção, zero fontes conectadas |
| `first_run` | a primeira execução começou |
| `active` | rodou com Eval aprovado e o dono confirmou o primeiro valor |
| `needs_attention` | o último Run falhou na régua ou foi rejeitado |

Um Run completo com Eval aprovado e decisão aprovada leva o pacote pra `active`. Qualquer outra
combinação leva pra `needs_attention`. E `active` tem uma trava a mais: ele exige o primeiro valor
confirmado, que só existe quando o dono diz que usaria ou usou o output na operação real. Run
aprovado sozinho não é valor, e `confirm-value` só roda com o pacote em `active`.

### 2. Maturidade de catálogo

É o que o catálogo em [`sistemas/_CATALOGO.md`](sistemas/_CATALOGO.md) declara sobre o Sistema como
produto: **instalado** (disponível neste Cérebro), **beta** (executável, ainda acumulando casos e
correções), **validado** (o mesmo resultado voltou a sair, passando na régua, em casos reais) e
**publicado** (já tem versão, instrução e rollback pra sair daqui e rodar em outro Cérebro).

Primeiro Run aprovado deixa o pacote `active` e o Sistema ainda **beta**. Instalação, primeiro run
aprovado e validação são três provas diferentes, e nenhuma implica a outra.

### 3. Publicação

É a camada de distribuição, e vive no release manifest. O canal é `pilot` ou `stable`. O status da
publicação é `pilot`, `published` ou `withdrawn`. A visibilidade no catálogo é `validation-lab`,
`validated` ou `hidden`.

`validated` tem exigência dura: ciclos reais cumpridos, Cérebros distintos, uso repetido, Eval
passado e aprovação humana. Um piloto nunca aparece como `validated`, mesmo que o pacote esteja
pronto e bonito.

---

## Feedback e Self Improvement

Feedback útil liga cinco coisas: a execução, a versão do Sistema, o output avaliado, a correção
humana concreta e o efeito esperado na próxima execução. Correção sem Run e sem versão é desabafo, e
não dá pra testar depois.

Uma correção isolada fica local, no `feedback.md` do pacote. Quando o mesmo problema reaparece em
casos comparáveis, ele habilita uma mudança pequena no motor, pelo caminho do Self Improvement:

1. **Feedback** registrado com `run-id`, versão e camada afetada. As camadas aceitas são
   `configuration`, `pipeline`, `routine`, `capability`, `gate`, `eval` e `golden-set`.
2. **Menor mudança** proposta, uma só.
3. **Replay** nos casos anteriores.
4. **Comparação** com o output antigo, olhando também os casos ruins e de limite.
5. **Aprovação** humana explícita.
6. **Versão** nova com rollback escrito.
7. **Nova medição** contra o Baseline.

O contador é literal. Cada correção comparável vira candidato e aparece como `1/3`, `2/3`, `3/3`.
Promover exige as três ocorrências, ao menos três execuções de replay, a aprovação humana e uma
versão maior que a anterior. Se a mudança piorar qualquer caso importante, o motor fica como está e
você registra a exceção.

```bash
node .cerebro/bin/cerebro.mjs system-learn <system-id> propose \
  --run-id=<run> --layer=eval --correction-ref=<caminho> --confirm
node .cerebro/bin/cerebro.mjs system-learn <system-id> promote \
  --candidate-id=<id> --replay-run=<a> --replay-run=<b> --replay-run=<c> \
  --target-version=0.2.0 --rollback-ref=<caminho> --approved --confirm
```

No exemplo do escritório, a correção "sempre citar a data da tabela de preço no orçamento" apareceu
em três Runs diferentes. Aí ela virou Gate na camada `gate`, com replay nos três casos e aprovação
do responsável comercial. Antes de três, ela era uma anotação no `feedback.md`.

### Onde entra o Experimento

Quando você não sabe se a mudança melhora, ela entra como Experimento:
critério congelado antes do dado, braços declarados, guardrail, janela e regra de decisão escritas
antes de olhar o resultado. O pré-registro, a leitura diária e o martelo final moram todos em
[`METODO-EXPERIMENTOS.md`](METODO-EXPERIMENTOS.md), que devolve pra cá na seção sobre onde o
Experimento mora.

---

## Motor compartilhável × configuração privada

Um Sistema local é a soma de seis coisas: a Capability, o contexto da sua empresa, os bindings de
fonte e de executor, as permissões, o Eval e a memória de Feedback. Dessas seis, duas metades
viajam de forma diferente.

O motor é compartilhável. Capability, pipeline, gates, estrutura do Eval, Golden pattern genérico,
instrução da Skill, versão e rollback. Isso é método, e método circula sem expor ninguém.

A configuração é privada. Fontes reais, nomes de cliente, tabela de preço, vocabulário da casa,
exceções conhecidas, Baseline, Feedback e decisões. Isso mora na sua máquina, com
`configuracao.md` e `feedback.md` em modo 0600 e fora do Git.

O protocolo comum existe pra que Sistemas diferentes convivam sem virar bagunça. Ele padroniza o
envelope das bordas: `system_id`, versão, resultado, Entidades, fontes, Capability, permissões, Eval
e política de aprendizado. O conteúdo interno continua livre e privado. Os envelopes carregam IDs,
referências locais e marcadores de versão e frescor, nunca o conteúdo em si. Um Run Record aponta
pro output, nunca copia o output. Os esquemas estão em [`protocol/`](protocol/) e a descrição do
invariante em [`protocol/README.md`](protocol/README.md).

O método circula. Os dados não.

### Telemetria técnica, e como desligar

A telemetria técnica do Cérebro leva recibo de uso. Conteúdo nunca sai. Para Sistemas, os eventos são
`system_installed`, `system_first_run`, `system_run_completed` e `system_value_confirmed`.

O que vai: nome do evento, `install_id`, versão, sistema operacional, runtime, e o e-mail de acesso
ou `member_id` quando você configurou algum dos dois. Para Sistemas, identificadores opacos, versão,
resultado do Eval e a decisão humana em forma categórica (aprovado, mudanças pedidas, rejeitado).

O que nunca vai: fonte, output, caminho de arquivo, texto, erro cru e o teor da decisão. O destino
padrão é `https://cerebro.vibemakers.com.br`.

Pra desligar, crie o arquivo `.cerebro/sem-telemetria` ou exporte `CEREBRO_TELEMETRY=off`. O trabalho
local continua igual, e falha de telemetria nunca interrompe uma execução.

---

## O que é aberto e o que a comunidade acrescenta

O método é aberto. Este documento, o glossário, o protocolo, os esquemas e os modelos em
[`templates/sistema/`](templates/sistema/) ficam disponíveis pra qualquer pessoa montar o Sistema
dela com as próprias mãos.

A comunidade Vibe Makers acrescenta quatro coisas, e o catálogo delas chega em
`<motor>/comunidade/vibe-makers/`:

- **System Packs** prontos, com motor versionado, evals, instrução de instalação e rollback
- **Golden patterns de operadores**, casos aprovados por gente que rodou o trabalho de verdade
- **Laboratórios**, onde um pacote em piloto acumula ciclos reais antes de virar `validated`
- **Releases versionados**, com canal, status de publicação e visibilidade declarados

Linha em roadmap não é inventário. Presença no catálogo não é pacote instalado. Pacote instalado não
é resultado validado na sua operação.

A direção contrária é a Contribuição, e ela tem três consentimentos separados: preparar o rascunho,
aprovar o conteúdo anonimizado e enviar. PII, conteúdo bruto, segredo, nome de cliente e número
identificável bloqueiam a Contribuição. Na dúvida, não prepare.

---

## Checklist de saída

Antes de considerar o Sistema pronto pra operar, confira item por item. Cada um é verificável
abrindo um arquivo.

- [ ] o contrato tem os cinco campos preenchidos, nas palavras do dono
- [ ] existe um caso real observado, com referência relativa e sem caminho absoluto
- [ ] cada fonte declara propósito, fonte de verdade, acesso, responsável, frescor e fronteira
- [ ] o pipeline diz o que faz avançar, o que faz voltar e o que faz parar e escalar
- [ ] os gates determinísticos são conferíveis sem opinião
- [ ] a régua humana tem uma pergunta de aprovação escrita, com as três respostas possíveis
- [ ] Sensor, Métrica e Setpoint existem, e o Baseline tem valor ou a palavra `nao-medido`
- [ ] a Rotina inicial é manual, com gatilho real descrito
- [ ] as oito decisões humanas estão nomeadas no contrato
- [ ] o pacote gravou os dez arquivos em `sistemas/outros-instalados/<system-id>/`
- [ ] `configuracao.md` e `feedback.md` estão em modo 0600 e fora do Git
- [ ] o estado local é `configuring` e `connected_sources` é zero
- [ ] o primeiro Run fechou com Recibo, Eval e decisão humana registrados
- [ ] o `changelog.md` tem a versão inicial e o rollback escrito

Faltou um? Volte nele antes de conectar qualquer coisa. Sistema com buraco na régua automatiza o
erro mais rápido.

---

## Para onde ir depois

- o ciclo do Cérebro: [`METODO.md`](METODO.md) e [`METODO-COMPLETO.md`](METODO-COMPLETO.md)
- mudança controlada: [`METODO-EXPERIMENTOS.md`](METODO-EXPERIMENTOS.md) com o modelo em [`templates/experimento.md`](templates/experimento.md)
- [`templates/sistema/`](templates/sistema/) para os modelos em branco e o caminho manual
- [`protocol/`](protocol/) e [`protocol/README.md`](protocol/README.md) para os envelopes
- [`FONTES.md`](FONTES.md) para a régua de refino das fontes
- [`GLOSSARIO.md`](GLOSSARIO.md) para os termos da casa, uma linha cada
- [`sistemas/_CATALOGO.md`](sistemas/_CATALOGO.md) para o que já está instalado
- skills: `/comecar` para a Ativação do Cérebro Base, `/arquiteto` para escolher o resultado,
  `/sistematizar` para a Sistematização do trabalho observado, `/operar <system-id>` para executar

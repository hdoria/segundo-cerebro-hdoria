# Método de Experimentos

Seu Sistema roda. Depois de alguns runs aprovados você já tem uma ideia de melhoria e a vontade de
ligar ela hoje mesmo. Aí você muda três coisas na mesma semana, vê um número melhorar, chama isso de
causa e segue em frente com uma crença que ninguém consegue conferir depois.

Experimento é o jeito de mudar um Sistema sem perder o direito de confiar na leitura do resultado.

Leia inteiro na primeira vez. Depois volte por seção, que é como este arquivo foi feito pra ser usado.

---

## 1. O lugar do Experimento no Cérebro

Todo Experimento precisa de um Sistema instalado embaixo dele. Teste solto produz relatório e nada
mais: a execução seguinte continua igual. Com Sistema, a decisão aprovada entra numa camada
versionada e o run seguinte já nasce diferente.

| peça | papel no Experimento |
| --- | --- |
| Cérebro | guarda o contexto, o Baseline e os Recibos antigos. É de onde sai a prova de que o gargalo é real |
| Sistema | o palco. Dele vêm a régua, o Setpoint, o pipeline e os gates que o Experimento tenta mover |
| Experimento | um ciclo, um arquivo. Pré-registro congelado, coleta, leitura e decisão |
| Eval | mede a qualidade de cada execução e continua rodando normalmente durante a coleta |
| Humano | dono da leitura e dono do martelo. Aprova o Pré-registro, a escrita externa e a decisão |

O desenho do Sistema (as oito unidades, a régua, o Feedback) está em
[`METODO-SISTEMAS.md`](METODO-SISTEMAS.md). Aqui a tabela serve só pra dizer quem responde pelo quê
durante um teste.

---

## 2. Critério vem antes do dado

> Critério vem antes do dado. Você escreve o que vai medir, com qual regra de contagem, em qual
> janela, e qual resultado leva a qual decisão. Só depois disso a mudança vai ao ar.

Inverta a ordem e qualquer número aceita duas histórias. O lado bom do resultado vira "o teste
funcionou", o lado ruim vira "a janela foi curta", e a escolha entre as duas leituras acontece
depois de você já ter visto o dado. É aí que o Experimento deixa de medir o Sistema e passa a medir
sua torcida.

O motor segura essa ordem por hash, não por confiança. O comando `freeze` sela a região do
Pré-registro e grava um lock local. Editar critério depois disso fica visível na verificação, e a
verificação é obrigatória antes de ler.

O fundamento de medir e a lei do critério estão em [`METODO-COMPLETO.md`](METODO-COMPLETO.md). Este
documento é o procedimento.

---

## 3. O ciclo, do começo ao fim

1. **Gargalo.** Você prova que uma etapa está abaixo da régua, com período e fonte.
2. **Hipótese.** Você escreve uma frase que pode dar errado.
3. **Pré-registro.** Você preenche o arquivo com critério, janela, guardrail e regra de decisão.
4. **Congelar.** `freeze` sela o Pré-registro por sha256 e grava lock mais Recibo.
5. **Executar.** Quem executa liga a mudança única e mais nada.
6. **Coletar.** Você confere a integridade da coleta todo dia e registra desvio como Emenda.
7. **Ler.** Na data combinada, cinco blocos, com `verify` passando antes de tudo.
8. **Decidir.** Manter, corrigir, descartar ou inconclusivo, pela regra escrita no passo 3.
9. **Mudar.** A decisão entra numa camada do Sistema, versionada, com data de nova medição.

Pular o passo 9 é o erro mais caro dos nove. Se a execução seguinte sai igualzinha, você não
aprendeu, só comentou. O que sobra é memória oral, e ela dura até a pessoa que leu o resultado sair
de férias.

---

## 4. Antes de escrever: o gargalo tem que estar provado

Um gargalo provado tem três coisas:

- **um número abaixo da régua**, da etapa certa do Sistema, com o Setpoint que ele deveria atingir
- **um Baseline com período e fonte**, de onde o número saiu e de qual intervalo de datas
- **um dono**, a pessoa que responde por aquela etapa e topa a mudança

Faltou o Baseline? Então instrumente antes de qualquer outra coisa. Rode o Sistema pelo tempo
necessário pra ter contagem confiável e volte pra cá depois disso. Medir uma mudança contra uma
impressão dá um número e nenhuma evidência.

E confira uma coisa antes de abrir o arquivo: a melhoria que você quer testar já está rodando por
outro caminho? Gate que já existe, rotina que já cobre o caso, configuração que resolve sem mudar
pipeline. Experimento é ferramenta cara. Use quando não tem jeito mais curto.

---

## 5. O Pré-registro, campo por campo

Um ciclo é um Experimento é um arquivo. O arquivo fica em
`sistemas/outros-instalados/<system_id>/experimento.md` e o cabeçalho do bloco precisa ser a linha
`## EXP-001` sozinha, porque o script extrai o id por essa forma exata. Os marcadores
`### Pré-registro` e `### Emendas` seguem a mesma regra: o motor usa os dois pra achar o começo e o
fim da região selada.

No topo do arquivo fica o estado, que você atualiza à mão conforme o ciclo anda: `rascunho`,
`pré-registrado`, `no ar`, `em leitura`, `decidido`. Esse campo vive fora da região selada, então
mexer nele nunca quebra o hash.

Oito campos são obrigatórios pra congelar. Deixe um deles vazio e o `freeze` recusa, listando quais
faltam.

| campo | o que entra | obrigatório pra congelar |
| --- | --- | --- |
| `- data do pré-registro:` | a data em que você fechou o critério | não |
| `- dono da leitura:` | a pessoa que vai ler e assinar a decisão | sim |
| `- gargalo alvo (com evidência e fonte):` | a etapa, o número e de onde ele veio | não |
| `- baseline:` | o número de hoje, com intervalo de datas e de onde ele saiu | sim |
| `- hipótese:` | mudança, métrica, movimento esperado, mecanismo, o que fica constante | sim |
| `- mudança única:` | uma alteração, descrita no nível de quem vai executar | sim |
| `- o que fica intocado:` | a lista do que ninguém mexe durante a janela | não |
| `- controle:` | como o comportamento atual continua sendo observado | não |
| `- variação:` | o que exatamente passa a acontecer | não |
| `- métrica primária:` | uma métrica, com janela e unidade | sim |
| `- regra de contagem e deduplicação:` | o que conta, o que não conta, e o que faz um caso contar uma vez | não |
| `- guardrail:` | o teto ou piso que a mudança tem proibição de violar | sim |
| `- parada antecipada:` | a condição escrita que autoriza abortar | não |
| `- entrega ou amostra mínima:` | o volume abaixo do qual a leitura vira inconclusiva | não |
| `- janela de leitura:` | data ou contagem, com o que vier primeiro | sim |
| `- regra de decisão:` | faixas de resultado ligadas às quatro saídas | sim |
| `- quem executa a mudança:` | quem liga, pausa e corrige | não |
| `- escrita externa autorizada: sim \| não` | autorização explícita, por Experimento | não |

Os campos fora da lista de obrigatórios continuam fazendo o trabalho pesado na hora da leitura.
Pré-registro que passa no `freeze` e não diz como contar um caso duplicado é um critério com buraco,
e o buraco aparece justo quando o resultado fica perto da faixa de corte.

### Mudança única, de verdade única

Mudança múltipla mede pacote. Você descobre que o conjunto das três alterações mexeu na métrica e
fica sem saber qual delas pagou a conta, qual foi neutra e qual atrapalhou. Se o pacote inteiro é o
que interessa, escreva isso na hipótese e aceite que o resultado não aponta causa. Se você quer
causa, um Experimento por mudança.

### Hipótese que pode dar errado

Uma hipótese falsificável tem cinco partes: qual mudança, qual métrica, pra que lado você espera que
ela ande, por que mecanismo, e o que você mantém constante. "A triagem vai melhorar" não dá pra
falsificar. "Recusar pedido sem data de compra derruba a reclassificação pelo revisor, porque metade
das reclassificações do Baseline veio de pedido sem data" dá.

### Guardrail

Guardrail é o limite que não pode piorar enquanto a métrica primária melhora. Protege qualidade,
segurança ou custo. Um Experimento que acerta a métrica e estoura o guardrail vai pra descarte,
mesmo com a métrica bonita. Escreva o número e escreva em que leitura ele será conferido.

### Regra de decisão

A regra precisa cobrir todo resultado possível, inclusive os feios: volume abaixo do mínimo, métrica
dentro de uma faixa cinza, guardrail estourado. Se existe um resultado que a sua regra não endereça,
você vai decidir aquele caso no improviso, depois de ver o dado. Cubra as quatro saídas antes.

### Poder de leitura

Sem cálculo de amostra, use linguagem de baixa convicção na leitura e no Recibo. Isso não invalida o
Experimento. Evidência de baixa convicção serve pra decidir, serve pra priorizar e não serve pra
afirmar causalidade comprovada. A diferença entre as duas coisas cabe no campo de força da
evidência, e quem lê o Recibo seis meses depois precisa dela.

---

## 6. Congelar

Copie o template, preencha, congele. Onde o template está depende do tipo de instalação.

**Pasta única** (vault e motor na mesma pasta):

```bash
cp templates/experimento.md sistemas/outros-instalados/meu-sistema/experimento.md
node scripts/system-experiment.mjs meu-sistema freeze
node scripts/system-experiment.mjs meu-sistema verify
```

**Vault com motor separado** (o caso normal de quem instalou o produto). O template vive no motor e
o comando roda pelo lançador do vault:

```bash
MOTOR=$(node .cerebro/bin/cerebro.mjs motor-path)
cp "$MOTOR/templates/experimento.md" sistemas/outros-instalados/meu-sistema/experimento.md
node .cerebro/bin/cerebro.mjs system-experiment meu-sistema freeze
node .cerebro/bin/cerebro.mjs system-experiment meu-sistema verify
```

Dentro de um Cérebro, use sempre a segunda forma. O lançador acha o motor pelo ponteiro, resolve a
raiz certa e nunca grava dado seu na pasta do produto. A forma `node scripts/...` vale no repositório
do motor e em instalação de pasta única.

O `system_id` precisa casar `^[a-z0-9][a-z0-9-]{0,63}$`. O arquivo padrão é `experimento.md`. Do
segundo Experimento em diante, guarde em `experimentos/EXP-002.md` e aponte com `--file`:

```bash
node .cerebro/bin/cerebro.mjs system-experiment meu-sistema freeze --file=experimentos/EXP-002.md
```

O que o `freeze` faz:

- confere que os oito campos obrigatórios têm conteúdo real (template em branco não passa)
- calcula sha256 do texto que vai de `### Pré-registro` até `### Emendas`
- grava `.cerebro/sistemas/<system_id>-<EXP-id>.lock.json` em modo 0600, com `system_id`,
  `experiment_id`, `file`, `frozen_at`, `sha256` e `pre_registration_bytes`
- grava o Recibo em `operacao/execucoes/<timestamp>-freeze-<EXP-id>-<system_id>.md`, com quando,
  arquivo, hash, a regra e o comando de verificação

Lock e Recibo são locais e não circulam. O lock guarda hash e metadados, nunca o texto do seu
critério. Um lock por id, então EXP-002 congela sem encostar no EXP-001.

Congelar o mesmo id duas vezes é recusado, com a data do primeiro congelamento na mensagem.
Correção depois do `freeze` é Emenda.

### Verificar

```bash
node .cerebro/bin/cerebro.mjs system-experiment meu-sistema verify
```

Três respostas possíveis:

- **sem lock**: falha pedindo o `freeze` antes de lançar a mudança
- **hash igual**: imprime que o Pré-registro está íntegro desde a data do congelamento
- **hash diferente**: imprime que o pré-registro foi alterado após o congelamento, manda tratar a
  leitura como inconclusiva, registrar o ocorrido como Emenda e levar o Sistema a
  `needs_attention`. Sai com código 1, então script e rotina param em cima disso

Estado, Emendas, execução, leitura e decisão ficam fora da região selada e seguem editáveis o tempo
todo. O hash protege o critério, não o diário de bordo.

---

## 7. No ar: a coleta

Antes de considerar a coleta válida, seis gates:

- **instrumentação**: a métrica primária está sendo registrada de verdade, conferida num caso real
- **entrega mínima**: o volume da janela chegou ao piso escrito no Pré-registro
- **comparabilidade**: controle e variação continuam parecidos no que importa
- **janela**: a data ou a contagem combinada, sem esticar porque o número está quase bom
- **guardrails**: dentro do limite, com o número do dia anotado
- **poder de leitura**: você sabe se tem amostra pra afirmar causa ou só pra sugerir direção

Confira a integridade da coleta todo dia. Ler diariamente protege o experimento, e protege só isso:
a leitura de resultado acontece na regra e na data combinadas, nem um dia antes. Se a conferência
diária começar a produzir opinião sobre quem está ganhando, você já está decidindo sem critério.

Parada antecipada acontece por condição pré-registrada. Guardrail estourado, erro de
instrumentação, dano a cliente. Número parcial animador não autoriza nada. Essa é a armadilha mais
confortável do processo, porque a decisão parece corajosa e é só pressa.

### Emenda

Emenda é append-only, numerada, com data, motivo e efeito. Nunca reescreve o passado. Serve pra
registrar circunstância externa: feriado que derrubou o volume, fornecedor fora do ar, amostra que
chegou torta por motivo alheio.

Emenda que muda critério depois de o dado existir invalida a leitura. Nesse caso você tem duas
saídas honestas: declarar inconclusivo e abrir outro Experimento com o critério novo, ou manter o
critério velho e ler como combinado. Escolher a terceira saída (ajustar o corte e seguir) é o que
transforma o arquivo todo em decoração.

---

## 8. A leitura, em cinco blocos

Rode `verify` primeiro. Depois escreva na ordem:

1. **Pergunta.** Qual era a hipótese, em uma frase, copiada do Pré-registro.
2. **Integridade.** `verify` passou, janela cumprida, volume acima do mínimo, Emendas listadas.
3. **Evidência.** Os números da janela com fonte, o resultado contra a regra, o guardrail.
4. **Limites.** O que ficou provado e `o que NÃO ficou provado`, mais a força da evidência.
5. **Decisão.** A saída pela regra, com dono, data e justificativa.

O campo `o que NÃO ficou provado` é obrigatório porque a leitura sem ele viaja. Seis meses depois,
alguém abre o Recibo, lê "a mudança funcionou" e constrói três decisões em cima de uma evidência que
nunca aguentou esse peso. Escreva o que o seu desenho não conseguiu separar: sazonalidade, mix de
clientes diferente, uma segunda alteração que entrou por fora, amostra pequena.

Força da evidência tem três valores: alta, média, baixa. Baixa é resposta legítima e frequente.

---

## 9. A decisão

Quatro saídas, nessa ordem, com a condição de uso de cada uma:

- **manter**: a métrica andou pro lado previsto, o guardrail ficou intacto e a regra autoriza. A
  mudança vira configuração do Sistema
- **corrigir**: o movimento aparece mas fica fora da faixa, ou o mecanismo se mostrou diferente do
  que você imaginou. Você ajusta a mudança e abre o Experimento seguinte, com Pré-registro novo
- **descartar**: a métrica não andou, andou pro lado errado, ou o guardrail estourou. O Sistema volta
  ao estado anterior e o aprendizado fica escrito
- **inconclusivo**: integridade comprometida, volume abaixo do mínimo, `verify` falhando, critério
  mexido depois do dado. É a leitura honesta que o desenho permite, e ela conta como resultado

Você pode decidir com convicção baixa. A condição é uma: a ressalva entra no Recibo junto com a
decisão. Escrever "mantive com evidência baixa, pelos motivos X e Y" é decidir. Escrever "mantive,
funcionou" com evidência baixa é inventar histórico.

O martelo permanece humano. O Sistema organiza a evidência, mostra as opções e aponta o que a regra
determina. Quem decide é a pessoa nomeada no campo de dono da leitura, com nome e data no arquivo.

---

## 10. A mudança que volta pro Sistema

Decisão sem camada afetada não mudou nada. Escreva onde a mudança ficou:

`configuração`, `pipeline`, `rotina`, `skill`, `gate`, `eval`, `golden pattern` ou `nenhuma`.

`nenhuma` é saída válida (típica de descarte), e ainda assim o arquivo registra o aprendizado. As
outras exigem três coisas: a mudança versionada, onde ela foi gravada, e como será medida no ciclo
seguinte.

No motor de aprendizado, o Self Improvement chama duas dessas camadas por outro nome. Onde o
template escreve `skill`, o contrato portátil é a Capability. Onde o template escreve
`golden pattern`, a camada do motor é `golden-set`, que é onde o Golden set do Sistema fica
versionado. Promover uma mudança por lá tem régua separada da sua decisão de Experimento: três
ocorrências comparáveis, três replays e `--confirm`.
Uma decisão de Experimento autoriza a mudança no seu Sistema. Ela não promove nada no motor por
conta própria.

Se a leitura acabou em `corrigir`, aponte o próximo Experimento no campo final do arquivo. É assim
que uma fila de ciclos nasce rastreável em vez de nascer na cabeça de alguém.

---

## 11. Exemplo completo

Caso sintético, números inventados, Sistema fictício. O que vale aqui é o percurso inteiro, não os
valores.

Sistema `triagem-garantia`, que recebe pedidos de garantia e propõe uma classificação pra um
revisor humano aprovar.

**Pergunta.** O gate novo derruba a taxa de reclassificação pelo revisor?

**Pré-registro (EXP-001), congelado em 6 de maio:**

- dono da leitura: coordenação de pós-venda
- gargalo alvo: 31 de cada 100 triagens voltam reclassificadas pelo revisor. A régua do Sistema pede
  no máximo 15 em 100
- baseline: 31 por 100, de 4 a 31 de março, fonte nos recibos de run em `operacao/execucoes`
- hipótese: recusar o pedido que chega sem data de compra derruba a reclassificação, porque 16 das 31
  reclassificações do Baseline caíram em pedidos sem data. Prompt, fonte e revisor seguem iguais
- mudança única: um gate novo no pipeline, que recusa a triagem quando falta a data de compra
- o que fica intocado: pipeline, fonte, régua do revisor e Evals
- métrica primária: triagens reclassificadas por 100 triagens concluídas, contadas por id de pedido,
  um id conta uma vez, mesmo com duas idas ao revisor
- guardrail: tempo médio de triagem não passa de 9 minutos
- parada antecipada: só se o tempo médio passar de 12 minutos em duas conferências diárias seguidas
- entrega mínima: 80 triagens concluídas
- janela de leitura: 120 triagens concluídas ou 4 semanas, o que vier primeiro
- regra de decisão: abaixo de 20 por 100 com guardrail intacto, manter. De 20 a 28, corrigir o gate e
  abrir EXP-002. Acima de 28, ou guardrail estourado, descartar. Menos de 80 triagens na janela,
  inconclusivo
- escrita externa autorizada: não

**Congelamento.** `freeze` recusou na primeira tentativa, porque o campo de guardrail estava vazio.
Depois de preencher, selou o Pré-registro e gravou o Recibo em `operacao/execucoes`.

**Emendas.**

- A1 (12 de maio): dois dias de feriado derrubaram o volume. A janela segue pela contagem de 120
  triagens, não pela data. Critério intocado.

**Integridade.** `verify` passou. 126 triagens na janela, acima do mínimo de 80. Uma Emenda, de
circunstância externa.

**Evidência.** 18 reclassificações por 100. Tempo médio de 8 minutos e 12 segundos, guardrail
intacto. Pela regra, faixa de `manter`.

**Limites.** O que ficou provado: com o gate no ar, a reclassificação ficou abaixo da régua na
janela medida. `o que NÃO ficou provado`: que o gate é a causa. Dois clientes novos entraram em maio
e mudaram o mix de pedidos, e o desenho tem um braço só, sem cálculo de amostra. Força da evidência:
baixa.

**Decisão.** Manter, com convicção baixa e a ressalva do mix no Recibo. Dono e data assinados no
arquivo.

**Mudança na próxima execução.** Camada afetada: gate. Gravado no pipeline do Sistema, versão
1.3.0. Medido no ciclo seguinte pela mesma métrica, com a mesma regra de contagem, pra ver se os 18
por 100 se sustentam num mês sem cliente novo entrando.

Repare no que o exemplo entrega: uma decisão tomada, e um registro que deixa a próxima pessoa
saber exatamente o quanto confiar nela.

---

## 12. Checklist antes de lançar

Nenhum item depende de interpretação. Cada um é verificável.

- [ ] o Sistema está instalado e rodou pelo menos uma vez com Recibo
- [ ] o gargalo tem número, período, fonte e dono
- [ ] a mudança é única e cabe numa frase
- [ ] a hipótese pode dar errado
- [ ] a métrica primária tem unidade, janela e tratamento de caso duplicado
- [ ] o guardrail tem número e momento de conferência
- [ ] a regra de decisão cobre as quatro saídas, inclusive volume insuficiente
- [ ] quem executa a mudança sabe que é ele, e sabe seu limite de ação
- [ ] escrita externa autorizada está respondida com sim ou não
- [ ] `freeze` rodou e o Recibo está em `operacao/execucoes`
- [ ] `verify` passou depois do congelamento e antes de a mudança ir ao ar
- [ ] a camada que vai receber a decisão já está identificada

---

## 13. Trabalhando com o agente

O agente propõe. Ele pode achar o gargalo nos Recibos, escrever rascunho de Pré-registro, apontar
buraco na regra de decisão, montar a leitura em cinco blocos e preparar o texto da Emenda.

Três coisas exigem aprovação do dono, sempre: congelar o Pré-registro, qualquer escrita fora do
Cérebro e a decisão final. O contrato que o agente segue dentro de um vault está em `AGENTS.md`, e
ele aponta pra cá na hora de uma mudança controlada.

Peça pro agente defender o contrário. "Qual leitura desse número eu não quero ver" encontra mais
problema de desenho que uma revisão gentil.

---

## 14. A vista estruturada

Em paralelo ao markdown existe um par de contratos JSON que o Console lê:
`protocol/experiment-contract.schema.json` guarda o Pré-registro congelado (com `freeze.kind` em
sha256 ou legacy-attested) e `protocol/experiment-state.schema.json` guarda o estado posterior ao
congelamento. Os arquivos ficam em `.cerebro/contracts/experiments` e `.cerebro/runtime/experiments`,
com estados `queued`, `running`, `ready-for-read`, `decided`, `cancelled` e `blocked`, medição de
not-started a complete, veredito em pending, recorded ou not-executed, e aprendizado em pending,
unlinked, linked ou not-applicable. Um Run Record aponta pro Experimento por `experiment_ref` ou por
entidade com papel `experiment`. Detalhe em [`protocol/README.md`](protocol/README.md).

---

## 15. Arquivos e caminhos

| o quê | onde |
| --- | --- |
| template | `templates/experimento.md` no motor |
| primeiro Experimento | `sistemas/outros-instalados/<system_id>/experimento.md` |
| seguintes | `sistemas/outros-instalados/<system_id>/experimentos/EXP-00N.md` |
| lock do congelamento | `.cerebro/sistemas/<system_id>-<EXP-id>.lock.json`, modo 0600 |
| Recibo do congelamento | `operacao/execucoes/<timestamp>-freeze-<EXP-id>-<system_id>.md` |
| contrato e estado JSON | `.cerebro/contracts/experiments` e `.cerebro/runtime/experiments` |

Para onde ir depois: [`METODO-SISTEMAS.md`](METODO-SISTEMAS.md) pro desenho do Sistema e da régua,
[`templates/experimento.md`](templates/experimento.md) pro arquivo em branco,
[`templates/sistema/`](templates/sistema/) pro contrato do Sistema,
[`GLOSSARIO.md`](GLOSSARIO.md) pros termos da casa e
[`METODO-COMPLETO.md`](METODO-COMPLETO.md) pro fundamento de medir.

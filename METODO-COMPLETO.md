---
tipo: metodo
versao: 1.45.0
publicado: 2026-11-21
---

# O método completo

Este documento conta a história inteira: por que o Cérebro é construído assim, onde cada tipo de dado mora, como o ciclo roda, o que nunca pode ser quebrado e como saber se está funcionando.

A versão de uma sentada, com os quatro movimentos do dia a dia, está em [METODO.md](METODO.md). Leia aquela primeiro se você só quer começar a usar. Este aqui é leitura de estudo, uma vez, e consulta depois.

---

## Parte 1 · Por que contexto

### O modelo é igual pra todos

Todo mundo que paga a mesma assinatura usa o mesmo modelo. Seu concorrente, seu cliente, o estagiário dele. A diferença de resultado não sai de lá.

Ela sai do **Contexto**: o que só o seu negócio tem. O preço que você cobra e o que acontece quando você cobra mais. A objeção que aparece na terceira call e não na primeira. O cliente que dá lucro e o que dá trabalho. O jeito que a sua entrega é feita quando dá certo. Isso não está em dado de treino nenhum.

Quando a IA te dá uma resposta genérica, a causa quase sempre é a mesma: ela não recebeu o seu Contexto. Trocar de modelo não resolve, porque o buraco está na entrada. Prompt mais elaborado também não resolve, porque instrução melhor sobre nada continua sendo sobre nada.

### Contexto certo vence contexto grande

A tentação natural é despejar: todo o Drive, todo o Notion, cinco anos de e-mail. Isso piora a resposta. Contexto grande dilui, traz informação velha com cara de atual e enche a janela de ruído que o modelo precisa atravessar antes de achar o que importa.

A curadoria vem antes da computação. Dez trechos certos, citados, com origem conhecida, produzem resposta melhor que mil páginas cruas. É por isso que o Cérebro trabalha em pedaços pequenos e verificáveis, e não em despejo.

E essa escolha fica mais valiosa, não menos, quanto melhor o modelo. Modelo fraco erra até com contexto bom. Modelo bom acerta fino quando o contexto é preciso e erra com confiança quando o contexto é sujo. O ganho de cada geração nova de modelo vai pra quem tem o contexto arrumado.

### O Contexto é patrimônio

Modelo é aluguel. Você troca de provedor num mês e não perde nada.

O Contexto é o contrário. Ele se acumula, e o que você guarda hoje vai ser lido pelos modelos de dois anos pra frente, que vão tirar dele coisa que o modelo de hoje não consegue tirar. Essa composição só acontece se o material sobreviver à troca de ferramenta.

Por isso o Cérebro é uma pasta de arquivos de texto na sua máquina. Markdown com frontmatter, legível por uma pessoa e por qualquer máquina, sem banco proprietário, sem formato que só um produto abre. O editor pode mudar. O agente pode mudar. A pasta fica.

A **Conexão** com o mundo de fora segue a mesma lógica. Protocolo aberto, do tipo do MCP, serve exatamente pra isso: o mesmo Contexto em arquivo pode ser plugado num agente diferente amanhã sem conversão nem exportação. O motor onde a inteligência roda (o terminal, o editor, o aplicativo de chat) é peça substituível. O Contexto não é.

### Engenharia de Contexto

**Engenharia de Contexto** é o nome do trabalho de montar, guardar e entregar o contexto certo pra IA no momento em que ela vai decidir ou produzir algo.

Em linguagem de operação: alguém tem que decidir o que entra, em que formato, com que prova, onde fica guardado, quem valida e quando aquilo expira. Esse alguém é o dono do negócio, com a IA fazendo o trabalho pesado e propondo. A **Skill** é onde esse procedimento fica escrito, e o **Sistema** é onde ele vira resultado que sai sozinho toda semana.

### Três altitudes, cumulativas

O mesmo método serve em três altitudes, e elas se empilham. Não dá pra pular.

**Altitude 1, pessoal.** Seu próprio trabalho ganha memória. O que você decidiu, o que leu, o que escreveu e o que funcionou param de morar na sua cabeça e na janela de conversa. O ganho aparece em dias.

**Altitude 2, negócio.** O Cérebro passa a conhecer a oferta, o cliente ideal, o posicionamento, o que já foi tentado e o que deu errado. Resposta estratégica começa a aterrissar no caso real em vez de devolver teoria. O ganho aparece em semanas.

**Altitude 3, empresa nativa de IA.** O trabalho recorrente deixa de ser executado por lembrança e passa a ser executado por **Sistema**, com régua, **Recibo** e versão. Pessoa entra pra julgar e decidir, não pra repetir. O ganho aparece em meses e depende das duas altitudes anteriores existirem.

### O segmento não muda o método

Clínica, indústria, agência, software, escritório, varejo: o ciclo é idêntico. Muda apenas qual captura vem primeiro.

Negócio de venda consultiva começa pelas objeções e pelos motivos reais de perda. Negócio de serviço recorrente começa pelo padrão de cancelamento e pelo que o cliente diz na renovação. Negócio de produção começa pelo defeito que volta e pelo fornecedor que atrasa. Essa primeira escolha é a única parte específica de segmento, e `/arquiteto` existe pra fazê-la com evidência em vez de palpite.

---

## Parte 2 · O Átomo

### A unidade mínima

Um **Átomo** é uma nota de uma ideia só, com quatro partes:

1. **Afirmação**, no título. A frase que diz o que a nota afirma, não o assunto da nota.
2. **Citação literal** da fonte, entre aspas, com a origem em wikilink e o timestamp quando existir.
3. **Por quê**, uma ou duas linhas sobre o que isso muda no negócio.
4. **Elos**, os links que ligam esse Átomo ao resto.

No arquivo, isso aparece como `type: Atom` no frontmatter, com `topic`, `created`, `confirmed`, `origin` e `related_to`, e o corpo trazendo a citação em bloco, o **Por quê** e os elos.

A diferença entre título-assunto e título-afirmação parece cosmética e não é. "Precificação" não pode ser conferido, contrariado nem confirmado. "Proposta com implantação separada da mensalidade derruba a objeção de preço" pode. Afirmação é testável, assunto é pasta.

### A citação é a prova

A citação literal é a parte que faz o Cérebro ser diferente de uma conversa com IA. Ela amarra cada afirmação a um pedaço de realidade com endereço, e permite voltar na origem meses depois pra ver se a frase ainda significa aquilo.

Sem citação, a nota não entra. O que existe sem evidência é opinião da IA passando por fato, e isso contamina tudo que vem depois. Quando a pergunta não tem resposta no cofre, a saída certa é `(não consta na fonte)`, que é informação útil, porque aponta exatamente a fonte que falta.

Paráfrase nunca entra entre aspas. O sentido é derivado e pode ser reescrito. A evidência é primária e fica verbatim.

### Metadados: cada campo responde uma busca

O frontmatter é mínimo de propósito. Campo que não responde uma pergunta real some, porque campo que ninguém preenche certo mente mais do que informa.

| Campo | A busca que ele responde |
|---|---|
| `type` | que tipo de coisa é isso, e em que view aparece |
| `created` / `updated` | quando nasceu e quando mexeram |
| `confirmed` | isso ainda vale hoje |
| `topic` | de que assunto é |
| `origin` | de onde veio, pra poder voltar lá |
| `status` / `superseded_by` | morreu, e quem substituiu |
| `tags` | que recorte atravessa várias notas |
| `related_to` / `belongs_to` | com o que isso conversa, e a que coisa maior pertence |

As chaves ficam em inglês, o texto em português, as datas em `AAAA-MM-DD`. O primeiro H1 é o título, e o nome do arquivo é a versão kebab-case dele, sem acento.

### O Bruto é imutável

O material como chegou (a transcrição, o PDF, o export, o áudio) é o **Bruto**. Ele fica íntegro em `capturas/`, fora do git, e não se reescreve.

Essa regra existe porque destilar é interpretar, e interpretação erra. Se o Átomo saiu torto, o conserto é um Átomo novo com registro de que ele substitui o anterior. O Bruto original continua onde estava, e a correção fica auditável. Material que se reescreve no lugar perde a capacidade de provar qualquer coisa.

Reunião continua reunião. Contrato continua PDF. Nada é convertido à força pra caber num formato único.

### Apodrecimento do Contexto

A nota mais perigosa do Cérebro é a que morreu fingindo estar viva. O preço antigo, a oferta que mudou em abril, o ICP que você abandonou, a decisão que foi revertida e ninguém anotou.

Ela não erra sozinha. Ela entra em toda resposta como fato vigente e contamina o raciocínio inteiro, com a agravante de parecer confiável, porque tem citação e origem. Quanto maior o acervo, maior a chance de uma dessas estar no meio da resposta.

É por isso que **Frescor** é mecanismo e não boa intenção, e por isso o ciclo mensal existe. A Parte 5 trata dele.

---

## Parte 3 · A casa de cada dado

### Os estados do dado

Dado no Cérebro vive em cinco estados, e o que separa um do outro é se o agente lê por padrão.

| Estado | Onde fica | O agente lê por padrão |
|---|---|---|
| Sessão | a janela da conversa | sim, e esquece quando a janela fecha |
| **Bruto** | `capturas/` (e `privado/` pro que é pessoal) | não, só quando um Átomo aponta pra lá |
| Átomos | `meu-negocio/` | sim, pelos trechos citados |
| Índices | `mapa.md`, `fios/`, `gente/`, `meu-negocio/fontes/` | sim, são a porta de entrada |
| Skills e Sistemas | as skills projetadas no vault e `sistemas/` | sim, quando a tarefa casa com uma delas |

A memória de trabalho é a janela e ela não persiste. Uma janela, um trabalho. O que você não gravou em arquivo não existe amanhã, e isso é uma vantagem: o que sobrevive passou por um filtro.

### Catálogo primeiro, Bruto sob demanda

O caminho que o agente faz tem três degraus. Primeiro o roteador, o contrato do cofre, que diz onde as coisas estão e o que é proibido. Depois o catálogo: o **Mapa** do negócio numa página, os índices de fonte, os **Fios** quentes, as páginas de **Gente**. Só então os Átomos relevantes, com os trechos citados.

O **Bruto** entra no último degrau e só sob demanda, quando um Átomo específico aponta pra ele e a pergunta exige o original. Ler o catálogo custa pouco, erra pouco e leva direto ao lugar. Varrer o Bruto custa muito e erra muito.

### A taxa de mudança decide a casa

Antes de escolher onde algo mora, olhe a velocidade com que aquilo muda.

Dado que muda a cada hora (saldo, posição de pipeline, estoque) mora na ferramenta que é dona dele. O Cérebro guarda o padrão lido naqueles números, não os números. Planilha e CRM continuam sendo a fonte de verdade.

Dado que muda em meses (preço, oferta, posicionamento, ICP) mora numa nota de área, com `confirmed:` pra você confirmar de tempo em tempo.

Dado que nunca muda (o Bruto de uma reunião que aconteceu, um contrato assinado) mora em `capturas/` pra sempre, intocado.

Confundir essas três é a origem de boa parte da bagunça: número volátil copiado pra nota nasce velho, e padrão durável deixado solto no chat morre com a janela.

### Três eixos de índice

O mesmo Átomo precisa ser encontrável por três caminhos diferentes, porque a pergunta chega por qualquer um deles.

**Tempo.** `meu-negocio/dailies/` guarda o rollup de cada dia e o resumo de cada semana. Responde "o que aconteceu em outubro".

**Tema.** `fios/` guarda o que está quente agora, um arquivo por assunto em andamento. Responde "onde a gente estava naquela discussão de preço".

**Pessoa.** `gente/` guarda uma página por cliente, parceiro ou concorrente que importa. Responde "o que esse cliente já disse pra gente".

Índice só linka. Ele não guarda conteúdo próprio nem segunda versão do fato, porque duas casas pra mesma verdade garantem que uma delas vai ficar errada.

### PII, dado sensível e LGPD

Nome, e-mail, telefone, CPF, CNPJ e dado de saúde ou financeiro de pessoa identificável não entram nas notas. Varredura antes de gravar, sempre. O que for pessoal e necessário vai pra `privado/`, que fica fora do git, e nada mais.

A regra tem um motivo técnico além do legal: nota é versionada e viaja. Uma vez commitada, ela persiste no histórico mesmo depois de editada. Dado pessoal pertence ao banco que já tem base legal, retenção e titular definidos.

Quando você precisa cruzar o banco com o Cérebro, cruze por **Entidade** opaca: um identificador sem significado (`cliente-0147`) que aponta pro registro canônico lá. O qualitativo entra anonimizado, no formato "cliente de porte X no segmento Y disse Z". O padrão se preserva, a pessoa não é identificável.

E a ordem importa: governe antes de conectar. Fonte nova se registra com autoridade, finalidade, dono e retenção declarados antes de qualquer conector recorrente apontar pra ela. Registrar fonte e conectar fonte são dois atos distintos, e o primeiro não autoriza o segundo.

---

## Parte 4 · Os cinco verbos

O ciclo inteiro são cinco verbos: **capturar → destilar → estruturar → operar → medir**.

Dois outros atravessam todos eles. **Automatizar** é tirar decisão humana do que é mecânico. **Julgar** é devolver decisão humana pro que é consequente. Os cinco verbos acontecem em sequência, esses dois acontecem o tempo todo.

### Capturar

Captura boa é automática e tem zero decisão embutida. No momento em que algo acontece, a pergunta "isso vale guardar" custa caro e faz você não guardar.

Então a bandeja aceita tudo. Áudio de 40 segundos gravado no carro depois da reunião. Print da conversa. PDF que chegou por e-mail. Export do CRM. O filtro vem depois, no destilar.

Voz é a porta de entrada mais barata que existe, porque dita em 40 segundos o que levaria 6 minutos pra escrever e porque funciona no celular, onde você está quando a coisa acontece. Como bônus, a voz carrega o julgamento quente: você diz "isso me preocupou porque o cliente nunca tinha reclamado disso" sem precisar decidir que vai dizer. Essa meia frase é o que vira o **Por quê** do Átomo depois.

Captura contínua fica fora da lista dos Relógios. Ela está aberta o tempo todo, como a tomada da parede.

### Destilar

**Destilar** é separar sinal de ruído e transformar o sinal em Átomo.

Sinal é dor, decisão, número, objeção, padrão que repetiu e peça que funcionou. Ruído é saudação, combinação de horário, repetição do que já está em nota. A maior parte do Bruto é ruído, e isso é normal.

A IA faz o trabalho pesado: ela lê, propõe os Átomos com citação e origem, sugere elos. Você aprova, corrige ou descarta. Essa aprovação parece burocracia e funciona como treino: cada vez que você diz "esse não, esse sim, esse com a citação errada", o sistema aprende o que conta como sinal no seu negócio. Aprovação é treino.

**Julgamento perece.** O que você sabe hoje sobre por que aquela reunião foi estranha evapora em uns dois dias. Destilado quente, o Átomo sai com o Por quê certo. Destilado frio, duas semanas depois, o mesmo Bruto rende Átomo raso, do tipo que descreve o que foi dito e não registra o que significava. A cadência existe por causa disso.

**Quanto destilar** se resolve com uma pergunta só, e ela trata de trabalho, nunca de importância: que trabalho real vai sair disso. A resposta cai num **Nível de refino**:

| Nível | Quando | O que acontece |
|---|---|---|
| 0 · **Ponteiro** | não sei ainda | registra onde o material está, e para |
| 1 · legível | vou buscar dentro | transcreve, passa OCR, exporta pra texto |
| 2 · indexado | preciso achar sem ler tudo | etiqueta o que é, de onde veio, o que extrair |
| 3 · destilado | vai ser citado numa decisão | vira Átomo |
| 4 · operacional | muda o próximo trabalho | vira régua, decisão ou procedimento aprovado |

Parar no **Ponteiro** é saída legítima e frequente. Subir de nível sem trabalho que justifique é desperdício puro. A régua completa, com o custo por formato, está em [FONTES.md](FONTES.md).

**Quando tratar, por categoria:**

| O que chegou | Prazo | Dá pra agrupar |
|---|---|---|
| Decisão que acabou de ser tomada | na hora | não, perde o Por quê |
| O dia | no fim do dia, 5 a 10 min | não |
| Reunião | até 48 horas | não, cada uma na sua |
| Acervo acumulado | no ritual semanal | sim, agrupado por tipo |
| Ruído | nunca | nunca |

### Estruturar

Estruturar é o que faz um Átomo ser achável no mês que vem: metadados preenchidos, elos pro que já existe e lugar certo no catálogo.

O lugar certo sai do uso, não do assunto. Quatro horizontes: agora (`fios/`), as áreas perenes do negócio, as referências que vieram de fora e o arquivo do que esfriou. A pergunta é "quando eu vou precisar disso", e não "de que tema isso é". Organizar por tema produz pasta bonita e busca inútil, porque o mesmo fato é de três temas e você só lembra de um.

Agregado nasce do destilado, nunca do Bruto. O resumo da semana nasce dos rollups diários. O retrato do mês nasce dos resumos de semana. Reler as íntegras pra escrever o resumo é retrabalho com julgamento pior, porque na hora de reler o calor já foi. Se o resumo ficou pobre, o defeito está na captura daquele dia, e é lá que se conserta.

### Operar

Operar é usar o Cérebro pra produzir algo: responder, decidir, escrever, propor.

A regra é citar sempre. A resposta traz os trechos das suas notas, com origem, e quando não existe trecho, a resposta é `(não consta na fonte)`. Nenhuma resposta se completa com conhecimento geral disfarçado de contexto próprio, porque é exatamente aí que entra a invenção com cara de verdade.

Operar também é onde o know-how sai da sua cabeça. Na terceira vez que você explica o mesmo procedimento pro agente, aquele procedimento vira uma **Skill**: um arquivo de texto com os passos, as regras e o que nunca pode acontecer. A partir dali o procedimento é executável e versionável, e para de depender de você estar na sala.

### Medir

Sem medição periódica a qualidade cai devagar e ninguém percebe, porque cada resposta individual continua parecendo plausível.

O método mede em dois níveis. O **Eval** de um **Sistema** pergunta se aquela execução atingiu o resultado dela. O **Teste do Cérebro** pergunta outra coisa: se o Cérebro inteiro conhece o negócio melhor do que mês passado.

O Teste do Cérebro funciona assim. Na primeira rodada você escreve cinco **Perguntas-canário**, do tipo que um sócio de muitos anos saberia responder de cabeça, e elas ficam gravadas em `meu-negocio/teste-do-cerebro.md`. Todo mês o Cérebro responde usando só o cofre e evidência citada. Você julga cada resposta pela **Régua**, em três degraus:

**em branco → estagiário → sócio**

- **Em branco:** não tem informação nenhuma. O buraco é de fonte, e a ação é registrar e tratar a fonte que responderia aquilo.
- **Estagiário:** tem informação solta, sem conexão nem consequência. O buraco é de destilação e elos, e a ação é destilar melhor o que já está lá.
- **Sócio:** responde com evidência, aterrissa no caso e aponta a consequência. Nada a fazer além de manter fresco.

As cinco perguntas ficam fixas. Pode entrar uma sexta, nunca trocar a régua, porque régua que muda não compara nada. Frequência mensal, teto de vinte minutos, e cada resposta fraca aponta um buraco e a fonte ou o Sistema capaz de tapá-lo.

A única evidência de resultado que o método aceita é a medida dentro do seu próprio Cérebro: a sua Régua mês a mês, o seu **Eval** execução a execução, o seu **Feedback** registrado. Número de benchmark de terceiro não prova nada sobre a sua operação.

### Automatizar e julgar

Esses dois atravessam o ciclo inteiro, e a divisão é sempre a mesma: a IA propõe e executa, a aprovação continua humana.

O **Gate** é onde isso fica concreto. Antes de gravar nota, antes de escrever em ferramenta de fora, antes de fechar tarefa, antes de marcar Sistema como ativo, alguém olha e decide. O agente faz a parte chata, que é ler tudo, montar a proposta e mostrar o diff.

Um dono do julgamento, sempre. Dois donos é nenhum. E multiagente só depois que um laço simples funciona de verdade: três agentes conversando sobre um procedimento que nunca rodou direito produzem três vezes mais erro, mais rápido, com rastro pior.

A última peça: regra que nunca pode falhar vira verificação em código. Documento é lembrete, e lembrete se esquece. No Cérebro, o **Pré-registro** de um **Experimento** é congelado por hash, e uma mudança na região selada é detectada em vez de confiada. O estado de um Sistema só anda por transições válidas, e passar pra ativo exige um **Run** com Eval aprovado mais confirmação humana registrada. O que é inviolável é checado por máquina.

---

## Parte 5 · Os Relógios

Contexto tem cadência, e cada **Relógio** tem uma skill, um tempo e um entregável.

| Relógio | Skill | Tempo | Entregável |
|---|---|---|---|
| Diário | `/daily` | 5 a 10 min | rollup do dia em `meu-negocio/dailies/AAAA-MM-DD.md` e no máximo 3 a 5 Átomos |
| Semanal | `/reindex` | 30 a 45 min | bandeja zerada, Fios revisados, resumo da semana |
| Mensal | `/revisar` | teto de 20 min | Frescor conferido |
| Mensal | `/teste` | teto de 20 min | nota do Cérebro contra a Régua |

A captura contínua fica fora da tabela porque está ligada o tempo todo, e não num horário. `/call` também fica fora: ele dispara por evento, quando você sai de uma reunião, com prazo de 48 horas, que é o tempo que seu julgamento sobre aquela conversa dura.

### O diário

Três perguntas, uma de cada vez: o que aconteceu hoje que importa pro negócio, que decisão foi tomada mesmo que pequena, o que travou. Do que você responder saem no máximo 3 a 5 Átomos. Dia comum rende um ou dois. Dia sem sinal rende zero, e o rollup sozinho já cumpriu o papel.

Dez minutos é teto, não meta. Se passou, o ritual está sendo complicado.

### O semanal

A ordem importa: triagem da bandeja, faxina dos Fios, resumo da semana, elos órfãos.

A bandeja termina zerada. Cada item de `capturas/` que entrou na semana recebe uma pergunta só, virar Átomo ou ficar arquivado como está. Cada Fio recebe outra, ainda está quente. Fio que esfriou sai do caminho com `status: Done`. Fio que virou decisão deixa o Átomo em `decisoes/` e fecha.

O resumo da semana nasce das dailies daquela semana e de nada mais. Ele é o entregável visível do ritual, o momento em que o Cérebro mostra trabalho: a coisa que mais importou, o que andou, o que foi decidido, o que travou, o padrão que repetiu e a pergunta aberta pra semana seguinte.

Fecha com a pergunta que torna o ritual cumulativo: o que o Cérebro errou ou não soube esta semana, e qual nota ou skill conserta isso. A correção é gravada. É isso que faz o Cérebro ficar melhor toda semana em vez de só ficar maior.

### O mensal

Duas skills, cada uma com teto de vinte minutos, que fecham o ciclo juntas.

`/revisar` cuida do **Frescor**. Cada nota de `meu-negocio/` carrega `confirmed:` com a data da última validação. A varredura levanta o que está sem confirmação há mais de 60 dias, os Fios parados há mais de 30 e, com prioridade, os conflitos: duas notas afirmando coisas incompatíveis, como dois preços ou dois ICPs. Cada suspeita tem três saídas:

- **Vale:** atualiza `confirmed:` pra hoje e nada mais.
- **Mudou:** você edita junto, com evidência nova, e atualiza `confirmed:`.
- **Morreu:** a nota recebe `status: Superseded` e `superseded_by` apontando pra que a substituiu, mais uma linha no topo dizendo isso.

Nada é deletado nunca. Nota superada continua no cofre como histórico e nunca volta como fato vigente. Em conflito, uma vence e a outra é marcada, porque deixar as duas de pé é escolher que a resposta seja aleatória.

`/teste` cuida da Régua, na mecânica da Parte 4. Os dois juntos fecham o mês: um garante que o que está lá é verdade, o outro mede se o conjunto responde melhor.

---

## Parte 6 · Os erros que todo mundo comete

**Confundir acervo com aprendizado.** Dez gigabytes de PDF numa pasta é arquivo morto. Aprender exige julgamento na entrada e retorno de resultado na saída. Acumular não é aprender. A pergunta que separa as duas coisas: que decisão ficou diferente por causa do que entrou essa semana.

**Deixar o raciocínio bom morrer na conversa.** É o erro mais comum e o mais caro. A conversa de três horas de ontem, com todo o raciocínio bom, não existe mais. O que não foi gravado em arquivo evaporou. Janela é bancada de trabalho, e o Cérebro é a prateleira.

**Despejar tudo.** Anexar o Drive inteiro, colar a transcrição de 90 minutos, mandar o export completo do CRM. A resposta piora e ninguém liga causa e efeito, porque a resposta ruim continua soando bem.

**Confiar em busca automática cega.** Busca semântica sobre acervo sujo devolve o trecho mais parecido, que não é o mais verdadeiro. Sem curadoria, sem Frescor e sem citação, ela recupera com confiança a nota que morreu em março.

**Deixar nota morta no caminho.** É o erro que destrói confiança mais silenciosamente, porque quando o dono descobre que o preço estava errado em cinco respostas, ele para de usar o Cérebro inteiro. O mecanismo de conserto está na Parte 5.

**Caçar o prompt perfeito.** Prompt de 2.000 palavras compensando ausência de contexto é trabalho jogado fora, e ele precisa ser refeito a cada conversa. O mesmo esforço gasto uma vez em Átomo citado serve pra sempre.

**Consertar a resposta em vez do sistema.** Esse é o erro que impede todos os outros de serem corrigidos. Quando o Cérebro erra, editar a resposta resolve o caso e garante que amanhã erra igual. Pergunte sempre o que produziu aquele erro: faltou fonte, a nota estava velha, a skill não dizia, o Gate não existia. Conserta-se o sistema que gerou o erro.

---

## Parte 7 · Quando o resultado merece virar Sistema

### De verificabilidade a repetibilidade

Átomo dá verificabilidade. Você sabe de onde veio cada afirmação e pode voltar na origem.

**Sistema** dá repetibilidade: o mesmo resultado sai de novo na semana que vem com a mesma qualidade, independente de quem lembrou de fazer e de quem estava inspirado. São propriedades diferentes, e as duas são necessárias. Átomo sem Sistema produz um cofre inteligente que ninguém opera. Sistema sem Átomo produz uma máquina rodando sobre dado que ninguém pode conferir.

### O que um Sistema tem

Um Sistema é um pacote de resultado, e todo pacote declara as mesmas peças:

- **Resultado:** o que sai pronto no fim, descrito como entregável e não como atividade.
- **Pipeline:** os passos da fonte real até o **Output**.
- **Configuração:** o que muda de negócio pra negócio sem mexer no Pipeline.
- **Rotina:** o que dispara (horário, evento ou execução manual).
- **Régua:** o **Eval**, com a parte determinística e a parte humana.
- **Feedback:** o registro do que foi corrigido, com a camada afetada.
- **Versão:** o changelog, pra poder comparar e voltar atrás.

Além disso, cada pacote traz uma Capability e um System Contract, que são o que permite Sistemas diferentes por dentro conversarem nas bordas com os mesmos identificadores, permissões e versões. O desenho completo, com as oito unidades e o protocolo, está em [METODO-SISTEMAS.md](METODO-SISTEMAS.md).

### Um Sistema costura o que já existia

Um Sistema roda sobre as fontes que já estavam na empresa antes dele: o drive, a caixa de e-mail, as transcrições, a planilha, o CRM. Software novo não entra na conta.

O trabalho dele é costurar o que hoje é feito por mão e memória em um circuito que se fecha: a fonte real entra, o Pipeline roda, sai um Output, a Régua julga, fica um **Recibo** e o **Feedback** volta pra próxima execução. Esse último elo é o que separa automação de aprendizado. Automação repete. Sistema melhora.

### O Recibo e o Run

Cada execução é um **Run**, e todo Run deixa um **Recibo** local: a versão que rodou, as fontes usadas, os gates determinísticos que passaram ou falharam, o Output avaliado, a decisão humana e o motivo.

Sem Recibo o ciclo não fecha, porque não existe o que comparar na próxima vez nem como provar o que foi feito. E Recibo com a decisão humana em branco é formulário, não prova.

O Run também é o que permite costurar Sistemas sem duplicar dado. Cada Recibo referencia a mesma **Entidade** opaca e os mesmos identificadores de fonte, então dois Sistemas diferentes falam do mesmo cliente sem nenhum dos dois virar uma segunda casa da verdade.

### Maturidade

Os estados que um Sistema atravessa:

- **instalado:** o pacote está aqui e configurado.
- **beta:** executa, ainda acumulando casos e correções.
- **validado:** repetiu o resultado com a Régua em casos reais.
- **publicado:** pode ser distribuído com versão e rollback.

Template em branco não é Sistema instalado. Primeiro Run aprovado não é Sistema validado. A validação exige resultado repetido, Eval, decisão humana, Feedback e versão.

O teste final de maturidade é incômodo e honesto: o Sistema sobrevive à saída de quem o operava. Se ele só funciona com uma pessoa específica no comando, o que existe é um hábito dessa pessoa com documentação por cima.

### Self Improvement sem autoedição cega

**Self Improvement** é o laço que faz a próxima execução ser diferente da anterior por causa do que foi aprendido na anterior.

A mecânica é deliberadamente devagar. Uma correção isolada fica local, registrada no Feedback daquele Sistema. Padrão comparável (três casos do mesmo tipo, com a mesma camada afetada) candidata uma mudança pequena. Pra virar mudança de verdade, ela passa por replay dos casos antigos, comparação, aprovação humana, versão e rollback possível.

Falha nunca vira procedimento. Conversa nunca vira procedimento. Candidato isolado continua candidato. Um motor que se reescreve sozinho a cada tropeço acumula correção contraditória e ninguém consegue dizer por que ele mudou de comportamento.

### Experimento, quando a mudança é incerta

Mudança em Sistema que já roda e já tem resultado exige disciplina diferente, porque a tentação de olhar o dado e depois decidir o critério é grande e invisível.

O instrumento é o **Experimento**: uma mudança única, declarada, com o **Pré-registro** congelado antes de qualquer dado aparecer. O Pré-registro carrega o gargalo alvo com evidência, o baseline, a hipótese, a mudança única, o que fica intocado, a métrica primária, a regra de contagem, o **Guardrail**, a parada antecipada, a janela de leitura e a regra de decisão. Uma vez congelado, ele não se edita, e o congelamento é verificado por hash.

Circunstância externa que apareceu depois entra como **Emenda**, numerada e fora da região selada. Critério que muda depois do dado invalida a leitura, e o caminho honesto é declarar inconclusivo e abrir outro Experimento. O protocolo inteiro, da hipótese à decisão, está em [METODO-EXPERIMENTOS.md](METODO-EXPERIMENTOS.md).

A régua de um Sistema também tem nome pra cada peça. Sensor é de onde o número vem. Métrica é o que se conta. Setpoint é o valor que separa aprovado de reprovado. **Golden pattern** é a forma de uma saída certa, o molde contra o qual a execução é comparada. **Golden set** é o conjunto de casos com resultado esperado conhecido, que deixa qualquer mudança ser testada contra o passado antes de entrar.

---

## Parte 8 · Motor, contexto e a camada coletiva

### Motor vs contexto

Uma instalação tem duas pastas, e a separação tem nome: **Motor vs contexto**.

O motor é o produto: método, glossário, protocolo, templates, definições de Sistema, scripts e as skills. Ele é substituível e vem com versão.

O contexto é seu: as notas, as capturas, os Sistemas instalados, o que `privado/` guarda, a identidade do negócio. Ele é único e não tem backup em lugar nenhum além do seu.

`/atualizar` reescreve o motor a partir de uma versão que você escolhe, mostra o plano antes, pede aprovação e reprojeta as skills e o bloco gerenciado do contrato. O contexto não é tocado. Essa fronteira é o que permite o produto evoluir rápido sem que atualização nenhuma seja uma aposta sobre o seu acervo.

A privacidade sai da mesma fronteira. O conteúdo das notas fica na sua máquina. Quando você roda uma rotina com um provedor de IA, só o contexto necessário daquela tarefa vai pra ele. A telemetria é técnica e opcional, carrega evento e metadado de instalação, nunca conteúdo de nota, e desliga com uma variável de ambiente ou um arquivo vazio na pasta de configuração.

### A camada coletiva

Existe uma terceira camada acima do pessoal e do negócio: o aprendizado destilado circulando entre pessoas que operam o mesmo método.

A ideia é direta. Um padrão que alguém provou na operação dele (um Golden pattern que funciona, uma correção de Pipeline, um Eval mais afiado) pode viajar sem que nenhum dado de negócio viaje junto, porque o que circula é a forma e não o conteúdo.

**Contribuição** é o caminho de saída, e ele tem três consentimentos separados: preparar o pacote anonimizado, aprovar o que vai dentro dele e enviar. Nenhum dos três implica o seguinte. Telemetria não é Contribuição, e nenhum dos dois leva conteúdo de nota.

Essa camada ainda está em construção. O catálogo da comunidade mostra o que já é entregável e o que é roadmap, e uma linha de roadmap não significa que o Sistema existe. Prometer rede pronta seria o mesmo erro que o método combate.

---

## Parte 9 · As onze leis invioláveis

Essas são as regras que o contrato do cofre carrega e que nenhuma conveniência quebra. Cada uma existe por causa de um jeito específico de o sistema apodrecer.

1. **O Bruto é imutável.** Erro de destilação vira versão nova com registro. O original fica.
2. **O Bruto fica frio.** O agente consulta o catálogo e os Átomos. Abre o original só quando um Átomo aponta e a pergunta exige.
3. **Só se opera conteúdo citado.** Sem evidência, a resposta é `(não consta na fonte)`. Nunca se preenche o buraco com conhecimento geral.
4. **Nota morta se marca, nunca se deleta.** `status: Superseded` mais `superseded_by`, e ela volta só como histórico.
5. **PII e dado sensível não entram nas notas.** Só `privado/`, fora do git. E governa-se a fonte antes de conectar.
6. **O Contexto é portátil.** Texto estruturado, em arquivo aberto, local, sob controle do dono. Nenhum formato que só um produto abre.
7. **Regra que nunca pode falhar vira verificação em código.** Documento é lembrete. O que é inviolável é checado por máquina.
8. **Sem medição periódica a qualidade cai.** Régua mensal e Eval por execução, sempre.
9. **Um dono do julgamento.** A IA propõe e executa, a pessoa aprova. Multiagente só depois que um laço simples funciona.
10. **Acumular não é aprender.** Entrada exige julgamento, saída exige retorno de resultado.
11. **Critério antes do dado.** Em Sistema e em Experimento, o que define sucesso é registrado antes e fica intocado depois.

---

## Parte 10 · Por onde seguir

Saber se está funcionando tem uma resposta curta e uma longa. A curta é a **Régua**: as suas cinco **Perguntas-canário** saíram de **em branco → estagiário → sócio** ao longo dos meses. A longa é o Recibo dos seus Sistemas, mostrando resultado repetido com Eval aprovado.

Se você está começando, a ordem é esta:

1. `/comecar` ativa o Cérebro Base: o Mapa do negócio, as fontes registradas sem serem conectadas, uma fonte real usada de verdade e o contexto aprovado voltando numa segunda tarefa.
2. Os **Relógios** entram em seguida, do mais barato pro mais caro: `/daily` todo dia, `/reindex` toda semana, `/revisar` e `/teste` no mês.
3. `/fonte` resolve o que fazer com cada coisa que chega, pela régua de [FONTES.md](FONTES.md).
4. `/arquiteto` escolhe, com evidência, onde o primeiro Sistema vale mais.
5. `/sistematizar` transforma aquele trabalho em pacote local, e `/operar` roda ponta a ponta.

Os termos da casa, um por linha, estão em [GLOSSARIO.md](GLOSSARIO.md). Use sempre eles pra falar do método, porque vocabulário que cresce sem freio vira ruído. Termo novo entra pelo glossário, nunca por uma nota solta.

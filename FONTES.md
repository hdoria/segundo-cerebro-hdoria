---
tipo: metodo
versao: 1.45.0
publicado: 2026-11-21
---

# Fontes: a régua de refino

Chega um PDF de contrato. Chega o export do CRM. Chega uma pasta de 400 arquivos que alguém
compartilhou. E chega aquela gravação de 1h40 que você ainda não ouviu.

A pergunta que trava todo mundo é "trato ou guardo o bruto?". A resposta está numa régua de cinco
níveis, numa tabela por formato, e na disciplina de parar no nível que o trabalho pede.

## A regra-mestra

Formato de entrada não se uniformiza. O que você uniformiza é o caminho que a fonte percorre aqui
dentro, e refina esse caminho só até onde o trabalho exige.

Reunião continua reunião. Contrato continua PDF. Planilha continua planilha. O que fica igual para
todas é o caminho: capturar, etiquetar, extrair, aprovar, devolver ao trabalho.

Markdown é o formato do destilado. Isso não autoriza converter o acervo da empresa em markdown.

E a parte em que quase ninguém acredita de primeira: **parar no ponteiro é saída legítima**. A
maioria das suas fontes vai morrer no nível 0 ou 1, e isso é o sistema funcionando.

## A pergunta única

Antes de tocar em qualquer arquivo, pergunte:

> *"que trabalho real vai sair disso?"*

Troque a pergunta e o resultado muda. "Isso é importante?" coloca tudo no mesmo patamar, porque
tudo parece importante às 18h de uma terça. Trabalho real tem resposta concreta ou resposta
nenhuma, e resposta nenhuma já é o nível 0.

A resposta mapeia direto no nível:

| A resposta | O nível |
|---|---|
| não sei ainda | **nível 0 · ponteiro** |
| vou buscar dentro | **nível 1 · legível** |
| preciso achar sem ler tudo | **nível 2 · indexado** |
| vai ser citado em decisão | **nível 3 · destilado** |
| muda o próximo trabalho | **nível 4 · operacional** |

## Os cinco níveis

### Nível 0 · ponteiro

Você registra onde a fonte mora e para. Sem copiar, sem converter, sem mover.

Na prática isso vira uma nota em `meu-negocio/fontes/<id>.md` com `type: Source`. Pasta local fora
do cérebro ganha também um registro de leitura, sem cópia e sem sync, por
`node .cerebro/bin/cerebro.mjs register-source --path <caminho> --type <tipo> --confirm`. Sem o
`--confirm` o comando recusa e nada é gravado.

Esse é o nível de quase tudo que chega. Um drive de 12 GB da agência cabe em três linhas aqui.

### Nível 1 · legível

A fonte vira texto: transcrição, OCR, export. Continua bruto, só ficou lida por máquina.

O texto vai para `capturas/` com cabeçalho de origem e `type: Capture`, sem `_organized` (é isso
que mantém a captura no Inbox até ela virar átomo). O original fica intocado onde estava.

Gravação é a skill `/transcrever`. Ela produz nível 1 e para ali.

### Nível 2 · indexado

A fonte ganha etiqueta no topo do arquivo em `capturas/` e uma linha no índice da fonte. Agora você
acha o que precisa sem reler tudo.

A etiqueta carrega quatro campos: o que aquilo é, a origem, a data e o caminho onde o original
ficou. Sem etiqueta, bruto é entulho com data de modificação.

### Nível 3 · destilado

A fonte vira átomo: afirmação, citação literal com origem, o sentido em uma ou duas linhas, os elos.

Chega até aqui só o que uma decisão vai citar. Quem executa é a `/guardar`, e reunião é a `/call`.
Aqui a aprovação humana é plena: você mostra o átomo destilado e espera o "guardo assim?".

### Nível 4 · operacional

O destilado vira régua, decisão ou procedimento. Ele muda o próximo trabalho, não só a memória.

Este é o nível mais caro e o mais raro. Reserve para o padrão que você já viu se repetir, com
aprovação explícita de quem responde pelo resultado.

## O caminho, sempre o mesmo

1. **Capturar.** O bruto entra como entrou. Nada se converte à força.
2. **Etiquetar.** Os quatro campos da etiqueta, logo na entrada.
3. **Extrair.** Só o que o nível acordado pede.
4. **Aprovar.** Até o nível 2, você confirma a gravação ("registro assim?"). Nos níveis 3 e 4, a
   aprovação é de memória: o átomo ou a régua só existe depois do sim.
5. **Devolver ao trabalho.** O destilado volta no momento do uso. Destilado que ninguém recupera é
   arquivo morto com formatação melhor.

Captura manual é o padrão. Quando a mesma fonte chega pela terceira vez, aí sim vale propor rotina
que captura e etiqueta sozinha, com o gate humano intacto no tratamento.

## A tabela por formato

O que se extrai depende do formato. O nível típico é ponto de partida, e a pergunta única sempre
ganha dele.

| Formato de entrada | O que se extrai | Nível típico | Por quê |
|---|---|---|---|
| Planilha ou CRM | O padrão lido nos números, com a data da leitura e o recorte | 2 a 3, nunca a tabela inteira | O banco conta, o cérebro guarda o padrão lido nos números. Tabela virando nota é dado duplicado e vencido |
| Reunião ou call | Entra como áudio e vira transcrição. Para cada decisão, dono, prazo, objeção e número, o minuto que a sustenta | 1, sobe a 3 quando virar decisão | Transcrever é nível 1: virou legível, parou. Quem sobe para destilado é a `/call`, com aprovação |
| Áudio ou vídeo (aula, podcast) | Transcrição em bloco para ler e timestamp de palavra quando for cortar vídeo | 1 | Uma gravação, duas saídas, e nunca se transcreve duas vezes: timestamp refeito quebra a citação já feita |
| Grupo de mensagens (WhatsApp) | A decisão e a objeção em linguagem literal, com data e papel de quem falou | 0 a 2 | PII em cada linha. Sanitize antes de qualquer gravação, e prefira o trecho ao histórico |
| Proposta ou contrato (PDF) | Escopo, valor, prazo e as cláusulas que mudam decisão, cada uma com a página | 0, e 3 quando for citado | PDF continua PDF. Converter o arquivo inteiro em markdown não melhora a recuperação, aumenta a conta |
| E-mail | O pedido, o que ficou combinado, a data e quem respondeu por quê | 0 a 2 | A thread inteira mora na caixa de entrada. Só o combinado precisa estar recuperável |
| Site ou concorrente | Promessa, oferta, preço público e a data da consulta | 2 | Página muda sem avisar. Sem a data da consulta, a nota não dá para comparar depois |
| Print ou imagem | O texto por OCR e, em uma linha, o que a imagem prova | 1 | A imagem é a evidência. O texto extraído é o que torna a evidência achável |
| Drive ou acervo de mídia | Onde mora, quem é o dono, o que tem dentro em uma linha por pasta | 0 | Copiar um drive inteiro para dentro é a forma mais rápida de contaminar a recuperação |

## Número tem casa própria

Planilha e CRM continuam sendo a casa dos números. O cérebro guarda o padrão que você leu neles,
com a data e o recorte, e aponta para a casa.

Quando precisar cruzar o banco com o cérebro, cruze por ID opaco. Nunca por nome de pessoa.

## PII fica fora da nota

Antes de gravar qualquer coisa, varra e-mail, telefone, nome de cliente, @, CPF e CNPJ. Dado
pessoal vai para `privado/` ou fica de fora, e nunca entra em `capturas/` nem em `meu-negocio/`.

## O custo de refinar

Cada nível acima do necessário cobra em três moedas: tokens na janela, atenção da pessoa que
aprova, e precisão na hora de recuperar. A terceira é a que dói mais tarde: quanto mais nota velha
e duplicada, menos o agente acha o que importa.

O agente trabalha pelo índice e pelos átomos, e abre o bruto só quando precisa checar um ponto
específico. É esse drill-down que faz 400 arquivos caberem numa conversa.

Refinar além do que o trabalho pede não organiza nada. Cobra token, cobra atenção, e devolve uma
nota que ninguém vai recuperar.

## Quatro erros que custam caro

- **Tratar tudo.** Você gasta a semana destilando e a recuperação piora, porque o sinal afundou no
  volume.
- **Copiar o drive inteiro.** Ponteiro mais índice resolvem. Cópia cria uma segunda casa da verdade
  que ninguém atualiza.
- **Link sem trecho.** Decisão se sustenta em citação literal com origem. Apontar a pasta onde o
  arquivo mora não sustenta nada.
- **Bruto sem etiqueta.** Arquivo em `capturas/` sem origem e sem data é lixo com nome bonito em
  seis meses.

## Como você sabe que funcionou

A prova está na resposta: você pergunta algo do negócio, o cérebro devolve o trecho citado com a
origem, e você reconhece a fonte. Contagem de notas prova volume, nada mais.

Isso é o que o `/teste` mede todo mês, com as suas cinco perguntas-canário. Resposta fraca aponta
um buraco e a fonte capaz de tapá-lo.

## O executável da régua

Esta régua tem uma skill que a executa: **`/fonte`**. Ela identifica o que chegou, faz a pergunta
única, recomenda o nível com o custo em uma linha, executa até ali e para.

Quando a dúvida for "isso merece tratamento?", a decisão é da `/fonte`. A `/guardar` entra no nível
3, quando o trabalho já pede átomo, e a `/transcrever` entrega o nível 1 de qualquer gravação.

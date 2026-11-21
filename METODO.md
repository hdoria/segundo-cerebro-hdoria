---
tipo: metodo
versao: 1.45.0
publicado: 2026-11-21
---

# O método, versão curta

O Cérebro tem um método com nome: **Engenharia de Contexto**. A ideia que sustenta tudo é fácil de dizer e difícil de praticar. O resultado que a IA entrega depende muito mais do contexto que ela recebe do que da frase que você digita.

O modelo é o mesmo pra você e pro seu concorrente. O contexto do seu negócio só você tem. O método é a maneira de guardar esse contexto num formato que a IA consegue usar sem inventar.

Esta é a versão de uma sentada. A longa, com os porquês, está em [METODO-COMPLETO.md](METODO-COMPLETO.md).

## A unidade: o átomo

Um **átomo** é uma nota de uma ideia só, com quatro partes:

1. **A afirmação**, no título. A frase que diz o que a nota afirma.
2. **A citação literal** da fonte, entre aspas, com a origem.
3. **O por quê**, uma ou duas linhas sobre a consequência pro negócio.
4. **Os elos**, que ligam essa nota ao resto do cofre.

A citação é a prova. Átomo sem citação não existe, vira palpite da IA com cara de fato. É essa regra que impede o Cérebro de inventar. Quando não tem trecho pra citar, a resposta diz que não consta na fonte.

Uma afirmação que funciona: "Cliente que pede desconto na primeira call fecha quando a proposta separa implantação de mensalidade." Uma que não funciona: "Anotações sobre preço." A segunda não afirma nada, então ninguém consegue conferir nem contradizer.

## Quatro memórias, quatro casas

| Memória | O que guarda | Onde fica |
|---|---|---|
| Trabalho | a conversa aberta agora | a janela da sessão, volátil |
| Episódica | o que aconteceu, com data | `capturas/` e `meu-negocio/dailies/` |
| Semântica | o que é verdade hoje | os átomos e as áreas de `meu-negocio/` |
| Procedural | como o trabalho se faz | as Skills e os Sistemas |

**Higiene de sessão:** abra uma conversa nova para cada tarefa. A memória de trabalho não persiste. Só o que você grava em arquivo volta amanhã.

## Cinco verbos, quatro movimentos

O ciclo inteiro são cinco verbos: **capturar → destilar → estruturar → operar → medir**.

Na rotina você vê quatro movimentos, que são a cara desses verbos. **Capturar em átomos** cobre capturar e destilar. **Organizar por uso** e **Conectar leve** cobrem estruturar. **Buscar citando** é operar. Medir mora nos Relógios.

### Organizar por uso

Quatro horizontes decidem onde cada coisa vai: agora (`fios/`, o que está quente), as áreas perenes do negócio (oferta, ICP, posicionamento, o que funciona, decisões), as referências que vêm de fora e o arquivo do que esfriou. Em cima disso, dois eixos de atalho: **Fios** por tema quente e **Gente**, uma página por cliente, parceiro ou concorrente. E o **Mapa**, o negócio numa página, onde toda resposta estratégica começa.

Você nunca escolhe pasta por assunto. O horizonte decide.

### Capturar em átomos

Tudo entra cru em `capturas/`, a bandeja. Esse material é o **Bruto**: fica íntegro, não se reescreve e não se apaga. O agente não lê o Bruto por padrão. **Destilar** é o passo em que o que tem sinal (uma dor, uma decisão, um número, uma objeção, um padrão que repetiu) sai do Bruto e vira átomo. O resto continua guardado e frio.

### Conectar leve

O óbvio você linka. O resto o Cérebro propõe e você decide. A IA aqui amplifica o seu pensamento. Linkar é pensar.

### Buscar citando

Você pergunta em português normal. A resposta vem com os trechos citados das suas notas, nunca com um amontoado do Bruto jogado na janela.

## A regra de ouro

O Cérebro **opera átomos citados** e nunca engole o Bruto inteiro. A irmã dessa regra: **o arquivo guarda muito, a conversa recebe pouco**. Guardar tudo é barato e está certo. Despejar tudo na janela é o que produz resposta inventada com tom de confiança.

## Quanto tratar cada coisa

Chegou um PDF, uma pasta, um áudio, um export de CRM. Uma pergunta resolve, e ela trata de trabalho, nunca de importância: **"que trabalho real vai sair disso?"**

A resposta cai num **Nível de refino**:

| Nível | Quando | O que você faz |
|---|---|---|
| 0 · **Ponteiro** | não sei ainda | registra onde está, e para |
| 1 · legível | vou buscar dentro | transcreve, passa OCR, exporta pra texto |
| 2 · indexado | preciso achar sem ler tudo | etiqueta o que é, de onde veio, o que tirar dali |
| 3 · destilado | vai ser citado numa decisão | vira átomo com `/guardar`, ou `/call` se for reunião |
| 4 · operacional | muda o próximo trabalho | vira régua, decisão ou procedimento, com sua aprovação |

Parar no **Ponteiro** é uma saída boa. Subir de nível sem trabalho que justifique é desperdício. A régua completa, formato por formato, está em [FONTES.md](FONTES.md), e `/fonte` é ela rodando.

**Quando tratar:** decisão, na hora. O dia, na `/daily`. Reunião, em até 48 horas, com `/call`. Acervo acumulado, no `/reindex` da semana. Ruído, nunca.

As 48 horas têm motivo. Seu julgamento sobre o que importou hoje expira rápido. Lido frio, duas semanas depois, o mesmo material rende átomo raso.

## Os Relógios

| Quando | Skill | Tempo | O que sai |
|---|---|---|---|
| Todo dia | `/daily` | 5 a 10 min | o rollup do dia e no máximo 3 a 5 átomos |
| Toda semana | `/reindex` | 30 a 45 min | a bandeja em zero, os Fios conferidos e a semana escrita |
| Todo mês | `/revisar` | teto de 20 min | o que ainda vale e o que morreu |
| Todo mês | `/teste` | teto de 20 min | a nota do Cérebro contra a Régua |

Dia sem sinal rende zero átomo, e está ok. A semana se escreve a partir das dailies. Reler o Bruto de novo é retrabalho com julgamento pior. `/call` fica fora da tabela porque é gatilho por evento: você saiu da reunião, trata em até 48 horas.

## Frescor e Régua

**Frescor** é o campo `confirmed:` em cada nota do seu negócio, a data da última vez que você olhou e disse que aquilo continua valendo. O `/revisar` caça o que passou de 60 dias e o que se contradiz. Três saídas: vale (atualiza a data), mudou (você edita junto) ou morreu. Nota morta recebe `status: Superseded` e `superseded_by` apontando pra que a substituiu. Nada se deleta. Nota superada volta só como histórico, nunca como fato vigente.

**Régua** é como você mede o Cérebro. No `/teste`, cinco **Perguntas-canário** fixas, do tipo que um sócio de anos saberia responder. Cada resposta recebe uma nota sua, num de três degraus: **em branco → estagiário → sócio**. As cinco não mudam de mês pra mês (pode entrar uma sexta), porque régua que muda não mede nada. Cada resposta fraca aponta um buraco e a fonte capaz de tapá-lo.

## De átomo a Sistema

Átomo dá verificabilidade: você sabe de onde veio cada afirmação. **Sistema** dá a outra metade, repetibilidade: o mesmo resultado sai de novo semana que vem, sem depender de quem lembrou de fazer.

Um Sistema é um pacote de resultado. As peças, em uma linha cada:

- **Pipeline**: os passos que vão da fonte real até o output.
- **Rotina**: o que dispara o Pipeline (um horário, um evento, sua mão).
- **Skill**: o procedimento que o agente segue, escrito em texto.
- **Conexão**: a porta pra uma fonte ou ferramenta que vive fora do cofre.
- **Eval**: a régua que diz se aquela execução acertou, uma parte automática e uma parte sua.
- **Self Improvement**: o feedback versionado que muda a próxima execução.

O ciclo vai de fonte real até nova medição: o Pipeline roda, o Eval julga, fica um recibo local, o feedback entra e a próxima rodada já sai diferente. Tudo que escreve fora ou decide algo passa por você antes. **Self Improvement** nunca é o motor se reescrevendo sozinho. Uma correção isolada fica local, três casos comparáveis habilitam uma mudança pequena, e a promoção exige comparação, sua aprovação, versão e rollback.

O protocolo é um só, vale pro Sistema da empresa (proposta, cobrança, atendimento) e pro uso pessoal (sua esteira de conteúdo, seu estudo). O desenho completo, com as oito unidades, está em [METODO-SISTEMAS.md](METODO-SISTEMAS.md). Mudar algo num Sistema que já roda, sem enganar a si mesmo, está em [METODO-EXPERIMENTOS.md](METODO-EXPERIMENTOS.md).

## Motor vs contexto

Uma instalação tem duas pastas. **Motor vs contexto** é a separação que faz atualização ser segura: o motor é o produto (método, skills, templates, scripts) e o contexto é seu (notas, capturas, Sistemas instalados). O `/atualizar` reescreve o motor e reprojeta as skills. Suas notas ficam intactas.

Essa mesma separação diz onde está a sua privacidade. O conteúdo das notas fica na sua máquina. A telemetria é técnica, opcional e desligável, e não leva conteúdo de nota.

**Contribuição** é o caminho de volta pra comunidade, com três consentimentos separados: preparar o pacote anonimizado, aprovar o que vai nele e enviar. Nenhum dos três acontece sem o seu sim.

## As skills

| Skill | Quando usar |
|---|---|
| `/comecar` | primeira sessão, ativa o Cérebro Base com uma fonte real sua |
| `/metodo` | entender o método e aplicar num caso seu agora |
| `/fonte` | chegou material e a dúvida é tratar ou não tratar |
| `/guardar` | virar um material em Átomo agora |
| `/call` | reunião vira decisões, ações e memória citável |
| `/daily` | fechar o dia |
| `/reindex` | fechar a semana e zerar a bandeja |
| `/revisar` | checar o Frescor do mês |
| `/teste` | medir o Cérebro contra as Perguntas-canário |
| `/arquiteto` | descobrir onde o Cérebro vira resultado e qual Sistema vem primeiro |
| `/sistematizar` | trabalho recorrente vira Sistema local |
| `/operar` | rodar um Sistema instalado de ponta a ponta |
| `/prototipar` | desenhar o comercial e a entrega do negócio |
| `/auditar-cerebro` | diagnóstico somente leitura do que já existe |
| `/migrar-cerebro` | trazer um Cérebro antigo ou artesanal |
| `/transcrever` | áudio ou vídeo vira texto com timestamp |
| `/atualizar` | saiu versão nova do motor |

Os termos da casa, um por linha, estão em [GLOSSARIO.md](GLOSSARIO.md). Use sempre eles ao falar do método.

## O próximo passo

Rode `/metodo` e peça pro Cérebro aplicar isso numa coisa sua de verdade: a call de ontem, a decisão da semana, o último anúncio que você escreveu. Ler o método ensina bem menos que ver um átomo seu nascer.

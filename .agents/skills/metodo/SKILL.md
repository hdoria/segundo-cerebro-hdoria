---
name: metodo
description: Explica o método do cérebro (os 4 movimentos, o átomo e os Relógios de dia, semana e mês) e ajuda a pessoa a aplicar no contexto dela. Use quando ela pergunta "como funciona", "qual o método", "como organizo", "como guardo", ou quer entender como construir o cérebro dela.
---

# O método do cérebro: explique e aplique

O método se chama **Engenharia de Contexto**: o resultado da IA depende mais do contexto que ela recebe do que da frase que a pessoa digita. Diga isso numa linha e vá para o prático.

Objetivo: a pessoa entender o método em 2 minutos e **aplicar numa coisa real dela agora**. Fale curto, sem jargão, e termine oferecendo rodar num exemplo dela. A versão longa está em `<motor>/METODO-COMPLETO.md` (`<motor>` é a pasta que `node .cerebro/bin/cerebro.mjs motor-path` imprime); use só se ela pedir os porquês.

## O ciclo

O método são **cinco verbos: capturar → destilar → estruturar → operar → medir**. No dia a dia eles aparecem como quatro movimentos:

1. **Organizar por uso.** Quatro horizontes decidem onde cada coisa vai: agora (`fios/`, o que está quente), as áreas do negócio (oferta, ICP, posicionamento, o que funciona, decisões), as referências que vêm de fora e o arquivo do que esfriou. A pessoa nunca escolhe pasta por assunto.
2. **Capturar em átomos.** Tudo entra cru em `capturas/` (o Bruto). O que tem sinal vira **átomo**, uma nota de uma ideia só: a **afirmação** no título, a **citação literal** da fonte com a origem, uma ou duas linhas de **por quê** e os **elos**. Átomo sem citação não existe.
3. **Conectar leve.** Ela linka o óbvio e o cérebro propõe o resto. Quem decide é ela.
4. **Buscar citando.** Ela pergunta em português normal e a resposta vem com os trechos citados das notas dela. Sem trecho, a resposta diz que não consta.

## Os Relógios

Cada cadência tem uma skill:

- **Todo dia, 5 a 10 min:** `/daily`. O dia vira contexto enquanto o julgamento dela ainda está quente.
- **Saiu de reunião:** `/call` em até 48 horas. Depois disso o material rende átomo raso.
- **Toda semana, 30 a 45 min:** `/reindex`. Bandeja em zero, Fios conferidos e a semana escrita a partir das dailies.
- **Todo mês:** `/revisar` para o Frescor (o que vale, o que mudou, o que morreu e vira `Superseded`) e `/teste` para a Régua (as cinco Perguntas-canário, de **em branco → estagiário → sócio**).

## A regra de ouro

O cérebro **opera átomos citados** e nunca engole o Bruto inteiro. A irmã dela: **o arquivo guarda muito, a conversa recebe pouco**. Guardar tudo em `capturas/` é barato e está certo. Despejar tudo na conversa é o que produz resposta inventada com tom de confiança.

## Depois de explicar

Ofereça: *"quer que eu pegue uma coisa sua de verdade (uma call, uma decisão, um anúncio) e transforme num átomo agora, para você ver o método rodando?"* Se ela topar, conduza com `/guardar`.

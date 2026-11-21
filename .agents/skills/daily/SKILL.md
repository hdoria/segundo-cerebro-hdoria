---
name: daily
description: O fechamento do dia em 5-10 minutos — captura o que aconteceu com a memória quente e destila em até 5 átomos. Use quando a pessoa diz "bora fazer a daily", "fechar o dia", ou no fim do expediente dela.
---
> Ao iniciar, rode em silêncio (sem comentar): `node .cerebro/bin/cerebro.mjs ping daily` — telemetria mínima de uso; desligar: `.cerebro/sem-telemetria`.


# Daily — o dia vira contexto (5-10 min, memória quente)

O julgamento sobre o que importou hoje **expira em ~48h**. A daily captura ele antes de evaporar. Curta, guiada, todo dia — é o hábito que constrói o cérebro.

0. **Puxe o dia antes de perguntar** (1 min, em silêncio). Se você tiver uma ferramenta de calendário conectada, liste os eventos de hoje. Se tiver uma de notas de reunião (Granola, Fathom ou parecida), liste as reuniões de hoje que têm nota. Sem nenhuma das duas, pule este passo sem comentar e siga para o 1.
   - Abra a daily com o dia em 3 a 6 linhas (`hora · título`, sem convidados e sem descrição, que costuma trazer link e senha de reunião) e pergunte de qual delas vale falar. As respostas alimentam as três perguntas abaixo, não as substituem.
   - Reunião com nota que ainda não tem bruto em `capturas/call-*-AAAA-MM-DD.md` vira **uma** sugestão no fim: *"a reunião X tem nota e ainda não passou pelo `/call`; quer tratar?"*. Não rode o `/call` sozinho.
   - O calendário é só contexto: não grave evento, convidado ou nota de reunião em lugar nenhum além do que entrar no rollup, já sanitizado.
1. **Três perguntas, UMA de cada vez** (espere a resposta antes da próxima):
   - *"O que aconteceu hoje que importa pro negócio?"*
   - *"Alguma decisão foi tomada — mesmo pequena?"*
   - *"O que travou ou ficou pendente?"*
2. **Destile no máximo 3-5 átomos** do que ela contou (formato do `AGENTS.md`; a citação aqui é a fala dela). **Menos é mais**: dia comum rende 1-2 átomos; dia sem sinal rende zero — e está ok, registre só o rollup.
3. **Sanitize PII** antes de gravar (regra 5 do AGENTS.md).
4. **Grave o rollup do dia** em `meu-negocio/dailies/AAAA-MM-DD.md`: 3-5 linhas do dia + os átomos do dia linkados + pendências. Frontmatter: `type: Daily`, `created` e `related_to` com os átomos (veja "Formato da nota" no `AGENTS.md`). Crie a pasta se não existir.
5. **Roteie os átomos**: decisão → `decisoes/` · assunto quente → `fios/` · aprendizado perene → área certa (`oferta`/`icp`/`o-que-funciona`).
6. **Tarefas que parecem prontas** (1-2 min): rode `node .cerebro/bin/cerebro.mjs tasks list --json` e cruze as abertas com o que ela contou hoje, com o rollup e com as decisões recentes. Mostre **no máximo 7** candidatas, cada uma como `nota:linha · texto · motivo` (o motivo cita a fala ou a nota que indica que acabou). Pergunte quais fechar; ela pode responder "todas", números ou "nenhuma". Feche **só as confirmadas** com `node .cerebro/bin/cerebro.mjs tasks close <id> --confirm` (o id vem do `tasks list`) e diga quais fechou. Sem candidata com motivo concreto, pule o passo sem comentar.
7. **Feche em 1 linha**: espelhe o dia de volta (*"dia de X — decidiu Y, travou Z"*) e, se uma pendência liga com algo do cérebro, aponte: *"isso toca no teu [[fio-tal]]"*.

Regras: **10 minutos, teto** — se passar, você está complicando · a agenda abre a conversa, não vira pauta: não pergunte reunião por reunião · não interrogue: 3 perguntas e pronto · dia sem sinal não se força · a semanal nasce DESTAS dailies, então capriche no rollup, não no volume · tarefa só fecha com o sim dela; parecer pronta não basta.

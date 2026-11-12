---
name: call
description: Transforma uma call ou reunião real em decisões, ações, dores, números e memória citável, com aprovação e eval. Use quando a pessoa cola uma transcrição, aponta um arquivo, diz “trata essa call” ou opera o sistema Calls em Decisões.
---

# Call — reunião vira decisão

Quando usada como primeira vitória ou via `operar`, leia antes `<motor>/sistemas/calls/manifest.md`,
`pipeline.md` e `evals.md` (`<motor>` é a pasta impressa por `node .cerebro/bin/cerebro.mjs motor-path`).

## Pipeline

1. **Receba a fonte.** Transcrição colada ou arquivo. Pergunte somente o cabeçalho que realmente
   falta: data e objetivo. Identifique participantes por papel, não por PII.
2. **Proponha o bruto.** Mostre o caminho `capturas/call-<assunto>-AAAA-MM-DD.md`, explique a
   sanitização e peça aprovação antes de gravar. Depois de salvo, o bruto é imutável.
3. **Garimpe nesta ordem:**
   - decisões e racional;
   - compromissos com dono e prazo;
   - pendências sem dono;
   - objeções e dores em linguagem literal;
   - números confirmados;
   - frases que destravaram a conversa.
4. **Prove cada achado.** Citação literal + timestamp quando existe. Sem prova, marque
   `(não consta na fonte)`. Citação de algo que a pessoa rejeita não vira posição dela.
5. **Mostre os candidatos de uma vez.** Pergunte “guardo assim?”. Só grave os aprovados. Call longa
   pode ter principais + reserva; aula pode ter também um destilado de estudo, claramente separado.
6. **Roteie:** decisões → `meu-negocio/decisoes/` (`type: Decision`); assunto quente → `meu-negocio/fios/` (`type: Thread`, `status: Active`); padrão de
   cliente/oferta → arquivo correspondente; pessoa-chave → `meu-negocio/gente/` (`type: Person`) sem PII.
7. **Passe pelo gate que não mente.** Quando scripts estiverem naturalmente disponíveis, rode
   `node .cerebro/bin/cerebro.mjs eval-calls <fonte> <garimpo>` sobre o candidato ANTES de perguntar "você
   usaria?" — corrija violações e rode de novo; o que chega na régua humana já passou pela
   determinística. Sem scripts, aplique a checklist do `<motor>/sistemas/calls/evals.md` manualmente
   (e não a chame de verificada). Nunca trate o gate como pedágio pra pessoa: ele é seu, não dela.
8. **Avalie.** Aplique a régua humana de `<motor>/sistemas/calls/evals.md` e devolva o controle para
   `operar` fechar o recibo.

## Armadilhas

- Número ambíguo de transcrição pede confirmação.
- Nome próprio estranho não é propagado.
- “Se der” não é compromisso.
- Resumo genérico não substitui decisões e ações.
- Call sem sinal pode terminar só com bruto aprovado e eval “não”; isso é dado honesto.

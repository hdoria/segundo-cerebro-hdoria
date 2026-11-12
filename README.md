# Cérebro hdoria

Motor e Console do segundo cérebro do Hugo Doria. Repositório público (`hdoria/segundo-cerebro-hdoria`).

Este repositório guarda só código, skills e o seed fictício. O contexto real fica no vault `hugo-os`, que o Console lê pelo `--root`. As pastas `meu-negocio/` e `operacao/` daqui são exemplo e nunca recebem dado do vault.

## Instalar em duas pastas

Uma instalação tem o **vault** (notas, o que se abre no Tolaria ou Obsidian) e o **motor** (este código). O vault guarda só dado do dono mais a projeção oficial (skills, lançador `.cerebro/bin/cerebro.mjs`, ponteiro `.cerebro/motor`, `AGENTS.md`).

```bash
node scripts/install.mjs --tag vX.Y.Z --vault ~/Cerebro/notas --motor ~/Cerebro/motor          # prévia
node scripts/install.mjs --tag vX.Y.Z --vault ~/Cerebro/notas --motor ~/Cerebro/motor --apply
cd ~/Cerebro/notas && node .cerebro/bin/cerebro.mjs console   # abre o Console sobre o vault
node .cerebro/bin/cerebro.mjs update --tag vX.Y.Z             # atualiza motor e vault com um plan_hash
```

O contrato que o agente segue dentro de um vault fica em `templates/vault/AGENTS.md`; o `CLAUDE.md` desta raiz é instrução de desenvolvimento. A pasta única (`update.mjs --root`) segue atualizável por compatibilidade, mas não é mais instalada.

## Rodar o Console

Requisito: Node.js 20+.

```bash
npm ci
npm run build:console
node scripts/console-server.mjs --root=/caminho/para/hugo-os
```

Abre `http://127.0.0.1:4782` (troque com `--port=`). Navegar não chama modelo. Rodar, ativar, pausar ou retomar uma rotina pede confirmação, e a Caixa de Julgamento só abre um output por gesto explícito.

O que o Console cobre hoje:

- Hoje, Cérebro (memória, recuperação, aprendizado, saúde) e Sistemas.
- Rotinas com verificação antes de executar, agenda local ou externa e recibos.
- Biblioteca de notas do vault, com leitura formatada e edição como ação explícita.
- Ferramentas conectadas (MCPs do Claude Code), Telegram e Hermes local ou remoto via SSH.

## Desenvolvimento

```bash
npm test                     # validação completa do produto
npm run check:sensitive-data # varredura de PII e segredos
npm run setup:hooks          # hooks locais de proteção de push
```

Antes de contribuir, leia [as regras de fixtures e proteção de push](docs/guides/safe-fixtures.md). Issues e specs ficam no repo privado `hdoria/hugo-os-lab` (ver [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)). Histórico de versões em [`CHANGELOG.md`](CHANGELOG.md).

## Estrutura

```
console/      interface localhost, derivada dos contratos e recibos
scripts/      motor, servidor do Console, rotinas, sync com o vault e testes
skills/       catálogo humano; o executável vive em .claude/skills/ e .agents/skills/
sistemas/     pacotes de resultado (manifest, pipeline, evals, changelog)
protocol/     contratos comuns: Capability, System Contract, Run Record
meu-negocio/  seed fictício (o real está no vault)
```

## Origem e upstream

A base é um projeto open source sob licença MIT, com atribuição em `LICENSE` e `NOTICE`. Mudanças de lá entraram por integração seletiva, registrada em [`docs/guides/upstream-alignment.md`](docs/guides/upstream-alignment.md) e em `.cerebro/upstream-baseline.json`. A tela da comunidade Vibe Makers está escondida do menu (issue #21 no `hugo-os-lab`).

## Privacidade e telemetria

O conteúdo do vault, as fontes e os outputs ficam nesta máquina. Ao executar uma rotina com Claude ou Codex, só o contexto necessário vai ao provider escolhido, e esse envio não entra no Git, na telemetria nem nos recibos.

Os helpers `.agents/scripts/ping.mjs` e `activate.mjs` enviam eventos técnicos de ativação (versão, sistema operacional, evento), sem conteúdo, para `https://cerebro.vibemakers.com.br` (rotas `/cerebro-ping` e `/cerebro-install-activation`). `CEREBRO_API_URL` troca o destino. Falha de envio é silenciosa e nunca interrompe o trabalho. Para desligar:

```bash
export CEREBRO_TELEMETRY=off   # ou: touch .cerebro/sem-telemetria
```

## Licença

Motor MIT ([`LICENSE`](LICENSE)). Conteúdo herdado em CC BY-NC 4.0, com o mapa exato em [`LICENSE-CONTEUDO.md`](LICENSE-CONTEUDO.md). A proveniência e as licenças do projeto original continuam preservadas.

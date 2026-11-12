# Cérebro hdoria: instruções de desenvolvimento do motor

Este repositório é o **motor** do produto (código, Console, protocolo, templates, skills e docs).
O contrato que o agente segue dentro de um cérebro NÃO está aqui: ele vive em
`templates/vault/AGENTS.md` e é projetado no `AGENTS.md` de cada vault. Aqui valem as regras de quem
desenvolve o motor.

## Duas pastas

Uma instalação tem o **vault** (notas, o que a pessoa abre no Tolaria ou Obsidian e onde roda o
agente) e o **motor** (este código). O vault guarda só dado do dono, mais a projeção oficial: skills
em `.claude/skills/` e `.agents/skills/`, `.cerebro/bin/cerebro.mjs`, o ponteiro `.cerebro/motor`, o
bloco gerenciado do `AGENTS.md` e `CLAUDE.md`/`GEMINI.md` de uma linha. Os testes `test-split-roots`,
`test-projection` e `test-split-install` documentam o comportamento.

- Instalar: `node scripts/install.mjs --tag vX.Y.Z --vault <dir> [--motor <dir>] [--apply]`.
- Atualizar: `node scripts/update.mjs --tag vX.Y.Z --vault <dir> [--motor <dir>] [--apply --approve-plan HASH]`.
  `--root` (pasta única) segue funcionando só por compatibilidade e recusa motor ou vault de instalação
  dividida e só vale na raiz de uma instalação de pasta única existente (subpasta de vault ou de motor é
  recusada). Vault sem ponteiro (clone, motor movido) religa com `--vault <v> --motor <m> --link`: prévia,
  hash aprovado e só então o ponteiro mais a reprojeção do que já é do produto (skills, lançador, bloco do
  `AGENTS.md`, `.gitignore`), sem seeds. `--link` só aceita vault já projetado (bloco gerenciado do `AGENTS.md`,
  manifesto `company-brain` ou `projection-state.json`); `--motor` diferente do ponteiro também exige `--link`.
- Scripts que gravam dado do dono resolvem a raiz por `scripts/lib/installation.mjs` e nunca gravam
  no motor. Skills chamam o motor por `node .cerebro/bin/cerebro.mjs <comando>`, nunca por
  `node scripts/...`.
- Mudou `.claude/skills/`? Rode `node scripts/sync-agent-skills.mjs`. Mudou o contrato do produto?
  Edite `templates/vault/AGENTS.md`, não este arquivo.
- O vault real do Hugo (`~/projects/hugo-os`) é somente leitura para o desenvolvimento. Não mova nem
  renomeie `scripts/vault-sync.mjs` (a skill `cerebro` de lá o chama) e não mude o parsing em
  `scripts/vault-*.mjs` e `scripts/lib/vault-*.mjs`.

## Verificação antes de entregar

```bash
npm test
npm run check:sensitive-data
for t in scripts/test-*.mjs; do node "$t" >/dev/null 2>&1 || echo FALHOU $t; done
```

## Regras

- Sem PII, sem dado de vault em código ou fixtures. Fixtures são sintéticas.
- Texto novo para o usuário em português, sem travessão e sem emoji.
- Conventional Commits, um por mudança lógica. Fechamento padrão: commit, push e merge na main.
- Antes de alterar o Company Brain Console, leia `DESIGN.md`. O Canvas é uma vista derivada de
  contratos, recibos e traces locais: beleza nunca autoriza inventar estado nem criar uma segunda
  casa da verdade.
- Contrato em `.cerebro/contracts/` é compilado das notas em `sistema/`. Corrija a nota canônica,
  nunca só o JSON gerado. Antes de destravar uma rotina, confira se ela já roda por outro caminho.
- Tela desatualizada: compare raiz efetiva do processo, arquivo salvo, resposta HTTP e tela antes de
  culpar cache. Não acrescente polling para divergência não reproduzida.
- Estado do negócio se lê no vault que o Console usa (`--root`), nunca no seed deste repo.

## Agent skills

### Issue tracker

Issues e specs desta cópia vivem nas GitHub Issues do repo privado `hdoria/hugo-os-lab`, separadas do código em `hdoria/segundo-cerebro-hdoria` (público). See `docs/agents/issue-tracker.md`.

### Triage labels

Rótulos padrão: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; o glossário do domínio hoje é o `GLOSSARIO.md`. See `docs/agents/domain.md`.

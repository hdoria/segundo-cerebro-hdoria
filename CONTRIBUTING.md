# Contribuir

O Cérebro tem duas camadas, e cada uma recebe contribuição de um jeito:

## Motor (MIT) — PRs bem-vindos

Scripts, skills, protocolo, templates, testes. Antes de abrir PR grande, abre uma
issue em <https://github.com/hdoria/segundo-cerebro-hdoria/issues>
contando o que quer mudar — o motor segue o método (evidência antes de automação;
aprendizado só cristaliza com três runs comparáveis + aprovação humana), e PRs que
pulam esses degraus não entram, mesmo bons.

## Conteúdo (CC BY-NC) — curadoria da casa

O método escrito carrega a voz e o trabalho de campo do projeto original. Erros,
lacunas e sugestões: abre issue. Contribuições de conteúdo da comunidade têm casa
própria — `comunidade/minhas-contribuicoes/` no teu Cérebro prepara o pacote e a comunidade
julga (é o fluxo `contribution_prepared → contribution_approved`).

## Bugs

Issue com: agente usado (Claude Code / Codex / Gemini / Antigravity), versão
(`cat VERSION`), o que esperava e o que aconteceu. Saída de `node .agents/scripts/ping.mjs
--diagnose` ajuda quando o problema é de telemetria.

## O que não aceitamos

- PII de terceiros em qualquer arquivo versionado.
- Automação que decide sem deixar rastro auditável.
- Conteúdo gerado por IA apresentado como fonte primária — aqui só entra fonte humana
  rastreável; a IA processa, não inventa.

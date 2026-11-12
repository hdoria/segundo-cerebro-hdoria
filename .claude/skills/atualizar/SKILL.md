---
name: atualizar
description: Prepara a atualização do motor e a reprojeção do vault por tag explícita, mostra os conflitos e aplica o plano aprovado preservando personalizações e contexto do negócio.
---

# Atualizar o Cérebro

Use sempre `você`, `seu` e `sua`. Atualize a partir de uma versão exata escolhida pelo dono.
`latest` serve apenas para descobrir novidades; não é endereço de aplicação. Nunca use `main`,
fallback de branch ou o atualizador antigo para fazer a primeira passagem segura.

A instalação tem duas pastas: o **vault** (onde você está) e o **motor** (código). A atualização
troca o código do motor e reprojeta o vault (skills, lançador `.cerebro/bin/cerebro.mjs`, ponteiro
`.cerebro/motor` e o bloco gerenciado do `AGENTS.md`) com um único `plan_hash`. Se o vault falhar
depois do motor, o motor volta ao estado anterior.

1. Descubra o motor com `node .cerebro/bin/cerebro.mjs motor-path` (`<motor>`). Leia
   `<motor>/VERSION`, a fonte em `<motor>/.cerebro/source` e a seção de atualização em
   `<motor>/COMECE-AQUI.md`. A versão projetada fica em `.cerebro/version` e no ponteiro `.cerebro/motor`.
2. Escolha a tag publicada (`vX.Y.Z`) e confira release, tag, commit e changelog do repositório
   declarado em `<motor>/.cerebro/source`. Um `VERSION` no checkout não comprova publicação. Este fork
   tem Console próprio: o lote atual importou orientações seletivamente via Git e preservou a
   interface. Uma atualização futura aplica o pacote escolhido e pode substituir `console/` e
   `scripts/` do motor; preservação do contexto privado não garante preservação do código do fork.
   Use Node.js 20+ já disponível; sem runtime, entregue o plano e pare antes da escrita.
3. Execute a prévia, sem `--apply`, a partir do vault:
   ```bash
   node .cerebro/bin/cerebro.mjs update --tag vX.Y.Z
   ```
   O lançador roda o `update.mjs` do motor com o vault como raiz. Mostre os arquivos que mudarão em
   cada pasta, os conflitos, a tag e o `plan_hash`. Sem recibo anterior do motor, forneça a cópia
   íntegra da versão instalada com `--baseline-dir`; arquivos diferentes dela são conflitos. Examine
   as mudanças de `console/` e `scripts/` mesmo sem conflito. Num checkout do fork (motor com `.git`),
   o Console sinaliza `git-checkout-update-protected`: preserve as escolhas do fork por integração
   seletiva via Git, conforme `<motor>/docs/guides/upstream-alignment.md`, em vez de aplicar o
   pacote upstream inteiro. Não aceite tudo automaticamente.
   - Conflito `vault:.claude/skills/...` ou `.agents/skills/...`: a skill foi editada no vault, ou
     uma pasta sua tem o mesmo nome de uma skill oficial. Nada é sobrescrito. Peça ao dono que
     renomeie a pasta ou mova a edição, e gere nova prévia.
   - O conteúdo fora do bloco gerenciado do `AGENTS.md` é do dono. `CLAUDE.md` e `GEMINI.md` do
     vault só são criados quando não existem. Um `AGENTS.md` legado sem marcadores é preservado
     inteiro e recebe o bloco novo ao final; proponha revisão de instruções duplicadas ou
     contraditórias, nunca as apague por conta própria.
   - `warnings` na prévia são avisos, não conflitos (por exemplo, um `CLAUDE.md` seu que não cita
     o `AGENTS.md`). Mostre à pessoa e sugira a linha; não edite o arquivo dela sem pedir.
   - Vault sem o ponteiro `.cerebro/motor` (clone em outra máquina, motor movido) é recusado. Para
     religar, a pessoa informa a pasta do motor e roda a prévia com `--link`; o comando completo é
     `node <pasta do motor>/scripts/update.mjs --vault <vault> --motor <pasta do motor> --tag vX.Y.Z --link`.
     Ele mostra os dois caminhos e o `plan_hash`, e só grava com `--apply --approve-plan`. O efeito
     real é o ponteiro mais a reprojeção do que já é do produto (skills oficiais, lançador, bloco
     gerenciado do `AGENTS.md`, regras de `.gitignore`); não planta seeds nem notas. `--link` só vale
     para vault que já foi projetado antes (bloco `CEREBRO:MANAGED` no `AGENTS.md`, manifesto
     `company-brain` ou recibo `.cerebro/projection-state.json`); outra pasta é recusada com "não é um
     vault do Cérebro". Trocar o motor de um vault que já tem ponteiro (`--motor` diferente) também
     exige `--link`.
4. Peça aprovação do plano concreto. Só então acrescente `--apply --approve-plan <plan_hash>`
   ao mesmo comando. O hash deve vir da prévia que a pessoa viu; mudança em arquivos ou pacote
   exige nova prévia e nova aprovação. Conflitos impedem aplicação mesmo com hash aprovado.
5. Confira `<motor>/VERSION`, `.cerebro/version`, o resultado e os backups em
   `<motor>/.cerebro/update-backups/` e `.cerebro/update-backups/`. Resuma as mudanças úteis. Os
   recibos `<motor>/.cerebro/update-state.json` e `.cerebro/projection-state.json` permitem distinguir
   futuras edições locais. Backups contêm conteúdo privado: nunca stage, upload ou compartilhamento.
6. Se aparecer `RUNTIME_LEGADO`, o arquivo privado de runtime precisa de migração separada antes
   de gravar estado no Console. Leia `<motor>/scripts/post-update.mjs`, apresente os caminhos e peça
   aprovação antes de executá-lo. O updater não executa código pós-update ou ping automaticamente.
7. Para abrir o Console deste fork, use o lançador do vault:
   ```bash
   node .cerebro/bin/cerebro.mjs console --port=4782
   ```
   O lançador usa o vault como raiz; não a troque pelo caminho do motor.
   Abra `http://127.0.0.1:4782` após conferir a saída. Porta ocupada pede outra com `--port=PORTA`.
   O botão de aplicar no Console desta cópia devolve `manual-update-preview-required`: use a
   prévia e o comando aprovado acima. Se uma atualização trocar o lançador, confira o pacote
   aplicado antes de orientar a abertura.
8. Retome `comecar` no ponto existente. A atualização do motor não cria uma credencial de
   instalação nem configura o servidor no cliente de IA. Se o dono quiser usar a comunidade,
   confira o vínculo seguro e siga `<motor>/docs/guides/community-mcp.md`,
   preservando as demais configurações e o acesso vigente à comunidade Vibe Makers.

Instalações antigas de pasta única seguem atualizáveis por `--root` por mais uma versão: use o
planejador seguro da tag nova em separado (`node /caminho/pacote/scripts/update.mjs --tag vX.Y.Z
--root /caminho/cerebro --baseline-dir /caminho/pacote-da-versao-instalada`) e proponha migrar para
o formato de duas pastas. Sem Node ou planejador seguro, pare sem escrever. Arquivos extras em
skills e diretórios são preservados; arquivos obsoletos não são apagados automaticamente.

Em falha, leia o resultado: antes da aplicação nada foi escrito; falha durante a escrita tenta
restaurar os arquivos do plano e mantém backup. Não prometa restauração completa em falta de disco
ou encerramento abrupto. Não remova locks ou backups sem conferir o processo e os arquivos.
O update não edita o contexto para resolver erro nem pede acesso à conta para poder continuar.

# Listar, instalar e melhorar sistemas no terminal

Este guia mostra como listar, instalar, melhorar e acompanhar sistemas da comunidade Vibe Makers usando só o terminal. Serve para quando o MCP não está disponível, quando você quer ver exatamente o que cada comando faz ou quando uma instalação ou um envio falhou e você precisa entender por quê.

Se você prefere conversar com a IA, o caminho equivalente está no [guia do MCP](community-mcp.md#conectar). Se o Cérebro ainda não está montado, comece pela [implantação assistida](implantacao-assistida.md).

Uma ressalva importante: instalar arquivos de um sistema não prova resultado no seu negócio. A instalação só põe o pacote no lugar. Quem mostra se funciona é o primeiro trabalho real.

## Como chamar os comandos

Todos os comandos usam o lançador, a partir da raiz do vault:

```bash
node .cerebro/bin/cerebro.mjs community <subcomando> [flags]
```

O lançador define `CEREBRO_INSTALL_ROOT` como o vault, e é isso que faz o comando achar a sua identidade e escrever no lugar certo. Chamar `node scripts/community.mjs` direto só funciona na instalação de pasta única. Na instalação dividida, sem essa variável, a raiz vira a pasta do motor e o resultado sai errado.

Subcomandos: `--help`, `list`, `show`, `install`, `prepare`, `review`, `approve`, `send`, `contributions` e `contribution`. Rodar `--help` é seguro: sem credencial, sem rede, sem gravação.

Variáveis que você pode precisar:

- `CEREBRO_INSTALL_ROOT`: a raiz do Cérebro (o lançador já define).
- `CEREBRO_DISTRIBUTION_URL`: troca o endereço do serviço. O padrão é `https://cerebro.vibemakers.com.br/api/system-distribution`, e HTTPS é obrigatório. O serviço recebe a identidade da sua instalação, então não aponte para uma URL que você não conhece.
- `CEREBRO_COMMUNITY_ALLOW_LOCALHOST=1`: só para testes locais da CLI.

A credencial (`.cerebro/id` e `.cerebro/install-credential`) é lida do disco. Nunca passe por flag. Para criar o vínculo, veja [Conectar](community-mcp.md#conectar).

## Ver o que existe

```bash
node .cerebro/bin/cerebro.mjs community list
node .cerebro/bin/cerebro.mjs community show --slug=SLUG
```

`list` mostra os sistemas disponíveis para o seu acesso atual. `show` detalha um deles: versão, hash (`release.package_sha256`) e a primeira tarefa. Anote o hash, porque a instalação vai pedi-lo.

## Instalar

### 1. Prévia, sem escrita

```bash
node .cerebro/bin/cerebro.mjs community install --slug=SLUG
```

O que volta sem `--confirm`: `status: preview`, `writes: false`, `grant_consumed: false` e, junto, o bloco `release`. Ele não baixa o pacote, não gasta o download autorizado e não confere conflitos locais. Serve para você ver o que vai entrar.

### 2. Instalação com o hash aprovado

```bash
node .cerebro/bin/cerebro.mjs community install --slug=SLUG --sha256=HASH --confirm
```

`HASH` é o `release.package_sha256` que você viu. Se ele não bater com a release atual, o comando para com `reviewed_hash_required` ou `release_changed`. O parâmetro `--runtime` indica a ferramenta de IA que você usa (o padrão é `codex`); os valores são os mesmos da ativação: `claude-code`, `codex`, `gemini-cli`, `antigravity` e `outro`.

O fluxo é: pedir o download, resgatá-lo, validar o pacote, instalar e enviar o recibo. O pacote não executa nada: scripts e skills de dentro dele não rodam, e nenhuma cópia de `AGENTS.md`, `CLAUDE.md` ou skills vai para o seu vault.

O resultado traz `status: installed`, `refs`, `entrypoint`, `first_task` e `remote_receipt: confirmed` ou `pending`. Se vier `pending`, os arquivos estão instalados e só o recibo falhou: rode a mesma instalação de novo para a mesma versão. Detalhe: o download autorizado pode ter sido consumido antes de uma falha local, e então a nova tentativa pede outro.

### Limites e requisitos do pacote

- No máximo 512 arquivos, 1 MiB por arquivo, 4 MiB no total e 6 MiB de JSON.
- caminhos seguros, sem `.git`, `.cerebro` ou `.env`.
- se o seu Cérebro for mais antigo que o `minimum_brain_version` do pacote, a instalação é recusada com `brain_version_incompatible`; fora de um Cérebro, `brain_not_recognized`.

### Onde ficam os arquivos

Tudo relativo à raiz do vault. Para o slug `SLUG` e a versão `VERSAO` com o hash curto `HASH`:

```text
sistemas/outros-instalados/SLUG/
  manifest.json  release.json  contract.json  capability.json  manifest.md
  releases/VERSAO-HASH/
    bundle/          a árvore original do pacote, intacta byte a byte
    contracts/       os contratos, fora do bundle
    package.json
    installation.json
  workspace/         reservado ao seu trabalho privado; o instalador não cria
.cerebro/sistemas/SLUG.json   estado: status package_added, fontes unbound
```

Alguns pontos:

- o bundle não é editado. Os contratos ficam fora dele, e o wrapper operacional é a parte que você pode adaptar.
- o estado em `.cerebro/sistemas/SLUG.json` nasce com `status: package_added` e as fontes `unbound` (por configurar). A gravação do estado é a última do processo. Se algo falha de forma síncrona, tudo volta atrás.
- versões anteriores e o `workspace/` nunca são apagados.
- o recibo remoto, quando confirmado, fica gravado em outro lugar que não o bundle.
- o `.gitignore` do vault recebe as regras que faltarem, para manter fora do Git: `sistemas/outros-instalados/*/workspace/`, `sistemas/outros-instalados/*/releases/`, `.community-stage-*/`, `.*.install.lock`, `.cerebro/sistemas/` e `comunidade/minhas-contribuicoes/propostas/*`.

Não há subcomando para consultar o estado de uma instalação. Para saber como um sistema está, leia `.cerebro/sistemas/SLUG.json` e o `installation.json` da release.

A identidade local é preservada nas atualizações. Se o acesso for negado, não crie uma identidade nova para driblar o bloqueio.

### Pacotes no formato antigo

Pacotes em `schema1` (legado) seguem um caminho de instalação separado do envelope V2, mas pelo mesmo comando. O cliente é atualizado antes de o backend passar a exigir um contrato novo, então um Cérebro em dia continua instalando.

## Conflitos e travas

O instalador nunca sobrescreve uma edição sua. Quando algo não bate, ele para com um código:

| Código | O que aconteceu | Como resolver |
| --- | --- | --- |
| `release_changed` | A release mudou depois da sua prévia | Rode `show` de novo e confira o novo hash |
| `package_hash_mismatch` | O pacote baixado não confere com o hash aprovado | Não instale; refaça a prévia |
| `installed_contract_modified_conflict` | Você editou um contrato instalado | Guarde a sua edição e revise a diferença antes de seguir |
| `installed_wrapper_modified_conflict` | Você editou o wrapper | Idem: a sua edição é preservada |
| `installed_file_mismatch` | Um arquivo instalado difere do registrado | Compare com `installation.json` |
| `installed_contract_mismatch` | O contrato instalado difere do esperado | Compare com a release |
| `unmanaged_system_conflict` | Já existe uma pasta de sistema que o instalador não gerencia | Mova ou renomeie a pasta |
| `existing_system_requires_migration` | O sistema existente precisa de migração | Migre antes de instalar |
| `installation_in_progress` | Outra instalação do mesmo slug está rodando | Espere e confira |
| `installation_interrupted_review_required` | Uma instalação anterior ficou pela metade | Inspecione antes de reparar (abaixo) |
| `release_directory_exists` | A pasta da release já existe | Inspecione e decida |
| `installation_changed_review_again` | O estado mudou durante a instalação | Refaça a prévia |
| `version_conflict` | A versão colide com a existente | Confira as versões instaladas |

Sobre travas: a instalação usa um arquivo `sistemas/outros-instalados/.SLUG.install.lock` e uma pasta de preparo `.community-stage-<uuid>`. Não há recuperação automática, nem `--force`. Se uma instalação foi interrompida, inspecione o lock, a pasta da release, os wrappers e o estado antes de apagar qualquer coisa. Um reparo às cegas pode destruir trabalho seu.

## Melhorar um sistema instalado

Você encontrou um ajuste que vale para todos. O caminho para propor é preparar um candidato.

```bash
node .cerebro/bin/cerebro.mjs community prepare \
  --slug=SLUG \
  --source-dir=sistemas/outros-instalados/SLUG/workspace/ajustes \
  --file=contratos/qualificacao.md \
  --file=prompts/abordagem.md \
  --version=1.1.0 \
  --summary="Reordena as perguntas de qualificação para começar pelo orçamento."
```

Regras que o comando aplica:

- só lê os arquivos citados em `--file` (pode repetir a flag), dentro de `--source-dir`. Nada é varrido.
- cada arquivo precisa existir no pacote base e ter mudança de fato (`path_not_shareable`, `selection_has_no_change`).
- `--version` tem de ser diferente da versão base (`new_version_required`).
- `--summary` tem até 2000 caracteres e não pode ter dado sensível (`invalid_or_sensitive_summary`).
- a seleção é explícita (`explicit_selection_required`), sem pastas privadas (`private_selection_refused`), só texto (`binary_content_not_supported`), e segredos ou dados pessoais óbvios são barrados (`sensitive_content_requires_redaction`).
- os diretórios `originais/` e `copy/` do sistema `sistema-funil` não podem ser escolhidos.

Sem `--confirm`, é uma prévia. Com `--confirm`, grava o candidato. Se você não tem o sistema instalado, mas tem o envelope dele, troque `--slug` por `--base-package=<envelope-relativo>`.

O candidato é o bundle completo mais os seus arquivos alterados, e não só a diferença. Ele vai para `comunidade/minhas-contribuicoes/propostas/<uuid>/`, com `package.json` e `candidate.json`; depois aparecem `approval.json` e `submission.json`. Guarde os três campos devolvidos: `candidate_id`, `package_sha256` e `package_ref`.

A política de envio vale também aqui: piloto, não listado, zero ciclos reais, zero Cérebros verificados, sem ação externa e sem fonte privada ligada. Um pacote novo não herda evidência de ninguém.

Se o que você tem é um sistema inteiro novo, o caminho é o [guia de publicação](community-release.md) (ou a conversa guiada em [Compartilhar um sistema novo](community-mcp.md#compartilhar-um-sistema-novo)).

## Revisar, autorizar e enviar separadamente

São três decisões, e cada uma vale por si. Use o `candidate_id` e o `package_sha256` que o preparo devolveu.

### Revisar

```bash
node .cerebro/bin/cerebro.mjs community review --candidate=ID
```

Mostra o `status` do candidato (`prepared`, `approved_for_submission` ou `submitted`), a lista de arquivos com tamanhos e hashes, e o `package_ref`. Não há diff textual: é uma conferência de lista e hash. Leia o conteúdo dos arquivos você mesmo.

### Autorizar

```bash
node .cerebro/bin/cerebro.mjs community approve --candidate=ID --sha256=HASH --confirm
```

Grava uma autorização para aquele hash exato (`approval.json`). Se qualquer arquivo ou o resumo mudar depois, a autorização deixa de valer e o envio é recusado. Sem `--confirm` você vê só a prévia.

### Enviar

```bash
node .cerebro/bin/cerebro.mjs community send --candidate=ID --sha256=HASH --confirm
```

O envio confere o seu acesso naquele momento, manda a proposta privada e usa o ID do candidato como chave de idempotência: reenviar o mesmo candidato não duplica nada. A resposta é `status: submitted` com `published: false`, e grava `submission.json`. Sem `--confirm`, só prévia. Sem autorização válida, o envio para com `approval_required`, `candidate_hash_mismatch` ou `approval_hash_mismatch`.

Enviar não publica. A revisão e a publicação são feitas por outro membro revisor, dentro da plataforma, fora desta linha de comando.

## Acompanhar

```bash
node .cerebro/bin/cerebro.mjs community contributions
node .cerebro/bin/cerebro.mjs community contribution --id=ID
```

O primeiro lista as suas contribuições; o segundo mostra o detalhe de uma, no que a plataforma autoriza você a ver. Os dois consultam a plataforma, então exigem o vínculo e o acesso vigente.

## Verificação local

Para checar que o conjunto de comunidade do motor está íntegro:

```bash
node scripts/test-community-all.mjs
```

Rode na pasta do motor (em desenvolvimento) e não dentro de um vault. A flag opcional `--funil=/caminho` aponta para um pacote externo de teste.

## Para manter o Cérebro atualizado

Atualizar o motor é um trabalho à parte e preserva a sua identidade e as suas edições. O passo a passo seguro está em [COMECE-AQUI](../../COMECE-AQUI.md).

# Do envelope V2 ao envio para revisão

Este guia é para quem já tem um sistema empacotado como envelope V2 e quer levá-lo à revisão da comunidade Vibe Makers pela linha de comando. Se você ainda não tem o pacote e prefere ser guiado numa conversa, use o caminho [Compartilhar um sistema novo](community-mcp.md#compartilhar-um-sistema-novo), no guia do MCP.

O que você faz aqui, em ordem: gerar uma prévia, salvar um candidato privado, revisar, autorizar o hash e enviar. A publicação no catálogo não faz parte disso. Ela é de outra pessoa, na plataforma.

## Antes de começar

- O Cérebro precisa estar ativado e com a conta vinculada para o envio (a prévia e o preparo não usam a rede nem a credencial). Se falta, veja [Conectar](community-mcp.md#conectar).
- Você precisa do envelope V2 em um arquivo JSON dentro da sua pasta do Cérebro, e vai citá-lo por caminho relativo.
- Node 20 ou mais novo.

### O que é o envelope V2

É um único JSON com a versão do sistema, os arquivos, os contratos e o SHA-256 de cada parte. Para ser aceito ele precisa respeitar estes limites:

- no máximo 512 arquivos, 1 MiB por arquivo e 4 MiB no total.
- no máximo 6 MiB de JSON, em UTF-8.
- um `entrypoint` declarado.
- os quatro contratos: `manifest.json`, `release.json`, `contract.json` e `capability.json`.

O seu arquivo de origem não é alterado. O comando lê o seu arquivo, nunca o reescreve.

### O que a política exige

O pacote entra como piloto, sem evidência herdada. Na prática:

- canal e estágio `pilot`, não listado, `public_catalog: false`, contrato `proposed`.
- `verified_real_cycles` e `verified_distinct_member_brains` iguais a 0. Um sistema novo ainda não teve ciclo real nem Cérebro verificado, e declarar o contrário é recusado.
- exige repetição, eval e aprovação humana.
- sem conexão automática de fontes, sem escrita externa automática, aprovação humana antes de qualquer escrita externa e `external_actions: false`.
- nenhuma fonte com `source_id`, isto é, nenhuma fonte privada ligada.

Quando algo foge disso, o comando para com um destes códigos: `submission_requires_unpublished_pilot`, `submission_requires_zero_evidence`, `submission_requires_human_review`, `submission_permissions_unsupported` ou `private_source_binding_forbidden`.

## 1. Gere a prévia

Sem `--confirm`, o comando só mostra o que aconteceria: versão, hash e a lista completa de arquivos. Não grava, não envia, não publica, não lê credencial e não usa rede.

O lançador `node .cerebro/bin/cerebro.mjs` ainda não expõe este comando, então a forma depende do tipo de instalação.

**Instalação de pasta única.** Na raiz:

```bash
node scripts/stage-community-release.mjs \
  --package=pacotes/meu-sistema.envelope.json \
  --summary="Sistema de triagem de pedidos de orçamento, com perguntas de qualificação e modelo de resposta."
```

**Instalação com vault e motor separados.** O script mora no motor, e é preciso dizer onde está o vault, senão a raiz passa a ser a pasta do motor e o seu pacote não é encontrado. Na raiz do vault:

```bash
MOTOR="$(node .cerebro/bin/cerebro.mjs motor-path)"
CEREBRO_INSTALL_ROOT="$PWD" node "$MOTOR/scripts/stage-community-release.mjs" \
  --package=pacotes/meu-sistema.envelope.json \
  --summary="Sistema de triagem de pedidos de orçamento, com perguntas de qualificação e modelo de resposta."
```

Regras dos argumentos:

- `--package=` é o caminho relativo do envelope, dentro da raiz.
- `--summary=` é obrigatório, tem até 2000 caracteres e não pode conter dado sensível (senão, `invalid_or_sensitive_summary`).
- cada argumento aceita uma vez só. Repetir ou usar outro dá `invalid_stage_release_arguments`.
- sem argumentos, ou com `--help`, o comando mostra a ajuda.

A resposta da prévia traz `status: preview`, `writes: false`, `sent: false` e `published: false`. Leia a lista de arquivos com calma. Se o JSON não for válido, o erro é `invalid_release_package_json`.

Se o pacote falhar em alguma regra, corrija o envelope na origem e gere uma prévia nova. Nada é remendado nem reescrito pelo comando.

## 2. Salve o candidato privado

Estando de acordo com a prévia, repita o mesmo comando acrescentando `--confirm`:

```bash
node scripts/stage-community-release.mjs \
  --package=pacotes/meu-sistema.envelope.json \
  --summary="Sistema de triagem de pedidos de orçamento, com perguntas de qualificação e modelo de resposta." \
  --confirm
```

(Na instalação dividida, mantenha o `CEREBRO_INSTALL_ROOT` e o caminho do motor do passo anterior.)

O comando grava duas coisas em `comunidade/minhas-contribuicoes/propostas/<uuid>/`: o `package.json`, em serialização canônica do protocolo, e o `candidate.json`. Você recebe de volta três campos: `candidate_id`, `package_sha256` e `package_ref`. Guarde o `candidate_id` e o `package_sha256`: você vai usá-los nos próximos passos. Se faltarem regras de privacidade no `.gitignore` do vault, o comando as acrescenta.

Neste ponto o candidato é só seu. Ele não tem aprovação nem autorização de envio, e ainda não existem `approval.json` e `submission.json`. Antes de gravar, o comando também varre o envelope atrás de segredos e dados pessoais óbvios. Essa varredura ajuda, mas não substitui a sua leitura: validação técnica não decide se o conteúdo está bom nem se você tem o direito de compartilhá-lo.

## 3. Revise, autorize e envie

Os três passos finais são decisões separadas, e usam o lançador. Cada um tem o seu próprio detalhamento em [Revisar, autorizar e enviar separadamente](community-systems.md#revisar-autorizar-e-enviar-separadamente). Em resumo:

```bash
node .cerebro/bin/cerebro.mjs community review --candidate=ID
node .cerebro/bin/cerebro.mjs community approve --candidate=ID --sha256=HASH --confirm
node .cerebro/bin/cerebro.mjs community send --candidate=ID --sha256=HASH --confirm
```

Troque `ID` pelo `candidate_id` e `HASH` pelo `package_sha256`. O `approve` e o `send` precisam do hash exato do candidato. O `send` usa a instalação vinculada e o acesso vigente no momento do envio, e responde `status: submitted` com `published: false`.

Um detalhe que costuma surpreender: quem revisa na comunidade tem de ser outra pessoa que não o autor. Usar a mesma conta em duas instalações conta como o mesmo autor.

## O que acontece depois

Enviar não publica. O pacote vai para a revisão da comunidade, que acontece na plataforma e fora do cliente: nem esta linha de comando nem o MCP têm comando de curadoria ou de publicação. Uma revisão editorial aprovada também não prova uso real. O sistema segue em piloto até haver evidência.

Para acompanhar o andamento, use `node .cerebro/bin/cerebro.mjs community contributions`, descrito no [guia de sistemas](community-systems.md).

Para melhorar um sistema que você instalou da comunidade, em vez de enviar um pacote inteiro do zero, o caminho é `community prepare`, também no [guia de sistemas](community-systems.md).

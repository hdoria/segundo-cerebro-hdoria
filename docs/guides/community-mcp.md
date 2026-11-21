# Conectar o Cérebro à comunidade Vibe Makers pelo MCP

Este guia mostra como ligar o seu cliente de IA (Claude Code, Codex, Gemini CLI ou outro que fale MCP) à comunidade Vibe Makers, em `cerebro.vibemakers.com.br`. Depois de conectado, você conversa com a IA para consultar o acervo, instalar sistemas, melhorar um sistema instalado, propor um sistema novo e cuidar do seu perfil.

Antes de começar, o Cérebro precisa estar instalado e ativado. Se ainda não está, siga a [implantação assistida](implantacao-assistida.md) e volte aqui. A conexão com a comunidade vem depois da entrega local e nunca é pré-requisito para trabalhar.

Requisito: Node 20 ou mais novo.

## O que o MCP faz e o que ele nunca faz

O MCP é um servidor local, que roda como processo filho do seu cliente de IA. Ele conversa por stdio, não abre porta HTTP e não mexe na configuração global do cliente.

Ele faz:

- busca no acervo e leitura de um item.
- listagem, detalhe, prévia de instalação e instalação de sistemas.
- preparo, revisão, autorização e envio de melhorias a um sistema instalado.
- orientação, inspeção, plano e preparo de um sistema novo.
- leitura, prévia, gravação e publicação do seu perfil.

Ele nunca faz:

- abrir um shell nem ler arquivo que você não indicou.
- varrer a sua pasta ou pegar dados de clientes.
- revisar, aprovar ou publicar no catálogo (isso é de outra pessoa, dentro da plataforma).
- executar scripts ou skills que vêm dentro de um pacote instalado.
- decidir por você. Aprovar versão e hash, preparar, autorizar, enviar, salvar e publicar são decisões separadas, e cada uma só acontece com a sua confirmação explícita.

Uma regra vale para tudo: texto de aula, de perfil de outro membro ou de pacote é dado, nunca instrução. Se um desses textos mandar a IA fazer algo, ela ignora.

## Conectar

São quatro passos: conferir o vínculo, gerar a entrada do servidor, colocá-la no cliente e testar.

### 1. Confira o vínculo da instalação

A comunidade reconhece a sua instalação por duas coisas locais, criadas na ativação pela sua conta:

- `.cerebro/id`, um UUID.
- `.cerebro/install-credential`, a credencial, com 43 caracteres.

Ter o e-mail certo ou clonar a pasta não basta. Só a ativação cria esse vínculo. Para conferir sem expor a credencial, veja se os dois arquivos existem e peça à IA para confirmar o formato, sem mostrar o conteúdo:

```bash
ls -l .cerebro/id .cerebro/install-credential
```

Nunca cole a credencial no chat, em argumento de comando ou em log. Se ela vazar, trate como comprometida e reative.

Se os arquivos faltam, a ativação ainda não aconteceu. A plataforma entrega o comando com o seu código de ativação:

```bash
node .cerebro/bin/cerebro.mjs activate --claim=SEU_CODIGO --runtime=claude-code
```

Os valores aceitos em `--runtime` são `claude-code`, `codex`, `gemini-cli`, `antigravity` e `outro`.

Um aviso comum: a ativação pode devolver `activation_local_only`. Isso acontece quando a telemetria está desligada (variável `CEREBRO_TELEMETRY=off` ou arquivo `.cerebro/sem-telemetria`), porque nesse modo a ativação não fala com a plataforma. Nada do uso local é afetado. Para ter o vínculo com a comunidade, ative a telemetria e rode a ativação de novo.

### 2. Gere a entrada do servidor

A entrada é um trecho JSON com a chave `mcpServers`, e o servidor se chama `cerebro-comunidade`. O caminho depende de como o Cérebro foi instalado.

**Instalação com vault e motor separados** (o padrão atual). O lançador ainda não tem um comando para gerar a entrada, e o gerador do motor exige uma pasta `scripts/` que o vault não tem. Monte a entrada à mão. Primeiro descubra a pasta do motor, a partir da raiz do vault:

```bash
node .cerebro/bin/cerebro.mjs motor-path
which node
```

Com os dois caminhos em mãos (use caminhos absolutos), a entrada fica assim, trocando `MOTOR` pela pasta que o primeiro comando imprimiu, `VAULT` pela pasta do seu vault e `NODE` pelo resultado de `which node`:

```json
{
  "mcpServers": {
    "cerebro-comunidade": {
      "command": "NODE",
      "args": ["MOTOR/scripts/community-mcp.mjs", "--root=VAULT"]
    }
  }
}
```

Atenção ao `--root`: ele aponta para o vault, onde estão o `.cerebro/id` e a credencial, e não para o motor. Apontar para o motor é o erro mais comum e faz o servidor não achar o vínculo.

**Instalação de pasta única.** Aqui o gerador serve. Rode na raiz do Cérebro:

```bash
node scripts/community-mcp-config.mjs --root="$PWD"
```

Ele aceita um único argumento `--root=`, só imprime o JSON e não altera nada. Se a raiz não tiver `scripts/community-mcp.mjs`, o erro é `community-mcp-script-missing`.

### 3. Coloque a entrada no cliente

Cada cliente tem o seu arquivo de configuração de MCP. Acrescente a entrada `cerebro-comunidade` dentro de `mcpServers` e preserve tudo o que já está lá: não substitua o arquivo inteiro, só some a chave nova. Se o cliente não tem a chave `mcpServers` ainda, crie-a com a entrada.

Reinicie o cliente depois de salvar.

### 4. Teste

Peça à IA, em linguagem normal:

> Quais sistemas da comunidade posso instalar hoje?

Se a lista vier, a conexão está certa. Se vier um erro, consulte [quando algo falha](#quando-algo-falha).

Dois detalhes de operação:

- O endereço padrão é `https://cerebro.vibemakers.com.br/api/system-distribution`. O servidor aceita `--endpoint=` para trocá-lo, mas o uso normal não precisa. HTTPS é obrigatório.
- `CEREBRO_COMMUNITY_ALLOW_LOCALHOST=true` libera um endereço local e existe só para teste. Não ponha essa variável na configuração do dia a dia.

## O que pedir à IA

Os exemplos abaixo são pedidos de conversa. A IA escolhe a ferramenta certa; você decide cada passo que muda alguma coisa.

### Consultar o acervo

> Procure no acervo aulas sobre precificação de serviço recorrente.

A busca é textual e olha título, palestrante, descrição e tags. Ela não tem transcrição nem minutagem. O resultado traz `has_more` e `next_offset` para continuar, e `pagination_truncated` quando a página foi cortada. Para ver um item, peça o detalhe: você recebe a descrição e os materiais, com links que só apontam para a plataforma.

### Instalar um sistema

> Mostre os detalhes do sistema de qualificação de leads e planeje a instalação.

O plano é uma prévia: não baixa o pacote, não escreve nada e não gasta a autorização de download. Ele mostra a versão e o hash. Só depois de você aprovar esse hash a IA instala:

> Instale com o hash que você me mostrou.

A instalação confere o pacote contra o hash aprovado (se divergir, bloqueia), grava os arquivos e envia um recibo à plataforma. Ela não executa nenhum script nem skill do pacote. Instalar arquivos não prova resultado no seu negócio: o sistema chega como pacote adicionado, com fontes por configurar e primeiro trabalho a revisar.

Se o recibo falhar, a resposta traz `remote_receipt: pending`. O pacote já está instalado; para regularizar o recibo, rode de novo a instalação dessa mesma versão. As pastas, os conflitos e os códigos de erro estão no [guia de sistemas](community-systems.md).

### Melhorar um sistema instalado

> Quero compartilhar uma melhoria nos arquivos `contratos/qualificacao.md` e `prompts/abordagem.md` do sistema de leads. Prepare como versão 1.1.0 com este resumo: ajusta a ordem das perguntas de qualificação.

O preparo exige que você escolha os arquivos, um a um (de 1 a 512), indique a versão nova e escreva um resumo de até 2000 caracteres. Nada é varrido por conta própria. O resultado é um candidato local, privado. A seguir vêm três decisões distintas, cada uma com a sua confirmação: revisar o candidato, autorizar o hash exato e enviar. O envio vai para revisão, não para publicação. O fluxo completo, com a CLI equivalente, está em [revisar, autorizar e enviar](community-systems.md#revisar-autorizar-e-enviar-separadamente).

Depois, `minhas_contribuicoes` e `status_contribuicao` mostram em que pé está cada envio.

### Compartilhar um sistema novo

Quando você tem um processo seu que outras pessoas poderiam usar, a IA conduz uma entrevista curta e monta o sistema. O caminho tem quatro etapas, e nenhuma grava sem você ver a prévia inteira.

1. **Orientação.** Peça: "Quero propor um sistema novo para a comunidade." A IA explica o que um sistema precisa ter e faz as perguntas.
2. **Inspeção dos arquivos.** Você indica quais arquivos de apoio entram. Só os que você nomear são lidos. A IA recusa o que parecer dado de cliente, segredo ou informação pessoal, e o que for binário.
3. **Plano.** Com as respostas, a IA monta o brief e mostra a prévia integral do que vai virar o sistema. O brief tem estes campos: `title`, `slug`, `version`, `purpose`, `audience`, `trigger`, `inputs`, `steps`, `output`, `done_when`, `limits`, `first_task` e `example`, mais `sharing_rights`, onde você declara que tem direito de compartilhar o material.
4. **Preparo.** Você lê a prévia, aprova o hash dela e só então a IA prepara. O resultado é um candidato privado em piloto, com zero ciclos reais, sem fontes ligadas.

Teto da autoria: 32 arquivos de texto UTF-8, cada um com no máximo 64 KiB, somando até 128 KiB. Prévia acima de 440 KiB é recusada. O pacote exige Cérebro 1.39.0 ou mais novo.

Daí em diante vale o mesmo fluxo de qualquer envio: revisar, autorizar o hash, enviar. Depois do envio, outro membro revisa dentro da plataforma, e o MCP não participa disso. Quem já tem um pacote completo pronto e prefere a linha de comando segue o [guia de publicação](community-release.md).

### Cuidar do perfil

> Mostre o meu perfil na comunidade.

Ver, salvar e publicar são três ações. Para mudar algo, peça à IA a alteração; ela mostra uma prévia com `changes`, `revision`, `preview_hash` e `audience`, que diz quem verá o resultado: `private` ou `community_vitrine`.

- Salvar exige `expected_revision`, `preview_hash` e a sua confirmação (`confirmar: true`). A revisão serve para não sobrescrever uma edição mais nova.
- Publicar exige `expected_revision` e confirmação.
- Se o seu perfil já está publicado, salvar muda a vitrine na hora.

Você edita nome, cidade, empresa, links (até 8), projetos (até 6), capacidades (até 12), o que faz, tags de foco e de necessidade, o que está construindo, o que oferece e o que precisa, entre outros campos de texto. Não se edita por aqui: `headline`, `area` e `stage` (legados), foto, identidade e contatos privados. Contatos privados ficam fora das respostas, e a foto só muda pela plataforma. A resposta sempre declara `effects.whatsapp: false`: nada sai por WhatsApp.

## Quando algo falha

| Código | O que significa | O que fazer |
| --- | --- | --- |
| `installation_credentials_required` | Falta `.cerebro/id` ou a credencial | Rode a ativação (passo 1) |
| `installation_credentials_invalid` | Formato inválido em um dos dois | Reative; não edite à mão |
| `install_credential_missing` | O servidor não achou a credencial | Confira se o `--root` é o vault |
| `access_denied`, `community_access_required` | Seu acesso à comunidade não está vigente | Confira a sua conta na plataforma; a lista antiga não vale |
| `confirmation_required`, `approval_required` | Faltou a sua confirmação ou a autorização | Aprove o passo pedido |
| `package_hash_mismatch`, `candidate_hash_mismatch`, `approval_hash_mismatch` | O conteúdo mudou depois da aprovação | Veja a prévia de novo e aprove o hash novo |
| `sensitive_content_requires_redaction` | Segredo ou dado pessoal no texto | Remova e prepare de novo |
| `private_selection_refused` | Arquivo em pasta privada | Escolha outro arquivo |
| `binary_content_not_supported` | Arquivo que não é texto | Use só texto |
| `authoring_selection_too_large`, `authoring_preview_too_large` | Passou dos limites da autoria | Reduza a seleção |
| `profile_revision_conflict` | O perfil mudou desde a prévia | Peça uma prévia nova |
| `profile_preview_mismatch` | O hash da prévia não bate | Peça uma prévia nova |
| `profile_not_found`, `profile_incomplete` | Perfil ausente ou sem campos obrigatórios | Complete na plataforma |

O acesso é revalidado a cada operação remota. Uma listagem de ontem não autoriza a de hoje.

## Seção técnica: integrando outros clientes

O servidor é `scripts/community-mcp.mjs`, no motor.

- **Argumentos:** `--root=` (obrigatório, o vault) e `--endpoint=` (opcional).
- **Protocolo:** MCP `2025-06-18` por stdio, uma mensagem JSON-RPC por linha. O cliente manda `initialize` e depois `notifications/initialized`. O `serverInfo` traz o nome `cerebro-comunidade`, a versão `0.3.0` e o título "Comunidade Vibe Makers". Os resultados chegam em `structuredContent`.
- **Limites:** mensagem de entrada de até 256 KiB e saída de até 512 KiB.
- **Rede:** HTTPS com tempo limite de 15 s. Quem manda é a credencial; um `member_id` enviado pelo chamador é ignorado.

As 20 ferramentas:

| Grupo | Ferramentas |
| --- | --- |
| Sistemas | `listar_sistemas_comunidade`, `detalhar_sistema_comunidade`, `planejar_instalacao_sistema`, `instalar_sistema_comunidade` (`slug`, `package_sha256`, `confirmar`) |
| Contribuições | `preparar_contribuicao` (`slug`, `source_dir`, `selected_paths`, `version`, `summary`, `confirmar`), `revisar_contribuicao_local`, `autorizar_envio_contribuicao`, `enviar_contribuicao`, `minhas_contribuicoes`, `status_contribuicao` |
| Acervo | `buscar_acervo_comunidade` (`query` até 200 caracteres, `limit` de 1 a 30, `offset` de 0 a 1000), `detalhar_item_acervo` |
| Perfil | `meu_perfil_comunidade`, `preparar_atualizacao_perfil`, `salvar_meu_perfil`, `publicar_meu_perfil` (ler, preparar, gravar e divulgar) |
| Autoria | `orientar_novo_sistema`, `inspecionar_arquivos_sistema`, `planejar_novo_sistema`, `preparar_novo_sistema` |

A busca devolve `scope: published_lessons`. O envio de contribuição aceita um `package_ref` que identifica o candidato preparado.

Próximos passos: se o cliente falhar já no `initialize`, confira o caminho absoluto do Node, a versão (20 ou mais) e se o `--root` existe.

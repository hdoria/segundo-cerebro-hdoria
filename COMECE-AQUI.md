# Comece aqui

Este é o **cérebro operacional do seu negócio**. Ele cruza seu contexto com referências de campo e,
principalmente, transforma fonte real em resultado por sistemas que deixam rastro e melhoram.

## Duas pastas

A instalação tem duas pastas. O **vault** (por padrão `~/Cerebro/notas`) é o que você abre no
Tolaria ou no Obsidian e onde o agente trabalha: suas notas, capturas, operação e sistemas
instalados, mais o `AGENTS.md` com as instruções. O **motor** (por padrão `~/Cerebro/motor`) guarda
o código, o Console, o método e os catálogos; você não precisa abri-lo. Este arquivo vive no motor.
O vault aponta para o motor por `.cerebro/motor`, e todo comando roda pelo lançador do vault:
`node .cerebro/bin/cerebro.mjs <comando>`. `node .cerebro/bin/cerebro.mjs motor-path` mostra onde o
motor está.

## Se uma IA já está lendo esta pasta

Não troque de ferramenta nem de sessão. O agente que instalou ou encontrou esta pasta deve ler este
arquivo e a skill `comecar` diretamente, e conduzir a primeira entrega na conversa atual. O comando
de slash é um atalho, não um requisito.

| Ambiente | Skills | Entrada |
|---|---|---|
| Claude Code | `.claude/skills/` | `/comecar` |
| Codex | `.agents/skills/` | `$comecar` ou “quero começar” |
| Gemini CLI | `.agents/skills/` | “quero começar” |
| Antigravity | `.agents/skills/` | “quero começar meu cérebro” |
| outro agente local | `.agents/skills/` | ler `comecar/SKILL.md` |

### Cadastro do e-mail e vínculo da instalação

O cadastro local do e-mail evita repetir a pergunta de acesso. E-mail salvo ou ping enviado não
comprovam vínculo com a plataforma nem substituem a credencial de instalação necessária ao MCP.
O agente oferece o cadastro só depois do primeiro output útil e confirma somente o que verificou.
Para usar a comunidade, confira a ativação pela sua conta na plataforma e o acesso vigente.
Recusar o vínculo não bloqueia o trabalho local: o agente registra a preferência e segue. Ainda
sem acesso, o trabalho local segue normalmente e seu conteúdo continua local.

O agente precisa abrir o vault, ler e editar arquivos. Scripts validam o protocolo quando o
ambiente permite, mas não são requisito para a primeira ativação. Se ele só recebe arquivos como
base de conhecimento e não consegue gravar, consulta o acervo, mas não mantém o cérebro acumulando
contexto.

Se a instalação começou fora do vault, o agente pode usar o caminho absoluto do vault como diretório de
trabalho. Só peça para abrir uma nova sessão quando o ambiente realmente não conseguir ler, escrever
ou executar aqui. Antes disso, grave a primeira tarefa e o estágio em
`operacao/decisoes-pendentes/onboarding.md`; a sessão seguinte retoma sem repetir perguntas.

### Instalar, continuar ou migrar

Se houver um Cérebro existente e você ainda não tiver escolhido, o agente oferece usar essa pasta,
instalar em uma pasta nova ou planejar uma migração. O agente nunca decide sozinho qual é a
instalação real ou de teste. Uma escolha já feita continua valendo.
“Novo e limpo” cria outro par de pastas (vault e motor) e preserva as instalações existentes. O mesmo agente segue até a
primeira entrega e o reuso, na conversa atual. Diga “prepare meu Cérebro” ou “continue de onde parei”.
O [guia de implantação assistida](docs/guides/implantacao-assistida.md) detalha essas rotas.

### Versão fixa, instalação nova e atualização segura

Escolha uma tag publicada explícita (`vX.Y.Z`) do repositório definido em `.cerebro/source` e
confira release, tag, commit e changelog. `main`, `latest` e o `VERSION` de um checkout não
substituem essa prova. Para instalação nova, obtenha a tag em outra pasta temporária; o instalador
dessa versão cria as duas pastas, mostra a prévia antes de `--apply` e não reutiliza um destino
existente:

```bash
node /caminho/pacote/scripts/install.mjs --tag vX.Y.Z --vault ~/Cerebro/notas --motor ~/Cerebro/motor
```

Sem `--vault` e `--motor`, valem `~/Cerebro/notas` e `~/Cerebro/motor`; só `--vault` põe o motor ao
lado, em `motor`. Repita o comando com `--apply` depois de revisar a prévia.

Para atualizar, rode a skill `atualizar` ou o comando abaixo a partir do vault. Ele atualiza o motor
e reprojeta o vault (skills, lançador e o bloco gerenciado do `AGENTS.md`) com um único `plan_hash`:

```bash
node .cerebro/bin/cerebro.mjs update --tag vX.Y.Z
```

A prévia mostra arquivos de cada pasta, conflitos e `plan_hash`. Skill editada no vault, ou pasta de
skill sua com o mesmo nome de uma oficial, aparece como conflito e nunca é sobrescrita. Resolva e
gere nova prévia: conflito impede aplicação mesmo com aprovação. Com o plano aprovado, repita o
mesmo comando com `--apply --approve-plan HASH_DA_PREVIA`. Mudança de conteúdo exige nova prévia e
aprovação. Se o vault falhar depois do motor, o motor volta ao estado anterior.

Texto fora do bloco `CEREBRO:MANAGED` em `AGENTS.md` pertence ao dono. `CLAUDE.md` e `GEMINI.md` do
vault são uma linha apontando para `AGENTS.md` e só são criados quando não existem. Skills próprias
e arquivos extras permanecem. Backups privados ficam em `.cerebro/update-backups/` de cada pasta,
fora do Git. Arquivos retirados do pacote não são apagados automaticamente.

Uma instalação antiga de pasta única continua atualizável por `--root`, por mais uma versão:

```bash
CEREBRO_UPDATE_SOURCE_DIR=/caminho/pacote node /caminho/pacote/scripts/update.mjs --tag vX.Y.Z --root /caminho/cerebro-existente --baseline-dir /caminho/pacote-da-versao-instalada
```

Sem `.cerebro/update-state.json`, forneça a cópia íntegra da versão instalada em `--baseline-dir`.

A migração privada de runtime é um passo separado, após revisão e autorização. Atualizar não
executa migração nem ping e preserva as opções de telemetria. Em falha, confira o resultado e o
backup antes de afirmar restauração; disco cheio ou encerramento abrupto não garantem rollback.
Use `atualizar` para conduzir o plano de uma instalação gerenciada. Examine mudanças em `console/`
e `scripts/` mesmo sem conflitos: o pacote selecionado pode substituí-los. Preservar o contexto
privado não garante preservar o código do fork. Neste checkout, o Console sinaliza
`git-checkout-update-protected`; para manter suas escolhas, faça
[integração seletiva via Git](docs/guides/upstream-alignment.md), sem aplicar o pacote upstream inteiro.

### Cérebro existente não é a mesma coisa que contexto existente

Uma instalação do Cérebro tem um vault com `.cerebro/manifest.json` e o ponteiro `.cerebro/motor`, e o
motor apontado por ele. É nela que o motor, os sistemas e o contexto acumulado trabalham juntos. Se houver mais de uma instalação, você escolhe
qual quer abrir ou pode pedir uma nova e limpa.

Um Cérebro artesanal em Obsidian, pastas ou outro formato pode continuar na origem como fonte
referenciada. A ausência dos marcadores do Cérebro é diferença de formato. O agente examina somente
a estrutura autorizada e mostra o que pode ser aproveitado. Se você escolher migrar conteúdo,
`migrar-cerebro` apresenta primeiro o mapa de cópia para uma instalação separada, com proveniência.
O updater do motor atua em uma instalação do Cérebro, nunca sobre o acervo artesanal. Conteúdo só é
aberto no escopo autorizado; CRM, banco e Drive exigem seus próprios acessos.

Quando você aprova uma fonte local recorrente, o Cérebro guarda apenas uma referência privada ao
caminho original. A fonte continua onde está, como fonte de verdade: sem cópia, mudança ou sync automático.
A primeira experiência começa por uma amostra pequena; conexão contínua só existe quando houver um
conector real e consentimento específico.

Registro, autoridade, Source Contract, vínculo ao papel do Sistema, conector, acesso observado e
frescor têm evidências próprias. Contrato não prova acesso atual nem conteúdo atualizado. O agente
reutiliza contratos existentes e começa pela menor amostra autorizada; formalizar todas as fontes
não bloqueia a primeira entrega.

## Abrir o Console deste fork

A partir do vault, o lançador usa o próprio vault como raiz. O comando abre o navegador quando o
servidor estiver pronto:

```bash
node .cerebro/bin/cerebro.mjs console --port=4782
```

Para somente iniciar e conferir o endereço, acrescente `--no-open`. Para outra porta, use
`--port=PORTA`. Com o motor em mãos, `node scripts/console.mjs --root=/caminho/do/vault` faz o mesmo. O Console
mostra estados derivados dos contratos e recibos locais; abrir a página não conecta fontes nem
executa modelos. O lote atual de integração seletiva preservou esta interface. Uma atualização
futura segue o plano do pacote escolhido e precisa de revisão dos caminhos de interface e scripts.

## Não usa nenhum agente pago?

Comece pelo Google Antigravity ou Gemini CLI. Claude Code e Codex também funcionam. O cérebro não
exige uma assinatura específica e o Cérebro Base opera com arquivos locais.

## A primeira experiência

No Console opcional, esta etapa aparece como **Primeira Missão**. É um estado transitório: antes
de T4 orienta o próximo passo; depois de T4 desaparece da navegação e deixa seu recibo em
`Cérebro`. `Cérebro Base` é a infraestrutura nativa de contexto, não um Sistema de negócio.
A novidade mais recente pode aparecer ali em um cartão compacto; a comunicação completa e o
histórico de releases vivem permanentemente em `Cérebro → Atualizações`.

O cérebro começa entendendo uma situação recorrente do seu trabalho: o que ocupa tempo, volta para
suas mãos ou ainda depende da sua decisão. Depois localiza onde esse trabalho deixa rastros e pede
somente um caso recente — uma reunião, conversa, mensagem, documento ou outro material real.

Se você já sabe o resultado, ele começa por ele. Se não sabe, começa por um rastro recente do
trabalho real, reconstrói a operação e propõe até três resultados. Nenhuma das rotas começa
conectando tudo.

`orientar → registrar sem conectar → menor fonte real → usar → ajustar → reutilizar`

Uma reunião pode virar decisões e ações; um briefing, uma mensagem ou uma proposta pedem outro
tipo de entrega. O cérebro escolhe o formato pelo trabalho, não força todo material a virar resumo.
Ao final, o resultado fica legível para você e também deixa o contrato de ativação do Cérebro Base
e Run Records para que Sistemas futuros reutilizem entidades, fontes e aprendizados sem copiar o
dado canônico.

O acordo é explícito: a Fonte continua como casa da verdade; o Cérebro prepara, destila e recupera
o recorte necessário; o Sistema pede contexto por papel e produz seu resultado. Leitura direta da
Fonte só acontece quando dado fresco ou estruturado exige isso e o contrato, a permissão e o Run
Record deixam a exceção visível.

Depois que uma segunda tarefa real reutiliza o contexto persistido e você confirma o reuso,
o Cérebro pode abrir o `/arquiteto`: ele mapeia como uma operação funciona, mostra o que é só declarado e o que já tem evidência, e propõe o
primeiro sistema para o responsável confirmar. Diagnóstico não finge implantação nem validação.

Com o resultado confirmado, `/sistematizar` observa uma execução recente, separa declarado de
observado e instala a versão manual em `sistemas/outros-instalados/`. As fontes ficam registradas
por papel e casa de verdade; isso ainda não as conecta. O Sistema nasce `configuring`, roda o
primeiro caso com `/operar` e só depois pode merecer conexão, rotina por evento ou automação.

O acervo do AI Engineer World's Fair continua disponível com fonte e minuto do vídeo, mas funciona
como referência para melhorar uma decisão. Ele não substitui o contexto do seu negócio.

## O mapa

No vault (o que você vê):

- `meu-negocio/` — seu contexto privado.
- `sistemas/` guarda os sistemas que você instalou e o feedback deles.
- `conexoes/configuradas/` guarda suas conexões opcionais.
- `operacao/` — seu brief vivo, o que rodou, falhou, escalou e os caminhos aprovados que podem ser reutilizados.
- `operacao/arquitetura/` — specs privadas e mapas visuais produzidos pelo `/arquiteto`.
- `comunidade/minhas-contribuicoes/` — o que você pode decidir compartilhar.
- `capturas/` — bruto; `privado/` — PII local.
- `AGENTS.md`, `CLAUDE.md` e `GEMINI.md` são as instruções do agente.

No motor (código e referência):

- `skills/`, `protocol/` e `sistemas/` trazem os julgamentos, o contrato comum e as definições dos sistemas base.
- `conexoes/` traz o catálogo de integrações.
- `comunidade/vibe-makers/` — o que recebemos da comunidade Vibe Makers.
- `METODO*.md`, `GLOSSARIO.md`, `FONTES.md`, `templates/` e `docs/`.

## Quando quiser construir além da primeira vitória

- **Onde aplicar primeiro:** rode `/arquiteto` para mapear uma operação e propor o primeiro Sistema.
- **Como transformar trabalho real em Sistema:** rode `/sistematizar`; ele usa
  [`METODO-SISTEMAS.md`](METODO-SISTEMAS.md) e gera o contrato local sem conectar tudo.
- **Como operar o primeiro caso:** rode `/operar <system-id>` e confirme valor somente quando o
  responsável disser que usaria ou usou o output.
- **Como testar uma mudança sem enganar a leitura:** leia
  [`METODO-EXPERIMENTOS.md`](METODO-EXPERIMENTOS.md) e use
  [`templates/experimento.md`](templates/experimento.md).

O material aberto entrega arquitetura e templates. System Packs e releases publicados
pela comunidade Vibe Makers chegam pelo catálogo da comunidade.

## Privacidade, ping e comunidade

Seu contexto fica local. Para medir ativação, o cérebro envia telemetria técnica opcional: evento,
`install_id`, versão, sistema operacional, runtime e, quando configurados, e-mail de acesso ou
`member_id`. Runs de Sistemas também podem levar IDs opacos, versão, resultado do eval e decisão
humana categórica. Nunca envia fonte, output, erro ou texto. Desligar: crie
`.cerebro/sem-telemetria` ou use `CEREBRO_TELEMETRY=off`.

Quando encontra um padrão útil, o cérebro pode perguntar se você quer **preparar** uma contribuição
anonimizada. Ele mostra o payload exato. Aprovar não envia; enviar pede outro “sim”. A rede e o
marketplace ainda estão em construção — o cérebro não simula um envio que não existe.

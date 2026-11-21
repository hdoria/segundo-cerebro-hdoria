# Glossário

O vocabulário da casa. Uma linha por termo, com o nome exato que o termo tem dentro do produto.

Use sempre estes nomes ao falar do método, em skill, página, aula, tela ou resposta. Termo novo só
entra aqui, e só entra depois que o uso no código ou numa skill sustentar a definição. Enquanto não
entrar, escreva com as palavras que já existem.

Dois avisos antes da tabela. Alguns nomes têm dois donos: **Ponteiro** é o nível 0 de uma fonte e
também o arquivo `.cerebro/motor` que liga vault a motor, e **Mapa** é a nota `mapa.md`, diferente
de **Mapa da empresa** e de **Estado do mapa**. E as palavras **Run** e **Recibo** têm parentes com
verbete próprio (Run Record, Routine Run Receipt, Access Receipt), porque o envelope diz mais que a
palavra solta.

| Termo | Definição |
|---|---|
| A0 a A2 | Escala interna de valor de uso de um run. A2, a única posição com definição firme, existe quando a pessoa confirma que usaria ou usou o output na operação real. |
| Access Grant | A concessão local que autoriza um sujeito a agir sobre Fontes e Sistemas determinados, com ações, prazo e garantia. Grant que não cobre o Sistema não autoriza o acesso. |
| Access Receipt | O recibo privado de cada tentativa de acesso, com allow, deny, falha, revogação ou degradação, e o estado da credencial. Só referência, nunca conteúdo. |
| Agente | A IA que opera o cérebro na pasta, nos papéis de Guia, Curador e Operador. A pessoa aprova as escritas e as decisões. |
| Architect | A capacidade que mapeia uma operação real, mostra a força da evidência de V0 a V3 e propõe até três oportunidades com o primeiro Sistema de negócio. Roda pela skill `/arquiteto`. |
| Ativação | O caminho que leva o Cérebro Base de instalado a usado, medido em T0 a T4. Fecha quando o contexto salvo volta numa segunda tarefa sem reexplicação. |
| Átomo | A nota de uma ideia só, com afirmação, citação literal da fonte com origem, uma ou duas linhas de sentido e os elos. Nota sem citação fica de fora, porque vira palpite com cara de fato. |
| Bandeja | A pasta `capturas/`, onde todo bruto cai antes de virar átomo. Fica fora do git, e o `/reindex` a termina zerada. |
| Baseline | O número de partida contra o qual a mudança vai ser medida, registrado antes dela. `nao-medido` é resposta honesta e vale mais que número inventado. |
| Bruto | O material como chegou: call, PDF, planilha, export. Nunca se destrói nem se converte à força, e o original fica onde está. |
| Canvas | A vista de mapa do Console, com Fontes, Sistemas, Áreas, Rotinas e handoffs desenhados por relações reais. Derivada de contratos, recibos e traces, nunca uma segunda casa da verdade. |
| Capability | O know-how portátil de um Sistema, declarado em contrato próprio e capaz de circular pela comunidade. Contrato inválido bloqueia a instalação. |
| Captura | O arquivo de bruto em `capturas/`, com cabeçalho de origem e `type: Capture`. Nasce sem `_organized`, e isso o mantém no Inbox do Tolaria até virar átomo. |
| Central de Atualizações | A aba Atualizações do Console, com o perfil da instalação, a versão instalada e as releases disponíveis do motor e dos Sistemas. Ela mostra, não aplica. |
| Cérebro | A pasta local com o contexto do negócio, mais o agente que opera sobre ela. Cérebro artesanal, em Obsidian ou em pastas soltas, continua um cérebro. |
| Cérebro Base | A capacidade nativa de ativação, memória, recuperação e aprendizado do próprio cérebro. Tem contrato e versão internos, e fica fora do catálogo de Sistemas de negócio. |
| Conexão | A interface opcional que liga uma Fonte ou ferramenta ao cérebro. Registrar fonte não conecta fonte, e conexão recorrente só nasce dentro de um Sistema depois de uso provado. |
| CONFIGURAÇÃO | O recorte de contexto já aprovado, estreito e pronto para a tarefa, que a sessão seguinte lê em vez de reabrir o bruto. Conteúdo e caminhos locais ficam nela, privada. |
| Console | A interface web local do produto, servida em `127.0.0.1`, que lê os mesmos arquivos do vault. Vista derivada de contratos, recibos e traces. |
| Context Snapshot | O registro exato do que foi selecionado por referência numa execução. Obrigatório no Run Record V2, e no V1 a leitura mostra `context-not-recorded`. |
| Contexto | O conteúdo do negócio organizado por horizonte de uso, em `meu-negocio/`. Contexto certo e curto vale mais que muito contexto cru. |
| Contribuição | A proposta privada que o dono pode preparar, aprovar e enviar para a comunidade, anonimizada e sem bruto. Preparar, aprovar e enviar são três consentimentos separados. |
| Control plane | O registro local dos Sistemas que declararam `system_id`, versão, resultado, entidades, fontes, Capability, permissões, eval e aprendizado. Entrar nele é a condição para o produto operar o Sistema. |
| Destilar | Tirar do bruto a ideia que tem sinal e escrevê-la como átomo, com a citação que a sustenta. Nem todo bruto se destila. |
| Diagnóstico cruzado | A leitura que confronta o que a pessoa declarou com o que a fonte sustenta, antes de chamar qualquer coisa de verificada. |
| Emenda | O registro numerado e append-only de circunstância externa a um Experimento, fora da região selada. Critério trocado depois do dado deixa a leitura inconclusiva ou abre outro Experimento. |
| Engenharia de Contexto | O método do cérebro, em 4 movimentos: organizar por uso, capturar em átomos, conectar leve e buscar citando. Em verbos: capturar, destilar, estruturar, operar, medir. |
| Entidade | O identificador opaco que costura o mesmo caso entre Sistemas e Runs sem duplicar o dado canônico. Padroniza a observabilidade, nunca o julgamento. |
| Estado do mapa | A força da evidência do mapa da operação, nos estados V0, V1, V2 e V3. V0 é o declarado, V1 acrescenta fonte observada, e V3 só existe com execução comparável, eval passado e decisão humana aprovada. |
| Eval | A régua que diz se uma execução atingiu o resultado, com gates determinísticos antes da pergunta humana. Régua definida depois do dado é opinião com gráfico. |
| Execution Trace | O evento privado, ordenado e append-only do caminho real de um Run, com estados e referências. Nunca prompt, output, payload ou erro cru. |
| Executor Binding | O binding privado que liga uma Rotina ao cliente de IA local que o dono já autenticou. OAuth e API key nunca entram nele. |
| Experimento | O ciclo de uma mudança controlada, com pré-registro congelado antes do dado e estado operacional depois dele. Atravessa Sistemas e liga Runs, sem ser Fonte nem Run. |
| Feedback | O arquivo do Sistema onde a correção humana entra com versão e `run-id`. Três falhas comparáveis candidatam uma mudança versionada, e o arquivo pertence ao dono. |
| Fios | A pasta `fios/`, com o que está quente agora: decisão ou problema em andamento. O `/reindex` pergunta de cada fio se ele ainda está quente. |
| Fonte | O material real de onde o contexto vem, indexado em `meu-negocio/fontes/` com `type: Source`. O bruto continua em `capturas/` e o original, onde mora. |
| Frescor | A idade da verdade de uma nota, marcada em `confirmed:`. Passou de 60 dias sem confirmação, a nota entra na fila do `/revisar`. |
| Gate | O ponto onde algo precisa passar antes de seguir, determinístico ou humano. O gate determinístico é do agente, nunca pedágio para a pessoa. |
| Gente | A pasta `gente/`, com uma página por cliente, parceiro ou concorrente-chave, sem PII. O `/call` e o `/daily` a alimentam. |
| Golden pattern | A peça da régua que descreve a saída considerada boa naquele Sistema. Vive em `evals.md` e pode ser a camada que uma mudança versionada altera. |
| Golden set | O conjunto de casos de referência que a régua do Sistema usa para comparar execuções. Vive em `evals.md` e também é camada que o aprendizado pode mudar. |
| Grant | Forma curta de Access Grant, a autorização local vigente para aquele sujeito, Fonte, ação e papel. |
| Guardrail | O limite que a execução de um Experimento não pode cruzar, declarado no pré-registro. Guardrail ausente fica como lacuna, com reason code próprio. |
| Handoff | A entrega de um artefato versionado de um Sistema produtor para um consumidor, com schema, trigger e gate de aceitação. A aresta entre Sistemas só existe quando esse contrato existe. |
| Horizonte | O lugar de uso que decide onde o átomo mora: agora, áreas, referências e arquivo. Você nunca escolhe pasta por tema. |
| Julgamento | A decisão humana que o produto nunca automatiza. O protocolo padroniza a observabilidade em volta dela e deixa o julgamento com a empresa. |
| Mapa | A nota `meu-negocio/mapa.md`. Uma página só, com o funil e a métrica principal, e o primeiro lugar onde qualquer resposta de estratégia ancora. |
| Mapa da empresa | A orientação ampla e rasa do que a pessoa declara sobre o negócio e sobre as Fontes que existem, com casa, finalidade, owner e lacunas. Nasce em V0, e registrar Fonte nele não abre nem conecta nada. |
| Métrica | O número que diz se o resultado saiu, definido antes da execução. Vive na régua do Sistema e no `mapa.md`, como métrica principal. |
| Motor e Vault | As duas pastas de uma instalação. O vault guarda só o que é do dono, o motor guarda o código e o produto, e o caminho dele sai de `node .cerebro/bin/cerebro.mjs motor-path`. |
| Motor vs contexto | A separação entre atualizar o código e migrar o contexto da empresa. Atualizar o motor não migra contexto, e método antigo nunca volta como contexto do negócio. |
| Nível de refino | Quanto uma Fonte foi tratada, de 0 a 4: 0 ponteiro, 1 legível, 2 indexado, 3 destilado, 4 operacional. A régua completa está em `FONTES.md`, e a skill `/fonte` é o executável dela. |
| Operador | O papel do agente que executa Sistemas por resultado, de Fonte real a recibo e feedback. A pessoa aprova as escritas e as decisões. |
| Output | O artefato que sai do pipeline e vai para a régua. Sem output útil não existe primeira vitória. |
| Perguntas-canário | As cinco perguntas que um sócio de anos saberia responder, gravadas em `meu-negocio/teste-do-cerebro.md`. São a régua fixa do `/teste`. |
| Pipeline | Os estados de um Sistema, cada um com entrada, saída e gate, escritos em `pipeline.md`. Salvar fora do pipeline é falha observada. |
| Ponteiro | O nível 0 de uma Fonte, que registra onde ela mora sem copiar, converter nem mover. Também o arquivo `.cerebro/motor`, que liga o vault ao motor. |
| Pré-registro | A região selada do Experimento, congelada antes da mudança, com gargalo, baseline, hipótese, métrica, guardrail, janela e regra de decisão. Depois do congelamento, só emenda. |
| Primeira Missão | A tela de ativação do Console, onde o Cérebro é ativado por um trabalho real. Enquanto a reutilização não for provada, o recibo dela fica pendente. |
| Primeira vitória (A2) | O momento em que a pessoa confirma que usaria ou usou o output na operação real. Run aprovado, sozinho, não conta. |
| Recibo | O registro local do que aconteceu numa execução, com referências de Fonte e output e sem conteúdo privado nem segredo. Fica em `operacao/execucoes/<run-id>.md`. |
| Régua | O critério que decide se o resultado presta, escrito antes do dado. Cada Sistema tem a sua em `evals.md`, e a do `/teste` tem três posições: em branco, estagiário, sócio. |
| Release | A unidade distribuível de um Sistema, com versão, canal, compatibilidade mínima e estado de publicação. Linha em catálogo ou pacote no repositório não prova release acessível. |
| Relógios | A cadência das skills: `/daily` todo dia, `/reindex` toda semana, `/revisar` e `/teste` todo mês. Contexto tem ritmo, e cada ritmo tem uma skill. |
| Replay | Rodar de novo os casos anteriores contra uma mudança proposta, antes de aprová-la. Replay nunca se apresenta como execução original. |
| Retrieval Contract | A declaração de como o Sistema recupera contexto: prioridade, seleção, frescor, conflito, fallback, parada, orçamento e proveniência. Obrigatório no System Contract V2. |
| Rotina | O trabalho que roda por gatilho ou agenda, com quando, onde e por qual executor. Nasce desativada, e ativar exige um run manual concluído da mesma versão. |
| Routine Contract | O contrato da Rotina: janela, executor, grants consultados, destino da entrega e políticas de timeout, retry e idempotência. Arquivo de agenda não prova processo ativo. |
| Routine Run Receipt | O que cada tentativa da Rotina deixa registrado em privado: status, reason code e as referências do que entrou e do que saiu. Prompt, output e erro cru ficam fora. |
| Run | Uma execução de um Sistema ponta a ponta, com entidade, Fonte, output, eval e decisão humana. Falha e conversa que não executou nunca viram procedimento. |
| Run Record | O recibo estruturado da execução, com `run_id` estável, versões de Sistema e Capability e referências do que entrou e do que saiu. V2 acrescenta o Context Snapshot. |
| Self Improvement | O caminho pelo qual um run aprovado vira procedimento candidato e, com três casos comparáveis, replay e aprovação humana, uma mudança versionada. O motor nunca se altera em silêncio. |
| Sensor | A peça da régua que diz de onde o número vem, declarada em `evals.md`. Sem sensor, a métrica não tem leitura. |
| Setpoint | A condição mínima de aceitação do resultado, declarada antes da execução. No Cérebro Base, por exemplo, T0 até T3 em até 15 minutos. |
| Sistema | O pacote de resultado instalado no vault: manifest, Capability, System Contract, pipeline, rotinas, skill, eval, feedback e changelog. Template em branco não é Sistema instalado. |
| Sistematização | O trabalho de virar um caso recorrente observado em Sistema local, com contrato aprovado, régua e primeiro run manual. Roda pela skill `/sistematizar`. |
| Skill | A capacidade executável que o agente roda por `/nome`, projetada em `.claude/skills/` e `.agents/skills/` do vault. Promoção de skill para o motor exige três runs comparáveis, replay e aprovação. |
| Source Contract | O contrato da Fonte, com casa da verdade, escopo, autoridade, modos e garantia, sempre só referência. O mesmo contrato atende quantos Sistemas precisarem, cada relação com binding e grant próprios. |
| Superseded | O estado da nota que morreu, marcado com `status: Superseded` e `superseded_by`. Nada se deleta, e nota superada entra em resposta só como histórico. |
| System Contract | A Capability ligada ao resultado, às Fontes, entidades, permissões, pipeline, eval e política de aprendizado da empresa. V2 acrescenta o Retrieval Contract. |
| System Pack | O pacote de Sistema que pode vir da comunidade, junto com laboratório, release e instalação assistida. Antes de T4, a recomendação continua proposta e nada é instalado. |
| System Source Binding | O binding privado que diz qual Fonte local cumpre um papel exigido pelo Sistema. `ready` exige Fonte ativa, modo compatível, grant vigente e o mesmo aprovador. |
| T0 a T4 | Os marcos de ativação do Cérebro Base. T0, a conversa de trabalho começou. T1, a menor Fonte real está autorizada e legível. T2, o primeiro artefato foi apresentado. T3, ele foi aprovado e o contexto salvo. T4, esse contexto voltou numa segunda tarefa sem reler o bruto. |
| Vibe Makers | A comunidade do produto. O catálogo dela fica em `comunidade/vibe-makers/`, no motor, e o que o dono propõe fica em `comunidade/minhas-contribuicoes/`. |
| Workspace | A pasta de trabalho de um Sistema instalado por pacote da comunidade, ao lado do bundle da release e do recibo de instalação. |

# SONVI

Sistema de gestão para grupos de rádio: comercial, PI, OPEC, programação e financeiro. A especificação está em `~/Documents/Sistema de Gestão para Rádios — Documento do Projeto.pdf`.

## Linguagem e estrutura

- HTML, CSS e JavaScript puros, sem framework e sem etapa de build. O app abre com dois cliques em `app/index.html`.
- Scripts clássicos (não ES modules, que não funcionam via `file://`), carregados em ordem pelo `index.html`. Tudo vive no objeto global `SONVI` (apelido `S`).
- `app/js/config.js`: endereço e chave pública do Supabase. `core.js`: utilitários e navegação. `dados.js`: toda conversa com a nuvem. `app.js`: barra lateral e eventos. Cada módulo é um arquivo que registra telas em `S.views` e ações em `S.actions`.
- Regras de negócio ficam em funções puras, separadas da tela (ex.: `pi-regras.js`).
- Interface, nomes de tela, tabelas, colunas e comentários em português do Brasil.

## Nuvem (Supabase, projeto "SONVI", id `ccfsyhniwwspnpnpkjzf`)

- Nenhum dado fica no navegador. `S.db` é só uma cópia em memória do que veio da nuvem; gravações usam `S.salvar` / `S.excluir` / `S.run` de `dados.js`. Não usar `localStorage` para conteúdo (exceções: a sessão de login do Supabase e qual rádio estava aberta, `sonvi-radio-<usuário>`, para voltar nela ao recarregar).
- A estrutura do banco está em `database/`, em arquivos numerados. Toda mudança de tabela, função ou política entra como arquivo novo ali e é aplicada como migração.
- Quem protege os dados é o banco (RLS por veículo e por perfil); esconder um botão na tela não é segurança. Perfis: diretor (todas as rádios), gerente, consultor, opec, financeiro.
- Usuários: só o diretor cadastra (Administração → Usuários). A conta nasce na função de borda `usuarios` (`supabase/functions/usuarios`), que gera um link de acesso para enviar pelo WhatsApp (o e-mail grátis do Supabase não entrega para fora da equipe); a pessoa abre o link e cria a senha. Nome, função e rádios mudam por `salvar_usuario`. Não há mais "Criar conta" na tela de entrada.
- O PI nasce por `criar_pi`, muda de status só por `mudar_status_pi` e é faturado por `faturar_pi`. Nunca alterar `status` com update direto.
- Só a chave pública (publishable) pode aparecer no código. Nunca a `service_role`.

## Regras do produto

- Tudo é individual por veículo (rádio): clientes, agências, PIs e numeração (`PI VERDE 0001`). Nenhum dado de uma rádio aparece em outra.
- Fluxo do PI: Rascunho → Na OPEC → Devolvido ou Aprovado → Programado → Faturado. Só se edita em Rascunho ou Devolvido.
- Tela do PI (referência aprovada): abas Detalhes · Faturamento · Mídias · Histórico; faixa de informações (tipo de mídia, projeto, cliente, agência, veículo; comissão, honorários, desconto geral, prazo); peças com letra e cor; grades por praça e mês com os dias para digitar; resumo financeiro; observações (saem no PI exportado). Sem Resultados e sem Briefing.
- O PI abre para consulta. "Editar" libera os campos; nada vai para a nuvem até "Salvar". "Cancelar" desfaz. Sair do PI ou trocar de rádio com alterações pendentes pergunta antes.
- Arquivos do PI ficam no armazenamento privado "midias", em `<veiculo>/<pi>/arquivo` (regras em `database/002_midias_do_pi.sql`).

## Visual

- Identidade SONVI (logo e paleta em `marca/` na pasta do projeto; versões do logo em `app/img/`): azul `#0055FF` como destaque, azul-claro `#0199FF` para o que está em andamento, preto e branco. Títulos e números em Sora, textos em Geist (Google Fonts).
- Limpo e sofisticado: muito espaço em branco, cartões brancos com cantos de 22 px sobre cinza claro, botões em pílula, poucos elementos por tela. O mockup aprovado é a referência ("SONVI — Novo visual").
- Usar sempre as variáveis e classes de `app/css/sonvi.css` (`.card`, `.hd`, `.cols`, `.btn`, `.pill`, `.seg`, `.tile`/`.tile.hero`, `.bars`, `.stack`, `.legend`, `.prog`, `.people`, `.list`, `.steps`, `.next`, `.agenda`); ícones por `S.svg(nome)` e selo da rádio por `S.vav(veiculo)`. Não criar cores ou estilos soltos nos módulos.
- Movimento: os blocos entram em sequência só quando a tela muda (classe `entra`, controlada em `app.js`), gráficos crescem, status "Na OPEC" pulsa. Respeitar "reduzir movimento" do sistema.
- Claro e escuro automáticos.
- Cor da rádio: cada veículo tem logo quadrado (500 × 500, coluna `logo` em `veiculos`) e uma `cor` tirada do logo. `S.temaRadio` troca o `--accent` do sistema pela cor da rádio selecionada (ajustada para manter contraste); o logo e a cor saem no PI. Sem logo, fica o azul SONVI. Cores de status continuam fixas.
- Todo o sistema é responsivo, sem exceção: cada tela precisa funcionar bem no celular (375 px), em notebook (1366–1440 px) e em tela grande (1920 px). No celular a barra lateral vira barra de abas flutuante, tabelas viram listas ou cartões e grades de dias viram calendário; em telas menores o conteúdo se reorganiza, nunca fica cortado.

## Programação musical

- Módulo `musical` (`app/js/musical.js`), com as regras e a geração automática em funções puras em `musical-regras.js` (`S.mus`). Tabelas em `database/006_programacao_musical.sql`; perfil "programador" em `007`.
- Programam: diretor, gerente e programador (`programa_musica`). A OPEC só consulta (`ve_musica`). Os dados carregam só ao abrir o módulo (`S.carregarMusical`), a semana com o dia anterior junto.
- A rádio nova começa vazia; "Preparar a programação musical" chama `mus_iniciar` (categorias, vinhetas, formatos Dia/Noite/Madrugada e grade da semana).
- Semana de segunda (dia 0) a domingo (dia 6). `mus_config.grade` = 7 × 24 ids de formato; `musicas.bloqueios` = "dia-hora" bloqueados. Cada hora gravada é uma linha de `mus_programacao` com `itens` (MUS, VIN, BRK, INF).
- Geração em camadas pela prioridade da categoria; em cada posição vence a música que quebra menos regras e, no empate, a que está há mais tempo sem tocar. Escolhas à mão ficam marcadas `manual`.
- Pendente: `salvar_usuario` ainda não aceita "programador" na edição de um usuário (a mudança precisa de aprovação no Supabase; o cadastro novo já aceita).

## Publicar

- O site (Netlify) publica sozinho a cada envio ao GitHub. A cada publicação, trocar o número `?v=` dos arquivos em `app/index.html` (data-hora), para o navegador baixar a versão nova.

- Função de borda `usuarios`: publicar pela ferramenta do Supabase com o arquivo nomeado `source/index.ts` e `entrypoint_path` = `source/index.ts`, `verify_jwt` = false (a própria função confere se quem chama é diretor). Com o nome `index.ts` sozinho o envio falha com "internal error".

## Testar

- O servidor de preview não tem permissão de leitura em `~/Documents`. Para testar no navegador, copie `app/` para uma pasta temporária e sirva de lá.
- Não criar contas nem entrar com senha pelo app durante testes. Regras do banco se testam por SQL dentro de um bloco que termina em erro (nada fica gravado); telas se testam preenchendo `S.me` e `S.db` em memória.

`prototipos/pi.html` é o primeiro protótipo do PI, em arquivo único e sem nuvem; o módulo oficial é `app/js/pi.js`.

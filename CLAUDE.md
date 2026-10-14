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
- Cliente/agência em várias rádios (`pessoas.js`, `database/015_cadastro_em_varias_radios.sql`): cada rádio continua com o próprio cadastro; as cópias ficam ligadas por `cadastro_id` e pelo CNPJ/CPF só com números (`documento_num`). Ao criar, "Cadastrar também em" (consultor e agência escolhidos por rádio); menu ⋯ "Levar para outra rádio"; ao digitar um CNPJ que já existe em outra rádio, "Trazer os dados". Ao alterar dados cadastrais, pergunta se atualiza nas outras rádios (só cadastrais; consultor, situação, agência, comissão e observações ficam por rádio). Funções `levar_pessoa` e `atualizar_cadastros_irmaos` (security invoker: valem as regras de pessoas; o consultor só leva para as rádios que atende e só a própria carteira; na outra rádio o cliente nasce com a mesma situação da origem, `016_situacao_vai_junto.sql`).
- Arquivos do PI ficam no armazenamento privado "midias", em `<veiculo>/<pi>/arquivo` (regras em `database/002_midias_do_pi.sql`).

## Visual

- Identidade SONVI (logo e paleta em `marca/` na pasta do projeto; versões do logo em `app/img/`): azul `#0055FF` como destaque, azul-claro `#0199FF` para o que está em andamento, preto e branco. Títulos e números em Sora, textos em Geist (Google Fonts).
- Limpo e sofisticado: muito espaço em branco, cartões brancos com cantos de 22 px sobre cinza claro, botões em pílula, poucos elementos por tela. O mockup aprovado é a referência ("SONVI — Novo visual").
- Usar sempre as variáveis e classes de `app/css/sonvi.css` (`.card`, `.hd`, `.cols`, `.btn`, `.pill`, `.seg`, `.tile`/`.tile.hero`, `.bars`, `.stack`, `.legend`, `.prog`, `.people`, `.list`, `.steps`, `.next`, `.agenda`); ícones por `S.svg(nome)` e selo da rádio por `S.vav(veiculo)`. Não criar cores ou estilos soltos nos módulos.
- Movimento: os blocos entram em sequência só quando a tela muda (classe `entra`, controlada em `app.js`), gráficos crescem, status "Na OPEC" pulsa. Respeitar "reduzir movimento" do sistema.
- Claro e escuro automáticos.
- Menu lateral em cinza sóbrio `--menu` (#71717A no claro, #A1A1AA no escuro; referência StayOne). `--ink-3` (#6B6B74) é o cinza mais claro permitido para texto: tudo passa 4,5:1.
- Acessibilidade (WCAG 2.1 AA, auditada com axe: zero problemas em todas as telas): títulos de cartão são `<h2>` (o `<h1>` é o da página); conteúdo dentro de `<main>`; tudo que tem `data-act`/`data-go` recebe Tab e Enter sozinho (`app.js`); links do menu com `href`; imagens com `width`/`height`; coluna sem título usa `<span class="sr">`. Nada de `confirm()`: usar `await S.confirmar(texto, { ok, voltar, perigo })`. Erro de validação embaixo do campo com `S.erroNoCampo(campo, msg)`. Formulários (`S.form`) perguntam "Descartar o que você digitou?" antes de fechar com algo digitado; janelas devolvem o foco ao botão que as abriu.
- Cor da rádio: botões ajustados para 4,5:1 com texto branco; selo da rádio usa letra escura quando a branca não tem contraste. O tema da rádio nunca muda as cores de status.
- Celular: barra de abas mostra 4 itens + "Mais" (o resto, com o número de pendências); Clientes, Agências e OPEC viram cartões; alvos de toque de 44 px.
- Cor da rádio: cada veículo tem logo quadrado (500 × 500, coluna `logo` em `veiculos`) e uma `cor` tirada do logo. `S.temaRadio` troca o `--accent` do sistema pela cor da rádio selecionada (ajustada para manter contraste); o logo e a cor saem no PI. Sem logo, fica o azul SONVI. Cores de status continuam fixas.
- Todo o sistema é responsivo, sem exceção: cada tela precisa funcionar bem no celular (375 px), em notebook (1366–1440 px) e em tela grande (1920 px). No celular a barra lateral vira barra de abas flutuante, tabelas viram listas ou cartões e grades de dias viram calendário; em telas menores o conteúdo se reorganiza, nunca fica cortado.

## Tabela de preços

- `app/js/cadastros.js`: grade com programas nas linhas, agrupados em seções (`produtos.secao`: programa, quadro, rotativo), e formatos nas colunas. Formato cobrado por duração (`cobranca` = duracao, spot 15"/30"...) ou com preço único (`unico`, ex.: testemunhal), numa coluna à parte. "Dias e horário" aceita uma linha por faixa. Migração em `database/009_secoes_e_preco_unico.sql`.

- Tabelas de preço (`tabelas_preco`, `database/013_tabelas_de_preco.sql`): cada tabela tem nome e situação, Rascunho → Agendada → Vigente → Encerrada (`S.situacaoTabela`, `S.tabelaVigente` em `pi-regras.js`). Cada preço pertence a uma tabela (`precos.tabela_id`); a tabela é completa (um preço por programa × formato). Rascunho: diretor e gerente; publicar (`publicar_tabela`, com data de início ≥ hoje), voltar para rascunho (`despublicar_tabela`) e corrigir agendada ou vigente: só o diretor. Encerradas são só consulta.
- Tela: `/cadastros` = lista de tabelas (cartões + prévia da vigente); `/cadastros/<id>` = editor. No editor as mudanças ficam na tela (`ed`) até "Salvar" (`salvar_tabela` grava/atualiza; o que saiu da tabela é apagado em `precos`); "Descartar" volta; sair ou trocar de rádio com alterações pendentes pergunta. Cada preço mostra o da tabela de origem (`base_id`) e a diferença; "Reajustar vários de uma vez" calcula a partir da tabela de origem.
- O PI pega o preço da tabela vigente no dia em que é criado (`S.preco`); rascunhos e agendadas nunca entram no PI.

## PI impresso

- `S.buildPrint` (`pi.js`) monta o contrato de publicidade numa folha deitada: Ofício/Legal por padrão ou A4 (`veiculos.pi_papel`, regra `@page` em `<style id="pagina">`). Estilos `.pidoc`/`.pd-*` em `sonvi.css` valem na prévia e no PDF.
- Textos por rádio em Administração → Veículos → "Textos do PI": `pi_cidade`, `pi_pagamento`, `pi_condicoes` (vazio = `S.PI_CONDICOES_PADRAO` de `pi-regras.js`; `{RADIO}` e `{CIDADE}` são trocados). Migração `database/010_textos_do_pi.sql`.

## Financeiro

- `app/js/financeiro.js`: filtros (período, situação, tipo, busca), indicadores do período, fluxo de 6 meses, idade dos recebíveis, lista por mês, baixa em lote. Baixa e estorno só pelas funções `baixar_lancamentos` (juros, desconto, valor parcial gera parcela "restante" com `origem_id`, NF, observação) e `estornar_baixa` (`database/011_baixa_de_lancamentos.sql`). Recebido = `valor_pago` (vazio em baixas antigas = `valor`).
- Relatórios (botão no topo do Financeiro): contas a receber/pagar, recebimentos, inadimplência, faturamento por cliente/agência, vendas por consultor, previsão de caixa, NF pendentes; PDF (A4 em pé: cabeçalho da rádio, quadros de resumo, participação, tabela por mês, "como ler", rodapé) e planilha CSV (; e vírgula decimal). Na impressão, tudo fora de #print fica escondido (inclusive o selo do Netlify).
- Lançamento avulso (sem PI, com `categoria`): o financeiro cria e exclui enquanto em aberto (políticas em `database/012_lancamentos_avulsos.sql`).

## Sonvi Music

- Aplicativo separado para programadores e locutores, em `app/music/` (depois `music.sonvi.com.br` aponta para lá). `music/index.html` usa `<base href="../">` e carrega os mesmos arquivos do SONVI com `window.SONVI_APP = 'music'` (`S.APP`). Login, marca (`img/sonvi-music*.png`) e menu próprios; a sessão fica guardada à parte (`storageKey` 'sonvi-music-auth'), então entrar num não entra no outro.
- Menu em `app/js/music.js` (`S.MUSIC_NAV`): Hoje no ar, Programação, Acervo, Relógios, Categorias, Regras, Painéis, Comerciais da OPEC, Relatórios e ECAD. Cada item abre uma parte de `musical.js` (`S.musAba`). Perfis do Sonvi Music: `S.MUSIC_PERFIS` (diretor, gerente, programador, locutor, opec); só aparecem as rádios em que a pessoa trabalha com a programação.
- No SONVI, o item "Sonvi Music" (abaixo de Tabela de preços) abre `music/` em outra aba. Quem só tem perfil musical vê no SONVI um atalho para o Sonvi Music.
- Proposta visual aprovada no quadro de design (seção "Sonvi Music · proposta"): login escuro, semana do programador, editar a hora, estúdio do locutor (escuro, letras grandes) e celular.
- Radar (`app/js/radar.js`, menu do Sonvi Music, só diretor/gerente/programador): o que está nos streams comparado com o acervo, em preto e branco com o logo oficial do Spotify (`img/spotify-preto.png`/`spotify-branco.png`). Para não violar os termos do Spotify: os atalhos só abrem as paradas no Spotify (nada de copiar/scraping); a lista vem da playlist "Radar <rádio>" na conta do próprio programador; dados do Spotify só na memória da tela, nunca no banco; atribuição "fornecidos por Spotify". Login oficial com PKCE (sem chave secreta): o Client ID público fica em `config.js` (`spotifyClientId`); o retorno (`?code=`) é capturado no `music/index.html` antes do Supabase carregar. Exceção de `localStorage`: a sessão do Spotify de cada usuário (`sonvi-spotify-<usuário>`). Desde 2026 o Spotify não manda popularidade nem ISRC para apps em modo de desenvolvimento (até 5 contas); a comparação com o acervo é por título + intérprete, e a popularidade aparece como "—" quando não vem.
- Perfil "locutor": vê a programação e troca músicas (`ve_musica` e política `mus_programacao_locutor`, `database/014_sonvi_music_locutor.sql`). Pendente de aprovação no Supabase: aceitar "locutor" em `usuario_veiculos` e em `salvar_usuario` (parte que troca a regra existente).

## Programação musical

- Módulo `musical` (`app/js/musical.js`), com as regras e a geração automática em funções puras em `musical-regras.js` (`S.mus`). Tabelas em `database/006_programacao_musical.sql`; perfil "programador" em `007`.
- Programam: diretor, gerente e programador (`programa_musica`). A OPEC só consulta (`ve_musica`). Os dados carregam só ao abrir o módulo (`S.carregarMusical`), a semana com o dia anterior junto.
- A rádio nova começa vazia; "Preparar a programação musical" chama `mus_iniciar` (categorias, vinhetas, formatos Dia/Noite/Madrugada e grade da semana).
- Semana de segunda (dia 0) a domingo (dia 6). `mus_config.grade` = 7 × 24 ids de formato; `musicas.bloqueios` = "dia-hora" bloqueados. Cada hora gravada é uma linha de `mus_programacao` com `itens` (MUS, VIN, BRK, INF).
- Geração em camadas pela prioridade da categoria; em cada posição vence a música que quebra menos regras e, no empate, a que está há mais tempo sem tocar. Escolhas à mão ficam marcadas `manual`.
- Pendente: `salvar_usuario` ainda não aceita "programador" na edição de um usuário (a mudança precisa de aprovação no Supabase; o cadastro novo já aceita).

## Site (landing page)

- `app/site/index.html`: página de apresentação da SONVI e do Sonvi Music, em arquivo único (estilos e script dentro), rolagem suave com inércia pela Lenis (`app/site/lenis.min.js`, 1.1.20, MIT, guardada junto para não depender de CDN), parallax em JS com amortecimento (`data-v` = velocidade da camada, limitada a 90 px; `data-h` = faixa que anda de lado) e blocos que sobem e aparecem ao entrar na tela (classe `rv`, usa `translate` para não brigar com o `transform` do parallax). Tudo desligado com "reduzir movimento". Usa os logos de `app/img/` e as mesmas fontes. Endereço: sonvi.com.br (o `netlify.toml` reescreve a raiz de sonvi.com.br para `/site/index.html` e manda www para sem www); também abre em `/site/` em qualquer domínio do site. Caminhos de imagens e da Lenis são absolutos (`/img/...`, `/site/lenis.min.js`) para funcionar nos dois. "Entrar" leva ao login em https://teste.sonvi.com.br/ (e Sonvi Music em /music/). DNS do sonvi.com.br fica no Registro.br: A @ → 75.2.60.5 (Netlify) e CNAME www → sonvi.netlify.app; no Netlify, sonvi.com.br entra como domínio adicional (alias), sem virar o principal.
- Contato: WhatsApp do Luiz só no link (wa.me/5565998113738, com mensagem pronta no "Agendar demonstração" e no "Falar no WhatsApp"); o número nunca aparece escrito na página, só o símbolo do WhatsApp (SVG na própria página). O e-mail ainda não existe: quando o Luiz passar, entra na chamada final e no rodapé. Rádios, nomes e valores das telas da página são inventados.
- Visual aprovado: limpo, muito respiro, títulos de seção em azul maiúsculo sem caixa, cartões com borda fina. Zero problemas no axe.

## Publicar

- O site (Netlify) publica sozinho a cada envio ao GitHub. A cada publicação, trocar o número `?v=` dos arquivos em `app/index.html` (data-hora), para o navegador baixar a versão nova.

- Função de borda `usuarios`: publicar pela ferramenta do Supabase com o arquivo nomeado `source/index.ts` e `entrypoint_path` = `source/index.ts`, `verify_jwt` = false (a própria função confere se quem chama é diretor). Com o nome `index.ts` sozinho o envio falha com "internal error".

## Testar

- O servidor de preview não tem permissão de leitura em `~/Documents`. Para testar no navegador, copie `app/` para uma pasta temporária e sirva de lá.
- Não criar contas nem entrar com senha pelo app durante testes. Regras do banco se testam por SQL dentro de um bloco que termina em erro (nada fica gravado); telas se testam preenchendo `S.me` e `S.db` em memória.

`prototipos/pi.html` é o primeiro protótipo do PI, em arquivo único e sem nuvem; o módulo oficial é `app/js/pi.js`.

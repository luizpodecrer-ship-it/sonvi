# MAPA do SONVI

Gerado por `ferramentas/mapa.py` (não editar à mão; rode o script de novo depois de mudanças grandes).
Use para achar o arquivo e a função certos antes de abrir qualquer coisa; depois leia só o trecho (Grep/Read com offset).

## App (`app/js/`, ordem de carga em `app/index.html`)

### admin.js · 616 linhas
- Telas (`S.views`): admin
- Ações (`data-act`): admAba, admAtivo, admCopiar, admEmpresa, admEnviarAcesso, admExcluir, admMinhaSenha, admPropostas, admSenha, admTextoPadrao, admTextosPI, admUsuario, admUsuarioEditar, admUsuarioMenu, admVeiculo, admVeiculoMenu, admVoltar, colAtivo, colDesligados, colEditar, colExcluir, colMenu, colNovo, empAba, empCnpj, empCor, empLogoEscolher, lixApagar, lixEsvaziar, lixMenu, lixRestaurar
- Define `S.`: admAbrir, colaboradoresUsar, gerenteCadastra, rdUsar
- Banco (rpc): lixeira_esvaziar, lixeira_lista, lixeira_restaurar, resumo_config_ler, resumo_config_salvar, resumo_pessoa_salvar, salvar_usuario
- Tabelas lidas/gravadas: colaboradores, empresa_comercial
- Funções de borda: usuarios

### agencias.js · 121 linhas
- Telas (`S.views`): agencias, agencias-v
- Ações (`data-act`): agEditar, agExcluir, agMenu, agNova, agVer
- Define `S.`: agenciasLimpar, agenciasN, agenciasRecarregar, agenciasTela, agenciasUsar
- Banco (rpc): agencias_grupo, excluir_agencia_grupo, salvar_agencia_grupo

### app.js · 238 linhas
- Telas (`S.views`): soMusic
- Ações (`data-act`): menuRecolher, navAbrir, navIr, navMais, pular
- Define `S.`: abrirVeiculo, carregando, celular, iniciar, render, trocarVeiculo

### auth.js · 120 linhas
- Ações (`data-act`): authEsqueci, authRecarregar, authVoltar, contaMenu, encerrarSuporte, sair, trocarMinhaSenha
- Define `S.`: bloqueio, contaServidor, ctx, db, definirSenha, esqueci, me, telaDeAcesso, trocarMinhaSenha
- Banco (rpc): encerrar_suporte, iniciar_suporte
- Funções de borda: usuarios

### cadastros.js · 609 linhas
- Telas (`S.views`): cadastros
- Ações (`data-act`): tpAbrir, tpAddForm, tpAddProg, tpAplicar, tpAtivo, tpCanal, tpCelOk, tpDescartar, tpDespublicar, tpEditar, tpEditarProd, tpEditarTabela, tpEntrega, tpExcluir, tpExcluirTabela, tpMenuTabela, tpMover, tpNova, tpPacote, tpPdf, tpProduto, tpPublicar, tpSalvarTabela, tpSecao, tpTirar, tpTirarPacote, tpVoltarBase
- Define `S.`: tpSujo
- Banco (rpc): despublicar_tabela, excluir_tabela, nova_tabela, publicar_tabela, salvar_itens_tabela, salvar_pacotes_tabela, salvar_tabela
- Tabelas lidas/gravadas: precos

### casillero.js · 138 linhas
- Define `S.`: casillero, cxHtml

### chamados.js · 132 linhas
- Telas (`S.views`): chamados
- Ações (`data-act`): chAba, chAbrir, chMes, chPagina, chSit
- Define `S.`: chamadosAtualizar, chamadosUsar
- Tabelas lidas/gravadas: console_chamados, suporte_acessos

### combos.js · 163 linhas
- Telas (`S.views`): combos
- Ações (`data-act`): cbAbrir, cbAdd, cbDescartar, cbDuplicar, cbEditar, cbExcluir, cbLigar, cbMenu, cbNovo, cbSalvar, cbTirar, cbVoltar
- Define `S.`: comboSujo, combosAtivos, combosUsar, itensDoCombo
- Tabelas lidas/gravadas: combos, precos, produtos, tabelas_preco

### comissoes.js · 343 linhas
- Ações (`data-act`): cmAbrir, cmEditarCol, cmEnviar, cmEnviarTodos, cmFechar, cmMenuMes, cmMes, cmPagas, cmPdf, cmPlanilha, cmReabrir, cmVer, cmVoltar, cmWhatsUm
- Define `S.`: comissaoPct, comissaoPctUsar, comissoesAbrirConsultor, comissoesLimpar, comissoesTela, comissoesUsar, minhaComissaoHtml, minhaComissaoUsar
- Banco (rpc): comissoes_do_mes, comissoes_pagas, comissoes_pct, comissoes_periodo, extrato_previa_link, extrato_registrar_envio, fechar_comissoes, reabrir_comissoes
- Tabelas lidas/gravadas: colaborador_comissoes, colaboradores, pis, propostas
- Funções de borda: comissoes

### config.js · 10 linhas

### core.js · 636 linhas
- Ações (`data-act`): formEditar, logoCor, logoEscolher, logoRemover
- Define `S.`: APP, CAMPO_EXEMPLO, CAMPO_MASCARA, CATEGORIAS, COR_PADRAO, EDITABLE, ICON, MASK, MUSIC_PERFIS, PERFIS, STATUS, STATUS_COR, _menu, _toast, brl, buscarCep, campoLogo, categoria, categorias, confirmar, consultores, coresDoLogo, credito, datalist, dfmt, dia, dialog, edicaoConta, edicaoInicio, erroNoCampo, esc, excluirDigitando, fecharMenu, flip, focarPrimeiro, form, go, hora, iniciais, lerLogo, listaEditavel, logo, logoReserva, marcaEditando, mascarar, menu, menuDesliza, nfmt, nome, nomeCategoria, num, opts, pessoa, pessoas, piNo, pill, pode, poeRolos, responsaveis, rodapeEdicao, roloFixo, route, salvo, segDesliza, selo, svg, tag, temCategoria, temaRadio, toast, today, travarForm, uid, usuario, vav, veh, vehSub

### cruzado.js · 353 linhas
- Define `S.`: cruzado, cruzadoHtml, rolo

### cuadrante.js · 674 linhas
- Define `S.`: cuHtml, cuadrante

### dados.js · 183 linhas
- Ações (`data-act`): emailCopiar
- Define `S.`: ORG, bloqueio, carregarBase, carregarMusical, carregarOrgPublica, carregarVeiculo, ctx, definirSenha, emailManual, enviarEmail, erro, erroLink, excluir, guardarRadio, limparEndereco, me, orgPub, orgsSuporte, perfil, q, radioGuardada, recarregar, recarregarTabelas, run, salvar, sb, todos
- Banco (rpc): meu_contexto, organizacao_publica, organizacoes_para_suporte, pagamento_dos_pis, suporte_ids
- Tabelas lidas/gravadas: combos, empresa_comercial, mus_config, mus_programacao, precos, suporte_acessos, tabelas_preco, usuario_veiculos, usuarios, veiculos, vendas_lancadas
- Funções de borda: email

### data.js · 165 linhas

### digital.js · 93 linhas
- Define `S.`: acaoCanal, acaoChips, acaoDigitalDlg, acaoEntregasTxt, acaoHtml, acaoPeriodo, acaoQtd, acaoTitulo, acaoUnidades, acaoValorTabela, precoEntrega

### extrato-folha.js · 63 linhas

### financeiro.js · 519 linhas
- Telas (`S.views`): financeiro
- Ações (`data-act`): finAvulso, finBaixa, finCobrar, finCsv, finDetalhe, finEmail, finEstornar, finExcluir, finExcluirTudo, finFaturar, finIrMes, finLimparSel, finLote, finMenu, finMes, finNf, finPdf, finRel, finRelatorios, finSit, finTipo, finVenc, finVerPi, finVoltar
- Define `S.`: finMes
- Banco (rpc): baixar_lancamentos, estornar_baixa, excluir_lancamento_diretor, faturar_pi, faturar_pi_mes
- Tabelas lidas/gravadas: lancamentos

### fluido.js · 111 linhas
- Define `S.`: fluidoItem

### folha.js · 63 linhas

### followup.js · 334 linhas
- Telas (`S.views`): followup
- Ações (`data-act`): fuAmostra, fuCliente, fuExcluir, fuFoco, fuOpcoes, fuRegistrar, fuRemarcar
- Define `S.`: fuAtrasados, fuEquipeGestao, fuEquipeResto, fuEsquecidos, fuFeito, fuVerAgendaDe
- Banco (rpc): registrar_followup
- Tabelas lidas/gravadas: agenda
- Funções de borda: followup

### geral.js · 307 linhas
- Telas (`S.views`): geral
- Ações (`data-act`): ctrlCsv, geralAba, geralAbrir, geralAtualizar, geralFollowup, geralMes, geralVerAgenda
- Define `S.`: carregarGeral, controleHead, geralCalc, geralCubo, geralLimpar, geralUsar
- Tabelas lidas/gravadas: agenda, lancamentos, pessoas, pis, propostas

### importar.js · 339 linhas
- Telas (`S.views`): importar
- Ações (`data-act`): ipCadAg, ipCadCli, ipCancelar, ipCriar, ipDias, ipLinha, ipModo, ipTirar, ipTrocaAg, piImportar
- Define `S.`: importarUsar
- Banco (rpc): criar_pi, salvar_agencia_grupo
- Tabelas lidas/gravadas: pi_import_mapas, pi_importacoes
- Funções de borda: importar_pi

### metas.js · 157 linhas
- Define `S.`: diaNoMes, fatiaMes, mesAtual, metaFaixa, metasAneis, metasAnima, metasDoMes, metasEspera, metasHtml, metasLimpar, metasUsar, previstoNoMes, valorNoMes
- Banco (rpc): metas_do_mes

### music.js · 33 linhas
- Telas (`S.views`): comerciais, hoje
- Define `S.`: MUSIC_NAV

### musical-regras.js · 251 linhas
- Define `S.`: mus

### musical.js · 665 linhas
- Telas (`S.views`): musical
- Ações (`data-act`): musAba, musAbrir, musAdd, musAuto, musBaixar, musBloq, musBloqPreset, musCat, musDia, musDuas, musEscolher, musEsvaziar, musFechar, musFicha, musFmt, musFmtDesfaz, musFmtNovo, musFmtProps, musFmtSalvar, musGerar, musGradeDesfaz, musGradeSalvar, musGrupo, musHist, musHistSel, musHora, musImpModo, musImportarHD, musImportarPlanilha, musIniciar, musItemMenu, musModo, musMover, musPincel, musPinta, musPos, musRegraDel, musRegraNova, musRemover, musRitmo, musSemana, musSoLib, musSub, musTexto, musVinheta
- Define `S.`: musAba
- Banco (rpc): mus_iniciar
- Tabelas lidas/gravadas: mus_config, mus_programacao, mus_vinhetas, musicas

### opec.js · 92 linhas
- Telas (`S.views`): opec
- Ações (`data-act`): opEtapa

### painel.js · 205 linhas
- Telas (`S.views`): dashboard

### pessoas.js · 426 linhas
- Telas (`S.views`): clientes
- Ações (`data-act`): cliOrdem, cliPagina, pesCnpj, pesEditar, pesExcluir, pesIgnorar, pesLevar, pesMenu, pesNovo, pesTrazer
- Define `S.`: dadosDoCnpj
- Banco (rpc): atualizar_cadastros_irmaos, cliente_de_outro, excluir_agencia_completa, excluir_cliente_completo, levar_pessoa, vinculos_da_agencia, vinculos_do_cliente
- Tabelas lidas/gravadas: pessoas

### pi-regras.js · 339 linhas
- Define `S.`: BILLING, COBRA_OOH, DIA_LETRA, DIA_NOME, PAG_PI, PI_CONDICOES_PADRAO, PROP_CONDICOES_PADRAO, SEMANA, SITUACAO_TABELA, billingEntries, calc, diasDoMes, diasDoTexto, diasTexto, digCalc, distribuir, distribuirMes, ehDigital, emailCobrancaDe, empCurto, faixaDoTexto, fatDia, itemCalc, itemDaTabela, lancReg, lancada, lancadasBuscar, lancamentosDoPi, lancamentosDoPiMes, liquidoPi, mesesDoPi, mesesFaturados, midiaPorMes, multiMes, nomeMes, oohPorMes, pagPi, pagadorPi, parcels, piCondicoes, piNorm, piProblems, preco, precoNaTabela, propNo, propTotais, propVence, propostaComPi, qtdItem, quemAssina, reajustar, registrarLancadas, repassePct, situacaoTabela, somaDias, tabelaVigente, tipoTabela, variacoesOoh, veiculosDaProposta, vencMes
- Tabelas lidas/gravadas: vendas_lancadas

### pi.js · 1145 linhas
- Telas (`S.views`): pi, pis
- Ações (`data-act`): piAbrir, piAbrirItem, piAcao, piAddCota, piAddGrid, piAddItem, piAddPiece, piAddProjeto, piAjItem, piBaixar, piCancelar, piCancelarPI, piDistribuir, piDuplicar, piEditar, piEditarId, piEntDesfazer, piEntPublicar, piEnviarId, piEtapa, piExcluir, piExcluirTudo, piExport, piMes, piNew, piOpcoes, piOrigMenu, piOrigTirar, piOrigVer, piReenviarEmail, piRepetir, piRmGrid, piRmItem, piRmLink, piRmMidia, piRmPacote, piRmPiece, piSalvar, piTab, piVer, piVerResumo, piWhats
- Define `S.`: buildPrint, guardarOriginal, leiturasUsar, piEd, piEntrar, piEntregasPendentes, recebidoMini, seloOpec, setStatus, vigiarStatusPis
- Banco (rpc): cancelar_pi, criar_pi, enviar_pi_opec, excluir_pi_completo, marcar_entrega, mudar_status_pi, pi_aberto_opec, vinculos_do_pi
- Tabelas lidas/gravadas: midias_limpezas, pi_historico, pi_leituras, pi_links, pi_originais, pis
- Funções de borda: opec_link

### produtos.js · 657 linhas
- Telas (`S.views`): produtos
- Ações (`data-act`): pdAbrir, pdAtivo, pdEditar, pdEditarOoh, pdEditarPonto, pdExcluir, pdFaixaMais, pdFotoEscolher, pdFotoTirar, pdIncMais, pdNovaCota, pdNovo, pdNovoOoh, pdNovoPonto, pdTirarLinha, pdTirarPonto, pdVar, pdVarOohMais, pdVariacoes, pdVista, pjLinhaMais, pjModelo, pjNovo, pjVer, pjVoltarModelo, poCat, poVar, poVista
- Define `S.`: cotasAtivas, escolherProduto, faixaHoras, faixaTexto, faixasDoTexto, formatoPainel, itensDaCota, itensDoProduto, itensDoProjeto, produtosAbas, projetoDias, projetoEntregasHtml, projetoHoras, projetoObs, projetosAtivos
- Banco (rpc): salvar_produto_radio
- Tabelas lidas/gravadas: produtos

### propostas.js · 727 linhas
- Telas (`S.views`): propostas
- Ações (`data-act`): prAbrir, prAbrirPi, prAcao, prAddCombo, prAddCota, prAddProd, prAddProjeto, prAjProjeto, prAprovar, prCopiarLink, prDescartar, prDia, prDuplicar, prEnviar, prExcluir, prExcluirTudo, prGerar, prMes, prNova, prOpcoes, prPdf, prRascunho, prRecusar, prRmCombo, prRmItem, prRmProjeto, prSit, prSugerir, prVer
- Define `S.`: MODELO_PADRAO, buildProposta, dlgProjeto, htmlProposta, modeloProposta, propSujo, propostasParaPi
- Banco (rpc): enviar_proposta, excluir_proposta_completa, gerar_pi_da_proposta, gerar_pi_veiculo, mudar_situacao_proposta, vinculos_da_proposta

### radar.js · 237 linhas
- Telas (`S.views`): radar
- Ações (`data-act`): rdAcervo, rdAtualizar, rdConectar, rdCriarPlaylist, rdFiltro, rdPorNaLista, rdSair
- Tabelas lidas/gravadas: mus_programacao

### seletor.js · 117 linhas
- Define `S.`: seletorVeiculo

### suporte.js · 191 linhas
- Ações (`data-act`): irSuporte
- Define `S.`: chatSuporte, render
- Banco (rpc): abrir_chamado, chat_avaliar, chat_marcar_lido, chat_mensagens, chat_resposta_automatica, responder_chamado
- Tabelas lidas/gravadas: console_chamados
- Funções de borda: console

### vendas.js · 361 linhas
- Telas (`S.views`): vendas
- Ações (`data-act`): vdCons, vdHist, vdIrMes, vdMais, vdMes, vdPedido, vdRepExcluir, vdRepasse
- Define `S.`: lancarVenda, podeLancar, progPill, vendasComUsar, vendasUsar
- Banco (rpc): comissoes_do_mes, desfazer_venda, enviar_para_faturar, lancar_venda
- Tabelas lidas/gravadas: colaboradores, fat_pedidos, lancamentos, pis, repasses, vendas_lancadas
- Funções de borda: vendas

## Páginas soltas (`app/*.html`, `app/console/`)

- `app/confirmar.html` (129 linhas) · rpc: confirmar_faturamento, parcela_por_token, pedido_por_token, responder_pagamento · borda: —
- `app/console/console.js` (1092 linhas) · rpc: chat_mensagens, console_abrir_chamado, console_adicionar_radio, console_alterar_cobranca, console_avulso, console_baixar, console_chamado_situacao, console_dados, console_estornar, console_salvar_cliente, console_salvar_config, console_salvar_contrato, console_salvar_radio, console_slug_livre, eh_admin_plataforma, responder_chamado · borda: console, usuarios
- `app/console/index.html` (32 linhas) · rpc: — · borda: —
- `app/extrato.html` (52 linhas) · rpc: extrato_por_token · borda: —
- `app/index.html` (64 linhas) · rpc: — · borda: —
- `app/pi.html` (189 linhas) · rpc: pi_aberto, pi_por_link · borda: opec_link
- `app/proposta.html` (72 linhas) · rpc: proposta_por_link · borda: —

## Funções de borda (`supabase/functions/<nome>/`; publicar com o arquivo `source/index.ts`)

- **comissoes** (index.ts) · ações: enviar_previa, fechado, paga · rpc: comissao_contato, extrato_para_envio, extrato_previa_link, extrato_registrar_envio · remetentes: comissoes@sonvi.com.br · chamada por: comissoes.js
- **console** (index.ts) · ações: ativo, chamado_aviso, cobranca_enviar, cobranca_recibo, criar_cliente, diario_cobranca, editar_usuario, enviar_acesso, equipe_ativo, equipe_editar, equipe_enviar_acesso, equipe_excluir, equipe_novo, equipe_senha, excluir_cliente, excluir_radio, excluir_usuario, novo_diretor, novo_usuario, senha, senha_diretor, suspenso · rpc: console_criar_cliente, console_excluir_cliente, console_excluir_radio, console_papel, console_preparar_exclusao, followup_chave · remetentes: acesso@sonvi.com.br, cobranca@sonvi.com.br, suporte@sonvi.com.br · chamada por: console/console.js, suporte.js
- **email** (index.ts) · ações: — · rpc: — · remetentes: financeiro@sonvi.com.br, pi@sonvi.com.br, propostas@sonvi.com.br · chamada por: dados.js
- **followup** (index.ts) · ações: diario, fimdia, nao_atendeu, teste · rpc: eh_diretor, followup_automaticos, followup_chave, minha_org · remetentes: followup@sonvi.com.br · chamada por: followup.js
- **importar_pi** (index.ts) · ações: — · rpc: perfil_no_veiculo · remetentes: — · chamada por: importar.js
- **limpeza** (source/index.ts) · ações: — · rpc: followup_chave, midias_vencidas · remetentes: — · chamada por: —
- **opec_link** (source/index.ts) · ações: abrir, auto, cancelado, programar · rpc: pi_devolver_por_link, pi_programar_por_link · remetentes: pi@sonvi.com.br · chamada por: pi.html, pi.js
- **usuarios** (index.ts) · ações: ativo, criar, email, enviar_acesso, esqueci, excluir, link, minha_senha, senha · rpc: eh_diretor, minha_org, pode_gerenciar_usuario, preparar_exclusao_usuario, usuario_so_nas_minhas · remetentes: acesso@sonvi.com.br · chamada por: admin.js, auth.js, console/console.js
- **vendas** (index.ts) · ações: diario, faturado, pedido, perguntar, suspenso · rpc: followup_chave · remetentes: faturamento@sonvi.com.br · chamada por: vendas.js

## Banco (`database/NNN_*.sql`)

Mudou uma função? Copie a versão da **última** migração listada (é a que vale) para um arquivo novo.

### Tabelas (migração que cria) e quem usa no app

- `agenda` (001) · app: followup.js, geral.js
- `colaborador_comissoes` (046) · app: comissoes.js
- `colaborador_metas` (049) · app: —
- `colaboradores` (046) · app: admin.js, comissoes.js, vendas.js
- `combos` (044) · app: combos.js, dados.js
- `comissao_extratos` (068) · app: —
- `comissao_fechamentos` (068) · app: —
- `comissao_previas` (070) · app: —
- `console_chamado_msgs` (030) · app: —
- `console_chamados` (030) · app: chamados.js, suporte.js
- `console_cobrancas` (030) · app: —
- `console_config` (030) · app: —
- `console_contratos` (030) · app: —
- `empresa_comercial` (017) · app: admin.js, dados.js
- `fat_pedidos` (055) · app: vendas.js
- `followup_envios` (020) · app: —
- `lancamentos` (001) · app: financeiro.js, geral.js, vendas.js
- `lixeira` (063) · app: —
- `midias_limpezas` (074) · app: pi.js
- `mus_categorias` (006) · app: —
- `mus_config` (006) · app: dados.js, musical.js
- `mus_formatos` (006) · app: —
- `mus_grupos` (006) · app: —
- `mus_programacao` (006) · app: dados.js, musical.js, radar.js
- `mus_subcategorias` (006) · app: —
- `mus_vinhetas` (006) · app: musical.js
- `musicas` (006) · app: musical.js
- `organizacoes` (026) · app: —
- `pessoas` (001) · app: geral.js, pessoas.js
- `pi_historico` (001) · app: pi.js
- `pi_import_mapas` (066) · app: importar.js
- `pi_importacoes` (066) · app: importar.js
- `pi_leituras` (057) · app: pi.js
- `pi_links` (047) · app: pi.js
- `pi_originais` (067) · app: pi.js
- `pis` (001) · app: comissoes.js, geral.js, pi.js, vendas.js
- `plataforma_admins` (026) · app: —
- `precos` (001) · app: cadastros.js, combos.js, dados.js
- `produtos` (001) · app: combos.js, produtos.js
- `proposta_seq` (017) · app: —
- `proposta_seq_org` (027) · app: —
- `propostas` (017) · app: comissoes.js, geral.js
- `repasses` (055) · app: vendas.js
- `resumo_config` (083) · app: —
- `suporte_acessos` (026) · app: chamados.js, dados.js
- `tabelas_preco` (013) · app: combos.js, dados.js
- `usuario_veiculos` (001) · app: dados.js
- `usuarios` (001) · app: dados.js
- `veiculos` (001) · app: dados.js
- `vendas_lancadas` (077) · app: dados.js, pi-regras.js, vendas.js

### Funções (migrações em que aparece; a última vale) e quem chama no app

- `abrir_chamado` (030 → 031) · app: suporte.js
- `admin_usuario` (001) · app: —
- `agencia_copiar_para_todos` (058) · app: —
- `agencias_grupo` (058) · app: agencias.js
- `apagar_pi_interno` (050) · app: —
- `atualizar_cadastros_irmaos` (015) · app: pessoas.js
- `baixar_lancamentos` (011) · app: financeiro.js
- `cancelar_pi` (081) · app: pi.js
- `chamado_mensagens` (030) · app: —
- `chat_atendente` (031) · app: —
- `chat_atendentes` (031) · app: —
- `chat_avaliar` (031) · app: suporte.js
- `chat_marcar_lido` (031) · app: suporte.js
- `chat_mensagens` (031) · app: console/console.js, suporte.js
- `chat_no_horario` (031) · app: —
- `chat_resposta_automatica` (031) · app: suporte.js
- `cliente_de_outro` (022) · app: pessoas.js
- `colaboradores_confere` (046 → 049) · app: —
- `colaboradores_historico` (046) · app: —
- `colaboradores_metas_hist` (049) · app: —
- `colega` (001) · app: —
- `comissao_contato` (069 → 070) · app: —
- `comissao_parcelas_vivas` (068 → 081) · app: —
- `comissao_pct_em` (068) · app: —
- `comissao_vigente` (046) · app: —
- `comissoes_do_mes` (068) · app: comissoes.js, vendas.js
- `comissoes_pagas` (068) · app: comissoes.js
- `comissoes_pct` (068) · app: comissoes.js
- `comissoes_periodo` (068) · app: comissoes.js
- `confirmar_faturamento` (055) · app: confirmar.html
- `console_abrir_chamado` (030 → 031) · app: console/console.js
- `console_adicionar_radio` (027) · app: console/console.js
- `console_alterar_cobranca` (030) · app: console/console.js
- `console_apagar_radio_dados` (028 → 060) · app: —
- `console_avulso` (030) · app: console/console.js
- `console_baixar` (030) · app: console/console.js
- `console_chamado_situacao` (030 → 031) · app: console/console.js
- `console_criar_cliente` (027) · app: —
- `console_dados` (027 → 028 → 030) · app: console/console.js
- `console_estornar` (030) · app: console/console.js
- `console_excluir_cliente` (028 → 060) · app: —
- `console_excluir_radio` (028 → 060) · app: —
- `console_exige` (030) · app: —
- `console_papel` (030) · app: —
- `console_preparar_exclusao` (028) · app: —
- `console_salvar_cliente` (027 → 032) · app: console/console.js
- `console_salvar_config` (030 → 032) · app: console/console.js
- `console_salvar_contrato` (030) · app: console/console.js
- `console_salvar_radio` (028) · app: console/console.js
- `console_slug_livre` (027) · app: console/console.js
- `contrato_email_do_cliente` (032) · app: —
- `criar_pi` (001) · app: importar.js, pi.js
- `desfazer_venda` (077) · app: vendas.js
- `despublicar_tabela` (013) · app: cadastros.js
- `diretor_do_veiculo` (050) · app: —
- `eh_admin_plataforma` (026 → 030) · app: console/console.js
- `eh_diretor` (001 → 026) · app: —
- `encerrar_suporte` (026) · app: auth.js
- `enviar_para_faturar` (055 → 077) · app: vendas.js
- `enviar_pi_opec` (019) · app: pi.js
- `enviar_proposta` (018) · app: propostas.js
- `estornar_baixa` (011) · app: financeiro.js
- `excluir_agencia_completa` (050 → 052) · app: pessoas.js
- `excluir_agencia_grupo` (058) · app: agencias.js
- `excluir_cliente_completo` (048 → 052) · app: pessoas.js
- `excluir_lancamento_diretor` (050) · app: financeiro.js
- `excluir_pi_completo` (050 → 052 → 082) · app: pi.js
- `excluir_proposta_completa` (050 → 051 → 052) · app: propostas.js
- `excluir_tabela` (037) · app: cadastros.js
- `extrato_para_envio` (068) · app: —
- `extrato_por_token` (068 → 070) · app: extrato.html
- `extrato_previa_link` (070) · app: comissoes.js
- `extrato_registrar_envio` (068) · app: comissoes.js
- `faturar_pi` (001 → 077) · app: financeiro.js
- `faturar_pi_mes` (053 → 077) · app: financeiro.js
- `fechar_comissoes` (068) · app: comissoes.js
- `fim_veiculacao_pi` (074) · app: —
- `followup_automaticos` (020) · app: —
- `followup_chave` (020) · app: —
- `gerar_pi_da_proposta` (017 → 060) · app: propostas.js
- `gerar_pi_veiculo` (044 → 045) · app: propostas.js
- `hoje_radio` (013) · app: —
- `iniciar_suporte` (026 → 030) · app: auth.js
- `lancar_venda` (077) · app: vendas.js
- `levar_pessoa` (015 → 016) · app: pessoas.js
- `lixeira_esvaziar` (075) · app: admin.js
- `lixeira_guarda` (063) · app: —
- `lixeira_lista` (063) · app: admin.js
- `lixeira_restaurar` (063) · app: admin.js
- `marcar_entrega` (033) · app: pi.js
- `meses_do_pi` (053) · app: —
- `metas_do_mes` (049) · app: metas.js
- `meu_contexto` (026) · app: dados.js
- `midias_vencidas` (074) · app: —
- `minha_org` (026) · app: —
- `mudar_situacao_proposta` (017) · app: propostas.js
- `mudar_status_pi` (001) · app: pi.js
- `mus_iniciar` (006) · app: musical.js
- `mus_programacao_protege` (006) · app: —
- `musicas_protege` (006) · app: —
- `nova_tabela` (013 → 034 → 035) · app: cadastros.js
- `novo_usuario` (001) · app: —
- `org_padrao` (026) · app: —
- `organizacao_publica` (026) · app: dados.js
- `organizacoes_para_suporte` (026) · app: dados.js
- `pagamento_dos_pis` (022) · app: dados.js
- `parcela_por_token` (055) · app: confirmar.html
- `parcelas_do_pedido` (055) · app: —
- `pedido_por_token` (055) · app: confirmar.html
- `perfil_no_veiculo` (001 → 026) · app: —
- `pi_aberto` (057) · app: pi.html
- `pi_aberto_opec` (057) · app: pi.js
- `pi_calculo` (061 → 079) · app: —
- `pi_devolver_por_link` (067 → 077 → 078) · app: —
- `pi_item_qtd` (034) · app: —
- `pi_links_veiculo` (047) · app: —
- `pi_numero_txt` (050) · app: —
- `pi_originais_veiculo` (067) · app: —
- `pi_por_link` (019) · app: pi.html
- `pi_programar_por_link` (067) · app: —
- `pi_publicacoes` (033 → 034) · app: —
- `pi_publicacoes_com_data` (033 → 034) · app: —
- `pi_valor_mes` (081) · app: —
- `pis_calcula` (062) · app: —
- `pis_programado_em` (077) · app: —
- `pis_protege` (001 → 025 → 033 → 050) · app: —
- `pis_repasse` (049) · app: —
- `pis_venda_sozinha` (078 → 081) · app: —
- `pode_editar_tabela` (013 → 035 → 043) · app: —
- `pode_excluir` (052) · app: —
- `pode_excluir_agencia` (052) · app: —
- `pode_gerenciar_usuario` (023 → 026) · app: —
- `pode_lancar_venda` (077) · app: —
- `preparar_exclusao_usuario` (025 → 026) · app: —
- `produtos_variacao_em_uso` (059) · app: —
- `programa_musica` (006) · app: —
- `proposta_por_link` (018) · app: proposta.html
- `propostas_protege` (017 → 025 → 027) · app: —
- `publicar_tabela` (013) · app: cadastros.js
- `reabrir_comissoes` (068) · app: comissoes.js
- `registrar_acesso` (004 → 060) · app: —
- `registrar_followup` (020) · app: followup.js
- `responder_chamado` (030 → 031) · app: console/console.js, suporte.js
- `responder_pagamento` (055) · app: confirmar.html
- `resumo_config_ler` (083) · app: admin.js
- `resumo_config_nova_org` (083) · app: —
- `resumo_config_salvar` (083) · app: admin.js
- `resumo_pessoa_salvar` (083) · app: admin.js
- `salvar_agencia_grupo` (058 → 076) · app: agencias.js, importar.js
- `salvar_itens_tabela` (034 → 035) · app: cadastros.js
- `salvar_pacotes_tabela` (035) · app: cadastros.js
- `salvar_produto_radio` (043 → 071) · app: produtos.js
- `salvar_tabela` (013 → 036 → 037) · app: cadastros.js
- `salvar_usuario` (004 → 007 → 014 → 021 → 023 → 026 → 060) · app: admin.js
- `slug_reservado` (027) · app: —
- `sonvi_int` (061) · app: —
- `sonvi_num` (061) · app: —
- `sonvi_parte` (061) · app: —
- `suporte_ids` (026) · app: dados.js
- `suporte_org` (026) · app: —
- `tabela_produtos` (043) · app: —
- `tabelas_preco_protege` (013 → 035 → 043) · app: —
- `ultimo_acesso_pela_sessao` (082) · app: —
- `usuario_so_nas_minhas` (023 → 026) · app: —
- `ve_chamado` (030) · app: —
- `ve_colaboradores` (046) · app: —
- `ve_musica` (006 → 014) · app: —
- `veiculo_novo_com_agencias` (058) · app: —
- `veiculo_publico` (055) · app: —
- `veiculos_categoria_principal` (040) · app: —
- `vinculo_na_organizacao` (026) · app: —
- `vinculos_da_agencia` (050 → 052) · app: pessoas.js
- `vinculos_da_proposta` (050 → 052) · app: propostas.js
- `vinculos_do_cliente` (048 → 052) · app: pessoas.js
- `vinculos_do_pi` (050 → 052) · app: pi.js

### Gatilhos (tabela, migração)

`ao_criar_usuario` (auth, 001), `ao_entrar` (auth, 060), `colaboradores_metas_hist` (colaboradores, 049), `contrato_email_do_cliente` (console_contratos, 032), `lixeira_guarda` (comissao_fechamentos, 068), `mus_programacao_protege` (mus_programacao, 006), `musicas_protege` (musicas, 006), `pi_originais_veiculo` (pi_originais, 067), `pis_calcula` (pis, 062), `pis_programado_em` (pis, 077), `pis_protege` (pis, 001), `pis_repasse` (pis, 049), `pis_venda_sozinha` (pis, 078), `produtos_variacao_em_uso` (produtos, 059), `propostas_protege` (propostas, 017), `resumo_config_nova_org` (organizacoes, 083), `tabelas_preco_protege` (tabelas_preco, 013), `ultimo_acesso_sessao` (auth, 082), `veiculos_agencias` (veiculos, 058), `veiculos_categoria_principal` (veiculos, 040)

## Onde ficam os `S.` (função → arquivo)

`_menu` core, `_toast` core, `abrirVeiculo` app, `acaoCanal` digital, `acaoChips` digital, `acaoDigitalDlg` digital, `acaoEntregasTxt` digital, `acaoHtml` digital, `acaoPeriodo` digital, `acaoQtd` digital, `acaoTitulo` digital, `acaoUnidades` digital, `acaoValorTabela` digital, `admAbrir` admin, `agenciasLimpar` agencias, `agenciasN` agencias, `agenciasRecarregar` agencias, `agenciasTela` agencias, `agenciasUsar` agencias, `APP` core, `BILLING` pi-regras, `billingEntries` pi-regras, `bloqueio` auth, `brl` core, `buildPrint` pi, `buildProposta` propostas, `buscarCep` core, `calc` pi-regras, `CAMPO_EXEMPLO` core, `CAMPO_MASCARA` core, `campoLogo` core, `carregando` app, `carregarBase` dados, `carregarGeral` geral, `carregarMusical` dados, `carregarOrgPublica` dados, `carregarVeiculo` dados, `casillero` casillero, `categoria` core, `CATEGORIAS` core, `categorias` core, `celular` app, `chamadosAtualizar` chamados, `chamadosUsar` chamados, `chatSuporte` suporte, `COBRA_OOH` pi-regras, `colaboradoresUsar` admin, `combosAtivos` combos, `comboSujo` combos, `combosUsar` combos, `comissaoPct` comissoes, `comissaoPctUsar` comissoes, `comissoesAbrirConsultor` comissoes, `comissoesLimpar` comissoes, `comissoesTela` comissoes, `comissoesUsar` comissoes, `confirmar` core, `consultores` core, `contaServidor` auth, `controleHead` geral, `COR_PADRAO` core, `coresDoLogo` core, `cotasAtivas` produtos, `credito` core, `cruzado` cruzado, `cruzadoHtml` cruzado, `cuadrante` cuadrante, `cuHtml` cuadrante, `cxHtml` casillero, `dadosDoCnpj` pessoas, `datalist` core, `definirSenha` auth, `dfmt` core, `dia` core, `DIA_LETRA` pi-regras, `DIA_NOME` pi-regras, `dialog` core, `diaNoMes` metas, `diasDoMes` pi-regras, `diasDoTexto` pi-regras, `diasTexto` pi-regras, `digCalc` pi-regras, `distribuir` pi-regras, `distribuirMes` pi-regras, `dlgProjeto` propostas, `edicaoConta` core, `edicaoInicio` core, `EDITABLE` core, `ehDigital` pi-regras, `emailCobrancaDe` pi-regras, `emailManual` dados, `empCurto` pi-regras, `enviarEmail` dados, `erro` dados, `erroLink` dados, `erroNoCampo` core, `esc` core, `escolherProduto` produtos, `esqueci` auth, `excluir` dados, `excluirDigitando` core, `faixaDoTexto` pi-regras, `faixaHoras` produtos, `faixasDoTexto` produtos, `faixaTexto` produtos, `fatDia` pi-regras, `fatiaMes` metas, `fecharMenu` core, `finMes` financeiro, `flip` core, `fluidoItem` fluido, `focarPrimeiro` core, `form` core, `formatoPainel` produtos, `fuAtrasados` followup, `fuEquipeGestao` followup, `fuEquipeResto` followup, `fuEsquecidos` followup, `fuFeito` followup, `fuVerAgendaDe` followup, `geralCalc` geral, `geralCubo` geral, `geralLimpar` geral, `geralUsar` geral, `gerenteCadastra` admin, `go` core, `guardarOriginal` pi, `guardarRadio` dados, `hora` core, `htmlProposta` propostas, `ICON` core, `importarUsar` importar, `iniciais` core, `iniciar` app, `itemCalc` pi-regras, `itemDaTabela` pi-regras, `itensDaCota` produtos, `itensDoCombo` combos, `itensDoProduto` produtos, `itensDoProjeto` produtos, `lancada` pi-regras, `lancadasBuscar` pi-regras, `lancamentosDoPi` pi-regras, `lancamentosDoPiMes` pi-regras, `lancarVenda` vendas, `lancReg` pi-regras, `leiturasUsar` pi, `lerLogo` core, `limparEndereco` dados, `liquidoPi` pi-regras, `listaEditavel` core, `logo` core, `logoReserva` core, `marcaEditando` core, `mascarar` core, `MASK` core, `menu` core, `menuDesliza` core, `mesAtual` metas, `mesesDoPi` pi-regras, `mesesFaturados` pi-regras, `metaFaixa` metas, `metasAneis` metas, `metasAnima` metas, `metasDoMes` metas, `metasEspera` metas, `metasHtml` metas, `metasLimpar` metas, `metasUsar` metas, `midiaPorMes` pi-regras, `minhaComissaoHtml` comissoes, `minhaComissaoUsar` comissoes, `MODELO_PADRAO` propostas, `modeloProposta` propostas, `multiMes` pi-regras, `mus` musical-regras, `musAba` musical, `MUSIC_NAV` music, `MUSIC_PERFIS` core, `nfmt` core, `nome` core, `nomeCategoria` core, `nomeMes` pi-regras, `num` core, `oohPorMes` pi-regras, `opts` core, `ORG` dados, `orgPub` dados, `orgsSuporte` dados, `PAG_PI` pi-regras, `pagadorPi` pi-regras, `pagPi` pi-regras, `parcels` pi-regras, `perfil` dados, `PERFIS` core, `pessoa` core, `pessoas` core, `PI_CONDICOES_PADRAO` pi-regras, `piCondicoes` pi-regras, `piEd` pi, `piEntrar` pi, `piEntregasPendentes` pi, `pill` core, `piNo` core, `piNorm` pi-regras, `piProblems` pi-regras, `pode` core, `podeLancar` vendas, `poeRolos` core, `preco` pi-regras, `precoEntrega` digital, `precoNaTabela` pi-regras, `previstoNoMes` metas, `produtosAbas` produtos, `progPill` vendas, `projetoDias` produtos, `projetoEntregasHtml` produtos, `projetoHoras` produtos, `projetoObs` produtos, `projetosAtivos` produtos, `PROP_CONDICOES_PADRAO` pi-regras, `propNo` pi-regras, `propostaComPi` pi-regras, `propostasParaPi` propostas, `propSujo` propostas, `propTotais` pi-regras, `propVence` pi-regras, `q` dados, `qtdItem` pi-regras, `quemAssina` pi-regras, `radioGuardada` dados, `rdUsar` admin, `reajustar` pi-regras, `recarregar` dados, `recarregarTabelas` dados, `recebidoMini` pi, `registrarLancadas` pi-regras, `render` app, `repassePct` pi-regras, `responsaveis` core, `rodapeEdicao` core, `rolo` cruzado, `roloFixo` core, `route` core, `run` dados, `salvar` dados, `salvo` core, `sb` dados, `segDesliza` core, `seletorVeiculo` seletor, `selo` core, `seloOpec` pi, `SEMANA` pi-regras, `setStatus` pi, `SITUACAO_TABELA` pi-regras, `situacaoTabela` pi-regras, `somaDias` pi-regras, `STATUS` core, `STATUS_COR` core, `svg` core, `tabelaVigente` pi-regras, `tag` core, `telaDeAcesso` auth, `temaRadio` core, `temCategoria` core, `tipoTabela` pi-regras, `toast` core, `today` core, `todos` dados, `tpSujo` cadastros, `travarForm` core, `trocarMinhaSenha` auth, `trocarVeiculo` app, `uid` core, `usuario` core, `valorNoMes` metas, `variacoesOoh` pi-regras, `vav` core, `veh` core, `vehSub` core, `veiculosDaProposta` pi-regras, `vencMes` pi-regras, `vendasComUsar` vendas, `vendasUsar` vendas, `vigiarStatusPis` pi

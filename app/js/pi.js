// SONVI · módulo de Pedidos de Inserção (PI): lista, edição em grade (com Editar/Salvar), mídias, faturamento e documento para impressão.
(() => {
  const { esc, brl, num, nfmt, dfmt, uid, today } = S;
  const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cur = () => S.db.pis.find(p => p.id === S.route().id);
  const letter = (pi, id) => { const i = pi.dados.pieces.findIndex(p => p.id === id); return i < 0 ? '' : String.fromCharCode(65 + i); };
  const blankItem = () => ({ id:uid(), piece:'', f1:'', f2:'', days:{}, unit:0, disc:{ type:'pct', value:0 }, bonus:false });
  const comercial = pi => S.pode('diretor', 'gerente') || (S.pode('consultor') && pi.consultor_id === S.me.id);
  const editavel = pi => S.EDITABLE.includes(pi.status) && comercial(pi);
  const produtos = tipo => S.db.produtos.filter(p => p.tipo === tipo && p.ativo).map(p => p.nome).sort();

  // ---------- lista ----------
  S.views.pis = () => {
    const q = S.ui.q.toLowerCase();
    const pis = S.db.pis.filter(p => !q || [p.titulo, S.nome(p.cliente_id), S.nome(p.agencia_id), S.usuario(p.consultor_id), p.projeto, S.piNo(p)].join(' ').toLowerCase().includes(q));
    // Cada PI é uma linha de uma só altura: textos longos são cortados com "…" (o nome completo aparece ao passar o mouse).
    // No notebook o consultor vira só o selo com as iniciais; no celular cada PI vira um cartão.
    const groups = Object.keys(S.STATUS).map(s => {
      const rows = pis.filter(p => p.status === s).sort((a, b) => b.numero - a.numero); if (!rows.length) return '';
      const t = { ins:0, net:0, total:0 };
      const body = rows.map(p => { const c = S.calc(p); t.ins += c.ins; t.net += c.net; t.total += c.total;
        const cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id), cons = S.usuario(p.consultor_id), tit = p.titulo || 'Sem título';
        return `<div class="pl-l click" data-go="/pi/${p.id}" role="link" tabindex="0">
          <span class="pl-n">${S.piNo(p)}</span>
          <span class="pl-t"><b title="${esc(tit)}">${esc(tit)}</b>${p.projeto ? `<small title="${esc(p.projeto)}">${esc(p.projeto)}</small>` : ''}</span>
          <span class="pl-c"><span title="${esc(cli)}">${esc(cli)}</span><small title="${esc(ag || 'Venda direta')}">${ag ? esc(ag) : 'Venda direta'}</small></span>
          <span class="pl-u" title="${esc(cons)}">${cons ? `<span class="av soft" aria-hidden="true">${esc(S.iniciais(cons))}</span><span class="pl-un">${esc(S.celular ? cons : cons.split(' ')[0])}</span>` : '<span class="muted">—</span>'}</span>
          <span class="pl-p"><small>Prazo</small>${p.prazo ? dfmt(p.prazo) : '—'}</span>
          <span class="pl-i"><small>Inserções</small>${c.ins}</span>
          <span class="pl-v"><b>${brl(c.total)}</b>${c.commission ? `<small>Líquido ${brl(c.net)}</small>` : ''}</span>
          <span class="pl-m"><button class="btn tres" data-act="piOpcoes" data-id="${p.id}" aria-label="Opções do ${S.piNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
      return `<section class="card pis-g"><div class="hd"><h2>${S.pill(s)} <span class="muted small">${rows.length} ${rows.length > 1 ? 'pedidos' : 'pedido'}</span></h2></div>
        <div class="pl"><div class="pl-l pl-cab"><span class="pl-n">Nº</span><span class="pl-t">Título</span><span class="pl-c">Cliente · agência</span><span class="pl-u">Consultor</span><span class="pl-p">Prazo</span><span class="pl-i">Inserções</span><span class="pl-v">Total</span><span class="pl-m"></span></div>
        ${body}
        <div class="pl-l pl-tot"><span class="pl-n">Total</span><span class="pl-t"></span><span class="pl-c"></span><span class="pl-u"></span><span class="pl-p"></span><span class="pl-i"><small>Inserções</small>${t.ins}</span><span class="pl-v"><b>${brl(t.total)}</b>${t.total !== t.net ? `<small>Líquido ${brl(t.net)}</small>` : ''}</span><span class="pl-m"></span></div></div></section>`;
    }).join('');
    return { title:`<span class="sub">${esc(S.veh().nome)} · ${pis.length} ${pis.length === 1 ? 'pedido' : 'pedidos'}</span>Pedidos de Inserção`, actions:S.pode('diretor', 'gerente', 'consultor') ? `<button class="btn pri" data-act="piNew">${S.svg('mais')}Novo PI</button>` : '',
      body:`<div style="margin-bottom:16px"><input type="search" style="width:100%;height:44px" placeholder="Buscar por número, título, cliente, agência ou consultor" aria-label="Buscar PIs" value="${esc(S.ui.q)}" data-ui="q"></div>${groups || `<div class="card empty"><b>Nenhum pedido${q ? ' encontrado' : ''}</b>${q ? 'Tente outra busca.' : 'Os pedidos desta rádio aparecem aqui.'}</div>`}` };
  };

  // ---------- edição com Editar / Salvar ----------
  // O PI abre para consulta. "Editar" libera os campos; as mudanças ficam só na tela até "Salvar".
  // "Cancelar" volta ao que estava salvo. Sair do PI (ou fechar a aba) com mudanças pendentes pergunta antes.
  const ed = S.piEd = { id:null, copia:null, sujo:false };
  const editando = pi => ed.id === pi.id;
  const marcarSujo = () => { if (ed.sujo) return; ed.sujo = true; document.querySelectorAll('.sujo').forEach(el => { el.hidden = false; }); };
  S.piEntrar = pi => { ed.id = pi.id; ed.copia = JSON.stringify({ titulo:pi.titulo, cliente_id:pi.cliente_id, agencia_id:pi.agencia_id, projeto:pi.projeto, prazo:pi.prazo, dados:pi.dados }); ed.sujo = false; };
  const sairEdicao = () => { ed.id = null; ed.copia = null; ed.sujo = false; };
  const desfazer = pi => { if (ed.copia && ed.id === pi.id) Object.assign(pi, JSON.parse(ed.copia)); };

  const gravar = async pi => {
    const c = S.calc(pi), r2 = v => Math.round(v * 100) / 100;
    const patch = { titulo:pi.titulo, cliente_id:pi.cliente_id || null, agencia_id:pi.agencia_id || null, projeto:pi.projeto, prazo:pi.prazo || null, dados:pi.dados, insercoes:c.ins, valor_total:r2(c.total), comissao:r2(c.commission), valor_liquido:r2(c.net) };
    await S.q(S.sb.from('pis').update(patch).eq('id', pi.id));
    Object.assign(pi, patch, { atualizado_em:new Date().toISOString() });
  };
  const salvar = async pi => {
    const b = document.querySelector('[data-act="piSalvar"]'); if (b) b.disabled = true;
    try { await gravar(pi); sairEdicao(); S.toast('PI salvo'); S.render(); return true; }
    catch (e) { console.error(e); S.toast(S.erro(e)); if (b) b.disabled = false; return false; }
  };

  S.setStatus = (pi, status, nota) => S.run(async () => {
    if (editando(pi)) { if (ed.sujo) await gravar(pi); sairEdicao(); }
    const r = await S.q(S.sb.rpc('mudar_status_pi', { p_pi:pi.id, p_status:status, p_nota:nota || '' }));
    Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id];
  }, `${S.piNo(pi)} · ${S.STATUS[status].label}`);

  // Saída do PI com alterações não salvas: volta para o PI e pergunta o que fazer
  let voltando = false;
  window.addEventListener('hashchange', () => {
    if (voltando) { voltando = false; return; }
    if (!ed.id) return;
    const r = S.route(); if (r.view === 'pi' && r.id === ed.id) return;
    const pi = S.db.pis.find(p => p.id === ed.id);
    if (!ed.sujo || !pi) { sairEdicao(); return; }
    const destino = location.hash; voltando = true; location.replace('#/pi/' + ed.id);
    setTimeout(() => {
      S.dialog(`<h2>Alterações não salvas</h2><p class="muted">Você mexeu neste PI e ainda não salvou. O que quer fazer?</p>
        <div class="row" style="flex-wrap:wrap"><span class="grow"></span><button class="btn" value="ficar">Continuar editando</button><button class="btn danger" value="descartar">Sair sem salvar</button><button class="btn pri" value="salvar">Salvar e sair</button></div>`);
      const d = document.getElementById('dlg');
      d.onclose = async () => {
        if (d.returnValue === 'salvar') { if (await salvar(pi)) location.hash = destino; }
        if (d.returnValue === 'descartar') { desfazer(pi); sairEdicao(); location.hash = destino; }
      };
    }, 30);
  });
  window.addEventListener('beforeunload', e => { if (ed.sujo) { e.preventDefault(); e.returnValue = ''; } });
  // Qualquer digitação dentro do PI em edição já acende o aviso de "não salvo"
  document.addEventListener('input', e => { if (ed.id && e.target.closest && e.target.closest('#content, #bar') && (e.target.dataset.f || e.target.dataset.day)) marcarSujo(); });

  // ---------- peças e cores ----------
  const COR = ['#0055ff', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#ec4899', '#64748b'];
  const pecaIdx = (pi, id) => pi.dados.pieces.findIndex(p => p.id === id);
  // A primeira peça usa a cor da rádio
  const corPeca = (pi, id) => { const i = pecaIdx(pi, id); return i < 0 ? 'var(--ink-3)' : i === 0 ? 'var(--accent)' : COR[i % COR.length]; };
  const selo = (pi, id, tam = '') => `<span class="pc${tam}" style="--pc:${corPeca(pi, id)}">${letter(pi, id) || '?'}</span>`;
  const mesExt = p => { const [y, m] = p.split('-').map(Number); return ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1] + ' de ' + y; };

  // ---------- cabeçalho e fluxo ----------
  const flow = pi => {
    const b = (act, label, extra = '', pri = true, icon = '') => `<button class="btn${pri === true ? ' pri' : pri ? ' ' + pri : ''}" data-act="${act}"${extra}>${icon ? S.svg(icon) : ''}${label}</button>`;
    if (S.EDITABLE.includes(pi.status)) return comercial(pi) ? b('piSend', pi.status === 'devolvido' ? 'Reenviar para a OPEC' : 'Enviar para a OPEC', '', true, 'seta') : '';
    if (pi.status === 'opec') return S.pode('diretor', 'opec') ? b('piReturn', 'Devolver', '', 'warn', 'voltar') + b('piStatus', 'Aprovar PI', ' data-to="aprovado"', true, 'check') : '';
    const faturar = S.pode('diretor', 'financeiro') ? b('finFaturar', 'Faturar', ` data-id="${pi.id}"`, pi.status === 'programado') : '';
    if (pi.status === 'aprovado') return faturar + (S.pode('diretor', 'opec') ? b('piStatus', 'Marcar como programado', ' data-to="programado"', true, 'check') : '');
    if (pi.status === 'programado') return faturar;
    if (pi.status === 'cancelado') return S.pode('diretor', 'gerente') ? b('piStatus', 'Reabrir como rascunho', ' data-to="rascunho"', false) : '';
    return '';
  };
  const salvoEm = pi => { const t = pi.atualizado_em || pi.criado_em; if (!t) return ''; const dia = S.dia(t) === S.today() ? 'hoje' : dfmt(S.dia(t)); return `Salvo ${dia} às ${S.hora(t)}`; };

  S.views.pi = () => {
    const pi = cur(); if (!pi) return { title:'Pedido não encontrado', actions:'', body:'<div class="card empty"><b>Este pedido não existe ou não é desta rádio</b><a data-go="/pis">Voltar para a lista</a></div>' };
    if (ed.id && ed.id !== pi.id && !ed.sujo) sairEdicao();
    const em = editando(pi), c = S.calc(pi), h = S.db.hist[pi.id];
    if (!h) carregarHistorico(pi);
    if (!S.db.midias[pi.id]) carregarMidias(pi);
    const devol = pi.status === 'devolvido' && h ? h.find(x => x.status === 'devolvido') : null;
    const notas = `${devol && devol.nota ? `<div class="note"><b>Devolvido pela OPEC:</b> ${esc(devol.nota)}</div>` : ''}
      ${!editavel(pi) && S.EDITABLE.includes(pi.status) ? '<div class="note info">Este PI é de outro consultor ou o seu perfil só pode consultar.</div>' : ''}
      ${!S.EDITABLE.includes(pi.status) && pi.status !== 'cancelado' ? '<div class="note info">Este PI já saiu do rascunho: está somente para consulta.</div>' : ''}`;
    const nMid = (S.db.midias[pi.id] || []).length;
    const abas = `<nav class="abas" aria-label="Abas do PI">${[['detalhes', 'Detalhes'], ['faturamento', 'Faturamento'], ['midias', `Mídias${nMid ? ` <span class="cont">${nMid}</span>` : ''}`], ['historico', 'Histórico']].map(([t, n]) => `<button class="${S.ui.tab === t ? 'on' : ''}" data-act="piTab" data-tab="${t}">${n}</button>`).join('')}</nav>`;
    const body = S.ui.tab === 'faturamento' ? tabBilling(pi, c, em ? '' : ' disabled') : S.ui.tab === 'historico' ? tabHistory(pi) : S.ui.tab === 'midias' ? tabMidias(pi, em) : tabDetails(pi, c, em);
    const titulo = em ? `<input class="titulo-in" value="${esc(pi.titulo)}" placeholder="Título do PI" data-f="titulo" aria-label="Título do PI">` : (esc(pi.titulo) || 'Novo pedido');
    const acoes = em
      ? `<span class="sujo" ${ed.sujo ? '' : 'hidden'}><i></i>Alterações não salvas</span><button class="btn tres" data-act="piOpcoes" data-id="${pi.id}" aria-label="Mais opções">${S.svg('mais3')}</button><button class="btn" data-act="piCancelar">Cancelar</button><button class="btn" data-act="piVer">${S.svg('olho')}Visualizar</button><button class="btn pri" data-act="piSalvar">${S.svg('check')}Salvar</button>`
      : `<span class="muted small salvo">${salvoEm(pi)}</span><button class="btn tres" data-act="piOpcoes" data-id="${pi.id}" aria-label="Mais opções">${S.svg('mais3')}</button><button class="btn" data-act="piVer">${S.svg('olho')}Visualizar</button><button class="btn" data-act="piExport">${S.svg('baixar')}Exportar PI</button>${editavel(pi) ? `<button class="btn" data-act="piEditar">${S.svg('editar')}Editar</button>` : ''}${flow(pi)}`;
    return { title:`<span class="sub"><a data-go="/pis">PIs</a>${S.svg('seta', 14)}<b style="color:var(--ink);font-weight:500">${S.piNo(pi)}</b>${S.pill(pi.status)}<span>· ${esc(S.usuario(pi.consultor_id))}</span></span>${titulo}`,
      actions:acoes, body:abas + notas + body };
  };

  async function carregarHistorico(pi) {
    S.db.hist[pi.id] = [];
    try { S.db.hist[pi.id] = await S.q(S.sb.from('pi_historico').select('*').eq('pi_id', pi.id).order('em', { ascending:false })); if (cur() === pi && !ed.sujo) S.render(); } catch (e) { console.error(e); }
  }

  // ---------- aba Detalhes ----------
  const sel = (lista, id, vazio) => `<option value="">${vazio}</option>${lista.map(p => `<option value="${p.id}"${p.id === id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const duo = (path, rule, ro) => `<span class="duo"><input value="${nfmt(num(rule.value))}" data-f="${path}.value" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00"${ro}><select data-f="${path}.type"${ro}><option value="pct"${rule.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${rule.type === 'brl' ? ' selected' : ''}>R$</option></select></span>`;
  const regra = r => num(r.value) ? (r.type === 'pct' ? nfmt(num(r.value)).replace(/,00$/, '') + '%' : brl(num(r.value))) : (r.type === 'pct' ? '0%' : 'R$ 0,00');

  const summary = c => `<h2>Resumo financeiro</h2>
    <div><small>Total da mídia</small><b>${brl(c.media)}</b></div><div><small>Desconto geral</small><b>${brl(c.discount)}</b></div>
    <div class="hr"><small>Valor total</small><b>${brl(c.total)}</b></div><div class="g"><small>Comissão da agência</small><b>${brl(c.commission)}</b></div><div><small>Valor líquido</small><b>${brl(c.net)}</b></div>
    <div class="hr"><small>Bonificação</small><b>${brl(c.bonus)}</b></div><div class="g"><small>Honorários</small><b>${brl(c.fee)}</b></div><div><small>Inserções</small><b>${c.ins}</b></div>`;

  function tabDetails(pi, c, em) {
    const d = pi.dados, ro = em ? '' : ' disabled', v = S.veh(pi.veiculo_id), semAg = pi.agencia_id ? '' : ' disabled';
    const chip = (k, val) => `<span class="ic"><small>${k}</small>${val}</span>`;
    const info = `<section class="card pi-info">
      <div class="lin">${chip('Tipo de mídia', `<span class="val">Rádio${v.frequencia ? ' · ' + esc(v.frequencia) : ''}</span>`)}
        ${chip('Projeto', em ? `<input value="${esc(pi.projeto)}" placeholder="Ex.: Black Friday 2026" data-f="projeto">` : `<span class="val">${esc(pi.projeto) || '—'}</span>`)}
        ${chip('Cliente', em ? `<select data-f="cliente_id" data-rerender="1">${sel(S.pessoas('cliente'), pi.cliente_id, 'Escolha o cliente')}</select>` : `<span class="val">${esc(S.nome(pi.cliente_id)) || '—'}</span>`)}
        ${chip('Agência', em ? `<select data-f="agencia_id" data-rerender="1">${sel(S.pessoas('agencia'), pi.agencia_id, 'Venda direta')}</select>` : `<span class="val">${esc(S.nome(pi.agencia_id)) || 'Venda direta'}</span>`)}
        ${chip('Veículo', `<span class="val">${esc(v.nome)}</span>`)}</div>
      <div class="lin cond">${chip('Comissão', em ? duo('dados.commission', d.commission, semAg) : `<b>${pi.agencia_id ? regra(d.commission) : '—'}</b>`)}
        ${chip('Honorários', em ? duo('dados.fee', d.fee, semAg) : `<b>${pi.agencia_id ? regra(d.fee) : '—'}</b>`)}
        ${chip('Desconto geral', em ? duo('dados.discount', d.discount, '') : `<b>${regra(d.discount)}</b>`)}
        ${chip('Prazo', em ? `<input type="date" value="${pi.prazo || ''}" data-f="prazo">` : `<b>${dfmt(pi.prazo)}</b>`)}</div></section>`;
    const pecas = `<section class="pecas" aria-label="Peças">${d.pieces.map(p => `<span class="peca">${selo(pi, p.id)}${em ? `<input value="${esc(p.name)}" placeholder="Nome da peça" data-f="name" data-piece="${p.id}" data-rerender="1" aria-label="Nome da peça ${letter(pi, p.id)}"><button class="x" data-act="piRmPiece" data-id="${p.id}" aria-label="Remover peça">×</button>` : `<span>${esc(p.name) || 'Peça sem nome'}</span>`}</span>`).join('')}
      ${em ? '<button class="btn sm tracej" data-act="piAddPiece">+ Adicionar peça</button>' : d.pieces.length ? '' : '<span class="muted small">Nenhuma peça cadastrada.</span>'}</section>`;
    const avisoTab = em && (semCadastro('programa') || semCadastro('formato')) ? `<div class="note info">Para escolher programa e formato na grade, cadastre-os antes em <a data-go="/cadastros">Tabelas</a>.</div>` : '';
    const grades = d.grids.map((g, i) => (S.celular ? gradeCelular : gradeTela)(pi, g, i, em)).join('') + (em ? '<p><button class="btn pri" data-act="piAddGrid">+ Adicionar grade</button></p>' : '');
    const obs = `<section class="card"><div class="hd"><h2>Observações</h2><span>saem no PI exportado</span></div>${em ? `<textarea data-f="dados.billing.obsClient" placeholder="Ex.: veicular longe de concorrentes; material enviado pela agência até o dia 29">${esc(d.billing.obsClient)}</textarea>` : `<p class="obs">${esc(d.billing.obsClient) || '<span class="muted">Sem observações.</span>'}</p>`}</section>`;
    const totalCel = S.celular ? `<button class="pi-total" data-act="piVerResumo"><span><small>Valor total · ver resumo</small><b id="totalCel">${brl(c.total)}</b></span>${S.svg('baixo')}</button>` : '';
    return `${info}${pecas}${avisoTab}<div class="pi-corpo"><div class="pi-grades">${grades}${obs}</div><section class="card pi-sum" id="sum" aria-label="Resumo financeiro">${summary(c)}</section></div>${totalCel}
      ${S.datalist('dl-praca', [S.veh(pi.veiculo_id).cidade].filter(Boolean))}`;
  }

  const cabGrade = (g, i, em) => `<div class="g-hd"><h2>Grade ${String.fromCharCode(65 + i)}</h2>
    <label>Período de veiculação ${em ? `<select data-f="period" data-g="${g.id}" data-rerender="1" aria-label="Período de veiculação">${meses(g.period)}</select>` : `<b>${mesExt(g.period)}</b>`}</label>
    ${em ? `<button class="x" data-act="piRmGrid" data-id="${g.id}" aria-label="Remover grade" title="Remover grade">×</button>` : ''}</div>`;
  // Desconto da linha: em %, em R$ ou a linha inteira bonificada (sem cobrança)
  const descEdit = (it, a) => `<span class="duo"><input value="${it.bonus ? '' : nfmt(num(it.disc.value))}" data-f="disc.value" data-k="num" data-mask="dec" inputmode="decimal" placeholder="${it.bonus ? '—' : '0'}" ${a}${it.bonus ? ' disabled' : ''} aria-label="Desconto"><select data-f="disc.type" data-rerender="1" ${a} aria-label="Tipo de desconto"><option value="pct"${!it.bonus && it.disc.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${!it.bonus && it.disc.type === 'brl' ? ' selected' : ''}>R$</option><option value="bon"${it.bonus ? ' selected' : ''}>Bonif.</option></select></span>`;
  const descVer = it => it.bonus ? 'Bonificado' : regra(it.disc);
  // Listas de escolha vindas do cadastro (Tabelas). Um valor antigo que não está mais no cadastro continua aparecendo.
  const escolha = (tipo, atual, rotulo) => { const lista = S.db.produtos.filter(p => p.tipo === tipo && p.ativo).sort((a, b) => a.nome.localeCompare(b.nome)), at = String(atual || '').trim();
    const ops = lista.map(p => `<option value="${esc(p.nome.trim())}"${p.nome.trim() === at ? ' selected' : ''}${p.detalhe ? ` title="${esc(p.detalhe)}"` : ''}>${esc(p.nome.trim())}${p.detalhe && tipo === 'programa' ? ' · ' + esc(p.detalhe) : ''}</option>`).join('');
    const antigo = at && !lista.some(p => p.nome.trim() === at) ? `<option value="${esc(at)}" selected>${esc(at)}</option>` : '';
    return `<option value="">${rotulo}</option>${antigo}${ops}`; };
  const semCadastro = tipo => !S.db.produtos.some(p => p.tipo === tipo && p.ativo);
  // Meses para o período da grade: do ano passado até dois anos à frente
  const meses = atual => { const h = new Date(), out = []; for (let k = -12; k <= 24; k++) { const d = new Date(h.getFullYear(), h.getMonth() + k, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    if (atual && !out.includes(atual)) out.unshift(atual);
    return out.map(m => `<option value="${m}"${m === atual ? ' selected' : ''}>${mesExt(m)}</option>`).join(''); };
  const opcPecas = (pi, it) => `<option value="">—</option>${pi.dados.pieces.map(p => `<option value="${p.id}"${it.piece === p.id ? ' selected' : ''} title="${esc(p.name)}">${letter(pi, p.id)}</option>`).join('')}`;

  // Computador: programa e formato à esquerda, o mês inteiro no meio e quantidade, valor, desconto e total à direita
  function gradeTela(pi, g, i, em) {
    const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, k) => k + 1);
    const a = it => `data-g="${g.id}" data-i="${it.id}"`;
    let tIns = 0, tSub = 0; const porDia = {};
    const L = [], M = [], R = [];
    g.items.forEach(it => {
      const c = S.itemCalc(it); tIns += c.ins; tSub += c.sub; days.forEach(d => { if (it.days[d]) porDia[d] = (porDia[d] || 0) + num(it.days[d]); });
      L.push(`<div class="ln">${em ? `<button class="x rm" data-act="piRmItem" data-g="${g.id}" data-id="${it.id}" aria-label="Remover linha" title="Remover linha">×</button>
          <select data-f="f1" ${a(it)} aria-label="Programa">${escolha('programa', it.f1, 'Programa')}</select><select data-f="f2" ${a(it)} aria-label="Formato">${escolha('formato', it.f2, 'Formato')}</select>`
        : `<span></span><b class="tx">${esc(it.f1) || '—'}</b><span class="tx muted">${esc(it.f2)}</span>`}</div>`);
      M.push(`<div class="ln dias">${days.map(d => em
        ? `<input class="day${it.days[d] ? ' has' : ''}" inputmode="numeric" data-mask="int" value="${it.days[d] || ''}" data-day="${d}" ${a(it)} aria-label="Dia ${d}">`
        : `<span class="day${it.days[d] ? ' has' : ''}">${it.days[d] || ''}</span>`).join('')}</div>`);
      R.push(`<div class="ln vals"><span class="ins" id="ins-${it.id}">${c.ins}</span>
        ${em ? `<input class="n" value="${nfmt(num(it.unit))}" data-f="unit" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00" ${a(it)} aria-label="Valor unitário">${descEdit(it, a(it))}`
          : `<span class="n">${brl(num(it.unit))}</span><span class="n">${descVer(it)}</span>`}
        <b class="sub" id="sub-${it.id}">${brl(c.sub)}</b></div>`);
    });
    const cab = days.map(d => { const w = new Date(y, m - 1, d).getDay(); return `<span class="dh${w === 0 || w === 6 ? ' we' : ''}">${WD[w]}<b>${String(d).padStart(2, '0')}</b></span>`; }).join('');
    return `<section class="card grade">${cabGrade(g, i, em)}
      <div class="gr">
        <div class="gr-l"><div class="ln cb"><span></span><span>Programa</span><span>Formato</span></div>${L.join('')}<div class="ln ft">${em ? `<button class="btn sm" data-act="piAddItem" data-id="${g.id}">+ Adicionar item</button>` : ''}<b>Totais</b></div></div>
        <div class="gr-m"><div class="gr-mi"><div class="ln cb dias">${cab}</div>${M.join('')}<div class="ln ft dias tot">${days.map(d => `<span class="dt" id="dt-${g.id}-${d}">${porDia[d] || ''}</span>`).join('')}</div></div></div>
        <div class="gr-r"><div class="ln cb vals"><span>Qtd.</span><span class="n">Valor unit.</span><span class="n">Desconto</span><span class="sub">Total</span></div>${R.join('')}
          <div class="ln ft vals"><b class="ins" id="gins-${g.id}">${tIns}</b><span></span><span></span><b class="sub" id="gsub-${g.id}">${brl(tSub)}</b></div></div>
      </div></section>`;
  }

  // Celular: cada item vira um cartão; o item aberto mostra o mês em forma de calendário
  function gradeCelular(pi, g, i, em) {
    const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), vazio = new Date(y, m - 1, 1).getDay();
    const a = it => `data-g="${g.id}" data-i="${it.id}"`;
    const aberto = (S.ui.piItem || {})[g.id] || (g.items[0] || {}).id;
    let tIns = 0, tSub = 0;
    const itens = g.items.map(it => {
      const c = S.itemCalc(it); tIns += c.ins; tSub += c.sub;
      if (it.id !== aberto) return `<button class="it-res" data-act="piAbrirItem" data-g="${g.id}" data-id="${it.id}"><span class="tx"><b>${esc(it.f1) || 'Programa'}</b><small>${esc(it.f2) || 'formato'} · <span id="ins-${it.id}">${c.ins}</span> inserções</small></span><b id="sub-${it.id}">${brl(c.sub)}</b>${S.svg('seta')}</button>`;
      const cal = [...Array(vazio).fill('<span></span>'), ...Array.from({ length:nd }, (_, k) => { const d = k + 1, w = new Date(y, m - 1, d).getDay();
        return em ? `<label class="cd${w === 0 || w === 6 ? ' we' : ''}"><small>${d}</small><input class="day${it.days[d] ? ' has' : ''}" inputmode="numeric" data-mask="int" value="${it.days[d] || ''}" data-day="${d}" ${a(it)} aria-label="Dia ${d}"></label>`
          : `<span class="cd${w === 0 || w === 6 ? ' we' : ''}"><small>${d}</small><span class="day${it.days[d] ? ' has' : ''}">${it.days[d] || ''}</span></span>`; })];
      return `<article class="it-ab">
        <div class="it-cab">
          ${em ? `<span class="tx"><select data-f="f1" ${a(it)} aria-label="Programa">${escolha('programa', it.f1, 'Programa')}</select><select data-f="f2" ${a(it)} aria-label="Formato">${escolha('formato', it.f2, 'Formato')}</select></span>` : `<span class="tx"><b>${esc(it.f1) || '—'}</b><small>${esc(it.f2)}</small></span>`}
          <b id="sub-${it.id}">${brl(c.sub)}</b></div>
        <div class="cal">${WD.map((w, k) => `<small class="${k === 0 || k === 6 ? 'we' : ''}">${w}</small>`).join('')}${cal.join('')}</div>
        ${em ? '<small class="muted" style="text-align:center">Toque no dia e digite quantas inserções</small>' : ''}
        <div class="it-vals"><label class="f">Quantidade<span class="ro" id="ins-${it.id}">${c.ins}</span></label>
          <label class="f">Valor unit.${em ? `<input value="${nfmt(num(it.unit))}" data-f="unit" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00" ${a(it)}>` : `<span class="ro">${brl(num(it.unit))}</span>`}</label>
          <label class="f">Desconto${em ? descEdit(it, a(it)) : `<span class="ro">${descVer(it)}</span>`}</label></div>
        ${em ? `<div class="row mid"><span class="grow"></span><button class="btn sm danger" data-act="piRmItem" data-g="${g.id}" data-id="${it.id}">Remover linha</button></div>` : ''}</article>`;
    }).join('');
    return `<section class="card grade gc">${cabGrade(g, i, em)}<p class="muted small"><b id="gins-${g.id}">${tIns}</b> inserções · <b id="gsub-${g.id}">${brl(tSub)}</b></p>${itens}
      ${em ? `<button class="btn" data-act="piAddItem" data-id="${g.id}">+ Adicionar item</button>` : ''}</section>`;
  }

  function tabBilling(pi, c, ro) {
    const b = pi.dados.billing, tile = (t, v) => `<div class="tile"><small>${t}</small><b style="font-size:20px">${brl(v)}</b></div>`;
    const blocks = S.billingEntries(pi, c).map(e => `<div class="card"><h2>${esc(e.from)} paga ${e.what.toLowerCase()} para ${esc(e.to)}</h2><div class="scroll"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Lançamento</th><th class="r">Valor</th><th class="r">Forma</th></tr></thead><tbody>${S.parcels(pi, e.value).map(p => `<tr><td>${p.n}</td><td>${dfmt(p.due)}</td><td>${esc(e.what)}</td><td class="r">${brl(p.value)}</td><td class="r">${esc(b.method)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
    return `<div class="tiles">${tile('Valor total', c.total)}${tile('Comissão da agência', c.commission)}${tile('Valor líquido da rádio', c.net)}${tile('Bonificação', c.bonus)}</div>
      ${ro ? '<div class="note info">Clique em <b>Editar</b> para alterar as condições de faturamento.</div>' : ''}
      <div class="card"><div class="row">
      ${pi.agencia_id ? `<label class="f grow">Instrução de faturamento<select data-f="dados.billing.type" data-k="int" data-rerender="1"${ro}>${Object.entries(S.BILLING).map(([k, v]) => `<option value="${k}"${+k === +b.type ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : '<div class="grow muted small">Venda direta: o cliente paga o valor total para a rádio.</div>'}
      <label class="f">1º vencimento<input type="date" value="${b.firstDue || ''}" data-f="dados.billing.firstDue" data-rerender="1"${ro}></label>
      <label class="f">Parcelas<input type="number" min="1" max="24" style="width:84px" value="${b.installments}" data-f="dados.billing.installments" data-k="int" data-rerender="1"${ro}></label>
      <label class="f">Forma de pagamento<select data-f="dados.billing.method" data-rerender="1"${ro}>${S.opts(['Boleto', 'Pix', 'Transferência', 'Cartão'], b.method)}</select></label></div></div>
      ${blocks}
      <div class="card"><div class="hd"><h2>Observações internas da rádio</h2><span>não saem no PI exportado</span></div><textarea data-f="dados.billing.obsVehicle" placeholder="Anotações só para a equipe da rádio"${ro}>${esc(b.obsVehicle)}</textarea></div>`;
  }

  const tabHistory = pi => `<div class="card"><h2>Histórico do pedido</h2><ul class="hist">${(S.db.hist[pi.id] || []).map(h => `<li><span class="muted">${dfmt(S.dia(h.em))} ${S.hora(h.em)}</span>${S.pill(h.status)}<span>${esc(S.usuario(h.usuario_id))}${h.nota ? ' · ' + esc(h.nota) : ''}</span></li>`).join('') || '<li class="muted">Carregando…</li>'}</ul></div>`;

  // ---------- aba Mídias: arquivos do PI (áudios, textos, autorizações) ----------
  const BUCKET = 'midias';
  const pasta = pi => `${pi.veiculo_id}/${pi.id}`;
  async function carregarMidias(pi) {
    S.db.midias[pi.id] = [];
    try {
      const { data, error } = await S.sb.storage.from(BUCKET).list(pasta(pi), { sortBy:{ column:'created_at', order:'desc' } });
      if (error) throw error;
      S.db.midias[pi.id] = (data || []).filter(f => f.name && f.id);
      if (cur() === pi && !ed.sujo) S.render();
    } catch (e) { console.error(e); }
  }
  const tamanho = b => b > 1048576 ? (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const nomeArq = n => n.replace(/^\d+_/, '');
  function tabMidias(pi, em) {
    const lista = S.db.midias[pi.id] || [], pode = comercial(pi) || S.pode('opec');
    return `<section class="card"><div class="hd"><h2>Mídias do PI</h2><span>áudios dos spots, textos de testemunhal, autorizações</span></div>
      ${pode ? `<label class="drop"><input type="file" multiple data-act-file="piUpload" hidden><b>Clique para enviar arquivos</b><span>ou arraste aqui · até 50 MB por arquivo</span></label>` : ''}
      ${lista.length ? `<div class="list">${lista.map(f => `<div><span class="ic">${S.svg('doc')}</span><span class="tx"><b>${esc(nomeArq(f.name))}</b><small>${tamanho((f.metadata || {}).size || 0)} · ${dfmt(S.dia(f.created_at))}</small></span>
        <span class="row mid" style="gap:6px"><button class="btn sm" data-act="piBaixar" data-nome="${esc(f.name)}">${S.svg('baixar')}Baixar</button>${pode ? `<button class="x" data-act="piRmMidia" data-nome="${esc(f.name)}" aria-label="Excluir arquivo">×</button>` : ''}</span></div>`).join('')}</div>`
        : '<p class="muted" style="margin-top:14px">Nenhum arquivo enviado ainda.</p>'}</section>`;
  }
  async function enviarArquivos(pi, files) {
    if (!files || !files.length) return;
    S.toast(`Enviando ${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}…`);
    try {
      for (const f of files) {
        if (f.size > 50 * 1048576) { S.toast(`${f.name} passa de 50 MB e não foi enviado.`); continue; }
        const limpo = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
        const { error } = await S.sb.storage.from(BUCKET).upload(`${pasta(pi)}/${Date.now()}_${limpo}`, f, { upsert:false, contentType:f.type || undefined });
        if (error) throw error;
      }
      await carregarMidias(pi); S.toast('Arquivos enviados'); S.render();
    } catch (e) { console.error(e); S.toast(S.erro(e)); }
  }
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.actFile === 'piUpload') { const pi = cur(); if (pi) enviarArquivos(pi, [...e.target.files]); } });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.drop')) { e.preventDefault(); e.target.closest('.drop').classList.add('on'); } });
  document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) d.classList.remove('on'); });
  document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('.drop'); if (!d) return; e.preventDefault(); d.classList.remove('on'); const pi = cur(); if (pi) enviarArquivos(pi, [...e.dataTransfer.files]); });

  // ---------- ações ----------
  const mexer = fn => { const pi = cur(); if (!editando(pi)) return; fn(pi, pi.dados); marcarSujo(); S.render(); };
  const criar = (v, dados) => S.q(S.sb.rpc('criar_pi', { p_veiculo:S.ui.vehicleId, p_titulo:v.titulo, p_cliente:v.cliente_id || null, p_agencia:v.agencia_id || null, p_projeto:v.projeto || '', p_dados:dados }));

  Object.assign(S.actions, {
    piTab: d => { S.ui.tab = d.tab; S.render(); },
    piEditar: () => { const pi = cur(); if (!editavel(pi)) return; S.piEntrar(pi); if (!['detalhes', 'faturamento'].includes(S.ui.tab)) S.ui.tab = 'detalhes'; S.render(); },
    piSalvar: () => salvar(cur()),
    piCancelar: () => { const pi = cur();
      if (!ed.sujo) { sairEdicao(); return S.render(); }
      S.dialog(`<h2>Descartar alterações?</h2><p class="muted">O PI volta a ficar como estava quando foi salvo pela última vez.</p><div class="row"><span class="grow"></span><button class="btn" value="x">Continuar editando</button><button class="btn danger" value="ok">Descartar</button></div>`, () => { desfazer(pi); sairEdicao(); S.render(); }); },
    // Visualizar: o PI como vai sair no documento (o mesmo do PDF), para conferir antes de salvar ou exportar
    piVer: () => { const pi = cur();
      S.buildPrint(pi, { date:today(), to:'client', commission:true, billing:true, clientData:true, vehicleData:true, obs:true, signClient:true, signVehicle:true, signAgency:!!pi.agencia_id, conds:true });
      const doc = document.getElementById('print').innerHTML, probs = S.piProblems(pi);
      S.dialog(`<div class="row mid"><h2 class="grow">Visualizar ${S.piNo(pi)}</h2><button class="btn" value="x">Fechar</button><button class="btn pri" value="exp" type="submit">${S.svg('baixar')}Exportar PI</button></div>
        ${probs.length ? `<div class="note">Falta preencher: ${probs.map(esc).join('; ')}.</div>` : '<div class="note info">Tudo preenchido para enviar.</div>'}
        <div class="previa">${doc}</div>`);
      document.getElementById('dlg').classList.add('largo');
      const d = document.getElementById('dlg'); d.onclose = () => { d.classList.remove('largo'); if (d.returnValue === 'exp') S.actions.piExport(); }; },
    piAbrirItem: d => { S.ui.piItem = Object.assign({}, S.ui.piItem, { [d.g]:d.id }); S.render(); },
    piVerResumo: () => { const s = document.getElementById('sum'); if (s) s.scrollIntoView({ behavior:'smooth', block:'start' }); },
    piBaixar: async d => { const pi = cur(); try { const { data, error } = await S.sb.storage.from(BUCKET).createSignedUrl(`${pasta(pi)}/${d.nome}`, 120, { download:nomeArq(d.nome) }); if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener'); } catch (e) { S.toast(S.erro(e)); } },
    piRmMidia: async d => { const pi = cur(); if (!await S.confirmar(`Excluir o arquivo "${nomeArq(d.nome)}"?`, { ok:'Excluir arquivo', perigo:true })) return;
      S.run(async () => { const { error } = await S.sb.storage.from(BUCKET).remove([`${pasta(pi)}/${d.nome}`]); if (error) throw error; await carregarMidias(pi); }, 'Arquivo excluído'); },
    // Novo PI: o cliente pode ser escolhido da lista ou cadastrado ali mesmo, sem sair da tela
    piNew: () => {
      const clientes = S.pessoas('cliente'), NOVO = '__novo';
      const novoCli = `<div id="novoCli" class="caixa" style="grid-column:1/-1;display:none"><div class="g2">
        <label class="f" style="grid-column:1/-1">Nome do cliente<input name="novo_nome" placeholder="Ex.: Supermercado Três Irmãos" disabled></label>
        <label class="f">CNPJ / CPF<input name="novo_doc" data-mask="doc" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" disabled></label>
        <label class="f">Telefone<input name="novo_tel" data-mask="tel" inputmode="tel" autocomplete="off" placeholder="(65) 99999-9999" disabled></label></div>
        <p class="muted small" style="margin-top:10px">O cliente fica salvo nesta rádio. Os demais dados você completa depois em Clientes.</p></div>`;
      S.form(`Novo PI · ${esc(S.veh().nome)}`, [
        { k:'titulo', label:'Título', req:true, full:true },
        { k:'cliente_id', label:'Cliente', type:'select', req:true, options:[['', 'Escolha o cliente'], ...clientes.map(p => [p.id, p.nome]), [NOVO, '+ Cadastrar novo cliente']] },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Venda direta'], ...S.pessoas('agencia').map(p => [p.id, p.nome])] },
        { html:novoCli },
        { k:'projeto', label:'Projeto / campanha', full:true }], { cliente_id:clientes.length ? '' : NOVO },
        v => S.run(async () => {
          if (v.cliente_id === NOVO) { // cadastra o cliente antes de criar o PI (ou usa o que já tem o mesmo CNPJ/CPF)
            const doc = (v.novo_doc || '').trim(), igual = doc && S.pessoas('cliente').find(p => (p.documento || '').replace(/\D/g, '') === doc.replace(/\D/g, ''));
            const cli = igual || await S.salvar('pessoas', { veiculo_id:S.ui.vehicleId, tipo:'cliente', pessoa:doc.replace(/\D/g, '').length === 11 ? 'pf' : 'pj', nome:v.novo_nome.trim(), documento:doc, telefone:v.novo_tel || '', situacao:'ativo', consultor_id:S.pode('consultor') ? S.me.id : null });
            v.cliente_id = cli.id;
          }
          const ag = S.pessoa(v.agencia_id) || S.pessoa((S.pessoa(v.cliente_id) || {}).agencia_id);
          if (ag && !v.agencia_id) v.agencia_id = ag.id; // cliente atendido por agência já entra com ela
          const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:ag ? num(ag.comissao) : 0 }, grids:[{ id:uid(), period:today().slice(0, 7), praca:S.veh().cidade || '', items:[blankItem()] }] } }).dados;
          const pi = S.piNorm(await criar(v, dados)); S.db.pis.push(pi); S.ui.tab = 'detalhes'; S.piEntrar(pi); location.hash = '/pi/' + pi.id;
        }, 'PI criado'), 'Criar PI');
      // Mostra os campos do cliente novo só quando essa opção está escolhida
      const sel = document.querySelector('#dlg [name="cliente_id"]'), box = document.getElementById('novoCli');
      const alterna = () => { const on = sel.value === NOVO; box.style.display = on ? '' : 'none';
        box.querySelectorAll('input').forEach(i => { i.disabled = !on; }); box.querySelector('[name="novo_nome"]').required = on; if (on && document.activeElement === sel) box.querySelector('input').focus(); };
      sel.addEventListener('change', alterna); alterna();
    },
    // Menu "três pontinhos" do PI (na lista e dentro do PI): só mostra o que vale para o status e o perfil
    piOpcoes: (d, botao) => {
      const pi = S.db.pis.find(p => p.id === d.id), gestor = S.pode('diretor', 'gerente'), dentro = S.route().view === 'pi', id = { id:pi.id };
      const itens = [];
      if (!dentro) itens.push({ label:'Abrir', icon:'abrir', act:'piAbrir', data:id });
      if (editavel(pi) && !editando(pi)) itens.push({ label:'Editar', icon:'editar', act:'piEditarId', data:id });
      if (S.EDITABLE.includes(pi.status) && comercial(pi)) itens.push({ label:pi.status === 'devolvido' ? 'Reenviar para a OPEC' : 'Enviar para a OPEC', icon:'seta', act:'piEnviarId', data:id });
      itens.push({ label:'Enviar por WhatsApp', icon:'whats', act:'piWhats', data:id });
      if (comercial(pi)) itens.push({ label:'Duplicar', icon:'copia', act:'piDuplicar', data:id });
      const fim = [];
      if (gestor && !['cancelado', 'faturado', 'rascunho'].includes(pi.status)) fim.push({ label:'Cancelar PI', icon:'voltar', act:'piCancelarPI', data:id, perigo:true });
      if (pi.status === 'rascunho' && comercial(pi)) fim.push({ label:'Excluir', icon:'lixo', act:'piExcluir', data:id, perigo:true });
      S.menu(botao, fim.length ? [...itens, '-', ...fim] : itens);
    },
    piAbrir: d => S.go('/pi/' + d.id),
    piEditarId: d => { const pi = S.db.pis.find(p => p.id === d.id); S.piEntrar(pi); S.ui.tab = 'detalhes'; S.go('/pi/' + d.id); },
    piEnviarId: d => { const pi = S.db.pis.find(p => p.id === d.id); if (editando(pi) && ed.sujo) return S.toast('Salve o PI antes de enviar para a OPEC.'); const probs = S.piProblems(pi); if (probs.length) return S.toast('Antes de enviar: ' + probs[0]); S.setStatus(pi, 'opec'); },
    // WhatsApp: abre a conversa com o contato do cliente (ou escolhe o contato) com o resumo do PI
    piWhats: d => {
      const pi = S.db.pis.find(p => p.id === d.id), c = S.calc(pi), cli = S.pessoa(pi.cliente_id) || {}, v = S.veh(pi.veiculo_id);
      const meses = [...new Set(pi.dados.grids.map(g => g.period.split('-').reverse().join('/')))].join(', ');
      const texto = [`*${v.nome} · ${S.piNo(pi)}*`, pi.titulo, cli.nome ? `Cliente: ${cli.nome}` : '', meses ? `Período: ${meses}` : '', `Inserções: ${c.ins}`, `Valor total: ${brl(c.total)}`, pi.dados.billing.obsClient ? `Observações: ${pi.dados.billing.obsClient}` : '', '', `Consultor(a): ${S.usuario(pi.consultor_id)}`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
      let fone = String(cli.whatsapp || cli.telefone || '').replace(/\D/g, ''); if (fone && fone.length <= 11) fone = '55' + fone;
      window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      if (!fone) S.toast('Este cliente não tem WhatsApp cadastrado: escolha o contato no WhatsApp.');
    },
    piDuplicar: d => { const pi = S.db.pis.find(p => p.id === d.id);
      S.run(async () => { const novo = S.piNorm(await criar({ titulo:pi.titulo + ' (cópia)', cliente_id:pi.cliente_id, agencia_id:pi.agencia_id, projeto:pi.projeto }, JSON.parse(JSON.stringify(pi.dados)))); S.db.pis.push(novo); S.piEntrar(novo); S.ui.tab = 'detalhes'; location.hash = '/pi/' + novo.id; }, 'PI duplicado'); },
    piCancelarPI: async d => { const pi = S.db.pis.find(p => p.id === d.id); if (await S.confirmar(`Cancelar o ${S.piNo(pi)}? Ele sai da OPEC e do faturamento.`, { ok:'Cancelar o PI', voltar:'Manter', perigo:true })) S.setStatus(pi, 'cancelado'); },
    piExcluir: async d => { const pi = S.db.pis.find(p => p.id === d.id);
      if (!await S.confirmar(`Excluir o ${S.piNo(pi)} (${pi.titulo || 'sem título'})? Não dá para desfazer.`, { ok:'Excluir PI', perigo:true })) return;
      S.run(async () => { if (ed.id === pi.id) sairEdicao(); await S.excluir('pis', pi.id);
        try { const { data } = await S.sb.storage.from(BUCKET).list(pasta(pi)); if (data && data.length) await S.sb.storage.from(BUCKET).remove(data.map(f => `${pasta(pi)}/${f.name}`)); } catch (e) { console.error(e); } /* apaga também as mídias do PI */
        if (S.route().view === 'pi') location.hash = '/pis'; }, 'PI excluído'); },
    piSend: () => { const pi = cur(), probs = S.piProblems(pi); if (probs.length) return S.toast('Antes de enviar: ' + probs[0]); S.setStatus(pi, 'opec'); },
    piStatus: d => S.setStatus(d.id ? S.db.pis.find(p => p.id === d.id) : cur(), d.to),
    piReturn: d => { const pi = d.id ? S.db.pis.find(p => p.id === d.id) : cur();
      S.form(`Devolver ${S.piNo(pi)}`, [{ k:'nota', label:'O que precisa ser ajustado?', type:'textarea', req:true }], {}, v => S.setStatus(pi, 'devolvido', v.nota), 'Devolver ao consultor'); },
    piAddPiece: () => mexer((pi, d) => d.pieces.push({ id:uid(), name:'' })),
    piRmPiece: x => mexer((pi, d) => { d.pieces = d.pieces.filter(p => p.id !== x.id); }),
    piAddGrid: () => mexer((pi, d) => { const last = d.grids[d.grids.length - 1];
      let period = today().slice(0, 7); if (last) { const [y, m] = last.period.split('-').map(Number), n = new Date(y, m, 1); period = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
      d.grids.push({ id:uid(), period, praca:last ? last.praca || '' : (S.veh(pi.veiculo_id).cidade || ''), items:[blankItem()] }); }),
    piRmGrid: async x => { const pi = cur(), g = pi.dados.grids.find(g => g.id === x.id);
      if (g.items.some(it => S.itemCalc(it).ins) && !await S.confirmar('Remover esta grade com todas as inserções dela?', { ok:'Remover grade', perigo:true })) return;
      mexer((pi, d) => { d.grids = d.grids.filter(g => g.id !== x.id); }); },
    piAddItem: x => mexer((pi, d) => { const it = blankItem(), g = d.grids.find(g => g.id === x.id); it.piece = (d.pieces[0] || {}).id || ''; g.items.push(it); S.ui.piItem = Object.assign({}, S.ui.piItem, { [g.id]:it.id }); }),
    piRmItem: x => mexer((pi, d) => { const g = d.grids.find(g => g.id === x.g); g.items = g.items.filter(i => i.id !== x.id); }),
    piExport: () => { const c = (n, t) => `<label class="f chk"><input type="checkbox" name="${n}" checked>${t}</label>`;
      S.dialog(`<h2>Exportar pedido de inserção</h2>
        <div class="g2"><label class="f">Data do documento<input type="date" name="date" value="${today()}"></label><label class="f">Para<select name="to"><option value="client">Cliente</option><option value="agency">Agência</option></select></label>
          ${S.db.empresa ? (() => { const pi = cur(), m = pi.dados.marca || S.veh(pi.veiculo_id).pi_marca || 'radio';
            return `<label class="f" style="grid-column:1/-1">Marca do PI<select name="marca"><option value="radio"${m === 'radio' ? ' selected' : ''}>${esc(S.veh(pi.veiculo_id).nome)}</option><option value="comercial"${m === 'comercial' ? ' selected' : ''}>${esc(String(S.db.empresa.nome || 'Empresa comercial').split('·')[0].trim())} (empresa comercial)</option></select></label>`; })() : ''}</div>
        <div class="g2">${c('commission', 'Comissão e valor líquido')}${c('billing', 'Faturamento e parcelas')}${c('clientData', 'Dados do cliente')}${c('vehicleData', 'Dados da rádio')}${c('obs', 'Observações ao cliente')}${c('signClient', 'Assinatura do cliente')}${c('signVehicle', 'Assinatura da rádio')}${c('signAgency', 'Assinatura da agência')}${c('conds', 'Condições gerais')}</div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Exportar</button></div>`,
        v => { S.buildPrint(cur(), v); setTimeout(() => window.print(), 60); }); }
  });

  // ---------- alterações de campo (só valem no modo de edição; vão para a nuvem ao clicar em Salvar) ----------
  const setPath = (obj, path, val) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = val; };
  S.changes.push((el, d) => {
    if (S.route().view !== 'pi' || !(d.f || d.day)) return false;
    const pi = cur(); if (!pi || !editando(pi)) return false;
    const val = d.k === 'num' ? num(el.value) : d.k === 'int' ? parseInt(el.value) || 1 : d.k === 'int0' ? parseInt(el.value) || 0 : d.k === 'bool' ? el.checked : el.value;
    const grid = d.g && pi.dados.grids.find(g => g.id === d.g), item = grid && d.i && grid.items.find(i => i.id === d.i);
    if (d.day) { const n = Math.max(0, parseInt(el.value) || 0); if (n) item.days[d.day] = n; else delete item.days[d.day]; el.value = n || ''; el.classList.toggle('has', n > 0);
      const t = document.getElementById(`dt-${grid.id}-${d.day}`); if (t) t.textContent = grid.items.reduce((s, it) => s + num(it.days[d.day] || 0), 0) || ''; }
    else if (d.piece) pi.dados.pieces.find(p => p.id === d.piece).name = val;
    else if (item && d.f === 'disc.type') { item.bonus = val === 'bon'; if (val !== 'bon') item.disc.type = val; }
    else setPath(item || grid || pi, d.f, d.f.endsWith('_id') ? val || null : val);
    if (d.k === 'num') el.value = nfmt(val);
    // A agência escolhida traz a sua comissão padrão
    if (d.f === 'agencia_id') pi.dados.commission = { type:'pct', value:val ? num((S.pessoa(val) || {}).comissao) : 0 };
    // Programa + formato puxam o preço vigente da tabela
    if (item && (d.f === 'f1' || d.f === 'f2')) { const p = S.preco(item.f1, item.f2); if (p) { item.unit = num(p.preco); document.querySelectorAll(`input[data-f="unit"][data-i="${item.id}"]`).forEach(u => { u.value = nfmt(item.unit); }); } }
    marcarSujo();
    if (d.rerender) { S.render(); return true; }
    // Atualiza só os números calculados, para não perder o foco durante a digitação
    pi.dados.grids.forEach(g => { let ti = 0, ts = 0;
      g.items.forEach(it => { const c = S.itemCalc(it); ti += c.ins; ts += c.sub; const a = document.getElementById('ins-' + it.id), b = document.getElementById('sub-' + it.id); if (a) a.textContent = c.ins; if (b) b.textContent = brl(c.sub); });
      const a = document.getElementById('gins-' + g.id), b = document.getElementById('gsub-' + g.id); if (a) a.textContent = ti; if (b) b.textContent = brl(ts); });
    const c = S.calc(pi), s = document.getElementById('sum'); if (s) s.innerHTML = summary(c);
    const t = document.getElementById('totalCel'); if (t) t.textContent = brl(c.total);
    return true;
  });

  // ---------- documento para impressão / PDF ----------
  // Uma folha Ofício (Legal) ou A4 deitada, no modelo de contrato de publicidade: rádio, cliente e número no topo,
  // a grade com os dias, pagamento, observações e totais, assinaturas e as condições gerais da rádio no rodapé.
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesCurto = p => { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)}/${y}`; };
  const dataExt = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} de ${MESES[m - 1]} de ${y}`; };
  // Condições gerais: uma cláusula por linha; o número (1., 1.1.) e o título da cláusula saem em negrito
  const condicoesHtml = (texto, v) => S.piCondicoes(texto, v).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(\d+(?:\.\d+)*\.?-?)\s+(.*)$/.exec(l); if (!m) return esc(l);
    const sub = m[1].replace(/\.$/, '').includes('.'), t = !sub && /^(D[aoe]s?\s[^.]{2,40}\.)\s*(.*)$/.exec(m[2]);
    return `<b>${esc(m[1])}</b> ${t ? `<b>${esc(t[1])}</b> ${esc(t[2])}` : esc(m[2])}`; }).join('<br>');
  // Tamanho da folha vai numa regra @page própria, trocada a cada impressão
  const papel = tam => { let st = document.getElementById('pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
    st.textContent = `@media print { @page { size:${tam === 'a4' ? 'A4' : 'legal'} landscape; margin:8mm; } }`; };

  S.buildPrint = (pi, o) => {
    const c = S.calc(pi), v = S.veh(pi.veiculo_id), cli = S.pessoa(pi.cliente_id) || {}, ag = S.pessoa(pi.agencia_id), b = pi.dados.billing, cor = v.cor || S.COR_PADRAO;
    papel(v.pi_papel);
    let tabela = 0;
    const grids = pi.dados.grids.map(g => {
      const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, i) => i + 1);
      const fim = d => [0, 6].includes(new Date(y, m - 1, d).getDay());
      let sub = 0, ins = 0;
      const rows = g.items.map(it => { const k = S.itemCalc(it); sub += k.sub; ins += k.ins; if (!it.bonus) tabela += k.gross; const dv = num(it.disc.value);
        return `<tr><td class="pg">${esc(it.f1)}${it.faixa ? `<small class="pd-fx">${esc(it.faixa)}</small>` : ''}</td><td>${esc(it.f2)}</td><td class="c"><b>${letter(pi, it.piece)}</b></td>${days.map(d => `<td class="c${fim(d) ? ' fim' : ''}">${it.days[d] || ''}</td>`).join('')}<td class="c"><b>${k.ins}</b></td><td class="r">${nfmt(num(it.unit)) || '0,00'}</td><td class="c">${it.bonus ? 'Bonif.' : dv ? (it.disc.type === 'pct' ? dv + '%' : nfmt(dv)) : '—'}</td><td class="r"><b>${it.bonus ? 'Bonificado' : nfmt(k.sub) || '0,00'}</b></td></tr>`; }).join('');
      const varias = pi.dados.grids.length > 1;
      return `${varias ? `<div class="pd-per"><b>${mesCurto(g.period)}</b>${g.praca ? ` · ${esc(g.praca)}` : ''}</div>` : ''}<table class="pd-grade"><colgroup><col class="k-pg"><col class="k-fm"><col class="k-pc">${days.map(() => '<col>').join('')}<col class="k-qt"><col class="k-un"><col class="k-ds"><col class="k-tt"></colgroup>
        <thead><tr><th rowspan="2" class="l">Programa / faixa</th><th rowspan="2" class="l">Formato</th><th rowspan="2">Peça</th>${days.map(d => `<th class="${fim(d) ? 'fim' : ''}">${WD[new Date(y, m - 1, d).getDay()]}</th>`).join('')}<th rowspan="2">Qtd</th><th rowspan="2" class="r">Valor unit.</th><th rowspan="2">Desc.</th><th rowspan="2" class="r">Total</th></tr>
        <tr>${days.map(d => `<th class="${fim(d) ? 'fim' : ''}">${String(d).padStart(2, '0')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>
        ${varias ? `<tfoot><tr><td colspan="${3 + nd}" class="r">Subtotal ${mesCurto(g.period)}</td><td class="c"><b>${ins}</b></td><td colspan="3" class="r"><b>${brl(sub)}</b></td></tr></tfoot>` : ''}</table>`;
    }).join('');
    const periodos = [...new Set(pi.dados.grids.map(g => g.period))].sort(), periodo = !periodos.length ? '—' : periodos.length === 1 ? mesCurto(periodos[0]) : `${mesCurto(periodos[0])} a ${mesCurto(periodos[periodos.length - 1])}`;
    const descLinhas = tabela - c.media;
    // Quem paga a rádio recebe a fatura: o e-mail de faturamento é o dele
    const entradas = S.billingEntries(pi, c), pagador = (entradas.find(e => e.para === 'V') || {}).de, emailFat = pagador === 'A' && ag ? ag.email : cli.email;
    // A agência aparece uma única vez no PI (no quadro do cliente). No pagamento entram só as parcelas que a rádio
    // recebe, sem repetir quem paga; o que a rádio paga à agência vira uma linha só, quando houver.
    const nParc = Math.max(1, parseInt(b.installments) || 1);
    const recebe = entradas.filter(e => e.para === 'V'), paga = entradas.filter(e => e.de === 'V' && (o.commission || e.what !== 'Comissão'));
    const linhasParc = recebe.flatMap(e => S.parcels(pi, e.value).map(p => `<tr><td>${p.n}/${nParc}${recebe.length > 1 ? ` · ${esc(e.what)}` : ''}</td><td>${p.due ? dfmt(p.due) : 'a combinar'}</td><td>${esc(b.method)}</td><td class="r">${brl(p.value)}</td></tr>`)).join('');
    const regra = !ag ? 'Faturamento direto ao cliente' : (S.BILLING[b.type] || S.BILLING[10]).replace(/ contra o Cliente$/, ' contra o anunciante').replace(/ contra a Agência$/, ' contra a agência');
    const pagamento = `<div class="pd-box"><b class="pd-tit">Condições e forma de pagamento</b>
      ${o.billing ? `<div class="mut">${esc(regra)}${nParc > 1 ? ` · ${nParc} parcelas` : ''}</div><table class="pd-parc"><tr class="mut"><td>Parcela</td><td>Vencimento</td><td>Forma</td><td class="r">Valor</td></tr>${linhasParc}</table>
        ${paga.map(e => `<div class="mut">${esc(e.what)} paga pela rádio à agência: <b class="tx">${brl(e.value)}</b></div>`).join('')}` : ''}
      ${v.pi_pagamento || emailFat ? `<div class="mut">${esc(v.pi_pagamento)}${v.pi_pagamento && emailFat ? '. ' : ''}${emailFat ? `E-mail de faturamento: <b class="tx">${esc(emailFat)}</b>` : ''}</div>` : ''}</div>`;
    const linhaT = (rot, val, cls = '') => `<span class="${cls}">${rot}</span><span class="r ${cls}">${val}</span>`;
    const totais = `<div class="pd-box pd-tot">${linhaT('Valor de tabela', brl(tabela))}${descLinhas > 0.004 ? linhaT('Descontos nas linhas', '− ' + brl(descLinhas)) : ''}${c.discount ? linhaT('Desconto geral', '− ' + brl(c.discount)) : ''}
      ${linhaT('Valor do PI', brl(c.total), 'forte')}${c.bonus ? linhaT('Bonificação (sem custo)', brl(c.bonus), 'mut') : ''}
      ${o.commission && ag ? linhaT(`Comissão da agência${d_pct(pi)}`, '− ' + brl(c.commission), 'mut') + linhaT('Total líquido', brl(c.net), 'final') : ''}
      ${o.commission && c.fee ? linhaT('Honorários da agência', brl(c.fee), 'mut') : ''}</div>`;
    const celCli = (rot, val, span) => `<th>${rot}</th><td${span ? ' colspan="3"' : ''}>${val || ''}</td>`;
    const cliente = o.clientData ? `<table class="pd-cli">
        <tr>${celCli('Razão social', esc(cli.razao_social || cli.nome), true)}</tr>
        <tr>${celCli('Anunciante', esc(cli.nome))}${celCli('Agência', ag ? esc(ag.nome) + (o.commission && d_pct(pi, true) ? ` · comissão ${d_pct(pi, true)}` : '') : 'Venda direta')}</tr>
        <tr>${celCli(cli.pessoa === 'pf' ? 'CPF' : 'CNPJ', esc(cli.documento))}${celCli('IE', esc(cli.inscricao_estadual))}</tr>
        <tr>${celCli('Endereço', esc(cli.endereco))}${celCli('Cidade', esc([cli.cidade, cli.cep && 'CEP ' + cli.cep].filter(Boolean).join(' · ')))}</tr>
        <tr>${celCli('Contato', esc([cli.contato_assina || cli.contato_decide, cli.telefone || cli.whatsapp].filter(Boolean).join(' · ')))}${celCli('Consultor', esc(S.usuario(pi.consultor_id)))}</tr></table>`
      : `<table class="pd-cli"><tr>${celCli('Anunciante', esc(cli.nome))}${celCli('Agência', ag ? esc(ag.nome) : 'Venda direta')}</tr><tr>${celCli('Consultor', esc(S.usuario(pi.consultor_id)), true)}</tr></table>`;
    // Marca do PI: a da rádio ou a da empresa comercial do grupo (Head 14). Quem fatura continua sendo a rádio.
    const marca = o.marca || pi.dados.marca || v.pi_marca || 'radio', e = S.db.empresa;
    const empresa = marca === 'comercial' && e ? `<div class="pd-radio pd-emp"><img src="${esc(e.logo || 'img/head14.png')}" alt=""><div><b class="pd-nome">${esc(e.nome)}</b>
      ${o.vehicleData ? [e.razao_social, e.cnpj && 'CNPJ ' + e.cnpj, [e.endereco, e.cidade].filter(Boolean).join(' · '), e.telefone && 'Fone ' + e.telefone, e.email].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('') : ''}
      <div>Veiculação e faturamento: ${esc(v.nome)}</div></div></div>` : '';
    const radio = empresa || `<div class="pd-radio">${v.logo ? `<img src="${v.logo}" alt="">` : `<span class="pd-selo" style="background:${cor}">${esc(v.sigla)}</span>`}<div><b class="pd-nome">${esc(v.nome)}</b>
      ${o.vehicleData ? [v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, [v.endereco, v.cidade].filter(Boolean).join(' · '), [v.cep && 'CEP ' + v.cep, v.telefone && 'Fone ' + v.telefone].filter(Boolean).join(' · '), v.email].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('') : ''}</div></div>`;
    const corNo = empresa ? e.cor || '#2b5fb5' : cor;
    const numero = `<div class="pd-num" style="border-color:${corNo}"><div class="pd-no" style="color:${corNo}">${S.piNo(pi)}</div><div class="pd-kv">
      <span>Veículo</span><b>${esc(v.nome)}${v.frequencia ? ' ' + esc(v.frequencia) : ''}</b><span>Período</span><b>${periodo}</b><span>Campanha</span><b>${esc(pi.titulo)}</b>${pi.projeto ? `<span>Projeto</span><b>${esc(pi.projeto)}</b>` : ''}${pi.dados.proposta ? `<span>Proposta</span><b>${esc(pi.dados.proposta.numero)}</b>` : ''}<span>Emitido em</span><b>${dfmt(o.date)}</b></div></div>`;
    const aprov = (S.db.hist[pi.id] || []).find(h => h.status === 'aprovado');
    const signs = [o.signClient && ['Anunciante / Contratante', cli.contato_assina || cli.nome], o.signAgency && ag && ['Agência', ''], o.signVehicle && ['Veículo / Contratada', v.nome]].filter(Boolean);
    const cidade = (v.pi_cidade || v.cidade || '').split('/')[0].trim();
    document.getElementById('print').innerHTML = `<div class="pidoc">
      <div class="pd-topo">${radio}<div class="pd-meio"><div class="pd-titulo">PEDIDO DE INSERÇÃO</div>${cliente}</div>${numero}</div>
      <div class="pd-autoriza">AUTORIZAMOS EXECUTAR ESTE PLANO DE MÍDIA DE ACORDO COM AS CONDIÇÕES ABAIXO DISCRIMINADAS</div>
      ${grids}
      <div class="pd-pecas"><span><b>Peças:</b> ${pi.dados.pieces.map((p, i) => `${String.fromCharCode(65 + i)} · ${esc(p.name)}`).join(' &nbsp; ') || '—'}</span><span>Total de inserções: <b>${c.ins}</b></span></div>
      <div class="pd-baixo">${pagamento}<div class="pd-box"><b class="pd-tit">Observações</b><div>${o.obs && b.obsClient ? esc(b.obsClient).replace(/\n/g, '<br>') : ''}</div></div>${totais}</div>
      <div class="pd-fecho"><div><div>E, por estarem de acordo com as especificações e condições deste pedido${o.conds ? ' e das condições gerais abaixo' : ''}, as partes assinam o presente para todos os efeitos legais.</div>
        <div>${esc(cidade ? cidade + ', ' : '')}${dataExt(o.date)}.</div>
        ${signs.length ? `<div class="pd-ass" style="--n:${signs.length}">${signs.map(([r, n]) => `<div><b>${r}</b>${n ? `<br><span>${esc(n)}</span>` : ''}</div>`).join('')}</div>` : ''}</div>
        <div class="pd-box pd-aprov"><b>Aprovação OPEC</b>${aprov ? `<span class="ok">Aprovado em ${dfmt(S.dia(aprov.em))}</span><span>por ${esc(S.usuario(aprov.usuario_id))}</span>` : '<span class="mut">Aguardando</span>'}</div></div>
      ${o.conds ? `<div class="pd-conds"><b>CONDIÇÕES GERAIS</b> — ${condicoesHtml(v.pi_condicoes, v)}</div>` : ''}
      <div class="pd-rodape"><span>Gerado pelo SONVI · ${S.piNo(pi)}</span></div></div>`;
  };
  // Percentual da comissão, quando ela é em %
  const d_pct = (pi, so) => { const r = pi.dados.commission; if (r.type !== 'pct' || !num(r.value)) return ''; const t = nfmt(num(r.value)).replace(/,00$/, '') + '%'; return so ? t : ' ' + t; };
})();

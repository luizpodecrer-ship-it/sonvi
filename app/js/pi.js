// SONVI · módulo de Pedidos de Inserção (PI): lista, edição, faturamento e documento para impressão.
(() => {
  const { esc, brl, num, nfmt, dfmt, uid, today } = S;
  const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cur = () => S.db.pis.find(p => p.id === S.route().id);
  const letter = (pi, id) => { const i = pi.dados.pieces.findIndex(p => p.id === id); return i < 0 ? '' : String.fromCharCode(65 + i); };
  const blankItem = () => ({ id:uid(), piece:'', f1:'', f2:'', days:{}, unit:0, disc:{ type:'pct', value:0 }, bonus:false });
  const comercial = pi => S.pode('diretor', 'gerente') || (S.pode('consultor') && pi.consultor_id === S.me.id);
  const editavel = pi => S.EDITABLE.includes(pi.status) && comercial(pi);
  const produtos = tipo => S.db.produtos.filter(p => p.tipo === tipo && p.ativo).map(p => p.nome).sort();

  // ---------- gravação na nuvem ----------
  // Cada alteração é gravada sozinha, pouco depois de o usuário parar de digitar.
  const timers = {};
  const marca = t => { const el = document.getElementById('saveState'); if (el) el.textContent = t; };
  const gravar = async pi => {
    delete timers[pi.id];
    const c = S.calc(pi), r2 = v => Math.round(v * 100) / 100;
    const patch = S.EDITABLE.includes(pi.status)
      ? { titulo:pi.titulo, cliente_id:pi.cliente_id || null, agencia_id:pi.agencia_id || null, projeto:pi.projeto, prazo:pi.prazo || null, dados:pi.dados, resultado:pi.resultado, insercoes:c.ins, valor_total:r2(c.total), comissao:r2(c.commission), valor_liquido:r2(c.net) }
      : { resultado:pi.resultado };
    if (patch.dados) Object.assign(pi, patch); // os totais em memória acompanham o que foi para a nuvem
    try { await S.q(S.sb.from('pis').update(patch).eq('id', pi.id)); marca('Salvo na nuvem'); }
    catch (e) { console.error(e); marca('Não foi possível salvar'); S.toast(S.erro(e)); }
  };
  S.piSalvar = pi => { clearTimeout(timers[pi.id]); marca('Salvando…'); timers[pi.id] = setTimeout(() => gravar(pi), 700); };
  const descarregar = async pi => { if (timers[pi.id]) { clearTimeout(timers[pi.id]); await gravar(pi); } };

  S.setStatus = (pi, status, nota) => S.run(async () => {
    await descarregar(pi);
    const r = await S.q(S.sb.rpc('mudar_status_pi', { p_pi:pi.id, p_status:status, p_nota:nota || '' }));
    Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id];
  }, `${S.piNo(pi)} · ${S.STATUS[status].label}`);

  // ---------- lista ----------
  S.views.pis = () => {
    const q = S.ui.q.toLowerCase();
    const pis = S.db.pis.filter(p => !q || [p.titulo, S.nome(p.cliente_id), S.nome(p.agencia_id), S.usuario(p.consultor_id), p.projeto, S.piNo(p)].join(' ').toLowerCase().includes(q));
    const groups = Object.keys(S.STATUS).map(s => {
      const rows = pis.filter(p => p.status === s).sort((a, b) => b.numero - a.numero); if (!rows.length) return '';
      const t = { commission:0, net:0, total:0 };
      const body = rows.map(p => { const c = S.calc(p); t.commission += c.commission; t.net += c.net; t.total += c.total;
        return `<tr class="click" data-go="/pi/${p.id}"><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><b>${esc(p.titulo) || 'Sem título'}</b><div class="muted small">${esc(p.projeto)}</div></td><td>${esc(S.nome(p.cliente_id))}</td><td>${esc(S.nome(p.agencia_id)) || '<span class="muted">Direto</span>'}</td><td>${esc(S.usuario(p.consultor_id))}</td><td>${dfmt(p.prazo)}</td><td class="r">${c.ins}</td><td class="r">${brl(c.commission)}</td><td class="r">${brl(c.net)}</td><td class="r"><b>${brl(c.total)}</b></td></tr>`; }).join('');
      return `<div class="card"><h3>${S.pill(s)} <span class="muted small">${rows.length} ${rows.length > 1 ? 'pedidos' : 'pedido'}</span></h3><div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Agência</th><th>Consultor</th><th>Prazo</th><th class="r">Inserções</th><th class="r">Comissão</th><th class="r">Líquido</th><th class="r">Total</th></tr></thead><tbody>${body}<tr class="tot"><td colspan="7">Total</td><td class="r">${brl(t.commission)}</td><td class="r">${brl(t.net)}</td><td class="r">${brl(t.total)}</td></tr></tbody></table></div></div>`;
    }).join('');
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Pedidos de Inserção`, actions:S.pode('diretor', 'gerente', 'consultor') ? '<button class="btn pri" data-act="piNew">Novo PI</button>' : '',
      body:`<div style="margin-bottom:16px"><input type="search" style="width:100%;padding:10px 14px" placeholder="Buscar por número, título, cliente, agência ou consultor" value="${esc(S.ui.q)}" data-ui="q"></div>${groups || `<div class="card empty"><b>Nenhum pedido${q ? ' encontrado' : ''}</b>${q ? 'Tente outra busca.' : 'Os pedidos desta rádio aparecem aqui.'}</div>`}` };
  };

  // ---------- edição ----------
  const duo = (path, rule, ro) => `<span class="duo"><input value="${nfmt(num(rule.value))}" data-f="${path}.value" data-k="num"${ro}><select data-f="${path}.type"${ro}><option value="pct"${rule.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${rule.type === 'brl' ? ' selected' : ''}>R$</option></select></span>`;
  const flow = pi => {
    const b = (act, label, extra = '', pri = true) => `<button class="btn${pri ? ' pri' : ''}" data-act="${act}"${extra}>${label}</button>`;
    if (S.EDITABLE.includes(pi.status)) return comercial(pi) ? b('piSend', pi.status === 'devolvido' ? 'Reenviar para a OPEC' : 'Enviar para a OPEC') : '';
    if (pi.status === 'opec') return S.pode('diretor', 'opec') ? b('piReturn', 'Devolver', '', false) + b('piStatus', 'Aprovar', ' data-to="aprovado"') : '';
    const faturar = S.pode('diretor', 'financeiro') ? b('finFaturar', 'Faturar', ` data-id="${pi.id}"`, pi.status === 'programado') : '';
    if (pi.status === 'aprovado') return faturar + (S.pode('diretor', 'opec') ? b('piStatus', 'Marcar como programado', ' data-to="programado"') : '');
    if (pi.status === 'programado') return faturar;
    if (pi.status === 'cancelado') return S.pode('diretor', 'gerente') ? b('piStatus', 'Reabrir como rascunho', ' data-to="rascunho"', false) : '';
    return '';
  };

  S.views.pi = () => {
    const pi = cur(); if (!pi) return { title:'Pedido não encontrado', actions:'', body:'<div class="card empty"><b>Este pedido não existe ou não é desta rádio</b><a data-go="/pis">Voltar para a lista</a></div>' };
    const ro = editavel(pi) ? '' : ' disabled', c = S.calc(pi), h = S.db.hist[pi.id];
    const devol = pi.status === 'devolvido' && h ? h.find(x => x.status === 'devolvido') : null;
    if (!h) carregarHistorico(pi);
    const head = `${devol && devol.nota ? `<div class="note"><b>Devolvido pela OPEC:</b> ${esc(devol.nota)}</div>` : ''}
      ${ro && S.EDITABLE.includes(pi.status) ? '<div class="note info">Este pedido é de outro consultor ou o seu perfil só pode consultar.</div>' : ''}
      ${ro && !S.EDITABLE.includes(pi.status) && pi.status !== 'cancelado' ? '<div class="note info">Este pedido já saiu do rascunho e está somente leitura.</div>' : ''}
      <div class="seg">${[['detalhes', 'Detalhes'], ['faturamento', 'Faturamento'], ['historico', 'Histórico']].map(([t, n]) => `<button class="${S.ui.tab === t ? 'on' : ''}" data-act="piTab" data-tab="${t}">${n}</button>`).join('')}</div>`;
    const body = S.ui.tab === 'faturamento' ? tabBilling(pi, c, ro) : S.ui.tab === 'historico' ? tabHistory(pi) : tabDetails(pi, c, ro);
    return { title:`<span class="sub"><a data-go="/pis">Pedidos</a> · ${S.piNo(pi)} &nbsp;${S.pill(pi.status)} &nbsp;<span id="saveState"></span></span>${esc(pi.titulo) || 'Novo pedido'}`,
      actions:`${comercial(pi) ? '<button class="btn" data-act="piMore">Mais</button>' : ''}<button class="btn" data-act="piExport">Exportar PDF</button>${flow(pi)}`, body:head + body };
  };

  async function carregarHistorico(pi) {
    S.db.hist[pi.id] = [];
    try { S.db.hist[pi.id] = await S.q(S.sb.from('pi_historico').select('*').eq('pi_id', pi.id).order('em', { ascending:false })); if (cur() === pi) S.render(); } catch (e) { console.error(e); }
  }

  const summary = c => `<h3>Resumo financeiro</h3>
    <div><small>Total da mídia</small><b>${brl(c.media)}</b></div><div><small>Desconto geral</small><b>${brl(c.discount)}</b></div><hr>
    <div><small>Valor total</small><b>${brl(c.total)}</b></div><div class="g"><small>Comissão da agência</small><b>${brl(c.commission)}</b></div>
    <div><small>Valor líquido da rádio</small><b>${brl(c.net)}</b></div><hr>
    <div><small>Bonificação</small><b>${c.bonus ? brl(c.bonus) : '—'}</b></div><div><small>Honorários</small><b>${c.fee ? brl(c.fee) : '—'}</b></div><div><small>Inserções</small><b>${c.ins}</b></div>`;

  const sel = (lista, id, vazio) => `<option value="">${vazio}</option>${lista.map(p => `<option value="${p.id}"${p.id === id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}`;

  function tabDetails(pi, c, ro) {
    const d = pi.dados, ag = pi.agencia_id ? '' : ' disabled', roRes = comercial(pi) ? '' : ' disabled';
    const info = `<div class="card"><label class="f" style="margin-bottom:14px">Título<input value="${esc(pi.titulo)}" data-f="titulo" data-rerender="1"${ro}></label><div class="row">
      <label class="f grow">Cliente<select data-f="cliente_id" data-rerender="1"${ro}>${sel(S.pessoas('cliente'), pi.cliente_id, 'Escolha o cliente')}</select></label>
      <label class="f grow">Agência<select data-f="agencia_id" data-rerender="1"${ro}>${sel(S.pessoas('agencia'), pi.agencia_id, 'Venda direta')}</select></label>
      <label class="f grow">Projeto / campanha<input value="${esc(pi.projeto)}" data-f="projeto"${ro}></label>
      <label class="f">Consultor<input value="${esc(S.usuario(pi.consultor_id))}" disabled></label></div>
      <div class="row" style="margin-top:14px">
      <label class="f">Comissão ${duo('dados.commission', d.commission, ro || ag)}</label><label class="f">Honorários ${duo('dados.fee', d.fee, ro || ag)}</label>
      <label class="f">Desconto geral ${duo('dados.discount', d.discount, ro)}</label><label class="f">Prazo<input type="date" value="${pi.prazo || ''}" data-f="prazo"${ro}></label></div></div>`;
    const pieces = `<div class="card"><h3>Peças</h3><div class="pieces">${d.pieces.map((p, i) => `<span class="piece"><b>${String.fromCharCode(65 + i)}</b><input value="${esc(p.name)}" placeholder="Nome da peça" data-f="name" data-piece="${p.id}" data-rerender="1"${ro}>${ro ? '' : `<button class="x" data-act="piRmPiece" data-id="${p.id}" title="Remover peça">×</button>`}</span>`).join('')}${ro ? '' : '<button class="btn sm" data-act="piAddPiece">Adicionar peça</button>'}${!d.pieces.length && ro ? '<span class="muted">Nenhuma peça.</span>' : ''}</div></div>`;
    const grids = d.grids.map(g => gridCard(pi, g, ro)).join('') + (ro ? '' : '<p style="margin-bottom:16px"><button class="btn" data-act="piAddGrid">Adicionar grade</button></p>');
    const results = `<div class="card"><h3>Resultados</h3><div class="row">
      <label class="f">Leads<input style="width:100px" value="${pi.resultado.leads || ''}" data-f="resultado.leads" data-k="int0"${roRes}></label>
      <label class="f">Valor (R$)<input style="width:130px" value="${nfmt(pi.resultado.value)}" data-f="resultado.value" data-k="num"${roRes}></label>
      <label class="f grow">Descrição<input value="${esc(pi.resultado.desc)}" data-f="resultado.desc"${roRes}></label></div></div>
      <div class="card"><h3>Briefing</h3><textarea data-f="dados.briefing"${ro}>${esc(d.briefing)}</textarea></div>`;
    return `<div class="layout"><div>${info}${pieces}${grids}${results}</div><div class="card sum" id="sum">${summary(c)}</div></div>`;
  }

  function gridCard(pi, g, ro) {
    const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, i) => i + 1);
    const a = it => `data-g="${g.id}" data-i="${it.id}"${ro}`;
    let tIns = 0, tSub = 0;
    const rows = g.items.map(it => { const c = S.itemCalc(it); tIns += c.ins; tSub += c.sub;
      return `<tr><td><select data-f="piece" ${a(it)}><option value=""></option>${pi.dados.pieces.map((p, i) => `<option value="${p.id}"${it.piece === p.id ? ' selected' : ''}>${String.fromCharCode(65 + i)} · ${esc(p.name)}</option>`).join('')}</select></td>
        <td><input class="w" list="dl-f1" value="${esc(it.f1)}" data-f="f1" ${a(it)}></td><td><input class="w" style="width:124px" list="dl-f2" value="${esc(it.f2)}" data-f="f2" ${a(it)}></td>
        ${days.map(d => `<td><input class="day${it.days[d] ? ' has' : ''}" inputmode="numeric" value="${it.days[d] || ''}" data-day="${d}" ${a(it)}></td>`).join('')}
        <td class="r" id="ins-${it.id}">${c.ins}</td><td><input class="n" value="${nfmt(num(it.unit))}" data-f="unit" data-k="num" ${a(it)}></td>
        <td><span class="duo"><input value="${nfmt(num(it.disc.value))}" data-f="disc.value" data-k="num" ${a(it)}><select data-f="disc.type" ${a(it)}><option value="pct"${it.disc.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${it.disc.type === 'brl' ? ' selected' : ''}>R$</option></select></span></td>
        <td class="r" id="sub-${it.id}">${brl(c.sub)}</td><td style="text-align:center"><input type="checkbox"${it.bonus ? ' checked' : ''} data-f="bonus" data-k="bool" ${a(it)}></td>
        <td>${ro ? '' : `<button class="x" data-act="piRmItem" data-g="${g.id}" data-id="${it.id}" title="Remover item">×</button>`}</td></tr>`; }).join('');
    const head = days.map(d => { const w = new Date(y, m - 1, d).getDay(); return `<th class="d${w === 0 || w === 6 ? ' we' : ''}">${WD[w]}<br>${String(d).padStart(2, '0')}</th>`; }).join('');
    return `<div class="card"><div class="row mid" style="margin-bottom:10px"><h3 style="margin:0">Grade de veiculação</h3><input type="month" value="${g.period}" data-f="period" data-g="${g.id}" data-rerender="1"${ro}><span class="grow"></span>${ro ? '' : `<button class="btn sm danger" data-act="piRmGrid" data-id="${g.id}">Remover grade</button>`}</div>
      <div class="scroll"><table class="grid"><thead><tr><th>Peça</th><th>Programa / faixa</th><th>Formato</th>${head}<th class="r">Ins.</th><th class="r">Valor unit.</th><th>Desconto</th><th class="r">Subtotal</th><th>Bonif.</th><th></th></tr></thead>
      <tbody>${rows}<tr class="tot"><td>${ro ? '' : `<button class="btn sm" data-act="piAddItem" data-id="${g.id}">Adicionar item</button>`}</td><td colspan="${2 + nd}" class="r">Totais</td><td class="r" id="gins-${g.id}">${tIns}</td><td colspan="2"></td><td class="r" id="gsub-${g.id}">${brl(tSub)}</td><td colspan="2"></td></tr></tbody></table></div>
      ${S.datalist('dl-f1', produtos('programa'))}${S.datalist('dl-f2', produtos('formato'))}</div>`;
  }

  function tabBilling(pi, c, ro) {
    const b = pi.dados.billing, tile = (t, v) => `<div class="tile"><small>${t}</small><b style="font-size:20px">${brl(v)}</b></div>`;
    const blocks = S.billingEntries(pi, c).map(e => `<div class="card"><h3>${esc(e.from)} paga ${e.what.toLowerCase()} para ${esc(e.to)}</h3><div class="scroll"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Lançamento</th><th class="r">Valor</th><th class="r">Forma</th></tr></thead><tbody>${S.parcels(pi, e.value).map(p => `<tr><td>${p.n}</td><td>${dfmt(p.due)}</td><td>${esc(e.what)}</td><td class="r">${brl(p.value)}</td><td class="r">${esc(b.method)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
    return `<div class="tiles">${tile('Valor total', c.total)}${tile('Comissão da agência', c.commission)}${tile('Valor líquido da rádio', c.net)}${tile('Bonificação', c.bonus)}</div>
      <div class="card"><div class="row">
      ${pi.agencia_id ? `<label class="f grow">Instrução de faturamento<select data-f="dados.billing.type" data-k="int" data-rerender="1"${ro}>${Object.entries(S.BILLING).map(([k, v]) => `<option value="${k}"${+k === +b.type ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : '<div class="grow muted small">Venda direta: o cliente paga o valor total para a rádio.</div>'}
      <label class="f">1º vencimento<input type="date" value="${b.firstDue || ''}" data-f="dados.billing.firstDue" data-rerender="1"${ro}></label>
      <label class="f">Parcelas<input type="number" min="1" max="24" style="width:84px" value="${b.installments}" data-f="dados.billing.installments" data-k="int" data-rerender="1"${ro}></label>
      <label class="f">Forma de pagamento<select data-f="dados.billing.method" data-rerender="1"${ro}>${S.opts(['Boleto', 'Pix', 'Transferência', 'Cartão'], b.method)}</select></label></div></div>
      ${blocks}
      <div class="card"><h3>Observações ao cliente</h3><textarea data-f="dados.billing.obsClient"${ro}>${esc(b.obsClient)}</textarea></div>
      <div class="card"><h3>Observações internas da rádio</h3><textarea data-f="dados.billing.obsVehicle"${ro}>${esc(b.obsVehicle)}</textarea></div>`;
  }

  const tabHistory = pi => `<div class="card"><h3>Histórico do pedido</h3><ul class="hist">${(S.db.hist[pi.id] || []).map(h => `<li><span class="muted" style="width:86px">${dfmt(S.dia(h.em))}</span>${S.pill(h.status)}<span>${esc(S.usuario(h.usuario_id))}${h.nota ? ' · ' + esc(h.nota) : ''}</span></li>`).join('') || '<li class="muted">Carregando…</li>'}</ul></div>`;

  // ---------- ações ----------
  const mexer = fn => { const pi = cur(); fn(pi, pi.dados); S.piSalvar(pi); S.render(); };
  const criar = (v, dados) => S.q(S.sb.rpc('criar_pi', { p_veiculo:S.ui.vehicleId, p_titulo:v.titulo, p_cliente:v.cliente_id || null, p_agencia:v.agencia_id || null, p_projeto:v.projeto || '', p_dados:dados }));

  Object.assign(S.actions, {
    piTab: d => { S.ui.tab = d.tab; S.render(); },
    piNew: () => {
      const clientes = S.pessoas('cliente');
      if (!clientes.length) { S.toast('Cadastre um cliente antes de criar o PI.'); return S.go('/clientes'); }
      S.form(`Novo PI · ${esc(S.veh().nome)}`, [
        { k:'titulo', label:'Título', req:true, full:true },
        { k:'cliente_id', label:'Cliente', type:'select', req:true, options:[['', 'Escolha o cliente'], ...clientes.map(p => [p.id, p.nome])] },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Venda direta'], ...S.pessoas('agencia').map(p => [p.id, p.nome])] },
        { k:'projeto', label:'Projeto / campanha', full:true }, { k:'briefing', label:'Briefing', type:'textarea' }], {},
        v => S.run(async () => {
          const ag = S.pessoa(v.agencia_id) || S.pessoa((S.pessoa(v.cliente_id) || {}).agencia_id);
          if (ag && !v.agencia_id) v.agencia_id = ag.id; // cliente atendido por agência já entra com ela
          const dados = S.piNorm({ dados:{ briefing:v.briefing, commission:{ type:'pct', value:ag ? num(ag.comissao) : 0 }, grids:[{ id:uid(), period:today().slice(0, 7), items:[blankItem()] }] } }).dados;
          const pi = S.piNorm(await criar(v, dados)); S.db.pis.push(pi); S.ui.tab = 'detalhes'; location.hash = '/pi/' + pi.id;
        }, 'PI criado'), 'Criar e editar');
    },
    piMore: () => { const pi = cur(), gestor = S.pode('diretor', 'gerente');
      S.dialog(`<h2>${S.piNo(pi)}</h2><div class="row"><button class="btn" value="dup">Duplicar pedido</button>${gestor && !['cancelado', 'faturado'].includes(pi.status) ? '<button class="btn danger" value="cancelar">Cancelar pedido</button>' : ''}${pi.status === 'rascunho' ? '<button class="btn danger" value="excluir">Excluir rascunho</button>' : ''}<span class="grow"></span><button class="btn" value="x">Fechar</button></div>`);
      const d = document.getElementById('dlg'); d.onclose = () => {
        if (d.returnValue === 'dup') S.run(async () => { const novo = S.piNorm(await criar({ titulo:pi.titulo + ' (cópia)', cliente_id:pi.cliente_id, agencia_id:pi.agencia_id, projeto:pi.projeto }, JSON.parse(JSON.stringify(pi.dados)))); S.db.pis.push(novo); S.piSalvar(novo); location.hash = '/pi/' + novo.id; }, 'Pedido duplicado');
        if (d.returnValue === 'cancelar') S.setStatus(pi, 'cancelado');
        if (d.returnValue === 'excluir') S.run(async () => { clearTimeout(timers[pi.id]); delete timers[pi.id]; await S.excluir('pis', pi.id); location.hash = '/pis'; }, 'Rascunho excluído');
      }; },
    piSend: () => { const pi = cur(), probs = S.piProblems(pi); if (probs.length) return S.toast('Antes de enviar: ' + probs[0]); S.setStatus(pi, 'opec'); },
    piStatus: d => S.setStatus(d.id ? S.db.pis.find(p => p.id === d.id) : cur(), d.to),
    piReturn: d => { const pi = d.id ? S.db.pis.find(p => p.id === d.id) : cur();
      S.form(`Devolver ${S.piNo(pi)}`, [{ k:'nota', label:'O que precisa ser ajustado?', type:'textarea', req:true }], {}, v => S.setStatus(pi, 'devolvido', v.nota), 'Devolver ao consultor'); },
    piAddPiece: () => mexer((pi, d) => d.pieces.push({ id:uid(), name:'' })),
    piRmPiece: x => mexer((pi, d) => { d.pieces = d.pieces.filter(p => p.id !== x.id); }),
    piAddGrid: () => mexer((pi, d) => { const last = d.grids[d.grids.length - 1]; d.grids.push({ id:uid(), period:last ? last.period : today().slice(0, 7), items:[blankItem()] }); }),
    piRmGrid: x => mexer((pi, d) => { d.grids = d.grids.filter(g => g.id !== x.id); }),
    piAddItem: x => mexer((pi, d) => d.grids.find(g => g.id === x.id).items.push(blankItem())),
    piRmItem: x => mexer((pi, d) => { const g = d.grids.find(g => g.id === x.g); g.items = g.items.filter(i => i.id !== x.id); }),
    piExport: () => { const c = (n, t) => `<label class="f chk"><input type="checkbox" name="${n}" checked>${t}</label>`;
      S.dialog(`<h2>Exportar pedido de inserção</h2>
        <div class="g2"><label class="f">Data do documento<input type="date" name="date" value="${today()}"></label><label class="f">Para<select name="to"><option value="client">Cliente</option><option value="agency">Agência</option></select></label></div>
        <div class="g2">${c('commission', 'Comissão e valor líquido')}${c('billing', 'Faturamento e parcelas')}${c('clientData', 'Dados do cliente')}${c('vehicleData', 'Dados da rádio')}${c('obs', 'Observações ao cliente')}${c('signClient', 'Assinatura do cliente')}${c('signVehicle', 'Assinatura da rádio')}${c('signAgency', 'Assinatura da agência')}</div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Exportar</button></div>`,
        v => { S.buildPrint(cur(), v); setTimeout(() => window.print(), 60); }); }
  });

  // ---------- alterações de campo ----------
  const setPath = (obj, path, val) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = val; };
  S.changes.push((el, d) => {
    if (S.route().view !== 'pi' || !(d.f || d.day)) return false;
    const pi = cur(); if (!pi) return false;
    const val = d.k === 'num' ? num(el.value) : d.k === 'int' ? parseInt(el.value) || 1 : d.k === 'int0' ? parseInt(el.value) || 0 : d.k === 'bool' ? el.checked : el.value;
    const grid = d.g && pi.dados.grids.find(g => g.id === d.g), item = grid && d.i && grid.items.find(i => i.id === d.i);
    if (d.day) { const n = Math.max(0, parseInt(el.value) || 0); if (n) item.days[d.day] = n; else delete item.days[d.day]; el.value = n || ''; el.classList.toggle('has', n > 0); }
    else if (d.piece) pi.dados.pieces.find(p => p.id === d.piece).name = val;
    else setPath(item || grid || pi, d.f, d.f.endsWith('_id') ? val || null : val);
    if (d.k === 'num') el.value = nfmt(val);
    // A agência escolhida traz a sua comissão padrão
    if (d.f === 'agencia_id') pi.dados.commission = { type:'pct', value:val ? num((S.pessoa(val) || {}).comissao) : 0 };
    // Programa + formato puxam o preço vigente da tabela
    if (item && (d.f === 'f1' || d.f === 'f2')) { const p = S.preco(item.f1, item.f2); if (p) { item.unit = num(p.preco); const u = document.querySelector(`input[data-f="unit"][data-i="${item.id}"]`); if (u) u.value = nfmt(item.unit); } }
    S.piSalvar(pi);
    if (d.rerender) { S.render(); marca('Salvando…'); return true; }
    // Atualiza só os números calculados, para não perder o foco durante a digitação
    pi.dados.grids.forEach(g => { let ti = 0, ts = 0;
      g.items.forEach(it => { const c = S.itemCalc(it); ti += c.ins; ts += c.sub; const a = document.getElementById('ins-' + it.id), b = document.getElementById('sub-' + it.id); if (a) a.textContent = c.ins; if (b) b.textContent = brl(c.sub); });
      const a = document.getElementById('gins-' + g.id), b = document.getElementById('gsub-' + g.id); if (a) a.textContent = ti; if (b) b.textContent = brl(ts); });
    const s = document.getElementById('sum'); if (s) s.innerHTML = summary(S.calc(pi));
    return true;
  });

  // ---------- documento para impressão / PDF ----------
  S.buildPrint = (pi, o) => {
    const c = S.calc(pi), v = S.veh(pi.veiculo_id), cli = S.pessoa(pi.cliente_id) || {}, ag = S.pessoa(pi.agencia_id), b = pi.dados.billing;
    const grids = pi.dados.grids.map(g => {
      const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, i) => i + 1);
      let sub = 0;
      const rows = g.items.map(it => { const k = S.itemCalc(it); sub += k.sub; const dv = num(it.disc.value);
        return `<tr><td>${letter(pi, it.piece)}</td><td>${esc(it.f1)}</td><td>${esc(it.f2)}</td>${days.map(d => `<td style="text-align:center">${it.days[d] || ''}</td>`).join('')}<td class="r">${k.ins}</td><td class="r">${nfmt(num(it.unit)) || '0,00'}</td><td class="r">${dv ? (it.disc.type === 'pct' ? dv + '%' : nfmt(dv)) : '-'}</td><td class="r">${nfmt(k.sub) || '0,00'}</td><td>${it.bonus ? 'X' : ''}</td></tr>`; }).join('');
      return `<div><b>Período:</b> ${String(m).padStart(2, '0')}/${y}</div><table><thead><tr><th>Peça</th><th>Programa / faixa</th><th>Formato</th>${days.map(d => `<th>${WD[new Date(y, m - 1, d).getDay()]}<br>${d}</th>`).join('')}<th>Ins.</th><th>Valor unit.</th><th>Desc.</th><th>Subtotal</th><th>B</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right"><b>Subtotal: ${brl(sub)}</b></div>`;
    }).join('');
    const box = (title, nome, doc, end, email) => `<div class="box"><b>${title}:</b> ${esc(nome)}<br>${doc ? 'CNPJ/CPF: ' + esc(doc) + '<br>' : ''}${end ? esc(end) + '<br>' : ''}${email ? esc(email) : ''}</div>`;
    const bills = S.billingEntries(pi, c).filter(e => o.commission || e.what !== 'Comissão').flatMap(e => S.parcels(pi, e.value).map(p => `<tr><td>${esc(e.from)} → ${esc(e.to)}</td><td>${esc(e.what)}</td><td>${p.n}</td><td>${dfmt(p.due)}</td><td class="r">${nfmt(p.value) || '0,00'}</td><td>${esc(b.method)}</td></tr>`)).join('');
    const signs = [o.signClient && (cli.contato_assina || cli.nome), o.signVehicle && v.nome, o.signAgency && ag && ag.nome].filter(Boolean);
    document.getElementById('print').innerHTML = `<h1 style="border-left:6px solid ${esc(v.cor)};padding-left:8px">${esc(v.nome)} · Pedido de Inserção ${S.piNo(pi)}</h1><div>${esc(pi.titulo)}</div>
      <div class="meta"><div><b>Anunciante:</b> ${esc(cli.nome)}</div><div><b>Agência:</b> ${ag ? esc(ag.nome) : 'Venda direta'}</div><div><b>Data:</b> ${dfmt(o.date)}</div><div><b>Projeto:</b> ${esc(pi.projeto)}</div><div><b>Consultor:</b> ${esc(S.usuario(pi.consultor_id))}</div><div><b>Total de inserções:</b> ${c.ins}</div></div>
      <div><b>Peças:</b> ${pi.dados.pieces.map((p, i) => `<b>${String.fromCharCode(65 + i)}</b> - ${esc(p.name)}`).join(' &nbsp; ')}</div>
      ${grids}
      <div class="cols"><div class="box"><b>Valor total: ${brl(c.total)}</b>${c.discount ? ` (desconto geral ${brl(c.discount)})` : ''}${c.bonus ? ` &nbsp; Bonificação: ${brl(c.bonus)}` : ''}${o.commission && ag ? `<br>Comissão da agência: ${brl(c.commission)} &nbsp; Valor líquido: ${brl(c.net)}` : ''}${o.commission && c.fee ? `<br>Honorários da agência: ${brl(c.fee)}` : ''}
        ${o.billing ? `<h2>${ag ? S.BILLING[b.type] : 'Faturamento direto ao cliente'}</h2><table><thead><tr><th>De → para</th><th>Lançamento</th><th>Parc.</th><th>Vencimento</th><th>Valor (R$)</th><th>Forma</th></tr></thead><tbody>${bills}</tbody></table>` : ''}</div>
        <div>${o.vehicleData ? box('Veículo', v.razao_social || v.nome, v.cnpj, [v.endereco, v.cidade].filter(Boolean).join(' · '), v.email) : ''}${o.clientData ? box('Cliente', cli.razao_social || cli.nome, cli.documento, [cli.endereco, cli.cidade].filter(Boolean).join(' · '), cli.email) : ''}${o.to === 'agency' && ag ? box('Agência', ag.razao_social || ag.nome, ag.documento, [ag.endereco, ag.cidade].filter(Boolean).join(' · '), ag.email) : ''}</div></div>
      ${o.obs && b.obsClient ? `<h2>Observações</h2><div>${esc(b.obsClient).replace(/\n/g, '<br>')}</div>` : ''}
      ${signs.length ? `<div class="sign">${signs.map(s => `<div>${esc(s)}</div>`).join('')}</div>` : ''}`;
  };
})();

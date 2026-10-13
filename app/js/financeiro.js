// SONVI · financeiro: fatura os PIs aprovados e acompanha o que a rádio tem a receber e a pagar.
// Filtros (período, situação, tipo, busca), indicadores do período, fluxo por mês, idade dos recebíveis,
// lista agrupada por mês, baixa completa (juros, desconto, valor parcial, NF), baixa em lote e estorno.
// A baixa e o estorno passam pelas funções do banco baixar_lancamentos / estornar_baixa.
(() => {
  const { esc, brl, dfmt, num, nfmt } = S;
  const f = { per:'90d', de:'', ate:'', sit:'aberto', tipo:'receber', q:'', faixa:'' };
  let sel = new Set(), modo = 'lista';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const PERIODOS = [['90d', 'Próximos 90 dias e atrasados'], ['mes', 'Este mês'], ['prox', 'Próximo mês'], ['passado', 'Mês passado'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['datas', 'Escolher datas…']];
  const FAIXAS = [['avencer', 'A vencer', 'sky'], ['1-30', '1 a 30 dias', 'orange'], ['31-60', '31 a 60 dias', 'red'], ['60+', 'Mais de 60 dias', 'purple']];

  // ---------- regras puras ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dia = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const somaDias = (s, n) => { const d = dia(s); d.setDate(d.getDate() + n); return iso(d); };
  const atraso = (l, hoje) => !l.pago_em && l.vencimento && l.vencimento < hoje ? Math.round((dia(hoje) - dia(l.vencimento)) / 864e5) : 0;
  const faixaDe = (l, hoje) => { const a = atraso(l, hoje); return l.pago_em ? '' : !a ? 'avencer' : a <= 30 ? '1-30' : a <= 60 ? '31-60' : '60+'; };
  const recebidoDe = l => l.valor_pago === null || l.valor_pago === undefined ? Number(l.valor) : Number(l.valor_pago);
  const soma = (ls, fn = l => Number(l.valor)) => ls.reduce((s, l) => s + fn(l), 0);
  // Intervalo [de, ate] do período escolhido; '' = sem limite
  const intervalo = hoje => {
    const d = dia(hoje), y = d.getFullYear(), m = d.getMonth(), mes = (a, b) => [iso(new Date(a, b, 1)), iso(new Date(a, b + 1, 0))];
    return { '90d':['', somaDias(hoje, 90)], mes:mes(y, m), prox:mes(y, m + 1), passado:mes(y, m - 1), ano:[`${y}-01-01`, `${y}-12-31`], tudo:['', ''], datas:[f.de, f.ate] }[f.per] || ['', ''];
  };
  const noPeriodo = (l, [de, ate]) => !l.vencimento ? !de && (!ate || f.per === '90d') : (!de || l.vencimento >= de) && (!ate || l.vencimento <= ate);
  const situacao = (l, hoje) => l.pago_em ? 'pago' : atraso(l, hoje) ? 'vencido' : 'aberto';

  // ---------- tela ----------
  S.views.financeiro = () => {
    if (modo === 'relatorios') return telaRelatorios();
    const hoje = S.today(), L = S.db.lancamentos, faixa = intervalo(hoje);
    const doPeriodo = L.filter(l => noPeriodo(l, faixa));
    const rec = doPeriodo.filter(l => l.sentido === 'receber'), pag = doPeriodo.filter(l => l.sentido === 'pagar');
    const recAberto = rec.filter(l => !l.pago_em), recPago = rec.filter(l => l.pago_em), recVenc = rec.filter(l => atraso(l, hoje));
    const jaVenceu = rec.filter(l => l.vencimento && l.vencimento < hoje);
    const inad = soma(jaVenceu) ? Math.round(soma(recVenc) / soma(jaVenceu) * 100) : 0, maior = Math.max(0, ...recVenc.map(l => atraso(l, hoje)));
    const pagAberto = pag.filter(l => !l.pago_em);
    const tiles = `<div class="tiles">
      <div class="tile hero"><small>A receber no período</small><b>${brl(soma(recAberto))}</b><span>${recAberto.length} parcela${recAberto.length === 1 ? '' : 's'} · ${new Set(recAberto.map(l => l.pi_id).filter(Boolean)).size} PI${new Set(recAberto.map(l => l.pi_id).filter(Boolean)).size === 1 ? '' : 's'}</span></div>
      <div class="tile"><small>Recebido no período</small><b class="fin-verde">${brl(soma(recPago, recebidoDe))}</b><span class="${recPago.length ? 'bom' : ''}">${recPago.length} parcela${recPago.length === 1 ? '' : 's'} paga${recPago.length === 1 ? '' : 's'}</span></div>
      <div class="tile"><small>Vencido</small><b class="${recVenc.length ? 'fin-laranja' : ''}">${brl(soma(recVenc))}</b><span class="${recVenc.length ? 'ruim' : ''}">${recVenc.length ? `inadimplência ${inad}% · maior atraso ${maior} dia${maior === 1 ? '' : 's'}` : 'nada vencido'}</span></div>
      <div class="tile"><small>A pagar</small><b>${brl(soma(pagAberto))}</b><span>${pagAberto.length ? `${pagAberto.length} parcela${pagAberto.length === 1 ? '' : 's'}` : 'comissões de agência'}</span></div></div>`;

    // Fluxo de 6 meses (do mês passado a 4 meses à frente): previsto x recebido, só a receber
    const base = dia(hoje), meses = Array.from({ length:6 }, (_, k) => { const d = new Date(base.getFullYear(), base.getMonth() - 1 + k, 1); return iso(d).slice(0, 7); });
    const fluxo = meses.map(m => { const ls = L.filter(l => l.sentido === 'receber' && (l.vencimento || '').startsWith(m)); return { m, prev:soma(ls), rec:soma(ls.filter(l => l.pago_em), recebidoDe) }; });
    const maxF = Math.max(1, ...fluxo.map(x => Math.max(x.prev, x.rec))), k = v => v >= 1000 ? `${nfmt(v / 1000).replace(/,\d+$/, '')} mil` : v ? nfmt(v) : '';
    const grafico = `<section class="card"><div class="hd"><h3>Fluxo previsto por mês</h3><span class="fin-leg"><i class="prev"></i>Previsto <i class="rec"></i>Recebido</span></div>
      <div class="fin-bars" role="img" aria-label="A receber previsto e recebido nos últimos e próximos meses">${fluxo.map((x, i) => `<div class="${x.m === hoje.slice(0, 7) ? 'on' : ''}"><b>${k(x.prev)}</b><span><i class="prev" style="height:${x.prev ? Math.max(3, x.prev / maxF * 140) : 0}px;--i:${i}"></i><i class="rec" style="height:${x.rec ? Math.max(3, x.rec / maxF * 140) : 0}px;--i:${i}"></i></span></div>`).join('')}</div>
      <div class="bars-x">${fluxo.map(x => `<span>${MES3[+x.m.slice(5) - 1]}</span>`).join('')}</div></section>`;
    // Idade dos recebíveis em aberto (todos, independente do período)
    const abertos = L.filter(l => l.sentido === 'receber' && !l.pago_em), porFaixa = FAIXAS.map(([id, nome, tom]) => ({ id, nome, tom, v:soma(abertos.filter(l => faixaDe(l, hoje) === id)), n:abertos.filter(l => faixaDe(l, hoje) === id).length }));
    const idade = `<section class="card"><div class="hd"><h3>Situação dos recebíveis</h3><span>tudo em aberto</span></div>
      ${abertos.length ? `<div class="stack" role="img" aria-label="Recebíveis por atraso">${porFaixa.filter(x => x.v).map(x => `<i style="flex:${x.v};background:var(--${x.tom})"></i>`).join('')}</div>` : ''}
      <div class="legend">${porFaixa.map(x => `<a data-act="finFaixa" data-faixa="${x.id}" class="${f.faixa === x.id ? 'on' : ''}"><span class="sq" style="background:var(--${x.tom})"></span><span class="grow">${x.nome}</span><span class="muted small">${x.n}</span><b>${brl(x.v)}</b></a>`).join('')}</div></section>`;

    // Pedidos a faturar
    const aFaturar = S.db.pis.filter(p => ['aprovado', 'programado'].includes(p.status));
    const faturar = aFaturar.length ? `<div class="card"><div class="hd"><h3>Pedidos a faturar</h3><span>${aFaturar.length} aguardando</span></div><div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Status</th><th class="r">Total</th><th class="r">Líquido da rádio</th><th></th></tr></thead><tbody>${aFaturar.map(p => { const c = S.calc(p); return `<tr><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}" style="color:var(--ink)"><b>${esc(p.titulo)}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td>${S.pill(p.status)}</td><td class="r">${brl(c.total)}</td><td class="r">${brl(c.net)}</td><td class="r"><button class="btn sm pri" data-act="finFaturar" data-id="${p.id}">Faturar</button></td></tr>`; }).join('')}</tbody></table></div></div>`
      : `<div class="card fin-faturar"><b>Pedidos a faturar</b>${S.tag('nenhum aguardando', 'gray')}<span class="grow"></span><span class="muted small">Aparecem aqui quando a OPEC aprova ou programa um PI.</span></div>`;

    // Filtros
    const q = f.q.trim().toLowerCase();
    const base2 = doPeriodo.filter(l => (f.tipo === 'ambos' || l.sentido === f.tipo) && (!q || [l.contraparte, l.descricao, l.nota_fiscal, l.forma].join(' ').toLowerCase().includes(q)) && (!f.faixa || faixaDe(l, hoje) === f.faixa));
    const cont = { aberto:base2.filter(l => !l.pago_em).length, vencido:base2.filter(l => atraso(l, hoje)).length, pago:base2.filter(l => l.pago_em).length, todos:base2.length };
    const lista = base2.filter(l => f.sit === 'todos' || (f.sit === 'aberto' ? !l.pago_em : f.sit === 'vencido' ? atraso(l, hoje) : l.pago_em))
      .sort((a, b) => (a.vencimento || '9').localeCompare(b.vencimento || '9') || (a.contraparte || '').localeCompare(b.contraparte || ''));
    sel = new Set([...sel].filter(id => lista.some(l => l.id === id && !l.pago_em)));
    const seg = (nome, campo, ops) => `<div class="seg fin-seg" role="group" aria-label="${nome}">${ops.map(([v, t]) => `<button class="${f[campo] === v ? 'on' : ''}" data-act="finSet" data-campo="${campo}" data-v="${v}">${t}</button>`).join('')}</div>`;
    const filtros = `<div class="card fin-filtros">
      <label class="fin-per"><span class="muted small">Período</span><select data-fin="per" aria-label="Período">${PERIODOS.map(([v, t]) => `<option value="${v}"${f.per === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      ${f.per === 'datas' ? `<label class="fin-per"><span class="muted small">De</span><input type="date" data-fin="de" value="${f.de}" aria-label="De"></label><label class="fin-per"><span class="muted small">Até</span><input type="date" data-fin="ate" value="${f.ate}" aria-label="Até"></label>` : ''}
      ${seg('Situação', 'sit', [['aberto', `Em aberto <span class="muted">${cont.aberto}</span>`], ['vencido', `Vencidos <span class="muted">${cont.vencido}</span>`], ['pago', `Pagos <span class="muted">${cont.pago}</span>`], ['todos', 'Todos']])}
      ${seg('Tipo', 'tipo', [['receber', 'A receber'], ['pagar', 'A pagar'], ['ambos', 'Ambos']])}
      <label class="fin-busca">${S.svg('busca')}<input data-fin="q" value="${esc(f.q)}" placeholder="Buscar cliente, agência, PI ou nota fiscal" aria-label="Buscar"></label>
      ${f.faixa ? `<button class="btn sm" data-act="finFaixa" data-faixa="">${esc(FAIXAS.find(x => x[0] === f.faixa)[1])} ×</button>` : ''}</div>`;

    // Lista agrupada por mês de vencimento
    const grupos = []; lista.forEach(l => { const m = (l.vencimento || '').slice(0, 7); let g = grupos[grupos.length - 1]; if (!g || g.m !== m) grupos.push(g = { m, itens:[] }); g.itens.push(l); });
    const nomeMes = m => m ? `${MESES[+m.slice(5) - 1][0].toUpperCase()}${MESES[+m.slice(5) - 1].slice(1)} ${m.slice(0, 4)}` : 'Sem vencimento';
    const pill = l => { const s = situacao(l, hoje); return s === 'pago' ? S.tag(`${l.sentido === 'pagar' ? 'Pago' : 'Recebido'} ${dfmt(l.pago_em).slice(0, 5)}`, 'green') : s === 'vencido' ? S.tag(`Vencido ${atraso(l, hoje)} dia${atraso(l, hoje) === 1 ? '' : 's'}`, 'orange') : S.tag('Em aberto', 'sky'); };
    const valorTxt = l => l.pago_em && Math.abs(recebidoDe(l) - Number(l.valor)) > 0.004 ? `<b>${brl(recebidoDe(l))}</b><small class="muted">parcela ${brl(l.valor)}</small>` : `<b>${brl(l.valor)}</b>`;
    const quem = l => `<span class="fin-quem"><b>${esc(l.contraparte) || '—'}</b><small>${esc(l.descricao)}${l.categoria ? ` · ${esc(l.categoria)}` : ''}${l.pi_id ? '' : ' · avulso'}${l.parcela ? ` · parcela ${l.parcela}` : ''}${l.sentido === 'pagar' && f.tipo === 'ambos' ? ' · a pagar' : ''}</small></span>`;
    const acoes = l => `<span class="fin-acoes">${l.pago_em ? '' : `<button class="btn sm" data-act="finBaixa" data-id="${l.id}">${l.sentido === 'pagar' ? 'Pagar' : 'Dar baixa'}</button>`}<button class="btn tres" data-act="finMenu" data-id="${l.id}" aria-label="Opções da parcela">${S.svg('mais3')}</button></span>`;
    const marca = l => l.pago_em ? '<span></span>' : `<input type="checkbox" data-fin-sel="${l.id}"${sel.has(l.id) ? ' checked' : ''} aria-label="Selecionar parcela de ${esc(l.contraparte)}">`;
    const selVal = soma(lista.filter(l => sel.has(l.id)));
    const barraSel = sel.size ? `<div class="fin-selbar"><b>${sel.size} selecionada${sel.size === 1 ? '' : 's'} · ${brl(selVal)}</b><span class="grow"></span><button class="btn sm" data-act="finLimparSel">Limpar</button><button class="btn sm pri" data-act="finLote">Dar baixa ${sel.size === 1 ? 'na selecionada' : `nas ${sel.size}`}</button></div>` : '';
    const abertasLista = lista.filter(l => !l.pago_em);
    let corpo;
    if (!lista.length) corpo = `<div class="empty"><b>Nenhum lançamento</b>${L.length ? 'Nada com esses filtros. Experimente outro período ou situação.' : 'As parcelas aparecem aqui quando um PI é faturado.'}</div>`;
    else if (S.celular) corpo = grupos.map(g => `<div class="fin-mes"><b>${nomeMes(g.m)}</b><span>${g.itens.length} · ${brl(soma(g.itens))}</span></div>` + g.itens.map(l => `<div class="fin-cartao">
        <div class="row">${marca(l)}${quem(l)}<span class="fin-valor">${valorTxt(l)}</span></div>
        <div class="row mid fin-info"><span class="muted small">vence ${dfmt(l.vencimento)}${l.forma ? ' · ' + esc(l.forma) : ''}${l.nota_fiscal ? ' · NF ' + esc(l.nota_fiscal) : ''}</span><span class="grow"></span>${pill(l)}</div>${acoes(l)}</div>`).join('')).join('');
    else corpo = `<div class="scroll"><div class="fin-tab"><div class="fin-cab"><span>${abertasLista.length ? `<input type="checkbox" data-fin-todos="1"${abertasLista.every(l => sel.has(l.id)) ? ' checked' : ''} aria-label="Selecionar todas em aberto">` : ''}</span><span>Vencimento</span><span>${f.tipo === 'pagar' ? 'Para quem' : 'Cliente'} / descrição</span><span>Nota fiscal</span><span>Forma</span><span class="r">Valor</span><span>Situação</span><span></span></div>
      ${grupos.map(g => `<div class="fin-mes"><b>${nomeMes(g.m)}</b><span>${g.itens.length} parcela${g.itens.length === 1 ? '' : 's'} · ${brl(soma(g.itens))}</span></div>` + g.itens.map(l => `<div class="fin-lin${sel.has(l.id) ? ' sel' : ''}">${marca(l)}<span class="fin-data">${dfmt(l.vencimento)}</span>${quem(l)}<span class="${l.nota_fiscal ? '' : 'muted'}">${l.nota_fiscal ? esc(l.nota_fiscal) : '—'}</span><span>${esc(l.forma)}</span><span class="fin-valor">${valorTxt(l)}</span><span>${pill(l)}</span>${acoes(l)}</div>`).join('')).join('')}</div></div>`;

    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Financeiro`, actions:`<button class="btn" data-act="finRelatorios">${S.svg('relatorio')}Relatórios</button><button class="btn pri" data-act="finAvulso">${S.svg('mais')}Lançamento avulso</button>`,
      body:`${tiles}<div class="cols">${grafico}${idade}</div>${faturar}${filtros}<div class="card fin-lista">${barraSel}${corpo}</div>` };
  };

  // ---------- baixa ----------
  const campoDec = (n, rot, v, ph) => `<label class="f">${rot}<input name="${n}" data-mask="dec" inputmode="decimal" value="${v ? nfmt(v) : ''}" placeholder="${ph}" autocomplete="off"></label>`;
  const FORMAS = ['Boleto', 'Pix', 'Transferência', 'Cartão', 'Dinheiro', 'Permuta'];
  const formas = atual => FORMAS.concat(atual && !FORMAS.includes(atual) ? [atual] : []).map(x => `<option${x === atual ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const resumoBaixa = () => {
    const fm = document.querySelector('#dlg form'), el = document.getElementById('finResumo'); if (!fm || !el) return;
    const v = Number(fm.dataset.valor), devido = v + num(fm.elements.fb_juros.value) - num(fm.elements.fb_desc.value), pago = fm.elements.fb_pago.value.trim() ? num(fm.elements.fb_pago.value) : devido;
    const resto = v - Math.min(v, pago - num(fm.elements.fb_juros.value) + num(fm.elements.fb_desc.value));
    el.innerHTML = resto > 0.004 ? `Recebendo ${brl(pago)} de ${brl(devido)}: a parcela fica paga e <b>${brl(resto)}</b> continua em aberto, com o mesmo vencimento.` : `Total a receber: <b>${brl(devido)}</b>. A parcela fica quitada.`;
  };
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#dlg') && /^fb_/.test(e.target.name || '')) resumoBaixa(); });
  const recarregar = async () => { S.db.lancamentos = await S.q(S.sb.from('lancamentos').select('*').eq('veiculo_id', S.ui.vehicleId)); };
  const baixar = itens => S.run(async () => { await S.q(S.sb.rpc('baixar_lancamentos', { p_itens:itens })); sel.clear(); await recarregar(); }, itens.length > 1 ? `Baixa feita em ${itens.length} parcelas` : 'Baixa registrada');

  Object.assign(S.actions, {
    finSet: d => { f[d.campo] = d.v; S.render(); },
    finFaixa: d => { f.faixa = f.faixa === d.faixa ? '' : d.faixa; if (f.faixa) { f.sit = f.faixa === 'avencer' ? 'aberto' : 'vencido'; f.tipo = 'receber'; f.per = 'tudo'; } S.render(); },
    finLimparSel: () => { sel.clear(); S.render(); },
    finBaixa: d => { const l = S.db.lancamentos.find(x => x.id === d.id), pagar = l.sentido === 'pagar';
      S.dialog(`<h2>${pagar ? 'Registrar pagamento' : 'Dar baixa'}</h2><p class="muted small">${esc(l.contraparte)} · ${esc(l.descricao)} · parcela ${l.parcela} · vence ${dfmt(l.vencimento)}</p>
        <div class="fin-devido"><span class="muted">Valor da parcela</span><b>${brl(l.valor)}</b></div>
        <div class="g2"><label class="f">Data do ${pagar ? 'pagamento' : 'recebimento'}<input type="date" name="fb_data" value="${S.today()}" required></label>
          <label class="f">Forma<select name="fb_forma">${formas(l.forma)}</select></label>
          ${campoDec('fb_juros', 'Juros e multa (R$)', 0, 'Ex.: 0,00')}${campoDec('fb_desc', 'Desconto concedido (R$)', 0, 'Ex.: 0,00')}
          ${campoDec('fb_pago', `Valor ${pagar ? 'pago' : 'recebido'} (R$)`, Number(l.valor), 'Ex.: ' + nfmt(l.valor))}
          <label class="f">Nota fiscal<input name="fb_nf" value="${esc(l.nota_fiscal || '')}" placeholder="Ex.: 1.234" autocomplete="off"></label>
          <label class="f" style="grid-column:1/-1">Observação<textarea name="fb_obs" placeholder="Ex.: pago pela matriz, comprovante no e-mail">${esc(l.observacao || '')}</textarea></label></div>
        <div class="note info" id="finResumo"></div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Confirmar ${pagar ? 'pagamento' : 'recebimento'}</button></div>`,
        v => baixar([{ id:l.id, pago_em:v.fb_data || S.today(), forma:v.fb_forma, juros:num(v.fb_juros), desconto:num(v.fb_desc), valor_pago:v.fb_pago.trim() ? num(v.fb_pago) : null, nota_fiscal:v.fb_nf.trim(), observacao:v.fb_obs.trim() }]));
      document.querySelector('#dlg form').dataset.valor = l.valor; resumoBaixa(); },
    finLote: () => { const ls = S.db.lancamentos.filter(l => sel.has(l.id) && !l.pago_em); if (!ls.length) return;
      S.dialog(`<h2>Dar baixa em ${ls.length} parcela${ls.length === 1 ? '' : 's'}</h2><p class="muted small">Cada parcela é quitada pelo valor cheio. Para juros, desconto ou valor parcial, dê baixa em uma por vez.</p>
        <div class="fin-devido"><span class="muted">Total</span><b>${brl(soma(ls))}</b></div>
        <div class="g2"><label class="f">Data<input type="date" name="fl_data" value="${S.today()}" required></label><label class="f">Forma<select name="fl_forma"><option value="">Manter a de cada parcela</option>${formas('')}</select></label></div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Confirmar baixa</button></div>`,
        v => baixar(ls.map(l => ({ id:l.id, pago_em:v.fl_data || S.today(), forma:v.fl_forma || '' })))); },
    finMenu: (d, botao) => { const l = S.db.lancamentos.find(x => x.id === d.id);
      S.menu(botao, [...(l.pi_id ? [{ label:'Abrir o PI', icon:'pis', act:'finVerPi', data:{ id:l.pi_id } }] : []),
        ...(l.pago_em ? [{ label:'Ver detalhes da baixa', icon:'check', act:'finDetalhe', data:{ id:l.id } }, '-', { label:'Estornar baixa', icon:'voltar', act:'finEstornar', data:{ id:l.id }, perigo:true }]
          : [{ label:'Mudar vencimento', icon:'relogio', act:'finVenc', data:{ id:l.id } }, { label:'Informar nota fiscal', icon:'editar', act:'finNf', data:{ id:l.id } }, ...(l.pi_id ? [] : ['-', { label:'Excluir lançamento', icon:'lixo', act:'finExcluir', data:{ id:l.id }, perigo:true }])])]); },
    finVerPi: d => S.go(`/pi/${d.id}`),
    finDetalhe: d => { const l = S.db.lancamentos.find(x => x.id === d.id), lin = (a, b) => b ? `<tr><td class="muted">${a}</td><td class="r"><b>${b}</b></td></tr>` : '';
      S.dialog(`<h2>Baixa da parcela</h2><p class="muted small">${esc(l.contraparte)} · ${esc(l.descricao)} · parcela ${l.parcela}</p>
        <table>${lin('Vencimento', dfmt(l.vencimento))}${lin(l.sentido === 'pagar' ? 'Pago em' : 'Recebido em', dfmt(l.pago_em))}${lin('Forma', esc(l.forma))}${lin('Parcela', brl(l.valor))}${lin('Juros e multa', Number(l.juros) ? brl(l.juros) : '')}${lin('Desconto', Number(l.desconto) ? brl(l.desconto) : '')}${lin(l.sentido === 'pagar' ? 'Valor pago' : 'Valor recebido', brl(recebidoDe(l)))}${lin('Nota fiscal', esc(l.nota_fiscal))}${lin('Observação', esc(l.observacao))}</table>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Fechar</button></div>`); },
    finEstornar: d => { const l = S.db.lancamentos.find(x => x.id === d.id);
      if (!confirm(`Estornar a baixa de ${l.contraparte} (${brl(recebidoDe(l))})? A parcela volta a ficar em aberto.`)) return;
      S.run(async () => { await S.q(S.sb.rpc('estornar_baixa', { p_id:l.id })); await recarregar(); }, 'Baixa estornada'); },
    finVenc: d => { const l = S.db.lancamentos.find(x => x.id === d.id);
      S.form('Mudar vencimento', [{ k:'vencimento', label:'Novo vencimento', type:'date', req:true }], { vencimento:l.vencimento || '' }, v => S.run(() => S.salvar('lancamentos', { id:l.id, vencimento:v.vencimento }), 'Vencimento alterado'), 'Salvar', { editar:true }); },
    finNf: d => { const l = S.db.lancamentos.find(x => x.id === d.id);
      S.form('Nota fiscal', [{ k:'nota_fiscal', label:'Número da nota fiscal', ph:'Ex.: 1.234' }], { nota_fiscal:l.nota_fiscal || '' }, v => S.run(() => S.salvar('lancamentos', { id:l.id, nota_fiscal:(v.nota_fiscal || '').trim() }), 'Nota fiscal salva'), 'Salvar', { editar:true }); },
    // Mostra as parcelas que serão geradas e grava tudo de uma vez
    finFaturar: d => { const pi = S.db.pis.find(p => p.id === d.id), ls = S.lancamentosDoPi(pi);
      S.dialog(`<h2>Faturar ${S.piNo(pi)}</h2><p class="muted">${esc(pi.titulo)} · ${esc(S.nome(pi.cliente_id))}</p>
        <table><thead><tr><th>Tipo</th><th>De / para</th><th>Parc.</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody>${ls.map(l => `<tr><td>${l.sentido === 'receber' ? 'Receber' : 'Pagar'}</td><td>${esc(l.contraparte)}</td><td>${l.parcela}</td><td>${dfmt(l.vencimento)}</td><td class="r">${brl(l.valor)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Este PI não gera valores para a rádio.</td></tr>'}</tbody></table>
        ${ls.some(l => !l.vencimento) ? '<p class="note">Há parcelas sem vencimento. Defina o 1º vencimento na aba Faturamento do PI, se quiser.</p>' : ''}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Confirmar faturamento</button></div>`,
        () => S.run(async () => { const r = await S.q(S.sb.rpc('faturar_pi', { p_pi:pi.id, p_lancamentos:ls })); Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id]; await recarregar(); }, `${S.piNo(pi)} faturado`)); }
  });

  // Filtros de texto e data; seleção das parcelas
  let tBusca;
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.fin; if (k !== 'q') return;
    f.q = e.target.value; clearTimeout(tBusca); tBusca = setTimeout(() => { const pos = e.target.selectionStart; S.render(); const el = document.querySelector('[data-fin="q"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 250); });
  S.changes.push((el, d) => {
    if (d.fin && d.fin !== 'q') { f[d.fin] = el.value; if (d.fin === 'per') f.faixa = ''; if (d.fin === 'per' && el.value === 'datas' && !f.de) { const h = S.today(); f.de = h.slice(0, 8) + '01'; f.ate = h; } S.render(); return true; }
    if (d.finSel) { if (el.checked) sel.add(d.finSel); else sel.delete(d.finSel); S.render(); return true; }
    if (d.finTodos) { const ids = [...document.querySelectorAll('[data-fin-sel]')].map(x => x.dataset.finSel); ids.forEach(id => el.checked ? sel.add(id) : sel.delete(id)); S.render(); return true; }
    return false;
  });

  // ---------- lançamento avulso ----------
  const somaMeses = (s, n) => { const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1 + n, 1), ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return iso(new Date(x.getFullYear(), x.getMonth(), Math.min(d, ult))); };
  const formAvulso = () => S.form('Lançamento avulso', [
    { k:'sentido', label:'Tipo', type:'select', options:[['receber', 'A receber (receita)'], ['pagar', 'A pagar (despesa)']] },
    { k:'categoria', label:'Categoria', ph:'Ex.: Aluguel, Salários, Permuta, Serviços' },
    { k:'descricao', label:'Descrição', req:true, full:true, ph:'Ex.: Aluguel da torre de transmissão' },
    { k:'contraparte', label:'De quem / para quem', ph:'Ex.: Imobiliária Centro' },
    { k:'forma', label:'Forma', type:'select', options:FORMAS.map(x => [x, x]) },
    { k:'valor', label:'Valor de cada parcela (R$)', req:true, mask:'dec', ph:'Ex.: 2.500,00' },
    { k:'vencimento', label:'1º vencimento', type:'date', req:true },
    { k:'vezes', label:'Repetir por quantos meses', mask:'int', ph:'Ex.: 12' },
    { k:'observacao', label:'Observação', type:'textarea', ph:'Ex.: contrato até dezembro' }],
    { sentido:'pagar', forma:'Boleto', vencimento:S.today(), vezes:'1' },
    v => { const n = Math.min(60, Math.max(1, parseInt(v.vezes) || 1)), valor = num(v.valor);
      if (!(valor > 0)) return S.toast('Informe o valor.');
      const rows = Array.from({ length:n }, (_, k) => ({ veiculo_id:S.ui.vehicleId, sentido:v.sentido, categoria:(v.categoria || '').trim(), descricao:v.descricao.trim(), contraparte:(v.contraparte || '').trim(), forma:v.forma, valor, vencimento:somaMeses(v.vencimento, k), parcela:k + 1, observacao:(v.observacao || '').trim() }));
      S.run(async () => { const r = await S.q(S.sb.from('lancamentos').insert(rows).select()); S.db.lancamentos.push(...r); }, n > 1 ? `${n} lançamentos criados` : 'Lançamento criado'); }, 'Criar', { editar:true });

  // ---------- relatórios ----------
  const rel = { id:'receber', per:'ano', de:'', ate:'', consultor:'' };
  const REL = [
    ['receber', 'Contas a receber', 'Parcelas em aberto por vencimento'],
    ['recebimentos', 'Recebimentos', 'O que entrou no período, por data e forma'],
    ['inadimplencia', 'Inadimplência', 'Vencidos por cliente e faixa de atraso'],
    ['cliente', 'Faturamento por cliente', 'PIs faturados: valor, comissão, recebido e em aberto'],
    ['agencia', 'Faturamento por agência', 'PIs e comissões de cada agência'],
    ['consultor', 'Vendas por consultor', 'Base para a comissão da equipe comercial'],
    ['caixa', 'Previsão de caixa', 'Entradas e saídas previstas mês a mês'],
    ['nf', 'Notas fiscais pendentes', 'Parcelas de PIs faturados sem nota fiscal'],
    ['pagar', 'Contas a pagar', 'Comissões e despesas em aberto']];
  const RPER = [['mes', 'Este mês'], ['passado', 'Mês passado'], ['trimestre', 'Este trimestre'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['datas', 'Escolher datas…']];
  const relIntervalo = hoje => { const d = dia(hoje), y = d.getFullYear(), m = d.getMonth(), mes = (a, b, n = 1) => [iso(new Date(a, b, 1)), iso(new Date(a, b + n, 0))];
    return { mes:mes(y, m), passado:mes(y, m - 1), trimestre:mes(y, m - m % 3, 3), ano:[`${y}-01-01`, `${y}-12-31`], tudo:['', ''], datas:[rel.de, rel.ate] }[rel.per] || ['', '']; };
  const entre = (d, [de, ate]) => !!d && (!de || d >= de) && (!ate || d <= ate);
  const piDe = id => S.db.pis.find(p => p.id === id);
  const doConsultor = l => !rel.consultor || (piDe(l.pi_id) || {}).consultor_id === rel.consultor;
  // Meses de veiculação do PI que caem no intervalo
  const piNoPeriodo = (pi, [de, ate]) => (pi.dados.grids || []).some(g => { const ini = g.period + '-01', fim = iso(new Date(+g.period.slice(0, 4), +g.period.slice(5), 0)); return (!de || fim >= de) && (!ate || ini <= ate); });
  const C = (t, tipo) => ({ t, tipo }); // tipo: 'brl' | 'num' | 'data' | ''
  const agrupa = (ls, chave) => { const m = new Map(); ls.forEach(x => { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };

  const montar = () => {
    const hoje = S.today(), I = relIntervalo(hoje), L = S.db.lancamentos, nomeMes = m => `${MES3[+m.slice(5) - 1]}/${m.slice(0, 4)}`;
    const recPi = pi => L.filter(l => l.pi_id === pi.id && l.sentido === 'receber');
    const faturados = S.db.pis.filter(p => p.status === 'faturado' && piNoPeriodo(p, I) && (!rel.consultor || p.consultor_id === rel.consultor));
    switch (rel.id) {
      case 'receber': { const ls = L.filter(l => l.sentido === 'receber' && !l.pago_em && (rel.per === 'tudo' || entre(l.vencimento, I)) && doConsultor(l)).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
        return { cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('Parcela', 'num'), C('Forma'), C('NF'), C('Atraso (dias)', 'num'), C('Valor', 'brl')],
          rows:ls.map(l => [l.vencimento, l.contraparte, l.descricao, l.parcela, l.forma, l.nota_fiscal, atraso(l, hoje) || '', Number(l.valor)]), total:['Total', '', `${ls.length} parcelas`, '', '', '', '', soma(ls)] }; }
      case 'pagar': { const ls = L.filter(l => l.sentido === 'pagar' && !l.pago_em && (rel.per === 'tudo' || entre(l.vencimento, I))).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
        return { cols:[C('Vencimento', 'data'), C('Para quem'), C('Descrição'), C('Categoria'), C('Forma'), C('Valor', 'brl')],
          rows:ls.map(l => [l.vencimento, l.contraparte, l.descricao, l.categoria || (l.pi_id ? 'Comissão' : ''), l.forma, Number(l.valor)]), total:['Total', '', `${ls.length} parcelas`, '', '', soma(ls)] }; }
      case 'recebimentos': { const ls = L.filter(l => l.sentido === 'receber' && l.pago_em && entre(l.pago_em, rel.per === 'tudo' ? ['', ''] : I) && doConsultor(l)).sort((a, b) => a.pago_em.localeCompare(b.pago_em));
        return { cols:[C('Recebido em', 'data'), C('Cliente'), C('Descrição'), C('Forma'), C('NF'), C('Parcela', 'brl'), C('Juros', 'brl'), C('Desconto', 'brl'), C('Recebido', 'brl')],
          rows:ls.map(l => [l.pago_em, l.contraparte, l.descricao, l.forma, l.nota_fiscal, Number(l.valor), Number(l.juros) || 0, Number(l.desconto) || 0, recebidoDe(l)]),
          total:['Total', '', `${ls.length} recebimentos`, '', '', soma(ls), soma(ls, l => Number(l.juros) || 0), soma(ls, l => Number(l.desconto) || 0), soma(ls, recebidoDe)] }; }
      case 'inadimplencia': { const ls = L.filter(l => l.sentido === 'receber' && atraso(l, hoje) && doConsultor(l));
        const g = agrupa(ls, l => l.contraparte || '—').map(([k, xs]) => { const fx = id => soma(xs.filter(l => faixaDe(l, hoje) === id)); return [k, xs.length, Math.max(...xs.map(l => atraso(l, hoje))), fx('1-30'), fx('31-60'), fx('60+'), soma(xs)]; }).sort((a, b) => b[6] - a[6]);
        return { cols:[C('Cliente'), C('Parcelas', 'num'), C('Maior atraso (dias)', 'num'), C('1 a 30 dias', 'brl'), C('31 a 60 dias', 'brl'), C('Mais de 60', 'brl'), C('Total vencido', 'brl')],
          rows:g, total:['Total', ls.length, '', soma(g, r => r[3]), soma(g, r => r[4]), soma(g, r => r[5]), soma(ls)], nota:'Considera tudo o que está vencido hoje, de qualquer período.' }; }
      case 'cliente': case 'agencia': {
        const chave = rel.id === 'cliente' ? p => S.nome(p.cliente_id) || '—' : p => p.agencia_id ? S.nome(p.agencia_id) : 'Venda direta';
        const g = agrupa(faturados, chave).map(([k, ps]) => { const cs = ps.map(S.calc), ls = ps.flatMap(recPi); return [k, ps.length, soma(cs, c => c.total), soma(cs, c => c.commission), soma(cs, c => c.net), soma(ls.filter(l => l.pago_em), recebidoDe), soma(ls.filter(l => !l.pago_em))]; }).sort((a, b) => b[2] - a[2]);
        return { cols:[C(rel.id === 'cliente' ? 'Cliente' : 'Agência'), C('PIs', 'num'), C('Valor dos PIs', 'brl'), C('Comissão agência', 'brl'), C('Líquido da rádio', 'brl'), C('Recebido', 'brl'), C('Em aberto', 'brl')],
          rows:g, total:['Total', faturados.length, ...[2, 3, 4, 5, 6].map(i => soma(g, r => r[i]))], nota:'PIs faturados com veiculação no período.' }; }
      case 'consultor': { const ps = S.db.pis.filter(p => ['aprovado', 'programado', 'faturado'].includes(p.status) && piNoPeriodo(p, I) && (!rel.consultor || p.consultor_id === rel.consultor));
        const g = agrupa(ps, p => S.usuario(p.consultor_id) || '—').map(([k, xs]) => { const cs = xs.map(S.calc); return [k, xs.length, soma(cs, c => c.ins), soma(cs, c => c.total), soma(cs, c => c.net), xs.filter(p => p.status === 'faturado').length]; }).sort((a, b) => b[3] - a[3]);
        return { cols:[C('Consultor'), C('PIs', 'num'), C('Inserções', 'num'), C('Valor dos PIs', 'brl'), C('Líquido da rádio', 'brl'), C('Já faturados', 'num')],
          rows:g, total:['Total', ps.length, soma(g, r => r[2]), soma(g, r => r[3]), soma(g, r => r[4]), soma(g, r => r[5])], nota:'PIs aprovados, programados ou faturados com veiculação no período.' }; }
      case 'caixa': { const [de, ate] = I, ini = de || hoje.slice(0, 8) + '01', fim = ate || somaMeses(hoje, 6), ms = []; for (let m = ini.slice(0, 7); m <= fim.slice(0, 7) && ms.length < 36; m = somaMeses(m + '-01', 1).slice(0, 7)) ms.push(m);
        let acum = 0; const rows = ms.map(m => { const doMes = L.filter(l => (l.vencimento || '').startsWith(m)), e = soma(doMes.filter(l => l.sentido === 'receber')), sd = soma(doMes.filter(l => l.sentido === 'pagar')), rcb = soma(doMes.filter(l => l.sentido === 'receber' && l.pago_em), recebidoDe); acum += e - sd; return [nomeMes(m), e, rcb, sd, e - sd, acum]; });
        return { cols:[C('Mês'), C('Entradas previstas', 'brl'), C('Já recebido', 'brl'), C('Saídas previstas', 'brl'), C('Saldo do mês', 'brl'), C('Saldo acumulado', 'brl')],
          rows, total:['Total', soma(rows, r => r[1]), soma(rows, r => r[2]), soma(rows, r => r[3]), soma(rows, r => r[4]), ''], nota:'Pelo vencimento das parcelas, pagas ou não.' }; }
      case 'nf': { const ls = L.filter(l => l.sentido === 'receber' && l.pi_id && !l.nota_fiscal && (rel.per === 'tudo' || entre(l.vencimento, I)) && doConsultor(l)).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
        return { cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('Parcela', 'num'), C('Situação'), C('Valor', 'brl')],
          rows:ls.map(l => [l.vencimento, l.contraparte, l.descricao, l.parcela, l.pago_em ? 'Pago' : atraso(l, hoje) ? 'Vencido' : 'Em aberto', Number(l.valor)]), total:['Total', '', `${ls.length} parcelas`, '', '', soma(ls)] }; }
    }
  };
  const fmt = (v, tipo) => v === '' || v === null || v === undefined ? '' : tipo === 'brl' ? (typeof v === 'number' ? brl(v) : v) : tipo === 'data' ? dfmt(v) : tipo === 'num' && typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v);
  const tabelaHtml = r => `<table class="fin-rel-tab"><thead><tr>${r.cols.map(c => `<th${c.tipo === 'brl' || c.tipo === 'num' ? ' class="r"' : ''}>${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${r.rows.map(row => `<tr>${row.map((v, i) => `<td${['brl', 'num'].includes(r.cols[i].tipo) ? ' class="r"' : ''}>${esc(fmt(v, r.cols[i].tipo))}</td>`).join('')}</tr>`).join('')}</tbody>
    ${r.rows.length ? `<tfoot><tr>${r.total.map((v, i) => `<td${['brl', 'num'].includes(r.cols[i].tipo) ? ' class="r"' : ''}>${esc(fmt(v, r.cols[i].tipo))}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  const cartoesHtml = r => r.rows.map(row => `<div class="fin-rel-cartao"><b>${esc(fmt(row[r.cols[0].tipo === 'data' ? 1 : 0], r.cols[r.cols[0].tipo === 'data' ? 1 : 0].tipo))}</b>${row.map((v, i) => (r.cols[0].tipo === 'data' ? i === 1 : i === 0) || v === '' ? '' : `<div><span>${esc(r.cols[i].t)}</span><span>${esc(fmt(v, r.cols[i].tipo))}</span></div>`).join('')}</div>`).join('')
    + (r.rows.length ? `<div class="fin-rel-cartao total">${r.total.map((v, i) => v === '' || i === 0 ? '' : `<div><span>${esc(r.cols[i].t)}</span><b>${esc(fmt(v, r.cols[i].tipo))}</b></div>`).join('')}</div>` : '');
  const periodoTxt = () => { const [de, ate] = relIntervalo(S.today()); return rel.per === 'tudo' ? 'todo o período' : `${dfmt(de)} a ${dfmt(ate)}`; };

  const telaRelatorios = () => {
    const r = montar(), atual = REL.find(x => x[0] === rel.id), consultores = [...new Set(S.db.pis.map(p => p.consultor_id).filter(Boolean))].map(id => [id, S.usuario(id) || '—']);
    const lado = S.celular ? `<label class="f fin-rel-sel">Relatório<select data-rel="id">${REL.map(([k, n]) => `<option value="${k}"${k === rel.id ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
      : `<nav class="card fin-rel-menu" aria-label="Relatórios">${REL.map(([k, n, dsc]) => `<button class="${k === rel.id ? 'on' : ''}" data-act="finRel" data-id="${k}"><b>${n}</b><span>${dsc}</span></button>`).join('')}</nav>`;
    const filtros = `<div class="fin-rel-filtros"><label class="f">Período<select data-rel="per">${RPER.map(([k, n]) => `<option value="${k}"${k === rel.per ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      ${rel.per === 'datas' ? `<label class="f">De<input type="date" data-rel="de" value="${rel.de}"></label><label class="f">Até<input type="date" data-rel="ate" value="${rel.ate}"></label>` : ''}
      ${['caixa', 'pagar'].includes(rel.id) ? '' : `<label class="f">Consultor<select data-rel="consultor"><option value="">Todos</option>${consultores.map(([id, n]) => `<option value="${id}"${id === rel.consultor ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`}</div>`;
    const corpo = r.rows.length ? (S.celular ? cartoesHtml(r) : `<div class="scroll">${tabelaHtml(r)}</div>`) : '<div class="empty"><b>Nada neste relatório</b>Experimente outro período.</div>';
    return { title:`<span class="sub"><a data-act="finVoltar">← Financeiro</a></span>Relatórios`, actions:'',
      body:`<div class="fin-rel">${lado}<section class="card fin-rel-corpo"><div class="hd"><h3>${atual[1]}</h3><span class="row mid" style="gap:8px"><button class="btn sm" data-act="finCsv"${r.rows.length ? '' : ' disabled'}>${S.svg('baixar')}Planilha</button><button class="btn sm pri" data-act="finPdf"${r.rows.length ? '' : ' disabled'}>${S.svg('baixar')}PDF</button></span></div>
        ${filtros}<p class="muted small">${periodoTxt()}${r.nota ? ' · ' + esc(r.nota) : ''}</p>${corpo}</section></div>` };
  };
  // Planilha: CSV com ; e vírgula decimal, que o Excel em português abre direto
  const csv = r => { const cel = (v, tipo) => { if (v === '' || v === null || v === undefined) return ''; const t = typeof v === 'number' ? (tipo === 'num' ? String(v) : v.toFixed(2).replace('.', ',')) : tipo === 'data' ? dfmt(v) : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return '﻿' + [r.cols.map(c => cel(c.t)).join(';'), ...r.rows.map(row => row.map((v, i) => cel(v, r.cols[i].tipo)).join(';')), r.total.map((v, i) => cel(v, r.cols[i].tipo)).join(';')].join('\r\n'); };
  const arquivo = () => `${REL.find(x => x[0] === rel.id)[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-')}-${S.veh().sigla || 'radio'}-${S.today()}`.toLowerCase();

  Object.assign(S.actions, {
    finAvulso: () => formAvulso(),
    finExcluir: d => { const l = S.db.lancamentos.find(x => x.id === d.id); if (!confirm(`Excluir o lançamento "${l.descricao}" de ${brl(l.valor)}?`)) return;
      S.run(() => S.excluir('lancamentos', l.id), 'Lançamento excluído'); },
    finRelatorios: () => { modo = 'relatorios'; S.render(); window.scrollTo(0, 0); },
    finVoltar: () => { modo = 'lista'; S.render(); },
    finRel: d => { rel.id = d.id; S.render(); },
    finCsv: () => { const r = montar(), b = new Blob([csv(r)], { type:'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = arquivo() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    finPdf: () => { const r = montar(), v = S.veh(), cons = rel.consultor ? ` · consultor ${S.usuario(rel.consultor)}` : '';
      let st = document.getElementById('pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
      st.textContent = '@media print { @page { size:A4 landscape; margin:10mm; } }';
      document.getElementById('print').innerHTML = `<div class="fin-rel-doc"><div class="cab">${v.logo ? `<img src="${v.logo}" alt="">` : ''}<div><h1 style="border-left:6px solid ${v.cor || S.COR_PADRAO};padding-left:8px">${esc(v.nome)} · ${esc(REL.find(x => x[0] === rel.id)[1])}</h1><div>${periodoTxt()}${esc(cons)}${r.nota ? ' · ' + esc(r.nota) : ''}</div></div></div>${tabelaHtml(r)}<p>Gerado pelo SONVI em ${dfmt(S.today())}.</p></div>`;
      setTimeout(() => window.print(), 60); }
  });
  S.changes.push((el, d) => { if (!d.rel) return false; rel[d.rel] = el.value; if (d.rel === 'per' && el.value === 'datas' && !rel.de) { const h = S.today(); rel.de = h.slice(0, 8) + '01'; rel.ate = h; } S.render(); return true; });
  // Ao sair do Financeiro, volta para a lista na próxima visita
  window.addEventListener('hashchange', () => { if (!/financeiro/.test(location.hash)) modo = 'lista'; });
})();

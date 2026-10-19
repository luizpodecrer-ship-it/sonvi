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
    const grafico = `<section class="card"><div class="hd"><h2>Fluxo previsto por mês</h2><span class="fin-leg"><i class="prev"></i>Previsto <i class="rec"></i>Recebido</span></div>
      <div class="fin-bars" role="img" aria-label="A receber previsto e recebido nos últimos e próximos meses">${fluxo.map((x, i) => `<div class="${x.m === hoje.slice(0, 7) ? 'on' : ''}"><b>${k(x.prev)}</b><span><i class="prev" style="height:${x.prev ? Math.max(3, x.prev / maxF * 140) : 0}px;--i:${i}"></i><i class="rec" style="height:${x.rec ? Math.max(3, x.rec / maxF * 140) : 0}px;--i:${i}"></i></span></div>`).join('')}</div>
      <div class="bars-x">${fluxo.map(x => `<span>${MES3[+x.m.slice(5) - 1]}</span>`).join('')}</div></section>`;
    // Idade dos recebíveis em aberto (todos, independente do período)
    const abertos = L.filter(l => l.sentido === 'receber' && !l.pago_em), porFaixa = FAIXAS.map(([id, nome, tom]) => ({ id, nome, tom, v:soma(abertos.filter(l => faixaDe(l, hoje) === id)), n:abertos.filter(l => faixaDe(l, hoje) === id).length }));
    const idade = `<section class="card"><div class="hd"><h2>Situação dos recebíveis</h2><span>tudo em aberto</span></div>
      ${abertos.length ? `<div class="stack" role="img" aria-label="Recebíveis por atraso">${porFaixa.filter(x => x.v).map(x => `<i style="flex:${x.v};background:var(--${x.tom})"></i>`).join('')}</div>` : ''}
      <div class="legend">${porFaixa.map(x => `<a data-act="finFaixa" data-faixa="${x.id}" class="${f.faixa === x.id ? 'on' : ''}"><span class="sq" style="background:var(--${x.tom})"></span><span class="grow">${x.nome}</span><span class="muted small">${x.n}</span><b>${brl(x.v)}</b></a>`).join('')}</div></section>`;

    // Pedidos a faturar
    const aFaturar = S.db.pis.filter(p => ['aprovado', 'programado'].includes(p.status));
    const faturar = aFaturar.length ? `<div class="card"><div class="hd"><h2>Pedidos a faturar</h2><span>${aFaturar.length} aguardando</span></div><div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Status</th><th class="r">Total</th><th class="r">Líquido da rádio</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${aFaturar.map(p => { const c = S.calc(p); return `<tr><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}" style="color:var(--ink)"><b>${esc(p.titulo) || 'Sem título'}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td>${S.pill(p.status)}</td><td class="r">${brl(c.total)}</td><td class="r">${brl(c.net)}</td><td class="r"><button class="btn sm pri" data-act="finFaturar" data-id="${p.id}">Faturar</button></td></tr>`; }).join('')}</tbody></table></div></div>`
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
    finEstornar: async d => { const l = S.db.lancamentos.find(x => x.id === d.id);
      if (!await S.confirmar(`Estornar a baixa de ${l.contraparte} (${brl(recebidoDe(l))})? A parcela volta a ficar em aberto.`, { ok:'Estornar' })) return;
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
  // Cada relatório devolve: resumo (quadros), participação (barras, opcional), colunas, linhas (com grupo e subtítulo),
  // total, explicação e "como ler". A mesma estrutura desenha a tela, o PDF (A4 em pé) e a planilha.
  const rel = { id:'receber', per:'ano', de:'', ate:'', consultor:'' };
  const REL = [
    ['receber', 'Contas a receber', 'Recebimentos', 'Parcelas em aberto, mês a mês, com o que já venceu.'],
    ['recebimentos', 'Recebimentos', 'Recebimentos', 'O que entrou no caixa no período, com juros e descontos.'],
    ['inadimplencia', 'Inadimplência', 'Recebimentos', 'Quem está com parcelas vencidas e há quanto tempo.'],
    ['nf', 'Notas fiscais pendentes', 'Recebimentos', 'Parcelas de PIs faturados que ainda não têm nota fiscal.'],
    ['cliente', 'Faturamento por cliente', 'Vendas', 'Quanto cada cliente comprou, quanto fica com a rádio e quanto já foi recebido.'],
    ['agencia', 'Faturamento por agência', 'Vendas', 'O que veio por cada agência e a comissão de cada uma.'],
    ['consultor', 'Vendas por consultor', 'Vendas', 'O que cada consultor vendeu: base para a comissão da equipe.'],
    ['caixa', 'Previsão de caixa', 'Caixa', 'Entradas e saídas previstas mês a mês e o saldo acumulado.'],
    ['pagar', 'Contas a pagar', 'Caixa', 'Comissões de agência e despesas em aberto, mês a mês.']];
  const RPER = [['mes', 'Este mês'], ['passado', 'Mês passado'], ['trimestre', 'Este trimestre'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['datas', 'Escolher datas…']];
  const relIntervalo = hoje => { const d = dia(hoje), y = d.getFullYear(), m = d.getMonth(), mes = (a, b, n = 1) => [iso(new Date(a, b, 1)), iso(new Date(a, b + n, 0))];
    return { mes:mes(y, m), passado:mes(y, m - 1), trimestre:mes(y, m - m % 3, 3), ano:[`${y}-01-01`, `${y}-12-31`], tudo:['', ''], datas:[rel.de, rel.ate] }[rel.per] || ['', '']; };
  const entre = (d, [de, ate]) => !!d && (!de || d >= de) && (!ate || d <= ate);
  const piDe = id => S.db.pis.find(p => p.id === id);
  const doConsultor = l => !rel.consultor || (piDe(l.pi_id) || {}).consultor_id === rel.consultor;
  const piNoPeriodo = (pi, [de, ate]) => (pi.dados.grids || []).some(g => { const ini = g.period + '-01', fim = iso(new Date(+g.period.slice(0, 4), +g.period.slice(5), 0)); return (!de || fim >= de) && (!ate || ini <= ate); });
  const C = (t, tipo) => ({ t, tipo }); // tipo: 'brl' | 'num' | 'data' | 'sit' | ''
  const agrupa = (ls, chave) => { const m = new Map(); ls.forEach(x => { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };
  const nomeMesLongo = m => m ? `${MESES[+m.slice(5) - 1][0].toUpperCase()}${MESES[+m.slice(5) - 1].slice(1)} ${m.slice(0, 4)}` : 'Sem data';
  const pct = (a, b) => b ? `${(a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits:1 })}%` : '0%';
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
  const K = (rot, val, sub, extra = {}) => Object.assign({ rot, val, sub }, extra);
  const situ = (l, hoje) => l.pago_em ? 'Pago' : atraso(l, hoje) ? `Vencida há ${plural(atraso(l, hoje), 'dia')}` : 'A vencer';
  const partDe = (pares, total) => pares.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nome, v]) => ({ nome, v, p:total ? v / total : 0 }));

  const montar = () => {
    const hoje = S.today(), I = relIntervalo(hoje), L = S.db.lancamentos, nomeMes = m => `${MES3[+m.slice(5) - 1]}/${m.slice(0, 4)}`;
    const recPi = pi => L.filter(l => l.pi_id === pi.id && l.sentido === 'receber');
    const faturados = S.db.pis.filter(p => p.status === 'faturado' && piNoPeriodo(p, I) && (!rel.consultor || p.consultor_id === rel.consultor));
    const porVenc = (a, b) => (a.vencimento || '9').localeCompare(b.vencimento || '9');
    const linhaParc = (l, extra) => ({ grupo:(l.vencimento || '').slice(0, 7), c:[l.vencimento, l.contraparte, `${l.descricao}${l.parcela ? ` · parcela ${l.parcela}` : ''}`, ...extra] });
    switch (rel.id) {
      case 'receber': { const ls = L.filter(l => l.sentido === 'receber' && !l.pago_em && (rel.per === 'tudo' || entre(l.vencimento, I)) && doConsultor(l)).sort(porVenc);
        const venc = ls.filter(l => atraso(l, hoje)), em30 = ls.filter(l => !atraso(l, hoje) && l.vencimento && l.vencimento <= somaDias(hoje, 30));
        return { resumo:[K('Total a receber', brl(soma(ls)), `${plural(ls.length, 'parcela')} · ${plural(new Set(ls.map(l => l.contraparte)).size, 'cliente')}`, { dest:true }),
            K('Vence nos próximos 30 dias', brl(soma(em30)), plural(em30.length, 'parcela')),
            K('Vencido', brl(soma(venc)), venc.length ? `${plural(venc.length, 'parcela')} em atraso` : 'nenhuma parcela em atraso', { tom:venc.length ? 'ruim' : 'bom' })],
          cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('Forma'), C('Situação', 'sit'), C('Valor', 'brl')],
          rows:ls.map(l => linhaParc(l, [l.forma, situ(l, hoje), Number(l.valor)])), grupos:true, total:['Total', '', plural(ls.length, 'parcela'), '', '', soma(ls)],
          ler:['Mostra só parcelas ainda não pagas, pelo vencimento.', '"Vencida há N dias" conta a partir do vencimento até hoje.'] }; }
      case 'pagar': { const ls = L.filter(l => l.sentido === 'pagar' && !l.pago_em && (rel.per === 'tudo' || entre(l.vencimento, I))).sort(porVenc);
        const com = ls.filter(l => l.pi_id), desp = ls.filter(l => !l.pi_id), venc = ls.filter(l => atraso(l, hoje));
        return { resumo:[K('Total a pagar', brl(soma(ls)), plural(ls.length, 'parcela'), { dest:true }), K('Comissões de agência', brl(soma(com)), plural(com.length, 'parcela')), K('Despesas avulsas', brl(soma(desp)), plural(desp.length, 'parcela')), K('Vencido', brl(soma(venc)), venc.length ? plural(venc.length, 'parcela') : 'nada vencido', { tom:venc.length ? 'ruim' : 'bom' })],
          cols:[C('Vencimento', 'data'), C('Para quem'), C('Descrição'), C('Categoria'), C('Situação', 'sit'), C('Valor', 'brl')],
          rows:ls.map(l => linhaParc(l, [l.categoria || (l.pi_id ? 'Comissão' : ''), situ(l, hoje), Number(l.valor)])), grupos:true, total:['Total', '', plural(ls.length, 'parcela'), '', '', soma(ls)],
          ler:['Comissões nascem do faturamento dos PIs; despesas são os lançamentos avulsos a pagar.'] }; }
      case 'recebimentos': { const ls = L.filter(l => l.sentido === 'receber' && l.pago_em && (rel.per === 'tudo' || entre(l.pago_em, I)) && doConsultor(l)).sort((a, b) => a.pago_em.localeCompare(b.pago_em));
        const formas = agrupa(ls, l => l.forma || 'Sem forma').map(([k, xs]) => [k, soma(xs, recebidoDe)]), tot = soma(ls, recebidoDe);
        return { resumo:[K('Total recebido', brl(tot), plural(ls.length, 'recebimento'), { dest:true }), K('Juros e multas', brl(soma(ls, l => Number(l.juros) || 0)), 'cobrados a mais'), K('Descontos concedidos', brl(soma(ls, l => Number(l.desconto) || 0)), 'abatidos na baixa')],
          partTit:'Por forma de pagamento', part:partDe(formas, tot),
          cols:[C('Recebido em', 'data'), C('Cliente'), C('Descrição'), C('Forma'), C('Nota fiscal'), C('Recebido', 'brl')],
          rows:ls.map(l => ({ grupo:l.pago_em.slice(0, 7), c:[l.pago_em, l.contraparte, `${l.descricao}${l.parcela ? ` · parcela ${l.parcela}` : ''}`, l.forma, l.nota_fiscal, recebidoDe(l)] })), grupos:true,
          total:['Total', '', plural(ls.length, 'recebimento'), '', '', tot], ler:['Pela data em que o dinheiro entrou, já com juros e descontos da baixa.'] }; }
      case 'inadimplencia': { const ls = L.filter(l => l.sentido === 'receber' && atraso(l, hoje) && doConsultor(l)), tot = soma(ls);
        const g = agrupa(ls, l => l.contraparte || '—').map(([k, xs]) => { const fx = id => soma(xs.filter(l => faixaDe(l, hoje) === id)); return { c:[k, xs.length, Math.max(...xs.map(l => atraso(l, hoje))), fx('1-30'), fx('31-60'), fx('60+'), soma(xs)] }; }).sort((a, b) => b.c[6] - a.c[6]);
        const venceram = soma(L.filter(l => l.sentido === 'receber' && l.vencimento && l.vencimento < hoje && doConsultor(l)));
        return { resumo:[K('Total vencido', brl(tot), plural(ls.length, 'parcela'), { dest:true, tom:tot ? 'ruim' : '' }), K('Clientes em atraso', String(g.length), g.length ? `maior atraso: ${plural(Math.max(...ls.map(l => atraso(l, hoje))), 'dia')}` : 'ninguém em atraso'), K('Inadimplência', pct(tot, venceram), 'do que já venceu')],
          partTit:'Quem mais deve', part:partDe(g.map(r => [r.c[0], r.c[6]]), tot),
          cols:[C('Cliente'), C('Parcelas', 'num'), C('Maior atraso (dias)', 'num'), C('1 a 30 dias', 'brl'), C('31 a 60 dias', 'brl'), C('Mais de 60', 'brl'), C('Total vencido', 'brl')],
          rows:g, total:['Total', ls.length, '', soma(g, r => r.c[3]), soma(g, r => r.c[4]), soma(g, r => r.c[5]), tot],
          ler:['Considera tudo o que está vencido hoje, de qualquer período.', 'Inadimplência = vencido em aberto ÷ tudo o que já venceu.'] }; }
      case 'cliente': case 'agencia': {
        const porCli = rel.id === 'cliente', chave = porCli ? p => S.nome(p.cliente_id) || '—' : p => p.agencia_id ? S.nome(p.agencia_id) : 'Venda direta';
        const g = agrupa(faturados, chave).map(([k, ps]) => { const cs = ps.map(S.calc), ls = ps.flatMap(recPi), ags = [...new Set(ps.map(p => p.agencia_id).filter(Boolean))];
          const sub = porCli ? (ags.length ? 'via ' + ags.map(S.nome).join(', ') : 'venda direta') : plural(new Set(ps.map(p => p.cliente_id)).size, 'cliente');
          return { sub, c:[k, ps.length, soma(cs, c => c.total), soma(cs, c => c.commission), soma(cs, c => c.net), soma(ls.filter(l => l.pago_em), recebidoDe), soma(ls.filter(l => !l.pago_em))] }; }).sort((a, b) => b.c[2] - a.c[2]);
        const T = i => soma(g, r => r.c[i]);
        return { resumo:[K('Valor dos PIs', brl(T(2)), `${plural(faturados.length, 'PI')} · ${plural(g.length, porCli ? 'cliente' : 'agência', porCli ? 'clientes' : 'agências')}`), K('Comissão de agência', brl(T(3)), `${pct(T(3), T(2))} do valor dos PIs`), K('Líquido da rádio', brl(T(4)), 'o que a rádio recebe', { dest:true }), K('Recebido', brl(T(5)), `${pct(T(5), T(4))} · em aberto ${brl(T(6))}`, { prog:T(4) ? T(5) / T(4) : 0 })],
          partTit:'Participação no valor dos PIs', part:partDe(g.map(r => [r.c[0], r.c[2]]), T(2)),
          cols:[C(porCli ? 'Cliente' : 'Agência'), C('PIs', 'num'), C('Valor dos PIs', 'brl'), C('Comissão', 'brl'), C('Líquido', 'brl'), C('Recebido', 'brl'), C('Em aberto', 'brl')],
          rows:g, total:['Total', faturados.length, T(2), T(3), T(4), T(5), T(6)],
          ler:['Valor dos PIs: o que o cliente paga pela mídia, já com descontos. Entram os PIs faturados com veiculação no período.', 'Comissão: a parte da agência. Líquido: valor dos PIs menos a comissão, o que fica com a rádio.', 'Recebido e Em aberto: parcelas do líquido já pagas e ainda a receber.'] }; }
      case 'consultor': { const ps = S.db.pis.filter(p => ['aprovado', 'programado', 'faturado'].includes(p.status) && piNoPeriodo(p, I) && (!rel.consultor || p.consultor_id === rel.consultor));
        const g = agrupa(ps, p => S.usuario(p.consultor_id) || '—').map(([k, xs]) => { const cs = xs.map(S.calc); return { sub:plural(new Set(xs.map(p => p.cliente_id)).size, 'cliente'), c:[k, xs.length, soma(cs, c => c.ins), soma(cs, c => c.total), soma(cs, c => c.net), xs.filter(p => p.status === 'faturado').length] }; }).sort((a, b) => b.c[3] - a.c[3]);
        const T = i => soma(g, r => r.c[i]);
        return { resumo:[K('Valor vendido', brl(T(3)), plural(ps.length, 'PI'), { dest:true }), K('Líquido da rádio', brl(T(4)), 'depois da comissão de agência'), K('Inserções', T(2).toLocaleString('pt-BR'), 'vendidas no período'), K('Já faturados', String(T(5)), `de ${plural(ps.length, 'PI')}`)],
          partTit:'Participação nas vendas', part:partDe(g.map(r => [r.c[0], r.c[3]]), T(3)),
          cols:[C('Consultor'), C('PIs', 'num'), C('Inserções', 'num'), C('Valor vendido', 'brl'), C('Líquido da rádio', 'brl'), C('Já faturados', 'num')],
          rows:g, total:['Total', ps.length, T(2), T(3), T(4), T(5)], ler:['PIs aprovados, programados ou faturados com veiculação no período.'] }; }
      case 'caixa': { const [de, ate] = I, ini = de || hoje.slice(0, 8) + '01', fim = ate || somaMeses(hoje, 6), ms = []; for (let m = ini.slice(0, 7); m <= fim.slice(0, 7) && ms.length < 36; m = somaMeses(m + '-01', 1).slice(0, 7)) ms.push(m);
        let acum = 0; const rows = ms.map(m => { const doMes = L.filter(l => (l.vencimento || '').startsWith(m)), e = soma(doMes.filter(l => l.sentido === 'receber')), sd = soma(doMes.filter(l => l.sentido === 'pagar')), rcb = soma(doMes.filter(l => l.sentido === 'receber' && l.pago_em), recebidoDe); acum += e - sd; return { c:[nomeMes(m), e, rcb, sd, e - sd, acum] }; });
        const T = i => soma(rows, r => r.c[i]);
        return { resumo:[K('Entradas previstas', brl(T(1)), `já recebido ${brl(T(2))}`), K('Saídas previstas', brl(T(3)), 'comissões e despesas'), K('Saldo do período', brl(T(4)), plural(ms.length, 'mês', 'meses'), { dest:true, tom:T(4) < 0 ? 'ruim' : '' })],
          cols:[C('Mês'), C('Entradas', 'brl'), C('Já recebido', 'brl'), C('Saídas', 'brl'), C('Saldo do mês', 'brl'), C('Saldo acumulado', 'brl')],
          rows, total:['Total', T(1), T(2), T(3), T(4), ''], ler:['Pelo vencimento das parcelas, pagas ou não.', 'Saldo acumulado: soma dos saldos desde o primeiro mês da tabela.'] }; }
      case 'nf': { const ls = L.filter(l => l.sentido === 'receber' && l.pi_id && !l.nota_fiscal && (rel.per === 'tudo' || entre(l.vencimento, I)) && doConsultor(l)).sort(porVenc);
        const pagas = ls.filter(l => l.pago_em);
        return { resumo:[K('Parcelas sem nota', String(ls.length), plural(new Set(ls.map(l => l.contraparte)).size, 'cliente'), { dest:true }), K('Valor sem nota', brl(soma(ls)), 'a emitir'), K('Já pagas sem nota', String(pagas.length), brl(soma(pagas)), { tom:pagas.length ? 'ruim' : '' })],
          cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('Forma'), C('Situação', 'sit'), C('Valor', 'brl')],
          rows:ls.map(l => linhaParc(l, [l.forma, situ(l, hoje), Number(l.valor)])), grupos:true, total:['Total', '', plural(ls.length, 'parcela'), '', '', soma(ls)],
          ler:['Para informar a nota: Financeiro › três pontinhos da parcela › Informar nota fiscal.'] }; }
    }
  };
  const fmt = (v, tipo) => v === '' || v === null || v === undefined ? '' : tipo === 'brl' ? (typeof v === 'number' ? (Math.abs(v) < 0.005 ? '—' : brl(v)) : v) : tipo === 'data' ? dfmt(v) : tipo === 'num' && typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v);
  const cel = (v, col) => col.tipo === 'sit' && v ? `<span class="rr-sit ${/^Venc/.test(v) ? 'ruim' : v === 'Pago' ? 'bom' : ''}">${esc(v)}</span>` : esc(fmt(v, col.tipo));
  const num2 = c => ['brl', 'num'].includes(c.tipo) ? ' class="r"' : '';
  const resumoHtml = r => `<div class="rr-res" style="--n:${r.resumo.length}">${r.resumo.map(k => `<div class="rr-k${k.dest ? ' dest' : ''}${k.tom ? ' ' + k.tom : ''}"><small>${esc(k.rot)}</small><b>${esc(k.val)}</b>${k.prog !== undefined ? `<i class="rr-prog"><i style="width:${Math.round(Math.min(1, k.prog) * 100)}%"></i></i>` : ''}<span>${esc(k.sub || '')}</span></div>`).join('')}</div>`;
  const partHtml = r => r.part && r.part.length > 1 ? `<div class="rr-part"><b class="rr-tit">${esc(r.partTit)}</b>${r.part.map((x, i) => `<div><span class="rr-nome">${esc(x.nome)}</span><span class="rr-barra"><i class="${i ? '' : 'pri'}" style="width:${Math.max(1, x.p * 100).toFixed(1)}%"></i></span><b>${pct(x.p, 1)}</b><span class="rr-val">${brl(x.v)}</span></div>`).join('')}</div>` : '';
  const tabelaHtml = r => {
    const linha = row => `<tr>${row.c.map((v, i) => `<td${num2(r.cols[i])}>${i === 0 && row.sub ? `<b>${esc(fmt(v, r.cols[i].tipo))}</b><small>${esc(row.sub)}</small>` : cel(v, r.cols[i])}</td>`).join('')}</tr>`;
    let corpo = '';
    if (r.grupos) agrupa(r.rows, x => x.grupo).forEach(([g, xs]) => { const iv = r.cols.findIndex(c => c.tipo === 'brl');
      corpo += `<tr class="rr-grp"><td colspan="${r.cols.length}">${nomeMesLongo(g)}</td></tr>${xs.map(linha).join('')}<tr class="rr-sub"><td colspan="${iv}">Subtotal · ${plural(xs.length, rel.id === 'recebimentos' ? 'recebimento' : 'parcela')}</td><td class="r">${brl(soma(xs, x => x.c[iv]))}</td>${r.cols.slice(iv + 1).map(() => '<td></td>').join('')}</tr>`; });
    else corpo = r.rows.map(linha).join('');
    return `<table class="rr-tab"><thead><tr>${r.cols.map(c => `<th${num2(c)}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody>
      ${r.rows.length ? `<tfoot><tr>${r.total.map((v, i) => `<td${num2(r.cols[i])}>${esc(fmt(v, r.cols[i].tipo))}</td>`).join('')}</tr></tfoot>` : ''}</table>`; };
  const cartoesHtml = r => {
    const cartao = row => `<div class="fin-rel-cartao"><b>${esc(fmt(row.c[r.cols[0].tipo === 'data' ? 1 : 0], ''))}</b>${row.sub ? `<small class="muted">${esc(row.sub)}</small>` : ''}${row.c.map((v, i) => (r.cols[0].tipo === 'data' ? i === 1 : i === 0) || v === '' ? '' : `<div><span>${esc(r.cols[i].t)}</span><span>${cel(v, r.cols[i])}</span></div>`).join('')}</div>`;
    const corpo = r.grupos ? agrupa(r.rows, x => x.grupo).map(([g, xs]) => `<div class="fin-mes"><b>${nomeMesLongo(g)}</b><span>${brl(soma(xs, x => x.c[r.cols.findIndex(c => c.tipo === 'brl')]))}</span></div>${xs.map(cartao).join('')}`).join('') : r.rows.map(cartao).join('');
    return corpo + (r.rows.length ? `<div class="fin-rel-cartao total">${r.total.map((v, i) => v === '' || i === 0 ? '' : `<div><span>${esc(r.cols[i].t)}</span><b>${esc(fmt(v, r.cols[i].tipo))}</b></div>`).join('')}</div>` : ''); };
  const lerHtml = r => r.ler && r.ler.length ? `<div class="rr-ler"><b>Como ler este relatório</b>${r.ler.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  const periodoTxt = () => { const [de, ate] = relIntervalo(S.today()); return rel.id === 'inadimplencia' ? `posição em ${dfmt(S.today())}` : rel.per === 'tudo' ? 'todo o período' : `${dfmt(de)} a ${dfmt(ate)}`; };
  const filtrosTxt = () => `Período: ${periodoTxt()} · ${rel.consultor ? 'consultor ' + S.usuario(rel.consultor) : 'todos os consultores'}`;

  const telaRelatorios = () => {
    const r = montar(), atual = REL.find(x => x[0] === rel.id), consultores = [...new Set(S.db.pis.map(p => p.consultor_id).filter(Boolean))].map(id => [id, S.usuario(id) || '—']);
    const grupos = [...new Set(REL.map(x => x[2]))];
    const lado = S.celular ? `<label class="f fin-rel-sel">Relatório<select data-rel="id">${grupos.map(g => `<optgroup label="${g}">${REL.filter(x => x[2] === g).map(([k, n]) => `<option value="${k}"${k === rel.id ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select></label>`
      : `<nav class="card fin-rel-menu" aria-label="Relatórios">${grupos.map(g => `<span class="fin-rel-grupo">${g}</span>${REL.filter(x => x[2] === g).map(([k, n]) => `<button class="${k === rel.id ? 'on' : ''}" data-act="finRel" data-id="${k}">${n}</button>`).join('')}`).join('')}</nav>`;
    const filtros = `<div class="fin-rel-filtros">${rel.id === 'inadimplencia' ? '' : `<label class="fin-rel-f"><span>Período</span><select data-rel="per">${RPER.map(([k, n]) => `<option value="${k}"${k === rel.per ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`}
      ${rel.per === 'datas' && rel.id !== 'inadimplencia' ? `<label class="fin-rel-f"><span>De</span><input type="date" data-rel="de" value="${rel.de}"></label><label class="fin-rel-f"><span>Até</span><input type="date" data-rel="ate" value="${rel.ate}"></label>` : ''}
      ${['caixa', 'pagar'].includes(rel.id) ? '' : `<label class="fin-rel-f"><span>Consultor</span><select data-rel="consultor"><option value="">Todos</option>${consultores.map(([id, n]) => `<option value="${id}"${id === rel.consultor ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`}
      <span class="muted small">${periodoTxt()}</span></div>`;
    const corpo = r.rows.length ? (S.celular ? cartoesHtml(r) : `<div class="scroll">${tabelaHtml(r)}</div>`) : '<div class="empty"><b>Nada neste relatório</b>Experimente outro período.</div>';
    return { title:`<span class="sub"><a data-act="finVoltar">← Financeiro</a></span>Relatórios`, actions:'',
      body:`<div class="fin-rel">${lado}<section class="card fin-rel-corpo">
        <div class="fin-rel-topo"><div class="grow"><h2>${atual[1]}</h2><p class="muted">${atual[3]}</p></div><button class="btn sm" data-act="finCsv"${r.rows.length ? '' : ' disabled'}>${S.svg('baixar')}Planilha</button><button class="btn sm pri" data-act="finPdf"${r.rows.length ? '' : ' disabled'}>${S.svg('baixar')}Baixar PDF</button></div>
        ${filtros}${r.rows.length ? resumoHtml(r) + partHtml(r) : ''}${corpo}${r.rows.length ? lerHtml(r) : ''}</section></div>` };
  };
  // Planilha: CSV com ; e vírgula decimal, que o Excel em português abre direto
  const csv = r => { const c1 = (v, tipo) => { if (v === '' || v === null || v === undefined) return ''; const t = typeof v === 'number' ? (tipo === 'num' ? String(v) : v.toFixed(2).replace('.', ',')) : tipo === 'data' ? dfmt(v) : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return '﻿' + [r.cols.map(c => c1(c.t)).join(';'), ...r.rows.map(row => row.c.map((v, i) => c1(v, r.cols[i].tipo)).join(';')), r.total.map((v, i) => c1(v, r.cols[i].tipo)).join(';')].join('\r\n'); };
  const arquivo = () => `${REL.find(x => x[0] === rel.id)[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-')}-${S.veh().sigla || 'radio'}-${S.today()}`.toLowerCase();
  const pdfHtml = r => { const v = S.veh(), cor = v.cor || S.COR_PADRAO, agora = new Date(), hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    return `<div class="rdoc" style="--rcor:${cor}"><header class="rd-cab">${v.logo ? `<img src="${v.logo}" alt="">` : `<span class="rd-selo" style="background:${cor}">${esc(v.sigla || '')}</span>`}
        <div class="rd-radio"><b>${esc(v.nome)}</b>${[v.razao_social && v.cnpj ? `${v.razao_social} · CNPJ ${v.cnpj}` : v.razao_social || (v.cnpj && 'CNPJ ' + v.cnpj), v.cidade].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="rd-tit"><small>RELATÓRIO FINANCEIRO</small><b>${esc(REL.find(x => x[0] === rel.id)[1])}</b><span>${rel.id === 'inadimplencia' ? 'Posição em' : 'Período:'} <b>${rel.id === 'inadimplencia' ? dfmt(S.today()) : periodoTxt()}</b></span></div></header>
      ${resumoHtml(r)}${partHtml(r)}${tabelaHtml(r)}<p class="rd-nota">Valores em reais. "—" = sem valor.</p>${lerHtml(r)}
      <footer class="rd-rod"><span>${esc(filtrosTxt())}</span><span>Gerado pelo SONVI em ${dfmt(S.today())} às ${hora}${S.me && S.me.nome ? ' por ' + esc(S.me.nome) : ''}</span></footer></div>`; };

  Object.assign(S.actions, {
    finAvulso: () => formAvulso(),
    finExcluir: async d => { const l = S.db.lancamentos.find(x => x.id === d.id); if (!await S.confirmar(`Excluir o lançamento "${l.descricao}" de ${brl(l.valor)}?`, { ok:'Excluir', perigo:true })) return;
      S.run(() => S.excluir('lancamentos', l.id), 'Lançamento excluído'); },
    finRelatorios: () => { modo = 'relatorios'; S.render(); window.scrollTo(0, 0); },
    finVoltar: () => { modo = 'lista'; S.render(); },
    finRel: d => { rel.id = d.id; S.render(); },
    finCsv: () => { const r = montar(), b = new Blob([csv(r)], { type:'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = arquivo() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    finPdf: () => { const r = montar();
      let st = document.getElementById('pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
      st.textContent = '@media print { @page { size:A4 portrait; margin:12mm; } }';
      document.getElementById('print').innerHTML = pdfHtml(r);
      const t = document.title; document.title = arquivo(); setTimeout(() => { window.print(); document.title = t; }, 80); }
  });
  S.changes.push((el, d) => { if (!d.rel) return false; rel[d.rel] = el.value; if (d.rel === 'per' && el.value === 'datas' && !rel.de) { const h = S.today(); rel.de = h.slice(0, 8) + '01'; rel.ate = h; } S.render(); return true; });
  // Ao sair do Financeiro, volta para a lista na próxima visita
  window.addEventListener('hashchange', () => { if (!/financeiro/.test(location.hash)) modo = 'lista'; });
})();

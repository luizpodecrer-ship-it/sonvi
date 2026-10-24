// SONVI · Dashboard geral (aprovado em 24/10/2026): a tela de entrada do diretor, com todos os veículos do grupo.
// Três indicadores somando todos os veículos (vendido, PIs fechados e a receber, com a variação e os últimos 6 meses)
// e a lista de veículos; clicar numa linha abre o Dashboard daquele veículo.
// Os números vêm de uma consulta só para todos os veículos (só as colunas necessárias) e ficam na memória por 2 minutos.
(() => {
  const { esc, brl } = S;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];   // PI que saiu do comercial conta como venda
  const TTL = 120000;
  const f = { per:'mes', q:'', cat:'' };
  let cache = null, buscando = false;
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // ---------- regras puras ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mes = (y, m) => [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  // Período escolhido e o anterior, para a variação
  const intervalo = (per, hoje = new Date()) => {
    const y = hoje.getFullYear(), m = hoje.getMonth();
    if (per === 'passado') { const [de, ate] = mes(y, m - 1), [ade, aate] = mes(y, m - 2); return { de, ate, ade, aate, rot:'vs. o mês anterior' }; }
    if (per === 'ano') { const a = new Date(y - 1, m, hoje.getDate()); return { de:`${y}-01-01`, ate:iso(hoje), ade:`${y - 1}-01-01`, aate:iso(a), rot:'vs. o mesmo período de ' + (y - 1) }; }
    const [de, ate] = mes(y, m), [ade, aate] = mes(y, m - 1); return { de, ate, ade, aate, rot:'vs. o mês passado' };
  };
  const entre = (d, de, ate) => !!d && d >= de && d <= ate;
  const soma = (xs, k) => xs.reduce((s, x) => s + Number(x[k] || 0), 0);
  // Últimos 6 meses (ou os próximos 6, para o que vai vencer)
  const meses = (n0, hoje = new Date()) => Array.from({ length:6 }, (_, i) => iso(new Date(hoje.getFullYear(), hoje.getMonth() + n0 + i, 1)).slice(0, 7));
  const variacao = (agora, antes) => antes ? Math.round((agora - antes) / antes * 100) : null;
  S.geralCalc = (dados, veiculos, per, hoje = new Date()) => {
    const I = intervalo(per, hoje), dHoje = iso(hoje), dia = p => S.dia(p.criado_em);
    const pis = dados.pis.filter(p => VENDIDO.includes(p.status)), lanc = dados.lanc;
    const doPer = pis.filter(p => entre(dia(p), I.de, I.ate)), doAnt = pis.filter(p => entre(dia(p), I.ade, I.aate));
    const ult = meses(-5, hoje), prox = meses(0, hoje);
    const vencido = lanc.filter(l => l.vencimento && l.vencimento < dHoje);
    const total = soma(doPer, 'valor_total');
    const linhas = veiculos.map(v => {
      const vp = doPer.filter(p => p.veiculo_id === v.id), vl = lanc.filter(l => l.veiculo_id === v.id), vv = vl.filter(l => l.vencimento && l.vencimento < dHoje);
      return { v, vendido:soma(vp, 'valor_total'), pis:vp.length, opec:pis.filter(p => p.veiculo_id === v.id && p.status === 'opec').length,
        receber:soma(vl, 'valor'), vencido:soma(vv, 'valor'), parcVenc:vv.length };
    });
    return { I, total, linhas,
      vendido:{ v:total, var:variacao(total, soma(doAnt, 'valor_total')), serie:ult.map(m => soma(pis.filter(p => dia(p).startsWith(m)), 'valor_total')), meses:ult },
      fechados:{ v:doPer.length, var:variacao(doPer.length, doAnt.length), serie:ult.map(m => pis.filter(p => dia(p).startsWith(m)).length), meses:ult },
      receber:{ v:soma(lanc, 'valor'), vencido:soma(vencido, 'valor'), parcelas:lanc.length, serie:prox.map(m => soma(lanc.filter(l => (l.vencimento || '').startsWith(m)), 'valor')), meses:prox } };
  };

  // ---------- dados de todos os veículos ----------
  S.carregarGeral = async forcar => {
    if (buscando || (!forcar && cache && Date.now() - cache.em < TTL)) return;
    buscando = true;
    try {
      const desde = `${new Date().getFullYear() - 1}-01-01`;
      const [pis, lanc] = await Promise.all([
        S.q(S.sb.from('pis').select('id, veiculo_id, status, consultor_id, valor_total, criado_em').in('status', VENDIDO).gte('criado_em', desde)),
        S.q(S.sb.from('lancamentos').select('id, veiculo_id, valor, vencimento').eq('sentido', 'receber').is('pago_em', null))]);
      cache = { em:Date.now(), pis, lanc };
    } catch (e) { console.error(e); S.toast(S.erro(e)); if (!cache) cache = { em:Date.now(), pis:[], lanc:[] }; }
    buscando = false;
    if (!S.carregando && (S.ui.view === 'geral' || S.route().view === 'geral')) S.render();
  };
  S.geralUsar = dados => { cache = Object.assign({ em:Date.now() }, dados); };   // testes: números em memória
  S.geralLimpar = () => { cache = null; };                                       // ao sair ou trocar de conta

  // ---------- desenho ----------
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const curto = v => Math.abs(v) >= 100000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mil' : brl(v).replace(/,00$/, '');
  // Gráfico pequeno de área (desenhado em SVG, sem biblioteca)
  const spark = (serie, rotulo) => {
    const W = 132, H = 44, max = Math.max(...serie, 0), n = serie.length;
    const pts = serie.map((v, i) => [i * (W / (n - 1)), H - 4 - (max ? v / max * (H - 10) : 0)]);
    const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return `<svg class="gk-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(rotulo)}"><path class="area" d="${linha} L${W} ${H} L0 ${H} Z"/><path class="linha" d="${linha}"/><circle cx="${pts[n - 1][0].toFixed(1)}" cy="${pts[n - 1][1].toFixed(1)}" r="3"/></svg>`;
  };
  const seta = p => p === null ? `<span class="gk-var neutro">sem base para comparar</span>`
    : `<span class="gk-var ${p > 0 ? 'bom' : p < 0 ? 'ruim' : 'neutro'}">${p ? `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="${p > 0 ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'}"/></svg>` : ''}${p > 0 ? '+' : ''}${p}%<span class="sr"> ${p > 0 ? 'de alta' : p < 0 ? 'de queda' : ''}</span></span>`;
  const serieTxt = (meses_, serie, fmt) => meses_.map((m, i) => `${MES3[+m.slice(5) - 1]} ${fmt(serie[i])}`).join(', ');
  const kpi = (ic, titulo, valor, rodape, sp) => `<section class="card gk"><div class="gk-top"><span class="gk-ic" aria-hidden="true">${S.svg(ic)}</span><h2>${titulo}</h2></div>
    <div class="gk-meio"><div class="gk-num"><b class="gk-val">${valor}</b>${rodape}</div>${sp}</div></section>`;

  const pills = l => [l.opec ? S.tag(`${l.opec} na OPEC`, 'blue') : '', l.vencido ? S.tag('Pagamento atrasado', 'orange') : '',
    !l.opec && !l.vencido ? (l.vendido || l.receber ? S.tag('Em dia', 'green') : S.tag('Sem vendas', 'gray')) : ''].join('');
  const consultores = v => {
    const us = [...new Set(S.db.vinculos.filter(x => x.veiculo_id === v.id && x.perfil === 'consultor').map(x => x.usuario_id))]
      .map(id => S.db.usuarios.find(u => u.id === id)).filter(u => u && u.ativo !== false);
    if (!us.length) return '<span class="muted small">—</span>';
    const nomes = us.map(u => u.nome || u.email).join(', ');
    return `<span class="gv-avs" title="${esc(nomes)}"><span class="sr">Consultores: ${esc(nomes)}</span>${us.slice(0, 4).map(u => `<span aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span>`).join('')}${us.length > 4 ? `<span class="mais" aria-hidden="true">+${us.length - 4}</span>` : ''}</span>`;
  };
  const tipo = v => [S.temCategoria(v, 'radio') ? v.frequencia : '', v.cidade].filter(Boolean).map(esc).join(' · ') || esc(S.nomeCategoria(S.categoria(v)));
  const catPills = v => S.categorias(v).map(k => `<span class="pill" style="--tone:var(--gray)">${esc(S.nomeCategoria(k))}</span>`).join('');
  const barra = (v, tot) => `<span class="gv-barra" aria-hidden="true"><i style="width:${tot ? Math.max(v ? 2 : 0, v / tot * 100) : 0}%"></i></span>`;
  const pctTxt = (v, tot) => tot ? `${Math.round(v / tot * 100)}% do grupo` : '';

  S.views.geral = () => {
    const nome = String(S.me.nome || S.me.email || '').trim().split(/[\s@]+/)[0];
    const per = `<div class="seg" role="group" aria-label="Período">${[['mes', 'Este mês'], ['passado', 'Mês passado'], ['ano', 'Este ano']].map(([k, n]) => `<button class="${f.per === k ? 'on' : ''}" data-act="geralPer" data-v="${k}"${f.per === k ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${n}</button>`).join('')}</div>`;
    const topo = { title:`${saudacao()}, ${esc(nome)}`, actions:per };
    const intro = '<p class="geral-intro">Acompanhe as vendas, a OPEC e o financeiro de todos os veículos.</p>';
    if (!cache || Date.now() - cache.em > TTL) S.carregarGeral();
    if (!cache) return Object.assign(topo, { body:`${intro}<div class="card empty"><b>Buscando os números</b>Somando as vendas e o financeiro de todos os veículos…</div>` });

    const veiculos = S.db.veiculos, c = S.geralCalc(cache, veiculos, f.per);
    const k1 = kpi('financeiro', 'Vendido', curto(c.vendido.v), `<div class="gk-rod">${seta(c.vendido.var)}<small>${esc(c.I.rot)}</small></div>`, spark(c.vendido.serie, `Vendido nos últimos 6 meses: ${serieTxt(c.vendido.meses, c.vendido.serie, curto)}`));
    const k2 = kpi('pis', 'PIs fechados', c.fechados.v.toLocaleString('pt-BR'), `<div class="gk-rod">${seta(c.fechados.var)}<small>${esc(c.I.rot)}</small></div>`, spark(c.fechados.serie, `PIs fechados nos últimos 6 meses: ${serieTxt(c.fechados.meses, c.fechados.serie, n => n)}`));
    const k3 = kpi('relatorio', 'A receber', curto(c.receber.v), `<div class="gk-rod">${c.receber.vencido ? `<span class="gk-var ruim">${curto(c.receber.vencido)} vencido</span>` : `<span class="gk-var bom">nada vencido</span>`}<small>${c.receber.parcelas} parcela${c.receber.parcelas === 1 ? '' : 's'} em aberto</small></div>`, spark(c.receber.serie, `A receber nos próximos 6 meses: ${serieTxt(c.receber.meses, c.receber.serie, curto)}`));

    const q = f.q.trim().toLowerCase();
    // Abas por categoria: só as que têm veículo cadastrado (e só quando há mais de uma)
    const cats = S.CATEGORIAS.map(([k, n]) => ({ k, n, qt:veiculos.filter(v => S.temCategoria(v, k)).length })).filter(x => x.qt);
    if (f.cat && !cats.some(x => x.k === f.cat)) f.cat = '';
    const abasCat = cats.length > 1 ? `<div class="seg gv-cats" role="group" aria-label="Categoria">${[{ k:'', n:'Todos', qt:veiculos.length }, ...cats].map(x => `<button class="${f.cat === x.k ? 'on' : ''}" data-act="geralCat" data-v="${x.k}" aria-pressed="${f.cat === x.k}">${esc(x.n)} <span class="muted">${x.qt}</span></button>`).join('')}</div>` : '';
    const linhas = c.linhas.filter(l => (!f.cat || S.temCategoria(l.v, f.cat)) && (!q || [l.v.nome, l.v.sigla, l.v.cidade, l.v.frequencia, ...S.categorias(l.v).map(S.nomeCategoria)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => b.vendido - a.vendido || a.v.nome.localeCompare(b.v.nome));
    const abrir = l => `data-act="geralAbrir" data-id="${l.v.id}" aria-label="Abrir o Dashboard da ${esc(l.v.nome)}"`;
    const receberTxt = l => `<b>${brl(l.receber)}</b>${l.vencido ? `<small class="fin-laranja">${brl(l.vencido)} vencido</small>` : `<small class="muted">${l.receber ? 'nada vencido' : 'nada em aberto'}</small>`}`;
    const vendidoTxt = l => `<b>${brl(l.vendido)}</b>${barra(l.vendido, c.total)}<small class="muted">${l.pis} PI${l.pis === 1 ? '' : 's'}${c.total ? ' · ' + pctTxt(l.vendido, c.total) : ''}</small>`;
    const veic = l => `<span class="gv-v">${S.vav(l.v)}<span class="gv-tx"><b>${esc(l.v.nome)}</b><small>${tipo(l.v)}</small></span></span>`;
    let corpo;
    if (!veiculos.length) corpo = '<div class="empty"><b>Nenhum veículo cadastrado</b>Cadastre os veículos em Administração.</div>';
    else if (!linhas.length) corpo = '<div class="empty"><b>Nenhum veículo encontrado</b>Nada com esse filtro. Experimente outra busca ou categoria.</div>';
    else if (S.celular) corpo = `<div class="gv-cartoes">${linhas.map(l => `<div class="gv-cartao" ${abrir(l)}>
        <div class="gv-c-topo">${veic(l)}<span class="gv-seta" aria-hidden="true">${S.svg('seta')}</span></div>
        <div class="gv-pills">${catPills(l.v)}${pills(l)}</div>
        <div class="gv-c-num"><div><small class="muted">Vendido no período</small>${vendidoTxt(l)}</div><div><small class="muted">A receber</small>${receberTxt(l)}</div></div>
        <div class="gv-c-rod"><small class="muted">Consultores</small>${consultores(l.v)}</div></div>`).join('')}</div>`;
    else corpo = `<div class="gv-tab"><div class="gv-cab"><span>Veículo</span><span>Categoria</span><span>Vendido no período</span><span>Situação</span><span>Consultores</span><span>A receber</span><span><span class="sr">Abrir</span></span></div>
      ${linhas.map(l => `<div class="gv-lin" ${abrir(l)}>${veic(l)}<span class="gv-catc">${catPills(l.v)}</span><span class="gv-num">${vendidoTxt(l)}</span><span class="gv-pills">${pills(l)}</span>${consultores(l.v)}<span class="gv-num">${receberTxt(l)}</span><span class="gv-seta" aria-hidden="true">${S.svg('seta')}</span></div>`).join('')}</div>`;
    const lista = `<section class="card gv"><div class="hd gv-hd"><h2>Veículos</h2><span class="muted small gv-at">atualizado às ${S.hora(cache.em)} · <a data-act="geralAtualizar">Atualizar</a></span>
        <label class="fin-busca gv-busca">${S.svg('busca')}<input data-geral="q" value="${esc(f.q)}" placeholder="Buscar veículo" aria-label="Buscar veículo"></label></div>${abasCat}${corpo}</section>`;
    return Object.assign(topo, { body:`${intro}<div class="gk-grade">${k1}${k2}${k3}</div>${lista}` });
  };

  Object.assign(S.actions, {
    geralPer: d => { f.per = d.v; S.render(); },
    geralCat: d => { f.cat = d.v; S.render(); },
    geralAtualizar: () => { S.carregarGeral(true).then(() => S.toast('Números atualizados')); },
    geralAbrir: d => S.abrirVeiculo(d.id)
  });
  let tBusca;
  document.addEventListener('input', e => { if (!e.target.dataset || e.target.dataset.geral !== 'q') return;
    f.q = e.target.value; clearTimeout(tBusca);
    tBusca = setTimeout(() => { const pos = e.target.selectionStart; S.render(); const el = document.querySelector('[data-geral="q"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 200); });
})();

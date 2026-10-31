// SONVI · Dashboard Gestão (aprovado em 24/10/2026): a tela de entrada do diretor, com todos os veículos do grupo.
// Painel com filtro cruzado (cruzado.js, 24/10/2026): vendido, PIs fechados, ticket médio e a receber; barras por veículo,
// linha por dia (ou mês) e anel por consultor, que se filtram entre si; e a lista de veículos, que segue os filtros; clicar numa linha abre o Dashboard daquele veículo.
// Os números vêm de uma consulta só para todos os veículos (só as colunas necessárias) e ficam na memória por 2 minutos.
(() => {
  const { esc, brl } = S;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];   // PI que saiu do comercial conta como venda
  const TTL = 120000;
  const f = { per:'mes', q:'', cat:'' };
  let cache = null, buscando = false;
  let painel = null;   // { chave, el, cubo, f, corpo }: o painel fica montado entre um desenho e outro da tela
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // ---------- regras puras ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mes = (y, m) => [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  // Período escolhido e o anterior, para a variação
  const intervalo = (per, hoje = new Date()) => {
    const y = hoje.getFullYear(), m = hoje.getMonth();
    if (per === 'passado') { const [de, ate] = mes(y, m - 1), [ade, aate] = mes(y, m - 2); return { de, ate, ade, aate, rot:'vs. o mês anterior' }; }
    if (per === 'ano') return { de:`${y}-01-01`, ate:`${y}-12-31`, ade:`${y - 1}-01-01`, aate:`${y - 1}-12-31`, rot:'vs. ' + (y - 1) };   // o ano todo, pelo mês de veiculação
    const [de, ate] = mes(y, m), [ade, aate] = mes(y, m - 1); return { de, ate, ade, aate, rot:'vs. o mês passado' };
  };
  const entre = (d, de, ate) => !!d && d >= de && d <= ate;
  const soma = (xs, k) => xs.reduce((s, x) => s + Number(x[k] || 0), 0);
  // Últimos 6 meses (ou os próximos 6, para o que vai vencer)
  const meses = (n0, hoje = new Date()) => Array.from({ length:6 }, (_, i) => iso(new Date(hoje.getFullYear(), hoje.getMonth() + n0 + i, 1)).slice(0, 7));
  const variacao = (agora, antes) => antes ? Math.round((agora - antes) / antes * 100) : null;
  // Venda do período = a parte de cada PI que vai ao ar nos meses do período (mês de veiculação, 29/10/2026)
  const mesesEntre = (de, ate) => { const r = []; let m = de.slice(0, 7); while (m <= ate.slice(0, 7)) { r.push(m); const [y, n] = m.split('-').map(Number); m = iso(new Date(y, n, 1)).slice(0, 7); } return r; };
  const noPer = (p, de, ate) => mesesEntre(de, ate).reduce((t, m) => t + Number(p.valor_total || 0) * S.fatiaMes(p, m), 0);
  S.geralCalc = (dados, veiculos, per, hoje = new Date()) => {
    const I = intervalo(per, hoje), dHoje = iso(hoje);
    const pis = dados.pis.filter(p => VENDIDO.includes(p.status)), lanc = dados.lanc;
    const doPer = pis.map(p => ({ p, v:noPer(p, I.de, I.ate) })).filter(x => x.v > 0), doAnt = pis.map(p => ({ p, v:noPer(p, I.ade, I.aate) })).filter(x => x.v > 0);
    const somaV = l => l.reduce((t, x) => t + x.v, 0), doMesV = m => pis.reduce((t, p) => t + Number(p.valor_total || 0) * S.fatiaMes(p, m), 0);
    const ult = meses(-5, hoje), prox = meses(0, hoje);
    const vencido = lanc.filter(l => l.vencimento && l.vencimento < dHoje);
    const total = somaV(doPer);
    const linhas = veiculos.map(v => {
      const vp = doPer.filter(x => x.p.veiculo_id === v.id), vl = lanc.filter(l => l.veiculo_id === v.id), vv = vl.filter(l => l.vencimento && l.vencimento < dHoje);
      return { v, vendido:somaV(vp), pis:vp.length, opec:pis.filter(p => p.veiculo_id === v.id && p.status === 'opec').length,
        receber:soma(vl, 'valor'), vencido:soma(vv, 'valor'), parcVenc:vv.length };
    });
    return { I, total, linhas,
      vendido:{ v:total, var:variacao(total, somaV(doAnt)), serie:ult.map(doMesV), meses:ult },
      fechados:{ v:doPer.length, var:variacao(doPer.length, doAnt.length), serie:ult.map(m => pis.filter(p => S.fatiaMes(p, m) > 0).length), meses:ult },
      receber:{ v:soma(lanc, 'valor'), vencido:soma(vencido, 'valor'), parcelas:lanc.length, serie:prox.map(m => soma(lanc.filter(l => (l.vencimento || '').startsWith(m)), 'valor')), meses:prox } };
  };

  // ---------- dados de todos os veículos ----------
  S.carregarGeral = async forcar => {
    if (buscando || (!forcar && cache && Date.now() - cache.em < TTL)) return;
    buscando = true;
    try {
      const desde = `${new Date().getFullYear() - 1}-01-01`;
      const [pis, lanc] = await Promise.all([
        S.q(S.sb.from('pis').select('id, veiculo_id, status, consultor_id, valor_total, valor_liquido, repasse_pct, criado_em, dados').in('status', VENDIDO).gte('criado_em', desde)),
        S.q(S.sb.from('lancamentos').select('id, veiculo_id, valor, vencimento, pi_id').eq('sentido', 'receber').is('pago_em', null))]);
      // Consultor de cada parcela (pelo PI), para o "A receber" filtrar por consultor
      const conhecidos = new Map(pis.map(p => [p.id, p.consultor_id]));
      const faltam = [...new Set(lanc.map(l => l.pi_id).filter(id => id && !conhecidos.has(id)))];
      for (let i = 0; i < faltam.length; i += 200) (await S.q(S.sb.from('pis').select('id, consultor_id').in('id', faltam.slice(i, i + 200)))).forEach(p => conhecidos.set(p.id, p.consultor_id));
      lanc.forEach(l => { l.consultor_id = l.pi_id ? conhecidos.get(l.pi_id) || null : undefined; });
      cache = { em:Date.now(), pis, lanc };
    } catch (e) { console.error(e); S.toast(S.erro(e)); if (!cache) cache = { em:Date.now(), pis:[], lanc:[] }; }
    buscando = false;
    if (!S.carregando && (S.ui.view === 'geral' || S.route().view === 'geral')) S.render();
  };
  S.geralUsar = dados => { cache = Object.assign({ em:Date.now() }, dados); painel = null; };   // testes: números em memória
  S.geralLimpar = () => { cache = null; painel = null; };                                       // ao sair ou trocar de conta

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


  // ---------- painel único do Dashboard Gestão (aprovado em 29/10/2026, tela 10 do quadro "SONVI · Agências, controle e metas") ----------
  // Um mês de veiculação escolhido no alto. Cubo veículo × consultor × dia com o líquido (S.valorNoMes), a parte da Head 14 e o nº de PIs;
  // o acumulado (mês + seguintes) por veículo × consultor; e as parcelas do mês ainda não pagas. Os 5 consultores com mais venda no
  // mês (depois os do acumulado) têm fatia própria e o resto vira "Outros".
  const f2 = { mes:null };
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const nomeM = ym => `${MESL[+ym.slice(5) - 1]}/${ym.slice(2, 4)}`, minM = ym => MESL[+ym.slice(5) - 1].toLowerCase();
  const mesesDoPi = p => { const d = p.dados || {}, set = new Set(); (d.grids || []).forEach(g => g.period && set.add(g.period));
    (d.digital || []).forEach(a => { const m = a.period || String(a.inicio || '').slice(0, 7); if (m) set.add(m); });
    if (!set.size) set.add(String(p.criado_em || '').slice(0, 7)); return [...set]; };
  const headDe = (p, v) => v * S.repassePct(p) / 100;
  // Mês a mês (planilha "Controle PI Head 14"): líquido, parte da Head 14, PIs e o líquido de cada veículo
  S.controleHead = (dados, veiculos) => {
    const M = {}, idV = new Set(veiculos.map(v => v.id));
    dados.pis.filter(p => VENDIDO.includes(p.status) && idV.has(p.veiculo_id)).forEach(p => mesesDoPi(p).forEach(m => {
      const v = S.valorNoMes(p, m); if (!(v > 0)) return; const x = M[m] || (M[m] = { liq:0, head:0, pis:0, porV:{} });
      x.liq += v; x.head += headDe(p, v); x.pis++; x.porV[p.veiculo_id] = (x.porV[p.veiculo_id] || 0) + v; }));
    return M; };
  S.geralCubo = (dados, veiculos, ym, hoje = new Date()) => {
    const [y, m] = ym.split('-').map(Number), NT = new Date(y, m, 0).getDate();
    const rotulos = Array.from({ length:NT }, (_, t) => String(t + 1)), longos = rotulos.map((r, t) => `${t + 1} de ${MES3[m - 1]}`);
    const pis = dados.pis.filter(p => VENDIDO.includes(p.status));
    const partes = [], acum = [];
    pis.forEach(p => { const v = S.valorNoMes(p, ym); if (v > 0) partes.push({ p, v, h:headDe(p, v), t:S.diaNoMes(p, ym) - 1 });
      const a = mesesDoPi(p).filter(mm => mm >= ym).reduce((t, mm) => t + S.valorNoMes(p, mm), 0); if (a > 0) acum.push({ p, v:a, h:headDe(p, a) }); });
    const porC = {}, porA = {}; partes.forEach(x => { const k = x.p.consultor_id || ''; porC[k] = (porC[k] || 0) + x.v; }); acum.forEach(x => { const k = x.p.consultor_id || ''; porA[k] = (porA[k] || 0) + x.v; });
    const ordem = [...new Set([...Object.keys(porC), ...Object.keys(porA)])].sort((a, b) => (porC[b] || 0) - (porC[a] || 0) || (porA[b] || 0) - (porA[a] || 0));
    const top = ordem.length > 6 ? ordem.slice(0, 5) : ordem, temOutros = ordem.length > top.length;
    const nomeC = k => k ? S.usuario(k) || 'Sem nome' : 'Sem responsável';
    const consultores = top.map(nomeC).concat(temOutros ? ['Outros'] : []);
    const idxD = k => { const i = top.indexOf(k || ''); return i >= 0 ? i : temOutros ? top.length : -1; };
    const idxC = new Map(veiculos.map((v, i) => [v.id, i])), ND = Math.max(1, consultores.length);
    if (!consultores.length) consultores.push('Sem vendas');
    const cubo3 = () => veiculos.map(() => Array.from({ length:ND }, () => new Array(NT).fill(0))), cubo2 = () => veiculos.map(() => new Array(ND).fill(0));
    const V = cubo3(), H = cubo3(), N = cubo3(), A = cubo2(), HA = cubo2(), PA = veiculos.map(() => 0);
    partes.forEach(({ p, v, h, t }) => { const c = idxC.get(p.veiculo_id), d = idxD(p.consultor_id); if (c == null || d < 0 || t < 0 || t >= NT) return; V[c][d][t] += v; H[c][d][t] += h; N[c][d][t]++; });
    acum.forEach(({ p, v, h }) => { const c = idxC.get(p.veiculo_id), d = idxD(p.consultor_id); if (c == null || d < 0) return; A[c][d] += v; HA[c][d] += h; });
    const dHoje = iso(hoje), mHoje = dHoje.slice(0, 7);
    const lanc = dados.lanc.filter(l => (l.vencimento || mHoje).slice(0, 7) === ym)
      .map(l => ({ c:idxC.get(l.veiculo_id), d:l.consultor_id === undefined ? null : idxD(l.consultor_id), valor:Number(l.valor || 0), venc:!!l.vencimento && l.vencimento < dHoje }));
    const receber = (fc, cFixo) => { const r = { valor:0, vencido:0, parcelas:0 }; const cc = cFixo != null ? cFixo : fc.c;
      lanc.forEach(l => { if (l.c == null || (cc != null && l.c !== cc) || (fc.d != null && l.d !== fc.d)) return; r.valor += l.valor; r.parcelas++; if (l.venc) r.vencido += l.valor; });
      return r; };
    // Soma com os filtros: X[c][d][t] (dia conta) ou X[c][d] (dia não conta: acumulado)
    const soma3 = (X, fc, cFixo) => { let s_ = 0; const cc = cFixo != null ? cFixo : fc.c; X.forEach((lc, c) => { if (cc != null && c !== cc) return;
      lc.forEach((ld, d) => { if (fc.d != null && d !== fc.d) return; ld.forEach((x, t) => { if (fc.r && (t < fc.r[0] || t > fc.r[1])) return; s_ += x; }); }); }); return s_; };
    const soma2 = (X, fc, cFixo) => { let s_ = 0; const cc = cFixo != null ? cFixo : fc.c; X.forEach((lc, c) => { if (cc != null && c !== cc) return; lc.forEach((x, d) => { if (fc.d == null || d === fc.d) s_ += x; }); }); return s_; };
    return { ym, NT, rotulos, longos, consultores, V, H, N, A, HA, receber, soma3, soma2, unidadeT:'dia' };
  };
  const fc0 = () => ({ c:null, d:null, r:null });
  const reais0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  const varTxt = (a, b, ym) => { const p = variacao(a, b); return p === null ? (a ? 'novo em relação a ' + minM(somaMes(ym, -1)) : 'sem base para comparar') : `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${p}% vs. ${minM(somaMes(ym, -1))}`; };
  const tomVar = (a, b) => { const p = variacao(a, b); return p == null ? '' : p > 0 ? 'bom' : p < 0 ? 'ruim' : ''; };
  // Totais do mês sem filtro (para a variação contra o mês anterior)
  const totaisMes = (M, ym) => { const ks = Object.keys(M); return { liq:(M[ym] || {}).liq || 0, head:(M[ym] || {}).head || 0,
    acu:ks.filter(m => m >= ym).reduce((t, m) => t + M[m].liq, 0), heada:ks.filter(m => m >= ym).reduce((t, m) => t + M[m].head, 0) }; };
  const KPIS = [{ k:'liq', ic:'financeiro', titulo:'Líquido do mês', sub:true }, { k:'acu', ic:'relatorio', titulo:'Acumulado (mês + seguintes)', sub:true },
    { k:'head', ic:'empresa', titulo:'Parte da Head 14 no mês', sub:true, cls:'cz-kpi-head' }, { k:'heada', ic:'empresa', titulo:'Parte da Head 14 acumulada', sub:true, cls:'cz-kpi-head' },
    { k:'rec', ic:'vendas', titulo:'A faturar / receber', sub:true }];

  const mesAMes = (M, ym, veiculos) => {
    const hoje = S.mesAtual(), z = { liq:0, head:0, pis:0, porV:{} };
    const ini = [ym, ...Object.keys(M).filter(m => m >= `${hoje.slice(0, 4)}-01`)].sort()[0], fim = [ym, ...Object.keys(M)].sort().pop();
    const linhas = []; let corre = Object.keys(M).filter(m => m < ini).reduce((t, m) => t + M[m].liq, 0);
    for (let m = ini; m <= fim; m = somaMes(m, 1)) { const x = M[m] || z; corre += x.liq; linhas.push({ m, x, acu:corre }); }
    const barraV = x => { const t = x.liq || 0; return `<span class="hc-bv" aria-hidden="true">${t ? veiculos.filter(v => x.porV[v.id]).map(v => `<i style="width:${(x.porV[v.id] / t * 100).toFixed(2)}%;background:${esc(v.cor || 'var(--accent)')}" title="${esc(v.nome)}"></i>`).join('') : ''}</span>`; };
    const porVtxt = x => veiculos.filter(v => x.porV[v.id]).map(v => `${v.nome} ${Math.round(x.porV[v.id] / x.liq * 100)}%`).join(', ');
    return `<section class="card hc" aria-labelledby="hc-t"><div class="hd"><h2 id="hc-t">Mês a mês</h2><span class="muted small">clique num mês para ver o painel dele</span></div><div class="scroll"><table class="hc-tab"><thead><tr><th>Mês</th><th class="r">PIs</th><th class="r">Líquido do mês</th><th class="r">Parte Head 14</th><th class="r">Acumulado</th><th class="hc-pv">Por veículo</th></tr></thead><tbody>
      ${linhas.map(({ m, x, acu }) => `<tr class="click${m === ym ? ' hc-sel' : ''}" data-act="geralMes" data-v="${m}"${m === ym ? ' aria-current="true"' : ''}><td class="nw"><b>${nomeM(m)}</b></td><td class="r nw">${x.pis || '—'}</td><td class="r nw">${x.liq ? brl(x.liq) : '—'}</td><td class="r nw">${x.head ? brl(x.head) : '—'}</td><td class="r nw muted">${brl(acu)}</td><td class="hc-pv">${barraV(x)}${x.liq ? `<span class="sr">${esc(porVtxt(x))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  };
  const ctrlCsv = () => { const M = S.controleHead(cache, S.db.veiculos), ms = Object.keys(M).sort(), n = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
    let corre = 0; const linhas = [['Mês', 'PIs', 'Líquido do mês', 'Parte Head 14', 'Acumulado', ...S.db.veiculos.map(v => v.nome)].join(';')];
    ms.forEach(m => { const x = M[m]; corre += x.liq; linhas.push([nomeM(m), x.pis, n(x.liq), n(x.head), n(corre), ...S.db.veiculos.map(v => n(x.porV[v.id] || 0))].join(';')); });
    const b = new Blob(['﻿' + linhas.join('\n')], { type:'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'controle-head14.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

  S.views.geral = () => {
    const nome = String(S.me.nome || S.me.email || '').trim().split(/[\s@]+/)[0];
    const ym = f2.mes || S.mesAtual(), hojeM = S.mesAtual();
    const nav = `<div class="hc-mes" role="group" aria-label="Mês de veiculação"><button type="button" class="hc-seta" data-act="geralMes" data-v="${somaMes(ym, -1)}" aria-label="Mês anterior">${S.svg('esq', 16)}</button><b aria-live="polite">${nomeM(ym)}</b><button type="button" class="hc-seta" data-act="geralMes" data-v="${somaMes(ym, 1)}" aria-label="Próximo mês">${S.svg('seta', 16)}</button></div>
      ${ym !== hojeM ? `<button type="button" class="btn sm" data-act="geralMes" data-v="${hojeM}">Hoje</button>` : ''}<button type="button" class="btn sm" data-act="ctrlCsv">Baixar planilha</button>`;
    const topo = { title:`${saudacao()}, ${esc(nome)}`, actions:`<div class="hc-acoes">${nav}</div>` };
    const intro = '<p class="geral-intro">Acompanhe as vendas, a OPEC e o financeiro de todos os veículos.</p>';
    if (!cache || Date.now() - cache.em > TTL) S.carregarGeral();
    if (!cache) return Object.assign(topo, { body:`${intro}<div class="card empty"><b>Buscando os números</b>Somando as vendas e o financeiro de todos os veículos…</div>` });

    const veiculos = S.db.veiculos, M = S.controleHead(cache, veiculos), chave = cache.em + '|' + ym + '|' + veiculos.map(v => v.id).join();
    if (!painel || painel.chave !== chave) {
      const cubo = S.geralCubo(cache, veiculos, ym), host = document.createElement('div');
      host.innerHTML = S.cruzadoHtml({ unidadeT:'dia', kpis:KPIS, rotulo:'líquido' });
      painel = { chave, el:host.firstElementChild, cubo, f:fc0(), montado:false };
      const p = painel, A0 = totaisMes(M, ym), B0 = totaisMes(M, somaMes(ym, -1)), pct = String(S.repassePct()).replace('.', ',');
      const T0 = { liq:cubo.soma3(cubo.V, fc0()), head:cubo.soma3(cubo.H, fc0()), acu:cubo.soma2(cubo.A, fc0()), heada:cubo.soma2(cubo.HA, fc0()) };
      const parte = (v, t) => (t ? (v / t * 100).toFixed(1).replace('.', ',') : '0') + '% do total';
      p.dados = { veiculos:veiculos.map(v => ({ nome:v.nome, titulo:v.nome + (S.vehSub(v) ? ' · ' + S.vehSub(v) : '') })), consultores:cubo.consultores, rotulos:cubo.rotulos, rotulosLongos:cubo.longos,
        V:cubo.V, N:cubo.N, unidadeT:'dia', rotulo:'líquido', receber:fc => cubo.receber(fc),
        kpiValores:(fc, tem, t) => { const head = cubo.soma3(cubo.H, fc), acu = cubo.soma2(cubo.A, fc), heada = cubo.soma2(cubo.HA, fc), r = cubo.receber(fc);
          const pl = (k, v) => tem ? { pill:parte(v, T0[k]) } : { pill:varTxt(A0[k], B0[k], ym), tom:tomVar(A0[k], B0[k]) };
          return { liq:Object.assign({ texto:reais0(t.s), sub:`${nomeM(ym)} · ${t.o} PI${t.o === 1 ? '' : 's'}` }, pl('liq', t.s)),
            acu:Object.assign({ texto:reais0(acu), sub:`De ${minM(ym)} em diante` }, pl('acu', acu)),
            head:Object.assign({ texto:reais0(head), sub:`${pct}% do líquido de ${minM(ym)}` }, pl('head', head)),
            heada:Object.assign({ texto:reais0(heada), sub:`De ${minM(ym)} em diante` }, pl('heada', heada)),
            rec:{ texto:reais0(r.valor), sub:`${r.parcelas} parcela${r.parcelas === 1 ? '' : 's'} em aberto`, pill:r.vencido ? reais0(r.vencido) + ' vencido' : r.parcelas ? 'nada vencido' : 'nada em aberto', tom:r.vencido ? 'ruim' : 'bom' } }; },
        alCambiar:fc => { p.f = fc; const el = document.getElementById('gv-corpo'); if (el && painel === p && p.corpo) { el.innerHTML = p.corpo(); S.poeRolos(); } } };
    }
    // O painel entra no lugar reservado logo depois do desenho (e é o mesmo elemento: filtros e animações continuam)
    queueMicrotask(() => { const lugar = document.getElementById('cz-lugar'), p = painel; if (lugar && p) { lugar.replaceWith(p.el); if (!p.montado) { p.montado = true; S.cruzado(p.el, p.dados); } }
      if (S.metasAnima) S.metasAnima(); });

    // Veículos (aprovado em 29/10/2026): um cartão por veículo, seguindo o consultor e os dias escolhidos no painel; com um veículo
    // escolhido, o cartão dele fica destacado e os outros apagados. Clicar abre o Dashboard do veículo.
    const dHoje = iso(new Date());
    const corpo_ = () => {
      const fp = painel.f, cb = painel.cubo, idx = new Map(veiculos.map((v, i) => [v.id, i]));
      const ls = veiculos.map((v, ci) => { const fc = { d:fp.d, r:fp.r }, liq = cb.soma3(cb.V, fc, ci), head = cb.soma3(cb.H, fc, ci), n = cb.soma3(cb.N, fc, ci);
        const abertas = cache.lanc.filter(l => l.veiculo_id === v.id), venc = abertas.filter(l => l.vencimento && l.vencimento < dHoje);
        return { v, liq, head, n, opec:cache.pis.filter(p => p.veiculo_id === v.id && p.status === 'opec').length, receber:soma(abertas, 'valor'), vencido:soma(venc, 'valor') }; });
      const tot = ls.reduce((a, l) => a + l.liq, 0);
      const linhas = ls.slice().sort((a, b) => b.liq - a.liq || a.v.nome.localeCompare(b.v.nome));
      const marca = l => fp.c == null ? '' : idx.get(l.v.id) !== fp.c ? ' gc-fora' : ' gc-on';
      const sit = l => l.vencido ? S.tag('Pagamento atrasado', 'orange') : l.opec ? S.tag(`${l.opec} na OPEC`, 'blue') : l.liq || l.receber ? S.tag('Em dia', 'green') : S.tag('Sem vendas', 'gray');
      if (!veiculos.length) return '<div class="empty"><b>Nenhum veículo cadastrado</b>Cadastre os veículos em Administração.</div>';
      return `<div class="gc-grade">${linhas.map(l => `<div class="gc${marca(l)}" data-act="geralAbrir" data-id="${l.v.id}" role="link" aria-label="Abrir o Dashboard da ${esc(l.v.nome)}">
        <div class="gc-topo">${S.vav(l.v)}<span class="gc-tx"><b>${esc(l.v.nome)}</b><small>${esc(S.vehSub(l.v) || S.nomeCategoria(S.categoria(l.v)))}</small><span class="gc-sit">${sit(l)}</span></span></div>
        <div class="gc-num"><span><small>Líquido no mês</small><b class="gc-liq">${S.roloFixo('gc-l-' + l.v.id, reais0(l.liq))}</b></span><span class="gc-h"><small>Parte Head 14</small><b>${S.roloFixo('gc-h-' + l.v.id, reais0(l.head))}</b></span></div>
        <span class="gc-barra" aria-hidden="true"><i style="width:${tot ? Math.max(l.liq ? 2 : 0, l.liq / tot * 100).toFixed(1) : 0}%;background:${esc(l.v.cor || 'var(--accent)')}"></i></span>
        <div class="gc-pe"><span>${l.n} PI${l.n === 1 ? '' : 's'} no mês</span><span class="${l.vencido ? 'fin-laranja' : ''}">${l.vencido ? reais0(l.vencido) + ' vencido' : l.receber ? reais0(l.receber) + ' a receber' : 'Nada a receber'}</span><b class="gc-abrir">Abrir ›</b></div></div>`).join('')}</div>`; };
    painel.corpo = corpo_;
    const lista = `<section class="card gv"><div class="hd gv-hd"><div><h2>Veículos</h2><span class="muted small">Clique num veículo para abrir o Dashboard dele.</span></div><span class="muted small gv-at">atualizado às ${S.hora(cache.em)} · <a data-act="geralAtualizar">Atualizar</a></span></div><div id="gv-corpo">${corpo_()}</div></section>`;
    const metas = S.metasAneis ? S.metasAneis({ mes:ym, pis:cache.pis, vazio:'Nenhuma meta cadastrada para este mês. A meta de cada consultor, por veículo, fica em Administração › Colaboradores.' }) : '';
    return Object.assign(topo, { body:`${intro}<div id="cz-lugar"></div>${mesAMes(M, ym, veiculos)}${metas}${lista}` });
  };

  Object.assign(S.actions, {
    geralMes: d => { f2.mes = d.v === S.mesAtual() ? null : d.v; S.render(); },
    geralCat: d => { f.cat = d.v; S.render(); },
    ctrlCsv: () => ctrlCsv(),
    geralAtualizar: () => { if (S.metasLimpar) S.metasLimpar(); S.carregarGeral(true).then(() => S.toast('Números atualizados')); },
    geralAbrir: d => S.abrirVeiculo(d.id)
  });
  let tBusca;
  document.addEventListener('input', e => { if (!e.target.dataset || e.target.dataset.geral !== 'q') return;
    f.q = e.target.value; clearTimeout(tBusca);
    tBusca = setTimeout(() => { const pos = e.target.selectionStart; S.render(); const el = document.querySelector('[data-geral="q"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 200); });
})();

// SONVI · Vendas e comissões (aprovado em 31/10/2026, artifact "Vendas e comissões"; database/068, função de borda "comissoes").
// Administração › Pessoas › Vendas e comissões (diretor; financeiro só consulta). Por mês e por consultor: vendido bruto e
// líquido (pelo mês em que vai ao ar, S.fatiaMes), meta, recebido dos clientes, comissão do mês, prevista, propostas e atraso.
// Comissão = percentual cadastrado do consultor (Colaboradores; com exceção por veículo) × líquido que o cliente pagou, no mês
// do pagamento; vale o percentual em vigor quando o PI nasceu. O banco faz a conta das parcelas (comissoes_do_mes).
// Fechar o mês (só o diretor) congela as parcelas; o que for pago depois de um mês fechado entra no mês aberto seguinte.
// Extrato por consultor: PDF (html2pdf, carregado só na hora), e-mail com o PDF anexado (função "comissoes"), WhatsApp com o
// link seguro (extrato.html?e=<token>). Tudo com o nome da empresa comercial, nunca SONVI.
// O consultor vê só os próprios números no Dashboard do veículo (S.minhaComissaoHtml).
(() => {
  const { esc, brl } = S;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const st = { mes:'', det:null, base:null, buscando:false, em:0, meses:{}, buscMes:{}, per:{}, buscPer:{} };
  const TTL = 120000;
  const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  const pctTxt = n => n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : String(Math.round(Number(n) * 100) / 100).replace('.', ',') + '%';
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nomeMes = ym => MESES[+ym.slice(5) - 1];
  const nomeMesLongo = ym => { const n = nomeMes(ym); return `${n[0].toUpperCase()}${n.slice(1)} de ${ym.slice(0, 4)}`; };
  const dfmt = d => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : '';
  const diaDe = ts => ts ? new Date(ts).toLocaleDateString('sv-SE', { timeZone:'America/Cuiaba' }) : '';
  const hoje = () => S.today();
  const ehDiretor = () => !!(S.me && S.me.diretor);
  const rerender = () => { if (S.route().view === 'admin' || S.route().view === 'dashboard') S.render(); };

  // ---------- dados do grupo: PIs vendidos, parcelas em aberto, propostas, colaboradores e o histórico dos percentuais ----------
  const carregarBase = async (forcar) => {
    if (st.buscando || (!forcar && st.base && Date.now() - st.em < TTL)) return;
    st.buscando = true;
    try {
      const d = new Date(); d.setMonth(d.getMonth() - 18); const desde = d.toISOString().slice(0, 10);
      const [pis, abertas, props, cols, hist] = await Promise.all([
        S.q(S.sb.from('pis').select('id, veiculo_id, numero, titulo, status, consultor_id, cliente_id, agencia_id, valor_total, valor_liquido, criado_em, dados').in('status', VENDIDO).gte('criado_em', desde)),
        S.q(S.sb.from('lancamentos').select('id, veiculo_id, pi_id, valor, vencimento, contraparte').eq('sentido', 'receber').is('pago_em', null).not('pi_id', 'is', null)),
        S.q(S.sb.from('propostas').select('id, consultor_id, situacao, data').gte('data', desde)).catch(() => []),
        S.q(S.sb.from('colaboradores').select('id, usuario_id, nome, funcao, ativo, comissao, comissao_veiculos, veiculos, email, celular')),
        S.q(S.sb.from('colaborador_comissoes').select('colaborador_id, padrao, por_veiculo, desde').order('desde')).catch(() => [])]);
      const conhecidos = new Set((pis || []).map(p => p.id)), faltam = [...new Set((abertas || []).map(l => l.pi_id).filter(id => !conhecidos.has(id)))];
      for (let i = 0; i < faltam.length; i += 150) (await S.q(S.sb.from('pis').select('id, veiculo_id, numero, titulo, status, consultor_id, cliente_id, agencia_id, valor_total, valor_liquido, criado_em, dados').in('id', faltam.slice(i, i + 150)))).forEach(p => { p.antigo = true; pis.push(p); });
      st.base = { pis:pis || [], abertas:abertas || [], props:props || [], cols:cols || [], hist:hist || [] }; st.em = Date.now();
    } catch (e) { console.error(e); S.toast(S.erro(e)); st.base = st.base || { pis:[], abertas:[], props:[], cols:[], hist:[] }; }
    st.buscando = false; rerender();
  };
  const carregarMes = (mes, forcar) => {
    if (st.buscMes[mes] || (!forcar && st.meses[mes] && Date.now() - st.meses[mes].em < TTL)) return;
    st.buscMes[mes] = true;
    S.q(S.sb.rpc('comissoes_do_mes', { p_mes:mes })).then(r => { st.meses[mes] = Object.assign(r || { itens:[] }, { em:Date.now() }); })
      .catch(e => { console.error(e); S.toast(S.erro(e)); st.meses[mes] = st.meses[mes] || { itens:[], em:Date.now() - TTL + 15000 }; })
      .finally(() => { st.buscMes[mes] = false; rerender(); });
  };
  const carregarPer = (ate, forcar) => {
    if (st.buscPer[ate] || (!forcar && st.per[ate])) return;
    st.buscPer[ate] = true;
    S.q(S.sb.rpc('comissoes_periodo', { p_de:somaMes(ate, -11), p_ate:ate })).then(r => { st.per[ate] = r || []; })
      .catch(e => { console.error(e); st.per[ate] = []; }).finally(() => { st.buscPer[ate] = false; rerender(); });
  };
  const limpar = () => { st.meses = {}; st.per = {}; st.em = 0; };
  S.comissoesUsar = (base, meses, per) => { st.base = base; st.em = Date.now() + 1e9; Object.entries(meses || {}).forEach(([k, v]) => { st.meses[k] = Object.assign(v, { em:Date.now() + 1e9 }); }); Object.assign(st.per, per || {}); };   // testes
  S.comissoesLimpar = () => { limpar(); st.base = null; };

  // ---------- regras ----------
  const colDe = uid => (st.base.cols || []).find(c => c.usuario_id === uid);
  // Percentual em vigor numa data (mesma regra do banco, comissao_pct_em): o último registro do histórico até a data; antes do primeiro, o primeiro
  const pctEm = (uid, veiculo, data) => { const c = colDe(uid); if (!c) return null;
    const hs = (st.base.hist || []).filter(h => h.colaborador_id === c.id); if (!hs.length) return c.comissao === null || c.comissao === undefined ? null : Number((c.comissao_veiculos || {})[veiculo] ?? c.comissao);
    const ate = hs.filter(h => h.desde <= data), h = ate.length ? ate[ate.length - 1] : hs[0], pv = (h.por_veiculo || {})[veiculo];
    const n = pv !== undefined && pv !== null && pv !== '' ? Number(pv) : h.padrao; return n === null || n === undefined ? null : Number(n); };
  const pctAtual = (uid, veiculo) => { const c = colDe(uid); if (!c || c.comissao === null || c.comissao === undefined) return null; const pv = veiculo && (c.comissao_veiculos || {})[veiculo]; return pv !== undefined && pv !== null && pv !== '' ? Number(pv) : Number(c.comissao); };
  const pctsTxt = uid => { const c = colDe(uid); if (!c || c.comissao === null || c.comissao === undefined) return null;
    const ex = Object.entries(c.comissao_veiculos || {}).filter(([, v]) => v !== null && v !== '' && Number(v) !== Number(c.comissao));
    return pctTxt(c.comissao) + (ex.length ? ` · ${ex.map(([v, n]) => `${esc((S.veh(v) || {}).sigla || (S.veh(v) || {}).nome || '')} ${pctTxt(n)}`).join(' · ')}` : ''); };
  // Parte líquida de cada real que o veículo recebe do cliente (mesma conta do banco)
  const fator = pi => { if (!pi) return 1; const t = String(((pi.dados || {}).billing || {}).type || '10'), tot = Number(pi.valor_total) || 0;
    return !pi.agencia_id || t === '20' ? (tot > 0 ? Math.min(1, Number(pi.valor_liquido ?? tot) / tot) : 1) : 1; };
  const brutoNoMes = (p, mes) => Number(p.valor_total || 0) * S.fatiaMes(p, mes);

  // Linhas do mês, uma por consultor (e "Sem responsável" quando há PI sem consultor)
  const calcMes = mes => {
    const b = st.base, r = st.meses[mes] || { itens:[] }, metas = (S.metasDoMes && S.metasDoMes(mes)) || [], h = hoje();
    const por = {}, pes = uid => por[uid || ''] || (por[uid || ''] = { uid:uid || '', bruto:0, liq:0, pis:0, meta:0, rec:0, liqPago:0, com:0, prev:0, fila:0, atraso:0, propC:0, propA:0, itens:[], porV:{}, atrasos:[] });
    (b.cols || []).filter(c => c.funcao === 'consultor' && c.ativo && c.usuario_id).forEach(c => pes(c.usuario_id));
    b.pis.filter(p => !p.antigo).forEach(p => { const f = S.fatiaMes(p, mes); if (!(f > 0)) return; const o = pes(p.consultor_id), liq = S.valorNoMes(p, mes);
      o.bruto += brutoNoMes(p, mes); o.liq += liq; o.pis++; o.porV[p.veiculo_id] = (o.porV[p.veiculo_id] || 0) + liq;
      if (p.consultor_id) { const pc = pctEm(p.consultor_id, p.veiculo_id, p.criado_em); if (pc) o.prev += liq * pc / 100; } });
    metas.forEach(x => { if (x.usuario_id) pes(x.usuario_id).meta += Number(x.meta) || 0; });
    (r.itens || []).forEach(i => { const o = pes(i.consultor_id); o.rec += Number(i.valor_pago) || 0; o.liqPago += Number(i.liquido) || 0; o.com += Number(i.comissao) || 0; o.itens.push(i); });
    const piDe = new Map(b.pis.map(p => [p.id, p]));
    b.abertas.forEach(l => { const pi = piDe.get(l.pi_id); if (!pi) return; const o = pes(pi.consultor_id);
      const pc = pi.consultor_id ? pctEm(pi.consultor_id, pi.veiculo_id, pi.criado_em) : null; if (pc) o.fila += Number(l.valor) * fator(pi) * pc / 100;
      if (l.vencimento && l.vencimento < h) { o.atraso += Number(l.valor) || 0; o.atrasos.push({ cliente:l.contraparte || 'Cliente', valor:Number(l.valor) || 0, venc:l.vencimento }); } });
    (b.props || []).forEach(p => { if (String(p.data || '').slice(0, 7) !== mes || !p.consultor_id) return; const o = pes(p.consultor_id); o.propC++; if (p.situacao === 'aprovada') o.propA++; });
    const lista = Object.values(por).filter(o => o.uid || o.liq || o.rec).sort((a, b2) => (a.uid ? 0 : 1) - (b2.uid ? 0 : 1) || b2.liq - a.liq || b2.com - a.com);
    const tot = lista.reduce((t, o) => { ['bruto', 'liq', 'pis', 'meta', 'rec', 'com', 'prev', 'atraso', 'propC', 'propA', 'fila'].forEach(k => { t[k] += o[k]; }); return t; }, { bruto:0, liq:0, pis:0, meta:0, rec:0, com:0, prev:0, atraso:0, propC:0, propA:0, fila:0 });
    return { lista, tot, r, fechado:r.fechamento || null };
  };
  const nomeDe = uid => uid ? ((colDe(uid) || {}).nome || S.usuario(uid) || 'Consultor') : 'Sem responsável';

  // ---------- tela principal ----------
  const pctW = (a, b) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
  const metaCel = o => !o.meta ? '<span class="muted small">sem meta</span>'
    : `<div class="cm-meta"><span class="nw"><b>${pctW(o.liq, o.meta) >= 100 ? Math.round(o.liq / o.meta * 100) : pctW(o.liq, o.meta)}%</b> <span class="muted">de ${brl0(o.meta)}</span></span><span class="cm-bar"><i class="${o.liq >= o.meta ? 'ok' : ''}" style="width:${pctW(o.liq, o.meta)}%"></i></span></div>`;
  S.comissoesTela = () => {
    const mes = st.mes || S.mesAtual(); carregarBase(false); carregarMes(mes, false);
    if (!st.base || !st.meses[mes]) return { body:'<div class="card empty" aria-busy="true"><b>Buscando as vendas e as comissões…</b>Junta os PIs, os pagamentos dos clientes e o percentual de cada consultor.</div>' };
    if (st.det) return { body:telaDetalhe(st.det, mes) };
    const { lista, tot, r, fechado } = calcMes(mes), dir = ehDiretor(), atual = S.mesAtual(), futuro = mes > atual;
    const ant = somaMes(mes, -1), antAberto = st.meses[ant] && !st.meses[ant].fechamento && mes === atual && (st.base.pis.some(p => S.fatiaMes(p, ant) > 0));
    if (!st.meses[ant] && mes === atual) carregarMes(ant, false);
    const nav = `<div class="cm-nav"><button class="btn sm" data-act="cmMes" data-d="-1" aria-label="Mês anterior">‹</button><b>${nomeMesLongo(mes)}</b><button class="btn sm" data-act="cmMes" data-d="1" aria-label="Próximo mês">›</button>${st.mes && st.mes !== atual ? '<button class="btn sm" data-act="cmMes" data-d="0">Hoje</button>' : ''}</div>`;
    const qtd = n => n === 1 ? 'consultor' : 'consultores';
    const faixa = fechado
      ? `<div class="cm-faixa fechado"><span>${S.svg('check', 16)}<span><b>${nomeMes(mes)[0].toUpperCase() + nomeMes(mes).slice(1)} fechado</b> em ${dfmt(diaDe(fechado.fechado_em))}${fechado.fechado_por ? ` por ${esc(S.usuario(fechado.fechado_por) || 'diretor')}` : ''} · ${brl(tot.com)} em comissões${Object.keys(fechado.pagos || {}).length ? ` · ${Object.keys(fechado.pagos).length} pag${Object.keys(fechado.pagos).length === 1 ? 'a' : 'as'}` : ''}</span></span>
          <span class="cm-faixa-acoes">${dir ? `<button class="btn sm pri" data-act="cmEnviarTodos">${S.svg('email')}Enviar extratos</button><button class="btn sm" data-act="cmPagas">Marcar como pagas</button>` : ''}<button class="btn sm" data-act="cmPlanilha">${S.svg('baixar')}Planilha</button>${dir ? `<button class="btn sm tres" data-act="cmMenuMes" aria-label="Mais opções do mês">${S.svg('mais3')}</button>` : ''}</span></div>`
      : futuro ? `<div class="cm-faixa"><span>Mês ainda não começou: aqui aparece o que já está vendido para ${nomeMes(mes)}.</span></div>`
      : `<div class="cm-faixa aberto"><span>Mês aberto · as comissões de ${nomeMes(mes)} ainda mudam se chegar pagamento.</span><span class="cm-faixa-acoes"><button class="btn sm" data-act="cmPlanilha">${S.svg('baixar')}Planilha</button>${dir ? `<button class="btn sm pri" data-act="cmFechar">Fechar comissões de ${nomeMes(mes)}</button>` : ''}</span></div>`;
    const lembrete = antAberto && dir ? `<p class="cm-lembra">${nomeMes(ant)[0].toUpperCase() + nomeMes(ant).slice(1)} ainda não foi fechado. <a href="#" data-act="cmMes" data-d="-1">Ir para ${nomeMes(ant)}</a></p>` : '';
    const kpi = (rot, v, sub, cls = '') => `<div class="card cm-kpi${cls}"><small>${rot}</small><b>${v}</b><span>${sub}</span></div>`;
    const kpis = `<div class="cm-kpis">${kpi('Vendido bruto', brl0(tot.bruto), `${tot.pis} PI${tot.pis === 1 ? '' : 's'} no ar em ${nomeMes(mes)}`)}${kpi('Líquido', brl0(tot.liq), tot.meta ? `${pctW(tot.liq, tot.meta)}% da meta (${brl0(tot.meta)})` : 'após agência e descontos')}
      ${kpi('Recebido dos clientes', brl0(tot.rec), fechado ? 'congelado no fechamento' : `pago em ${nomeMes(mes)}`)}${kpi('Comissões do mês', brl0(tot.com), '% de cada consultor × líquido pago', ' dest')}${kpi('Comissão prevista', brl0(tot.prev), 'sobre o líquido vendido no mês')}</div>`;
    const linha = o => { const pt = o.uid ? pctsTxt(o.uid) : null;
      return `<tr class="${o.uid ? 'click' : ''}"${o.uid ? ` data-act="cmAbrir" data-id="${o.uid}"` : ''}><td><div class="cm-p"><span class="av soft" aria-hidden="true">${esc(S.iniciais(nomeDe(o.uid)))}</span><span><b>${esc(nomeDe(o.uid))}</b><small>${o.pis} PI${o.pis === 1 ? '' : 's'}${o.pis ? ` · ticket ${brl0(o.liq / o.pis)}` : ''}</small></span></div></td>
        <td class="r nw cm-c-bruto">${brl0(o.bruto)}</td><td class="r nw cm-c-liq">${brl0(o.liq)}</td><td class="cm-c-meta">${o.uid ? metaCel(o) : ''}</td><td class="r nw">${brl0(o.rec)}</td>
        <td class="r nw cm-c-pct">${o.uid ? (pt ? `<span title="${esc(pt.replace(/<[^>]+>/g, ''))}">${pt.split(' · ')[0]}${pt.includes(' · ') ? '*' : ''}</span>` : '<span class="cm-sempct" title="Cadastre o percentual em Colaboradores">sem %</span>') : '—'}</td>
        <td class="r nw"><b>${o.uid ? brl0(o.com) : '—'}</b>${fechado && o.uid && (fechado.pagos || {})[o.uid] ? `<small class="cm-pago">paga ${dfmt((fechado.pagos || {})[o.uid]).slice(0, 5)}</small>` : ''}</td>
        <td class="r nw cm-c-prev muted">${o.uid ? brl0(o.prev) : '—'}</td><td class="r nw cm-c-prop">${o.uid ? `${o.propC} → ${o.propA}${o.propC ? ` <span class="muted">(${Math.round(o.propA / o.propC * 100)}%)</span>` : ''}` : ''}</td>
        <td class="r cm-c-atr">${o.atraso ? `<span class="pill fn-forte">${brl0(o.atraso)}</span>` : '<span class="pill fn-ok">em dia</span>'}</td></tr>`; };
    const cel = o => `<div class="cm-cel${o.uid ? '' : ' sem'}"${o.uid ? ` data-act="cmAbrir" data-id="${o.uid}"` : ''}><span class="av soft" aria-hidden="true">${esc(S.iniciais(nomeDe(o.uid)))}</span><span class="cm-cel-tx"><b>${esc(nomeDe(o.uid))}</b><small>Líquido ${brl0(o.liq)}${o.meta ? ` · meta ${pctW(o.liq, o.meta)}%` : ''}</small><small>Recebido ${brl0(o.rec)}${o.atraso ? ` · <span class="cm-atr">${brl0(o.atraso)} em atraso</span>` : ''}</small></span><span class="cm-cel-v"><b>${o.uid ? brl0(o.com) : '—'}</b><small>${o.uid ? (pctsTxt(o.uid) || 'sem %').split(' · ')[0] : ''}</small></span></div>`;
    const tabela = !lista.length ? `<section class="card"><div class="empty"><b>Nenhum consultor cadastrado</b>Cadastre os consultores em Administração › Colaboradores, com o percentual de comissão de cada um.</div></section>`
      : S.celular ? `<section class="card cm-lista">${lista.map(cel).join('')}</section>`
      : `<section class="card cm-lista"><div class="scroll"><table class="cm-t"><thead><tr><th>Consultor</th><th class="r cm-c-bruto">Vendido bruto</th><th class="r cm-c-liq">Líquido</th><th class="cm-c-meta">Meta</th><th class="r">Recebido</th><th class="r cm-c-pct">%</th><th class="r">Comissão do mês</th><th class="r cm-c-prev">Prevista</th><th class="r cm-c-prop">Propostas</th><th class="r cm-c-atr">Em atraso</th></tr></thead>
        <tbody>${lista.map(linha).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="r nw cm-c-bruto">${brl0(tot.bruto)}</td><td class="r nw cm-c-liq">${brl0(tot.liq)}</td><td class="cm-c-meta nw">${tot.meta ? `${pctW(tot.liq, tot.meta)}% de ${brl0(tot.meta)}` : ''}</td><td class="r nw">${brl0(tot.rec)}</td><td class="cm-c-pct"></td><td class="r nw">${brl0(tot.com)}</td><td class="r nw cm-c-prev">${brl0(tot.prev)}</td><td class="r cm-c-prop">${tot.propC} → ${tot.propA}</td><td class="r nw cm-c-atr">${tot.atraso ? brl0(tot.atraso) : ''}</td></tr></tfoot></table></div>
        <p class="muted small cm-pe">Clique num consultor para ver o detalhe e as parcelas que geraram a comissão. "Prevista": a mesma conta sobre o líquido que vai ao ar no mês. ${lista.some(o => o.uid && (pctsTxt(o.uid) || '').includes(' · ')) ? '* percentual diferente em algum veículo (passe o mouse). ' : ''}Parcela atrasada não gera comissão até o cliente pagar.</p></section>`;
    // Por veículo (líquido vendido no mês) e carteira em atraso
    const cons = lista.filter(o => o.uid && o.liq > 0), vs = S.db.veiculos.filter(v => lista.some(o => o.porV[v.id]));
    const porVeic = vs.length && cons.length ? `<section class="card cm-bloco"><h2 class="cm-h">Líquido por veículo</h2><div class="scroll"><table class="cm-t cm-t-s"><thead><tr><th>Veículo</th>${cons.map(o => `<th class="r">${esc(nomeDe(o.uid).split(' ')[0])}</th>`).join('')}<th class="r">Total</th></tr></thead>
        <tbody>${vs.map(v => `<tr><td><span class="cm-v">${S.vav(v)}${esc(v.nome)}</span></td>${cons.map(o => `<td class="r nw">${o.porV[v.id] ? brl0(o.porV[v.id]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="r nw"><b>${brl0(lista.reduce((t, o) => t + (o.porV[v.id] || 0), 0))}</b></td></tr>`).join('')}</tbody></table></div></section>` : '';
    const piDe = new Map(st.base.pis.map(p => [p.id, p])), atrasadas = st.base.abertas.filter(l => l.vencimento && l.vencimento < hoje() && piDe.get(l.pi_id)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const carteira = `<section class="card cm-bloco"><h2 class="cm-h">Carteira em atraso</h2>${atrasadas.length ? `<p class="muted small" style="margin:-6px 0 10px">Parcela atrasada não gera comissão até o cliente pagar.</p><div class="cm-atrasos">${atrasadas.slice(0, 8).map(l => { const pi = piDe.get(l.pi_id), d = Math.round((new Date(hoje() + 'T12:00') - new Date(l.vencimento + 'T12:00')) / 864e5);
        return `<div><span class="cm-at-tx"><b>${esc(l.contraparte || 'Cliente')}</b><small>${esc(nomeDe(pi.consultor_id))} · ${esc((S.veh(pi.veiculo_id) || {}).sigla || '')} ${String(pi.numero).padStart(4, '0')} · venceu ${dfmt(l.vencimento).slice(0, 5)} (${d} dia${d === 1 ? '' : 's'})</small></span><b class="nw">${brl0(l.valor)}</b></div>`; }).join('')}</div>${atrasadas.length > 8 ? `<p class="muted small" style="margin:10px 0 0">e mais ${atrasadas.length - 8}.</p>` : ''}` : '<p class="muted" style="margin:0">Nenhuma parcela de cliente em atraso.</p>'}</section>`;
    const reab = (r.reaberturas || []).length ? `<p class="muted small cm-reab">Reaberto ${r.reaberturas.length} vez${r.reaberturas.length === 1 ? '' : 'es'}: ${r.reaberturas.map(x => `${dfmt(diaDe(x.reaberto_em))} por ${esc(S.usuario(x.reaberto_por) || 'diretor')} ("${esc(x.motivo)}")`).join(' · ')}</p>` : '';
    return { body:`<section class="card cm-topo"><div class="hd"><div><h2>Vendas e comissões</h2><p class="muted small" style="margin:3px 0 0">${lista.filter(o => o.uid).length} ${qtd(lista.filter(o => o.uid).length)} · comissão pelo percentual cadastrado de cada um</p></div>${nav}</div>${faixa}${reab}${lembrete}</section>
      ${kpis}${tabela}<div class="cm-lin2">${porVeic}${carteira}</div>` };
  };

  // ---------- detalhe do consultor ----------
  const telaDetalhe = (uid, mes) => {
    const { lista, fechado } = calcMes(mes), o = lista.find(x => x.uid === uid) || { uid, bruto:0, liq:0, pis:0, meta:0, rec:0, com:0, prev:0, fila:0, atraso:0, itens:[] };
    carregarPer(mes, false); const per = st.per[mes], dir = ehDiretor(), c = colDe(uid), pt = pctsTxt(uid);
    const meses = Array.from({ length:12 }, (_, i) => somaMes(mes, i - 11));
    const vend = meses.map(m => st.base.pis.filter(p => !p.antigo && p.consultor_id === uid).reduce((t, p) => t + S.valorNoMes(p, m), 0));
    const rec = meses.map(m => (per || []).filter(x => x.mes === m && x.consultor_id === uid).reduce((t, x) => t + Number(x.recebido || 0), 0));
    const com = meses.map(m => (per || []).filter(x => x.mes === m && x.consultor_id === uid).reduce((t, x) => t + Number(x.comissao || 0), 0));
    const topo = Math.max(1, ...vend, ...rec), maxC = Math.max(1, ...com);
    const W = 640, H = 180, bw = W / 12;
    const grafico = per ? `<svg class="cm-graf" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Vendido líquido, recebido e comissão nos últimos 12 meses">
        ${meses.map((m, i) => { const x = i * bw, hv = vend[i] / topo * H, hr = rec[i] / topo * H;
          return `<g${m === mes ? ' class="on"' : ''}><title>${S.nomeMes(m)}: vendido ${brl0(vend[i])}, recebido ${brl0(rec[i])}, comissão ${brl0(com[i])}</title><rect class="cm-g1" x="${(x + bw * .16).toFixed(1)}" y="${(H - hv).toFixed(1)}" width="${(bw * .32).toFixed(1)}" height="${hv.toFixed(1)}" rx="3"/><rect class="cm-g2" x="${(x + bw * .52).toFixed(1)}" y="${(H - hr).toFixed(1)}" width="${(bw * .32).toFixed(1)}" height="${hr.toFixed(1)}" rx="3"/><text x="${(x + bw / 2).toFixed(1)}" y="${H + 17}" text-anchor="middle">${MESES[+m.slice(5) - 1].slice(0, 3)}</text></g>`; }).join('')}
        <polyline class="cm-g3" points="${com.map((v, i) => `${(i * bw + bw / 2).toFixed(1)},${(H - v / maxC * H * .9).toFixed(1)}`).join(' ')}"/>
        ${com.map((v, i) => `<circle class="cm-g3p" cx="${(i * bw + bw / 2).toFixed(1)}" cy="${(H - v / maxC * H * .9).toFixed(1)}" r="3"/>`).join('')}</svg>` : '<p class="muted">Buscando os últimos 12 meses…</p>';
    const ext = fechado && (fechado.extratos || {})[uid], pago = fechado && (fechado.pagos || {})[uid];
    // Visualizar (31/10/2026, pedido do Luiz): abre o extrato na tela, com Baixar PDF, E-mail e WhatsApp; enviar vale também no mês aberto (prévia)
    const acoes = `<button class="btn pri" data-act="cmVer" data-id="${uid}">${S.svg('olho')}Visualizar extrato</button>${dir ? `<button class="btn" data-act="cmEnviar" data-id="${uid}">${S.svg('email')}Enviar</button>` : ''}${dir && c ? `<button class="btn" data-act="cmEditarCol" data-id="${c.id}">${S.svg('editar')}Percentual</button>` : ''}`;
    const linhas = o.itens.map(i => `<tr><td class="nw">${dfmt(i.pago_em).slice(0, 5)}${i.mes_pago !== mes ? `<small>pago em ${nomeMes(i.mes_pago)}</small>` : ''}</td><td><b class="clamp2">${esc(i.cliente)}</b><small>${esc(i.pi_no)}${i.mes_ref ? ` · ${S.nomeMes(i.mes_ref)}` : ''}</small></td><td class="r nw">${brl(i.liquido)}${Number(i.liquido) !== Number(i.valor_pago) ? `<small>de ${brl(i.valor_pago)} pagos</small>` : ''}</td><td class="r nw">${pctTxt(i.pct)}</td><td class="r nw"><b>${brl(i.comissao)}</b><small class="cm-so-cel">${pctTxt(i.pct)} de ${brl(i.liquido)}</small></td></tr>`).join('');
    const sit = fechado ? (pago ? `<span class="pill fn-ok">Fechado · paga em ${dfmt(pago)}</span>` : '<span class="pill fn-neutra">Fechado · a pagar</span>') : '<span class="pill fn-neutra">Mês aberto</span>';
    const envios = ext && (ext.envios || []).length ? `<p class="muted small" style="margin:8px 0 0">Extrato enviado: ${ext.envios.map(e => `${{ email:'e-mail', whatsapp:'WhatsApp', pdf:'PDF' }[e.canal] || e.canal} em ${dfmt(diaDe(e.em)).slice(0, 5)}`).join(' · ')}</p>` : '';
    return `<a href="#/admin" class="cm-voltar" data-act="cmVoltar">${S.svg('esq', 16)}Vendas e comissões</a>
      <section class="card cm-dcab"><div class="cm-p grande"><span class="av soft" aria-hidden="true">${esc(S.iniciais(nomeDe(uid)))}</span><span><h2>${esc(nomeDe(uid))}</h2><small>${nomeMesLongo(mes)} · comissão ${pt ? `de <b>${pt}</b> (cadastro)` : '<b class="cm-sempct">sem percentual cadastrado</b>'}</small></span></div>
        <div class="cm-dacoes">${sit}${acoes}</div>${envios}</section>
      <div class="cm-kpis cm-k4"><div class="card cm-kpi"><small>Vendido no mês (líquido)</small><b>${brl0(o.liq)}</b><span>bruto ${brl0(o.bruto)}${o.meta ? ` · meta ${Math.round(o.liq / o.meta * 100)}% de ${brl0(o.meta)}` : ''}</span></div>
        <div class="card cm-kpi"><small>Recebido dos clientes</small><b>${brl0(o.rec)}</b><span>${o.itens.length} parcela${o.itens.length === 1 ? '' : 's'} paga${o.itens.length === 1 ? '' : 's'}</span></div>
        <div class="card cm-kpi dest"><small>Comissão de ${nomeMes(mes)}</small><b>${brl0(o.com)}</b><span>${pt ? `${pt.split(' · ')[0]} × líquido pago` : 'sem percentual: comissão zero'}</span></div>
        <div class="card cm-kpi"><small>Ainda a receber</small><b>${brl0(o.fila)}</b><span>comissão na fila${o.atraso ? ` · ${brl0(o.atraso)} em atraso` : ''}</span></div></div>
      <section class="card cm-bloco"><div class="hd"><h2 class="cm-h">Últimos 12 meses</h2><span class="cm-leg"><span><i class="c1"></i>Vendido líquido</span><span><i class="c2"></i>Recebido</span><span><i class="c3"></i>Comissão</span></span></div>${grafico}</section>
      <section class="card cm-bloco"><h2 class="cm-h">Parcelas que geram a comissão de ${nomeMes(mes)}</h2>
        ${o.itens.length ? `<div class="scroll"><table class="cm-t cm-t-p"><thead><tr><th>Pago em</th><th>Cliente · PI</th><th class="r">Líquido pago</th><th class="r">%</th><th class="r">Comissão</th></tr></thead><tbody>${linhas}</tbody>
          <tfoot><tr><td>Total</td><td></td><td class="r nw">${brl(o.liqPago)}</td><td></td><td class="r nw">${brl(o.com)}</td></tr></tfoot></table></div>`
          : `<p class="muted" style="margin:0">Nenhum cliente dele pagou em ${nomeMes(mes)}${fechado ? '' : ' até agora'}.</p>`}</section>`;
  };

  // ---------- extrato (PDF e página): a folha vem de extrato-folha.js (SONVI_EXTRATO), a mesma da página pública ----------
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const resumoDe = o => ({ nome:nomeDe(o.uid), pct:pctAtual(o.uid), bruto:r2(o.bruto), liquido_vendido:r2(o.liq), pis:o.pis, meta:o.meta, fila:r2(o.fila),
    atrasos:(o.atrasos || []).slice().sort((a, b) => String(a.venc).localeCompare(String(b.venc))).slice(0, 8) });
  const extratoDados = (uid, mes) => { const { lista, fechado } = calcMes(mes), o = lista.find(x => x.uid === uid) || { uid, itens:[], com:0, liq:0, liqPago:0, meta:0, fila:0, bruto:0, pis:0, atrasos:[] };
    const emp = S.db.empresa || {}, pago = fechado && (fechado.pagos || {})[uid], veiculos = {};
    o.itens.forEach(i => { const v = S.veh(i.veiculo_id); if (v) veiculos[i.veiculo_id] = { nome:v.nome, sigla:v.sigla, cor:v.cor }; });
    return { uid, mes, nome:nomeDe(uid), fechado, com:o.com, situacao:pago ? 'paga' : fechado ? 'fechado' : 'previa', fechado_em:fechado ? fechado.fechado_em : null, pago_em:pago || null,
      empresa:{ nome:emp.nome || S.empCurto(), logo:emp.logo || '', cor:emp.cor || '', cor2:emp.cor2 || '', cidade:emp.cidade || '', slug:S.ORG || (S.ctx && S.ctx.org && S.ctx.org.slug) || 'head14' },
      resumo:resumoDe(o), itens:o.itens, veiculos }; };
  const extratoHtml = x => window.SONVI_EXTRATO.html(x);
  const carregarPdfLib = () => window.html2pdf ? Promise.resolve() : new Promise((ok, erro) => { const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível gerar o PDF agora.')); document.head.appendChild(s); });
  const arquivoNome = x => `Extrato de comissão ${x.nome} ${x.mes}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  const gerarPdf = async (x, modo) => { await carregarPdfLib();
    const box = document.createElement('div'); box.className = 'cmx-palco'; box.innerHTML = extratoHtml(x); document.body.appendChild(box);
    try { const w = window.html2pdf().set({ margin:[12, 12, 14, 12], filename:arquivoNome(x), image:{ type:'jpeg', quality:.95 }, html2canvas:{ scale:2, backgroundColor:'#ffffff', scrollX:0, scrollY:0 }, jsPDF:{ unit:'mm', format:'a4', orientation:'portrait' } }).from(box.firstElementChild);
      if (modo === 'base64') { const uri = await w.outputPdf('datauristring'); return String(uri).split(',')[1]; }
      await w.save(); return null; } finally { box.remove(); } };

  // ---------- ações ----------
  const mesAtualTela = () => st.mes || S.mesAtual();
  const recarregarMes = async mes => { delete st.meses[mes]; st.per = {}; await new Promise(fim => { st.buscMes[mes] = false; S.q(S.sb.rpc('comissoes_do_mes', { p_mes:mes })).then(r => { st.meses[mes] = Object.assign(r || { itens:[] }, { em:Date.now() }); }).finally(fim); }); };
  const linkExtrato = token => `${S.ORG ? `https://sonvi.com.br/${S.ORG}/` : new URL('.', location.href).href}extrato.html?e=${token}`;
  const contato = uid => { const c = colDe(uid) || {}, u = (S.db.usuarios || []).find(x => x.id === uid) || {}; return { email:String(c.email || u.email || '').trim(), cel:String(c.celular || u.celular || '').replace(/\D/g, '') }; };
  const assinatura = () => `${(S.me && S.me.nome && !(S.ctx && S.ctx.suporte) ? S.me.nome.split(' ')[0] + ' · ' : '')}${S.empCurto()}`;
  // Saudação editável (e-mail e WhatsApp); no WhatsApp vem depois o bloco organizado, o link e a assinatura (SONVI_EXTRATO.whats)
  const msgPadrao = x => x.situacao === 'previa'
    ? `Olá, ${x.nome.split(' ')[0]}! 👋 Segue a prévia da sua comissão de ${nomeMes(x.mes)}. O mês ainda está aberto, então o valor pode mudar até o fechamento.`
    : `Olá, ${x.nome.split(' ')[0]}! 👋 Segue o seu extrato de comissão de ${nomeMes(x.mes)}. Qualquer dúvida, é só responder.`;
  // Link do extrato: o oficial (mês fechado) ou o da prévia (mês aberto, criado na hora; o mesmo link vira o oficial ao fechar)
  const linkDe = async x => { const ext = x.fechado && x.fechado.extratos[x.uid];
    if (ext) return linkExtrato(ext.token);
    const token = await S.q(S.sb.rpc('extrato_previa_link', { p_usuario:x.uid, p_mes:x.mes, p_resumo:x.resumo })); return linkExtrato(token); };
  const servidor = async corpo => { const { data, error } = await S.sb.functions.invoke('comissoes', { body:corpo });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro); return data; };
  // Números do e-mail (o servidor monta o mesmo topo do extrato)
  const numerosEmail = x => { const c = window.SONVI_EXTRATO.contas(x);
    return { comissao:r2(c.com), recebido:r2(c.rec), liquido:r2(c.liq), pct:c.pct, vendido:r2(c.vend), meta:c.meta, fila:r2(c.fila), situacao:x.situacao, pago_em:x.pago_em || '', parcelas:(x.itens || []).length, cidade:x.empresa.cidade || '' }; };
  const enviarEmail = async (uid, mensagem) => { const mes = mesAtualTela(), x = extratoDados(uid, mes), ext = x.fechado && x.fechado.extratos[uid];
    const pdf = await gerarPdf(x, 'base64'), numeros = numerosEmail(x), assina = assinatura();
    if (ext) await servidor({ acao:'enviar_extrato', extrato:ext.id, pdf, arquivo:arquivoNome(x), mensagem, numeros, assina });
    else await servidor({ acao:'enviar_previa', usuario:uid, mes, comissao:numeros.comissao, resumo:x.resumo, pdf, arquivo:arquivoNome(x), mensagem, numeros, assina }); };
  // WhatsApp: a janela abre já no clique (o Safari bloqueia janela aberta depois) e recebe o endereço quando o link fica pronto
  const abrirWhats = async (uid, mensagem) => { const mes = mesAtualTela(), x = extratoDados(uid, mes), ext = x.fechado && x.fechado.extratos[uid], { cel } = contato(uid);
    const jan = window.open('', '_blank');
    try { const link = await linkDe(x), texto = window.SONVI_EXTRATO.whats(x, { saudacao:mensagem, link, assinatura:assinatura() });
      const url = `https://wa.me/${cel ? (cel.length <= 11 ? '55' : '') + cel : ''}?text=${encodeURIComponent(texto)}`;
      if (jan) jan.location.href = url; else window.open(url, '_blank', 'noopener');
      if (ext) S.q(S.sb.rpc('extrato_registrar_envio', { p_extrato:ext.id, p_canal:'whatsapp' })).catch(() => {}); }
    catch (e) { if (jan) jan.close(); console.error(e); S.toast(S.erro(e)); } };
  // PDF pelo compartilhar do aparelho (celular e Mac): o arquivo fica pronto quando a janela de envio abre, para o clique já compartilhar
  let pdfPronto = null;
  const prepararPdf = x => { pdfPronto = null; if (!navigator.canShare) return; gerarPdf(x, 'base64').then(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const f = new File([u], arquivoNome(x), { type:'application/pdf' }); if (navigator.canShare({ files:[f] })) pdfPronto = { uid:x.uid, mes:x.mes, f }; }).catch(() => {}); };

  Object.assign(S.actions, {
    cmMes: d => { const n = +d.d; st.mes = n === 0 ? '' : somaMes(mesAtualTela(), n); if (st.mes === S.mesAtual()) st.mes = ''; S.render(); },
    cmAbrir: d => { st.det = d.id; S.render(); window.scrollTo(0, 0); },
    cmVoltar: () => { st.det = null; S.render(); },
    cmEditarCol: d => { if (S.actions.colEditar) S.actions.colEditar({ id:d.id }); },
    cmPdf: async d => { const x = extratoDados(d.id, mesAtualTela());
      try { S.toast('Gerando o PDF…'); await gerarPdf(x); const ext = x.fechado && x.fechado.extratos[d.id]; if (ext && ehDiretor()) S.q(S.sb.rpc('extrato_registrar_envio', { p_extrato:ext.id, p_canal:'pdf' })).catch(() => {}); }
      catch (e) { console.error(e); S.toast(S.erro(e)); } },
    cmPlanilha: () => { const mes = mesAtualTela(), { lista, tot } = calcMes(mes), n = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ',');
      const linhas = [['Consultor', 'PIs', 'Vendido bruto', 'Líquido', 'Meta', 'Recebido', 'Percentual', 'Comissão do mês', 'Comissão prevista', 'Propostas criadas', 'Propostas aprovadas', 'Em atraso'].join(';'),
        ...lista.map(o => [nomeDe(o.uid), o.pis, n(o.bruto), n(o.liq), n(o.meta), n(o.rec), o.uid ? (pctsTxt(o.uid) || '').replace(/<[^>]+>/g, '') : '', n(o.com), n(o.prev), o.propC, o.propA, n(o.atraso)].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')),
        ['Total', tot.pis, n(tot.bruto), n(tot.liq), n(tot.meta), n(tot.rec), '', n(tot.com), n(tot.prev), tot.propC, tot.propA, n(tot.atraso)].join(';'), '',
        ['Pago em', 'Consultor', 'Cliente', 'PI', 'Valor pago', 'Líquido pago', 'Percentual', 'Comissão'].join(';'),
        ...lista.flatMap(o => o.itens.map(i => [dfmt(i.pago_em), nomeDe(o.uid), i.cliente, i.pi_no, n(i.valor_pago), n(i.liquido), pctTxt(i.pct), n(i.comissao)].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')))];
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type:'text/csv;charset=utf-8' })); a.download = `Comissões ${mes}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    cmFechar: () => { const mes = mesAtualTela(), { lista, tot } = calcMes(mes), cons = lista.filter(o => o.uid), atr = cons.filter(o => o.atraso), semPct = cons.filter(o => !pctsTxt(o.uid) && o.rec > 0);
      const NM = nomeMes(mes), cur = mes === S.mesAtual();
      S.dialog(`<h2>Fechar as comissões de ${NM}?</h2><p class="muted" style="margin:-6px 0 0">Conferido em ${dfmt(hoje())}, ${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</p>
        <div class="scroll"><table class="cm-t cm-t-s" style="margin-top:12px"><thead><tr><th>Consultor</th><th class="r">Recebido</th><th class="r">%</th><th class="r">Comissão</th></tr></thead>
          <tbody>${cons.map(o => `<tr><td>${esc(nomeDe(o.uid))}</td><td class="r nw">${brl(o.rec)}</td><td class="r nw">${(pctsTxt(o.uid) || 'sem %').split(' · ')[0]}</td><td class="r nw"><b>${brl(o.com)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total a pagar</td><td class="r nw">${brl(tot.rec)}</td><td></td><td class="r nw">${brl(tot.com)}</td></tr></tfoot></table></div>
        <ol class="cm-passos"><li>Os valores de ${NM} ficam congelados e guardados.</li><li>Sai um extrato por consultor, com as parcelas que geraram a comissão.</li><li>Pagamento de ${NM} que chegar depois de hoje entra na comissão do mês seguinte.</li></ol>
        ${cur ? `<p class="note aviso" style="margin:0">${NM[0].toUpperCase() + NM.slice(1)} ainda não terminou. O normal é fechar no começo do mês seguinte.</p>` : ''}
        ${semPct.length ? `<p class="note aviso" style="margin:0">${semPct.map(o => esc(nomeDe(o.uid))).join(', ')} sem percentual cadastrado: a comissão fica zero. Cadastre em Colaboradores antes de fechar.</p>` : ''}
        ${atr.length ? `<p class="note" style="margin:0">Ainda há ${brl(atr.reduce((t, o) => t + o.atraso, 0))} em atraso na carteira (${atr.map(o => esc(nomeDe(o.uid))).join(', ')}). Se o cliente pagar depois, entra no mês seguinte.</p>` : ''}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn pri" value="ok">Fechar e gerar extratos</button></div>`,
        () => { const resumo = {}; cons.forEach(o => { resumo[o.uid] = resumoDe(o); });
          S.run(async () => { await S.q(S.sb.rpc('fechar_comissoes', { p_mes:mes, p_resumo:resumo })); await recarregarMes(mes); }, { titulo:`${NM[0].toUpperCase() + NM.slice(1)} fechado`, sub:`${brl(tot.com)} em comissões · extratos prontos para enviar` }); }); },
    cmMenuMes: (d, botao) => S.menu(botao, [{ label:'Reabrir o mês', icon:'voltar', act:'cmReabrir', perigo:true }]),
    cmReabrir: () => { const mes = mesAtualTela();
      S.dialog(`<h2>Reabrir ${nomeMes(mes)}?</h2><p class="muted" style="margin-top:-6px">Os valores voltam a mudar com os pagamentos e os extratos enviados deixam de abrir. Fica registrado no histórico, com o motivo.</p>
        <label class="f">Motivo<textarea name="motivo" rows="3" required minlength="3" placeholder="Ex.: pagamento lançado com a data errada"></textarea></label>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn perigo" value="ok">Reabrir o mês</button></div>`,
        f => S.run(async () => { await S.q(S.sb.rpc('reabrir_comissoes', { p_mes:mes, p_motivo:f.motivo })); await recarregarMes(mes); }, { titulo:'Mês reaberto', sub:f.motivo })); },
    cmPagas: () => { const mes = mesAtualTela(), { lista, fechado } = calcMes(mes), cons = lista.filter(o => o.uid && (fechado.resumo || {})[o.uid]);
      S.dialog(`<h2>Comissões pagas · ${nomeMes(mes)}</h2><p class="muted" style="margin-top:-6px">Marque quem já recebeu a comissão. O consultor vê "Paga em …".</p>
        <div class="cm-pg">${cons.map(o => `<label class="em-op"><input type="checkbox" name="u_${o.uid}"${(fechado.pagos || {})[o.uid] ? ' checked' : ''}><span>${esc(nomeDe(o.uid))} · <b>${brl(o.com)}</b>${(fechado.pagos || {})[o.uid] ? ` <small class="muted">paga em ${dfmt(fechado.pagos[o.uid])}</small>` : ''}</span></label>`).join('')}</div>
        <label class="f" style="max-width:220px">Data do pagamento<input type="date" name="data" required value="${hoje()}"></label>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn pri" value="ok">Salvar</button></div>`,
        f => { const marcar = cons.filter(o => f['u_' + o.uid] && !(fechado.pagos || {})[o.uid]).map(o => o.uid), tirar = cons.filter(o => !f['u_' + o.uid] && (fechado.pagos || {})[o.uid]).map(o => o.uid);
          S.run(async () => { if (marcar.length) await S.q(S.sb.rpc('comissoes_pagas', { p_mes:mes, p_usuarios:marcar, p_data:f.data }));
            if (tirar.length) await S.q(S.sb.rpc('comissoes_pagas', { p_mes:mes, p_usuarios:tirar, p_data:null })); await recarregarMes(mes); }, { titulo:'Pagamentos salvos', sub:`${marcar.length} marcada${marcar.length === 1 ? '' : 's'}${tirar.length ? ` · ${tirar.length} desmarcada${tirar.length === 1 ? '' : 's'}` : ''}` }); }); },
    cmVer: d => { const uid = d.id, x = extratoDados(uid, mesAtualTela()), dir = ehDiretor();
      S.dialog(`<div class="row mid cm-ver-cab"><h2 class="grow">Extrato de ${esc(x.nome)}</h2><button class="btn" value="x">Fechar</button>
          <button type="button" class="btn" data-act="cmPdf" data-id="${uid}">${S.svg('baixar')}Baixar PDF</button>
          ${dir ? `<button type="button" class="btn" data-act="cmEnviar" data-id="${uid}" data-canal="whatsapp">${S.svg('whats')}WhatsApp</button><button type="button" class="btn pri" data-act="cmEnviar" data-id="${uid}" data-canal="email">${S.svg('email')}E-mail</button>` : ''}</div>
        ${x.fechado ? '' : `<div class="note aviso">Prévia: ${nomeMes(x.mes)} ainda está aberto, então a comissão pode mudar até o fechamento.</div>`}
        <div class="cm-previa ex2-moldura">${extratoHtml(x)}</div>`);
      const dl = document.getElementById('dlg'); dl.classList.add('largo'); const antes = dl.onclose; dl.onclose = ev => { dl.classList.remove('largo'); if (antes) antes(ev); }; },
    cmEnviar: d => { { const dl = document.getElementById('dlg'); if (dl && dl.open) dl.close('x'); }
      const uid = d.id, mes = mesAtualTela(), x = extratoDados(uid, mes), { email, cel } = contato(uid), fech = !!(x.fechado && x.fechado.extratos[uid]);
      const canal0 = d.canal || (email ? 'email' : 'whatsapp'); prepararPdf(x);
      S.dialog(`<h2>Enviar ${fech ? 'o extrato' : 'a prévia'} de ${nomeMes(mes)}</h2><p class="muted" style="margin:-6px 0 0">${esc(x.nome)} · comissão de ${brl(x.com)}${fech ? '' : ' até agora (mês aberto)'}</p>
        <div class="cm-envios" role="radiogroup" aria-label="Como enviar">
          <label class="cm-env"><input type="radio" name="canal" value="email"${email ? (canal0 === 'email' ? ' checked' : '') : ' disabled'}><span class="cm-ei">${S.svg('email')}</span><span><b>E-mail</b><small>${email ? `${esc(email)} · PDF anexado` : 'sem e-mail no cadastro do colaborador'}</small></span></label>
          <label class="cm-env"><input type="radio" name="canal" value="whatsapp"${canal0 === 'whatsapp' || !email ? ' checked' : ''}><span class="cm-ei wa">${S.svg('whats')}</span><span><b>WhatsApp</b><small>${cel ? `${esc(contato(uid).cel.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'))} · ` : 'sem celular no cadastro · '}mensagem organizada com o link do extrato</small></span></label>
          <label class="cm-env"><input type="radio" name="canal" value="pdf"><span class="cm-ei">${S.svg('baixar')}</span><span><b>${navigator.canShare ? 'Enviar o PDF' : 'Baixar PDF'}</b><small>${navigator.canShare ? 'abre o compartilhar do aparelho com o arquivo: escolha o WhatsApp e o consultor' : 'para imprimir ou arrastar na conversa'}</small></span></label></div>
        <label class="f">Saudação<textarea name="mensagem" rows="3">${esc(msgPadrao(x))}</textarea><small class="muted">No WhatsApp, depois dela vão a comissão, o recebido, o vendido, a situação e o link do extrato${fech ? '' : ' (a prévia)'}.</small></label>
        <p class="muted small" style="margin:0">O e-mail sai como "${esc((S.me.nome || '').split(' ')[0] || 'Diretor')} · ${esc(S.empCurto())}" e a resposta volta para você. O link é seguro: abre sem login e mostra só o extrato dele${fech ? '' : '; quando o mês fechar, o mesmo link mostra o extrato oficial'}.</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Enviar</button></div>`,
        async f => { if (f.canal === 'whatsapp') { abrirWhats(uid, f.mensagem); return; }
          if (f.canal === 'pdf') { if (pdfPronto && pdfPronto.uid === uid && pdfPronto.mes === mes) { const texto = window.SONVI_EXTRATO.whats(x, { saudacao:f.mensagem, assinatura:assinatura() });
              navigator.share({ files:[pdfPronto.f], title:arquivoNome(x), text:texto }).catch(e => { if (e && e.name !== 'AbortError') S.actions.cmPdf({ id:uid }); }); return; }
            return S.actions.cmPdf({ id:uid }); }
          S.toast('Gerando o PDF e enviando…');
          await S.run(async () => { await enviarEmail(uid, f.mensagem); await recarregarMes(mes); }, { titulo:fech ? 'Extrato enviado' : 'Prévia enviada', sub:`${x.nome} · ${email}` }); }); },
    cmEnviarTodos: () => { const mes = mesAtualTela(), { lista, fechado } = calcMes(mes), cons = lista.filter(o => o.uid && fechado.extratos[o.uid]);
      const com = cons.map(o => ({ o, ...contato(o.uid) })), porEmail = com.filter(x => x.email), soWhats = com.filter(x => !x.email && x.cel), nada = com.filter(x => !x.email && !x.cel);
      S.dialog(`<h2>Enviar os extratos de ${nomeMes(mes)}</h2>
        <div class="scroll"><table class="cm-t cm-t-s" style="margin-top:8px"><thead><tr><th>Consultor</th><th class="r">Comissão</th><th>Enviar por</th></tr></thead>
          <tbody>${com.map(x => `<tr><td>${esc(nomeDe(x.o.uid))}${(fechado.extratos[x.o.uid].envios || []).length ? '<small class="muted"> · já enviado</small>' : ''}</td><td class="r nw">${brl(x.o.com)}</td><td>${x.email ? '<span class="pill fn-ok">E-mail</span>' : x.cel ? '<span class="pill fn-neutra">WhatsApp</span>' : '<span class="pill fn-forte">sem e-mail e celular</span>'}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small" style="margin:0">Cada um recebe só o seu. Os e-mails saem de uma vez, com o PDF anexado. ${soWhats.length ? 'Quem não tem e-mail recebe pelo WhatsApp: abre um por vez, com a mensagem pronta.' : ''} ${nada.length ? 'Sem e-mail nem celular: baixe o PDF no detalhe do consultor.' : ''}</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok"${porEmail.length || soWhats.length ? '' : ' disabled'}>Enviar ${porEmail.length + soWhats.length === 1 ? 'o extrato' : `os ${porEmail.length + soWhats.length}`}</button></div>`,
        async () => { let ok = 0; const falhas = [];
          for (const x of porEmail) { try { S.toast(`Enviando para ${nomeDe(x.o.uid)}…`); await enviarEmail(x.o.uid, msgPadrao(extratoDados(x.o.uid, mes))); ok++; } catch (e) { console.error(e); falhas.push(`${nomeDe(x.o.uid)}: ${S.erro(e)}`); } }
          await recarregarMes(mes); S.render();
          if (soWhats.length || falhas.length) S.dialog(`<h2>${ok ? `${ok} e-mail${ok === 1 ? '' : 's'} enviado${ok === 1 ? '' : 's'}` : 'Extratos'}</h2>${falhas.length ? `<p class="note aviso">Não saiu: ${falhas.map(esc).join('<br>')}</p>` : ''}
            ${soWhats.length ? `<p>Pelo WhatsApp (abre um por vez):</p><div class="cm-wa">${soWhats.map(x => `<button type="button" class="btn" data-act="cmWhatsUm" data-id="${x.o.uid}">${S.svg('whats')}${esc(nomeDe(x.o.uid))}</button>`).join('')}</div>` : ''}
            <div class="row"><span class="grow"></span><button class="btn" value="x">Fechar</button></div>`);
          else S.salvo('Extratos enviados', { sub:`${ok} e-mail${ok === 1 ? '' : 's'} com o PDF anexado` }); }); },
    cmWhatsUm: (d, botao) => { abrirWhats(d.id, msgPadrao(extratoDados(d.id, mesAtualTela()))); if (botao) { botao.disabled = true; botao.insertAdjacentHTML('beforeend', ' ✓'); } },
  });
  S.comissoesAbrirConsultor = uid => { st.det = uid; };

  // ---------- percentual atual de cada consultor (Dashboards e metas): comissoes_pct ----------
  let pcts = null, pctsEm = 0, pctsBusca = false;
  S.comissaoPct = (uid, veiculo) => {
    if ((!pcts || Date.now() - pctsEm > TTL) && !pctsBusca && S.sb) { pctsBusca = true;
      S.q(S.sb.rpc('comissoes_pct')).then(l => { pcts = l || []; pctsEm = Date.now(); }).catch(e => { console.error(e); pcts = pcts || []; pctsEm = Date.now(); })
        .finally(() => { pctsBusca = false; if (['dashboard', 'geral'].includes(S.route().view)) S.render(); }); }
    if (!pcts) return undefined;
    const r = pcts.find(x => x.usuario_id === uid && (!veiculo || x.veiculo_id === veiculo)); return r && r.pct !== null ? Number(r.pct) : null; };
  S.comissaoPctUsar = l => { pcts = l; pctsEm = Date.now() + 1e9; };   // testes

  // ---------- "Minha comissão" (consultor, no Dashboard do veículo) ----------
  const minhas = {}, minhasBusca = {};
  const minhaMes = mes => { if (!minhas[mes] && !minhasBusca[mes] && S.sb) { minhasBusca[mes] = true;
      S.q(S.sb.rpc('comissoes_do_mes', { p_mes:mes })).then(r => { minhas[mes] = r || { itens:[] }; }).catch(e => { console.error(e); minhas[mes] = { itens:[] }; })
        .finally(() => { minhasBusca[mes] = false; if (S.route().view === 'dashboard') S.render(); }); }
    return minhas[mes]; };
  S.minhaComissaoUsar = (mes, r) => { minhas[mes] = r; };   // testes
  S.minhaComissaoHtml = () => {
    const mes = S.mesAtual(), ant = somaMes(mes, -1), r = minhaMes(mes), ra = minhaMes(ant);
    if (!r) return '<section class="card cm-minha" aria-busy="true"><div class="hd"><h2>Minha comissão</h2></div><p class="muted" style="margin:0">Buscando…</p></section>';
    const soma = (x, k) => (x && x.itens || []).reduce((t, i) => t + Number(i[k] || 0), 0);
    const pc = S.comissaoPct(S.me.id, S.ui.vehicleId);
    const fa = ra && ra.fechamento, pagoAnt = fa && (fa.pagos || {})[S.me.id], extAnt = fa && (fa.extratos || {})[S.me.id];
    const linhaAnt = !ra ? '' : `<div class="cm-mi"><span>${nomeMes(ant)[0].toUpperCase() + nomeMes(ant).slice(1)}</span><b>${brl0(soma(ra, 'comissao'))}</b>${fa ? (pagoAnt ? `<span class="pill fn-ok">Paga em ${dfmt(pagoAnt).slice(0, 5)}</span>` : '<span class="pill fn-neutra">Fechada · a pagar</span>') : '<span class="pill fn-neutra">Ainda aberto</span>'}${extAnt ? `<a href="${esc(linkExtrato(extAnt.token))}" target="_blank" rel="noopener">Ver extrato</a>` : ''}</div>`;
    return `<section class="card cm-minha" aria-labelledby="cm-minha-t"><div class="hd"><h2 id="cm-minha-t">Minha comissão · ${nomeMes(mes)}</h2>${pc !== undefined ? `<span class="muted small">${pc === null ? 'percentual não cadastrado' : `${pctTxt(pc)} do líquido pago`}</span>` : ''}</div>
      <div class="cm-mv"><b>${brl0(soma(r, 'comissao'))}</b><span class="muted small">do que os seus clientes pagaram em ${nomeMes(mes)} (${brl0(soma(r, 'valor_pago'))})</span></div>
      ${linhaAnt}<p class="muted small" style="margin:10px 0 0">A comissão sai conforme os clientes pagam. O mês é fechado pelo diretor no começo do mês seguinte, e o extrato chega para você.</p></section>`;
  };
})();

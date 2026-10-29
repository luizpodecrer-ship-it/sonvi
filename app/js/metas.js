// SONVI · Metas mensais dos consultores (aprovado em 26/10/2026, database/049_repasse_e_metas.sql).
// A meta é por veículo, no cadastro do colaborador consultor. Vendido = valor líquido dos PIs que saíram do comercial
// (na OPEC, aprovados, programados e faturados), pela data de criação. O diretor vê todas; o consultor, só a própria.
(() => {
  const S = window.SONVI, esc = S.esc;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const cache = {}, buscando = {};
  const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  S.mesAtual = (desloca = 0) => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + desloca, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

  // Busca as metas do mês uma vez por mês (e de novo a cada entrada no SONVI); redesenha quando chegam
  S.metasDoMes = mes => {
    if (cache[mes]) return cache[mes];
    if (!buscando[mes] && S.sb) { buscando[mes] = true;
      S.q(S.sb.rpc('metas_do_mes', { p_mes:mes + '-01' })).then(l => { cache[mes] = l || []; }).catch(e => { console.error(e); cache[mes] = []; })
        .finally(() => { buscando[mes] = false; if (['dashboard', 'geral'].includes(S.route().view)) S.render(); }); }
    return null;
  };
  S.metasUsar = (mes, l) => { cache[mes] = l; };          // testes
  S.metasLimpar = () => { Object.keys(cache).forEach(k => delete cache[k]); };

  // Só o valor do mês (decidido em 27/10/2026): um PI de 3 meses conta em cada mês só a grade daquele mês (e a ação digital do mês),
  // no valor líquido (a mesma proporção do PI inteiro: desconto geral e comissão da agência). Sem grades, conta o PI no mês em que nasceu.
  // S.fatiaMes(pi, 'AAAA-MM'): quanto do PI (0 a 1) vai ao ar no mês. É a regra de "venda do mês" em todo o SONVI
  // (29/10/2026: PIs, Dashboards, Controle, Vendas e metas contam pelo mês de veiculação, não pelo dia em que o PI foi criado).
  const fatias = new WeakMap();
  const fatiaMes = (p, mes) => { const d = p.dados || {}; let f = fatias.get(p);
    if (!f || f.d !== d) { let tot = 0; const m = {};
      (d.grids || []).forEach(g => (g.items || []).forEach(it => { const v = S.itemCalc(it).sub; tot += v; if (g.period) m[g.period] = (m[g.period] || 0) + v; }));
      (d.digital || []).forEach(a => { const v = S.digCalc(a).sub, k = a.period || String(a.inicio || '').slice(0, 7); tot += v; if (k) m[k] = (m[k] || 0) + v; });
      f = { d, tot, m }; fatias.set(p, f); }
    if (!f.tot) return String(p.criado_em || '').slice(0, 7) === mes ? 1 : 0;
    return (f.m[mes] || 0) / f.tot; };
  S.fatiaMes = fatiaMes;
  // Primeiro dia com veiculação no mês (para os gráficos por dia); sem grade, o dia em que o PI foi criado
  S.diaNoMes = (p, mes) => { const d = p.dados || {}; let dia = 99;
    (d.grids || []).filter(g => g.period === mes).forEach(g => (g.items || []).forEach(it => Object.entries(it.days || {}).forEach(([k, n]) => { if (Number(n) > 0 && +k < dia) dia = +k; })));
    (d.digital || []).forEach(a => { const i = String(a.inicio || ''); if ((a.period || i.slice(0, 7)) === mes && i.slice(0, 7) === mes) dia = Math.min(dia, +i.slice(8, 10)); else if ((a.period || i.slice(0, 7)) === mes) dia = Math.min(dia, 1); });
    if (dia === 99) { const c = S.dia ? S.dia(p.criado_em) : String(p.criado_em || '').slice(0, 10); dia = c.slice(0, 7) === mes ? +c.slice(8, 10) : 1; }
    return dia; };
  const valorNoMes = (p, mes) => Number(p.valor_liquido ?? p.valor_total ?? 0) * fatiaMes(p, mes);
  S.valorNoMes = valorNoMes;
  const vendidoDe = (pis, mes, usuario, veiculo) => pis.filter(p => VENDIDO.includes(p.status) && p.consultor_id === usuario && (!veiculo || p.veiculo_id === veiculo))
    .reduce((t, p) => t + valorNoMes(p, mes), 0);

  // Cartão "Metas de <mês>". opts: { mes, pis, veiculo (só esse veículo), meu (só a própria), vazio (texto quando não há meta) }
  S.metasHtml = ({ mes, pis, veiculo = null, meu = false, vazio = '' }) => {
    const l = S.metasDoMes(mes); if (!l) return '';
    const doMes = l.filter(x => (!veiculo || x.veiculo_id === veiculo) && (!meu || x.usuario_id === S.me.id));
    const nomeMes = MESES[+mes.slice(5) - 1];
    if (!doMes.length) return vazio ? `<section class="card mt"><div class="hd"><h2>Metas de ${nomeMes}</h2></div><p class="muted" style="margin:0">${vazio}</p></section>` : '';
    // Ritmo do mês: quanto do mês já passou (no mês atual); meses passados contam inteiros
    const hoje = new Date(), [y, m] = mes.split('-').map(Number), dias = new Date(y, m, 0).getDate();
    const ritmo = mes === S.mesAtual() ? hoje.getDate() / dias : mes < S.mesAtual() ? 1 : 0;
    const pessoas = {}; doMes.forEach(x => { const p = pessoas[x.colaborador_id] || (pessoas[x.colaborador_id] = { nome:x.nome, usuario:x.usuario_id, meta:0, vend:0, vs:[] });
      const v = vendidoDe(pis, mes, x.usuario_id, x.veiculo_id); p.meta += Number(x.meta); p.vend += v; p.vs.push({ v:S.veh(x.veiculo_id), meta:Number(x.meta), vend:v }); });
    const lista = Object.values(pessoas).sort((a, b) => b.vend / b.meta - a.vend / a.meta || a.nome.localeCompare(b.nome));
    const pct = (v, t) => t ? Math.round(v / t * 100) : 0;
    const tom = p => p.vend >= p.meta ? 'var(--green)' : ritmo && p.vend / p.meta < ritmo - 0.15 ? 'var(--orange)' : 'var(--accent)';
    const sub = p => { const falta = p.meta - p.vend;
      const partes = !veiculo && p.vs.length > 1 ? p.vs.map(x => `${esc((x.v || {}).nome || '')} ${pct(x.vend, x.meta)}%`).join(' · ') + ' · ' : '';
      return partes + (falta <= 0 ? 'meta batida' : `faltam ${brl0(falta)}`); };
    const meta = lista.reduce((t, p) => t + p.meta, 0), vend = lista.reduce((t, p) => t + p.vend, 0);
    const titulo = meu ? `Minha meta de ${nomeMes}` : `Metas de ${nomeMes}`;
    const resumo = meu || lista.length === 1 ? '' : `<span class="muted small">${veiculo ? esc((S.veh(veiculo) || {}).nome || '') : 'equipe'}: ${brl0(vend)} de ${brl0(meta)} · ${pct(vend, meta)}%</span>`;
    return `<section class="card mt"><div class="hd"><h2>${titulo}</h2>${resumo}</div><div class="mt-l">${lista.map(p => `<div class="mt-p">
        <div class="mt-top"><b>${meu ? 'Vendido no mês' : esc(p.nome)}</b><span class="mt-num">${brl0(p.vend)} de ${brl0(p.meta)} · <b>${pct(p.vend, p.meta)}%</b></span></div>
        <div class="prog" role="progressbar" aria-valuenow="${Math.min(100, pct(p.vend, p.meta))}" aria-valuemin="0" aria-valuemax="100" aria-label="Meta de ${esc(p.nome)}"><i style="width:${Math.min(100, pct(p.vend, p.meta))}%;background:${tom(p)}"></i>${ritmo > 0 && ritmo < 1 ? `<span class="mt-ritmo" style="left:${ritmo * 100}%" title="Onde deveria estar hoje"></span>` : ''}</div>
        <small class="muted">${sub(p)}</small></div>`).join('')}</div>
      <p class="muted small mt-pe">Valor líquido do que vai ao ar no mês, dos PIs enviados para a OPEC em diante (contrato de vários meses conta só a parte de cada mês).${ritmo > 0 && ritmo < 1 ? ' O risco na barra marca onde deveria estar hoje.' : ''}</p></section>`;
  };

  // Faixa "Meta do mês" no alto do Dashboard do veículo (aprovado em 29/10/2026): meta dos consultores, venda realizada,
  // quanto falta (em % e em reais, com os dias úteis que sobram e a projeção no ritmo de hoje) e a comissão do consultor (5% do realizado).
  // O diretor e o gerente veem o veículo inteiro e uma linha por consultor; o consultor vê só a dele. Números rolam (S.roloFixo).
  const diasUteis = (de, ate) => { let n = 0; for (let d = new Date(de); d <= ate; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return n; };
  S.metaFaixa = ({ mes, pis, veiculo, meu = false }) => {
    const l = S.metasDoMes(mes); if (!l) return '';
    const doV = l.filter(x => x.veiculo_id === veiculo && (!meu || x.usuario_id === S.me.id));
    const vend = pis.filter(p => VENDIDO.includes(p.status) && p.veiculo_id === veiculo && (!meu || p.consultor_id === S.me.id));
    const realizado = vend.reduce((t, p) => t + valorNoMes(p, mes), 0), meta = doV.reduce((t, x) => t + Number(x.meta || 0), 0);
    const [y, m] = mes.split('-').map(Number), ini = new Date(y, m - 1, 1), fim = new Date(y, m, 0), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const uTot = diasUteis(ini, fim), uPass = mes === S.mesAtual() ? diasUteis(ini, new Date(hoje.getTime() - 864e5)) : mes < S.mesAtual() ? uTot : 0;
    const uFalta = mes === S.mesAtual() ? diasUteis(hoje, fim) : mes > S.mesAtual() ? uTot : 0;
    const pct = meta ? Math.round(realizado / meta * 100) : 0, falta = Math.max(0, meta - realizado), faltaPct = meta ? Math.max(0, 100 - pct) : 0;
    const proj = meta && uPass && uPass < uTot ? Math.round(realizado / uPass * uTot / meta * 100) : null;
    const cinco = realizado * S.COMISSAO_PCT / 100, nomeMes = MESES[m - 1], k = `mf-${meu ? 'eu' : 'v'}-`;
    const tile = (id, rot, num, sub, cls = '', extra = '') => `<div class="mf-c${cls ? ' ' + cls : ''}"><small>${rot}</small><b>${S.roloFixo(k + id, num)}</b>${extra}<span>${sub}</span></div>`;
    const consultores = [...new Set(doV.map(x => x.usuario_id))];
    const t1 = meta ? tile('meta', meu ? 'Minha meta' : 'Meta dos consultores', brl0(meta), meu ? `Meta de ${nomeMes}` : `Soma das metas de ${consultores.length} consultor${consultores.length === 1 ? '' : 'es'}`)
      : tile('meta', meu ? 'Minha meta' : 'Meta dos consultores', '—', meu ? 'Sem meta cadastrada para este mês' : 'Nenhuma meta cadastrada (Administração › Colaboradores)');
    const barra = meta ? `<span class="mf-prog" role="progressbar" aria-valuenow="${Math.min(100, pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Realizado da meta"><i style="width:${Math.min(100, pct)}%"></i></span>` : '';
    const t2 = tile('real', 'Venda realizada', brl0(realizado), meta ? `${pct}% da meta · ${vend.filter(p => valorNoMes(p, mes) > 0).length} PIs no ar em ${nomeMes}` : `${vend.filter(p => valorNoMes(p, mes) > 0).length} PIs no ar em ${nomeMes}`, 'mf-real', barra);
    const t3 = !meta ? tile('falta', 'Falta para a meta', '—', 'Sem meta para comparar') : falta <= 0 ? tile('falta', 'Falta para a meta', 'Bateu', `${pct}% da meta`, 'mf-ok')
      : tile('falta', 'Falta para a meta', `${faltaPct}%`, `${brl0(falta)}${uFalta ? ` · faltam ${uFalta} dia${uFalta === 1 ? '' : 's'} út${uFalta === 1 ? 'il' : 'eis'} no mês` : ''}`, 'mf-falta', proj !== null ? `<em>No ritmo de hoje: fecha em ${proj}%</em>` : '');
    const t4 = tile('cinco', meu ? `Minha comissão (${S.COMISSAO_PCT}%)` : `Comissão dos consultores (${S.COMISSAO_PCT}%)`, brl0(cinco), `${S.COMISSAO_PCT}% de ${brl0(realizado)} · sai conforme os clientes pagam`);
    let por = '';
    if (!meu) { const us = [...new Set([...consultores, ...vend.filter(p => p.consultor_id && valorNoMes(p, mes) > 0).map(p => p.consultor_id)])];
      const linhas = us.map(u => { const mm = doV.filter(x => x.usuario_id === u).reduce((t, x) => t + Number(x.meta || 0), 0), r = vend.filter(p => p.consultor_id === u).reduce((t, p) => t + valorNoMes(p, mes), 0);
        const nome = (doV.find(x => x.usuario_id === u) || {}).nome || S.usuario(u) || 'Consultor'; return { nome, mm, r, p:mm ? Math.round(r / mm * 100) : null }; })
        .sort((a, b) => (b.p ?? -1) - (a.p ?? -1) || b.r - a.r);
      if (linhas.length) por = `<div class="mf-por"><h3>Por consultor</h3><div class="scroll"><table class="mf-tab"><thead><tr><th>Consultor</th><th class="r">Meta</th><th class="r">Realizado</th><th>Andamento</th><th class="r">Falta</th><th class="r">Comissão</th></tr></thead><tbody>
        ${linhas.map(x => `<tr><td><span class="mf-pes"><span class="av soft" aria-hidden="true">${esc(S.iniciais(x.nome))}</span><b>${esc(x.nome)}</b></span></td><td class="r nw">${x.mm ? brl0(x.mm) : '—'}</td><td class="r nw"><b>${brl0(x.r)}</b></td>
          <td>${x.p === null ? '<span class="muted small">sem meta</span>' : `<span class="mf-and"><span class="mf-prog${x.p >= 100 ? ' ok' : ''}"><i style="width:${Math.min(100, x.p)}%"></i></span><small>${x.p}%</small></span>`}</td>
          <td class="r nw ${x.p !== null && x.p >= 100 ? 'mf-bom' : x.p !== null ? 'mf-ruim' : ''}">${x.p === null ? '—' : x.p >= 100 ? 'Bateu' : `${100 - x.p}%`}</td><td class="r nw">${brl0(x.r * S.COMISSAO_PCT / 100)}</td></tr>`).join('')}</tbody></table></div></div>`; }
    return `<section class="card mf" aria-labelledby="mf-t"><div class="hd"><h2 id="mf-t">${meu ? 'Minha meta' : 'Meta'} de ${nomeMes}</h2><span class="muted small">valor líquido do que vai ao ar no mês</span></div>
      <div class="mf-cards">${t1}${t2}${t3}${t4}</div>${por}</section>`;
  };
})();

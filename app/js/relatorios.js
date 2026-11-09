// SONVI · Relatórios do veículo (aprovado pelo Luiz em 09/11/2026, modelo "Relatórios do veículo").
// Menu do veículo, logo abaixo de Vendas. Quatro relatórios: Vendas do período, Comissões, PIs do período e Clientes e agências.
// Por mês (setas) ou período (mês inicial e final), com consultor e "comparar com o anterior". A folha na tela é o próprio
// relatório: a mesma folha sai na impressão (A4 em pé), no PDF (html2pdf, carregado só na hora), no e-mail (PDF anexado,
// função de borda "email", tipo "relatorio") e na planilha Excel (SheetJS, carregado só na hora).
// Regras: venda = líquido do PI enviado à OPEC, no mês em que vai ao ar (S.valorNoMes); comissão = comissoes_do_mes do banco.
// Quem vê: diretor e gerente, os quatro e a equipe toda; consultor, só os números dele; financeiro, Vendas e Comissões;
// OPEC, só PIs do período. Nada sai como "SONVI": topo com o veículo e a empresa comercial; e-mail "<quem envia> · <veículo>".
// Animações no padrão do SONVI (.vx-entra com --t negativo: a entrada continua entre redesenhos); números com S.roloFixo.
(() => {
  const { esc, brl } = S;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];
  const st = { tipo:'', modo:'mes', mes:'', de:'', ate:'', cons:'', comp:true };
  const coms = {}, comBusca = {}, motivos = {}, motPedidos = new Set();
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nMes = ym => MESES[+ym.slice(5) - 1];
  const Mes = ym => nMes(ym)[0].toUpperCase() + nMes(ym).slice(1);
  const mesAno = ym => `${Mes(ym)} ${ym.slice(0, 4)}`;
  const brl0 = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const curto = n => n >= 1e6 ? (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mi' : n >= 1000 ? (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mil' : String(Math.round(n));
  const pctTxt = n => n === null || n === undefined || isNaN(Number(n)) ? '—' : String(Math.round(Number(n) * 100) / 100).replace('.', ',') + '%';
  const hojeBr = () => { const h = S.today(); return `${h.slice(8, 10)}/${h.slice(5, 7)}/${h.slice(0, 4)}`; };

  // ---------- quem vê o quê ----------
  const TIPOS = [
    ['vendas', 'Vendas do período', 'Líquido, bruto e comissão de agência', 'relatorio'],
    ['comis', 'Comissões', 'O que cada consultor recebe no mês', 'clientes'],
    ['pis', 'PIs do período', 'Situação de cada PI e se a OPEC abriu', 'pis'],
    ['rank', 'Clientes e agências', 'Quem mais comprou no período', 'trofeu']];
  const ehEquipe = () => !!(S.me && S.me.diretor) || ['diretor', 'gerente'].includes(S.perfil);
  const ehCons = () => !ehEquipe() && S.perfil === 'consultor';
  const tiposDe = () => ehEquipe() || ehCons() ? TIPOS : S.perfil === 'financeiro' ? TIPOS.filter(t => ['vendas', 'comis'].includes(t[0])) : S.perfil === 'opec' ? TIPOS.filter(t => t[0] === 'pis') : [];
  const quem = () => ehCons() ? S.me.id : ehEquipe() ? st.cons : '';

  // ---------- período ----------
  const mesesEntre = (de, ate) => { if (!de || !ate) return []; if (de > ate) [de, ate] = [ate, de]; const out = []; for (let m = de; m <= ate && out.length < 36; m = somaMes(m, 1)) out.push(m); return out; };
  const faixa = () => { const h = S.today().slice(0, 7);
    if (st.modo === 'per') { const de = st.de || somaMes(h, -2), ate = st.ate || h; return mesesEntre(de, ate); }
    return [st.mes || h]; };
  const anterior = M => M.map(m => somaMes(m, -M.length));
  const rotulo = M => M.length === 1 ? mesAno(M[0]) : `${mesAno(M[0])} a ${mesAno(M[M.length - 1])}`;
  const rotuloAnt = M => M.length === 1 ? nMes(somaMes(M[0], -1)) : 'período anterior';

  // ---------- dados ----------
  const comDoMes = ym => { const c = coms[ym]; if ((!c || Date.now() - c.em > 120000) && !comBusca[ym]) { comBusca[ym] = true;
      S.q(S.sb.rpc('comissoes_do_mes', { p_mes:ym })).then(r => { coms[ym] = Object.assign(r || { itens:[] }, { em:Date.now() }); }).catch(e => { console.error(e); coms[ym] = { itens:[], em:Date.now() }; })
        .finally(() => { comBusca[ym] = false; if (S.route().view === 'relatorios') S.render(); }); }
    return c || null; };
  S.relComUsar = (ym, r) => { coms[ym] = Object.assign(r, { em:Date.now() + 1e9 }); };   // testes
  const buscaMotivos = lista => { const ids = lista.filter(p => ['devolvido', 'cancelado'].includes(p.status) && !motPedidos.has(p.id)).map(p => p.id); if (!ids.length) return;
    ids.forEach(id => motPedidos.add(id));
    S.q(S.sb.from('pi_historico').select('pi_id, status, nota, em').in('pi_id', ids).in('status', ['devolvido', 'cancelado']).order('em', { ascending:false }))
      .then(r => { (r || []).forEach(h => { if (!(h.pi_id in motivos) && h.nota) motivos[h.pi_id] = h.nota; }); if (S.route().view === 'relatorios') S.render(); }).catch(e => console.error(e)); };
  const pisDoVeiculo = () => (S.db.pis || []).filter(p => !quem() || p.consultor_id === quem());
  const mesesDe = p => { const m = S.mesesDoPi(p); return m.length ? m : [String(p.criado_em || S.today()).slice(0, 7)]; };
  const liqEm = (p, M) => M.reduce((s, m) => s + S.valorNoMes(p, m), 0);
  const fatorBruto = p => { const c = S.calc(p); return c.net > 0 ? c.total / c.net : 1; };
  const vendidosEm = M => pisDoVeiculo().filter(p => VENDIDO.includes(p.status)).map(p => ({ p, v:liqEm(p, M) })).filter(x => x.v > 0.004);
  const soma = l => l.reduce((s, x) => s + x.v, 0);
  const abriu = p => /OPEC abriu/.test(S.seloOpec ? S.seloOpec(p) : '');
  const nomeCons = id => S.usuario(id) || 'Sem consultor';
  const variacao = (agora, antes) => { if (!st.comp) return null; if (!antes) return agora ? { cls:'up', txt:'novo' } : null;
    const d = (agora - antes) / antes * 100, r = Math.round(d * 10) / 10; return { cls:Math.abs(r) < 0.5 ? '' : r > 0 ? 'up' : 'down', txt:`${r > 0 ? '+' : ''}${String(r).replace('.', ',')}%` }; };

  // ---------- os quatro relatórios: cada um devolve a mesma estrutura (números, gráficos, tabela), desenhada na tela, no PDF e no Excel ----------
  const MONTA = {
    vendas: M => { const l = vendidosEm(M), liq = soma(l), bruto = l.reduce((s, x) => s + x.v * fatorBruto(x.p), 0), A = anterior(M), la = vendidosEm(A), liqA = soma(la), brutoA = la.reduce((s, x) => s + x.v * fatorBruto(x.p), 0);
      const fim = M[M.length - 1], m12 = Array.from({ length:12 }, (_, i) => somaMes(fim, i - 11)).map(m => ({ m, v:soma(vendidosEm([m])), on:M.includes(m) }));
      const porC = {}; l.forEach(x => { const k = quem() ? (x.p.cliente_id || '-') : (x.p.consultor_id || '-'); porC[k] = (porC[k] || 0) + x.v; });
      const barras = Object.entries(porC).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [quem() ? (S.nome(k) || 'Sem cliente') : nomeCons(k), v]);
      const ord = l.slice().sort((a, b) => b.v - a.v), equipe = !quem();
      return { titulo:'Vendas do período',
        kpis:[{ r:'Vendido (líquido)', v:liq, d:true, vr:variacao(liq, liqA) }, { r:'Bruto', v:bruto, vr:variacao(bruto, brutoA) }, { r:'Comissão de agências', v:bruto - liq },
          { r:'PIs vendidos', v:l.length, n:true, vr:st.comp ? (() => { const d = l.length - la.length; return { cls:d > 0 ? 'up' : d < 0 ? 'down' : '', txt:`${d > 0 ? '+' : ''}${d} ${Math.abs(d) === 1 ? 'PI' : 'PIs'}` }; })() : null }],
        m12, barras:[{ t:equipe ? 'Por consultor' : 'Maiores clientes', l:barras, tot:liq }],
        tab:{ t:M.length === 1 ? 'PIs que entram no mês' : 'PIs que entram no período', cols:[['PI'], ['Cliente'], ...(equipe ? [['Consultor', 'oc']] : []), ['Bruto', 'n oc'], ['Líquido', 'n dir']],
          linhas:ord.map(x => [{ h:`<b>${esc(S.piNo(x.p))}</b>`, x:S.piNo(x.p) }, { h:`${esc(S.nome(x.p.cliente_id) || '—')}<small>${esc(S.nome(x.p.agencia_id) || 'venda direta')}</small>`, x:S.nome(x.p.cliente_id) || '' },
            ...(equipe ? [{ h:esc(nomeCons(x.p.consultor_id)), x:nomeCons(x.p.consultor_id) }] : []), { h:brl(x.v * fatorBruto(x.p)), x:+(x.v * fatorBruto(x.p)).toFixed(2) }, { h:`<b>${brl(x.v)}</b>`, x:+x.v.toFixed(2) }]),
          total:['Total', ...(equipe ? [''] : []), '', brl(bruto), brl(liq)], totalX:['Total', '', ...(equipe ? [''] : []), +bruto.toFixed(2), +liq.toFixed(2)],
          extraX:[['Agência', x => S.nome(x.p.agencia_id) || 'venda direta']], fonte:ord },
        nota:'Valores líquidos (bruto − comissão da agência), no mês em que vão ao ar.' }; },

    comis: M => { const cs = M.map(comDoMes); if (cs.some(c => !c)) return { titulo:'Comissões dos consultores', espera:true };
      const itens = cs.flatMap(c => c.itens || []).filter(i => i.veiculo_id === S.ui.vehicleId && (!quem() || i.consultor_id === quem()));
      const A = anterior(M), csA = st.comp ? A.map(comDoMes) : [], totA = csA.every(Boolean) ? csA.flatMap(c => c.itens || []).filter(i => i.veiculo_id === S.ui.vehicleId && (!quem() || i.consultor_id === quem())).reduce((s, i) => s + (Number(i.comissao) || 0), 0) : null;
      const por = {}; itens.forEach(i => { const k = i.consultor_id || '-', o = por[k] || (por[k] = { k, base:0, com:0, pct:i.pct, pis:new Set() }); o.base += Number(i.liquido) || 0; o.com += Number(i.comissao) || 0; o.pis.add(i.pi_id); if (i.pct !== null && i.pct !== undefined) o.pct = i.pct; });
      const lista = Object.values(por).sort((a, b) => b.com - a.com), tot = lista.reduce((s, o) => s + o.com, 0), base = lista.reduce((s, o) => s + o.base, 0), nPis = new Set(itens.map(i => i.pi_id)).size;
      const detalhe = !!quem();
      return { titulo:detalhe && ehCons() ? 'Minha comissão' : 'Comissões dos consultores',
        kpis:[{ r:detalhe ? 'Comissão' : 'Total de comissões', v:tot, d:true, vr:totA === null ? null : variacao(tot, totA) }, { r:'Base (vendido líquido)', v:base },
          detalhe ? { r:'Percentual', t:pctTxt(lista[0] ? lista[0].pct : null) } : { r:'Consultores', v:lista.length, n:true }, { r:'PIs na conta', v:nPis, n:true }],
        barras:detalhe ? [] : [{ t:'Comissão por consultor', l:lista.map(o => [nomeCons(o.k), o.com]), tot }],
        texto:{ t:'Como a conta é feita', p:'Percentual cadastrado do consultor × líquido de cada PI enviado para a OPEC, no mês em que o PI vai ao ar. PIs devolvidos e cancelados não entram.' },
        tab:detalhe ? { t:'PI por PI', cols:[['PI'], ['Cliente', 'oc'], ['Mês', 'oc'], ['Líquido', 'n oc'], ['%', 'n oc'], ['Comissão', 'n dir']],
            linhas:itens.slice().sort((a, b) => String(a.mes_ref).localeCompare(String(b.mes_ref)) || String(a.pi_no).localeCompare(String(b.pi_no))).map(i => [{ h:`<b>${esc(i.pi_no)}</b><small class="rl-cel">${esc(i.cliente || '')}</small>`, x:i.pi_no }, { h:esc(i.cliente || '—'), x:i.cliente || '' },
              { h:esc(mesAno(i.mes_ref)), x:mesAno(i.mes_ref) }, { h:brl(i.liquido), x:+Number(i.liquido).toFixed(2) }, { h:pctTxt(i.pct), x:i.pct === null ? '' : Number(i.pct) }, { h:`<b>${brl(i.comissao)}</b>`, x:+Number(i.comissao).toFixed(2) }]),
            total:['Total', '', '', brl(base), '', brl(tot)], totalX:['Total', '', '', +base.toFixed(2), '', +tot.toFixed(2)] }
          : { t:'Resumo por consultor', cols:[['Consultor'], ['PIs', 'n oc'], ['Vendido (líquido)', 'n oc'], ['%', 'n oc'], ['Comissão', 'n dir']],
            linhas:lista.map(o => [{ h:`<b>${esc(nomeCons(o.k))}</b><small class="rl-cel">${o.pis.size} ${o.pis.size === 1 ? 'PI' : 'PIs'} · ${pctTxt(o.pct)} de ${brl0(o.base)}</small>`, x:nomeCons(o.k) }, { h:String(o.pis.size), x:o.pis.size },
              { h:brl(o.base), x:+o.base.toFixed(2) }, { h:pctTxt(o.pct), x:o.pct === null || o.pct === undefined ? '' : Number(o.pct) }, { h:`<b>${brl(o.com)}</b>`, x:+o.com.toFixed(2) }]),
            total:['Total', String(nPis), brl(base), '', brl(tot)], totalX:['Total', nPis, +base.toFixed(2), '', +tot.toFixed(2)] },
        nota:'Comissão sobre o líquido, no mês em que vai ao ar. Mês fechado em Vendas e comissões fica congelado.' }; },

    pis: M => { const l = pisDoVeiculo().filter(p => p.status !== 'rascunho' && mesesDe(p).some(m => M.includes(m))).sort((a, b) => (b.numero || 0) - (a.numero || 0)); buscaMotivos(l);
      const sit = p => p.status === 'cancelado' ? ['can', 'Cancelado'] : p.status === 'devolvido' ? ['dev', 'Devolvido'] : abriu(p) ? ['ok', 'OPEC abriu'] : ['env', 'Aguardando a OPEC'];
      const n = k => l.filter(p => sit(p)[0] === k).length, equipe = !quem();
      return { titulo:'PIs do período',
        kpis:[{ r:'PIs no período', v:l.length, n:true }, { r:'OPEC abriu', v:n('ok'), n:true, d:true }, { r:'Devolvidos', v:n('dev'), n:true }, { r:'Cancelados', v:n('can'), n:true }],
        tab:{ t:'', cols:[['PI'], ['Cliente'], ...(equipe ? [['Consultor', 'oc']] : []), ['Líquido', 'n oc'], ['Situação', 'dir']],
          linhas:l.map(p => { const [k, tx] = sit(p), mot = motivos[p.id];
            return [{ h:`<b>${esc(S.piNo(p))}</b><small>${esc(S.nome(p.agencia_id) || 'venda direta')}</small>`, x:S.piNo(p) }, { h:`${esc(S.nome(p.cliente_id) || '—')}${mot ? `<small>${k === 'can' ? 'Motivo' : 'OPEC'}: ${esc(mot)}</small>` : ''}`, x:S.nome(p.cliente_id) || '' },
              ...(equipe ? [{ h:esc(nomeCons(p.consultor_id)), x:nomeCons(p.consultor_id) }] : []), { h:brl(Number(p.valor_liquido) || 0), x:+(Number(p.valor_liquido) || 0).toFixed(2) }, { h:`<span class="rl-selo ${k}">${tx}</span>`, x:tx }]; }),
          extraX:[['Agência', p => S.nome(p.agencia_id) || 'venda direta'], ['Motivo', p => motivos[p.id] || '']], fonte:l },
        nota:'PIs enviados para a OPEC (já são venda), devolvidos e cancelados com veiculação no período. Rascunhos não entram.' }; },

    rank: M => { const l = vendidosEm(M), liq = soma(l), cl = {}, ag = {}, npi = {}; let dir = 0;
      l.forEach(x => { const c = x.p.cliente_id || '-'; cl[c] = (cl[c] || 0) + x.v; npi[c] = (npi[c] || 0) + 1; if (x.p.agencia_id) ag[x.p.agencia_id] = (ag[x.p.agencia_id] || 0) + x.v; else dir += x.v; });
      const cls = Object.entries(cl).sort((a, b) => b[1] - a[1]), ags = Object.entries(ag).sort((a, b) => b[1] - a[1]), top = cls[0];
      return { titulo:'Clientes e agências',
        kpis:[{ r:'Clientes que compraram', v:cls.length, n:true }, { r:'Maior cliente', v:top ? top[1] : 0, d:true, sub:top ? S.nome(top[0]) || 'Sem cliente' : '—' }, { r:'Via agência', v:liq - dir }, { r:'Venda direta', v:dir }],
        barras:[{ t:'Maiores clientes', l:cls.slice(0, 8).map(([k, v]) => [S.nome(k) || 'Sem cliente', v]), tot:liq }, { t:'Maiores agências', l:ags.slice(0, 8).map(([k, v]) => [S.nome(k) || 'Agência', v]), tot:liq, vazio:'Nenhuma venda por agência no período.' }],
        tab:{ t:'Participação de cada cliente', cols:[['#'], ['Cliente'], ['PIs', 'n oc'], ['Líquido', 'n dir'], ['Participação', 'n oc']],
          linhas:cls.map(([k, v], i) => [{ h:`${i + 1}º`, x:i + 1 }, { h:`<b>${esc(S.nome(k) || 'Sem cliente')}</b>`, x:S.nome(k) || 'Sem cliente' }, { h:String(npi[k]), x:npi[k] }, { h:brl(v), x:+v.toFixed(2) }, { h:pctTxt(liq ? v / liq * 100 : 0), x:liq ? +(v / liq).toFixed(4) : 0 }]),
          total:['', 'Total', String(l.length), brl(liq), '100%'], totalX:['', 'Total', l.length, +liq.toFixed(2), 1] },
        nota:'Valores líquidos, no mês em que vão ao ar.' }; } };

  // ---------- a folha (tela e papel) ----------
  const inicio = {};
  const entrada = k => { const agora = performance.now(); if (!(k in inicio)) inicio[k] = agora; const t = agora - inicio[k]; return t > 2600 ? '' : ` vx-entra" style="--t:-${Math.round(t)}ms`; };
  const folhaHtml = (r, M, papel) => { const v = S.veh(), cons = quem(), ent = papel ? '' : entrada(`${st.tipo}|${M.join()}|${cons}|${st.comp}`);
    const num = (k, x, i) => { const val = x.t !== undefined ? x.t : x.n ? String(Math.round(x.v)) : brl(x.v);
      return `<div class="rl-k${x.d ? ' dest' : ''}" style="--d:${i * 80}ms"><small>${esc(x.r)}</small><b>${papel || x.t !== undefined ? esc(val) : S.roloFixo(`rl-${k}-${i}`, val)}</b>
        ${x.sub ? `<span class="rl-sub">${esc(x.sub)}</span>` : x.vr ? `<span class="rl-var ${x.vr.cls}">${x.vr.cls === 'up' ? '▲ ' : x.vr.cls === 'down' ? '▼ ' : ''}${esc(x.vr.txt)}<span> vs. ${esc(rotuloAnt(M))}</span></span>` : ''}</div>`; };
    const graf = r.m12 ? (() => { const mx = Math.max(1, ...r.m12.map(x => x.v)), passo = (() => { const b = mx / 4, mag = Math.pow(10, Math.floor(Math.log10(b))), f = b / mag; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag; })(), topo = Math.ceil(mx / passo) * passo;
      return `<div class="rl-bloco-g"><h3>Últimos 12 meses</h3><div class="vx-area rl-area${ent}">${Array.from({ length:Math.round(topo / passo) + 1 }, (_, i) => `<span class="vx-gl" style="bottom:${(i * passo / topo * 100).toFixed(2)}%"><small>${i ? curto(i * passo) : '0'}</small></span>`).join('')}
        <div class="vx-plot rl-plot">${r.m12.map((x, i) => `<span class="vx-col${x.on ? ' on' : ''}${x.v ? '' : ' zero'}" style="--h:${(x.v / topo * 100).toFixed(2)}%;--d:${i * 55}ms" tabindex="0" aria-label="${mesAno(x.m)}: ${brl(x.v)}"><i></i>
          ${papel ? '' : `<span class="vx-dica" role="tooltip"><b>${mesAno(x.m)}</b><span>Vendido <b>${brl(x.v)}</b></span></span>`}</span>`).join('')}</div></div>
        <div class="vx-rot rl-rot" aria-hidden="true">${r.m12.map(x => `<small${x.on ? ' class="on"' : ''}>${nMes(x.m).slice(0, 3)}</small>`).join('')}</div></div>`; })() : '';
    const barras = (r.barras || []).map(b => `<div><h3>${esc(b.t)}</h3>${b.l.length ? `<div class="vx-barras${ent}">${b.l.map(([n, val], i) => `<div class="vx-b"><div class="vx-b-t"><span class="vx-b-n"><em>${i + 1}</em>${esc(n)}</span><b>${brl0(val)}</b><small>${b.tot ? Math.round(val / b.tot * 100) : 0}%</small></div>
        <div class="vx-b-tr"><i style="width:${(b.l[0][1] ? val / b.l[0][1] * 100 : 0).toFixed(2)}%;--d:${150 + i * 80}ms"></i></div></div>`).join('')}</div>` : `<p class="muted small">${esc(b.vazio || 'Nada no período.')}</p>`}</div>`);
    const texto = r.texto ? `<div><h3>${esc(r.texto.t)}</h3><p class="rl-tx">${esc(r.texto.p)}</p></div>` : '';
    const meio = [graf, ...barras, texto].filter(Boolean), t = r.tab;
    const tabela = !t ? '' : t.linhas.length ? `${t.t ? `<h3>${esc(t.t)}</h3>` : ''}<table class="rl-tab${ent}"><thead><tr>${t.cols.map(c => `<th class="${c[1] || ''}">${esc(c[0])}</th>`).join('')}</tr></thead>
        <tbody>${t.linhas.map((l, i) => `<tr style="--d:${Math.min(i, 20) * 30}ms">${l.map((c, j) => `<td class="${t.cols[j][1] || ''}">${c.h}</td>`).join('')}</tr>`).join('')}</tbody>
        ${t.total ? `<tfoot><tr>${t.total.map((c, j) => `<td class="${t.cols[j][1] || ''}">${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`
      : `<div class="rl-vazio"><b>Nada no período</b>Experimente outro mês ou um período maior.</div>`;
    return `<article class="rl-folha${papel ? ' rl-papel' : ''}" aria-label="${esc(r.titulo)}">
      <header class="rl-topo"><div class="rl-marca">${S.vav(v)}<div><b>${esc(v.nome)}</b><small>Comercializado por ${esc(S.empCurto())}</small></div></div>
        <div class="rl-tit"><h2>${esc(r.titulo)}</h2><p>${esc(rotulo(M))}${cons ? ` · ${esc(nomeCons(cons))}` : ''} · emitido em ${hojeBr()}</p></div></header>
      ${r.espera ? '<div class="rl-vazio"><b>Buscando as comissões…</b>Leva só um instante.</div>' : `
      <div class="rl-ks${ent}">${r.kpis.map((x, i) => num(st.tipo, x, i)).join('')}</div>
      ${meio.length ? `<div class="rl-meio${meio.length === 1 ? ' um' : ''}">${meio.join('')}</div>` : ''}
      ${tabela}`}
      <footer class="rl-pe"><span>${esc(r.nota || '')}</span><span>${esc(v.nome)} · ${esc(rotulo(M))}</span></footer></article>`; };

  // ---------- tela ----------
  S.views.relatorios = () => {
    const tipos = tiposDe();
    if (!tipos.length) return { title:'Relatórios', actions:'', body:'<div class="card empty"><b>Sem relatórios para o seu acesso</b>Fale com o diretor se precisar de algum.</div>' };
    if (!tipos.some(t => t[0] === st.tipo)) st.tipo = tipos[0][0];
    const M = faixa(), r = MONTA[st.tipo](M), v = S.veh(), h = S.today().slice(0, 7), ym = st.mes || h;
    const consOpc = ehEquipe() ? [...new Set([...S.db.vinculos.filter(x => x.veiculo_id === S.ui.vehicleId && x.perfil === 'consultor').map(x => x.usuario_id), ...(S.db.pis || []).filter(p => VENDIDO.includes(p.status) && p.consultor_id).map(p => p.consultor_id)])]
      .map(id => [id, nomeCons(id)]).sort((a, b) => a[1].localeCompare(b[1])) : [];
    if (st.cons && !consOpc.some(c => c[0] === st.cons)) st.cons = '';
    const cartoes = tipos.length > 1 ? `<div class="rl-tipos" role="group" aria-label="Escolha o relatório">${tipos.map(([k, n, s, ic]) => `<button type="button" class="rl-tipo" data-act="rlTipo" data-id="${k}" aria-pressed="${k === st.tipo}"><span class="rl-ic">${S.svg(ic)}</span><b>${n}</b><small>${s}</small></button>`).join('')}</div>` : '';
    const breve = ehEquipe() ? '<p class="rl-breve">Na próxima etapa: <span>Metas x realizado</span><span>Propostas e conversão</span><span>Clientes parados</span><span>Mapa de inserções</span></p>' : '';
    const barra = `<section class="card rl-barra" aria-label="Período e opções">
      <div class="seg rl-seg" role="group" aria-label="Tipo de período">${[['mes', 'Mês'], ['per', 'Período']].map(([k, n]) => `<button type="button" data-act="rlModo" data-id="${k}" aria-pressed="${st.modo === k}"${st.modo === k ? ' class="on"' : ''}>${n}</button>`).join('')}</div>
      ${st.modo === 'mes' ? `<div class="rl-mes"><button type="button" class="btn sq" data-act="rlMes" data-id="-1" aria-label="Mês anterior">${S.svg('esq')}</button><strong>${mesAno(ym)}</strong><button type="button" class="btn sq" data-act="rlMes" data-id="1" aria-label="Próximo mês"${ym >= somaMes(h, 12) ? ' disabled' : ''}>${S.svg('seta')}</button></div>`
        : `<div class="rl-per"><label class="rl-campo"><span>De</span><input type="month" data-rl="de" value="${M[0]}" aria-label="Mês inicial"></label><label class="rl-campo"><span>até</span><input type="month" data-rl="ate" value="${M[M.length - 1]}" aria-label="Mês final"></label></div>`}
      ${consOpc.length ? `<label class="rl-campo"><span>Consultor</span><select data-rl="cons" aria-label="Consultor"><option value="">Todos</option>${consOpc.map(([id, n]) => `<option value="${id}"${st.cons === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
      ${st.tipo === 'pis' || st.tipo === 'rank' ? '' : `<label class="rl-chk"><input type="checkbox" data-rl="comp"${st.comp ? ' checked' : ''}> Comparar com o ${st.modo === 'mes' ? 'mês' : 'período'} anterior</label>`}
      <span class="grow"></span>
      <div class="rl-acoes"><button type="button" class="btn" data-act="rlVer">${S.svg('olho')}Visualizar</button><button type="button" class="btn" data-act="rlImprimir">${S.svg('imprimir')}Imprimir</button><button type="button" class="btn" data-act="rlPdf">${S.svg('baixar')}PDF</button>
        <button type="button" class="btn" data-act="rlExcel">${S.svg('planilha')}Excel</button><button type="button" class="btn pri" data-act="rlEmail">${S.svg('email')}Enviar por e-mail</button></div></section>`;
    return { title:`<span class="sub">${esc(v.nome)}</span>Relatórios`, actions:'', body:`${cartoes}${breve}${barra}<div class="rl-casca">${folhaHtml(r, M, false)}</div>` };
  };

  // ---------- saídas ----------
  const atual = () => { const M = faixa(); return { M, r:MONTA[st.tipo](M) }; };
  const nomeArq = (r, M) => `${r.titulo} · ${S.veh().nome} · ${rotulo(M)}`.replace(/[\\/:*?"<>|]/g, '-');
  const pronto = r => { if (r.espera) { S.toast('Ainda buscando os números. Tente de novo em um instante.'); return false; } return true; };
  const carregar = (url, teste) => teste() ? Promise.resolve() : new Promise((ok, erro) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível preparar o arquivo agora. Tente de novo.')); document.head.appendChild(s); });
  const gerarPdf = async (modo) => { const { M, r } = atual(); if (!pronto(r)) return null;
    await carregar('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', () => !!window.html2pdf);
    const box = document.createElement('div'); box.className = 'rl-palco'; box.innerHTML = folhaHtml(r, M, true); document.body.appendChild(box);
    try { const w = window.html2pdf().set({ margin:[10, 10, 12, 10], filename:nomeArq(r, M) + '.pdf', image:{ type:'jpeg', quality:.95 }, pagebreak:{ mode:['css', 'legacy'], avoid:['tr', '.rl-k', '.vx-b'] },
        html2canvas:{ scale:2, backgroundColor:'#ffffff', useCORS:true, scrollX:0, scrollY:0 }, jsPDF:{ unit:'mm', format:'a4', orientation:'portrait' } }).from(box.firstElementChild);
      if (modo === 'base64') return { b64:String(await w.outputPdf('datauristring')).split(',')[1], nome:nomeArq(r, M) + '.pdf', r, M };
      await w.save(); return null; } finally { box.remove(); } };

  Object.assign(S.actions, {
    rlTipo: d => { st.tipo = d.id; S.render(); },
    rlModo: d => { st.modo = d.id; if (d.id === 'per' && !st.de) { const h = st.mes || S.today().slice(0, 7); st.de = somaMes(h, -2); st.ate = h; } S.render(); },
    rlMes: d => { const h = S.today().slice(0, 7); st.mes = somaMes(st.mes || h, +d.id); if (st.mes === h) st.mes = ''; S.render(); },
    // Visualizar (09/11/2026, pedido do Luiz): a folha como sai no papel (A4, clara), numa janela grande, com Imprimir, PDF e E-mail
    rlVer: () => { const { M, r } = atual(); if (!pronto(r)) return;
      S.dialog(`<div class="row mid rl-ver-cab"><h2 class="grow">${esc(r.titulo)} <span class="muted">· ${esc(rotulo(M))}</span></h2>
          <button type="button" class="btn" data-act="rlImprimir">${S.svg('imprimir')}Imprimir</button><button type="button" class="btn" data-act="rlPdf">${S.svg('baixar')}PDF</button>
          <button type="button" class="btn" data-act="rlEmail">${S.svg('email')}E-mail</button><button class="btn pri" value="x">Fechar</button></div>
        <div class="rl-ver"><div class="rl-a4">${folhaHtml(r, M, true)}</div></div>`);
      const dl = document.getElementById('dlg'); dl.classList.add('largo', 'rl-dlg'); const antes = dl.onclose; dl.onclose = ev => { dl.classList.remove('largo', 'rl-dlg'); if (antes) antes(ev); }; },
    rlImprimir: () => { const { M, r } = atual(); if (!pronto(r)) return;
      let pg = document.getElementById('pagina'); if (!pg) { pg = document.createElement('style'); pg.id = 'pagina'; document.head.appendChild(pg); }
      pg.textContent = '@media print { @page { size:A4 portrait; margin:10mm; } }';
      document.getElementById('print').innerHTML = folhaHtml(r, M, true);
      const t = document.title; document.title = nomeArq(r, M); setTimeout(() => { window.print(); document.title = t; }, 80); },
    rlPdf: () => S.run(async () => { S.toast('Gerando o PDF…'); await gerarPdf('salvar'); }),
    rlExcel: () => S.run(async () => { const { M, r } = atual(); if (!pronto(r)) return;
      await carregar('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => !!window.XLSX);
      const v = S.veh(), t = r.tab, extra = (t && t.extraX) || [];
      const resumo = [[r.titulo], [v.nome + ' · comercializado por ' + S.empCurto()], ['Período', rotulo(M)], ...(quem() ? [['Consultor', nomeCons(quem())]] : []), ['Emitido em', hojeBr()], [],
        ...r.kpis.map(k => [k.r, k.t !== undefined ? k.t : k.n ? Math.round(k.v) : +Number(k.v).toFixed(2), k.sub || (k.vr ? `${k.vr.txt} vs. ${rotuloAnt(M)}` : '')]), [], [r.nota || '']];
      const wb = XLSX.utils.book_new(), ws1 = XLSX.utils.aoa_to_sheet(resumo); ws1['!cols'] = [{ wch:28 }, { wch:22 }, { wch:30 }]; XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');
      if (t && t.linhas.length) { const cab = [...t.cols.map(c => c[0]), ...extra.map(e => e[0])];
        const linhas = t.linhas.map((l, i) => [...l.map(c => c.x), ...extra.map(e => e[1](t.fonte[i]))]);
        const ws2 = XLSX.utils.aoa_to_sheet([cab, ...linhas, ...(t.totalX ? [t.totalX] : [])]); ws2['!cols'] = cab.map(c => ({ wch:Math.max(12, c.length + 4) }));
        XLSX.utils.book_append_sheet(wb, ws2, 'Detalhe'); }
      const blob = new Blob([XLSX.write(wb, { bookType:'xlsx', type:'array' })], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nomeArq(r, M) + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }),
    rlEmail: () => { const { M, r } = atual(); if (!pronto(r)) return; const v = S.veh(), quemEnvia = S.quemAssina ? S.quemAssina() : '';
      S.dialog(`<h2>Enviar relatório por e-mail</h2><p class="muted" style="margin:-6px 0 0">${esc(r.titulo)} · ${esc(rotulo(M))}</p>
        <label class="f">Para<input name="para" type="text" inputmode="email" autocomplete="off" placeholder="nome@empresa.com.br; outro@empresa.com.br" required><small class="muted">Até 5 e-mails, separados por ponto e vírgula.</small></label>
        <label class="f">Assunto<input name="assunto" type="text" value="${esc(nomeArq(r, M))}" required></label>
        <label class="f">Mensagem<textarea name="texto" rows="3">Olá! Segue o relatório "${esc(r.titulo)}" de ${esc(rotulo(M))}, em PDF anexo.</textarea></label>
        <div class="rl-anexo">${S.svg('doc')}<span><b>${esc(nomeArq(r, M))}.pdf</b><small>Sai como "${quemEnvia ? esc(quemEnvia) + ' · ' : ''}${esc(v.nome)}". A resposta volta para você.</small></span></div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Enviar</button></div>`,
        async f => { const para = String(f.para || '').split(/[,;\s]+/).filter(Boolean);
          if (!para.length || para.length > 5 || !para.every(e => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e))) { S.toast('Confira os e-mails: até 5, separados por ponto e vírgula.'); return; }
          S.toast('Gerando o PDF e enviando…');
          await S.run(async () => { const pdf = await gerarPdf('base64'); if (!pdf) return;
            const { data, error } = await S.sb.functions.invoke('email', { body:{ tipo:'relatorio', veiculo_id:S.ui.vehicleId, para:para.join(','), assunto:f.assunto, texto:f.texto || `Segue o relatório "${pdf.r.titulo}".`, pdf:pdf.b64, arquivo:pdf.nome } });
            if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* */ } throw new Error(m); }
            if (data && data.erro) throw new Error(data.erro); }, { titulo:'Relatório enviado', sub:para.join(', ') }); }); }
  });
  S.changes.push((el, d) => { if (!d.rl) return false;
    if (d.rl === 'comp') st.comp = el.checked; else if (d.rl === 'cons') st.cons = el.value; else if (/^\d{4}-\d{2}$/.test(el.value)) st[d.rl] = el.value;
    S.render(); return true; });
})();

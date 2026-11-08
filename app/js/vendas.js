// SONVI · Vendas (aprovado em 27/10/2026; simplificado em 05/11/2026; refeita em 07/11/2026 como "Minhas vendas" do consultor, modelo "Vendas do consultor").
// PI enviado para a OPEC já é venda: Vendido (líquido, no mês em que vai ao ar), Head 14 (sobre o vendido), Comissões e
// "OPEC abriu x de y", com a tabela dos PIs vendidos no mês. Saíram "Para faturar" e "Recebimento dos clientes"
// (o SONVI não acompanha mais faturamento nem pagamento). A tela antiga do Financeiro continua em #/financeiro, fora do menu.
(() => {
  const { esc, brl, dfmt, num, nfmt } = S;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'], FATURAVEL = ['aprovado', 'programado', 'faturado'];
  const st = { mes:'', aba:'todos', lista:8, cons:'' };
  const dados = { veic:null, fat:[], rep:[], col:[], carregando:false, ok:false };
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nomeMesLongo = ym => { const n = MESES[+ym.slice(5) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${ym.slice(0, 4)}`; };
  const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const maisDias = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const diaDe = ts => ts ? new Date(ts).toLocaleDateString('sv-SE', { timeZone:'America/Cuiaba' }) : '';
  const pago = l => l.valor_pago === null || l.valor_pago === undefined ? Number(l.valor) : Number(l.valor_pago);

  // ---------- dados da tela (pedidos, repasses, colaboradores), uma vez por veículo e de novo a cada entrada ----------
  const carregar = async (forcar) => {
    const v = S.ui.vehicleId; if (!v || dados.carregando || (!forcar && dados.ok && dados.veic === v)) return;
    dados.carregando = true;
    try {
      const so = !S.me.diretor && !S.pode('diretor', 'gerente', 'financeiro');   /* consultor: só o percentual de comissão */
      const [fat, rep, col] = await Promise.all([
        so ? [] : S.todos(S.sb.from('fat_pedidos').select('id, pi_id, mes_ref, situacao, dados, para, criado_em, enviado_em, envios, nota_fiscal, observacao, confirmado_por, confirmado_em').eq('veiculo_id', v)),
        so ? [] : S.q(S.sb.from('repasses').select('*').eq('veiculo_id', v).order('recebido_em')).catch(() => []),
        S.q(S.sb.from('colaboradores').select('usuario_id, nome, comissao, comissao_veiculos')).catch(() => [])]);
      Object.assign(dados, { veic:v, fat:fat || [], rep:rep || [], col:col || [], ok:true });
    } catch (e) { console.error(e); S.toast(S.erro(e)); }
    dados.carregando = false;
    if (S.route().view === 'vendas') S.render();
  };
  const recarregar = async () => { S.db.lancamentos = await S.todos(S.sb.from('lancamentos').select('*').eq('veiculo_id', S.ui.vehicleId)); dados.ok = false; await carregar(true); };
  // Comissões do mês (database/068), guardadas por 2 minutos
  const coms = {}, comBusca = {};
  const comDoMes = ym => { const c = coms[ym]; if ((!c || Date.now() - c.em > 120000) && !comBusca[ym]) { comBusca[ym] = true;
      S.q(S.sb.rpc('comissoes_do_mes', { p_mes:ym })).then(r => { coms[ym] = Object.assign(r || { itens:[] }, { em:Date.now() }); }).catch(e => { console.error(e); coms[ym] = { itens:[], em:Date.now() }; })
        .finally(() => { comBusca[ym] = false; if (S.route().view === 'vendas') S.render(); }); }
    return c || null; };
  S.vendasComUsar = (ym, r) => { coms[ym] = Object.assign(r, { em:Date.now() + 1e9 }); };   // testes
  S.vendasUsar = (d) => Object.assign(dados, { veic:S.ui.vehicleId, ok:true }, d); // testes

  // ---------- números que contam até o valor (2 s, desacelerando no fim); só quando o valor muda, não a cada desenho ----------
  const contados = {};
  const contar = () => { const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-vd-num]').forEach(el => { const k = el.dataset.vdNum, ate = Number(el.dataset.v) || 0, de = contados[k] ?? 0;
      if (de === ate) { el.textContent = brl(ate); return; }
      contados[k] = ate; if (quieto) { el.textContent = brl(ate); return; }
      const t0 = performance.now(), dur = 2000, passo = t => { if (!el.isConnected) return; const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 4);
        el.textContent = brl(de + (ate - de) * e); if (x < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo); }); };

  // ---------- regras ----------
  const mesesDe = p => { const m = S.mesesDoPi(p); return m.length ? m : [String(p.criado_em || S.today()).slice(0, 7)]; };
  const pedidoDe = (pi, mesRef) => dados.fat.find(f => f.pi_id === pi.id && f.mes_ref === mesRef);
  const lancsDe = (pi, mesRef) => S.db.lancamentos.filter(l => l.pi_id === pi.id && (mesRef ? l.mes_ref === mesRef : true));
  // Parte do líquido em cada real recebido do cliente (com agência, o veículo recebe o total e paga a comissão)
  const fatorLiquido = pi => { const c = S.calc(pi), rec = S.billingEntries(pi, c).filter(e => e.para === 'V').reduce((s, e) => s + e.value, 0); return rec ? Math.min(1, c.net / rec) : 1; };
  const pctH14 = pi => S.repassePct ? S.repassePct(pi) : 20;
  // O que será faturado num mês (ainda não enviado): as parcelas calculadas
  const previstas = (pi, mesRef) => mesRef ? S.lancamentosDoPiMes(pi, mesRef) : S.lancamentosDoPi(pi);
  const linhasFaturar = ym => {
    const out = [];
    S.db.pis.filter(p => FATURAVEL.includes(p.status)).forEach(pi => {
      const ms = mesesDe(pi), multi = ms.length > 1; if (!ms.includes(ym)) return;
      const mesRef = multi ? ym : '', ped = pedidoDe(pi, mesRef), reais = lancsDe(pi, mesRef).filter(l => multi || !l.mes_ref), feito = reais.length > 0;
      // 03/11/2026 (database/077): primeiro a venda do mês é lançada (consultor ou diretor); lançar já manda o pedido ao financeiro
      const lanc = S.lancada(pi.id, ym);
      let sit = ped ? (ped.situacao === 'faturado' ? 'faturado' : 'aguardando') : feito ? 'antigo' : pi.status === 'faturado' ? '' : lanc ? 'enviar' : 'lancar';
      if (!sit) return;
      const base = feito ? reais : previstas(pi, mesRef), rec = base.filter(l => l.sentido === 'receber');
      out.push({ pi, ym, mesRef, multi, lanc, idx:ms.indexOf(ym) + 1, n:ms.length, ped, sit, valor:rec.reduce((s, l) => s + Number(l.valor), 0),
        venc:(rec.map(l => l.vencimento).filter(Boolean).sort()[0]) || '' });
    });
    const ord = { lancar:0, enviar:1, aguardando:2, faturado:3, antigo:4 };
    return out.sort((a, b) => ord[a.sit] - ord[b.sit] || String(a.venc).localeCompare(String(b.venc)));
  };
  const temPedido = l => { const pi = S.db.pis.find(p => p.id === l.pi_id); return !!(pi && pedidoDe(pi, l.mes_ref || '')); };
  const linhasReceber = (ym, hoje) => S.db.lancamentos.filter(l => l.sentido === 'receber' && l.pi_id && l.vencimento && (l.vencimento.slice(0, 7) === ym || (ym === hoje.slice(0, 7) && !l.pago_em && l.vencimento < ym + '-01')))
    .sort((a, b) => (a.pago_em ? 1 : 0) - (b.pago_em ? 1 : 0) || a.vencimento.localeCompare(b.vencimento));
  const situacaoParc = (l, hoje) => {
    if (l.pago_em) return { k:'pago', txt:`Pago em ${dfmt(l.pago_em).slice(0, 5)}`, cls:'fn-ok' };
    if (l.vencimento > hoje) return { k:'avencer', txt:'A vencer', cls:'fn-neutra' };
    const d = diasEntre(l.vencimento, hoje);
    if (l.pag_resposta !== 'ainda_nao' && l.pag_perguntas > 0) return { k:'sem', txt:'Sem resposta', cls:'fn-forte' };
    return { k:'atrasado', txt:d ? `Atrasado · ${d} ${d === 1 ? 'dia' : 'dias'}` : 'Vence hoje', cls:d ? 'fn-forte' : 'fn-neutra' };
  };
  const avisoParc = (l, hoje) => {
    if (l.pago_em) return l.pag_respondido_por ? `confirmado por ${esc(l.pag_respondido_por)}<small>em ${dfmt(diaDe(l.pag_respondido_em)).slice(0, 5)}</small>` : 'baixa no SONVI';
    if (l.pag_resposta === 'ainda_nao') return `"Ainda não" em ${dfmt(diaDe(l.pag_respondido_em)).slice(0, 5)}<small>pergunta de novo em ${dfmt(maisDias(diaDe(l.pag_respondido_em), 7)).slice(0, 5)}</small>`;
    if (l.pag_perguntas > 0) return `perguntado ${dfmt(diaDe(l.pag_ultima)).slice(0, 5)}${l.pag_perguntas > 1 ? ` (${l.pag_perguntas}×)` : ''}<small>lembrete em ${dfmt(maisDias(diaDe(l.pag_ultima), 7)).slice(0, 5)}</small>`;
    if (!temPedido(l)) return '<span class="muted">sem pergunta automática</span><small>faturado antes do Vendas</small>';
    return l.vencimento > hoje ? 'pergunta no vencimento' : 'pergunta amanhã cedo';
  };

  // ---------- tela (refeita em 07/11/2026, pedido do Luiz: "Minhas vendas" para o consultor, mais organizada e com gráficos animados) ----------
  // Consultor: só as vendas dele (meta em anel, números do mês, 6 meses em colunas, maiores clientes, PIs com a comissão de cada um).
  // Diretor e gerente: a equipe toda (ou um consultor escolhido no seletor), com "Equipe no mês" e a faixa da Head 14 (repasse).
  // Animações: anel, colunas e barras crescem do último valor mostrado até o novo (vxAnima), nunca a cada desenho igual.
  const memo = {};
  const vxAnima = () => { const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-vx-k]').forEach(el => { const k = el.dataset.vxK, alvo = Number(el.dataset.p) || 0, de = memo[k] ?? 0;
      memo[k] = alvo; if (quieto || de === alvo) { el.style.setProperty('--p', alvo); return; }
      el.style.setProperty('--p', de); void el.getBoundingClientRect(); requestAnimationFrame(() => el.style.setProperty('--p', alvo)); }); };
  const pv = k => memo[k] ?? 0;
  const uteisRestantes = ym => { const hoje = S.today(); if (ym < hoje.slice(0, 7)) return 0;
    const [y, m] = ym.split('-').map(Number), fim = new Date(y, m, 0).getDate(); let n = 0;
    for (let d = ym === hoje.slice(0, 7) ? +hoje.slice(8) + 1 : 1; d <= fim; d++) { const w = new Date(y, m - 1, d).getDay(); if (w > 0 && w < 6) n++; } return n; };
  const brl0 = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const primeiroNome = n => String(n || '').trim().split(/\s+/)[0];
  S.views.vendas = () => {
    carregar(false);
    const hoje = S.today(), ym = st.mes || hoje.slice(0, 7), v = S.veh(), mesNome = MESES[+ym.slice(5) - 1], pis = S.db.pis;
    const ehCons = !S.me.diretor && S.pode('consultor') && !S.pode('diretor', 'gerente');
    const quem = ehCons ? S.me.id : (st.cons || ''), equipe = !quem;
    const meu = p => !quem || p.consultor_id === quem;
    const vendDe = m => pis.filter(p => VENDIDO.includes(p.status) && meu(p)).map(p => ({ p, v:S.valorNoMes(p, m) })).filter(x => x.v > 0);
    const somaV = l => l.reduce((s, x) => s + x.v, 0);
    const vendidos = vendDe(ym), vendido = somaV(vendidos);
    const ant = somaMes(ym, -1), mesAnt = MESES[+ant.slice(5) - 1], vendAnt = somaV(vendDe(ant));
    // Meta deste veículo (do consultor, ou a soma da equipe)
    const metas = S.metasDoMes ? S.metasDoMes(ym) : null, metasV = (metas || []).filter(x => x.veiculo_id === S.ui.vehicleId);
    const metaDe = uid => metasV.filter(x => x.usuario_id === uid).reduce((s, x) => s + Number(x.meta), 0);
    const meta = quem ? metaDe(quem) : metasV.reduce((s, x) => s + Number(x.meta), 0);
    // Comissão (comissoes_do_mes): do consultor ou da equipe, neste veículo
    const cm = comDoMes(ym), itensV = (cm ? cm.itens || [] : []).filter(i => i.veiculo_id === S.ui.vehicleId);
    const comDe = uid => itensV.filter(i => i.consultor_id === uid).reduce((s, i) => s + (Number(i.comissao) || 0), 0);
    const totCom = quem ? comDe(quem) : itensV.reduce((s, i) => s + (Number(i.comissao) || 0), 0);
    const pctDe = uid => { const i = itensV.find(x => x.consultor_id === uid && x.pct !== null && x.pct !== undefined); if (i) return Number(i.pct);
      const c = dados.col.find(x => x.usuario_id === uid); if (!c) return null; const cv = (c.comissao_veiculos || {})[S.ui.vehicleId]; return cv !== undefined && cv !== null && cv !== '' ? Number(cv) : (c.comissao !== null ? Number(c.comissao) : null); };
    const pctQuem = quem ? pctDe(quem) : null;
    const emp = S.empCurto ? S.empCurto() : 'Head 14', pctH = Math.round(pctH14());
    const prevista = vendidos.reduce((s, x) => s + x.v * pctH14(x.p) / 100, 0);
    const abriu = p => /OPEC abriu/.test(S.seloOpec ? S.seloOpec(p) : ''), nAbriu = vendidos.filter(x => abriu(x.p)).length;
    const pis1 = new Set(vendidos.map(x => x.p.id)).size, ticket = pis1 ? vendido / pis1 : 0;
    const nomeQuem = quem ? (S.usuario(quem) || 'Consultor') : '';

    // 1. Topo: anel da meta + quatro números
    const pc = meta ? vendido / meta : 0, faltam = Math.max(0, meta - vendido), ut = uteisRestantes(ym);
    const kAnel = `anel|${quem}|${ym}`;
    const anel = `<div class="vx-anel${meta ? '' : ' sem'}"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="vx-gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>
        <circle class="vx-anel-f" cx="60" cy="60" r="52" pathLength="100"/><circle class="vx-anel-v" cx="60" cy="60" r="52" pathLength="100" data-vx-k="${kAnel}" data-p="${Math.min(1, pc).toFixed(4)}" style="--p:${pv(kAnel)}"/></svg>
      <div class="vx-anel-c">${meta ? `<b>${Math.round(pc * 100)}%</b><small>da meta</small>` : '<b>—</b><small>sem meta</small>'}</div></div>
      <div class="vx-meta-tx">${meta ? `<b>${brl0(vendido)} <span>de ${brl0(meta)}</span></b>
        <small>${faltam ? `Faltam <b>${brl0(faltam)}</b>${ut ? ` · ${ut} ${ut === 1 ? 'dia útil' : 'dias úteis'} · <b>${brl0(faltam / ut)}</b> por dia` : ''}` : '<b class="vx-ok">Meta batida</b> · parabéns!'}</small>`
        : `<b>${brl0(vendido)}</b><small>${S.me.diretor ? 'A meta fica em Administração › Colaboradores.' : 'Sua meta ainda não foi cadastrada pelo diretor.'}</small>`}</div>`;
    const varia = (val, antes) => { if (!antes) return val ? `<span class="vx-var up"><i>↗</i>novo<span class="vx-var-tx"> · sem vendas em ${mesAnt}</span></span>` : `<span class="vx-var">sem vendas em ${mesAnt}</span>`;
      const d = Math.round((val - antes) / antes * 100); return `<span class="vx-var ${d >= 0 ? 'up' : 'down'}"><i>${d >= 0 ? '↗' : '↘'}</i>${d > 0 ? '+' : ''}${d}%<span class="vx-var-tx"> em relação a ${mesAnt}</span></span>`; };
    const num = (k, rot, val, sub, extra = '') => `<div class="vx-n${extra}"><span class="vx-n-r">${rot}</span><b data-vd-num="${k}|${quem}|${ym}" data-v="${val}">${brl(contados[`${k}|${quem}|${ym}`] ?? 0)}</b>${sub}</div>`;
    queueMicrotask(contar);
    const nums = `<div class="vx-ns">
        ${num('vend', 'Vendido (líquido)', vendido, varia(vendido, vendAnt))}
        ${quem ? num('com', equipe ? 'Comissões' : ehCons ? 'Minha comissão' : `Comissão de ${esc(primeiroNome(nomeQuem))}`, totCom, `<span class="vx-sub">${pctQuem !== null ? `${String(pctQuem).replace('.', ',')}% do líquido` : cm ? 'pelo % do cadastro' : 'buscando…'}</span>`)
          : num('h14', `${esc(emp)} (${pctH}%)`, prevista, `<span class="vx-sub">sobre o vendido</span>`)}
        <div class="vx-n"><span class="vx-n-r">PIs enviados</span><b>${pis1}</b><span class="vx-sub">OPEC abriu ${nAbriu} de ${pis1}</span></div>
        ${num('tick', 'Ticket médio', ticket, `<span class="vx-sub">por PI no mês</span>`)}</div>`;
    const sel = ehCons ? '' : `<label class="vx-sel"><span class="sr">Ver vendas de</span><select data-vxcons>${[['', 'Toda a equipe'], ...[...new Set([...S.db.vinculos.filter(x => x.veiculo_id === S.ui.vehicleId && x.perfil === 'consultor').map(x => x.usuario_id), ...pis.filter(p => VENDIDO.includes(p.status) && p.consultor_id).map(p => p.consultor_id)])]
        .map(id => [id, S.usuario(id) || 'Consultor'])].map(([id, n]) => `<option value="${id}"${st.cons === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    const titulo = ehCons ? 'Resumo do mês' : equipe ? 'Vendas da equipe' : `Vendas de ${esc(primeiroNome(nomeQuem))}`;
    const topo = `<section class="card vx-topo" aria-label="${titulo}"><div class="hd vx-hd"><h2>${titulo}</h2><span class="grow"></span>${sel}
        <div class="vd-nav"><button class="btn sm" data-act="vdMes" data-d="-1" aria-label="Mês anterior">‹</button><b>${nomeMesLongo(ym)}</b><button class="btn sm" data-act="vdMes" data-d="1" aria-label="Próximo mês">›</button>${st.mes ? '<button class="btn sm" data-act="vdMes" data-d="0">Hoje</button>' : ''}</div></div>
      <div class="vx-topo-c"><div class="vx-meta">${anel}</div>${nums}</div></section>`;

    // 2. Seis meses em colunas (o mês aberto em destaque; a linha tracejada é a meta do mês)
    const meses6 = Array.from({ length:6 }, (_, i) => somaMes(ym, i - 5)).map(m => ({ m, v:somaV(vendDe(m)) }));
    const topoH = Math.max(1, meta, ...meses6.map(x => x.v));
    const hist = `<section class="card vx-hist" aria-label="Últimos 6 meses"><div class="hd"><h2>Últimos 6 meses</h2><span class="muted small">líquido vendido em cada mês${meta ? ' · tracejado = meta' : ''}</span></div>
      <div class="vx-plot" role="list">${meta ? `<span class="vx-linha-meta" style="bottom:${(meta / topoH * 100).toFixed(2)}%" aria-hidden="true"><em>meta ${brl0(meta)}</em></span>` : ''}
        ${meses6.map(x => { const k = `col|${quem}|${x.m}|${ym}`, on = x.m === ym;
          return `<button type="button" role="listitem" class="vx-col${on ? ' on' : ''}${x.v ? '' : ' zero'}" data-act="vdIrMes" data-m="${x.m}" aria-label="${MESES[+x.m.slice(5) - 1]}: ${brl(x.v)}"${on ? ' aria-current="true"' : ''}>
            <i data-vx-k="${k}" data-p="${(x.v / topoH).toFixed(4)}" style="--p:${pv(k)}"><span class="vx-col-v">${x.v ? brl0(x.v).replace('R$ ', '') : ''}</span></i></button>`; }).join('')}</div>
      <div class="vx-rot" aria-hidden="true">${meses6.map(x => `<small${x.m === ym ? ' class="on"' : ''}>${MESES[+x.m.slice(5) - 1].slice(0, 3)}</small>`).join('')}</div></section>`;

    // 3. Maiores clientes do mês (barras com a parte de cada um)
    const porCli = {}; vendidos.forEach(x => { const c = x.p.cliente_id || '-'; porCli[c] = (porCli[c] || 0) + x.v; });
    const clis = Object.entries(porCli).sort((a, b) => b[1] - a[1]), top = clis.slice(0, 5), outros = clis.slice(5).reduce((s, x) => s + x[1], 0);
    const cliHtml = `<section class="card vx-cli" aria-label="Maiores clientes"><div class="hd"><h2>Maiores clientes · ${mesNome}</h2><span class="muted small">${clis.length} ${clis.length === 1 ? 'cliente' : 'clientes'}</span></div>
      ${top.length ? `<div class="vx-barras">${top.map(([c, val], i) => { const k = `cli|${quem}|${ym}|${c}`, p = vendido ? val / vendido : 0;
          return `<div class="vx-b"><div class="vx-b-t"><span class="vx-b-n"><em>${i + 1}</em>${esc(S.nome(c) || 'Sem cliente')}</span><b>${brl0(val)}</b><small>${Math.round(p * 100)}%</small></div>
            <div class="vx-b-tr"><i data-vx-k="${k}" data-p="${(top[0][1] ? val / top[0][1] : 0).toFixed(4)}" style="--p:${pv(k)};--d:${i * 70}ms"></i></div></div>`; }).join('')}
        ${outros ? `<p class="muted small" style="margin:4px 0 0">+ ${clis.length - 5} ${clis.length - 5 === 1 ? 'cliente' : 'clientes'} · ${brl0(outros)}</p>` : ''}</div>`
        : `<p class="muted" style="margin:0">Nenhuma venda em ${mesNome} ainda.</p>`}</section>`;

    // 4. Equipe no mês (diretor e gerente, com "Toda a equipe"): barra até a meta de cada um
    let eqHtml = '';
    if (equipe) {
      const ids = [...new Set([...S.db.vinculos.filter(x => x.veiculo_id === S.ui.vehicleId && x.perfil === 'consultor').map(x => x.usuario_id), ...vendidos.map(x => x.p.consultor_id).filter(Boolean)])];
      const linhas = ids.map(id => { const vv = somaV(vendidos.filter(x => x.p.consultor_id === id)), mm = metaDe(id); return { id, vv, mm, cc:comDe(id) }; }).sort((a, b) => b.vv - a.vv);
      eqHtml = `<section class="card vx-eq" aria-label="Equipe no mês"><div class="hd"><h2>Equipe · ${mesNome}</h2><span class="muted small">clique para ver as vendas de cada um</span></div>
        ${linhas.length ? `<div class="vx-eq-l">${linhas.map(o => { const k = `eq|${o.id}|${ym}`, p = o.mm ? o.vv / o.mm : 0;
          return `<button type="button" class="vx-eq-i" data-act="vdCons" data-id="${o.id}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(S.usuario(o.id) || '?'))}</span>
            <span class="vx-eq-tx"><b>${esc(S.usuario(o.id) || 'Consultor')}</b><span class="vx-eq-tr"><i data-vx-k="${k}" data-p="${Math.min(1, p).toFixed(4)}" style="--p:${pv(k)}"${p >= 1 ? ' class="ok"' : ''}></i></span>
              <small>${brl0(o.vv)}${o.mm ? ` de ${brl0(o.mm)}` : ' · sem meta'} · comissão ${brl0(o.cc)}</small></span><span class="vx-eq-pc">${o.mm ? Math.round(p * 100) + '%' : '—'}</span></button>`; }).join('')}</div>`
          : '<p class="muted" style="margin:0">Nenhum consultor neste veículo.</p>'}</section>`;
    }

    // 5. Head 14: faixa enxuta só para diretor e gerente
    const reps = dados.rep.filter(r => r.mes === ym), recebidaH = reps.reduce((s, r) => s + Number(r.valor), 0);
    const [ry, rm] = somaMes(ym, 1).split('-'), diaRep = String((S.db.empresa || {}).repasse_dia || 25).padStart(2, '0'), vencRep = `${diaRep}/${rm}/${ry}`;
    const h14Tot = pis.filter(p => VENDIDO.includes(p.status)).reduce((s, p) => s + S.valorNoMes(p, ym) * pctH14(p) / 100, 0);   /* do veículo todo, mesmo com um consultor escolhido */
    const h14 = ehCons ? '' : `<section class="card vx-h14" aria-label="${esc(emp)}"><span class="vx-h14-ic" aria-hidden="true">${S.svg('vendas')}</span>
      <div class="vx-h14-tx"><b>${esc(emp)} · ${pctH}% do líquido de ${mesNome}</b><small>${brl(h14Tot)} sobre o vendido do veículo · recebido ${brl(recebidaH)} · repasse vence ${vencRep}</small>
        ${reps.length ? `<span class="vx-reps">${reps.map(r => `<span>${dfmt(r.recebido_em)} · <b>${brl(r.valor)}</b><button class="btn sm tres" data-act="vdRepExcluir" data-id="${r.id}" aria-label="Excluir este repasse">${S.svg('lixo')}</button></span>`).join('')}</span>` : ''}</div>
      <button class="btn sm" data-act="vdRepasse" data-mes="${ym}" data-v="${Math.max(0, h14Tot - recebidaH).toFixed(2)}">Registrar recebimento</button></section>`;

    // 6. PIs vendidos (consultor: comissão de cada PI; equipe: consultor e Head 14)
    const ord = vendidos.slice().sort((a, b) => b.v - a.v), mostra = ord.slice(0, st.lista);
    const pctPi = p => pctDe(p.consultor_id);
    const linhaV = x => `<tr><td class="nw"><a data-go="/pi/${x.p.id}" class="vx-pi"><b>${esc(S.piNo(x.p))}</b></a><small class="vd-cort" title="${esc(x.p.titulo || '')}">${esc(x.p.titulo || 'Sem título')}</small></td>
        <td>${esc(S.nome(x.p.cliente_id) || '—')}<small>${esc(S.nome(x.p.agencia_id) || 'venda direta')}</small></td>${quem ? '' : `<td>${esc(primeiroNome(S.usuario(x.p.consultor_id)) || '—')}</td>`}
        <td>${S.seloOpec ? S.seloOpec(x.p) : ''}</td><td class="r nw"><b>${brl(x.v)}</b>${x.v < S.calc(x.p).net - 0.01 ? `<small>de ${brl(S.calc(x.p).net)}</small>` : ''}</td>
        <td class="r nw">${quem ? (pctPi(x.p) !== null ? brl(x.v * pctPi(x.p) / 100) : '—') : brl(x.v * pctH14(x.p) / 100)}</td></tr>`;
    const cartao = x => `<a class="vx-pi-c" data-go="/pi/${x.p.id}"><span><b>${esc(S.piNo(x.p))}</b><small>${esc(S.nome(x.p.cliente_id) || '—')}</small></span><span class="r"><b>${brl(x.v)}</b><small>${quem && pctPi(x.p) !== null ? `comissão ${brl(x.v * pctPi(x.p) / 100)}` : abriu(x.p) ? 'OPEC abriu' : 'aguardando a OPEC'}</small></span></a>`;
    const tabela = `<section class="card vx-pis" aria-label="PIs vendidos"><div class="hd"><h2>${ehCons ? 'Meus PIs vendidos' : 'PIs vendidos'} · ${mesNome}</h2><span class="muted small">PI enviado para a OPEC já é venda, no mês em que vai ao ar</span></div>
      ${ord.length ? (S.celular ? `<div class="vx-pi-l">${mostra.map(cartao).join('')}</div>` : `<div class="scroll"><table class="vd-t"><thead><tr><th>PI</th><th>Cliente</th>${quem ? '' : '<th>Consultor</th>'}<th>OPEC</th><th class="r">Líquido no mês</th><th class="r">${quem ? (ehCons ? 'Minha comissão' : 'Comissão') : esc(emp)}</th></tr></thead>
        <tbody>${mostra.map(linhaV).join('')}</tbody></table></div>`)
        + (ord.length > mostra.length ? `<p class="muted small" style="margin:12px 0 0">Mostrando ${mostra.length} de ${ord.length} · <a href="#" data-act="vdMais">ver todos</a></p>` : '')
        : `<div class="empty" style="padding:24px"><b>Nenhuma venda em ${mesNome}</b>Aparece aqui quando um PI que vai ao ar no mês é enviado para a OPEC.</div>`}</section>`;

    queueMicrotask(vxAnima);
    return { title:`<span class="sub">${esc(v.nome)}</span>${ehCons ? 'Minhas vendas' : 'Vendas'}`, actions:'',
      body:`${topo}<div class="vx-grade">${hist}${cliHtml}</div>${eqHtml}${tabela}${h14}` };
  };
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-vxcons]'); if (!s) return; st.cons = s.value; st.lista = 8; S.render(); });

  // ---------- enviar para faturar ----------
  const montar = (pi, mesRef, venc) => {
    const base = mesRef ? S.lancamentosDoPiMes(pi, mesRef, venc || undefined) : S.lancamentosDoPi(pi);
    const ls = !mesRef && venc && base.filter(l => l.sentido === 'receber').length === 1 ? base.map(l => l.sentido === 'receber' ? { ...l, vencimento:venc } : l) : base;
    const rec = ls.filter(l => l.sentido === 'receber'), pg = S.pagadorPi(pi), ms = mesesDe(pi);
    return { ls, dados:{ pi_no:S.piNo(pi), titulo:pi.titulo || '', cliente:pg.nome || S.nome(pi.cliente_id), documento:((pg.pessoa || {}).documento || ''),
      mes_nome:mesRef ? `${S.nomeMes(mesRef)} (mês ${ms.indexOf(mesRef) + 1} de ${ms.length})` : (ms.length === 1 ? S.nomeMes(ms[0]) : ''), valor:rec.reduce((s, l) => s + Number(l.valor), 0),
      vencimento:(rec.map(l => l.vencimento).filter(Boolean).sort()[0]) || '', forma:pi.dados.billing.method || '', email_nota:pg.email || '' } };
  };
  const enviarPedido = async id => {
    const { data, error } = await S.sb.functions.invoke('vendas', { body:{ acao:'pedido', id } });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
  };
  const criarEEnviar = async (pi, mesRef, venc) => {
    const m = montar(pi, mesRef, venc);
    const id = await S.q(S.sb.rpc('enviar_para_faturar', { p_pi:pi.id, p_mes:mesRef || '', p_lancamentos:m.ls, p_dados:m.dados }));
    const r = await S.q(S.sb.from('pis').select('*').eq('id', pi.id).maybeSingle()); if (r) Object.assign(pi, S.piNorm(r));
    delete S.db.hist[pi.id];
    let falhou = '';
    try { await enviarPedido(id); } catch (e) { falhou = e.message; }
    return falhou;
  };
  const campoEmailFin = v => String(v.financeiro_email || '').trim() ? '' : `<label class="f">E-mail do financeiro da ${esc(v.nome)}<input type="email" name="fin_email" required placeholder="financeiro@empresa.com.br" autocomplete="off"></label>
    <p class="muted small" style="margin:-4px 0 0">Fica guardado no cadastro do veículo para os próximos envios.</p>`;
  const guardarEmail = async (v, f) => { const e = String(f.fin_email || '').trim().toLowerCase(); if (!e) return;
    await S.salvar('veiculos', { id:v.id, financeiro_email:e }); v.financeiro_email = e; };

  // ---------- lançar a venda do mês (03/11/2026, database/077) ----------
  // Quem lança: o consultor do PI, o gerente e o diretor (o banco confere em lancar_venda). Lançar = a venda entra nos números
  // e, se o veículo tem o e-mail do financeiro, o pedido de faturamento daquele mês vai junto (enviar_para_faturar).
  S.podeLancar = pi => !!pi && ['aprovado', 'programado', 'faturado'].includes(pi.status) && (S.me.diretor || S.perfil === 'gerente' || (S.perfil === 'consultor' && pi.consultor_id === S.me.id));
  S.progPill = (pi, curto) => pi.programado_em ? `<span class="pill vd-prog" title="Programado pela OPEC">✓ ${curto ? 'Programado' : 'Programado pela OPEC'} · ${new Date(pi.programado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).replace(',', ' às')}</span>` : '<span class="pill vd-prog">✓ Programado</span>';
  const recarregarLanc = async () => { const v = S.ui.vehicleId;
    S.registrarLancadas(await S.todos(S.sb.from('vendas_lancadas').select('id, pi_id, veiculo_id, mes, valor, lancado_por, lancado_em').eq('veiculo_id', v)), k => S.db.pis.some(p => k.startsWith(p.id + '|')));
    const ps = await S.todos(S.sb.from('pis').select('*').eq('veiculo_id', v)); S.db.pis = ps.map(S.piNorm);
    if (S.pode('diretor', 'financeiro')) await recarregar(); else dados.ok = false;
    if (S.carregarGeral && S.geralLimpar) S.geralLimpar(); };
  const lancarUm = async (pi, ym, venc) => {
    const ms = mesesDe(pi), multi = ms.length > 1, mesRef = multi ? ym : '';
    await S.q(S.sb.rpc('lancar_venda', { p_pi:pi.id, p_mes:ym, p_valor:Math.round(S.previstoNoMes(pi, ym) * 100) / 100 }));
    const v = S.veh(pi.veiculo_id);
    if (!String(v.financeiro_email || '').trim()) return 'sem e-mail do financeiro';
    if (pedidoDe(pi, mesRef) || lancsDe(pi, mesRef).filter(l => multi || !l.mes_ref).length) return '';
    try { return await criarEEnviar(pi, mesRef, venc); } catch (e) { return S.erro(e); }
  };
  S.lancarVenda = (piId, ym) => { const pi = S.db.pis.find(p => p.id === piId); if (!pi) return;
    if (!S.podeLancar(pi)) return S.toast('Só o consultor do PI ou o diretor lança esta venda.');
    const v = S.veh(pi.veiculo_id), ms = mesesDe(pi), multi = ms.length > 1, mesRef = multi ? ym : '', valor = S.previstoNoMes(pi, ym);
    const m0 = montar(pi, mesRef), rec = m0.ls.filter(l => l.sentido === 'receber'), um = rec.length <= 1, temFin = !!String(v.financeiro_email || '').trim();
    S.dialog(`<h2>Lançar venda · ${esc(S.piNo(pi))}</h2><p class="muted" style="margin-top:-6px">${esc(pi.titulo || '')} · ${esc(S.nome(pi.cliente_id))}</p>
      <div class="list"><div><span class="tx"><b>${S.nomeMes(ym)}</b><small>${multi ? `mês ${ms.indexOf(ym) + 1} de ${ms.length}` : 'mês único'} · ${S.progPill(pi)}</small></span><b>${brl(valor)}</b></div></div>
      ${temFin && um ? `<div class="g2"><label class="f">Vencimento<input type="date" name="venc" value="${esc((rec[0] || {}).vencimento || '')}"></label></div>` : ''}
      <p class="note info" style="margin:0">O valor líquido entra na venda de ${S.nomeMes(ym).toLowerCase()} (Dashboards, metas, ${esc(S.empCurto ? S.empCurto() : 'Head 14')} e comissões).${temFin ? ` O pedido de faturamento vai ao financeiro da ${esc(v.nome)} (${esc(v.financeiro_email)}), que confirma a nota.` : ` Falta o e-mail do financeiro da ${esc(v.nome)}: o pedido de faturamento fica para depois.`}</p>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Lançar venda</button></div>`,
      f => S.run(async () => { const falhou = await lancarUm(pi, ym, um ? f.venc : ''); await recarregarLanc(); S.render();
        if (falhou) S.toast(`Venda lançada. O pedido ao financeiro não saiu (${falhou}). Use "Enviar para faturar" em Vendas.`); },
        { titulo:'Venda lançada', sub:`${S.piNo(pi)} · ${S.nomeMes(ym)} · ${brl(valor)}` })); };

  Object.assign(S.actions, {
    vdLancar: d => S.lancarVenda(d.id, d.mes),
    vdLancarTodos: d => { const ym = d.mes, l = linhasFaturar(ym).filter(x => x.sit === 'lancar' && S.podeLancar(x.pi)); if (!l.length) return;
      S.dialog(`<h2>Lançar ${l.length} vendas de ${S.nomeMes(ym).toLowerCase()}</h2><p class="muted" style="margin-top:-6px">Cada venda entra nos números e o pedido de faturamento vai ao financeiro do veículo.</p>
        <div class="list">${l.map(x => `<div><span class="tx"><b>${esc(S.piNo(x.pi))} · ${esc(S.nome(x.pi.cliente_id))}</b><small>${S.nomeMes(x.ym)}${x.multi ? ` · mês ${x.idx} de ${x.n}` : ''}</small></span><b>${brl(S.previstoNoMes(x.pi, ym))}</b></div>`).join('')}</div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Lançar as ${l.length}</button></div>`,
        () => S.run(async () => { const falhas = [];
          for (const x of l) { try { const e = await lancarUm(x.pi, ym, ''); if (e) falhas.push(`${S.piNo(x.pi)}: pedido não saiu (${e})`); } catch (e) { falhas.push(`${S.piNo(x.pi)}: ${S.erro(e)}`); } }
          await recarregarLanc(); S.render(); if (falhas.length) S.toast(`Lançadas com ${falhas.length} aviso(s): ${falhas.join('; ')}`); }, { titulo:`${l.length} vendas lançadas`, sub:S.nomeMes(ym) })); },
    vdDesfazer: async d => { const pi = S.db.pis.find(p => p.id === d.id); if (!pi) return;
      if (!await S.confirmar(`Desfazer o lançamento de ${S.nomeMes(d.mes).toLowerCase()} do ${S.piNo(pi)}?\n\nA venda sai dos números e o pedido de faturamento deste mês é cancelado.`, { ok:'Desfazer lançamento', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.rpc('desfazer_venda', { p_pi:pi.id, p_mes:d.mes })); S.lancReg.delete(pi.id + '|' + d.mes); await recarregarLanc(); S.render(); }, 'Lançamento desfeito'); },
    vdMes: d => { const hoje = S.today().slice(0, 7), atual = st.mes || hoje, alvo = +d.d ? somaMes(atual, +d.d) : hoje; st.mes = alvo === hoje ? '' : alvo; st.lista = 8; S.render(); },
    vdAba: d => { st.aba = d.v; st.lista = 8; S.render(); },
    vdMais: () => { st.lista = 999; S.render(); },
    vdIrMes: d => { const hoje = S.today().slice(0, 7); st.mes = d.m === hoje ? '' : d.m; st.lista = 8; S.render(); },
    vdCons: d => { st.cons = d.id; st.lista = 8; S.render(); window.scrollTo({ top:0, behavior:'smooth' }); },
    vdComissoes: () => { if (S.admAbrir) S.admAbrir('comissoes'); },
    vdEnviar: d => { const pi = S.db.pis.find(p => p.id === d.id); if (!pi) return; const v = S.veh(pi.veiculo_id), mesRef = d.mes || '';
      if (!S.pode('diretor', 'financeiro')) return S.toast('Só o diretor ou o financeiro envia para faturar.');
      const ms = mesesDe(pi), m0 = montar(pi, mesRef), rec = m0.ls.filter(l => l.sentido === 'receber'), um = rec.length <= 1;
      S.dialog(`<h2>Enviar para faturar · ${esc(S.piNo(pi))}</h2><p class="muted" style="margin-top:-6px">${esc(pi.titulo || '')} · ${esc(m0.dados.cliente)}</p>
        <table><thead><tr><th>Lançamento</th><th>De / para</th><th class="r">Valor</th></tr></thead><tbody>${m0.ls.map(l => `<tr><td>${l.sentido === 'receber' ? 'Receber' : 'Pagar'}${m0.ls.length > 1 && !mesRef ? ` · parcela ${l.parcela}` : ''}${!um && !mesRef ? ` · vence ${l.vencimento ? dfmt(l.vencimento) : 'a combinar'}` : ''}</td><td>${esc(l.contraparte)}</td><td class="r nw">${brl(l.valor)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Este PI não gera valores para o veículo.</td></tr>'}</tbody></table>
        <div class="g2">${mesRef ? `<label class="f">Mês veiculado<input value="${S.nomeMes(mesRef)} · mês ${ms.indexOf(mesRef) + 1} de ${ms.length}" disabled></label>` : ''}
          ${um ? `<label class="f">Vencimento<input type="date" name="venc" value="${esc((rec[0] || {}).vencimento || '')}"></label>` : ''}</div>
        ${campoEmailFin(v)}
        <p class="note info" style="margin:0">O financeiro da ${esc(v.nome)}${v.financeiro_email ? ` (${esc(v.financeiro_email)})` : ''} recebe o pedido por e-mail, com o nome ${pi.consultor_id && S.usuario(pi.consultor_id) ? `do consultor do PI (${esc(S.usuario(pi.consultor_id))})` : 'de quem envia'} como remetente, e confirma pelo link com o número da nota. Toda semana sem confirmação, o SONVI lembra.</p>
        ${m0.dados.email_nota ? '' : '<p class="note aviso" style="margin:0">O cliente está sem e-mail de faturamento: o pedido sai sem o "nota e boleto para". Complete o cadastro quando puder.</p>'}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Enviar para faturar</button></div>`,
        f => S.run(async () => { await guardarEmail(v, f); const falhou = await criarEEnviar(pi, mesRef, um ? f.venc : ''); await recarregar();
          if (falhou) S.toast(`Faturamento criado, mas o e-mail não saiu: ${falhou}. Use "Reenviar".`); else S.toast(`Pedido enviado ao financeiro da ${v.nome}`); })); },
    vdEnviarTodos: d => { const ym = d.mes, l = linhasFaturar(ym).filter(x => x.sit === 'enviar'), v = S.veh(); if (!l.length) return;
      S.dialog(`<h2>Enviar ${l.length} pedidos para faturar</h2><p class="muted" style="margin-top:-6px">Cada um vai num e-mail ao financeiro da ${esc(v.nome)}, com o nome do consultor do PI e o vencimento já combinado.</p>
        <div class="list">${l.map(x => `<div><span class="tx"><b>${esc(S.piNo(x.pi))} · ${esc(S.nome(x.pi.cliente_id))}</b><small>${S.nomeMes(x.ym)} · vence ${x.venc ? dfmt(x.venc) : 'a combinar'}</small></span><b>${brl(x.valor)}</b></div>`).join('')}</div>
        ${campoEmailFin(v)}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Enviar os ${l.length}</button></div>`,
        f => S.run(async () => { await guardarEmail(v, f); const falhas = [];
          for (const x of l) { try { const e = await criarEEnviar(x.pi, x.mesRef, ''); if (e) falhas.push(`${S.piNo(x.pi)}: e-mail não saiu`); } catch (e) { falhas.push(`${S.piNo(x.pi)}: ${S.erro(e)}`); } }
          await recarregar(); S.toast(falhas.length ? `Enviados com ${falhas.length} problema(s): ${falhas.join('; ')}` : `${l.length} pedidos enviados`); })); },
    vdReenviar: d => S.run(async () => { await enviarPedido(d.id); await recarregar(); }, 'Pedido reenviado ao financeiro'),
    vdPerguntar: d => S.run(async () => { const { data, error } = await S.sb.functions.invoke('vendas', { body:{ acao:'perguntar', id:d.id } });
      if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
      if (data && data.erro) throw new Error(data.erro); await recarregar(); }, 'Pergunta enviada ao financeiro do veículo'),
    vdMenuPi: (d, botao) => { const pi = S.db.pis.find(p => p.id === d.id), lanc = pi && d.mes && S.lancada(pi.id, d.mes), ped = d.ped && dados.fat.find(f => f.id === d.ped);
      S.menu(botao, [{ label:'Abrir o PI', icon:'pis', act:'finVerPi', data:{ id:d.id } }, ...(d.ped ? [{ label:'Ver o pedido', icon:'doc', act:'vdPedido', data:{ id:d.ped } }] : []),
]); },
    vdPedido: d => { const f = dados.fat.find(x => x.id === d.id); if (!f) return; const x = f.dados || {}, lin = (a, b) => b ? `<tr><td class="muted">${a}</td><td class="r"><b>${b}</b></td></tr>` : '';
      S.dialog(`<h2>Pedido de faturamento</h2><p class="muted small">${esc(x.pi_no || '')} · ${esc(x.cliente || '')}</p>
        <table>${lin('Mês', esc(x.mes_nome || ''))}${lin('Valor', brl(x.valor))}${lin('Enviado para', esc(f.para))}${lin('Enviado em', f.enviado_em ? new Date(f.enviado_em).toLocaleString('pt-BR') : '')}${lin('Envios', String(f.envios || 0))}
          ${lin('Situação', f.situacao === 'faturado' ? 'Faturado' : 'Aguardando o financeiro')}${lin('Nota fiscal', esc(f.nota_fiscal))}${lin('Confirmado por', esc(f.confirmado_por))}${lin('Confirmado em', f.confirmado_em ? new Date(f.confirmado_em).toLocaleString('pt-BR') : '')}${lin('Observação', esc(f.observacao))}</table>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Fechar</button></div>`); },
    vdMenuParc: (d, botao) => { const l = S.db.lancamentos.find(x => x.id === d.id); if (!l) return;
      S.menu(botao, [{ label:'Histórico da parcela', icon:'relogio', act:'vdHist', data:{ id:l.id } }, ...(l.pi_id ? [{ label:'Abrir o PI', icon:'pis', act:'finVerPi', data:{ id:l.pi_id } }] : []), '-',
        ...(l.pago_em ? [{ label:'Desfazer o pagamento', icon:'voltar', act:'finEstornar', data:{ id:l.id }, perigo:true }]
          : [{ label:`Marcar como pago (${S.empCurto ? S.empCurto() : 'Head 14'})`, icon:'check', act:'finBaixa', data:{ id:l.id } }, { label:'Mudar vencimento', icon:'relogio', act:'finVenc', data:{ id:l.id } }])]); },
    vdHist: d => { const l = S.db.lancamentos.find(x => x.id === d.id); if (!l) return; const lin = (a, b) => b ? `<tr><td class="muted">${a}</td><td class="r"><b>${b}</b></td></tr>` : '', dt = ts => ts ? new Date(ts).toLocaleString('pt-BR') : '';
      S.dialog(`<h2>Histórico da parcela</h2><p class="muted small">${esc(l.contraparte)} · ${esc(l.descricao)}</p>
        <table>${lin('Valor', brl(l.valor))}${lin('Vencimento', dfmt(l.vencimento))}${lin('Nota fiscal', esc(l.nota_fiscal))}${lin('Perguntas feitas', String(l.pag_perguntas || 0))}${lin('Última pergunta', dt(l.pag_ultima))}
          ${lin('Resposta', l.pag_resposta === 'pago' ? 'Pago' : l.pag_resposta === 'ainda_nao' ? 'Ainda não' : '')}${lin('Respondido por', esc(l.pag_respondido_por))}${lin('Respondido em', dt(l.pag_respondido_em))}
          ${lin('Pago em', dfmt(l.pago_em))}${lin('Valor recebido', l.pago_em ? brl(pago(l)) : '')}${lin('Observação', esc(l.observacao))}</table>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Fechar</button></div>`); },
    vdRepasse: d => { const emp = S.empCurto ? S.empCurto() : 'Head 14';
      S.form(`Repasse recebido · ${MESES[+d.mes.slice(5) - 1]}`, [{ k:'valor', label:'Valor recebido (R$)', req:true, mask:'dec' }, { k:'recebido_em', label:'Recebido em', type:'date', req:true },
        { k:'observacao', label:'Observação', full:true, ph:'Ex.: Pix de 25/12' }, { html:`<p class="muted small" style="grid-column:1/-1;margin:0">O que a ${esc(emp)} recebeu da ${esc(S.veh().nome)} pelos pagamentos de ${MESES[+d.mes.slice(5) - 1]}.</p>` }],
        { valor:Number(d.v) ? nfmt(Number(d.v)) : '', recebido_em:S.today() },
        v => S.run(async () => { const valor = num(v.valor); if (!(valor > 0)) throw new Error('Informe o valor recebido.');
          await S.q(S.sb.from('repasses').insert({ veiculo_id:S.ui.vehicleId, mes:d.mes, valor, recebido_em:v.recebido_em, observacao:(v.observacao || '').trim() })); await carregar(true); }, 'Repasse registrado'), 'Registrar', { editar:true }); },
    vdRepExcluir: async d => { if (!await S.confirmar('Excluir este repasse registrado?', { ok:'Excluir', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.from('repasses').delete().eq('id', d.id)); await carregar(true); }, 'Repasse excluído'); },
  });
  window.addEventListener('hashchange', () => { if (/^#\/vendas/.test(location.hash)) dados.ok = false; });
})();

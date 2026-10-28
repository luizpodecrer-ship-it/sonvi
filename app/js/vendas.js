// SONVI · Vendas (aprovado em 27/10/2026, mockup "SONVI · Vendas"; database/055, função de borda "vendas").
// No lugar do Financeiro no menu: quem fatura, emite a nota e recebe é o financeiro de cada veículo; a Head 14 faz a
// gestão comercial e acompanha. Por mês: vendido (com a meta), faturado pelo veículo, recebido dos clientes e a parte
// da Head 14; "Para faturar" (Enviar para faturar → e-mail ao financeiro do veículo com link seguro; ele confirma com o
// nº da nota), "Recebimento dos clientes" (o SONVI pergunta "o cliente pagou?" no vencimento e uma vez por semana),
// "Parte da Head 14" (prevista, devida, recebida; repasse no dia 25 do mês seguinte) e "Comissões".
// A tela antiga do Financeiro continua em #/financeiro (relatórios, baixa manual, avulso), fora do menu.
(() => {
  const { esc, brl, dfmt, num, nfmt } = S;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'], FATURAVEL = ['aprovado', 'programado', 'faturado'];
  const st = { mes:'', aba:'todos', lista:8 };
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
      const [fat, rep, col] = await Promise.all([
        S.q(S.sb.from('fat_pedidos').select('id, pi_id, mes_ref, situacao, dados, para, criado_em, enviado_em, envios, nota_fiscal, observacao, confirmado_por, confirmado_em').eq('veiculo_id', v)),
        S.q(S.sb.from('repasses').select('*').eq('veiculo_id', v).order('recebido_em')),
        S.q(S.sb.from('colaboradores').select('usuario_id, nome, comissao, comissao_veiculos')).catch(() => [])]);
      Object.assign(dados, { veic:v, fat:fat || [], rep:rep || [], col:col || [], ok:true });
    } catch (e) { console.error(e); S.toast(S.erro(e)); }
    dados.carregando = false;
    if (S.route().view === 'vendas') S.render();
  };
  const recarregar = async () => { S.db.lancamentos = await S.q(S.sb.from('lancamentos').select('*').eq('veiculo_id', S.ui.vehicleId)); dados.ok = false; await carregar(true); };
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
      let sit = ped ? (ped.situacao === 'faturado' ? 'faturado' : 'aguardando') : feito ? 'antigo' : pi.status === 'faturado' ? '' : 'enviar';
      if (!sit) return;
      const base = feito ? reais : previstas(pi, mesRef), rec = base.filter(l => l.sentido === 'receber');
      out.push({ pi, ym, mesRef, multi, idx:ms.indexOf(ym) + 1, n:ms.length, ped, sit, valor:rec.reduce((s, l) => s + Number(l.valor), 0),
        venc:(rec.map(l => l.vencimento).filter(Boolean).sort()[0]) || '' });
    });
    const ord = { enviar:0, aguardando:1, faturado:2, antigo:3 };
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

  // ---------- tela ----------
  S.views.vendas = () => {
    carregar(false);
    const hoje = S.today(), ym = st.mes || hoje.slice(0, 7), v = S.veh(), mesNome = MESES[+ym.slice(5) - 1], pis = S.db.pis;
    // 1. vendido no mês (parte de cada PI que vai ao ar no mês, no líquido) e a meta
    const vendidos = pis.filter(p => VENDIDO.includes(p.status)).map(p => ({ p, v:S.valorNoMes(p, ym) })).filter(x => x.v > 0);
    const vendido = vendidos.reduce((s, x) => s + x.v, 0);
    const metas = S.metasDoMes ? S.metasDoMes(ym) : null, meta = (metas || []).filter(x => x.veiculo_id === S.ui.vehicleId).reduce((s, x) => s + Number(x.meta), 0);
    // 2. faturamento
    const fats = linhasFaturar(ym), cont = k => fats.filter(x => x.sit === k).length;
    const faturado = fats.filter(x => x.sit === 'faturado' || x.sit === 'antigo'), vFat = faturado.reduce((s, x) => s + x.valor, 0);
    // 3. recebimento
    const rec = linhasReceber(ym, hoje), doMes = rec.filter(l => l.vencimento.slice(0, 7) === ym && l.vencimento <= (ym === hoje.slice(0, 7) ? hoje : ym + '-31'));
    const recebido = doMes.filter(l => l.pago_em).reduce((s, l) => s + pago(l), 0), venceu = doMes.reduce((s, l) => s + (l.pago_em ? pago(l) : Number(l.valor)), 0);
    const atrasadas = rec.filter(l => !l.pago_em && l.vencimento < hoje), vAtr = atrasadas.reduce((s, l) => s + Number(l.valor), 0);
    // 4. parte da Head 14
    const piDe = id => pis.find(p => p.id === id);
    const pagosMes = S.db.lancamentos.filter(l => l.sentido === 'receber' && l.pi_id && l.pago_em && l.pago_em.slice(0, 7) === ym && piDe(l.pi_id));
    const parteDe = l => { const pi = piDe(l.pi_id); return pago(l) * fatorLiquido(pi) * pctH14(pi) / 100; };
    const devida = pagosMes.reduce((s, l) => s + parteDe(l), 0), prevista = vendidos.reduce((s, x) => s + x.v * pctH14(x.p) / 100, 0);
    const reps = dados.rep.filter(r => r.mes === ym), recebidaH = reps.reduce((s, r) => s + Number(r.valor), 0);
    const [ry, rm] = somaMes(ym, 1).split('-'), diaRep = String((S.db.empresa || {}).repasse_dia || 25).padStart(2, '0'), vencRep = `${diaRep}/${rm}/${ry}`;
    const emp = S.empCurto ? S.empCurto() : 'Head 14', pct = Math.round(pctH14());
    const pctW = (a, b) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;

    // Mês anterior, para a variação de cada número (cartões que contam até o valor, adaptados de um "StatCard" em React)
    const ant = somaMes(ym, -1), mesAnt = MESES[+ant.slice(5) - 1];
    const vendAnt = pis.filter(p => VENDIDO.includes(p.status)).reduce((s, p) => s + S.valorNoMes(p, ant), 0);
    const fatAnt = linhasFaturar(ant).filter(x => x.sit === 'faturado' || x.sit === 'antigo').reduce((s, x) => s + x.valor, 0);
    const recAnt = S.db.lancamentos.filter(l => l.sentido === 'receber' && l.pi_id && l.pago_em && (l.vencimento || '').slice(0, 7) === ant).reduce((s, l) => s + pago(l), 0);
    const devAnt = S.db.lancamentos.filter(l => l.sentido === 'receber' && l.pi_id && l.pago_em && l.pago_em.slice(0, 7) === ant && piDe(l.pi_id)).reduce((s, l) => s + parteDe(l), 0);
    const tile = (chave, rot, val, antes, linhas, cls = '') => {
      const d = antes ? Math.round((val - antes) / antes * 100) : null, sobe = d === null || d >= 0;
      const seta = sobe ? '<path d="M7 17 17 7M9 7h8v8"/>' : '<path d="M7 7l10 10M17 9v8H9"/>';
      const variacao = d === null ? (val ? `<span class="vd-var"><span class="vd-var-ic vd-up"><svg viewBox="0 0 24 24" aria-hidden="true">${seta}</svg></span><span><b class="vd-up-t">novo</b> sem base em ${mesAnt}</span></span>` : '')
        : `<span class="vd-var"><span class="vd-var-ic ${sobe ? 'vd-up' : 'vd-down'}"><svg viewBox="0 0 24 24" aria-hidden="true">${seta}</svg></span><span><b class="${sobe ? 'vd-up-t' : 'vd-down-t'}">${d > 0 ? '+' : ''}${d}%</b> em relação a ${mesAnt}</span></span>`;
      const fala = `${rot.replace(/<[^>]+>/g, '')}: ${brl(val)}${d === null ? '' : `, ${d > 0 ? 'mais' : d < 0 ? 'menos' : 'igual'} ${Math.abs(d)}% em relação a ${mesAnt}`}`;
      return `<div class="vd-tile${cls}" role="group" aria-label="${esc(fala)}"><span class="vd-rot">${rot}</span><b class="vd-val" aria-hidden="true" data-vd-num="${chave}|${ym}" data-v="${val}">${brl(contados[`${chave}|${ym}`] ?? 0)}</b>${variacao}${linhas}</div>`; };
    queueMicrotask(contar);
    const resumo = `<section class="card vd-mes" aria-label="Resumo do mês"><div class="hd"><h2>Vendas do mês</h2>
        <div class="vd-nav"><button class="btn sm" data-act="vdMes" data-d="-1" aria-label="Mês anterior">‹</button><b>${nomeMesLongo(ym)}</b><button class="btn sm" data-act="vdMes" data-d="1" aria-label="Próximo mês">›</button>${st.mes ? '<button class="btn sm" data-act="vdMes" data-d="0">Hoje</button>' : ''}</div></div>
      <div class="vd-tiles">
        ${tile('vend', 'Vendido no mês', vendido, vendAnt, `<span class="muted small">${vendidos.length} ${vendidos.length === 1 ? 'PI no ar' : 'PIs no ar'} em ${mesNome}</span>${meta ? `<div class="prog" role="progressbar" aria-valuenow="${pctW(vendido, meta)}" aria-valuemin="0" aria-valuemax="100" aria-label="Meta do mês"><i style="width:${pctW(vendido, meta)}%"></i></div><span class="muted small">${pctW(vendido, meta)}% da meta da equipe (${brl(meta)})</span>` : ''}`)}
        ${tile('fat', 'Faturado pelo veículo', vFat, fatAnt, `<span class="muted small">${faturado.length} de ${fats.length} confirmados</span><span class="vd-pills">${cont('aguardando') ? `<span class="pill fn-neutra">${cont('aguardando')} aguardando o financeiro</span>` : ''}${cont('enviar') ? `<span class="pill fn-forte">${cont('enviar')} a enviar</span>` : ''}</span>`)}
        ${tile('rec', 'Recebido dos clientes', recebido, recAnt, `<span class="muted small">do que venceu em ${mesNome} (${brl(venceu)})</span>${atrasadas.length ? `<span class="vd-pills"><span class="pill fn-forte">${atrasadas.length} ${atrasadas.length === 1 ? 'atrasada' : 'atrasadas'} · ${brl(vAtr)}</span></span>` : ''}`)}
        ${tile('h14', `Parte da ${esc(emp)} (${pct}%)`, devida, devAnt, `<span class="muted small">devida pelo que os clientes pagaram</span><span class="muted small">Prevista: ${brl(prevista)} · repasse vence ${vencRep}</span>`, ' vd-h14')}
      </div></section>`;

    // Para faturar
    const filtro = st.aba === 'todos' ? fats : fats.filter(x => st.aba === 'faturado' ? (x.sit === 'faturado' || x.sit === 'antigo') : x.sit === st.aba);
    const mostra = filtro.slice(0, st.lista);
    const SIT = { enviar:['A enviar', 'fn-forte'], aguardando:['Aguardando o financeiro', 'fn-neutra'], faturado:['Faturado', 'fn-ok'], antigo:['Faturado', 'fn-ok'] };
    const linhaFat = x => { const [t, c] = SIT[x.sit], ped = x.ped;
      const det = x.sit === 'faturado' ? `<small>${ped.nota_fiscal ? `NF ${esc(ped.nota_fiscal)} · ` : ''}confirmado em ${dfmt(diaDe(ped.confirmado_em)).slice(0, 5)}${ped.confirmado_por ? ` por ${esc(ped.confirmado_por)}` : ''}</small>`
        : x.sit === 'aguardando' ? `<small>${ped.enviado_em ? `enviado ${dfmt(diaDe(ped.enviado_em)).slice(0, 5)} · lembrete ${dfmt(maisDias(diaDe(ped.enviado_em), 7)).slice(0, 5)}` : 'e-mail não saiu: reenvie'}</small>`
        : x.sit === 'antigo' ? '<small>faturado antes do Vendas, sem pedido</small>' : '';
      const acao = x.sit === 'enviar' ? `<button class="btn sm pri" data-act="vdEnviar" data-id="${x.pi.id}" data-mes="${x.mesRef}">Enviar para faturar</button>`
        : x.sit === 'aguardando' ? `<button class="btn sm" data-act="vdReenviar" data-id="${ped.id}">Reenviar</button>`
        : `<button class="btn sm tres" data-act="vdMenuPi" data-id="${x.pi.id}" data-ped="${ped ? ped.id : ''}" aria-label="Mais opções do ${esc(S.piNo(x.pi))}">⋯</button>`;
      return `<tr><td class="nw"><a data-go="/pi/${x.pi.id}" style="color:var(--ink)"><b>${esc(S.piNo(x.pi))}</b></a><small class="vd-cort" title="${esc(x.pi.titulo || '')}">${esc(x.pi.titulo || 'Sem título')}</small></td>
        <td>${esc(S.nome(x.pi.cliente_id))}<small>${esc(S.usuario(x.pi.consultor_id) || '')}</small></td>
        <td class="nw">${S.nomeMes(x.ym)}<small>${x.multi ? `mês ${x.idx} de ${x.n}` : 'mês único'}</small></td>
        <td class="r nw">${brl(x.valor)}<small>${x.venc ? `vence ${dfmt(x.venc).slice(0, 5)}` : 'vencimento a combinar'}</small></td>
        <td class="vd-sit"><span class="pill ${c}">${t}</span>${det}</td><td class="r">${acao}</td></tr>`; };
    const aba = (k, n, q) => `<button class="${st.aba === k ? 'on' : ''}" data-act="vdAba" data-v="${k}" role="tab" aria-selected="${st.aba === k}">${n} <span class="cont">${q}</span></button>`;
    const semEmail = !String(v.financeiro_email || '').trim();
    const faturar = `<section class="card vd-fat" aria-label="Para faturar"><div class="hd"><h2>Para faturar · ${mesNome}</h2>
        <div class="vd-hd-dir"><div class="seg" role="tablist">${aba('todos', 'Todos', fats.length)}${aba('enviar', 'A enviar', cont('enviar'))}${aba('aguardando', 'Aguardando', cont('aguardando'))}${aba('faturado', 'Faturados', faturado.length)}</div>
        ${cont('enviar') > 1 ? `<button class="btn sm pri" data-act="vdEnviarTodos" data-mes="${ym}">Enviar os ${cont('enviar')} para faturar</button>` : ''}</div></div>
      <p class="muted small vd-nota">${semEmail ? `<b class="vd-alerta">Falta o e-mail do financeiro da ${esc(v.nome)}.</b> Cadastre em Administração › Veículos (ou na hora de enviar).` : `Quem fatura e emite a nota é o financeiro da ${esc(v.nome)} (${esc(v.financeiro_email)}). A ${esc(emp)} envia o pedido e acompanha a confirmação.`}</p>
      ${fats.length ? `<div class="scroll"><table class="vd-t"><thead><tr><th>PI</th><th>Cliente</th><th>Mês veiculado</th><th class="r">Valor</th><th>Situação</th><th><span class="sr">Ações</span></th></tr></thead>
        <tbody>${mostra.map(linhaFat).join('') || `<tr><td colspan="6" class="muted">Nada nesta situação.</td></tr>`}</tbody></table></div>
        ${filtro.length > mostra.length ? `<p class="muted small" style="margin:12px 0 0">Mostrando ${mostra.length} de ${filtro.length} · <a href="#" data-act="vdMais">ver todos</a></p>` : ''}`
        : `<div class="card empty" style="box-shadow:none;padding:24px"><b>Nada para faturar em ${mesNome}</b>Aparece aqui quando a OPEC aprova um PI que vai ao ar no mês.</div>`}</section>`;

    // Recebimento dos clientes
    const linhaRec = l => { const s = situacaoParc(l, hoje), pi = piDe(l.pi_id);
      return `<tr><td><b class="vd-cort" title="${esc(l.contraparte)}">${esc(l.contraparte)}</b><small>${esc(S.usuario((pi || {}).consultor_id) || '')}</small></td>
        <td class="nw">${pi ? esc(S.piNo(pi)) : '—'}<small>${l.mes_ref ? S.nomeMes(l.mes_ref) : `parcela ${l.parcela || 1}`}${/· restante$/.test(l.descricao || '') ? ' · restante' : ''}</small></td>
        <td class="nw">${dfmt(l.vencimento)}</td><td class="r nw">${brl(l.pago_em ? pago(l) : l.valor)}</td>
        <td><span class="pill ${s.cls}">${s.txt}</span></td><td class="nw vd-aviso">${avisoParc(l, hoje)}</td>
        <td class="r"><span class="lin-acoes">${!l.pago_em && l.vencimento <= hoje ? `<button class="btn sm" data-act="vdPerguntar" data-id="${l.id}">Perguntar agora</button>` : ''}<button class="btn sm tres" data-act="vdMenuParc" data-id="${l.id}" aria-label="Mais opções da parcela de ${esc(l.contraparte)}">⋯</button></span></td></tr>`; };
    const receber = `<section class="card vd-rec" aria-label="Recebimento dos clientes"><div class="hd"><h2>Recebimento dos clientes</h2>
        <span class="muted small">Quem confirma é o financeiro do veículo, pelo e-mail. A pergunta se repete uma vez por semana até a resposta.</span></div>
      ${rec.length ? `<div class="scroll"><table class="vd-t"><thead><tr><th>Cliente</th><th>PI · mês</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th>Último aviso</th><th><span class="sr">Ações</span></th></tr></thead>
        <tbody>${rec.map(linhaRec).join('')}</tbody></table></div>` : `<p class="muted" style="margin:0">Nenhuma parcela de cliente vence em ${mesNome}.</p>`}</section>`;

    // Parte da Head 14
    const barra = (rot, val, w, cor) => `<div class="vd-bar"><div class="vd-bar-t"><span>${rot}</span><b>${brl(val)}</b></div><div class="prog"><i style="width:${w}%;background:${cor}"></i></div></div>`;
    const topo = Math.max(prevista, devida, recebidaH, 1);
    const parte = `<section class="card vd-h14c" aria-label="Parte da ${esc(emp)}"><div class="hd"><h2>Parte da ${esc(emp)} · ${mesNome}</h2><span class="pill fn-neutra">${pct}% do líquido</span></div>
      ${barra('Prevista (pelo vendido)', prevista, pctW(prevista, topo), 'var(--t-claro)')}${barra('Devida (os clientes pagaram)', devida, pctW(devida, topo), 'var(--t-forte)')}${barra(`Recebida pela ${esc(emp)}`, recebidaH, pctW(recebidaH, topo), 'var(--t-escuro)')}
      ${reps.length ? `<div class="vd-reps">${reps.map(r => `<span>${dfmt(r.recebido_em)} · <b>${brl(r.valor)}</b>${r.observacao ? ` · ${esc(r.observacao)}` : ''}<button class="btn sm tres" data-act="vdRepExcluir" data-id="${r.id}" aria-label="Excluir este repasse">×</button></span>`).join('')}</div>` : ''}
      <div class="vd-pe"><span>Repasse de ${mesNome}: <b>${brl(Math.max(0, devida - recebidaH))}</b> a receber · vence <b>${vencRep}</b></span><button class="btn sm" data-act="vdRepasse" data-mes="${ym}" data-v="${Math.max(0, devida - recebidaH).toFixed(2)}">Registrar repasse recebido</button></div></section>`;

    // Comissões (percentual atual do colaborador; o fechamento oficial vem na próxima etapa)
    const col = uid => dados.col.find(c => c.usuario_id === uid);
    const porCons = {};
    const pc = uid => porCons[uid || ''] || (porCons[uid || ''] = { uid, vend:0, rec:0, com:0, semPct:false });
    vendidos.forEach(x => { pc(x.p.consultor_id).vend += x.v; });
    pagosMes.forEach(l => { const pi = piDe(l.pi_id), c = col(pi.consultor_id), p = c ? num((c.comissao_veiculos || {})[S.ui.vehicleId] ?? c.comissao) : 0, o = pc(pi.consultor_id);
      o.rec += pago(l); o.com += parteDe(l) * p / 100; if (!c) o.semPct = true; });
    const consList = Object.values(porCons).sort((a, b) => b.vend - a.vend);
    const pctDe = uid => { const c = col(uid); return c ? num((c.comissao_veiculos || {})[S.ui.vehicleId] ?? c.comissao) : null; };
    const comissoes = `<section class="card vd-com" aria-label="Comissões"><div class="hd"><h2>Comissões · ${mesNome}</h2><span class="muted small">fechamento no mês seguinte</span></div>
      ${consList.length ? `<div class="scroll"><table class="vd-t"><thead><tr><th>Consultor</th><th class="r">Vendido</th><th class="r">Recebido</th><th class="r">Comissão</th></tr></thead><tbody>
        ${consList.map(o => `<tr><td><b>${esc(o.uid ? S.usuario(o.uid) || 'Consultor' : 'Sem responsável')}</b><small>${pctDe(o.uid) === null ? 'sem percentual cadastrado' : `${String(pctDe(o.uid)).replace('.', ',')}% da parte da ${esc(emp)}`}</small></td><td class="r nw">${brl(o.vend)}</td><td class="r nw">${brl(o.rec)}</td><td class="r nw"><b>${brl(o.com)}</b></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted" style="margin:0">Sem vendas nem recebimentos em ${mesNome}.</p>`}
      <p class="muted small" style="margin:12px 0 0">A comissão cresce conforme os clientes pagam: ${pct}% do líquido recebido é da ${esc(emp)}, e o consultor recebe o percentual dele sobre essa parte.</p></section>`;

    return { title:`<span class="sub">${esc(v.nome)}</span>Vendas`,
      actions:`<button class="btn" data-act="vdRelatorios">${S.svg('relatorio')}Relatórios</button>`,
      body:`${resumo}${faturar}${receber}<div class="cols vd-cols">${parte}${comissoes}</div>` };
  };

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

  Object.assign(S.actions, {
    vdMes: d => { const hoje = S.today().slice(0, 7), atual = st.mes || hoje, alvo = +d.d ? somaMes(atual, +d.d) : hoje; st.mes = alvo === hoje ? '' : alvo; st.lista = 8; S.render(); },
    vdAba: d => { st.aba = d.v; st.lista = 8; S.render(); },
    vdMais: () => { st.lista = 999; S.render(); },
    vdRelatorios: () => { S.go('/financeiro'); setTimeout(() => S.actions.finRelatorios && S.actions.finRelatorios(), 0); },
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
    vdMenuPi: (d, botao) => S.menu(botao, [{ label:'Abrir o PI', icon:'pis', act:'finVerPi', data:{ id:d.id } }, ...(d.ped ? [{ label:'Ver o pedido', icon:'doc', act:'vdPedido', data:{ id:d.ped } }] : [])]),
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

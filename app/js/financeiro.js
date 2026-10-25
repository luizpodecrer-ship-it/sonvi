// SONVI · financeiro: fatura os PIs aprovados e acompanha o que a rádio tem a receber e a pagar.
// Tela por mês (aprovada em 24/10/2026, adaptada do recurso "Gastos" da Moxen, licença permite uso dentro do produto):
// anel do mês dividido por situação (Recebido · A vencer · Vencido) com o total rolando no centro, setas de mês,
// A receber / A pagar, as situações filtram a lista de parcelas do mês (FLIP). Tudo nos tons da cor do veículo
// (--t-forte, --t-claro, --t-escuro em sonvi.css, estilos .fn-*). Embaixo: fluxo por mês, idade dos recebíveis e
// pedidos a faturar. Baixa completa (juros, desconto, valor parcial, NF), baixa em lote e estorno pelas funções
// do banco baixar_lancamentos / estornar_baixa; depois da baixa e do lançamento avulso, o aviso tem "Desfazer".
(() => {
  const { esc, brl, dfmt, num, nfmt } = S;
  const f = { mes:'', tipo:'receber', sit:'', q:'' };   // mes '' = o mês de hoje
  let sel = new Set(), modo = 'lista', virouMes = 0;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const FAIXAS = [['avencer', 'A vencer', 't-claro'], ['1-30', '1 a 30 dias', 't-medio'], ['31-60', '31 a 60 dias', 't-forte'], ['60+', 'Mais de 60 dias', 't-escuro']];

  // ---------- regras puras ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dia = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const atraso = (l, hoje) => !l.pago_em && l.vencimento && l.vencimento < hoje ? Math.round((dia(hoje) - dia(l.vencimento)) / 864e5) : 0;
  const faixaDe = (l, hoje) => { const a = atraso(l, hoje); return l.pago_em ? '' : !a ? 'avencer' : a <= 30 ? '1-30' : a <= 60 ? '31-60' : '60+'; };
  const recebidoDe = l => l.valor_pago === null || l.valor_pago === undefined ? Number(l.valor) : Number(l.valor_pago);
  const soma = (ls, fn = l => Number(l.valor)) => ls.reduce((s, l) => s + fn(l), 0);
  const situacao = (l, hoje) => l.pago_em ? 'pago' : atraso(l, hoje) ? 'vencido' : 'avencer';
  const valorDe = l => l.pago_em ? recebidoDe(l) : Number(l.valor);   // o que entrou (pago) ou o que falta (em aberto)
  const mesDe = (l, hoje) => (l.vencimento || hoje).slice(0, 7);     // sem vencimento: aparece no mês de hoje
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
  const nomeMes = ym => { const n = MESES[+ym.slice(5) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${ym.slice(0, 4)}`; };
  const SITS = tipo => [['pago', tipo === 'pagar' ? 'Pago' : 'Recebido', 't-forte'], ['avencer', 'A vencer', 't-claro'], ['vencido', 'Vencido', 't-escuro']];
  // Números do mês para um tipo (receber/pagar): as três situações, comparação e inadimplência
  S.finMes = (L, ym, tipo, hoje) => {
    const doMes = L.filter(l => l.sentido === tipo && mesDe(l, hoje) === ym);
    const grupos = SITS(tipo).map(([k, nome, tom]) => { const itens = doMes.filter(l => situacao(l, hoje) === k); return { k, nome, tom, itens, v:soma(itens, valorDe) }; });
    const total = soma(doMes, valorDe), ant = soma(L.filter(l => l.sentido === tipo && mesDe(l, hoje) === somaMes(ym, -1)), valorDe);
    const venc = grupos[2].itens, jaVenceu = doMes.filter(l => l.vencimento && l.vencimento < hoje);
    return { doMes, grupos, total, ant, variacao:ant ? Math.round((total - ant) / ant * 100) : null,
      inad:soma(jaVenceu) ? Math.round(soma(venc) / soma(jaVenceu) * 100) : 0, maior:Math.max(0, ...venc.map(l => atraso(l, hoje))) };
  };

  // ---------- o anel (um só, que fica montado entre um desenho e outro; as molas continuam de onde estavam) ----------
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RAIO = 128, GROSSO = 30, PONTA = (GROSSO / 2) / RAIO, VAO = 12 / RAIO;
  const mola = x => ({ x, v:0, alvo:x });
  let anel = null, hover = -1, raf = 0, antes = 0, alvosAtuais = { grupos:[], total:0 };
  function criaAnel() {
    const el = document.createElement('div'); el.className = 'fn-anel';
    el.innerHTML = `<svg viewBox="0 0 340 340" aria-hidden="true"><circle cx="170" cy="170" r="${RAIO}" fill="none" stroke="var(--fill)" stroke-width="${GROSSO}"/><g transform="translate(170 170)"></g></svg>
      <div class="fn-centro"><span class="fn-c-et"></span><span class="fn-c-total"></span><span class="fn-c-sub"></span></div>`;
    const g = el.querySelector('g'), arcos = [0, 1, 2].map(i => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); g.appendChild(p);
      p.addEventListener('click', () => S.actions.finSit({ v:alvosAtuais.grupos[i].k }));
      p.addEventListener('pointerenter', () => { hover = i; alvos(); }); p.addEventListener('pointerleave', () => { hover = -1; alvos(); });
      return { p, a0:mola(0), a1:mola(0), off:mola(0), w:mola(GROSSO), op:mola(1) }; });
    anel = { el, arcos, rolo:S.rolo ? S.rolo(el.querySelector('.fn-c-total')) : null, novo:true };
  }
  const arco = (a0, a1, off) => { const r = RAIO + off, p = a => [Math.sin(a) * r, -Math.cos(a) * r];
    if (a1 - a0 < .0005) { const [x, y] = p(a0); return `M${x.toFixed(2)} ${y.toFixed(2)}l0 0`; }
    const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  function alvos() {
    if (!anel) return;
    const { grupos, total } = alvosAtuais, tot = total || 1, vivos = grupos.filter(g => g.v > 0).length, escolhido = grupos.findIndex(g => g.k === f.sit);
    let a = 0;
    anel.arcos.forEach((arc, i) => { const g = grupos[i]; if (!g) return;
      const ang = total ? g.v / tot * Math.PI * 2 : 0, corte = vivos > 1 ? PONTA + VAO / 2 : 0;
      arc.p.style.stroke = `var(--${g.tom})`;
      arc.a0.alvo = g.v ? a + corte : a; arc.a1.alvo = g.v ? (vivos === 1 ? a + ang - .0001 : Math.max(a + corte, a + ang - corte)) : a;
      arc.off.alvo = escolhido === i ? 7 : 0; arc.w.alvo = escolhido === i || hover === i ? GROSSO + 6 : GROSSO;
      arc.op.alvo = !g.v ? 0 : escolhido > -1 && escolhido !== i ? .28 : 1; a += ang; });
    if (quieto()) { anel.arcos.forEach(c => [c.a0, c.a1, c.off, c.w, c.op].forEach(r => { r.x = r.alvo; r.v = 0; })); desenha(); }
    else if (!raf) raf = requestAnimationFrame(quadro);
  }
  const desenha = () => anel.arcos.forEach(c => { c.p.setAttribute('d', arco(c.a0.x, c.a1.x, c.off.x)); c.p.style.strokeWidth = c.w.x; c.p.style.opacity = c.op.x; });
  function quadro(t) {
    const h = antes ? Math.min(.05, (t - antes) / 1000) : 1 / 60, n = Math.ceil(h * 240); antes = t; let parado = true;
    anel.arcos.forEach(c => [c.a0, c.a1, c.off, c.w, c.op].forEach(r => {
      for (let k = 0; k < n; k++) { r.v += (170 * (r.alvo - r.x) - 22 * r.v) * h / n; r.x += r.v * h / n; }
      if (Math.abs(r.v) > .001 || Math.abs(r.alvo - r.x) > .001) parado = false; }));
    desenha(); if (parado || !document.contains(anel.el)) { raf = 0; antes = 0; } else raf = requestAnimationFrame(quadro);
  }
  // Põe o anel no lugar dele na tela recém-desenhada e manda as molas para os números novos
  function poeAnel(M, ym) {
    const lugar = document.getElementById('fn-anel-lugar'); if (!lugar) return;
    if (!anel) criaAnel();
    lugar.replaceWith(anel.el);
    alvosAtuais = M; const g = M.grupos.find(x => x.k === f.sit), its = g ? g.itens : M.doMes, v = g ? g.v : M.total;
    anel.el.querySelector('.fn-c-et').textContent = g ? g.nome : `Total de ${MESES[+ym.slice(5) - 1]}`;
    anel.el.querySelector('.fn-c-sub').textContent = `${its.length} parcela${its.length === 1 ? '' : 's'}${g && M.total ? ` · ${Math.round(v / M.total * 100)}% do mês` : ''}`;
    const txt = 'R$ ' + Math.round(v).toLocaleString('pt-BR');
    if (anel.rolo) anel.rolo.poe(txt, anel.novo); else anel.el.querySelector('.fn-c-total').textContent = txt;
    anel.novo = false; alvos();
  }
  document.addEventListener('pointerover', e => { const b = e.target.closest && e.target.closest('[data-act="finSit"]'); if (!anel) return;
    const i = b ? alvosAtuais.grupos.findIndex(g => g.k === b.dataset.v) : -1; if (i !== hover && (b || hover > -1)) { hover = i; alvos(); } });

  // FLIP da lista: as linhas que ficam deslizam até o lugar novo, as que chegam sobem de leve
  const posicoes = () => { const m = new Map(); document.querySelectorAll('[data-fn-id]').forEach(e => m.set(e.dataset.fnId, e.getBoundingClientRect().top)); return m; };
  function flip(antesPos) { if (quieto()) return;
    document.querySelectorAll('[data-fn-id]').forEach((e, k) => { if (!e.animate) return; const t0 = antesPos.get(e.dataset.fnId), t1 = e.getBoundingClientRect().top;
      if (t0 !== undefined) { if (Math.abs(t0 - t1) > 1) e.animate([{ transform:`translateY(${t0 - t1}px)` }, { transform:'none' }], { duration:420, easing:'cubic-bezier(.2,.9,.2,1)' }); }
      else e.animate([{ opacity:0, transform:'translateY(8px)' }, { opacity:1, transform:'none' }], { duration:320, delay:Math.min(k, 8) * 25, easing:'ease-out', fill:'backwards' }); }); }
  const redesenha = () => { const p = posicoes(); S.render(); flip(p); };

  // ---------- tela ----------
  S.views.financeiro = () => {
    if (modo === 'relatorios') return telaRelatorios();
    const hoje = S.today(), L = S.db.lancamentos, ym = f.mes || hoje.slice(0, 7), r = f.tipo === 'receber', M = S.finMes(L, ym, f.tipo, hoje);
    const g = M.grupos.find(x => x.k === f.sit), mesNome = MESES[+ym.slice(5) - 1], mesAnt = MESES[+somaMes(ym, -1).slice(5) - 1];

    // 1. o mês: anel + situações
    const sits = M.grupos.map(x => { const pc = M.total ? Math.round(x.v / M.total * 100) : 0;
      return `<button type="button" class="fn-sit" data-act="finSit" data-v="${x.k}" style="--c:var(--${x.tom})" aria-pressed="${f.sit === x.k}">
        <span class="fn-sit-t"><i aria-hidden="true"></i>${x.nome}<small>${x.itens.length} parcela${x.itens.length === 1 ? '' : 's'}</small></span>
        <b>${brl(x.v)}</b><span class="fn-sit-bar" aria-hidden="true"><span style="width:${pc}%"></span></span><span class="fn-sit-p">${pc}% do mês</span></button>`; }).join('');
    const cmp = M.variacao === null ? '' : M.variacao === 0 ? `<span class="pill fn-neutra">Igual a ${mesAnt}</span>`
      : `<span class="pill fn-neutra">${M.variacao > 0 ? '▲' : '▼'} ${Math.abs(M.variacao)}% em relação a ${mesAnt}</span>`;
    const alerta = M.grupos[2].itens.length ? `<span class="pill fn-forte">${r ? 'Inadimplência' : 'Em atraso'} ${M.inad}% · maior atraso ${M.maior} dia${M.maior === 1 ? '' : 's'}</span>`
      : M.doMes.length ? '<span class="pill fn-neutra">Nada vencido</span>' : '';
    const seg = `<div class="seg fn-tipo" role="group" aria-label="Tipo">${[['receber', 'A receber'], ['pagar', 'A pagar']].map(([v, t]) => `<button class="${f.tipo === v ? 'on' : ''}" data-act="finTipo" data-v="${v}" aria-pressed="${f.tipo === v}">${t}</button>`).join('')}</div>`;
    const mes = `<section class="card fn-mes-card" aria-labelledby="fn-t">
      <div class="hd"><h2 id="fn-t">${r ? 'A receber' : 'A pagar'} no mês</h2>${seg}<span class="grow"></span>
        <div class="fn-nav" role="group" aria-label="Mês"><button class="btn sm ic" data-act="finMes" data-d="-1" aria-label="Mês anterior" title="Mês anterior (←)">${S.svg("esq")}</button>
          <span class="fn-mes-et" role="status" aria-live="polite"><span>${nomeMes(ym)}</span></span>
          <button class="btn sm ic" data-act="finMes" data-d="1" aria-label="Próximo mês" title="Próximo mês (→)">${S.svg('seta')}</button>
          ${ym !== hoje.slice(0, 7) ? `<button class="btn sm" data-act="finMes" data-d="0">Hoje</button>` : ''}</div></div>
      <div class="fn-corpo"><div id="fn-anel-lugar" class="fn-anel"></div>
        <div class="fn-dir"><div class="fn-sits" role="group" aria-label="Situação (escolha para filtrar as parcelas)">${sits}</div><div class="fn-resumo">${cmp}${alerta}</div></div></div></section>`;

    // 2. parcelas do mês
    const q = f.q.trim().toLowerCase();
    const lista = (g ? g.itens : M.doMes).filter(l => !q || [l.contraparte, l.descricao, l.nota_fiscal, l.forma, l.sentido === 'receber' ? S.emailCobrancaDe(l).email : ''].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.vencimento || '9').localeCompare(b.vencimento || '9') || (a.contraparte || '').localeCompare(b.contraparte || ''));
    sel = new Set([...sel].filter(id => lista.some(l => l.id === id && !l.pago_em)));
    const pill = l => { const s = situacao(l, hoje), a = atraso(l, hoje);
      return s === 'pago' ? `<span class="pill fn-ok">${S.svg('check', 12)}${l.sentido === 'pagar' ? 'Pago' : 'Recebido'} ${dfmt(l.pago_em).slice(0, 5)}</span>`
        : s === 'vencido' ? `<span class="pill fn-forte">Vencido ${a} dia${a === 1 ? '' : 's'}</span>` : `<span class="pill fn-neutra">${l.vencimento ? 'Em aberto' : 'Sem vencimento'}</span>`; };
    const valorTxt = l => l.pago_em && Math.abs(recebidoDe(l) - Number(l.valor)) > 0.004 ? `<b>${brl(recebidoDe(l))}</b><small class="muted">parcela ${brl(l.valor)}</small>` : `<b>${brl(l.valor)}</b>`;
    const emailTxt = l => { if (l.sentido !== 'receber' || l.pago_em) return ''; const e = S.emailCobrancaDe(l).email;
      return e ? `<small class="fin-email" title="E-mail de cobrança">${S.svg('email')}${esc(e)}</small>` : '<small class="fin-email fn-falta">sem e-mail de cobrança</small>'; };
    const quem = l => `<span class="fin-quem"><b>${esc(l.contraparte) || '—'}</b><small>${esc(l.descricao)}${l.categoria ? ` · ${esc(l.categoria)}` : ''}${l.pi_id ? '' : ' · avulso'}${l.parcela ? ` · parcela ${l.parcela}` : ''}</small>${emailTxt(l)}</span>`;
    const acoes = l => `<span class="fin-acoes">${l.pago_em ? '' : `<button class="btn sm" data-act="finBaixa" data-id="${l.id}">${l.sentido === 'pagar' ? 'Pagar' : 'Dar baixa'}</button>`}<button class="btn tres" data-act="finMenu" data-id="${l.id}" aria-label="Mais opções da parcela de ${esc(l.contraparte)}">${S.svg('mais3')}</button></span>`;
    const marca = l => l.pago_em ? '<span class="fn-sem"></span>' : `<input type="checkbox" data-fin-sel="${l.id}"${sel.has(l.id) ? ' checked' : ''} aria-label="Selecionar parcela de ${esc(l.contraparte)}">`;
    const selVal = soma(lista.filter(l => sel.has(l.id)));
    const barraSel = sel.size ? `<div class="fin-selbar"><b>${sel.size} selecionada${sel.size === 1 ? '' : 's'} · ${brl(selVal)}</b><span class="grow"></span><button class="btn sm" data-act="finLimparSel">Limpar</button><button class="btn sm pri" data-act="finLote">Dar baixa ${sel.size === 1 ? 'na selecionada' : `nas ${sel.size}`}</button></div>` : '';
    const abertas = lista.filter(l => !l.pago_em);
    let corpo;
    if (!lista.length) corpo = `<div class="empty"><b>Nenhuma parcela</b>${q ? `Nada com essa busca em ${mesNome}.` : g ? `Nada ${g.k === 'pago' ? (r ? 'recebido' : 'pago') : g.k === 'vencido' ? 'vencido' : 'a vencer'} em ${mesNome}.` : L.length ? `Nenhuma parcela ${r ? 'a receber' : 'a pagar'} vence em ${mesNome}.` : 'As parcelas aparecem aqui quando um PI é faturado.'}</div>`;
    else if (S.celular) corpo = lista.map(l => `<div class="fin-cartao" data-fn-id="${l.id}">
        <div class="row">${marca(l)}${quem(l)}<span class="fin-valor">${valorTxt(l)}</span></div>
        <div class="row mid fin-info"><span class="muted small">${l.vencimento ? `vence ${dfmt(l.vencimento)}` : 'sem vencimento'}${l.forma ? ' · ' + esc(l.forma) : ''}${l.nota_fiscal ? ' · NF ' + esc(l.nota_fiscal) : ''}</span><span class="grow"></span>${pill(l)}${l.pago_em ? acoes(l) : ''}</div>${l.pago_em ? '' : acoes(l)}</div>`).join('');
    else corpo = `<div class="fin-tab"><div class="fin-cab"><span>${abertas.length ? `<input type="checkbox" data-fin-todos="1"${abertas.every(l => sel.has(l.id)) ? ' checked' : ''} aria-label="Selecionar todas em aberto">` : ''}</span><span>Vencimento</span><span>${r ? 'Cliente' : 'Para quem'} / descrição</span><span class="fn-c-nf">Nota fiscal</span><span class="fn-c-forma">Forma</span><span class="r">Valor</span><span>Situação</span><span><span class="sr">Ações</span></span></div>
      ${lista.map(l => `<div class="fin-lin${sel.has(l.id) ? ' sel' : ''}" data-fn-id="${l.id}">${marca(l)}<span class="fin-data">${l.vencimento ? dfmt(l.vencimento) : '—'}</span>${quem(l)}<span class="fn-c-nf${l.nota_fiscal ? '' : ' muted'}">${l.nota_fiscal ? esc(l.nota_fiscal) : '—'}</span><span class="fn-c-forma">${esc(l.forma)}</span><span class="fin-valor">${valorTxt(l)}</span><span>${pill(l)}</span>${acoes(l)}</div>`).join('')}</div>`;
    const parcelas = `<section class="card fin-lista" aria-labelledby="fn-tp"><div class="hd fn-par-hd"><h2 id="fn-tp">Parcelas de ${mesNome}</h2><span>${lista.length} parcela${lista.length === 1 ? '' : 's'} · ${brl(soma(lista, valorDe))}</span></div>
      <div class="fn-filtros">${g ? `<button class="fn-chip" data-act="finSit" data-v="${g.k}" style="--c:var(--${g.tom})" aria-label="Tirar o filtro ${g.nome}"><i aria-hidden="true"></i>${g.nome}${S.svg('fechar', 14)}</button>` : ''}
        <label class="fin-busca">${S.svg('busca')}<input data-fin="q" value="${esc(f.q)}" placeholder="Buscar cliente, agência, PI ou nota fiscal" aria-label="Buscar"></label></div>
      ${barraSel}${corpo}
      <p class="fn-dica"><kbd>←</kbd> <kbd>→</kbd> trocam o mês · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> filtram pela situação · <kbd>Esc</kbd> tira o filtro</p></section>`;

    // 3. fluxo de 6 meses (do mês passado a 4 meses à frente) e idade dos recebíveis
    const base = hoje.slice(0, 7), meses = Array.from({ length:6 }, (_, k) => somaMes(base, k - 1));
    const fluxo = meses.map(m => { const ls = L.filter(l => l.sentido === 'receber' && (l.vencimento || '').startsWith(m)); return { m, prev:soma(ls), rec:soma(ls.filter(l => l.pago_em), recebidoDe) }; });
    const maxF = Math.max(1, ...fluxo.map(x => Math.max(x.prev, x.rec))), k = v => v >= 1000 ? `${nfmt(v / 1000).replace(/,\d+$/, '')} mil` : v ? nfmt(v) : '';
    const grafico = `<section class="card"><div class="hd"><h2>Fluxo previsto por mês</h2><span class="fin-leg"><i class="prev"></i>Previsto <i class="rec"></i>Recebido</span></div>
      <div class="fin-bars" role="img" aria-label="A receber previsto e recebido nos últimos e próximos meses">${fluxo.map((x, i) => `<div class="${x.m === ym ? 'on' : ''}"><b>${k(x.prev)}</b><span><i class="prev" style="height:${x.prev ? Math.max(4, x.prev / maxF * 140) : 0}px;--i:${i}"></i><i class="rec" style="height:${x.rec ? Math.max(4, x.rec / maxF * 140) : 0}px;--i:${i}"></i></span></div>`).join('')}</div>
      <div class="bars-x">${fluxo.map(x => `<a data-act="finIrMes" data-m="${x.m}" class="${x.m === ym ? 'on' : ''}" aria-label="Ver ${nomeMes(x.m)}">${MES3[+x.m.slice(5) - 1]}</a>`).join('')}</div></section>`;
    const abertosTodos = L.filter(l => l.sentido === 'receber' && !l.pago_em), porFaixa = FAIXAS.map(([id, nome, tom]) => { const xs = abertosTodos.filter(l => faixaDe(l, hoje) === id); return { id, nome, tom, v:soma(xs), n:xs.length }; });
    const idade = `<section class="card"><div class="hd"><h2>Situação dos recebíveis</h2><span>tudo em aberto</span></div>
      ${abertosTodos.length ? `<div class="stack" role="img" aria-label="Recebíveis por atraso">${porFaixa.filter(x => x.v).map(x => `<i style="flex:${x.v};background:var(--${x.tom})"></i>`).join('')}</div>` : ''}
      <div class="legend">${porFaixa.map(x => `<div><span class="sq" style="background:var(--${x.tom})"></span><span class="grow">${x.nome}</span><span class="muted small">${x.n}</span><b>${brl(x.v)}</b></div>`).join('')}</div></section>`;

    // 4. pedidos a faturar
    const aFaturar = S.db.pis.filter(p => ['aprovado', 'programado'].includes(p.status));
    const faturar = aFaturar.length ? `<div class="card"><div class="hd"><h2>Pedidos a faturar</h2><span>${aFaturar.length} aguardando</span></div><div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Status</th><th class="r">Total</th><th class="r">Líquido da rádio</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${aFaturar.map(p => { const c = S.calc(p); return `<tr><td class="muted nw">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}" style="color:var(--ink)"><b>${esc(p.titulo) || 'Sem título'}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td><span class="pill fn-ok">${S.STATUS[p.status].label}</span></td><td class="r">${brl(c.total)}</td><td class="r">${brl(c.net)}</td><td class="r"><button class="btn sm pri" data-act="finFaturar" data-id="${p.id}">Faturar</button></td></tr>`; }).join('')}</tbody></table></div></div>`
      : `<div class="card fin-faturar"><b>Pedidos a faturar</b><span class="pill fn-neutra">nenhum aguardando</span><span class="grow"></span><span class="muted small">Aparecem aqui quando a OPEC aprova ou programa um PI.</span></div>`;

    queueMicrotask(() => { poeAnel(M, ym); rolaMes(); });
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Financeiro`, actions:`<button class="btn" data-act="finRelatorios">${S.svg('relatorio')}Relatórios</button><button class="btn pri" data-act="finAvulso">${S.svg('mais')}Lançamento avulso</button>`,
      body:`${mes}${parcelas}<div class="cols">${grafico}${idade}</div>${faturar}` };
  };
  // O nome do mês desliza para o lado da seta
  function rolaMes() { const d = virouMes; virouMes = 0; const caixa = document.querySelector('.fn-mes-et'); if (!d || !caixa || quieto()) return;
    const novo = caixa.firstElementChild; novo.animate([{ transform:`translateX(${d * 36}px)`, opacity:0 }, { transform:'none', opacity:1 }], { duration:380, easing:'cubic-bezier(.2,.9,.2,1)' }); }
  // Atalhos da tela: ← → mês, 1 2 3 situação, Esc tira o filtro
  document.addEventListener('keydown', e => {
    if (S.ui.view !== 'financeiro' || modo !== 'lista' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open], .menu, .sv-painel:not([hidden]), :popover-open')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.actions.finMes({ d:e.key === 'ArrowLeft' ? -1 : 1 }); }
    else if (/^[1-3]$/.test(e.key)) { e.preventDefault(); S.actions.finSit({ v:SITS(f.tipo)[+e.key - 1][0] }); }
    else if (e.key === 'Escape' && f.sit) { e.preventDefault(); S.actions.finSit({ v:f.sit }); }
  });

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
  // Depois da baixa, o aviso oferece "Desfazer" (é o estorno de cada parcela, pela mesma função do menu)
  const baixar = async itens => {
    const ok = await S.run(async () => { await S.q(S.sb.rpc('baixar_lancamentos', { p_itens:itens })); sel.clear(); await recarregar(); });
    if (!ok) return;
    const pagar = itens.length && (S.db.lancamentos.find(l => l.id === itens[0].id) || {}).sentido === 'pagar';
    S.toast(itens.length > 1 ? `Baixa feita em ${itens.length} parcelas` : pagar ? 'Pagamento registrado' : 'Baixa registrada', { fn:() => S.run(async () => {
      for (const it of itens) await S.q(S.sb.rpc('estornar_baixa', { p_id:it.id })); await recarregar(); }, itens.length > 1 ? 'Baixas desfeitas' : 'Baixa desfeita') });
  };

  Object.assign(S.actions, {
    finSit: d => { f.sit = f.sit === d.v ? '' : d.v; sel.clear(); redesenha(); },
    finTipo: d => { if (f.tipo === d.v) return; f.tipo = d.v; f.sit = ''; sel.clear(); redesenha(); },
    finMes: d => { const hoje = S.today().slice(0, 7), atual = f.mes || hoje, alvo = d.m || (+d.d ? somaMes(atual, +d.d) : hoje);
      if (alvo === atual) return; virouMes = alvo > atual ? 1 : -1; f.mes = alvo === hoje ? '' : alvo; f.sit = ''; sel.clear(); redesenha(); },
    finIrMes: d => S.actions.finMes({ m:d.m }),
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
          : [...(l.sentido === 'receber' ? [{ label:'Enviar cobrança por e-mail', icon:'email', act:'finCobrar', data:{ id:l.id } }, { label:'E-mail de cobrança', icon:'editar', act:'finEmail', data:{ id:l.id } }, '-'] : []),
            { label:'Mudar vencimento', icon:'relogio', act:'finVenc', data:{ id:l.id } }, { label:'Informar nota fiscal', icon:'editar', act:'finNf', data:{ id:l.id } }, ...(l.pi_id ? [] : ['-', { label:'Excluir lançamento', icon:'lixo', act:'finExcluir', data:{ id:l.id }, perigo:true }])])]); },
    finVerPi: d => S.go(`/pi/${d.id}`),
    // Cobrança por e-mail, pelo próprio SONVI (remetente "<rádio> · Financeiro" financeiro@sonvi.com.br; a resposta vem para quem enviou)
    finCobrar: d => { const l = S.db.lancamentos.find(x => x.id === d.id), v = S.veh(), hoje = S.today(), at = atraso(l, hoje), ec = S.emailCobrancaDe(l);
      const ola = `Olá${l.contraparte ? ', ' + l.contraparte : ''}!`, parc = `a parcela ${l.parcela || 1} de ${l.descricao}, no valor de ${brl(l.valor)}`;
      const assunto = at ? `Parcela vencida · ${v.nome} · ${l.descricao}` : `Lembrete de vencimento · ${v.nome} · ${l.descricao}`;
      const texto = at ? `${ola}\n\nConsta em aberto ${parc}, vencida em ${dfmt(l.vencimento)} (${at} dia${at === 1 ? '' : 's'} de atraso).\n\nSe o pagamento já foi feito, por favor desconsidere esta mensagem e, se puder, responda este e-mail com o comprovante.\n\nObrigado,\nFinanceiro · ${v.nome}`
        : `${ola}\n\nLembramos que ${parc} vence em ${l.vencimento ? dfmt(l.vencimento) : 'data a combinar'}${l.forma ? ` (${l.forma})` : ''}.\n\nQualquer dúvida, é só responder este e-mail.\n\nObrigado,\nFinanceiro · ${v.nome}`;
      S.dialog(`<h2>Enviar cobrança por e-mail</h2><p class="muted small">${esc(l.contraparte)} · ${esc(l.descricao)} · parcela ${l.parcela || 1} · ${at ? `vencida há ${at} dia${at === 1 ? '' : 's'}` : `vence ${dfmt(l.vencimento)}`}</p>
        <label class="f">Para<input name="cb_para" type="email" multiple required value="${esc(ec.email)}" placeholder="financeiro@cliente.com.br" autocomplete="off"></label>
        ${ec.email ? '' : '<p class="note aviso" style="margin:0">Esta parcela não tem e-mail de cobrança. Digite um aqui ou complete o e-mail de faturamento no cadastro.</p>'}
        <label class="f">Assunto<input name="cb_assunto" required value="${esc(assunto)}"></label>
        <label class="f">Mensagem<textarea name="cb_texto" rows="9" required>${esc(texto)}</textarea></label>
        <p class="muted small" style="margin:0">Sai de "${esc(v.nome)} · Financeiro" (financeiro@sonvi.com.br). A resposta vem para o seu e-mail.</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${S.svg('email')}Enviar cobrança</button></div>`,
        async x => { const para = x.cb_para.trim();
          try { await S.enviarEmail({ tipo:'cobranca', id:l.id, para, assunto:x.cb_assunto, texto:x.cb_texto }); S.toast(`Cobrança enviada para ${para}`); }
          catch (e) { S.emailManual(para, x.cb_assunto, x.cb_texto, S.erro(e)); } }); },
    // E-mail só desta parcela; vazio volta a usar o do cadastro de quem paga
    finEmail: d => { const l = S.db.lancamentos.find(x => x.id === d.id), pi = l.pi_id && S.db.pis.find(p => p.id === l.pi_id), cad = pi ? S.pagadorPi(pi) : null;
      S.form('E-mail de cobrança', [{ k:'email_cobranca', label:'E-mail desta parcela', type:'email', full:true, ph:cad && cad.email ? cad.email : 'financeiro@cliente.com.br' },
        { html:`<p class="muted small" style="grid-column:1/-1;margin:0">${cad ? (cad.email ? `Vazio = usa o do cadastro de ${esc(cad.nome)}: <b>${esc(cad.email)}</b>.` : `Vazio = usa o do cadastro de ${esc(cad.nome)}, que ainda não tem e-mail.`) : 'Lançamento avulso: este é o único e-mail de cobrança dele.'}</p>` }],
        { email_cobranca:l.email_cobranca || '' }, v => S.run(() => S.salvar('lancamentos', { id:l.id, email_cobranca:(v.email_cobranca || '').trim() }), 'E-mail de cobrança salvo'), 'Salvar', { editar:true }); },
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
        ${(() => { const pg = S.pagadorPi(pi); return ls.some(l => l.sentido === 'receber') ? (pg.doFaturamento ? `<p class="note info">Notas e boletos vão para <b>${esc(pg.nome)}</b> (${pg.tipo === 'agencia' ? 'agência' : 'cliente'}): ${esc(pg.email)}.</p>`
          : `<p class="note aviso">Falta o e-mail de faturamento ${pg.tipo === 'agencia' ? 'da agência' : 'do cliente'} <b>${esc(pg.nome)}</b>. ${pg.email ? `As notas e os boletos vão para o e-mail comum: ${esc(pg.email)}.` : 'Sem e-mail, as parcelas ficam sem e-mail de cobrança.'} Dá para faturar assim e completar o cadastro depois.</p>`) : ''; })()}
        ${ls.some(l => !l.vencimento) ? '<p class="note">Há parcelas sem vencimento. Defina o 1º vencimento na aba Faturamento do PI, se quiser.</p>' : ''}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Confirmar faturamento</button></div>`,
        () => S.run(async () => { const r = await S.q(S.sb.rpc('faturar_pi', { p_pi:pi.id, p_lancamentos:ls })); Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id]; await recarregar(); }, `${S.piNo(pi)} faturado`)); }
  });

  // Busca e seleção das parcelas
  let tBusca;
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.fin; if (k !== 'q') return;
    f.q = e.target.value; clearTimeout(tBusca); tBusca = setTimeout(() => { const pos = e.target.selectionStart; S.render(); const el = document.querySelector('[data-fin="q"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 250); });
  S.changes.push((el, d) => {
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
    { k:'email_cobranca', label:'E-mail de cobrança (a receber)', type:'email', ph:'financeiro@cliente.com.br' },
    { k:'forma', label:'Forma', type:'select', options:FORMAS.map(x => [x, x]) },
    { k:'valor', label:'Valor de cada parcela (R$)', req:true, mask:'dec', ph:'Ex.: 2.500,00' },
    { k:'vencimento', label:'1º vencimento', type:'date', req:true },
    { k:'vezes', label:'Repetir por quantos meses', mask:'int', ph:'Ex.: 12' },
    { k:'observacao', label:'Observação', type:'textarea', ph:'Ex.: contrato até dezembro' }],
    { sentido:f.tipo, forma:'Boleto', vencimento:S.today(), vezes:'1' },
    v => { const n = Math.min(60, Math.max(1, parseInt(v.vezes) || 1)), valor = num(v.valor);
      if (!(valor > 0)) return S.toast('Informe o valor.');
      const rows = Array.from({ length:n }, (_, k) => ({ veiculo_id:S.ui.vehicleId, sentido:v.sentido, categoria:(v.categoria || '').trim(), descricao:v.descricao.trim(), contraparte:(v.contraparte || '').trim(), forma:v.forma, valor, vencimento:somaMeses(v.vencimento, k), parcela:k + 1, observacao:(v.observacao || '').trim(),
        email_cobranca:v.sentido === 'receber' ? (v.email_cobranca || '').trim() : '' }));
      // Depois de criar, a tela vai para o mês e o tipo do 1º vencimento; o aviso oferece "Desfazer" (apaga o que foi criado)
      let criados = [];
      return S.run(async () => { criados = await S.q(S.sb.from('lancamentos').insert(rows).select()); S.db.lancamentos.push(...criados);
        const m = rows[0].vencimento.slice(0, 7); f.tipo = v.sentido; f.sit = ''; f.mes = m === S.today().slice(0, 7) ? '' : m; }).then(ok => { if (!ok || !criados.length) return;
        const ids = criados.map(l => l.id);
        S.toast(n > 1 ? `${n} lançamentos criados` : 'Lançamento criado', { fn:() => S.run(async () => { await S.q(S.sb.from('lancamentos').delete().in('id', ids));
          S.db.lancamentos = S.db.lancamentos.filter(l => !ids.includes(l.id)); }, n > 1 ? 'Lançamentos desfeitos' : 'Lançamento desfeito') }); }); }, 'Criar', { editar:true });

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
  const piNoPeriodo = (pi, [de, ate]) => [...(pi.dados.grids || []), ...(pi.dados.digital || [])].some(g => { const ini = g.period + '-01', fim = iso(new Date(+g.period.slice(0, 4), +g.period.slice(5), 0)); return (!de || fim >= de) && (!ate || ini <= ate); });
  const C = (t, tipo) => ({ t, tipo }); // tipo: 'brl' | 'num' | 'data' | 'sit' | ''
  const agrupa = (ls, chave) => { const m = new Map(); ls.forEach(x => { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };
  const nomeMesLongo = m => m ? `${MESES[+m.slice(5) - 1][0].toUpperCase()}${MESES[+m.slice(5) - 1].slice(1)} ${m.slice(0, 4)}` : 'Sem data';
  const pct = (a, b) => b ? `${(a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits:1 })}%` : '0%';
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
  const K = (rot, val, sub, extra = {}) => Object.assign({ rot, val, sub }, extra);
  const situ = (l, hoje) => l.pago_em ? 'Pago' : atraso(l, hoje) ? `Vencida há ${plural(atraso(l, hoje), 'dia')}` : 'A vencer';
  const mailRel = l => S.emailCobrancaDe(l).email || 'sem e-mail';
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
          cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('E-mail de cobrança'), C('Forma'), C('Situação', 'sit'), C('Valor', 'brl')],
          rows:ls.map(l => linhaParc(l, [mailRel(l), l.forma, situ(l, hoje), Number(l.valor)])), grupos:true, total:['Total', '', plural(ls.length, 'parcela'), '', '', '', soma(ls)],
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
        const g = agrupa(ls, l => l.contraparte || '—').map(([k, xs]) => { const fx = id => soma(xs.filter(l => faixaDe(l, hoje) === id)), em = [...new Set(xs.map(l => S.emailCobrancaDe(l).email).filter(Boolean))].join(', ') || 'sem e-mail';
          return { c:[k, em, xs.length, Math.max(...xs.map(l => atraso(l, hoje))), fx('1-30'), fx('31-60'), fx('60+'), soma(xs)] }; }).sort((a, b) => b.c[7] - a.c[7]);
        const venceram = soma(L.filter(l => l.sentido === 'receber' && l.vencimento && l.vencimento < hoje && doConsultor(l)));
        return { resumo:[K('Total vencido', brl(tot), plural(ls.length, 'parcela'), { dest:true, tom:tot ? 'ruim' : '' }), K('Clientes em atraso', String(g.length), g.length ? `maior atraso: ${plural(Math.max(...ls.map(l => atraso(l, hoje))), 'dia')}` : 'ninguém em atraso'), K('Inadimplência', pct(tot, venceram), 'do que já venceu')],
          partTit:'Quem mais deve', part:partDe(g.map(r => [r.c[0], r.c[7]]), tot),
          cols:[C('Cliente'), C('E-mail de cobrança'), C('Parcelas', 'num'), C('Maior atraso (dias)', 'num'), C('1 a 30 dias', 'brl'), C('31 a 60 dias', 'brl'), C('Mais de 60', 'brl'), C('Total vencido', 'brl')],
          rows:g, total:['Total', '', ls.length, '', soma(g, r => r.c[4]), soma(g, r => r.c[5]), soma(g, r => r.c[6]), tot],
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
          cols:[C('Vencimento', 'data'), C('Cliente'), C('Descrição'), C('E-mail de cobrança'), C('Forma'), C('Situação', 'sit'), C('Valor', 'brl')],
          rows:ls.map(l => linhaParc(l, [mailRel(l), l.forma, situ(l, hoje), Number(l.valor)])), grupos:true, total:['Total', '', plural(ls.length, 'parcela'), '', '', '', soma(ls)],
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

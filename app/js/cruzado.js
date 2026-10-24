// SONVI · Painel com filtro cruzado do Dashboard geral (24/10/2026).
// Adaptado do recurso "Sincronía" da Moxen (moxen.cl/recursos), usado conforme a licença dele: dentro do produto,
// sem redistribuir o código como modelo. Sem bibliotecas.
//
// Quatro números (vendido, PIs fechados, ticket médio, a receber) e três gráficos sobre os mesmos dados:
//   barras = vendido por veículo · linha = vendido por dia (ou por mês, no ano) · anel = vendido por consultor.
// Clicar numa barra ou numa fatia, ou arrastar sobre a linha para escolher os dias, filtra todo o resto: o gráfico
// clicado não se filtra a si mesmo, o total de antes fica atrás em cinza ("fantasma") e os números rolam até o novo
// valor. Cada filtro vira uma etiqueta no alto; o X, "Limpar" ou Esc tiram. Teclado: barras e legenda são botões
// (setas andam), na linha as setas movem o cursor, Shift + setas escolhem um intervalo, Enter escolhe o dia.
//
// S.cruzado(raiz, dados) monta dentro de `raiz` (o HTML vem de S.cruzadoHtml()).
//   dados = { veiculos:[{ nome, titulo }], consultores:[nome], rotulos:[texto de cada dia/mês], rotulosLongos,
//             V[c][d][t] = vendido, N[c][d][t] = nº de PIs, receber(f) → { valor, vencido, parcelas },
//             variacao:{ vendido, pis, rot }, unidadeT:'dia'|'mês', alCambiar(f) }
(() => {
  'use strict';
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));

  // Resorte com espera: `lanca` fixa a meta (agora ou depois de um tempo, para as cascatas)
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c, espera: 0, pend: x });
  function lanca(r, meta, espera) {
    if (quieto()) { r.x = r.meta = r.pend = meta; r.v = 0; r.espera = 0; return; }
    r.pend = meta; r.espera = espera || 0;
    if (!r.espera) r.meta = meta;
  }
  function puxa(r, dt) {
    if (r.espera > 0) { r.espera -= dt; if (r.espera <= 0) r.meta = r.pend; return true; }
    if (Math.abs(r.v) < .02 && Math.abs(r.meta - r.x) < .0008) { r.x = r.meta; r.v = 0; return false; }
    for (let h = dt; h > 1e-6; h -= 1 / 240) { const s = Math.min(h, 1 / 240); r.v += (r.k * (r.meta - r.x) - r.c * r.v) * s; r.x += r.v * s; }
    return true;
  }
  function mola(k, c) {
    const pts = [0]; let x = 0, v = 0, t = 0;
    while (t < 3) { v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240; pts.push(x); if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break; }
    const out = []; for (let i = 0; i <= 40; i++) out.push(pts[Math.round(i / 40 * (pts.length - 1))].toFixed(4)); out[40] = '1';
    return 'linear(' + out.join(', ') + ')';
  }
  const anima = (el, frames, o) => (quieto() || !el.animate) ? null : el.animate(frames, o);
  // Um relógio só para tudo o que se move; dorme quando nada se move
  const ativos = new Set(); let raf = 0, antes = 0;
  function laco(t) { raf = 0; const dt = antes ? Math.min((t - antes) / 1000, 1 / 20) : 1 / 60; antes = t;
    for (const cb of Array.from(ativos)) if (!cb(dt)) ativos.delete(cb);
    if (ativos.size) raf = requestAnimationFrame(laco); else antes = 0; }
  function acorda(cb) { ativos.add(cb); if (!raf) raf = requestAnimationFrame(laco); }

  const milhar = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const reais = n => 'R$ ' + milhar(n);
  // R$ 1,2 mi · R$ 45 mil · R$ 980
  const curto = n => { const a = Math.abs(n); return a >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mi' : a >= 1e4 ? 'R$ ' + Math.round(n / 1000) + ' mil' : a >= 1000 ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mil' : 'R$ ' + Math.round(n); };
  const dec = (v, n) => v.toFixed(n).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  // ---------- os rolos de números: uma coluna por algarismo, com a fita 0‥9 que gira ----------
  function Rolo(caixa) {
    const raiz = document.createElement('span'); raiz.className = 'cz-rod'; caixa.appendChild(raiz);
    let cols = [], texto = '', alto = 38, naFila = false;
    function novaCol(ch, nova) {
      const el = document.createElement('span');
      if (/\d/.test(ch)) { el.className = 'cz-rod-col'; const t = document.createElement('span'); t.className = 'cz-rod-tira';
        t.innerHTML = '<i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i><i>0</i>'; el.appendChild(t);
        return { el, tira:t, tipo:'d', x:0, v:0, meta:0, k:125, c:15, espera:0, pend:0, nova }; }
      el.className = 'cz-rod-sep'; el.dataset.c = ch; el.textContent = ch === ' ' ? ' ' : ch;
      return { el, tipo:'s', nova };
    }
    function pinta(c) { const p = ((c.x % 10) + 10) % 10; c.tira.style.transform = 'translate3d(0,' + (-p * alto).toFixed(2) + 'px,0)';
      const b = Math.min(2.4, Math.abs(c.v) * alto / 800); c.tira.style.filter = b > .3 ? 'blur(' + b.toFixed(2) + 'px)' : ''; }
    function passo(dt) { let mexe = false;
      for (const c of cols) { if (c.tipo !== 'd') continue;
        if (c.espera > 0) { c.espera -= dt; if (c.espera <= 0) c.meta = c.pend; mexe = true; continue; }
        if (Math.abs(c.v) < .02 && Math.abs(c.meta - c.x) < .003) { if (c.x !== c.meta || c.v !== 0 || c.pend !== c.meta) { c.x = c.meta = c.pend = ((c.meta % 10) + 10) % 10; c.v = 0; pinta(c); } continue; }
        for (let h = dt; h > 1e-6; h -= 1 / 240) { const s = Math.min(h, 1 / 240); c.v += (c.k * (c.meta - c.x) - c.c * c.v) * s; c.x += c.v * s; }
        pinta(c); mexe = true; }
      if (!mexe) naFila = false; return mexe; }
    function poe(novo, inicial) {
      const a = Array.from(novo), num = s => parseInt(String(s).replace(/\D/g, ''), 10) || 0, sobe = num(novo) >= num(texto);
      texto = novo; caixa.setAttribute('role', 'text'); caixa.setAttribute('aria-label', novo);
      const d0 = cols.find(c => c.tipo === 'd'); if (d0) alto = d0.el.offsetHeight || alto;
      while (cols.length > a.length) cols.shift().el.remove();
      while (cols.length < a.length) { const c = novaCol(a[a.length - cols.length - 1], true); raiz.insertBefore(c.el, raiz.firstChild); cols.unshift(c); }
      for (let i = 0; i < a.length; i++) {
        let c = cols[i]; const ch = a[i], dig = /\d/.test(ch);
        if (dig !== (c.tipo === 'd')) { const n = novaCol(ch, true); raiz.replaceChild(n.el, c.el); cols[i] = c = n; }
        c.el.setAttribute('aria-hidden', 'true');
        if (!dig) { c.el.dataset.c = ch; c.el.textContent = ch === ' ' ? ' ' : ch; continue; }
        const d = +ch;
        if (c.nova) { c.nova = false; alto = c.el.offsetHeight || alto;
          if (inicial && !quieto()) { c.x = c.meta = 0; c.pend = d + 10; c.espera = .12 + i * .075; pinta(c); }
          else { c.x = c.meta = c.pend = d; pinta(c); if (!inicial && !quieto()) c.el.classList.add('cz-rod-entra'); }
          continue; }
        const atual = ((Math.round(c.pend) % 10) + 10) % 10; if (atual === d) continue;
        if (quieto()) { c.x = c.meta = c.pend = d; c.v = 0; c.espera = 0; pinta(c); continue; }
        c.pend = c.pend + (sobe ? ((d - atual + 10) % 10) : -((atual - d + 10) % 10));
        c.espera = (a.length - 1 - i) * .05; if (!c.espera) c.meta = c.pend;
      }
      if (!naFila) { naFila = true; acorda(passo); }
    }
    return { poe };
  }

  // ---------- o HTML do painel (os gráficos são desenhados pelo script) ----------
  S.cruzadoHtml = ({ unidadeT = 'dia' } = {}) => `<section class="cz-painel" aria-label="Vendas de todos os veículos, com filtro cruzado" data-cruzado>
    <div class="cz-filtros" data-filtros><p class="cz-vazio" data-vazio>Clique numa barra ou numa fatia, ou arraste sobre a linha para filtrar</p><ul class="cz-chips" data-chips aria-label="Filtros ativos"></ul><button class="cz-limpar" type="button" data-limpar hidden>Limpar</button></div>
    <div class="cz-kpis">
      <article class="cz-kpi" data-kpi="vendido"><div class="gk-top"><span class="gk-ic" aria-hidden="true">${S.svg('financeiro')}</span><h2>Vendido</h2></div><p class="cz-kpi-n" data-rolo></p><p class="cz-kpi-p"><span class="cz-pill" data-pill></span></p></article>
      <article class="cz-kpi" data-kpi="pis"><div class="gk-top"><span class="gk-ic" aria-hidden="true">${S.svg('pis')}</span><h2>PIs fechados</h2></div><p class="cz-kpi-n" data-rolo></p><p class="cz-kpi-p"><span class="cz-pill" data-pill></span></p></article>
      <article class="cz-kpi" data-kpi="ticket"><div class="gk-top"><span class="gk-ic" aria-hidden="true">${S.svg('propostas')}</span><h2>Ticket médio</h2></div><p class="cz-kpi-n" data-rolo></p><p class="cz-kpi-p"><span class="cz-pill" data-pill></span></p></article>
      <article class="cz-kpi" data-kpi="receber"><div class="gk-top"><span class="gk-ic" aria-hidden="true">${S.svg('relatorio')}</span><h2>A receber</h2></div><p class="cz-kpi-n" data-rolo></p><p class="cz-kpi-p"><span class="cz-pill" data-pill></span></p></article>
    </div>
    <div class="cz-graficos">
      <section class="card cz-card cz-veics" aria-labelledby="cz-t-v"><div class="cz-card-cab"><h2 id="cz-t-v">Por veículo</h2><span class="cz-sub">vendido</span></div><ul class="cz-barras" data-barras></ul></section>
      <section class="card cz-card cz-dias" aria-labelledby="cz-t-d"><div class="cz-card-cab"><h2 id="cz-t-d">Por ${unidadeT}</h2><span class="cz-sub">arraste para escolher ${unidadeT === 'mês' ? 'os meses' : 'os dias'}</span></div>
        <div class="cz-plot" data-plot tabindex="0" role="group" aria-label="Vendido por ${unidadeT}. Setas: mover o cursor. Shift e setas: escolher um intervalo. Enter: escolher. Esc: tirar os filtros.">
          <svg class="cz-svg" data-svg aria-hidden="true" focusable="false"><defs><linearGradient id="cz-g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset=".75" stop-color="var(--accent)" stop-opacity=".04"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient><clipPath id="cz-c-rango"><rect data-clip x="0" y="0" width="0" height="10"/></clipPath></defs>
            <g data-rej></g><rect class="cz-banda" data-banda x="0" y="0" width="0" height="0" rx="8"/><path class="cz-fantasma-area" data-fant-area/><path class="cz-fantasma" data-fant/><path class="cz-area" data-area fill="url(#cz-g-area)"/><path class="cz-linha cz-linha-tenue" data-linha-tenue/><g clip-path="url(#cz-c-rango)"><path class="cz-linha" data-linha/></g>
            <g class="cz-cursor" data-cursor><line class="cz-guia" data-guia y1="0" y2="0"/><circle class="cz-ponto-aro" r="9"/><circle class="cz-ponto" r="4.5"/></g>
            <g class="cz-asas" data-asas><rect class="cz-asa" data-asa-a rx="3" width="6" height="26"/><rect class="cz-asa" data-asa-b rx="3" width="6" height="26"/></g></svg>
          <div class="cz-ejex" data-ejex aria-hidden="true"></div><div class="cz-etq-rango" data-etq-rango aria-hidden="true"></div><div class="cz-tip" data-tip aria-hidden="true"><b data-tip-valor>0</b><span data-tip-data>—</span></div></div></section>
      <section class="card cz-card cz-cons" aria-labelledby="cz-t-c"><div class="cz-card-cab"><h2 id="cz-t-c">Por consultor</h2><span class="cz-sub">vendido</span></div>
        <div class="cz-anel" data-anel><svg viewBox="0 0 220 220" class="cz-anel-svg" aria-hidden="true" focusable="false"><g data-anel-g transform="rotate(-90 110 110)"></g></svg><div class="cz-anel-centro"><p class="cz-anel-n" data-rolo data-centro></p><p class="cz-anel-t">vendido</p></div></div>
        <ul class="cz-legenda" data-legenda></ul></section>
    </div>
    <p class="sr" role="status" aria-live="polite" data-vivo></p></section>`;

  S.cruzado = (raiz, D) => {
    const NC = D.veiculos.length, ND = D.consultores.length, NT = D.rotulos.length;
    const $ = s => raiz.querySelector(s), $$ = s => Array.from(raiz.querySelectorAll(s));
    const vivo = $('[data-vivo]'), anuncia = t => { vivo.textContent = ''; setTimeout(() => { vivo.textContent = t; }, 40); };
    const longo = t => (D.rotulosLongos || D.rotulos)[t];
    const f = { c:null, d:null, r:null }, sem = { c:null, d:null, r:null };
    const temFiltro = () => f.c != null || f.d != null || !!f.r;
    // Soma vendido (s) e PIs (o) por uma dimensão ('c', 'd', 't' ou null = total), com todos os filtros menos o da própria dimensão
    function soma(fl, dim) {
      const n = dim === 'c' ? NC : dim === 'd' ? ND : dim === 't' ? NT : 1, out = Array.from({ length:n }, () => ({ s:0, o:0 }));
      for (let c = 0; c < NC; c++) { if (dim !== 'c' && fl.c != null && c !== fl.c) continue;
        for (let d = 0; d < ND; d++) { if (dim !== 'd' && fl.d != null && d !== fl.d) continue;
          for (let t = 0; t < NT; t++) { if (dim !== 't' && fl.r && (t < fl.r[0] || t > fl.r[1])) continue;
            const x = out[dim === 'c' ? c : dim === 'd' ? d : dim === 't' ? t : 0]; x.s += D.V[c][d][t]; x.o += D.N[c][d][t]; } } }
      return out; }
    const gC = soma(sem, 'c'), gT = soma(sem, 't'), gD = soma(sem, 'd'), gTot = soma(sem, null)[0];
    const maxC = Math.max(1, ...gC.map(x => x.s)), maxT = Math.max(1, ...gT.map(x => x.s));
    const bonito = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
    const passoY = bonito(maxT * 1.06 / 5), teto = passoY * 5;

    // ---------- barras por veículo ----------
    const listaB = $('[data-barras]');
    const barras = D.veiculos.map((v, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<button class="cz-barra" type="button" aria-pressed="false" data-barra="${i}" tabindex="${i ? -1 : 0}" title="${esc(v.titulo || v.nome)}"><span class="cz-barra-n">${esc(v.nome)}</span><span class="cz-pista"><i class="cz-b-fant"></i><i class="cz-b-main"></i></span><span class="cz-barra-v">0</span></button>`;
      listaB.appendChild(li); const btn = li.firstChild;
      const b = { btn, fant:btn.querySelector('.cz-b-fant'), main:btn.querySelector('.cz-b-main'), val:btn.querySelector('.cz-barra-v'), v:resorte(0, 150, 17), dim:resorte(0, 170, 19) };
      b.fant.style.width = (gC[i].s / maxC * 100).toFixed(2) + '%';
      btn.addEventListener('click', () => muda({ c:f.c === i ? null : i })); return b; });
    function pintaBarras() { barras.forEach(b => { const v = lim(b.v.x, 0, 1);
      b.main.style.clipPath = 'inset(0 ' + (100 - v * 100).toFixed(2) + '% 0 0 round 7px)'; b.main.style.opacity = (1 - .72 * lim(b.dim.x, 0, 1)).toFixed(3);
      b.val.textContent = curto(Math.max(0, b.v.x) * maxC); }); }
    function moveFoco(e, btns) { const k = { ArrowDown:1, ArrowRight:1, ArrowUp:-1, ArrowLeft:-1 }, i = btns.indexOf(document.activeElement); if (i < 0) return;
      let n = i; if (e.key in k) n = (i + k[e.key] + btns.length) % btns.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = btns.length - 1; else return;
      e.preventDefault(); btns.forEach((b, j) => { b.tabIndex = j === n ? 0 : -1; }); btns[n].focus(); }
    listaB.addEventListener('keydown', e => moveFoco(e, barras.map(b => b.btn)));

    // ---------- linha por dia (ou mês), com escolha de intervalo ----------
    const plot = $('[data-plot]'), svg = $('[data-svg]'), rej = $('[data-rej]');
    const elFA = $('[data-fant-area]'), elF = $('[data-fant]'), elArea = $('[data-area]'), elLinha = $('[data-linha]'), elTenue = $('[data-linha-tenue]');
    const clip = $('[data-clip]'), banda = $('[data-banda]'), cursorG = $('[data-cursor]'), guia = $('[data-guia]');
    const asas = $('[data-asas]'), asaA = $('[data-asa-a]'), asaB = $('[data-asa-b]'), ejeX = $('[data-ejex]'), etq = $('[data-etq-rango]');
    const tip = $('[data-tip]'), tipV = $('[data-tip-valor]'), tipD = $('[data-tip-data]');
    const ML = 62, MR = 12, MT = 28, MB = 30; let W = 0, H = 0, passo = 1, tipW = 110;
    const pt = Array.from({ length:NT }, () => resorte(0, 130, 16));
    const rx0 = resorte(0, 230, 25), rx1 = resorte(0, 230, 25), bandaOp = resorte(0, 220, 26);
    const cur = { x:resorte(0, 520, 36), on:resorte(0, 300, 30), dia:Math.max(0, NT - 1) };
    const px = i => ML + passo * (i + .5), py = v => MT + (H - MT - MB) * (1 - v), diaEm = x => lim(Math.floor((x - ML) / passo), 0, NT - 1);
    // Curva monótona (Fritsch–Carlson): passa por todos os pontos sem inventar picos nem descer abaixo de zero
    function suave(p) { const n = p.length, dx = [], m = [], t = [];
      for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
      t[0] = m[0]; t[n - 1] = m[n - 2];
      for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
      let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
      for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3;
        d += 'C' + (p[i][0] + h).toFixed(1) + ' ' + (p[i][1] + t[i] * h).toFixed(1) + ' ' + (p[i + 1][0] - h).toFixed(1) + ' ' + (p[i + 1][1] - t[i + 1] * h).toFixed(1) + ' ' + p[i + 1][0].toFixed(1) + ' ' + p[i + 1][1].toFixed(1); }
      return d; }
    const fecha = (d, p) => d + 'L' + p[p.length - 1][0].toFixed(1) + ' ' + py(0).toFixed(1) + 'L' + p[0][0].toFixed(1) + ' ' + py(0).toFixed(1) + 'Z';
    function mede() {
      W = plot.clientWidth; H = plot.clientHeight; if (!W || !H || !NT) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); passo = (W - ML - MR) / NT;
      rej.textContent = '';
      for (let k = 0; k <= 5; k++) { const y = py(k / 5), l = document.createElementNS('http://www.w3.org/2000/svg', 'line'), t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        l.setAttribute('class', 'cz-rej-l'); l.setAttribute('x1', ML); l.setAttribute('x2', W - MR); l.setAttribute('y1', y); l.setAttribute('y2', y);
        t.setAttribute('class', 'cz-rej-t'); t.setAttribute('x', ML - 10); t.setAttribute('y', y + 4); t.setAttribute('text-anchor', 'end'); t.textContent = k ? curto(k * passoY).replace('R$ ', '') : '0';
        rej.appendChild(l); rej.appendChild(t); }
      ejeX.textContent = '';
      const cada = NT <= 12 ? (W < 420 ? 2 : 1) : W < 420 ? 14 : 7;
      for (let i = 0; i < NT; i += cada) { const s = document.createElement('span'); s.style.left = px(i).toFixed(1) + 'px'; s.textContent = D.rotulos[i]; ejeX.appendChild(s); }
      const pf = gT.map((x, i) => [px(i), py(x.s / teto)]), df = NT > 1 ? suave(pf) : '';
      elF.setAttribute('d', df); elFA.setAttribute('d', df ? fecha(df, pf) : '');
      posRango(true); cur.x.x = cur.x.meta = px(cur.dia);
      guia.setAttribute('y1', MT); guia.setAttribute('y2', py(0)); clip.setAttribute('y', 0); clip.setAttribute('height', H);
      pintaLinha(); pintaCursor(); }
    function posRango(salta) { const a = f.r ? px(f.r[0]) - passo / 2 : 0, b = f.r ? px(f.r[1]) + passo / 2 : W;
      if (salta || quieto()) { rx0.x = rx0.meta = rx0.pend = a; rx1.x = rx1.meta = rx1.pend = b; rx0.v = rx1.v = 0; bandaOp.x = bandaOp.meta = bandaOp.pend = f.r ? 1 : 0; return; }
      lanca(rx0, a, 0); lanca(rx1, b, 0); lanca(bandaOp, f.r ? 1 : 0, 0); }
    const rotRango = () => { if (f.r) etq.textContent = f.r[0] === f.r[1] ? longo(f.r[0]) : longo(f.r[0]) + ' – ' + longo(f.r[1]); };
    function pintaLinha() { if (!W || NT < 2) return;
      const p = pt.map((r, i) => [px(i), py(lim(r.x, 0, 1.25))]), d = suave(p);
      elLinha.setAttribute('d', d); elTenue.setAttribute('d', d); elArea.setAttribute('d', fecha(d, p));
      clip.setAttribute('x', rx0.x.toFixed(1)); clip.setAttribute('width', Math.max(0, rx1.x - rx0.x).toFixed(1));
      const op = lim(bandaOp.x, 0, 1);
      banda.setAttribute('x', rx0.x.toFixed(1)); banda.setAttribute('width', Math.max(0, rx1.x - rx0.x).toFixed(1)); banda.setAttribute('y', MT - 4); banda.setAttribute('height', H - MT - MB + 8); banda.style.opacity = op.toFixed(3);
      const yA = (MT + H - MB) / 2 - 13; asaA.setAttribute('x', (rx0.x - 3).toFixed(1)); asaA.setAttribute('y', yA); asaB.setAttribute('x', (rx1.x - 3).toFixed(1)); asaB.setAttribute('y', yA);
      asas.style.opacity = op.toFixed(3); etq.style.opacity = op.toFixed(3);
      etq.style.transform = 'translateX(-50%) translateX(' + lim((rx0.x + rx1.x) / 2, 60, W - 60).toFixed(1) + 'px)'; }
    function pintaCursor() { if (!W || !NT) return; const on = lim(cur.on.x, 0, 1), y = py(lim(pt[cur.dia].x, 0, 1.25));
      cursorG.style.opacity = on.toFixed(3); cursorG.setAttribute('transform', 'translate(' + cur.x.x.toFixed(1) + ' 0)');
      cursorG.querySelectorAll('circle').forEach(c => c.setAttribute('cy', y.toFixed(1)));
      tip.style.opacity = on.toFixed(3); const tx = lim(cur.x.x, 66, W - 66);
      tip.style.transform = 'translate(' + (tx - tipW / 2).toFixed(1) + 'px,' + (y - 62 - (1 - on) * 6).toFixed(1) + 'px)'; }
    function textoTip() { const t = cur.dia, m = aT[t] ? aT[t].s : 0;
      tipV.textContent = (f.c != null || f.d != null) ? curto(m) + ' de ' + curto(gT[t].s) : reais(gT[t].s); tipD.textContent = longo(t); tipW = tip.offsetWidth || tipW; }
    let arraste = null; const relX = e => e.clientX - plot.getBoundingClientRect().left;
    function poeCursor(dia) { cur.dia = dia; lanca(cur.x, px(dia), 0); lanca(cur.on, 1, 0); textoTip(); acorda(passoLinha); }
    const moveCursor = dia => { if (dia !== cur.dia || cur.on.meta !== 1) poeCursor(dia); };
    plot.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') moveCursor(diaEm(relX(e))); });
    plot.addEventListener('pointerleave', () => { if (!arraste) { lanca(cur.on, 0, 0); acorda(passoLinha); } });
    plot.addEventListener('pointerdown', e => { if (e.button !== 0) return; const x = relX(e), dia = diaEm(x); let modo = 'novo';
      if (f.r) { if (Math.abs(x - (px(f.r[0]) - passo / 2)) < 12) modo = 'a'; else if (Math.abs(x - (px(f.r[1]) + passo / 2)) < 12) modo = 'b'; }
      arraste = { modo, ancora:dia, x0:x, mexeu:false, r0:f.r ? f.r.slice() : null }; try { plot.setPointerCapture(e.pointerId); } catch (er) { /* sem captura */ } moveCursor(dia); });
    plot.addEventListener('pointermove', e => { const x = relX(e), dia = diaEm(x);
      if (e.pointerType === 'mouse' || arraste) moveCursor(dia); if (!arraste) return;
      if (Math.abs(x - arraste.x0) > 4) arraste.mexeu = true; if (!arraste.mexeu) return;
      const r = arraste.modo === 'a' ? [Math.min(dia, arraste.r0[1]), Math.max(dia, arraste.r0[1])] : arraste.modo === 'b' ? [Math.min(dia, arraste.r0[0]), Math.max(dia, arraste.r0[0])] : [Math.min(arraste.ancora, dia), Math.max(arraste.ancora, dia)];
      if (!f.r || f.r[0] !== r[0] || f.r[1] !== r[1]) muda({ r }, { rapido:true }); });
    const soltaPlot = e => { if (!arraste) return; const clique = !arraste.mexeu; arraste = null; try { plot.releasePointerCapture(e.pointerId); } catch (er) { /* já solto */ }
      if (clique && f.r) muda({ r:null }); if (e.pointerType !== 'mouse') { lanca(cur.on, 0, 0); acorda(passoLinha); } };
    plot.addEventListener('pointerup', soltaPlot); plot.addEventListener('pointercancel', soltaPlot);
    let kAncora = null;
    plot.addEventListener('keydown', e => { const salto = { ArrowLeft:-1, ArrowRight:1, ArrowDown:-1, ArrowUp:1 }[e.key];
      if (salto || e.key === 'Home' || e.key === 'End') { e.preventDefault(); const antes_ = cur.dia, n = e.key === 'Home' ? 0 : e.key === 'End' ? NT - 1 : lim(cur.dia + salto, 0, NT - 1);
        if (e.shiftKey) { if (kAncora == null) kAncora = antes_; muda({ r:[Math.min(kAncora, n), Math.max(kAncora, n)] }, { rapido:true }); } else kAncora = null;
        poeCursor(n); if (!e.shiftKey) anuncia(longo(n) + ': ' + reais(aT[n].s) + ' vendidos.'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); muda({ r:f.r && f.r[0] === cur.dia && f.r[1] === cur.dia ? null : [cur.dia, cur.dia] }); } });
    plot.addEventListener('keyup', e => { if (e.key === 'Shift') kAncora = null; });
    plot.addEventListener('blur', () => { kAncora = null; if (!arraste) { lanca(cur.on, 0, 0); acorda(passoLinha); } });
    plot.addEventListener('focus', () => poeCursor(cur.dia));
    function passoLinha(dt) { let m = false; pt.forEach(r => { if (puxa(r, dt)) m = true; }); [rx0, rx1, bandaOp, cur.x, cur.on].forEach(r => { if (puxa(r, dt)) m = true; }); pintaLinha(); pintaCursor(); return m; }

    // ---------- anel por consultor ----------
    const grupo = $('[data-anel-g]'), RA = 76, CA = 2 * Math.PI * RA, RF = 98, CF = 2 * Math.PI * RF, NS = 'http://www.w3.org/2000/svg';
    const mk = (cls, r, w) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx', 110); c.setAttribute('cy', 110); c.setAttribute('r', r); if (w) c.setAttribute('stroke-width', w); return c; };
    grupo.appendChild(mk('cz-pista-a', RA, 24));
    let acc0 = 0; gD.forEach(x => { const fr = gTot.s ? x.s / gTot.s : 0, len = fr * CF, gap = 7; if (len > gap + 6) { const c = mk('cz-arco-f', RF, 5);
      c.setAttribute('stroke-dasharray', Math.max(.01, len - gap - 5).toFixed(2) + ' ' + CF.toFixed(2)); c.setAttribute('stroke-dashoffset', (-(acc0 + gap / 2 + 2.5)).toFixed(2)); grupo.appendChild(c); } acc0 += len; });
    const legenda = $('[data-legenda]'), cores = ['var(--cz-1)', 'var(--cz-2)', 'var(--cz-3)', 'var(--cz-4)', 'var(--cz-5)', 'var(--cz-6)'];
    let hovD = -1;
    const anel = D.consultores.map((nome, i) => {
      const arco = mk('cz-arco', RA, 24); arco.style.stroke = cores[i % cores.length];
      arco.addEventListener('click', () => muda({ d:f.d === i ? null : i }));
      arco.addEventListener('pointerenter', () => { hovD = i; refazPop(); }); arco.addEventListener('pointerleave', () => { hovD = -1; refazPop(); });
      grupo.appendChild(arco);
      const li = document.createElement('li');
      li.innerHTML = `<button class="cz-ley" type="button" aria-pressed="false" tabindex="${i ? -1 : 0}" style="--c:${cores[i % cores.length]}"><i></i><span class="cz-ley-n">${esc(nome)}</span><span class="cz-ley-p">0%</span><span class="cz-ley-v">0</span></button>`;
      legenda.appendChild(li); const btn = li.firstChild;
      btn.addEventListener('click', () => muda({ d:f.d === i ? null : i }));
      btn.addEventListener('pointerenter', () => { hovD = i; refazPop(); }); btn.addEventListener('pointerleave', () => { hovD = -1; refazPop(); });
      return { arco, btn, p:btn.querySelector('.cz-ley-p'), v:btn.querySelector('.cz-ley-v'), parte:resorte(0, 110, 15), dim:resorte(0, 170, 19), pop:resorte(0, 220, 17), val:resorte(0, 100, 14) }; });
    legenda.addEventListener('keydown', e => moveFoco(e, anel.map(a => a.btn)));
    function refazPop() { anel.forEach((a, i) => lanca(a.pop, f.d === i ? 1 : hovD === i ? .55 : 0, 0)); acorda(passoAnel); }
    function pintaAnel() { const s = anel.map(a => Math.max(0, a.parte.x)), tot = s.reduce((x, y) => x + y, 0) || 1; let acc = 0;
      anel.forEach((a, i) => { const len = s[i] / tot * CA, gap = 7, L = len - gap - 24;
        a.arco.setAttribute('stroke-dasharray', Math.max(.01, L).toFixed(2) + ' ' + CA.toFixed(2)); a.arco.setAttribute('stroke-dashoffset', (-(acc + gap / 2 + 12)).toFixed(2));
        a.arco.style.opacity = L > .5 ? (1 - .72 * lim(a.dim.x, 0, 1)).toFixed(3) : 0; a.arco.setAttribute('stroke-width', (24 + 7 * lim(a.pop.x, 0, 1.3)).toFixed(2));
        a.p.textContent = dec(s[i] / tot * 100, 0) + '%'; a.v.textContent = curto(Math.max(0, a.val.x)); acc += len; }); }
    function passoAnel(dt) { let m = false; anel.forEach(a => [a.parte, a.dim, a.pop, a.val].forEach(r => { if (puxa(r, dt)) m = true; })); pintaAnel(); return m; }
    const centro = Rolo($('[data-centro]'));

    // ---------- os quatro números ----------
    const kpis = {}; $$('[data-kpi]').forEach(el => { kpis[el.dataset.kpi] = { el, rolo:Rolo(el.querySelector('[data-rolo]')), pill:el.querySelector('[data-pill]') }; });
    const variacao = p => p == null ? 'sem base para comparar' : `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${p}% ${D.variacao.rot}`;
    function pintaKpis(t, inicial) {
      const parte = v => dec(v * 100, 1) + '% do total';
      const pill = (k, txt, tom) => { if (k.pill.textContent === txt && k.pill.dataset.tom === (tom || '')) return; k.pill.textContent = txt; k.pill.dataset.tom = tom || '';
        k.pill.classList.remove('cz-muda'); void k.pill.offsetWidth; if (!quieto() && !inicial) k.pill.classList.add('cz-muda'); };
      const vv = D.variacao || {}, tomVar = p => p == null ? '' : p > 0 ? 'bom' : p < 0 ? 'ruim' : '';
      kpis.vendido.rolo.poe(reais(t.s), inicial); pill(kpis.vendido, temFiltro() ? parte(gTot.s ? t.s / gTot.s : 0) : variacao(vv.vendido), temFiltro() ? '' : tomVar(vv.vendido));
      kpis.pis.rolo.poe(milhar(t.o), inicial); pill(kpis.pis, temFiltro() ? parte(gTot.o ? t.o / gTot.o : 0) : variacao(vv.pis), temFiltro() ? '' : tomVar(vv.pis));
      const tk = t.o ? t.s / t.o : 0, tkG = gTot.o ? gTot.s / gTot.o : 0, dif = tk - tkG;
      kpis.ticket.rolo.poe(reais(tk), inicial); pill(kpis.ticket, temFiltro() && t.o ? (dif >= 0 ? '+' : '−') + curto(Math.abs(dif)) + ' vs. a média' : 'média por PI');
      const r = D.receber ? D.receber(f) : { valor:0, vencido:0, parcelas:0 };
      kpis.receber.rolo.poe(reais(r.valor), inicial); pill(kpis.receber, r.vencido ? curto(r.vencido) + ' vencido' : r.parcelas ? 'nada vencido' : 'nada em aberto', r.vencido ? 'ruim' : 'bom');
    }

    // ---------- etiquetas dos filtros ----------
    const chipsUl = $('[data-chips]'), zona = $('[data-filtros]'), btnLimpar = $('[data-limpar]'), chips = {};
    const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    const textoFiltro = k => k === 'c' ? ['Veículo', D.veiculos[f.c].nome] : k === 'd' ? ['Consultor', D.consultores[f.d]]
      : ['Período', (f.r[0] === f.r[1] ? longo(f.r[0]) : longo(f.r[0]) + ' – ' + longo(f.r[1])) + (f.r[1] > f.r[0] ? ` · ${f.r[1] - f.r[0] + 1} ${D.unidadeT === 'mês' ? 'meses' : 'dias'}` : '')];
    function sincronizaChips() {
      ['c', 'd', 'r'].forEach(k => { const ativo = k === 'r' ? !!f.r : f[k] != null;
        if (ativo) { const [nome, valor] = textoFiltro(k); let ch = chips[k];
          if (!ch) { const li = document.createElement('li'); li.className = 'cz-chip'; li.innerHTML = `<span class="cz-chip-k"></span><b></b><button type="button">${X}</button>`;
            li.querySelector('button').addEventListener('click', () => muda(k === 'r' ? { r:null } : k === 'c' ? { c:null } : { d:null }, { onda:true }));
            chipsUl.appendChild(li); ch = chips[k] = { li }; anima(li, [{ opacity:0, transform:'translateY(-12px) scale(.55)' }, { opacity:1, transform:'none' }], { duration:700, easing:mola(300, 17) }); }
          ch.li.querySelector('.cz-chip-k').textContent = nome + ':'; ch.li.querySelector('b').textContent = valor; ch.li.querySelector('button').setAttribute('aria-label', `Tirar o filtro ${nome}: ${valor}`); }
        else if (chips[k]) { const li = chips[k].li; delete chips[k];
          const a = anima(li, [{ opacity:1, transform:'none' }, { opacity:0, transform:'translateY(-6px) scale(.6)' }], { duration:240, easing:'cubic-bezier(.4, 0, .6, 1)', fill:'forwards' });
          if (a) a.onfinish = () => li.remove(); else li.remove(); } });
      const n = Object.keys(chips).length; zona.classList.toggle('cz-ativo', n > 0); btnLimpar.hidden = n < 2; }
    btnLimpar.addEventListener('click', () => limpa());

    // ---------- a mudança de filtro: novas metas, e tudo viaja ----------
    let aT = soma(sem, 't');
    function muda(parche, opc) {
      const op = opc || {}, antes_ = JSON.stringify(f);
      if ('c' in parche) f.c = parche.c; if ('d' in parche) f.d = parche.d; if ('r' in parche) f.r = parche.r;
      if (JSON.stringify(f) === antes_) return;
      atualiza(op); sincronizaChips();
      if (D.alCambiar) D.alCambiar({ c:f.c, d:f.d, r:f.r && f.r.slice() });
      const partes = []; if (f.c != null) partes.push('veículo ' + D.veiculos[f.c].nome); if (f.d != null) partes.push('consultor ' + D.consultores[f.d]); if (f.r) partes.push(longo(f.r[0]) + ' a ' + longo(f.r[1]));
      const tot = soma(f, null)[0]; if (!op.rapido) anuncia((partes.length ? 'Filtros: ' + partes.join(', ') : 'Sem filtros') + '. ' + reais(tot.s) + ' de ' + reais(gTot.s) + '.'); }
    function atualiza(op, inicial) {
      const aC = soma(f, 'c'), aD = soma(f, 'd'), tot = soma(f, null)[0]; aT = soma(f, 't');
      const k = op.rapido ? 0 : op.onda ? 1.7 : 1;
      barras.forEach((b, i) => { lanca(b.v, aC[i].s / maxC, i * .04 * k); lanca(b.dim, f.c != null && f.c !== i ? 1 : 0, i * .03 * k);
        b.btn.classList.toggle('cz-sel', f.c === i); b.btn.setAttribute('aria-pressed', f.c === i); });
      aT.forEach((x, i) => lanca(pt[i], x.s / teto, i * .011 * k)); posRango(false); rotRango();
      const total = aD.reduce((a, x) => a + x.s, 0);
      anel.forEach((a, i) => { lanca(a.parte, total ? aD[i].s / total : 0, i * .07 * k); lanca(a.dim, f.d != null && f.d !== i ? 1 : 0, i * .05 * k); lanca(a.val, aD[i].s, i * .07 * k);
        a.btn.classList.toggle('cz-sel', f.d === i); a.btn.setAttribute('aria-pressed', f.d === i); });
      refazPop(); centro.poe(curto(total), inicial); pintaKpis(tot, inicial); textoTip();
      acorda(passoBarras); acorda(passoLinha); acorda(passoAnel); }
    function passoBarras(dt) { let m = false; barras.forEach(b => { if (puxa(b.v, dt)) m = true; if (puxa(b.dim, dt)) m = true; }); pintaBarras(); return m; }
    function limpa() { muda({ c:null, d:null, r:null }, { onda:true }); }
    // Esc tira todos os filtros (só enquanto o painel está na tela e nenhuma janela está aberta)
    const esc_ = e => { if (!document.contains(raiz)) { document.removeEventListener('keydown', esc_); return; }
      const dl = document.getElementById('dlg'); if (e.key === 'Escape' && temFiltro() && !(dl && dl.open)) { e.preventDefault(); limpa(); } };
    document.addEventListener('keydown', esc_);

    // Animação que já terminou sai da classe: quando a tela é redesenhada e o painel volta ao lugar, nada repete
    raiz.addEventListener('animationend', e => e.target.classList.remove('cz-muda', 'cz-rod-entra'));
    mede();
    if (window.ResizeObserver) new ResizeObserver(() => mede()).observe(plot);
    atualiza({ onda:true }, true); sincronizaChips();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { mede(); pintaBarras(); });
    return { filtra:p => muda(p), limpa, get filtros() { return { c:f.c, d:f.d, r:f.r && f.r.slice() }; } };
  };
})();

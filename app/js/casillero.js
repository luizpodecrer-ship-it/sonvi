// SONVI · Dashboard do veículo em blocos que se reacomodam (24/10/2026).
// Adaptado do recurso "Casillero" da Moxen (moxen.cl/recursos), usado conforme a licença dele: dentro do produto,
// sem redistribuir o código como modelo. Sem bibliotecas.
//
// Sete blocos numa grade de 4 × 3. Ao escolher um bloco ele passa para o espaço grande e a grade inteira se reacomoda:
// cada bloco viaja da caixa antiga para a nova (FLIP: mede antes e depois) com uma mola própria, em onda a partir do
// escolhido. Nada se deforma no caminho: o bloco escala, mas cada peça de dentro escala ao contrário, presa à borda que
// o CSS manda (--cx-ancla: esq/dir/centro/estica × cima/baixo/centro/estica), e o arredondado é corrigido a cada quadro.
// O bloco grande mostra o detalhe (lista, legenda, eixo) e o atalho para a tela do assunto.
//
// S.cxHtml(blocos, escolhido) monta o HTML; S.casillero(raiz, { aoEscolher }) liga o movimento.
// Cada bloco: { id:'a'…'g', tipo, titulo, icone, rotulo (o que o leitor de tela ouve), link:{ rota, texto }, … }
(() => {
  'use strict';
  const PASO = 1 / 240, MOLA = 250, ATRITO = 25;
  const lim = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  // ---------- o conteúdo de cada tipo de bloco ----------
  // valor: número grande, variação e barras (meses ou semanas)
  // fila: contador com ponto vivo, linha de apoio e, no grande, a lista
  // etapas: total e a faixa colorida por etapa; no grande, a legenda
  // anel: 48 marcas que acendem até a porcentagem; no grande, as linhas de apoio
  // tira: situação ("Tudo em dia"), uma barra por dia e a nota
  // pessoas: lista com marca (feito/não feito) e valor
  // colunas: número e colunas (semanas), com a nota
  const cab = b => `<span class="cx-cab">${b.vivo ? `<i class="cx-vivo${b.vivo === 'alerta' ? ' alerta' : ''}" aria-hidden="true"></i>` : S.svg(b.icone || 'dashboard')}${esc(b.titulo)}</span>`;
  const num = (txt, cls) => `<span class="${cls}"><span data-num="${esc(txt)}">${esc(txt)}</span></span>`;
  const barras = (vals, cls, rots) => { const max = Math.max(...vals, 1);
    return `<span class="${cls}" aria-hidden="true">${vals.map((v, i) => `<i style="--h:${Math.max(.04, v / max).toFixed(3)}"${i === vals.length - 1 ? ' class="ult"' : ''}></i>`).join('')}</span>${rots ? `<span class="cx-eixo" aria-hidden="true">${rots.map(r => `<span>${esc(r)}</span>`).join('')}</span>` : ''}`; };
  const TIPOS = {
    valor: b => `${cab(b)}${b.delta ? `<span class="cx-delta" data-tom="${b.delta.tom || ''}">${esc(b.delta.txt)}</span>` : ''}${num(b.valor, 'cx-monto')}${barras(b.barras, 'cx-barras', b.rotulos)}`,
    fila: b => `${cab(b)}${num(b.numero, 'cx-contador')}<span class="cx-apoio">${esc(b.apoio)}</span>
      <ul class="cx-lista cx-fila" aria-hidden="true">${(b.itens || []).slice(0, 5).map(x => `<li><span class="cx-l-tx"><b>${esc(x.tx)}</b><small>${esc(x.sub)}</small></span><span class="cx-l-vl"><b>${esc(x.vl)}</b>${x.tag ? `<small data-tom="${x.tom || ''}">${esc(x.tag)}</small>` : ''}</span></li>`).join('') || `<li class="cx-nada">${esc(b.vazio || 'Nada por aqui.')}</li>`}</ul>`,
    etapas: b => { const tot = b.etapas.reduce((s, e) => s + e.n, 0) || 1;
      return `${cab(b)}${num(b.numero, 'cx-contador')}<span class="cx-apoio">${esc(b.apoio)}</span>
      <span class="cx-faixa" aria-hidden="true">${b.etapas.filter(e => e.n).map(e => `<i style="flex:${e.n / tot};background:${e.cor}"></i>`).join('')}</span>
      <ul class="cx-legenda" aria-hidden="true">${b.etapas.map(e => `<li><i style="background:${e.cor}"></i><span>${esc(e.nome)}</span><small>${esc(e.vl)}</small><b>${e.n}</b></li>`).join('')}</ul>`; },
    anel: b => { let m = ''; const acesas = Math.round(lim(b.pct, 0, 100) / 100 * 48);
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
        m += `<line${i < acesas ? ' class="acesa" style="--i:' + i + '"' : ''} x1="${(60 + c * 44).toFixed(2)}" y1="${(60 + s * 44).toFixed(2)}" x2="${(60 + c * 54).toFixed(2)}" y2="${(60 + s * 54).toFixed(2)}"/>`; }
      return `${cab(b)}<span class="cx-anel" aria-hidden="true"><svg viewBox="0 0 120 120">${m}</svg><b>${Math.round(b.pct)}<small>%</small></b></span>
      <span class="cx-pe">${num(b.numero, 'cx-pe-n')}<span class="cx-pe-t">${esc(b.apoio)}</span></span>
      <ul class="cx-linhas" aria-hidden="true">${(b.linhas || []).map(l => `<li><span>${esc(l[0])}</span><b data-tom="${l[2] || ''}">${esc(l[1])}</b></li>`).join('')}</ul>`; },
    tira: b => { const max = Math.max(...b.dias, 1);
      return `${cab(b)}<span class="cx-titular" data-tom="${b.tom || ''}">${esc(b.titular)}</span>
      <span class="cx-tira" aria-hidden="true">${b.dias.map(v => `<i style="--h:${Math.max(.08, v / max).toFixed(3)}"${v ? '' : ' class="zero"'}></i>`).join('')}</span><span class="cx-nota">${esc(b.nota)}</span>`; },
    pessoas: b => `${cab(b)}<span class="cx-cuenta">${esc(b.cuenta)}</span>
      <ul class="cx-lista cx-pessoas" aria-hidden="true">${b.itens.map(x => `<li${x.ok ? ' class="ok"' : ''}><i class="cx-marca"></i><span class="cx-p-n">${esc(x.nome)}</span><small>${esc(x.sub || '')}</small><b>${esc(x.vl)}</b></li>`).join('') || `<li class="cx-nada">${esc(b.vazio || 'Ninguém por aqui.')}</li>`}</ul>`,
    colunas: b => `${cab(b)}${num(b.numero, 'cx-ms')}<span class="cx-nota cx-nota-c">${esc(b.nota)}</span>${barras(b.barras, 'cx-colunas', b.rotulos)}`
  };
  S.cxHtml = (blocos, escolhido, rotulo) => `<div class="cx-grade" data-casillero data-forma="${escolhido}" role="group" aria-label="${esc(rotulo || 'Resumo do veículo')}">
    ${blocos.map(b => `<article class="cx-celda cx-t-${b.tipo}${b.id === escolhido ? ' grande' : ''}" data-celda="${b.id}">
      <button type="button" class="cx-toque" aria-pressed="${b.id === escolhido}" aria-label="${esc(b.rotulo || b.titulo)}. Mostrar em destaque"></button>
      ${TIPOS[b.tipo](b)}${b.link ? `<a class="cx-abrir" href="#${b.link.rota}" data-go="${b.link.rota}">${esc(b.link.texto)}${S.svg('seta', 14)}</a>` : ''}</article>`).join('')}</div>`;

  // ---------- o movimento ----------
  S.casillero = (raiz, op = {}) => {
    const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raio = 12, atual = raiz.dataset.forma;
    const celdas = Array.from(raiz.querySelectorAll('.cx-celda')).map(el => ({ el, id:el.dataset.celda, toque:el.querySelector('.cx-toque'),
      pecas:Array.from(el.children).filter(p => !p.classList.contains('cx-toque')).map(p => ({ el:p })),
      L:null, x:0, y:0, w:1, h:1, vx:0, vy:0, vw:0, vh:0, solta:0, quieta:false, d0:0 }));
    // Os números entram rolando (uma vez, ao montar)
    raiz.querySelectorAll('[data-num]').forEach(el => { const t = el.dataset.num; el.textContent = ''; if (S.rolo) S.rolo(el).poe(t, !op.semEntrada); else el.textContent = t; });

    function mede() {
      raio = parseFloat(getComputedStyle(raiz).getPropertyValue('--cx-raio')) || 12;
      celdas.forEach(c => {
        c.L = { x:c.el.offsetLeft, y:c.el.offsetTop, w:c.el.offsetWidth || 1, h:c.el.offsetHeight || 1 };
        c.pecas.forEach(p => { const antes = [p.x, p.y, p.w, p.h];
          p.x = p.el.offsetLeft; p.y = p.el.offsetTop; p.w = p.el.offsetWidth; p.h = p.el.offsetHeight;
          p.muda = antes[0] != null && [p.x, p.y, p.w, p.h].some((v, i) => Math.abs(v - antes[i]) > 6);
          const a = getComputedStyle(p.el).getPropertyValue('--cx-ancla').trim().split(/\s+/); p.ax = a[0] || 'esq'; p.ay = a[1] || 'cima'; });
        c.quieta = false; });
    }
    function elige(id) {
      if (id === atual || !celdas.some(c => c.id === id)) return;
      atual = id; raiz.dataset.forma = id;
      celdas.forEach(c => { const si = c.id === id; c.el.classList.toggle('grande', si); c.toque.setAttribute('aria-pressed', si); });
      mede();
      const e = celdas.find(c => c.id === id), ex = e.x + e.w / 2, ey = e.y + e.h / 2, agora = performance.now();
      celdas.forEach(c => {
        // Peças que mudam de forma (o número que cresce, a lista que aparece) não aparecem pela metade: somem e voltam na chegada
        c.d0 = Math.abs(c.w - c.L.w) + Math.abs(c.h - c.L.h);
        c.pecas.forEach(p => { if (p.muda && !reduz && c.d0 > 8) { p.op = 0; p.el.style.opacity = 0; } });
        const dist = Math.hypot(c.x + c.w / 2 - ex, c.y + c.h / 2 - ey);
        c.solta = agora + (c === e ? 0 : Math.min(130, 25 + dist * .11));
        c.el.style.zIndex = c === e ? 3 : 1;
        if (reduz) { c.x = c.L.x; c.y = c.L.y; c.w = c.L.w; c.h = c.L.h; }
      });
      if (op.aoEscolher) op.aoEscolher(id);
      roda();
    }
    celdas.forEach(c => c.toque.addEventListener('click', () => elige(c.id)));

    function molas(dt, t) { let mexe = false;
      for (const c of celdas) { if (t < c.solta) { mexe = true; continue; } const L = c.L;
        c.vx += (MOLA * (L.x - c.x) - ATRITO * c.vx) * dt; c.x += c.vx * dt;
        c.vy += (MOLA * (L.y - c.y) - ATRITO * c.vy) * dt; c.y += c.vy * dt;
        c.vw += (MOLA * (L.w - c.w) - ATRITO * c.vw) * dt; c.w += c.vw * dt;
        c.vh += (MOLA * (L.h - c.h) - ATRITO * c.vh) * dt; c.h += c.vh * dt;
        if (Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vw) + Math.abs(c.vh) > .5 || Math.abs(L.x - c.x) + Math.abs(L.y - c.y) + Math.abs(L.w - c.w) + Math.abs(L.h - c.h) > .1) mexe = true; }
      return mexe; }
    function pinta() {
      for (const c of celdas) {
        const L = c.L, sx = c.w / L.w, sy = c.h / L.h, dx = c.x - L.x, dy = c.y - L.y;
        if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4 && Math.abs(dx) < .05 && Math.abs(dy) < .05) {
          if (!c.quieta) { c.quieta = true; c.el.style.transform = c.el.style.borderRadius = ''; c.el.style.zIndex = '';
            c.pecas.forEach(p => { p.el.style.transform = ''; if (p.op != null) { p.op = null; p.el.style.opacity = ''; } }); }
          continue; }
        c.quieta = false;
        c.el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        c.el.style.borderRadius = `${(raio / sx).toFixed(2)}px / ${(raio / sy).toFixed(2)}px`;
        const chega = c.d0 > 8 ? 1 - (Math.abs(c.w - L.w) + Math.abs(c.h - L.h)) / c.d0 : 1;
        for (const p of c.pecas) {
          if (p.op != null && p.op < 1) { p.op = Math.max(p.op, lim((chega - .25) / .45, 0, 1)); p.el.style.opacity = p.op.toFixed(3); }
          let kx = 1 / sx, ky = 1 / sy, X = p.x, Y = p.y;
          if (p.ax === 'dir') X = c.w - (L.w - p.x); else if (p.ax === 'centro') X = p.x + (c.w - L.w) / 2; else if (p.ax === 'estica') { X = p.x * sx; kx = 1; }
          if (p.ay === 'baixo') Y = c.h - (L.h - p.y); else if (p.ay === 'centro') Y = p.y + (c.h - L.h) / 2; else if (p.ay === 'estica') { Y = p.y * sy; ky = 1; }
          p.el.style.transform = `translate(${(X / sx - p.x).toFixed(2)}px, ${(Y / sy - p.y).toFixed(2)}px) scale(${kx.toFixed(4)}, ${ky.toFixed(4)})`;
        }
      }
    }
    let raf = 0, antes = 0, resto = 0;
    function laco(t) { raf = 0; const dt = antes ? Math.min(.05, (t - antes) / 1000) : 1 / 60; antes = t; resto += dt; let mexe = false;
      while (resto >= PASO) { if (molas(PASO, t)) mexe = true; resto -= PASO; }
      pinta(); if (mexe && document.contains(raiz)) raf = requestAnimationFrame(laco); else antes = 0; }
    const roda = () => { if (reduz) { pinta(); return; } if (!raf) raf = requestAnimationFrame(laco); };
    // Ao mudar o tamanho da tela, as caixas vão para o lugar sem animar
    function assenta() { if (!document.contains(raiz)) return; mede(); celdas.forEach(c => { c.x = c.L.x; c.y = c.L.y; c.w = c.L.w; c.h = c.L.h; c.vx = c.vy = c.vw = c.vh = 0; }); pinta(); }
    if (window.ResizeObserver) { let espera = 0; const ro = new ResizeObserver(() => { if (!document.contains(raiz)) { ro.disconnect(); return; } cancelAnimationFrame(espera); espera = requestAnimationFrame(assenta); }); ro.observe(raiz); }
    assenta();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(assenta);
    return { elige };
  };
})();

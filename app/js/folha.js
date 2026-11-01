// SONVI · visualizador do PI da agência (31/10/2026, artifact "Importar PI · versão simples"). Desenha o PDF ou a foto
// como imagem (pdf.js do cdnjs, carregado só na hora), sempre deitado: giro = graus no sentido horário; sem giro guardado,
// página em pé gira 90°. Barra com zoom, Girar, Tela cheia e Abrir. Usado na conferência da importação, no PI (original
// da agência) e na página da OPEC (pi.html). Estilos .fo-* em sonvi.css.
(() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let carregando = null;
  const pdfjs = () => window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : (carregando = carregando || new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { carregando = null; erro(new Error('Não foi possível abrir o leitor de PDF.')); }; document.head.appendChild(s); }));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const ehPdf = (tipo, nome) => /pdf/i.test(tipo || '') || /\.pdf($|\?)/i.test(nome || '');
  const ehImg = (tipo, nome) => /^image\//i.test(tipo || '') || /\.(png|jpe?g|webp|gif)($|\?)/i.test(nome || '');

  // el: onde montar. o = { url, tipo, nome, giro (null = automático), altura, aoGirar(giro), abrir:true }
  const montar = (el, o) => {
    const st = { giro:o.giro == null ? null : ((Number(o.giro) % 360) + 360) % 360, zoom:1, paginas:[] };
    el.classList.add('fo');
    el.innerHTML = `<div class="fo-bar"><b class="fo-nome">${esc(o.titulo || o.nome || 'PI da agência')}</b><span class="fo-gr"></span>
      <button type="button" class="fo-b" data-fo="menos" aria-label="Diminuir">−</button><button type="button" class="fo-b" data-fo="mais" aria-label="Aumentar">+</button>
      <button type="button" class="fo-b fo-txt" data-fo="girar">↻ Girar</button><button type="button" class="fo-b fo-txt" data-fo="cheia">Tela cheia</button>
      ${o.abrir === false ? '' : `<a class="fo-b fo-txt" href="${esc(o.url)}" target="_blank" rel="noopener">Abrir</a>`}</div>
      <div class="fo-area"${o.altura ? ` style="height:${o.altura}"` : ''}><div class="fo-folhas"><p class="fo-msg">Abrindo o documento…</p></div></div>`;
    const area = el.querySelector('.fo-area'), folhas = el.querySelector('.fo-folhas');
    // Desenha cada página no giro atual (as fontes ficam guardadas em st.paginas)
    const desenhar = async () => {
      const w = Math.max(320, area.clientWidth - 24), canvases = [];
      for (const p of st.paginas) {
        const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
        if (p.pdf) { const base = p.pdf.getViewport({ scale:1, rotation:(p.pdf.rotate + st.giro) % 360 }), k = (w * st.zoom) / base.width;
          const vp = p.pdf.getViewport({ scale:k * dpr, rotation:(p.pdf.rotate + st.giro) % 360 }); c.width = vp.width; c.height = vp.height;
          await p.pdf.render({ canvasContext:c.getContext('2d'), viewport:vp }).promise; }
        else { const img = p.img, deitar = st.giro % 180 !== 0, iw = deitar ? img.naturalHeight : img.naturalWidth, ih = deitar ? img.naturalWidth : img.naturalHeight, k = Math.min(2400 / Math.max(iw, ih), (w * st.zoom * dpr) / iw);
          c.width = Math.round(iw * k); c.height = Math.round(ih * k); const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(st.giro * Math.PI / 180);
          const dw = img.naturalWidth * k, dh = img.naturalHeight * k; g.drawImage(img, -dw / 2, -dh / 2, dw, dh); }
        c.style.width = (w * st.zoom) + 'px'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Página ${canvases.length + 1} do PI`); canvases.push(c);
      }
      folhas.replaceChildren(...canvases);
    };
    const pronto = (async () => {
      try {
        if (ehPdf(o.tipo, o.nome || o.url)) { const lib = await pdfjs(), doc = await lib.getDocument({ url:o.url }).promise;
          for (let i = 1; i <= Math.min(doc.numPages, 6); i++) st.paginas.push({ pdf:await doc.getPage(i) }); }
        else if (ehImg(o.tipo, o.nome || o.url)) { const img = new Image(); img.crossOrigin = 'anonymous'; await new Promise((ok, erro) => { img.onload = ok; img.onerror = () => erro(new Error('Não foi possível abrir a imagem.')); img.src = o.url; }); st.paginas.push({ img }); }
        else { folhas.innerHTML = `<p class="fo-msg">Este arquivo não tem prévia. Use "Abrir".</p>`; return; }
        if (st.giro == null) { const p = st.paginas[0], v = p.pdf ? p.pdf.getViewport({ scale:1 }) : { width:p.img.naturalWidth, height:p.img.naturalHeight }; st.giro = v.height > v.width * 1.05 ? 90 : 0; }
        await desenhar();
      } catch (e) { console.error(e); folhas.innerHTML = `<p class="fo-msg">Não foi possível mostrar a prévia. ${o.abrir === false ? '' : 'Use "Abrir".'}</p>`; }
    })();
    let ultimaW = 0; const ro = new ResizeObserver(() => { const w = area.clientWidth; if (st.paginas.length && Math.abs(w - ultimaW) > 40) { ultimaW = w; desenhar(); } }); ro.observe(area);
    el.addEventListener('click', e => { const b = e.target.closest('[data-fo]'); if (!b) return;
      const a = b.dataset.fo;
      if (a === 'mais') st.zoom = Math.min(3, st.zoom + .25); else if (a === 'menos') st.zoom = Math.max(.5, st.zoom - .25);
      else if (a === 'girar') { st.giro = ((st.giro || 0) + 90) % 360; if (o.aoGirar) o.aoGirar(st.giro); }
      else if (a === 'cheia') { if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); return; }
      desenhar(); });
    document.addEventListener('fullscreenchange', () => { if (st.paginas.length) setTimeout(desenhar, 60); });
    return { pronto, giro:() => st.giro, parar:() => ro.disconnect() };
  };
  window.SONVI_FOLHA = { montar };
})();

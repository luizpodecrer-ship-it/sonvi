// SONVI · Follow-up: painel com quatro anéis por tipo de contato (24/10/2026).
// Adaptado do recurso "Cuadrante" da Moxen (moxen.cl/recursos), usado conforme a licença dele: dentro do produto, sem
// redistribuir o código como modelo. Sem bibliotecas.
//
// Quatro anéis concêntricos (canvas): Visitas, Ligações, WhatsApp e Reuniões. Cada anel enche até feitos / planejados
// no período; o centro mostra o total feito e, ao passar o mouse numa linha ou num anel, só aquele tipo. Quando um tipo
// chega a 100%, o anel fecha com um brilho e a linha ganha "Tudo feito!". Ao lado: a linha dos contatos registrados e as
// barras das propostas pedidas. Trocar o período (Semana · Mês · 3 meses) leva os arcos com mola, os números rolam,
// a linha se transforma e as barras brotam de novo. Sem dados "ao vivo" de enfeite: tudo vem do Follow-up.
//
// S.cuHtml({ quem, atrasados, periodo }) monta o HTML; S.cuadrante(raiz, { datos:[3 períodos], inicial, alMudar(i) }).
// datos[i] = { texto, canales:[{ v, meta, d }]×4, ingresos:{ valores, etiquetas, delta }, pedidos:{ valores, etiquetas, delta, texto } }
// (d e delta em %; null = sem base para comparar)
(function () {
  'use strict';

  /* ── resortes ─────────────────────────────────────────────────────── */
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const quieto = r => Math.abs(r.meta - r.x) < .0006 && Math.abs(r.v) < .003;

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS
  function muelle(k, c) {
    const pts = [0];
    let x = 0, v = 0, t = 0;
    while (t < 3) {
      v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240;
      pts.push(x);
      if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break;
    }
    const out = [];
    for (let i = 0; i <= 40; i++) out.push(pts[Math.round(i / 40 * (pts.length - 1))].toFixed(4));
    out[40] = '1';
    return 'linear(' + out.join(', ') + ')';
  }

  // azar con semilla: el panel y el vídeo coinciden siempre
  function mulberry32(s) {
    return () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 12.480 · 12,4 — miles con punto y decimales con coma
  function fmt(n, dec) {
    const [e, d] = Math.abs(n).toFixed(dec || 0).split('.');
    return e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
  }
  const suma = a => a.reduce((s, x) => s + x, 0);

  /* Una curva suave que no se pasa de los puntos (interpolación cúbica
     monótona): la línea sube y baja sin ondularse entre dos puntos. */
  function monotona(y) {
    const n = y.length, m = new Array(n), d = [];
    if (n < 2) return () => y[0] || 0;
    for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) * (n - 1);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return t => {
      const p = Math.min(n - 1 - 1e-9, Math.max(0, t * (n - 1))), i = Math.floor(p), u = p - i, h = 1 / (n - 1), u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }

  const clona = o => JSON.parse(JSON.stringify(o));
  const NOMBRES = ['Visitas', 'Ligações', 'WhatsApp', 'Reuniões'];

  /* =====================================================================
     Las cifras que ruedan: cada dígito es una tira de 0 a 9 que sube o
     baja con un resorte hasta el número nuevo, escalonada de izquierda a
     derecha. Si el número cambia de largo se rearma y las ruedas nuevas parten
     de los dígitos que había, alineados por la derecha.
     ===================================================================== */
  const TIRA = '<b>0</b><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6</b><b>7</b><b>8</b><b>9</b>';
  function Cifras(el) {
    const oculto = document.createElement('span'), ruedas = document.createElement('span');
    oculto.className = 'cu-oculto';
    ruedas.className = 'cu-ruedas'; ruedas.setAttribute('aria-hidden', 'true');
    el.append(oculto, ruedas);
    let forma = null, tiras = [], antes = '';

    // inicial: los dígitos con que arrancan las ruedas nuevas (alineados por la derecha, como un cuentakilómetros)
    function arma(texto, inicial) {
      ruedas.textContent = '';
      tiras = [];
      const n = texto.replace(/\D/g, '').length;
      for (const ch of texto) {
        const s = document.createElement('span');
        if (ch >= '0' && ch <= '9') {
          s.className = 'cu-d';
          const t = document.createElement('span');
          t.className = 'cu-tira'; t.innerHTML = TIRA;
          const previo = inicial[inicial.length - (n - tiras.length)];
          t.style.setProperty('--d', previo || '0');
          s.appendChild(t); tiras.push(t);
        } else { s.className = 'cu-sep'; s.textContent = ch; }
        ruedas.appendChild(s);
      }
    }
    // demora: ms antes de que empiece; ya: sin rodar (colocar de golpe)
    function pon(v, demora, ya) {
      const texto = fmt(v, 0), f = texto.replace(/\d/g, '#');
      oculto.textContent = texto;
      if (f !== forma) { arma(texto, antes); forma = f; void ruedas.offsetWidth; }
      const digitos = texto.replace(/\D/g, '');
      tiras.forEach((t, k) => {
        if (ya) t.style.transition = 'none';
        t.style.transitionDelay = ya ? '0s' : ((demora || 0) + k * 40) + 'ms';
        t.style.setProperty('--d', digitos[k]);
      });
      if (ya) { void ruedas.offsetWidth; tiras.forEach(t => { t.style.transition = ''; }); }
      antes = digitos;
    }
    return { pon };
  }

  /* =====================================================================
     Los anillos: canvas. Cada uno es un arco con punta redonda y un
     degradado cónico que se enciende hacia la punta, con un brillo suave.
     Un resorte lleva cada arco a su avance (con una demora escalonada), otro
     engorda el anillo elegido y atenúa los demás, y las marcas del bisel
     se encienden hasta donde llega el anillo elegido. Al cerrar el
     círculo salen una onda y chispas. El bucle solo corre mientras algo
     se mueve.
     ===================================================================== */
  function Anillos(lienzo, o) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = lienzo.getContext('2d');
    const TAU = Math.PI * 2, CAB = -Math.PI / 2, MARCAS = 90;
    const azar = mulberry32(o.semilla || 7);
    const A = o.colores.map(() => ({ f: resorte(0, 62, 12.5), hl: resorte(0, 190, 21), al: resorte(1, 120, 19), espera: 0, meta: 0, hecho: false, rgb: '255,255,255', pronto: '255,255,255' }));
    let S = 0, dpr = 1, w = 0, hueco = 0, R0 = 0, pista = 'rgba(255,255,255,.07)', marca = '200,212,255', modo = 'lighter', sel = -1;
    const chispas = [], ondas = [];
    const mezcla = (rgb, k) => rgb.split(',').map(x => Math.round(+x + (255 - +x) * k)).join(',');
    const radio = i => R0 - i * (w + hueco);

    function mide() {
      const cw = lienzo.clientWidth;
      if (!cw) return;
      dpr = Math.min(2, devicePixelRatio || 1); S = cw;
      lienzo.width = Math.round(S * dpr); lienzo.height = Math.round(S * dpr);
      const cs = getComputedStyle(lienzo);
      modo = cs.getPropertyValue('--cu-modo-luz').trim() || 'lighter';
      A.forEach((a, i) => { a.rgb = cs.getPropertyValue(o.colores[i]).replace(/\s+/g, ''); a.pronto = mezcla(a.rgb, modo === 'lighter' ? .3 : .22); });
      pista = cs.getPropertyValue('--cu-pista').trim() || pista;
      marca = cs.getPropertyValue('--cu-marca').replace(/\s+/g, '') || marca;
      w = S * .052; hueco = S * .02; R0 = S / 2 - S * .075 - w / 2;
      dibuja();
    }

    function estalla(i) {
      const a = A[i], r = radio(i), x = S / 2, y = S / 2 + Math.sin(CAB) * r;
      for (let k = 0; k < 30; k++) {
        const ang = azar() * TAU, v = 50 + azar() * 190;
        chispas.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30, t: 0, dura: .5 + azar() * .7, r: 1.1 + azar() * 2.3, rgb: azar() < .4 ? a.pronto : a.rgb });
      }
      ondas.push({ i, t: 0 });
    }

    function paso(h) {
      A.forEach((a, i) => {
        if (a.espera > 0) { a.espera -= h; if (a.espera <= 0) a.f.meta = a.meta; }
        avanza(a.f, h); avanza(a.hl, h); avanza(a.al, h);
        if (a.meta < .999) a.hecho = false;
        else if (!a.hecho && a.f.x >= .985) { a.hecho = true; if (!reduce) estalla(i); if (o.alCompletar) o.alCompletar(i); }
      });
      for (let k = chispas.length - 1; k >= 0; k--) {
        const p = chispas[k];
        p.t += h; p.x += p.vx * h; p.y += p.vy * h; p.vy += 220 * h; p.vx *= 1 - 1.6 * h;
        if (p.t > p.dura) chispas.splice(k, 1);
      }
      for (let k = ondas.length - 1; k >= 0; k--) { ondas[k].t += h / .9; if (ondas[k].t >= 1) ondas.splice(k, 1); }
    }
    const activo = () => chispas.length || ondas.length || A.some(a => a.espera > 0 || !quieto(a.f) || !quieto(a.hl) || !quieto(a.al));

    function dibuja() {
      if (!S) return;
      const c = S / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, S, S);
      g.globalCompositeOperation = 'source-over';
      g.lineCap = 'butt';

      // el bisel: marcas finas que se encienden hasta el avance del anillo elegido
      let k0 = -1, hmax = 0;
      A.forEach((a, i) => { if (a.hl.x > hmax) { hmax = a.hl.x; k0 = i; } });
      const r1 = R0 + w / 2 + S * .03, f0 = k0 >= 0 ? Math.min(1, A[k0].f.x) : 0;
      g.lineWidth = 1.4;
      for (let k = 0; k < MARCAS; k++) {
        const ang = CAB + k / MARCAS * TAU, largo = S * (k % 5 === 0 ? .02 : .012), cos = Math.cos(ang), sin = Math.sin(ang);
        const enc = k0 >= 0 ? Math.max(0, Math.min(1, (f0 - k / MARCAS) * MARCAS)) * hmax : 0;
        g.strokeStyle = enc > .01 ? 'rgba(' + A[k0].rgb + ',' + (.18 + .72 * enc).toFixed(3) + ')' : 'rgba(' + marca + ',' + (k % 5 === 0 ? .22 : .13) + ')';
        g.beginPath(); g.moveTo(c + cos * r1, c + sin * r1); g.lineTo(c + cos * (r1 + largo), c + sin * (r1 + largo)); g.stroke();
      }

      g.lineCap = 'round';
      A.forEach((a, i) => {
        const r = radio(i), lw = w * (1 + .2 * a.hl.x), al = Math.max(0, a.al.x);
        // la pista (lo que falta)
        g.lineWidth = w; g.strokeStyle = pista;
        g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke();
        const f = Math.max(0, Math.min(1, a.f.x));
        if (f < .004) return;
        const fin = CAB + f * TAU, cierre = Math.max(0, Math.min(1, (f - .9) / .1));
        const gr = g.createConicGradient(CAB, c, c);
        // apagado en la cola, encendido en la punta; y vuelve a apagarse tras el círculo para que la tapa de arranque no se enganche
        const cola = 'rgba(' + a.rgb + ',' + ((.52 + .4 * cierre) * al).toFixed(3) + ')';
        gr.addColorStop(0, cola);
        gr.addColorStop(Math.min(.9995, Math.max(.002, f)), 'rgba(' + a.pronto + ',' + al.toFixed(3) + ')');
        gr.addColorStop(1, cola);
        g.save();
        g.shadowColor = 'rgba(' + a.rgb + ',' + (al * (.32 + .4 * a.hl.x)).toFixed(3) + ')'; g.shadowBlur = (10 + 18 * a.hl.x) * dpr;
        g.lineWidth = lw; g.strokeStyle = gr;
        g.beginPath(); g.arc(c, c, r, CAB, fin); g.stroke();
        g.restore();
        // un brillo en la punta
        const tx = c + Math.cos(fin) * r, ty = c + Math.sin(fin) * r, br = lw * .8;
        const pg = g.createRadialGradient(tx, ty, 0, tx, ty, br);
        pg.addColorStop(0, 'rgba(255,255,255,' + (.55 * al).toFixed(3) + ')'); pg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = pg; g.beginPath(); g.arc(tx, ty, br, 0, TAU); g.fill();
      });

      // la onda al cerrar un anillo
      ondas.forEach(on => {
        const a = A[on.i], e = 1 - Math.pow(1 - on.t, 3);
        g.lineWidth = w * (1 - e * .7); g.strokeStyle = 'rgba(' + a.pronto + ',' + ((1 - e) * .75).toFixed(3) + ')';
        g.beginPath(); g.arc(c, c, radio(on.i) + e * S * .085, 0, TAU); g.stroke();
      });
      // las chispas
      g.globalCompositeOperation = modo;
      chispas.forEach(p => {
        const u = 1 - p.t / p.dura;
        g.fillStyle = 'rgba(' + p.rgb + ',' + (u * u).toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.r * (.5 + .5 * u), 0, TAU); g.fill();
      });
      g.globalCompositeOperation = 'source-over';
    }

    // los avances nuevos: cada anillo parte con su demora (en segundos)
    function pon(metas, demora, escalon) {
      metas.forEach((m, i) => {
        const a = A[i];
        a.meta = m;
        if (reduce) { a.f.x = a.f.meta = m; a.f.v = 0; a.espera = 0; a.hecho = m >= .999; if (a.hecho && o.alCompletar) o.alCompletar(i); }
        else {
          a.espera = (demora || 0) + i * (escalon === undefined ? .1 : escalon);
          if (a.espera <= 0) a.f.meta = m;
        }
        if (m < .999) a.hecho = false;
      });
      if (reduce) dibuja();
    }
    function resalta(i) {
      sel = i;
      A.forEach((a, k) => { a.hl.meta = k === i ? 1 : 0; a.al.meta = i < 0 || k === i ? 1 : .26; });
      if (reduce) A.forEach(a => { a.hl.x = a.hl.meta; a.al.x = a.al.meta; a.hl.v = a.al.v = 0; });
    }
    // ¿qué anillo hay bajo este punto? (el pie del cursor, en px del lienzo)
    function en(x, y) {
      const d = Math.hypot(x - S / 2, y - S / 2);
      for (let i = 0; i < A.length; i++) if (Math.abs(d - radio(i)) <= (w + hueco) / 2 + 1) return i;
      return -1;
    }
    return { mide, pon, resalta, paso, dibuja, activo, en };
  }

  /* =====================================================================
     La línea de ingresos (SVG): una curva suave por los puntos, muestreada
     en 80 vértices. Al cambiar de datos los vértices viajan de la curva
     vieja a la nueva con un resorte (sin recomponer el trazo); la primera
     vez se traza con stroke-dashoffset. El globo sigue al cursor, al dedo
     o a las flechas y marca el punto con un anillo.
     ===================================================================== */
  function Linea(caja, o) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const svg = caja.querySelector('svg'), q = s => svg.querySelector(s);
    const area = q('.cu-area'), trazo = q('.cu-trazo'), punta = q('.cu-punta'), onda = q('.cu-onda'), foco = q('.cu-foco'), guia = q('.cu-guia');
    const M = 80, ARR = .2, ABA = .09;
    let W = 0, H = 0, valores = [], desde = new Float32Array(M), hasta = new Float32Array(M), actual = new Float32Array(M), idx = -1;
    const u = resorte(1, 150, 17.5);

    function calcula(vs) {
      const lo = 0, hi = Math.max.apply(null, vs), f = monotona(vs), out = new Float32Array(M);
      for (let j = 0; j < M; j++) out[j] = H * (1 - ABA - ((f(j / (M - 1)) - lo) / ((hi - lo) || 1)) * (1 - ARR - ABA));
      return out;
    }
    function traza() {
      let d = '';
      for (let j = 0; j < M; j++) {
        const y = desde[j] + (hasta[j] - desde[j]) * u.x;
        actual[j] = y;
        d += (j ? 'L' : 'M') + (j / (M - 1) * W).toFixed(1) + ' ' + y.toFixed(1);
      }
      trazo.setAttribute('d', d);
      area.setAttribute('d', d + 'L' + W + ' ' + H + 'L0 ' + H + 'Z');
      [punta, onda].forEach(c => { c.setAttribute('cx', W); c.setAttribute('cy', actual[M - 1].toFixed(1)); });
      if (idx >= 0) coloca(idx);
    }
    function pon(vs, ya) {
      valores = vs;
      if (!W) return;
      const nueva = calcula(vs);
      if (ya || reduce) { hasta = nueva; desde = nueva.slice(); u.x = u.meta = 1; u.v = 0; }
      else { desde = actual.slice(); hasta = nueva; u.x = 0; u.v = 0; u.meta = 1; }
      traza();
    }
    function mide() {
      const w = caja.clientWidth, h = caja.clientHeight;
      if (!w || !h || !valores.length) return;
      W = w; H = h;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      pon(valores, true);
    }
    // el punto i, en px de la caja
    function punto(i) {
      const n = valores.length, p = n > 1 ? i / (n - 1) * (M - 1) : 0, j = Math.floor(p), t = p - j;
      return { x: n > 1 ? i / (n - 1) * W : W / 2, y: actual[j] * (1 - t) + actual[Math.min(M - 1, j + 1)] * t };
    }
    function coloca(i) {
      const p = punto(i);
      guia.setAttribute('x1', p.x); guia.setAttribute('x2', p.x);
      foco.setAttribute('cx', p.x); foco.setAttribute('cy', p.y.toFixed(1));
      if (o.alFoco) o.alFoco(i, p.x, p.y);
    }
    function muestra(i) {
      i = Math.max(0, Math.min(valores.length - 1, i));
      idx = i;
      caja.classList.add('is-foco');
      coloca(i);
    }
    function oculta() { idx = -1; caja.classList.remove('is-foco'); if (o.alSalir) o.alSalir(); }

    let rect = null;
    caja.addEventListener('pointerenter', () => { rect = caja.getBoundingClientRect(); });
    caja.addEventListener('pointermove', e => {
      if (!rect) rect = caja.getBoundingClientRect();
      muestra(Math.round((e.clientX - rect.left) / (W || 1) * (valores.length - 1)));
    });
    caja.addEventListener('pointerleave', () => { rect = null; if (document.activeElement !== caja) oculta(); });
    caja.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { rect = caja.getBoundingClientRect(); muestra(Math.round((e.clientX - rect.left) / (W || 1) * (valores.length - 1))); } });
    caja.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(oculta, 1400); });
    caja.addEventListener('keydown', e => {
      const paso = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 }[e.key];
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); muestra(e.key === 'Home' ? 0 : valores.length - 1); if (o.alTeclado) o.alTeclado(idx); return; }
      if (!paso) return;
      e.preventDefault();
      muestra(idx < 0 ? valores.length - 1 : idx + paso);
      if (o.alTeclado) o.alTeclado(idx);
    });
    caja.addEventListener('focus', () => { if (caja.matches(':focus-visible')) muestra(valores.length - 1); });
    caja.addEventListener('blur', oculta);

    const ro = new ResizeObserver(() => { if (!document.contains(caja)) return ro.disconnect(); mide(); }); ro.observe(caja);
    return { pon, mide, paso: h => avanza(u, h), traza, activo: () => !quieto(u), muestra };
  }

  /* =====================================================================
     Las barras: cada una es una pista con un relleno que sube con un
     resorte (translateY, así la punta redondeada no se deforma). Al
     cambiar de periodo se recogen de derecha a izquierda y las nuevas
     brotan escalonadas. La última late: es la barra «viva».
     ===================================================================== */
  function Barras(caja, o) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fila = caja.querySelector('[data-barras-fila]'), ejeA = caja.querySelector('[data-eje-a]'), ejeB = caja.querySelector('[data-eje-b]');
    let barras = [], valores = [], idx = -1, reloj = 0;

    function asigna(vs, escalona) {
      const max = Math.max(1, Math.max.apply(null, vs)) * 1.06;
      barras.forEach((b, i) => {
        const r = b.firstChild;
        r.style.transitionDelay = escalona ? '' : '0s';
        b.style.setProperty('--h', (vs[i] / max).toFixed(3));
      });
    }
    function pinta(vs, etiquetas) {
      fila.textContent = '';
      fila.classList.remove('is-sale');
      valores = vs;
      barras = vs.map((v, i) => {
        const b = document.createElement('div');
        b.className = 'cu-barra' + (i === vs.length - 1 ? ' is-viva' : '');
        b.dataset.i = i; b.style.setProperty('--i', i);
        b.innerHTML = '<i class="cu-barra-relleno"></i>';
        fila.appendChild(b);
        return b;
      });
      ejeA.textContent = etiquetas[0]; ejeB.textContent = etiquetas[etiquetas.length - 1];
      void fila.offsetWidth;
      asigna(vs, true);
    }
    // cambio de periodo: se recogen y brotan las nuevas
    function cambia(vs, etiquetas, ya) {
      oculta();
      clearTimeout(reloj);
      if (ya || reduce || !barras.length) return pinta(vs, etiquetas);
      fila.classList.add('is-sale');
      barras.forEach((b, i) => { b.style.setProperty('--j', barras.length - 1 - i); b.style.setProperty('--h', 0); b.firstChild.style.transitionDelay = ''; });
      reloj = setTimeout(() => pinta(vs, etiquetas), 480);
    }
    function pon(vs) { valores = vs; asigna(vs, false); if (idx >= 0) coloca(idx); }

    function coloca(i) {
      const b = barras[i];
      if (!b) return;
      const max = Math.max(1, Math.max.apply(null, valores)) * 1.06;
      if (o.alFoco) o.alFoco(i, b.offsetLeft + b.offsetWidth / 2, b.offsetTop + b.offsetHeight * (1 - valores[i] / max));
    }
    function muestra(i) {
      i = Math.max(0, Math.min(barras.length - 1, i));
      if (idx >= 0 && barras[idx]) barras[idx].classList.remove('is-activa');
      idx = i;
      barras[i].classList.add('is-activa');
      fila.classList.add('is-resalta');
      coloca(i);
    }
    function oculta() {
      if (idx >= 0 && barras[idx]) barras[idx].classList.remove('is-activa');
      idx = -1; fila.classList.remove('is-resalta');
      if (o.alSalir) o.alSalir();
    }
    fila.addEventListener('pointerover', e => { const b = e.target.closest('.cu-barra'); if (b && !fila.classList.contains('is-sale')) muestra(+b.dataset.i); });
    fila.addEventListener('pointerleave', () => { if (document.activeElement !== caja) oculta(); });
    fila.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(oculta, 1400); });
    caja.addEventListener('keydown', e => {
      const paso = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 }[e.key];
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); muestra(e.key === 'Home' ? 0 : barras.length - 1); if (o.alTeclado) o.alTeclado(idx); return; }
      if (!paso) return;
      e.preventDefault();
      muestra(idx < 0 ? barras.length - 1 : idx + paso);
      if (o.alTeclado) o.alTeclado(idx);
    });
    caja.addEventListener('focus', () => { if (caja.matches(':focus-visible')) muestra(barras.length - 1); });
    caja.addEventListener('blur', oculta);
    return { cambia, pon, oculta };
  }

  /* =====================================================================
     El panel
     ===================================================================== */
  function Cuadrante(raiz, opciones) {
    const o = Object.assign({ inicial: 0, semilla: 5 }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = s => raiz.querySelector(s), $$ = s => Array.from(raiz.querySelectorAll(s));
    const azar = mulberry32(o.semilla);
    raiz.style.setProperty('--cu-muelle', muelle(170, 17));

    const seg = $('.cu-seg'), botones = $$('.cu-seg-op');
    const leyenda = $('.cu-leyenda'), contAnillos = $('.cu-anillos');
    const avisa = s => { const v = $('[data-vivo-texto]'); v.textContent = ''; v.textContent = s; };

    const total = Cifras($('[data-total]')), uno = Cifras($('[data-uno-valor]'));
    const filas = $$('.cu-fila').map(el => ({
      el, pct: Cifras(el.querySelector('[data-pct]')), valor: Cifras(el.querySelector('[data-valor]')), delta: el.querySelector('[data-delta]'),
      color: el.style.getPropertyValue('--c').trim(),
    }));
    const kpi = Cifras($('[data-kpi]')), ped = Cifras($('[data-ped]'));
    const dKpi = $('[data-kpi-delta]'), dPed = $('[data-ped-delta]');

    let rango = -1, d = null, sel = -1, fija = -1, tipo = 'mouse';

    function delta(el, v) {
      const sem = v == null;
      el.classList.toggle('is-neutro', sem || v === 0); el.classList.toggle('is-sube', !sem && v > 0); el.classList.toggle('is-baja', !sem && v < 0);
      el.innerHTML = sem ? 'novo' : v === 0 ? 'igual' : '<span class="cu-oculto">' + (v >= 0 ? 'Subiu ' : 'Caiu ') + '</span>' + fmt(v, 0) + '%';
      el.title = sem ? 'sem base no período anterior' : 'em relação ao período anterior';
    }

    /* ── el globo (compartido por la línea y las barras) ─────────────── */
    function globo(caja, x, y, valor, etiqueta) {
      const t = caja.querySelector('.cu-tip');
      t.querySelector('[data-tip-valor]').textContent = valor;
      t.querySelector('[data-tip-etiqueta]').textContent = etiqueta;
      t.style.setProperty('--x', x.toFixed(1) + 'px'); t.style.setProperty('--y', y.toFixed(1) + 'px');
      if (!t.classList.contains('is-visible')) {
        // la primera vez aparece en su sitio (sin viajar desde donde quedó)
        t.classList.add('is-salta'); void t.offsetWidth; t.classList.remove('is-salta');
        t.classList.add('is-visible');
      }
    }
    const sinGlobo = caja => caja.querySelector('.cu-tip').classList.remove('is-visible');

    const cajaLinea = $('[data-linea]'), cajaBarras = $('[data-barras]');
    const linea = Linea(cajaLinea, {
      alFoco: (i, x, y) => globo(cajaLinea, x, y - 8, fmt(d.ingresos.valores[i]) + (d.ingresos.valores[i] === 1 ? ' contato' : ' contatos'), d.ingresos.etiquetas[i]),
      alSalir: () => sinGlobo(cajaLinea),
      alTeclado: i => avisa(d.ingresos.etiquetas[i] + ': ' + fmt(d.ingresos.valores[i]) + ' contatos registrados'),
    });
    const barras = Barras(cajaBarras, {
      alFoco: (i, x, y) => globo(cajaBarras, x, y - 2, fmt(d.pedidos.valores[i]) + (d.pedidos.valores[i] === 1 ? ' proposta' : ' propostas'), d.pedidos.etiquetas[i]),
      alSalir: () => sinGlobo(cajaBarras),
      alTeclado: i => avisa(d.pedidos.etiquetas[i] + ': ' + fmt(d.pedidos.valores[i]) + ' propostas pedidas'),
    });

    /* ── los anillos y la fila elegida ───────────────────────────────── */
    const anillos = Anillos($('.cu-lienzo'), {
      colores: filas.map(f => f.color.replace(/^var\((.*)\)$/, '$1')),
      semilla: o.semilla,
      alCompletar: i => filas[i].el.classList.add('is-meta'),
    });

    function resalta(i) {
      if (i === sel) return;
      sel = i;
      filas.forEach((f, k) => f.el.classList.toggle('is-sel', k === i));
      leyenda.classList.toggle('is-resalta', i >= 0);
      anillos.resalta(i);
      anillos.dibuja(); acorda();
      if (i >= 0) {
        const c = d.canales[i], cen = $('.cu-centro-uno');
        cen.style.setProperty('--c', filas[i].color);
        $('[data-uno-nombre]').textContent = NOMBRES[i];
        $('[data-uno-meta]').textContent = (c.p ? Math.round(c.meta * 100) + '% de ' + c.p + ' planejados' : 'nada planejado');
        uno.pon(c.v, 0);
      }
      contAnillos.classList.toggle('is-uno', i >= 0);
    }
    function fijaFila(k) {
      fija = k;
      filas.forEach((f, j) => f.el.setAttribute('aria-pressed', String(j === k)));
    }
    filas.forEach((f, k) => {
      f.el.addEventListener('pointerdown', e => { tipo = e.pointerType; });
      f.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') resalta(k); });
      f.el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') resalta(fija); });
      f.el.addEventListener('focus', () => resalta(k));
      f.el.addEventListener('blur', () => resalta(fija));
      f.el.addEventListener('click', () => {
        fijaFila(fija === k ? -1 : k);
        if (tipo === 'mouse') resalta(k); else resalta(fija);
      });
      f.el.addEventListener('keydown', e => {
        const paso = { ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (!paso) return;
        e.preventDefault();
        filas[(k + paso + filas.length) % filas.length].el.focus();
      });
    });
    const lienzo = $('.cu-lienzo');
    lienzo.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = lienzo.getBoundingClientRect(), i = anillos.en(e.clientX - r.left, e.clientY - r.top);
      lienzo.style.cursor = i >= 0 ? 'pointer' : '';
      resalta(i >= 0 ? i : fija);
    });
    lienzo.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') resalta(fija); });
    lienzo.addEventListener('pointerdown', e => {
      tipo = e.pointerType;
      const r = lienzo.getBoundingClientRect(), i = anillos.en(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) { fijaFila(-1); resalta(-1); return; }
      fijaFila(fija === i ? -1 : i);
      resalta(e.pointerType === 'mouse' ? i : fija);
    });
    raiz.addEventListener('keydown', e => {
      if (e.key === 'Escape' && (fija >= 0 || sel >= 0)) { fijaFila(-1); resalta(-1); }
    });

    /* ── el periodo ──────────────────────────────────────────────────── */
    function aplica(i, primera) {
      rango = i;
      d = clona(o.datos[i]);
      seg.style.setProperty('--i', i);
      botones.forEach((b, k) => { b.setAttribute('aria-checked', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      $('[data-texto-canales]').textContent = 'Feitos de planejados · ' + d.texto;
      $('[data-texto-kpi]').textContent = d.texto;
      $('[data-texto-ped]').textContent = d.pedidos.texto || 'no período';
      const demora = primera ? 300 : 0;

      filas.forEach(f => f.el.classList.remove('is-meta'));
      anillos.pon(d.canales.map(c => c.meta), primera ? .3 : 0);
      d.canales.forEach((c, k) => {
        const f = filas[k];
        f.pct.pon(Math.round(c.meta * 100), demora + k * 90);
        f.valor.pon(c.v, demora + k * 90 + 40);
        delta(f.delta, c.d);
      });
      total.pon(suma(d.canales.map(c => c.v)), demora);

      kpi.pon(suma(d.ingresos.valores), demora + 80); delta(dKpi, d.ingresos.delta);
      linea.pon(d.ingresos.valores, primera);
      ped.pon(suma(d.pedidos.valores), demora + 160); delta(dPed, d.pedidos.delta);
      barras.cambia(d.pedidos.valores, d.pedidos.etiquetas, primera);

      fijaFila(-1); resalta(-1);
      if (!primera) avisa(d.texto.charAt(0).toUpperCase() + d.texto.slice(1) + ': ' + fmt(suma(d.canales.map(c => c.v))) + ' contatos feitos e ' + fmt(suma(d.pedidos.valores)) + ' propostas pedidas.');
      acorda();
    }
    function cambia(i) { if (i !== rango && o.datos[i]) { aplica(i); if (o.alMudar) o.alMudar(i); } }
    botones.forEach((b, k) => {
      b.addEventListener('click', () => cambia(k));
      b.addEventListener('keydown', e => {
        const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        let k2 = paso ? (k + paso + botones.length) % botones.length : e.key === 'Home' ? 0 : e.key === 'End' ? botones.length - 1 : -1;
        if (k2 < 0) return;
        e.preventDefault(); cambia(k2); botones[k2].focus();
      });
    });

    /* ── el bucle: a paso fijo, solo mientras algo se mueve ─────────── */
    const PASO = 1 / 120;
    let raf = 0, previo = 0, resto = 0;
    // O relógio só corre enquanto algo se mexe (e enquanto o painel está na tela)
    function cuadro(ms) {
      raf = 0;
      if (!document.contains(raiz)) return;
      const dt = previo ? Math.min(.1, (ms - previo) / 1000) : 1 / 60;
      previo = ms;
      const mueveA = anillos.activo(), mueveL = linea.activo();
      if (!mueveA && !mueveL) { resto = 0; previo = 0; return; }
      resto += dt;
      let n = 0;
      while (resto >= PASO && n < 24) { if (mueveA) anillos.paso(PASO); if (mueveL) linea.paso(PASO); resto -= PASO; n++; }
      if (n === 24) resto = 0;
      if (mueveA) anillos.dibuja();
      if (mueveL) linea.traza();
      raf = requestAnimationFrame(cuadro);
    }
    function acorda() { if (!raf) { previo = 0; raf = requestAnimationFrame(cuadro); } }
    document.addEventListener('visibilitychange', () => { previo = 0; });

    /* ── al empezar ──────────────────────────────────────────────────── */
    const ro = new ResizeObserver(() => { if (!document.contains(raiz)) return ro.disconnect(); anillos.mide(); }); ro.observe($('.cu-anillos'));
    anillos.mide();
    aplica(Math.max(0, Math.min(o.datos.length - 1, o.inicial)), true);
    if (document.fonts) document.fonts.ready.then(() => { anillos.mide(); linea.mide(); });
    acorda();
    setTimeout(() => raiz.classList.add('cu-pronto'), 2400);

    return { cambia, resalta, datos: () => d };
  }


  // O HTML do painel (os anéis, a linha e as barras são desenhados pelo script)
  const escH = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  S.cuHtml = ({ quem = '', atrasados = 0, periodo = 0 } = {}) => {
    const cor = ['--cu-cielo', '--cu-ambar', '--cu-violeta', '--cu-coral'];
    const fila = (n, i) => `<li><button class="cu-fila" type="button" data-i="${i}" style="--c: var(${cor[i]})" aria-pressed="false">
      <span class="cu-fila-nombre"><i class="cu-punto" aria-hidden="true"></i>${n}</span><span class="cu-fila-pct"><span class="cu-cifra" data-pct></span></span>
      <span class="cu-fila-valor"><span class="cu-cifra" data-valor></span> feitos</span><span class="cu-delta" data-delta></span><span class="cu-etiqueta-meta" aria-hidden="true">Tudo feito!</span></button></li>`;
    return `<section class="cu-painel" data-cuadrante aria-label="Resumo dos contatos">
    <div class="cu-cabeza"><p class="cu-quem">${escH(quem)}</p><div class="cu-controles">
      ${atrasados ? `<span class="cu-vivo cu-atraso"><i aria-hidden="true"></i>${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}</span>` : '<span class="cu-vivo cu-emdia"><i aria-hidden="true"></i>Tudo em dia</span>'}
      <div class="cu-seg" role="radiogroup" aria-label="Período" style="--i:${periodo}"><i class="cu-seg-pulgar" aria-hidden="true"></i>
        ${['Semana', 'Mês', '3 meses'].map((n, i) => `<button class="cu-seg-op" type="button" role="radio" aria-checked="${i === periodo}"${i === periodo ? '' : ' tabindex="-1"'} data-rango="${i}">${n}</button>`).join('')}</div></div></div>
    <div class="cu-grid">
      <article class="cu-tarjeta cu-canales" style="--k:0" aria-labelledby="cu-t-canales"><header class="cu-tarjeta-cab"><div><h2 id="cu-t-canales">Contatos</h2><p data-texto-canales></p></div><span class="cu-meta-clave"><i aria-hidden="true"></i>Feitos / planejados</span></header>
        <div class="cu-canales-cuerpo"><div class="cu-anillos"><canvas class="cu-lienzo" aria-hidden="true"></canvas><div class="cu-centro" aria-hidden="true">
          <div class="cu-centro-total"><span class="cu-rotulo">Total</span><span class="cu-cifra cu-cifra--grande" data-total></span><span class="cu-centro-sub">contatos feitos</span></div>
          <div class="cu-centro-uno"><span class="cu-rotulo"><i class="cu-punto"></i><b data-uno-nombre></b></span><span class="cu-cifra cu-cifra--grande" data-uno-valor></span><span class="cu-centro-sub"><span data-uno-meta></span></span></div></div></div>
          <ul class="cu-leyenda" aria-label="Tipos de contato">${NOMBRES.map(fila).join('')}</ul></div></article>
      <article class="cu-tarjeta cu-kpi" style="--k:1" aria-labelledby="cu-t-reg"><header class="cu-tarjeta-cab"><div><h2 id="cu-t-reg">Contatos registrados</h2><p data-texto-kpi></p></div><span class="cu-delta cu-delta--grande" data-kpi-delta></span></header>
        <p class="cu-kpi-cifra"><span class="cu-cifra cu-cifra--kpi" data-kpi></span></p>
        <div class="cu-linea-caja" tabindex="0" role="group" aria-label="Contatos registrados no período. Use as setas para percorrer" data-linea><svg class="cu-linea" aria-hidden="true"><defs>
          <linearGradient id="cu-g-trazo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="cu-st-a"/><stop offset=".55" class="cu-st-b"/><stop offset="1" class="cu-st-c"/></linearGradient>
          <linearGradient id="cu-g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cu-st-area-a"/><stop offset="1" class="cu-st-area-b"/></linearGradient></defs>
          <g class="cu-rejilla"><line x1="0" x2="100%" y1="25%" y2="25%"/><line x1="0" x2="100%" y1="55%" y2="55%"/><line x1="0" x2="100%" y1="85%" y2="85%"/></g>
          <path class="cu-area" fill="url(#cu-g-area)"/><line class="cu-guia" y1="0" y2="100%"/><path class="cu-trazo" stroke="url(#cu-g-trazo)" pathLength="1"/><circle class="cu-onda" r="5"/><circle class="cu-punta" r="4.5"/><circle class="cu-foco" r="6"/></svg>
          <div class="cu-tip" aria-hidden="true"><b data-tip-valor></b><span data-tip-etiqueta></span></div></div></article>
      <article class="cu-tarjeta cu-pedidos" style="--k:2" aria-labelledby="cu-t-ped"><header class="cu-tarjeta-cab"><div><h2 id="cu-t-ped">Propostas pedidas</h2><p data-texto-ped></p></div><p class="cu-ped-total"><span class="cu-cifra cu-cifra--ped" data-ped></span><span class="cu-delta" data-ped-delta></span></p></header>
        <div class="cu-barras-caja" tabindex="0" role="group" aria-label="Propostas pedidas no período. Use as setas para percorrer" data-barras><div class="cu-barras" data-barras-fila></div>
          <div class="cu-ejes" aria-hidden="true"><span data-eje-a></span><span data-eje-b></span></div><div class="cu-tip cu-tip--barra" aria-hidden="true"><b data-tip-valor></b><span data-tip-etiqueta></span></div></div></article>
    </div><p class="cu-oculto" aria-live="polite" data-vivo-texto></p></section>`;
  };
  S.cuadrante = Cuadrante;
})();

// SONVI · Console › Financeiro › painel do mês (aprovado em 11/11/2026, modelo "Console · Financeiro novo", no estilo "Gastos").
// Anel com as três situações do mês (recebido, a receber, em atraso) com fatias de mola e o previsto no centro rolando; ao lado,
// um cartão por situação (valor, % e barra) que filtra a lista de cobranças do mês (FLIP); setas trocam o mês com deslize;
// "Dar baixa" abre dentro do painel (console_baixar) e o aviso traz "Desfazer" (console_estornar).
// O painel é um elemento só, montado uma vez e recolocado a cada desenho da tela (console.js › telaFinanceiro), para as
// animações continuarem; quando os dados mudam, sinc() anima a diferença.
// api = { cobs(): cobranças vivas do filtro de cliente, valorDe(x), atrasada(x), hoje(), contratada(), edita(), mesInicial,
//         aoMudarMes(ym), baixar({ id, pago_em, valor, recibo }) → Promise, desfazer(id) → Promise, temEmail(x) }
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, NS = 'http://www.w3.org/2000/svg', esc = S.esc;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const SITS = [{ nome:'Recebido', ic:'<path d="M5 12.5l4.2 4.2L19 7"/>' }, { nome:'A receber', ic:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>' },
    { nome:'Em atraso', ic:'<path d="M12 4 3 19.5h18Z"/><path d="M12 10v4.2M12 17h.01"/>' }];
  const COR = ['var(--pf-ok)', 'var(--pf-ab)', 'var(--pf-at)'];
  const icone = i => `<svg viewBox="0 0 24 24" aria-hidden="true">${SITS[i].ic}</svg>`;
  const brl = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nomeMes = ym => MESES[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4), mesMin = ym => MESES[+ym.slice(5) - 1].toLowerCase();
  const soma = a => a.reduce((t, x) => t + x, 0);
  const mola = (x, k, c) => ({ x, v:0, meta:x, k, c });
  const passo = (r, h) => { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; };
  const quieto = r => Math.abs(r.v) < .0008 && Math.abs(r.meta - r.x) < .0008;
  const EASE_MOLA = 'cubic-bezier(.34,1.56,.64,1)', EASE_SAI = 'cubic-bezier(.22,1,.36,1)';

  // Números que rolam: cada dígito é uma coluna com a tira de 0 a 9
  const Cifras = caixa => { let cols = [], pre = null;
    const coluna = ch => { const c = document.createElement('span'), d = /\d/.test(ch); c.dataset.t = d ? 'd' : 's'; c.setAttribute('aria-hidden', 'true');
      if (d) { c.className = 'pf-col'; c.innerHTML = '<span class="pf-tira">0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</span>'; } else { c.className = 'pf-sep'; c.textContent = ch; } return c; };
    return { pon(txt, anima) { caixa.setAttribute('role', 'text'); caixa.setAttribute('aria-label', txt);
      const m = /^(\D*)([\s\S]*)$/.exec(txt), r = [...m[2]];
      if (!pre) { pre = document.createElement('span'); pre.className = 'pf-sig'; pre.setAttribute('aria-hidden', 'true'); caixa.appendChild(pre); }
      pre.textContent = m[1].trim();
      while (cols.length > r.length) caixa.removeChild(cols.shift());
      while (cols.length < r.length) { const c = coluna(r[r.length - cols.length - 1]); caixa.insertBefore(c, pre.nextSibling); cols.unshift(c); if (anima && c.dataset.t === 'd') c.style.setProperty('--d', 0); }
      r.forEach((ch, i) => { if (cols[i].dataset.t === (/\d/.test(ch) ? 'd' : 's')) return; const c = coluna(ch); caixa.replaceChild(c, cols[i]); cols[i] = c; if (anima && c.dataset.t === 'd') c.style.setProperty('--d', 0); });
      if (anima) void caixa.offsetWidth;
      r.forEach((ch, i) => { const c = cols[i]; if (c.dataset.t === 'd') { c.style.setProperty('--i', r.length - 1 - i); c.style.setProperty('--d', ch); } else if (c.textContent !== ch) c.textContent = ch; }); } }; };
  // Texto que troca deslizando
  const vira = (caixa, txt, dir = 1, eixo = 'Y') => { const velho = caixa.lastElementChild; if (velho && velho.textContent === txt) return;
    const novo = document.createElement('span'); novo.textContent = txt; caixa.appendChild(novo);
    if (!velho) return; if (reduce) { velho.remove(); return; }
    const T = eixo === 'X' ? 'translateX(' : 'translateY(', k = eixo === 'X' ? 40 : 80;
    velho.animate([{ transform:'none', opacity:1 }, { transform:T + -dir * k + '%)', opacity:0 }], { duration:320, easing:EASE_SAI, fill:'forwards' });
    novo.animate([{ transform:T + dir * k + '%)', opacity:0 }, { transform:'none', opacity:1 }], { duration:560, easing:EASE_MOLA });
    setTimeout(() => velho.remove(), 380); };

  S.painelFin = api => {
    const raiz = document.createElement('section');
    raiz.className = 'card pf'; raiz.setAttribute('aria-labelledby', 'pf-t');
    raiz.innerHTML = `<div class="pf-cab"><div class="pf-tit"><h2 id="pf-t">Cobranças do mês</h2><p data-pf-sub></p></div>
        <div class="pf-mes" role="group" aria-label="Mês"><button type="button" data-pf-mes="-1" aria-label="Mês anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.4 6.4-5.6 5.6 5.6 5.6"/></svg></button>
          <div class="pf-mes-et pf-vira" aria-live="polite" data-pf-mes-et></div>
          <button type="button" data-pf-mes="1" aria-label="Próximo mês"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.6 6.4 5.6 5.6-5.6 5.6"/></svg></button></div>
        <button class="btn sm" type="button" data-pf-hoje hidden>Hoje</button></div>
      <div class="pf-corpo" data-pf-corpo>
        <div class="pf-esq"><div class="pf-anel"><svg viewBox="0 0 320 320" aria-hidden="true"><circle class="pf-pista" cx="160" cy="160" r="120"/><circle class="pf-disco" cx="160" cy="160" r="96"/><g data-pf-segs transform="translate(160 160)"></g></svg>
            <div class="pf-centro" aria-live="polite"><span class="pf-c-et pf-vira" data-pf-cet></span><span class="pf-c-tot pf-cifras" data-pf-total></span><span class="pf-c-sub pf-vira" data-pf-csub></span></div></div>
          <p class="pf-compara" data-pf-compara></p></div>
        <div class="pf-dir"><div class="pf-sits" role="group" aria-label="Situações (clique para filtrar as cobranças do mês)" data-pf-sits></div>
          <section aria-labelledby="pf-lt"><div class="pf-movs-cab"><h3 id="pf-lt" data-pf-lt></h3>
              <button class="pf-chip" type="button" data-pf-filtro hidden><i></i><span data-pf-filtro-t></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
              <button class="btn sm pri pf-abre" type="button" data-pf-abre aria-expanded="false" aria-controls="pf-form" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>Dar baixa</button></div>
            <div class="pf-fcaixa" data-pf-fcaixa><form class="pf-form" id="pf-form" data-pf-form inert novalidate><div class="pf-f-in">
              <div class="pf-f-cobs" role="radiogroup" aria-label="Cobrança que foi paga" data-pf-fcobs></div>
              <label class="pf-campo">Valor recebido<input data-pf-valor inputmode="decimal" autocomplete="off"></label>
              <label class="pf-campo">Pago em<input type="date" data-pf-data></label>
              <label class="pf-recibo" data-pf-recibo-l hidden><input type="checkbox" data-pf-recibo> Enviar o recibo por e-mail</label>
              <span class="pf-f-bts"><button class="btn sm" type="button" data-pf-fecha>Cancelar</button><button class="btn sm pri" type="submit">Confirmar baixa</button></span></div></form></div>
            <ul class="pf-lista" data-pf-lista></ul></section></div></div>
      <p class="pf-pista"><span>Clique numa situação ou no anel para filtrar</span><span><kbd>←</kbd> <kbd>→</kbd> trocam o mês</span><span data-pf-pista-b><kbd>B</kbd> dá baixa</span></p>
      <div class="pf-aviso" data-pf-aviso hidden role="status"><span data-pf-aviso-t></span><button type="button" data-pf-desfaz>Desfazer</button></div>`;
    const $ = s => raiz.querySelector(s), $$ = s => [...raiz.querySelectorAll(s)];
    const hoje = () => api.hoje();
    const sitDe = x => x.situacao === 'paga' ? 0 : api.atrasada(x) ? 2 : 1;
    const doMes = ym => api.cobs().filter(x => x.vencimento.slice(0, 7) === ym);
    const porSit = ym => [0, 1, 2].map(k => doMes(ym).filter(x => sitDe(x) === k).reduce((t, x) => t + api.valorDe(x), 0));
    let mes = api.mesInicial || hoje().slice(0, 7), sel = -1, ocupado = false, ultima = null, assinatura = '';
    const limites = () => { const ms = api.cobs().map(x => x.vencimento.slice(0, 7)).concat(hoje().slice(0, 7)).sort(); return [ms[0], ms[ms.length - 1]]; };

    // ---------- o anel ----------
    const R = 120, SW = 28, HUECO = 13, TAU = Math.PI * 2;
    let hov = -1, raf = 0, ant = 0, sobra = 0;
    const arcos = SITS.map((s, i) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'pf-seg pf-s' + i);
      p.addEventListener('click', () => escolhe(i)); p.addEventListener('pointerenter', () => { hov = i; aplica(); }); p.addEventListener('pointerleave', () => { if (hov === i) { hov = -1; aplica(); } });
      $('[data-pf-segs]').appendChild(p); return { el:p, ini:mola(0, 90, 14), lar:mola(0, 90, 14), sep:mola(0, 320, 17), gro:mola(0, 280, 19), op:mola(1, 170, 24) }; });
    const todas = () => arcos.flatMap(a => [a.ini, a.lar, a.sep, a.gro, a.op]);
    const aplica = () => { arcos.forEach((a, i) => { a.sep.meta = i === sel ? 14 : i === hov ? 5 : 0; a.gro.meta = i === sel ? 7 : i === hov ? 2.5 : 0; a.op.meta = sel >= 0 && i !== sel ? .25 : 1; }); acorda(); };
    const desenha = () => { const vivos = arcos.filter(b => b.lar.x > .0015).length;
      arcos.forEach(a => { const L = a.lar.x; if (L < .0015) { a.el.setAttribute('d', ''); return; }
        const sw = SW + a.gro.x, t0 = a.ini.x * TAU - Math.PI / 2, t1 = (a.ini.x + L) * TAU - Math.PI / 2, mid = (t0 + t1) / 2, dx = Math.cos(mid) * a.sep.x, dy = Math.sin(mid) * a.sep.x;
        if (vivos === 1 && L > .995) a.el.setAttribute('d', `M${dx.toFixed(2)} ${(-R + dy).toFixed(2)}A${R} ${R} 0 1 1 ${(dx - .01).toFixed(2)} ${(-R + dy).toFixed(2)}`);
        else { const gap = HUECO / R, cap = sw / 2 / R, s = t0 + gap / 2 + cap, e = Math.max(s + .0001, t1 - gap / 2 - cap);
          a.el.setAttribute('d', `M${(Math.cos(s) * R + dx).toFixed(2)} ${(Math.sin(s) * R + dy).toFixed(2)}A${R} ${R} 0 ${e - s > Math.PI ? 1 : 0} 1 ${(Math.cos(e) * R + dx).toFixed(2)} ${(Math.sin(e) * R + dy).toFixed(2)}`); }
        a.el.style.strokeWidth = sw.toFixed(2); a.el.style.opacity = Math.max(0, Math.min(1, a.op.x)).toFixed(3); }); };
    const quadro = ms => { raf = 0; if (document.hidden) return; const dt = ant ? Math.min(.1, (ms - ant) / 1000) : 0; ant = ms; sobra += dt; let k = 0; const rs = todas();
      while (sobra >= 1 / 120 && k < 24) { rs.forEach(r => passo(r, 1 / 120)); sobra -= 1 / 120; k++; } if (k === 24) sobra = 0; desenha(); if (!rs.every(quieto)) raf = requestAnimationFrame(quadro); };
    const acorda = () => { if (reduce) { todas().forEach(r => { r.x = r.meta; r.v = 0; }); desenha(); return; } if (!raf) { ant = 0; raf = requestAnimationFrame(quadro); } };
    document.addEventListener('visibilitychange', () => { ant = 0; if (!document.hidden) acorda(); });
    const ponAnel = (partes, doZero) => { let acu = 0; partes.forEach((p, i) => { const a = arcos[i]; a.ini.meta = acu; a.lar.meta = p; acu += p; if (doZero) { a.ini.x = a.ini.meta; a.ini.v = 0; a.lar.x = 0; a.lar.v = 0; } });
      if (doZero && !reduce) arcos.forEach((a, i) => { const m = a.lar.meta; a.lar.meta = 0; setTimeout(() => { a.lar.meta = m; acorda(); }, 120 + i * 90); }); acorda(); };
    const partes = () => { const t = porSit(mes), tt = soma(t) || 1; return t.map(x => x / tt); };

    // ---------- situações, centro e comparação ----------
    const total = Cifras($('[data-pf-total]'));
    const cards = SITS.map((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pf-sit pf-s' + i; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="pf-ic">${icone(i)}</span><span class="pf-sit-tx"><span class="pf-sit-nm">${s.nome}</span><span class="pf-sit-v pf-vira"><span></span></span></span>
        <span class="pf-sit-rod"><span class="pf-barra"><i></i></span><span class="pf-pct pf-vira"><span></span></span></span><span class="pf-sit-q"></span>`;
      b.addEventListener('click', () => escolhe(i)); b.addEventListener('pointerenter', () => { hov = i; aplica(); }); b.addEventListener('pointerleave', () => { hov = -1; aplica(); });
      $('[data-pf-sits]').appendChild(b); return { el:b, v:b.querySelector('.pf-sit-v'), pct:b.querySelector('.pf-pct'), barra:b.querySelector('.pf-barra i'), q:b.querySelector('.pf-sit-q') }; });
    const pintaSits = anima => { const t = porSit(mes), tt = soma(t), l = doMes(mes);
      cards.forEach((c, i) => { const n = l.filter(x => sitDe(x) === i), p = tt ? Math.round(t[i] / tt * 100) : 0;
        if (anima) { vira(c.v, brl(t[i])); vira(c.pct, p + '%'); } else { c.v.lastElementChild.textContent = brl(t[i]); c.pct.lastElementChild.textContent = p + '%'; }
        c.barra.style.setProperty('--w', (tt ? t[i] / tt : 0).toFixed(4));
        const maior = i === 2 && n.length ? Math.max(...n.map(x => dias(x.vencimento, hoje()))) : 0;
        c.q.textContent = !n.length ? 'nenhuma' : `${n.length} ${n.length === 1 ? 'cobrança' : 'cobranças'}${i === 2 ? ` · há ${maior} ${maior === 1 ? 'dia' : 'dias'}` : ''}`;
        c.el.setAttribute('aria-label', `${s(i)}: ${brl(t[i])}, ${p}% do mês. Filtrar`); }); };
    const s = i => SITS[i].nome;
    const pintaCentro = (anima, dir = 1) => { const t = porSit(mes), tt = soma(t), l = doMes(mes), v = sel >= 0 ? t[sel] : tt, n = sel >= 0 ? l.filter(x => sitDe(x) === sel).length : l.length;
      total.pon(brl(v), anima);
      vira($('[data-pf-cet]'), sel >= 0 ? s(sel) : 'Previsto em ' + mesMin(mes), dir);
      vira($('[data-pf-csub]'), sel >= 0 ? `${tt ? Math.round(t[sel] / tt * 100) : 0}% do mês · ${n} ${n === 1 ? 'cobrança' : 'cobranças'}` : `${n} ${n === 1 ? 'cobrança' : 'cobranças'}`, dir); };
    const pintaCompara = anima => { const cx = $('[data-pf-compara]'), tt = soma(porSit(mes)), pm = somaMes(mes, -1), an = soma(porSit(pm));
      let cls = 'igual', html;
      if (!an && !tt) html = 'Nada cobrado neste mês'; else if (!an) html = `${MESES[+pm.slice(5) - 1]} não teve cobranças`;
      else { const p = Math.round((tt - an) / an * 100); cls = p > 0 ? 'mais' : p < 0 ? 'menos' : 'igual';
        html = p === 0 ? 'Igual a ' + mesMin(pm) : `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${p > 0 ? 'M1 9h10L6 2z' : 'M1 3h10L6 10z'}"/></svg>${Math.abs(p)}% ${p > 0 ? 'a mais' : 'a menos'} que ${mesMin(pm)}`; }
      const igual = cx.innerHTML === html && cx.dataset.c === cls; cx.className = 'pf-compara ' + cls; cx.dataset.c = cls; cx.innerHTML = html;
      if (anima && !igual && !reduce) cx.animate([{ opacity:0, transform:'translateY(8px) scale(.94)' }, { opacity:1, transform:'none' }], { duration:600, easing:EASE_MOLA }); };
    const pintaTopo = () => { const [mn, mx] = limites(); $$('[data-pf-mes]').forEach(b => { b.disabled = (+b.dataset.pfMes < 0 && mes <= mn) || (+b.dataset.pfMes > 0 && mes >= mx); });
      $('[data-pf-hoje]').hidden = mes === hoje().slice(0, 7); $('[data-pf-lt]').textContent = 'Cobranças de ' + mesMin(mes);
      const c = api.contratada(); $('[data-pf-sub]').textContent = `Por situação${c ? ` · receita contratada ${brl(c)} por mês` : ''}`;
      const ed = api.edita(); $('[data-pf-abre]').hidden = !ed; $('[data-pf-pista-b]').hidden = !ed; };

    // ---------- lista com FLIP ----------
    const lista = $('[data-pf-lista]'), nos = new Map();
    const textoDe = x => { const k = sitDe(x), d = dias(x.vencimento, hoje()), forma = api.forma(x);
      return k === 0 ? `paga em ${ddmm(String(x.pago_em || '').slice(0, 10))} · ${forma}` : k === 2 ? `venceu ${ddmm(x.vencimento)} · atrasada há ${d} ${d === 1 ? 'dia' : 'dias'}`
        : `vence ${ddmm(x.vencimento)} · ${-d === 0 ? 'hoje' : `em ${-d} ${-d === 1 ? 'dia' : 'dias'}`} · ${forma}`; };
    const linha = x => { const k = sitDe(x), li = document.createElement('li'), ed = api.edita(); li.className = 'pf-mov pf-s' + k; li._id = x.id; li._k = k;
      const bt = !ed ? '' : k === 0 ? `<button class="btn sm" type="button" data-act="cobRecibo" data-id="${x.id}">Recibo</button>` : `<button class="btn sm" type="button" data-act="cobCobrar" data-id="${x.id}">${k === 2 ? 'Cobrar' : 'Enviar'}</button>`;
      li.innerHTML = `<span class="pf-mov-i">${icone(k)}</span><span class="pf-mov-t"><b>${esc(x.cliente)} · ${esc(x.descricao)}</b><small${k === 2 ? ' class="ruim"' : ''}>${textoDe(x)}</small></span><span class="pf-mov-v">${brl(api.valorDe(x))}</span>
        <span class="pf-mov-ac">${bt}${ed ? `<button class="btn tres sm" type="button" data-act="cobMenu" data-id="${x.id}" aria-label="Opções da cobrança">${S.svg('mais3')}</button>` : ''}</span>`;
      nos.set(x.id, li); return li; };
    const visiveis = () => doMes(mes).filter(x => sel < 0 || sitDe(x) === sel).sort((a, b) => sitDe(b) - sitDe(a) || a.vencimento.localeCompare(b.vencimento) || String(a.cliente).localeCompare(String(b.cliente)));
    const atualizaLista = anima => {
      const quero = visiveis(), porId = new Map(quero.map(x => [x.id, x])), antes = new Map(), cx = lista.getBoundingClientRect();
      lista.querySelectorAll('.pf-mov:not(.fora)').forEach(li => antes.set(li, li.getBoundingClientRect()));
      antes.forEach((r, li) => { const x = porId.get(li._id); if (x && sitDe(x) === li._k && li._txt === textoDe(x) + api.valorDe(x)) return;
        nos.delete(li._id); if (!anima || reduce || !lista.isConnected) { li.remove(); return; }
        li.classList.add('fora'); li.style.top = (r.top - cx.top + lista.scrollTop) + 'px';
        const a = li.animate([{ opacity:1, transform:'none' }, { opacity:0, transform:'translateX(-18px) scale(.96)' }], { duration:260, easing:'cubic-bezier(.5,0,.75,0)', fill:'forwards' });
        a.onfinish = () => li.remove(); setTimeout(() => li.remove(), 320); });
      lista.querySelectorAll('.pf-vazio').forEach(v => v.remove());
      let k = 0;
      quero.forEach(x => { let li = nos.get(x.id), novo = false; if (!li) { li = linha(x); li._txt = textoDe(x) + api.valorDe(x); novo = true; } lista.appendChild(li);
        if (!anima || reduce) return;
        const a = antes.get(li);
        if (a && !novo) { const dy = a.top - li.getBoundingClientRect().top; if (Math.abs(dy) > .5) li.animate([{ transform:`translateY(${dy}px)` }, { transform:'none' }], { duration:620, easing:EASE_MOLA }); }
        else li.animate([{ opacity:0, transform:'translateY(-12px) scale(.96)' }, { opacity:1, transform:'none' }], { duration:620, easing:EASE_MOLA, delay:Math.min(k++, 6) * 45, fill:'backwards' }); });
      lista.querySelectorAll('.fora').forEach(f => lista.appendChild(f));
      if (!quero.length) { const v = document.createElement('li'); v.className = 'pf-vazio'; v.textContent = sel >= 0 ? `Nenhuma cobrança "${s(sel).toLowerCase()}" em ${mesMin(mes)}.` : `Nenhuma cobrança em ${mesMin(mes)}.`; lista.prepend(v); } };
    const enche = () => { lista.textContent = ''; nos.clear(); atualizaLista(false); };

    // ---------- escolher a situação ----------
    const filtro = $('[data-pf-filtro]'), corpo = $('[data-pf-corpo]');
    const marca = () => { corpo.classList.toggle('filtra', sel >= 0); cards.forEach((c, k) => c.el.setAttribute('aria-pressed', String(k === sel)));
      filtro.hidden = sel < 0; if (sel >= 0) { filtro.style.setProperty('--c', COR[sel]); $('[data-pf-filtro-t]').textContent = s(sel); filtro.setAttribute('aria-label', 'Tirar o filtro ' + s(sel)); } };
    const escolhe = i => { if (ocupado) return; sel = i === sel ? -1 : i; marca(); aplica(); pintaCentro(true, sel >= 0 ? 1 : -1); atualizaLista(true);
      S.avisarLeitor && S.avisarLeitor(sel >= 0 ? `${s(sel)}: ${brl(porSit(mes)[sel])}.` : 'Todas as cobranças do mês.'); };
    filtro.addEventListener('click', () => escolhe(sel));

    // ---------- trocar o mês ----------
    const vaiPara = novo => { const [mn, mx] = limites(); if (!novo || novo === mes || novo < mn || novo > mx || ocupado) return; const d = novo > mes ? 1 : -1; ocupado = true; fechaBaixa(true); some();
      const sai = reduce || !corpo.isConnected ? null : corpo.animate([{ opacity:1, transform:'none' }, { opacity:0, transform:`translateX(${-d * 60}px)` }], { duration:240, easing:'cubic-bezier(.5,0,.75,0)', fill:'forwards' });
      vira($('[data-pf-mes-et]'), nomeMes(novo), d, 'X');
      setTimeout(() => { mes = novo; sel = -1; marca(); hov = -1; aplica(); pintaTopo(); pintaSits(true); pintaCompara(true); pintaCentro(true, d); ponAnel(partes(), true); enche(); assinatura = sig();
        if (sai) sai.cancel(); if (!reduce) corpo.animate([{ opacity:0, transform:`translateX(${d * 60}px)` }, { opacity:1, transform:'none' }], { duration:700, easing:EASE_MOLA, fill:'backwards' });
        if (api.aoMudarMes) api.aoMudarMes(mes); setTimeout(() => { ocupado = false; }, 280); }, reduce ? 0 : 240); };
    $$('[data-pf-mes]').forEach(b => b.addEventListener('click', () => vaiPara(somaMes(mes, +b.dataset.pfMes))));
    $('[data-pf-hoje]').addEventListener('click', () => vaiPara(hoje().slice(0, 7)));

    // ---------- dar baixa dentro do painel ----------
    const fcx = $('[data-pf-fcaixa]'), form = $('[data-pf-form]'), abre = $('[data-pf-abre]'); let escolhida = null;
    const marcaCob = () => { const x = api.cobs().find(c => c.id === escolhida); $$('.pf-f-cob').forEach(b => b.setAttribute('aria-checked', String(b.dataset.c === escolhida)));
      $('[data-pf-valor]').value = x ? String(x.valor).replace('.', ',') : ''; const te = x && api.temEmail(x); $('[data-pf-recibo-l]').hidden = !te; $('[data-pf-recibo]').checked = !!te && api.reciboPadrao(); };
    const abreBaixa = () => { if (ocupado || !api.edita()) return; const ab = doMes(mes).filter(x => x.situacao === 'aberta').sort((a, b) => sitDe(b) - sitDe(a) || a.vencimento.localeCompare(b.vencimento));
      if (!ab.length) { aviso(`Nada em aberto em ${mesMin(mes)}`, false); return; }
      escolhida = (sel >= 0 && ab.find(x => sitDe(x) === sel) || ab[0]).id;
      $('[data-pf-fcobs]').innerHTML = ab.map(x => `<button type="button" class="pf-f-cob" role="radio" data-c="${x.id}" aria-checked="false"><b>${esc(x.descricao)}</b><small>${esc(x.cliente)} · ${brl(x.valor)} · ${sitDe(x) === 2 ? 'atrasada' : 'vence ' + ddmm(x.vencimento)}</small></button>`).join('');
      $('[data-pf-data]').value = hoje(); marcaCob();
      fcx.classList.add('aberta'); abre.setAttribute('aria-expanded', 'true'); form.inert = false; const b = $('.pf-f-cob[aria-checked="true"]'); if (b) b.focus({ preventScroll:true }); };
    const fechaBaixa = semFoco => { if (!fcx.classList.contains('aberta')) return; fcx.classList.remove('aberta'); abre.setAttribute('aria-expanded', 'false'); form.inert = true; if (!semFoco) abre.focus({ preventScroll:true }); };
    abre.addEventListener('click', () => fcx.classList.contains('aberta') ? fechaBaixa() : abreBaixa());
    $('[data-pf-fecha]').addEventListener('click', () => fechaBaixa());
    $('[data-pf-fcobs]').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; escolhida = b.dataset.c; marcaCob(); });
    $('[data-pf-fcobs]').addEventListener('keydown', e => { const d = { ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1 }[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation();
      const bs = $$('.pf-f-cob'), i = bs.findIndex(b => b.dataset.c === escolhida), n = bs[(i + d + bs.length) % bs.length]; escolhida = n.dataset.c; marcaCob(); n.focus(); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fechaBaixa(); } });
    form.addEventListener('submit', async e => { e.preventDefault(); const x = api.cobs().find(c => c.id === escolhida); if (!x) return;
      const v = S.num($('[data-pf-valor]').value), dt = $('[data-pf-data]').value;
      if (!(v > 0)) return S.erroNoCampo($('[data-pf-valor]'), 'Informe o valor recebido.');
      if (!dt) return S.erroNoCampo($('[data-pf-data]'), 'Escolha a data do pagamento.');
      fechaBaixa(true);
      const r = await api.baixar({ id:x.id, pago_em:dt, valor:v, recibo:!$('[data-pf-recibo-l]').hidden && $('[data-pf-recibo]').checked });
      if (!r) return; ultima = x.id; aviso(`Baixa feita · ${x.descricao} ${brl(v)}${r.msg ? ' · ' + r.msg : ''}`, true); });
    $('[data-pf-desfaz]').addEventListener('click', async () => { const id = ultima; ultima = null; some(); if (id) await api.desfazer(id); });
    const av = $('[data-pf-aviso]'); let tAv = 0;
    const aviso = (txt, comDesfazer) => { $('[data-pf-aviso-t]').textContent = txt; $('[data-pf-desfaz]').hidden = !comDesfazer; av.hidden = false;
      if (!reduce) av.animate([{ opacity:0, transform:'translate(-50%, 24px) scale(.9)' }, { opacity:1, transform:'translate(-50%, 0)' }], { duration:600, easing:EASE_MOLA });
      clearTimeout(tAv); tAv = setTimeout(some, 6000); };
    const some = () => { clearTimeout(tAv); av.hidden = true; };

    // ---------- teclado (só com o Financeiro aberto) ----------
    document.addEventListener('keydown', e => { if (!raiz.isConnected || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      const t = e.target, escreve = t.matches && t.matches('input, select, textarea');
      if (e.key === 'Escape') { if (fcx.classList.contains('aberta')) fechaBaixa(); else if (sel >= 0) escolhe(sel); else some(); return; }
      if (escreve) return;
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(t.closest && t.closest('.pf-f-cobs, .seg'))) { e.preventDefault(); vaiPara(somaMes(mes, e.key === 'ArrowLeft' ? -1 : 1)); }
      else if (/^[1-3]$/.test(e.key)) escolhe(+e.key - 1);
      else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); abreBaixa(); } });

    // ---------- dados novos (depois de uma baixa, estorno, filtro de cliente…) ----------
    const sig = () => JSON.stringify([mes, api.contratada(), api.edita(), doMes(mes).map(x => [x.id, sitDe(x), api.valorDe(x), x.vencimento, x.pago_em])]);
    const sinc = () => { const nova = sig(); pintaTopo(); if (nova === assinatura) return; const antes = porSit(mes); assinatura = nova;
      const depois = porSit(mes), k = depois.findIndex((v, i) => v > antes[i]);
      if (sel >= 0 && !doMes(mes).some(x => sitDe(x) === sel)) { sel = -1; marca(); }
      ponAnel(partes(), false); if (k >= 0) { arcos[k].gro.v += 110; arcos[k].sep.v += 120; acorda(); }
      pintaSits(true); pintaCentro(true); pintaCompara(false); atualizaLista(true); };

    // ---------- começo ----------
    $$('.pf-vira').forEach(c => { if (!c.firstElementChild) c.innerHTML = '<span></span>'; });
    vira($('[data-pf-mes-et]'), nomeMes(mes)); pintaTopo(); pintaSits(false); pintaCompara(false); pintaCentro(false); total.pon(brl(0), false); enche(); assinatura = sig();
    setTimeout(() => { ponAnel(partes(), true); total.pon(brl(soma(porSit(mes))), !reduce); }, reduce ? 0 : 160);
    return { el:raiz, sinc, vaiPara, mes:() => mes };
  };
})();

// SONVI · campo de data próprio (29/10/2026). O campo de data do Safari monta o ano um número por vez (0002 → 0020 → 0202
// → 2026) e, quando a tela reagia no meio, o ano travava em "0020". Agora todo <input type="date"> do SONVI, do Console
// e das páginas públicas ganha um campo de texto ao lado, onde a pessoa digita só os números (01102026 vira 01/10/2026),
// e um botão de calendário. O <input type="date"> original continua existindo (escondido): é ele que tem o name, os
// data-* e o valor no formato AAAA-MM-DD, então os módulos não mudam. Ele recebe "input" quando a data fica completa
// e "change" ao sair do campo (ou ao escolher no calendário). Sem bibliotecas; funciona sem o objeto SONVI.
(() => {
  if (window.__sonviData) return; window.__sonviData = true;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const nativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const ler = el => nativo.get.call(el), gravar = (el, v) => nativo.set.call(el, v);
  const pad = n => String(n).padStart(2, '0');
  const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
  const diasNoMes = (a, m) => new Date(a, m, 0).getDate();
  const br = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '';
  const hoje = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const mascara = txt => { const n = String(txt).replace(/\D/g, '').slice(0, 8); return n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n; };
  // Lê "dd/mm/aaaa": devolve { v: 'AAAA-MM-DD' } ou { erro } (vazio = { v: '' })
  const entender = (txt, el) => {
    const n = String(txt).replace(/\D/g, '');
    if (!n) return { v:'' };
    if (n.length < 8) return { erro:'Data incompleta: use dia/mês/ano, por exemplo 01/10/2026.' };
    const d = +n.slice(0, 2), m = +n.slice(2, 4), a = +n.slice(4, 8);
    if (m < 1 || m > 12) return { erro:'Mês inválido: use de 01 a 12.' };
    if (a < 1900 || a > 2100) return { erro:'Ano inválido: use os quatro números, por exemplo 2026.' };
    if (d < 1 || d > diasNoMes(a, m)) return { erro:`${MESES[m - 1]} de ${a} não tem dia ${d}.` };
    const v = iso(a, m, d);
    if (el.min && v < el.min) return { erro:`A data precisa ser ${br(el.min)} ou depois.` };
    if (el.max && v > el.max) return { erro:`A data precisa ser ${br(el.max)} ou antes.` };
    return { v };
  };
  const icone = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  const emite = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles:true }));

  const aviso = (c, msg) => {
    let a = c.wrap.querySelector(':scope > .dt-aviso');
    c.tx.setCustomValidity(msg || ''); c.tx.toggleAttribute('aria-invalid', !!msg);
    if (!msg) { if (a) a.remove(); c.tx.removeAttribute('aria-describedby'); return; }
    if (!a) { a = document.createElement('small'); a.className = 'dt-aviso'; a.id = 'dt' + Math.random().toString(36).slice(2, 8); a.setAttribute('role', 'alert'); c.wrap.appendChild(a); }
    a.textContent = msg; c.tx.setAttribute('aria-describedby', a.id);
  };
  // Grava no campo original; "change" só quando pedido (sair do campo, Enter, calendário)
  const confirmar = (c, v, mudar) => {
    const antes = ler(c.el);
    if (v !== antes) { gravar(c.el, v); emite(c.el, 'input'); }
    if (mudar && v !== c.ultimo) { c.ultimo = v; emite(c.el, 'change'); }
  };
  const conferir = (c, mudar) => {
    const r = entender(c.tx.value, c.el);
    if (r.erro) { aviso(c, mudar || String(c.tx.value).replace(/\D/g, '').length >= 8 ? r.erro : ''); c.tx.setCustomValidity(r.erro); return; }
    aviso(c, '');
    if (c.obrig && !r.v) c.tx.setCustomValidity('Preencha a data.'); else c.tx.setCustomValidity('');
    confirmar(c, r.v, mudar);
  };

  // ---------- calendário ----------
  let aberto = null; // { c, painel, a, m, foco }
  const fecharCal = (foco = true) => {
    if (!aberto) return; const { c, painel } = aberto; aberto = null;
    c.bt.setAttribute('aria-expanded', 'false');
    try { if (painel.hidePopover && painel.matches(':popover-open')) painel.hidePopover(); } catch (e) { /* já fechou */ }
    painel.remove(); if (foco && document.contains(c.tx)) c.tx.focus({ preventScroll:true });
  };
  const desenharCal = () => {
    const { c, painel, a, m } = aberto, sel = ler(c.el), hj = hoje();
    const primeiro = (new Date(a, m - 1, 1).getDay() + 6) % 7, total = diasNoMes(a, m);
    let foco = aberto.foco; if (!foco || foco.slice(0, 7) !== `${a}-${pad(m)}`) foco = sel && sel.slice(0, 7) === `${a}-${pad(m)}` ? sel : hj.slice(0, 7) === `${a}-${pad(m)}` ? hj : iso(a, m, 1);
    aberto.foco = foco;
    const anos = []; const a0 = Math.min(a, new Date().getFullYear()) - 90, a1 = Math.max(a, new Date().getFullYear()) + 10; for (let y = a1; y >= a0; y--) anos.push(y);
    let dias = ''; for (let i = 0; i < primeiro; i++) dias += '<span class="dt-vazio" aria-hidden="true"></span>';
    for (let d = 1; d <= total; d++) { const v = iso(a, m, d), fora = (c.el.min && v < c.el.min) || (c.el.max && v > c.el.max);
      dias += `<button type="button" class="dt-dia${v === sel ? ' sel' : ''}${v === hj ? ' hj' : ''}" data-dt="${v}" tabindex="${v === foco ? 0 : -1}"${fora ? ' disabled' : ''} aria-label="${d} de ${MESES[m - 1]} de ${a}"${v === sel ? ' aria-pressed="true"' : ''}>${d}</button>`; }
    painel.innerHTML = `<div class="dt-cab"><button type="button" class="dt-seta" data-dt-mes="-1" aria-label="Mês anterior">‹</button>
      <select data-nativo class="dt-sm" aria-label="Mês">${MESES.map((n, i) => `<option value="${i + 1}"${i + 1 === m ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <select data-nativo class="dt-sa" aria-label="Ano">${anos.map(y => `<option${y === a ? ' selected' : ''}>${y}</option>`).join('')}</select>
      <button type="button" class="dt-seta" data-dt-mes="1" aria-label="Próximo mês">›</button></div>
      <div class="dt-sem" aria-hidden="true"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
      <div class="dt-grade" role="group" aria-label="${MESES[m - 1]} de ${a}">${dias}</div>
      <div class="dt-pe"><button type="button" data-dt-acao="hoje">Hoje</button>${c.obrig ? '' : '<button type="button" data-dt-acao="limpar">Limpar</button>'}</div>`;
  };
  const posicionarCal = () => {
    if (!aberto) return; const { c, painel } = aberto, r = c.wrap.getBoundingClientRect();
    painel.style.left = '0px'; painel.style.top = '0px'; const o = painel.getBoundingClientRect();
    const w = painel.offsetWidth, h = painel.offsetHeight, vw = innerWidth, vh = innerHeight;
    const cima = vh - r.bottom < h + 12 && r.top > vh - r.bottom;
    painel.style.left = (Math.max(8, Math.min(vw - w - 8, r.left)) - o.left) + 'px';
    painel.style.top = ((cima ? Math.max(8, r.top - 6 - h) : r.bottom + 6) - o.top) + 'px';
  };
  const focarDia = () => { const b = aberto && aberto.painel.querySelector(`[data-dt="${aberto.foco}"]`); if (b) b.focus({ preventScroll:true }); };
  const irMes = (k, manterDia) => { const d = new Date(aberto.a, aberto.m - 1 + k, 1); aberto.a = d.getFullYear(); aberto.m = d.getMonth() + 1;
    if (manterDia) { const dia = Math.min(+aberto.foco.slice(8, 10), diasNoMes(aberto.a, aberto.m)); aberto.foco = iso(aberto.a, aberto.m, dia); }
    desenharCal(); };
  const escolherDia = v => { const c = aberto.c; c.tx.value = br(v); aviso(c, ''); c.tx.setCustomValidity(''); fecharCal(); confirmar(c, v, true); };
  const abrirCal = c => {
    if (aberto && aberto.c === c) return fecharCal();
    fecharCal(false);
    const v = ler(c.el) || (c.el.min && c.el.min > hoje() ? c.el.min : hoje());
    const painel = document.createElement('div'); painel.className = 'dt-painel'; painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Escolher data');
    (c.wrap.closest('dialog[open]') || document.body).appendChild(painel);
    if (typeof painel.showPopover === 'function') { painel.setAttribute('popover', 'manual'); painel.showPopover(); }
    aberto = { c, painel, a:+v.slice(0, 4), m:+v.slice(5, 7), foco:ler(c.el) || '' };
    c.bt.setAttribute('aria-expanded', 'true');
    desenharCal(); posicionarCal(); requestAnimationFrame(() => { painel.classList.add('on'); focarDia(); });
    painel.addEventListener('click', e => {
      const d = e.target.closest('[data-dt]'); if (d && !d.disabled) return escolherDia(d.dataset.dt);
      const s = e.target.closest('[data-dt-mes]'); if (s) { irMes(+s.dataset.dtMes); return; }
      const ac = e.target.closest('[data-dt-acao]'); if (!ac) return;
      if (ac.dataset.dtAcao === 'hoje') escolherDia(hoje());
      else { const c2 = aberto.c; c2.tx.value = ''; aviso(c2, ''); fecharCal(); confirmar(c2, '', true); }
    });
    painel.addEventListener('change', e => { e.stopPropagation();
      if (e.target.matches('.dt-sm')) aberto.m = +e.target.value; if (e.target.matches('.dt-sa')) aberto.a = +e.target.value;
      const cls = e.target.className; desenharCal(); posicionarCal(); const s = aberto.painel.querySelector('.' + cls.split(' ')[0]); if (s) s.focus(); });
    painel.addEventListener('input', e => e.stopPropagation());
    painel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return fecharCal(); }
      if (!e.target.matches('[data-dt]')) return;
      const passo = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 }[e.key];
      if (passo) { e.preventDefault(); const d = new Date(+aberto.foco.slice(0, 4), +aberto.foco.slice(5, 7) - 1, +aberto.foco.slice(8, 10) + passo);
        aberto.foco = iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (aberto.foco.slice(0, 7) !== `${aberto.a}-${pad(aberto.m)}`) { aberto.a = d.getFullYear(); aberto.m = d.getMonth() + 1; desenharCal(); }
        else aberto.painel.querySelectorAll('[data-dt]').forEach(b => { b.tabIndex = b.dataset.dt === aberto.foco ? 0 : -1; });
        focarDia(); }
      else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); irMes(e.key === 'PageUp' ? -1 : 1, true); focarDia(); }
    });
  };
  document.addEventListener('pointerdown', e => { if (aberto && !aberto.painel.contains(e.target) && !aberto.c.bt.contains(e.target)) fecharCal(false); }, true);
  addEventListener('resize', () => fecharCal(false));
  addEventListener('scroll', e => { if (aberto && !aberto.painel.contains(e.target)) posicionarCal(); }, true);

  // ---------- preparar cada campo ----------
  const preparar = el => {
    if (el.dataset.dtPronto || el.hasAttribute('data-nativo')) return; el.dataset.dtPronto = '1';
    const wrap = document.createElement('span'); wrap.className = 'dt-campo';
    const tx = document.createElement('input'); tx.type = 'text'; tx.className = ('dt-tx ' + el.className).trim(); tx.inputMode = 'numeric'; tx.autocomplete = 'off';
    tx.placeholder = 'dd/mm/aaaa'; tx.maxLength = 10; if (el.getAttribute('style')) tx.setAttribute('style', el.getAttribute('style'));
    ['aria-label', 'title', 'id'].forEach(k => { if (el.hasAttribute(k)) { tx.setAttribute(k, el.getAttribute(k)); if (k === 'id') el.id = el.id + '-valor'; } });
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'dt-bt'; bt.innerHTML = icone; bt.setAttribute('aria-label', 'Abrir calendário'); bt.setAttribute('aria-expanded', 'false'); bt.setAttribute('aria-haspopup', 'dialog');
    el.parentNode.insertBefore(wrap, el); wrap.append(tx, bt, el);
    el.hidden = true; el.tabIndex = -1; el.setAttribute('aria-hidden', 'true');
    const c = { el, wrap, tx, bt, obrig:el.required, ultimo:ler(el) };
    if (el.required) { el.required = false; tx.required = true; }
    const trava = () => { tx.disabled = el.disabled; tx.readOnly = el.readOnly; bt.disabled = el.disabled || el.readOnly; wrap.classList.toggle('so-ler', el.disabled || el.readOnly); };
    trava(); new MutationObserver(trava).observe(el, { attributes:true, attributeFilter:['disabled', 'readonly'] });
    tx.value = br(ler(el)); if (c.obrig && !ler(el)) tx.setCustomValidity('Preencha a data.');
    // O valor posto pelos módulos (el.value = '2026-10-01') aparece no campo de texto
    Object.defineProperty(el, 'value', { configurable:true, get() { return ler(el); }, set(v) { gravar(el, v); c.ultimo = ler(el); const n = tx.value.replace(/\D/g, '').length; if (document.activeElement !== tx || n === 0 || n === 8) { tx.value = br(ler(el)); aviso(c, ''); tx.setCustomValidity(c.obrig && !ler(el) ? 'Preencha a data.' : ''); } } });
    tx.addEventListener('input', e => { e.stopPropagation();
      const pos = tx.selectionStart === tx.value.length, m = mascara(tx.value); if (m !== tx.value) { tx.value = m; if (pos) tx.setSelectionRange(m.length, m.length); }
      conferir(c, false); });
    tx.addEventListener('change', e => e.stopPropagation());
    tx.addEventListener('blur', () => { if (aberto && aberto.c === c) return; conferir(c, true); });
    tx.addEventListener('keydown', e => {
      if (e.key === 'Enter') { conferir(c, true); if (tx.validationMessage) e.preventDefault(); }
      else if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') { e.preventDefault(); abrirCal(c); }
    });
    bt.addEventListener('click', () => abrirCal(c));
  };
  const varrer = raiz => { if (raiz.matches && raiz.matches('input[type=date]')) preparar(raiz); if (raiz.querySelectorAll) raiz.querySelectorAll('input[type=date]').forEach(preparar); };
  const iniciar = () => { varrer(document.body);
    new MutationObserver(l => l.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) varrer(n); }))).observe(document.body, { childList:true, subtree:true });
    new MutationObserver(() => { if (aberto && !document.contains(aberto.c.wrap)) fecharCal(false); }).observe(document.body, { childList:true, subtree:true }); };
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();

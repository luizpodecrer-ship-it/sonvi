// SONVI · menu de escolha fluido (aprovado em 20/10/2026): a lista dos campos de escolha (<select>) abre crescendo,
// as opções entram em sequência e um realce desliza até a opção sob o mouse ou o teclado.
// O <select> continua sendo o campo de verdade (formulários, valores e eventos não mudam): só a lista que abre é nossa.
// No celular e no tablet (toque) fica a lista do próprio aparelho, que é a mais fácil de usar com o dedo.
// Para um campo continuar com a lista do navegador: <select data-nativo>.
(() => {
  const S = window.SONVI; if (!S) return;
  const OK = '<svg class="fl-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const toque = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
  let atual = null; // { sel, painel, itens, ativo }

  // Conteúdo de cada opção. Rádios aparecem com o selo e a frequência/cidade.
  S.fluidoItem = S.fluidoItem || ((sel, op) => {
    if (sel.dataset.ui === 'vehicleId' && op.value === '__geral') return `<span class="fl-geral" aria-hidden="true">${S.svg('geral')}</span><span class="fl-tx"><b>Dashboard geral</b></span>`;
    if (sel.dataset.ui === 'vehicleId' && S.veh) { const v = S.veh(op.value); if (v) return `${S.vav(v)}<span class="fl-tx"><b>${esc(v.nome)}</b></span>`; }   // só o nome (24/10/2026)
    return `<span class="fl-tx"><b>${esc(op.textContent)}</b></span>`;
  });

  const fechar = (foco = true) => {
    if (!atual) return; const { sel, painel } = atual; atual = null;
    painel.classList.remove('on'); sel.removeAttribute('aria-expanded');
    setTimeout(() => { try { if (painel.hidePopover && painel.matches(':popover-open')) painel.hidePopover(); } catch (e) { /* já fechou */ } painel.remove(); }, 220);
    if (foco && document.contains(sel)) sel.focus({ preventScroll:true });
  };

  const mover = i => {
    if (!atual) return; const { itens, painel } = atual; if (!itens.length) return;
    i = Math.max(0, Math.min(itens.length - 1, i)); atual.ativo = i;
    const el = itens[i], r = painel.querySelector('.fl-realce');
    r.style.transform = `translateY(${el.offsetTop}px)`; r.style.height = el.offsetHeight + 'px'; r.classList.add('on');
    itens.forEach((x, k) => x.classList.toggle('ativo', k === i));
    painel.querySelector('.fl-lista').setAttribute('aria-activedescendant', el.id);
    const caixa = painel.querySelector('.fl-caixa'); if (el.offsetTop < caixa.scrollTop) caixa.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > caixa.scrollTop + caixa.clientHeight) caixa.scrollTop = el.offsetTop + el.offsetHeight - caixa.clientHeight + 6;
  };

  const escolher = i => {
    if (!atual) return; const { sel, itens } = atual, el = itens[i]; if (!el) return;
    const valor = el.dataset.v, mudou = sel.value !== valor;
    el.classList.add('sel'); fechar();
    if (mudou) { sel.value = valor; sel.dispatchEvent(new Event('input', { bubbles:true })); sel.dispatchEvent(new Event('change', { bubbles:true })); }
  };

  const posicionar = () => {
    if (!atual) return; const { sel, painel } = atual, r = sel.getBoundingClientRect();
    // Mede onde fica o ponto 0,0 (dentro de uma janela com animação ele pode não ser o canto da tela)
    painel.style.left = '0px'; painel.style.top = '0px'; const o = painel.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, largura = Math.min(Math.max(r.width, sel.dataset.ui === 'vehicleId' ? 260 : 220), vw - 16), caixa = painel.querySelector('.fl-caixa');
    const abaixo = vh - r.bottom - 14, acima = r.top - 14, quer = Math.min(caixa.scrollHeight, 328), paraCima = abaixo < Math.min(quer, 200) && acima > abaixo;
    caixa.style.maxHeight = Math.max(110, Math.min(328, paraCima ? acima : abaixo)) + 'px';
    painel.style.width = largura + 'px';
    const alto = painel.offsetHeight;
    painel.classList.toggle('acima', paraCima);
    painel.style.left = (Math.max(8, Math.min(vw - largura - 8, r.left)) - o.left) + 'px';
    painel.style.top = ((paraCima ? r.top - 6 - alto : r.bottom + 6) - o.top) + 'px';
  };

  const abrir = sel => {
    if (atual && atual.sel === sel) return fechar();
    fechar(false);
    const id = 'fl' + Math.random().toString(36).slice(2, 8);
    let n = 0, html = '';
    const op = o => { const i = n++; return `<div class="fl-item${o.selected ? ' sel' : ''}${o.disabled ? ' off' : ''}" role="option" id="${id}-${i}" data-v="${esc(o.value)}" aria-selected="${o.selected}"${o.disabled ? ' aria-disabled="true"' : ''} style="--i:${Math.min(i, 9)}">${S.fluidoItem(sel, o)}${OK}</div>`; };
    [...sel.children].forEach(c => { if (c.tagName === 'OPTGROUP') html += `<div class="fl-grupo" role="presentation">${esc(c.label)}</div>${[...c.children].map(op).join('')}`; else if (c.tagName === 'OPTION' && !c.hidden) html += op(c); });
    const nome = sel.getAttribute('aria-label') || ((sel.closest('label') || {}).firstChild || {}).textContent || '';
    const painel = document.createElement('div'); painel.className = 'fl-painel';
    painel.innerHTML = `<div class="fl-caixa"><div class="fl-lista" role="listbox" tabindex="-1" aria-label="${esc(String(nome).trim())}"><div class="fl-realce" aria-hidden="true"></div>${html}</div></div>`;
    // A lista vai para a camada do topo (popover), acima das janelas e sem ser cortada por elas.
    // Sempre dentro da janela aberta: o que fica fora dela não recebe clique enquanto ela está aberta.
    (sel.closest('dialog[open]') || document.body).appendChild(painel);
    if (typeof painel.showPopover === 'function') { painel.setAttribute('popover', 'manual'); painel.showPopover(); }
    const itens = [...painel.querySelectorAll('.fl-item:not(.off)')];
    atual = { sel, painel, itens, ativo:0 };
    sel.setAttribute('aria-expanded', 'true');
    posicionar();
    requestAnimationFrame(() => { painel.classList.add('on'); const i = itens.findIndex(x => x.dataset.v === sel.value); mover(i < 0 ? 0 : i); painel.querySelector('.fl-lista').focus({ preventScroll:true }); });
    itens.forEach((el, i) => { el.addEventListener('mouseenter', () => mover(i)); el.addEventListener('click', () => escolher(i)); });
    painel.querySelector('.fl-lista').addEventListener('keydown', e => {
      const t = { ArrowDown:1, ArrowUp:-1, PageDown:6, PageUp:-6 }[e.key];
      if (t) { e.preventDefault(); mover(atual.ativo + t); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); mover(e.key === 'Home' ? 0 : itens.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(atual.ativo); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
      else if (e.key === 'Tab') { e.preventDefault(); fechar(); }
      else if (e.key.length === 1 && /\S/.test(e.key)) { // digitar a primeira letra vai até a opção
        const k = e.key.toLowerCase(), de = atual.ativo + 1, ord = [...itens.slice(de), ...itens.slice(0, de)];
        const alvo = ord.find(x => x.textContent.trim().toLowerCase().startsWith(k)); if (alvo) mover(itens.indexOf(alvo)); }
    });
  };

  const usa = sel => sel && sel.tagName === 'SELECT' && !sel.multiple && !sel.disabled && !sel.hasAttribute('data-nativo') && sel.size <= 1;

  document.addEventListener('pointerdown', e => {
    if (atual && !atual.painel.contains(e.target) && e.target !== atual.sel) fechar(false);
    const sel = e.target.closest && e.target.closest('select');
    if (!usa(sel) || e.pointerType === 'touch' || e.button !== 0 || toque()) return;
    e.preventDefault(); sel.focus({ preventScroll:true }); abrir(sel);
  }, true);
  // Safari e alguns navegadores abrem a lista no mousedown mesmo assim
  document.addEventListener('mousedown', e => { const sel = e.target.closest && e.target.closest('select'); if (usa(sel) && !toque()) e.preventDefault(); }, true);
  document.addEventListener('keydown', e => {
    const sel = e.target; if (!usa(sel) || toque() || atual) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) { e.preventDefault(); abrir(sel); }
  }, true);
  addEventListener('resize', () => fechar(false));
  addEventListener('scroll', e => { if (atual && !atual.painel.contains(e.target)) fechar(false); }, true);
  // Se o campo sumir da tela (a tela foi redesenhada), a lista fecha junto
  new MutationObserver(() => { if (atual && !document.contains(atual.sel)) fechar(false); }).observe(document.body, { childList:true, subtree:true });
})();

// SONVI · Seletor de veículo do alto do menu (aprovado em 24/10/2026, estilos .sv-* no fim de sonvi.css).
// Adaptado do recurso "Conmutador" da Moxen (moxen.cl/recursos), usado conforme a licença dele: dentro do produto,
// sem redistribuir o código como modelo. Sem bibliotecas. Vale no SONVI e no Sonvi Music.
//
// O botão mostra o selo, o nome e a linha de apoio do veículo aberto. Ao clicar abre um painel (sem busca, decidido
// em 24/10/2026) com a lista dos veículos (selo + nome + atalho) e, só para o diretor,
// "Dashboard geral" por último. Setas andam, Enter escolhe, Esc fecha. Alt + 1 a 9 trocam direto, de qualquer tela.
// Ao trocar, o nome rola como um tambor do veículo antigo para o novo. A troca em si é S.trocarVeiculo (app.js).
(() => {
  const { esc } = S;
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ultimo = null, ultimoNome = '', painel = null, aberto = false, ativo = 0, visiveis = [], dir = false;
  const veiculos = () => S.db.veiculos || [];
  const curva = 'cubic-bezier(.22,1,.36,1)';

  // O botão (desenhado junto com o menu lateral)
  S.seletorVeiculo = (veh, diretor) => {
    dir = !!diretor;
    const troca = ultimo && ultimo !== veh.id ? ` data-de="${esc(ultimoNome)}"` : '';
    ultimo = veh.id; ultimoNome = veh.nome;
    return `<button type="button" class="veh sv-cab" data-sv aria-haspopup="dialog" aria-expanded="false" aria-controls="sv-painel" aria-label="Veículo: ${esc(veh.nome)}. Trocar de veículo"${troca}>
      ${S.vav(veh)}<span class="vt"><span class="sv-tam"><b>${esc(veh.nome)}</b></span><small>${esc(S.vehSub(veh) || 'Veículo selecionado')}</small></span>${S.svg('baixo')}</button>`;
  };
  // O nome rola: o antigo sobe e some, o novo chega de baixo
  const tambor = btn => {
    const de = btn.dataset.de; btn.removeAttribute('data-de');
    if (!de || quieto() || !btn.animate) return;
    const caixa = btn.querySelector('.sv-tam'), novo = caixa.firstElementChild, velho = document.createElement('b');
    velho.textContent = de; velho.className = 'sv-velho'; velho.setAttribute('aria-hidden', 'true'); caixa.appendChild(velho);
    velho.animate([{ transform:'none', opacity:1 }, { transform:'translateY(-70%) rotateX(62deg)', opacity:0 }], { duration:300, easing:'cubic-bezier(.4,0,.8,.5)', fill:'forwards' }).onfinish = () => velho.remove();
    novo.animate([{ transform:'translateY(70%) rotateX(-62deg)', opacity:0 }, { transform:'none', opacity:1 }], { duration:560, easing:'cubic-bezier(.34,1.32,.5,1)' });
    const selo = btn.querySelector('.vav'); if (selo) selo.animate([{ transform:'scale(1)' }, { transform:'scale(.6) rotate(-20deg)', offset:.38 }, { transform:'scale(1)' }], { duration:520, easing:curva });
  };
  new MutationObserver(() => { const b = document.querySelector('#side [data-sv][data-de]'); if (b) tambor(b); })
    .observe(document.documentElement, { childList:true, subtree:true });

  // ---------- o painel ----------
  const opcoes = () => [...veiculos().map((v, i) => ({ id:v.id, nome:v.nome, v, n:i + 1 })), ...(dir ? [{ id:'__geral', nome:'Dashboard geral', geral:true }] : [])];
  function cria() {
    painel = document.createElement('div');
    painel.className = 'sv-painel'; painel.id = 'sv-painel'; painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Trocar de veículo'); painel.hidden = true;
    painel.innerHTML = `<div class="sv-lista" id="sv-lista" role="listbox" aria-label="Veículos"></div>
      <p class="sv-pe"><kbd>Alt</kbd><kbd>1–9</kbd> trocam de veículo de qualquer tela</p>`;
    document.body.appendChild(painel);
    // Teclado: o foco anda pelas opções (setas, Home/End), Enter escolhe, Esc fecha
    painel.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (visiveis.length) { ativo = (ativo + (e.key === 'ArrowDown' ? 1 : -1) + visiveis.length) % visiveis.length; marca(true); } }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); ativo = e.key === 'Home' ? 0 : visiveis.length - 1; marca(true); }
      else if (e.key === 'Enter') { e.preventDefault(); if (visiveis[ativo]) escolhe(visiveis[ativo].id); }
      else if (e.key === 'Escape') { e.preventDefault(); fecha(); }
      else if (e.key === 'Tab') fecha(false);
    });
    painel.addEventListener('click', e => { const b = e.target.closest('[data-sv-op]'); if (b) escolhe(b.dataset.svOp); });
    painel.addEventListener('pointerover', e => { const b = e.target.closest('[data-sv-op]'); if (!b || e.pointerType === 'touch') return; const i = visiveis.findIndex(o => o.id === b.dataset.svOp); if (i > -1 && i !== ativo) { ativo = i; marca(); } });
  }
  function pinta() {
    const lista = painel.querySelector('.sv-lista');
    visiveis = opcoes();
    const nome = o => esc(o.nome);
    lista.innerHTML = visiveis.map(o => `<button type="button" class="sv-op${o.geral ? ' sv-geral' : ''}${o.id === S.ui.vehicleId ? ' atual' : ''}" role="option" tabindex="-1" id="sv-op-${esc(o.id)}" data-sv-op="${esc(o.id)}" aria-selected="false">
      ${o.geral ? `<span class="sv-geral-i" aria-hidden="true">${S.svg('geral')}</span>` : S.vav(o.v)}<b>${nome(o)}</b>${o.id === S.ui.vehicleId ? `<span class="sv-ok" aria-label="aberto">${S.svg('check', 16)}</span>` : ''}${o.n && o.n <= 9 ? `<kbd aria-hidden="true">Alt ${o.n}</kbd>` : ''}</button>`).join('');
    ativo = Math.max(0, Math.min(ativo, visiveis.length - 1)); marca();
  }
  function marca(foca) {
    painel.querySelectorAll('[data-sv-op]').forEach((b, i) => b.setAttribute('aria-selected', String(i === ativo)));
    const o = visiveis[ativo], b = o && document.getElementById('sv-op-' + o.id);
    if (b) { b.scrollIntoView({ block:'nearest' }); if (foca) b.focus({ preventScroll:true }); }
  }
  const botao = () => document.querySelector('#side [data-sv]');
  function posiciona() {
    const b = botao(); if (!b || !painel) return;
    const r = b.getBoundingClientRect(), largura = Math.min(320, window.innerWidth - 24);
    painel.style.width = largura + 'px';
    painel.style.left = Math.max(12, Math.min(r.left, window.innerWidth - largura - 12)) + 'px';
    painel.style.top = (r.bottom + 8) + 'px';
    painel.style.maxHeight = (window.innerHeight - r.bottom - 24) + 'px';
  }
  function abre() {
    if (aberto) return; if (!painel) cria();
    aberto = true; const b = botao(); if (b) b.setAttribute('aria-expanded', 'true');
    ativo = Math.max(0, opcoes().findIndex(o => o.id === S.ui.vehicleId));
    painel.hidden = false; posiciona(); pinta();
    if (!quieto() && painel.animate) {
      painel.animate([{ opacity:0, transform:'scale(.92) translateY(-8px)' }, { opacity:1, transform:'none' }], { duration:420, easing:'cubic-bezier(.34,1.32,.5,1)' });
      painel.querySelectorAll('.sv-op').forEach((n, i) => n.animate([{ opacity:0, transform:'translateY(8px)' }, { opacity:1, transform:'none' }], { duration:380, easing:curva, delay:50 + i * 30, fill:'backwards' }));
    }
    marca(true);
  }
  function fecha(devolve = true) {
    if (!aberto) return; aberto = false;
    const b = botao(); if (b) b.setAttribute('aria-expanded', 'false');
    const fim = () => { if (!aberto) painel.hidden = true; };
    if (quieto() || !painel.animate) fim();
    else painel.animate([{ opacity:1, transform:'none' }, { opacity:0, transform:'scale(.96) translateY(-4px)' }], { duration:150, easing:'cubic-bezier(.4,0,.8,.5)' }).onfinish = fim;
    if (devolve && b) b.focus({ preventScroll:true });
  }
  function escolhe(id) { fecha(); if (id !== S.ui.vehicleId) S.trocarVeiculo(id); }

  document.addEventListener('click', e => {
    const b = e.target.closest('#side [data-sv]');
    if (b) { e.preventDefault(); if (aberto) fecha(); else abre(); return; }
    if (aberto && painel && !painel.contains(e.target)) fecha(false);
  });
  document.addEventListener('keydown', e => {
    // Alt + 1 a 9: direto para aquele veículo (a ordem é a da lista, então a mão aprende)
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code) && S.me && !S.carregando && !document.querySelector('dialog[open]')) {
      const v = veiculos()[+e.code.slice(5) - 1]; if (!v || !botao()) return;
      e.preventDefault(); if (aberto) fecha(false); if (v.id !== S.ui.vehicleId) S.trocarVeiculo(v.id);
      return;
    }
    if (aberto && e.key === 'Escape') { e.preventDefault(); fecha(); }
  });
  window.addEventListener('resize', () => { if (aberto) posiciona(); });
  window.addEventListener('scroll', () => { if (aberto) posiciona(); }, { passive:true });
  window.addEventListener('hashchange', () => { if (aberto) fecha(false); });
})();

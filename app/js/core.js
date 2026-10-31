// SONVI · núcleo: utilitários, consultas ao que já foi carregado e navegação.
// Cada módulo registra suas telas em S.views e suas ações em S.actions.
// S.db é só uma cópia em memória do que veio da nuvem; nada é gravado no navegador.
const S = window.SONVI = { views:{}, actions:{}, changes:[], ui:{ q:'', tab:'detalhes' }, db:{} };

// ---------- utilitários ----------
S.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
S.uid = () => Math.random().toString(36).slice(2, 9);
S.brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
S.num = s => { if (typeof s === 'number') return s; const n = parseFloat(String(s || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
S.nfmt = v => Number(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }) : '';
S.dfmt = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
S.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
S.dia = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
S.hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
S.opts = (list, sel) => list.map(o => `<option${o === sel ? ' selected' : ''}>${S.esc(o)}</option>`).join('');
S.datalist = (id, list) => `<datalist id="${id}">${list.map(o => `<option value="${S.esc(o)}">`).join('')}</datalist>`;

// ---------- perfis e status ----------
S.PERFIS = { diretor:'Diretor', gerente:'Gerente comercial', consultor:'Consultor', opec:'OPEC', financeiro:'Financeiro', programador:'Programador musical', locutor:'Locutor' };
// Qual aplicativo está aberto: o SONVI (comercial) ou o Sonvi Music (programação e estúdio), na pasta music/
S.APP = window.SONVI_APP === 'music' ? 'music' : 'sonvi';
S.MUSIC_PERFIS = ['diretor', 'gerente', 'programador', 'locutor', 'opec'];
S.pode = (...perfis) => perfis.includes(S.perfil);
// O consultor monta, a OPEC confere, a grade programa e o financeiro fatura.
S.STATUS = {
  rascunho:{ label:'Rascunho', tone:'gray' }, opec:{ label:'Na OPEC', tone:'sky' }, devolvido:{ label:'Devolvido', tone:'orange' },
  aprovado:{ label:'Aprovado', tone:'green' }, programado:{ label:'Programado', tone:'blue' }, faturado:{ label:'Faturado', tone:'ink-tone' }, cancelado:{ label:'Cancelado', tone:'gray' } };
// Cores das etapas nos gráficos (barras e legendas)
S.STATUS_COR = { rascunho:'#c9cfda', opec:'#0199ff', devolvido:'#e08a2e', aprovado:'#7fa6ff', programado:'#0055ff', faturado:'var(--ink)', cancelado:'#8c93a1' };
S.EDITABLE = ['rascunho', 'devolvido'];
S.pill = s => `<span class="pill${s === 'opec' ? ' live' : ''}" style="--tone:var(--${S.STATUS[s].tone})">${S.STATUS[s].label}</span>`;
S.tag = (text, tone) => `<span class="pill" style="--tone:var(--${tone})">${S.esc(text)}</span>`;

// ---------- marca e ícones ----------
// Logo azul no claro e branco no escuro
S.logo = (cls = '') => S.APP === 'music'
  ? `<picture><source srcset="img/sonvi-music-branco.png" media="(prefers-color-scheme: dark)"><img src="img/sonvi-music.png?v=2" width="1071" height="298" alt="Sonvi Music"${cls ? ` class="${cls}"` : ''}></picture>`
  : `<picture><source srcset="img/sonvi-branco.svg" media="(prefers-color-scheme: dark)"><img src="img/sonvi.svg" width="343" height="78" alt="SONVI"${cls ? ` class="${cls}"` : ''}></picture>`;
// Logo da empresa comercial quando ela ainda não tem logo próprio: o da Head 14 (primeiro cliente) ou o do SONVI
S.logoReserva = () => S.ctx && S.ctx.org && S.ctx.org.slug !== 'head14' ? 'img/sonvi.svg' : 'img/head14.png';
// Assinatura "Desenvolvido por Astravox" no rodapé das telas de entrada (pedido em 20/10/2026).
// fundo: 'escuro' (logo branco), 'claro' (logo preto) ou 'auto' (segue o tema claro/escuro). raiz: '' no app, '/' no Console.
S.credito = (fundo = 'auto', raiz = '', cls = '') => {
  const img = c => `${raiz}img/astravox-${c}.png`, alt = 'alt="Astravox" width="360" height="80"';
  const logo = fundo === 'escuro' ? `<img src="${img('branco')}" ${alt}>` : fundo === 'claro' ? `<img src="${img('preto')}" ${alt}>`
    : `<picture><source srcset="${img('branco')}" media="(prefers-color-scheme: dark)"><img src="${img('preto')}" ${alt}></picture>`;
  return `<p class="credito${cls ? ' ' + cls : ''}">Desenvolvido por ${logo}</p>`;
};
S.iniciais = nome => String(nome || '?').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
S.ICON = {
  combos:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v8M13 17h8"/>',
  geral:'<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/><path d="m2 18 10 5 10-5"/>',
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clientes:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  pis:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  propostas:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 15l2 2 4-4"/>',
  opec:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  financeiro:'<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  vendas:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  empresa:'<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 10h1M14 10h1M9 14h1M14 14h1M9 18h1M14 18h1"/>',
  veiculos:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M12 18v3"/>',
  agencias:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  cadastros:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>', produtos:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  programacao:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l5.5-5.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>', music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', hoje:'<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>', acervo:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M3 10h4M3 15h4"/><circle cx="14" cy="12" r="3"/>', relogios:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', categorias:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', regras:'<path d="M9 11l3 3 8-8"/><path d="M20 12v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h9"/>', paineis:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', comerciais:'<path d="M3 11l14-6v14L3 13z"/><path d="M7 13v5a2 2 0 0 0 4 0v-4"/>', relatorios:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', musical:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mais:'<path d="M12 5v14M5 12h14"/>', busca:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', relatorio:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', check:'<path d="M5 12l5 5L20 7"/>', bloqueio:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', voltar:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  baixar:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', seta:'<path d="M9 6l6 6-6 6"/>', esq:'<path d="M15 6l-6 6 6 6"/>', fechar:'<path d="M6 6l12 12M18 6 6 18"/>', baixo:'<path d="M6 9l6 6 6-6"/>', rota:'<path d="M3 11l19-9-9 19-2-8z"/>',
  followup:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>', fone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  recolher:'<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9.5 4v16M16 10l-2 2 2 2"/>', expandir:'<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9.5 4v16M14 10l2 2-2 2"/>',
  imagem:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>', email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', chave:'<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M17 6l3 3M15 8l2 2"/>', olho:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', editar:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', whats:'<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 .8-.3 1.6c-3.5.3-7-3.2-6.7-6.7L10.8 8.2l.8 2z"/>', lixo:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', copia:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>', abrir:'<path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>', mais3:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', chamados:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>', relogio:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/>', subir:'<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' };
S.svg = (k, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} aria-hidden="true">${S.ICON[k]}</svg>`;
// Selo da rádio: a sigla quando é curta (CBN), senão as iniciais do nome sem "Rádio" (Rádio Verde → VE)
S.selo = v => { const sg = String(v.sigla || '').trim(); if (sg && sg.length <= 3) return sg.toUpperCase();
  const ps = String(v.nome || '').replace(/\b(r[áa]dio|fm|am)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (ps.length > 1 ? ps[0][0] + ps[1][0] : (ps[0] || sg || '?').slice(0, 2)).toUpperCase(); };
// Selo da rádio: o logo dela, ou a sigla sobre a cor DELA (nunca a cor da rádio selecionada)
S.vav = v => { if (v && v.logo) return `<span class="vav img"><img src="${v.logo}" width="500" height="500" alt=""></span>`;
  const cor = v && /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor : S.COR_PADRAO, letra = contraste(cor, '#ffffff') >= 4.5 ? '#ffffff' : '#0a0b0d'; // sigla sempre legível
  return `<span class="vav" style="background:${cor};color:${letra}">${S.esc(S.selo(v || {}))}</span>`; };

// ---------- cor da rádio: personaliza o sistema todo ----------
S.COR_PADRAO = '#0055ff';
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const mistura = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
// Escurece (ou clareia) a cor só o necessário para o texto continuar legível
const ajusta = (c, fundo, min, para) => { let x = c; for (let i = 0; i < 30 && contraste(x, fundo) < min; i++) x = mistura(x, para, .08); return x; };
S.temaRadio = v => {
  const cor = v && /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor.toLowerCase() : S.COR_PADRAO;
  let st = document.getElementById('tema-radio');
  if (cor === S.COR_PADRAO) { if (st) st.remove(); return; }
  if (st && st.dataset.cor === cor) return;
  if (!st) { st = document.createElement('style'); st.id = 'tema-radio'; document.head.appendChild(st); }
  // Botões com texto branco pedem 4,5:1; o texto na cor da rádio é conferido sobre o fundo clarinho onde ele aparece (item marcado, avatar)
  const ac = ajusta(cor, '#ffffff', 4.5, '#000000'), soft = mistura(ac, '#ffffff', .9), softD = mistura('#121316', ac, .24);
  const tx = ajusta(cor, soft, 4.5, '#000000'), txd = ajusta(cor, softD, 4.5, '#ffffff'), [r, g, b] = rgb(ac);
  st.dataset.cor = cor;
  // As cores de status (azul, verde, laranja…) não mudam com a rádio
  st.textContent = `:root{--accent:${ac};--accent-hover:${mistura(ac, '#000000', .14)};--accent-2:${mistura(ac, '#ffffff', .3)};--accent-ink:#fff;--accent-soft:${soft};--accent-text:${tx};--bar-soft:${mistura(ac, '#ffffff', .78)}}
@media (prefers-color-scheme: dark){:root{--accent-hover:${mistura(ac, '#ffffff', .12)};--accent-soft:rgba(${r},${g},${b},.24);--accent-text:${txd};--bar-soft:${mistura(ac, '#121316', .65)}}}`;
};

// ---------- logo da rádio: quadrado 500 × 500, e as cores tiradas dele ----------
S.coresDoLogo = img => {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, cx = {};
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 160) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    const sat = dd ? dd / (1 - Math.abs(2 * l - 1)) : 0; if (sat < .28 || l > .9 || l < .1) continue;
    const h = dd ? (mx === r ? ((g - b) / dd + 6) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4) * 60 : 0, k = Math.round(h / 15) % 24;
    const cx_ = cx[k] || (cx[k] = { n:0, q:0, r:0, g:0, b:0 }); cx_.n += sat; cx_.q++; cx_.r += d[i]; cx_.g += d[i + 1]; cx_.b += d[i + 2]; }
  const cores = Object.values(cx).sort((a, b) => b.n - a.n).filter(c => c.n > 6).map(c => hex([c.r, c.g, c.b].map(v => v / c.q)));
  return cores;
};
S.lerLogo = arquivo => new Promise((ok, erro) => {
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(arquivo.type)) return erro(new Error('Use uma imagem PNG, JPG, WebP ou SVG.'));
  const url = URL.createObjectURL(arquivo), img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível abrir essa imagem.')); };
  img.onload = () => {
    const w = img.naturalWidth || 500, h = img.naturalHeight || 500, gerar = lado => { const c = document.createElement('canvas'); c.width = c.height = lado;
      const e = Math.min(lado / w, lado / h); c.getContext('2d').drawImage(img, (lado - w * e) / 2, (lado - h * e) / 2, w * e, h * e);
      let u = c.toDataURL('image/webp', .9); if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/png'); return u; };
    let logo = gerar(500); if (logo.length > 580000) logo = gerar(360);
    URL.revokeObjectURL(url); ok({ logo, cores:S.coresDoLogo(img), quadrado:Math.abs(w - h) <= Math.max(w, h) * .02, w, h });
  };
  img.src = url;
});
// Campo do formulário da rádio: prévia do logo, botões e as cores encontradas nele
// Categoria do veículo (24/10/2026, database/039): cada uma terá a sua grade no PI e na tabela de preços
S.CATEGORIAS = [['radio', 'Rádio'], ['led', 'Painel de LED'], ['outdoor', 'Outdoor'], ['frontlight', 'Front light'], ['empena', 'Empena'], ['dooh', 'Mídia DOOH']];
// Um veículo pode ter várias categorias (database/040): a empresa que fatura é uma só, as categorias dizem o que ela vende
S.categorias = v => v && Array.isArray(v.categorias) && v.categorias.length ? v.categorias : [(v && v.categoria) || 'radio'];
S.categoria = v => S.categorias(v)[0];
S.temCategoria = (v, k) => S.categorias(v).includes(k);
S.nomeCategoria = k => (S.CATEGORIAS.find(c => c[0] === k) || S.CATEGORIAS[0])[1];
// Linha de apoio do veículo: rádio = frequência e cidade; mídia OOH = categoria e praça
S.vehSub = v => (S.categorias(v).length === 1 && S.categoria(v) === 'radio' ? [v.frequencia, v.cidade] : [S.categorias(v).map(S.nomeCategoria).join(', '), v.cidade]).filter(Boolean).join(' · ');
S.campoLogo = (v, travado) => {
  const t = travado ? ' disabled data-trava="1"' : '', cor = v.cor || S.COR_PADRAO;
  return `<div class="logo-campo" style="grid-column:1/-1">
    <div class="logo-prev">${v.logo ? `<img src="${v.logo}" width="500" height="500" alt="Logo do veículo">` : `<span>${S.svg('imagem', 26)}</span>`}</div>
    <div class="logo-info"><b>Logo</b><small class="muted">Quadrado, 500 × 500 px (PNG, JPG ou WebP). Sai no PI e a cor dele personaliza o sistema.</small>
      <div class="row"><button type="button" class="btn sm" data-act="logoEscolher"${t}>${S.svg('baixar')}${v.logo ? 'Trocar logo' : 'Enviar logo'}</button>${v.logo ? `<button type="button" class="btn sm" data-act="logoRemover"${t}>Remover</button>` : ''}</div>
      <div class="cores" role="radiogroup" aria-label="Cor do veículo"><span class="muted small">Cor</span>${[...new Set([cor, ...(v._cores || [])])].slice(0, 6).map(c => `<button type="button" class="cor${c === cor ? ' on' : ''}" style="background:${c}" data-act="logoCor" data-cor="${c}" role="radio" aria-checked="${c === cor}" aria-label="Cor ${c}" title="${c}"${t}></button>`).join('')}</div>
      <small class="aviso" id="logoAviso"></small></div>
    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="logoArquivo" hidden>
    <input type="hidden" name="logo" value="${S.esc(v.logo || '')}"><input type="hidden" name="cor" value="${S.esc(cor)}"></div>`;
};
const logoRedesenha = v => { const el = document.querySelector('#dlg .logo-campo'); if (!el) return; el.outerHTML = S.campoLogo(v, false); };
const logoAtual = () => { const f = document.querySelector('#dlg form'); return { logo:f.logo.value, cor:f.cor.value, _cores:JSON.parse(f.dataset.cores || '[]') }; };
Object.assign(S.actions, {
  logoEscolher: () => document.getElementById('logoArquivo').click(),
  logoRemover: () => { const f = document.querySelector('#dlg form'); f.dataset.cores = '[]'; logoRedesenha({ logo:'', cor:S.COR_PADRAO }); },
  logoCor: d => { const v = logoAtual(); v.cor = d.cor; logoRedesenha(v); },
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'logoArquivo' || !e.target.files[0]) return;
  try { const r = await S.lerLogo(e.target.files[0]), f = document.querySelector('#dlg form');
    const cores = r.cores.length ? r.cores : [S.COR_PADRAO, '#0a0b0d']; f.dataset.cores = JSON.stringify(cores);
    logoRedesenha({ logo:r.logo, cor:cores[0], _cores:cores });
    if (!r.quadrado) document.getElementById('logoAviso').textContent = `A imagem tem ${r.w} × ${r.h} px; ela foi centralizada num quadrado. O ideal é 500 × 500 px.`;
  } catch (err) { const a = document.getElementById('logoAviso'); if (a) a.textContent = err.message; }
});

// ---------- consultas ao que está carregado ----------
S.veh = id => S.db.veiculos.find(v => v.id === (id || S.ui.vehicleId));
S.pessoa = id => S.db.pessoas.find(p => p.id === id);
S.nome = id => (S.pessoa(id) || {}).nome || '';
S.usuario = id => (S.db.usuarios.find(u => u.id === id) || {}).nome || ((S.db.suporteIds || []).includes(id) ? 'Suporte SONVI' : '');
S.pessoas = tipo => S.db.pessoas.filter(p => p.tipo === tipo).sort((a, b) => a.nome.localeCompare(b.nome));
S.piNo = pi => `PI ${S.veh(pi.veiculo_id).sigla} ${String(pi.numero).padStart(4, '0')}`;
// Consultores do veículo atual (para escolher o responsável por um cliente ou compromisso)
// Quem pode ser o responsável por um cliente na rádio: consultores e gerentes (o gerente que também vende)
S.responsaveis = (veiculo = S.ui.vehicleId) => S.db.vinculos.filter(v => v.veiculo_id === veiculo && (v.perfil === 'consultor' || v.perfil === 'gerente'))
  .sort((a, b) => (a.perfil === 'consultor' ? 0 : 1) - (b.perfil === 'consultor' ? 0 : 1))
  .map(v => { const u = S.db.usuarios.find(x => x.id === v.usuario_id); return u && u.ativo !== false ? { id:u.id, nome:(u.nome || u.email) + (v.perfil === 'gerente' ? ' (gerente)' : '') } : null; }).filter(Boolean);
S.consultores = () => S.db.vinculos.filter(v => v.veiculo_id === S.ui.vehicleId && v.perfil === 'consultor').map(v => S.db.usuarios.find(u => u.id === v.usuario_id)).filter(Boolean);

// ---------- navegação ----------
S.route = () => { const [view, id] = location.hash.replace(/^#\/?/, '').split('/'); return { view: S.views[view] ? view : 'dashboard', id }; };
S.go = path => { if (location.hash === '#' + path) S.render(); else location.hash = path; };

// ---------- diálogo, formulário e aviso ----------
// Janela por cima da tela. Ao abrir: título ligado à janela (leitores de tela) e cursor no primeiro campo.
// Ao fechar: o foco volta para o botão que abriu (ou o equivalente, se a tela foi redesenhada).
S.dialog = (html, onOk, opts = {}) => {
  const d = document.getElementById('dlg'), origem = document.activeElement;
  const alvo = origem && origem.dataset && (origem.dataset.act || origem.dataset.go) ? ['act', 'id', 'go'].filter(k => origem.dataset[k]).map(k => `[data-${k}="${CSS.escape(origem.dataset[k])}"]`).join('') : '';
  d.innerHTML = `<form method="dialog">${html}</form>`;
  const h = d.querySelector('h2'); if (h) { h.id = 'dlgTitulo'; d.setAttribute('aria-labelledby', 'dlgTitulo'); } else d.removeAttribute('aria-labelledby');
  delete d.dataset.guarda; delete d.dataset.sujo;
  // Ao fechar com "ok", entrega o que foi digitado; um erro aqui aparece na tela em vez de sumir calado
  d.onclose = () => { if (d.returnValue !== 'ok' || !onOk) return;
    try { onOk(Object.fromEntries(new FormData(d.querySelector('form')))); } catch (e) { console.error(e); S.toast(S.erro ? S.erro(e) : String(e.message || e)); } };
  // Envio do formulário feito por nós (e não pelo navegador): confere os campos, mostra o problema embaixo do campo
  // e fecha a janela com o valor do botão. Evita o Safari travar o "Salvar" sem aviso (campo escondido inválido,
  // ou o envio "method=dialog" que não fecha a janela).
  const form = d.querySelector('form'); form.noValidate = true;
  form.addEventListener('submit', e => {
    const v = e.submitter ? e.submitter.value : 'ok';
    if (!v || v === 'cancel') return; // Fechar/Cancelar seguem o caminho de sempre (com a pergunta de descartar)
    e.preventDefault();
    if (v === 'ok') {
      const ruim = [...form.elements].find(el => el.willValidate && !el.disabled && !el.checkValidity());
      if (ruim) { const visivel = !!(ruim.offsetWidth || ruim.offsetHeight || ruim.getClientRects().length);
        const nome = ((ruim.closest('label') || {}).textContent || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
        if (visivel) { if (ruim.parentElement.querySelector(':scope > .aviso, :scope > .erro-campo')) ruim.focus(); else S.erroNoCampo(ruim, ruim.validationMessage || 'Preencha este campo.'); } else S.toast(`Confira o campo ${nome || 'obrigatório'}: ${ruim.validationMessage || 'está vazio'}`);
        return; }
    }
    delete d.dataset.sujo; d.close(v);
  });
  d._volta = { origem, alvo };
  d._edBase = null; delete d.dataset.edExtra;
  if (opts.consulta) S.travarForm(form);
  S.mascarar(d); d.showModal(); S.focarPrimeiro(d);
};
// ---------- consulta → Editar → Descartar / Salvar (padrão de todas as janelas de cadastro) ----------
// Rodapé das duas fases: na consulta, Fechar + Editar; editando, "N alterações não salvas" + Descartar + Salvar.
S.rodapeEdicao = (ok = 'Salvar', cancelar = 'Descartar') => `<div class="row so-ver"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Fechar</button><button type="button" class="btn pri" data-act="formEditar">${S.svg('editar')}Editar</button></div>
    <div class="row so-editar"><span class="ed-pend" aria-live="polite"></span><span class="grow"></span><button class="btn" value="cancel" formnovalidate>${cancelar}</button><button class="btn pri" value="ok">${ok}</button></div>`;
// Trava a janela para consulta: campos desabilitados (marcados para voltar), botões de edição escondidos (.so-ed, por CSS)
S.travarForm = form => { form.classList.add('ver');
  form.querySelectorAll('input, select, textarea').forEach(el => { if (!el.disabled && el.type !== 'hidden') { el.disabled = true; el.dataset.trava = '1'; } }); };
// Conta o que mudou desde o começo da edição: um campo, ou uma linha inteira (campos terminados em _<n>), conta como uma alteração
const edFoto = form => { const m = new Map(); for (const [k, v] of new FormData(form)) { if (/^(ex_conf)$/.test(k)) continue; const g = (/_(\d+)$/.exec(k) || [])[1]; const ch = g ? 'linha:' + g : k; m.set(ch, (m.get(ch) || '') + '\u0001' + k + '=' + (v instanceof File ? v.name : v)); } return m; };
S.edicaoInicio = d => { const form = d.querySelector('form'); if (!form || form.classList.contains('ver') || !form.querySelector('.ed-pend')) return; d._edBase = edFoto(form); S.edicaoConta(d); };
S.edicaoConta = d => { const form = d && d.querySelector('form'), el = form && form.querySelector('.ed-pend'); if (!el || !d._edBase || form.classList.contains('ver')) return;
  const agora = edFoto(form), chaves = new Set([...d._edBase.keys(), ...agora.keys()]); let n = 0; chaves.forEach(k => { if (d._edBase.get(k) !== agora.get(k)) n++; });
  n += Number(d.dataset.edExtra || 0);
  el.textContent = n ? `${n} ${n === 1 ? 'alteração não salva' : 'alterações não salvas'}` : ''; el.classList.toggle('on', !!n); };
(() => { const d = document.getElementById('dlg'); if (!d) return; let t;
  const conta = () => { clearTimeout(t); t = setTimeout(() => S.edicaoConta(d), 60); };
  d.addEventListener('input', conta); d.addEventListener('change', conta); d.addEventListener('sonvi:mudou', conta);
  new MutationObserver(conta).observe(d, { childList:true, subtree:true }); })();
S.focarPrimeiro = d => { const c = d.querySelector('form:not(.ver) :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea):not([disabled])') || d.querySelector('.so-ver .btn.pri, button.pri, button:not([disabled])'); if (c) c.focus(); };
(() => {
  const d = document.getElementById('dlg'); if (!d) return;
  const voltar = () => { const v = d._volta; if (!v) return; d._volta = null;
    const tenta = () => { if (d.open || (document.getElementById('dlgConf') || {}).open) return true; if (document.activeElement && document.activeElement !== document.body) return true;
      const el = v.origem && document.contains(v.origem) ? v.origem : (v.alvo && document.querySelector(v.alvo)); if (el) { el.focus(); return true; } return false; };
    setTimeout(() => { if (!tenta()) setTimeout(tenta, 600); }, 60); };
  d._voltar = voltar;
  d.addEventListener('close', () => { if (!document.getElementById('dlgConf') || !document.getElementById('dlgConf').open) voltar(); });
  // Formulário com algo digitado: Esc ou "Cancelar" perguntam antes de jogar fora
  const marcar = e => { if (d.dataset.guarda && d.contains(e.target) && !e.target.closest('.dlg-aviso')) d.dataset.sujo = '1'; };
  d.addEventListener('input', marcar); d.addEventListener('change', marcar);
  const avisar = () => {
    if (d.querySelector('.dlg-aviso')) return;
    const f = d.querySelector('form'), a = document.createElement('div'); a.className = 'dlg-aviso'; a.setAttribute('role', 'alert');
    a.innerHTML = '<b>Descartar o que você digitou?</b><span>As alterações deste formulário ainda não foram salvas.</span><div class="row"><button type="button" class="btn" data-dlg="seguir">Continuar editando</button><button type="button" class="btn perigo" data-dlg="descartar">Descartar</button></div>';
    f.appendChild(a); a.querySelector('[data-dlg="seguir"]').focus();
  };
  d.addEventListener('cancel', e => { if (d.dataset.sujo) { e.preventDefault(); avisar(); } });
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dlg === 'seguir') { b.closest('.dlg-aviso').remove(); S.focarPrimeiro(d); return; }
    if (b.dataset.dlg === 'descartar') { delete d.dataset.sujo; d.close('cancel'); return; }
    if (b.value === 'cancel' && d.dataset.sujo) { e.preventDefault(); avisar(); }
  });
})();

// Erro embaixo do campo (ou do bloco) no formulário aberto: marca, explica e põe o cursor lá. Some quando a pessoa corrige.
S.erroNoCampo = (alvo, msg) => {
  const d = document.getElementById('dlg'), el = typeof alvo === 'string' ? d.querySelector(`[name="${alvo}"]`) || d.querySelector(alvo) : alvo; if (!el) return S.toast(msg);
  const id = 'erro-' + Math.random().toString(36).slice(2, 8);
  el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id);
  el.insertAdjacentHTML(el.matches('input, select, textarea') ? 'afterend' : 'beforeend', `<small class="erro-campo" id="${id}" role="alert">${S.esc(msg)}</small>`);
  const foco = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea'); if (foco) foco.focus();
  const limpa = () => { el.removeAttribute('aria-invalid'); const e = document.getElementById(id); if (e) e.remove(); };
  el.addEventListener('input', limpa, { once:true }); el.addEventListener('change', limpa, { once:true });
};

// Confirmação com a cara do sistema (no lugar da caixa do navegador). Devolve true/false.
// O texto até o primeiro "?" vira o título; "\n\n" separa parágrafos.
S.confirmar = (texto, { ok = 'Confirmar', voltar = 'Voltar', perigo = false } = {}) => new Promise(fim => {
  let c = document.getElementById('dlgConf');
  if (!c) { c = document.createElement('dialog'); c.id = 'dlgConf'; c.className = 'conf'; c.setAttribute('role', 'alertdialog'); c.setAttribute('aria-labelledby', 'confTitulo'); c.setAttribute('aria-describedby', 'confTexto'); document.body.appendChild(c); }
  const partes = String(texto).split('\n\n'), p0 = partes[0], q = p0.indexOf('? ');
  const titulo = q > 0 ? p0.slice(0, q + 1) : p0, resto = [q > 0 ? p0.slice(q + 2) : '', ...partes.slice(1)].filter(Boolean);
  c.innerHTML = `<form method="dialog"><h2 id="confTitulo">${S.esc(titulo)}</h2><div id="confTexto">${resto.map(t => `<p class="muted">${S.esc(t)}</p>`).join('')}</div>
    <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="nao">${S.esc(voltar)}</button><button class="btn ${perigo ? 'perigo' : 'pri'}" value="sim">${S.esc(ok)}</button></div></form>`;
  const origem = document.activeElement, dlg = document.getElementById('dlg');
  c.returnValue = '';
  c.onclose = () => { fim(c.returnValue === 'sim'); if (dlg && dlg.open) return; setTimeout(() => { if (origem && origem !== document.body && document.contains(origem)) origem.focus(); else if (dlg && dlg._voltar) dlg._voltar(); }, 60); };
  c.showModal(); c.querySelector('button[value="nao"]').focus();
});
// Excluir com tudo (diretor, por conta e risco dele; database/048 e 050): mostra o que vai junto e só libera depois de digitar
// o nome ou número. confere(texto) diz se o digitado vale; onOk recebe os campos da janela (inclui as marcações de `extra`).
S.excluirDigitando = ({ titulo, itens = [], aviso, rotulo, dica, confere, botao = 'Excluir com tudo', extra = '', onOk }) => {
  S.dialog(`<h2>${titulo}</h2>
    ${itens.length ? `<p>Vai junto:</p><ul class="lista-ex">${itens.map(t => `<li>${S.esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="note aviso" style="margin:0">${aviso || 'Isso some do SONVI agora. Fica 30 dias na Lixeira (Administração › Lixeira), onde o diretor pode restaurar; depois é apagado de vez.'}</p>${extra}
    <label class="f">${rotulo}<input name="ex_conf" autocomplete="off" required placeholder="${S.esc(dica || '')}"></label>
    <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn danger" value="ok">${botao}</button></div>`, onOk);
  const campo = document.querySelector('#dlg [name="ex_conf"]'), v = () => campo.setCustomValidity(confere(campo.value) ? '' : `Digite ${rotulo.replace(/^Para confirmar, digite /, '')}${dica ? ': ' + dica : ''}`);
  v(); campo.addEventListener('input', v); };
// Formulário genérico: campos = [{ k, label, type, options, req, full }]
// Cadastro já existente abre só para consulta, com o botão "Editar"; um novo já abre editável.
S.form = (title, fields, v, onOk, ok = 'Salvar', opts = {}) => {
  const ver = !!v.id && !opts.editar, trava = ver ? ' disabled data-trava="1"' : '';
  const inp = f => { const val = v[f.k] ?? '', m = f.mask || S.CAMPO_MASCARA[f.k], ph = f.ph || S.CAMPO_EXEMPLO[f.k] || (m && S.MASK[m].ph) || '';
    const a = `name="${f.k}"${f.req ? ' required' : ''}${trava}${m ? ` data-mask="${m}" inputmode="${S.MASK[m].modo}" autocomplete="off"` : ''}${ph && !['select', 'checkbox', 'color', 'date', 'datetime-local'].includes(f.type) ? ` placeholder="${S.esc(ph)}"` : ''}`;
    if (f.type === 'select') return `<select ${a}>${f.options.map(([k, n]) => `<option value="${S.esc(k)}"${String(k) === String(val) ? ' selected' : ''}>${S.esc(n)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea ${a}>${S.esc(val)}</textarea>`;
    if (f.type === 'checkbox') return `<input type="checkbox" ${a}${val ? ' checked' : ''}>`;
    return `<input type="${f.type || 'text'}" ${a} value="${S.esc(val)}"${f.id ? ` id="${f.id}"` : ''}>`; };
  const row = f => f.html || `<label class="f${f.type === 'checkbox' ? ' chk' : ''}"${f.full || f.type === 'textarea' ? ' style="grid-column:1/-1"' : ''}>${f.type === 'checkbox' ? inp(f) + S.esc(f.label) : S.esc(f.label) + inp(f)}</label>`;
  S.dialog(`<h2>${title}</h2><div class="g2">${fields.map(row).join('')}</div>
    ${S.rodapeEdicao(ok, v.id ? 'Descartar' : 'Cancelar')}`, onOk);
  if (ver) document.querySelector('#dlg form').classList.add('ver');
  else if (v.id) { S.marcaEditando(document.getElementById('dlg')); S.edicaoInicio(document.getElementById('dlg')); }
  document.getElementById('dlg').dataset.guarda = '1'; // formulário: pergunta antes de descartar o que foi digitado
};
// Menu de opções (os "três pontinhos"): abre junto do botão e fecha ao clicar fora ou apertar Esc.
// itens = [{ label, icon, act, data:{…}, perigo }] — cada item dispara a ação S.actions[act] com data.
S.menu = (botao, itens) => {
  S.fecharMenu();
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = itens.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}" class="${it.perigo ? 'perigo' : ''}">${it.icon ? S.svg(it.icon) : ''}${S.esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = botao.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  m.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = itens[+b.dataset.i]; S.fecharMenu(); if (document.contains(botao)) botao.focus(); S.actions[it.act](it.data || {}, botao); });
  S._menu = m; const f = m.querySelector('button'); if (f) f.focus();
};
S.fecharMenu = () => { if (S._menu) { S._menu.remove(); S._menu = null; } };
document.addEventListener('mousedown', e => { if (S._menu && !S._menu.contains(e.target)) S.fecharMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') S.fecharMenu(); });
window.addEventListener('scroll', () => S.fecharMenu(), true);

// Libera os campos do cadastro aberto para edição
S.actions.formEditar = () => {
  const d = document.getElementById('dlg'), f = d.querySelector('form'); f.classList.remove('ver');
  f.querySelectorAll('[data-trava]').forEach(el => { el.disabled = false; el.removeAttribute('data-trava'); });
  S.marcaEditando(d); S.edicaoInicio(d); d.dataset.guarda = '1';
  const p = f.querySelector('input:not([type=checkbox]):not([type=hidden]):not([type=radio]):not([disabled]), select:not([disabled]), textarea:not([disabled])'); if (p) p.focus();
};
// Etiqueta "Editando" ao lado do título da janela
S.marcaEditando = d => { const h = d && d.querySelector('h2'); if (!h || h.querySelector('.ed-tag')) return; h.insertAdjacentHTML('beforeend', ' <span class="ed-tag">Editando</span>'); };

// ---------- lista editável (Durações e variações e outras listas curtas de cadastro) ----------
// Abre para consulta (tabela com nome, etiquetas, uso e situação); "Editar" troca cada linha por campos: alça para arrastar
// (ou ↑ no celular / Alt+↑↓ no teclado), texto, botões de escolha, chave liga/desliga e lixeira (só para o que não é usado).
// Linhas novas e alteradas ganham etiqueta; o rodapé conta as alterações; nada vai para a nuvem até Salvar.
// cfg = { titulo, sub, subEdit, nomeItem:['variação','variações'], itens:[{ id, ... }], campos:[{ k, tipo:'texto'|'opcoes'|'chave', rot, ph, req, ops:[[v, texto, tom]] }],
//         uso:item => n, usoTxt:n => '3 produtos', novo:() => item, aviso, pode, resumo:itens => texto, salvar:async ({ novos, alterados, excluidos, ordem }) }
S.listaEditavel = cfg => {
  const C = cfg.campos, kNome = (C.find(c => c.tipo === 'texto') || {}).k, nomes = cfg.nomeItem || ['item', 'itens'];
  const copia = x => JSON.parse(JSON.stringify(x));
  let linhas, excluidos, edit = false, seq = 0;
  const comecar = () => { linhas = cfg.itens.map(x => ({ _k:'k' + (seq++), _orig:copia(x), ...copia(x) })); excluidos = []; };
  comecar();
  const igual = l => !l._orig || C.every(c => String(l[c.k] ?? '') === String(l._orig[c.k] ?? ''));
  const ordemMudou = () => { const ids = linhas.filter(l => l._orig).map(l => l.id), orig = cfg.itens.map(x => x.id).filter(id => ids.includes(id)); return ids.join() !== orig.join(); };
  const pendentes = () => linhas.filter(l => !l._orig).length + linhas.filter(l => l._orig && !igual(l)).length + excluidos.length + (ordemMudou() ? 1 : 0);
  const uso = l => l._orig && cfg.uso ? cfg.uso(l._orig) : 0;
  const tom = (c, v) => ((c.ops || []).find(o => o[0] === v) || [])[2] || '';
  const txtOp = (c, v) => ((c.ops || []).find(o => o[0] === v) || [])[1] || v;
  const pillOp = (c, v) => `<span class="pill le-op${tom(c, v) ? ' le-' + tom(c, v) : ''}">${S.esc(txtOp(c, v))}</span>`;
  const consulta = () => {
    const cab = C.map(c => `<span>${S.esc(c.tipo === 'chave' ? 'Situação' : c.rot)}</span>`).join('') + (cfg.uso ? '<span>Usada em</span>' : '');
    const lin = l => `<div class="le-lin">${C.map(c => c.tipo === 'texto' ? `<b class="le-nome">${S.esc(l[c.k])}</b>` : c.tipo === 'opcoes' ? `<span>${pillOp(c, l[c.k])}</span>`
        : `<span class="le-sit${l[c.k] === false ? '' : ' on'}"><i aria-hidden="true"></i>${l[c.k] === false ? 'Inativa' : 'Ativa'}</span>`).join('')}${cfg.uso ? `<span class="muted le-uso">${S.esc(uso(l) ? cfg.usoTxt(uso(l)) : 'não usada')}</span>` : ''}</div>`;
    return `<div class="le-tab le-consulta" style="--le-cols:${C.map(c => c.tipo === 'texto' ? 'minmax(0, 1fr)' : c.tipo === 'opcoes' ? '150px' : '110px').join(' ')}${cfg.uso ? ' 150px' : ''}">
      <div class="le-cab">${cab}</div>${linhas.length ? linhas.map(lin).join('') : `<div class="le-vazio muted">Nenhum${nomes[0].endsWith('a') ? 'a' : ''} ${nomes[0]} ainda.</div>`}</div>`; };
  const editor = () => {
    const linha = (l, i) => { const tag = !l._orig ? '<span class="le-tag nova">Nova</span>' : !igual(l) ? '<span class="le-tag alt">Alterada</span>' : '';
      const usada = uso(l) > 0;
      return `<div class="le-lin${!l._orig ? ' nova' : !igual(l) ? ' alt' : ''}" data-le="${l._k}">
        ${S.celular ? `<button type="button" class="le-sobe" data-le-acao="sobe" aria-label="Subir ${S.esc(l[kNome] || '')}"${i ? '' : ' disabled'}>${S.svg('seta')}</button>` : `<button type="button" class="le-alca" data-le-acao="alca" aria-label="Mover ${S.esc(l[kNome] || '')} (Alt + setas)" title="Arraste para mudar a ordem"><svg viewBox="0 0 14 18" aria-hidden="true"><circle cx="4" cy="3" r="1.6"/><circle cx="10" cy="3" r="1.6"/><circle cx="4" cy="9" r="1.6"/><circle cx="10" cy="9" r="1.6"/><circle cx="4" cy="15" r="1.6"/><circle cx="10" cy="15" r="1.6"/></svg></button>`}
        ${C.map(c => c.tipo === 'texto' ? `<span class="le-campo"><input data-le-k="${c.k}" value="${S.esc(l[c.k] ?? '')}" placeholder="${S.esc(c.ph || '')}" aria-label="${S.esc(c.rot)}" autocomplete="off">${tag}</span>`
          : c.tipo === 'opcoes' ? `<span class="le-seg" role="group" aria-label="${S.esc(c.rot)}">${c.ops.map(([v, t, tm]) => `<button type="button" data-le-k="${c.k}" data-le-v="${S.esc(v)}" aria-pressed="${l[c.k] === v}" class="${l[c.k] === v ? 'on' : ''}${tm ? ' le-' + tm : ''}">${S.esc(t)}</button>`).join('')}</span>`
          : `<span class="le-chave"><button type="button" role="switch" data-le-k="${c.k}" aria-checked="${l[c.k] !== false}" aria-label="${S.esc(c.rot)}"><i aria-hidden="true"></i></button><small>${l[c.k] !== false ? 'Sim' : 'Não'}</small></span>`).join('')}
        <button type="button" class="le-lixo" data-le-acao="tira" aria-label="Excluir ${S.esc(l[kNome] || '')}"${usada ? ` disabled title="Usada em ${S.esc(cfg.usoTxt(uso(l)))}: desative em vez de excluir"` : ''}>${S.svg('lixo')}</button></div>`; };
    return `<div class="le-tab le-editor" style="--le-cols:${C.map(c => c.tipo === 'texto' ? 'minmax(0, 1fr)' : c.tipo === 'opcoes' ? '236px' : '96px').join(' ')}">
      <div class="le-cab"><span></span>${C.map(c => `<span>${S.esc(c.rot)}</span>`).join('')}<span></span></div>
      <div class="le-linhas">${linhas.map(linha).join('')}</div></div>
      <button type="button" class="btn sm le-mais" data-le-acao="mais">${S.svg('mais')}${cfg.maisRot || `Nov${/(a|ção)$/.test(nomes[0]) ? 'a' : 'o'} ${nomes[0]}`}</button>
      ${cfg.aviso ? `<p class="note info le-aviso">${cfg.aviso}</p>` : ''}`; };
  const rodape = () => edit
    ? `<span class="ed-pend${pendentes() ? ' on' : ''}" aria-live="polite">${pendentes() ? `${pendentes()} ${pendentes() === 1 ? 'alteração não salva' : 'alterações não salvas'}` : ''}</span><span class="grow"></span><button type="button" class="btn" data-le-acao="descartar">Descartar</button><button type="button" class="btn pri" data-le-acao="salvar">Salvar</button>`
    : `<span class="muted small">${S.esc(cfg.resumo ? cfg.resumo(linhas) : `${linhas.length} ${linhas.length === 1 ? nomes[0] : nomes[1]}`)}</span><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Fechar</button>`;
  const cabeca = () => `<div class="le-topo"><div class="grow"><h2>${S.esc(cfg.titulo)}${edit ? ' <span class="ed-tag">Editando</span>' : ''}</h2><p class="muted small">${edit ? (cfg.subEdit || cfg.sub || '') : (cfg.sub || '')}</p></div>
    ${!edit && cfg.pode !== false ? `<button type="button" class="btn" data-le-acao="editar">${S.svg('editar')}Editar</button>` : ''}</div>`;
  S.dialog(`<div id="leCab"></div><div id="leCorpo" class="le"></div><div class="row le-rodape" id="leRod"></div>`);
  const d = document.getElementById('dlg'), form = d.querySelector('form');
  d.classList.add('medio'); const antes = d.onclose; d.onclose = e => { d.classList.remove('medio'); if (antes) antes(e); };
  const desenha = foco => { form.querySelector('#leCab').innerHTML = cabeca(); form.querySelector('#leCorpo').innerHTML = edit ? editor() : consulta(); rodar();
    const h = form.querySelector('h2'); if (h) { h.id = 'dlgTitulo'; d.setAttribute('aria-labelledby', 'dlgTitulo'); }
    if (foco) { const el = form.querySelector(foco); if (el) el.focus(); } };
  const rodar = () => { form.querySelector('#leRod').innerHTML = rodape(); if (edit) d.dataset.sujo = pendentes() ? '1' : ''; if (!pendentes()) delete d.dataset.sujo; };
  const daLinha = el => { const r = el.closest('[data-le]'); return r && linhas.find(l => l._k === r.dataset.le); };
  const marcaLinha = l => { const r = form.querySelector(`[data-le="${l._k}"]`); if (!r) return; const alt = l._orig && !igual(l);
    r.classList.toggle('alt', !!alt); const c = r.querySelector('.le-campo'), t = c && c.querySelector('.le-tag');
    if (l._orig) { if (alt && !t) c.insertAdjacentHTML('beforeend', '<span class="le-tag alt">Alterada</span>'); if (!alt && t) t.remove(); } };
  const mover = (l, para) => { const i = linhas.indexOf(l); if (para < 0 || para >= linhas.length || para === i) return; linhas.splice(i, 1); linhas.splice(para, 0, l); };
  form.addEventListener('input', e => { const k = e.target.dataset.leK; if (!k) return; const l = daLinha(e.target); if (!l) return; l[k] = e.target.value; marcaLinha(l); rodar(); });
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.leK) { e.preventDefault(); return; }
    const a = e.target.closest && e.target.closest('[data-le-acao="alca"]'); if (!a || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); const l = daLinha(a); mover(l, linhas.indexOf(l) + (e.key === 'ArrowUp' ? -1 : 1)); desenha(`[data-le="${l._k}"] [data-le-acao="alca"]`); });
  form.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !form.contains(b)) return;
    const k = b.dataset.leK, acao = b.dataset.leAcao;
    if (k) { const l = daLinha(b); if (!l) return; const c = C.find(x => x.k === k); l[k] = c.tipo === 'chave' ? l[k] === false : b.dataset.leV; desenha(`[data-le="${l._k}"] [data-le-k="${k}"]${c.tipo === 'opcoes' ? `[data-le-v="${CSS.escape(b.dataset.leV)}"]` : ''}`); return; }
    if (!acao) return;
    if (acao === 'editar') { edit = true; d.dataset.guarda = '1'; desenha('[data-le-k]'); return; }
    if (acao === 'mais') { const n = Object.assign({ _k:'k' + (seq++) }, cfg.novo ? cfg.novo() : {}); linhas.push(n); desenha(`[data-le="${n._k}"] input`); return; }
    if (acao === 'sobe') { const l = daLinha(b); mover(l, linhas.indexOf(l) - 1); desenha(`[data-le="${l._k}"] [data-le-acao="sobe"]`); return; }
    if (acao === 'tira') { const l = daLinha(b); if (!l || uso(l) > 0) return; linhas.splice(linhas.indexOf(l), 1); if (l._orig) excluidos.push(l._orig); desenha('.le-mais'); return; }
    if (acao === 'descartar') { if (pendentes() && !(await S.confirmar('Descartar as alterações? O que você mudou nesta lista não foi salvo.', { ok:'Descartar', voltar:'Continuar editando', perigo:true }))) return;
      edit = false; comecar(); delete d.dataset.sujo; delete d.dataset.guarda; desenha('[data-le-acao="editar"]'); return; }
    if (acao === 'salvar') {
      const vaz = linhas.find(l => !String(l[kNome] || '').trim()); if (vaz) { const el = form.querySelector(`[data-le="${vaz._k}"] input`); return S.erroNoCampo(el, 'Escreva o nome ou tire a linha.'); }
      const vistos = new Set(), rep = linhas.find(l => { const n = String(l[kNome]).trim().toLowerCase(); if (vistos.has(n)) return true; vistos.add(n); return false; });
      if (rep) { const el = form.querySelector(`[data-le="${rep._k}"] input`); return S.erroNoCampo(el, 'Já existe outra com esse nome.'); }
      if (!pendentes()) { edit = false; desenha(); return; }
      const limpa = l => { const o = {}; C.forEach(c => { o[c.k] = c.tipo === 'texto' ? String(l[c.k] || '').trim() : l[c.k]; }); if (l.id) o.id = l.id; return o; };
      const dif = { novos:linhas.filter(l => !l._orig).map(limpa), alterados:linhas.filter(l => l._orig && !igual(l)).map(limpa), excluidos:excluidos.map(x => x.id), ordem:linhas.map(l => (l._orig ? { id:l.id } : { novo:limpa(l) })) };
      b.disabled = true; b.textContent = 'Salvando…';
      const n = pendentes();
      const r = await S.run(async () => { await cfg.salvar(dif); delete d.dataset.sujo; delete d.dataset.guarda; d.close('salvo'); }, { titulo:cfg.okTitulo || `${cfg.titulo}: salvo`, sub:`${n} ${n === 1 ? 'alteração' : 'alterações'}` });
      if (r === null && d.open) { b.disabled = false; b.textContent = 'Salvar'; } return; }
  });
  // Arrastar pela alça: a linha acompanha o ponteiro e as outras abrem espaço
  form.addEventListener('pointerdown', e => { const a = e.target.closest('[data-le-acao="alca"]'); if (!a || e.button) return; e.preventDefault();
    const box = form.querySelector('.le-linhas'), row = a.closest('.le-lin'), l = daLinha(a); if (!box || !row) return;
    row.classList.add('arrasta'); a.setPointerCapture(e.pointerId);
    const move = ev => { const rs = [...box.children].filter(x => x !== row); const alvo = rs.find(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (alvo) box.insertBefore(row, alvo); else box.appendChild(row); };
    const fim = () => { a.removeEventListener('pointermove', move); a.removeEventListener('pointerup', fim); a.removeEventListener('pointercancel', fim); row.classList.remove('arrasta');
      const ks = [...box.children].map(x => x.dataset.le); linhas.sort((x, y) => ks.indexOf(x._k) - ks.indexOf(y._k)); desenha(`[data-le="${l._k}"] [data-le-acao="alca"]`); };
    a.addEventListener('pointermove', move); a.addEventListener('pointerup', fim); a.addEventListener('pointercancel', fim); });
  desenha();
  if (cfg.editar) { edit = true; d.dataset.guarda = '1'; desenha('[data-le-k]'); }
};
// ---------- máscaras dos campos ----------
// Cada campo com data-mask é formatado enquanto a pessoa digita e mostra o exemplo em cinza (placeholder).
// CPF e CNPJ têm os dígitos verificadores conferidos: um número errado impede salvar o formulário.
(() => {
  const so = s => String(s || '').replace(/\D/g, '');
  const enc = (d, padrao) => { let out = '', i = 0; for (const c of padrao) { if (i >= d.length) break; if (c === '0') out += d[i++]; else out += c; } return out; };
  const cpfOk = d => { if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false; const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = s * 10 % 11 % 10; return r === +d[n]; }; return dv(9) && dv(10); };
  const cnpjOk = d => { if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false; const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((t, x, i) => t + x * d[i], 0) % 11; return (s < 2 ? 0 : 11 - s) === +d[n]; }; return dv(12) && dv(13); };
  const cpf = d => enc(d.slice(0, 11), '000.000.000-00'), cnpj = d => enc(d.slice(0, 14), '00.000.000/0000-00');
  // Decimal brasileiro: 1.234,56 (milhar com ponto, centavos com vírgula)
  const dec = v => { let [i, c] = String(v || '').replace(/[^\d,]/g, '').split(','); i = (i || '').replace(/^0+(?=\d)/, ''); const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return c === undefined ? ii : (ii || '0') + ',' + c.replace(/,/g, '').slice(0, 2); };
  S.MASK = {
    doc:{ ph:'00.000.000/0000-00', modo:'numeric', f:v => { const d = so(v); return d.length <= 11 ? cpf(d) : cnpj(d); },
      erro:v => { const d = so(v); if (!d) return ''; if (d.length !== 11 && d.length !== 14) return 'Complete o CNPJ (14 números) ou o CPF (11 números).'; return (d.length === 11 ? cpfOk(d) : cnpjOk(d)) ? '' : `${d.length === 11 ? 'CPF' : 'CNPJ'} inválido. Confira os números.`; } },
    cnpj:{ ph:'00.000.000/0000-00', modo:'numeric', f:v => cnpj(so(v)), erro:v => { const d = so(v); return !d ? '' : d.length < 14 ? 'Complete o CNPJ (14 números).' : cnpjOk(d) ? '' : 'CNPJ inválido. Confira os números.'; } },
    cpf:{ ph:'000.000.000-00', modo:'numeric', f:v => cpf(so(v)), erro:v => { const d = so(v); return !d ? '' : d.length < 11 ? 'Complete o CPF (11 números).' : cpfOk(d) ? '' : 'CPF inválido. Confira os números.'; } },
    tel:{ ph:'(65) 99999-9999', modo:'tel', f:v => { const d = so(v).slice(0, 11); return d.length <= 10 ? enc(d, '(00) 0000-0000') : enc(d, '(00) 00000-0000'); },
      erro:v => { const d = so(v); return !d || d.length >= 10 ? '' : 'Telefone incompleto: DDD e número.'; } },
    cep:{ ph:'00000-000', modo:'numeric', f:v => enc(so(v).slice(0, 8), '00000-000'), erro:v => { const d = so(v); return !d || d.length === 8 ? '' : 'Complete o CEP (8 números).'; } },
    ie:{ ph:'Somente números', modo:'numeric', f:v => so(v).slice(0, 14) },
    sigla:{ ph:'Ex.: CBN', modo:'text', f:v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) },
    dec:{ ph:'0,00', modo:'decimal', f:dec },
    pct:{ ph:'0', modo:'decimal', f:v => dec(v).replace(/^(\d{1,3}(?:\.\d{3})*)/, m => m.length > 3 ? '100' : m) },
    int:{ ph:'0', modo:'numeric', f:v => so(v).slice(0, 6) } };
  // Campos que ganham máscara e exemplo só pelo nome, em qualquer formulário
  S.CAMPO_MASCARA = { documento:'doc', cnpj:'cnpj', cpf:'cpf', telefone:'tel', whatsapp:'tel', celular:'tel', cep:'cep', inscricao_estadual:'ie', sigla:'sigla', preco:'dec', valor:'dec', comissao:'pct', desconto_max:'pct' };
  S.CAMPO_EXEMPLO = { email:'nome@empresa.com.br', cidade:'Cuiabá / MT', endereco:'Rua, número, bairro', frequencia:'101,9 FM', razao_social:'Como consta no CNPJ', rede_afiliada:'Ex.: CBN, Jovem Pan', segmento:'Ex.: Varejo, Saúde, Educação',
    contato_decide:'Nome de quem decide a compra', contato_assina:'Nome de quem assina o PI', assunto:'Ex.: Apresentar proposta', nome:'', titulo:'Ex.: Campanha de aniversário', projeto:'Ex.: Black Friday 2026', dados_bancarios:'Banco, agência, conta e chave Pix', observacoes:'', resultado:'Ex.: Gostou da proposta, ficou de responder na quinta', nota:'Ex.: Ajustar a grade de novembro' };

  // Formata o campo mantendo o cursor no lugar certo
  const aplicar = (el, digitando) => {
    const m = S.MASK[el.dataset.mask]; if (!m) return;
    const conta = s => (s.match(/[\dA-Za-z,]/g) || []).length, antes = digitando ? conta(el.value.slice(0, el.selectionStart || 0)) : 0;
    const novo = m.f(el.value);
    if (novo !== el.value) {
      el.value = novo;
      if (digitando && document.activeElement === el) { let pos = 0, n = 0; while (pos < novo.length && n < antes) { if (/[\dA-Za-z,]/.test(novo[pos])) n++; pos++; } try { el.setSelectionRange(pos, pos); } catch (e) {} }
    }
    el.setCustomValidity(m.erro ? m.erro(el.value) : '');
    if (el._aviso) avisar(el); // depois do primeiro aviso, acompanha a digitação
  };
  // Mostra o problema embaixo do campo (sem prender o cursor nele)
  const avisar = el => {
    let a = el.parentElement.querySelector(':scope > .aviso');
    if (!el.validationMessage) { if (a) a.remove(); return; }
    if (!a) { a = document.createElement('small'); a.className = 'aviso'; el.insertAdjacentElement('afterend', a); }
    a.textContent = el.validationMessage; el._aviso = true;
  };
  S.mascarar = raiz => (raiz || document).querySelectorAll('input[data-mask]').forEach(el => { if (!el.placeholder && S.MASK[el.dataset.mask]) el.placeholder = S.MASK[el.dataset.mask].ph; aplicar(el); });
  document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.mask) aplicar(e.target, true); });
  // CEP: ao completar os 8 números, busca o endereço (ViaCEP; se falhar, BrasilAPI) e preenche endereço e cidade
  const dica = (el, txt, erro) => { let a = el.parentElement.querySelector(':scope > .dica'); if (!txt) { if (a) a.remove(); return; }
    if (!a) { a = document.createElement('small'); el.insertAdjacentElement('afterend', a); } a.className = 'dica' + (erro ? ' aviso' : ''); a.textContent = txt; };
  S.buscarCep = async cep => {
    const n = String(cep).replace(/\D/g, ''); if (n.length !== 8) return null;
    try { const r = await fetch(`https://viacep.com.br/ws/${n}/json/`); const j = await r.json();
      if (r.ok && !j.erro) return { logradouro:j.logradouro || '', bairro:j.bairro || '', cidade:j.localidade || '', uf:j.uf || '' }; } catch (e) { /* tenta o outro serviço */ }
    try { const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${n}`); if (r.ok) { const j = await r.json(); return { logradouro:j.street || '', bairro:j.neighborhood || '', cidade:j.city || '', uf:j.state || '' }; } } catch (e) { /* sem conexão */ }
    return false;
  };
  document.addEventListener('input', async e => {
    const el = e.target; if (el.name !== 'cep' || !el.form) return;
    const n = el.value.replace(/\D/g, ''); if (n.length !== 8) { dica(el, ''); el._cep = ''; return; }
    if (el._cep === n) return; el._cep = n;
    dica(el, 'Buscando o endereço…');
    const r = await S.buscarCep(n); if (el._cep !== n) return; // o CEP mudou enquanto buscava
    if (!r) return dica(el, r === false ? 'CEP não encontrado. Preencha o endereço à mão.' : '', true);
    const f = el.form, end = f.elements.endereco, cid = f.elements.cidade, bai = f.elements.bairro;
    const rua = r.logradouro, resto = [r.bairro].filter(Boolean).join(', ');
    // Formulário com campo de bairro (empresa comercial): rua e bairro em campos separados
    if (bai) { if (end) end.value = rua; bai.value = r.bairro || ''; } else if (end) { end.value = [rua, resto].filter(Boolean).join(', '); }
    if (cid) cid.value = [r.cidade, r.uf].filter(Boolean).join(' / ');
    dica(el, rua ? 'Endereço preenchido. Complete o número.' : 'Cidade preenchida. Este CEP não tem rua: preencha o endereço.');
    // Deixa o cursor logo depois do nome da rua, para digitar o número
    if (bai && f.elements.numero && rua) f.elements.numero.focus();
    else if (end) { end.focus(); const pos = rua ? rua.length : end.value.length; try { end.setSelectionRange(pos, pos); } catch (er) { /* campo sem cursor */ } }
  });
  // Ao sair do campo, avisa na hora se o número está errado
  document.addEventListener('focusout', e => { const el = e.target; if (el.dataset && el.dataset.mask && el.validationMessage) avisar(el); });
})();

// Número que rola (S.rolo, de cruzado.js) e fica montado entre um desenho e outro: cada tela tem a sua chave.
// No lugar dele, a tela escreve <span data-rolo-fixo="chave"></span>; depois do desenho, S.poeRolos() o encaixa e rola até o valor novo.
const rolosFixos = {};
S.roloFixo = (chave, texto) => `<span data-rolo-fixo="${chave}" data-rolo-txt="${S.esc(texto)}"></span>`;
S.poeRolos = () => document.querySelectorAll('[data-rolo-fixo]').forEach(lugar => {
  const k = lugar.dataset.roloFixo, t = lugar.dataset.roloTxt; let r = rolosFixos[k];
  if (!r) { const el = document.createElement('span'); el.className = 'rl-fixo'; r = rolosFixos[k] = { el, rolo:S.rolo ? S.rolo(el) : null, novo:true }; }
  lugar.replaceWith(r.el); if (r.rolo) r.rolo.poe(t, r.novo); else r.el.textContent = t; r.novo = false; });
// FLIP de lista: guarda onde estava cada [data-flip], redesenha e faz as linhas deslizarem até o lugar novo (as novas sobem de leve)
S.flip = desenhar => {
  const antes = new Map(); document.querySelectorAll('[data-flip]').forEach(e => antes.set(e.dataset.flip, e.getBoundingClientRect().top));
  desenhar(); if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-flip]').forEach((e, k) => { if (!e.animate) return; const t0 = antes.get(e.dataset.flip), t1 = e.getBoundingClientRect().top;
    if (t0 !== undefined) { if (Math.abs(t0 - t1) > 1) e.animate([{ transform:`translateY(${t0 - t1}px)` }, { transform:'none' }], { duration:420, easing:'cubic-bezier(.2,.9,.2,1)' }); }
    else e.animate([{ opacity:0, transform:'translateY(8px)' }, { opacity:1, transform:'none' }], { duration:320, delay:Math.min(k, 8) * 25, easing:'ease-out', fill:'backwards' }); });
};
// Aviso no rodapé. Com { fn, acao } ganha um botão (ex.: "Desfazer") e fica mais tempo na tela
S.toast = (msg, op) => { const t = document.getElementById('toast'), comAcao = !!(op && op.fn); t.textContent = msg; t.classList.toggle('com-acao', comAcao);
  if (comAcao) { const b = document.createElement('button'); b.type = 'button'; b.textContent = op.acao || 'Desfazer';
    b.onclick = () => { clearTimeout(S._toast); t.classList.remove('on', 'com-acao'); op.fn(); }; t.appendChild(b); }
  t.classList.add('on'); clearTimeout(S._toast); S._toast = setTimeout(() => t.classList.remove('on'), comAcao ? 7000 : 3200); };

// Salvo no meio da tela (aprovado em 29/10/2026, quadro "SONVI · Agências, controle e metas", tela 9): cartão com o ✓ se desenhando,
// título e uma linha do que foi feito; some em 1,8 s (6 s com Desfazer); clicar fora ou Esc fecha antes. Fica na camada do topo
// (popover), por cima de janela aberta. S.salvo('Cliente salvo', { sub, fn, acao }) ou S.salvo('Ficha salva. As regras já valem…').
(() => {
  let el, tempo, fnAcao;
  const fechar = () => { clearTimeout(tempo); if (!el || !el.classList.contains('on')) return; el.classList.remove('on'); el.classList.add('sai');
    setTimeout(() => { if (el.classList.contains('on')) return; el.classList.remove('sai'); try { el.hidePopover && el.matches(':popover-open') && el.hidePopover(); } catch (e) {} el.hidden = true; }, 220); };
  const montar = () => { if (el) return; el = document.createElement('div'); el.id = 'salvo'; el.hidden = true; if ('popover' in el) el.popover = 'manual';
    el.innerHTML = `<div class="sv2-card" role="status" aria-live="polite"><span class="sv2-ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <b class="sv2-t"></b><span class="sv2-s"></span><button type="button" class="btn sm sv2-desf" hidden>Desfazer</button><span class="sv2-tempo" aria-hidden="true"><i></i></span></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('.sv2-desf'); if (b) { const f = fnAcao; fnAcao = null; fechar(); if (f) f(); return; } if (!e.target.closest('.sv2-card')) fechar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('on')) { e.preventDefault(); e.stopPropagation(); fechar(); } }, true); };
  S.salvo = (titulo, op = {}) => {
    montar(); let t = String(titulo || 'Salvo'), sub = op.sub || '';
    if (!sub) { const m = t.match(/^(.{3,60}?)(?::\s+|\.\s+)(.+)$/); if (m) { t = m[1]; sub = m[2]; } }
    el.querySelector('.sv2-t').textContent = t.replace(/\.$/, '');
    const s = el.querySelector('.sv2-s'); s.textContent = sub; s.hidden = !sub;
    const b = el.querySelector('.sv2-desf'); fnAcao = op.fn || null; b.hidden = !fnAcao; b.textContent = op.acao || 'Desfazer';
    const dur = fnAcao ? 6000 : (op.tempo || 1800); el.style.setProperty('--sv2-dur', dur + 'ms');
    clearTimeout(tempo); const casa = [...document.querySelectorAll('dialog[open]')].pop() || document.body; if (el.parentNode !== casa) { try { if (el.matches(':popover-open')) el.hidePopover(); } catch (e) {} casa.appendChild(el); }
    el.hidden = false; el.classList.remove('on', 'sai'); try { if (el.showPopover) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } } catch (e) {}
    el.offsetHeight; el.classList.add('on'); if (fnAcao) b.focus({ preventScroll:true });
    tempo = setTimeout(fechar, dur);
  };
})();

// Abas que deslizam (adaptado do "SegmentedControl" da Halaska UI, licença MIT): num .seg.desliza a marca branca da aba
// escolhida é uma peça só que escorrega até a aba nova (posição com curva enfatizada, largura suave). Como a tela é
// redesenhada a cada clique, a última posição fica guardada pela chave do grupo (data-seg) e a peça nasce ali.
// Setas, Home e End andam entre as abas e já escolhem (como no original).
(() => {
  const ultimo = {};
  S.segDesliza = (raiz = document) => raiz.querySelectorAll('.seg.desliza').forEach(seg => {
    const on = seg.querySelector('button.on'), chave = seg.dataset.seg || 'seg';
    let ind = seg.querySelector(':scope > .seg-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); seg.prepend(ind); }
    if (!on) { ind.style.opacity = 0; return; }
    const alvo = { x:on.offsetLeft, w:on.offsetWidth }, antes = ultimo[chave];
    if (antes && (antes.x !== alvo.x || antes.w !== alvo.w) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ind.style.transition = 'none'; ind.style.transform = `translateX(${antes.x}px)`; ind.style.width = antes.w + 'px'; ind.offsetWidth; ind.style.transition = '';
      requestAnimationFrame(() => { ind.style.transform = `translateX(${alvo.x}px)`; ind.style.width = alvo.w + 'px'; });
    } else { ind.style.transition = 'none'; ind.style.transform = `translateX(${alvo.x}px)`; ind.style.width = alvo.w + 'px'; ind.offsetWidth; ind.style.transition = ''; }
    ind.style.opacity = 1; ultimo[chave] = alvo;
    seg.querySelectorAll('button').forEach(b => { const sel = b === on; b.tabIndex = sel ? 0 : -1; b.setAttribute('aria-pressed', String(sel)); });
  });
  document.addEventListener('keydown', e => {
    const seg = e.target.closest && e.target.closest('.seg.desliza'); if (!seg || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const bs = [...seg.querySelectorAll('button:not([disabled])')], i = bs.indexOf(e.target); if (i < 0) return;
    const alvo = e.key === 'Home' ? bs[0] : e.key === 'End' ? bs[bs.length - 1] : bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length];
    e.preventDefault(); e.stopPropagation(); alvo.click();
    requestAnimationFrame(() => { const n = document.querySelector(`.seg.desliza[data-seg="${seg.dataset.seg}"] button.on`); if (n) n.focus(); });
  });
  window.addEventListener('resize', () => S.segDesliza());
})();

// Menu de seções com o efeito do menu do Dashboard Gestão (29/10/2026, Administração): o realce desliza com mola até o item sob o mouse ou o foco,
// volta ao item aberto, o ícone cresce e ganha a cor do item (data-cor). A tela é redesenhada a cada clique: a posição fica guardada pela chave
// (data-menu) e o realce nasce ali e vai até o item novo. Só no computador.
(() => {
  const S = window.SONVI, ultimo = {};
  S.menuDesliza = (raiz = document) => raiz.querySelectorAll('nav.menu-desliza').forEach(nav => {
    if (nav.dataset.ok || !matchMedia('(min-width:821px)').matches) return; nav.dataset.ok = '1';
    const chave = nav.dataset.menu || 'menu', itens = [...nav.querySelectorAll('a')];
    const r = document.createElement('span'); r.className = 'realce'; r.setAttribute('aria-hidden', 'true'); nav.prepend(r);
    const on = () => nav.querySelector('a.on');
    const ir = (a, sem) => { if (!a) { r.style.opacity = 0; return; } if (sem) r.style.transition = 'none';
      r.style.opacity = 1; r.style.transform = `translateY(${a.offsetTop}px)`; r.style.height = a.offsetHeight + 'px'; if (sem) { r.offsetHeight; r.style.transition = ''; }
      itens.forEach(x => x.classList.toggle('quente', x === a && !x.classList.contains('on'))); r.classList.toggle('no-on', a === on());
      if (a === on()) ultimo[chave] = a.offsetTop; };
    const a0 = on(), y = ultimo[chave];
    if (y !== undefined && a0 && y !== a0.offsetTop) { r.style.transition = 'none'; r.style.opacity = 1; r.style.height = a0.offsetHeight + 'px'; r.style.transform = `translateY(${y}px)`; r.offsetHeight; r.style.transition = ''; requestAnimationFrame(() => ir(a0)); }
    else ir(a0, true);
    const volta = () => { ir(on()); itens.forEach(x => x.classList.remove('quente')); };
    nav.addEventListener('mouseover', e => { const a = e.target.closest('a'); if (a) ir(a); });
    nav.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) ir(a); });
    nav.addEventListener('mouseleave', volta);
    nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) volta(); });
  });
})();

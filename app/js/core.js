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
  ? `<picture><source srcset="img/sonvi-music-branco.png" media="(prefers-color-scheme: dark)"><img src="img/sonvi-music.png?v=2" alt="Sonvi Music"${cls ? ` class="${cls}"` : ''}></picture>`
  : `<picture><source srcset="img/sonvi-branco.svg" media="(prefers-color-scheme: dark)"><img src="img/sonvi.svg" alt="SONVI"${cls ? ` class="${cls}"` : ''}></picture>`;
S.iniciais = nome => String(nome || '?').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
S.ICON = {
  painel:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clientes:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  pis:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  opec:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  financeiro:'<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  cadastros:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  programacao:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l5.5-5.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>', music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', hoje:'<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>', acervo:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M3 10h4M3 15h4"/><circle cx="14" cy="12" r="3"/>', relogios:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', categorias:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', regras:'<path d="M9 11l3 3 8-8"/><path d="M20 12v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h9"/>', paineis:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', comerciais:'<path d="M3 11l14-6v14L3 13z"/><path d="M7 13v5a2 2 0 0 0 4 0v-4"/>', relatorios:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', musical:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mais:'<path d="M12 5v14M5 12h14"/>', busca:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', relatorio:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', check:'<path d="M5 12l5 5L20 7"/>', bloqueio:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', voltar:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  baixar:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', seta:'<path d="M9 6l6 6-6 6"/>', baixo:'<path d="M6 9l6 6 6-6"/>', rota:'<path d="M3 11l19-9-9 19-2-8z"/>',
  imagem:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>', olho:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', editar:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', whats:'<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 .8-.3 1.6c-3.5.3-7-3.2-6.7-6.7L10.8 8.2l.8 2z"/>', lixo:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', copia:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>', abrir:'<path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>', mais3:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', relogio:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/>' };
S.svg = (k, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} aria-hidden="true">${S.ICON[k]}</svg>`;
// Selo da rádio: a sigla quando é curta (CBN), senão as iniciais do nome sem "Rádio" (Rádio Verde → VE)
S.selo = v => { const sg = String(v.sigla || '').trim(); if (sg && sg.length <= 3) return sg.toUpperCase();
  const ps = String(v.nome || '').replace(/\b(r[áa]dio|fm|am)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (ps.length > 1 ? ps[0][0] + ps[1][0] : (ps[0] || sg || '?').slice(0, 2)).toUpperCase(); };
// Selo da rádio: o logo dela, ou a sigla sobre a cor DELA (nunca a cor da rádio selecionada)
S.vav = v => v && v.logo ? `<span class="vav img"><img src="${v.logo}" alt=""></span>` : `<span class="vav" style="background:${v && /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor : S.COR_PADRAO}">${S.esc(S.selo(v || {}))}</span>`;

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
  const ac = ajusta(cor, '#ffffff', 3, '#000000'), tx = ajusta(cor, '#ffffff', 4.5, '#000000'), txd = ajusta(cor, '#121316', 4.5, '#ffffff'), [r, g, b] = rgb(ac);
  st.dataset.cor = cor;
  st.textContent = `:root{--accent:${ac};--accent-hover:${mistura(ac, '#000000', .14)};--accent-2:${mistura(ac, '#ffffff', .3)};--accent-ink:#fff;--accent-soft:${mistura(ac, '#ffffff', .9)};--accent-text:${tx};--bar-soft:${mistura(ac, '#ffffff', .78)};--blue:${tx}}
@media (prefers-color-scheme: dark){:root{--accent-hover:${mistura(ac, '#ffffff', .12)};--accent-soft:rgba(${r},${g},${b},.24);--accent-text:${txd};--bar-soft:${mistura(ac, '#121316', .65)};--blue:${txd}}}`;
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
S.campoLogo = (v, travado) => {
  const t = travado ? ' disabled data-trava="1"' : '', cor = v.cor || S.COR_PADRAO;
  return `<div class="logo-campo" style="grid-column:1/-1">
    <div class="logo-prev">${v.logo ? `<img src="${v.logo}" alt="Logo da rádio">` : `<span>${S.svg('imagem', 26)}</span>`}</div>
    <div class="logo-info"><b>Logo da rádio</b><small class="muted">Quadrado, 500 × 500 px (PNG, JPG ou WebP). Sai no PI e a cor dele personaliza o sistema.</small>
      <div class="row"><button type="button" class="btn sm" data-act="logoEscolher"${t}>${S.svg('baixar')}${v.logo ? 'Trocar logo' : 'Enviar logo'}</button>${v.logo ? `<button type="button" class="btn sm" data-act="logoRemover"${t}>Remover</button>` : ''}</div>
      <div class="cores" role="radiogroup" aria-label="Cor da rádio"><span class="muted small">Cor</span>${[...new Set([cor, ...(v._cores || [])])].slice(0, 6).map(c => `<button type="button" class="cor${c === cor ? ' on' : ''}" style="background:${c}" data-act="logoCor" data-cor="${c}" role="radio" aria-checked="${c === cor}" aria-label="Cor ${c}" title="${c}"${t}></button>`).join('')}</div>
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
S.usuario = id => (S.db.usuarios.find(u => u.id === id) || {}).nome || '';
S.pessoas = tipo => S.db.pessoas.filter(p => p.tipo === tipo).sort((a, b) => a.nome.localeCompare(b.nome));
S.piNo = pi => `PI ${S.veh(pi.veiculo_id).sigla} ${String(pi.numero).padStart(4, '0')}`;
// Consultores do veículo atual (para escolher o responsável por um cliente ou compromisso)
S.consultores = () => S.db.vinculos.filter(v => v.veiculo_id === S.ui.vehicleId && v.perfil === 'consultor').map(v => S.db.usuarios.find(u => u.id === v.usuario_id)).filter(Boolean);

// ---------- navegação ----------
S.route = () => { const [view, id] = location.hash.replace(/^#\/?/, '').split('/'); return { view: S.views[view] ? view : 'painel', id }; };
S.go = path => { if (location.hash === '#' + path) S.render(); else location.hash = path; };

// ---------- diálogo, formulário e aviso ----------
S.dialog = (html, onOk) => { const d = document.getElementById('dlg'); d.innerHTML = `<form method="dialog">${html}</form>`; d.onclose = () => { if (d.returnValue === 'ok' && onOk) onOk(Object.fromEntries(new FormData(d.querySelector('form')))); }; S.mascarar(d); d.showModal(); };
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
    <div class="row so-ver"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Fechar</button><button type="button" class="btn pri" data-act="formEditar">${S.svg('editar')}Editar</button></div>
    <div class="row so-editar"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${ok}</button></div>`, onOk);
  if (ver) document.querySelector('#dlg form').classList.add('ver');
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
  m.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = itens[+b.dataset.i]; S.fecharMenu(); S.actions[it.act](it.data || {}, botao); });
  S._menu = m; const f = m.querySelector('button'); if (f) f.focus();
};
S.fecharMenu = () => { if (S._menu) { S._menu.remove(); S._menu = null; } };
document.addEventListener('mousedown', e => { if (S._menu && !S._menu.contains(e.target)) S.fecharMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') S.fecharMenu(); });
window.addEventListener('scroll', () => S.fecharMenu(), true);

// Libera os campos do cadastro aberto para edição
S.actions.formEditar = () => {
  const f = document.querySelector('#dlg form'); f.classList.remove('ver');
  f.querySelectorAll('[data-trava]').forEach(el => { el.disabled = false; el.removeAttribute('data-trava'); });
  const p = f.querySelector('input:not([type=checkbox]), select, textarea'); if (p) p.focus();
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
    doc:{ ph:'00.000.000/0000-00 ou 000.000.000-00', modo:'numeric', f:v => { const d = so(v); return d.length <= 11 ? cpf(d) : cnpj(d); },
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
    const f = el.form, end = f.elements.endereco, cid = f.elements.cidade;
    const rua = r.logradouro, resto = [r.bairro].filter(Boolean).join(', ');
    if (end) { end.value = [rua, resto].filter(Boolean).join(', '); }
    if (cid) cid.value = [r.cidade, r.uf].filter(Boolean).join(' / ');
    dica(el, rua ? 'Endereço preenchido. Complete o número.' : 'Cidade preenchida. Este CEP não tem rua: preencha o endereço.');
    // Deixa o cursor logo depois do nome da rua, para digitar o número
    if (end) { end.focus(); const pos = rua ? rua.length : end.value.length; try { end.setSelectionRange(pos, pos); } catch (er) { /* campo sem cursor */ } }
  });
  // Ao sair do campo, avisa na hora se o número está errado
  document.addEventListener('focusout', e => { const el = e.target; if (el.dataset && el.dataset.mask && el.validationMessage) avisar(el); });
})();

S.toast = msg => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(S._toast); S._toast = setTimeout(() => t.classList.remove('on'), 3200); };

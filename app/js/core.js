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
S.PERFIS = { diretor:'Diretor', gerente:'Gerente comercial', consultor:'Consultor', opec:'OPEC', financeiro:'Financeiro' };
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
S.logo = (cls = '') => `<picture><source srcset="img/sonvi-branco.svg" media="(prefers-color-scheme: dark)"><img src="img/sonvi.svg" alt="SONVI"${cls ? ` class="${cls}"` : ''}></picture>`;
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
  mais:'<path d="M12 5v14M5 12h14"/>', check:'<path d="M5 12l5 5L20 7"/>', voltar:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  baixar:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', seta:'<path d="M9 6l6 6-6 6"/>', baixo:'<path d="M6 9l6 6 6-6"/>', rota:'<path d="M3 11l19-9-9 19-2-8z"/>',
  doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', relogio:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/>' };
S.svg = (k, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} aria-hidden="true">${S.ICON[k]}</svg>`;
// Selo da rádio: a sigla quando é curta (CBN), senão as iniciais do nome sem "Rádio" (Rádio Verde → VE)
S.selo = v => { const sg = String(v.sigla || '').trim(); if (sg && sg.length <= 3) return sg.toUpperCase();
  const ps = String(v.nome || '').replace(/\b(r[áa]dio|fm|am)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (ps.length > 1 ? ps[0][0] + ps[1][0] : (ps[0] || sg || '?').slice(0, 2)).toUpperCase(); };
S.vav = v => `<span class="vav" style="background:${S.esc(v.cor || '#0055ff')}">${S.esc(S.selo(v))}</span>`;

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
S.dialog = (html, onOk) => { const d = document.getElementById('dlg'); d.innerHTML = `<form method="dialog">${html}</form>`; d.onclose = () => { if (d.returnValue === 'ok' && onOk) onOk(Object.fromEntries(new FormData(d.querySelector('form')))); }; d.showModal(); };
// Formulário genérico: campos = [{ k, label, type, options, req, full }]
S.form = (title, fields, v, onOk, ok = 'Salvar') => {
  const inp = f => { const val = v[f.k] ?? '', a = `name="${f.k}"${f.req ? ' required' : ''}`;
    if (f.type === 'select') return `<select ${a}>${f.options.map(([k, n]) => `<option value="${S.esc(k)}"${String(k) === String(val) ? ' selected' : ''}>${S.esc(n)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea ${a}>${S.esc(val)}</textarea>`;
    if (f.type === 'checkbox') return `<input type="checkbox" ${a}${val ? ' checked' : ''}>`;
    return `<input type="${f.type || 'text'}" ${a} value="${S.esc(val)}"${f.id ? ` id="${f.id}"` : ''}>`; };
  const row = f => f.html || `<label class="f${f.type === 'checkbox' ? ' chk' : ''}"${f.full || f.type === 'textarea' ? ' style="grid-column:1/-1"' : ''}>${f.type === 'checkbox' ? inp(f) + S.esc(f.label) : S.esc(f.label) + inp(f)}</label>`;
  S.dialog(`<h2>${title}</h2><div class="g2">${fields.map(row).join('')}</div><div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${ok}</button></div>`, onOk);
};
S.toast = msg => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(S._toast); S._toast = setTimeout(() => t.classList.remove('on'), 3200); };

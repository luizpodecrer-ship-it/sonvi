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
  rascunho:{ label:'Rascunho', tone:'gray' }, opec:{ label:'Na OPEC', tone:'orange' }, devolvido:{ label:'Devolvido', tone:'red' },
  aprovado:{ label:'Aprovado', tone:'green' }, programado:{ label:'Programado', tone:'purple' }, faturado:{ label:'Faturado', tone:'blue' }, cancelado:{ label:'Cancelado', tone:'gray' } };
S.EDITABLE = ['rascunho', 'devolvido'];
S.pill = s => `<span class="pill" style="--tone:var(--${S.STATUS[s].tone})">${S.STATUS[s].label}</span>`;
S.tag = (text, tone) => `<span class="pill" style="--tone:var(--${tone})">${S.esc(text)}</span>`;

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

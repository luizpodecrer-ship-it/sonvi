// SONVI · OPEC: só acompanhamento (05/11/2026, database/081). PI enviado para a OPEC já é venda;
// a OPEC não entra no SONVI e abrir o PI pelo link do e-mail só acende o selo verde "OPEC abriu".
// Refeita em 08/11/2026 (pedido do Luiz, modelo "OPEC organizada"; o gráfico de inserções por dia saiu a pedido dele):
// em cima, quatro números que rolam (próximos 30 dias);
// embaixo, as abas Aguardando a OPEC abrir · OPEC abriu (pílula que desliza), busca e consultor, e a lista com a
// barra de veiculação de cada PI (de quando a quando, quanto já foi ao ar). Estilos .op2-* em sonvi.css.
(() => {
  const { esc, brl } = S;
  const st = { etapa:'aguarda', q:'', cons:'' };
  const ENVIADO = ['opec', 'aprovado', 'programado', 'faturado'];
  const ETAPAS = [['aguarda', 'Aguardando a OPEC abrir'], ['abriu', 'OPEC abriu']];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const abriu = p => /OPEC abriu/.test(S.seloOpec ? S.seloOpec(p) : '');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const desde = p => S.dia(p.atualizado_em || p.criado_em);
  const diasDesde = p => Math.max(0, Math.round((new Date(S.today()) - new Date(desde(p))) / 864e5));
  // Dias com inserção de cada PI (das grades): { '2026-11-08': 12, ... }
  const diasDoPi = p => { const m = {}; (p.dados.grids || []).forEach(g => (g.items || []).forEach(it => Object.entries(it.days || {}).forEach(([d, n]) => {
    if (!(Number(n) > 0)) return; const k = `${g.period}-${String(d).padStart(2, '0')}`; m[k] = (m[k] || 0) + Number(n); }))); return m; };
  const noArOuPorVir = p => { const ds = Object.keys(diasDoPi(p)).sort(); if (ds.length) return ds[ds.length - 1] >= S.today(); const ms = S.mesesDoPi(p); return !ms.length || ms[ms.length - 1] >= S.today().slice(0, 7); };
  const daEtapa = k => S.db.pis.filter(p => ENVIADO.includes(p.status) && (k === 'abriu' ? abriu(p) && noArOuPorVir(p) : !abriu(p)));
  // Entrada animada que continua entre redesenhos (regra do SONVI: atraso negativo --t)
  const inicio = {};
  const entrada = vk => { const agora = performance.now(); if (!(vk in inicio)) inicio[vk] = agora; const t = agora - inicio[vk]; return t > 2600 ? '' : ` op2-entra" style="--t:-${Math.round(t)}ms`; };

  S.views.opec = () => {
    const hoje = S.today(), enviados = S.db.pis.filter(p => ENVIADO.includes(p.status)), dias = new Map(enviados.map(p => [p.id, diasDoPi(p)]));
    // 1. Programação dos próximos 30 dias
    const h = new Date(hoje + 'T12:00'), d30 = Array.from({ length:30 }, (_, i) => iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + i)));
    const porDia = d30.map(d => { const ps = enviados.filter(p => dias.get(p.id)[d]); return { d, n:ps.reduce((s, p) => s + dias.get(p.id)[d], 0), ps }; });
    const tot = porDia.reduce((s, x) => s + x.n, 0), pico = porDia.reduce((a, x) => x.n > a.n ? x : a, porDia[0]);
    const noArHoje = porDia[0].ps.length, ent = entrada('op|' + (S.ui.vehicleId || ''));
    const kpi = (k, rot, val, sub, i) => `<div class="op2-k" style="--d:${150 + i * 80}ms"><span>${rot}</span><b>${S.roloFixo('op2-' + k, val)}</b><small>${sub}</small></div>`;
    const prog = `<section class="card op2-prog" aria-labelledby="op2-tp"><div class="hd"><h2 id="op2-tp">Próximos 30 dias</h2><span class="muted small">das grades dos PIs enviados</span></div>
      <div class="op2-prog-c${ent}">
        <div class="op2-ks">${kpi('tot', 'Inserções em 30 dias', tot.toLocaleString('pt-BR'), `${enviados.filter(p => porDia.some(x => dias.get(p.id)[x.d])).length} PIs no período`, 0)}
          ${kpi('hoje', 'Hoje', String(porDia[0].n), `${noArHoje} ${noArHoje === 1 ? 'PI no ar' : 'PIs no ar'}`, 1)}
          ${kpi('pico', 'Dia mais cheio', pico.n ? dm(pico.d) : '—', pico.n ? `${pico.n} inserções · ${SEM[new Date(pico.d + 'T12:00').getDay()]}` : 'nada programado', 2)}
          ${kpi('fila', 'Aguardando abrir', String(daEtapa('aguarda').length), daEtapa('aguarda').length ? (n => n ? `mais antigo há ${n} dia${n > 1 ? 's' : ''}` : 'chegaram hoje')(Math.max(...daEtapa('aguarda').map(diasDesde))) : 'a OPEC abriu todos', 3)}</div>
      </div></section>`;

    // 2. Abas, filtros e lista
    const q = st.q.trim().toLowerCase();
    const filtra = l => l.filter(p => (!st.cons || p.consultor_id === st.cons)
      && (!q || [p.titulo, S.piNo(p), S.nome(p.cliente_id), S.nome(p.agencia_id), S.usuario(p.consultor_id)].some(t => String(t || '').toLowerCase().includes(q))));
    const conta = Object.fromEntries(ETAPAS.map(([k]) => [k, filtra(daEtapa(k))]));
    const lista = conta[st.etapa].slice().sort((a, b) => st.etapa === 'aguarda' ? desde(a).localeCompare(desde(b)) || a.numero - b.numero : b.numero - a.numero);
    const abas = `<div class="op2-abas" role="tablist" aria-label="Etapa">${ETAPAS.map(([k, n]) => `<button type="button" role="tab" data-act="opEtapa" data-v="${k}" aria-selected="${st.etapa === k}" class="${k}">
        <i class="op2-pt" aria-hidden="true"></i><span>${n.replace(' a OPEC abrir', '<span class="op2-lg"> a OPEC abrir</span>')}</span><span class="op2-cnt">${conta[k].length}</span></button>`).join('')}<span class="op2-pil" aria-hidden="true"></span></div>`;
    const consultores = [...new Set(enviados.map(p => p.consultor_id).filter(Boolean))];
    const filtros = `<div class="op2-fil"><label class="op2-busca">${S.svg('busca', 16)}<input type="search" data-opq placeholder="Buscar PI, cliente, agência ou consultor" value="${esc(st.q)}" aria-label="Buscar"></label>
      <select data-opcons aria-label="Consultor"><option value="">Todos os consultores</option>${consultores.map(id => `<option value="${id}"${st.cons === id ? ' selected' : ''}>${esc(S.usuario(id) || 'Consultor')}</option>`).join('')}</select>
</div>`;
    // Barra de veiculação: do primeiro ao último dia com inserção; a parte que já foi ao ar fica cheia, hoje marcado
    const veic = p => { const ds = Object.keys(dias.get(p.id)).sort(); if (!ds.length) { const ms = S.mesesDoPi(p); return `<span class="op2-v"><small>${ms.map(m => m.split('-').reverse().join('/')).join(', ') || '—'}</small></span>`; }
      const a = ds[0], b = ds[ds.length - 1], T = Math.max(1, (new Date(b) - new Date(a)) / 864e5), feito = Math.min(1, Math.max(0, (new Date(hoje) - new Date(a)) / 864e5 / T));
      const est = hoje < a ? 'vem' : hoje > b ? 'fim' : 'ar', marca = est === 'ar' ? `<u style="left:${(feito * 100).toFixed(1)}%"></u>` : '';
      return `<span class="op2-v ${est}"><small><b>${dm(a)}</b> → <b>${dm(b)}</b><em>${est === 'vem' ? (n => n === 1 ? 'começa amanhã' : `começa em ${n} dias`)(Math.round((new Date(a) - new Date(hoje)) / 864e5)) : est === 'fim' ? 'terminou' : 'no ar'}</em></small>
        <span class="op2-vt"><i style="width:${(est === 'vem' ? 0 : feito * 100).toFixed(1)}%"></i>${marca}</span></span>`; };
    const espera = p => { const d = diasDesde(p); return st.etapa === 'aguarda'
      ? `<span class="op2-esp${d >= 3 ? ' velho' : ''}"><i aria-hidden="true"></i>${d ? `há ${d} dia${d > 1 ? 's' : ''}` : 'chegou hoje'}</span>` : (S.seloOpec ? S.seloOpec(p) : ''); };
    const ins = p => { const c = S.calc(p); return `${c.ins.toLocaleString('pt-BR')}${c.pub ? ` + ${c.pub} pub.` : ''}`; };
    const linha = (p, i) => `<a class="op2-l" data-go="/pi/${p.id}" data-flip="${p.id}" style="--d:${Math.min(i, 12) * 40}ms">
        <span class="op2-pi"><b title="${esc(p.titulo || '')}">${esc(p.titulo) || 'Sem título'}</b><small><span class="op2-no">${esc(S.piNo(p))}</span>${esc(S.nome(p.cliente_id) || '—')}${p.agencia_id ? ` · ${esc(S.nome(p.agencia_id))}` : ''}</small></span>
        <span class="op2-cons"><span class="av soft" aria-hidden="true">${esc(S.iniciais(S.usuario(p.consultor_id) || '?'))}</span><span>${esc(String(S.usuario(p.consultor_id) || '—').split(' ')[0])}</span></span>
        ${veic(p)}<span class="op2-n r"><b>${ins(p)}</b><small>inserções</small></span><span class="op2-n r"><b>${brl(S.calc(p).net)}</b><small>líquido</small></span>
        <span class="op2-st">${espera(p)}</span><span class="op2-ir" aria-hidden="true">${S.svg('seta', 16)}</span></a>`;
    const vazio = `<div class="empty"><b>${q || st.cons ? 'Nenhum PI com esse filtro' : 'Nada aqui'}</b>${q || st.cons ? 'Tire o filtro para ver todos.' : st.etapa === 'aguarda' ? 'A OPEC já abriu todos os PIs enviados.' : 'Nenhum PI aberto pela OPEC no ar ou por vir.'}</div>`;
    const listaCard = `<section class="card op2-lista" aria-label="PIs enviados para a OPEC"><div class="op2-topo">${abas}${filtros}</div>
      <p class="op2-res">${lista.length} ${lista.length === 1 ? 'PI' : 'PIs'}${st.etapa === 'aguarda' && lista.length > 1 ? ' · os que esperam há mais tempo primeiro' : st.etapa === 'abriu' ? ' · no ar ou por vir, os mais novos primeiro' : ''} · ${brl(lista.reduce((s, p) => s + S.calc(p).net, 0))} líquido</p>
      ${lista.length ? `<div class="op2-cab" aria-hidden="true"><span>PI</span><span>Consultor</span><span>Veiculação</span><span class="r">Inserções</span><span class="r">Líquido</span><span>${st.etapa === 'aguarda' ? 'Esperando' : 'OPEC'}</span><span></span></div>
        <div class="op2-ls${entrada(`opl|${S.ui.vehicleId}|${st.etapa}|${st.cons}`)}">${lista.map(linha).join('')}</div>` : vazio}</section>`;

    queueMicrotask(poePil);
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>OPEC`, actions:'', body:prog + listaCard };
  };
  // Pílula das abas: desliza com mola até a aba escolhida
  let pilEm = null;
  const poePil = () => { const a = document.querySelector('.op2-abas'); if (!a) { pilEm = null; return; } const pil = a.querySelector('.op2-pil'), b = a.querySelector('[aria-selected="true"]'); if (!pil || !b) return;
    const x = b.offsetLeft, w = b.offsetWidth; pil.style.width = w + 'px'; pil.style.transform = `translateX(${x}px)`;
    if (pilEm && (pilEm.x !== x || pilEm.w !== w) && !quieto() && pil.animate) pil.animate([{ transform:`translateX(${pilEm.x}px)`, width:pilEm.w + 'px' }, { transform:`translateX(${x}px)`, width:w + 'px' }], { duration:520, easing:'cubic-bezier(.34,1.4,.5,1)' });
    pilEm = { x, w }; };
  S.actions.opEtapa = d => { if (st.etapa === d.v) return; st.etapa = d.v; S.flip(S.render); };
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-opcons]'); if (s) { st.cons = s.value; S.flip(S.render); } });
  let tq = 0;
  document.addEventListener('input', e => { const s = e.target.closest && e.target.closest('[data-opq]'); if (!s) return; st.q = s.value; clearTimeout(tq);
    tq = setTimeout(() => { const pos = s.selectionStart; S.render(); const n = document.querySelector('[data-opq]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* tipo search */ } } }, 180); });
})();

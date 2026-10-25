// SONVI · OPEC: confere os PIs enviados pelo comercial, aprova ou devolve, e marca o que já foi programado.
// Tela aprovada em 24/10/2026: a esteira das etapas (Para conferir → Aprovados → Programados → Faturados no mês) com os números
// rolando; escolher uma etapa mostra os PIs dela (FLIP). Na fila, os mais antigos primeiro e há quanto tempo cada um espera.
// Embaixo, as inserções programadas nos próximos 30 dias (das grades). Tudo nos tons da cor do veículo. Estilos .oe-* em sonvi.css.
(() => {
  const { esc, brl } = S;
  let etapa = 'opec';
  const ETAPAS = [['opec', 'Para conferir', 't-escuro'], ['aprovado', 'Aprovados', 't-medio'], ['programado', 'Programados', 't-forte'], ['faturado', 'Faturados no mês', 't-claro']];
  // Inserções da rádio e, se houver, publicações digitais (com quantas ainda estão sem data)
  const qtd = (p, c) => `${c.ins}${c.pub ? ` + ${c.pub} pub.` : ''}${c.pub && ['aprovado'].includes(p.status) && S.piEntregasPendentes && S.piEntregasPendentes(p) ? `<small class="muted" style="display:block">${S.piEntregasPendentes(p)} sem data</small>` : ''}`;
  const mesesDe = p => [...new Set([...p.dados.grids, ...(p.dados.digital || [])].map(g => g.period))].sort().map(x => x.split('-').reverse().join('/')).join(', ');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Desde quando o PI está na etapa: a última mudança dele (na OPEC ninguém edita o PI)
  const desde = p => S.dia(p.atualizado_em || p.criado_em);
  const diasDesde = p => Math.max(0, Math.round((new Date(S.today()) - new Date(desde(p))) / 864e5));
  const daEtapa = k => S.db.pis.filter(p => p.status === k && (k !== 'faturado' || desde(p).slice(0, 7) === S.today().slice(0, 7)));
  const curto = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

  S.views.opec = () => {
    const fila = daEtapa('opec'), velho = Math.max(0, ...fila.map(diasDesde)), nomeEt = ETAPAS.find(e => e[0] === etapa)[1];
    const lista = daEtapa(etapa).sort((a, b) => desde(a).localeCompare(desde(b)) || a.numero - b.numero);
    const botoes = p => p.status === 'opec' ? `<button class="btn sm" data-act="piReturn" data-id="${p.id}">Devolver</button><button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="aprovado">Aprovar</button>`
      : p.status === 'aprovado' ? `<button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="programado">Marcar programado</button>` : `<button class="btn sm" data-go="/pi/${p.id}">Abrir PI</button>`;
    const espera = p => { const d = diasDesde(p); return etapa === 'opec' ? `<span class="oe-idade" title="Chegou em ${S.dfmt(desde(p))}"><span aria-hidden="true"><i style="width:${Math.min(100, d / 7 * 100)}%"></i></span>${d ? `há ${d} dia${d > 1 ? 's' : ''}` : 'hoje'}</span>` : `<span class="muted nw">desde ${S.dfmt(desde(p)).slice(0, 5)}</span>`; };

    const esteira = `<section class="card" aria-labelledby="oe-t"><div class="hd"><h2 id="oe-t">Caminho dos PIs</h2>${fila.length ? `<span class="pill fn-forte">Mais antigo esperando há ${velho} dia${velho === 1 ? '' : 's'}</span>` : '<span class="pill fn-neutra">Nada para conferir</span>'}</div>
      <div class="oe-esteira" role="group" aria-label="Etapas (escolha para ver os PIs)">${ETAPAS.map(([k, nome, tom]) => { const xs = daEtapa(k);
        return `<button type="button" class="oe-etapa" data-act="opEtapa" data-v="${k}" style="--c:var(--${tom})" aria-pressed="${etapa === k}"><span class="oe-et"><i aria-hidden="true"></i>${nome}</span>
          <span class="oe-n">${S.roloFixo('oe-' + k, String(xs.length))}</span><span class="oe-v">${curto(xs.reduce((s, p) => s + Number(p.valor_total || 0), 0))}</span>${k === 'opec' && xs.length ? '<span class="pill fn-ok pf-vivo oe-fila">na fila</span>' : ''}</button>`; }).join('')}</div></section>`;

    const vazio = `<div class="empty"><b>Nada aqui</b>${etapa === 'opec' ? 'Nenhum PI esperando conferência.' : etapa === 'faturado' ? 'Nenhum PI faturado neste mês.' : 'Nenhum PI nesta etapa.'}</div>`;
    const corpo = !lista.length ? vazio : S.celular
      ? `<div class="op-cards">${lista.map(p => { const c = S.calc(p), meses = mesesDe(p);
        return `<div class="op-card" data-flip="${p.id}"><a data-go="/pi/${p.id}" class="op-tit"><small>${S.piNo(p)}</small><b>${esc(p.titulo) || 'Sem título'}</b></a>
          <dl><div><dt>Cliente</dt><dd>${esc(S.nome(p.cliente_id)) || '—'}</dd></div><div><dt>Consultor</dt><dd>${esc(S.usuario(p.consultor_id)) || '—'}</dd></div>
          <div><dt>Período</dt><dd>${meses || '—'}</dd></div><div><dt>Inserções</dt><dd class="num">${qtd(p, c)}</dd></div><div><dt>Total</dt><dd class="num"><b>${brl(c.total)}</b></dd></div><div><dt>${etapa === 'opec' ? 'Esperando' : 'Desde'}</dt><dd>${espera(p)}</dd></div></dl>
          <div class="op-bt">${botoes(p)}</div></div>`; }).join('')}</div>`
      : `<div class="oe-l oe-cab"><span class="oe-c-no">Nº</span><span>Título</span><span>Cliente</span><span class="oe-c-cons">Consultor</span><span class="oe-c-per">Período</span><span class="r">Inserções</span><span class="r">Total</span><span>${etapa === 'opec' ? 'Esperando' : 'Na etapa'}</span><span><span class="sr">Ações</span></span></div>
        ${lista.map(p => { const c = S.calc(p);
          return `<div class="oe-l" data-flip="${p.id}"><span class="muted nw oe-c-no">${S.piNo(p)}</span><span class="oe-quem"><a data-go="/pi/${p.id}"><b>${esc(p.titulo) || 'Sem título'}</b></a><small>${S.piNo(p)}</small></span>
            <span class="oe-cli" title="${esc(S.nome(p.cliente_id))}">${esc(S.nome(p.cliente_id)) || '—'}</span><span class="oe-c-cons nw">${esc(S.usuario(p.consultor_id)) || '—'}</span><span class="oe-c-per nw">${mesesDe(p)}</span>
            <span class="r">${qtd(p, c)}</span><span class="r oe-num">${brl(c.total)}</span><span>${espera(p)}</span><span class="lin-acoes">${botoes(p)}</span></div>`; }).join('')}`;
    const listaCard = `<section class="card oe-lista" aria-labelledby="oe-tl"><div class="hd"><h2 id="oe-tl">${nomeEt}</h2><span>${lista.length} PI${lista.length === 1 ? '' : 's'}${etapa === 'opec' && lista.length > 1 ? ' · os mais antigos primeiro' : ''}</span></div>${corpo}</section>`;

    // Inserções programadas nos próximos 30 dias (grades dos PIs aprovados, programados e faturados)
    const h = new Date(S.today() + 'T12:00'), d30 = Array.from({ length:30 }, (_, i) => iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + i))), ins = d30.map(() => 0);
    S.db.pis.filter(p => ['aprovado', 'programado', 'faturado'].includes(p.status)).forEach(p => (p.dados.grids || []).forEach(g => (g.items || []).forEach(it => Object.entries(it.days || {}).forEach(([dia, n]) => {
      const i = d30.indexOf(`${g.period}-${String(dia).padStart(2, '0')}`); if (i >= 0) ins[i] += Number(n) || 0; }))));
    const mx = Math.max(1, ...ins), totIns = ins.reduce((s, n) => s + n, 0);
    const grade = `<section class="card" aria-labelledby="oe-ti"><div class="hd"><h2 id="oe-ti">Inserções programadas</h2><span>próximos 30 dias · ${totIns.toLocaleString('pt-BR')} inserções</span></div>
      ${totIns ? `<div class="oe-ins" role="img" aria-label="Inserções por dia nos próximos 30 dias: ${totIns} no total">${ins.map((n, i) => `<i class="${i ? '' : 'hoje'}" style="height:${Math.max(n ? 4 : 0, n / mx * 100)}%;--i:${i}" title="${S.dfmt(d30[i]).slice(0, 5)}: ${n} inserç${n === 1 ? 'ão' : 'ões'}"></i>`).join('')}</div>
        <div class="oe-ins-x"><span>Hoje</span><span>+15 dias</span><span>+30 dias</span></div>` : '<p class="muted">Nenhuma inserção nas grades dos PIs aprovados e programados para os próximos 30 dias.</p>'}</section>`;

    return { title:`<span class="sub">${esc(S.veh().nome)}</span>OPEC`, actions:'', body:esteira + listaCard + grade };
  };
  S.actions.opEtapa = d => { if (etapa === d.v) return; etapa = d.v; S.flip(S.render); };
})();

// SONVI · OPEC: confere os PIs enviados pelo comercial, aprova ou devolve, e marca o que já foi programado.
(() => {
  const { esc, brl } = S;
  // Inserções da rádio e, se houver, publicações digitais (com quantas ainda estão sem data)
  const qtd = (p, c) => `${c.ins}${c.pub ? ` + ${c.pub} pub.` : ''}${c.pub && ['aprovado'].includes(p.status) && S.piEntregasPendentes && S.piEntregasPendentes(p) ? `<small class="muted" style="display:block">${S.piEntregasPendentes(p)} sem data</small>` : ''}`;
  const mesesDe = p => [...new Set([...p.dados.grids, ...(p.dados.digital || [])].map(g => g.period))].sort().map(x => x.split('-').reverse().join('/')).join(', ');
  S.views.opec = () => {
    const list = (status, buttons, empty) => {
      const pis = S.db.pis.filter(p => p.status === status).sort((a, b) => a.numero - b.numero);
      if (!pis.length) return `<p class="muted">${empty}</p>`;
      // Celular: um cartão por PI, com tudo à vista e os botões em largura cheia
      if (S.celular) return `<div class="op-cards">${pis.map(p => { const c = S.calc(p), meses = mesesDe(p), b = buttons(p);
        return `<div class="op-card"><a data-go="/pi/${p.id}" class="op-tit"><small>${S.piNo(p)}</small><b>${esc(p.titulo) || 'Sem título'}</b></a>
          <dl><div><dt>Cliente</dt><dd>${esc(S.nome(p.cliente_id)) || '—'}</dd></div><div><dt>Consultor</dt><dd>${esc(S.usuario(p.consultor_id)) || '—'}</dd></div>
          <div><dt>Período</dt><dd>${meses || '—'}</dd></div><div><dt>Inserções</dt><dd class="num">${qtd(p, c)}</dd></div><div><dt>Total</dt><dd class="num"><b>${brl(c.total)}</b></dd></div></dl>
          ${b ? `<div class="op-bt">${b}</div>` : ''}</div>`; }).join('')}</div>`;
      return `<div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Consultor</th><th>Período</th><th class="r">Inserções</th><th class="r">Total</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${pis.map(p => { const c = S.calc(p);
        return `<tr><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}" style="color:var(--ink)"><b>${esc(p.titulo) || 'Sem título'}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td>${esc(S.usuario(p.consultor_id))}</td><td class="nw">${mesesDe(p)}</td><td class="r">${qtd(p, c)}</td><td class="r">${brl(c.total)}</td><td class="r"><span class="lin-acoes">${buttons(p)}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    };
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>OPEC`, actions:'',
      body:`<div class="tiles">${['opec', 'aprovado', 'programado'].map((st, i) => { const l = S.db.pis.filter(p => p.status === st); return `<div class="tile${i ? '' : ' hero'}"><small>${['Para conferir', 'Aprovados', 'Programados'][i]}</small><b>${l.length}</b><span>${brl(l.reduce((s, p) => s + Number(p.valor_total || 0), 0)).replace(/,00$/, '')}</span></div>`; }).join('')}</div>
        <div class="card"><h2>Para conferir</h2>${list('opec', p => `<button class="btn sm warn" data-act="piReturn" data-id="${p.id}">Devolver</button> <button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="aprovado">Aprovar</button>`, 'Nenhum pedido aguardando conferência.')}</div>
        <div class="card"><h2>Aprovados, aguardando programação</h2>${list('aprovado', p => `<button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="programado">Marcar como programado</button>`, 'Nenhum pedido aprovado na fila.')}</div>
        <div class="card"><h2>Programados</h2>${list('programado', () => '', 'Nenhum pedido programado.')}</div>` };
  };
})();

// SONVI · OPEC: confere os PIs enviados pelo comercial, aprova ou devolve, e marca o que já foi programado.
(() => {
  const { esc, brl } = S;
  S.views.opec = () => {
    const list = (status, buttons, empty) => {
      const pis = S.db.pis.filter(p => p.status === status).sort((a, b) => a.numero - b.numero);
      if (!pis.length) return `<p class="muted">${empty}</p>`;
      return `<div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Consultor</th><th>Período</th><th class="r">Inserções</th><th class="r">Total</th><th></th></tr></thead><tbody>${pis.map(p => { const c = S.calc(p);
        return `<tr><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}"><b>${esc(p.titulo)}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td>${esc(S.usuario(p.consultor_id))}</td><td>${[...new Set(p.dados.grids.map(g => g.period.split('-').reverse().join('/')))].join(', ')}</td><td class="r">${c.ins}</td><td class="r">${brl(c.total)}</td><td class="r" style="white-space:nowrap">${buttons(p)}</td></tr>`; }).join('')}</tbody></table></div>`;
    };
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>OPEC`, actions:'',
      body:`<div class="card"><h3>Para conferir</h3>${list('opec', p => `<button class="btn sm" data-act="piReturn" data-id="${p.id}">Devolver</button> <button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="aprovado">Aprovar</button>`, 'Nenhum pedido aguardando conferência.')}</div>
        <div class="card"><h3>Aprovados, aguardando programação</h3>${list('aprovado', p => `<button class="btn sm pri" data-act="piStatus" data-id="${p.id}" data-to="programado">Marcar como programado</button>`, 'Nenhum pedido aprovado na fila.')}</div>
        <div class="card"><h3>Programados</h3>${list('programado', () => '', 'Nenhum pedido programado.')}</div>` };
  };
})();

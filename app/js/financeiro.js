// SONVI · financeiro: fatura os PIs aprovados e acompanha o que a rádio tem a receber e a pagar.
(() => {
  const { esc, brl, dfmt } = S;
  let filtro = 'aberto';

  S.views.financeiro = () => {
    const hoje = S.today(), L = S.db.lancamentos, val = l => l.reduce((s, x) => s + Number(x.valor), 0);
    const rec = L.filter(l => l.sentido === 'receber'), pag = L.filter(l => l.sentido === 'pagar');
    const vencido = l => !l.pago_em && l.vencimento && l.vencimento < hoje;
    const tile = (l, v, h) => `<div class="tile"><small>${l}</small><b>${brl(v)}</b><span>${h}</span></div>`;
    const aFaturar = S.db.pis.filter(p => ['aprovado', 'programado'].includes(p.status));
    const lista = L.filter(l => filtro === 'todos' || (filtro === 'aberto' ? !l.pago_em : filtro === 'vencido' ? vencido(l) : l.pago_em)).sort((a, b) => (a.vencimento || '9').localeCompare(b.vencimento || '9'));
    const linha = l => `<tr><td>${dfmt(l.vencimento)}</td><td>${S.tag(l.sentido === 'receber' ? 'A receber' : 'A pagar', l.sentido === 'receber' ? 'green' : 'orange')}</td><td><b>${esc(l.contraparte)}</b><div class="muted small">${esc(l.descricao)} · parcela ${l.parcela}</div></td><td>${esc(l.forma)}</td><td class="r"><b>${brl(l.valor)}</b></td>
      <td>${l.pago_em ? S.tag('Pago em ' + dfmt(l.pago_em), 'green') : vencido(l) ? S.tag('Vencido', 'red') : S.tag('Em aberto', 'gray')}</td>
      <td class="r"><button class="btn sm${l.pago_em ? '' : ' pri'}" data-act="finPago" data-id="${l.id}">${l.pago_em ? 'Desfazer' : l.sentido === 'receber' ? 'Marcar recebido' : 'Marcar pago'}</button></td></tr>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Financeiro`, actions:'',
      body:`<div class="tiles">${tile('A receber', val(rec.filter(l => !l.pago_em)), `${rec.filter(l => !l.pago_em).length} parcelas em aberto`)}${tile('Vencido', val(rec.filter(vencido)), `${rec.filter(vencido).length} parcelas atrasadas`)}${tile('Recebido', val(rec.filter(l => l.pago_em)), `${rec.filter(l => l.pago_em).length} parcelas`)}${tile('A pagar', val(pag.filter(l => !l.pago_em)), 'comissões de agência')}</div>
        <div class="card"><h3>Pedidos a faturar</h3>${aFaturar.length ? `<div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Status</th><th class="r">Total</th><th class="r">Líquido da rádio</th><th></th></tr></thead><tbody>${aFaturar.map(p => { const c = S.calc(p); return `<tr><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><a data-go="/pi/${p.id}"><b>${esc(p.titulo)}</b></a></td><td>${esc(S.nome(p.cliente_id))}</td><td>${S.pill(p.status)}</td><td class="r">${brl(c.total)}</td><td class="r">${brl(c.net)}</td><td class="r"><button class="btn sm pri" data-act="finFaturar" data-id="${p.id}">Faturar</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Nenhum pedido aguardando faturamento.</p>'}</div>
        <div class="seg">${[['aberto', 'Em aberto'], ['vencido', 'Vencidos'], ['pago', 'Pagos'], ['todos', 'Todos']].map(([k, n]) => `<button class="${filtro === k ? 'on' : ''}" data-act="finFiltro" data-tab="${k}">${n}</button>`).join('')}</div>
        <div class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>De / para</th><th>Forma</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map(linha).join('')}</tbody></table></div>` : '<div class="empty"><b>Nenhum lançamento</b>As parcelas aparecem aqui quando um PI é faturado.</div>'}</div>` };
  };

  Object.assign(S.actions, {
    finFiltro: d => { filtro = d.tab; S.render(); },
    // Mostra as parcelas que serão geradas e grava tudo de uma vez
    finFaturar: d => { const pi = S.db.pis.find(p => p.id === d.id), ls = S.lancamentosDoPi(pi);
      S.dialog(`<h2>Faturar ${S.piNo(pi)}</h2><p class="muted">${esc(pi.titulo)} · ${esc(S.nome(pi.cliente_id))}</p>
        <table><thead><tr><th>Tipo</th><th>De / para</th><th>Parc.</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody>${ls.map(l => `<tr><td>${l.sentido === 'receber' ? 'Receber' : 'Pagar'}</td><td>${esc(l.contraparte)}</td><td>${l.parcela}</td><td>${dfmt(l.vencimento)}</td><td class="r">${brl(l.valor)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Este PI não gera valores para a rádio.</td></tr>'}</tbody></table>
        ${ls.some(l => !l.vencimento) ? '<p class="note">Há parcelas sem vencimento. Defina o 1º vencimento na aba Faturamento do PI, se quiser.</p>' : ''}
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Confirmar faturamento</button></div>`,
        () => S.run(async () => { const r = await S.q(S.sb.rpc('faturar_pi', { p_pi:pi.id, p_lancamentos:ls })); Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id];
          S.db.lancamentos = await S.q(S.sb.from('lancamentos').select('*').eq('veiculo_id', S.ui.vehicleId)); }, `${S.piNo(pi)} faturado`)); },
    finPago: d => { const l = S.db.lancamentos.find(x => x.id === d.id); S.run(() => S.salvar('lancamentos', { id:l.id, pago_em:l.pago_em ? null : S.today() })); }
  });
})();

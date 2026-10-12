// SONVI · painel: visão geral da rádio selecionada, conforme o perfil de quem está logado.
(() => {
  const { esc, brl, dfmt } = S;
  S.views.painel = () => {
    const pis = S.db.pis, hoje = S.today();
    const soma = list => list.reduce((s, p) => s + Number(p.valor_total), 0), por = (...st) => pis.filter(p => st.includes(p.status));
    const tile = (label, value, hint) => `<div class="tile"><small>${label}</small><b>${value}</b><span>${hint}</span></div>`;
    const draft = por('rascunho', 'devolvido'), opec = por('opec'), open = por('aprovado', 'programado'), billed = por('faturado');
    const tiles = [
      tile('Em negociação', brl(soma(draft)), `${draft.length} em rascunho ou devolvidos`),
      tile('Na OPEC', opec.length, `${brl(soma(opec))} aguardando conferência`),
      tile('A faturar', brl(soma(open)), `${open.length} aprovados ou programados`),
      tile('Faturado', brl(soma(billed)), `${billed.length} ${billed.length === 1 ? 'pedido' : 'pedidos'}`)];
    if (S.pode('diretor', 'financeiro')) {
      const rec = S.db.lancamentos.filter(l => l.sentido === 'receber'), aberto = rec.filter(l => !l.pago_em), vencido = aberto.filter(l => l.vencimento && l.vencimento < hoje);
      const val = l => l.reduce((s, x) => s + Number(x.valor), 0);
      tiles.push(tile('A receber', brl(val(aberto)), `${aberto.length} parcelas em aberto`), tile('Vencido', brl(val(vencido)), `${vencido.length} parcelas atrasadas`));
    }
    const rows = list => list.map(p => `<tr class="click" data-go="/pi/${p.id}"><td class="muted" style="white-space:nowrap">${S.piNo(p)}</td><td><b>${esc(p.titulo) || 'Sem título'}</b></td><td>${esc(S.nome(p.cliente_id))}</td><td>${S.pill(p.status)}</td><td>${dfmt(p.prazo)}</td><td class="r">${brl(p.valor_total)}</td></tr>`).join('');
    const table = (title, list, empty) => `<div class="card"><h3>${title}</h3>${list.length ? `<div class="scroll"><table><thead><tr><th>Nº</th><th>Título</th><th>Cliente</th><th>Status</th><th>Prazo</th><th class="r">Total</th></tr></thead><tbody>${rows(list)}</tbody></table></div>` : `<p class="muted">${empty}</p>`}</div>`;

    // Desempenho por consultor: só para quem acompanha a equipe
    let equipe = '';
    if (S.pode('diretor', 'gerente')) {
      const linhas = S.consultores().map(u => {
        const meus = pis.filter(p => p.consultor_id === u.id && !['cancelado', 'rascunho', 'devolvido'].includes(p.status)), ag = S.db.agenda.filter(a => a.consultor_id === u.id);
        const atras = ag.filter(a => !a.realizado && S.dia(a.quando) < hoje).length;
        return { u, vendido:soma(meus), n:meus.length, feitas:ag.filter(a => a.realizado).length, plan:ag.length, atras };
      }).sort((a, b) => b.vendido - a.vendido);
      equipe = `<div class="card"><h3>Consultores</h3>${linhas.length ? `<div class="scroll"><table><thead><tr><th>Consultor</th><th class="r">PIs enviados</th><th class="r">Valor vendido</th><th class="r">Visitas realizadas</th><th class="r">Atrasadas</th></tr></thead><tbody>${linhas.map(l => `<tr><td><b>${esc(l.u.nome || l.u.email)}</b></td><td class="r">${l.n}</td><td class="r">${brl(l.vendido)}</td><td class="r">${l.feitas} de ${l.plan}</td><td class="r">${l.atras ? S.tag(l.atras, 'red') : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum consultor vinculado a esta rádio.</p>'}</div>`;
    }
    const meusHoje = S.db.agenda.filter(a => !a.realizado && S.dia(a.quando) <= hoje && (!S.pode('consultor') || a.consultor_id === S.me.id));
    const lembrete = meusHoje.length && S.pode('diretor', 'gerente', 'consultor') ? `<div class="note info"><b>${meusHoje.length} ${meusHoje.length === 1 ? 'compromisso' : 'compromissos'} para hoje ou em atraso.</b> <a data-go="/agenda">Abrir a agenda</a></div>` : '';
    return { title:`<span class="sub">${esc(S.veh().nome)} · ${S.PERFIS[S.perfil]}</span>Painel`, actions:S.pode('diretor', 'gerente', 'consultor') ? '<button class="btn pri" data-act="piNew">Novo PI</button>' : '',
      body:`${lembrete}<div class="tiles">${tiles.join('')}</div>${S.pode('diretor', 'opec', 'gerente') ? table('Aguardando a OPEC', opec, 'Nenhum pedido aguardando conferência.') : ''}${equipe}
        ${table('Pedidos recentes', pis.slice().sort((a, b) => b.numero - a.numero).slice(0, 6), 'Nenhum pedido ainda.')}` };
  };
})();

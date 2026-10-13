// SONVI · painel: visão geral da rádio selecionada, conforme o perfil de quem está logado.
// Diretor e gerente veem vendas, o caminho dos PIs, a equipe e a fila da OPEC; o consultor vê o próprio dia;
// a OPEC vê a sua fila e o financeiro, o que tem a receber.
(() => {
  const { esc, brl, dfmt } = S;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];          // PI que saiu do comercial conta como venda
  const soma = list => list.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  const val = list => list.reduce((s, x) => s + Number(x.valor || 0), 0);
  const mesDe = iso => String(iso || '').slice(0, 7);
  const mesAnt = m => { const [y, mm] = m.split('-').map(Number), d = new Date(y, mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  // Valores grandes ficam curtos nos cartões: R$ 284,6 mil
  const curto = v => Math.abs(v) >= 100000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mil' : brl(v).replace(/,00$/, '');
  const delta = (agora, antes, sufixo) => {
    if (!antes) return agora ? `<span>novo neste mês</span>` : `<span>sem movimento ainda</span>`;
    const p = Math.round((agora - antes) / antes * 100);
    return `<span class="${p >= 0 ? 'bom' : 'ruim'}">${p >= 0 ? '+' : ''}${p}% ${sufixo}</span>`;
  };
  const tile = (label, value, hint, hero) => `<div class="tile${hero ? ' hero' : ''}"><small>${label}</small><b>${value}</b>${hint}</div>`;
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const primeiro = n => String(n || '').trim().split(/\s+/)[0];
  const hojeExtenso = () => { const d = new Date(); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()]}`; };

  // ---------- blocos ----------
  // Vendas das últimas 8 semanas (segunda a domingo), pela data em que o PI foi criado
  function vendasPorSemana(pis) {
    const seg = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const base = seg(new Date()), semanas = Array.from({ length:8 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() - (7 - i) * 7); return d; });
    const vals = semanas.map((ini, i) => { const fim = new Date(ini); fim.setDate(fim.getDate() + 7);
      return soma(pis.filter(p => VENDIDO.includes(p.status) && new Date(p.criado_em) >= ini && new Date(p.criado_em) < fim)); });
    const max = Math.max(...vals, 1);
    const k = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits:v >= 10000 ? 0 : 1 }) : Math.round(v);
    return `<section class="card"><div class="hd"><h2>Vendas por semana</h2><span>em R$ mil</span></div>
      <div class="bars" role="img" aria-label="Vendas das últimas 8 semanas">${vals.map((v, i) => `<div class="${i === 7 ? 'on' : ''}"><b>${v ? k(v) : ''}</b><i style="height:${Math.max(2, v / max * 150)}px;--i:${i}"></i></div>`).join('')}</div>
      <div class="bars-x">${semanas.map((d, i) => `<span>${i === 7 ? 'Esta' : d.getDate() + ' ' + MESES[d.getMonth()]}</span>`).join('')}</div></section>`;
  }

  // Quantos PIs estão em cada etapa, com o valor parado em cada uma
  function caminho(pis) {
    const etapas = ['rascunho', 'opec', 'devolvido', 'aprovado', 'programado', 'faturado'].map(s => { const l = pis.filter(p => p.status === s); return { s, n:l.length, v:soma(l) }; });
    const total = etapas.reduce((t, e) => t + e.n, 0);
    return `<section class="card"><div class="hd"><h2>Caminho dos PIs</h2><a data-go="/pis">Ver todos</a></div>
      ${total ? `<div class="stack" role="img" aria-label="Distribuição dos PIs por etapa">${etapas.filter(e => e.n).map(e => `<i style="flex:${e.n};background:${S.STATUS_COR[e.s]}"></i>`).join('')}</div>` : ''}
      <div class="legend">${etapas.map(e => `<a data-go="/pis"><span class="sq" style="background:${S.STATUS_COR[e.s]}"></span><span class="grow">${S.STATUS[e.s].label}</span><span class="muted num">${e.n ? brl(e.v).replace(/,00$/, '') : '—'}</span><span class="n">${e.n}</span></a>`).join('')}</div></section>`;
  }

  // Desempenho de cada consultor: visitas feitas / planejadas no mês e quanto vendeu
  function consultores(pis) {
    const m = mesDe(S.today());
    const linhas = S.consultores().map(u => {
      const meus = pis.filter(p => p.consultor_id === u.id && VENDIDO.includes(p.status) && mesDe(p.criado_em) === m);
      const ag = S.db.agenda.filter(a => a.consultor_id === u.id && mesDe(a.quando) === m);
      return { u, vendido:soma(meus), n:meus.length, feitas:ag.filter(a => a.realizado).length, plan:ag.length };
    }).sort((a, b) => b.vendido - a.vendido);
    return `<section class="card"><div class="hd"><h2>Consultores</h2><span>visitas feitas / planejadas no mês</span></div>
      ${linhas.length ? `<div class="people">${linhas.map((l, i) => { const r = l.plan ? l.feitas / l.plan : 0;
        return `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(l.u.nome || l.u.email))}</span>
          <div class="who"><div><b>${esc(l.u.nome || l.u.email)}</b><span class="muted small num">${l.feitas} / ${l.plan}</span></div><div class="prog"><i class="${l.plan && r < .6 ? 'ruim' : ''}" style="width:${Math.round(r * 100)}%;--i:${i}"></i></div></div>
          <div class="val"><b class="num">${curto(l.vendido)}</b><span class="muted small">${l.n} ${l.n === 1 ? 'PI' : 'PIs'}</span></div></div>`; }).join('')}</div>`
        : '<p class="muted">Nenhum consultor vinculado a esta rádio.</p>'}</section>`;
  }

  // Lista de PIs (fila da OPEC, últimos pedidos…)
  const fila = (titulo, lista, vazio, link) => `<section class="card"><div class="hd"><h2>${titulo}</h2>${link || ''}</div>
    ${lista.length ? `<div class="list">${lista.map(p => { const h = Math.floor((Date.now() - new Date(p.atualizado_em || p.criado_em)) / 864e5);
      return `<a data-go="/pi/${p.id}"><span class="ic">${S.svg('doc')}</span><span class="tx"><b>${esc(S.nome(p.cliente_id)) || esc(p.titulo) || 'Sem cliente'}</b><small>${S.piNo(p)}${S.pode('consultor') ? '' : ' · ' + esc(S.usuario(p.consultor_id))}</small></span>
        <span class="vl"><b class="num">${brl(p.valor_total)}</b>${p.status === 'opec' ? `<span class="pill" style="--tone:var(--${h >= 2 ? 'orange' : 'gray'})">${h < 1 ? 'Hoje' : h === 1 ? 'Há 1 dia' : `Há ${h} dias`}</span>` : S.pill(p.status)}</span></a>`; }).join('')}</div>`
      : `<p class="muted">${vazio}</p>`}</section>`;

  // ---------- telas por perfil ----------
  function gestao(pis) {
    const m = mesDe(S.today()), ant = mesAnt(m), doMes = mm => pis.filter(p => VENDIDO.includes(p.status) && mesDe(p.criado_em) === mm);
    const agora = doMes(m), antes = doMes(ant), opec = pis.filter(p => p.status === 'opec');
    const tiles = [
      tile('Vendido no mês', curto(soma(agora)), delta(soma(agora), soma(antes), 'vs. mês passado'), true),
      tile('PIs fechados', agora.length, antes.length ? `<span class="${agora.length >= antes.length ? 'bom' : 'ruim'}">${agora.length - antes.length >= 0 ? '+' : ''}${agora.length - antes.length} vs. mês passado</span>` : '<span>neste mês</span>')];
    if (S.pode('diretor')) {
      const rec = S.db.lancamentos.filter(l => l.sentido === 'receber'), aberto = rec.filter(l => !l.pago_em), venc = aberto.filter(l => l.vencimento && l.vencimento < S.today());
      const pct = val(rec) ? val(venc) / val(rec) * 100 : 0;
      tiles.push(tile('A receber', curto(val(aberto)), `<span>${aberto.length} ${aberto.length === 1 ? 'parcela' : 'parcelas'} em aberto</span>`),
        tile('Inadimplência', pct.toLocaleString('pt-BR', { maximumFractionDigits:1 }) + '%', venc.length ? `<span class="ruim">${curto(val(venc))} vencidos</span>` : '<span class="bom">nada vencido</span>'));
    } else {
      const neg = pis.filter(p => ['rascunho', 'devolvido'].includes(p.status));
      tiles.push(tile('Na OPEC', opec.length, `<span>${curto(soma(opec))} aguardando</span>`), tile('Em negociação', curto(soma(neg)), `<span>${neg.length} em rascunho ou devolvidos</span>`));
    }
    return `<div class="tiles">${tiles.join('')}</div>
      <div class="cols">${vendasPorSemana(pis)}${caminho(pis)}</div>
      <div class="cols">${consultores(pis)}${fila('Esperando a OPEC', opec.sort((a, b) => a.numero - b.numero).slice(0, 6), 'Nenhum PI aguardando conferência.', S.pode('diretor') ? '<a data-go="/opec">Abrir fila</a>' : '')}</div>`;
  }

  function consultor(pis) {
    const hoje = S.today(), m = mesDe(hoje), meus = pis.filter(p => p.consultor_id === S.me.id);
    const ag = S.db.agenda.filter(a => a.consultor_id === S.me.id).sort((a, b) => a.quando.localeCompare(b.quando));
    const abertos = ag.filter(a => !a.realizado), atras = abertos.filter(a => S.dia(a.quando) < hoje), deHoje = abertos.filter(a => S.dia(a.quando) === hoje);
    const prox = deHoje.find(a => new Date(a.quando) >= new Date(Date.now() - 36e5)) || deHoje[0] || abertos.find(a => S.dia(a.quando) > hoje);
    const cli = prox && S.pessoa(prox.cliente_id), TIPO = { visita:'Visita', retorno:'Retorno', reuniao:'Reunião' };
    const endereco = cli && [cli.endereco, cli.cidade].filter(Boolean).join(', ');
    const proximo = prox ? `<section class="next" aria-label="Próximo compromisso"><div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <span class="quando">${S.dia(prox.quando) === hoje ? 'Próximo' : dfmt(S.dia(prox.quando))} · ${S.hora(prox.quando)}</span>
      <div><h2>${esc(S.nome(prox.cliente_id)) || TIPO[prox.tipo]}</h2><p>${esc(prox.assunto) || TIPO[prox.tipo]}</p></div>
      <div class="row"><button class="btn grow" data-act="agFeito" data-id="${prox.id}">Registrar ${TIPO[prox.tipo].toLowerCase()}</button>${endereco ? `<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}" target="_blank" rel="noopener">${S.svg('rota')}Rota</a>` : ''}</div></section>`
      : `<section class="card empty"><b>Agenda livre</b>Nenhum compromisso marcado. <a data-act="agNovo">Agendar visita</a></section>`;
    const lembretes = atras.length ? `<div class="note info"><b>${atras.length} ${atras.length === 1 ? 'retorno atrasado' : 'retornos atrasados'}:</b> ${atras.slice(0, 3).map(a => esc(S.nome(a.cliente_id)) || esc(a.assunto)).join(', ')}. <a data-go="/agenda">Ver na agenda</a></div>` : '';
    const vendidos = meus.filter(p => VENDIDO.includes(p.status) && mesDe(p.criado_em) === m), agMes = ag.filter(a => mesDe(a.quando) === m);
    const depois = deHoje.filter(a => a !== prox);
    return `${lembretes}${proximo}
      <div class="tiles">${tile('Vendido no mês', curto(soma(vendidos)), `<span>${vendidos.length} ${vendidos.length === 1 ? 'PI enviado' : 'PIs enviados'}</span>`)}${tile('Visitas no mês', `${agMes.filter(a => a.realizado).length} / ${agMes.length}`, '<span>feitas / planejadas</span>')}</div>
      ${depois.length ? `<section class="card"><div class="hd"><h2>Depois, hoje</h2><a data-go="/agenda">Agenda</a></div><div class="list">${depois.map(a => `<div><span class="ic" style="font:600 13px var(--display);color:var(--ink)">${S.hora(a.quando)}</span><span class="tx"><b>${esc(S.nome(a.cliente_id)) || TIPO[a.tipo]}</b><small>${esc(a.assunto)}</small></span><span class="pill" style="--tone:var(--gray)">${TIPO[a.tipo]}</span></div>`).join('')}</div></section>` : ''}
      ${fila('Meus PIs', meus.slice().sort((a, b) => b.numero - a.numero).slice(0, 5), 'Você ainda não criou PIs nesta rádio.', '<a data-go="/pis">Ver todos</a>')}`;
  }

  function opec(pis) {
    const por = s => pis.filter(p => p.status === s);
    return `<div class="tiles">${tile('Para conferir', por('opec').length, `<span>${curto(soma(por('opec')))}</span>`, true)}${tile('Aprovados', por('aprovado').length, '<span>aguardando programação</span>')}${tile('Programados', por('programado').length, '<span>no ar ou a entrar</span>')}${tile('Devolvidos', por('devolvido').length, '<span>com o comercial</span>')}</div>
      <div class="cols">${fila('Para conferir', por('opec').sort((a, b) => a.numero - b.numero), 'Nenhum PI aguardando conferência.', '<a data-go="/opec">Abrir fila</a>')}${caminho(pis)}</div>`;
  }

  function financeiro(pis) {
    const hoje = S.today(), rec = S.db.lancamentos.filter(l => l.sentido === 'receber'), aberto = rec.filter(l => !l.pago_em), venc = aberto.filter(l => l.vencimento && l.vencimento < hoje);
    const aFaturar = pis.filter(p => ['aprovado', 'programado'].includes(p.status)), m = mesDe(hoje);
    return `<div class="tiles">${tile('A receber', curto(val(aberto)), `<span>${aberto.length} parcelas em aberto</span>`, true)}${tile('Vencido', curto(val(venc)), venc.length ? `<span class="ruim">${venc.length} atrasadas</span>` : '<span class="bom">nada vencido</span>')}${tile('Recebido no mês', curto(val(rec.filter(l => l.pago_em && mesDe(l.pago_em) === m))), '<span>pagamentos baixados</span>')}${tile('A faturar', curto(soma(aFaturar)), `<span>${aFaturar.length} PIs aprovados</span>`)}</div>
      ${fila('Prontos para faturar', aFaturar, 'Nenhum PI aguardando faturamento.', '<a data-go="/financeiro">Abrir financeiro</a>')}`;
  }

  S.views.painel = () => {
    const pis = S.db.pis, nome = primeiro(S.me.nome) || '';
    const body = S.pode('consultor') ? consultor(pis) : S.pode('opec') ? opec(pis) : S.pode('financeiro') ? financeiro(pis) : gestao(pis);
    return { title:`<span class="sub">${hojeExtenso()}</span>${saudacao()}${nome ? ', ' + esc(nome) : ''}`,
      actions:S.pode('diretor', 'gerente', 'consultor') ? `<button class="btn pri" data-act="piNew">${S.svg('mais')}Novo PI</button>` : '', body };
  };
})();

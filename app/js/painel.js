// SONVI · Dashboard do veículo (tela inicial, antes "Painel"), conforme o perfil de quem está logado.
// Desde 24/10/2026 em sete blocos que se reacomodam (casillero.js, estilos .cx-*): o bloco escolhido vai para o espaço
// grande, mostra o detalhe e o atalho para a tela do assunto. A escolha fica guardada enquanto a pessoa usa o SONVI.
//   Diretor: vendido, Na OPEC, caminho dos PIs, recebido no mês, follow-up da equipe, consultores e propostas.
//   Gerente: igual, com "Em negociação" no lugar do recebido (o gerente não vê o financeiro).
//   Consultor: o próprio vendido, hoje, retornos, visitas, os próprios PIs, carteira esquecida e propostas.
//   OPEC: para conferir, aprovados, caminho, conferidos no mês, programados, devolvidos e chegada por semana.
//   Financeiro: a receber, vencidas, prontos para faturar, recebido no mês, recebimentos, NF pendentes e inadimplência.
(() => {
  const { esc, brl } = S;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];          // PI que saiu do comercial conta como venda
  const ANDAMENTO = ['rascunho', 'opec', 'devolvido', 'aprovado', 'programado'];
  const soma = list => list.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  const val = list => list.reduce((s, x) => s + Number(x.valor || 0), 0);
  const pago = l => Number(l.valor_pago != null && l.valor_pago !== '' ? l.valor_pago : l.valor || 0);
  const mesDe = iso => String(iso || '').slice(0, 7);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const curto = v => Math.abs(v) >= 100000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' mil' : brl(v).replace(/,00$/, '');
  const mil = v => Math.abs(v) >= 1000 ? 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil' : brl(v).replace(/,00$/, '');
  const reais = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const pctTxt = v => v.toLocaleString('pt-BR', { maximumFractionDigits:1 }) + '%';
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const primeiro = n => String(n || '').trim().split(/\s+/)[0];
  const hojeExtenso = () => { const d = new Date(); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESL[d.getMonth()]}`; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Últimos 6 meses (n0 = -5) ou os próximos 6 (n0 = 0), como 'AAAA-MM'
  const meses6 = n0 => { const h = new Date(); return Array.from({ length:6 }, (_, i) => iso(new Date(h.getFullYear(), h.getMonth() + n0 + i, 1)).slice(0, 7)); };
  const rotMes = m => MESES[+m.slice(5) - 1];
  // Últimas 8 semanas (segunda a domingo)
  const semanas8 = () => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return Array.from({ length:8 }, (_, i) => { const ini = new Date(x); ini.setDate(ini.getDate() - (7 - i) * 7); const fim = new Date(ini); fim.setDate(fim.getDate() + 7); return [ini, fim]; }); };
  const ROT_SEM = ['8 sem', '7', '6', '5', '4', '3', '2', 'Esta'];
  const naSemana = (lista, campo) => semanas8().map(([a, b]) => lista.filter(x => x[campo] && new Date(x[campo]) >= a && new Date(x[campo]) < b).length);
  // Últimos 30 dias (hoje inclusive), como 'AAAA-MM-DD'
  const dias30 = () => { const h = new Date(); return Array.from({ length:30 }, (_, i) => iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 29 + i))); };
  const variacao = (agora, antes, rot) => !antes ? (agora ? { txt:'novo neste mês' } : { txt:'sem vendas ainda' })
    : (p => ({ txt:`${p > 0 ? '+' : ''}${p}% ${rot}`, tom:p > 0 ? 'bom' : p < 0 ? 'ruim' : '' }))(Math.round((agora - antes) / antes * 100));
  const diasDesde = d => Math.floor((Date.now() - new Date(d)) / 864e5);
  const haDias = d => { const n = diasDesde(d); return n < 1 ? 'Hoje' : n === 1 ? 'Há 1 dia' : `Há ${n} dias`; };
  const cliente = p => S.nome(p.cliente_id) || p.titulo || 'Sem cliente';
  const TIPO = { visita:'Visita', retorno:'Retorno', reuniao:'Reunião', ligacao:'Ligação', whatsapp:'WhatsApp' };
  const aberto = a => (a.situacao || (a.realizado ? 'realizado' : 'agendado')) === 'agendado';

  // ---------- blocos que mais de um perfil usa ----------
  function vendido(pis, titulo, link) {
    const m6 = meses6(-5), por = m6.map(m => soma(pis.filter(p => VENDIDO.includes(p.status) && mesDe(p.criado_em) === m))), v = por[5], d = variacao(v, por[4], 'vs. ' + MESL[+m6[4].slice(5) - 1]);
    return { tipo:'valor', titulo, icone:'financeiro', valor:reais(v), delta:d, barras:por, rotulos:m6.map(rotMes), link,
      rotulo:`${titulo}: ${reais(v)}. ${d.txt}` };
  }
  function filaPis(lista, b) {
    return Object.assign({ tipo:'fila', numero:String(lista.length), itens:lista.slice(0, 5).map(p => ({ tx:cliente(p), sub:S.piNo(p) + (S.pode('consultor') ? '' : ' · ' + (S.usuario(p.consultor_id) || 'sem consultor')), vl:brl(p.valor_total), tag:b.tag ? b.tag(p) : haDias(p.atualizado_em || p.criado_em), tom:b.tom ? b.tom(p) : diasDesde(p.atualizado_em || p.criado_em) >= 2 ? 'alerta' : '' })) }, b);
  }
  function caminho(pis) {
    const etapas = ['rascunho', 'opec', 'devolvido', 'aprovado', 'programado', 'faturado'].map(s => { const l = pis.filter(p => p.status === s); return { nome:S.STATUS[s].label, n:l.length, vl:l.length ? curto(soma(l)) : '—', cor:S.STATUS_COR[s] }; });
    const n = pis.filter(p => ANDAMENTO.includes(p.status)).length;
    return { tipo:'etapas', titulo:'Caminho dos PIs', icone:'pis', numero:String(n), apoio:n === 1 ? 'PI em andamento' : 'PIs em andamento', etapas, link:{ rota:'/pis', texto:'Ver PIs' },
      rotulo:`Caminho dos PIs: ${n} em andamento. ` + etapas.filter(e => e.n).map(e => `${e.nome} ${e.n}`).join(', ') };
  }
  function recebidoNoMes(titulo) {
    const hoje = S.today(), m = mesDe(hoje), rec = S.db.lancamentos.filter(l => l.sentido === 'receber'), aberto_ = rec.filter(l => !l.pago_em);
    const doMes = rec.filter(l => mesDe(l.vencimento) === m), recebido = doMes.filter(l => l.pago_em).reduce((s, l) => s + pago(l), 0), previsto = val(doMes);
    const venc = aberto_.filter(l => l.vencimento && l.vencimento < hoje), inad = val(rec) ? val(venc) / val(rec) * 100 : 0, p = previsto ? recebido / previsto * 100 : 0;
    return { tipo:'anel', titulo, icone:'relatorio', pct:p, numero:reais(recebido), apoio:previsto ? `de ${reais(previsto)} que vencem em ${MESL[new Date().getMonth()]}` : `nada vence em ${MESL[new Date().getMonth()]}`,
      linhas:[['A receber (em aberto)', reais(val(aberto_))], ['Vencido', reais(val(venc)), venc.length ? 'ruim' : 'bom'], ['Inadimplência', pctTxt(inad), inad ? 'ruim' : ''], ['Parcelas em aberto', String(aberto_.length)]],
      link:{ rota:'/vendas', texto:'Vendas' }, rotulo:`${titulo}: ${Math.round(p)}%, ${reais(recebido)} de ${reais(previsto)}` };
  }
  function followup(ag, titulo, rotNota) {
    const agora = new Date(), atras = ag.filter(a => aberto(a) && new Date(a.quando) < agora && S.dia(a.quando) < S.today()), d30 = dias30();
    const feitos = ag.filter(a => S.fuFeito(a) && (a.registrado_em || a.quando)), por = d30.map(d => feitos.filter(a => S.dia(a.registrado_em || a.quando) === d).length), tot = por.reduce((s, n) => s + n, 0);
    return { tipo:'tira', titulo, vivo:atras.length ? 'alerta' : false, icone:'followup', titular:atras.length ? plural(atras.length, 'atrasado', 'atrasados') : 'Tudo em dia', tom:atras.length ? 'alerta' : 'bom',
      dias:por, nota:`${plural(tot, 'contato', 'contatos')} ${rotNota || 'nos últimos 30 dias'}`, link:{ rota:'/followup', texto:'Follow-up' },
      rotulo:`${titulo}: ${atras.length ? plural(atras.length, 'contato atrasado', 'contatos atrasados') : 'tudo em dia'}. ${tot} contatos nos últimos 30 dias` };
  }
  function propostas(lista, titulo) {
    const hoje = S.today(), aguardando = lista.filter(p => p.situacao === 'enviada' && S.propVence(p) >= hoje), resp = lista.filter(p => ['aprovada', 'recusada'].includes(p.situacao));
    const taxa = pct(resp.filter(p => p.situacao === 'aprovada').length, resp.length), por = naSemana(lista, 'criado_em');
    return { tipo:'colunas', titulo, icone:'propostas', numero:String(aguardando.length), nota:`aguardando resposta${resp.length ? ` · ${taxa}% aprovadas` : ''}`, barras:por, rotulos:ROT_SEM,
      link:{ rota:'/propostas', texto:'Propostas' }, rotulo:`${titulo}: ${aguardando.length} aguardando resposta${resp.length ? `, ${taxa}% aprovadas` : ''}. Criadas por semana: ${por.join(', ')}` };
  }

  // ---------- os blocos de cada perfil ----------
  function gestao(pis) {
    const m = mesDe(S.today()), opec = pis.filter(p => p.status === 'opec').sort((a, b) => String(a.atualizado_em || a.criado_em).localeCompare(String(b.atualizado_em || b.criado_em)));
    const dir = S.pode('diretor'), neg = pis.filter(p => ['rascunho', 'devolvido'].includes(p.status)).sort((a, b) => b.numero - a.numero);
    const cons = S.consultores().map(u => {
      const meus = pis.filter(p => p.consultor_id === u.id && VENDIDO.includes(p.status) && mesDe(p.criado_em) === m), ag = S.db.agenda.filter(a => a.consultor_id === u.id && mesDe(a.quando) === m);
      return { u, v:soma(meus), n:meus.length, feitas:ag.filter(a => S.fuFeito(a)).length, plan:ag.length }; }).sort((a, b) => b.v - a.v);
    return [
      Object.assign(vendido(pis, 'Vendido no mês', { rota:'/pis', texto:'Ver PIs' }), { id:'a' }),
      filaPis(opec, { id:'b', titulo:'Na OPEC', vivo:opec.length ? true : false, icone:'opec', apoio:opec.length ? `${reais(soma(opec))} aguardando` : 'Nenhum PI aguardando', vazio:'Nenhum PI aguardando conferência.',
        link:dir ? { rota:'/opec', texto:'Abrir fila' } : { rota:'/pis', texto:'Ver PIs' }, rotulo:`Na OPEC: ${plural(opec.length, 'PI', 'PIs')}, ${reais(soma(opec))} aguardando` }),
      Object.assign(caminho(pis), { id:'c' }),
      dir ? Object.assign(recebidoNoMes('Recebido no mês'), { id:'d' })
        : filaPis(neg, { id:'d', titulo:'Em negociação', icone:'propostas', apoio:`${reais(soma(neg))} em rascunho ou devolvidos`, vazio:'Nenhum PI em rascunho ou devolvido.', tag:p => S.STATUS[p.status].label, tom:p => p.status === 'devolvido' ? 'alerta' : '',
          link:{ rota:'/pis', texto:'Ver PIs' }, rotulo:`Em negociação: ${plural(neg.length, 'PI', 'PIs')}, ${reais(soma(neg))}` }),
      Object.assign(followup(S.db.agenda, 'Follow-up da equipe'), { id:'e' }),
      { id:'f', tipo:'pessoas', titulo:'Consultores', icone:'clientes', cuenta:plural(cons.length, 'consultor', 'consultores'), vazio:'Nenhum consultor neste veículo.',
        itens:cons.map(c => ({ nome:c.u.nome || c.u.email, sub:`${c.feitas} / ${c.plan} contatos · ${plural(c.n, 'PI', 'PIs')}`, vl:mil(c.v), ok:c.n > 0 })),
        link:{ rota:'/followup', texto:'Equipe' }, rotulo:'Consultores no mês: ' + (cons.map(c => `${c.u.nome || c.u.email} ${mil(c.v)}`).join(', ') || 'nenhum') },
      Object.assign(propostas(S.db.propostas || [], 'Propostas'), { id:'g' }) ];
  }

  function consultor(pis) {
    const hoje = S.today(), m = mesDe(hoje), meus = pis.filter(p => p.consultor_id === S.me.id), ag = S.db.agenda.filter(a => a.consultor_id === S.me.id);
    const deHoje = ag.filter(a => aberto(a) && S.dia(a.quando) === hoje).sort((a, b) => a.quando.localeCompare(b.quando));
    const prox = deHoje.find(a => new Date(a.quando) >= new Date(Date.now() - 36e5)) || deHoje[0];
    const agMes = ag.filter(a => mesDe(a.quando) === m), feitas = agMes.filter(a => S.fuFeito(a)), resp = r => String(feitas.filter(a => a.resposta === r).length);
    const andam = meus.filter(p => ANDAMENTO.includes(p.status)).sort((a, b) => b.numero - a.numero), naOpec = andam.filter(p => p.status === 'opec').length, dev = andam.filter(p => p.status === 'devolvido').length;
    const esq = S.fuEsquecidos ? S.fuEsquecidos(S.me.id) : [];
    return [
      Object.assign(vendido(meus, 'Meu vendido no mês', { rota:'/pis', texto:'Meus PIs' }), { id:'a' }),
      { id:'b', tipo:'fila', titulo:'Hoje', vivo:deHoje.length ? true : false, icone:'agenda', numero:String(deHoje.length), apoio:prox ? `Próximo: ${S.hora(prox.quando)} · ${S.nome(prox.cliente_id) || TIPO[prox.tipo] || 'Contato'}` : 'Agenda livre hoje',
        itens:deHoje.map(a => ({ tx:S.nome(a.cliente_id) || TIPO[a.tipo] || 'Contato', sub:[TIPO[a.tipo], a.assunto].filter(Boolean).join(' · '), vl:S.hora(a.quando) })), vazio:'Nenhum contato marcado para hoje.',
        link:{ rota:'/followup', texto:'Follow-up' }, rotulo:`Hoje: ${plural(deHoje.length, 'contato', 'contatos')}${prox ? `, o próximo às ${S.hora(prox.quando)}` : ''}` },
      Object.assign(followup(ag, 'Retornos'), { id:'c' }),
      { id:'d', tipo:'anel', titulo:'Contatos no mês', icone:'agenda', pct:agMes.length ? feitas.length / agMes.length * 100 : 0, numero:`${feitas.length} de ${agMes.length}`, apoio:'contatos feitos',
        linhas:[['Interessados', resp('interessado')], ['Pediram proposta', resp('proposta')], ['Fecharam', resp('fechou'), 'bom'], ['Sem interesse', resp('sem_interesse')]],
        link:{ rota:'/followup', texto:'Follow-up' }, rotulo:`Contatos no mês: ${feitas.length} de ${agMes.length} feitos` },
      filaPis(andam, { id:'e', titulo:'Meus PIs', icone:'pis', apoio:[naOpec ? `${naOpec} na OPEC` : '', dev ? plural(dev, 'devolvido', 'devolvidos') : ''].filter(Boolean).join(' · ') || 'em andamento', vazio:'Nenhum PI em andamento.',
        tag:p => S.STATUS[p.status].label, tom:p => p.status === 'devolvido' ? 'alerta' : '', link:{ rota:'/pis', texto:'Ver PIs' }, rotulo:`Meus PIs em andamento: ${andam.length}` }),
      { id:'f', tipo:'pessoas', titulo:'Carteira esquecida', icone:'clientes', cuenta:plural(esq.length, 'cliente', 'clientes'), vazio:'Todos os clientes com contato recente.',
        itens:esq.map(e => ({ nome:e.p.nome, sub:e.ult ? `sem contato há ${e.dias} dias` : 'nenhum contato registrado', vl:e.ult ? `${e.dias} d` : '—' })),
        link:{ rota:'/followup', texto:'Follow-up' }, rotulo:`Carteira esquecida: ${plural(esq.length, 'cliente', 'clientes')} sem contato há mais de 30 dias` },
      Object.assign(propostas((S.db.propostas || []).filter(p => p.consultor_id === S.me.id), 'Minhas propostas'), { id:'g' }) ];
  }

  function opec(pis) {
    const por = s => pis.filter(p => p.status === s).sort((a, b) => String(a.atualizado_em || a.criado_em).localeCompare(String(b.atualizado_em || b.criado_em)));
    const fila = por('opec'), aprov = por('aprovado'), dev = por('devolvido'), prog = pis.filter(p => p.status === 'programado');
    const m = mesDe(S.today()), doMes = pis.filter(p => mesDe(p.criado_em) === m && [...VENDIDO, 'devolvido'].includes(p.status)), conferidos = doMes.filter(p => ['aprovado', 'programado', 'faturado'].includes(p.status));
    // Inserções por dia nos últimos 30 dias, dos PIs programados e faturados (grades do PI)
    const d30 = dias30(), ins = d30.map(() => 0);
    pis.filter(p => ['programado', 'faturado'].includes(p.status)).forEach(p => (p.dados.grids || []).forEach(g => (g.items || []).forEach(it => Object.entries(it.days || {}).forEach(([dia, n]) => {
      const i = d30.indexOf(`${g.period}-${String(dia).padStart(2, '0')}`); if (i >= 0) ins[i] += Number(n) || 0; }))));
    const chegada = naSemana(pis.filter(p => VENDIDO.includes(p.status) || p.status === 'devolvido'), 'criado_em'), media = Math.round(chegada.slice(0, 7).reduce((s, n) => s + n, 0) / 7);
    const antigo = fila[0];
    return [
      filaPis(fila, { id:'a', titulo:'Para conferir', vivo:fila.length ? true : false, icone:'opec', apoio:fila.length ? `${reais(soma(fila))} · o mais antigo ${haDias(antigo.atualizado_em || antigo.criado_em).toLowerCase()}` : 'Nenhum PI aguardando', vazio:'Nenhum PI aguardando conferência.',
        link:{ rota:'/opec', texto:'Abrir fila' }, rotulo:`Para conferir: ${plural(fila.length, 'PI', 'PIs')}` }),
      filaPis(aprov, { id:'b', titulo:'Aprovados', icone:'check', apoio:'aguardando programação', vazio:'Nenhum PI aguardando programação.', link:{ rota:'/opec', texto:'OPEC' }, rotulo:`Aprovados: ${plural(aprov.length, 'PI', 'PIs')} aguardando programação` }),
      Object.assign(caminho(pis), { id:'c' }),
      { id:'d', tipo:'anel', titulo:'Conferidos no mês', icone:'check', pct:doMes.length ? conferidos.length / doMes.length * 100 : 0, numero:`${conferidos.length} de ${doMes.length}`, apoio:'PIs do mês já conferidos',
        linhas:[['Na OPEC', String(doMes.filter(p => p.status === 'opec').length)], ['Devolvidos', String(doMes.filter(p => p.status === 'devolvido').length)], ['Aprovados', String(doMes.filter(p => p.status === 'aprovado').length), 'bom'], ['Programados ou faturados', String(doMes.filter(p => ['programado', 'faturado'].includes(p.status)).length)]],
        link:{ rota:'/opec', texto:'OPEC' }, rotulo:`Conferidos no mês: ${conferidos.length} de ${doMes.length}` },
      { id:'e', tipo:'tira', titulo:'Programados', icone:'programacao', titular:plural(prog.length, 'programado', 'programados'), tom:prog.length ? 'bom' : '', dias:ins,
        nota:`${ins.reduce((s, n) => s + n, 0).toLocaleString('pt-BR')} inserções nos últimos 30 dias`, link:{ rota:'/pis', texto:'Ver PIs' }, rotulo:`Programados: ${prog.length} PIs` },
      { id:'f', tipo:'pessoas', titulo:'Devolvidos', icone:'voltar', cuenta:`${dev.length} com o comercial`, vazio:'Nenhum PI devolvido.',
        itens:dev.map(p => ({ nome:cliente(p), sub:S.piNo(p) + ' · ' + (S.usuario(p.consultor_id) || 'sem consultor'), vl:primeiro(S.usuario(p.consultor_id)) || '—' })),
        link:{ rota:'/pis', texto:'Ver PIs' }, rotulo:`Devolvidos: ${plural(dev.length, 'PI', 'PIs')} com o comercial` },
      { id:'g', tipo:'colunas', titulo:'Chegada de PIs', icone:'pis', numero:String(chegada[7]), nota:`nesta semana · média ${media} por semana`, barras:chegada, rotulos:ROT_SEM,
        link:{ rota:'/opec', texto:'OPEC' }, rotulo:`Chegada de PIs: ${chegada[7]} nesta semana, média ${media}` } ];
  }

  function financeiro(pis) {
    const hoje = S.today(), rec = S.db.lancamentos.filter(l => l.sentido === 'receber'), aberto_ = rec.filter(l => !l.pago_em);
    const venc = aberto_.filter(l => l.vencimento && l.vencimento < hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const prox = meses6(0), porMes = prox.map((m, i) => val(aberto_.filter(l => i === 0 ? mesDe(l.vencimento) <= m : mesDe(l.vencimento) === m)));
    const aFaturar = pis.filter(p => ['aprovado', 'programado'].includes(p.status)).sort((a, b) => b.numero - a.numero);
    const quem = l => { const pi = l.pi_id && S.db.pis.find(p => p.id === l.pi_id); return l.contraparte || (pi ? cliente(pi) : l.descricao) || 'Lançamento'; };
    const d30 = dias30(), baixas = d30.map(d => rec.filter(l => l.pago_em && S.dia(l.pago_em) === d).reduce((s, l) => s + pago(l), 0)), tot30 = baixas.reduce((s, n) => s + n, 0);
    const semNf = {}; rec.filter(l => l.pi_id && !String(l.nota_fiscal || '').trim()).forEach(l => { const pi = S.db.pis.find(p => p.id === l.pi_id); if (pi && pi.status === 'faturado') (semNf[pi.id] = semNf[pi.id] || { pi, v:0 }).v += Number(l.valor || 0); });
    const nf = Object.values(semNf).sort((a, b) => b.pi.numero - a.pi.numero);
    // Inadimplência por mês (últimos 6): do que venceu no mês, quanto ainda está em aberto
    const m6 = meses6(-5), inad = m6.map(m => { const v = rec.filter(l => mesDe(l.vencimento) === m && l.vencimento < hoje); return val(v) ? val(v.filter(l => !l.pago_em)) / val(v) * 100 : 0; });
    const inadG = val(rec.filter(l => l.vencimento && l.vencimento < hoje)) ? val(venc) / val(rec.filter(l => l.vencimento && l.vencimento < hoje)) * 100 : 0;
    return [
      { id:'a', tipo:'valor', titulo:'A receber', icone:'relatorio', valor:reais(val(aberto_)), delta:venc.length ? { txt:`${reais(val(venc))} vencido`, tom:'ruim' } : { txt:'nada vencido', tom:'bom' },
        barras:porMes, rotulos:prox.map(rotMes), link:{ rota:'/vendas', texto:'Vendas' }, rotulo:`A receber: ${reais(val(aberto_))} em ${plural(aberto_.length, 'parcela', 'parcelas')}; ${reais(val(venc))} vencido` },
      { id:'b', tipo:'fila', titulo:'Vencidas', vivo:venc.length ? 'alerta' : false, icone:'relogio', numero:String(venc.length), apoio:venc.length ? `${reais(val(venc))} em atraso` : 'Nada vencido',
        itens:venc.slice(0, 5).map(l => ({ tx:quem(l), sub:`venceu ${S.dfmt(l.vencimento).slice(0, 5)}`, vl:brl(l.valor), tag:`${diasDesde(l.vencimento + 'T12:00')} dias`, tom:'alerta' })), vazio:'Nenhuma parcela vencida.',
        link:{ rota:'/vendas', texto:'Vendas' }, rotulo:`Vencidas: ${plural(venc.length, 'parcela', 'parcelas')}, ${reais(val(venc))}` },
      filaPis(aFaturar, { id:'c', titulo:'Prontos para faturar', icone:'pis', apoio:aFaturar.length ? `${reais(soma(aFaturar))} aprovados` : 'Nada para faturar', vazio:'Nenhum PI aguardando faturamento.',
        tag:p => S.STATUS[p.status].label, tom:() => '', link:{ rota:'/vendas', texto:'Faturar' }, rotulo:`Prontos para faturar: ${plural(aFaturar.length, 'PI', 'PIs')}` }),
      Object.assign(recebidoNoMes('Recebido no mês'), { id:'d' }),
      { id:'e', tipo:'tira', titulo:'Recebimentos', icone:'financeiro', titular:mil(tot30), tom:tot30 ? 'bom' : '', dias:baixas, nota:'recebido nos últimos 30 dias', link:{ rota:'/vendas', texto:'Vendas' },
        rotulo:`Recebimentos: ${reais(tot30)} nos últimos 30 dias` },
      { id:'f', tipo:'pessoas', titulo:'Notas fiscais pendentes', icone:'doc', cuenta:plural(nf.length, 'PI', 'PIs'), vazio:'Nenhuma nota fiscal pendente.',
        itens:nf.map(x => ({ nome:cliente(x.pi), sub:S.piNo(x.pi), vl:mil(x.v) })), link:{ rota:'/vendas', texto:'Vendas' }, rotulo:`Notas fiscais pendentes: ${plural(nf.length, 'PI faturado', 'PIs faturados')}` },
      { id:'g', tipo:'colunas', titulo:'Inadimplência', icone:'relatorio', numero:pctTxt(inadG), nota:'do que já venceu · por mês', barras:inad, rotulos:m6.map(rotMes),
        link:{ rota:'/financeiro', texto:'Relatórios' }, rotulo:`Inadimplência: ${pctTxt(inadG)} do que já venceu` } ];
  }

  // Bloco escolhido: guardado por perfil enquanto a pessoa usa o SONVI
  S.ui.cxEscolha = S.ui.cxEscolha || {};
  S.views.dashboard = () => {
    const pis = S.db.pis, nome = primeiro(S.me.nome) || '', perfil = S.pode('consultor') ? 'consultor' : S.pode('opec') ? 'opec' : S.pode('financeiro') ? 'financeiro' : 'gestao';
    const blocos = { consultor, opec, financeiro, gestao }[perfil](pis), escolhido = S.ui.cxEscolha[perfil] || 'a', veh = S.veh();
    // Metas do mês (database/049): o diretor vê as da equipe neste veículo; o consultor, a própria
    // Meta do mês no alto (29/10/2026): meta, realizado, quanto falta e 5% do realizado; diretor/gerente com a linha de cada consultor
    const metas = perfil === 'gestao' ? S.metaFaixa({ mes:S.mesAtual(), pis, veiculo:S.ui.vehicleId }) : perfil === 'consultor' ? S.metaFaixa({ mes:S.mesAtual(), pis, veiculo:S.ui.vehicleId, meu:true }) : '';
    queueMicrotask(() => { const el = document.querySelector('#content [data-casillero]'); if (!el || el.dataset.ligado) return; el.dataset.ligado = '1';
      S.casillero(el, { semEntrada:!document.getElementById('content').classList.contains('entra'), aoEscolher:id => { S.ui.cxEscolha[perfil] = id; } }); });
    return { title:`<span class="sub">${hojeExtenso()}</span>${saudacao()}${nome ? ', ' + esc(nome) : ''}`,
      actions:S.pode('diretor', 'gerente', 'consultor') ? `<button class="btn pri" data-act="piNew">${S.svg('mais')}Novo PI</button>` : '',
      body:`${metas}<p class="cx-dica">Clique num bloco para ver o detalhe.</p>${S.cxHtml(blocos, escolhido, 'Resumo da ' + (veh ? veh.nome : 'rádio'))}` };
  };
})();

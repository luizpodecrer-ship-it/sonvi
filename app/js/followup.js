// SONVI · Follow-up (no lugar da Agenda): cada contato com o cliente (visita, ligação, WhatsApp, reunião) tem data, hora,
// como foi e o que o cliente respondeu. O próximo passo é obrigatório e vira o próximo contato sozinho (registrar_followup).
// Proposta enviada há 3 dias sem resposta vira follow-up pelo servidor (followup_automaticos, junto do e-mail das 7h30).
// Consultor vê a própria agenda; gerente e diretor veem a equipe (painel "Equipe") e a agenda de todos.
(() => {
  const { esc, dfmt } = S;
  const TIPOS = { visita:'Visita', ligacao:'Ligação', whatsapp:'WhatsApp', reuniao:'Reunião', retorno:'Retorno' };
  const NOVOS = [['visita', 'Visita'], ['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['reuniao', 'Reunião']];
  const RESP = { interessado:['Interessado', 'blue'], retorno:['Pediu retorno', 'orange'], proposta:['Pediu proposta', 'purple'], fechou:['Fechou', 'green'], sem_interesse:['Sem interesse', 'gray'] };
  const MOTIVOS = ['Sem verba no momento', 'Já anuncia em outra rádio', 'Não vê retorno em rádio', 'Outro'];
  const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const gestor = () => S.pode('diretor', 'gerente');
  const st = { aba:'agenda', periodo:'semana', consultor:'', foco:'' }; // estado da tela (só na memória)

  // ---------- regras (puras) ----------
  const situacao = a => a.situacao || (a.realizado ? 'realizado' : 'agendado');
  const aberto = a => situacao(a) === 'agendado';
  S.fuFeito = a => situacao(a) === 'realizado'; // usado também pelo Dashboard
  const diaSemana = dia => { const [y, m, d] = dia.split('-').map(Number); return SEMANA[new Date(y, m - 1, d).getDay()]; };
  const somaDias = (dia, n) => { const [y, m, d] = dia.split('-').map(Number), x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const entre = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };
  const segunda = dia => { const [y, m, d] = dia.split('-').map(Number), w = new Date(y, m - 1, d).getDay(); return somaDias(dia, -((w + 6) % 7)); };
  const iso = (dia, hora) => new Date(`${dia}T${hora || '09:00'}`).toISOString();
  const doEscopo = () => { const c = gestor() ? st.consultor : S.me.id; return S.db.agenda.filter(a => !c || a.consultor_id === c); };
  // Atrasados: contato aberto de um dia que já passou (o número vai no menu)
  S.fuAtrasados = () => { const hoje = S.today(); return (gestor() ? S.db.agenda : S.db.agenda.filter(a => a.consultor_id === S.me.id)).filter(a => aberto(a) && S.dia(a.quando) < hoje).length; };
  const ultimoContato = (cliId, antesDe) => S.db.agenda.filter(a => a.cliente_id === cliId && a.id !== antesDe && !aberto(a) && a.registrado_em).sort((a, b) => b.registrado_em.localeCompare(a.registrado_em))[0];
  const origem = a => a.origem_id && S.db.agenda.find(x => x.id === a.origem_id);
  // Carteira esquecida: clientes do consultor sem contato registrado há 30 dias e sem nada marcado (também no Dashboard: S.fuEsquecidos)
  const esquecidos = consultorId => { const hoje = S.today(), limite = somaDias(hoje, -30);
    return S.pessoas('cliente').filter(p => p.situacao !== 'inativo' && (!consultorId || p.consultor_id === consultorId)).map(p => {
      const dele = S.db.agenda.filter(a => a.cliente_id === p.id);
      if (dele.some(aberto)) return null;
      const ult = dele.filter(a => a.registrado_em).map(a => S.dia(a.registrado_em)).sort().pop();
      if (ult && ult >= limite) return null;
      return { p, ult, dias:ult ? entre(ult, hoje) : null };
    }).filter(Boolean).sort((a, b) => (a.ult || '0').localeCompare(b.ult || '0')); };
  S.fuEsquecidos = c => esquecidos(c);
  // Propostas enviadas há 3 dias ou mais, sem resposta
  const semResposta = consultorId => { const hoje = S.today();
    return (S.db.propostas || []).filter(p => p.situacao === 'enviada' && (!consultorId || p.consultor_id === consultorId) && p.enviada_em && entre(S.dia(p.enviada_em), hoje) >= 3 && S.propVence(p) >= hoje)
      .sort((a, b) => a.enviada_em.localeCompare(b.enviada_em)); };

  // ---------- pedaços da tela ----------
  const fone = cli => String((cli && (cli.whatsapp || cli.telefone)) || '').replace(/\D/g, '');
  const linha = (a, { comConsultor } = {}) => {
    const hoje = S.today(), dia = S.dia(a.quando), atras = aberto(a) && dia < hoje, cli = S.pessoa(a.cliente_id), o = origem(a), ult = ultimoContato(a.cliente_id, a.id);
    const tags = [o && o.resposta ? S.tag(...RESP[o.resposta]) : '', a.automatico ? S.tag('Proposta sem resposta', 'purple') : '',
      !aberto(a) && a.resposta ? S.tag(...RESP[a.resposta]) : '', situacao(a) === 'nao_atendeu' ? S.tag('Não atendeu', 'gray') : '',
      atras ? S.tag(`${entre(dia, hoje)} ${entre(dia, hoje) === 1 ? 'dia' : 'dias'} de atraso`, 'red') : ''].filter(Boolean).join('');
    const f = fone(cli);
    return `<div class="ag fu-l${atras ? ' atras' : ''}"><span class="qd"><b>${S.hora(a.quando)}</b><small>${dia === hoje ? 'hoje' : `${CURTO[new Date(a.quando).getDay()]} · ${dfmt(dia).slice(0, 5)}`}</small></span>
      <span class="tx"><b>${esc(cli ? cli.nome : 'Sem cliente')}</b><small>${TIPOS[a.tipo] || a.tipo}${a.assunto ? ' · ' + esc(a.assunto) : ''}${comConsultor ? ` · ${esc(S.usuario(a.consultor_id))}` : ''}</small>
        ${!aberto(a) && a.resultado ? `<small class="res">${esc(a.resultado)}${a.motivo ? ` · ${esc(a.motivo)}` : ''}</small>`
          : aberto(a) && ult ? `<small class="fu-ult">Último contato ${dfmt(S.dia(ult.registrado_em)).slice(0, 5)}: ${esc((ult.resultado || (RESP[ult.resposta] || [''])[0]).slice(0, 110))}</small>` : aberto(a) ? '<small class="fu-ult">Primeiro contato</small>' : ''}
        ${tags ? `<span class="fu-tags">${tags}</span>` : ''}</span>
      <span class="ac">${aberto(a) ? `${f ? `<a class="btn sm ic" href="tel:+55${f}" aria-label="Ligar para ${esc(cli.nome)}" title="Ligar">${S.svg('fone')}</a>` : ''}<button class="btn sm pri" data-act="fuRegistrar" data-id="${a.id}">Registrar</button>
        <button class="btn tres" data-act="fuOpcoes" data-id="${a.id}" aria-label="Opções do contato com ${esc(cli ? cli.nome : 'o cliente')}">${S.svg('mais3')}</button>` : ''}</span></div>`;
  };
  const card = (titulo, conteudo, extra = '', cls = '') => `<section class="card${cls}"><div class="hd"><h2>${titulo}</h2>${extra}</div>${conteudo}</section>`;
  const vazio = t => `<p class="muted">${t}</p>`;
  const tile = (l, v, h, cls = '') => `<div class="tile${cls}"><small>${l}</small><b>${v}</b><span>${h}</span></div>`;


  // ---------- painel do topo (cuadrante.js): anéis por tipo, contatos registrados e propostas pedidas ----------
  const PER = ['semana', 'mes', '3meses'], RING = [['visita'], ['ligacao', 'retorno'], ['whatsapp'], ['reuniao']];
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Início e fim do período (desloc = -1: o período anterior) e as faixas da linha e das barras
  const periodoDe = (i, desloc = 0) => {
    const hoje = S.today(), seg = segunda(hoje);
    if (i === 0) { const ini = somaDias(seg, desloc * 7), fim = somaDias(ini, 6);
      return { ini, fim, texto:'esta semana', sub:'por dia', faixas:Array.from({ length:7 }, (_, k) => { const d = somaDias(ini, k); return [d, d, CURTO[(k + 1) % 7] + ' ' + d.slice(8)]; }) }; }
    if (i === 1) { const [y, m] = hoje.split('-').map(Number), x = new Date(y, m - 1 + desloc, 1), ini = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`;
      const fim = somaDias(somaDias(ini, 32).slice(0, 8) + '01', -1), n = +fim.slice(8), faixas = [];
      for (let a = 1; a <= n; a += 3) { const b = Math.min(n, a + 2); faixas.push([ini.slice(0, 8) + String(a).padStart(2, '0'), ini.slice(0, 8) + String(b).padStart(2, '0'), `${a}–${b} ${MES3[x.getMonth()]}`]); }
      return { ini, fim, texto:'este mês', sub:'a cada 3 dias', faixas }; }
    const ini = somaDias(seg, -84 + desloc * 91), fim = somaDias(ini, 90);
    return { ini, fim, texto:'últimos 3 meses', sub:'por semana', faixas:Array.from({ length:13 }, (_, k) => { const a = somaDias(ini, k * 7); return [a, somaDias(a, 6), `semana de ${dfmt(a).slice(0, 5)}`]; }) };
  };
  const varia = (agora, antes) => antes ? Math.round((agora - antes) / antes * 100) : agora ? null : 0;
  const cuDados = lista => PER.map((_, i) => {
    const P = periodoDe(i), A = periodoDe(i, -1), dentro = (d, R) => d >= R.ini && d <= R.fim;
    const plan = R => lista.filter(a => situacao(a) !== 'cancelado' && dentro(S.dia(a.quando), R));
    const reg = (R, f) => lista.filter(a => S.fuFeito(a) && a.registrado_em && dentro(S.dia(a.registrado_em), R) && (!f || f(a)));
    const porFaixa = l => P.faixas.map(([a, b]) => l.filter(x => { const d = S.dia(x.registrado_em); return d >= a && d <= b; }).length);
    const pAg = plan(P), pAn = plan(A), feitosAg = reg(P), feitosAn = reg(A), prop = a => a.resposta === 'proposta';
    return { texto:P.texto,
      canales:RING.map(t => { const p = pAg.filter(a => t.includes(a.tipo)), f = p.filter(S.fuFeito).length, fa = pAn.filter(a => t.includes(a.tipo) && S.fuFeito(a)).length;
        return { v:f, p:p.length, meta:p.length ? Math.min(1, f / p.length) : 0, d:varia(f, fa) }; }),
      ingresos:{ valores:porFaixa(feitosAg), etiquetas:P.faixas.map(x => x[2]), delta:varia(feitosAg.length, feitosAn.length) },
      pedidos:{ valores:porFaixa(feitosAg.filter(prop)), etiquetas:P.faixas.map(x => x[2]), delta:varia(feitosAg.filter(prop).length, feitosAn.filter(prop).length), texto:P.sub } };
  });
  let painel = null;   // { chave, el, montado }: o painel fica montado entre um desenho e outro da tela
  const painelTopo = (lista, quem) => {
    const hoje = S.today(), atras = lista.filter(a => aberto(a) && S.dia(a.quando) < hoje).length, datos = cuDados(lista);
    const chave = JSON.stringify([S.ui.vehicleId, quem, atras, datos]);
    if (!painel || painel.chave !== chave) { const host = document.createElement('div'); host.innerHTML = S.cuHtml({ quem, atrasados:atras, periodo:PER.indexOf(st.periodo) }); painel = { chave, el:host.firstElementChild, datos, montado:false }; }
    const p = painel;
    queueMicrotask(() => { const lugar = document.getElementById('cu-lugar'); if (!lugar || painel !== p) return; lugar.replaceWith(p.el);
      if (!p.montado) { p.montado = true; S.cuadrante(p.el, { datos:p.datos, inicial:Math.max(0, PER.indexOf(st.periodo)), alMudar:i => { st.periodo = PER[i];
        } }); } });
    return '<div id="cu-lugar"></div>';
  };

  // Agenda (consultor, ou gerente/diretor olhando um consultor ou todos)
  const agenda = () => {
    const hoje = S.today(), todos = doEscopo().slice().sort((a, b) => a.quando.localeCompare(b.quando)), comConsultor = gestor() && !st.consultor;
    const abertos = todos.filter(aberto), atras = abertos.filter(a => S.dia(a.quando) < hoje), deHoje = abertos.filter(a => S.dia(a.quando) === hoje);
    const fim = somaDias(hoje, 7), prox = abertos.filter(a => S.dia(a.quando) > hoje && S.dia(a.quando) <= fim), depois = abertos.filter(a => S.dia(a.quando) > fim).length;
    const feitos = todos.filter(a => !aberto(a) && a.registrado_em).sort((a, b) => b.registrado_em.localeCompare(a.registrado_em)).slice(0, 8);
    const mes = hoje.slice(0, 7), c = gestor() ? st.consultor : S.me.id, props = (S.db.propostas || []).filter(p => !c || p.consultor_id === c);
    const porDia = prox.reduce((g, a) => { const d = S.dia(a.quando); (g[d] = g[d] || []).push(a); return g; }, {});
    const sr = semResposta(c);
    const agPorProposta = id => S.db.agenda.find(a => a.proposta_id === id && aberto(a));
    const quem = gestor() ? (st.consultor ? S.usuario(st.consultor) : 'Todos os consultores') : 'Seus contatos';
    // Parte de baixo (07/11/2026, proposta "Follow-up organizado"): uma barra com o que pede atenção (Atrasados · Hoje ·
    // Próximos 7 dias · Propostas sem resposta) que troca a lista ao lado, e à direita a linha do tempo dos últimos registros.
    // Saiu a "Carteira esquecida". O painel do topo (cuadrante.js) não mudou. Estilos .fx-* em sonvi.css.
    const focos = [['atras', 'Atrasados', atras.length, 'red'], ['hoje', 'Hoje', deHoje.length, 'accent'], ['prox', 'Próximos 7 dias', prox.length, 'accent'], ['props', 'Propostas sem resposta', sr.length, 'purple']];
    const foco = focos.some(f => f[0] === st.foco) ? st.foco : atras.length ? 'atras' : 'hoje';
    const ICO = { whatsapp:'whats', ligacao:'fone', reuniao:'clientes', visita:'empresa', retorno:'relogio' };
    const linhaX = a => { const dia = S.dia(a.quando), at = aberto(a) && dia < hoje, cli = S.pessoa(a.cliente_id), o = origem(a), ult = ultimoContato(a.cliente_id, a.id), f = fone(cli);
      const tags = [o && o.resposta ? S.tag(...RESP[o.resposta]) : '', a.automatico ? S.tag('Proposta sem resposta', 'purple') : '', situacao(a) === 'nao_atendeu' ? S.tag('Não atendeu', 'gray') : '',
        at ? S.tag(`${entre(dia, hoje)} ${entre(dia, hoje) === 1 ? 'dia' : 'dias'} de atraso`, 'red') : ''].filter(Boolean).join('');
      const nota = ult ? `<span class="fx-nota" title="${esc(ult.resultado || '')}"><span><b>Último contato ${dfmt(S.dia(ult.registrado_em)).slice(0, 5)}</b> ${esc(ult.resultado || (RESP[ult.resposta] || [''])[0])}</span></span>` : '<span class="fx-nota fx-prim">Primeiro contato com este cliente</span>';
      return `<div class="fx-l${at ? ' at' : ''}"><span class="fx-h"><b>${S.hora(a.quando)}</b><small>${dia === hoje ? 'hoje' : at ? dfmt(dia).slice(0, 5) : CURTO[new Date(a.quando).getDay()]}</small></span>
        <span class="fx-ic fx-t-${a.tipo}" title="${TIPOS[a.tipo] || a.tipo}">${S.svg(ICO[a.tipo] || 'agenda')}</span>
        <span class="fx-tx"><b>${esc(cli ? cli.nome : 'Sem cliente')}</b><small>${TIPOS[a.tipo] || a.tipo}${a.assunto ? ' · ' + esc(a.assunto) : ''}${comConsultor ? ` · <span class="fx-quem">${esc(S.usuario(a.consultor_id))}</span>` : ''}</small>${nota}${tags ? `<span class="fu-tags">${tags}</span>` : ''}</span>
        <span class="fx-ac">${f ? `<a class="btn sm ic" href="${a.tipo === 'whatsapp' ? `https://wa.me/55${f}` : `tel:+55${f}`}" target="_blank" rel="noopener" aria-label="${a.tipo === 'whatsapp' ? 'Abrir o WhatsApp de' : 'Ligar para'} ${esc(cli.nome)}" title="${a.tipo === 'whatsapp' ? 'WhatsApp' : 'Ligar'}">${S.svg(a.tipo === 'whatsapp' ? 'whats' : 'fone')}</a>` : ''}<button class="btn sm pri" data-act="fuRegistrar" data-id="${a.id}">Registrar</button>
          <button class="btn tres" data-act="fuOpcoes" data-id="${a.id}" aria-label="Opções do contato com ${esc(cli ? cli.nome : 'o cliente')}">${S.svg('mais3')}</button></span></div>`; };
    const porDiaDe = l => Object.entries(l.reduce((g, a) => { const d = S.dia(a.quando); (g[d] = g[d] || []).push(a); return g; }, {}));
    const grupos = l => porDiaDe(l).map(([d, xs]) => `<p class="fx-dia"><span>${d === hoje ? 'Hoje' : diaSemana(d)}, ${dfmt(d).slice(0, 5)}</span><i>${xs.length}</i></p>${xs.map(linhaX).join('')}`).join('');
    const vazioF = { atras:['Nada atrasado', 'Todos os contatos foram registrados no dia.'], hoje:['Nada marcado para hoje', 'Use "Novo contato" para marcar uma ligação, visita ou WhatsApp.'], prox:['Semana livre', 'Nenhum contato marcado para os próximos 7 dias.'], props:['Nenhuma proposta esperando', 'Proposta enviada há 3 dias sem resposta aparece aqui e vira follow-up sozinha.'] };
    const corpoFoco = foco === 'props'
      ? (sr.length ? sr.map(p => { const ag = agPorProposta(p.id), dias = entre(S.dia(p.enviada_em), hoje);
          return `<div class="fx-l"><span class="fx-h"><b>${dias}d</b><small>sem resposta</small></span><span class="fx-ic fx-t-proposta">${S.svg('propostas')}</span>
            <span class="fx-tx"><b>${esc(S.nome(p.cliente_id))}</b><small>${S.propNo(p)} · enviada ${dfmt(S.dia(p.enviada_em)).slice(0, 5)} · ${brl(p.valor_total || 0)}${comConsultor ? ` · <span class="fx-quem">${esc(S.usuario(p.consultor_id))}</span>` : ''}</small>${ag ? `<span class="fx-nota"><b>Na agenda</b> ${dfmt(S.dia(ag.quando)).slice(0, 5)} às ${S.hora(ag.quando)}</span>` : ''}</span>
            <span class="fx-ac"><button class="btn sm" data-go="/propostas/${p.id}">Abrir</button>${ag ? '' : `<button class="btn sm pri" data-act="fuNovo" data-cliente="${p.cliente_id}" data-proposta="${p.id}">Agendar</button>`}</span></div>`; }).join('') : '')
      : foco === 'atras' ? grupos(atras) : foco === 'hoje' ? deHoje.map(linhaX).join('') : grupos(prox) + (depois ? `<p class="fx-mais">E mais ${depois} contato${depois === 1 ? '' : 's'} depois disso.</p>` : '');
    const fSel = focos.find(f => f[0] === foco);
    const barra = `<div class="fx-barra" role="tablist" aria-label="O que ver">${focos.map(([k, n, q, cor]) => `<button type="button" role="tab" class="fx-f fx-c-${cor}${q ? '' : ' zero'}" data-act="fuFoco" data-v="${k}" aria-selected="${k === foco}"><b>${q}</b><span>${n}</span></button>`).join('')}
</div>`;
    const RESP_COR = { interessado:'blue', retorno:'orange', proposta:'purple', fechou:'green', sem_interesse:'gray' };
    const hist = feitos.length ? `<ol class="fx-tl">${feitos.map(a => { const cli = S.pessoa(a.cliente_id), r = a.resposta && RESP[a.resposta], nat = situacao(a) === 'nao_atendeu';
        return `<li class="fx-tl-${nat ? 'gray' : RESP_COR[a.resposta] || 'gray'}"><span class="fx-tl-q"><b>${esc(cli ? cli.nome : 'Sem cliente')}</b><small>${dfmt(S.dia(a.registrado_em)).slice(0, 5)} ${S.hora(a.registrado_em)}</small></span>
          <small>${TIPOS[a.tipo] || a.tipo}${comConsultor ? ` · ${esc(S.usuario(a.consultor_id))}` : ''} · <b>${nat ? 'Não atendeu' : r ? r[0] : 'Registrado'}</b></small>${a.resultado ? `<p>${esc(a.resultado)}</p>` : ''}</li>`; }).join('')}</ol>`
      : vazio('Nenhum contato registrado ainda.');
    return `${painelTopo(todos, quem)}
      ${barra}
      <div class="fx-grade"><section class="card fx-lista" aria-labelledby="fx-t"><div class="hd"><h2 id="fx-t">${fSel[1]}</h2><span class="muted small">${foco === 'atras' ? 'registre ou remarque; o diretor vê no resumo do dia' : foco === 'props' ? 'viram follow-up sozinhas depois de 3 dias' : foco === 'prox' ? 'agrupados por dia' : diaSemana(hoje)}</span></div>
          ${corpoFoco || `<div class="fx-vazio"><b>${vazioF[foco][0]}</b><span>${vazioF[foco][1]}</span></div>`}</section>
        <aside class="card fx-hist" aria-labelledby="fx-h"><div class="hd"><h2 id="fx-h">Últimos registros</h2><span class="muted small">${feitos.length ? `os ${feitos.length} mais recentes` : ''}</span></div>${hist}</aside></div>`;
  };

  // ---------- Follow-up da equipe no Dashboard Gestão (07/11/2026) ----------
  // dados = { agenda, propostas, nomes:Map(cliente → nome), consultores:[{ id, nome, celular, email, veiculos:[ids] }], veiculos }
  let painelEq = null;
  S.fuEquipeGestao = dados => {
    const brl = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
    const { agenda:ag, propostas:props, nomes, consultores:consL, veiculos } = dados, hoje = S.today(), amanha = somaDias(hoje, 1);
    const nomeCli = id => nomes.get(id) || 'Cliente', nomeVei = id => (veiculos.find(v => v.id === id) || {}).nome || '';
    const R = periodoDe(Math.max(0, PER.indexOf(st.periodo))), ini = R.ini, fim = R.fim, nomeP = { semana:'na semana', mes:'no mês', '3meses':'em 3 meses' }[st.periodo] || 'na semana';
    const noPer = a => { const d = S.dia(a.quando); return d >= ini && d <= fim; }, regPer = a => a.registrado_em && S.dia(a.registrado_em) >= ini && S.dia(a.registrado_em) <= fim;
    const atras = ag.filter(a => aberto(a) && S.dia(a.quando) < hoje).sort((a, b) => a.quando.localeCompare(b.quando));
    const feitosHoje = ag.filter(a => S.fuFeito(a) && a.registrado_em && S.dia(a.registrado_em) === hoje), deAmanha = ag.filter(a => aberto(a) && S.dia(a.quando) === amanha);
    const pHoje = props.filter(p => p.enviada_em && S.dia(p.enviada_em) === hoje), pPer = props.filter(p => p.criado_em && S.dia(p.criado_em) >= ini && S.dia(p.criado_em) <= fim), vPer = props.filter(p => p.aprovada_em && S.dia(p.aprovada_em) >= ini && S.dia(p.aprovada_em) <= fim);
    // Painel do topo: o mesmo do Follow-up, somando todos os veículos
    const datos = cuDados(ag), chave = JSON.stringify(['geral', atras.length, datos]);
    if (!painelEq || painelEq.chave !== chave) { const host = document.createElement('div'); host.innerHTML = S.cuHtml({ quem:'Toda a equipe · todos os veículos', atrasados:atras.length, periodo:PER.indexOf(st.periodo) }); painelEq = { chave, el:host.firstElementChild, datos, montado:false }; }
    const pe = painelEq;
    queueMicrotask(() => { const lugar = document.getElementById('cu-lugar-eq'); if (!lugar || painelEq !== pe) return; lugar.replaceWith(pe.el);
      if (!pe.montado) { pe.montado = true; S.cuadrante(pe.el, { datos:pe.datos, inicial:Math.max(0, PER.indexOf(st.periodo)), alMudar:i => { st.periodo = PER[i]; const r = document.getElementById('eq-resto'); if (r && S.fuEquipeResto) r.innerHTML = S.fuEquipeResto(); } }); } });
    const num = (rot, v, sub, cls = '') => `<div class="eq-n${cls}"><small>${rot}</small><b>${v}</b><span>${sub}</span></div>`;
    const resumo = `<section class="card eq-hoje" aria-labelledby="eq-ht"><div class="hd"><h2 id="eq-ht">Hoje · ${diaSemana(hoje)}, ${dfmt(hoje).slice(0, 5)}</h2><span class="grow"></span><button class="btn sm" data-act="fuAmostra">${S.svg('email')}Mandar o resumo para o meu e-mail</button></div>
      <div class="eq-nums">${num('Contatos feitos', feitosHoje.length, `${new Set(feitosHoje.map(a => a.consultor_id)).size} de ${consL.length} consultores registraram`)}${num('Atrasados', atras.length, atras.length ? 'sem registro no dia marcado' : 'equipe em dia', atras.length ? ' ruim' : ' bom')}
        ${num('Agenda de amanhã', deAmanha.length, `${diaSemana(amanha)}`)}${num('Propostas enviadas', pHoje.length, pHoje.length ? brl(pHoje.reduce((s, p) => s + Number(p.valor_total || 0), 0)) : 'nenhuma hoje')}</div></section>`;
    const resto = () => {
      const R2 = periodoDe(Math.max(0, PER.indexOf(st.periodo))), nP = { semana:'na semana', mes:'no mês', '3meses':'em 3 meses' }[st.periodo] || 'na semana';
      const noP = a => { const d = S.dia(a.quando); return d >= R2.ini && d <= R2.fim; }, regP = a => a.registrado_em && S.dia(a.registrado_em) >= R2.ini && S.dia(a.registrado_em) <= R2.fim;
      const pP = props.filter(p => p.criado_em && S.dia(p.criado_em) >= R2.ini && S.dia(p.criado_em) <= R2.fim), vP = props.filter(p => p.aprovada_em && S.dia(p.aprovada_em) >= R2.ini && S.dia(p.aprovada_em) <= R2.fim);
      const linhas = consL.map(u => { const id = u.id, p = ag.filter(a => a.consultor_id === id && noP(a) && situacao(a) !== 'cancelado'), f = p.filter(S.fuFeito).length, at = atras.filter(a => a.consultor_id === id).length;
        const hj = feitosHoje.filter(a => a.consultor_id === id).length, am = deAmanha.filter(a => a.consultor_id === id).length;
        const ult = ag.filter(a => a.consultor_id === id && a.registrado_em).map(a => a.registrado_em).sort().pop(), dU = ult ? entre(S.dia(ult), hoje) : null;
        const vid = (u.veiculos || [])[0] || '';
        return `<tr class="${hj ? '' : 'eq-zero'}"><td><span class="fu-pes"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome))}</span><span class="eq-cn"><b>${esc(u.nome)}</b><small>${(u.veiculos || []).map(nomeVei).filter(Boolean).map(esc).join(' · ') || 'sem veículo'}</small></span></span></td>
          <td class="r">${hj ? `<b>${hj}</b>` : '<span class="eq-sem">sem registro hoje</span>'}</td>
          <td class="nw"><span class="fu-barra" aria-hidden="true"><i style="width:${p.length ? Math.round(f / p.length * 100) : 0}%"></i></span>${f} / ${p.length}</td>
          <td class="r">${at ? S.tag(at, 'red') : '0'}</td><td class="r">${am}</td><td class="r">${pP.filter(x => x.consultor_id === id).length}</td><td class="r">${vP.filter(x => x.consultor_id === id).length}</td>
          <td class="nw${dU !== null && dU >= 3 ? ' fu-ruim' : ''}">${ult ? (dU === 0 ? 'hoje, ' + S.hora(ult) : dU === 1 ? 'ontem, ' + S.hora(ult) : `há ${dU} dias`) : 'nunca'}</td>
          <td class="r">${vid ? `<button class="btn sm" data-act="geralVerAgenda" data-id="${id}" data-v="${vid}">Ver agenda</button>` : ''}</td></tr>`; }).join('');
      const cobrar = a => { const u = consL.find(x => x.id === a.consultor_id) || {}, cel = String(u.celular || '').replace(/\D/g, ''), cli = nomeCli(a.cliente_id);
        const msg = `Oi, ${String(u.nome || '').split(' ')[0]}! O contato com ${cli} (${(TIPOS[a.tipo] || '').toLowerCase()} de ${dfmt(S.dia(a.quando))}) ainda está sem registro no Follow-up do SONVI. Consegue registrar hoje?`;
        return cel.length >= 10 ? `<a class="btn sm" href="https://wa.me/55${cel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${S.svg('whats')}Cobrar</a>`
          : u.email ? `<a class="btn sm" href="mailto:${esc(u.email)}?subject=${encodeURIComponent('Follow-up sem registro: ' + cli)}&body=${encodeURIComponent(msg)}">Cobrar</a>` : ''; };
      const real = ag.filter(a => S.fuFeito(a) && regP(a)), int = real.filter(a => ['interessado', 'retorno', 'proposta', 'fechou'].includes(a.resposta)).length;
      const pp = real.filter(a => ['proposta', 'fechou'].includes(a.resposta)).length, fe = real.filter(a => a.resposta === 'fechou').length, maxF = Math.max(1, real.length);
      const motivos = Object.entries(real.filter(a => a.resposta === 'sem_interesse').reduce((m, a) => { const k = a.motivo || 'Sem motivo'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
      const funil = [['Contatos realizados', real.length], ['Com interesse', int], ['Pediram proposta', pp], ['Fecharam', fe]];
      return `<section class="card" aria-labelledby="eq-ct"><div class="hd"><h2 id="eq-ct">Por consultor</h2><span class="muted small">contatos feitos de planejados ${nP} · propostas e aprovadas ${nP}</span></div>${consL.length ? `<div class="scroll"><table class="fu-tab eq-tab"><thead><tr><th>Consultor</th><th class="r">Hoje</th><th>Contatos ${nP}</th><th class="r">Atrasados</th><th class="r">Amanhã</th><th class="r">Propostas</th><th class="r">Aprovadas</th><th>Último registro</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div>` : vazio('Nenhum consultor cadastrado ainda. Cadastre em Administração › Colaboradores.')}</section>
        <div class="cols fu-cols">${card(`Atrasados da equipe <span class="muted small">${atras.length || ''}</span>`, atras.length ? `<div class="agenda">${atras.slice(0, 12).map(a => { const d = entre(S.dia(a.quando), hoje), u = consL.find(x => x.id === a.consultor_id);
            return `<div class="ag fu-l"><span class="tx" style="grid-column:1/3"><b>${esc(nomeCli(a.cliente_id))}</b><small>${TIPOS[a.tipo] || ''} de ${dfmt(S.dia(a.quando)).slice(0, 5)} · ${esc(u ? u.nome : '')} · ${esc(nomeVei(a.veiculo_id))}</small><small class="fu-esc">${d} ${d === 1 ? 'dia' : 'dias'} sem registro</small></span><span class="ac">${cobrar(a)}</span></div>`; }).join('')}${atras.length > 12 ? `<p class="muted small" style="margin-top:10px">E mais ${atras.length - 12}.</p>` : ''}</div>` : vazio('Nenhum contato atrasado. A equipe está em dia.'))}
          ${card(`Funil ${nP}`, `<div class="fu-funil">${funil.map(([n, v], i) => `<div><span>${n}</span><span class="fu-fb" aria-hidden="true"><i style="width:${Math.max(v ? 4 : 0, Math.round(v / maxF * 100))}%;opacity:${1 - i * .16}"></i></span><b>${v}</b></div>`).join('')}</div>
            ${motivos.length ? `<p class="muted small" style="margin-top:16px">Motivos de "sem interesse": ${motivos.map(([m, n]) => `${esc(m.toLowerCase())} (${n})`).join(', ')}.</p>` : ''}`)}</div>`; };
    S.fuEquipeResto = resto;
    return `<div id="cu-lugar-eq"></div>${resumo}<div id="eq-resto">${resto()}</div>`;
  };
  S.fuVerAgendaDe = id => { st.consultor = id; st.foco = ''; };

  S.views.followup = () => {
    // 07/11/2026: dentro do veículo fica só a agenda; o acompanhamento da equipe foi para o Dashboard Gestão (aba Follow-up da equipe)
    const v = S.veh(), g = gestor();
    if (g && st.consultor && !S.db.agenda.some(a => a.consultor_id === st.consultor) && !S.consultores().some(u => u.id === st.consultor)) st.consultor = '';
    const hoje = S.today(), sub = `${esc(v.nome)} · ${diaSemana(hoje)}, ${dfmt(hoje).slice(0, 5)}${!g ? ' · ' + esc(S.me.nome || '') : ''}`;
    const filtro = g ? `<div class="row mid fu-topo"><label class="fu-filtro"><span class="sr">Consultor</span><select data-fu-consultor aria-label="Consultor">${[['', 'Todos os consultores'], ...S.consultores().map(u => [u.id, u.nome || u.email])].map(([k, n]) => `<option value="${k}"${k === st.consultor ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <span class="grow"></span>${S.me.diretor ? '<button class="btn sm" data-act="geralFollowup">Ver a equipe no Dashboard Gestão</button>' : ''}</div>` : '';
    return { title:`<span class="sub">${sub}</span>Follow-up`,
      actions:`<button class="btn pri" data-act="fuNovo">${S.svg('mais')}Agendar contato</button>`,
      body:filtro + agenda() };
  };

  // ---------- registrar ----------
  const chips = (nome, lista, marcado) => `<div class="chips" role="radiogroup">${lista.map(([k, n]) => `<label><input type="radio" name="${nome}" value="${esc(k)}"${k === marcado ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>`;
  const registrar = a => {
    const cli = S.pessoa(a.cliente_id), dia = S.dia(a.quando), visita = a.tipo === 'visita' || a.tipo === 'reuniao';
    S.dialog(`<h2>Registrar ${(TIPOS[a.tipo] || 'contato').toLowerCase()}</h2>
      <div class="fu-cli"><span class="av soft" aria-hidden="true">${esc(S.iniciais(cli ? cli.nome : '?'))}</span><span class="tx"><b>${esc(cli ? cli.nome : 'Sem cliente')}</b><small>${dia === S.today() ? 'Hoje' : dfmt(dia)} · ${diaSemana(dia)} às ${S.hora(a.quando)}${a.assunto ? ' · ' + esc(a.assunto) : ''}</small></span></div>
      <fieldset class="f"><legend>Como foi?</legend>${chips('sit', [['realizado', visita ? 'Realizada' : 'Falei com o cliente'], ['nao_atendeu', visita ? 'Cliente não recebeu' : 'Não atendeu'], ['remarcar', 'Remarcar']], 'realizado')}</fieldset>
      <fieldset class="f" data-so="realizado"><legend>O que o cliente respondeu?</legend>${chips('resp', Object.entries(RESP).map(([k, [n]]) => [k, n]), '')}</fieldset>
      <label class="f" data-so="realizado nao_atendeu">O que ficou combinado<textarea name="resultado" placeholder="Ex.: Gostou do rotativo, vai falar com o sócio e responde na sexta"></textarea></label>
      <fieldset class="f fu-motivo" data-so="sem"><legend>Por que não quis?</legend>${chips('motivo', MOTIVOS.map(m => [m, m]), '')}</fieldset>
      <div class="fu-prox" data-so="prox"><p class="fu-prox-t" id="fuProxT">Próximo contato</p>
        <div class="fu-3"><label class="f">Data<input type="date" name="pdata" min="${S.today()}"></label><span class="f"><span>Dia da semana</span><span class="fu-ro" id="fuDia" aria-live="polite">—</span></span><label class="f">Hora<input name="phora" value="10:00" data-mask="hora" inputmode="numeric" autocomplete="off" placeholder="00:00"></label></div>
        <div data-so="tipo">${chips('ptipo', NOVOS.map(([k, n]) => [k, n]), visita ? 'ligacao' : a.tipo === 'retorno' ? 'ligacao' : a.tipo)}</div>
        <label class="f" data-so="tipo">Assunto<input name="passunto" placeholder="Ex.: Resposta depois de falar com o sócio"></label>
        <p class="muted small" id="fuProxAviso">Você e o gerente veem o lembrete no e-mail das 7h30 do dia.</p></div>
      <div class="row mid"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button type="button" class="btn pri" data-fu="ok" id="fuOk">Salvar</button></div>`);
    const d = document.getElementById('dlg'), f = d.querySelector('form'); d.dataset.guarda = '1';
    const val = n => (f.querySelector(`[name="${n}"]:checked`) || {}).value || '';
    const sugerida = { interessado:7, retorno:3, proposta:2, fechou:30, nao_atendeu:1, remarcar:1 };
    let ultimaSug = '';
    const atualiza = () => {
      const sit = val('sit'), resp = val('resp'), chave = sit === 'realizado' ? resp : sit;
      const precisaProx = sit === 'nao_atendeu' || sit === 'remarcar' || (sit === 'realizado' && resp && resp !== 'sem_interesse');
      f.querySelectorAll('[data-so]').forEach(el => { const so = el.dataset.so.split(' ');
        el.hidden = !(so.includes(sit) || (so.includes('sem') && sit === 'realizado' && resp === 'sem_interesse') || (so.includes('prox') && precisaProx) || (so.includes('tipo') && sit !== 'remarcar')); });
      const T = sit === 'remarcar' ? ['Nova data', 'Salvar nova data'] : sit === 'nao_atendeu' ? ['Tentar de novo em', 'Salvar e reagendar']
        : { interessado:['Próximo contato', 'Salvar e agendar'], retorno:['Quando retornar', 'Salvar e agendar retorno'], proposta:['Prazo para levar a proposta', 'Salvar e criar proposta'], fechou:['Contato de pós-venda (opcional)', 'Salvar'], sem_interesse:['', 'Salvar e encerrar'] }[resp] || ['Próximo contato', 'Salvar'];
      document.getElementById('fuProxT').textContent = T[0]; document.getElementById('fuOk').textContent = T[1];
      document.getElementById('fuProxAviso').hidden = sit === 'remarcar';
      // Data sugerida conforme a resposta (a pessoa troca à vontade); pós-venda começa vazio
      const sug = chave && sugerida[chave] !== undefined && chave !== 'fechou' ? somaDias(S.today(), sugerida[chave]) : '';
      if (!f.pdata.value || f.pdata.value === ultimaSug) { f.pdata.value = sug; ultimaSug = sug; mostraDia(); }
      if (resp === 'proposta' && !f.passunto.value) f.passunto.value = 'Levar a proposta';
    };
    const mostraDia = () => { document.getElementById('fuDia').textContent = f.pdata.value ? diaSemana(f.pdata.value) : '—'; };
    f.addEventListener('change', e => { if (e.target.name === 'pdata') mostraDia(); else atualiza(); });
    f.pdata.addEventListener('input', mostraDia);
    atualiza(); f.querySelector('[name="sit"]').focus();
    f.addEventListener('click', async e => {
      if (!e.target.closest('[data-fu="ok"]')) return;
      const sit = val('sit'), resp = val('resp'), motivo = val('motivo'), data = f.pdata.value, hora = f.phora.value || '10:00';
      if (sit === 'realizado' && !resp) return S.erroNoCampo(f.querySelector('[data-so="realizado"] .chips'), 'Escolha o que o cliente respondeu.');
      if (sit === 'realizado' && resp === 'sem_interesse' && !motivo) return S.erroNoCampo(f.querySelector('.fu-motivo .chips'), 'Escolha o motivo.');
      const precisa = sit !== 'realizado' || ['interessado', 'retorno', 'proposta'].includes(resp);
      if (precisa && !data) return S.erroNoCampo(f.pdata, 'Escolha a data.');
      if (data && iso(data, hora) < new Date(Date.now() - 6e4).toISOString() && !(sit === 'remarcar' && data === S.today())) return S.erroNoCampo(f.pdata, 'A data já passou.');
      const texto = f.resultado.value.trim(), tipo = val('ptipo') || 'ligacao', assunto = f.passunto.value.trim();
      delete d.dataset.sujo; d.close('cancel');
      if (sit === 'remarcar') return S.run(() => S.salvar('agenda', { id:a.id, quando:iso(data, hora) }), `Remarcado para ${diaSemana(data)}, ${dfmt(data).slice(0, 5)}`);
      const ok = await S.run(async () => {
        await S.q(S.sb.rpc('registrar_followup', { p_id:a.id, p_situacao:sit, p_resposta:sit === 'realizado' ? resp : null, p_resultado:texto, p_motivo:resp === 'sem_interesse' ? motivo : '',
          p_proximo:data && resp !== 'sem_interesse' ? iso(data, hora) : null, p_proximo_tipo:tipo, p_proximo_assunto:assunto || (sit === 'nao_atendeu' ? 'Nova tentativa' : '') }));
        await recarregar();
      }, resp === 'sem_interesse' ? 'Registrado. O cliente sai do follow-up.' : data ? `Registrado. Próximo contato: ${diaSemana(data)}, ${dfmt(data).slice(0, 5)}` : 'Registrado');
      if (ok && resp === 'proposta' && S.pode('diretor', 'gerente', 'consultor') && a.cliente_id && await S.confirmar('Criar a proposta agora?\n\nAbre uma proposta nova para este cliente. Você também pode criar depois, em Propostas.', { ok:'Criar proposta', voltar:'Depois' }))
        S.actions.prNova({ cliente:a.cliente_id });
    });
  };
  // Depois de registrar, busca a agenda da rádio de novo (a função criou o próximo contato)
  const recarregar = async () => { S.db.agenda = await S.todos(S.sb.from('agenda').select('*').eq('veiculo_id', S.ui.vehicleId)); };

  const novo = (d = {}) => {
    const g = gestor(); if (g && !S.consultores().length && !S.pode('diretor')) return S.toast('Vincule um consultor a esta rádio antes de agendar.');
    const cls = S.pessoas('cliente').filter(p => !S.pode('consultor') || p.consultor_id === S.me.id || p.consultor_id == null || p.id === d.cliente);
    if (!cls.length) return S.toast('Cadastre o cliente antes, em Clientes.');
    const cli = S.pessoa(d.cliente), prop = d.proposta && (S.db.propostas || []).find(p => p.id === d.proposta), amanha = somaDias(S.today(), 1);
    const consOpts = [...S.consultores().map(u => [u.id, u.nome || u.email]), ...(S.consultores().some(u => u.id === S.me.id) ? [] : [[S.me.id, (S.me.nome || 'Eu') + ' (eu)']])];
    S.form('Agendar contato', [
      { k:'cliente_id', label:'Cliente', type:'select', req:true, full:true, options:[['', 'Escolha o cliente'], ...cls.map(c => [c.id, c.nome])] },
      { k:'tipo', label:'Tipo', type:'select', options:NOVOS },
      ...(g ? [{ k:'consultor_id', label:'Consultor', type:'select', options:consOpts }] : []),
      { k:'dia', label:'Data', type:'date', req:true }, { k:'hora', label:'Hora', type:'time', req:true },
      { html:`<p class="muted small" id="fuNovoDia" style="grid-column:1/-1;margin-top:-6px" aria-live="polite">${diaSemana(amanha)}</p>` },
      { k:'assunto', label:'Assunto', full:true, ph:prop ? '' : 'Ex.: Apresentar o rotativo da manhã' }],
      { cliente_id:d.cliente || '', tipo:prop ? 'ligacao' : 'visita', dia:amanha, hora:'10:00', consultor_id:(cli && cli.consultor_id) || (S.consultores()[0] || {}).id || S.me.id, assunto:prop ? `Resposta da proposta ${S.propNo(prop)}` : '' },
      v => S.run(() => S.salvar('agenda', { veiculo_id:S.ui.vehicleId, consultor_id:g ? v.consultor_id || S.me.id : S.me.id, cliente_id:v.cliente_id, tipo:v.tipo, quando:iso(v.dia, v.hora), assunto:v.assunto, proposta_id:prop ? prop.id : null }),
        `Agendado para ${diaSemana(v.dia)}, ${dfmt(v.dia).slice(0, 5)}`), 'Agendar');
    const f = document.querySelector('#dlg form'), dia = f.querySelector('[name="dia"]'), sel = f.querySelector('[name="cliente_id"]'), cons = f.querySelector('[name="consultor_id"]');
    dia.min = S.today();
    dia.addEventListener('input', () => { document.getElementById('fuNovoDia').textContent = dia.value ? diaSemana(dia.value) : ''; });
    if (cons) sel.addEventListener('change', () => { const c = S.pessoa(sel.value); if (c && c.consultor_id && [...cons.options].some(o => o.value === c.consultor_id)) cons.value = c.consultor_id; });
  };

  Object.assign(S.actions, {
    fuFoco: d => { st.foco = d.v; S.render(); },
    fuPeriodo: d => { st.periodo = d.tab; S.render(); },
    fuNovo: novo,
    fuRegistrar: d => { const a = S.db.agenda.find(x => x.id === d.id); if (a) registrar(a); },
    fuOpcoes: (d, botao) => S.menu(botao, [
      { label:'Remarcar', icon:'relogio', act:'fuRemarcar', data:d },
      ...(S.db.agenda.find(x => x.id === d.id) || {}).cliente_id ? [{ label:'Abrir o cliente', icon:'clientes', act:'fuCliente', data:d }] : [],
      '-', { label:'Excluir contato', icon:'lixo', act:'fuExcluir', data:d, perigo:true }]),
    fuRemarcar: d => { const a = S.db.agenda.find(x => x.id === d.id); if (!a) return;
      S.form(`Remarcar · ${esc(S.nome(a.cliente_id) || 'contato')}`, [{ k:'dia', label:'Nova data', type:'date', req:true }, { k:'hora', label:'Hora', type:'time', req:true },
        { html:`<p class="muted small" id="fuRemDia" style="grid-column:1/-1;margin-top:-6px" aria-live="polite"></p>` }],
        { dia:S.dia(a.quando) < S.today() ? S.today() : S.dia(a.quando), hora:S.hora(a.quando) },
        v => S.run(() => S.salvar('agenda', { id:a.id, quando:iso(v.dia, v.hora) }), `Remarcado para ${diaSemana(v.dia)}, ${dfmt(v.dia).slice(0, 5)}`), 'Remarcar', { editar:true });
      const dia = document.querySelector('#dlg [name="dia"]'), t = () => { document.getElementById('fuRemDia').textContent = dia.value ? diaSemana(dia.value) : ''; }; dia.min = S.today(); dia.addEventListener('input', t); t(); },
    fuCliente: d => { const a = S.db.agenda.find(x => x.id === d.id); if (a && a.cliente_id) S.actions.pesEditar({ id:a.cliente_id }); },
    fuExcluir: async d => { if (await S.confirmar('Excluir este contato?\n\nEle sai da agenda e do e-mail das 7h30. Para registrar que não aconteceu, use "Registrar".', { ok:'Excluir', perigo:true })) S.run(() => S.excluir('agenda', d.id), 'Contato excluído'); },
    fuAmostra: async () => {
      S.toast('Preparando o resumo de hoje…');
      try { const { data, error } = await S.sb.functions.invoke('followup', { body:{ acao:'teste' } });
        if (error) { let m = error.message; try { const j = await error.context.json(); m = j.erro || m; } catch (x) { /* sem corpo */ } throw new Error(m); }
        S.toast(data && data.enviados ? `Enviado para ${S.me.email}. Confira a caixa de entrada.` : 'Não foi possível enviar agora.'); }
      catch (e) { S.toast(S.erro(e)); } },
    // O Dashboard ainda chama pelos nomes antigos
    agNovo: d => novo(d), agFeito: d => S.actions.fuRegistrar(d)
  });
  // Filtro de consultor (select): troca na hora
  document.addEventListener('change', e => { if (e.target.matches('select[data-fu-consultor]')) { st.consultor = e.target.value; S.render(); } });
})();

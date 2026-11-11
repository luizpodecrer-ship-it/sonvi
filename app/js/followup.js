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
  const st = { aba:'agenda', consultor:'', foco:'', eqCons:'', eqDia:'', eqVei:'', eqAba:'rotina' }; // estado da tela (só na memória)

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


  // ---------- Follow-up novo (aprovado em 11/11/2026, modelo "Follow-up novo · modelo"; database/088) ----------
  // Aba "Minha rotina": os sete blocos do Casillero (casillero.js): Agenda do dia · Atrasados · Funil · Visitas na semana ·
  // Em negociação · Registrado no dia · Próximos 7 dias. Aba "Funil": um cartão por oportunidade em cada etapa (arrastar troca a etapa).
  // As duas abas servem também ao Follow-up da equipe no Dashboard Gestão: recebem um contexto (c) com os dados e o dia escolhido.
  const ETAPAS = [['prospeccao', 'Prospecção'], ['primeiro_contato', 'Primeiro contato'], ['reuniao', 'Reunião/visita'], ['proposta', 'Proposta enviada'], ['negociacao', 'Negociação'], ['fechou', 'Fechou'], ['perdeu', 'Perdeu']];
  const ETAPA = Object.fromEntries(ETAPAS), ABERTAS = ETAPAS.slice(0, 5).map(e => e[0]);
  const INTERESSES = [['spot', 'Spot'], ['patrocinio', 'Patrocínio'], ['projeto', 'Projeto especial'], ['digital', 'Digital'], ['exterior', 'Mídia exterior']];
  const INTER = Object.fromEntries(INTERESSES);
  const TOM_ETAPA = { prospeccao:22, primeiro_contato:38, reuniao:58, proposta:78, negociacao:100 };
  const corEtapa = e => e === 'fechou' ? 'var(--green)' : e === 'perdeu' ? 'var(--fill-2)' : `color-mix(in srgb, var(--accent) ${TOM_ETAPA[e] || 50}%, var(--surface))`;
  const reaisF = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  const ICO = { whatsapp:'whats', ligacao:'fone', reuniao:'clientes', visita:'empresa', retorno:'relogio' };
  let eq = null;   // dados do Follow-up da equipe (Dashboard Gestão), quando aberto
  const naGestao = () => S.route().view === 'geral';
  const oport = id => [...(S.db.oportunidades || []), ...(eq ? eq.ops : [])].find(o => o.id === id);
  const oportDe = (a, ops = S.db.oportunidades || []) => (a.oportunidade_id && ops.find(o => o.id === a.oportunidade_id)) || ops.find(o => o.cliente_id === a.cliente_id && ABERTAS.includes(o.etapa));
  const comentDe = (a, cm) => cm.filter(c => c.agenda_id === a.id || (a.oportunidade_id && c.oportunidade_id === a.oportunidade_id)).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0];
  const tagEtapa = o => o ? `<span class="fu2-et" data-et="${o.etapa}">${esc(ETAPA[o.etapa] || '')}</span>${o.valor ? `<span class="fu2-vl">${reaisF(o.valor)}</span>` : ''}` : '';
  // Contexto do veículo aberto (Follow-up do consultor; gerente e diretor podem filtrar o consultor)
  const ctxVeiculo = () => { const cs = gestor() ? st.consultor : S.me.id, ops = S.db.oportunidades || [];
    return { ag:S.db.agenda.filter(a => !cs || a.consultor_id === cs), ops:ops.filter(o => !cs || o.consultor_id === cs), todasOps:ops, cm:S.db.fuComent || [],
      cli:id => S.pessoa(id), nome:id => S.nome(id), D:S.today(), gestao:false, comCons:gestor() && !st.consultor, cxChave:'fuCx', rotulo:'Minha rotina' }; };
  const rotDia = (D, hoje) => D === hoje ? 'hoje' : D === somaDias(hoje, -1) ? 'ontem' : `${CURTO[new Date(D + 'T12:00').getDay()]}, ${dfmt(D).slice(0, 5)}`;
  // Uma linha da agenda no bloco grande: hora, tipo, cliente, etapa/valor, assunto ou resultado, orientação do diretor e os botões
  const linhaAg = (a, hoje, c) => {
    const cli = c.cli(a.cliente_id), nomeCli = c.nome(a.cliente_id) || 'Sem cliente', dia = S.dia(a.quando), ab = aberto(a), at = ab && dia < hoje, o = oportDe(a, c.todasOps), f = fone(cli), cm = comentDe(a, c.cm);
    const quando = at ? `${dfmt(dia).slice(0, 5)}` : dia === hoje ? (ab ? '' : 'feito') : CURTO[new Date(a.quando).getDay()];
    const texto = !ab && a.resultado ? esc(a.resultado) : !ab && a.resposta ? RESP[a.resposta][0] : situacao(a) === 'nao_atendeu' ? 'Não atendeu' : esc(a.assunto || (TIPOS[a.tipo] || ''));
    const acoes = c.gestao ? `${at && c.cobrar ? c.cobrar(a) : ''}${!ab ? `<span class="fu2-ok" aria-label="Registrado">${S.svg('check', 14)}</span>` : ''}<button class="btn sm" data-act="fuComentar" data-id="${a.id}" aria-label="Comentar o contato com ${esc(nomeCli)}">${S.svg('chamados', 14)}Comentar</button>`
      : ab ? `${f ? `<a class="btn sm ic" href="${a.tipo === 'whatsapp' ? `https://wa.me/55${f}` : `tel:+55${f}`}" target="_blank" rel="noopener" aria-label="${a.tipo === 'whatsapp' ? 'WhatsApp de' : 'Ligar para'} ${esc(nomeCli)}">${S.svg(a.tipo === 'whatsapp' ? 'whats' : 'fone')}</a>` : ''}
        ${at ? `<button class="btn sm" data-act="fuRemarcar" data-id="${a.id}">Remarcar</button>` : ''}<button class="btn sm pri" data-act="fuRegistrar" data-id="${a.id}">Registrar</button>`
      : `<span class="fu2-ok" aria-label="Registrado">${S.svg('check', 14)}</span>`;
    return `<div class="fu2-l${ab ? '' : ' feito'}${at ? ' at' : ''}"><span class="fu2-h"><b>${S.hora(a.quando)}</b>${quando ? `<small>${quando}</small>` : ''}</span>
      <span class="fu2-ic" title="${TIPOS[a.tipo] || ''}">${S.svg(ICO[a.tipo] || 'agenda')}</span>
      <span class="fu2-tx"><b>${esc(nomeCli)}</b>${tagEtapa(o)}<small>${texto}${c.comCons ? ` · ${esc(S.usuario(a.consultor_id))}` : ''}${a.local_lat ? ' · local registrado' : ''}</small>
        ${cm ? `<span class="fu2-orient">${S.svg('chamados', 13)}${esc((S.usuario(cm.autor_id) || 'Diretor').split(' ')[0])}: ${esc(cm.texto)}</span>` : ''}</span>
      <span class="fu2-ac">${acoes}</span></div>`;
  };
  // Tipo de bloco "agenda" (casillero.js): no pequeno, a lista com as marcas; no grande, as linhas com os botões
  if (S.cxTipos) S.cxTipos.agenda = b => `<span class="cx-cab">${b.vivo ? `<i class="cx-vivo${b.vivo === 'alerta' ? ' alerta' : ''}" aria-hidden="true"></i>` : S.svg(b.icone || 'agenda')}${esc(b.titulo)}</span>
    ${b.titular ? `<span class="cx-titular" data-tom="${b.tom || ''}">${esc(b.titular)}</span><span class="cx-nota">${esc(b.nota || '')}</span>` : `<span class="cx-cuenta">${esc(b.cuenta || '')}</span>
    <ul class="cx-lista cx-pessoas" aria-hidden="true">${b.mini.map(x => `<li${x.ok ? ' class="ok"' : ''}><i class="cx-marca"></i><span class="cx-p-n">${esc(x.nome)}</span><b>${esc(x.vl || '')}</b></li>`).join('') || `<li class="cx-nada">${esc(b.vazio)}</li>`}</ul>`}
    <div class="fu2-ag">${b.linhas || `<p class="fu2-vazio">${esc(b.vazio)}</p>`}${b.pe ? `<p class="fu2-pe">${b.pe}</p>` : ''}</div>`;

  // Rotina do dia c.D (hoje no Follow-up; no Dashboard Gestão o diretor anda pelos dias). Atrasados contam sempre até hoje.
  const rotina = c => {
    const hoje = S.today(), D = c.D, rd = rotDia(D, hoje), todos = c.ag.slice().sort((a, b) => a.quando.localeCompare(b.quando)), ops = c.ops;
    const deD = todos.filter(a => S.dia(a.quando) === D && situacao(a) !== 'cancelado'), feitosD = deD.filter(a => !aberto(a));
    const atras = todos.filter(a => aberto(a) && S.dia(a.quando) < hoje);
    const regD = todos.filter(a => !aberto(a) && situacao(a) !== 'cancelado' && a.registrado_em && S.dia(a.registrado_em) === D).sort((a, b) => b.registrado_em.localeCompare(a.registrado_em));
    const abertas = ops.filter(o => ABERTAS.includes(o.etapa)), mes = D.slice(0, 7), fechadasMes = ops.filter(o => o.etapa === 'fechou' && String(o.fechado_em || '').slice(0, 7) === mes);
    const somaV = l => l.reduce((t, o) => t + Number(o.valor || 0), 0);
    const seg = segunda(D), diasSem = [0, 1, 2, 3, 4].map(k => somaDias(seg, k));
    const visitas = todos.filter(a => a.tipo === 'visita' && situacao(a) !== 'cancelado' && diasSem.includes(S.dia(a.quando)));
    const visFeitas = visitas.filter(S.fuFeito).length, visAg = visitas.filter(aberto).length;
    const prox7 = Array.from({ length:7 }, (_, k) => somaDias(D, k + 1)), agProx = prox7.map(d => todos.filter(a => aberto(a) && S.dia(a.quando) === d).length);
    const nomeCli = a => c.nome(a.cliente_id) || 'Sem cliente';
    const mini = l => l.slice(0, 6).map(a => ({ nome:nomeCli(a) + (aberto(a) ? ' · ' + S.hora(a.quando) : ''), ok:!aberto(a) }));
    const tAg = D === hoje ? 'Agenda de hoje' : `Agenda de ${rd}`, tReg = D === hoje ? 'Registrado hoje' : `Registrado ${D === somaDias(hoje, -1) ? 'ontem' : 'em ' + rd}`;
    const blocos = [
      { id:'a', tipo:'agenda', titulo:tAg, icone:'agenda', cuenta:`${feitosD.length}/${deD.length} feitos`, mini:mini(deD), vazio:`Nada marcado para ${D === hoje ? 'hoje' : 'este dia'}.`,
        linhas:deD.map(a => linhaAg(a, hoje, c)).join(''), rotulo:`${tAg}: ${feitosD.length} de ${deD.length} feitos` },
      { id:'b', tipo:'agenda', titulo:'Atrasados', vivo:atras.length ? 'alerta' : false, icone:'relogio', titular:atras.length ? `${atras.length} ${atras.length === 1 ? 'atrasado' : 'atrasados'}` : 'Tudo em dia', tom:atras.length ? 'ruim' : 'bom',
        nota:atras.length ? `${nomeCli(atras[0])} · ${(TIPOS[atras[0].tipo] || '').toLowerCase()} de ${dfmt(S.dia(atras[0].quando)).slice(0, 5)}` : 'Nada para trás', mini:[], vazio:'Nenhum contato atrasado.',
        linhas:atras.map(a => linhaAg(a, hoje, c)).join(''), pe:atras.length ? (c.gestao ? 'Até hoje. Cobrar abre o WhatsApp do consultor com a mensagem pronta.' : 'Fica aqui até ser registrado ou remarcado.') : '', rotulo:`Atrasados: ${atras.length}` },
      { id:'c', tipo:'etapas', titulo:'Funil', icone:'relatorio', numero:String(abertas.length), apoio:`${abertas.length === 1 ? 'oportunidade aberta' : 'oportunidades abertas'} · ${fechadasMes.length} ${fechadasMes.length === 1 ? 'fechada' : 'fechadas'} no mês`,
        etapas:[...ABERTAS.map(e => { const l = abertas.filter(o => o.etapa === e); return { nome:ETAPA[e], n:l.length, vl:somaV(l) ? reaisF(somaV(l)) : '—', cor:corEtapa(e) }; }),
          { nome:'Fechou no mês', n:fechadasMes.length, vl:somaV(fechadasMes) ? reaisF(somaV(fechadasMes)) : '—', cor:corEtapa('fechou') }],
        link:c.gestao ? { act:'fuEqAba', v:'funil', texto:'Abrir o funil' } : { rota:'/followup/funil', texto:'Abrir o funil' }, rotulo:`Funil: ${abertas.length} oportunidades abertas` },
      { id:'d', tipo:'colunas', titulo:'Visitas na semana', icone:'empresa', numero:String(visFeitas), nota:`${visFeitas === 1 ? 'feita' : 'feitas'} · ${visAg} ${visAg === 1 ? 'agendada' : 'agendadas'}`,
        barras:diasSem.map(d => visitas.filter(a => S.dia(a.quando) === d).length), rotulos:['seg', 'ter', 'qua', 'qui', 'sex'], rotulo:`Visitas na semana: ${visFeitas} feitas, ${visAg} agendadas` },
      { id:'e', tipo:'valor', titulo:'Em negociação', icone:'financeiro', valor:reaisF(somaV(abertas)), barras:ABERTAS.map(e => somaV(abertas.filter(o => o.etapa === e))),
        rotulos:['Prosp.', '1º cont.', 'Reunião', 'Proposta', 'Negoc.'], rotulo:`Em negociação: ${reaisF(somaV(abertas))}` },
      { id:'f', tipo:'pessoas', titulo:tReg, icone:'check', cuenta:`${regD.length} ${regD.length === 1 ? 'contato' : 'contatos'}`, vazio:`Nenhum contato registrado ${D === hoje ? 'hoje' : 'neste dia'}.`,
        itens:regD.map(a => ({ nome:nomeCli(a), sub:situacao(a) === 'nao_atendeu' ? 'não atendeu' : a.resposta ? RESP[a.resposta][0].toLowerCase() : '', vl:S.hora(a.registrado_em), ok:true })), rotulo:`${tReg}: ${regD.length}` },
      { id:'g', tipo:'colunas', titulo:D === hoje ? 'Próximos 7 dias' : `7 dias depois de ${dfmt(D).slice(0, 5)}`, icone:'agenda', numero:String(agProx.reduce((t, x) => t + x, 0)), nota:'agendados', barras:agProx, rotulos:prox7.map(d => CURTO[new Date(d + 'T12:00').getDay()]),
        rotulo:`Próximos 7 dias: ${agProx.reduce((t, x) => t + x, 0)} agendados` } ];
    const escolhido = S.ui[c.cxChave] || 'a';
    queueMicrotask(() => { const el = document.querySelector('#content .fu2 [data-casillero]'); if (!el || el.dataset.ligado) return; el.dataset.ligado = '1';
      S.casillero(el, { semEntrada:!document.getElementById('content').classList.contains('entra'), aoEscolher:id => { S.ui[c.cxChave] = id; } }); });
    return `<p class="cx-dica">Clique num bloco: ele vai para o espaço grande e mostra o detalhe.</p>${S.cxHtml(blocos, escolhido, c.rotulo)}`;
  };

  // Aba Funil: colunas por etapa; o cartão mostra valor, interesses e o próximo passo (ou há quantos dias está parado)
  const funil = c => {
    const hoje = S.today(), ops = c.ops, mes = hoje.slice(0, 7), ag = c.ag;
    const prox = o => ag.filter(a => aberto(a) && (a.oportunidade_id === o.id || (!a.oportunidade_id && a.cliente_id === o.cliente_id))).sort((a, b) => a.quando.localeCompare(b.quando))[0];
    const cartao = (o, k) => { const p = prox(o), parado = p ? 0 : entre(S.dia(o.atualizado_em || o.criado_em), hoje), nome = c.nome(o.cliente_id) || 'Cliente';
      const cm = c.cm.filter(x => x.oportunidade_id === o.id).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0];
      const pTxt = !ABERTAS.includes(o.etapa) ? `${o.etapa === 'fechou' ? 'Fechou' : 'Perdeu'} em ${dfmt(S.dia(o.fechado_em || o.atualizado_em)).slice(0, 5)}` : p ? `${TIPOS[p.tipo] || 'Contato'} ${S.dia(p.quando) === hoje ? 'hoje' : S.dia(p.quando) < hoje ? 'atrasado' : CURTO[new Date(p.quando).getDay()] + ' ' + dfmt(S.dia(p.quando)).slice(0, 5)} ${S.hora(p.quando)}` : `Sem próximo passo${parado ? ` há ${parado} ${parado === 1 ? 'dia' : 'dias'}` : ''}`;
      return `<article class="fu2-op${!p && ABERTAS.includes(o.etapa) ? ' parado' : ''}" draggable="true" data-op="${o.id}" style="--k:${k}">
        <button class="btn tres fu2-op-m" data-act="fuOpMenu" data-id="${o.id}" aria-label="Opções de ${esc(nome)}">${S.svg('mais3')}</button>
        <b>${esc(nome)}</b>${o.valor ? `<span class="fu2-op-v">${reaisF(o.valor)}</span>` : ''}
        ${(o.interesses || []).length ? `<span class="fu2-op-i">${o.interesses.map(i => `<i>${esc(INTER[i] || i)}</i>`).join('')}</span>` : ''}
        <small class="fu2-op-p${p && S.dia(p.quando) < hoje ? ' at' : ''}">${pTxt}</small>${c.comCons ? `<small>${esc(S.usuario(o.consultor_id) || 'Sem consultor')}</small>` : ''}
        ${cm ? `<span class="fu2-orient">${S.svg('chamados', 13)}${esc((S.usuario(cm.autor_id) || 'Diretor').split(' ')[0])}: ${esc(cm.texto)}</span>` : ''}</article>`; };
    const col = e => { const l = ops.filter(o => o.etapa === e && (e !== 'fechou' || String(o.fechado_em || '').slice(0, 7) === mes)).sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
      const tot = l.reduce((t, o) => t + Number(o.valor || 0), 0);
      return `<section class="fu2-col${e === 'fechou' ? ' ok' : ''}" data-etapa="${e}" aria-label="${ETAPA[e]}"><header><b>${ETAPA[e]}<span>${l.length}</span></b><small>${e === 'fechou' ? 'no mês · ' : ''}${tot ? reaisF(tot) : '—'}</small></header>
        <div class="fu2-cards">${l.map(cartao).join('') || '<p class="fu2-col-v">Nenhuma</p>'}</div></section>`; };
    const perdidas = ops.filter(o => o.etapa === 'perdeu' && String(o.fechado_em || '').slice(0, 7) === mes);
    return `<div class="fu2-funil" role="list">${[...ABERTAS, 'fechou'].map(col).join('')}</div>
      <p class="fu2-perd">${perdidas.length ? `Perdidas no mês: <b>${perdidas.length}</b> (${perdidas.slice(0, 4).map(o => `${esc(c.nome(o.cliente_id) || 'Cliente')}: ${esc((o.motivo || 'sem motivo').toLowerCase())}`).join(' · ')}${perdidas.length > 4 ? ' …' : ''})` : 'Nenhuma oportunidade perdida no mês.'}
      <span class="muted">· ${c.gestao ? 'No menu ⋯ do cartão: comentar, passar o cliente para outra pessoa ou trocar a etapa.' : 'Arraste o cartão para trocar a etapa (no celular, pelo menu ⋯).'}</span></p>`;
  };

  // ---------- Follow-up da equipe no Dashboard Gestão (etapa 3, aprovada em 11/11/2026, modelo "Follow-up da equipe · modelo") ----------
  // Um consultor por vez (cartões no alto), filtro de veículo, dias com setas e "Hoje", abas Rotina | Funil com os mesmos blocos
  // e o mesmo funil do consultor. O diretor cobra o atrasado (WhatsApp), comenta (comentar_followup) e passa o cliente (passar_cliente).
  // dados = { agenda, ops, coment, nomes:Map, consultores:[{ id, nome, celular, email, veiculos:[ids] }], veiculos, atendem(veiculo) → [{ id, nome }], recarregar }
  const msgCobrar = (a, u, cli) => `Oi, ${String(u.nome || '').split(' ')[0]}! O contato com ${cli} (${(TIPOS[a.tipo] || '').toLowerCase()} de ${dfmt(S.dia(a.quando))}) ainda está sem registro no Follow-up. Consegue registrar hoje?`;
  const cobrarBtn = (a, u, cli) => { const cel = String(u.celular || '').replace(/\D/g, ''), msg = msgCobrar(a, u, cli);
    return cel.length >= 10 ? `<a class="btn sm" href="https://wa.me/55${cel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" aria-label="Cobrar ${esc(u.nome || 'o consultor')} pelo WhatsApp">${S.svg('whats', 14)}Cobrar</a>`
      : u.email ? `<a class="btn sm" href="mailto:${esc(u.email)}?subject=${encodeURIComponent('Follow-up sem registro: ' + cli)}&body=${encodeURIComponent(msg)}">${S.svg('email', 14)}Cobrar</a>` : ''; };
  // O link da mensagem das 17h (#/geral/fu.<consultor>.<AAAA-MM-DD>) abre o consultor e o dia
  S.fuEquipeAbrir = (id, dia) => { st.eqCons = id || st.eqCons; if (/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) st.eqDia = dia; st.eqVei = ''; st.eqAba = 'rotina'; S.ui.fuCxEq = 'a'; };
  S.fuEquipeGestao = dados => {
    const { agenda:ag, ops, coment, nomes, consultores:consL, veiculos } = dados, hoje = S.today();
    if (!consL.length) { eq = null; return '<div class="card empty"><b>Nenhum consultor cadastrado</b>Cadastre em Administração › Colaboradores e vincule aos veículos.</div>'; }
    if (!consL.some(u => u.id === st.eqCons)) st.eqCons = consL[0].id;
    const u = consL.find(x => x.id === st.eqCons), D = st.eqDia && st.eqDia <= somaDias(hoje, 60) ? st.eqDia : hoje;
    if (st.eqVei && !(u.veiculos || []).includes(st.eqVei)) st.eqVei = '';
    const nomeVei = id => (veiculos.find(v => v.id === id) || {}).nome || '', nomeCli = id => nomes.get(id) || '';
    eq = Object.assign({}, dados, { ops });
    // Cartões dos consultores: contatos do dia escolhido e atrasados até hoje
    const pessoa = x => { const dele = ag.filter(a => a.consultor_id === x.id && situacao(a) !== 'cancelado'), doDia = dele.filter(a => S.dia(a.quando) === D), feitos = doDia.filter(a => !aberto(a)).length;
      const at = dele.filter(a => aberto(a) && S.dia(a.quando) < hoje).length, on = x.id === u.id;
      return `<button type="button" class="fq-pes${on ? ' on' : ''}" data-act="fuEqCons" data-id="${x.id}" aria-pressed="${on}">
        <span class="av soft" aria-hidden="true">${esc(S.iniciais(x.nome))}</span><span class="fq-pes-tx"><b>${esc(x.nome)}</b><small>${(x.veiculos || []).map(nomeVei).filter(Boolean).map(esc).join(' · ') || 'sem veículo'}</small>
        <span class="fq-pes-n"><span>${feitos}/${doDia.length} ${D === hoje ? 'hoje' : 'no dia'}</span>${at ? `<span class="fq-at">${at} ${at === 1 ? 'atrasado' : 'atrasados'}</span>` : '<span class="fq-ok">em dia</span>'}</span></span></button>`; };
    const vs = u.veiculos || [], filtroV = vs.length > 1 ? `<label class="fu-filtro"><span class="sr">Veículo</span><select data-fu-eqvei aria-label="Veículo">${[['', 'Todos os veículos dele'], ...vs.map(id => [id, nomeVei(id)])].map(([k, n]) => `<option value="${k}"${k === st.eqVei ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`
      : vs.length ? `<span class="fq-vei">${esc(nomeVei(vs[0]))}</span>` : '';
    const navDia = `<div class="hc-mes fq-dia" role="group" aria-label="Dia"><button type="button" class="hc-seta" data-act="fuEqDia" data-v="-1" aria-label="Dia anterior">${S.svg('esq', 16)}</button><b aria-live="polite">${D === hoje ? 'Hoje' : esc(diaSemana(D).replace('-feira', ''))}, ${dfmt(D).slice(0, 5)}</b><button type="button" class="hc-seta" data-act="fuEqDia" data-v="1" aria-label="Próximo dia">${S.svg('seta', 16)}</button></div>
      ${D !== hoje ? '<button type="button" class="btn sm" data-act="fuEqDia" data-v="0">Hoje</button>' : ''}`;
    const aba = st.eqAba === 'funil' ? 'funil' : 'rotina';
    const abas = `<div class="seg fu2-abas" role="tablist" aria-label="Follow-up de ${esc(u.nome)}">${[['rotina', 'Rotina'], ['funil', 'Funil']].map(([k, n]) => `<button type="button" role="tab" class="${aba === k ? 'on' : ''}" data-act="fuEqAba" data-v="${k}" aria-selected="${aba === k}">${n}</button>`).join('')}</div>`;
    const doV = x => !st.eqVei || x.veiculo_id === st.eqVei;
    const c = { ag:ag.filter(a => a.consultor_id === u.id && doV(a)), ops:ops.filter(o => o.consultor_id === u.id && doV(o)), todasOps:ops, cm:coment,
      cli:() => null, nome:nomeCli, D, gestao:true, comCons:false, cxChave:'fuCxEq', rotulo:`Rotina de ${u.nome}`, cobrar:a => cobrarBtn(a, u, nomeCli(a.cliente_id) || 'o cliente') };
    return `<div class="fq-pessoas" role="group" aria-label="Escolha o consultor">${consL.map(pessoa).join('')}</div>
      <div class="fu2 fu2-eq"><div class="row mid fu2-topo">${abas}<span class="grow"></span>${filtroV}${navDia}</div>
      ${aba === 'funil' ? funil(c) : rotina(c)}</div>`;
  };
  S.fuVerAgendaDe = id => { st.consultor = id; st.foco = ''; };
  // Comentário do diretor num contato ou numa oportunidade: aparece para o consultor no Follow-up (database/088 comentar_followup)
  const comentar = ({ agenda = null, oportunidade = null, cliente }) => {
    const ultimo = eq && eq.coment.filter(x => (agenda && x.agenda_id === agenda) || (oportunidade && x.oportunidade_id === oportunidade)).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0];
    S.form(`Comentar · ${esc(cliente || 'cliente')}`, [
      ...(ultimo ? [{ html:`<p class="fu2-orient" style="grid-column:1/-1">${S.svg('chamados', 13)}Último: ${esc(ultimo.texto)}</p>` }] : []),
      { k:'texto', label:'Orientação para o consultor', type:'textarea', req:true, full:true, ph:'Ex.: Leve o pacote do rotativo da manhã com 10% de desconto' },
      { html:'<p class="muted small" style="grid-column:1/-1;margin-top:-6px">Aparece para o consultor neste contato, dentro do Follow-up. Ele responde registrando o contato.</p>' }], {},
      v => S.run(async () => { await S.q(S.sb.rpc('comentar_followup', { p_agenda:agenda, p_oportunidade:oportunidade, p_texto:v.texto.trim() })); if (eq && eq.recarregar) await eq.recarregar(); }, 'Comentário enviado ao consultor'), 'Enviar');
  };
  // Passar o cliente para outra pessoa que atende o mesmo veículo (database/088 passar_cliente)
  const passar = o => {
    const gente = (eq && eq.atendem ? eq.atendem(o.veiculo_id) : []).filter(x => x.id !== o.consultor_id), nome = (eq && eq.nomes.get(o.cliente_id)) || 'cliente';
    if (!gente.length) return S.toast('Ninguém mais atende este veículo.');
    const marcados = eq.agenda.filter(a => a.cliente_id === o.cliente_id && aberto(a)).length;
    S.form(`Passar · ${esc(nome)}`, [
      { k:'novo', label:'Para quem', type:'select', req:true, full:true, options:[['', 'Escolha a pessoa'], ...gente.map(x => [x.id, x.nome])] },
      { k:'levar', label:'Contatos já marcados', type:'select', full:true, options:[['sim', 'Passam para a nova pessoa'], ['nao', 'São cancelados']] },
      { html:`<p class="muted small" style="grid-column:1/-1;margin-top:-6px">${marcados ? `${marcados} ${marcados === 1 ? 'contato marcado' : 'contatos marcados'} com este cliente. ` : ''}O cliente e a oportunidade vão para a carteira da nova pessoa.</p>` }],
      { novo:'', levar:'sim' },
      v => S.run(async () => { await S.q(S.sb.rpc('passar_cliente', { p_cliente:o.cliente_id, p_novo:v.novo, p_levar:v.levar !== 'nao' })); if (eq && eq.recarregar) await eq.recarregar(); },
        `${nome} passou para ${(gente.find(x => x.id === v.novo) || {}).nome || 'a nova pessoa'}`), 'Passar');
  };

  S.views.followup = () => {
    // 11/11/2026: abas Minha rotina (Casillero) e Funil; o acompanhamento da equipe fica no Dashboard Gestão
    const v = S.veh(), g = gestor();
    if (S.route().id === 'funil') { st.aba = 'funil'; try { history.replaceState(null, '', '#/followup'); } catch (e) { /* sem histórico */ } }
    if (st.aba !== 'funil') st.aba = 'rotina';
    if (g && st.consultor && !S.db.agenda.some(a => a.consultor_id === st.consultor) && !S.consultores().some(u => u.id === st.consultor)) st.consultor = '';
    marcarLidos();
    const hoje = S.today(), sub = `${esc(v.nome)} · ${diaSemana(hoje)}, ${dfmt(hoje).slice(0, 5)}${!g ? ' · ' + esc(S.me.nome || '') : ''}`;
    const abas = `<div class="seg fu2-abas" role="tablist" aria-label="Follow-up">${[['rotina', 'Minha rotina'], ['funil', 'Funil']].map(([k, n]) => `<button type="button" role="tab" class="${st.aba === k ? 'on' : ''}" data-act="fuAba" data-v="${k}" aria-selected="${st.aba === k}">${g && k === 'rotina' ? 'Rotina' : n}</button>`).join('')}</div>`;
    const filtro = g ? `<label class="fu-filtro"><span class="sr">Consultor</span><select data-fu-consultor aria-label="Consultor">${[['', 'Todos os consultores'], ...S.consultores().map(u => [u.id, u.nome || u.email])].map(([k, n]) => `<option value="${k}"${k === st.consultor ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : '';
    return { title:`<span class="sub">${sub}</span>Follow-up`,
      actions:`<button class="btn" data-act="fuProspect">${S.svg('mais')}Novo prospect</button><button class="btn pri" data-act="fuNovo">${S.svg('mais')}Agendar contato</button>`,
      body:`<div class="fu2"><div class="row mid fu2-topo">${abas}<span class="grow"></span>${filtro}${S.me.diretor ? '<button class="btn sm" data-act="geralFollowup">Ver no Dashboard Gestão</button>' : ''}</div>
        ${st.aba === 'funil' ? funil(ctxVeiculo()) : rotina(ctxVeiculo())}</div>` };
  };
  // A orientação do diretor conta como lida quando o consultor abre o Follow-up
  let lendo = false;
  const marcarLidos = () => { if (lendo || gestor()) return; const ids = (S.db.fuComent || []).filter(c => c.para_id === S.me.id && !c.lido_em).map(c => c.id); if (!ids.length || !S.sb) return;
    lendo = true; S.q(S.sb.from('followup_comentarios').update({ lido_em:new Date().toISOString() }).in('id', ids)).then(() => { (S.db.fuComent || []).forEach(c => { if (ids.includes(c.id)) c.lido_em = new Date().toISOString(); }); }).catch(console.error).finally(() => { lendo = false; }); };

  // ---------- registrar ----------
  const chips = (nome, lista, marcado) => `<div class="chips" role="radiogroup">${lista.map(([k, n]) => `<label><input type="radio" name="${nome}" value="${esc(k)}"${k === marcado ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>`;
  const registrar = a => {
    const cli = S.pessoa(a.cliente_id), dia = S.dia(a.quando), visita = a.tipo === 'visita' || a.tipo === 'reuniao', op = oportDe(a);
    S.dialog(`<h2>Registrar ${(TIPOS[a.tipo] || 'contato').toLowerCase()}</h2>
      <div class="fu-cli"><span class="av soft" aria-hidden="true">${esc(S.iniciais(cli ? cli.nome : '?'))}</span><span class="tx"><b>${esc(cli ? cli.nome : 'Sem cliente')}</b><small>${dia === S.today() ? 'Hoje' : dfmt(dia)} · ${diaSemana(dia)} às ${S.hora(a.quando)}${a.assunto ? ' · ' + esc(a.assunto) : ''}</small></span></div>
      <fieldset class="f"><legend>Como foi?</legend>${chips('sit', [['realizado', visita ? 'Realizada' : 'Falei com o cliente'], ['nao_atendeu', visita ? 'Cliente não recebeu' : 'Não atendeu'], ['remarcar', 'Remarcar']], 'realizado')}</fieldset>
      <fieldset class="f" data-so="realizado"><legend>O que o cliente respondeu?</legend>${chips('resp', Object.entries(RESP).map(([k, [n]]) => [k, n]), '')}</fieldset>
      <label class="f" data-so="realizado nao_atendeu">O que ficou combinado<textarea name="resultado" placeholder="Ex.: Gostou do rotativo, vai falar com o sócio e responde na sexta"></textarea></label>
      <fieldset class="f fu-motivo" data-so="sem"><legend>Por que não quis?</legend>${chips('motivo', MOTIVOS.map(m => [m, m]), '')}</fieldset>
      <div class="fu2-reg" data-so="realizado">
        <p class="fu2-auto" id="fuEtapaAviso" aria-live="polite"></p>
        <div class="fu-3"><label class="f">Valor estimado<input name="valor" data-mask="dec" inputmode="decimal" placeholder="R$" value="${op && op.valor ? String(op.valor).replace('.', ',') : ''}"></label>
          <label class="f">Etapa<select name="etapa"><option value="">Automática</option>${ETAPAS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label></div>
        <fieldset class="f"><legend>Interesse</legend><div class="chips">${INTERESSES.map(([k, n]) => `<label><input type="checkbox" name="inter" value="${k}"${op && (op.interesses || []).includes(k) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
        ${a.tipo === 'visita' ? '<p class="fu2-loc">O local da visita é registrado pelo celular quando você salvar (se o navegador pedir, permita).</p>' : ''}</div>
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
      const ea = document.getElementById('fuEtapaAviso'); if (ea) { const prev = etapaPrevista(op ? op.etapa : 'prospeccao', sit, resp, a.tipo), esc2 = f.etapa.value;
        ea.textContent = esc2 ? `A oportunidade vai para "${ETAPA[esc2]}".` : resp ? `A oportunidade vai para "${ETAPA[prev]}" sozinha. Troque a etapa se precisar.` : ''; }
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
      const etapa = sit === 'realizado' ? f.etapa.value || null : null, valor = sit === 'realizado' && f.valor.value.trim() ? S.num(f.valor.value) : null;
      const inter = sit === 'realizado' ? [...f.querySelectorAll('[name="inter"]:checked')].map(x => x.value) : null;
      delete d.dataset.sujo; d.close('cancel');
      // Visita: pega o local no celular (até 8 segundos; se a pessoa negar, salva sem local)
      const loc = sit === 'realizado' && a.tipo === 'visita' && navigator.geolocation ? await new Promise(ok => navigator.geolocation.getCurrentPosition(p => ok(p.coords), () => ok(null), { enableHighAccuracy:true, timeout:8000, maximumAge:60000 })) : null;
      if (sit === 'remarcar') return S.run(() => S.salvar('agenda', { id:a.id, quando:iso(data, hora) }), `Remarcado para ${diaSemana(data)}, ${dfmt(data).slice(0, 5)}`);
      const ok = await S.run(async () => {
        await S.q(S.sb.rpc('registrar_followup', { p_id:a.id, p_situacao:sit, p_resposta:sit === 'realizado' ? resp : null, p_resultado:texto, p_motivo:resp === 'sem_interesse' ? motivo : '',
          p_proximo:data && resp !== 'sem_interesse' ? iso(data, hora) : null, p_proximo_tipo:tipo, p_proximo_assunto:assunto || (sit === 'nao_atendeu' ? 'Nova tentativa' : ''),
          p_etapa:etapa, p_valor:valor, p_interesses:inter && inter.length ? inter : (inter && op && (op.interesses || []).length ? [] : null),
          p_lat:loc ? +loc.latitude.toFixed(6) : null, p_lng:loc ? +loc.longitude.toFixed(6) : null, p_precisao:loc ? Math.round(loc.accuracy) : null }));
        await recarregar();
      }, resp === 'sem_interesse' ? 'Registrado. O cliente sai do follow-up.' : data ? `Registrado. Próximo contato: ${diaSemana(data)}, ${dfmt(data).slice(0, 5)}` : 'Registrado');
      if (ok && resp === 'proposta' && S.pode('diretor', 'gerente', 'consultor') && a.cliente_id && await S.confirmar('Criar a proposta agora?\n\nAbre uma proposta nova para este cliente. Você também pode criar depois, em Propostas.', { ok:'Criar proposta', voltar:'Depois' }))
        S.actions.prNova({ cliente:a.cliente_id });
    });
  };
  // Depois de registrar, busca a agenda da rádio de novo (a função criou o próximo contato)
  const recarregar = async () => { const v = S.ui.vehicleId;
    const [ag, ops, cm] = await Promise.all([S.todos(S.sb.from('agenda').select('*').eq('veiculo_id', v)), S.todos(S.sb.from('oportunidades').select('*').eq('veiculo_id', v)).catch(() => S.db.oportunidades || []),
      S.todos(S.sb.from('followup_comentarios').select('*').eq('veiculo_id', v)).catch(() => S.db.fuComent || [])]);
    Object.assign(S.db, { agenda:ag, oportunidades:ops, fuComent:cm }); };
  S.fuRecarregar = recarregar;
  // A mesma regra de etapa_pela_resposta (database/088), só para mostrar antes de salvar
  const etapaPrevista = (atual, sit, resp, tipo) => resp === 'fechou' ? 'fechou' : resp === 'sem_interesse' ? 'perdeu' : resp === 'proposta' ? (atual === 'negociacao' ? atual : 'proposta')
    : ['interessado', 'retorno'].includes(resp) ? (['proposta', 'negociacao'].includes(atual) ? atual : ['visita', 'reuniao'].includes(tipo) || atual === 'reuniao' ? 'reuniao' : 'primeiro_contato') : atual || 'prospeccao';

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

  // Novo prospect (cadastro rápido, database/088 novo_prospect): o cliente nasce "prospect" só neste veículo, na carteira de quem cadastrou
  const novoProspect = () => {
    const g = gestor(), amanha = somaDias(S.today(), 1), cons = S.consultores();
    S.dialog(`<h2>Novo prospect</h2>
      <label class="f">Empresa<input name="nome" required autocomplete="off" placeholder="Ex.: Padaria Pão Dourado"></label>
      <div class="fu-3 fu2-2"><label class="f">Quem atende<input name="contato" placeholder="Ex.: Carla (dona)"></label><label class="f">Telefone ou WhatsApp<input name="telefone" data-mask="tel" inputmode="tel"></label></div>
      <div class="fu-3 fu2-2"><label class="f">Valor estimado (opcional)<input name="valor" data-mask="dec" inputmode="decimal" placeholder="R$"></label>
        ${g ? `<label class="f">Consultor<select name="consultor"><option value="">Eu mesmo</option>${cons.map(u => `<option value="${u.id}">${esc(u.nome || u.email)}</option>`).join('')}</select></label>` : '<span></span>'}</div>
      <fieldset class="f"><legend>Interesse</legend><div class="chips">${INTERESSES.map(([k, n]) => `<label><input type="checkbox" name="inter" value="${k}"><span>${n}</span></label>`).join('')}</div></fieldset>
      <p class="fu-prox-t">Primeiro contato</p>
      <div class="fu-3"><label class="f">Tipo<select name="tipo">${NOVOS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label><label class="f">Data<input type="date" name="dia" value="${amanha}" min="${S.today()}"></label><label class="f">Hora<input name="hora" value="09:00" data-mask="hora" inputmode="numeric"></label></div>
      <label class="f">Assunto<input name="assunto" placeholder="Ex.: Apresentar o rotativo da manhã"></label>
      <p class="fu2-auto">Entra como prospect só na ${esc(S.veh().nome)}. CNPJ, endereço e o resto se completam quando for fazer a proposta.</p>
      <div class="row mid"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button type="button" class="btn pri" data-fu="pros">Salvar e agendar</button></div>`);
    const d = document.getElementById('dlg'), f = d.querySelector('form'); d.dataset.guarda = '1'; f.nome.focus();
    f.addEventListener('click', async e => { if (!e.target.closest('[data-fu="pros"]')) return;
      if (!f.nome.value.trim()) return S.erroNoCampo(f.nome, 'Informe o nome da empresa.');
      if (!f.dia.value) return S.erroNoCampo(f.dia, 'Escolha a data.');
      const inter = [...f.querySelectorAll('[name="inter"]:checked')].map(x => x.value), dia = f.dia.value;
      const args = { p_veiculo:S.ui.vehicleId, p_nome:f.nome.value.trim(), p_contato:f.contato.value.trim(), p_telefone:f.telefone.value, p_valor:f.valor.value.trim() ? S.num(f.valor.value) : null,
        p_interesses:inter, p_tipo:f.tipo.value, p_quando:iso(dia, f.hora.value || '09:00'), p_assunto:f.assunto.value.trim(), p_consultor:g && f.consultor ? f.consultor.value || S.me.id : null };
      delete d.dataset.sujo; d.close('cancel');
      await S.run(async () => { await S.q(S.sb.rpc('novo_prospect', args)); S.db.pessoas = await S.todos(S.sb.from('pessoas').select('*').eq('veiculo_id', S.ui.vehicleId)); await recarregar(); },
        `Prospect cadastrado. Primeiro contato: ${diaSemana(dia)}, ${dfmt(dia).slice(0, 5)}`); });
  };
  // Troca de etapa (arrastar no funil ou pelo menu do cartão); "Perdeu" pede o motivo
  const mover = async (id, etapa) => { const o = oport(id); if (!o || o.etapa === etapa) return;
    let motivo = '';
    if (etapa === 'perdeu') { const r = await new Promise(ok => { S.form('Por que perdeu?', [{ k:'motivo', label:'Motivo', type:'select', options:MOTIVOS.map(m => [m, m]), full:true }], { motivo:MOTIVOS[0] }, v => ok(v.motivo), 'Marcar como perdida');
        document.getElementById('dlg').addEventListener('close', () => ok(null), { once:true }); }); if (!r) return; motivo = r; }
    S.run(async () => { await S.q(S.sb.rpc('mover_oportunidade', { p_id:id, p_etapa:etapa, p_motivo:motivo })); if (naGestao() && eq && eq.recarregar) await eq.recarregar(); else await recarregar(); }, `Movida para "${ETAPA[etapa]}"`); };
  // Arrastar e soltar no funil (computador)
  document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.fu2-op'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.op); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrasta'); });
  document.addEventListener('dragend', e => { document.querySelectorAll('.fu2-op.arrasta, .fu2-col.alvo').forEach(x => x.classList.remove('arrasta', 'alvo')); });
  document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.fu2-col'); if (!col) return; e.preventDefault(); document.querySelectorAll('.fu2-col.alvo').forEach(x => x !== col && x.classList.remove('alvo')); col.classList.add('alvo'); });
  document.addEventListener('drop', e => { const col = e.target.closest && e.target.closest('.fu2-col'); if (!col) return; e.preventDefault(); col.classList.remove('alvo'); const id = e.dataTransfer.getData('text/plain'); if (id) mover(id, col.dataset.etapa); });

  Object.assign(S.actions, {
    fuFoco: d => { st.foco = d.v; S.render(); },
    fuAba: d => { if (st.aba === d.v) return; st.aba = d.v; S.render(); },
    fuProspect: novoProspect,
    fuMover: d => mover(d.id, d.v),
    fuOpMenu: (d, botao) => { const o = oport(d.id); if (!o) return;
      const mov = ETAPAS.filter(([k]) => k !== o.etapa).map(([k, n]) => ({ label:`Mover para ${n}`, icon:k === 'fechou' ? 'check' : k === 'perdeu' ? 'fechar' : 'seta', act:'fuMover', data:{ id:o.id, v:k } }));
      if (naGestao()) return S.menu(botao, [{ label:'Comentar', icon:'chamados', act:'fuComentarOp', data:{ id:o.id } }, { label:'Passar para outra pessoa', icon:'clientes', act:'fuPassar', data:{ id:o.id } }, '-', ...mov]);
      S.menu(botao, [...ETAPAS.filter(([k]) => k !== o.etapa).map(([k, n]) => ({ label:`Mover para ${n}`, icon:k === 'fechou' ? 'check' : k === 'perdeu' ? 'fechar' : 'seta', act:'fuMover', data:{ id:o.id, v:k } })),
        '-', { label:'Agendar contato', icon:'agenda', act:'fuNovo', data:{ cliente:o.cliente_id } }, { label:'Abrir o cliente', icon:'clientes', act:'pesEditar', data:{ id:o.cliente_id } }]); },
    // Follow-up da equipe (Dashboard Gestão)
    fuEqCons: d => { if (st.eqCons === d.id) return; st.eqCons = d.id; st.eqVei = ''; S.render(); },
    fuEqAba: d => { if (st.eqAba === d.v) return; st.eqAba = d.v; S.render(); },
    fuEqDia: d => { const n = +d.v; st.eqDia = n ? somaDias(st.eqDia || S.today(), n) : ''; if (st.eqDia === S.today()) st.eqDia = ''; S.render(); },
    fuComentar: d => { const a = eq && eq.agenda.find(x => x.id === d.id); if (a) comentar({ agenda:a.id, oportunidade:a.oportunidade_id || null, cliente:eq.nomes.get(a.cliente_id) }); },
    fuComentarOp: d => { const o = oport(d.id); if (o) comentar({ oportunidade:o.id, cliente:eq && eq.nomes.get(o.cliente_id) }); },
    fuPassar: d => { const o = oport(d.id); if (o) passar(o); },
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
  document.addEventListener('change', e => { if (e.target.matches('select[data-fu-consultor]')) { st.consultor = e.target.value; S.render(); }
    if (e.target.matches('select[data-fu-eqvei]')) { st.eqVei = e.target.value; S.render(); } });
})();

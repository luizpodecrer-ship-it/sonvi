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
  const st = { aba:'equipe', periodo:'semana', consultor:'' }; // estado da tela (só na memória)

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
        const r = document.getElementById('fu-resto'); if (r && gestor() && st.aba === 'equipe') r.innerHTML = equipeResto(); } }); } });
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
    const sr = semResposta(c), esq = esquecidos(c);
    const agPorProposta = id => S.db.agenda.find(a => a.proposta_id === id && aberto(a));
    const quem = gestor() ? (st.consultor ? S.usuario(st.consultor) : 'Todos os consultores') : 'Seus contatos';
    return `${painelTopo(todos, quem)}
      <div class="cols fu-cols"><div class="fu-col">
        ${atras.length ? card(`Atrasados <span class="muted small">${atras.length}</span>`, `<div class="agenda">${atras.map(a => linha(a, { comConsultor })).join('')}</div>`, '<span class="muted small">o gerente vê no resumo do dia seguinte</span>', ' fu-atras') : ''}
        ${card(`Hoje <span class="muted small">${deHoje.length || ''}</span>`, deHoje.length ? `<div class="agenda">${deHoje.map(a => linha(a, { comConsultor })).join('')}</div>` : vazio('Nada marcado para hoje.'))}
        ${card(`Próximos 7 dias <span class="muted small">${prox.length || ''}</span>`, prox.length ? Object.entries(porDia).map(([d, l]) => `<p class="fu-dia">${diaSemana(d)}, ${dfmt(d).slice(0, 5)}</p><div class="agenda">${l.map(a => linha(a, { comConsultor })).join('')}</div>`).join('') + (depois ? `<p class="muted small" style="margin-top:12px">E mais ${depois} depois disso.</p>` : '') : vazio('Nenhum contato marcado para os próximos dias.'))}
        ${card('Últimos registros', feitos.length ? `<div class="agenda">${feitos.map(a => linha(a, { comConsultor })).join('')}</div>` : vazio('Nenhum contato registrado ainda.'))}
      </div><div class="fu-col">
        ${card(`Propostas sem resposta ${S.tag('automático', 'purple')}`, `<p class="muted small fu-nota">Enviada há 3 dias sem resposta vira follow-up sozinha, no e-mail das 7h30.</p>${sr.length ? `<div class="list">${sr.slice(0, 6).map(p => { const ag = agPorProposta(p.id);
          return `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(S.nome(p.cliente_id)))}</span><span class="tx"><b>${esc(S.nome(p.cliente_id))}</b><small>${S.propNo(p)} · enviada ${dfmt(S.dia(p.enviada_em)).slice(0, 5)}${ag ? ` · na agenda ${dfmt(S.dia(ag.quando)).slice(0, 5)}` : ''}</small></span>
            ${ag ? `<button class="btn sm" data-go="/propostas/${p.id}">Abrir</button>` : `<button class="btn sm" data-act="fuNovo" data-cliente="${p.cliente_id}" data-proposta="${p.id}">Agendar</button>`}</div>`; }).join('')}</div>` : vazio('Nenhuma proposta esperando resposta.')}`)}
        ${card('Carteira esquecida', `<p class="muted small fu-nota">Clientes ${c ? 'da carteira' : 'das carteiras'} sem nenhum contato há mais de 30 dias.</p>${esq.length ? `<div class="list">${esq.slice(0, 6).map(e => `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(e.p.nome))}</span><span class="tx"><b>${esc(e.p.nome)}</b><small>${e.ult ? `último contato ${dfmt(e.ult).slice(0, 5)} · ${e.dias} dias` : 'nenhum contato registrado'}${!c && e.p.consultor_id ? ` · ${esc(S.usuario(e.p.consultor_id))}` : ''}</small></span>
            <button class="btn sm" data-act="fuNovo" data-cliente="${e.p.id}">Agendar</button></div>`).join('')}</div>${esq.length > 6 ? `<p class="muted small" style="margin-top:10px">E mais ${esq.length - 6}.</p>` : ''}` : vazio('Todos os clientes tiveram contato no último mês.')}`)}
      </div></div>`;
  };

  // Equipe (gerente e diretor): números do período, tabela por consultor, atrasados e funil
  const equipe = () => `${painelTopo(S.db.agenda, 'Toda a equipe')}<div id="fu-resto">${equipeResto()}</div>`;
  const equipeResto = () => {
    const R = periodoDe(Math.max(0, PER.indexOf(st.periodo))), hoje = S.today(), ini = R.ini, fim = R.fim, nomeP = { semana:['na semana', 'da semana'], mes:['no mês', 'do mês'], '3meses':['em 3 meses', 'dos 3 meses'] }[st.periodo] || ['na semana', 'da semana'];
    const noPer = a => { const d = S.dia(a.quando); return d >= ini && d <= fim; }, regPer = a => a.registrado_em && S.dia(a.registrado_em) >= ini && S.dia(a.registrado_em) <= fim;
    const ag = S.db.agenda, plan = ag.filter(noPer), feitos = ag.filter(a => S.fuFeito(a) && regPer(a)), atras = ag.filter(a => aberto(a) && S.dia(a.quando) < hoje).sort((a, b) => a.quando.localeCompare(b.quando));
    const props = (S.db.propostas || []), pPer = props.filter(p => p.criado_em && S.dia(p.criado_em) >= ini && S.dia(p.criado_em) <= fim), vPer = props.filter(p => p.aprovada_em && S.dia(p.aprovada_em) >= ini && S.dia(p.aprovada_em) <= fim);
    const soma = l => l.reduce((s, p) => s + Number(p.valor_total || 0), 0), brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
    const cons = [...new Set([...S.consultores().map(u => u.id), ...ag.map(a => a.consultor_id)])].filter(Boolean);
    const linhas = cons.map(id => { const p = plan.filter(a => a.consultor_id === id), f = p.filter(S.fuFeito).length, at = atras.filter(a => a.consultor_id === id).length;
      const ult = ag.filter(a => a.consultor_id === id && a.registrado_em).map(a => a.registrado_em).sort().pop(), dUlt = ult ? entre(S.dia(ult), hoje) : null, esq = esquecidos(id).length;
      return `<tr><td><span class="fu-pes"><span class="av soft" aria-hidden="true">${esc(S.iniciais(S.usuario(id)))}</span>${esc(S.usuario(id)) || '—'}</span></td>
        <td class="nw"><span class="fu-barra" aria-hidden="true"><i style="width:${p.length ? Math.round(f / p.length * 100) : 0}%"></i></span>${f} / ${p.length}</td>
        <td class="r">${at ? S.tag(at, 'red') : '0'}</td><td class="r">${pPer.filter(x => x.consultor_id === id).length}</td><td class="r">${vPer.filter(x => x.consultor_id === id).length}</td>
        <td class="r">${esq ? S.tag(`${esq} ${esq === 1 ? 'cliente' : 'clientes'}`, esq > 4 ? 'orange' : 'gray') : '0'}</td>
        <td class="nw${dUlt !== null && dUlt >= 3 ? ' fu-ruim' : ''}">${ult ? (dUlt === 0 ? 'hoje, ' + S.hora(ult) : dUlt === 1 ? 'ontem, ' + S.hora(ult) : `há ${dUlt} dias`) : 'nunca'}</td>
        <td class="r"><button class="btn sm" data-act="fuVerConsultor" data-id="${id}">Ver agenda</button></td></tr>`; }).join('');
    const reg = ag.filter(regPer), real = reg.filter(S.fuFeito), int = real.filter(a => ['interessado', 'retorno', 'proposta', 'fechou'].includes(a.resposta)).length;
    const pp = real.filter(a => ['proposta', 'fechou'].includes(a.resposta)).length, fe = real.filter(a => a.resposta === 'fechou').length, maxF = Math.max(1, real.length);
    const motivos = Object.entries(real.filter(a => a.resposta === 'sem_interesse').reduce((m, a) => { const k = a.motivo || 'Sem motivo'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    const cobrar = a => { const u = S.db.usuarios.find(x => x.id === a.consultor_id) || {}, cel = String(u.celular || '').replace(/\D/g, ''), cli = S.nome(a.cliente_id) || 'o cliente';
      const msg = `Oi, ${String(u.nome || '').split(' ')[0]}! O contato com ${cli} (${(TIPOS[a.tipo] || '').toLowerCase()} de ${dfmt(S.dia(a.quando))}) ainda está sem registro no Follow-up do SONVI. Consegue registrar hoje?`;
      return cel.length >= 10 ? `<a class="btn sm" href="https://wa.me/55${cel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Cobrar consultor</a>`
        : u.email ? `<a class="btn sm" href="mailto:${esc(u.email)}?subject=${encodeURIComponent('Follow-up sem registro: ' + cli)}&body=${encodeURIComponent(msg)}">Cobrar consultor</a>` : ''; };
    const funil = [['Contatos realizados', real.length], ['Com interesse', int], ['Pediram proposta', pp], ['Fecharam', fe]];
    return `      <section class="card"><div class="hd"><h2>Por consultor</h2></div>${cons.length ? `<div class="scroll"><table class="fu-tab"><thead><tr><th>Consultor</th><th>Contatos ${nomeP[0]}</th><th class="r">Atrasados</th><th class="r">Propostas</th><th class="r">Vendas</th><th class="r">Carteira sem contato 30+ dias</th><th>Último registro</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div>` : vazio('Nenhum consultor nesta rádio ainda.')}</section>
      <div class="cols fu-cols">${card(`Atrasados da equipe <span class="muted small">${atras.length || ''}</span>`, atras.length ? `<div class="agenda">${atras.slice(0, 12).map(a => { const d = entre(S.dia(a.quando), S.today());
          return `<div class="ag fu-l"><span class="tx" style="grid-column:1/3"><b>${esc(S.nome(a.cliente_id) || 'Sem cliente')}</b><small>${TIPOS[a.tipo] || ''} de ${dfmt(S.dia(a.quando)).slice(0, 5)} · ${esc(S.usuario(a.consultor_id))}</small><small class="fu-esc">${d} ${d === 1 ? 'dia' : 'dias'} sem registro${d >= 2 ? ' · já entrou no resumo do gerente' : ''}</small></span><span class="ac">${cobrar(a)}</span></div>`; }).join('')}</div>` : vazio('Nenhum retorno atrasado. A equipe está em dia.'))}
        ${card(`Funil ${nomeP[1]}`, `<div class="fu-funil">${funil.map(([n, v], i) => `<div><span>${n}</span><span class="fu-fb" aria-hidden="true"><i style="width:${Math.max(v ? 4 : 0, Math.round(v / maxF * 100))}%;opacity:${1 - i * .16}"></i></span><b>${v}</b></div>`).join('')}</div>
          ${motivos.length ? `<p class="muted small" style="margin-top:16px">Motivos de "sem interesse": ${motivos.map(([m, n]) => `${esc(m.toLowerCase())} (${n})`).join(', ')}.</p>` : ''}`)}</div>`;
  };

  S.views.followup = () => {
    const v = S.veh(), g = gestor(), aba = g ? st.aba : 'agenda';
    if (g && st.consultor && !S.db.agenda.some(a => a.consultor_id === st.consultor) && !S.consultores().some(u => u.id === st.consultor)) st.consultor = '';
    const hoje = S.today(), sub = `${esc(v.nome)} · ${diaSemana(hoje)}, ${dfmt(hoje).slice(0, 5)}${!g ? ' · ' + esc(S.me.nome || '') : ''}`;
    const abas = g ? `<div class="row mid fu-topo"><div class="seg" style="margin:0">${[['equipe', 'Equipe'], ['agenda', 'Agenda']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="fuAba" data-tab="${k}" aria-pressed="${aba === k}">${n}</button>`).join('')}</div>
        ${aba === 'equipe' ? ''
          : `<label class="fu-filtro"><span class="sr">Consultor</span><select data-fu-consultor aria-label="Consultor">${[['', 'Todos os consultores'], ...S.consultores().map(u => [u.id, u.nome || u.email])].map(([k, n]) => `<option value="${k}"${k === st.consultor ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`}
        <span class="grow"></span>${S.pode('diretor') ? `<button class="btn sm" data-act="fuAmostra">${S.svg('seta')}Receber o resumo de hoje</button>` : ''}</div>` : '';
    return { title:`<span class="sub">${sub}</span>${g && aba === 'equipe' ? 'Follow-up da equipe' : 'Follow-up'}`,
      actions:`<button class="btn pri" data-act="fuNovo">${S.svg('mais')}Agendar contato</button>`,
      body:abas + (aba === 'equipe' ? equipe() : agenda()) };
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
        <div class="fu-3"><label class="f">Data<input type="date" name="pdata" min="${S.today()}"></label><span class="f"><span>Dia da semana</span><span class="fu-ro" id="fuDia" aria-live="polite">—</span></span><label class="f">Hora<input type="time" name="phora" value="10:00"></label></div>
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
  const recarregar = async () => { S.db.agenda = await S.q(S.sb.from('agenda').select('*').eq('veiculo_id', S.ui.vehicleId)); };

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
    fuAba: d => { st.aba = d.tab; S.render(); },
    fuPeriodo: d => { st.periodo = d.tab; S.render(); },
    fuVerConsultor: d => { st.aba = 'agenda'; st.consultor = d.id; S.render(); window.scrollTo(0, 0); },
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

// SONVI · módulo de Pedidos de Inserção (PI): lista, edição em grade (com Editar/Salvar), mídias, faturamento e documento para impressão.
(() => {
  const { esc, brl, num, nfmt, dfmt, uid, today } = S;
  const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cur = () => S.db.pis.find(p => p.id === S.route().id);
  const letter = (pi, id) => { const i = pi.dados.pieces.findIndex(p => p.id === id); return i < 0 ? '' : String.fromCharCode(65 + i); };
  const blankItem = () => ({ id:uid(), piece:'', f1:'', f2:'', days:{}, unit:0, disc:{ type:'pct', value:0 }, bonus:false });
  const comercial = pi => S.pode('diretor', 'gerente') || (S.pode('consultor') && pi.consultor_id === S.me.id);
  const editavel = pi => S.EDITABLE.includes(pi.status) && comercial(pi);
  const produtos = tipo => S.db.produtos.filter(p => p.tipo === tipo && p.ativo).map(p => p.nome).sort();

  // ---------- lista (aprovada em 24/10/2026): PIs do mês, régua das etapas, propostas aprovadas, "no ar" no mês e a lista ----------
  // Tudo nos tons da cor do veículo. Estilos .pr-* (régua), .ga-* (no ar) e os .fn-* compartilhados em sonvi.css.
  const pm = { mes:'', et:'', todos:false };   // todos: mostra todos os PIs no ar (senão, os 8 primeiros)   // mes '' = o mês de hoje
  let viraMesPi = 0, reguaAntes = null;
  const MESES_PI = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMesPi = ym => { const n = MESES_PI[+ym.slice(5) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${ym.slice(0, 4)}`; };
  const somaMesPi = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const ETAPAS_PI = ['rascunho', 'opec', 'devolvido', 'aprovado', 'programado', 'faturado'];
  const curtoPi = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  // Primeiro e último dia com inserção (rádio) ou período da ação digital
  const veiculacao = p => { const ds = [];
    (p.dados.grids || []).forEach(g => (g.items || []).forEach(it => Object.entries(it.days || {}).forEach(([d, n]) => { if (Number(n) > 0) ds.push(`${g.period}-${String(d).padStart(2, '0')}`); })));
    (p.dados.digital || []).forEach(a => { if (a.inicio) ds.push(a.inicio); if (a.fim) ds.push(a.fim); });
    if (!ds.length) return null; ds.sort(); return [ds[0], ds[ds.length - 1]]; };
  const etiquetaPi = p => p.status === 'opec' ? '<span class="pill fn-ok pf-vivo">Na OPEC</span>' : p.status === 'devolvido' ? '<span class="pill fn-forte">Devolvido</span>'
    : ['rascunho', 'cancelado'].includes(p.status) ? `<span class="pill fn-neutra">${S.STATUS[p.status].label}</span>` : `<span class="pill fn-ok">${S.STATUS[p.status].label}</span>`;
  const pagTom = p => { const r = ((S.db && S.db.pagPis) || {})[p.id]; if (!r) return '';
    return r.situacao === 'pago' ? '<span class="pill fn-neutra">Pago</span>' : r.situacao === 'atrasado' ? '<span class="pill fn-forte">Pagamento atrasado</span>'
      : `<span class="pill fn-neutra">Em aberto${r.proximo ? ` · vence ${S.dfmt(r.proximo).slice(0, 5)}` : ''}</span>`; };
  S.views.pis = () => {
    const hoje = today(), ym = pm.mes || hoje.slice(0, 7), mesN = MESES_PI[+ym.slice(5) - 1], q = (S.ui.q || '').toLowerCase();
    const doMes = S.db.pis.filter(p => S.dia(p.criado_em).slice(0, 7) === ym && p.status !== 'cancelado');
    const totDe = l => l.reduce((s, p) => s + S.calc(p).total, 0);
    const et = ETAPAS_PI.map(k => { const xs = doMes.filter(p => p.status === k); return { k, nome:S.STATUS[k].label, xs, v:totDe(xs) }; });
    const sel = et.find(e => e.k === pm.et), base = sel ? sel.xs : doMes, tot = totDe(base);
    const atrasados = S.db.pis.filter(p => (((S.db.pagPis || {})[p.id]) || {}).situacao === 'atrasado').length, devolvidos = S.db.pis.filter(p => p.status === 'devolvido').length, naOpec = S.db.pis.filter(p => p.status === 'opec').length;
    const regua = `<div class="pr-regua${sel ? ' filtra' : ''}" role="group" aria-label="Etapas dos PIs de ${mesN} (escolha para filtrar)">${et.filter(e => e.xs.length).map(e => `<button type="button" class="pr-et-${e.k}" data-act="piEtapa" data-v="${e.k}" style="flex-grow:${Math.max(1, Math.round(e.v)) || 1}" aria-pressed="${pm.et === e.k}" aria-label="${e.nome}: ${e.xs.length} PI${e.xs.length === 1 ? '' : 's'}, ${curtoPi(e.v)}" title="${e.nome} · ${curtoPi(e.v)}"></button>`).join('') || '<span class="pr-vazia"></span>'}</div>
      <div class="pr-leg">${et.map(e => `<button type="button" class="pr-et-${e.k}" data-act="piEtapa" data-v="${e.k}" aria-pressed="${pm.et === e.k}"><i aria-hidden="true"></i><b>${e.nome} · ${e.xs.length}</b><span>${curtoPi(e.v)}</span></button>`).join('')}</div>`;
    const resumo = `${atrasados ? `<span class="pill fn-forte">${atrasados} com pagamento atrasado</span>` : ''}${devolvidos ? `<span class="pill fn-forte">${devolvidos} devolvido${devolvidos > 1 ? 's' : ''} pela OPEC</span>` : ''}<span class="pill fn-neutra">${naOpec} na OPEC</span>`;
    const topo = `<section class="card fn-mes-card" aria-labelledby="pr-t"><div class="hd"><h2 id="pr-t">PIs do mês</h2><span class="grow"></span>
      <div class="fn-nav" role="group" aria-label="Mês"><button class="btn sm ic" data-act="piMes" data-d="-1" aria-label="Mês anterior" title="Mês anterior (←)">${S.svg('esq')}</button>
        <span class="fn-mes-et" role="status" aria-live="polite"><span>${nomeMesPi(ym)}</span></span>
        <button class="btn sm ic" data-act="piMes" data-d="1" aria-label="Próximo mês" title="Próximo mês (→)">${S.svg('seta')}</button>${ym !== hoje.slice(0, 7) ? '<button class="btn sm" data-act="piMes" data-d="0">Hoje</button>' : ''}</div></div>
      <div class="pr-topo"><div class="pr-tot"><small>${sel ? sel.nome : `Vendido em ${mesN}`}</small><span class="pf-num">${S.roloFixo('prTotal', curtoPi(tot))}</span><small>${base.length} PI${base.length === 1 ? '' : 's'} · ticket médio ${curtoPi(tot / Math.max(1, base.length))}</small></div><div>${regua}</div></div>
      <div class="fn-resumo" style="margin-top:14px">${resumo}</div></section>`;
    // No ar no mês: o que veicula em algum dia do mês (sem rascunho, devolvido e cancelado)
    const [yy, mm] = ym.split('-').map(Number), nd = new Date(yy, mm, 0).getDate(), d1 = `${ym}-01`, dN = `${ym}-${String(nd).padStart(2, '0')}`;
    const noAr = S.db.pis.filter(p => !['rascunho', 'devolvido', 'cancelado'].includes(p.status)).map(p => ({ p, v:veiculacao(p) })).filter(x => x.v && x.v[0] <= dN && x.v[1] >= d1).sort((a, b) => a.v[0].localeCompare(b.v[0]));
    const dia = d => d < d1 ? 1 : d > dN ? nd : +d.slice(8);
    const hojeX = hoje.slice(0, 7) === ym ? (+hoje.slice(8) - .5) / nd * 100 : -1;
    const insMes = p => (p.dados.grids || []).filter(g => g.period === ym).reduce((s, g) => s + (g.items || []).reduce((t, it) => t + Object.values(it.days || {}).reduce((u, n) => u + (Number(n) || 0), 0), 0), 0);
    const noArCard = `<section class="card" aria-labelledby="ga-t"><div class="hd"><h2 id="ga-t">No ar em ${mesN}</h2><span>${noAr.length} PI${noAr.length === 1 ? '' : 's'} veiculando${hojeX >= 0 ? ' · a linha marca hoje' : ''}</span></div>
      ${noAr.length ? `<div class="ga-g"><div class="ga-l ga-cab"><span>PI</span><span class="ga-dias"><span>1</span><span>${Math.round(nd / 2)}</span><span>${nd}</span></span><span class="r">Inserções no mês</span></div>
        ${(pm.todos ? noAr : noAr.slice(0, 8)).map(({ p, v }, i) => { const a = dia(v[0]), b = dia(v[1]);
          return `<a class="ga-l" data-go="/pi/${p.id}" title="${S.piNo(p)} · ${dfmt(v[0])} a ${dfmt(v[1])}"><span class="ga-q"><b>${esc(p.titulo) || 'Sem título'}</b><small>${esc(S.nome(p.cliente_id)) || S.piNo(p)}</small></span>
            <span class="ga-trilho"><span class="ga-barra pr-et-${p.status}" style="left:${(a - 1) / nd * 100}%;width:${Math.max(1.5, (b - a + 1) / nd * 100)}%;--i:${i}"></span>${hojeX >= 0 ? `<span class="ga-hoje" style="left:${hojeX}%"></span>` : ''}</span><span class="r ga-n">${insMes(p).toLocaleString('pt-BR')}</span></a>`; }).join('')}</div>${noAr.length > 8 ? `<button class="btn sm" style="margin-top:12px" data-act="piNoArTodos">${pm.todos ? 'Mostrar menos' : `Ver todos (${noAr.length})`}</button>` : ''}`
        : `<p class="muted">Nenhum PI veiculando em ${mesN}.</p>`}</section>`;
    // Lista do mês
    const pis = base.filter(p => !q || [p.titulo, S.nome(p.cliente_id), S.nome(p.agencia_id), S.usuario(p.consultor_id), p.projeto, S.piNo(p)].join(' ').toLowerCase().includes(q)).sort((a, b) => b.numero - a.numero);
    const linhas = pis.map(p => { const c = S.calc(p), cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id), cons = S.usuario(p.consultor_id), tit = p.titulo || 'Sem título', v = veiculacao(p);
      return `<div class="pl-l click" data-go="/pi/${p.id}" data-flip="${p.id}" role="link" tabindex="0">
        <span class="pl-n">${S.piNo(p)}</span>
        <span class="pl-t"><b title="${esc(tit)}">${esc(tit)}</b><small>${[p.projeto ? esc(p.projeto) : '', c.ins || !c.pub ? `${c.ins} inserç${c.ins === 1 ? 'ão' : 'ões'}` : '', c.pub ? `${c.pub} entrega${c.pub === 1 ? '' : 's'} digita${c.pub === 1 ? 'l' : 'is'}` : ''].filter(Boolean).join(' · ')}</small></span>
        <span class="pl-c"><span title="${esc(cli)}">${esc(cli)}</span><small title="${esc(ag || 'Venda direta')}">${ag ? esc(ag) : 'Venda direta'}</small></span>
        <span class="pl-u" title="${esc(cons)}">${cons ? `<span class="av soft" aria-hidden="true">${esc(S.iniciais(cons))}</span><span class="pl-un">${esc(S.celular ? cons : cons.split(' ')[0])}</span>` : '<span class="muted">—</span>'}</span>
        <span class="pl-p"><small>Veiculação</small>${v ? `${dfmt(v[0]).slice(0, 5)} a ${dfmt(v[1]).slice(0, 5)}` : '—'}</span>
        <span class="pl-i pl-sit">${etiquetaPi(p)}${pagTom(p)}</span>
        <span class="pl-v"><b>${brl(c.total)}</b>${c.commission ? `<small>Líquido ${brl(c.net)}</small>` : ''}</span>
        <span class="pl-m"><button class="btn tres" data-act="piOpcoes" data-id="${p.id}" aria-label="Opções do ${S.piNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
    const vazio = `<div class="empty"><b>Nenhum PI</b>${q ? `Nada com essa busca em ${mesN}.` : sel ? `Nenhum PI nesta etapa em ${mesN}.` : S.db.pis.length ? `Nenhum PI criado em ${mesN}.` : 'Os pedidos desta rádio aparecem aqui.'}</div>`;
    const listaCard = `<section class="card pl-card" aria-labelledby="pr-tl"><div class="hd fn-par-hd"><h2 id="pr-tl">PIs de ${mesN}</h2><span>${pis.length} · ${brl(totDe(pis))}</span></div>
      <div class="fn-filtros">${sel ? `<button class="fn-chip pr-chip pr-et-${sel.k}" data-act="piEtapa" data-v="${sel.k}" aria-label="Tirar o filtro ${sel.nome}"><i aria-hidden="true"></i>${sel.nome}${S.svg('fechar', 14)}</button>` : ''}
        <label class="fin-busca">${S.svg('busca')}<input value="${esc(S.ui.q)}" data-ui="q" placeholder="Buscar por número, título, cliente, agência ou consultor" aria-label="Buscar PIs"></label></div>
      ${pis.length ? `<div class="pl"><div class="pl-l pl-cab"><span class="pl-n">Nº</span><span class="pl-t">Título</span><span class="pl-c">Cliente · agência</span><span class="pl-u">Consultor</span><span class="pl-p">Veiculação</span><span class="pl-i">Situação</span><span class="pl-v">Total</span><span class="pl-m"><span class="sr">Ações</span></span></div>${linhas}</div>` : vazio}
      <p class="fn-dica"><kbd>←</kbd> <kbd>→</kbd> trocam o mês · clique numa etapa da régua para filtrar · <kbd>Esc</kbd> tira o filtro</p></section>`;
    queueMicrotask(animaPis);
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Pedidos de Inserção`, actions:S.pode('diretor', 'gerente', 'consultor') ? `<button class="btn pri" data-act="piNew">${S.svg('mais')}Novo PI</button>` : '',
      body:topo + (S.propostasParaPi ? S.propostasParaPi() : '') + noArCard + listaCard };
  };
  // A régua cresce com mola (do zero na entrada; depois, da fatia anterior até a nova) e o nome do mês desliza
  function animaPis() {
    const bs = [...document.querySelectorAll('.pr-regua button')], quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const agora = Object.fromEntries(bs.map(b => [b.dataset.v, b.style.flexGrow]));
    if (!quieto) bs.forEach((b, i) => { const de = reguaAntes ? (reguaAntes[b.dataset.v] || 0) : 0; if (b.animate && String(de) !== agora[b.dataset.v]) b.animate([{ flexGrow:de }, { flexGrow:agora[b.dataset.v] }], { duration:900, delay:reguaAntes ? 0 : 150 + i * 80, easing:'cubic-bezier(.34,1.3,.5,1)', fill:'backwards' }); });
    reguaAntes = agora;
    const d = viraMesPi, cx = document.querySelector('.fn-mes-card .fn-mes-et'); viraMesPi = 0;
    if (d && cx && !quieto && cx.firstElementChild.animate) cx.firstElementChild.animate([{ transform:`translateX(${d * 36}px)`, opacity:0 }, { transform:'none', opacity:1 }], { duration:380, easing:'cubic-bezier(.2,.9,.2,1)' });
  }
  window.addEventListener('hashchange', () => { if (!/^#\/pis\/?$/.test(location.hash)) reguaAntes = null; });
  Object.assign(S.actions, {
    piNoArTodos: () => { pm.todos = !pm.todos; S.render(); },
    piEtapa: d => { pm.et = pm.et === d.v ? '' : d.v; S.flip(S.render); },
    piMes: d => { const hoje = today().slice(0, 7), atual = pm.mes || hoje, alvo = +d.d ? somaMesPi(atual, +d.d) : hoje;
      if (alvo === atual) return; viraMesPi = alvo > atual ? 1 : -1; pm.mes = alvo === hoje ? '' : alvo; pm.et = ''; pm.todos = false; S.flip(S.render); },
  });
  document.addEventListener('keydown', e => {
    if (S.ui.view !== 'pis' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open], .menu, .sv-painel:not([hidden]), :popover-open')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.actions.piMes({ d:e.key === 'ArrowLeft' ? -1 : 1 }); }
    else if (e.key === 'Escape' && pm.et) { e.preventDefault(); S.actions.piEtapa({ v:pm.et }); }
  });

  // ---------- edição com Editar / Salvar ----------
  // O PI abre para consulta. "Editar" libera os campos; as mudanças ficam só na tela até "Salvar".
  // "Cancelar" volta ao que estava salvo. Sair do PI (ou fechar a aba) com mudanças pendentes pergunta antes.
  const ed = S.piEd = { id:null, copia:null, sujo:false };
  const editando = pi => ed.id === pi.id;
  const marcarSujo = () => { if (ed.sujo) return; ed.sujo = true; document.querySelectorAll('.sujo').forEach(el => { el.hidden = false; }); };
  S.piEntrar = pi => { ed.id = pi.id; ed.copia = JSON.stringify({ titulo:pi.titulo, cliente_id:pi.cliente_id, agencia_id:pi.agencia_id, projeto:pi.projeto, prazo:pi.prazo, dados:pi.dados }); ed.sujo = false; };
  const sairEdicao = () => { ed.id = null; ed.copia = null; ed.sujo = false; };
  const desfazer = pi => { if (ed.copia && ed.id === pi.id) Object.assign(pi, JSON.parse(ed.copia)); };

  const gravar = async pi => {
    const c = S.calc(pi), r2 = v => Math.round(v * 100) / 100;
    const patch = { titulo:pi.titulo, cliente_id:pi.cliente_id || null, agencia_id:pi.agencia_id || null, projeto:pi.projeto, prazo:pi.prazo || null, dados:pi.dados, insercoes:c.ins, publicacoes:c.pub, valor_total:r2(c.total), comissao:r2(c.commission), valor_liquido:r2(c.net) };
    await S.q(S.sb.from('pis').update(patch).eq('id', pi.id));
    Object.assign(pi, patch, { atualizado_em:new Date().toISOString() });
  };
  const salvar = async pi => {
    const b = document.querySelector('[data-act="piSalvar"]'); if (b) b.disabled = true;
    try { await gravar(pi); sairEdicao(); S.toast('PI salvo'); S.render(); return true; }
    catch (e) { console.error(e); S.toast(S.erro(e)); if (b) b.disabled = false; return false; }
  };

  S.setStatus = (pi, status, nota) => S.run(async () => {
    if (editando(pi)) { if (ed.sujo) await gravar(pi); sairEdicao(); }
    const r = await S.q(S.sb.rpc('mudar_status_pi', { p_pi:pi.id, p_status:status, p_nota:nota || '' }));
    Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id];
  }, `${S.piNo(pi)} · ${S.STATUS[status].label}`);

  // Saída do PI com alterações não salvas: volta para o PI e pergunta o que fazer
  let voltando = false;
  window.addEventListener('hashchange', () => {
    if (voltando) { voltando = false; return; }
    if (!ed.id) return;
    const r = S.route(); if (r.view === 'pi' && r.id === ed.id) return;
    const pi = S.db.pis.find(p => p.id === ed.id);
    if (!ed.sujo || !pi) { sairEdicao(); return; }
    const destino = location.hash; voltando = true; location.replace('#/pi/' + ed.id);
    setTimeout(() => {
      S.dialog(`<h2>Alterações não salvas</h2><p class="muted">Você mexeu neste PI e ainda não salvou. O que quer fazer?</p>
        <div class="row" style="flex-wrap:wrap"><span class="grow"></span><button class="btn" value="ficar">Continuar editando</button><button class="btn danger" value="descartar">Sair sem salvar</button><button class="btn pri" value="salvar">Salvar e sair</button></div>`);
      const d = document.getElementById('dlg');
      d.onclose = async () => {
        if (d.returnValue === 'salvar') { if (await salvar(pi)) location.hash = destino; }
        if (d.returnValue === 'descartar') { desfazer(pi); sairEdicao(); location.hash = destino; }
      };
    }, 30);
  });
  window.addEventListener('beforeunload', e => { if (ed.sujo) { e.preventDefault(); e.returnValue = ''; } });
  // Qualquer digitação dentro do PI em edição já acende o aviso de "não salvo"
  document.addEventListener('input', e => { if (ed.id && e.target.closest && e.target.closest('#content, #bar') && (e.target.dataset.f || e.target.dataset.day)) marcarSujo(); });

  // ---------- peças e cores ----------
  const COR = ['#0055ff', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#ec4899', '#64748b'];
  const pecaIdx = (pi, id) => pi.dados.pieces.findIndex(p => p.id === id);
  // A primeira peça usa a cor da rádio
  const corPeca = (pi, id) => { const i = pecaIdx(pi, id); return i < 0 ? 'var(--ink-3)' : i === 0 ? 'var(--accent)' : COR[i % COR.length]; };
  const selo = (pi, id, tam = '') => `<span class="pc${tam}" style="--pc:${corPeca(pi, id)}">${letter(pi, id) || '?'}</span>`;
  const mesExt = p => { const [y, m] = p.split('-').map(Number); return ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1] + ' de ' + y; };

  // ---------- cabeçalho e fluxo ----------
  const flow = pi => {
    const b = (act, label, extra = '', pri = true, icon = '') => `<button class="btn${pri === true ? ' pri' : pri ? ' ' + pri : ''}" data-act="${act}"${extra}>${icon ? S.svg(icon) : ''}${label}</button>`;
    if (S.EDITABLE.includes(pi.status)) return comercial(pi) ? b('piSend', pi.status === 'devolvido' ? 'Reenviar para a OPEC' : 'Enviar para a OPEC', '', true, 'seta') : '';
    if (pi.status === 'opec') return S.pode('diretor', 'opec') ? b('piReturn', 'Devolver', '', 'warn', 'voltar') + b('piStatus', 'Aprovar PI', ' data-to="aprovado"', true, 'check') : '';
    const faturar = S.pode('diretor', 'financeiro') ? b('finFaturar', 'Faturar', ` data-id="${pi.id}"`, pi.status === 'programado') : '';
    if (pi.status === 'aprovado') return faturar + (S.pode('diretor', 'opec') ? b('piStatus', 'Marcar como programado', ' data-to="programado"', true, 'check') : '');
    if (pi.status === 'programado') return faturar;
    if (pi.status === 'cancelado') return S.pode('diretor', 'gerente') ? b('piStatus', 'Reabrir como rascunho', ' data-to="rascunho"', false) : '';
    return '';
  };
  const salvoEm = pi => { const t = pi.atualizado_em || pi.criado_em; if (!t) return ''; const dia = S.dia(t) === S.today() ? 'hoje' : dfmt(S.dia(t)); return `Salvo ${dia} às ${S.hora(t)}`; };

  S.views.pi = () => {
    const pi = cur(); if (!pi) return { title:'Pedido não encontrado', actions:'', body:'<div class="card empty"><b>Este pedido não existe ou não é desta rádio</b><a data-go="/pis">Voltar para a lista</a></div>' };
    if (ed.id && ed.id !== pi.id && !ed.sujo) sairEdicao();
    const em = editando(pi), c = S.calc(pi), h = S.db.hist[pi.id];
    if (!h) carregarHistorico(pi);
    if (!S.db.midias[pi.id]) carregarMidias(pi);
    const devol = pi.status === 'devolvido' && h ? h.find(x => x.status === 'devolvido') : null;
    const notas = `${devol && devol.nota ? `<div class="note"><b>Devolvido pela OPEC:</b> ${esc(devol.nota)}</div>` : ''}
      ${!editavel(pi) && S.EDITABLE.includes(pi.status) ? '<div class="note info">Este PI é de outro consultor ou o seu perfil só pode consultar.</div>' : ''}
      ${!S.EDITABLE.includes(pi.status) && pi.status !== 'cancelado' ? '<div class="note info">Este PI já saiu do rascunho: está somente para consulta.</div>' : ''}`;
    const nMid = nMidias(pi);
    const abas = `<nav class="abas" aria-label="Abas do PI">${[['detalhes', 'Detalhes'], ['faturamento', 'Faturamento'], ['midias', `Mídias${nMid ? ` <span class="cont">${nMid}</span>` : ''}`], ['historico', 'Histórico']].map(([t, n]) => `<button class="${S.ui.tab === t ? 'on' : ''}" data-act="piTab" data-tab="${t}">${n}</button>`).join('')}</nav>`;
    const body = S.ui.tab === 'faturamento' ? tabBilling(pi, c, em ? '' : ' disabled') : S.ui.tab === 'historico' ? tabHistory(pi) : S.ui.tab === 'midias' ? tabMidias(pi, em) : tabDetails(pi, c, em);
    const titulo = em ? `<input class="titulo-in" value="${esc(pi.titulo)}" placeholder="Título do PI" data-f="titulo" aria-label="Título do PI">` : (esc(pi.titulo) || 'Novo pedido');
    const acoes = em
      ? `<span class="sujo" ${ed.sujo ? '' : 'hidden'}><i></i>Alterações não salvas</span><button class="btn tres" data-act="piOpcoes" data-id="${pi.id}" aria-label="Mais opções">${S.svg('mais3')}</button><button class="btn" data-act="piCancelar">Cancelar</button><button class="btn" data-act="piVer">${S.svg('olho')}Visualizar</button><button class="btn pri" data-act="piSalvar">${S.svg('check')}Salvar</button>`
      : `<span class="muted small salvo">${salvoEm(pi)}</span><button class="btn tres" data-act="piOpcoes" data-id="${pi.id}" aria-label="Mais opções">${S.svg('mais3')}</button><button class="btn" data-act="piVer">${S.svg('olho')}Visualizar</button><button class="btn" data-act="piExport">${S.svg('baixar')}Exportar PI</button>${editavel(pi) ? `<button class="btn" data-act="piEditar">${S.svg('editar')}Editar</button>` : ''}${flow(pi)}`;
    return { title:`<span class="sub"><a data-go="/pis">PIs</a>${S.svg('seta', 14)}<b style="color:var(--ink);font-weight:500">${S.piNo(pi)}</b>${S.pill(pi.status)}${S.pagPi(pi)}<span>· ${esc(S.usuario(pi.consultor_id))}</span></span>${titulo}`,
      actions:acoes, body:abas + notas + body };
  };

  async function carregarHistorico(pi) {
    S.db.hist[pi.id] = [];
    try { S.db.hist[pi.id] = await S.q(S.sb.from('pi_historico').select('*').eq('pi_id', pi.id).order('em', { ascending:false })); if (cur() === pi && !ed.sujo) S.render(); } catch (e) { console.error(e); }
  }

  // ---------- aba Detalhes ----------
  const sel = (lista, id, vazio) => `<option value="">${vazio}</option>${lista.map(p => `<option value="${p.id}"${p.id === id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const duo = (path, rule, ro) => `<span class="duo"><input value="${nfmt(num(rule.value))}" data-f="${path}.value" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00"${ro}><select data-f="${path}.type"${ro}><option value="pct"${rule.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${rule.type === 'brl' ? ' selected' : ''}>R$</option></select></span>`;
  const regra = r => num(r.value) ? (r.type === 'pct' ? nfmt(num(r.value)).replace(/,00$/, '') + '%' : brl(num(r.value))) : (r.type === 'pct' ? '0%' : 'R$ 0,00');

  const summary = c => `<h2>Resumo financeiro</h2>
    ${c.pub ? `<div><small>Rádio · ${c.ins} ${c.ins === 1 ? 'inserção' : 'inserções'}</small><b>${brl(c.radio)}</b></div><div><small>Ação digital · ${c.pub} ${c.pub === 1 ? 'entrega' : 'entregas'}</small><b>${brl(c.digital)}</b></div>` : ''}
    <div${c.pub ? ' class="hr"' : ''}><small>Total da mídia</small><b>${brl(c.media)}</b></div><div><small>Desconto geral</small><b>${brl(c.discount)}</b></div>
    <div class="hr"><small>Valor total</small><b>${brl(c.total)}</b></div><div class="g"><small>Comissão da agência</small><b>${brl(c.commission)}</b></div><div><small>Valor líquido</small><b>${brl(c.net)}</b></div>
    <div class="hr"><small>Bonificação</small><b>${brl(c.bonus)}</b></div><div class="g"><small>Honorários</small><b>${brl(c.fee)}</b></div><div><small>Inserções</small><b>${c.ins}</b></div>${c.pub ? `<div><small>Publicações</small><b>${c.pub}</b></div>` : ''}`;

  function tabDetails(pi, c, em) {
    const d = pi.dados, ro = em ? '' : ' disabled', v = S.veh(pi.veiculo_id), semAg = pi.agencia_id ? '' : ' disabled';
    const chip = (k, val) => `<span class="ic"><small>${k}</small>${val}</span>`;
    const temDig = d.digital.length > 0, temRad = d.grids.some(g => g.items.length);
    const tipo = temDig && !temRad ? 'Digital' : `Rádio${v.frequencia ? ' · ' + esc(v.frequencia) : ''}${temDig ? ' + Digital' : ''}`;
    const info = `<section class="card pi-info">
      <div class="lin">${chip('Tipo de mídia', `<span class="val">${tipo}</span>`)}
        ${chip('Projeto', em ? `<input value="${esc(pi.projeto)}" placeholder="Ex.: Black Friday 2026" data-f="projeto">` : `<span class="val">${esc(pi.projeto) || '—'}</span>`)}
        ${chip('Cliente', em ? `<select data-f="cliente_id" data-rerender="1">${sel(S.pessoas('cliente'), pi.cliente_id, 'Escolha o cliente')}</select>` : `<span class="val">${esc(S.nome(pi.cliente_id)) || '—'}</span>`)}
        ${chip('Agência', em ? `<select data-f="agencia_id" data-rerender="1">${sel(S.pessoas('agencia'), pi.agencia_id, 'Venda direta')}</select>` : `<span class="val">${esc(S.nome(pi.agencia_id)) || 'Venda direta'}</span>`)}
        ${chip('Veículo', `<span class="val">${esc(v.nome)}</span>`)}</div>
      <div class="lin cond">${chip('Comissão', em ? duo('dados.commission', d.commission, semAg) : `<b>${pi.agencia_id ? regra(d.commission) : '—'}</b>`)}
        ${chip('Honorários', em ? duo('dados.fee', d.fee, semAg) : `<b>${pi.agencia_id ? regra(d.fee) : '—'}</b>`)}
        ${chip('Desconto geral', em ? duo('dados.discount', d.discount, '') : `<b>${regra(d.discount)}</b>`)}
        ${chip('Prazo', em ? `<input type="date" value="${pi.prazo || ''}" data-f="prazo">` : `<b>${dfmt(pi.prazo)}</b>`)}</div></section>`;
    const pecas = `<section class="pecas" aria-label="Peças">${d.pieces.map(p => `<span class="peca">${selo(pi, p.id)}${em ? `<input value="${esc(p.name)}" placeholder="Nome da peça" data-f="name" data-piece="${p.id}" data-rerender="1" aria-label="Nome da peça ${letter(pi, p.id)}"><button class="x" data-act="piRmPiece" data-id="${p.id}" aria-label="Remover peça">×</button>` : `<span>${esc(p.name) || 'Peça sem nome'}</span>`}</span>`).join('')}
      ${em ? '<button class="btn sm tracej" data-act="piAddPiece">+ Adicionar peça</button>' : d.pieces.length ? '' : '<span class="muted small">Nenhuma peça cadastrada.</span>'}</section>`;
    const avisoTab = em && (semCadastro('programa') || semCadastro('formato')) ? `<div class="note info">Para escolher programa e formato na grade, cadastre-os antes em <a data-go="/produtos">Produtos</a>.</div>` : '';
    const grades = d.grids.map((g, i) => (S.celular ? gradeCelular : gradeTela)(pi, g, i, em)).join('') + digitalHtml(pi, em)
      + (em ? `<p class="row" style="gap:10px;flex-wrap:wrap"><button class="btn pri" data-act="piAddGrid">+ Adicionar grade</button>${temDigTabela() || temDig ? '<button class="btn" data-act="piAcao" data-op="nova">+ Ação digital</button>' : ''}</p>` : '')
      + entregasHtml(pi);
    const obs = `<section class="card"><div class="hd"><h2>Observações</h2><span>saem no PI exportado</span></div>${em ? `<textarea data-f="dados.billing.obsClient" placeholder="Ex.: veicular longe de concorrentes; material enviado pela agência até o dia 29">${esc(d.billing.obsClient)}</textarea>` : `<p class="obs">${esc(d.billing.obsClient) || '<span class="muted">Sem observações.</span>'}</p>`}</section>`;
    const totalCel = S.celular ? `<button class="pi-total" data-act="piVerResumo"><span><small>Valor total · ver resumo</small><b id="totalCel">${brl(c.total)}</b></span>${S.svg('baixo')}</button>` : '';
    return `${info}${pecas}${avisoTab}<div class="pi-corpo"><div class="pi-grades">${grades}${obs}</div><section class="card pi-sum" id="sum" aria-label="Resumo financeiro">${summary(c)}</section></div>${totalCel}
      ${S.datalist('dl-praca', [S.veh(pi.veiculo_id).cidade].filter(Boolean))}`;
  }

  const cabGrade = (g, i, em) => `<div class="g-hd"><h2>Grade ${String.fromCharCode(65 + i)}</h2>
    <label>Período de veiculação ${em ? `<select data-f="period" data-g="${g.id}" data-rerender="1" aria-label="Período de veiculação">${meses(g.period)}</select>` : `<b>${mesExt(g.period)}</b>`}</label>
    ${em ? `<span class="g-acoes"><button class="btn sm" data-act="piRepetir" data-id="${g.id}" title="Copia esta grade para os meses seguintes">${S.svg('copia')}Repetir nos próximos meses</button><button class="x" data-act="piRmGrid" data-id="${g.id}" aria-label="Remover grade" title="Remover grade">×</button></span>` : ''}</div>`;
  // Desconto da linha: em %, em R$ ou a linha inteira bonificada (sem cobrança)
  const descEdit = (it, a) => `<span class="duo"><input value="${it.bonus ? '' : nfmt(num(it.disc.value))}" data-f="disc.value" data-k="num" data-mask="dec" inputmode="decimal" placeholder="${it.bonus ? '—' : '0'}" ${a}${it.bonus ? ' disabled' : ''} aria-label="Desconto"><select data-f="disc.type" data-rerender="1" ${a} aria-label="Tipo de desconto"><option value="pct"${!it.bonus && it.disc.type === 'pct' ? ' selected' : ''}>%</option><option value="brl"${!it.bonus && it.disc.type === 'brl' ? ' selected' : ''}>R$</option><option value="bon"${it.bonus ? ' selected' : ''}>Bonif.</option></select></span>`;
  const descVer = it => it.bonus ? 'Bonificado' : regra(it.disc);
  // Listas de escolha vindas do cadastro (Tabelas). Um valor antigo que não está mais no cadastro continua aparecendo.
  const escolha = (tipo, atual, rotulo) => { const lista = S.db.produtos.filter(p => p.tipo === tipo && p.ativo && !S.ehDigital(p)).sort((a, b) => a.nome.localeCompare(b.nome)), at = String(atual || '').trim();
    const ops = lista.map(p => `<option value="${esc(p.nome.trim())}"${p.nome.trim() === at ? ' selected' : ''}${p.detalhe ? ` title="${esc(p.detalhe)}"` : ''}>${esc(p.nome.trim())}${p.detalhe && tipo === 'programa' ? ' · ' + esc(p.detalhe) : ''}</option>`).join('');
    const antigo = at && !lista.some(p => p.nome.trim() === at) ? `<option value="${esc(at)}" selected>${esc(at)}</option>` : '';
    return `<option value="">${rotulo}</option>${antigo}${ops}`; };
  const semCadastro = tipo => !S.db.produtos.some(p => p.tipo === tipo && p.ativo && !S.ehDigital(p));

  // ---------- Digital (database/033): publicações nos perfis da rádio, por mês; a rádio define as datas ----------
  const temDigTabela = () => S.db.produtos.some(p => p.tipo === 'programa' && p.ativo && S.ehDigital(p));
  const digPeriodos = pi => [...new Set(pi.dados.digital.map(it => it.period))].sort();
  // Ações digitais do PI: uma linha por ação (canal, entregas, período e valor); editar e tirar só na edição
  function digitalHtml(pi, em) {
    const d = pi.dados; if (!d.digital.length) return '';
    const total = d.digital.reduce((s, a) => s + S.digCalc(a).sub, 0), n = d.digital.reduce((s, a) => s + S.digCalc(a).qtd, 0);
    return `<section class="card dg"><div class="hd"><h2>Digital · ${d.digital.length === 1 ? 'ação' : 'ações'} nas redes da rádio</h2><span>${n} ${n === 1 ? 'entrega' : 'entregas'} · ${brl(total)}</span></div>
      <div class="ad-ls">${d.digital.map(a => S.acaoHtml(a, em ? { act:'piAcao', data:`data-id="${a.id}"` } : null)).join('')}</div>
      <p class="muted small" style="margin:0">Ação única: as datas de cada publicação a rádio define depois da aprovação, dentro do período.</p></section>`;
  }
  // Acompanhamento das publicações: depois de aprovado, a equipe da rádio marca a data e o "publicado" (com o link)
  const ENT_STATUS = ['aprovado', 'programado', 'faturado'];
  const podeEntregas = pi => ENT_STATUS.includes(pi.status) && S.pode('diretor', 'gerente', 'opec');
  // Uma linha por entrega de cada ação (n = posição na ação, como em marcar_entrega)
  const entregasDe = pi => pi.dados.digital.flatMap(it => { const arr = (pi.entregas || {})[it.id] || [];
    return S.acaoUnidades(it).map(u => ({ it, u, n:u.n, e:arr[u.n - 1] || {} })); });
  S.piEntregasPendentes = pi => entregasDe(pi).filter(x => !x.e.data).length;
  function entregasHtml(pi) {
    if (!ENT_STATUS.includes(pi.status) || !pi.dados.digital.length) return '';
    const l = entregasDe(pi), pub = l.filter(x => x.e.publicado).length, comData = l.filter(x => x.e.data).length, pode = podeEntregas(pi);
    const linhas = l.map(({ it, u, n, e }) => { const ini = it.inicio || '', fim = it.fim || it.inicio || '', rot = `${u.nome} ${u.de > 1 ? `${u.k} de ${u.de}` : ''}`.trim();
      const sit = e.publicado ? ['Publicado', 'green'] : e.data ? ['Agendado', 'sky'] : ['Sem data', 'orange'];
      const link = e.link ? `<a href="${esc(/^https?:\/\//.test(e.link) ? e.link : 'https://' + e.link)}" target="_blank" rel="noopener">${esc(e.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 38))}</a>` : '<span class="muted">—</span>';
      const dt = `data-ent="${it.id}" data-n="${n}"`;
      return `<div class="dg-e"><span class="dg-p"><b>${esc(rot)}</b><small>${esc([S.acaoTitulo(it), S.acaoCanal(it)].filter(Boolean).join(' · '))}${it.inicio ? ' · ' + S.acaoPeriodo(it) : ''}</small></span>
        <span class="dg-d"><small class="dg-k">Data prevista</small>${pode && !e.publicado ? `<input type="date" value="${e.data || ''}"${ini ? ` min="${ini}"` : ''}${fim ? ` max="${fim}"` : ''} ${dt} aria-label="Data de ${esc(rot)}">` : `<span>${e.data ? dfmt(e.data) : '—'}</span>`}</span>
        <span class="dg-s2"><span class="pill" style="--tone:var(--${sit[1]})">${sit[0]}</span></span>
        <span class="dg-lk">${link}</span>
        <span class="dg-a">${pode ? (e.publicado ? `<button class="btn sm" data-act="piEntDesfazer" ${dt.replace('data-ent', 'data-id')}>Desfazer</button>` : `<button class="btn sm" data-act="piEntPublicar" ${dt.replace('data-ent', 'data-id')}>Marcar publicado</button>`) : ''}</span></div>`; }).join('');
    const pct = l.length ? Math.round(pub / l.length * 100) : 0;
    return `<section class="card dg-ent" aria-label="Publicações digitais"><div class="hd"><h2>Publicações · acompanhamento</h2><span>${pub} de ${l.length} publicadas · ${comData} com data</span></div>
      <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Publicações feitas"><i style="width:${pct}%;background:var(--green)"></i></div>
      <div class="dg-es">${linhas}</div>
      <p class="muted small" style="margin:12px 0 0">${pode ? 'Defina a data de cada publicação; ao publicar, marque e cole o link do post.' : 'A equipe da rádio (diretor, gerente ou OPEC) marca as datas e as publicações.'} ${pi.status === 'aprovado' ? 'O PI fica "Programado" quando a rádio está lançada e todas as publicações têm data.' : ''}</p></section>`;
  }
  // Meses para o período da grade: do ano passado até dois anos à frente
  const meses = atual => { const h = new Date(), out = []; for (let k = -12; k <= 24; k++) { const d = new Date(h.getFullYear(), h.getMonth() + k, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    if (atual && !out.includes(atual)) out.unshift(atual);
    return out.map(m => `<option value="${m}"${m === atual ? ' selected' : ''}>${mesExt(m)}</option>`).join(''); };
  const opcPecas = (pi, it) => `<option value="">—</option>${pi.dados.pieces.map(p => `<option value="${p.id}"${it.piece === p.id ? ' selected' : ''} title="${esc(p.name)}">${letter(pi, p.id)}</option>`).join('')}`;

  // Computador: programa e formato à esquerda, o mês inteiro no meio e quantidade, valor, desconto e total à direita
  function gradeTela(pi, g, i, em) {
    const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, k) => k + 1);
    const a = it => `data-g="${g.id}" data-i="${it.id}"`;
    let tIns = 0, tSub = 0; const porDia = {};
    const L = [], M = [], R = [];
    g.items.forEach(it => {
      const c = S.itemCalc(it); tIns += c.ins; tSub += c.sub; days.forEach(d => { if (it.days[d]) porDia[d] = (porDia[d] || 0) + num(it.days[d]); });
      L.push(`<div class="ln">${em ? `<button class="x rm" data-act="piRmItem" data-g="${g.id}" data-id="${it.id}" aria-label="Remover linha" title="Remover linha">×</button>
          <select data-f="f1" ${a(it)} aria-label="Programa">${escolha('programa', it.f1, 'Programa')}</select><select data-f="f2" ${a(it)} aria-label="Formato">${escolha('formato', it.f2, 'Formato')}</select>`
        : `<span></span><b class="tx">${esc(it.f1) || '—'}</b><span class="tx muted">${esc(it.f2)}</span>`}</div>`);
      M.push(`<div class="ln dias">${days.map(d => em
        ? `<input class="day${it.days[d] ? ' has' : ''}" inputmode="numeric" data-mask="int" value="${it.days[d] || ''}" data-day="${d}" ${a(it)} aria-label="Dia ${d}">`
        : `<span class="day${it.days[d] ? ' has' : ''}">${it.days[d] || ''}</span>`).join('')}</div>`);
      R.push(`<div class="ln vals"><span class="ins" id="ins-${it.id}">${c.ins}</span>
        ${em ? `<input class="n" value="${nfmt(num(it.unit))}" data-f="unit" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00" ${a(it)} aria-label="Valor unitário">${descEdit(it, a(it))}`
          : `<span class="n">${brl(num(it.unit))}</span><span class="n">${descVer(it)}</span>`}
        <b class="sub" id="sub-${it.id}">${brl(c.sub)}</b></div>`);
    });
    const cab = days.map(d => { const w = new Date(y, m - 1, d).getDay(); return `<span class="dh${w === 0 || w === 6 ? ' we' : ''}">${WD[w]}<b>${String(d).padStart(2, '0')}</b></span>`; }).join('');
    return `<section class="card grade">${cabGrade(g, i, em)}
      <div class="gr">
        <div class="gr-l"><div class="ln cb"><span></span><span>Programa</span><span>Formato</span></div>${L.join('')}<div class="ln ft">${em ? `<button class="btn sm" data-act="piAddItem" data-id="${g.id}">+ Adicionar item</button>` : ''}<b>Totais</b></div></div>
        <div class="gr-m"><div class="gr-mi"><div class="ln cb dias">${cab}</div>${M.join('')}<div class="ln ft dias tot">${days.map(d => `<span class="dt" id="dt-${g.id}-${d}">${porDia[d] || ''}</span>`).join('')}</div></div></div>
        <div class="gr-r"><div class="ln cb vals"><span>Qtd.</span><span class="n">Valor unit.</span><span class="n">Desconto</span><span class="sub">Total</span></div>${R.join('')}
          <div class="ln ft vals"><b class="ins" id="gins-${g.id}">${tIns}</b><span></span><span></span><b class="sub" id="gsub-${g.id}">${brl(tSub)}</b></div></div>
      </div></section>`;
  }

  // Celular: cada item vira um cartão; o item aberto mostra o mês em forma de calendário
  function gradeCelular(pi, g, i, em) {
    const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), vazio = new Date(y, m - 1, 1).getDay();
    const a = it => `data-g="${g.id}" data-i="${it.id}"`;
    const aberto = (S.ui.piItem || {})[g.id] || (g.items[0] || {}).id;
    let tIns = 0, tSub = 0;
    const itens = g.items.map(it => {
      const c = S.itemCalc(it); tIns += c.ins; tSub += c.sub;
      if (it.id !== aberto) return `<button class="it-res" data-act="piAbrirItem" data-g="${g.id}" data-id="${it.id}"><span class="tx"><b>${esc(it.f1) || 'Programa'}</b><small>${esc(it.f2) || 'formato'} · <span id="ins-${it.id}">${c.ins}</span> inserções</small></span><b id="sub-${it.id}">${brl(c.sub)}</b>${S.svg('seta')}</button>`;
      const cal = [...Array(vazio).fill('<span></span>'), ...Array.from({ length:nd }, (_, k) => { const d = k + 1, w = new Date(y, m - 1, d).getDay();
        return em ? `<label class="cd${w === 0 || w === 6 ? ' we' : ''}"><small>${d}</small><input class="day${it.days[d] ? ' has' : ''}" inputmode="numeric" data-mask="int" value="${it.days[d] || ''}" data-day="${d}" ${a(it)} aria-label="Dia ${d}"></label>`
          : `<span class="cd${w === 0 || w === 6 ? ' we' : ''}"><small>${d}</small><span class="day${it.days[d] ? ' has' : ''}">${it.days[d] || ''}</span></span>`; })];
      return `<article class="it-ab">
        <div class="it-cab">
          ${em ? `<span class="tx"><select data-f="f1" ${a(it)} aria-label="Programa">${escolha('programa', it.f1, 'Programa')}</select><select data-f="f2" ${a(it)} aria-label="Formato">${escolha('formato', it.f2, 'Formato')}</select></span>` : `<span class="tx"><b>${esc(it.f1) || '—'}</b><small>${esc(it.f2)}</small></span>`}
          <b id="sub-${it.id}">${brl(c.sub)}</b></div>
        <div class="cal">${WD.map((w, k) => `<small class="${k === 0 || k === 6 ? 'we' : ''}">${w}</small>`).join('')}${cal.join('')}</div>
        ${em ? '<small class="muted" style="text-align:center">Toque no dia e digite quantas inserções</small>' : ''}
        <div class="it-vals"><label class="f">Quantidade<span class="ro" id="ins-${it.id}">${c.ins}</span></label>
          <label class="f">Valor unit.${em ? `<input value="${nfmt(num(it.unit))}" data-f="unit" data-k="num" data-mask="dec" inputmode="decimal" placeholder="0,00" ${a(it)}>` : `<span class="ro">${brl(num(it.unit))}</span>`}</label>
          <label class="f">Desconto${em ? descEdit(it, a(it)) : `<span class="ro">${descVer(it)}</span>`}</label></div>
        ${em ? `<div class="row mid"><span class="grow"></span><button class="btn sm danger" data-act="piRmItem" data-g="${g.id}" data-id="${it.id}">Remover linha</button></div>` : ''}</article>`;
    }).join('');
    return `<section class="card grade gc">${cabGrade(g, i, em)}<p class="muted small"><b id="gins-${g.id}">${tIns}</b> inserções · <b id="gsub-${g.id}">${brl(tSub)}</b></p>${itens}
      ${em ? `<button class="btn" data-act="piAddItem" data-id="${g.id}">+ Adicionar item</button>` : ''}</section>`;
  }

  // Para onde vão as notas e os boletos: quem paga a rádio (muda com a instrução de faturamento)
  const notasBoletos = pi => { const pg = S.pagadorPi(pi), quem = pg.tipo === 'agencia' ? 'agência' : 'cliente';
    return `<div class="card"><div class="hd"><h2>Notas e boletos</h2><span>vão para quem paga a rádio</span></div>
      <div class="list"><div><span class="ic" aria-hidden="true">${S.svg('email')}</span><span class="tx"><b>${esc(pg.nome) || '—'} <span class="muted small">(${quem})</span></b>
        <small>${pg.email ? `${esc(pg.email)} · ${pg.doFaturamento ? 'e-mail de faturamento' : 'e-mail comum do cadastro'}` : 'sem e-mail no cadastro'}</small></span>
        ${!pg.doFaturamento && pg.pessoa ? `<button class="btn sm" data-act="pesEditar" data-id="${pg.id}">${S.svg('editar')}Completar o cadastro</button>` : ''}</div></div>
      ${pg.doFaturamento ? '' : `<p class="note aviso" style="margin:12px 0 0">Falta o e-mail de faturamento ${pg.tipo === 'agencia' ? 'da agência' : 'do cliente'}.${pg.email ? ' Enquanto isso, as notas e os boletos vão para o e-mail comum do cadastro.' : ' Sem ele, o financeiro não tem para onde mandar notas e boletos.'}</p>`}</div>`; };

  function tabBilling(pi, c, ro) {
    const b = pi.dados.billing, tile = (t, v) => `<div class="tile"><small>${t}</small><b style="font-size:20px">${brl(v)}</b></div>`;
    const blocks = S.billingEntries(pi, c).map(e => `<div class="card"><h2>${esc(e.from)} paga ${e.what.toLowerCase()} para ${esc(e.to)}</h2><div class="scroll"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Lançamento</th><th class="r">Valor</th><th class="r">Forma</th></tr></thead><tbody>${S.parcels(pi, e.value).map(p => `<tr><td>${p.n}</td><td>${dfmt(p.due)}</td><td>${esc(e.what)}</td><td class="r">${brl(p.value)}</td><td class="r">${esc(b.method)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
    return `<div class="tiles">${tile('Valor total', c.total)}${tile('Comissão da agência', c.commission)}${tile('Valor líquido da rádio', c.net)}${tile('Bonificação', c.bonus)}</div>
      ${ro ? '<div class="note info">Clique em <b>Editar</b> para alterar as condições de faturamento.</div>' : ''}
      <div class="card"><div class="row">
      ${pi.agencia_id ? `<label class="f grow">Instrução de faturamento<select data-f="dados.billing.type" data-k="int" data-rerender="1"${ro}>${Object.entries(S.BILLING).map(([k, v]) => `<option value="${k}"${+k === +b.type ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : '<div class="grow muted small">Venda direta: o cliente paga o valor total para a rádio.</div>'}
      <label class="f">1º vencimento<input type="date" value="${b.firstDue || ''}" data-f="dados.billing.firstDue" data-rerender="1"${ro}></label>
      <label class="f">Parcelas<input type="number" min="1" max="24" style="width:84px" value="${b.installments}" data-f="dados.billing.installments" data-k="int" data-rerender="1"${ro}></label>
      <label class="f">Forma de pagamento<select data-f="dados.billing.method" data-rerender="1"${ro}>${S.opts(['Boleto', 'Pix', 'Transferência', 'Cartão'], b.method)}</select></label></div></div>
      ${notasBoletos(pi)}${blocks}
      <div class="card"><div class="hd"><h2>Observações internas da rádio</h2><span>não saem no PI exportado</span></div><textarea data-f="dados.billing.obsVehicle" placeholder="Anotações só para a equipe da rádio"${ro}>${esc(b.obsVehicle)}</textarea></div>`;
  }

  const tabHistory = pi => `<div class="card"><h2>Histórico do pedido</h2><ul class="hist">${(S.db.hist[pi.id] || []).map(h => `<li><span class="muted">${dfmt(S.dia(h.em))} ${S.hora(h.em)}</span>${S.pill(h.status)}<span>${esc(S.usuario(h.usuario_id))}${h.nota ? ' · ' + esc(h.nota) : ''}</span></li>`).join('') || '<li class="muted">Carregando…</li>'}</ul></div>`;

  // ---------- aba Mídias: arquivos do PI (áudios, textos, autorizações) ----------
  const BUCKET = 'midias';
  const pasta = pi => `${pi.veiculo_id}/${pi.id}`;
  const LINKS = {};   // links das mídias por PI
  const nMidias = pi => (S.db.midias[pi.id] || []).length + (LINKS[pi.id] || []).length;
  async function carregarMidias(pi) {
    S.db.midias[pi.id] = [];
    try {
      const { data, error } = await S.sb.storage.from(BUCKET).list(pasta(pi), { sortBy:{ column:'created_at', order:'desc' } });
      if (error) throw error;
      S.db.midias[pi.id] = (data || []).filter(f => f.name && f.id);
      // Links (arquivos maiores, WeTransfer, Google Drive…; database/047)
      const { data:ls } = await S.sb.from('pi_links').select('*').eq('pi_id', pi.id).order('criado_em', { ascending:false });
      LINKS[pi.id] = ls || [];
      if (cur() === pi && !ed.sujo) S.render();
    } catch (e) { console.error(e); }
  }
  const tamanho = b => b > 1048576 ? (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits:1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const nomeArq = n => n.replace(/^\d+_/, '');
  // Mídias do PI (25/10/2026): arquivo direto (até 50 MB) ou link (WeTransfer, Google Drive… para os maiores).
  // Tudo vai no e-mail para a OPEC: arquivos como link para baixar (30 dias) e os links como estão.
  const hostDe = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  function tabMidias(pi, em) {
    const arqs = S.db.midias[pi.id] || [], links = LINKS[pi.id] || [], pode = comercial(pi) || S.pode('opec'), v = S.veh(pi.veiculo_id) || {};
    const itens = [...arqs.map(f => ({ t:new Date(f.created_at).getTime(), html:`<div class="md-i"><span class="md-ic">${S.svg('doc')}</span><span class="tx"><b title="${esc(nomeArq(f.name))}">${esc(nomeArq(f.name))}</b><small>Arquivo · ${tamanho((f.metadata || {}).size || 0)} · ${dfmt(S.dia(f.created_at))}</small></span>
        <span class="md-ac"><button class="btn sm" data-act="piBaixar" data-nome="${esc(f.name)}">${S.svg('baixar')}Baixar</button>${pode ? `<button class="btn tres" data-act="piRmMidia" data-nome="${esc(f.name)}" aria-label="Excluir ${esc(nomeArq(f.name))}">${S.svg('lixo')}</button>` : ''}</span></div>` })),
      ...links.map(l => ({ t:new Date(l.criado_em).getTime(), html:`<div class="md-i"><span class="md-ic link">${S.svg('link')}</span><span class="tx"><b title="${esc(l.titulo || l.url)}">${esc(l.titulo || hostDe(l.url) || 'Link')}</b><small>Link · ${esc(hostDe(l.url))} · ${dfmt(S.dia(l.criado_em))}</small></span>
        <span class="md-ac"><a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${S.svg('abrir')}Abrir<span class="sr"> (em outra aba)</span></a>${pode ? `<button class="btn tres" data-act="piRmLink" data-id="${l.id}" aria-label="Excluir o link ${esc(l.titulo || hostDe(l.url))}">${S.svg('lixo')}</button>` : ''}</span></div>` }))].sort((a, b) => b.t - a.t);
    const add = pode ? `<div class="md-add">
        <label class="drop md-drop"><input type="file" multiple data-act-file="piUpload" hidden>${S.svg('subir')}<b>Enviar arquivo</b><span>Clique ou arraste aqui · até 50 MB por arquivo</span></label>
        <form class="md-link" data-md-link novalidate><b>${S.svg('link')}Adicionar link</b><span class="muted small">Para arquivos maiores: WeTransfer, Google Drive, Dropbox…</span>
          <label class="f"><span class="sr">Endereço do link</span><input name="url" type="url" inputmode="url" placeholder="https://…" autocomplete="off" required></label>
          <div class="md-link-l"><label class="f"><span class="sr">Descrição</span><input name="titulo" placeholder="Descrição (ex.: VT 30&quot; em alta)" maxlength="200" autocomplete="off"></label><button class="btn pri" type="submit">Adicionar</button></div></form></div>` : '';
    return `<section class="card md-card"><div class="hd"><h2>Mídias do PI</h2><span>áudios dos spots, textos de testemunhal, autorizações</span></div>
      ${add}
      ${itens.length ? `<div class="md-lista">${itens.map(x => x.html).join('')}</div>` : '<p class="muted" style="margin:14px 0 0">Nenhuma mídia ainda.</p>'}
      <p class="md-nota">${S.svg('email')}<span>Os arquivos e links vão junto no e-mail para a OPEC${v.opec_email ? ` (${esc(v.opec_email)})` : ''}: os arquivos como link para baixar, válido por 30 dias.</span></p></section>`;
  }
  // Mídia nova num PI que já está com a OPEC: oferece avisar a OPEC por e-mail (o SONVI manda a lista de todas as mídias)
  const ofereceAvisar = pi => { const v = S.veh(pi.veiculo_id) || {};
    if (['rascunho', 'devolvido'].includes(pi.status) || !v.opec_email) return;
    S.toast('Mídia adicionada. A OPEC já tem este PI.', { acao:'Avisar a OPEC', fn:() => avisarOpec(pi) }); };
  const avisarOpec = pi => { const v = S.veh(pi.veiculo_id) || {}, assunto = `${S.piNo(pi)} · mídias para a OPEC`;
    const texto = [`Olá, OPEC!`, '', `Foram adicionadas mídias ao ${S.piNo(pi)} · ${pi.titulo}.`, pi.link_token ? '' : null, pi.link_token ? 'Ver o PI:' : null, pi.link_token ? linkPi(pi.link_token) : null, '', S.me.nome || S.me.email, v.nome].filter(l => l !== null).join('\n');
    S.toast('Enviando as mídias para a OPEC…');
    S.enviarEmail({ tipo:'pi_opec', id:pi.id, para:v.opec_email, assunto, texto }).then(r => S.toast(`Mídias enviadas para a OPEC (${v.opec_email})${r && r.midias ? ` · ${r.midias} ${r.midias === 1 ? 'item' : 'itens'}` : ''}`))
      .catch(err => S.emailManual(v.opec_email, assunto, texto, `O e-mail não foi: ${err.message}`)); };
  document.addEventListener('submit', e => { if (!e.target.matches('[data-md-link]')) return; e.preventDefault();
    const f = e.target, pi = cur(); if (!pi) return; let url = f.url.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) { f.url.setCustomValidity('Cole o endereço completo do link (ex.: https://we.tl/…).'); f.url.reportValidity(); f.url.addEventListener('input', () => f.url.setCustomValidity(''), { once:true }); return; }
    const bt = f.querySelector('button'); bt.disabled = true;
    S.run(async () => { await S.q(S.sb.from('pi_links').insert({ pi_id:pi.id, veiculo_id:pi.veiculo_id, url, titulo:f.titulo.value.trim() })); await carregarMidias(pi); ofereceAvisar(pi); }, null)
      .finally(() => { bt.disabled = false; }); });
  async function enviarArquivos(pi, files) {
    if (!files || !files.length) return;
    S.toast(`Enviando ${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}…`);
    try {
      for (const f of files) {
        if (f.size > 50 * 1048576) { S.toast(`${f.name} passa de 50 MB e não foi enviado.`); continue; }
        const limpo = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
        const { error } = await S.sb.storage.from(BUCKET).upload(`${pasta(pi)}/${Date.now()}_${limpo}`, f, { upsert:false, contentType:f.type || undefined });
        if (error) throw error;
      }
      await carregarMidias(pi); S.toast('Arquivos enviados'); S.render(); ofereceAvisar(pi);
    } catch (e) { console.error(e); S.toast(S.erro(e)); }
  }
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.actFile === 'piUpload') { const pi = cur(); if (pi) enviarArquivos(pi, [...e.target.files]); } });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.drop')) { e.preventDefault(); e.target.closest('.drop').classList.add('on'); } });
  document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) d.classList.remove('on'); });
  document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('.drop'); if (!d) return; e.preventDefault(); d.classList.remove('on'); const pi = cur(); if (pi) enviarArquivos(pi, [...e.dataTransfer.files]); });

  // Dias de um item levados para outro mês: mesma quantidade no mês, nos mesmos dias da semana (S.distribuir)
  const diasNoMes = (deMes, dias, paraMes) => {
    const [y, m] = deMes.split('-').map(Number), ent = Object.entries(dias || {}).map(([d, q]) => [+d, parseInt(q) || 0]).filter(([, q]) => q > 0);
    if (!ent.length) return {};
    if (ent.length === 1) { const [py, pm] = paraMes.split('-').map(Number), ult = new Date(py, pm, 0).getDate(); return { [Math.min(ent[0][0], ult)]:ent[0][1] }; }
    const sem = [...new Set(ent.map(([d]) => new Date(y, m - 1, d).getDay()))], qs = new Set(ent.map(([, q]) => q)), total = ent.reduce((t, [, q]) => t + q, 0);
    const it = qs.size === 1 ? { dias:sem, por_dia:[...qs][0] } : { dias:sem, insercoes:total };
    const r = S.distribuir([it], `${paraMes}-01`, 1), mes = r.meses.find(x => x.period === paraMes);
    return mes && mes.itens[0] ? mes.itens[0] : {};
  };

  // ---------- ações ----------
  const mexer = fn => { const pi = cur(); if (!editando(pi)) return; fn(pi, pi.dados); marcarSujo(); S.render(); };
  const criar = (v, dados) => S.q(S.sb.rpc('criar_pi', { p_veiculo:S.ui.vehicleId, p_titulo:v.titulo, p_cliente:v.cliente_id || null, p_agencia:v.agencia_id || null, p_projeto:v.projeto || '', p_dados:dados }));

  Object.assign(S.actions, {
    piTab: d => { S.ui.tab = d.tab; S.render(); },
    piEditar: () => { const pi = cur(); if (!editavel(pi)) return; S.piEntrar(pi); if (!['detalhes', 'faturamento'].includes(S.ui.tab)) S.ui.tab = 'detalhes'; S.render(); },
    piSalvar: () => salvar(cur()),
    piCancelar: () => { const pi = cur();
      if (!ed.sujo) { sairEdicao(); return S.render(); }
      S.dialog(`<h2>Descartar alterações?</h2><p class="muted">O PI volta a ficar como estava quando foi salvo pela última vez.</p><div class="row"><span class="grow"></span><button class="btn" value="x">Continuar editando</button><button class="btn danger" value="ok">Descartar</button></div>`, () => { desfazer(pi); sairEdicao(); S.render(); }); },
    // Visualizar: o PI como vai sair no documento (o mesmo do PDF), para conferir antes de salvar ou exportar
    piVer: () => { const pi = cur();
      S.buildPrint(pi, { date:today(), to:'client', commission:true, billing:true, clientData:true, vehicleData:true, obs:true, signClient:true, signVehicle:true, signAgency:!!pi.agencia_id, conds:true });
      const doc = document.getElementById('print').innerHTML, probs = S.piProblems(pi);
      S.dialog(`<div class="row mid"><h2 class="grow">Visualizar ${S.piNo(pi)}</h2><button class="btn" value="x">Fechar</button><button class="btn pri" value="exp" type="submit">${S.svg('baixar')}Exportar PI</button></div>
        ${probs.length ? `<div class="note">Falta preencher: ${probs.map(esc).join('; ')}.</div>` : '<div class="note info">Tudo preenchido para enviar.</div>'}
        <div class="previa">${doc}</div>`);
      document.getElementById('dlg').classList.add('largo');
      const d = document.getElementById('dlg'); d.onclose = () => { d.classList.remove('largo'); if (d.returnValue === 'exp') S.actions.piExport(); }; },
    piAbrirItem: d => { S.ui.piItem = Object.assign({}, S.ui.piItem, { [d.g]:d.id }); S.render(); },
    piVerResumo: () => { const s = document.getElementById('sum'); if (s) s.scrollIntoView({ behavior:'smooth', block:'start' }); },
    piBaixar: async d => { const pi = cur(); try { const { data, error } = await S.sb.storage.from(BUCKET).createSignedUrl(`${pasta(pi)}/${d.nome}`, 120, { download:nomeArq(d.nome) }); if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener'); } catch (e) { S.toast(S.erro(e)); } },
    piRmLink: async d => { const pi = cur(), l = (LINKS[pi.id] || []).find(x => x.id === d.id); if (!l) return;
      if (!await S.confirmar(`Excluir o link "${l.titulo || hostDe(l.url)}"?`, { ok:'Excluir link', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.from('pi_links').delete().eq('id', l.id)); await carregarMidias(pi); }, 'Link excluído'); },
    piRmMidia: async d => { const pi = cur(); if (!await S.confirmar(`Excluir o arquivo "${nomeArq(d.nome)}"?`, { ok:'Excluir arquivo', perigo:true })) return;
      S.run(async () => { const { error } = await S.sb.storage.from(BUCKET).remove([`${pasta(pi)}/${d.nome}`]); if (error) throw error; await carregarMidias(pi); }, 'Arquivo excluído'); },
    // Novo PI: o cliente pode ser escolhido da lista ou cadastrado ali mesmo, sem sair da tela
    piNew: () => {
      const clientes = S.pessoas('cliente'), NOVO = '__novo';
      const novoCli = `<div id="novoCli" class="caixa" style="grid-column:1/-1;display:none"><div class="g2">
        <label class="f" style="grid-column:1/-1">Nome do cliente<input name="novo_nome" placeholder="Ex.: Supermercado Três Irmãos" disabled></label>
        <label class="f">CNPJ / CPF<input name="novo_doc" data-mask="doc" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" disabled></label>
        <label class="f">Telefone<input name="novo_tel" data-mask="tel" inputmode="tel" autocomplete="off" placeholder="(65) 99999-9999" disabled></label></div>
        <p class="muted small" style="margin-top:10px">O cliente fica salvo nesta rádio. Os demais dados você completa depois em Clientes.</p></div>`;
      S.form(`Novo PI · ${esc(S.veh().nome)}`, [
        { k:'titulo', label:'Título', req:true, full:true },
        { k:'cliente_id', label:'Cliente', type:'select', req:true, options:[['', 'Escolha o cliente'], ...clientes.map(p => [p.id, p.nome]), [NOVO, '+ Cadastrar novo cliente']] },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Venda direta'], ...S.pessoas('agencia').map(p => [p.id, p.nome])] },
        { html:novoCli },
        { k:'projeto', label:'Projeto / campanha', full:true }], { cliente_id:clientes.length ? '' : NOVO },
        v => S.run(async () => {
          if (v.cliente_id === NOVO) { // cadastra o cliente antes de criar o PI (ou usa o que já tem o mesmo CNPJ/CPF)
            const doc = (v.novo_doc || '').trim(), igual = doc && S.pessoas('cliente').find(p => (p.documento || '').replace(/\D/g, '') === doc.replace(/\D/g, ''));
            const cli = igual || await S.salvar('pessoas', { veiculo_id:S.ui.vehicleId, tipo:'cliente', pessoa:doc.replace(/\D/g, '').length === 11 ? 'pf' : 'pj', nome:v.novo_nome.trim(), documento:doc, telefone:v.novo_tel || '', situacao:'ativo', consultor_id:S.pode('consultor') ? S.me.id : null });
            v.cliente_id = cli.id;
          }
          const ag = S.pessoa(v.agencia_id) || S.pessoa((S.pessoa(v.cliente_id) || {}).agencia_id);
          if (ag && !v.agencia_id) v.agencia_id = ag.id; // cliente atendido por agência já entra com ela
          const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:ag ? num(ag.comissao) : 0 }, grids:[{ id:uid(), period:today().slice(0, 7), praca:S.veh().cidade || '', items:[blankItem()] }] } }).dados;
          const pi = S.piNorm(await criar(v, dados)); S.db.pis.push(pi); S.ui.tab = 'detalhes'; S.piEntrar(pi); location.hash = '/pi/' + pi.id;
        }, 'PI criado'), 'Criar PI');
      // Mostra os campos do cliente novo só quando essa opção está escolhida
      const sel = document.querySelector('#dlg [name="cliente_id"]'), box = document.getElementById('novoCli');
      const alterna = () => { const on = sel.value === NOVO; box.style.display = on ? '' : 'none';
        box.querySelectorAll('input').forEach(i => { i.disabled = !on; }); box.querySelector('[name="novo_nome"]').required = on; if (on && document.activeElement === sel) box.querySelector('input').focus(); };
      sel.addEventListener('change', alterna); alterna();
    },
    // Menu "três pontinhos" do PI (na lista e dentro do PI): só mostra o que vale para o status e o perfil
    piOpcoes: (d, botao) => {
      const pi = S.db.pis.find(p => p.id === d.id), gestor = S.pode('diretor', 'gerente'), dentro = S.route().view === 'pi', id = { id:pi.id };
      const itens = [];
      if (!dentro) itens.push({ label:'Abrir', icon:'abrir', act:'piAbrir', data:id });
      if (editavel(pi) && !editando(pi)) itens.push({ label:'Editar', icon:'editar', act:'piEditarId', data:id });
      if (S.EDITABLE.includes(pi.status) && comercial(pi)) itens.push({ label:pi.status === 'devolvido' ? 'Reenviar para a OPEC' : 'Enviar para a OPEC', icon:'seta', act:'piEnviarId', data:id });
      itens.push({ label:'Enviar por WhatsApp', icon:'whats', act:'piWhats', data:id });
      if (comercial(pi)) itens.push({ label:'Duplicar', icon:'copia', act:'piDuplicar', data:id });
      const fim = [];
      if (gestor && !['cancelado', 'faturado', 'rascunho'].includes(pi.status)) fim.push({ label:'Cancelar PI', icon:'voltar', act:'piCancelarPI', data:id, perigo:true });
      if (S.me.diretor || (S.pode('consultor') && pi.consultor_id === S.me.id)) fim.push({ label:'Excluir PI', icon:'lixo', act:'piExcluirTudo', data:id, perigo:true });
      else if (pi.status === 'rascunho' && comercial(pi)) fim.push({ label:'Excluir', icon:'lixo', act:'piExcluir', data:id, perigo:true });
      S.menu(botao, fim.length ? [...itens, '-', ...fim] : itens);
    },
    piAbrir: d => S.go('/pi/' + d.id),
    piEditarId: d => { const pi = S.db.pis.find(p => p.id === d.id); S.piEntrar(pi); S.ui.tab = 'detalhes'; S.go('/pi/' + d.id); },
    piEnviarId: d => { const pi = S.db.pis.find(p => p.id === d.id); if (editando(pi) && ed.sujo) return S.toast('Salve o PI antes de enviar para a OPEC.'); const probs = S.piProblems(pi); if (probs.length) return S.toast('Antes de enviar: ' + probs[0]); enviarOpec(pi); },
    // WhatsApp: abre a conversa com o contato do cliente (ou escolhe o contato) com o resumo do PI
    piWhats: d => {
      const pi = S.db.pis.find(p => p.id === d.id), c = S.calc(pi), cli = S.pessoa(pi.cliente_id) || {}, v = S.veh(pi.veiculo_id);
      const meses = [...new Set([...pi.dados.grids, ...pi.dados.digital].map(g => g.period.split('-').reverse().join('/')))].join(', ');
      const texto = [`*${v.nome} · ${S.piNo(pi)}*`, pi.titulo, cli.nome ? `Cliente: ${cli.nome}` : '', meses ? `Período: ${meses}` : '', c.ins || !c.pub ? `Inserções: ${c.ins}` : '', c.pub ? `Ação digital: ${S.acaoEntregasTxt({ entregas:pi.dados.digital.flatMap(a => a.entregas || []) })}` : '', `Valor total: ${brl(c.total)}`, pi.dados.billing.obsClient ? `Observações: ${pi.dados.billing.obsClient}` : '', '', `Consultor(a): ${S.usuario(pi.consultor_id)}`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
      let fone = String(cli.whatsapp || cli.telefone || '').replace(/\D/g, ''); if (fone && fone.length <= 11) fone = '55' + fone;
      window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      if (!fone) S.toast('Este cliente não tem WhatsApp cadastrado: escolha o contato no WhatsApp.');
    },
    piDuplicar: d => { const pi = S.db.pis.find(p => p.id === d.id);
      S.run(async () => { const novo = S.piNorm(await criar({ titulo:pi.titulo + ' (cópia)', cliente_id:pi.cliente_id, agencia_id:pi.agencia_id, projeto:pi.projeto }, JSON.parse(JSON.stringify(pi.dados)))); S.db.pis.push(novo); S.piEntrar(novo); S.ui.tab = 'detalhes'; location.hash = '/pi/' + novo.id; }, 'PI duplicado'); },
    piCancelarPI: async d => { const pi = S.db.pis.find(p => p.id === d.id); if (await S.confirmar(`Cancelar o ${S.piNo(pi)}? Ele sai da OPEC e do faturamento.`, { ok:'Cancelar o PI', voltar:'Manter', perigo:true })) S.setStatus(pi, 'cancelado'); },
    piExcluir: async d => { const pi = S.db.pis.find(p => p.id === d.id);
      if (!await S.confirmar(`Excluir o ${S.piNo(pi)} (${pi.titulo || 'sem título'})? Não dá para desfazer.`, { ok:'Excluir PI', perigo:true })) return;
      S.run(async () => { if (ed.id === pi.id) sairEdicao(); await S.excluir('pis', pi.id);
        try { const { data } = await S.sb.storage.from(BUCKET).list(pasta(pi)); if (data && data.length) await S.sb.storage.from(BUCKET).remove(data.map(f => `${pasta(pi)}/${f.name}`)); } catch (e) { console.error(e); } /* apaga também as mídias do PI */
        if (S.route().view === 'pi') location.hash = '/pis'; }, 'PI excluído'); },
    // Diretor: exclui o PI em qualquer situação, com as parcelas do financeiro (database/050)
    piExcluirTudo: async d => { const pi = S.db.pis.find(p => p.id === d.id); let v;
      try { v = await S.q(S.sb.rpc('vinculos_do_pi', { p_pi:pi.id })); } catch (e) { return S.toast(S.erro(e)); }
      const itens = [v.parcelas && `${v.parcelas} ${v.parcelas === 1 ? 'parcela' : 'parcelas'} no financeiro${v.pagas ? `, ${v.pagas} já ${v.pagas === 1 ? 'paga' : 'pagas'} (${brl(v.valor_pago)})` : ''}`,
        'o histórico, os links e os arquivos de mídia do PI', v.proposta && `a ligação com a proposta ${v.proposta} (a proposta continua)`].filter(Boolean);
      S.excluirDigitando({ titulo:`Excluir o ${S.piNo(pi)}?`, itens,
        aviso:`${pi.status === 'rascunho' ? '' : `Ele está "${(S.STATUS[pi.status] || {}).label || pi.status}". `}Some da OPEC, do financeiro, dos dashboards e das comissões. Não dá para desfazer.`,
        rotulo:'Para confirmar, digite o número do PI', dica:S.piNo(pi), confere:t => (t.replace(/\D/g, '').replace(/^0+/, '') || 'x') === String(pi.numero), botao:'Excluir PI',
        onOk:f => S.run(async () => { if (ed.id === pi.id) sairEdicao();
          await S.q(S.sb.rpc('excluir_pi_completo', { p_pi:pi.id, p_conf:f.ex_conf }));
          try { const { data } = await S.sb.storage.from(BUCKET).list(pasta(pi)); if (data && data.length) await S.sb.storage.from(BUCKET).remove(data.map(x => `${pasta(pi)}/${x.name}`)); } catch (e) { console.error(e); }
          await S.carregarVeiculo(); if (S.route().view === 'pi') location.hash = '/pis'; }, `${S.piNo(pi)} excluído`) }); },
    piSend: () => { const pi = cur(), probs = S.piProblems(pi); if (probs.length) return S.toast('Antes de enviar: ' + probs[0]); enviarOpec(pi); },
    piStatus: d => { const pi = d.id ? S.db.pis.find(p => p.id === d.id) : cur();
      if (d.to === 'programado' && S.piEntregasPendentes(pi)) { const n = S.piEntregasPendentes(pi);
        if (S.route().view === 'pi') { S.ui.tab = 'detalhes'; S.render(); setTimeout(() => { const el = document.querySelector('.dg-ent'); if (el) el.scrollIntoView({ behavior:'smooth', block:'start' }); }, 60); }
        return S.toast(`Antes de marcar como programado, defina a data ${n === 1 ? 'da publicação digital que falta' : `das ${n} publicações digitais que faltam`}.`); }
      S.setStatus(pi, d.to); },
    piReturn: d => { const pi = d.id ? S.db.pis.find(p => p.id === d.id) : cur();
      S.form(`Devolver ${S.piNo(pi)}`, [{ k:'nota', label:'O que precisa ser ajustado?', type:'textarea', req:true }], {}, v => S.setStatus(pi, 'devolvido', v.nota), 'Devolver ao consultor'); },
    piAddPiece: () => mexer((pi, d) => d.pieces.push({ id:uid(), name:'' })),
    piRmPiece: x => mexer((pi, d) => { d.pieces = d.pieces.filter(p => p.id !== x.id); }),
    piAddGrid: () => mexer((pi, d) => { const last = d.grids[d.grids.length - 1];
      let period = today().slice(0, 7); if (last) { const [y, m] = last.period.split('-').map(Number), n = new Date(y, m, 1); period = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
      d.grids.push({ id:uid(), period, praca:last ? last.praca || '' : (S.veh(pi.veiculo_id).cidade || ''), items:[blankItem()] }); }),
    // Repetir a grade nos meses seguintes (27/10/2026): mesmos itens, preço e desconto; em cada mês a mesma quantidade,
    // nos mesmos dias da semana. Quantidade igual todo dia (painel de LED) continua igual por dia; um dia só (face, produção) fica no mesmo dia.
    piRepetir: x => { const pi = cur(); if (!editando(pi)) return; const g = pi.dados.grids.find(y => y.id === x.id); if (!g) return;
      if (!g.items.some(it => S.itemCalc(it).ins)) return S.toast('Preencha a grade antes de repetir: ela ainda não tem inserções.');
      const mais = k => { const [y, m] = g.period.split('-').map(Number), d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
      const tem = per => pi.dados.grids.some(y => y.period === per);
      S.dialog(`<h2>Repetir a grade de ${mesExt(g.period)}</h2>
        <p class="muted" style="margin-top:-6px">Cria uma grade igual em cada mês: mesmos programas, formatos, peças, valores e descontos. A quantidade do mês se repete, nos mesmos dias da semana.</p>
        <label class="f">Repetir até<select name="ate">${Array.from({ length:12 }, (_, k) => mais(k + 1)).map((per, k) => `<option value="${k + 1}"${k === 0 ? ' selected' : ''}>${mesExt(per)} (${k + 1} ${k ? 'meses' : 'mês'} a mais)${tem(per) ? ' · já tem grade' : ''}</option>`).join('')}</select></label>
        <p class="muted small" style="margin:0">Mês que já tem grade ganha mais uma; dá para ajustar qualquer dia depois. Nada vai para a nuvem até você clicar em Salvar.</p>
        <div class="row" style="margin-top:16px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Repetir</button></div>`,
        f => { const n = parseInt(f.ate) || 1;
          mexer((p2, d) => { const pos = d.grids.indexOf(g) + 1, novas = [];
            for (let k = 1; k <= n; k++) { const per = mais(k);
              novas.push({ id:uid(), period:per, praca:g.praca || '', items:g.items.filter(it => S.itemCalc(it).ins).map(it => Object.assign(JSON.parse(JSON.stringify(it)), { id:uid(), days:diasNoMes(g.period, it.days, per) })) }); }
            d.grids.splice(pos, 0, ...novas); });
          S.toast(`Grade repetida em ${n} ${n === 1 ? 'mês' : 'meses'}. Confira e clique em Salvar.`); }); },
    piRmGrid: async x => { const pi = cur(), g = pi.dados.grids.find(g => g.id === x.id);
      if (g.items.some(it => S.itemCalc(it).ins) && !await S.confirmar('Remover esta grade com todas as inserções dela?', { ok:'Remover grade', perigo:true })) return;
      mexer((pi, d) => { d.grids = d.grids.filter(g => g.id !== x.id); }); },
    piAddItem: x => mexer((pi, d) => { const it = blankItem(), g = d.grids.find(g => g.id === x.id); it.piece = (d.pieces[0] || {}).id || ''; g.items.push(it); S.ui.piItem = Object.assign({}, S.ui.piItem, { [g.id]:it.id }); }),
    piRmItem: x => mexer((pi, d) => { const g = d.grids.find(g => g.id === x.g); g.items = g.items.filter(i => i.id !== x.id); }),
    // Ação digital (digital.js): nova, editar ou tirar; vale depois de Salvar
    piAcao: async x => { const pi = cur(); if (!editando(pi)) return;
      if (x.op === 'tirar') { const a = pi.dados.digital.find(it => it.id === x.id); if (!await S.confirmar(`Tirar a ação "${S.acaoTitulo(a)}" do PI?`, { ok:'Tirar ação', perigo:true })) return;
        return mexer((p2, d) => { d.digital = d.digital.filter(it => it.id !== x.id); }); }
      const atual = x.op === 'editar' ? pi.dados.digital.find(it => it.id === x.id) : null;
      S.acaoDigitalDlg(atual, a => mexer((p2, d) => { if (atual) d.digital = d.digital.map(it => it.id === a.id ? a : it); else d.digital.push(a); })); },
    piEntPublicar: d => { const pi = cur(), it = pi.dados.digital.find(x => x.id === d.id), e = ((pi.entregas || {})[d.id] || [])[+d.n - 1] || {}, u = S.acaoUnidades(it)[+d.n - 1] || { nome:'Entrega', k:+d.n, de:+d.n };
      S.form(`${esc(u.nome)}${u.de > 1 ? ` ${u.k} de ${u.de}` : ''} · publicado`, [
        { k:'data', label:'Data da publicação', type:'date', req:true },
        { k:'link', label:'Link do post (opcional)', ph:'https://instagram.com/p/…', full:true }], { data:e.data || today(), link:e.link || '' },
        v => entrega(pi, d.id, +d.n, v.data, true, (v.link || '').trim(), 'Publicação marcada'), 'Marcar publicado'); },
    piEntDesfazer: d => { const pi = cur(), e = ((pi.entregas || {})[d.id] || [])[+d.n - 1] || {}; entrega(pi, d.id, +d.n, e.data || null, false, e.link || '', 'Voltou para agendado'); },
    piExport: () => { const c = (n, t) => `<label class="f chk"><input type="checkbox" name="${n}" checked>${t}</label>`;
      S.dialog(`<h2>Exportar pedido de inserção</h2>
        <div class="g2"><label class="f">Data do documento<input type="date" name="date" value="${today()}"></label><label class="f">Para<select name="to"><option value="client">Cliente</option><option value="agency">Agência</option></select></label>
          ${S.db.empresa ? (() => { const pi = cur(), m = pi.dados.marca || S.veh(pi.veiculo_id).pi_marca || 'radio';
            return `<label class="f" style="grid-column:1/-1">Marca do PI<select name="marca"><option value="radio"${m === 'radio' ? ' selected' : ''}>${esc(S.veh(pi.veiculo_id).nome)}</option><option value="comercial"${m === 'comercial' ? ' selected' : ''}>${esc(String(S.db.empresa.nome || 'Empresa comercial').split('·')[0].trim())} (empresa comercial)</option></select></label>`; })() : ''}</div>
        <div class="g2">${c('commission', 'Comissão e valor líquido')}${c('billing', 'Faturamento e parcelas')}${c('clientData', 'Dados do cliente')}${c('vehicleData', 'Dados da rádio')}${c('obs', 'Observações ao cliente')}${c('signClient', 'Assinatura do cliente')}${c('signVehicle', 'Assinatura da rádio')}${c('signAgency', 'Assinatura da agência')}${c('conds', 'Condições gerais')}</div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel">Cancelar</button><button class="btn pri" value="ok">Exportar</button></div>`,
        v => { S.buildPrint(cur(), v); setTimeout(() => window.print(), 60); }); }
  });

  // ---------- enviar para a OPEC por e-mail (database/019): link do PI, sem login (app/pi.html) ----------
  const novoToken = () => { if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
  const linkPi = token => new URL('pi.html?p=' + token, location.href.split('#')[0]).href;
  const OPC_PADRAO = { to:'client', commission:true, billing:true, clientData:true, vehicleData:true, obs:true, signClient:true, signVehicle:true, conds:true };
  // O documento que a OPEC recebe: o mesmo do PDF, com o tamanho do papel da rádio
  const htmlEnvio = pi => { S.buildPrint(pi, Object.assign({ date:today(), signAgency:!!pi.agencia_id }, OPC_PADRAO));
    const html = `<div class="pi-envio" data-papel="${S.veh(pi.veiculo_id).pi_papel === 'a4' ? 'a4' : 'legal'}">${document.getElementById('print').innerHTML}</div>`; document.getElementById('print').innerHTML = ''; return html; };
  const mesesPi = pi => { const ps = [...new Set([...pi.dados.grids.map(g => g.period), ...pi.dados.digital.map(it => it.period)])].sort(); return !ps.length ? '—' : ps.length === 1 ? mesCurto(ps[0]) : `${mesCurto(ps[0])} a ${mesCurto(ps[ps.length - 1])}`; };
  function enviarOpec(pi) {
    const v = S.veh(pi.veiculo_id), c = S.calc(pi), token = pi.link_token || novoToken(), link = linkPi(token), reenvio = pi.status === 'devolvido';
    const faixas = [...new Set(pi.dados.grids.flatMap(g => g.items.map(it => it.faixa)).filter(Boolean))];
    const ag = S.nome(pi.agencia_id), obs = String(pi.dados.billing.obsClient || '').trim();
    const msg = [`Olá, OPEC!`, '', `${reenvio ? 'Segue de novo, com os ajustes,' : 'Segue para conferência'} o ${S.piNo(pi)} · ${pi.titulo}.`,
      `Cliente: ${S.nome(pi.cliente_id) || '—'}${ag ? ` (agência ${ag})` : ''}`, `Período: ${mesesPi(pi)}`, c.ins || !c.pub ? `Inserções: ${c.ins}` : '', c.pub ? `Ação digital: ${pi.dados.digital.map(a => `${S.acaoTitulo(a)} · ${S.acaoCanal(a)} · ${S.acaoEntregasTxt(a)} · ${S.acaoPeriodo(a)}`).join('; ')} (a rádio define as datas)` : '',
      faixas.length ? `Faixa: ${faixas.join(', ')}` : '', obs ? `Observações: ${obs}` : '', '', 'Ver o PI e baixar o PDF:', link, '', S.me.nome || S.me.email, v.nome]
      .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    S.dialog(`<h2>${reenvio ? 'Reenviar' : 'Enviar'} ${S.piNo(pi)} para a OPEC</h2>
      <p class="muted" style="margin-top:-6px">O SONVI manda o e-mail para a OPEC com o link do PI: ela abre sem login, confere e baixa o PDF. O PI passa para <b>Na OPEC</b>. Se a OPEC responder, a resposta chega no seu e-mail.</p>
      <label class="f">E-mail da OPEC<input name="email" type="email" autocomplete="off" value="${esc(v.opec_email || '')}" placeholder="opec@suaradio.com.br"></label>
      ${!v.opec_email ? (S.pode('diretor') ? `<label class="row mid" style="gap:10px;margin-top:-6px;font-size:14px;color:var(--ink-2);flex-wrap:nowrap"><input type="checkbox" name="guardar" checked>Guardar como o e-mail da OPEC da ${esc(v.nome)}</label>` : '<p class="muted small" style="margin-top:-8px">Peça ao diretor para cadastrar o e-mail da OPEC em Administração → Veículos; aí ele já vem preenchido.</p>') : ''}
      <label class="f">Mensagem<textarea name="msg" class="pr-msg">${esc(msg)}</textarea></label>
      ${nMidias(pi) ? `<p class="muted small" style="margin:-4px 0 0">${S.svg('doc', 14)} Vão junto no e-mail: ${[(S.db.midias[pi.id] || []).length ? `${(S.db.midias[pi.id] || []).length} arquivo${(S.db.midias[pi.id] || []).length === 1 ? '' : 's'} (link para baixar, 30 dias)` : '', (LINKS[pi.id] || []).length ? `${(LINKS[pi.id] || []).length} link${(LINKS[pi.id] || []).length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' e ')} da aba Mídias.</p>` : ''}
      <div class="row mid" style="flex-wrap:wrap"><button type="button" class="btn" data-opec="pdf">${S.svg('baixar')}Baixar PDF</button><span class="grow"></span>
        <button class="btn" value="cancel" formnovalidate>Cancelar</button><button type="button" class="btn pri" data-opec="enviar">${S.svg('seta')}Enviar por e-mail</button></div>`);
    const dl = document.getElementById('dlg'), f = dl.querySelector('form'); dl.dataset.guarda = '1';
    f.addEventListener('click', e => { const bt = e.target.closest('[data-opec]'); if (!bt) return;
      if (bt.dataset.opec === 'pdf') { S.buildPrint(pi, Object.assign({ date:today(), signAgency:!!pi.agencia_id }, OPC_PADRAO)); setTimeout(() => window.print(), 60); return; }
      const email = f.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return S.erroNoCampo(f.email, 'Coloque o e-mail da OPEC.');
      const texto = f.msg.value, guardar = f.guardar && f.guardar.checked;
      delete dl.dataset.sujo; dl.close('cancel');
      const assunto = `${S.piNo(pi)} · ${S.nome(pi.cliente_id)} · para a OPEC`;
      (async () => {
        // 1) guarda o documento e passa para Na OPEC; 2) o SONVI manda o e-mail (se falhar, abre a opção de mandar pelo próprio e-mail)
        try {
          if (editando(pi)) { if (ed.sujo) await gravar(pi); sairEdicao(); }
          if (guardar) await S.salvar('veiculos', { id:v.id, opec_email:email.toLowerCase() });
          const r = await S.q(S.sb.rpc('enviar_pi_opec', { p_pi:pi.id, p_html:htmlEnvio(pi), p_token:token }));
          Object.assign(pi, S.piNorm(r)); delete S.db.hist[pi.id];
        } catch (err) { console.error(err); S.toast(S.erro(err)); S.render(); return; }
        S.toast('Enviando o e-mail para a OPEC…'); S.render();
        try { const r = await S.enviarEmail({ tipo:'pi_opec', id:pi.id, para:email, assunto, texto }); S.toast(`${S.piNo(pi)} enviado para a OPEC (${email})${r && r.gerentes ? (r.gerentes === 1 ? '. O gerente recebeu cópia.' : `. Os ${r.gerentes} gerentes receberam cópia.`) : ''}`); }
        catch (err) { console.error(err); S.emailManual(email, assunto, texto, `O ${S.piNo(pi)} já está Na OPEC, mas o e-mail não foi: ${err.message}`); }
      })();
    });
  }

  // Data e publicado de uma publicação digital: grava na hora (marcar_entrega, database/033)
  const entrega = (pi, item, n, data, publicado, link, ok) => S.run(async () => {
    const r = await S.q(S.sb.rpc('marcar_entrega', { p_pi:pi.id, p_item:item, p_n:n, p_data:data || null, p_publicado:publicado, p_link:link || '' }));
    Object.assign(pi, S.piNorm(r)); }, ok);
  S.changes.push((el, d) => {
    if (S.route().view !== 'pi' || !d.ent) return false;
    const pi = cur(); if (!pi || !podeEntregas(pi)) return true;
    const e = ((pi.entregas || {})[d.ent] || [])[+d.n - 1] || {};
    entrega(pi, d.ent, +d.n, el.value || null, false, e.link || '', el.value ? `Data marcada: ${dfmt(el.value)}` : 'Data tirada');
    return true;
  });

  // ---------- alterações de campo (só valem no modo de edição; vão para a nuvem ao clicar em Salvar) ----------
  const setPath = (obj, path, val) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = val; };
  S.changes.push((el, d) => {
    if (S.route().view !== 'pi' || !(d.f || d.day)) return false;
    const pi = cur(); if (!pi || !editando(pi)) return false;
    const val = d.k === 'num' ? num(el.value) : d.k === 'int' ? parseInt(el.value) || 1 : d.k === 'int0' ? parseInt(el.value) || 0 : d.k === 'bool' ? el.checked : el.value;
    const grid = d.g && pi.dados.grids.find(g => g.id === d.g), item = grid && d.i && grid.items.find(i => i.id === d.i), dgi = d.dg && pi.dados.digital.find(x => x.id === d.dg);
    if (d.day) { const n = Math.max(0, parseInt(el.value) || 0); if (n) item.days[d.day] = n; else delete item.days[d.day]; el.value = n || ''; el.classList.toggle('has', n > 0);
      const t = document.getElementById(`dt-${grid.id}-${d.day}`); if (t) t.textContent = grid.items.reduce((s, it) => s + num(it.days[d.day] || 0), 0) || ''; }
    else if (d.piece) pi.dados.pieces.find(p => p.id === d.piece).name = val;
    else if (item && d.f === 'disc.type') { item.bonus = val === 'bon'; if (val !== 'bon') item.disc.type = val; }
    else setPath(item || dgi || grid || pi, d.f, d.f.endsWith('_id') ? val || null : val);
    if (d.k === 'num') el.value = nfmt(val);
    if (dgi && d.k === 'int0') el.value = val || '';
    // A agência escolhida traz a sua comissão padrão
    if (d.f === 'agencia_id') pi.dados.commission = { type:'pct', value:val ? num((S.pessoa(val) || {}).comissao) : 0 };
    // Programa + formato puxam o preço vigente da tabela
    if (item && (d.f === 'f1' || d.f === 'f2')) { const p = S.preco(item.f1, item.f2); if (p) { item.unit = num(p.preco); document.querySelectorAll(`input[data-f="unit"][data-i="${item.id}"]`).forEach(u => { u.value = nfmt(item.unit); }); } }
    marcarSujo();
    if (d.rerender) { S.render(); return true; }
    // Atualiza só os números calculados, para não perder o foco durante a digitação
    pi.dados.grids.forEach(g => { let ti = 0, ts = 0;
      g.items.forEach(it => { const c = S.itemCalc(it); ti += c.ins; ts += c.sub; const a = document.getElementById('ins-' + it.id), b = document.getElementById('sub-' + it.id); if (a) a.textContent = c.ins; if (b) b.textContent = brl(c.sub); });
      const a = document.getElementById('gins-' + g.id), b = document.getElementById('gsub-' + g.id); if (a) a.textContent = ti; if (b) b.textContent = brl(ts); });
    digPeriodos(pi).forEach(per => { let tq = 0, ts = 0;
      pi.dados.digital.filter(it => it.period === per).forEach(it => { const c = S.digCalc(it); tq += c.qtd; ts += c.sub; const b = document.getElementById('dgs-' + it.id); if (b) b.textContent = brl(c.sub); });
      const a = document.getElementById('dgq-' + per), b = document.getElementById('dgt-' + per); if (a) a.textContent = tq; if (b) b.textContent = brl(ts); });
    const c = S.calc(pi), s = document.getElementById('sum'); if (s) s.innerHTML = summary(c);
    const t = document.getElementById('totalCel'); if (t) t.textContent = brl(c.total);
    return true;
  });

  // ---------- documento para impressão / PDF ----------
  // Uma folha Ofício (Legal) ou A4 deitada, no modelo de contrato de publicidade: rádio, cliente e número no topo,
  // a grade com os dias, pagamento, observações e totais, assinaturas e as condições gerais da rádio no rodapé.
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesCurto = p => { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)}/${y}`; };
  const dataExt = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} de ${MESES[m - 1]} de ${y}`; };
  // Condições gerais: uma cláusula por linha; o número (1., 1.1.) e o título da cláusula saem em negrito
  const condicoesHtml = (texto, v) => S.piCondicoes(texto, v).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(\d+(?:\.\d+)*\.?-?)\s+(.*)$/.exec(l); if (!m) return esc(l);
    const sub = m[1].replace(/\.$/, '').includes('.'), t = !sub && /^(D[aoe]s?\s[^.]{2,40}\.)\s*(.*)$/.exec(m[2]);
    return `<b>${esc(m[1])}</b> ${t ? `<b>${esc(t[1])}</b> ${esc(t[2])}` : esc(m[2])}`; }).join('<br>');
  // Tamanho da folha vai numa regra @page própria, trocada a cada impressão
  const papel = tam => { let st = document.getElementById('pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
    st.textContent = `@media print { @page { size:${tam === 'a4' ? 'A4' : 'legal'} landscape; margin:8mm; } }`; };

  S.buildPrint = (pi, o) => {
    const c = S.calc(pi), v = S.veh(pi.veiculo_id), cli = S.pessoa(pi.cliente_id) || {}, ag = S.pessoa(pi.agencia_id), b = pi.dados.billing, cor = v.cor || S.COR_PADRAO;
    papel(v.pi_papel);
    let tabela = 0;
    const grids = pi.dados.grids.map(g => {
      const [y, m] = g.period.split('-').map(Number), nd = new Date(y, m, 0).getDate(), days = Array.from({ length:nd }, (_, i) => i + 1);
      const fim = d => [0, 6].includes(new Date(y, m - 1, d).getDay());
      let sub = 0, ins = 0;
      const rows = g.items.map(it => { const k = S.itemCalc(it); sub += k.sub; ins += k.ins; if (!it.bonus) tabela += k.gross; const dv = num(it.disc.value);
        return `<tr><td class="pg">${esc(it.f1)}${it.faixa ? `<small class="pd-fx">${esc(it.faixa)}</small>` : ''}</td><td>${esc(it.f2)}</td><td class="c"><b>${letter(pi, it.piece)}</b></td>${days.map(d => `<td class="c${fim(d) ? ' fim' : ''}">${it.days[d] || ''}</td>`).join('')}<td class="c"><b>${k.ins}</b></td><td class="r">${nfmt(num(it.unit)) || '0,00'}</td><td class="c">${it.bonus ? 'Bonif.' : dv ? (it.disc.type === 'pct' ? dv + '%' : nfmt(dv)) : '—'}</td><td class="r"><b>${it.bonus ? 'Bonificado' : nfmt(k.sub) || '0,00'}</b></td></tr>`; }).join('');
      const varias = pi.dados.grids.length > 1;
      return `${varias ? `<div class="pd-per"><b>${mesCurto(g.period)}</b>${g.praca ? ` · ${esc(g.praca)}` : ''}</div>` : ''}<table class="pd-grade"><colgroup><col class="k-pg"><col class="k-fm"><col class="k-pc">${days.map(() => '<col>').join('')}<col class="k-qt"><col class="k-un"><col class="k-ds"><col class="k-tt"></colgroup>
        <thead><tr><th rowspan="2" class="l">Programa / faixa</th><th rowspan="2" class="l">Formato</th><th rowspan="2">Peça</th>${days.map(d => `<th class="${fim(d) ? 'fim' : ''}">${WD[new Date(y, m - 1, d).getDay()]}</th>`).join('')}<th rowspan="2">Qtd</th><th rowspan="2" class="r">Valor unit.</th><th rowspan="2">Desc.</th><th rowspan="2" class="r">Total</th></tr>
        <tr>${days.map(d => `<th class="${fim(d) ? 'fim' : ''}">${String(d).padStart(2, '0')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>
        ${varias ? `<tfoot><tr><td colspan="${3 + nd}" class="r">Subtotal ${mesCurto(g.period)}</td><td class="c"><b>${ins}</b></td><td colspan="3" class="r"><b>${brl(sub)}</b></td></tr></tfoot>` : ''}</table>`;
    }).join('');
    // Ação digital: canal, ação, entregas, período e valor; as datas de cada publicação a rádio define
    const dps = digPeriodos(pi);
    const digital = pi.dados.digital.length ? `<div class="pd-dig-tit">AÇÃO DIGITAL <span>· ação única; datas das publicações definidas pela rádio dentro do período; produção incluída</span></div>
      <table class="pd-dig"><colgroup><col class="k-pf"><col class="k-fm"><col><col class="k-pe"><col class="k-tt"></colgroup>
        <thead><tr><th class="l">Canal</th><th class="l">Ação</th><th class="l">Entregas</th><th>Período</th><th class="r">Valor</th></tr></thead>
        <tbody>${pi.dados.digital.map(a => { const k = S.digCalc(a); tabela += k.sub;
          return `<tr><td>${esc(S.acaoCanal(a))}</td><td><b>${esc(S.acaoTitulo(a))}</b></td><td>${esc(S.acaoEntregasTxt(a))}</td><td class="c">${S.acaoPeriodo(a)}</td><td class="r"><b>${nfmt(k.sub) || '0,00'}</b></td></tr>`; }).join('')}</tbody></table>` : '';
    const periodos = [...new Set([...pi.dados.grids.map(g => g.period), ...dps])].sort(), periodo = !periodos.length ? '—' : periodos.length === 1 ? mesCurto(periodos[0]) : `${mesCurto(periodos[0])} a ${mesCurto(periodos[periodos.length - 1])}`;
    const descLinhas = tabela - c.media;
    // Quem paga a rádio recebe a fatura: o e-mail de faturamento é o dele
    const entradas = S.billingEntries(pi, c), emailFat = S.pagadorPi(pi).email;
    // A agência aparece uma única vez no PI (no quadro do cliente). No pagamento entram só as parcelas que a rádio
    // recebe, sem repetir quem paga; o que a rádio paga à agência vira uma linha só, quando houver.
    const nParc = Math.max(1, parseInt(b.installments) || 1);
    const recebe = entradas.filter(e => e.para === 'V'), paga = entradas.filter(e => e.de === 'V' && (o.commission || e.what !== 'Comissão'));
    const linhasParc = recebe.flatMap(e => S.parcels(pi, e.value).map(p => `<tr><td>${p.n}/${nParc}${recebe.length > 1 ? ` · ${esc(e.what)}` : ''}</td><td>${p.due ? dfmt(p.due) : 'a combinar'}</td><td>${esc(b.method)}</td><td class="r">${brl(p.value)}</td></tr>`)).join('');
    const regra = !ag ? 'Faturamento direto ao cliente' : (S.BILLING[b.type] || S.BILLING[10]).replace(/ contra o Cliente$/, ' contra o anunciante').replace(/ contra a Agência$/, ' contra a agência');
    const pagamento = `<div class="pd-box"><b class="pd-tit">Condições e forma de pagamento</b>
      ${o.billing ? `<div class="mut">${esc(regra)}${nParc > 1 ? ` · ${nParc} parcelas` : ''}</div><table class="pd-parc"><tr class="mut"><td>Parcela</td><td>Vencimento</td><td>Forma</td><td class="r">Valor</td></tr>${linhasParc}</table>
        ${paga.map(e => `<div class="mut">${esc(e.what)} paga pela rádio à agência: <b class="tx">${brl(e.value)}</b></div>`).join('')}` : ''}
      ${v.pi_pagamento || emailFat ? `<div class="mut">${esc(v.pi_pagamento)}${v.pi_pagamento && emailFat ? '. ' : ''}${emailFat ? `E-mail de faturamento: <b class="tx">${esc(emailFat)}</b>` : ''}</div>` : ''}</div>`;
    const linhaT = (rot, val, cls = '') => `<span class="${cls}">${rot}</span><span class="r ${cls}">${val}</span>`;
    const totais = `<div class="pd-box pd-tot">${c.pub ? linhaT(`Rádio · ${c.ins} ${c.ins === 1 ? 'inserção' : 'inserções'}`, brl(c.radio), 'mut') + linhaT(`Ação digital · ${c.pub} ${c.pub === 1 ? 'entrega' : 'entregas'}`, brl(c.digital), 'mut') : ''}${linhaT('Valor de tabela', brl(tabela))}${descLinhas > 0.004 ? linhaT('Descontos nas linhas', '− ' + brl(descLinhas)) : ''}${c.discount ? linhaT('Desconto geral', '− ' + brl(c.discount)) : ''}
      ${linhaT('Valor do PI', brl(c.total), 'forte')}${c.bonus ? linhaT('Bonificação (sem custo)', brl(c.bonus), 'mut') : ''}
      ${o.commission && ag ? linhaT(`Comissão da agência${d_pct(pi)}`, '− ' + brl(c.commission), 'mut') + linhaT('Total líquido', brl(c.net), 'final') : ''}
      ${o.commission && c.fee ? linhaT('Honorários da agência', brl(c.fee), 'mut') : ''}</div>`;
    const celCli = (rot, val, span) => `<th>${rot}</th><td${span ? ' colspan="3"' : ''}>${val || ''}</td>`;
    const cliente = o.clientData ? `<table class="pd-cli">
        <tr>${celCli('Razão social', esc(cli.razao_social || cli.nome), true)}</tr>
        <tr>${celCli('Anunciante', esc(cli.nome))}${celCli('Agência', ag ? esc(ag.nome) + (o.commission && d_pct(pi, true) ? ` · comissão ${d_pct(pi, true)}` : '') : 'Venda direta')}</tr>
        <tr>${celCli(cli.pessoa === 'pf' ? 'CPF' : 'CNPJ', esc(cli.documento))}${celCli('IE', esc(cli.inscricao_estadual))}</tr>
        <tr>${celCli('Endereço', esc(cli.endereco))}${celCli('Cidade', esc([cli.cidade, cli.cep && 'CEP ' + cli.cep].filter(Boolean).join(' · ')))}</tr>
        <tr>${celCli('Contato', esc([cli.contato_assina || cli.contato_decide, cli.telefone || cli.whatsapp].filter(Boolean).join(' · ')))}${celCli('Consultor', esc(S.usuario(pi.consultor_id)))}</tr></table>`
      : `<table class="pd-cli"><tr>${celCli('Anunciante', esc(cli.nome))}${celCli('Agência', ag ? esc(ag.nome) : 'Venda direta')}</tr><tr>${celCli('Consultor', esc(S.usuario(pi.consultor_id)), true)}</tr></table>`;
    // Marca do PI: a da rádio ou a da empresa comercial do grupo (Head 14). Quem fatura continua sendo a rádio.
    const marca = o.marca || pi.dados.marca || v.pi_marca || 'radio', e = S.db.empresa;
    const empresa = marca === 'comercial' && e ? `<div class="pd-radio pd-emp"><img src="${esc(e.logo || S.logoReserva())}" alt=""><div><b class="pd-nome">${esc(e.nome)}</b>
      ${o.vehicleData ? [e.razao_social, e.cnpj && 'CNPJ ' + e.cnpj, [e.endereco, e.cidade].filter(Boolean).join(' · '), e.telefone && 'Fone ' + e.telefone, e.email].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('') : ''}
      <div>Veiculação e faturamento: ${esc(v.nome)}</div></div></div>` : '';
    const radio = empresa || `<div class="pd-radio">${v.logo ? `<img src="${v.logo}" alt="">` : `<span class="pd-selo" style="background:${cor}">${esc(v.sigla)}</span>`}<div><b class="pd-nome">${esc(v.nome)}</b>
      ${o.vehicleData ? [v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, [v.endereco, v.cidade].filter(Boolean).join(' · '), [v.cep && 'CEP ' + v.cep, v.telefone && 'Fone ' + v.telefone].filter(Boolean).join(' · '), v.email].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('') : ''}</div></div>`;
    const corNo = empresa ? e.cor || '#2b5fb5' : cor;
    const numero = `<div class="pd-num" style="border-color:${corNo}"><div class="pd-no" style="color:${corNo}">${S.piNo(pi)}</div><div class="pd-kv">
      <span>Veículo</span><b>${esc(v.nome)}${v.frequencia ? ' ' + esc(v.frequencia) : ''}</b><span>Período</span><b>${periodo}</b><span>Campanha</span><b>${esc(pi.titulo)}</b>${pi.projeto ? `<span>Projeto</span><b>${esc(pi.projeto)}</b>` : ''}${pi.dados.proposta ? `<span>Proposta</span><b>${esc(pi.dados.proposta.numero)}</b>` : ''}<span>Emitido em</span><b>${dfmt(o.date)}</b></div></div>`;
    const aprov = (S.db.hist[pi.id] || []).find(h => h.status === 'aprovado');
    const signs = [o.signClient && ['Anunciante / Contratante', cli.contato_assina || cli.nome], o.signAgency && ag && ['Agência', ''], o.signVehicle && ['Veículo / Contratada', v.nome]].filter(Boolean);
    const cidade = (v.pi_cidade || v.cidade || '').split('/')[0].trim();
    document.getElementById('print').innerHTML = `<div class="pidoc">
      <div class="pd-topo">${radio}<div class="pd-meio"><div class="pd-titulo">PEDIDO DE INSERÇÃO</div>${cliente}</div>${numero}</div>
      <div class="pd-autoriza">AUTORIZAMOS EXECUTAR ESTE PLANO DE MÍDIA${c.pub ? ' E AS PUBLICAÇÕES' : ''} DE ACORDO COM AS CONDIÇÕES ABAIXO DISCRIMINADAS</div>
      ${grids}${digital}
      <div class="pd-pecas"><span><b>Peças:</b> ${pi.dados.pieces.map((p, i) => `${String.fromCharCode(65 + i)} · ${esc(p.name)}`).join(' &nbsp; ') || '—'}</span><span>${c.ins || !c.pub ? `Total de inserções: <b>${c.ins}</b>` : ''}${c.ins && c.pub ? ' &nbsp; · &nbsp; ' : ''}${c.pub ? `Entregas digitais: <b>${c.pub}</b>` : ''}</span></div>
      <div class="pd-baixo">${pagamento}<div class="pd-box"><b class="pd-tit">Observações</b><div>${o.obs && b.obsClient ? esc(b.obsClient).replace(/\n/g, '<br>') : ''}</div></div>${totais}</div>
      <div class="pd-fecho"><div><div>E, por estarem de acordo com as especificações e condições deste pedido${o.conds ? ' e das condições gerais abaixo' : ''}, as partes assinam o presente para todos os efeitos legais.</div>
        <div>${esc(cidade ? cidade + ', ' : '')}${dataExt(o.date)}.</div>
        ${signs.length ? `<div class="pd-ass" style="--n:${signs.length}">${signs.map(([r, n]) => `<div><b>${r}</b>${n ? `<br><span>${esc(n)}</span>` : ''}</div>`).join('')}</div>` : ''}</div>
        <div class="pd-box pd-aprov"><b>Aprovação OPEC</b>${aprov ? `<span class="ok">Aprovado em ${dfmt(S.dia(aprov.em))}</span><span>por ${esc(S.usuario(aprov.usuario_id))}</span>` : '<span class="mut">Aguardando</span>'}</div></div>
      ${o.conds ? `<div class="pd-conds"><b>CONDIÇÕES GERAIS</b> — ${condicoesHtml(v.pi_condicoes, v)}</div>` : ''}
      <div class="pd-rodape"><span>Gerado pelo SONVI · ${S.piNo(pi)}</span></div></div>`;
  };
  // Percentual da comissão, quando ela é em %
  const d_pct = (pi, so) => { const r = pi.dados.commission; if (r.type !== 'pct' || !num(r.value)) return ''; const t = nfmt(num(r.value)).replace(/,00$/, '') + '%'; return so ? t : ' ' + t; };
})();

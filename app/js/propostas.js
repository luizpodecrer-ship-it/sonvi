// SONVI · propostas comerciais (database/017_propostas.sql).
// A empresa comercial do grupo (Head 14) vende para as rádios: a proposta sai com a marca dela, mas é sempre de uma rádio só
// (quem fatura, a OPEC e o financeiro são da rádio). Fluxo: Rascunho → Enviada → Aprovada ou Recusada; enviada que passou da
// validade aparece como Vencida. Enviar = link da proposta pelo WhatsApp ou e-mail (database/018, página app/proposta.html); ao enviar,
// ela fica marcada como enviada sozinha. Aprovar é só da equipe. O PI da aprovada é gerado na tela de PIs (S.propostasParaPi), com as inserções
// distribuídas sozinhas pelos dias permitidos (S.distribuir, pi-regras.js) e a faixa horária escrita para a OPEC lançar no Pulsar.
(() => {
  const { esc, brl, num, nfmt, dfmt, uid, today } = S;
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const SIT = { rascunho:['Rascunho', 'gray'], enviada:['Enviada', 'sky'], aprovada:['Aprovada', 'green'], recusada:['Recusada', 'red'], vencida:['Vencida', 'gray'], pi:['PI gerado', 'purple'] };
  const lista = () => S.db.propostas || [];
  const achar = id => lista().find(p => p.id === id);
  const vencida = p => p.situacao === 'enviada' && S.propVence(p) < today();
  const sitDe = p => p.situacao === 'aprovada' && p.pi_id ? 'pi' : vencida(p) ? 'vencida' : p.situacao;
  const pill = p => { const [l, t] = SIT[sitDe(p)]; return `<span class="pill${sitDe(p) === 'enviada' ? ' live' : ''}" style="--tone:var(--${t})">${l}</span>`; };
  // Diretor e gerente mexem em todas; o consultor, só nas dele (o banco confere de novo)
  const pode = p => S.pode('diretor', 'gerente') || (S.pode('consultor') && p.consultor_id === S.me.id);
  const editavel = p => p.situacao === 'rascunho' && pode(p);
  const emp = () => S.db.empresa || { nome:'Empresa comercial' };
  const empLogo = () => emp().logo || 'img/head14.png';
  const empCurto = () => String(emp().nome || 'Empresa comercial').split('·')[0].trim();
  const empImg = (cls = '') => `<img class="${cls}" src="${esc(empLogo())}" width="600" height="122" alt="${esc(empCurto())}">`;
  const curtoData = iso => iso ? String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
  const cidadeDe = txt => String(txt || '').split('/')[0].trim();
  const piDe = p => p.pi_id && S.db.pis.find(x => x.id === p.pi_id);
  const assinante = p => emp().assina === 'consultor' || !emp().responsavel
    ? { nome:S.usuario(p.consultor_id) || emp().responsavel || '', cargo:`Consultor(a) · ${empCurto()}` }
    : { nome:emp().responsavel, cargo:[emp().cargo, empCurto()].filter(Boolean).join(' · ') };
  // "Spot 30" · Rotativo seg. a sáb." (o que a proposta vende, numa linha)
  const resumoItem = it => `${it.formato} · ${it.programa}${(it.dias || []).length < 7 ? ' ' + S.diasTexto(it.dias) : ''}`;
  const resumo = p => { const its = (p.itens || []).filter(it => it.insercoes); if (!its.length) return (p.itens || []).length ? resumoItem(p.itens[0]) : 'Sem itens';
    return resumoItem(its[0]) + (its.length > 1 ? ` + ${its.length - 1} ${its.length > 2 ? 'itens' : 'item'}` : ''); };

  // ---------- lista ----------
  const FILTROS = [['todas', 'Todas'], ['rascunho', 'Rascunho'], ['enviada', 'Enviadas'], ['aprovada', 'Aprovadas'], ['fora', 'Recusadas e vencidas']];
  const noFiltro = (p, f) => f === 'todas' || (f === 'rascunho' && p.situacao === 'rascunho') || (f === 'enviada' && sitDe(p) === 'enviada')
    || (f === 'aprovada' && p.situacao === 'aprovada') || (f === 'fora' && ['recusada', 'vencida'].includes(sitDe(p)));
  const detalheSit = p => { const s = sitDe(p);
    if (s === 'rascunho') { const t = p.atualizado_em || p.criado_em; return `Salva ${S.dia(t) === today() ? 'hoje' : 'em ' + curtoData(S.dia(t))} às ${S.hora(t)}`; }
    if (s === 'enviada') return `${p.enviada_por === 'email' ? 'Por e-mail' : p.enviada_por === 'whatsapp' ? 'Por WhatsApp' : 'Enviada'} · vale até ${curtoData(S.propVence(p))}`;
    if (s === 'vencida') return `Venceu em ${curtoData(S.propVence(p))}`;
    if (s === 'aprovada') return `Aprovada em ${curtoData(S.dia(p.aprovada_em))} · PI a gerar em PIs`;
    if (s === 'pi') { const pi = piDe(p); return pi ? `${S.piNo(pi)} gerado` : 'PI gerado'; }
    return `Recusada em ${curtoData(S.dia(p.recusada_em))}${p.motivo ? ' · ' + esc(p.motivo) : ''}`; };
  // O botão principal de cada linha: o próximo passo da proposta
  const proximo = p => { if (!pode(p)) return p.pi_id && piDe(p) ? `<button class="btn sm" data-act="prAbrirPi" data-id="${p.id}">Abrir PI</button>` : '';
    const s = sitDe(p);
    if (s === 'enviada' || s === 'vencida') return `<button class="btn sm" data-act="prAprovar" data-id="${p.id}">Marcar aprovada</button>`;
    if (s === 'rascunho') return `<button class="btn sm" data-act="prEnviar" data-id="${p.id}">Enviar ao cliente</button>`;
    if (s === 'pi') return `<button class="btn sm" data-act="prAbrirPi" data-id="${p.id}">Abrir PI</button>`;
    return ''; };

  const listaView = () => {
    if (ed.id && !ed.sujo) fechar();
    const todas = lista().slice().sort((a, b) => b.ano - a.ano || b.numero - a.numero), f = S.ui.propFiltro || 'todas';
    const q = (S.ui.q || '').toLowerCase();
    const vis = todas.filter(p => noFiltro(p, f) && (!q || [S.propNo(p), S.nome(p.cliente_id), S.nome(p.agencia_id), resumo(p), S.usuario(p.consultor_id)].join(' ').toLowerCase().includes(q)));
    const conta = k => todas.filter(p => noFiltro(p, k)).length;
    // Indicadores: o que está com o cliente, o que fechou no mês, a taxa de aprovação e o que vence logo
    const abertas = todas.filter(p => sitDe(p) === 'enviada'), mes = today().slice(0, 7);
    const doMes = todas.filter(p => p.situacao === 'aprovada' && p.aprovada_em && S.dia(p.aprovada_em).slice(0, 7) === mes);
    const aprov = todas.filter(p => p.situacao === 'aprovada').length, resp = aprov + todas.filter(p => p.situacao === 'recusada').length;
    const em7 = abertas.filter(p => S.propVence(p) <= S.somaDias(today(), 7));
    const soma = l => brl(l.reduce((s, p) => s + Number(p.valor_total || 0), 0)).replace(/,00$/, '');
    const n = (k, um, varios) => `${k} ${k === 1 ? um : varios}`;
    const tiles = `<div class="tiles pr-tiles">
      <div class="tile"><small>Em aberto (enviadas)</small><b>${soma(abertas)}</b><small>${n(abertas.length, 'proposta', 'propostas')}</small></div>
      <div class="tile"><small>Aprovadas no mês</small><b>${soma(doMes)}</b><small>${n(doMes.length, 'proposta', 'propostas')}</small></div>
      <div class="tile"><small>Taxa de aprovação</small><b>${resp ? Math.round(aprov / resp * 100) + '%' : '—'}</b><small>das que tiveram resposta</small></div>
      <div class="tile"><small>Vencem em 7 dias</small><b>${em7.length}</b><small>${em7.length ? esc(em7.slice(0, 2).map(p => S.nome(p.cliente_id)).join(', ')) + (em7.length > 2 ? '…' : '') : 'nenhuma'}</small></div></div>`;
    const ciclo = `<div class="tp-ciclo">${['rascunho', 'enviada', 'aprovada', 'pi'].map(k => `<span class="pill" style="--tone:var(--${SIT[k][1]})">${SIT[k][0]}</span>`).join('<span aria-hidden="true">→</span>')}
      <span class="muted small">Envie ao cliente pelo WhatsApp ou e-mail: ele recebe um link da proposta. Recusada ou vencida saem do caminho. O PI da aprovada é gerado na tela de PIs.</span></div>`;
    const seg = `<div class="seg" role="group" aria-label="Filtrar propostas">${FILTROS.map(([k, t]) => `<button class="${f === k ? 'on' : ''}" data-act="prFiltro" data-f="${k}" aria-pressed="${f === k}">${t} · ${conta(k)}</button>`).join('')}</div>`;
    const linhas = vis.map(p => { const cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id);
      return `<div class="prl-l click" data-go="/propostas/${p.id}" role="link" tabindex="0" aria-label="Proposta ${S.propNo(p)} · ${esc(cli)}">
        <span class="prl-n">${S.propNo(p)}</span>
        <span class="prl-c"><b title="${esc(cli)}">${esc(cli)}</b><small>${ag ? esc(ag) : 'Direto'}</small></span>
        <span class="prl-i" title="${esc(resumo(p))}">${esc(resumo(p))}</span>
        <span class="prl-q"><small>Inserções/mês</small>${p.insercoes}</span>
        <span class="prl-v"><small>Investimento mensal</small><b>${brl(p.valor_total)}</b></span>
        <span class="prl-s">${pill(p)}<small>${detalheSit(p)}</small></span>
        <span class="prl-a">${proximo(p)}<button class="btn tres" data-act="prOpcoes" data-id="${p.id}" aria-label="Opções da proposta ${S.propNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
    const vazio = `<div class="card empty"><b>${todas.length ? 'Nenhuma proposta neste filtro' : 'Nenhuma proposta ainda'}</b>${todas.length ? 'Escolha outro filtro ou outra busca.' : `As propostas saem com a marca da ${esc(empCurto())} e os preços da tabela vigente.`}</div>`;
    const podeCriar = S.pode('diretor', 'gerente', 'consultor');
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Propostas`,
      actions:podeCriar ? `<button class="btn pri" data-act="prNova">${S.svg('mais')}Nova proposta</button>` : '',
      body:`${ciclo}${tiles}${seg}${todas.length > 8 ? `<div style="margin-bottom:16px"><input type="search" style="width:100%;height:44px" placeholder="Buscar por número, cliente, agência ou item" aria-label="Buscar propostas" value="${esc(S.ui.q)}" data-ui="q"></div>` : ''}
        ${vis.length ? `<section class="card prl" aria-label="Propostas"><div class="prl-l prl-cab"><span class="prl-n">Nº</span><span class="prl-c">Cliente</span><span class="prl-i">Itens</span><span class="prl-q">Inserções/mês</span><span class="prl-v">Investimento mensal</span><span class="prl-s">Situação</span><span class="prl-a"><span class="sr">Ações</span></span></div>${linhas}</section>` : vazio}` };
  };

  // ---------- editor: as mudanças ficam na tela até "Salvar" ----------
  const ed = { id:null, p:null, sujo:false };
  S.propSujo = () => !!(ed.id && ed.sujo);
  const abrir = p => { ed.id = p.id; ed.p = JSON.parse(JSON.stringify(p)); ed.p.itens = ed.p.itens || []; ed.sujo = false; };
  const fechar = () => { ed.id = null; ed.p = null; ed.sujo = false; };
  const sujar = () => { if (ed.sujo) return; ed.sujo = true; document.querySelectorAll('.pr-sujo').forEach(e => { e.hidden = false; }); };
  const trocar = r => { const l = S.db.propostas, i = l.findIndex(x => x.id === r.id); if (i >= 0) l[i] = r; else l.push(r); if (ed.id === r.id) abrir(r); return r; };

  const clientesParaEscolher = atual => S.pessoas('cliente').filter(c => !S.pode('consultor') || c.consultor_id === S.me.id || c.id === atual);
  const docCli = c => [c.razao_social && c.razao_social !== c.nome ? c.razao_social : '', c.documento ? `${c.pessoa === 'pf' ? 'CPF' : 'CNPJ'} ${c.documento}` : ''].filter(Boolean).join(' · ');
  const VALIDADES = [5, 7, 10, 15, 20, 30, 45, 60, 90];
  const linhasCond = txt => String(txt || '').split('\n').map(l => l.replace(/^[•\-–*]\s*/, '').trim()).filter(Boolean);

  const resumoHtml = (p, v) => { const t = S.propTotais(p), its = (p.itens || []).filter(it => it.insercoes), um = its.length === 1 ? its[0] : null, as = assinante(p);
    return `<h2 class="pr-rot">Resumo mensal</h2>
      <div class="pr-lin"><span>Valor de tabela${um ? `<small>${um.insercoes} × ${brl(um.preco_tabela)}</small>` : `<small>${t.ins} inserções</small>`}</span><b>${brl(t.tabela)}</b></div>
      <div class="pr-lin"><span>Desconto negociado<small>${t.tabela ? nfmt(t.pct).replace(/,?0+$/, '') || '0' : '0'}% sobre a tabela</small></span><b>${t.desconto > 0.004 ? '− ' : ''}${brl(Math.abs(t.desconto))}</b></div>
      <div class="pr-lin pr-inv"><span>Investimento mensal</span><b>${brl(t.total)}</b></div>
      <div class="pr-marca"><small>Sai com a marca da</small><span class="pr-logo">${empImg()}</span><small>${as.nome ? `Assina: ${esc(as.nome)}${as.cargo ? ' · ' + esc(as.cargo.split(' · ')[0]) : ''}` : ''}</small></div>
      <p class="muted small">${p.situacao === 'rascunho' ? 'Clique em "Enviar ao cliente": ele recebe o link da proposta pelo WhatsApp ou e-mail e ela fica marcada como enviada.' : p.situacao === 'enviada' ? 'Quando o cliente responder, marque como aprovada ou recusada.' : p.situacao === 'aprovada' ? (p.pi_id ? 'O PI desta proposta já foi gerado.' : 'Aprovada: o PI é gerado na tela de PIs, em "Propostas aprovadas".') : 'Para negociar de novo, volte a proposta para rascunho.'}</p>`; };

  const editor = id => {
    const orig = achar(id);
    if (!orig) return { title:'Proposta não encontrada', actions:'', body:'<div class="card empty"><b>Esta proposta não existe ou não é desta rádio</b><a data-go="/propostas">Voltar para a lista</a></div>' };
    if (ed.id !== id) abrir(orig);
    const p = ed.p, em = editavel(orig), v = S.veh(), cli = S.pessoa(p.cliente_id) || {}, ag = S.pessoa(p.agencia_id), ro = em ? '' : ' disabled';
    const tab = (S.db.tabelas || []).find(t => t.id === p.tabela_id) || S.tabelaVigente();
    const opc = (lista_, sel, vazio) => `${vazio !== undefined ? `<option value="">${vazio}</option>` : ''}${lista_.map(x => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}`;
    const cliente = `<section class="card"><h2>Cliente</h2><div class="pr-cli">
        <label class="f">Cliente${em ? `<select data-pf="cliente_id">${opc(clientesParaEscolher(p.cliente_id), p.cliente_id)}</select>` : `<span class="pr-val">${esc(cli.nome) || '—'}</span>`}<small class="muted">${esc(docCli(cli)) || ' '}</small></label>
        <label class="f">Negociação${em ? `<select data-pf="agencia_id">${opc(S.pessoas('agencia'), p.agencia_id, 'Direto')}</select>` : `<span class="pr-val">${ag ? esc(ag.nome) : 'Direto'}</span>`}<small class="muted">${ag ? `Comissão da agência: ${nfmt(num(ag.comissao)).replace(/,00$/, '')}% (entra no PI)` : 'Com agência, a comissão entra no PI'}</small></label>
        <label class="f">Data${em ? `<input type="date" data-pf="data" value="${p.data}" required>` : `<span class="pr-val">${dfmt(p.data)}</span>`}<small class="muted"> </small></label>
        <label class="f">Validade${em ? `<select data-pf="validade">${[...new Set([...VALIDADES, Number(p.validade)])].sort((a, b) => a - b).map(n => `<option value="${n}"${n === Number(p.validade) ? ' selected' : ''}>${n} dias</option>`).join('')}</select>` : `<span class="pr-val">${p.validade} dias</span>`}<small class="muted" id="prVence">Vence em ${dfmt(S.propVence(p))}</small></label></div>
      <div class="pr-texto"><div class="row mid"><span class="pr-rotulo grow">Texto de apresentação <small class="muted">· sai no topo da proposta</small></span>${em ? `<button type="button" class="btn sm" data-act="prSugerir">${S.svg('editar')}Sugerir pelo que foi vendido</button>` : ''}</div>
        ${em ? `<textarea data-pf="texto" aria-label="Texto de apresentação" placeholder="Ex.: Apresentamos a proposta de veiculação na ${esc(v.nome)}…">${esc(p.texto)}</textarea>` : `<p class="pr-leitura">${esc(p.texto) || '<span class="muted">Sem texto de apresentação.</span>'}</p>`}</div></section>`;
    const dias = (it, i) => `<span class="pr-dias" role="group" aria-label="Dias da semana">${S.SEMANA.map(d => { const on = (it.dias || []).includes(d);
      return em ? `<button type="button" class="pr-dia${on ? ' on' : ''}" data-act="prDia" data-i="${i}" data-d="${d}" aria-pressed="${on}" aria-label="${S.DIA_NOME[d]}" title="${S.DIA_NOME[d]}">${S.DIA_LETRA[d]}</button>`
        : `<span class="pr-dia${on ? ' on' : ''}" title="${S.DIA_NOME[d]}${on ? '' : ' (fora)'}" aria-hidden="true">${S.DIA_LETRA[d]}</span>`; }).join('')}${em ? '' : `<span class="sr">${S.diasTexto(it.dias)}</span>`}</span>`;
    const itens = p.itens.map((it, i) => `<div class="pr-it">
        <span class="pr-id"><b>${esc(it.formato)} · ${esc(it.programa)}</b><small class="muted">${em ? `<label>Faixa <input class="pr-faixa" data-pf="faixa" data-i="${i}" value="${esc(it.faixa)}" placeholder="07h às 19h" aria-label="Faixa horária de ${esc(it.programa)}"></label>` : `Faixa: <b>${esc(it.faixa) || '—'}</b>`}</small></span>
        <span class="pr-dd"><small class="pr-k">Dias</small>${dias(it, i)}</span>
        <label class="pr-q"><small class="pr-k">Inserções/mês</small>${em ? `<input data-pf="insercoes" data-i="${i}" data-mask="int" inputmode="numeric" value="${it.insercoes || ''}" placeholder="0" aria-label="Inserções por mês de ${esc(it.programa)}">` : `<b>${it.insercoes}</b>`}</label>
        <span class="pr-tb"><small class="pr-k">Tabela</small><span class="muted">${it.preco_tabela ? brl(it.preco_tabela) : 'sem preço'}</span></span>
        <label class="pr-ng"><small class="pr-k">Negociado</small>${em ? `<input data-pf="preco" data-i="${i}" data-mask="dec" inputmode="decimal" value="${nfmt(r2(it.preco))}" placeholder="0,00" aria-label="Valor unitário negociado de ${esc(it.programa)}">` : `<span>${brl(it.preco)}</span>`}</label>
        <label class="pr-tt"><small class="pr-k">Total mensal</small>${em ? `<input data-pf="total" data-i="${i}" data-mask="dec" inputmode="decimal" value="${nfmt(it.total)}" placeholder="0,00" aria-label="Total mensal de ${esc(it.programa)}">` : `<b>${brl(it.total)}</b>`}</label>
        <span class="pr-x">${em ? `<button type="button" class="x" data-act="prRmItem" data-i="${i}" aria-label="Remover ${esc(it.formato)} · ${esc(it.programa)}" title="Remover item">×</button>` : ''}</span></div>`).join('');
    const itensCard = `<section class="card"><div class="hd"><h2>Itens da tabela${tab ? ` <span class="muted small" style="font:500 13px var(--font)">· ${esc(tab.nome)}</span>` : ''}</h2>${em ? `<button class="btn" data-act="prAddItem">${S.svg('mais')}Adicionar da tabela</button>` : ''}</div>
      ${p.itens.length ? `<div class="pr-its"><div class="pr-it pr-cab" aria-hidden="true"><span>Formato · programação</span><span>Dias</span><span class="r">Inserções/mês</span><span class="r">Tabela</span><span class="r">Negociado</span><span class="r">Total mensal</span><span></span></div>${itens}</div>`
        : `<p class="muted" style="margin:4px 0 0">${em ? 'Nenhum item ainda. Clique em <b>Adicionar da tabela</b> para escolher programa e formato.' : 'Nenhum item.'}</p>`}
      ${em && p.itens.length ? '<p class="muted small" style="margin-top:14px">O preço vem da tabela vigente e fica guardado na proposta. Dá para negociar pelo valor unitário ou pelo total do mês: um ajusta o outro.</p>' : ''}</section>`;
    const cond = `<section class="card"><div class="hd"><h2>Condições comerciais</h2><span>uma por linha · saem no PDF</span></div>
      ${em ? `<textarea class="alto" data-pf="condicoes" aria-label="Condições comerciais">${esc(p.condicoes)}</textarea>` : `<ul class="pr-cond">${linhasCond(p.condicoes).map(l => `<li>${esc(l)}</li>`).join('') || '<li class="muted">Sem condições.</li>'}</ul>`}</section>`;
    const s = sitDe(orig), aviso = !pode(orig) ? '<div class="note info">Esta proposta é de outro consultor: está só para consulta.</div>'
      : s === 'enviada' || s === 'vencida' ? `<div class="note info">Proposta enviada${s === 'vencida' ? ` e <b>vencida</b> em ${dfmt(S.propVence(orig))}` : ''}: para mudar algo, use <b>Voltar para rascunho</b> no menu ⋯.</div>`
      : s === 'recusada' ? `<div class="note info">Recusada em ${dfmt(S.dia(orig.recusada_em))}${orig.motivo ? `: ${esc(orig.motivo)}` : ''}. Para negociar de novo, volte para rascunho no menu ⋯.</div>` : '';
    const b = (act, txt, cls = '', icon = '') => `<button class="btn${cls ? ' ' + cls : ''}" data-act="${act}" data-id="${orig.id}">${icon ? S.svg(icon) : ''}${txt}</button>`;
    const fluxo = !pode(orig) ? (piDe(orig) ? b('prAbrirPi', 'Abrir PI') : '')
      : s === 'rascunho' ? b('prEnviar', 'Enviar ao cliente', 'pri', 'seta')
      : s === 'enviada' || s === 'vencida' ? b('prEnviar', 'Reenviar', '', 'whats') + b('prAprovar', 'Marcar aprovada', 'pri', 'check')
      : s === 'aprovada' ? b('prIrPis', 'Ir para PIs', 'pri', 'pis') : s === 'pi' ? b('prAbrirPi', 'Abrir PI', 'pri', 'abrir') : '';
    const acoes = `${em ? `<span class="sujo pr-sujo"${ed.sujo ? '' : ' hidden'}><i></i>Alterações não salvas</span><button class="btn pr-sujo" data-act="prDescartar"${ed.sujo ? '' : ' hidden'}>Descartar</button>` : ''}
      <button class="btn tres" data-act="prOpcoes" data-id="${orig.id}" aria-label="Mais opções">${S.svg('mais3')}</button>${b('prVer', 'Visualizar', '', 'olho')}${b('prPdf', 'Baixar PDF', '', 'baixar')}${em ? b('prSalvar', 'Salvar', '', 'check') : ''}${fluxo}`;
    return { title:`<span class="sub"><a data-go="/propostas">Propostas</a>${S.svg('seta', 14)}${pill(orig)}<span>· ${esc(S.usuario(orig.consultor_id))}</span></span>Proposta ${S.propNo(orig)}`, actions:acoes,
      body:`${aviso}<div class="pr-corpo"><div class="pr-main">${cliente}${itensCard}${cond}</div><aside class="card pr-res" id="prResumo" aria-label="Resumo mensal">${resumoHtml(p, v)}</aside></div>` };
  };
  S.views.propostas = id => id ? editor(id) : listaView();

  // Campos do editor: guardam na memória (ed.p) e atualizam só os números, sem redesenhar (o cursor não sai do campo)
  const mostra = (pf, i, valor) => { const el = document.querySelector(`#content [data-pf="${pf}"][data-i="${i}"]`); if (el && el !== document.activeElement) el.value = valor; };
  const aplicar = (el, fim) => {
    const d = el.dataset, p = ed.p, i = d.i !== undefined ? +d.i : null, it = i !== null ? p.itens[i] : null;
    if (it) {
      if (d.pf === 'insercoes') { it.insercoes = parseInt(String(el.value).replace(/\D/g, '')) || 0; it.total = r2(it.insercoes * it.preco); mostra('total', i, nfmt(it.total)); }
      else if (d.pf === 'preco') { it.preco = num(el.value); it.total = r2(it.insercoes * it.preco); mostra('total', i, nfmt(it.total)); if (fim) el.value = nfmt(it.preco); }
      else if (d.pf === 'total') { it.total = r2(num(el.value)); if (it.insercoes) it.preco = it.total / it.insercoes; mostra('preco', i, nfmt(r2(it.preco))); if (fim) el.value = nfmt(it.total); }
      else if (d.pf === 'faixa') it.faixa = el.value;
    } else if (d.pf === 'validade') p.validade = parseInt(el.value) || 15;
    else if (d.pf === 'cliente_id') { p.cliente_id = el.value || null; const c = S.pessoa(p.cliente_id); if (c && fim) p.agencia_id = c.agencia_id || null; }
    else if (d.pf === 'agencia_id') p.agencia_id = el.value || null;
    else p[d.pf] = el.value;
    sujar();
    if (['validade', 'data'].includes(d.pf)) { const vv = document.getElementById('prVence'); if (vv && p.data) vv.textContent = `Vence em ${dfmt(S.propVence(p))}`; }
    const res = document.getElementById('prResumo'); if (res) res.innerHTML = resumoHtml(p, S.veh());
    if (fim && ['cliente_id', 'agencia_id'].includes(d.pf)) S.render();
  };
  const noEditor = el => ed.id && el.dataset && el.dataset.pf && el.closest('#content') && editavel(achar(ed.id) || {});
  document.addEventListener('input', e => { if (noEditor(e.target) && !['SELECT'].includes(e.target.tagName)) aplicar(e.target, false); });
  document.addEventListener('change', e => { if (noEditor(e.target)) aplicar(e.target, true); });

  // Sair da proposta com alterações não salvas pergunta antes
  let voltando = false, hashAnterior = location.hash;
  window.addEventListener('hashchange', () => {
    if (voltando) { voltando = false; hashAnterior = location.hash; return; }
    if (ed.id && location.hash !== '#/propostas/' + ed.id) {
      if (ed.sujo) { const destino = location.hash; voltando = true; location.hash = hashAnterior;
        S.confirmar('Sair sem salvar a proposta?\n\nAs alterações que ainda não foram salvas serão perdidas.', { ok:'Sair sem salvar', voltar:'Continuar editando', perigo:true })
          .then(ok => { if (ok) { fechar(); location.hash = destino; } });
        return; }
      fechar();
    }
    hashAnterior = location.hash;
  });
  window.addEventListener('beforeunload', e => { if (ed.sujo) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- gravar e mudar de situação ----------
  const limpo = it => ({ id:it.id, programa_id:it.programa_id, formato_id:it.formato_id, programa:it.programa, formato:it.formato, secao:it.secao, detalhe:it.detalhe,
    dias:S.SEMANA.filter(d => (it.dias || []).includes(d)).sort((a, b) => a - b), faixa:String(it.faixa || '').trim(), insercoes:parseInt(it.insercoes) || 0,
    preco_tabela:Number(it.preco_tabela) || 0, preco:Number(it.preco) || 0, total:r2(it.total) });
  const gravar = async () => { const p = ed.p, t = S.propTotais(p);
    const r = await S.salvar('propostas', { id:p.id, cliente_id:p.cliente_id, agencia_id:p.agencia_id || null, data:p.data || today(), validade:parseInt(p.validade) || 15,
      texto:String(p.texto || '').trim(), condicoes:String(p.condicoes || '').trim(), itens:p.itens.map(limpo), insercoes:t.ins, valor_tabela:t.tabela, valor_total:t.total, tabela_id:p.tabela_id || null });
    abrir(r); return r; };
  // O que falta para a proposta poder ir ao cliente
  const problemas = p => { const out = [];
    if (!p.cliente_id) out.push('escolha o cliente');
    if (!(p.itens || []).some(it => it.insercoes)) out.push('coloque ao menos um item com inserções');
    if ((p.itens || []).some(it => it.insercoes && !(it.dias || []).length)) out.push('há item sem nenhum dia marcado');
    if ((p.itens || []).some(it => it.insercoes && !Number(it.total))) out.push('há item com inserções e sem valor');
    return out; };
  const situacao = (p, para, motivo, ok) => S.run(async () => {
    const r = await S.q(S.sb.rpc('mudar_situacao_proposta', { p_proposta:p.id, p_situacao:para, p_motivo:motivo || '' })); trocar(r); return r; }, ok);

  const proxMes = () => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`; };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesExt = per => { const [y, m] = per.split('-').map(Number); const t = MESES[m - 1]; return `${t[0].toUpperCase()}${t.slice(1)} de ${y}`; };

  // ---------- gerar o PI da proposta aprovada ----------
  const gerarDlg = p => {
    const v = S.veh(), itens = (p.itens || []).filter(it => parseInt(it.insercoes) > 0), t = S.propTotais(p);
    if (!itens.length) return S.toast('Esta proposta não tem itens com inserções.');
    const proxNo = `PI ${v.sigla} ${String((v.pi_seq || 0) + 1).padStart(4, '0')}`, marca = v.pi_marca === 'comercial' ? 'comercial' : 'radio';
    const faixas = [...new Set(itens.map(it => it.faixa).filter(Boolean))];
    S.dialog(`<h2>Gerar PI da proposta ${S.propNo(p)}</h2>
      <p class="muted small" style="margin-top:-6px">${esc(S.nome(p.cliente_id))} · ${esc(resumo(p))} · ${t.ins} inserções por mês</p>
      <div class="pr-ger">
        <label class="f">Início da veiculação<input type="date" name="inicio" value="${proxMes()}" required></label>
        <label class="f">Quantos meses<select name="meses">${Array.from({ length:12 }, (_, k) => `<option value="${k + 1}">${k + 1} ${k ? 'meses' : 'mês'}</option>`).join('')}</select></label>
        <fieldset class="f pr-marca-esc"><legend>PI sai com a marca de</legend><div class="seg radios">
          <label><input type="radio" name="marca" value="comercial"${marca === 'comercial' ? ' checked' : ''}>${esc(empCurto())}</label>
          <label><input type="radio" name="marca" value="radio"${marca === 'radio' ? ' checked' : ''}>${esc(v.nome)}</label></div></fieldset></div>
      <div id="prDist" aria-live="polite"></div>
      <div class="note info" style="margin:14px 0 0">No PI, cada dia leva só a <b>quantidade</b>. ${faixas.length ? `A faixa <b>${faixas.map(esc).join('</b>, <b>')}</b> sai escrita no PI, para a OPEC lançar no Pulsar.` : 'Sem faixa horária nos itens: a OPEC lança conforme o programa.'} Depois de gerado, o PI fica em Rascunho e ainda dá para ajustar algum dia antes de mandar para a OPEC.</div>
      <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok" id="prGerarOk">${S.svg('pis')}Gerar ${proxNo}</button></div>`,
      f => gerar(p, itens, f));
    const dl = document.getElementById('dlg'), antes = dl.onclose; dl.classList.add('medio');
    dl.onclose = e => { dl.classList.remove('medio'); if (antes) antes(e); };
    let ver = 0;
    const desenhar = () => {
      const f = dl.querySelector('form'), ini = f.inicio.value, n = parseInt(f.meses.value) || 1, box = document.getElementById('prDist'), okB = document.getElementById('prGerarOk');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) { box.innerHTML = '<p class="muted" style="margin-top:16px">Escolha a data de início.</p>'; okB.disabled = true; return; }
      const r = S.distribuir(itens, ini, n); if (ver >= r.meses.length) ver = 0;
      okB.disabled = !r.soma;
      const m = r.meses[ver], cert = r.soma === r.esperado;
      const ok = `<span class="pill" style="--tone:var(--${cert ? 'green' : 'orange'})">${cert ? S.svg('check', 12) : ''}${r.soma} de ${r.esperado} inserções</span>`;
      if (!m) { box.innerHTML = `<div class="note">Nenhum dia permitido no período: confira os dias dos itens na proposta.</div>`; return; }
      const [y, mm] = m.period.split('-').map(Number), nd = new Date(y, mm, 0).getDate(), vazio = (new Date(y, mm - 1, 1).getDay() + 6) % 7, dia = {};
      Object.values(m.itens).forEach(ds => Object.entries(ds).forEach(([d, q]) => { dia[d] = (dia[d] || 0) + q; }));
      const qs = Object.values(dia), max = Math.max(...qs), min = Math.min(...qs);
      const iso = d => `${m.period}-${String(d).padStart(2, '0')}`;
      const cel = Array.from({ length:nd }, (_, k) => { const d = k + 1, q = dia[d], dentro = iso(d) >= r.inicio && iso(d) <= r.fim;
        return `<span class="pr-cd${!dentro ? ' fora' : q ? (q === max && max !== min ? ' forte' : ' leve') : ' zero'}" ${q ? `aria-label="Dia ${d}: ${q} inserções"` : `aria-label="Dia ${d}: ${dentro ? 'sem inserção' : 'fora do período'}"`}><small>${d}</small><b>${q || (dentro ? '—' : '')}</b></span>`; });
      const cont = {}; qs.forEach(q => { cont[q] = (cont[q] || 0) + 1; });
      const leg = Object.keys(cont).map(Number).sort((a, b) => a - b).map(q => `<span><i class="${q === max && max !== min ? 'forte' : 'leve'}"></i>${q} por dia${q === max && max !== min ? ` (${cont[q]} dias, para fechar a conta)` : ''}</span>`).join('');
      const fora = itens.some(it => (it.dias || []).length < 7) ? `<span>— dia fora (${itens.length === 1 ? `o item é ${S.diasTexto(itens[0].dias)}` : 'conforme os dias de cada item'})</span>` : '';
      box.innerHTML = `${r.meses.length > 1 ? `<div class="seg pr-meses" role="group" aria-label="Mês">${r.meses.map((x, k) => `<button type="button" class="${k === ver ? 'on' : ''}" data-mes="${k}" aria-pressed="${k === ver}">${mesExt(x.period).replace(/ de \d+$/, '').slice(0, 3)}/${x.period.slice(2, 4)}</button>`).join('')}</div>` : ''}
        <div class="row mid pr-cal-cab"><h3 class="grow">${mesExt(m.period)} · distribuição automática</h3>${ok}</div>
        ${r.semDias.length ? `<div class="note">${r.semDias.map(i => esc(resumoItem(itens[i]))).join(', ')}: nenhum dia permitido no período.</div>` : ''}
        <div class="pr-cal"><span class="pr-ws" aria-hidden="true">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(w => `<small>${w}</small>`).join('')}</span>${'<span class="pr-cd vz" aria-hidden="true"></span>'.repeat(vazio)}${cel.join('')}</div>
        <div class="pr-leg">${leg}${fora}</div>`;
    };
    dl.querySelector('form').addEventListener('input', desenhar);
    dl.querySelector('form').addEventListener('click', e => { const bm = e.target.closest('[data-mes]'); if (bm) { ver = +bm.dataset.mes; desenhar(); const nb = dl.querySelector(`[data-mes="${ver}"]`); if (nb) nb.focus(); } });
    desenhar();
  };
  const gerar = (p, itens, f) => S.run(async () => {
    const v = S.veh(), ag = S.pessoa(p.agencia_id), r = S.distribuir(itens, f.inicio, parseInt(f.meses) || 1);
    if (!r.soma) throw new Error('A distribuição ficou sem inserções: confira os dias dos itens.');
    const grids = r.meses.map(m => ({ id:uid(), period:m.period, praca:v.cidade || '', items:Object.entries(m.itens).map(([i, days]) => { const it = itens[+i];
      return { id:uid(), piece:'', f1:it.programa, f2:it.formato, faixa:it.faixa || '', days, unit:Number(it.preco) || 0, disc:{ type:'pct', value:0 }, bonus:false }; }) }));
    const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:ag ? num(ag.comissao) : 0 }, grids, marca:f.marca === 'comercial' ? 'comercial' : 'radio',
      proposta:{ id:p.id, numero:S.propNo(p) }, billing:{ obsClient:`Conforme proposta comercial nº ${S.propNo(p)}.` } } }).dados;
    const c = S.calc({ agencia_id:p.agencia_id, dados });
    const pi = S.piNorm(await S.q(S.sb.rpc('gerar_pi_da_proposta', { p_proposta:p.id, p_titulo:`Proposta ${S.propNo(p)} · ${resumo(p)}`, p_dados:dados,
      p_insercoes:c.ins, p_total:r2(c.total), p_comissao:r2(c.commission), p_liquido:r2(c.net) })));
    S.db.pis.push(pi); v.pi_seq = Math.max(Number(v.pi_seq) || 0, pi.numero);
    const atual = achar(p.id); if (atual) { atual.pi_id = pi.id; if (ed.id === atual.id) abrir(atual); }
    S.ui.tab = 'detalhes'; location.hash = '/pi/' + pi.id;
  }, 'PI gerado com as inserções distribuídas');

  // ---------- enviar ao cliente: link da proposta pelo WhatsApp ou e-mail ----------
  const novoToken = () => { if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
  const linkDe = token => new URL('proposta.html?p=' + token, location.href.split('#')[0]).href;
  const enviarDlg = p => {
    const cli = S.pessoa(p.cliente_id) || {}, v = S.veh(), as = assinante(p), token = p.link_token || novoToken(), link = linkDe(token);
    const contato = String(cli.contato_decide || cli.contato_assina || '').trim().split(/\s+/)[0] || '';
    const msg = `Olá${contato ? ', ' + contato : ''}! Tudo bem?\n\nSegue a proposta comercial nº ${S.propNo(p)} para veiculação na ${v.nome}:\n${link}\n\nA proposta vale até ${dfmt(S.propVence(p))}. Qualquer dúvida, estou à disposição.\n\n${[as.nome, empCurto()].filter(Boolean).join('\n')}`;
    const fone = cli.whatsapp || cli.telefone || '', canal = fone || !cli.email ? 'whatsapp' : 'email';
    S.dialog(`<h2>Enviar proposta ${S.propNo(p)}</h2>
      <p class="muted" style="margin-top:-6px">${esc(cli.nome)} recebe um link para ver a proposta e baixar o PDF, sem precisar de login. Ao enviar, ela fica marcada como enviada.</p>
      <fieldset class="f"><legend>Enviar por</legend><div class="seg radios" style="max-width:340px">
        <label><input type="radio" name="canal" value="whatsapp"${canal === 'whatsapp' ? ' checked' : ''}>WhatsApp</label>
        <label><input type="radio" name="canal" value="email"${canal === 'email' ? ' checked' : ''}>E-mail</label></div></fieldset>
      <label class="f" data-canal="whatsapp">WhatsApp do cliente<input name="fone" data-mask="tel" inputmode="tel" autocomplete="off" value="${esc(fone)}"></label>
      <label class="f" data-canal="email">E-mail do cliente<input name="email" type="email" autocomplete="off" value="${esc(cli.email || '')}" placeholder="nome@empresa.com.br"></label>
      <label class="f">Mensagem<textarea name="msg" class="pr-msg">${esc(msg)}</textarea></label>
      <div class="row mid" style="flex-wrap:wrap"><span class="grow"></span>
        <button class="btn" value="cancel" formnovalidate>Cancelar</button><button type="button" class="btn pri" data-env="enviar">${S.svg('seta')}<span id="prEnvTxt">Enviar pelo WhatsApp</span></button></div>`);
    const dl = document.getElementById('dlg'), f = dl.querySelector('form'); dl.dataset.guarda = '1';
    const troca = () => { const c = f.canal.value; f.querySelectorAll('[data-canal]').forEach(l => { l.hidden = l.dataset.canal !== c; });
      document.getElementById('prEnvTxt').textContent = c === 'email' ? 'Enviar por e-mail' : 'Enviar pelo WhatsApp'; };
    f.addEventListener('change', e => { if (e.target.name === 'canal') troca(); }); troca();
    f.addEventListener('click', e => { const bt = e.target.closest('[data-env]'); if (!bt) return;
      const c = f.canal.value, digitos = f.fone.value.replace(/\D/g, ''), email = f.email.value.trim();
      if (c === 'whatsapp' && digitos.length < 10) return S.erroNoCampo(f.fone, 'Coloque o WhatsApp do cliente com DDD.');
      if (c === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return S.erroNoCampo(f.email, 'Coloque um e-mail válido.');
      // A janela do WhatsApp abre já no clique (o navegador bloqueia janela aberta depois); o endereço entra quando o envio é gravado
      const janela = c === 'whatsapp' ? window.open('about:blank', '_blank') : null, texto = f.msg.value;
      delete dl.dataset.sujo; dl.close('cancel');
      enviar(p, c, c === 'whatsapp' ? digitos : email, token, texto, janela);
    });
  };
  const enviar = async (p, canal, destino, token, texto, janela) => {
    try {
      if (ed.id === p.id && ed.sujo) await gravar();
      const atual = ed.id === p.id && ed.p ? ed.p : achar(p.id);
      const r = await S.q(S.sb.rpc('enviar_proposta', { p_proposta:p.id, p_html:S.htmlProposta(atual), p_canal:canal, p_destino:destino, p_token:token }));
      trocar(r);
      if (canal === 'whatsapp') { const url = `https://wa.me/${destino.length <= 11 ? '55' + destino : destino}?text=${encodeURIComponent(texto)}`;
        if (janela && !janela.closed) janela.location.href = url; else window.open(url, '_blank', 'noopener'); }
      else location.href = `mailto:${destino}?subject=${encodeURIComponent(`Proposta comercial nº ${S.propNo(r)} · ${empCurto()}`)}&body=${encodeURIComponent(texto)}`;
      S.toast(`Proposta ${S.propNo(r)} enviada ${canal === 'email' ? 'por e-mail' : 'pelo WhatsApp'}`);
    } catch (e) { console.error(e); if (janela) janela.close(); S.toast(S.erro(e)); }
    S.render();
  };

  // ---------- tela de PIs: propostas aprovadas esperando virar PI ----------
  S.propostasParaPi = () => {
    if (!S.pode('diretor', 'gerente', 'consultor')) return '';
    const q = (S.ui.q || '').toLowerCase();
    const l = lista().filter(p => p.situacao === 'aprovada' && !p.pi_id && (!q || [S.propNo(p), S.nome(p.cliente_id), S.nome(p.agencia_id), resumo(p)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(a.aprovada_em).localeCompare(String(b.aprovada_em)));
    if (!l.length) return '';
    const linhas = l.map(p => { const cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id);
      return `<div class="prl-l"><span class="prl-n">${S.propNo(p)}</span>
        <span class="prl-c"><b title="${esc(cli)}">${esc(cli)}</b><small>${ag ? esc(ag) : 'Direto'} · ${esc(S.usuario(p.consultor_id))}</small></span>
        <span class="prl-i" title="${esc(resumo(p))}">${esc(resumo(p))}</span>
        <span class="prl-q"><small>Inserções/mês</small>${p.insercoes}</span>
        <span class="prl-v"><small>Investimento mensal</small><b>${brl(p.valor_total)}</b></span>
        <span class="prl-s"><small>Aprovada em ${curtoData(S.dia(p.aprovada_em))}</small></span>
        <span class="prl-a">${pode(p) ? `<button class="btn sm pri" data-act="prGerar" data-id="${p.id}">${S.svg('pis')}Gerar PI</button>` : ''}<button class="btn tres" data-act="prOpcoes" data-id="${p.id}" aria-label="Opções da proposta ${S.propNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
    return `<section class="card prl pr-aprov" aria-label="Propostas aprovadas"><div class="hd"><h2><span class="pill" style="--tone:var(--green)">Propostas aprovadas</span> <span class="muted small">${l.length} ${l.length === 1 ? 'aguardando' : 'aguardando'} PI · as inserções são distribuídas sozinhas</span></h2></div>
      <div class="prl-l prl-cab"><span class="prl-n">Proposta</span><span class="prl-c">Cliente</span><span class="prl-i">Itens</span><span class="prl-q">Inserções/mês</span><span class="prl-v">Investimento mensal</span><span class="prl-s">Aprovação</span><span class="prl-a"><span class="sr">Ações</span></span></div>${linhas}</section>`;
  };

  // ---------- PDF da proposta (A4 em pé, modelo da empresa comercial) ----------
  const DATA_EXT = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
  S.htmlProposta = p => {
    const v = S.veh(p.veiculo_id), e = emp(), cli = S.pessoa(p.cliente_id) || {}, ag = S.pessoa(p.agencia_id), t = S.propTotais(p), as = assinante(p);
    const cor = /^#[0-9a-f]{6}$/i.test(e.cor || '') ? e.cor : '#2b5fb5', cor2 = /^#[0-9a-f]{6}$/i.test(e.cor2 || '') ? e.cor2 : '#f1853d';
    const its = (p.itens || []).filter(it => it.insercoes), um = its.length === 1 ? its[0] : null, cidade = cidadeDe(e.cidade || v.cidade);
    const prog = it => `${esc(it.programa)}, ${S.diasTexto(it.dias)}${it.faixa ? ' · ' + esc(it.faixa) : ''}`;
    return `<div class="prdoc" style="--pc:${cor};--pc2:${cor2}">
      <div class="prd-faixa"><i></i><i></i></div>
      <div class="prd-cab">${empImg('prd-logo')}<div class="prd-tit"><b>PROPOSTA COMERCIAL</b><span>Nº ${S.propNo(p)} · ${esc(cidade ? cidade + ', ' : '')}${DATA_EXT(p.data)}</span></div></div>
      <div class="prd-corpo">
        <div class="prd-partes"><div><small>Cliente</small><b>${esc(cli.nome)}</b>${docCli(cli) ? `<span>${esc(docCli(cli))}</span>` : ''}${cli.endereco || cli.cidade ? `<span>${esc([cli.endereco, cli.cidade].filter(Boolean).join(' · '))}</span>` : ''}</div>
          <div><small>Negociação</small><b>${ag ? esc(ag.nome) : 'DIRETO'}</b>${ag ? '<span>Por agência</span>' : ''}</div></div>
        <h1 class="prd-radio">${esc(v.nome)}</h1>
        ${p.texto ? `<p class="prd-texto">${esc(p.texto).replace(/\n/g, '<br>')}</p>` : ''}
        <table class="prd-tab"><thead><tr><th>Formato</th><th>Programação</th><th class="r">Inserções/mês</th><th class="r">Valor unitário</th><th class="r">Total mensal</th></tr></thead>
          <tbody>${its.map(it => `<tr><td>${esc(it.formato)}</td><td>${prog(it)}</td><td class="r">${it.insercoes}</td><td class="r">${brl(it.preco)}</td><td class="r"><b>${brl(it.total)}</b></td></tr>`).join('')}</tbody></table>
        <div class="prd-tot"><span>Valor de tabela${um ? ` (${um.insercoes} × ${brl(um.preco_tabela)})` : ''}</span><span class="r">${brl(t.tabela)}</span>
          ${t.desconto > 0.004 ? `<span>Desconto negociado</span><span class="r">− ${brl(t.desconto)}</span>` : ''}
          <b class="prd-inv">Investimento mensal</b><b class="prd-inv r">${brl(t.total)}</b></div>
        ${linhasCond(p.condicoes).length ? `<div class="prd-cond"><small>Condições comerciais</small><ul>${linhasCond(p.condicoes).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
        <div class="prd-ass"><div><b>${esc(as.nome)}</b><span>${esc(as.cargo)}</span></div><div><b>De acordo</b><span>${esc(cli.nome)}</span></div></div>
      </div>
      <div class="prd-rod"><b>${esc([e.nome, cidadeDe(e.cidade) ? e.cidade : ''].filter(Boolean).join(' · '))}</b><span>${esc([e.email, e.telefone, e.site].filter(Boolean).join(' · '))}</span></div></div>`;
  };
  S.buildProposta = p => {
    let st = document.getElementById('pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
    st.textContent = '@media print { @page { size:A4 portrait; margin:0; } }';
    document.getElementById('print').innerHTML = S.htmlProposta(p);
  };
  // Visualizar: a proposta como vai sair no PDF, com o que está na tela (inclusive o que ainda não foi salvo)
  const visualizar = (p, id) => {
    const probs = problemas(p), sujo = ed.id === id && ed.sujo;
    S.dialog(`<div class="row mid"><h2 class="grow">Proposta ${S.propNo(p)}</h2><button class="btn" value="x">Fechar</button><button class="btn pri" value="pdf" type="submit">${S.svg('baixar')}Baixar PDF</button></div>
      ${probs.length ? `<div class="note" style="margin:0">Falta preencher: ${probs.map(esc).join('; ')}.</div>` : ''}
      ${sujo ? '<div class="note info" style="margin:0">Mostrando o que está na tela, inclusive o que ainda não foi salvo. Lembre de clicar em <b>Salvar</b>.</div>' : ''}
      <div class="pr-previa" tabindex="0" role="region" aria-label="Prévia da proposta"><div class="pr-folha">${S.htmlProposta(p)}</div></div>`);
    const dl = document.getElementById('dlg'); dl.classList.add('medio');
    // A folha A4 é encolhida para caber na janela (no celular também), sem rolar para o lado
    const ajusta = () => { const box = dl.querySelector('.pr-previa'), folha = dl.querySelector('.pr-folha'), doc = dl.querySelector('.prdoc'); if (!box || !doc) return;
      const k = Math.min(1, box.clientWidth / doc.offsetWidth); folha.style.transform = `scale(${k})`; folha.style.height = doc.offsetHeight * k + 'px'; folha.style.width = doc.offsetWidth * k + 'px'; };
    requestAnimationFrame(ajusta); window.addEventListener('resize', ajusta);
    dl.onclose = () => { dl.classList.remove('medio'); window.removeEventListener('resize', ajusta); if (dl.returnValue === 'pdf') baixarPdf(p); };
  };
  const baixarPdf = p => { S.buildProposta(p); const t = document.title; document.title = `Proposta ${S.propNo(p).replace('/', '-')} · ${S.nome(p.cliente_id)}`; setTimeout(() => { window.print(); document.title = t; }, 80); };

  // Texto de apresentação sugerido pelo que foi vendido
  const sugerir = p => { const v = S.veh(), cli = S.pessoa(p.cliente_id) || {}, its = (p.itens || []).filter(it => it.insercoes), t = S.propTotais(p), cid = cidadeDe(v.cidade);
    const comoUm = its.length === 1 ? its[0] : null, seg = comoUm && /(\d+)\s*(?:"|''|”|s\b|seg)/i.exec(comoUm.formato);
    const dist = comoUm ? (comoUm.dias.length === 7 ? 'distribuídas todos os dias' : `distribuídas de ${S.diasTexto(comoUm.dias).replace('seg.', 'segunda').replace('sex.', 'sexta').replace('sáb.', 'sábado').replace('dom.', 'domingo').replace('ter.', 'terça').replace('qua.', 'quarta').replace('qui.', 'quinta')}`) : 'em diferentes horários da programação';
    return `Apresentamos à ${cli.nome || 'sua empresa'} a proposta de veiculação na ${v.nome}, com presença diária na programação da emissora${cid ? ' em ' + cid : ''}. O pacote reúne ${t.ins} inserções${seg ? ` de ${seg[1]}"` : ''} por mês, ${dist}, garantindo lembrança de marca contínua ao longo do mês.`; };

  // ---------- ações ----------
  const daLista = d => achar(d.id) || (ed.id ? achar(ed.id) : null);
  const atualEd = () => (S.route().view === 'propostas' && ed.id ? ed.p : null);
  const comItem = fn => { const p = atualEd(); if (!p || !editavel(achar(p.id))) return; fn(p); sujar(); S.render(); };
  Object.assign(S.actions, {
    prFiltro: d => { S.ui.propFiltro = d.f; S.render(); },
    prNova: () => {
      const v = S.veh(), cls = clientesParaEscolher(null);
      if (!cls.length) return S.toast(S.pode('consultor') ? 'Você ainda não tem clientes nesta rádio. Cadastre em Clientes.' : 'Cadastre o cliente antes, em Clientes.');
      S.form(`Nova proposta · ${esc(v.nome)}`, [
        { k:'cliente_id', label:'Cliente', type:'select', req:true, full:true, options:[['', 'Escolha o cliente'], ...cls.map(c => [c.id, c.nome])] },
        { k:'agencia_id', label:'Negociação', type:'select', full:true, options:[['', 'Direto com o cliente'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        { html:`<p class="muted small" style="grid-column:1/-1">A proposta sai com a marca da ${esc(empCurto())}, validade de ${v.prop_validade || 15} dias e as condições padrão da ${esc(v.nome)}. Os itens você escolhe da tabela vigente.</p>` }], {},
        f => S.run(async () => { const cli = S.pessoa(f.cliente_id), val = Number(v.prop_validade) || 15, vig = S.tabelaVigente();
          const r = await S.salvar('propostas', { veiculo_id:v.id, cliente_id:f.cliente_id, agencia_id:f.agencia_id || (cli && cli.agencia_id) || null, validade:val, data:today(),
            consultor_id:S.pode('consultor') ? S.me.id : (cli && cli.consultor_id) || S.me.id, tabela_id:vig ? vig.id : null,
            condicoes:String(v.prop_condicoes || S.PROP_CONDICOES_PADRAO).replace(/\{VALIDADE\}/g, val), texto:'', itens:[] });
          abrir(r); location.hash = '/propostas/' + r.id; }, 'Proposta criada'), 'Criar proposta');
      // O cliente atendido por agência já vem com ela
      const sel = document.querySelector('#dlg [name="cliente_id"]'), ags = document.querySelector('#dlg [name="agencia_id"]');
      sel.addEventListener('change', () => { const c = S.pessoa(sel.value); if (c) ags.value = c.agencia_id || ''; });
    },
    prSalvar: () => { if (!ed.p.cliente_id) return S.toast('Escolha o cliente.'); S.run(gravar, 'Proposta salva'); },
    prDescartar: async () => { if (!await S.confirmar('Descartar as alterações?\n\nA proposta volta a ficar como estava quando foi salva.', { ok:'Descartar', voltar:'Continuar editando', perigo:true })) return;
      abrir(achar(ed.id)); S.render(); },
    prEnviar: d => { const p = ed.id === d.id ? ed.p : achar(d.id), probs = problemas(p);
      if (probs.length) return S.toast('Antes de enviar: ' + probs[0] + '.');
      enviarDlg(p); },
    prIrPis: () => S.go('/pis'),
    prCopiarLink: d => { const p = achar(d.id); if (!p.link_token) return;
      navigator.clipboard.writeText(linkDe(p.link_token)).then(() => S.toast('Link da proposta copiado'), () => S.toast('Não foi possível copiar o link.')); },
    prAprovar: async d => { const p = daLista(d);
      if (!await S.confirmar(`O cliente aprovou a proposta ${S.propNo(p)}?\n\n${S.nome(p.cliente_id)} · ${brl(p.valor_total)} por mês. O PI é gerado depois, na tela de PIs.`, { ok:'Marcar aprovada' })) return;
      situacao(p, 'aprovada', '', `Proposta ${S.propNo(p)} aprovada. Gere o PI na tela de PIs.`); },
    prRecusar: d => { const p = daLista(d);
      S.form(`Proposta ${S.propNo(p)} recusada`, [{ k:'motivo', label:'Motivo (opcional)', type:'textarea', ph:'Ex.: achou o investimento alto; vai fechar em janeiro' }], {},
        f => situacao(p, 'recusada', (f.motivo || '').trim(), `Proposta ${S.propNo(p)} marcada como recusada`), 'Marcar recusada', { editar:true }); },
    prRascunho: async d => { const p = daLista(d);
      if (!await S.confirmar(`Voltar a proposta ${S.propNo(p)} para rascunho?\n\nEla volta a poder ser editada. Depois é só enviar de novo: o cliente usa o mesmo link.`, { ok:'Voltar para rascunho' })) return;
      situacao(p, 'rascunho', '', 'Proposta em rascunho'); },
    prExcluir: async d => { const p = daLista(d);
      if (!await S.confirmar(`Excluir a proposta ${S.propNo(p)} (${S.nome(p.cliente_id)})? Não dá para desfazer.`, { ok:'Excluir proposta', perigo:true })) return;
      S.run(async () => { if (ed.id === p.id) fechar(); await S.excluir('propostas', p.id); if (S.route().view === 'propostas' && S.route().id) location.hash = '/propostas'; }, 'Proposta excluída'); },
    prDuplicar: d => { const p = daLista(d), v = S.veh();
      S.run(async () => { const r = await S.salvar('propostas', { veiculo_id:v.id, cliente_id:p.cliente_id, agencia_id:p.agencia_id, validade:p.validade, data:today(), consultor_id:p.consultor_id,
        tabela_id:p.tabela_id, condicoes:p.condicoes, texto:p.texto, itens:p.itens, insercoes:p.insercoes, valor_tabela:p.valor_tabela, valor_total:p.valor_total });
        abrir(r); location.hash = '/propostas/' + r.id; }, 'Proposta duplicada'); },
    prVer: d => { const p = ed.id === d.id && ed.p ? ed.p : achar(d.id); if (!p.cliente_id) return S.toast('Escolha o cliente antes.'); visualizar(p, d.id); },
    prPdf: d => { const p = ed.id === d.id && ed.p ? ed.p : achar(d.id); if (!p.cliente_id) return S.toast('Escolha o cliente antes.'); baixarPdf(p); },
    prGerar: d => { const p = daLista(d); if (p.pi_id) return S.go('/pi/' + p.pi_id); gerarDlg(p); },
    prAbrirPi: d => { const p = daLista(d); if (!p.pi_id || !piDe(p)) return S.toast('O PI desta proposta não está nesta lista.'); S.ui.tab = 'detalhes'; S.go('/pi/' + p.pi_id); },
    prOpcoes: (d, botao) => { const p = achar(d.id), s = sitDe(p), dentro = S.route().id === p.id, id = { id:p.id }, it = [];
      if (!dentro) it.push({ label:'Abrir', icon:'abrir', act:'prAbrir', data:id });
      if (!dentro) it.push({ label:'Visualizar', icon:'olho', act:'prVer', data:id });
      it.push({ label:'Baixar PDF', icon:'baixar', act:'prPdf', data:id });
      if (pode(p)) {
        it.push({ label:'Duplicar', icon:'copia', act:'prDuplicar', data:id });
        if (s === 'rascunho' && !dentro) it.push({ label:'Enviar ao cliente', icon:'seta', act:'prEnviar', data:id });
        if ((s === 'enviada' || s === 'vencida') && !dentro) it.push({ label:'Reenviar', icon:'whats', act:'prEnviar', data:id });
        if (p.link_token && ['enviada', 'vencida', 'aprovada', 'pi'].includes(s)) it.push({ label:'Copiar link da proposta', icon:'copia', act:'prCopiarLink', data:id });
        if (s === 'enviada' || s === 'vencida') it.push({ label:'Marcar recusada', icon:'bloqueio', act:'prRecusar', data:id });
        if (['enviada', 'vencida', 'recusada'].includes(s) || (s === 'aprovada' && !p.pi_id)) it.push({ label:'Voltar para rascunho', icon:'voltar', act:'prRascunho', data:id });
        if (s === 'rascunho') it.push('-', { label:'Excluir', icon:'lixo', act:'prExcluir', data:id, perigo:true });
      }
      S.menu(botao, it); },
    prAbrir: d => S.go('/propostas/' + d.id),
    prSugerir: async () => { const p = atualEd(); if (!p) return; if (!(p.itens || []).some(it => it.insercoes)) return S.toast('Coloque os itens e as inserções antes: o texto sai deles.');
      if (String(p.texto || '').trim() && !await S.confirmar('Trocar o texto de apresentação pelo sugerido?', { ok:'Trocar texto' })) return;
      p.texto = sugerir(p); sujar(); S.render(); const ta = document.querySelector('#content [data-pf="texto"]'); if (ta) ta.focus(); },
    prDia: d => { comItem(p => { const it = p.itens[+d.i], k = +d.d; it.dias = (it.dias || []).includes(k) ? it.dias.filter(x => x !== k) : [...(it.dias || []), k]; });
      const b = document.querySelector(`#content [data-act="prDia"][data-i="${d.i}"][data-d="${d.d}"]`); if (b) b.focus(); },
    prRmItem: d => comItem(p => { p.itens.splice(+d.i, 1); }),
    // Escolher da tabela vigente: programa (por seção) × formato, com o preço dela
    prAddItem: () => { const p = atualEd(); if (!p) return; const vig = S.tabelaVigente(), v = S.veh();
      if (!vig) return S.toast('Não há tabela de preços vigente nesta rádio. Publique uma em Tabela de preços.');
      const prods = tipo => S.db.produtos.filter(x => x.tipo === tipo && x.ativo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
      const secoes = [['rotativo', 'Rotativo'], ['programa', 'Programas'], ['quadro', 'Quadros']];
      const progs = prods('programa').filter(x => prods('formato').some(f => S.precoNaTabela(vig.id, x.id, f.id)));
      const ops = secoes.map(([k, n]) => { const l = progs.filter(x => (x.secao || 'programa') === k); return l.length ? `<optgroup label="${n}">${l.map(x => `<option value="${x.id}">${esc(x.nome)}${x.detalhe ? ' · ' + esc(x.detalhe.split('\n')[0]) : ''}</option>`).join('')}</optgroup>` : ''; }).join('');
      S.dialog(`<h2>Adicionar da tabela</h2><p class="muted small" style="margin-top:-6px">${esc(vig.nome)} · vigente desde ${dfmt(vig.inicio)}</p>
        <div class="g2"><label class="f" style="grid-column:1/-1">Programação<select name="prog" required><option value="">Escolha</option>${ops}</select></label>
          <label class="f" style="grid-column:1/-1">Formato<select name="fmt" required disabled><option value="">Escolha a programação antes</option></select></label>
          <div id="prPrecoIt" class="caixa" style="grid-column:1/-1" hidden></div></div>
        <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Adicionar</button></div>`,
        f => { const pr = S.db.produtos.find(x => x.id === f.prog), fm = S.db.produtos.find(x => x.id === f.fmt), pc = pr && fm && S.precoNaTabela(vig.id, pr.id, fm.id); if (!pc) return;
          const novo = S.itemDaTabela(pr, fm, pc.preco, v); comItem(pp => { pp.itens.push(novo); pp.tabela_id = vig.id; });
          setTimeout(() => { const el = document.querySelector(`#content [data-pf="insercoes"][data-i="${ed.p.itens.length - 1}"]`); if (el) el.focus(); }, 80); });
      const fp = document.querySelector('#dlg [name="prog"]'), ff = document.querySelector('#dlg [name="fmt"]'), box = document.getElementById('prPrecoIt');
      const mostrarPreco = () => { const pc = S.precoNaTabela(vig.id, fp.value, ff.value), pr = S.db.produtos.find(x => x.id === fp.value);
        box.hidden = !pc; if (!pc) return; const it = S.itemDaTabela(pr, S.db.produtos.find(x => x.id === ff.value), pc.preco, v);
        box.innerHTML = `<b>${brl(pc.preco)}</b> por inserção na tabela · ${S.diasTexto(it.dias)}${it.faixa ? ' · ' + esc(it.faixa) : ''}<br><small class="muted">Dias e faixa você ajusta depois, no item.</small>`; };
      fp.addEventListener('change', () => { const fs = prods('formato').filter(f => S.precoNaTabela(vig.id, fp.value, f.id));
        ff.innerHTML = fs.length ? fs.map(f => `<option value="${f.id}">${esc(f.nome)} · ${brl(S.precoNaTabela(vig.id, fp.value, f.id).preco)}</option>`).join('') : '<option value="">Sem preço para esta programação</option>';
        ff.disabled = !fs.length; mostrarPreco(); });
      ff.addEventListener('change', mostrarPreco); },
  });
})();

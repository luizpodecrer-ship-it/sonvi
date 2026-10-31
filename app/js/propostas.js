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
  const sitDe = p => p.situacao === 'aprovada' && S.propostaComPi(p) ? 'pi' : vencida(p) ? 'vencida' : p.situacao;
  // Diretor e gerente mexem em todas; o consultor, só nas dele (o banco confere de novo)
  const pode = p => S.pode('diretor', 'gerente') || (S.pode('consultor') && p.consultor_id === S.me.id);
  const editavel = p => p.situacao === 'rascunho' && pode(p);
  const emp = () => S.db.empresa || { nome:'Empresa comercial' };
  const empLogo = () => emp().logo || S.logoReserva();
  const empCurto = () => String(emp().nome || 'Empresa comercial').split('·')[0].trim();
  const empImg = (cls = '') => `<img class="${cls}" src="${esc(empLogo())}" width="600" height="122" alt="${esc(empCurto())}">`;
  const curtoData = iso => iso ? String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
  const cidadeDe = txt => String(txt || '').split('/')[0].trim();
  const piDe = p => p.pi_id && S.db.pis.find(x => x.id === p.pi_id);
  const assinante = p => emp().assina === 'consultor' || !emp().responsavel
    ? { nome:S.usuario(p.consultor_id) || emp().responsavel || '', cargo:`Consultor(a) · ${empCurto()}` }
    : { nome:emp().responsavel, cargo:[emp().cargo, empCurto()].filter(Boolean).join(' · ') };
  // "Spot 30" · Rotativo seg. a sáb." (o que a proposta vende, numa linha)
  const ehDig = it => it.secao === 'digital';
  const resumoItem = it => ehDig(it) ? (it.entregas ? `${S.acaoTitulo(it)} (${S.acaoEntregasTxt(it)})` : `${it.formato} · ${it.programa}`) : `${it.formato} · ${it.programa}${(it.dias || []).length < 7 ? ' ' + S.diasTexto(it.dias) : ''}`;
  // Quantidade por mês na lista: inserções da rádio e, se houver, as publicações digitais
  const qtdMes = p => Number(p.publicacoes) ? `${p.insercoes ? p.insercoes + ' + ' : ''}${p.publicacoes} pub.` : (p.insercoes || 0);
  const resumo = p => { const its = (p.itens || []).filter(it => it.insercoes); if (!its.length) return (p.itens || []).length ? resumoItem(p.itens[0]) : 'Sem itens';
    return resumoItem(its[0]) + (its.length > 1 ? ` + ${its.length - 1} ${its.length > 2 ? 'itens' : 'item'}` : ''); };

  // ---------- lista (aprovada em 24/10/2026): mês, funil, situações que filtram, lista com o caminho de cada proposta ----------
  // Tudo nos tons da cor do veículo (--t-forte, --t-claro, --t-escuro), como o Financeiro. Estilos .pf-* e os .fn-* compartilhados.
  const pf = { mes:'', sit:'' };   // mes '' = o mês de hoje; sit: rascunho, enviada, aprovada, perdida
  let viraMes = 0, funilAntes = null;
  const dataDe = p => p.data || S.dia(p.criado_em);
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = ym => { const n = MESES[+ym.slice(5) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${ym.slice(0, 4)}`; };
  const grupoDe = p => { const s = sitDe(p); return s === 'pi' ? 'aprovada' : ['recusada', 'vencida'].includes(s) ? 'perdida' : s; };
  const PSITS = [['rascunho', 'Rascunho', 't-claro'], ['enviada', 'Enviada', 't-medio'], ['aprovada', 'Aprovada', 't-forte'], ['perdida', 'Não fechou', 't-escuro']];
  const valorDe = p => Number(p.valor_total || 0);
  const somaV = l => l.reduce((s, p) => s + valorDe(p), 0);
  const curtoR = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  // O caminho em 4 pontos: rascunho → enviada → aprovada → PI (recusada/vencida param no 2º, no tom escuro)
  const trilha = p => { const s = sitDe(p), n = { rascunho:0, enviada:1, vencida:1, recusada:1, aprovada:2, pi:3 }[s], parou = ['vencida', 'recusada'].includes(s);
    return `<span class="pf-trilha" role="img" aria-label="Caminho: ${['rascunho', 'enviada', 'aprovada', 'PI gerado'][n]}${parou ? ` (${s})` : ''}">${[0, 1, 2, 3].map(i => `${i ? `<s class="${i <= n && !parou ? 'ok' : ''}"></s>` : ''}<i class="${i < n ? 'ok' : i === n ? (parou ? 'parou' : 'agora') : ''}"></i>`).join('')}</span>`; };
  const etiqueta = p => { const s = sitDe(p);
    return s === 'pi' ? '<span class="pill fn-ok">PI gerado</span>' : s === 'aprovada' ? '<span class="pill fn-ok">Aprovada</span>' : s === 'enviada' ? '<span class="pill fn-ok pf-vivo">Aguardando</span>'
      : s === 'rascunho' ? '<span class="pill fn-neutra">Rascunho</span>' : `<span class="pill fn-forte">${s === 'vencida' ? 'Vencida' : 'Recusada'}</span>`; };
  // Etiqueta de situação (também no editor): nos tons do veículo
  const pill = p => etiqueta(p);
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
    const hoje = today(), ym = pf.mes || hoje.slice(0, 7), mesN = MESES[+ym.slice(5) - 1], todas = lista();
    const doMes = todas.filter(p => (dataDe(p) || '').slice(0, 7) === ym);
    const g = PSITS.map(([k, nome, tom]) => { const it = doMes.filter(p => grupoDe(p) === k); return { k, nome, tom, it, v:somaV(it) }; });
    const tot = somaV(doMes), gs = g.find(x => x.k === pf.sit);
    // Indicadores: taxa do mês; o que vence logo e o que foi aprovado sem PI valem para todas (não só o mês)
    const resp = doMes.filter(p => ['aprovada', 'recusada'].includes(p.situacao)), taxa = resp.length ? Math.round(doMes.filter(p => p.situacao === 'aprovada').length / resp.length * 100) : null;
    const em7 = todas.filter(p => sitDe(p) === 'enviada' && S.propVence(p) <= S.somaDias(hoje, 7)), semPi = todas.filter(p => sitDe(p) === 'aprovada');
    // Funil: cada degrau conta quem chegou até ele; quem não fechou sai pelo lado
    const chegou = [['criadas', doMes, 'criada', 'criadas', 't-claro', ''], ['enviadas', doMes.filter(p => p.situacao !== 'rascunho'), 'enviada', 'enviadas', 't-medio', 'enviada'],
      ['aprovadas', doMes.filter(p => p.situacao === 'aprovada'), 'aprovada', 'aprovadas', 't-forte', 'aprovada'], ['pi', doMes.filter(p => sitDe(p) === 'pi'), 'virou PI', 'viraram PI', 't-escuro', 'aprovada']];
    const nMax = Math.max(1, doMes.length), perdidas = g[3];
    const funil = `<div class="pf-funil${pf.sit ? ' filtra' : ''}" role="group" aria-label="Funil das propostas de ${mesN}">
      <div class="pf-tot"><small>${gs ? gs.nome : `Propostas criadas em ${mesN}`}</small><span class="pf-num">${S.roloFixo('pfTotal', curtoR(gs ? gs.v : tot))}</span><small>${(gs ? gs.it : doMes).length} proposta${(gs ? gs.it : doMes).length === 1 ? '' : 's'} · valor por mês</small></div>
      ${chegou.map(([k, xs, um, varios, tom, sit], i) => { const ant = i ? chegou[i - 1][1].length : 0, w = Math.max(14, xs.length / nMax * 100);
        return `${i ? `<div class="pf-conv" aria-hidden="true"><span>↓ ${ant ? Math.round(xs.length / ant * 100) : 0}%</span></div>` : ''}<button type="button" class="pf-lin" data-act="prSit" data-v="${sit}" aria-pressed="${!!sit && pf.sit === sit && k !== 'pi'}" style="--c:var(--${tom})">
          <span class="pf-trilho"><span class="pf-barra" style="--w:${w}%"></span></span><span class="pf-txt"><b>${xs.length} ${xs.length === 1 ? um : varios}</b><small>${curtoR(somaV(xs))}</small></span></button>`; }).join('')}
      <button type="button" class="pf-vaza" data-act="prSit" data-v="perdida" aria-pressed="${pf.sit === 'perdida'}"><i></i><span><b>${perdidas.it.length} não ${perdidas.it.length === 1 ? 'fechou' : 'fecharam'}</b> · ${curtoR(perdidas.v)} (recusadas ou vencidas)</span></button></div>`;
    const sits = g.map(x => { const pc = tot ? Math.round(x.v / tot * 100) : 0;
      return `<button type="button" class="fn-sit" data-act="prSit" data-v="${x.k}" style="--c:var(--${x.tom})" aria-pressed="${pf.sit === x.k}"><span class="fn-sit-t"><i aria-hidden="true"></i>${x.nome}<small>${x.it.length}</small></span><b>${curtoR(x.v)}</b><span class="fn-sit-bar" aria-hidden="true"><span style="width:${pc}%"></span></span><span class="fn-sit-p">${pc}% do mês</span></button>`; }).join('');
    const resumo_ = `${taxa === null ? '' : `<span class="pill fn-neutra">Taxa de aprovação ${taxa}%</span>`}${em7.length ? `<span class="pill fn-forte">${em7.length} vence${em7.length > 1 ? 'm' : ''} em 7 dias</span>` : ''}${semPi.length ? `<span class="pill fn-ok">${semPi.length} aprovada${semPi.length > 1 ? 's' : ''} sem PI</span>` : ''}`;
    const mesCard = `<section class="card fn-mes-card" aria-labelledby="pf-t"><div class="hd"><h2 id="pf-t">Propostas do mês</h2><span class="grow"></span>
      <div class="fn-nav" role="group" aria-label="Mês"><button class="btn sm ic" data-act="prMes" data-d="-1" aria-label="Mês anterior" title="Mês anterior (←)">${S.svg('esq')}</button>
        <span class="fn-mes-et" role="status" aria-live="polite"><span>${nomeMes(ym)}</span></span>
        <button class="btn sm ic" data-act="prMes" data-d="1" aria-label="Próximo mês" title="Próximo mês (→)">${S.svg('seta')}</button>${ym !== hoje.slice(0, 7) ? '<button class="btn sm" data-act="prMes" data-d="0">Hoje</button>' : ''}</div></div>
      <div class="pf-corpo">${funil}<div class="fn-dir"><div class="fn-sits pf-sits" role="group" aria-label="Situação (escolha para filtrar)">${sits}</div><div class="fn-resumo">${resumo_}</div></div></div></section>`;
    // Lista do mês
    const q = (S.ui.q || '').toLowerCase();
    const vis = (gs ? gs.it : doMes).filter(p => !q || [S.propNo(p), S.nome(p.cliente_id), S.nome(p.agencia_id), resumo(p), S.usuario(p.consultor_id)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.ano - a.ano || b.numero - a.numero);
    const linhas = vis.map(p => { const cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id);
      return `<div class="prl-l click" data-go="/propostas/${p.id}" data-flip="${p.id}" role="link" tabindex="0">
        <span class="prl-n">${S.propNo(p)}</span>
        <span class="prl-c"><b title="${esc(cli)}">${esc(cli)}</b><small>${[ag ? esc(ag) : 'Direto', esc(S.usuario(p.consultor_id) || '')].filter(Boolean).join(' · ')}</small></span>
        <span class="prl-i" title="${esc(resumo(p))}">${esc(resumo(p))}</span>
        <span class="prl-q">${trilha(p)}</span>
        <span class="prl-v"><small>Investimento mensal</small><b>${brl(p.valor_total)}</b></span>
        <span class="prl-s">${etiqueta(p)}<small>${detalheSit(p)}</small></span>
        <span class="prl-a">${proximo(p)}<button class="btn tres" data-act="prOpcoes" data-id="${p.id}" aria-label="Opções da proposta ${S.propNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
    const vazio = `<div class="empty"><b>${todas.length ? 'Nenhuma proposta aqui' : 'Nenhuma proposta ainda'}</b>${q ? `Nada com essa busca em ${mesN}.` : gs ? `Nenhuma proposta nesta situação em ${mesN}.` : todas.length ? `Nenhuma proposta criada em ${mesN}.` : `As propostas saem com a marca da ${esc(empCurto())} e os preços dos Produtos.`}</div>`;
    const listaCard = `<section class="card prl" aria-labelledby="pf-tl"><div class="hd fn-par-hd"><h2 id="pf-tl">Propostas de ${mesN}</h2><span>${vis.length} · ${brl(somaV(vis))} por mês</span></div>
      <div class="fn-filtros">${gs ? `<button class="fn-chip" data-act="prSit" data-v="${gs.k}" style="--c:var(--${gs.tom})" aria-label="Tirar o filtro ${gs.nome}"><i aria-hidden="true"></i>${gs.nome}${S.svg('fechar', 14)}</button>` : ''}
        <label class="fin-busca">${S.svg('busca')}<input value="${esc(S.ui.q)}" data-ui="q" placeholder="Buscar por número, cliente, agência, consultor ou item" aria-label="Buscar propostas"></label></div>
      ${vis.length ? `<div class="prl-l prl-cab"><span class="prl-n">Nº</span><span class="prl-c">Cliente</span><span class="prl-i">Itens</span><span class="prl-q">Caminho</span><span class="prl-v">Investimento mensal</span><span class="prl-s">Situação</span><span class="prl-a"><span class="sr">Ações</span></span></div>${linhas}` : vazio}
      <p class="fn-dica"><kbd>←</kbd> <kbd>→</kbd> trocam o mês · <kbd>1</kbd>–<kbd>4</kbd> filtram pela situação · <kbd>Esc</kbd> tira o filtro</p></section>`;
    queueMicrotask(animaFunil);
    const podeCriar = S.pode('diretor', 'gerente', 'consultor');
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Propostas`,
      actions:podeCriar ? `<button class="btn pri" data-act="prNova">${S.svg('mais')}Nova proposta</button>` : '',
      body:mesCard + listaCard };
  };
  // As barras do funil crescem do zero na entrada e, depois, vão da largura anterior até a nova (mola); o mês desliza
  function animaFunil() {
    const bs = [...document.querySelectorAll('.pf-barra')], agora = bs.map(b => b.style.getPropertyValue('--w')), quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!bs.length) return;
    if (!quieto) bs.forEach((b, i) => { const de = funilAntes ? funilAntes[i] : '0%'; if (b.animate && de && de !== agora[i]) b.animate([{ width:de }, { width:agora[i] }], { duration:900, delay:funilAntes ? 0 : 150 + i * 110, easing:'cubic-bezier(.34,1.3,.5,1)', fill:'backwards' }); });
    funilAntes = agora;
    const d = viraMes, cx = document.querySelector('.fn-mes-card .fn-mes-et'); viraMes = 0;
    if (d && cx && !quieto && cx.firstElementChild.animate) cx.firstElementChild.animate([{ transform:`translateX(${d * 36}px)`, opacity:0 }, { transform:'none', opacity:1 }], { duration:380, easing:'cubic-bezier(.2,.9,.2,1)' });
  }
  // Ao sair da lista, o funil volta a crescer do zero na próxima entrada
  window.addEventListener('hashchange', () => { if (!/^#\/propostas\/?$/.test(location.hash)) funilAntes = null; });
  // Atalhos da lista: ← → mês, 1–4 situação, Esc tira o filtro
  document.addEventListener('keydown', e => {
    if (S.ui.view !== 'propostas' || S.route().id || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open], .menu, .sv-painel:not([hidden]), :popover-open')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.actions.prMes({ d:e.key === 'ArrowLeft' ? -1 : 1 }); }
    else if (/^[1-4]$/.test(e.key)) { e.preventDefault(); S.actions.prSit({ v:PSITS[+e.key - 1][0] }); }
    else if (e.key === 'Escape' && pf.sit) { e.preventDefault(); S.actions.prSit({ v:pf.sit }); }
  });

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

  // Só rádio: investimento mensal; com ação digital (única), o total do 1º mês; só digital: investimento
  const invRot = t => t.digital || t.producao ? (t.ins ? 'Investimento (1º mês)' : 'Investimento') : 'Investimento mensal';
  const qtdTxt = t => [t.ins && `${t.ins} ${t.ins === 1 ? 'inserção' : 'inserções'}`, t.pub && `${t.pub} ${t.pub === 1 ? 'entrega digital' : 'entregas digitais'}`].filter(Boolean).join(' + ') || '0 inserções';
  const resumoHtml = (p, v) => { const t = S.propTotais(p), its = (p.itens || []).filter(it => it.insercoes), um = its.length === 1 ? its[0] : null, as = assinante(p);
    const partes = t.digital && t.ins ? `<div class="pr-lin"><span>Rádio<small>${t.ins} ${t.ins === 1 ? 'inserção' : 'inserções'} por mês</small></span><b>${brl(t.radio)}</b></div><div class="pr-lin"><span>Ação digital<small>única · ${t.pub} ${t.pub === 1 ? 'entrega' : 'entregas'}</small></span><b>${brl(t.digital)}</b></div>` : '';
    return `<h2 class="pr-rot">${t.digital ? 'Resumo' : 'Resumo mensal'}</h2>${partes}
      <div class="pr-lin"><span>Valor de tabela${um ? `<small>${um.insercoes} × ${brl(um.preco_tabela)}</small>` : `<small>${qtdTxt(t)}</small>`}</span><b>${brl(t.tabela)}</b></div>
      <div class="pr-lin"><span>Desconto negociado<small>${t.tabela ? nfmt(t.pct).replace(/,?0+$/, '') || '0' : '0'}% sobre a tabela</small></span><b>${t.desconto > 0.004 ? '− ' : ''}${brl(Math.abs(t.desconto))}</b></div>
      <div class="pr-lin pr-inv"><span>${invRot(t)}</span><b>${brl(t.total)}</b></div>
      ${t.producao ? `<div class="pr-lin"><span>Produção<small>cobrada uma vez, no 1º mês</small></span><b>${brl(t.producao)}</b></div><div class="pr-lin"><span>Nos meses seguintes</span><b>${brl(t.total - t.producao)}</b></div>` : ''}
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
    const linhaRadio = (it, i) => `<div class="pr-it">
        <span class="pr-id"><b>${esc(it.formato)} · ${esc(it.programa)}</b><small class="muted">${em ? `<label>Faixa <input class="pr-faixa" data-pf="faixa" data-i="${i}" value="${esc(it.faixa)}" placeholder="07h às 19h" aria-label="Faixa horária de ${esc(it.programa)}"></label>` : `Faixa: <b>${esc(it.faixa) || '—'}</b>`}</small></span>
        <span class="pr-dd"><small class="pr-k">Dias</small>${dias(it, i)}</span>
        ${parseInt(it.por_dia) > 0 ? `<label class="pr-q"><small class="pr-k">Por dia</small>${em && !(it.ooh || {}).unidades ? `<input data-pf="por_dia" data-i="${i}" data-mask="int" inputmode="numeric" value="${it.por_dia || ''}" placeholder="0" aria-label="Inserções por dia de ${esc(it.programa)}">` : `<b>${it.por_dia}</b>`}</label>`
          : it.mensal || it.unica ? `<span class="pr-q"><small class="pr-k">${it.unica ? 'Uma vez' : 'Por mês'}</small><b>${it.insercoes}</b></span>` : `<label class="pr-q"><small class="pr-k">Inserções/mês</small>${em ? `<input data-pf="insercoes" data-i="${i}" data-mask="int" inputmode="numeric" value="${it.insercoes || ''}" placeholder="0" aria-label="Inserções por mês de ${esc(it.programa)}">` : `<b>${it.insercoes}</b>`}</label>`}
        <span class="pr-tb"><small class="pr-k">Tabela</small><span class="muted">${it.preco_tabela ? brl(it.preco_tabela) : 'sem preço'}</span></span>
        <label class="pr-ng"><small class="pr-k">Negociado</small>${em ? `<input data-pf="preco" data-i="${i}" data-mask="dec" inputmode="decimal" value="${nfmt(r2(it.preco))}" placeholder="0,00" aria-label="Valor unitário negociado de ${esc(it.programa)}">` : `<span>${brl(it.preco)}</span>`}</label>
        <label class="pr-tt"><small class="pr-k">Total mensal</small>${em ? `<input data-pf="total" data-i="${i}" data-mask="dec" inputmode="decimal" value="${nfmt(it.total)}" placeholder="0,00" aria-label="Total mensal de ${esc(it.programa)}">` : `<b>${brl(it.total)}</b>`}</label>
        <span class="pr-x">${em ? `<button type="button" class="x" data-act="prRmItem" data-i="${i}" aria-label="Remover ${esc(it.formato)} · ${esc(it.programa)}" title="Remover item">×</button>` : ''}</span></div>`;
    const comI = p.itens.map((it, i) => ({ it, i })), rad = comI.filter(x => !ehDig(x.it) && !x.it.combo), dgs = comI.filter(x => ehDig(x.it));
    const grupos = [...new Set(comI.filter(x => x.it.combo).map(x => x.it.combo.grupo))].map(g => comI.filter(x => x.it.combo && x.it.combo.grupo === g).map(x => x.it));
    const nomeVeic = it => (S.veh(it.veiculo_id || p.veiculo_id) || {}).nome || '';
    const comboCard = its => { const c = its[0].combo, tab = r2(its.reduce((a, x) => a + (parseInt(x.insercoes) || 0) * (Number(x.preco_tabela) || 0), 0));
      return `<section class="card pr-combo"><div class="hd"><h2>${esc(c.nome)} ${S.tag('Combo', 'blue')}</h2>${em ? `<button class="btn sm" data-act="prRmCombo" data-g="${esc(c.grupo)}">Tirar combo</button>` : ''}</div>
        <div class="scroll"><table><thead><tr><th>Veículo</th><th>Produto</th><th>Variação</th><th class="r">Quantidade</th><th class="r">Tabela</th></tr></thead><tbody>${its.map(x => `<tr><td class="nw">${esc(nomeVeic(x))}</td><td>${esc(x.programa)}</td><td>${esc(x.formato)}</td><td class="r nw">${esc(S.qtdItem(x))}</td><td class="r nw">${brl((parseInt(x.insercoes) || 0) * (Number(x.preco_tabela) || 0))}</td></tr>`).join('')}</tbody></table></div>
        <div class="row mid pr-combo-tot"><span class="muted small grow">tabela ${brl(tab)}${tab > c.preco ? ` · desconto ${nfmt((1 - c.preco / tab) * 100).replace(/,?0+$/, '')}%` : ''} · ao aprovar, um PI por veículo</span><b>${brl(c.preco)}</b></div></section>`; };
    const temDigital = S.db.produtos.some(x => x.tipo === 'programa' && S.ehDigital(x) && x.ativo) || dgs.length;
    const avisoCanal = S.pode('diretor', 'gerente') ? 'Cadastre o canal da rádio em <b>Produtos → Digital</b>.' : '';
    const itensCard = `<section class="card"><div class="hd"><h2>${temDigital ? 'Rádio' : 'Itens'}</h2>${em ? `<span class="row mid pr-add">${S.cotasAtivas && S.cotasAtivas().length ? `<button class="btn" data-act="prAddCota">${S.svg('mais')}Patrocínio</button>` : ''}${S.db.combos && S.combosAtivos().length ? `<button class="btn" data-act="prAddCombo">${S.svg('mais')}Combo</button>` : ''}<button class="btn" data-act="prAddProd">${S.svg('mais')}Produto</button></span>` : ''}</div>
      ${rad.length ? `<div class="pr-its"><div class="pr-it pr-cab" aria-hidden="true"><span>Formato · programação</span><span>Dias</span><span class="r">Inserções/mês</span><span class="r">Tabela</span><span class="r">Negociado</span><span class="r">Total mensal</span><span></span></div>${rad.map(x => linhaRadio(x.it, x.i)).join('')}</div>`
        : `<p class="muted" style="margin:4px 0 0">${em ? `Nenhum item de rádio${dgs.length ? '' : ' ainda'}. Clique em <b>Produto</b> para escolher o produto e a duração${S.cotasAtivas && S.cotasAtivas().length ? ', ou em <b>Patrocínio</b> para uma cota' : ''}.` : 'Nenhum item de rádio.'}</p>`}
      ${em && rad.length ? '<p class="muted small" style="margin-top:14px">O preço vem de Produtos e fica guardado na proposta. Dá para negociar pelo valor unitário ou pelo total do mês: um ajusta o outro.</p>' : ''}</section>
      <section class="card pr-digital"><div class="hd"><h2>Digital <span class="muted small" style="font:500 13px var(--font)">· ações nas redes da rádio</span></h2>${em && temDigital ? `<button class="btn" data-act="prAcao" data-op="nova">${S.svg('mais')}Ação digital</button>` : ''}</div>
        ${dgs.length ? `<div class="ad-ls">${dgs.map(x => S.acaoHtml(x.it, em ? { act:'prAcao', data:`data-i="${x.i}"` } : null)).join('')}</div>`
          : `<p class="muted" style="margin:4px 0 0">${!temDigital ? (em ? `Nenhum canal digital cadastrado. ${avisoCanal}` : 'Sem ação digital.') : em ? 'Reels, Stories, Feed, Live… nos canais da rádio, por um valor só. Clique em <b>Ação digital</b>.' : 'Sem ação digital.'}</p>`}</section>`;
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
      body:`${aviso}<div class="pr-corpo"><div class="pr-main">${cliente}${grupos.map(comboCard).join("")}${itensCard}${cond}</div><aside class="card pr-res" id="prResumo" aria-label="Resumo mensal">${resumoHtml(p, v)}</aside></div>` };
  };
  S.views.propostas = id => id ? editor(id) : listaView();

  // Campos do editor: guardam na memória (ed.p) e atualizam só os números, sem redesenhar (o cursor não sai do campo)
  const mostra = (pf, i, valor) => { const el = document.querySelector(`#content [data-pf="${pf}"][data-i="${i}"]`); if (el && el !== document.activeElement) el.value = valor; };
  const aplicar = (el, fim) => {
    const d = el.dataset, p = ed.p, i = d.i !== undefined ? +d.i : null, it = i !== null ? p.itens[i] : null;
    if (it) {
      if (d.pf === 'por_dia') { it.por_dia = parseInt(String(el.value).replace(/\D/g, '')) || 0; it.insercoes = it.por_dia * 30; it.total = r2(it.insercoes * it.preco); mostra('total', i, nfmt(it.total)); }
      else if (d.pf === 'insercoes') { it.insercoes = parseInt(String(el.value).replace(/\D/g, '')) || 0; it.total = r2(it.insercoes * it.preco); mostra('total', i, nfmt(it.total)); }
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
  const limpo = it => it.secao === 'digital' && it.entregas ? { id:it.id, secao:'digital', tipo:'acao', canal_id:it.canal_id, perfil:it.perfil, detalhe:it.detalhe || '', nome:it.nome || '',
    entregas:it.entregas.map(e => ({ nome:e.nome, qtd:parseInt(e.qtd) || 0 })), inicio:it.inicio, fim:it.fim, period:it.period, valor:r2(it.valor), total:r2(it.valor), valor_tabela:r2(it.valor_tabela), pacote:it.pacote || '', pacote_id:it.pacote_id || null, programa:it.perfil, formato:'Ação digital', insercoes:S.acaoQtd(it), dias:[], faixa:'' } : ({ id:it.id, programa_id:it.programa_id, formato_id:it.formato_id, programa:it.programa, formato:it.formato, secao:it.secao, detalhe:it.detalhe,
    dias:S.SEMANA.filter(d => (it.dias || []).includes(d)).sort((a, b) => a - b), faixa:String(it.faixa || '').trim(), insercoes:parseInt(it.insercoes) || 0,
    preco_tabela:Number(it.preco_tabela) || 0, preco:Number(it.preco) || 0, total:r2(it.total), ...Object.fromEntries(['cota', 'combo', 'ooh', 'veiculo_id', 'por_dia', 'mensal', 'unica'].filter(k => it[k]).map(k => [k, it[k]])) });
  const gravar = async () => { const p = ed.p, t = S.propTotais(p);
    const r = await S.salvar('propostas', { id:p.id, cliente_id:p.cliente_id, agencia_id:p.agencia_id || null, data:p.data || today(), validade:parseInt(p.validade) || 15,
      texto:String(p.texto || '').trim(), condicoes:String(p.condicoes || '').trim(), itens:p.itens.map(limpo), insercoes:t.ins, publicacoes:t.pub, valor_tabela:t.tabela, valor_total:t.total, tabela_id:p.tabela_id || null });
    abrir(r); return r; };
  // O que falta para a proposta poder ir ao cliente
  const problemas = p => { const out = [];
    if (!p.cliente_id) out.push('escolha o cliente');
    if (!(p.itens || []).some(it => it.insercoes || (it.entregas && S.acaoQtd(it)))) out.push('coloque ao menos um item de rádio ou uma ação digital');
    if ((p.itens || []).some(it => it.insercoes && !ehDig(it) && !(it.dias || []).length)) out.push('há item sem nenhum dia marcado');
    if ((p.itens || []).some(it => (it.insercoes || it.entregas) && !Number(it.total))) out.push('há item sem valor');
    return out; };
  const situacao = (p, para, motivo, ok) => S.run(async () => {
    const r = await S.q(S.sb.rpc('mudar_situacao_proposta', { p_proposta:p.id, p_situacao:para, p_motivo:motivo || '' })); trocar(r); return r; }, ok);

  const proxMes = () => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`; };
  const mesExt = per => { const [y, m] = per.split('-').map(Number); const t = MESES[m - 1]; return `${t[0].toUpperCase()}${t.slice(1)} de ${y}`; };

  // ---------- gerar o PI da proposta aprovada ----------
  const gerarDlg = p => {
    const v = S.veh(), itens = (p.itens || []).filter(it => !ehDig(it) && parseInt(it.insercoes) > 0), digs = (p.itens || []).filter(it => ehDig(it) && it.entregas && S.acaoQtd(it)), todos = [...itens, ...digs], t = S.propTotais(p);
    if (!todos.length) return S.toast('Esta proposta não tem itens com inserções ou publicações.');
    const proxNo = `PI ${v.sigla} ${String((v.pi_seq || 0) + 1).padStart(4, '0')}`, marca = v.pi_marca === 'comercial' ? 'comercial' : 'radio';
    const vsP = S.veiculosDaProposta(p), multi = vsP.length > 1, falta = vsP.filter(x => !(p.pis_veiculos || {})[x]);
    const faixas = [...new Set(itens.map(it => it.faixa).filter(Boolean))];
    S.dialog(`<h2>Gerar PI da proposta ${S.propNo(p)}</h2>
      <p class="muted small" style="margin-top:-6px">${esc(S.nome(p.cliente_id))} · ${esc(resumo(p))} · ${qtdTxt(t)} por mês</p>
      <div class="pr-ger">
        <label class="f">Início da veiculação<input type="date" name="inicio" value="${proxMes()}" required></label>
        <label class="f">Quantos meses<select name="meses">${Array.from({ length:12 }, (_, k) => `<option value="${k + 1}">${k + 1} ${k ? 'meses' : 'mês'}</option>`).join('')}</select></label>
        <fieldset class="f pr-marca-esc"><legend>PI sai com a marca de</legend><div class="seg radios">
          <label><input type="radio" name="marca" value="comercial"${marca === 'comercial' ? ' checked' : ''}>${esc(empCurto())}</label>
          <label><input type="radio" name="marca" value="radio"${marca === 'radio' ? ' checked' : ''}>${esc(v.nome)}</label></div></fieldset></div>
      ${multi ? `<div class="note info" style="margin:14px 0 0"><b>Um PI por veículo:</b> ${falta.map(x => { const vx = S.veh(x) || {}; return `${esc(vx.nome || '')} (${(p.itens || []).filter(it => (it.veiculo_id || p.veiculo_id) === x && !ehDig(it)).length} itens)`; }).join(' · ')}. Cada um com a sua numeração e a sua OPEC; o cliente é levado para o cadastro do veículo se ainda não estiver lá.</div>` : ''}
      <div id="prDist" aria-live="polite"></div>
      ${digs.length ? `<div class="note info" style="margin:14px 0 0"><b>Digital:</b> ${digs.map(it => `${esc(S.acaoTitulo(it))} (${esc(S.acaoEntregasTxt(it))}, ${S.acaoPeriodo(it)})`).join('; ')} ${digs.length === 1 ? 'entra' : 'entram'} no PI uma vez só, com o período e o valor da proposta. Depois da aprovação, a rádio marca a data de cada publicação.</div>` : ''}
      ${itens.length ? `<div class="note info" style="margin:14px 0 0">No PI, cada dia leva só a <b>quantidade</b>. ${faixas.length ? `A faixa <b>${faixas.map(esc).join('</b>, <b>')}</b> sai escrita no PI, para a OPEC lançar no Pulsar.` : 'Sem faixa horária nos itens: a OPEC lança conforme o programa.'} Depois de gerado, o PI fica em Rascunho e ainda dá para ajustar algum dia antes de mandar para a OPEC.</div>` : ''}
      <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok" id="prGerarOk">${S.svg('pis')}${multi ? `Gerar ${falta.length} ${falta.length === 1 ? 'PI' : 'PIs'}` : 'Gerar ' + proxNo}</button></div>`,
      f => gerar(p, itens, digs, f));
    const dl = document.getElementById('dlg'), antes = dl.onclose; dl.classList.add('medio');
    dl.onclose = e => { dl.classList.remove('medio'); if (antes) antes(e); };
    let ver = 0;
    const desenhar = () => {
      const f = dl.querySelector('form'), ini = f.inicio.value, n = parseInt(f.meses.value) || 1, box = document.getElementById('prDist'), okB = document.getElementById('prGerarOk');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) { box.innerHTML = '<p class="muted" style="margin-top:16px">Escolha a data de início.</p>'; okB.disabled = true; return; }
      if (!itens.length) { okB.disabled = false;
        box.innerHTML = `<p class="muted" style="margin-top:16px">Só ação digital: o início e os meses não mudam nada; vale o período de cada ação.</p>`; return; }
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
        ${r.parcial && ver === 0 ? `<div class="note info" style="margin:0 0 10px">Os meses seguem o calendário: ${mesExt(m.period)} começa no dia ${+r.inicio.slice(8)} e leva a quantidade proporcional aos ${r.parcial.dias} dias que sobram no mês. Para o mês cheio, comece no dia 1.</div>` : ''}
        ${r.semDias.length ? `<div class="note">${r.semDias.map(i => esc(resumoItem(itens[i]))).join(', ')}: nenhum dia permitido no período.</div>` : ''}
        <div class="pr-cal"><span class="pr-ws" aria-hidden="true">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(w => `<small>${w}</small>`).join('')}</span>${'<span class="pr-cd vz" aria-hidden="true"></span>'.repeat(vazio)}${cel.join('')}</div>
        <div class="pr-leg">${leg}${fora}</div>`;
    };
    dl.querySelector('form').addEventListener('input', desenhar);
    dl.querySelector('form').addEventListener('click', e => { const bm = e.target.closest('[data-mes]'); if (bm) { ver = +bm.dataset.mes; desenhar(); const nb = dl.querySelector(`[data-mes="${ver}"]`); if (nb) nb.focus(); } });
    desenhar();
  };
  // Mês de veiculação k (0, 1, …) a partir do início: o digital entra no mês do calendário em que esse período começa
  const mesDe = (inicio, k) => { const [y, m] = inicio.split('-').map(Number), d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  // Monta os dados do PI de um veículo: grade com a distribuição automática e as ações digitais
  const montarPi = (p, itens, digs, f, veic) => {
    const ag = S.pessoa(p.agencia_id), n = parseInt(f.meses) || 1, r = itens.length ? S.distribuir(itens, f.inicio, n) : { meses:[], soma:0 };
    if (itens.length && !r.soma) throw new Error(`A distribuição ficou sem inserções${veic ? ' em ' + veic.nome : ''}: confira os dias dos itens.`);
    const digital = [];
    digs.forEach(it => { const a = limpo(it); digital.push({ id:uid(), tipo:'acao', canal_id:a.canal_id, perfil:a.perfil, detalhe:a.detalhe, nome:a.nome, entregas:a.entregas, inicio:a.inicio, fim:a.fim, period:a.period, valor:a.valor, valor_tabela:a.valor_tabela, pacote:a.pacote, pacote_id:a.pacote_id }); });
    const grids = r.meses.map(m => ({ id:uid(), period:m.period, praca:veic.cidade || '', items:Object.entries(m.itens).map(([i, days]) => { const it = itens[+i];
      return { id:uid(), piece:'', f1:it.programa, f2:it.formato, faixa:it.faixa || '', days, unit:Number(it.preco) || 0, disc:{ type:'pct', value:0 }, bonus:false }; }) }));
    const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:ag ? num(ag.comissao) : 0 }, grids, digital, marca:f.marca === 'comercial' ? 'comercial' : 'radio',
      proposta:{ id:p.id, numero:S.propNo(p) }, billing:{ obsClient:`Conforme proposta comercial nº ${S.propNo(p)}.` } } }).dados;
    return { dados, c:S.calc({ agencia_id:p.agencia_id, dados }) };
  };
  const gerar = (p, itens, digs, f) => S.run(async () => {
    const v = S.veh(), vs = S.veiculosDaProposta(p), feitos = Object.assign({}, p.pis_veiculos || {});
    // Combo com vários veículos: um PI por veículo, cada um com a sua numeração e a sua OPEC (gerar_pi_veiculo)
    if (vs.length > 1 || Object.keys(feitos).length) {
      let meu = null, n = 0;
      for (const vid of vs) { if (feitos[vid]) continue; const veic = S.veh(vid) || {}, proprio = vid === p.veiculo_id;
        const its = itens.filter(it => (it.veiculo_id || p.veiculo_id) === vid), ds = proprio ? digs : [];
        if (!its.length && !ds.length) continue;
        const m = montarPi(p, its, ds, f, veic);
        const pi = S.piNorm(await S.q(S.sb.rpc('gerar_pi_veiculo', { p_proposta:p.id, p_veiculo:vid, p_titulo:`Proposta ${S.propNo(p)} · ${resumo(p)}`, p_dados:m.dados,
          p_insercoes:m.c.ins, p_total:r2(m.c.total), p_comissao:r2(m.c.commission), p_liquido:r2(m.c.net) })));
        feitos[vid] = pi.id; n++;
        if (proprio) { S.db.pis.push(pi); v.pi_seq = Math.max(Number(v.pi_seq) || 0, pi.numero); meu = pi; } }
      const atual = achar(p.id); if (atual) { atual.pis_veiculos = feitos; atual.pi_id = atual.pi_id || meu && meu.id || Object.values(feitos)[0]; if (ed.id === atual.id) abrir(atual); }
      S.salvo(`${n} ${n === 1 ? 'PI gerado' : 'PIs gerados'}: ${vs.map(x => (S.veh(x) || {}).sigla).filter(Boolean).join(', ')}. Cada veículo vê o seu na tela de PIs.`);
      if (meu) { S.ui.tab = 'detalhes'; location.hash = '/pi/' + meu.id; }
      return;
    }
    const m = montarPi(p, itens, digs, f, v);
    const pi = S.piNorm(await S.q(S.sb.rpc('gerar_pi_da_proposta', { p_proposta:p.id, p_titulo:`Proposta ${S.propNo(p)} · ${resumo(p)}`, p_dados:m.dados,
      p_insercoes:m.c.ins, p_total:r2(m.c.total), p_comissao:r2(m.c.commission), p_liquido:r2(m.c.net) })));
    S.db.pis.push(pi); v.pi_seq = Math.max(Number(v.pi_seq) || 0, pi.numero);
    const atual = achar(p.id); if (atual) { atual.pi_id = pi.id; if (ed.id === atual.id) abrir(atual); }
    S.ui.tab = 'detalhes'; location.hash = '/pi/' + pi.id;
    S.salvo('PI gerado', { sub:'Com as inserções distribuídas nos dias do mês.' });
  });

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
      <fieldset class="f"><legend>Enviar por</legend><div class="seg radios" style="max-width:460px">
        <label><input type="radio" name="canal" value="whatsapp"${canal === 'whatsapp' ? ' checked' : ''}>WhatsApp</label>
        <label><input type="radio" name="canal" value="email"${canal === 'email' ? ' checked' : ''}>E-mail</label>
        <label><input type="radio" name="canal" value="pdf">PDF</label></div></fieldset>
      <label class="f" data-canal="whatsapp">WhatsApp do cliente<input name="fone" data-mask="tel" inputmode="tel" autocomplete="off" value="${esc(fone)}"></label>
      <label class="f" data-canal="email">E-mail do cliente<input name="email" type="email" autocomplete="off" value="${esc(cli.email || '')}" placeholder="nome@empresa.com.br"></label>
      <label class="f" data-canal="whatsapp email">Mensagem<textarea name="msg" class="pr-msg">${esc(msg)}</textarea></label>
      <div data-canal="pdf" class="note info" style="margin:0">Baixa a proposta em PDF para você mandar por outro meio.${p.situacao === 'rascunho' ? `<label class="row mid" style="gap:10px;margin-top:10px;flex-wrap:nowrap"><input type="checkbox" name="marcar" checked>Marcar a proposta como enviada</label>` : ''}</div>
      <div class="row mid" style="flex-wrap:wrap"><span class="grow"></span>
        <button class="btn" value="cancel" formnovalidate>Cancelar</button><button type="button" class="btn pri" data-env="enviar">${S.svg('seta')}<span id="prEnvTxt">Enviar pelo WhatsApp</span></button></div>`);
    const dl = document.getElementById('dlg'), f = dl.querySelector('form'); dl.dataset.guarda = '1';
    const troca = () => { const c = f.canal.value; f.querySelectorAll('[data-canal]').forEach(l => { l.hidden = !l.dataset.canal.split(' ').includes(c); });
      document.getElementById('prEnvTxt').textContent = c === 'email' ? 'Enviar por e-mail' : c === 'pdf' ? 'Baixar PDF' : 'Enviar pelo WhatsApp'; };
    f.addEventListener('change', e => { if (e.target.name === 'canal') troca(); }); troca();
    f.addEventListener('click', e => { const bt = e.target.closest('[data-env]'); if (!bt) return;
      const c = f.canal.value, digitos = f.fone.value.replace(/\D/g, ''), email = f.email.value.trim();
      // Baixar PDF: imprime já no clique; se pedido, marca como enviada (mandada por fora)
      if (c === 'pdf') { const marcar = f.marcar && f.marcar.checked, atual = ed.id === p.id && ed.p ? ed.p : achar(p.id);
        delete dl.dataset.sujo; dl.close('cancel'); baixarPdf(atual);
        if (marcar) setTimeout(() => S.run(async () => { if (ed.id === p.id && ed.sujo) await gravar();
          trocar(await S.q(S.sb.rpc('mudar_situacao_proposta', { p_proposta:p.id, p_situacao:'enviada', p_motivo:'' }))); }, `Proposta ${S.propNo(p)} marcada como enviada`), 400);
        return; }
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
      else { const assunto = `Proposta comercial nº ${S.propNo(r)} · ${empCurto()}`; S.toast('Enviando o e-mail…'); S.render();
        try { await S.enviarEmail({ tipo:'proposta', id:r.id, para:destino, assunto, texto }); }
        catch (err) { console.error(err); S.emailManual(destino, assunto, texto, `A proposta ${S.propNo(r)} já está marcada como enviada, mas o e-mail não foi: ${err.message}`); S.render(); return; } }
      S.toast(`Proposta ${S.propNo(r)} enviada ${canal === 'email' ? `por e-mail (${destino})` : 'pelo WhatsApp'}`);
    } catch (e) { console.error(e); if (janela) janela.close(); S.toast(S.erro(e)); }
    S.render();
  };

  // ---------- tela de PIs: propostas aprovadas esperando virar PI ----------
  S.propostasParaPi = () => {
    if (!S.pode('diretor', 'gerente', 'consultor')) return '';
    const q = (S.ui.q || '').toLowerCase();
    const l = lista().filter(p => p.situacao === 'aprovada' && !S.propostaComPi(p) && (!q || [S.propNo(p), S.nome(p.cliente_id), S.nome(p.agencia_id), resumo(p)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(a.aprovada_em).localeCompare(String(b.aprovada_em)));
    if (!l.length) return '';
    const linhas = l.map(p => { const cli = S.nome(p.cliente_id) || 'Sem cliente', ag = S.nome(p.agencia_id);
      return `<div class="prl-l"><span class="prl-n">${S.propNo(p)}</span>
        <span class="prl-c"><b title="${esc(cli)}">${esc(cli)}</b><small>${[ag ? esc(ag) : 'Direto', esc(S.usuario(p.consultor_id) || '')].filter(Boolean).join(' · ')}</small></span>
        <span class="prl-i" title="${esc(resumo(p))}">${esc(resumo(p))}</span>
        <span class="prl-q"><small>Inserções/mês</small>${qtdMes(p)}</span>
        <span class="prl-v"><small>Investimento mensal</small><b>${brl(p.valor_total)}</b></span>
        <span class="prl-s"><small>Aprovada em ${curtoData(S.dia(p.aprovada_em))}</small></span>
        <span class="prl-a">${pode(p) ? `<button class="btn sm pri" data-act="prGerar" data-id="${p.id}">${S.svg('pis')}Gerar PI</button>` : ''}<button class="btn tres" data-act="prOpcoes" data-id="${p.id}" aria-label="Opções da proposta ${S.propNo(p)}">${S.svg('mais3')}</button></span></div>`; }).join('');
    return `<section class="card prl pr-aprov" aria-label="Propostas aprovadas"><div class="hd"><h2><span class="pill fn-ok">Propostas aprovadas</span> <span class="muted small">${l.length} ${l.length === 1 ? 'aguardando' : 'aguardando'} PI · as inserções são distribuídas sozinhas</span></h2></div>
      <div class="prl-l prl-cab"><span class="prl-n">Proposta</span><span class="prl-c">Cliente</span><span class="prl-i">Itens</span><span class="prl-q">Inserções/mês</span><span class="prl-v">Investimento mensal</span><span class="prl-s">Aprovação</span><span class="prl-a"><span class="sr">Ações</span></span></div>${linhas}</section>`;
  };

  // ---------- PDF da proposta (A4 em pé, modelo da empresa comercial) ----------
  const DATA_EXT = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
  // Modelo da proposta A4 (Administração › Empresa comercial › Modelo da proposta, 25/10/2026)
  S.MODELO_PADRAO = { logo:'esquerda', cabecalho:'fina', apresentacao:'', condicoes:'', tabela:true, ass_cliente:true, rodape:true, dados_cliente:true };
  S.modeloProposta = e => Object.assign({}, S.MODELO_PADRAO, (e || emp()).modelo || {});
  S.htmlProposta = p => {
    const v = S.veh(p.veiculo_id) || {}, e = emp(), cli = p._cliente || S.pessoa(p.cliente_id) || {}, ag = S.pessoa(p.agencia_id), t = S.propTotais(p), as = assinante(p), m = S.modeloProposta(e);
    const cor = /^#[0-9a-f]{6}$/i.test(e.cor || '') ? e.cor : '#2b5fb5', cor2 = /^#[0-9a-f]{6}$/i.test(e.cor2 || '') ? e.cor2 : '#f1853d';
    const its = (p.itens || []).filter(it => it.insercoes), um = its.length === 1 ? its[0] : null, cidade = cidadeDe(e.cidade || v.cidade);
    const rad = its.filter(it => !ehDig(it) && !it.combo), dgs = its.filter(ehDig), ambos = (rad.length || its.some(it => it.combo)) && dgs.length;
    const grupos = [...new Set(its.filter(it => it.combo).map(it => it.combo.grupo))].map(g => its.filter(it => it.combo && it.combo.grupo === g));
    const nomes = [...new Set([p.veiculo_id, ...its.map(it => it.veiculo_id).filter(Boolean)])].map(x => (S.veh(x) || {}).nome).filter(Boolean);
    const qtdCab = rad.some(it => it.por_dia || it.mensal || it.unica) ? 'Quantidade' : 'Inserções/mês';
    const prog = it => `${esc(it.programa)}, ${S.diasTexto(it.dias)}${it.faixa ? ' · ' + esc(it.faixa) : ''}`;
    const apres = String(m.apresentacao || '').trim().replace(/\{CLIENTE\}/g, cli.nome || 'sua empresa');
    return `<div class="prdoc" style="--pc:${cor};--pc2:${cor2}">
      ${m.cabecalho === 'sem' || m.cabecalho === 'larga' ? '' : '<div class="prd-faixa"><i></i><i></i></div>'}
      <div class="prd-cab${m.cabecalho === 'larga' ? ' larga' : ''}${m.logo === 'centro' ? ' centro' : ''}">${empImg('prd-logo')}<div class="prd-tit"><b>PROPOSTA COMERCIAL</b><span>Nº ${S.propNo(p)} · ${esc(cidade ? cidade + ', ' : '')}${DATA_EXT(p.data)}</span></div></div>
      <div class="prd-corpo">
        <div class="prd-partes"><div><small>Cliente</small><b>${esc(cli.nome)}</b>${m.dados_cliente && docCli(cli) ? `<span>${esc(docCli(cli))}</span>` : ''}${m.dados_cliente && (cli.endereco || cli.cidade) ? `<span>${esc([cli.endereco, cli.cidade].filter(Boolean).join(' · '))}</span>` : ''}</div>
          <div><small>Negociação</small><b>${ag ? esc(ag.nome) : 'DIRETO'}</b>${ag ? '<span>Por agência</span>' : ''}</div></div>
        <h1 class="prd-radio">${esc(nomes.join(' + ') || v.nome)}</h1>
        ${apres ? `<p class="prd-texto">${esc(apres).replace(/\n/g, '<br>')}</p>` : ''}
        ${p.texto ? `<p class="prd-texto">${esc(p.texto).replace(/\n/g, '<br>')}</p>` : ''}
        ${rad.length ? `${ambos ? '<div class="prd-sec">Rádio</div>' : ''}<table class="prd-tab"><thead><tr><th>Formato</th><th>Programação</th><th class="r">${qtdCab}</th><th class="r">Valor unitário</th><th class="r">Total mensal</th></tr></thead>
          <tbody>${rad.map(it => `<tr><td>${esc(it.formato)}</td><td>${prog(it)}</td><td class="r">${esc(S.qtdItem(it))}</td><td class="r">${brl(it.preco)}</td><td class="r"><b>${brl(it.total)}</b></td></tr>`).join('')}</tbody></table>` : ''}
        ${grupos.map(g => { const c = g[0].combo, tb = g.reduce((a, it) => a + (parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0), 0);
          return `<div class="prd-sec">${esc(c.nome)}</div><table class="prd-tab"><thead><tr><th>Veículo</th><th>Produto</th><th>Variação</th><th class="r">Quantidade</th></tr></thead>
          <tbody>${g.map(it => `<tr><td>${esc((S.veh(it.veiculo_id || p.veiculo_id) || {}).nome || '')}</td><td>${prog(it)}</td><td>${esc(it.formato)}</td><td class="r">${esc(S.qtdItem(it))}</td></tr>`).join('')}</tbody></table>
          <p class="prd-nota">Combo: ${brl(c.preco)}${tb > c.preco + .004 ? ` (tabela ${brl(tb)})` : ''}.</p>`; }).join('')}
        ${dgs.length ? `<div class="prd-sec">Ação digital · redes sociais da ${esc(v.nome)}</div><table class="prd-tab"><thead><tr><th>Ação</th><th>Entregas</th><th>Período</th><th class="r">Valor</th></tr></thead>
          <tbody>${dgs.map(it => `<tr><td><b>${esc(S.acaoTitulo(it))}</b><br>${esc(S.acaoCanal(it))}</td><td>${esc(S.acaoEntregasTxt(it))}</td><td>${S.acaoPeriodo(it)}</td><td class="r"><b>${brl(it.total)}</b></td></tr>`).join('')}</tbody></table>
          <p class="prd-nota">Ação única. Datas das publicações definidas pela rádio dentro do período. A produção do conteúdo está incluída.</p>` : ''}
        <div class="prd-tot">${ambos ? `<span>Rádio · ${t.ins} ${t.ins === 1 ? 'inserção' : 'inserções'} por mês</span><span class="r">${brl(t.radio)}</span><span>Ação digital · única</span><span class="r">${brl(t.digital)}</span>` : ''}${m.tabela ? `<span>Valor de tabela${um ? ` (${um.insercoes} × ${brl(um.preco_tabela)})` : ''}</span><span class="r">${brl(t.tabela)}</span>
          ${t.desconto > 0.004 ? `<span>Desconto negociado</span><span class="r">− ${brl(t.desconto)}</span>` : ''}` : ''}
          <b class="prd-inv">${invRot(t)}</b><b class="prd-inv r">${brl(t.total)}</b>${t.producao ? `<span>Produção (cobrada uma vez)</span><span class="r">${brl(t.producao)}</span><span>Nos meses seguintes</span><span class="r">${brl(t.total - t.producao)}</span>` : ''}</div>
        ${linhasCond(p.condicoes).length ? `<div class="prd-cond"><small>Condições comerciais</small><ul>${linhasCond(p.condicoes).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
        <div class="prd-ass${m.ass_cliente ? '' : ' so'}"><div><b>${esc(as.nome)}</b><span>${esc(as.cargo)}</span></div>${m.ass_cliente ? `<div><b>De acordo</b><span>${esc(cli.nome)}</span></div>` : ''}</div>
      </div>
      ${m.rodape ? `<div class="prd-rod"><b>${esc([e.razao_social || e.nome, e.cnpj ? 'CNPJ ' + e.cnpj : '', cidadeDe(e.cidade) ? e.cidade : ''].filter(Boolean).join(' · '))}</b><span>${esc([e.email, e.telefone, e.site].filter(Boolean).join(' · '))}</span></div>` : ''}</div>`;
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
    const rads = its.filter(it => !ehDig(it)), comoUm = rads.length === 1 ? rads[0] : null, seg = comoUm && /(\d+)\s*(?:"|''|”|s\b|seg)/i.exec(comoUm.formato);
    const dist = comoUm ? (comoUm.dias.length === 7 ? 'distribuídas todos os dias' : `distribuídas de ${S.diasTexto(comoUm.dias).replace('seg.', 'segunda').replace('sex.', 'sexta').replace('sáb.', 'sábado').replace('dom.', 'domingo').replace('ter.', 'terça').replace('qua.', 'quarta').replace('qui.', 'quinta')}`) : 'em diferentes horários da programação';
    const acs = its.filter(ehDig), dg = acs.length ? `uma ação nas redes sociais da rádio (${acs.map(a => S.acaoEntregasTxt(a)).join('; ')})` : '';
    if (!t.ins) return `Apresentamos à ${cli.nome || 'sua empresa'} a proposta de presença digital na ${v.nome}: ${dg}, com conteúdo produzido pela equipe da rádio e datas combinadas dentro do período.`;
    return `Apresentamos à ${cli.nome || 'sua empresa'} a proposta de veiculação na ${v.nome}, com presença diária na programação da emissora${cid ? ' em ' + cid : ''}. O pacote reúne ${t.ins} inserções${seg ? ` de ${seg[1]}"` : ''} por mês, ${dist}${dg ? `, e ${dg}` : ''}, garantindo lembrança de marca contínua ao longo do mês.`; };

  // ---------- ações ----------
  const daLista = d => achar(d.id) || (ed.id ? achar(ed.id) : null);
  const atualEd = () => (S.route().view === 'propostas' && ed.id ? ed.p : null);
  const comItem = fn => { const p = atualEd(); if (!p || !editavel(achar(p.id))) return; fn(p); sujar(); S.render(); };
  Object.assign(S.actions, {
    prSit: d => { if (!d.v) { if (!pf.sit) return; pf.sit = ''; } else pf.sit = pf.sit === d.v ? '' : d.v; S.flip(S.render); },
    prMes: d => { const hoje = today().slice(0, 7), atual = pf.mes || hoje, alvo = +d.d ? somaMes(atual, +d.d) : hoje;
      if (alvo === atual) return; viraMes = alvo > atual ? 1 : -1; pf.mes = alvo === hoje ? '' : alvo; pf.sit = ''; S.flip(S.render); },
    prNova: (d = {}) => {
      const v = S.veh(), cls = clientesParaEscolher(null);
      if (!cls.length) return S.toast(S.pode('consultor') ? 'Você ainda não tem clientes nesta rádio. Cadastre em Clientes.' : 'Cadastre o cliente antes, em Clientes.');
      S.form(`Nova proposta · ${esc(v.nome)}`, [
        { k:'cliente_id', label:'Cliente', type:'select', req:true, full:true, options:[['', 'Escolha o cliente'], ...cls.map(c => [c.id, c.nome])] },
        { k:'agencia_id', label:'Negociação', type:'select', full:true, options:[['', 'Direto com o cliente'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        { html:`<p class="muted small" style="grid-column:1/-1">A proposta sai com a marca da ${esc(empCurto())}, validade de ${v.prop_validade || 15} dias e as condições padrão da ${esc(v.nome)}. Os itens você escolhe da tabela vigente.</p>` }], { cliente_id:d.cliente || '' },
        f => S.run(async () => { const cli = S.pessoa(f.cliente_id), val = Number(v.prop_validade) || 15, vig = S.tabelaVigente();
          const r = await S.salvar('propostas', { veiculo_id:v.id, cliente_id:f.cliente_id, agencia_id:f.agencia_id || (cli && cli.agencia_id) || null, validade:val, data:today(),
            consultor_id:S.pode('consultor') ? S.me.id : (cli && cli.consultor_id) || S.me.id, tabela_id:vig ? vig.id : null,
            condicoes:String(v.prop_condicoes || S.modeloProposta().condicoes || S.PROP_CONDICOES_PADRAO).replace(/\{VALIDADE\}/g, val), texto:'', itens:[] });
          abrir(r); location.hash = '/propostas/' + r.id; }, 'Proposta criada'), 'Criar proposta');
      // O cliente atendido por agência já vem com ela
      const sel = document.querySelector('#dlg [name="cliente_id"]'), ags = document.querySelector('#dlg [name="agencia_id"]');
      sel.addEventListener('change', () => { const c = S.pessoa(sel.value); if (c) ags.value = c.agencia_id || ''; });
      if (sel.value) { const c = S.pessoa(sel.value); if (c) ags.value = c.agencia_id || ''; }
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
      if (!await S.confirmar(`Excluir a proposta ${S.propNo(p)} (${S.nome(p.cliente_id)})? Fica 30 dias na Lixeira, onde o diretor pode restaurar.`, { ok:'Excluir proposta', perigo:true })) return;
      S.run(async () => { if (ed.id === p.id) fechar(); await S.excluir('propostas', p.id); if (S.route().view === 'propostas' && S.route().id) location.hash = '/propostas'; }, 'Proposta excluída'); },
    // Diretor: exclui a proposta em qualquer situação e, se marcar, os PIs gerados por ela (database/050)
    prExcluirTudo: async d => { const p = daLista(d); let v;
      try { v = await S.q(S.sb.rpc('vinculos_da_proposta', { p_proposta:p.id })); } catch (e) { return S.toast(S.erro(e)); }
      const pis = v.pis || [], pagas = pis.reduce((t, x) => t + (x.pagas || 0), 0);
      const extra = pis.length ? `<label class="row mid" style="gap:10px;flex-wrap:nowrap;margin:2px 0"><input type="checkbox" name="com_pis">Excluir também ${pis.length === 1 ? 'o PI gerado' : `os ${pis.length} PIs gerados`} (${pis.map(x => esc(x.numero)).join(', ')}), com as parcelas do financeiro${pagas ? `, ${pagas} já ${pagas === 1 ? 'paga' : 'pagas'}` : ''}</label>` : '';
      S.excluirDigitando({ titulo:`Excluir a proposta ${S.propNo(p)}?`, itens:[v.followups && `${v.followups} follow-up${v.followups === 1 ? '' : 's'} ligado${v.followups === 1 ? '' : 's'} a ela (os automáticos são apagados; os outros ficam sem a proposta)`].filter(Boolean),
        aviso:`${S.nome(p.cliente_id)} · ${p.situacao === 'rascunho' ? 'rascunho' : p.situacao}. ${pis.length ? 'Sem marcar a opção abaixo, os PIs continuam, só sem a proposta.' : ''} Fica 30 dias na Lixeira, onde o diretor pode restaurar.`, extra,
        rotulo:'Para confirmar, digite o número da proposta', dica:S.propNo(p), confere:t => { const x = t.replace(/\s/g, '').split('/'), n = v => (v || '').replace(/^0+/, ''); return x.length === 2 ? x[0] === String(p.ano) && n(x[1]) === String(p.numero) : x.length === 1 && n(x[0]) === String(p.numero); }, botao:'Excluir proposta',
        onOk:f => S.run(async () => { if (ed.id === p.id) fechar();
          const r = await S.q(S.sb.rpc('excluir_proposta_completa', { p_proposta:p.id, p_conf:f.ex_conf, p_com_pis:!!f.com_pis }));
          await S.carregarVeiculo(); if (S.route().view === 'propostas' && S.route().id) location.hash = '/propostas';
          if (r && r.pis) S.salvo(`Proposta e ${r.pis} ${r.pis === 1 ? 'PI excluídos' : 'PIs excluídos'}`); }, f.com_pis && pis.length ? null : 'Proposta excluída') }); },
    prDuplicar: d => { const p = daLista(d), v = S.veh();
      S.run(async () => { const r = await S.salvar('propostas', { veiculo_id:v.id, cliente_id:p.cliente_id, agencia_id:p.agencia_id, validade:p.validade, data:today(), consultor_id:p.consultor_id,
        tabela_id:p.tabela_id, condicoes:p.condicoes, texto:p.texto, itens:p.itens, insercoes:p.insercoes, publicacoes:p.publicacoes || 0, valor_tabela:p.valor_tabela, valor_total:p.valor_total });
        abrir(r); location.hash = '/propostas/' + r.id; }, 'Proposta duplicada'); },
    prVer: d => { const p = ed.id === d.id && ed.p ? ed.p : achar(d.id); if (!p.cliente_id) return S.toast('Escolha o cliente antes.'); visualizar(p, d.id); },
    prPdf: d => { const p = ed.id === d.id && ed.p ? ed.p : achar(d.id); if (!p.cliente_id) return S.toast('Escolha o cliente antes.'); baixarPdf(p); },
    prGerar: d => { const p = daLista(d); if (S.propostaComPi(p)) return p.pi_id && piDe(p) ? S.go('/pi/' + p.pi_id) : S.toast('Os PIs desta proposta já foram gerados.'); gerarDlg(p); },
    prAbrirPi: d => { const p = daLista(d); if (!p.pi_id || !piDe(p)) return S.toast('O PI desta proposta não está nesta lista.'); S.ui.tab = 'detalhes'; S.go('/pi/' + p.pi_id); },
    prOpcoes: (d, botao) => { const p = achar(d.id), s = sitDe(p), dentro = S.route().id === p.id, id = { id:p.id }, it = [], tudo = S.me.diretor || (S.pode('consultor') && p.consultor_id === S.me.id);
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
        if (s === 'rascunho' && !tudo) it.push('-', { label:'Excluir', icon:'lixo', act:'prExcluir', data:id, perigo:true });
      }
      if (tudo) it.push('-', { label:'Excluir proposta', icon:'lixo', act:'prExcluirTudo', data:id, perigo:true });
      S.menu(botao, it); },
    prAbrir: d => S.go('/propostas/' + d.id),
    prSugerir: async () => { const p = atualEd(); if (!p) return; if (!(p.itens || []).some(it => it.insercoes)) return S.toast('Coloque os itens e as inserções antes: o texto sai deles.');
      if (String(p.texto || '').trim() && !await S.confirmar('Trocar o texto de apresentação pelo sugerido?', { ok:'Trocar texto' })) return;
      p.texto = sugerir(p); sujar(); S.render(); const ta = document.querySelector('#content [data-pf="texto"]'); if (ta) ta.focus(); },
    prDia: d => { comItem(p => { const it = p.itens[+d.i], k = +d.d; it.dias = (it.dias || []).includes(k) ? it.dias.filter(x => x !== k) : [...(it.dias || []), k]; });
      const b = document.querySelector(`#content [data-act="prDia"][data-i="${d.i}"][data-d="${d.d}"]`); if (b) b.focus(); },
    prRmItem: d => comItem(p => { p.itens.splice(+d.i, 1); }),
    // Ação digital: nova, editar ou tirar (digital.js)
    prAcao: async d => { const p = atualEd(); if (!p || !editavel(achar(p.id))) return;
      if (d.op === 'tirar') { const it = p.itens[+d.i]; if (!await S.confirmar(`Tirar a ação "${S.acaoTitulo(it)}" da proposta?`, { ok:'Tirar ação', perigo:true })) return; return comItem(pp => { pp.itens.splice(+d.i, 1); }); }
      const atual = d.op === 'editar' ? p.itens[+d.i] : null;
      S.acaoDigitalDlg(atual, a => comItem(pp => { const it = limpo(Object.assign({ secao:'digital' }, a)); if (atual) pp.itens[+d.i] = it; else pp.itens.push(it); })); },
    // Escolher da tabela vigente: programa (por seção) × formato, com o preço dela
    prAddItem: (d = {}) => { const p = atualEd(); if (!p) return; const vig = S.tabelaVigente(), v = S.veh(), digital = !!d.digital;
      if (!vig) { const prox = (S.db.tabelas || []).filter(t => t.situacao === 'publicada' && S.tipoTabela(t) === 'radio' && t.inicio > S.today()).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
        return S.toast(digital ? (prox ? `A ${prox.nome} só começa a valer em ${S.dfmt(prox.inicio)}.` : 'Não há tabela digital vigente nesta rádio. Publique uma em Produtos → Digital.') : 'Esta rádio ainda não tem produtos com preço. Cadastre em Produtos.'); }
      const prods = tipo => S.db.produtos.filter(x => x.tipo === tipo && x.ativo && S.ehDigital(x) === digital).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
      const secoes = digital ? [['digital', 'Perfis da rádio']] : [['rotativo', 'Rotativo'], ['programa', 'Horário determinado'], ['quadro', 'Quadros'], ['aovivo', 'Ao vivo']];
      const progs = prods('programa').filter(x => prods('formato').some(f => S.precoNaTabela(vig.id, x.id, f.id)));
      if (digital && !progs.length) return S.toast('A tabela digital vigente não tem preços. Cadastre em Produtos → Digital.');
      const ops = secoes.map(([k, n]) => { const l = progs.filter(x => (x.secao || 'programa') === k); return l.length ? `<optgroup label="${n}">${l.map(x => `<option value="${x.id}">${esc(x.nome)}${x.detalhe ? ' · ' + esc(x.detalhe.split('\n')[0]) : ''}</option>`).join('')}</optgroup>` : ''; }).join('');
      S.dialog(`<h2>${digital ? 'Item digital' : 'Adicionar produto'}</h2>${digital ? `<p class="muted small" style="margin-top:-6px">${esc(vig.nome)} · vigente desde ${dfmt(vig.inicio)}</p>` : ''}
        <div class="g2"><label class="f" style="grid-column:1/-1">${digital ? 'Perfil' : 'Produto'}<select name="prog" required><option value="">Escolha</option>${ops}</select></label>
          <label class="f" style="grid-column:1/-1">${digital ? 'Formato' : 'Duração ou variação'}<select name="fmt" required disabled><option value="">Escolha o produto antes</option></select></label>
          <div id="prPrecoIt" class="caixa" style="grid-column:1/-1" hidden></div></div>
        <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Adicionar</button></div>`,
        f => { const pr = S.db.produtos.find(x => x.id === f.prog), fm = S.db.produtos.find(x => x.id === f.fmt), pc = pr && fm && S.precoNaTabela(vig.id, pr.id, fm.id); if (!pc) return;
          const novo = S.itemDaTabela(pr, fm, pc.preco, v); comItem(pp => { pp.itens.push(novo); pp.tabela_id = vig.id; });
          setTimeout(() => { const el = document.querySelector(`#content [data-pf="insercoes"][data-i="${ed.p.itens.length - 1}"]`); if (el) el.focus(); }, 80); });
      if (digital && progs.length === 1) { const fp0 = document.querySelector('#dlg [name="prog"]'); fp0.value = progs[0].id; setTimeout(() => fp0.dispatchEvent(new Event('change')), 0); }
      const fp = document.querySelector('#dlg [name="prog"]'), ff = document.querySelector('#dlg [name="fmt"]'), box = document.getElementById('prPrecoIt');
      const mostrarPreco = () => { const pc = S.precoNaTabela(vig.id, fp.value, ff.value), pr = S.db.produtos.find(x => x.id === fp.value);
        box.hidden = !pc; if (!pc) return; const it = S.itemDaTabela(pr, S.db.produtos.find(x => x.id === ff.value), pc.preco, v);
        if (digital) { box.innerHTML = `<b>${brl(pc.preco)}</b> por publicação na tabela<br><small class="muted">A quantidade por mês você coloca no item. As datas a rádio define depois.</small>`; return; }
        box.innerHTML = `<b>${brl(pc.preco)}</b> por inserção na tabela · ${S.diasTexto(it.dias)}${it.faixa ? ' · ' + esc(it.faixa) : ''}<br><small class="muted">Dias e faixa você ajusta depois, no item.</small>`; };
      fp.addEventListener('change', () => { const fs = prods('formato').filter(f => S.precoNaTabela(vig.id, fp.value, f.id));
        ff.innerHTML = fs.length ? (digital && fs.length > 1 ? '<option value="">Escolha o formato</option>' : '') + fs.map(f => `<option value="${f.id}">${esc(f.nome)} · ${brl(S.precoNaTabela(vig.id, fp.value, f.id).preco)}</option>`).join('') : `<option value="">Sem preço para ${digital ? 'este perfil' : 'esta programação'}</option>`;
        ff.disabled = !fs.length; mostrarPreco(); });
      ff.addEventListener('change', mostrarPreco); },
    // Produto do veículo (rádio ou mídia exterior), pela janela de Produtos
    prAddProd: () => { const p = atualEd(); if (!p) return;
      S.escolherProduto({ tipos:['radio', 'ooh'], onItens:its => comItem(pp => { its.forEach(it => { delete it.veiculo_id; }); pp.itens.push(...its); const t = S.tabelaVigente(); if (t && !pp.tabela_id) pp.tabela_id = t.id; }) }); },
    // Combo do grupo: entra fechado, com o preço dividido entre os itens na proporção da tabela
    prAddCombo: () => { const p = atualEd(); if (!p) return; const cs = S.combosAtivos(); if (!cs.length) return S.toast('Não há combos ativos. O diretor cria em Dashboard Gestão → Combos.');
      const info = c => `<b>${brl(c.preco)}</b>${Number(c.valor_tabela) > c.preco ? ` · tabela ${brl(c.valor_tabela)} (−${nfmt((1 - c.preco / c.valor_tabela) * 100).replace(/,?0+$/, '')}%)` : ''}${c.vale_ate ? ` · vale até ${dfmt(c.vale_ate)}` : ''}<br><small class="muted">${(c.itens || []).map(x => `${esc((S.veh(x.veiculo_id) || {}).sigla || '')} ${esc(x.programa)} · ${esc(x.formato)} (${esc(S.qtdItem(x))})`).join('<br>')}</small>`;
      S.dialog(`<h2>Adicionar combo</h2><label class="f">Combo<select name="combo" required><option value="">Escolha</option>${cs.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
        <div id="prComboInfo" class="caixa" hidden></div><p class="muted small">O combo entra fechado: as quantidades não mudam. Aprovada a proposta, o SONVI gera um PI para cada veículo.</p>
        <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Adicionar</button></div>`,
        f => { const c = cs.find(x => x.id === f.combo); if (!c) return; const its = S.itensDoCombo(c, p.veiculo_id); if (!its.length) return S.toast('Este combo está sem itens.'); comItem(pp => { pp.itens.push(...its); }); });
      const sel = document.querySelector('#dlg [name="combo"]'), box = document.getElementById('prComboInfo');
      sel.addEventListener('change', () => { const c = cs.find(x => x.id === sel.value); box.hidden = !c; if (c) box.innerHTML = info(c); }); },
    prRmCombo: async d => { const p = atualEd(); if (!p) return; const it = p.itens.find(x => x.combo && x.combo.grupo === d.g);
      if (!it || !await S.confirmar(`Tirar o combo "${it.combo.nome}" da proposta?`, { ok:'Tirar combo', perigo:true })) return;
      comItem(pp => { pp.itens = pp.itens.filter(x => !(x.combo && x.combo.grupo === d.g)); }); },
    // Cota de patrocínio (Produtos → Patrocínios): entra com as inserções do pacote e o valor do mês dividido entre elas
    prAddCota: () => { const p = atualEd(); if (!p) return; const cs = S.cotasAtivas();
      if (!cs.length) return S.toast('Esta rádio ainda não tem cotas de patrocínio. Cadastre em Produtos → Patrocínios.');
      const info = c => { const its = S.itensDaCota(c); return `<b>${brl((c.dados || {}).valor)}</b> por mês · ${esc(c.detalhe.split('\n').join(' · ') || 'horário a combinar')}<br><small class="muted">${its.map(x => `${x.insercoes} ${esc(x.formato)}`).join(' · ')}</small>`; };
      S.dialog(`<h2>Adicionar patrocínio</h2><div class="g2"><label class="f" style="grid-column:1/-1">Cota<select name="cota" required><option value="">Escolha</option>${cs.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
          <div id="prCotaInfo" class="caixa" style="grid-column:1/-1" hidden></div></div>
        <p class="muted small">As inserções do pacote entram como itens da proposta, com o valor do mês dividido entre elas. Dá para ajustar depois, como qualquer item.</p>
        <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Adicionar</button></div>`,
        f => { const c = cs.find(x => x.id === f.cota); if (!c) return; const its = S.itensDaCota(c); if (!its.length) return S.toast('Esta cota não tem inserções incluídas.'); comItem(pp => { pp.itens.push(...its); }); });
      const sel = document.querySelector('#dlg [name="cota"]'), box = document.getElementById('prCotaInfo');
      sel.addEventListener('change', () => { const c = cs.find(x => x.id === sel.value); box.hidden = !c; if (c) box.innerHTML = info(c); }); },
  });
})();

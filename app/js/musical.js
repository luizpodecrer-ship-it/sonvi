// SONVI · programação musical: grade da semana, acervo (ficha musical), categorias, formatos, regras, painéis e relatórios/ECAD.
// Programam: diretor, gerente e programador. A OPEC consulta. As regras e a geração ficam em musical-regras.js.
(() => {
  const { esc } = S, M = S.mus;
  const TONS = ['blue', 'green', 'orange', 'purple', 'sky', 'red', 'gray'];
  const tom = i => TONS[(Number(i) || 0) % TONS.length];
  const RITMO_TOM = { L:'green', M:'orange', R:'red' };
  const ABAS = [['prog', 'Programação'], ['paineis', 'Painéis'], ['acervo', 'Acervo'], ['cats', 'Categorias'], ['formatos', 'Formatos'], ['regras', 'Regras'], ['rel', 'Relatórios e ECAD']];
  const REGRAS_PADRAO = { on:Object.fromEntries(M.REGRAS.map(r => [r[0], true])), interprete_min:60, peso_dist:2, custom:[] };

  // Estado da tela (não é dado do sistema; some ao recarregar)
  const u = { aba:'prog', dia:null, hora:new Date().getHours(), pick:null, modo:'auto', ai:0, busca:'', soLib:true, duas:false,
    q:'', fcat:'', hist:'musica', histId:'', histQ:'', fmt:null, pincel:null, gradeRasc:null, fmtRasc:null,
    rper:'semana', rcat:'', rgrav:'', rint:'', previa:'', d2radio:null, d2dia:0, d2hora:8, outra:null, carregando:false };

  const pode = () => S.pode('diretor', 'gerente', 'programador');
  const cfg = () => S.db.mus_config[0] || { ritmos:{ L:{ nome:'Lento', max:2 }, M:{ nome:'Médio', max:3 }, R:{ nome:'Rápido', max:2 } }, regras:{}, grade:[], informativos:[] };
  const regras = () => { const r = Object.assign({}, REGRAS_PADRAO, cfg().regras || {}); r.on = Object.assign({}, REGRAS_PADRAO.on, (cfg().regras || {}).on || {}); return r; };
  const catPorId = () => Object.fromEntries(S.db.mus_categorias.map(c => [c.id, c]));
  const vinPorId = () => Object.fromEntries(S.db.mus_vinhetas.map(v => [v.id, v]));
  const formato = id => S.db.mus_formatos.find(f => f.id === id) || null;
  const formatoDaHora = (wd, h) => { const g = cfg().grade; return formato(g && g[wd] ? g[wd][h] : null); };
  const contexto = lista => M.contexto(lista, { cats:catPorId(), ritmos:cfg().ritmos, grupos:S.db.mus_grupos, regras:regras(), subs:S.db.mus_subcategorias }, S.db.musicas);
  const linhaDaHora = (data, h) => S.db.mus_programacao.find(r => r.data === data && r.hora === h);
  const semana = () => S.ui.musSemana;
  const catPill = (c, extra = '') => c ? `<span class="pill" style="--tone:var(--${tom(c.cor)})"${extra}>${esc(c.nome)}</span>` : '';
  const rtPill = m => `<span class="mus-rt" style="--tone:var(--${RITMO_TOM[m.ritmo]})" title="Ritmo ${esc((cfg().ritmos[m.ritmo] || {}).nome || '')}">${m.ritmo}</span>`;
  const pesoSel = m => `<span class="mus-pe" style="--p:${m.peso}" title="Peso ${m.peso}">${m.peso}</span>`;

  // ---------- a semana carregada, com as regras conferidas ----------
  const montar = () => {
    const sem = semana(), dias = [];
    for (let di = -1; di <= 6; di++) {
      const data = M.somaDias(sem, di), horas = [];
      for (let h = 0; h < 24; h++) { const r = linhaDaHora(data, h); horas.push(r ? r.itens : []); }
      dias.push({ di, data, horas });
    }
    const porId = Object.fromEntries(S.db.musicas.map(m => [m.id, m]));
    const lista = M.linha(dias, porId, vinPorId()), ctx = contexto(lista);
    const r = { lista, ctx, porId, viol:0, manual:0, vazias:0, musicas:0, alertaHora:{}, alertaDia:{}, porRegra:{} };
    lista.forEach((e, idx) => {
      e.viol = [];
      if (e.slot.k !== 'MUS' || e.di < 0) return;
      if (!e.musica) { r.vazias++; return; }
      r.musicas++; if (e.slot.manual) r.manual++;
      e.viol = M.conferir(ctx, idx, e.musica, e.slot.cat, false);
      if (e.viol.length) { r.viol++; r.alertaHora[e.di + '-' + e.h] = 1; r.alertaDia[e.di] = 1; e.viol.forEach(v => { r.porRegra[v.regra] = (r.porRegra[v.regra] || 0) + 1; }); }
    });
    return r;
  };

  // ---------- gravar ----------
  const salvarHora = async (data, h, itens) => {
    const r = linhaDaHora(data, h);
    if (r) return S.salvar('mus_programacao', { id:r.id, itens });
    const wd = (Math.round((Date.parse(data) - Date.parse(semana())) / 864e5) + 7) % 7, f = formatoDaHora(wd, h);
    return S.salvar('mus_programacao', { veiculo_id:S.ui.vehicleId, data, hora:h, formato_id:f ? f.id : null, itens });
  };
  const salvarConfig = async patch => {
    const c = cfg(), row = Object.assign({ veiculo_id:S.ui.vehicleId }, patch);
    const r = await S.q(S.sb.from('mus_config').upsert(Object.assign({ ritmos:c.ritmos, regras:c.regras, grade:c.grade, informativos:c.informativos }, row), { onConflict:'veiculo_id' }).select().single());
    S.db.mus_config = [r]; return r;
  };
  // Gera os dias pedidos (0 = segunda … 6 = domingo) a partir dos formatos da grade da semana e grava tudo de uma vez
  const gerarDias = async alvo => {
    const sem = semana(), vins = S.db.mus_vinhetas.filter(v => v.ativa), infos = cfg().informativos || [], cont = { v:0, i:0 }, dias = [];
    for (let di = -1; di <= 6; di++) {
      const data = M.somaDias(sem, di), wd = (di + 7) % 7, gerar = alvo.includes(di), horas = [], auto = [];
      for (let h = 0; h < 24; h++) {
        const f = formatoDaHora(wd, h), r = linhaDaHora(data, h);
        horas.push(gerar ? M.itensDoFormato(f, vins, infos, cont) : JSON.parse(JSON.stringify(r ? r.itens : [])));
        auto.push(!f || f.automatico !== false);
      }
      dias.push({ di, data, horas, gerar, auto });
    }
    M.gerar(dias, { cats:catPorId(), ritmos:cfg().ritmos, grupos:S.db.mus_grupos, regras:regras(), subs:S.db.mus_subcategorias }, S.db.musicas, vinPorId());
    const linhas = [];
    dias.filter(d => d.gerar).forEach(d => d.horas.forEach((itens, h) => { const f = formatoDaHora((d.di + 7) % 7, h);
      linhas.push({ veiculo_id:S.ui.vehicleId, data:d.data, hora:h, formato_id:f ? f.id : null, itens }); }));
    const salvas = await S.q(S.sb.from('mus_programacao').upsert(linhas, { onConflict:'veiculo_id,data,hora' }).select());
    const chave = r => r.data + '|' + r.hora, novas = new Set(salvas.map(chave));
    S.db.mus_programacao = S.db.mus_programacao.filter(r => !novas.has(chave(r))).concat(salvas);
  };

  // ---------- carregar ao abrir ----------
  const garantir = () => {
    if (!S.ui.musSemana) S.ui.musSemana = M.segunda(S.today());
    if (u.dia === null) u.dia = (new Date().getDay() + 6) % 7;
    const pronto = S.db.musVeiculo === S.ui.vehicleId && S.db.musSemana === S.ui.vehicleId + '|' + S.ui.musSemana;
    if (!pronto && !u.carregando) {
      u.carregando = true;
      S.carregarMusical().catch(e => { console.error(e); S.toast(S.erro(e)); }).finally(() => { u.carregando = false; if (S.APP === 'music' || S.route().view === 'musical') S.render(); });
    }
    return pronto;
  };

  // O Sonvi Music escolhe a parte pelo menu lateral
  S.musAba = a => { if (u.aba !== a) { u.aba = a; u.pick = null; } };

  S.views.musical = () => {
    const titulo = `<span class="sub">${esc(S.veh().nome)}</span>Programação musical`;
    if (!garantir()) return { title:titulo, actions:'', body:'<div class="card empty"><div class="eq" style="justify-content:center;margin-bottom:14px"><span></span><span></span><span></span><span></span><span></span></div>Carregando a programação musical…</div>' };
    if (!S.db.mus_categorias.length) return { title:titulo, actions:'', body:`<div class="card empty"><b>Programação musical desta rádio</b>${pode()
      ? 'Comece com categorias, vinhetas, três formatos (Dia, Noite, Madrugada) e a grade da semana prontos. Tudo pode ser mudado depois.<div style="margin-top:18px"><button class="btn pri" data-act="musIniciar">' + S.svg('mais') + 'Preparar a programação musical</button></div>'
      : 'Ainda não foi preparada. Peça ao programador, ao gerente ou ao diretor.'}</div>` };
    const seg = `<div class="seg">${ABAS.map(([k, n]) => `<button class="${u.aba === k ? 'on' : ''}" data-act="musAba" data-aba="${k}">${n}</button>`).join('')}</div>`;
    const w = montar(), tela = { prog:telaProg, paineis:telaPaineis, acervo:telaAcervo, cats:telaCats, formatos:telaFormatos, regras:telaRegras, rel:telaRel }[u.aba](w);
    // No Sonvi Music cada parte é um item do menu lateral, sem as abas
    return { title:titulo, actions:tela.acoes || '', body:(S.APP === 'music' ? '' : seg) + tela.corpo };
  };

  // ---------- navegação da semana (dia e hora) ----------
  const navSemana = w => {
    const sem = semana(), fim = M.somaDias(sem, 6);
    return `<div class="mus-sem"><button class="btn sm" data-act="musSemana" data-dir="-1" aria-label="Semana anterior">${S.svg('voltar')}</button>
      <b>Semana de ${M.dm(sem)} a ${M.dm(fim)}</b><button class="btn sm" data-act="musSemana" data-dir="1" aria-label="Próxima semana">Próxima ${S.svg('seta')}</button>
      ${sem !== M.segunda(S.today()) ? '<button class="btn sm" data-act="musSemana" data-dir="0">Esta semana</button>' : ''}</div>
      <div class="seg mus-dias" role="group" aria-label="Dia">${M.DC.map((d, i) => `<button class="${u.dia === i ? 'on' : ''}" data-act="musDia" data-dia="${i}">${d} ${M.dm(M.somaDias(sem, i))}${w.alertaDia[i] ? '<i class="mus-alerta" aria-label="tem regra quebrada"></i>' : ''}</button>`).join('')}</div>
      <div class="mus-horas" role="group" aria-label="Hora">${Array.from({ length:24 }, (_, h) => { const f = formatoDaHora(u.dia, h);
        return `<button class="${u.hora === h ? 'on' : ''}" style="--tone:var(--${tom(f ? f.cor : 6)})" data-act="musHora" data-hora="${h}" title="${f ? esc(f.nome) : 'Sem formato'}">${M.pad(h)}h${w.alertaHora[u.dia + '-' + h] ? '<i class="mus-alerta"></i>' : ''}</button>`; }).join('')}</div>`;
  };

  // ======================= PROGRAMAÇÃO =======================
  const telaProg = w => {
    const data = M.somaDias(semana(), u.dia), f = formatoDaHora(u.dia, u.hora), cats = catPorId();
    const idxs = []; w.lista.forEach((e, i) => { if (e.di === u.dia && e.h === u.hora) idxs.push(i); });
    const tot = { v:0, m:0, i:0, b:0 };
    idxs.forEach(i => { const e = w.lista[i]; if (e.slot.k === 'MUS') { if (e.musica) { tot.m += e.musica.duracao; if (e.ad) tot.v += e.ad.duracao; } } else if (e.slot.k === 'VIN') tot.v += e.dur; else if (e.slot.k === 'BRK') tot.b += e.dur; else tot.i += e.dur; });
    const mover = f ? f.permitir_mover : true, excluir = f ? f.permitir_excluir : true, ed = pode();
    const linhas = idxs.map(i => {
      const e = w.lista[i], k = e.slot.k, sel = u.pick && u.pick.data === data && u.pick.h === u.hora && u.pick.i === e.i, nv = e.viol.length;
      let cat, tx, sub = '';
      if (k === 'MUS') { cat = catPill(cats[e.slot.cat]); tx = e.musica ? esc(e.musica.titulo) : 'Posição vazia'; sub = e.musica ? esc(M.artistasTexto(e.musica)) : (f && f.automatico === false ? 'Horário ao vivo: escolha a música' : 'Clique para escolher a música'); }
      else if (k === 'VIN') { cat = S.tag('Vinheta', 'gray'); tx = esc((vinPorId()[e.slot.vinheta] || { nome:'Vinheta' }).nome); }
      else if (k === 'BRK') { cat = S.tag('Break', 'ink-tone'); tx = `Break comercial ${M.relogio(e.inicio)}`; sub = 'O roteiro comercial entra aqui'; }
      else { cat = S.tag('Informativo', 'sky'); tx = esc(e.slot.texto || 'Texto informativo'); }
      const menu = ed ? `<button class="btn tres" data-act="musItemMenu" data-i="${e.i}" aria-label="Opções da posição ${e.i + 1}">${S.svg('mais3')}</button>` : '';
      return `<div class="mus-l${k !== 'MUS' ? ' nm' : ''}${sel ? ' sel' : ''}${nv ? ' erro' : ''}${k === 'MUS' && !e.musica ? ' vazio' : ''}"${k === 'MUS' && ed ? ` data-act="musAbrir" data-i="${e.i}" role="button" tabindex="0"` : ''}>
        <span class="mus-n">${e.i + 1}</span><span class="mus-t num">${M.relogio(e.inicio)}</span><span class="mus-c">${cat}</span>
        <span class="mus-m">${e.musica ? rtPill(e.musica) + pesoSel(e.musica) : ''}</span>
        <span class="mus-x"><b>${tx}${e.slot.manual ? ' <span class="chip">manual</span>' : ''}</b>${sub ? `<small>${sub}</small>` : ''}${e.ad ? `<small>↳ antes dela: ${esc(e.ad.nome)}</small>` : ''}${nv ? `<small class="aviso">${esc(M.NOME_REGRA[e.viol[0].regra])}: ${esc(e.viol[0].msg)}${nv > 1 ? ` (+${nv - 1})` : ''}</small>` : ''}</span>
        <span class="mus-d num">${M.mmss(e.dur)}</span><span class="mus-a">${menu}</span></div>`;
    }).join('');
    const vazio = !idxs.length;
    const lista = `<section class="card mus-grade"><div class="hd"><h3>${M.DIAS[u.dia]}, ${M.dm(data)} · ${M.pad(u.hora)}:00 às ${M.pad(u.hora)}:59</h3><span>${f ? `${catPill({ nome:f.nome, cor:f.cor })} ${f.automatico === false ? 'ao vivo' : 'automático'}` : 'Sem formato na grade'}</span></div>
      ${vazio ? `<div class="empty"><b>Esta hora ainda não foi gerada</b>${ed ? 'Use "Gerar o dia" ou "Gerar a semana". As músicas são escolhidas pelas regras.' : 'O programador ainda não montou esta hora.'}</div>`
        : `<div class="mus-tot">${[['Vinhetas', M.mmss(tot.v)], ['Músicas', M.hms(tot.m)], ['Informativos', M.mmss(tot.i)], ['Breaks', M.mmss(tot.b)], ['Total', M.hms(tot.v + tot.m + tot.i + tot.b)]].map(([a, b]) => `<div><small>${a}</small><b class="num">${b}</b></div>`).join('')}</div>
          <div class="mus-lista">${linhas}</div>`}
      ${ed ? `<div class="row mid" style="margin-top:14px;gap:8px">${[['MUS', 'Música'], ['VIN', 'Vinheta'], ['INF', 'Texto informativo'], ['BRK', 'Break']].map(([k, n]) => `<button class="btn sm tracej" data-act="musAdd" data-k="${k}">${S.svg('mais')}${n}</button>`).join('')}</div>` : ''}</section>`;
    const lado = u.pick ? painelEscolha(w) : u.duas ? segundaTela() : luzes(w, idxs);
    return {
      acoes:`<button class="btn${u.duas ? ' pri' : ''}" data-act="musDuas">Duas telas</button>${pode() ? `<button class="btn" data-act="musGerar" data-o="dia">Gerar o dia</button><button class="btn pri" data-act="musGerar" data-o="semana">${S.svg('relogio')}Gerar a semana</button>` : ''}`,
      corpo:`${navSemana(w)}<div class="tiles">${[['Músicas na semana', w.musicas, true], ['Escolhidas à mão', w.manual], ['Posições vazias', w.vazias], ['Regras quebradas', w.viol]].map(([a, b, hero]) => `<div class="tile${hero ? ' hero' : ''}"><small>${a}</small><b>${b}</b></div>`).join('')}</div>
        <div class="mus-corpo">${lista}<div class="mus-lado">${lado}</div></div>` };
  };

  const luzes = (w, idxs) => {
    const R = regras(), acesas = {}, alertas = [];
    idxs.forEach(i => { const e = w.lista[i]; e.viol.forEach(v => { acesas[v.regra] = 1; }); if (e.viol.length) alertas.push(e); });
    return `<section class="card"><h3>Indicador de regras</h3>
      <div class="mus-luzes">${M.REGRAS.map(([k, n]) => `<span class="mus-luz ${!R.on[k] ? 'off' : acesas[k] ? 'on' : 'ok'}" title="${esc(n)}">${esc(n)}</span>`).join('')}</div>
      <p class="muted small" style="margin:10px 0 12px">Vermelho: quebrada nesta hora. Cinza: regra desligada.</p>
      ${alertas.length ? `<div class="mus-alertas">${alertas.map(e => `<div><b>${M.relogio(e.inicio)} · ${esc(e.musica.titulo)}</b>${e.viol.map(v => `<small>${esc(M.NOME_REGRA[v.regra])}: ${esc(v.msg)}</small>`).join('')}</div>`).join('')}</div>`
        : '<div class="note info" style="margin:0">Nenhuma regra quebrada nesta hora.</div>'}</section>`;
  };

  // Escolher a música de uma posição: busca automática (uma candidata por vez) ou localizar no acervo
  const candidatas = (w, idx, catPos, todas, q) => {
    const e = w.lista[idx], cats = catPorId(), f = formatoDaHora(e.wd, e.h), lib = f && f.liberadas && f.liberadas.length ? f.liberadas : null;
    return S.db.musicas.filter(m => {
      if (!todas) return m.ativa && m.categoria_id === catPos;
      if (u.soLib && lib && !lib.includes(m.categoria_id)) return false;
      if (!q) return m.categoria_id === catPos;
      return (m.titulo + ' ' + M.artistasTexto(m)).toLowerCase().includes(q);
    }).map(m => { let ha = 1e12; for (let j = idx - 1; j >= 0; j--) if (w.lista[j].musica && w.lista[j].musica.id === m.id) { ha = e.inicio - w.lista[j].inicio; break; }
      return { m, v:M.conferir(w.ctx, idx, m, catPos, true), ha, cat:cats[m.categoria_id] }; })
      .sort((a, b) => a.v.length - b.v.length || b.ha - a.ha);
  };
  const painelEscolha = w => {
    const idx = w.lista.findIndex(e => e.data === u.pick.data && e.h === u.pick.h && e.i === u.pick.i);
    if (idx < 0 || w.lista[idx].slot.k !== 'MUS') { u.pick = null; return ''; }
    const e = w.lista[idx], cat = catPorId()[e.slot.cat];
    const topo = `<div class="hd"><h3>Escolher música</h3><button class="btn tres" data-act="musFechar" aria-label="Fechar">${S.svg('voltar')}</button></div>
      <p class="muted small" style="margin:-8px 0 12px">${M.DC[e.wd]} ${M.relogio(e.inicio)} · posição ${e.i + 1} · ${cat ? esc(cat.nome) : ''}</p>
      <div class="seg" style="margin-bottom:14px">${[['auto', 'Busca automática'], ['busca', 'Localizar no acervo']].map(([k, n]) => `<button class="${u.modo === k ? 'on' : ''}" data-act="musModo" data-m="${k}">${n}</button>`).join('')}</div>`;
    const status = v => v.length ? v.map(x => `<small class="aviso">${esc(M.NOME_REGRA[x.regra])}: ${esc(x.msg)}</small>`).join('') : '<small class="mus-ok">Pode tocar aqui: nenhuma regra quebrada</small>';
    if (u.modo === 'auto') {
      const cs = candidatas(w, idx, e.slot.cat, false), i = Math.min(u.ai, Math.max(0, cs.length - 1)), c = cs[i];
      if (!c) return `<section class="card">${topo}<p class="muted">Nenhuma música ativa nesta categoria. Cadastre no Acervo.</p></section>`;
      return `<section class="card">${topo}<p class="muted small">Candidata ${i + 1} de ${cs.length}, na ordem que respeita as regras</p>
        <div class="mus-cand"><b>${esc(c.m.titulo)}${e.musica && e.musica.id === c.m.id ? ' <span class="chip">atual</span>' : ''}</b><span class="muted">${esc(M.artistasTexto(c.m))}</span>
          <div class="row mid" style="gap:6px;margin:8px 0">${catPill(c.cat)}${rtPill(c.m)}${pesoSel(c.m)}<span class="muted small">${M.mmss(c.m.duracao)}</span></div>${status(c.v)}</div>
        <div class="row mid" style="gap:8px;margin-top:14px"><button class="btn sm" data-act="musAuto" data-d="-1"${i === 0 ? ' disabled' : ''}>Voltar</button><button class="btn sm" data-act="musAuto" data-d="1"${i >= cs.length - 1 ? ' disabled' : ''}>Continuar</button><span class="grow"></span><button class="btn sm pri" data-act="musEscolher" data-id="${c.m.id}">${S.svg('check')}Aceitar</button></div></section>`;
    }
    const q = u.busca.trim().toLowerCase(), cs = candidatas(w, idx, e.slot.cat, true, q).slice(0, 80);
    return `<section class="card">${topo}<input type="search" id="musBusca" data-musq="busca" value="${esc(u.busca)}" placeholder="Ex.: Evidências ou Marília" style="width:100%;height:42px" aria-label="Buscar no acervo">
      <label class="chk" style="margin:10px 0"><input type="checkbox" data-act="musSoLib"${u.soLib ? ' checked' : ''}>Só categorias liberadas no formato</label>
      <div class="list mus-busca">${cs.map(c => `<a data-act="musEscolher" data-id="${c.m.id}"><span class="tx"><b>${esc(c.m.titulo)}</b><small>${esc(M.artistasTexto(c.m))} · ${c.cat ? esc(c.cat.nome) : ''} · ${M.mmss(c.m.duracao)}</small>${c.v.length ? `<small class="aviso">${c.v.length} regra(s): ${esc(M.NOME_REGRA[c.v[0].regra])}</small>` : '<small class="mus-ok">Pode tocar aqui</small>'}</span></a>`).join('') || '<p class="muted">Nada encontrado.</p>'}</div></section>`;
  };

  // Segunda tela: outra hora desta rádio ou de outra rádio do grupo, lado a lado
  const segundaTela = () => {
    const vs = S.db.veiculos.filter(v => v.id !== S.ui.vehicleId), rid = u.d2radio || S.ui.vehicleId;
    let corpo;
    if (rid === S.ui.vehicleId) {
      const data = M.somaDias(semana(), u.d2dia), r = linhaDaHora(data, u.d2hora), porId = Object.fromEntries(S.db.musicas.map(m => [m.id, m]));
      corpo = listaCurta(r ? r.itens : [], porId, vinPorId(), u.d2hora);
    } else if (u.outra && u.outra.chave === rid + '|' + u.d2dia + '|' + u.d2hora) {
      corpo = u.outra.erro ? `<p class="muted">${esc(u.outra.erro)}</p>` : listaCurta(u.outra.itens, u.outra.porId, u.outra.vin, u.d2hora);
    } else { carregarOutra(rid); corpo = '<p class="muted">Carregando…</p>'; }
    return `<section class="card"><h3>Segunda tela</h3>
      <div class="g2" style="margin-bottom:12px"><label class="f">Rádio<select data-mus2="radio"><option value="${S.ui.vehicleId}">${esc(S.veh().nome)}</option>${vs.map(v => `<option value="${v.id}"${v.id === rid ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>
        <label class="f">Dia<select data-mus2="dia">${M.DC.map((d, i) => `<option value="${i}"${i === u.d2dia ? ' selected' : ''}>${d} ${M.dm(M.somaDias(semana(), i))}</option>`).join('')}</select></label>
        <label class="f">Hora<select data-mus2="hora">${Array.from({ length:24 }, (_, h) => `<option value="${h}"${h === u.d2hora ? ' selected' : ''}>${M.pad(h)}h</option>`).join('')}</select></label></div>${corpo}</section>`;
  };
  const listaCurta = (itens, porId, vin, h) => {
    if (!itens.length) return '<p class="muted">Hora ainda não gerada.</p>';
    let t = h * 3600;
    return `<div class="mus-lista curta">${itens.map(s => { const m = s.k === 'MUS' && s.musica ? porId[s.musica] : null, ad = m && m.vinheta_id ? vin[m.vinheta_id] : null;
      const tx = s.k === 'MUS' ? (m ? esc(m.titulo) : 'Posição vazia') : s.k === 'VIN' ? esc((vin[s.vinheta] || { nome:'Vinheta' }).nome) : s.k === 'BRK' ? 'Break comercial' : esc(s.texto || 'Informativo');
      const html = `<div class="mus-l${s.k !== 'MUS' ? ' nm' : ''}"><span class="mus-t num">${M.relogio(t)}</span><span class="mus-x"><b>${tx}</b>${m ? `<small>${esc(M.artistasTexto(m))}</small>` : ''}</span></div>`;
      t += s.k === 'MUS' ? (m ? m.duracao + (ad ? ad.duracao : 0) : M.DUR.VAZIO) : s.k === 'VIN' ? (vin[s.vinheta] || { duracao:5 }).duracao : M.DUR[s.k] || 60;
      return html; }).join('')}</div>`;
  };
  const carregarOutra = async rid => {
    const chave = rid + '|' + u.d2dia + '|' + u.d2hora; if (u.outra && u.outra.chave === chave && u.outra.carregando) return;
    u.outra = { chave, carregando:true };
    try {
      const data = M.somaDias(semana(), u.d2dia);
      const [linha, vinhetas] = await Promise.all([S.q(S.sb.from('mus_programacao').select('itens').eq('veiculo_id', rid).eq('data', data).eq('hora', u.d2hora).maybeSingle()), S.q(S.sb.from('mus_vinhetas').select('*').eq('veiculo_id', rid))]);
      const itens = linha ? linha.itens : [], ids = itens.filter(s => s.musica).map(s => s.musica);
      const ms = ids.length ? await S.q(S.sb.from('musicas').select('*').in('id', ids)) : [];
      u.outra = { chave, itens, porId:Object.fromEntries(ms.map(m => [m.id, m])), vin:Object.fromEntries(vinhetas.map(v => [v.id, v])) };
    } catch (e) { u.outra = { chave, erro:'Seu perfil não tem acesso à programação desta rádio.' }; }
    if (S.route().view === 'musical') S.render();
  };

  // ======================= PAINÉIS =======================
  const mapa = (linhas, extraCab = '') => `<div class="scroll"><div class="mus-mapa${extraCab ? ' tot' : ''}"><span></span>${Array.from({ length:24 }, (_, h) => `<small>${M.pad(h)}</small>`).join('')}${extraCab}${linhas}</div></div>`;
  const historico = (w, ok) => M.DC.map((d, di) => { let tot = 0;
    const cel = Array.from({ length:24 }, (_, h) => { const n = w.lista.filter(e => e.di === di && e.h === h && e.musica && ok(e.musica)).length; tot += n;
      return `<i class="${n ? (n > 1 ? 'h2' : 'h1') : ''}">${n || ''}</i>`; }).join('');
    return `<small>${d}</small>${cel}<b>${tot || ''}</b>`; }).join('');
  const telaPaineis = w => {
    const dl = w.lista.filter(e => e.di === u.dia), maxPos = Math.max(0, ...Array.from({ length:24 }, (_, h) => dl.filter(e => e.h === h).length));
    let peso = '';
    for (let p = 0; p < maxPos; p++) {
      peso += `<small>${p + 1}</small>` + Array.from({ length:24 }, (_, h) => { const e = dl.find(x => x.h === h && x.i === p);
        if (!e) return '<i></i>'; if (e.slot.k !== 'MUS') return `<i class="nm" title="${M.pad(h)}h: ${e.slot.k === 'VIN' ? 'vinheta' : e.slot.k === 'BRK' ? 'break' : 'informativo'}"></i>`;
        return e.musica ? `<i class="pe" style="--p:${e.musica.peso}" title="${M.pad(h)}h: ${esc(e.musica.titulo)} (peso ${e.musica.peso})"></i>` : '<i></i>'; }).join('');
    }
    const ritmo = Array.from({ length:24 }, (_, h) => { const c = { L:0, M:0, R:0 }; dl.forEach(e => { if (e.h === h && e.musica) c[e.musica.ritmo]++; }); return c; });
    const maxR = Math.max(1, ...ritmo.map(c => c.L + c.M + c.R));
    const artistas = [...new Set(S.db.musicas.flatMap(M.artistas))].sort((a, b) => a.localeCompare(b));
    const q = u.histQ.trim().toLowerCase();
    const opcoes = u.hist === 'musica' ? S.db.musicas.filter(m => !q || (m.titulo + ' ' + M.artistasTexto(m)).toLowerCase().includes(q)).sort((a, b) => a.titulo.localeCompare(b.titulo)).slice(0, 60).map(m => [m.id, `${m.titulo} · ${M.artistasTexto(m)}`])
      : artistas.filter(a => !q || a.toLowerCase().includes(q)).slice(0, 60).map(a => [a, a]);
    if (!u.histId && opcoes.length) u.histId = opcoes[0][0];
    const alvo = u.hist === 'musica' ? (w.porId[u.histId] ? `${w.porId[u.histId].titulo} · ${M.artistasTexto(w.porId[u.histId])}` : '') : u.histId;
    const ok = u.hist === 'musica' ? m => m.id === u.histId : m => M.artistas(m).includes(u.histId);
    return { corpo:`${navSemana(w)}
      <section class="card"><div class="hd"><h3>Gráfico de peso · ${M.DIAS[u.dia]}</h3><span>colunas = horas · linhas = posições</span></div>
        ${maxPos ? mapa(peso) : '<p class="muted">Dia ainda não gerado.</p>'}
        <div class="legend mus-leg">${[1, 2, 3, 4, 5].map(p => `<div><span class="sq mus-pe-sq" style="--p:${p}"></span>Peso ${p}</div>`).join('')}<div><span class="sq" style="background:var(--fill-2)"></span>Vinheta, break ou informativo</div></div></section>
      <section class="card"><div class="hd"><h3>Ritmo hora a hora · ${M.DIAS[u.dia]}</h3><span>lentas, médias e rápidas em cada hora</span></div>
        <div class="scroll"><div class="mus-barras">${ritmo.map((c, h) => `<div title="${M.pad(h)}h: ${c.L} lentas, ${c.M} médias, ${c.R} rápidas">${['R', 'M', 'L'].map(k => `<i style="height:${c[k] / maxR * 150}px;--tone:var(--${RITMO_TOM[k]})"></i>`).join('')}<small>${M.pad(h)}</small></div>`).join('')}</div></div>
        <div class="legend mus-leg">${['L', 'M', 'R'].map(k => `<div><span class="sq" style="background:var(--${RITMO_TOM[k]})"></span>${esc(cfg().ritmos[k].nome)}</div>`).join('')}</div></section>
      <section class="card"><div class="hd"><h3>Grade horária (histórico da semana)</h3><span>quantas vezes tocou em cada dia e hora</span></div>
        <div class="mus-hist"><div class="mus-hist-esc"><div class="seg">${[['musica', 'Música'], ['interprete', 'Intérprete']].map(([k, n]) => `<button class="${u.hist === k ? 'on' : ''}" data-act="musHist" data-h="${k}">${n}</button>`).join('')}</div>
          <input type="search" id="musHistQ" data-musq="histQ" value="${esc(u.histQ)}" placeholder="Ex.: Facas" aria-label="Buscar">
          <div class="list mus-busca">${opcoes.map(([id, n]) => `<a data-act="musHistSel" data-id="${esc(id)}" class="${id === u.histId ? 'on' : ''}"><span class="tx"><b>${esc(n)}</b></span></a>`).join('')}</div></div>
          <div style="min-width:0"><b>${esc(alvo || 'Escolha ao lado')}</b>${mapa(historico(w, ok), '<small>Tot</small>')}</div></div></section>` };
  };

  // ======================= ACERVO =======================
  const telaAcervo = () => {
    const cats = catPorId(), q = u.q.trim().toLowerCase(), subs = Object.fromEntries(S.db.mus_subcategorias.map(s => [s.id, s.nome]));
    const lista = S.db.musicas.filter(m => (!u.fcat || m.categoria_id === u.fcat) && (!q || (m.titulo + ' ' + M.artistasTexto(m) + ' ' + m.gravadora).toLowerCase().includes(q))).sort((a, b) => a.titulo.localeCompare(b.titulo));
    const regrasDe = m => [m.bloqueios.length ? 'restrição de horário' : '', m.bloqueio_de && m.bloqueio_ate ? `bloqueio ${m.bloqueio_de}–${m.bloqueio_ate}` : '', m.intervalo_h ? `intervalo ${m.intervalo_h}h` : '', m.grupo_versoes ? `versões ${m.grupo_versoes}` : '',
      m.deve_tocar ? `deve tocar ${m.deve_tocar}x` : '', m.limite_dia ? `limite ${m.limite_dia}x` : '', m.vinheta_id ? 'vinheta vinculada' : ''].filter(Boolean).join(', ');
    const filtro = `<div class="row mid" style="margin-bottom:16px;gap:10px"><input type="search" id="musQ" data-musq="q" value="${esc(u.q)}" placeholder="Buscar por música, intérprete ou gravadora" style="flex:1 1 260px;height:44px" aria-label="Buscar no acervo">
      <select data-mus2="fcat" aria-label="Categoria" style="height:44px"><option value="">Todas as categorias</option>${S.db.mus_categorias.map(c => `<option value="${c.id}"${c.id === u.fcat ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>`;
    const corpo = !S.db.musicas.length ? `<div class="card empty"><b>O acervo está vazio</b>Cadastre as músicas uma a uma, importe os arquivos do HD (o SONVI lê o nome e as etiquetas de cada arquivo) ou traga uma planilha de outro programa.</div>`
      : S.celular ? `<div class="card"><div class="list">${lista.map(m => `<a data-act="musFicha" data-id="${m.id}"><span class="tx"><b>${esc(m.titulo)}${m.novidade ? ' <span class="chip">novidade</span>' : ''}</b><small>${esc(M.artistasTexto(m))}</small><span class="row mid" style="gap:6px;margin-top:6px">${catPill(cats[m.categoria_id])}${rtPill(m)}${pesoSel(m)}${m.ativa ? '' : S.tag('Desativada', 'red')}</span></span></a>`).join('')}</div></div>`
      : `<div class="card"><div class="scroll"><table><thead><tr><th>Música</th><th>Intérprete</th><th>Categoria</th><th>Subcategoria</th><th>Ritmo</th><th>Peso</th><th class="r">Duração</th><th>Regras próprias</th><th></th></tr></thead><tbody>${lista.map(m => `<tr class="click" data-act="musFicha" data-id="${m.id}">
          <td><b>${esc(m.titulo)}</b>${m.novidade ? ' <span class="chip">novidade</span>' : ''}</td><td>${esc(M.artistasTexto(m))}</td><td>${catPill(cats[m.categoria_id])}</td><td class="muted">${esc(subs[m.subcategoria_id] || '—')}</td>
          <td>${rtPill(m)}</td><td>${pesoSel(m)}</td><td class="r num">${M.mmss(m.duracao)}</td><td class="muted small">${esc(regrasDe(m)) || '—'}</td><td>${m.ativa ? '' : S.tag('Desativada', 'red')}</td></tr>`).join('')}</tbody></table></div>
          ${lista.length ? '' : '<p class="muted">Nada encontrado com esse filtro.</p>'}</div>`;
    return { acoes:pode() ? `<button class="btn" data-act="musImportarHD">${S.svg('baixar')}Importar do HD</button><button class="btn" data-act="musImportarPlanilha">${S.svg('doc')}Importar planilha</button><button class="btn pri" data-act="musFicha">${S.svg('mais')}Nova música</button>` : '',
      corpo:`<p class="muted" style="margin-bottom:12px">${S.db.musicas.length} músicas · ${S.db.musicas.filter(m => m.ativa).length} ativas</p>${filtro}${corpo}
        <input type="file" id="musArqHD" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.wma" multiple hidden><input type="file" id="musArqPlan" accept=".csv,text/csv,text/plain" hidden>` };
  };

  // Ficha musical (diálogo largo). Cadastro existente abre para consulta; "Editar" libera.
  const gradeRestricao = (bl, trava) => `<div class="f" style="grid-column:1/-1">Grade de restrição <small class="muted">Verde: pode tocar · vermelho: bloqueado. Clique para trocar.</small>
    <div class="scroll"><div class="mus-mapa restr"><span></span>${Array.from({ length:24 }, (_, h) => `<small>${M.pad(h)}</small>`).join('')}
      ${M.DC.map((d, di) => `<small>${d}</small>${Array.from({ length:24 }, (_, h) => { const k = di + '-' + h, b = bl.includes(k); return `<button type="button" class="${b ? 'bl' : ''}" data-act="musBloq" data-k="${k}" aria-label="${d} ${M.pad(h)}h ${b ? 'bloqueada' : 'liberada'}"${trava}></button>`; }).join('')}`).join('')}</div></div>
    <div class="row mid" style="gap:6px;margin-top:6px">${[['nada', 'Liberar tudo'], ['noite', 'Só à noite (19h às 05h)'], ['dia', 'Só de dia (06h às 18h)'], ['fds', 'Só madrugada de fim de semana']].map(([k, n]) => `<button type="button" class="btn sm" data-act="musBloqPreset" data-p="${k}"${trava}>${n}</button>`).join('')}</div>
    <input type="hidden" name="bloqueios" value="${esc(bl.join(','))}"></div>`;
  const opcoes = (lista, sel) => lista.map(([k, n]) => `<option value="${esc(k)}"${String(k) === String(sel ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const horas24 = Array.from({ length:24 }, (_, h) => [h, M.pad(h) + 'h']);
  S.actions.musFicha = d => {
    const novo = !d.id, m = novo ? { ativa:true, ritmo:'M', peso:3, voz:'M', origem:'N', duracao:0, entrada:0, termino:0, intervalo_h:0, espera_h:2, deve_tocar:0, deve_de:6, deve_ate:22, limite_dia:0, bloqueios:[], categoria_id:(S.db.mus_categorias[0] || {}).id, novidade:true, ...(d.pre || {}) }
      : S.db.musicas.find(x => x.id === d.id);
    if (novo && !pode()) return;
    const v = Object.assign({}, m, { duracao_t:m.duracao ? M.mmss(m.duracao) : '', entrada_t:m.entrada ? M.mmss(m.entrada) : '', termino_t:m.termino ? M.mmss(m.termino) : '', bpm:m.bpm || '' });
    const trava = !novo && !d.editar ? ' disabled data-trava="1"' : '';
    const sel = (k, label, lista) => ({ html:`<label class="f">${label}<select name="${k}"${trava}>${opcoes(lista, v[k])}</select></label>` });
    const w = montar(), hist = `<div class="f" style="grid-column:1/-1">Histórico desta semana <small class="muted">quantas vezes tocou em cada dia e hora</small>${novo ? '<p class="muted small">Ainda não tocou.</p>' : mapa(historico(w, x => x.id === m.id), '<small>Tot</small>')}</div>`;
    S.form(novo ? 'Nova música' : esc(m.titulo), [
      { k:'titulo', label:'Música', req:true, ph:'Ex.: Evidências' }, { k:'interprete', label:'Intérprete', req:true, ph:'Ex.: Chitãozinho & Xororó' },
      { k:'interprete2', label:'2º intérprete', ph:'Ex.: Lauana Prado' }, { k:'compositor', label:'Compositor', ph:'Ex.: José Augusto e Paulo Sérgio Valle' },
      { k:'gravadora', label:'Gravadora', ph:'Ex.: Som Livre' }, { k:'disco', label:'Disco', ph:'Ex.: Ao Vivo' }, { k:'ano', label:'Ano', mask:'ano' }, { k:'bpm', label:'BPM', mask:'int', ph:'Ex.: 96' },
      sel('categoria_id', 'Categoria', S.db.mus_categorias.map(c => [c.id, c.nome])), sel('subcategoria_id', 'Subcategoria', [['', 'Nenhuma']].concat(S.db.mus_subcategorias.map(s => [s.id, s.nome]))),
      sel('ritmo', 'Ritmo', ['L', 'M', 'R'].map(k => [k, cfg().ritmos[k].nome])), sel('peso', 'Peso (importância)', [1, 2, 3, 4, 5].map(p => [p, p + (p === 5 ? ' · mais forte' : p === 1 ? ' · mais fraco' : '')])),
      sel('voz', 'Voz', [['M', 'Masculina'], ['F', 'Feminina'], ['D', 'Dupla']]), sel('origem', 'Origem', [['N', 'Nacional'], ['I', 'Internacional']]),
      { k:'duracao_t', label:'Duração', req:true, mask:'tempo', ph:'Ex.: 03:25' }, { k:'entrada_t', label:'Entrada da voz', mask:'tempo', ph:'Ex.: 00:12' },
      { k:'termino_t', label:'Ponto de término (mixagem)', mask:'tempo', ph:'Ex.: 03:18' }, sel('vinheta_id', 'Vinheta vinculada (toca antes dela)', [['', 'Nenhuma']].concat(S.db.mus_vinhetas.map(x => [x.id, x.nome]))),
      { k:'intervalo_h', label:'Intervalo próprio (horas; 0 = da categoria)', mask:'int' }, { k:'grupo_versoes', label:'Grupo de versões', mask:'sigla', ph:'Ex.: EVID' },
      { k:'espera_h', label:'Espera entre versões (horas)', mask:'int' }, { k:'limite_dia', label:'Limite por dia (0 = sem limite)', mask:'int' },
      { k:'deve_tocar', label:'Deve tocar (vezes por dia)', mask:'int' }, sel('deve_de', 'Das', horas24), sel('deve_ate', 'Até', horas24),
      { k:'bloqueio_de', label:'Não tocar das', mask:'tempo', ph:'Ex.: 12:00' }, { k:'bloqueio_ate', label:'até as', mask:'tempo', ph:'Ex.: 12:30' },
      { k:'arquivo', label:'Arquivo de áudio', full:true, ph:'Ex.: D:\\Acervo\\evidencias.mp3' },
      { html:gradeRestricao(m.bloqueios || [], trava) }, hist,
      { k:'observacoes', label:'Observações', type:'textarea', ph:'Ex.: versão editada para rádio' },
      { k:'novidade', label:'Novidade', type:'checkbox' }, { k:'ativa', label:'Ativa (desmarque para tirar da programação sem apagar)', type:'checkbox' },
      ...(novo ? [] : [{ html:'<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir música</button></div>' }])], v,
      f => salvarMusica(m, f), 'Salvar', { editar:!!d.editar });
    const dlg = document.getElementById('dlg'), ok = dlg.onclose; dlg.classList.add('largo');
    dlg.onclose = () => { dlg.classList.remove('largo');
      if (dlg.returnValue === 'excluir') { if (confirm(`Excluir "${m.titulo}" do acervo? Onde ela já foi programada, a posição fica vazia.`)) S.run(() => S.excluir('musicas', m.id), 'Música excluída'); return; }
      if (ok) ok(); };
    if (!pode()) dlg.querySelectorAll('[data-act="formEditar"]').forEach(b => b.remove());
  };
  const salvarMusica = (m, f) => {
    const dur = M.lerTempo(f.duracao_t);
    if (dur === null || dur < 10) { // reabre a ficha com o que foi digitado e mostra o erro embaixo do campo
      S.actions.musFicha({ id:m.id, editar:1 });
      document.querySelectorAll('#dlg [name]').forEach(c => { if (c.type === 'checkbox') c.checked = f[c.name] === 'on'; else if (c.name in f) c.value = f[c.name]; });
      const c = document.querySelector('#dlg [name="duracao_t"]');
      if (c) { c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', 'erroDuracao'); c.insertAdjacentHTML('afterend', '<small class="erro-campo" id="erroDuracao">Duração inválida. Use minutos e segundos, ex.: 03:25</small>'); c.focus(); c.addEventListener('input', () => { c.removeAttribute('aria-invalid'); const e = document.getElementById('erroDuracao'); if (e) e.remove(); }, { once:true }); }
      return; }
    const n = k => parseInt(f[k], 10) || 0;
    const row = { titulo:f.titulo.trim(), interprete:f.interprete.trim(), interprete2:(f.interprete2 || '').trim(), compositor:f.compositor || '', gravadora:f.gravadora || '', disco:f.disco || '', ano:f.ano || '',
      bpm:f.bpm ? n('bpm') : null, categoria_id:f.categoria_id, subcategoria_id:f.subcategoria_id || null, ritmo:f.ritmo, peso:n('peso'), voz:f.voz, origem:f.origem, novidade:f.novidade === 'on',
      duracao:dur, entrada:M.lerTempo(f.entrada_t) || 0, termino:M.lerTempo(f.termino_t) || 0, intervalo_h:Math.min(168, n('intervalo_h')), grupo_versoes:f.grupo_versoes || '', espera_h:Math.min(168, n('espera_h')),
      deve_tocar:Math.min(99, n('deve_tocar')), deve_de:n('deve_de'), deve_ate:n('deve_ate'), limite_dia:Math.min(99, n('limite_dia')), ativa:f.ativa === 'on',
      bloqueios:(f.bloqueios || '').split(',').filter(Boolean), bloqueio_de:M.lerTempo(f.bloqueio_de) !== null ? f.bloqueio_de : '', bloqueio_ate:M.lerTempo(f.bloqueio_ate) !== null ? f.bloqueio_ate : '',
      vinheta_id:f.vinheta_id || null, arquivo:f.arquivo || '', observacoes:f.observacoes || '' };
    S.run(() => S.salvar('musicas', Object.assign(row, m.id ? { id:m.id } : { veiculo_id:S.ui.vehicleId })), 'Ficha salva. As regras já valem na programação.');
  };

  // Importar do HD: lê nome, etiquetas e duração de cada arquivo (nada é enviado; o áudio continua no computador)
  let importados = [];
  const telaImport = () => {
    const cats = S.db.mus_categorias, existe = x => S.db.musicas.some(m => m.titulo.toLowerCase() === x.titulo.toLowerCase() && m.interprete.toLowerCase() === x.interprete.toLowerCase());
    const modo = (document.querySelector('#dlg [name=modo]:checked') || {}).value || 'meta';
    const linhas = importados.map(a => { const x = modo === 'meta' && a.tags.titulo ? { titulo:a.tags.titulo, interprete:a.tags.interprete || a.nome.interprete } : a.nome;
      return Object.assign({}, a, x, { status:!x.interprete ? 'falta' : existe(x) ? 'existe' : 'nova' }); });
    return { linhas, html:`<h2>Importar do HD</h2><p class="muted small">${importados.length} arquivo(s). O áudio não sai do seu computador: o SONVI só lê o nome, as etiquetas e a duração.</p>
      <div class="seg" style="margin:0"><label class="chk" style="padding:6px 12px"><input type="radio" name="modo" value="meta" data-act="musImpModo"${modo === 'meta' ? ' checked' : ''}>Pelas etiquetas do arquivo</label><label class="chk" style="padding:6px 12px"><input type="radio" name="modo" value="nome" data-act="musImpModo"${modo === 'nome' ? ' checked' : ''}>Pelo nome (Artista - Música)</label></div>
      <label class="f">Entram na categoria<select name="categoria_id">${opcoes(cats.map(c => [c.id, c.nome]), (cats.find(c => c.codigo === 'LAN') || cats[0] || {}).id)}</select></label>
      <div class="list mus-imp">${linhas.map(l => `<div><span class="tx"><b>${esc(l.titulo)}</b><small>${esc(l.interprete || 'sem intérprete')} · ${l.duracao ? M.mmss(l.duracao) : 'duração não lida'} · ${esc(l.arquivo)}</small></span>${l.status === 'nova' ? S.tag('Nova', 'green') : l.status === 'existe' ? S.tag('Já está no acervo', 'gray') : S.tag('Falta o intérprete', 'orange')}</div>`).join('')}</div>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Importar ${linhas.filter(l => l.status === 'nova').length} música(s)</button></div>` };
  };
  const abrirImport = () => {
    const t = telaImport();
    S.dialog(t.html, f => {
      const novas = telaImport.ultima.filter(l => l.status === 'nova');
      if (!novas.length) return S.toast('Nenhuma música nova para importar.');
      S.run(async () => {
        const rows = novas.map(l => ({ veiculo_id:S.ui.vehicleId, titulo:l.titulo, interprete:l.interprete, categoria_id:f.categoria_id, duracao:Math.max(10, l.duracao || 180), novidade:true,
          disco:l.tags.disco || '', ano:l.tags.ano || '', gravadora:l.tags.gravadora || '', compositor:l.tags.compositor || '', bpm:l.tags.bpm || null, arquivo:l.arquivo }));
        const r = await S.q(S.sb.from('musicas').insert(rows).select()); S.db.musicas.push(...r);
      }, `${novas.length} música(s) importada(s). Revise a ficha de cada uma (ritmo, peso, regras).`);
    });
    telaImport.ultima = t.linhas;
    document.getElementById('dlg').classList.add('largo');
    const dlg = document.getElementById('dlg'), ok = dlg.onclose; dlg.onclose = () => { dlg.classList.remove('largo'); telaImport.ultima = telaImport().linhas; if (ok) ok(); };
  };
  S.actions.musImpModo = () => { const dlg = document.getElementById('dlg'), modo = dlg.querySelector('[name=modo]:checked').value, cat = dlg.querySelector('[name=categoria_id]').value;
    const t = telaImport(); dlg.querySelector('form').innerHTML = t.html; dlg.querySelector(`[name=modo][value=${modo}]`).checked = true; dlg.querySelector('[name=categoria_id]').value = cat; telaImport.ultima = telaImport().linhas; };

  // Importar planilha de outro programa: colunas reconhecidas pelo nome
  const importarPlanilha = async arquivo => {
    const linhas = M.lerPlanilha(await arquivo.text()), cats = S.db.mus_categorias;
    const pega = (o, ...ks) => { for (const k of ks) if (o[k]) return o[k]; return ''; };
    const catDe = t => { const n = String(t || '').toLowerCase(); return (cats.find(c => c.nome.toLowerCase() === n || c.codigo.toLowerCase() === n) || cats.find(c => c.codigo === 'LAN') || cats[0]).id; };
    const rows = linhas.map(o => ({ titulo:pega(o, 'titulo', 'musica', 'nome', 'title'), interprete:pega(o, 'interprete', 'artista', 'cantor', 'artist'), interprete2:pega(o, 'interprete2', 'participacao'),
      compositor:pega(o, 'compositor', 'autor'), gravadora:pega(o, 'gravadora', 'selo'), disco:pega(o, 'disco', 'album'), ano:pega(o, 'ano').slice(0, 4),
      categoria_id:catDe(pega(o, 'categoria')), duracao:M.lerTempo(pega(o, 'duracao', 'tempo')) || parseInt(pega(o, 'segundos'), 10) || 180,
      ritmo:{ l:'L', lento:'L', lenta:'L', m:'M', medio:'M', media:'M', r:'R', rapido:'R', rapida:'R' }[pega(o, 'ritmo').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || 'M',
      peso:Math.min(5, Math.max(1, parseInt(pega(o, 'peso'), 10) || 3)) })).filter(r => r.titulo && r.interprete);
    const novas = rows.filter(r => !S.db.musicas.some(m => m.titulo.toLowerCase() === r.titulo.toLowerCase() && m.interprete.toLowerCase() === r.interprete.toLowerCase()));
    if (!novas.length) return S.toast(rows.length ? 'Todas as músicas da planilha já estão no acervo.' : 'Não achei as colunas "música" e "intérprete" na planilha.');
    if (!confirm(`Importar ${novas.length} música(s) da planilha "${arquivo.name}"? ${rows.length - novas.length ? `${rows.length - novas.length} já estavam no acervo e serão puladas.` : ''}`)) return;
    S.run(async () => { for (let i = 0; i < novas.length; i += 500) { const r = await S.q(S.sb.from('musicas').insert(novas.slice(i, i + 500).map(x => Object.assign({ veiculo_id:S.ui.vehicleId }, x))).select()); S.db.musicas.push(...r); } },
      `${novas.length} música(s) importada(s) da planilha.`);
  };
  document.addEventListener('change', async e => {
    if (e.target.id === 'musArqHD' && e.target.files.length) {
      const arqs = [...e.target.files]; e.target.value = '';
      S.toast(`Lendo ${arqs.length} arquivo(s)…`);
      importados = await Promise.all(arqs.map(async a => { const [tags, duracao] = await Promise.all([M.lerEtiquetas(a), M.lerDuracao(a)]); return { arquivo:a.name, nome:M.peloNome(a.name), tags, duracao }; }));
      abrirImport();
    }
    if (e.target.id === 'musArqPlan' && e.target.files.length) { const a = e.target.files[0]; e.target.value = ''; importarPlanilha(a); }
  });

  // ======================= CATEGORIAS =======================
  const telaCats = () => {
    const ed = pode(), n = id => S.db.musicas.filter(m => m.categoria_id === id && m.ativa).length;
    const cats = S.db.mus_categorias.slice().sort((a, b) => a.prioridade - b.prioridade || a.codigo.localeCompare(b.codigo));
    const lista = (titulo, itens, act, vazio, botao) => `<section class="card"><div class="hd"><h3>${titulo}</h3>${ed && botao ? `<a data-act="${act}">${botao}</a>` : ''}</div>${itens || `<p class="muted">${vazio}</p>`}</section>`;
    return { acoes:ed ? `<button class="btn pri" data-act="musCat">${S.svg('mais')}Nova categoria</button>` : '',
      corpo:`<section class="card"><div class="scroll"><table><thead><tr><th>Código</th><th>Categoria</th><th class="r">Máx. juntas</th><th class="r">Prioridade</th><th class="r">Rotatividade</th><th class="r">Músicas ativas</th></tr></thead><tbody>${cats.map(c => `<tr class="click" data-act="musCat" data-id="${c.id}"><td><span class="chip">${esc(c.codigo)}</span></td><td>${catPill(c)}</td><td class="r">${c.max_juntas}</td><td class="r">${c.prioridade}</td><td class="r">${c.rotatividade}%</td><td class="r">${n(c.id)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small" style="margin-top:12px">Rotatividade 70% = antes de repetir, 70% das outras músicas da categoria precisam tocar. Prioridade 1 é preenchida primeiro na semana inteira, dando ênfase aos maiores sucessos.</p></section>
        <div class="cols">
          ${lista('Ritmos', `<div class="legend">${['L', 'M', 'R'].map(k => `<a data-act="musRitmo" data-k="${k}"><span class="mus-rt" style="--tone:var(--${RITMO_TOM[k]})">${k}</span><span class="grow">${esc(cfg().ritmos[k].nome)}</span><span class="muted small">máx. juntos</span><span class="n">${cfg().ritmos[k].max}</span></a>`).join('')}</div>`, '', '')}
          ${lista('Subcategorias', S.db.mus_subcategorias.length ? `<div class="legend">${S.db.mus_subcategorias.map(s => `<a data-act="musSub" data-id="${s.id}"><span class="grow">${esc(s.nome)}</span><span class="n">${S.db.musicas.filter(m => m.subcategoria_id === s.id).length}</span></a>`).join('')}</div>` : '', 'musSub', 'Nenhuma subcategoria. Ex.: Sofrência, Universitário, Modão.', 'Nova')}
        </div>
        <div class="cols">
          ${lista('Grupos de conflito de vozes', S.db.mus_grupos.length ? `<div class="legend">${S.db.mus_grupos.map(g => `<a data-act="musGrupo" data-id="${g.id}"><span class="tx grow"><b>${esc(g.nome)}</b><small class="muted"> · ${g.artistas.length ? esc(g.artistas.join(', ')) : 'sem artistas'}</small></span><span class="muted small">${g.distancia} min</span></a>`).join('')}</div>` : '', 'musGrupo', 'Ex.: "Vozes femininas da sofrência" com distância de 30 minutos.', 'Novo grupo')}
          ${lista('Vinhetas', S.db.mus_vinhetas.length ? `<div class="legend">${S.db.mus_vinhetas.map(v => `<a data-act="musVinheta" data-id="${v.id}"><span class="grow">${esc(v.nome)}${v.ativa ? '' : ' ' + S.tag('Inativa', 'gray')}</span><span class="muted small num">${M.mmss(v.duracao)}</span></a>`).join('')}</div>` : '', 'musVinheta', 'Nenhuma vinheta cadastrada.', 'Nova vinheta')}
        </div>
        ${lista('Textos informativos', `<div class="legend">${(cfg().informativos || []).map(t => `<div><span class="grow">${esc(t)}</span></div>`).join('') || '<p class="muted">Nenhum.</p>'}</div>`, 'musInfos', '', 'Editar')}` };
  };
  const excluirNoForm = (tabela, id, aviso) => { const d = document.getElementById('dlg'), ok = d.onclose; d.onclose = () => { if (d.returnValue === 'excluir') { if (confirm(aviso)) S.run(() => S.excluir(tabela, id), 'Excluído'); } else if (ok) ok(); }; };
  const btnExcluir = { html:'<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir</button></div>' };
  const soLeitura = () => { if (!pode()) document.querySelectorAll('#dlg [data-act="formEditar"]').forEach(b => b.remove()); };

  Object.assign(S.actions, {
    musCat: d => { const c = d.id ? S.db.mus_categorias.find(x => x.id === d.id) : { max_juntas:1, prioridade:S.db.mus_categorias.length + 1, rotatividade:60, cor:S.db.mus_categorias.length % TONS.length };
      if (!c.id && !pode()) return;
      S.form(c.id ? esc(c.nome) : 'Nova categoria', [{ k:'codigo', label:'Código', req:true, mask:'sigla', ph:'Ex.: SUC' }, { k:'nome', label:'Nome', req:true, ph:'Ex.: Sucessos' },
        { k:'max_juntas', label:'Máximo de músicas juntas', mask:'int', req:true }, { k:'prioridade', label:'Prioridade (1 = preenchida primeiro)', mask:'int', req:true },
        { k:'rotatividade', label:'Rotatividade (%)', mask:'int', req:true }, { k:'cor', label:'Cor', type:'select', options:TONS.map((t, i) => [i, ['Azul', 'Verde', 'Laranja', 'Roxo', 'Azul-claro', 'Vermelho', 'Cinza'][i]]) },
        ...(c.id ? [btnExcluir] : [])], c,
        f => S.run(() => S.salvar('mus_categorias', Object.assign({ codigo:f.codigo.toUpperCase(), nome:f.nome.trim(), max_juntas:Math.min(20, Math.max(1, +f.max_juntas || 1)), prioridade:Math.min(9, Math.max(1, +f.prioridade || 1)), rotatividade:Math.min(100, +f.rotatividade || 0), cor:+f.cor || 0 }, c.id ? { id:c.id } : { veiculo_id:S.ui.vehicleId })), 'Categoria salva'));
      if (c.id) excluirNoForm('mus_categorias', c.id, 'Excluir esta categoria? Só é possível se nenhuma música estiver nela.'); soLeitura(); },
    musSub: d => { const s = d.id ? S.db.mus_subcategorias.find(x => x.id === d.id) : {}; if (!s.id && !pode()) return;
      S.form(s.id ? esc(s.nome) : 'Nova subcategoria', [{ k:'nome', label:'Nome', req:true, ph:'Ex.: Sofrência', full:true }, ...(s.id ? [btnExcluir] : [])], s,
        f => S.run(() => S.salvar('mus_subcategorias', Object.assign({ nome:f.nome.trim() }, s.id ? { id:s.id } : { veiculo_id:S.ui.vehicleId })), 'Subcategoria salva'));
      if (s.id) excluirNoForm('mus_subcategorias', s.id, 'Excluir esta subcategoria? As músicas ficam sem subcategoria.'); soLeitura(); },
    musVinheta: d => { const v = d.id ? S.db.mus_vinhetas.find(x => x.id === d.id) : { duracao:5, ativa:true }; if (!v.id && !pode()) return;
      S.form(v.id ? esc(v.nome) : 'Nova vinheta', [{ k:'nome', label:'Nome', req:true, ph:'Ex.: Vinheta de passagem 03' }, { k:'duracao_t', label:'Duração', mask:'tempo', req:true, ph:'Ex.: 00:06' }, { k:'ativa', label:'Ativa (entra nos formatos)', type:'checkbox' }, ...(v.id ? [btnExcluir] : [])],
        Object.assign({}, v, { duracao_t:M.mmss(v.duracao) }),
        f => S.run(() => S.salvar('mus_vinhetas', Object.assign({ nome:f.nome.trim(), duracao:Math.max(1, Math.min(600, M.lerTempo(f.duracao_t) || 5)), ativa:f.ativa === 'on' }, v.id ? { id:v.id } : { veiculo_id:S.ui.vehicleId })), 'Vinheta salva'));
      if (v.id) excluirNoForm('mus_vinhetas', v.id, 'Excluir esta vinheta?'); soLeitura(); },
    musGrupo: d => { const g = d.id ? S.db.mus_grupos.find(x => x.id === d.id) : { distancia:30, artistas:[] }; if (!g.id && !pode()) return;
      const todos = [...new Set(S.db.musicas.flatMap(M.artistas))].sort((a, b) => a.localeCompare(b));
      S.form(g.id ? esc(g.nome) : 'Novo grupo de vozes', [{ k:'nome', label:'Nome do grupo', req:true, ph:'Ex.: Vozes femininas da sofrência' }, { k:'distancia', label:'Distância mínima (minutos)', mask:'int', req:true },
        { k:'artistas_t', label:'Artistas (um por linha)', type:'textarea', ph:'Ex.:\nMarília Mendonça\nSimone Mendes' },
        { html:`<p class="muted small" style="grid-column:1/-1">Artistas do acervo: ${esc(todos.slice(0, 60).join(' · ')) || 'nenhum ainda'}</p>` }, ...(g.id ? [btnExcluir] : [])],
        Object.assign({}, g, { artistas_t:g.artistas.join('\n') }),
        f => S.run(() => S.salvar('mus_grupos', Object.assign({ nome:f.nome.trim(), distancia:Math.min(1440, +f.distancia || 0), artistas:[...new Set(f.artistas_t.split('\n').map(x => x.trim()).filter(Boolean))] }, g.id ? { id:g.id } : { veiculo_id:S.ui.vehicleId })), 'Grupo salvo'));
      if (g.id) excluirNoForm('mus_grupos', g.id, 'Excluir este grupo?'); soLeitura(); },
    musRitmo: d => { const r = cfg().ritmos[d.k];
      S.form(`Ritmo ${esc(r.nome)}`, [{ k:'nome', label:'Nome', req:true }, { k:'max', label:'Máximo de músicas seguidas', mask:'int', req:true }], { id:d.k, nome:r.nome, max:r.max },
        f => S.run(() => salvarConfig({ ritmos:Object.assign({}, cfg().ritmos, { [d.k]:{ nome:f.nome.trim(), max:Math.max(1, +f.max || 1) } }) }), 'Ritmo salvo')); soLeitura(); },
    musInfos: () => S.form('Textos informativos', [{ k:'t', label:'Um por linha (entram em rodízio nas posições "Informativo")', type:'textarea', full:true, ph:'Ex.:\nHora certa\nPrevisão do tempo' }], { t:(cfg().informativos || []).join('\n') },
      f => S.run(() => salvarConfig({ informativos:f.t.split('\n').map(x => x.trim()).filter(Boolean) }), 'Textos salvos'), 'Salvar', { editar:true }),
  });

  // ======================= FORMATOS =======================
  const telaFormatos = () => {
    const ed = pode(), fs = S.db.mus_formatos, cats = catPorId();
    if (!u.fmt || !formato(u.fmt)) u.fmt = fs.length ? fs[0].id : null;
    const f0 = formato(u.fmt), f = u.fmtRasc && u.fmtRasc.id === u.fmt ? u.fmtRasc : f0;
    const grade = u.gradeRasc || cfg().grade || [], horasDe = id => grade.reduce((t, l) => t + (l || []).filter(x => x === id).length, 0);
    const nomePos = p => p === 'VIN' ? ['Vinheta', 'gray'] : p === 'BRK' ? ['Break', 'ink-tone'] : p === 'INF' ? ['Informativo', 'sky'] : cats[p] ? [cats[p].nome, tom(cats[p].cor)] : ['Categoria apagada', 'red'];
    if (!u.pincel || !formato(u.pincel)) u.pincel = u.fmt;
    const cards = `<div class="tiles">${fs.map(x => `<button class="tile mus-fmt${x.id === u.fmt ? ' on' : ''}" style="--tone:var(--${tom(x.cor)})" data-act="musFmt" data-id="${x.id}"><small>${x.automatico ? 'Automático' : 'Ao vivo'} · ${horasDe(x.id)} h na semana</small><b>${esc(x.nome)}</b><span>${x.posicoes.length} posições · ${x.posicoes.filter(p => cats[p]).length} músicas</span></button>`).join('')}</div>`;
    const editor = f ? `<section class="card"><div class="hd"><h3>${esc(f.nome)}</h3>${ed ? `<span class="row mid" style="gap:8px">${u.fmtRasc ? '<span class="sujo"><i></i>Alterações não salvas</span><button class="btn sm" data-act="musFmtDesfaz">Cancelar</button><button class="btn sm pri" data-act="musFmtSalvar">Salvar formato</button>' : `<button class="btn sm" data-act="musFmtProps">${S.svg('editar')}Nome e permissões</button>`}</span>` : ''}</div>
      <div class="row mid" style="gap:8px;margin-bottom:14px">${[['permitir_mover', 'Permitir mover'], ['permitir_excluir', 'Permitir excluir'], ['automatico', 'Permitir automático']].map(([k, n]) => S.tag(`${n}: ${f[k] ? 'sim' : 'não'}`, f[k] ? 'green' : 'gray')).join('')}
        ${S.tag(f.liberadas && f.liberadas.length ? 'Busca manual: ' + f.liberadas.map(id => cats[id] ? cats[id].nome : '').filter(Boolean).join(', ') : 'Busca manual: todas as categorias', 'blue')}</div>
      <div class="mus-pos">${f.posicoes.map((p, i) => { const [n, t] = nomePos(p);
        return `<span class="pill" style="--tone:var(--${t})">${i + 1}. ${esc(n)}${ed ? `<button class="x" data-act="musPos" data-i="${i}" data-o="esq" aria-label="Mover para a esquerda">‹</button><button class="x" data-act="musPos" data-i="${i}" data-o="dir" aria-label="Mover para a direita">›</button><button class="x" data-act="musPos" data-i="${i}" data-o="del" aria-label="Remover posição ${i + 1}">×</button>` : ''}</span>`; }).join('') || '<p class="muted">Nenhuma posição.</p>'}</div>
      ${ed ? `<p class="muted small" style="margin:14px 0 8px">Adicionar no fim</p><div class="row mid" style="gap:8px">${S.db.mus_categorias.map(c => [c.id, c.nome]).concat([['VIN', 'Vinheta'], ['INF', 'Informativo'], ['BRK', 'Break']]).map(([k, n]) => `<button class="btn sm tracej" data-act="musPos" data-o="add" data-k="${k}">${S.svg('mais')}${esc(n)}</button>`).join('')}</div>` : ''}</section>` : '<div class="card empty"><b>Nenhum formato</b>Crie o primeiro formato.</div>';
    const gradeHtml = `<section class="card"><div class="hd"><h3>Grade da semana</h3>${ed ? (u.gradeRasc ? '<span class="row mid" style="gap:8px"><span class="sujo"><i></i>Alterações não salvas</span><button class="btn sm" data-act="musGradeDesfaz">Cancelar</button><button class="btn sm pri" data-act="musGradeSalvar">Salvar grade</button></span>' : '<span>Escolha um formato e clique nas horas</span>') : ''}</div>
      ${ed ? `<div class="row mid" style="gap:8px;margin-bottom:12px">${fs.map(x => `<button class="btn sm${x.id === u.pincel ? ' pri' : ''}" data-act="musPincel" data-id="${x.id}"><span class="dot" style="background:var(--${tom(x.cor)})"></span>${esc(x.nome)}</button>`).join('')}</div>` : ''}
      <div class="scroll"><div class="mus-mapa grade"><span></span>${Array.from({ length:24 }, (_, h) => `<small>${M.pad(h)}</small>`).join('')}
        ${M.DC.map((d, di) => `<small>${d}</small>${Array.from({ length:24 }, (_, h) => { const x = formato((grade[di] || [])[h]);
          return `<button style="--tone:var(--${x ? tom(x.cor) : 'line'})" data-act="musPinta" data-d="${di}" data-h="${h}" title="${d} ${M.pad(h)}h: ${x ? esc(x.nome) : 'sem formato'}" aria-label="${d} ${M.pad(h)}h: ${x ? esc(x.nome) : 'sem formato'}"${ed ? '' : ' disabled'}></button>`; }).join('')}`).join('')}</div></div>
      <p class="muted small" style="margin-top:10px">Depois de mudar formatos ou a grade, use "Gerar a semana" na Programação para refazer as horas.</p></section>`;
    return { acoes:ed ? `<button class="btn pri" data-act="musFmtNovo">${S.svg('mais')}Novo formato</button>` : '', corpo:cards + editor + gradeHtml };
  };
  const rascunhoFmt = () => { if (!u.fmtRasc || u.fmtRasc.id !== u.fmt) u.fmtRasc = JSON.parse(JSON.stringify(formato(u.fmt))); return u.fmtRasc; };
  Object.assign(S.actions, {
    musFmt: d => { if (u.fmtRasc && u.fmtRasc.id !== d.id && !confirm('Descartar as alterações do formato?')) return; if (u.fmtRasc && u.fmtRasc.id !== d.id) u.fmtRasc = null; u.fmt = d.id; u.pincel = d.id; S.render(); },
    musPos: d => { const f = rascunhoFmt(), i = +d.i, p = f.posicoes;
      if (d.o === 'add') p.push(d.k); else if (d.o === 'del') p.splice(i, 1);
      else { const j = d.o === 'esq' ? i - 1 : i + 1; if (j >= 0 && j < p.length) [p[i], p[j]] = [p[j], p[i]]; }
      S.render(); },
    musFmtDesfaz: () => { u.fmtRasc = null; S.render(); },
    musFmtSalvar: () => { const f = u.fmtRasc; S.run(async () => { await S.salvar('mus_formatos', { id:f.id, posicoes:f.posicoes }); u.fmtRasc = null; }, 'Formato salvo'); },
    musFmtProps: () => { const f = formato(u.fmt), cats = S.db.mus_categorias;
      S.form(esc(f.nome), [{ k:'nome', label:'Nome do formato', req:true, ph:'Ex.: Sexta à noite' }, { k:'cor', label:'Cor', type:'select', options:TONS.map((t, i) => [i, ['Azul', 'Verde', 'Laranja', 'Roxo', 'Azul-claro', 'Vermelho', 'Cinza'][i]]) },
        { k:'permitir_mover', label:'Permitir mover posições na programação', type:'checkbox' }, { k:'permitir_excluir', label:'Permitir excluir posições na programação', type:'checkbox' },
        { k:'automatico', label:'Permitir automático (desmarque para horário ao vivo)', type:'checkbox' },
        { html:`<div class="f" style="grid-column:1/-1">Categorias liberadas na busca manual <small class="muted">nenhuma marcada = todas</small><div class="row mid" style="gap:12px">${cats.map(c => `<label class="chk"><input type="checkbox" name="lib_${c.id}"${(f.liberadas || []).includes(c.id) ? ' checked' : ''}>${esc(c.nome)}</label>`).join('')}</div></div>` }, btnExcluir], f,
        v => S.run(() => S.salvar('mus_formatos', { id:f.id, nome:v.nome.trim(), cor:+v.cor || 0, permitir_mover:v.permitir_mover === 'on', permitir_excluir:v.permitir_excluir === 'on', automatico:v.automatico === 'on', liberadas:cats.filter(c => v['lib_' + c.id] === 'on').map(c => c.id) }), 'Formato salvo'), 'Salvar', { editar:true });
      const usado = (cfg().grade || []).some(l => (l || []).includes(f.id));
      excluirNoForm('mus_formatos', f.id, usado ? 'Este formato está na grade da semana; essas horas ficarão sem formato. Excluir mesmo assim?' : 'Excluir este formato?'); },
    musFmtNovo: () => S.form('Novo formato', [{ k:'nome', label:'Nome', req:true, ph:'Ex.: Sexta à noite', full:true }], {},
      v => S.run(async () => { const base = formato(u.fmt), r = await S.salvar('mus_formatos', { veiculo_id:S.ui.vehicleId, nome:v.nome.trim(), cor:S.db.mus_formatos.length % TONS.length, posicoes:base ? base.posicoes : [] }); u.fmt = r.id; u.pincel = r.id; }, 'Formato criado (cópia das posições do formato aberto)')),
    musPincel: d => { u.pincel = d.id; S.render(); },
    musPinta: d => { if (!u.gradeRasc) u.gradeRasc = Array.from({ length:7 }, (_, i) => ((cfg().grade || [])[i] || Array(24).fill(null)).slice()); u.gradeRasc[+d.d][+d.h] = u.pincel; S.render(); },
    musGradeDesfaz: () => { u.gradeRasc = null; S.render(); },
    musGradeSalvar: () => S.run(async () => { await salvarConfig({ grade:u.gradeRasc }); u.gradeRasc = null; }, 'Grade da semana salva'),
  });

  // ======================= REGRAS =======================
  const telaRegras = w => {
    const R = regras(), ed = pode(), dis = ed ? '' : ' disabled';
    const param = { INT_INT:['interprete_min', 'Mínimo (min)', 0, 240, 15], PESO:['peso_dist', 'Distância (posições)', 1, 8, 1] };
    const linhas = M.REGRAS.map(([k, n, desc]) => { const p = param[k], c = w.porRegra[k] || 0;
      return `<div class="mus-regra"><div class="tx"><b>${esc(n)}</b><small>${esc(desc)}</small></div>
        ${p ? `<label class="f mus-par">${p[1]}: <b>${R[p[0]]}</b><input type="range" min="${p[2]}" max="${p[3]}" step="${p[4]}" value="${R[p[0]]}" data-musregra="${p[0]}"${dis}></label>` : '<span></span>'}
        <span class="muted small num">${R.on[k] ? (c ? `<span class="aviso">${c} na semana</span>` : 'nenhuma') : 'desligada'}</span>
        <label class="mus-sw"><input type="checkbox" data-musliga="${k}"${R.on[k] ? ' checked' : ''}${dis} aria-label="${R.on[k] ? 'Desligar' : 'Ligar'} ${esc(n)}"><i></i></label></div>`; }).join('');
    const dl = w.lista.filter(e => e.di === u.dia && e.musica);
    const comp = S.db.musicas.filter(m => m.deve_tocar > 0).map(m => { const n = dl.filter(e => e.musica.id === m.id && e.h >= m.deve_de && e.h <= m.deve_ate).length;
      return `<tr><td><b>${esc(m.titulo)}</b><div class="muted small">${esc(M.artistasTexto(m))}</div></td><td class="r">${m.deve_tocar}x</td><td>${M.pad(m.deve_de)}h às ${M.pad(m.deve_ate)}h</td><td class="r"><b>${n}</b></td><td>${rtPill(m)}</td><td>${n >= m.deve_tocar ? S.tag('Cumprido', 'green') : S.tag(`Faltam ${m.deve_tocar - n}`, 'orange')}</td></tr>`; }).join('');
    return { acoes:ed ? `<button class="btn pri" data-act="musRegraNova">${S.svg('mais')}Nova regra configurável</button>` : '',
      corpo:`<section class="card"><h3>Regras da programação</h3><div class="mus-regras">${linhas}</div></section>
        <section class="card"><h3>Regras configuráveis</h3>${(R.custom || []).length ? `<div class="legend">${R.custom.map(c => `<div><span class="grow">${esc(M.rotuloRegra(c, S.db.mus_subcategorias))}</span>${ed ? `<button class="x" data-act="musRegraDel" data-id="${c.id}" aria-label="Remover regra">×</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">Nenhuma. Ex.: "No máximo 2 seguidas com voz feminina".</p>'}</section>
        <section class="card"><div class="hd"><h3>Compromissos · ${M.DIAS[u.dia]} ${M.dm(M.somaDias(semana(), u.dia))}</h3><span>defina na ficha da música ("deve tocar")</span></div>
          ${comp ? `<div class="scroll"><table><thead><tr><th>Música</th><th class="r">Deve tocar</th><th>Faixa</th><th class="r">Total</th><th>Ritmo</th><th>Situação</th></tr></thead><tbody>${comp}</tbody></table></div>` : '<p class="muted">Nenhuma música com compromisso.</p>'}
          <div class="seg mus-dias" style="margin:14px 0 0">${M.DC.map((d, i) => `<button class="${u.dia === i ? 'on' : ''}" data-act="musDia" data-dia="${i}">${d}</button>`).join('')}</div></section>` };
  };
  const salvarRegras = patch => S.run(() => salvarConfig({ regras:Object.assign(regras(), patch) }));
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.musliga) { const on = Object.assign({}, regras().on, { [el.dataset.musliga]:el.checked }); salvarRegras({ on }); }
    if (el.dataset.musregra) salvarRegras({ [el.dataset.musregra]:+el.value });
  });
  Object.assign(S.actions, {
    musRegraNova: () => {
      const campos = Object.entries(M.CAMPOS).map(([k, c]) => [k, c.label]);
      const valores = [].concat(...Object.entries(M.CAMPOS).map(([k, c]) => (c.valores || S.db.mus_subcategorias.map(s => [s.id, s.nome])).map(([v, n]) => [k + '|' + v, `${c.label}: ${n}`])));
      S.form('Nova regra configurável', [{ k:'tipo', label:'Tipo', type:'select', options:[['seq', 'Seguidas (no máximo N em sequência)'], ['hora', 'Por hora (no máximo N na mesma hora)']] },
        { k:'cv', label:'Quando a música tem', type:'select', options:valores }, { k:'max', label:'Máximo', mask:'int', req:true, ph:'Ex.: 2' }, { html:`<input type="hidden" value="${campos.length}">` }], { max:2 },
        f => { const [campo, valor] = f.cv.split('|'), c = { id:S.uid(), tipo:f.tipo, campo, valor, max:Math.max(1, +f.max || 1) };
          S.run(() => salvarConfig({ regras:Object.assign(regras(), { custom:(regras().custom || []).concat([c]) }) }), 'Regra criada: ' + M.rotuloRegra(c, S.db.mus_subcategorias)); }, 'Criar regra', { editar:true });
    },
    musRegraDel: d => { if (confirm('Remover esta regra?')) S.run(() => salvarConfig({ regras:Object.assign(regras(), { custom:(regras().custom || []).filter(c => c.id !== d.id) }) }), 'Regra removida'); },
  });

  // ======================= RELATÓRIOS E ECAD =======================
  const execucoes = w => w.lista.filter(e => e.di >= 0 && e.musica && (u.rper === 'semana' || e.di === u.dia)
    && (!u.rcat || e.musica.categoria_id === u.rcat) && (!u.rgrav || (e.musica.gravadora || 'Sem gravadora') === u.rgrav) && (!u.rint || M.artistas(e.musica).includes(u.rint)));
  const tipoExec = e => { const f = formatoDaHora(e.wd, e.h); return f && f.automatico === false ? 'Ao vivo' : e.slot.manual ? 'Manual' : 'Automática'; };
  const telaRel = w => {
    const ex = execucoes(w), cont = {}; ex.forEach(e => { cont[e.musica.id] = (cont[e.musica.id] || 0) + 1; });
    const top = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 10), max = top.length ? cont[top[0]] : 1;
    const gravs = [...new Set(S.db.musicas.map(m => m.gravadora || 'Sem gravadora'))].sort(), arts = [...new Set(S.db.musicas.flatMap(M.artistas))].sort((a, b) => a.localeCompare(b));
    const filtros = `<section class="card"><div class="row" style="gap:12px">
      <label class="f">Período<select data-mus2="rper"><option value="semana"${u.rper === 'semana' ? ' selected' : ''}>Semana de ${M.dm(semana())} a ${M.dm(M.somaDias(semana(), 6))}</option><option value="dia"${u.rper === 'dia' ? ' selected' : ''}>${M.DIAS[u.dia]} ${M.dm(M.somaDias(semana(), u.dia))}</option></select></label>
      <label class="f">Categoria<select data-mus2="rcat"><option value="">Todas</option>${opcoes(S.db.mus_categorias.map(c => [c.id, c.nome]), u.rcat)}</select></label>
      <label class="f">Gravadora<select data-mus2="rgrav"><option value="">Todas</option>${opcoes(gravs.map(g => [g, g]), u.rgrav)}</select></label>
      <label class="f">Intérprete<select data-mus2="rint"><option value="">Todos</option>${opcoes(arts.map(a => [a, a]), u.rint)}</select></label></div>
      <p class="muted small" style="margin-top:10px">Use as setas de semana e os dias na Programação para mudar o período.</p></section>`;
    const maisTocadas = `<section class="card"><h3>Mais tocadas</h3>${top.length ? `<div class="people">${top.map((id, i) => { const m = w.porId[id];
      return `<div><span class="av soft" aria-hidden="true">${i + 1}</span><div class="who"><div><b>${esc(m.titulo)}</b><span class="muted small num">${cont[id]}x</span></div><div class="prog"><i style="width:${cont[id] / max * 100}%;--i:${i}"></i></div></div><div class="val"><span class="muted small">${esc(M.artistasTexto(m))}</span></div></div>`; }).join('')}</div>` : '<p class="muted">Nada tocou com esses filtros.</p>'}</section>`;
    const tabela = `<section class="card"><div class="hd"><h3>Músicas executadas</h3><span>${ex.length} execuções${ex.length > 400 ? ' · mostrando as 400 primeiras' : ''}</span></div>
      <div class="scroll"><table><thead><tr><th>Dia</th><th>Hora</th><th>Música</th><th>Intérprete</th><th>Gravadora</th><th>Execução</th></tr></thead><tbody>${ex.slice(0, 400).map(e => `<tr><td class="muted">${M.DC[e.wd]} ${M.dm(e.data)}</td><td class="num">${M.relogio(e.inicio)}</td><td><b>${esc(e.musica.titulo)}</b></td><td>${esc(M.artistasTexto(e.musica))}</td><td class="muted">${esc(e.musica.gravadora || '—')}</td><td>${tipoExec(e)}</td></tr>`).join('')}</tbody></table></div></section>`;
    return { acoes:`<button class="btn" data-act="musBaixar" data-o="html">${S.svg('baixar')}Página para o site</button><button class="btn pri" data-act="musBaixar" data-o="ecad">${S.svg('baixar')}Arquivo para o ECAD</button>`,
      corpo:`${filtros}<div class="note info">As execuções vêm da programação gerada. Quando o SONVI for ligado ao programa que toca no ar, passam a vir do que tocou de fato. O layout exato do arquivo do ECAD (EXP) precisa ser conferido com o manual do ECAD; por enquanto o arquivo sai com os campos exigidos, separados por ponto e vírgula.</div><div class="cols">${maisTocadas}</div>${tabela}` };
  };
  const baixar = (nome, conteudo, tipo) => { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([conteudo], { type:tipo })); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
  S.actions.musBaixar = d => {
    const w = montar(), ex = execucoes(w), v = S.veh(), per = u.rper === 'semana' ? `${semana()}_a_${M.somaDias(semana(), 6)}` : M.somaDias(semana(), u.dia);
    if (!ex.length) return S.toast('Nada para exportar com esses filtros.');
    if (d.o === 'ecad') {
      const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
      const linhas = ['data;hora;musica;interprete;compositor;gravadora;tipo_execucao;duracao'].concat(ex.map(e => [e.data, M.relogio(e.inicio), e.musica.titulo, M.artistasTexto(e.musica), e.musica.compositor, e.musica.gravadora, tipoExec(e), M.mmss(e.musica.duracao)].map(q).join(';')));
      baixar(`ECAD_${v.sigla}_${per}.txt`, '\uFEFF' + linhas.join('\r\n'), 'text/plain;charset=utf-8');
      const semComp = ex.filter(e => !e.musica.compositor).length;
      S.toast(semComp ? `Arquivo gerado. Atenção: ${semComp} execução(ões) sem compositor na ficha.` : 'Arquivo para o ECAD gerado.');
    } else {
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tocou na ${esc(v.nome)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th{font-size:12px;color:#555}</style></head>
<body><h1>Tocou na ${esc(v.nome)}</h1><table><thead><tr><th>Data</th><th>Hora</th><th>Música</th><th>Intérprete</th><th>Compositor</th></tr></thead><tbody>
${ex.map(e => `<tr><td>${M.dm(e.data)}</td><td>${M.relogio(e.inicio)}</td><td>${esc(e.musica.titulo)}</td><td>${esc(M.artistasTexto(e.musica))}</td><td>${esc(e.musica.compositor)}</td></tr>`).join('\n')}
</tbody></table></body></html>`;
      baixar(`tocou_${v.sigla}_${per}.html`, html, 'text/html;charset=utf-8');
      S.toast('Página gerada. Publique no site da rádio.');
    }
  };

  // ======================= ações da programação =======================
  const itensDaHora = () => { const r = linhaDaHora(M.somaDias(semana(), u.dia), u.hora); return JSON.parse(JSON.stringify(r ? r.itens : [])); };
  const gravarHora = (itens, ok) => S.run(() => salvarHora(M.somaDias(semana(), u.dia), u.hora, itens), ok);
  Object.assign(S.actions, {
    musIniciar: () => S.run(async () => { await S.q(S.sb.rpc('mus_iniciar', { p_veiculo:S.ui.vehicleId })); await S.carregarMusical(true); }, 'Pronto! Agora cadastre ou importe as músicas no Acervo.'),
    musAba: d => { u.aba = d.aba; u.pick = null; S.render(); },
    musSemana: d => { S.ui.musSemana = +d.dir === 0 ? M.segunda(S.today()) : M.somaDias(semana(), 7 * +d.dir); u.pick = null; u.outra = null; S.render(); },
    musDia: d => { u.dia = +d.dia; u.pick = null; S.render(); },
    musHora: d => { u.hora = +d.hora; u.pick = null; S.render(); },
    musDuas: () => { u.duas = !u.duas; u.pick = null; S.render(); },
    musGerar: d => {
      const alvo = d.o === 'semana' ? [0, 1, 2, 3, 4, 5, 6] : [u.dia], datas = alvo.map(i => M.somaDias(semana(), i));
      const ja = S.db.mus_programacao.filter(r => datas.includes(r.data) && r.itens.length), manuais = ja.filter(r => r.itens.some(s => s.manual)).length;
      if (!S.db.musicas.some(m => m.ativa)) return S.toast('Cadastre ou importe músicas no Acervo antes de gerar.');
      if (ja.length && !confirm(`${d.o === 'semana' ? 'Refazer a semana inteira' : `Refazer ${M.DIAS[u.dia].toLowerCase()}`}? ${ja.length} hora(s) já montada(s) serão refeitas${manuais ? `, incluindo ${manuais} com músicas escolhidas à mão` : ''}.`)) return;
      S.toast('Montando a programação…');
      setTimeout(() => S.run(() => gerarDias(alvo), d.o === 'semana' ? 'Semana montada em camadas, da prioridade 1 para a última' : 'Dia montado pelas regras'), 30);
    },
    musAbrir: d => { u.pick = { data:M.somaDias(semana(), u.dia), h:u.hora, i:+d.i }; u.modo = 'auto'; u.ai = 0; u.busca = ''; S.render(); },
    musFechar: () => { u.pick = null; S.render(); },
    musModo: d => { u.modo = d.m; S.render(); },
    musAuto: d => { u.ai = Math.max(0, u.ai + +d.d); S.render(); },
    musSoLib: (d, el) => { u.soLib = el.checked; S.render(); },
    musEscolher: d => { const p = u.pick, m = S.db.musicas.find(x => x.id === d.id), itens = itensDaHora();
      if (!p || !itens[p.i]) return; itens[p.i].musica = d.id; itens[p.i].manual = true; u.pick = null;
      gravarHora(itens, `"${m.titulo}" entrou na posição ${p.i + 1}`); },
    musItemMenu: (d, botao) => { const f = formatoDaHora(u.dia, u.hora), i = +d.i, it = itensDaHora()[i] || {};
      S.menu(botao, [...(it.k === 'MUS' ? [{ label:'Trocar a música', icon:'editar', act:'musAbrir', data:{ i } }] : []), ...(it.k === 'INF' ? [{ label:'Editar o texto', icon:'editar', act:'musTexto', data:{ i } }] : []),
        ...(!f || f.permitir_mover ? [{ label:'Subir', icon:'seta', act:'musMover', data:{ i, d:-1 } }, { label:'Descer', icon:'baixo', act:'musMover', data:{ i, d:1 } }] : []),
        ...(it.k === 'MUS' && it.musica ? [{ label:'Esvaziar a posição', icon:'bloqueio', act:'musEsvaziar', data:{ i } }] : []),
        ...(!f || f.permitir_excluir ? ['-', { label:'Remover a posição', icon:'lixo', act:'musRemover', data:{ i }, perigo:true }] : [])]); },
    musMover: d => { const itens = itensDaHora(), i = +d.i, j = i + +d.d; if (j < 0 || j >= itens.length) return; [itens[i], itens[j]] = [itens[j], itens[i]]; u.pick = null; gravarHora(itens); },
    musRemover: d => { const itens = itensDaHora(); itens.splice(+d.i, 1); u.pick = null; gravarHora(itens, 'Posição removida'); },
    musEsvaziar: d => { const itens = itensDaHora(); itens[+d.i].musica = null; itens[+d.i].manual = false; gravarHora(itens, 'Posição esvaziada'); },
    musTexto: d => { const itens = itensDaHora(), it = itens[+d.i];
      S.form('Texto informativo', [{ k:'texto', label:'Texto', req:true, full:true, ph:'Ex.: Previsão do tempo' }], { texto:it.texto }, f => { it.texto = f.texto.trim(); gravarHora(itens, 'Texto salvo'); }, 'Salvar', { editar:true }); },
    musAdd: d => { const itens = itensDaHora(), f = formatoDaHora(u.dia, u.hora), cat = (f && f.liberadas && f.liberadas[0]) || (S.db.mus_categorias[0] || {}).id;
      const it = d.k === 'MUS' ? { k:'MUS', cat, musica:null, manual:true } : d.k === 'VIN' ? { k:'VIN', vinheta:(S.db.mus_vinhetas.find(v => v.ativa) || {}).id || null } : d.k === 'INF' ? { k:'INF', texto:(cfg().informativos || [])[0] || 'Texto informativo' } : { k:'BRK' };
      itens.push(it);
      if (d.k === 'MUS') { u.pick = { data:M.somaDias(semana(), u.dia), h:u.hora, i:itens.length - 1 }; u.modo = 'busca'; u.busca = ''; }
      gravarHora(itens); },
    musHist: d => { u.hist = d.h; u.histId = ''; S.render(); },
    musHistSel: d => { u.histId = d.id; S.render(); },
    musImportarHD: () => document.getElementById('musArqHD').click(),
    musImportarPlanilha: () => { alert('A planilha precisa ter uma linha de títulos. Colunas reconhecidas: música (ou título), intérprete (ou artista), categoria, duração (mm:ss), ritmo (lento/médio/rápido), peso (1 a 5), compositor, gravadora, disco, ano.\n\nSalve como CSV no Excel: Arquivo → Salvar como → "CSV (separado por vírgulas)".'); document.getElementById('musArqPlan').click(); },
    // Grade de restrição na ficha: alterna sem redesenhar o diálogo
    musBloq: (d, el) => { el.classList.toggle('bl'); atualizaBloq(); },
    musBloqPreset: d => { document.querySelectorAll('#dlg .mus-mapa.restr button').forEach(b => { const [di, h] = b.dataset.k.split('-').map(Number);
      b.classList.toggle('bl', d.p === 'noite' ? h >= 6 && h <= 18 : d.p === 'dia' ? h >= 19 || h <= 5 : d.p === 'fds' ? !(di >= 5 && h <= 5) : false); }); atualizaBloq(); },
  });
  const atualizaBloq = () => { const i = document.querySelector('#dlg [name=bloqueios]'); if (i) i.value = [...document.querySelectorAll('#dlg .mus-mapa.restr button.bl')].map(b => b.dataset.k).join(','); };

  // Selects da tela (segunda tela, filtros) e buscas ao vivo (o cursor continua no campo)
  S.changes.push((el, d) => {
    if (!d.mus2) return false;
    const k = d.mus2, v = el.value;
    if (k === 'radio') { u.d2radio = v; u.outra = null; } else if (k === 'dia') u.d2dia = +v; else if (k === 'hora') u.d2hora = +v; else u[k] = v;
    S.render(); return true;
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset || !el.dataset.musq) return;
    u[el.dataset.musq] = el.value; const id = el.id, pos = el.selectionStart;
    clearTimeout(u._t); u._t = setTimeout(() => { S.render(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* sem cursor */ } } }, 180);
  });

  // Linhas da grade abrem com Enter pelo teclado
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.mus-l[data-act][tabindex]')) e.target.click(); });

  // Máscaras de tempo e ano usadas nas fichas
  const so = s => String(s || '').replace(/\D/g, '');
  S.MASK.tempo = { ph:'00:00', modo:'numeric', f:v => { const d = so(v).slice(0, 4); return d.length > 2 ? d.slice(0, d.length - 2) + ':' + d.slice(-2) : d; },
    erro:v => !v || M.lerTempo(v) !== null ? '' : 'Use minutos e segundos, ex.: 03:25' };
  S.MASK.ano = { ph:'Ex.: 2023', modo:'numeric', f:v => so(v).slice(0, 4), erro:v => !v || v.length === 4 ? '' : 'Ano com 4 números' };
})();

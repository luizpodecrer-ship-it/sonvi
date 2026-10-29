// SONVI · Produtos (database/043, aprovado em 24/10/2026): o que cada veículo vende, no lugar da Tabela de preços.
//   Rádio (/produtos): cada programa ou faixa é um produto (produtos tipo programa: rotativo, horário determinado, quadro,
//     ao vivo) e as durações são as variações (tipo formato: 15", 30", Testemunhal…). Sem vigência: o preço fica na tabela
//     permanente do veículo (tabelas_preco.permanente) e vale na hora para as propostas novas. Grava por salvar_produto_radio.
//   Patrocínios (/produtos/patrocinios): cota = programa vendido por mês com um pacote fixo (secao patrocinio,
//     dados = { local, incluido:[{ formato_id, qtd, faixa }], valor }). Na proposta vira os itens do pacote (propostas.js).
//   Digital (/produtos/digital, /produtos/canais): continua em cadastros.js, como antes.
//   Mídia exterior (LED, DOOH, front light, empena, outdoor): secao 'ooh', tudo em produtos.dados:
//     por inserção (LED, DOOH): { cobranca:'insercao', unidade, funcionamento, arquivo, variacoes:[{nome, valor}], pontos:[ponto] }
//     por mês (front light, empena, outdoor): { cobranca:'mes', ponto, variacoes:[{nome, obs, valor}] (faces), producao:{nome, valor} }
//     ponto = { id, codigo, endereco, cidade, impacto, obs, formato, arquivo, coords, maps, foto }
(() => {
  const { esc, brl } = S;
  const pode = () => S.pode('diretor', 'gerente');
  const ordem = (a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome);
  const prod = id => S.db.produtos.find(p => p.id === id) || null;
  const dadosDe = p => (p && p.dados && typeof p.dados === 'object' ? p.dados : {});
  const tabProd = () => (S.db.tabelas || []).find(t => S.tipoTabela(t) === 'radio' && t.permanente) || null;
  const formatos = (todos) => S.db.produtos.filter(p => p.tipo === 'formato' && p.secao !== 'digital' && (todos || p.ativo)).sort(ordem);
  const radioProds = () => S.db.produtos.filter(p => p.tipo === 'programa' && !['digital', 'ooh'].includes(p.secao)).sort(ordem);
  const oohProds = () => S.db.produtos.filter(p => p.tipo === 'programa' && p.secao === 'ooh').sort(ordem);
  const precoDe = (p, f) => { const t = tabProd(), x = t && S.precoNaTabela(t.id, p.id, f.id); return x ? Number(x.preco) : 0; };
  const ehRadio = () => S.temCategoria(S.veh(), 'radio');
  const catsOoh = () => S.categorias(S.veh()).filter(k => k !== 'radio');
  const COBRA = { led:'insercao', dooh:'insercao', frontlight:'mes', empena:'mes', outdoor:'mes' };
  const UNIDADE = { painel:['painel', 'painéis'], onibus:['ônibus', 'ônibus'], tela:['tela', 'telas'] };
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : '';
  const unidade = (d, n) => { const u = UNIDADE[d.unidade] || UNIDADE.painel; return n === 1 ? u[0] : u[1]; };
  const SECOES = [['rotativo', 'Rotativo', 'horário indeterminado'], ['programa', 'Horário determinado', 'programas com horário fixo'], ['quadro', 'Quadros', 'dentro de um programa'], ['aovivo', 'Ao vivo', 'testemunhal, flash e participações']];
  const TIPO = { rotativo:'Rotativo', programa:'Determinado', quadro:'Quadro', aovivo:'Ao vivo', patrocinio:'Patrocínio' };
  const unico = f => f.cobranca === 'unico';
  const titulo = t => `<span class="sub">${esc(S.veh().nome)}</span>${t}`;
  const tres = (act, id, nome) => `<button type="button" class="btn tres" data-act="${act}" data-id="${id}" aria-label="Opções de ${esc(nome)}">${S.svg('mais3')}</button>`;
  const recarregar = async () => { S.db.produtos = await S.q(S.sb.from('produtos').select('*').eq('veiculo_id', S.ui.vehicleId)); await S.recarregarTabelas(); };

  // ---------- dias e horários (uma linha por faixa: "Seg a Sex · 08h às 11h") ----------
  const DIAS = [['1,2,3,4,5', 'Seg a Sex'], ['1,2,3,4,5,6', 'Seg a Sáb'], ['0,1,2,3,4,5,6', 'Seg a Dom'], ['0,6', 'Sáb e Dom'], ['6', 'Sábado'], ['0', 'Domingo'],
    ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta']];
  const semAc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const HR = /(\d{1,2})\s*H\s*(\d{2})?\s*(?:A|AS|ATE|-|–)\s*(\d{1,2})\s*H\s*(\d{2})?/;
  const hh = (h, m) => `${String(h).padStart(2, '0')}:${m || '00'}`;
  const LOCAL = /PROGRAMACAO LOCAL/;
  S.faixasDoTexto = txt => { const out = { faixas:[], local:false, obs:[] };
    String(txt || '').split(/\n|\|/).map(x => x.trim()).filter(Boolean).forEach(l => { const s = semAc(l);
      if (LOCAL.test(s)) { out.local = true; return; }
      const m = HR.exec(s), dias = S.diasDoTexto(l), so24 = /^24\s*H$/.test(s.trim());
      if (!m && !so24 && !dias) { out.obs.push(l); return; }
      out.faixas.push({ dias:(dias || [0, 1, 2, 3, 4, 5, 6]).join(','), ini:so24 ? '00:00' : m ? hh(m[1], m[2]) : '', fim:so24 ? '24:00' : m ? hh(m[3], m[4]) : '' }); });
    return out; };
  const diasNome = k => (DIAS.find(d => d[0] === k) || [k, S.diasTexto(String(k).split(',').map(Number))])[1];
  const hTxt = t => { const [h, m] = String(t || '').split(':'); return !h ? '' : `${h.padStart(2, '0')}h${m && m !== '00' ? m : ''}`; };
  S.faixaTexto = f => [diasNome(f.dias), f.ini && f.fim ? `${hTxt(f.ini)} às ${hTxt(f.fim)}` : ''].filter(Boolean).join(' · ');
  S.faixaHoras = f => f.ini && f.fim ? `${hTxt(f.ini)} às ${hTxt(f.fim)}` : '';
  const ehLocal = p => !!dadosDe(p).local || LOCAL.test(semAc(p.detalhe));
  const horario = p => String(p.detalhe || '').split(/\n|\|/).map(x => x.trim()).filter(x => x && !LOCAL.test(semAc(x))).map(esc).join('<span class="pdt-sep">·</span>') || 'Horário a combinar';
  const HORA = '^([01]?\\d|2[0-4]):[0-5]\\d$';
  const linhaFaixa = (f, i) => { const tem = DIAS.some(d => d[0] === f.dias);
    return `<div class="pdt-faixa" data-faixa="${i}"><select name="fx_dias_${i}" aria-label="Dias da faixa ${i + 1}">${(tem ? DIAS : [[f.dias, diasNome(f.dias)], ...DIAS]).map(([k, n]) => `<option value="${k}"${k === f.dias ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input name="fx_ini_${i}" value="${esc(f.ini)}" placeholder="08:00" pattern="${HORA}" inputmode="numeric" aria-label="Começa às"><span class="muted">às</span>
      <input name="fx_fim_${i}" value="${esc(f.fim)}" placeholder="11:00" pattern="${HORA}" inputmode="numeric" aria-label="Termina às">
      <button type="button" class="btn tres" data-act="pdTirarLinha" aria-label="Tirar esta faixa">×</button></div>`; };
  const lerFaixas = f => Object.keys(f).filter(k => k.startsWith('fx_dias_')).map(k => k.slice(8)).sort((a, b) => a - b)
    .map(i => ({ dias:f['fx_dias_' + i], ini:(f['fx_ini_' + i] || '').trim(), fim:(f['fx_fim_' + i] || '').trim() })).filter(x => x.dias);
  let nLinha = 100; // novas linhas dentro do formulário aberto
  // Formulários de produto são largos (faixas, preços, pontos): janela média, volta ao normal ao fechar
  const medio = () => { const dl = document.getElementById('dlg'); dl.dataset.guarda = '1'; dl.classList.add('medio'); const antes = dl.onclose; dl.onclose = e => { dl.classList.remove('medio'); if (antes) antes(e); }; };

  // ---------- abas ----------
  S.produtosAbas = on => {
    const r = ehRadio(), oo = catsOoh().length; if (!r) return '';
    const n1 = radioProds().filter(p => p.secao !== 'patrocinio' && (p.ativo || pode())).length, n2 = radioProds().filter(p => p.secao === 'patrocinio' && (p.ativo || pode())).length;
    const it = [['produtos', '/produtos', 'Produtos', n1], ['patrocinios', '/produtos/patrocinios', 'Patrocínios', n2], ...(oo ? [['ooh', '/produtos/ooh', 'Mídia exterior', oohProds().length]] : []), ['digital', '/produtos/digital', 'Digital', null]];
    return `<nav class="seg tp-abas" aria-label="Produtos">${it.map(([k, rota, nome, q]) => `<button class="${k === on ? 'on' : ''}" data-go="${rota}"${k === on ? ' aria-current="page"' : ''}>${nome}${q !== null ? ` <small>${q}</small>` : ''}</button>`).join('')}</nav>`;
  };

  // ---------- rádio: produtos (resumo, variação para comparar, cartões com barras ou mapa de preços; aprovado em 24/10/2026) ----------
  // Tudo nos tons da cor do veículo. Estilos .pdt-* em sonvi.css (nunca .pd-*, que é do PI impresso).
  const chip = (nome, valor, cls) => `<span class="pdt-var${cls ? ' ' + cls : ''}"><small>${esc(nome)}</small><b>${brl(valor)}</b></span>`;
  const pv = { vista:'cartoes', varia:'' };   // varia = id da variação escolhida para comparar
  const curto = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const cartaoRadio = (p, mx) => { const d = dadosDe(p), vs = formatos(true).map(f => [f, precoDe(p, f)]).filter(x => x[1] > 0 || x[0].id === pv.varia);
    return `<article class="card pdt-card${p.ativo ? '' : ' inativo'}" data-flip="${p.id}"><div class="pdt-cab"><h3>${esc(p.nome)}</h3>${ehLocal(p) ? '<span class="pill fn-ok">Local</span>' : ''}${p.ativo ? '' : '<span class="pill fn-neutra">Inativo</span>'}<span class="pdt-tipo">${TIPO[p.secao] || 'Determinado'}</span>${pode() ? tres('pdMenu', p.id, p.nome) : ''}</div>
      <small class="muted pdt-hor">${horario(p)}</small>${d.obs ? `<small class="muted">${esc(d.obs)}</small>` : ''}
      ${vs.some(x => x[1] > 0) ? `<div class="pdt-precos-b${pv.varia ? ' filtra' : ''}">${vs.map(([f, v]) => `<div class="pdt-pb${f.id === pv.varia ? ' foco' : ''}${v ? '' : ' vazio'}"><span>${esc(f.nome)}${unico(f) ? '<small> · preço único</small>' : ''}</span><span class="pdt-pb-barra" aria-hidden="true"><i style="width:${v ? Math.max(3, v / mx * 100) : 0}%"></i></span><b>${v ? brl(v) : 'não vende'}</b></div>`).join('')}</div>` : '<span class="muted small">Sem preço ainda</span>'}</article>`; };
  const vistaRadio = () => {
    const ps = radioProds().filter(p => p.secao !== 'patrocinio' && (p.ativo || pode())), fs = formatos(true).filter(f => ps.some(p => precoDe(p, f) > 0));
    if (pv.varia && !fs.some(f => f.id === pv.varia)) pv.varia = '';
    const precos = ps.flatMap(p => fs.map(f => ({ p, f, v:precoDe(p, f) }))).filter(x => x.v > 0), mx = Math.max(1, ...precos.map(x => x.v));
    const menor = precos.reduce((a, x) => !a || x.v < a.v ? x : a, null), maior = precos.reduce((a, x) => !a || x.v > a.v ? x : a, null);
    const cotas = radioProds().filter(p => p.secao === 'patrocinio' && p.ativo).length, nSec = new Set(ps.map(p => p.secao)).size, fv = fs.find(f => f.id === pv.varia);
    const daVar = fv ? ps.map(p => precoDe(p, fv)).filter(Boolean) : [];
    const resumoV = fv ? `<span class="pill fn-ok">${esc(fv.nome)}: ${daVar.length > 1 ? `de ${brl(Math.min(...daVar))} a ${brl(Math.max(...daVar))}` : brl(daVar[0])} · ${daVar.length} produto${daVar.length === 1 ? '' : 's'}</span>` : '<span class="pill fn-neutra">Escolha uma variação para comparar os produtos</span>';
    const topo = ps.length ? `<section class="card pdt-topo" aria-labelledby="pdt-t"><div class="hd"><h2 id="pdt-t">Tabela da ${esc(S.veh().nome)}</h2>
        <div class="seg" role="group" aria-label="Ver como">${[['cartoes', 'Cartões'], ['mapa', 'Mapa de preços']].map(([k, n]) => `<button class="${pv.vista === k ? 'on' : ''}" data-act="pdVista" data-v="${k}" aria-pressed="${pv.vista === k}">${n}</button>`).join('')}</div></div>
      <div class="pdt-kpis"><div><small>Produtos ativos</small><b>${S.roloFixo('pdt1', String(ps.filter(p => p.ativo).length))}</b><span>em ${nSec} seç${nSec === 1 ? 'ão' : 'ões'}</span></div>
        <div><small>Cotas de patrocínio</small><b>${S.roloFixo('pdt2', String(cotas))}</b><span>${cotas ? 'na aba Patrocínios' : 'nenhuma ativa'}</span></div>
        <div><small>Menor preço</small><b>${S.roloFixo('pdt3', menor ? curto(menor.v) : 'R$ 0')}</b><span>${menor ? `${esc(menor.f.nome)} · ${esc(menor.p.nome)}` : '—'}</span></div>
        <div><small>Maior preço</small><b>${S.roloFixo('pdt4', maior ? curto(maior.v) : 'R$ 0')}</b><span>${maior ? `${esc(maior.f.nome)} · ${esc(maior.p.nome)}` : '—'}</span></div></div>
      <div class="pdt-comparar"><div class="pdt-var-chips" role="group" aria-label="Comparar uma variação">${fs.map(f => `<button data-act="pdVar" data-id="${f.id}" aria-pressed="${pv.varia === f.id}">${esc(f.nome)}</button>`).join('')}</div><span class="grow"></span>${resumoV}</div></section>` : '';
    let blocos;
    if (pv.vista === 'mapa' && ps.length) {
      const mn = menor ? menor.v : 0, faixa = Math.max(1, mx - mn);
      blocos = `<section class="card" aria-labelledby="pdt-tm"><div class="hd"><h2 id="pdt-tm">Mapa de preços</h2><span>quanto mais forte, mais caro</span></div><div class="pdt-mapa scroll"><table><thead><tr><th><span class="sr">Produto</span></th>${fs.map(f => `<th class="c${f.id === pv.varia ? ' on' : ''}">${esc(f.nome)}</th>`).join('')}</tr></thead><tbody>
        ${ps.map(p => `<tr><td class="nome"><b>${esc(p.nome)}</b></td>${fs.map(f => { const v = precoDe(p, f), pc = v ? Math.round(12 + (v - mn) / faixa * 88) : 0;
          return `<td class="${f.id === pv.varia ? 'on' : ''}">${v ? `<span class="pdt-cel" style="--p:${pc}" title="${esc(p.nome)} · ${esc(f.nome)}: ${brl(v)}"><span>${curto(v).replace('R$ ', '')}</span></span>` : '<span class="pdt-cel nada">não vende</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="pdt-escala"><span>${curto(mn)}</span><i aria-hidden="true"></i><span>${curto(mx)}</span></div></section>`;
    } else blocos = SECOES.map(([k, n, sub]) => { const l = ps.filter(p => (SECOES.some(s => s[0] === p.secao) ? p.secao : 'programa') === k);
      return l.length ? `<section class="pdt-sec"><div class="pdt-sec-hd"><h2>${n}</h2><small class="muted">${sub}</small></div><div class="pdt-grade">${l.map(p => cartaoRadio(p, mx)).join('')}</div></section>` : ''; }).join('');
    const vazio = `<div class="card empty"><b>Nenhum produto cadastrado</b>${pode() ? 'Cadastre os programas, o rotativo e os testemunhais que a rádio vende, com o preço de cada duração.' : 'Quando o diretor cadastrar, os produtos aparecem aqui.'}</div>`;
    return { title:titulo('Produtos'), actions:pode() ? `<button class="btn" data-act="pdVariacoes">Durações e variações</button><button class="btn pri" data-act="pdNovo">${S.svg('mais')}Novo produto</button>` : '',
      body:S.produtosAbas('produtos') + (ps.length ? topo + blocos : vazio) + (ps.length ? `<p class="muted small pdt-nota">Mudar um preço vale na hora para as propostas novas. Propostas e PIs já feitos guardam o preço do dia.</p>` : '') };
  };

  // Formulário do produto de rádio
  const formRadio = (p, secao) => {
    p = p || { ativo:true, secao:secao || 'programa', nome:'', detalhe:'', dados:{} };
    const fx = S.faixasDoTexto(p.detalhe), d = dadosDe(p), fs = formatos(true).filter(f => f.ativo || precoDe(p, f) > 0);
    const faixas = fx.faixas.length ? fx.faixas : [{ dias:'1,2,3,4,5', ini:'', fim:'' }];
    S.dialog(`<h2>${p.id ? esc(p.nome) : 'Novo produto'}</h2>
      <fieldset class="cat-escolha"><legend class="form-sec">Tipo</legend><div class="cat-ops">${SECOES.map(([k, n]) => `<label class="cat-op"><input type="radio" name="secao" value="${k}"${k === (p.secao || 'programa') ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
      <div class="g2"><label class="f" style="grid-column:1/-1">Nome do produto<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Jornal da Manhã, Rotativo 24h, Testemunhal"></label></div>
      <div class="form-sec pdt-fsec">Dias e horários</div>
      <div class="pdt-faixas" id="pdFaixas">${faixas.map(linhaFaixa).join('')}</div>
      <div class="row pdt-linha-acoes"><button type="button" class="btn sm" data-act="pdFaixaMais">${S.svg('mais')}Outra faixa</button><span class="grow"></span><label class="chk"><input type="checkbox" name="local"${fx.local || d.local ? ' checked' : ''}>Programação local</label></div>
      ${fx.obs.length || d.obs ? `<label class="f">Observação<input name="obs" value="${esc([d.obs, ...fx.obs].filter(Boolean).join(' · '))}"></label>` : '<input type="hidden" name="obs" value="">'}
      <div class="form-sec pdt-fsec">Preços por inserção</div>
      ${fs.length ? `<div class="pdt-precos">${fs.map(f => `<label class="f">${esc(f.nome)}<input name="pr_${f.id}" data-mask="dec" inputmode="decimal" value="${precoDe(p, f) ? S.nfmt(precoDe(p, f)) : ''}" placeholder="não vende"></label>`).join('')}</div>` : '<p class="muted small">Cadastre antes as durações em "Durações e variações".</p>'}
      <small class="muted">Vazio = não vende essa variação. Para criar outra (ex.: Citação 5"), use "Durações e variações".</small>
      <label class="chk"><input type="checkbox" name="ativo"${p.ativo ? ' checked' : ''}>Aparece nas novas propostas</label>
      <div class="ed-rod">${S.rodapeEdicao('Salvar produto', p.id ? 'Descartar' : 'Cancelar')}</div>`,
      f => { const faixas_ = lerFaixas(f);
        if (faixas_.some(x => !!x.ini !== !!x.fim)) return S.toast('Preencha o começo e o fim de cada faixa de horário (ou deixe os dois vazios).');
        const detalhe = faixas_.map(S.faixaTexto).join('\n');
        const dados = Object.assign({}, d, { local:f.local === 'on', obs:(f.obs || '').trim() });
        const precos = fs.map(x => ({ formato_id:x.id, preco:S.num(f['pr_' + x.id]) }));
        S.run(async () => { await S.q(S.sb.rpc('salvar_produto_radio', { p_veiculo:S.ui.vehicleId, p_produto:{ id:p.id || null, nome:f.nome.trim(), detalhe, secao:f.secao, ativo:f.ativo === 'on', dados }, p_precos:precos })); await recarregar(); }, 'Produto salvo'); }, { consulta:!!p.id });
    medio();
  };

  // Durações e variações (formatos de rádio): abre para consulta; Editar libera nome, cobrança, ativa, ordem e excluir (só a que não é usada)
  const usoVariacao = f => radioProds().filter(p => precoDe(p, f) > 0 || (dadosDe(p).incluido || []).some(x => x.formato_id === f.id && Number(x.qtd) > 0)).length;
  const formVariacoes = () => {
    S.listaEditavel({ titulo:'Durações e variações', nomeItem:['variação', 'variações'], pode:pode(), okTitulo:'Variações salvas',
      sub:'As colunas de preço dos produtos da rádio. Duração tem um preço por segundagem; preço único é um valor só (testemunhal, banner).',
      subEdit:'Arraste pela alça para mudar a ordem das colunas. Nada vai para a nuvem até Salvar.',
      itens:formatos(true).map(f => ({ id:f.id, nome:f.nome, cobranca:f.cobranca === 'unico' ? 'unico' : 'duracao', ativo:f.ativo !== false, ordem:f.ordem || 0 })),
      campos:[{ k:'nome', tipo:'texto', rot:'Nome', ph:'Ex.: Spot 30" ou Citação 5"' }, { k:'cobranca', tipo:'opcoes', rot:'Cobrança', ops:[['duracao', 'Duração'], ['unico', 'Preço único', 'laranja']] }, { k:'ativo', tipo:'chave', rot:'Ativa' }],
      uso:x => usoVariacao(x), usoTxt:n => n === 1 ? '1 produto' : `${n} produtos`,
      novo:() => ({ nome:'', cobranca:'duracao', ativo:true }),
      resumo:ls => `${ls.length} ${ls.length === 1 ? 'variação' : 'variações'} · ${ls.filter(x => x.ativo !== false).length} ativa${ls.filter(x => x.ativo !== false).length === 1 ? '' : 's'}`,
      aviso:'A lixeira só funciona para a variação que ainda não tem preço em nenhum produto. As que já são usadas se desativam: somem das propostas novas, e propostas e PIs antigos continuam com elas.',
      salvar:async dif => {
        for (const id of dif.excluidos) await S.excluir('produtos', id);
        const alt = new Map(dif.alterados.map(x => [x.id, x]));
        for (let i = 0; i < dif.ordem.length; i++) { const o = dif.ordem[i];
          if (o.novo) { await S.salvar('produtos', Object.assign({}, o.novo, { veiculo_id:S.ui.vehicleId, tipo:'formato', secao:'programa', ordem:i })); continue; }
          const atual = prod(o.id), mud = alt.get(o.id);
          if (mud || (atual && (atual.ordem || 0) !== i)) await S.salvar('produtos', Object.assign({ id:o.id, ordem:i }, mud ? { nome:mud.nome, cobranca:mud.cobranca, ativo:mud.ativo } : {})); }
        await recarregar(); } });
  };

  // ---------- rádio: cotas de patrocínio ----------
  const incluiTxt = p => (dadosDe(p).incluido || []).filter(x => Number(x.qtd) > 0).map(x => `${x.qtd} ${esc((prod(x.formato_id) || {}).nome || 'variação removida')}`).join(' · ');
  // A mistura do pacote numa barra (citações, spots, testemunhais…) nos tons do veículo, e o valor contra a cota mais cara
  const TONS = ['t-claro', 't-medio', 't-forte', 't-escuro'];
  let cotaMax = 1;
  const mistura = p => { const inc = (dadosDe(p).incluido || []).filter(x => Number(x.qtd) > 0), fs = formatos(true);
    return inc.length ? `<span class="pdt-mix" aria-hidden="true">${inc.map(x => `<i style="flex:${Number(x.qtd)};background:var(--${TONS[Math.max(0, fs.findIndex(f => f.id === x.formato_id)) % TONS.length]})" title="${x.qtd} ${esc((prod(x.formato_id) || {}).nome || '')}"></i>`).join('')}</span>` : ''; };
  const barraValor = p => `<span class="pdt-vbar" aria-hidden="true"><i style="width:${Math.max(3, Number(dadosDe(p).valor || 0) / cotaMax * 100)}%"></i></span>`;
  const vistaCotas = () => {
    const cs = radioProds().filter(p => p.secao === 'patrocinio' && (p.ativo || pode()));
    cotaMax = Math.max(1, ...cs.map(p => Number(dadosDe(p).valor || 0)));
    const linhas = cs.map(p => `<tr class="${p.ativo ? '' : 'inativo'}"><td><b>${esc(p.nome)}</b>${ehLocal(p) ? ' <span class="pill fn-ok">Local</span>' : ''}${p.ativo ? '' : ' <span class="pill fn-neutra">Inativo</span>'}</td>
      <td class="pdt-hor-td">${horario(p)}</td><td class="pdt-inclui">${mistura(p)}${incluiTxt(p) || '<span class="muted">—</span>'}</td><td class="r nw"><b>${brl(dadosDe(p).valor)}</b>${barraValor(p)}</td>
      <td class="r">${pode() ? `<span class="lin-acoes">${tres('pdMenu', p.id, p.nome)}</span>` : ''}</td></tr>`).join('');
    const cards = cs.map(p => `<article class="card pdt-card${p.ativo ? '' : ' inativo'}"><div class="pdt-cab"><h3>${esc(p.nome)}</h3>${ehLocal(p) ? '<span class="pill fn-ok">Local</span>' : ''}${pode() ? tres('pdMenu', p.id, p.nome) : ''}</div>
      <small class="muted pdt-hor">${horario(p)}</small>${mistura(p)}<small>${incluiTxt(p)}</small><b class="pdt-valor">${brl(dadosDe(p).valor)}<small class="muted">/mês</small></b></article>`).join('');
    const corpo = !cs.length ? `<div class="card empty"><b>Nenhuma cota de patrocínio</b>${pode() ? 'A cota é o programa vendido por mês, com um pacote fixo dentro (citações, spots e testemunhais).' : 'Quando o diretor cadastrar, as cotas aparecem aqui.'}</div>`
      : S.celular ? `<div class="pdt-grade">${cards}</div>` : `<section class="card"><div class="scroll"><table class="pdt-cotas"><thead><tr><th>Programa</th><th>Exibição e horário</th><th>O que inclui por mês</th><th class="r">Valor/mês</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div></section>`;
    return { title:titulo('Produtos'), actions:pode() ? `<button class="btn" data-act="pdVariacoes">Durações e variações</button><button class="btn pri" data-act="pdNovaCota">${S.svg('mais')}Nova cota de patrocínio</button>` : '',
      body:S.produtosAbas('patrocinios') + corpo + (cs.length ? '<p class="muted small pdt-nota">Na proposta a cota entra pelo botão "Patrocínio" e o SONVI coloca as inserções do pacote; no PI elas são distribuídas pelos dias, como sempre.</p>' : '') };
  };
  const opRoda = (faixas, sel) => `<option value="todas"${sel === 'todas' || sel === undefined || sel === '' ? ' selected' : ''}>Todas as faixas</option>${faixas.map((f, i) => `<option value="${i}"${String(sel) === String(i) ? ' selected' : ''}>${esc(S.faixaTexto(f))}</option>`).join('')}`;
  const linhaInc = (x, i, faixas) => `<div class="pdt-row pdt-row-inc" data-linha="${i}"><select name="in_f_${i}" aria-label="Inserção" required><option value="">Escolha</option>${formatos().map(f => `<option value="${f.id}"${f.id === x.formato_id ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>
    <input name="in_q_${i}" data-mask="int" inputmode="numeric" value="${x.qtd || ''}" placeholder="Qtd." aria-label="Quantidade por mês" required>
    <select name="in_r_${i}" aria-label="Roda em" data-roda="1">${opRoda(faixas, x.faixa)}</select>
    <button type="button" class="btn tres" data-act="pdTirarLinha" aria-label="Tirar">×</button></div>`;
  const formCota = p => {
    p = p || { ativo:true, secao:'patrocinio', nome:'', detalhe:'', dados:{ incluido:[] } };
    const fx = S.faixasDoTexto(p.detalhe), d = dadosDe(p), faixas = fx.faixas.length ? fx.faixas : [{ dias:'1,2,3,4,5', ini:'', fim:'' }];
    const inc = (d.incluido || []).length ? d.incluido : [{ formato_id:'', qtd:'', faixa:'todas' }];
    S.dialog(`<h2>${p.id ? esc(p.nome) : 'Nova cota de patrocínio'}</h2>
      <div class="g2"><label class="f">Programa<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Tarde na Verde"></label><label class="chk pdt-chk-alto"><input type="checkbox" name="local"${fx.local || d.local ? ' checked' : ''}>Programação local</label></div>
      <div class="form-sec pdt-fsec">Dias e horários</div>
      <div class="pdt-faixas" id="pdFaixas">${faixas.map(linhaFaixa).join('')}</div>
      <button type="button" class="btn sm" data-act="pdFaixaMais" data-pd-add="1">${S.svg('mais')}Outra faixa</button>
      <div class="form-sec pdt-fsec">O que está incluído · por mês</div>
      <div class="pdt-rows" id="pdInc">${inc.map((x, i) => linhaInc(x, i, faixas)).join('')}</div>
      <button type="button" class="btn sm" data-act="pdIncMais" data-pd-add="1">${S.svg('mais')}Incluir</button>
      <div class="g2"><label class="f">Valor da cota por mês (R$)<input name="valor" data-mask="dec" inputmode="decimal" required value="${d.valor ? S.nfmt(d.valor) : ''}"></label>
        <label class="chk pdt-chk-alto"><input type="checkbox" name="ativo"${p.ativo ? ' checked' : ''}>Aparece nas novas propostas</label></div>
      <p class="muted small">Na proposta: uma cota com o valor do mês. No PI: as inserções do pacote distribuídas nos dias de cada faixa.</p>
      <div class="ed-rod">${S.rodapeEdicao('Salvar cota', p.id ? 'Descartar' : 'Cancelar')}</div>`,
      f => { const faixas_ = lerFaixas(f);
        if (faixas_.some(x => !!x.ini !== !!x.fim)) return S.toast('Preencha o começo e o fim de cada faixa de horário.');
        const incluido = Object.keys(f).filter(k => k.startsWith('in_f_')).map(k => k.slice(5)).map(i => ({ formato_id:f['in_f_' + i], qtd:parseInt(f['in_q_' + i]) || 0, faixa:f['in_r_' + i] || 'todas' })).filter(x => x.formato_id && x.qtd > 0);
        if (!incluido.length) return S.toast('Inclua ao menos uma inserção na cota.');
        const valor = S.num(f.valor); if (!(valor > 0)) return S.toast('Informe o valor da cota.');
        const dados = Object.assign({}, d, { local:f.local === 'on', incluido, valor });
        S.run(async () => { await S.q(S.sb.rpc('salvar_produto_radio', { p_veiculo:S.ui.vehicleId, p_produto:{ id:p.id || null, nome:f.nome.trim(), detalhe:faixas_.map(S.faixaTexto).join('\n'), secao:'patrocinio', ativo:f.ativo === 'on', dados }, p_precos:[] })); await recarregar(); }, 'Cota salva'); }, { consulta:!!p.id });
    medio();
  };
  // As opções de "Roda em" acompanham as faixas digitadas
  const atualizaRoda = () => { const d = document.getElementById('dlg'); if (!d || !d.open || !d.querySelector('#pdInc')) return;
    const fs = [...d.querySelectorAll('#pdFaixas .pdt-faixa')].map(r => ({ dias:r.querySelector('select').value, ini:r.querySelectorAll('input')[0].value.trim(), fim:r.querySelectorAll('input')[1].value.trim() }));
    d.querySelectorAll('[data-roda]').forEach(s => { const v = s.value; s.innerHTML = opRoda(fs, v === 'todas' || +v < fs.length ? v : 'todas'); }); };
  ['input', 'change'].forEach(ev => document.addEventListener(ev, e => { if (e.target.closest && e.target.closest('#pdFaixas')) atualizaRoda(); }));

  // ---------- mídia exterior ----------
  const ehInsercao = p => (dadosDe(p).cobranca || COBRA[p.categoria]) === 'insercao';
  const foto = (src, w = 64, h = 44, alt = '') => src ? `<img class="pdt-foto" src="${src}" width="${w}" height="${h}" alt="${esc(alt)}">` : `<span class="pdt-foto vazia" style="width:${w}px;height:${h}px" aria-hidden="true">${S.svg('imagem', 18)}</span>`;
  // Mídia exterior no padrão da rádio (aprovado em 25/10/2026): "Tabela da <veículo>" com Cartões · Mapa de preços, quatro números,
  // filtro por categoria (quando há mais de uma) e, para quem vende por inserção, a comparação por variação. Cartões em grade com
  // miniaturas pequenas dos pontos ao lado do nome, preços com barra proporcional ao maior da tabela e um exemplo da conta.
  const po = { vista:'cartoes', cat:'', varia:'' };
  const fotosDe = p => { const d = dadosDe(p); return ehInsercao(p) ? (d.pontos || []).map(x => x.foto).filter(Boolean) : [(d.ponto || {}).foto].filter(Boolean); };
  const unidadesDe = p => { const d = dadosDe(p); return (d.pontos || []).length || Number(d.frota) || 1; };
  const mini = p => { const fs = fotosDe(p), d = dadosDe(p);
    return `<span class="pdt-mini" aria-hidden="true">${fs.length ? fs.slice(0, 3).map(src => `<img src="${src}" width="36" height="36" alt="">`).join('') + (fs.length > 3 ? `<span class="q">+${fs.length - 3}</span>` : '')
      : `<span class="q">${ehInsercao(p) ? (d.frota || (d.pontos || []).length || '—') : S.svg('imagem', 16)}</span>`}</span>`; };
  const cartaoOoh = (p, mx) => { const d = dadosDe(p), vs = (d.variacoes || []).filter(x => Number(x.valor) > 0), ins = ehInsercao(p), pr = d.producao || {}, pt = d.ponto || {};
    const sub = ins ? `por inserção · por dia · por ${unidade(d, 1)}${d.funcionamento ? ' · ' + esc(d.funcionamento) : ''}` : [pt.endereco, pt.cidade].filter(Boolean).map(esc).join(' · ') || 'Endereço não informado';
    const spec = ins ? (d.obs ? esc(d.obs) : '') : [pt.formato, pt.impacto ? `${esc(pt.impacto)}/dia` : '', pt.impacto_mes ? `${esc(pt.impacto_mes)}/mês` : ''].filter(Boolean).join(' · ');
    const filtra = ins && po.varia;
    const linhas = vs.map(x => `<div class="pdt-pb${filtra && x.nome === po.varia ? ' foco' : ''}"><span title="${esc(x.nome + (x.obs ? ' · ' + x.obs : ''))}">${esc(x.nome)}${x.obs ? `<small> · ${esc(x.obs)}</small>` : ''}</span><span class="pdt-pb-barra" aria-hidden="true"><i style="width:${Math.max(3, x.valor / mx * 100)}%"></i></span><b>${brl(x.valor)}</b></div>`).join('')
      + (!ins && Number(pr.valor) > 0 ? `<div class="pdt-pb prod"><span>${esc(pr.nome || 'Produção')}<small> · uma vez</small></span><span class="pdt-pb-barra" aria-hidden="true"><i style="width:${Math.max(3, pr.valor / mx * 100)}%"></i></span><b>${brl(pr.valor)}</b></div>` : '');
    const n = unidadesDe(p), ref = vs.find(x => x.nome === po.varia) || vs.find(x => /30/.test(x.nome)) || vs[0];
    const conta = !ref ? '' : ins ? `Exemplo: <b>${esc(ref.nome)}</b> · 30 por dia · ${n} ${unidade(d, n)} · 30 dias = <b>${brl(ref.valor * 30 * n * 30)}</b> no mês`
      : `Exemplo: <b>${vs.length > 1 ? 'todas as faces' : esc(ref.nome)}</b> por 1 mês = <b>${brl(vs.reduce((a, x) => a + Number(x.valor), 0))}</b>${Number(pr.valor) > 0 ? ` + produção ${brl(pr.valor)} (uma vez)` : ''}`;
    const pe = ins ? `<button type="button" class="pdt-ooh-pe" data-go="/produtos/${p.id}"><span>${(d.pontos || []).length ? `${d.pontos.length} ${unidade(d, d.pontos.length)}` : d.frota ? `${d.frota} ${unidade(d, d.frota)} na frota` : 'Cadastrar pontos'}</span><span class="grow"></span><b>Ver pontos</b>${S.svg('seta', 16)}</button>`
      : pode() ? `<button type="button" class="pdt-ooh-pe" data-act="pdEditarOoh" data-id="${p.id}"><span>Ficha do ponto</span><span class="grow"></span><b>Editar ficha</b>${S.svg('seta', 16)}</button>` : '';
    return `<article class="card pdt-card pdt-ooh2${p.ativo ? '' : ' inativo'}" data-flip="${p.id}"><div class="pdt-ooh-cab">${mini(p)}<div class="pdt-ooh-tx"><h3>${ins ? `<a data-go="/produtos/${p.id}">${esc(p.nome)}</a>` : esc(p.nome)}</h3><small>${sub}</small>${spec ? `<small>${spec}</small>` : ''}</div>
        ${p.ativo ? '' : '<span class="pill fn-neutra">Inativo</span>'}<span class="pdt-tipo">${esc(S.nomeCategoria(p.categoria))}</span>${pode() ? tres('pdMenuOoh', p.id, p.nome) : ''}</div>
      ${linhas ? `<div class="pdt-precos-b${filtra ? ' filtra' : ''}">${linhas}</div>` : '<span class="muted small">Sem preço ainda</span>'}
      ${conta ? `<div class="pdt-conta">${conta}</div>` : ''}${pe}</article>`; };
  const vistaOoh = () => {
    const cats = catsOoh(), todos = oohProds().filter(p => p.ativo || pode());
    if (po.cat && !cats.includes(po.cat)) po.cat = '';
    const ps = todos.filter(p => !po.cat || p.categoria === po.cat), insV = todos.some(ehInsercao), mesV = todos.some(p => !ehInsercao(p));
    const vals = p => (dadosDe(p).variacoes || []).filter(x => Number(x.valor) > 0);
    const varsIns = [...new Set(ps.filter(ehInsercao).flatMap(p => vals(p).map(x => x.nome)))];
    if (po.varia && !varsIns.includes(po.varia)) po.varia = '';
    const precos = ps.flatMap(p => vals(p).map(x => ({ p, n:x.nome, v:Number(x.valor), ins:ehInsercao(p) })));
    const mx = Math.max(1, ...ps.flatMap(p => [...vals(p).map(x => Number(x.valor)), Number((dadosDe(p).producao || {}).valor) || 0]));
    const grupo = insV && !mesV ? precos : precos.filter(x => x.ins === (insV && !mesV));
    const menor = grupo.reduce((a, x) => !a || x.v < a.v ? x : a, null), maior = grupo.reduce((a, x) => !a || x.v > a.v ? x : a, null);
    const pIns = todos.filter(ehInsercao), pMes = todos.filter(p => !ehInsercao(p));
    const kpis = insV && !mesV
      ? `<div><small>Produtos ativos</small><b>${S.roloFixo('po1', String(todos.filter(p => p.ativo).length))}</b><span>em ${cats.length} categoria${cats.length === 1 ? '' : 's'}</span></div>
        <div><small>Pontos</small><b>${S.roloFixo('po2', String(pIns.reduce((a, p) => a + unidadesDe(p), 0)))}</b><span>${pIns.map(p => `${unidadesDe(p)} ${unidade(dadosDe(p), unidadesDe(p))}`).join(' · ') || '—'}</span></div>`
      : `<div><small>Pontos</small><b>${S.roloFixo('po1', String(pMes.length + pIns.reduce((a, p) => a + unidadesDe(p), 0)))}</b><span>${cats.map(k => S.nomeCategoria(k)).join(' · ')}</span></div>
        <div><small>Faces</small><b>${S.roloFixo('po2', String(pMes.reduce((a, p) => a + vals(p).length, 0)))}</b><span>à venda por mês</span></div>`;
    const un = insV && !mesV ? 'por inserção' : 'por mês';
    const fmt = v => v < 100 ? brl(v) : curto(v);
    const topo = `<section class="card pdt-topo" aria-labelledby="pdt-t"><div class="hd"><h2 id="pdt-t">Tabela da ${esc(S.veh().nome)}</h2>
        <div class="seg" role="group" aria-label="Ver como">${[['cartoes', 'Cartões'], ['mapa', 'Mapa de preços']].map(([k, n]) => `<button class="${po.vista === k ? 'on' : ''}" data-act="poVista" data-v="${k}" aria-pressed="${po.vista === k}">${n}</button>`).join('')}</div></div>
      <div class="pdt-kpis">${kpis}<div><small>${insV && !mesV ? 'Menor preço' : 'Menor face'}</small><b>${S.roloFixo('po3', menor ? fmt(menor.v) : 'R$ 0')}</b><span>${menor ? `${un} · ${esc(menor.n)}` : '—'}</span></div>
        <div><small>${insV && !mesV ? 'Maior preço' : 'Maior face'}</small><b>${S.roloFixo('po4', maior ? fmt(maior.v) : 'R$ 0')}</b><span>${maior ? `${un} · ${esc(maior.p.nome)}` : '—'}</span></div></div>
      ${cats.length > 1 || varsIns.length ? `<div class="pdt-comparar">${cats.length > 1 ? `<span class="pdt-rot">Categoria</span><div class="pdt-var-chips" role="group" aria-label="Categoria">${[['', 'Todas'], ...cats.map(k => [k, S.nomeCategoria(k)])].map(([k, n]) => `<button data-act="poCat" data-v="${k}" aria-pressed="${po.cat === k}">${esc(n)}</button>`).join('')}</div>` : ''}
        ${varsIns.length ? `<span class="pdt-rot">Comparar</span><div class="pdt-var-chips" role="group" aria-label="Comparar uma variação">${varsIns.map(n => `<button data-act="poVar" data-v="${esc(n)}" aria-pressed="${po.varia === n}">${esc(n)}</button>`).join('')}</div><span class="grow"></span>
          ${po.varia ? (() => { const xs = precos.filter(x => x.n === po.varia).map(x => x.v); return `<span class="pill fn-ok">${esc(po.varia)}: ${xs.length > 1 ? `de ${brl(Math.min(...xs))} a ${brl(Math.max(...xs))}` : brl(xs[0])} · ${xs.length} produto${xs.length === 1 ? '' : 's'}</span>`; })() : '<span class="pill fn-neutra">Escolha uma variação para comparar</span>'}` : ''}</div>` : ''}</section>`;
    let corpo;
    if (po.vista === 'mapa') {
      const pi = ps.filter(ehInsercao), pm = ps.filter(p => !ehInsercao(p));
      const tabela = (titulo, linhas, cols, valor, mn, mxx, rot) => { const fx = Math.max(1e-9, mxx - mn);
        return `<div class="pdt-mapa scroll"><table><thead><tr><th>${titulo}</th>${cols.map(c => `<th class="c${c === po.varia ? ' on' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>
          ${linhas.map(p => `<tr><td class="nome"><b>${esc(p.nome)}</b></td>${cols.map(c => { const v = valor(p, c), pc = v ? Math.round(12 + (v - mn) / fx * 88) : 0;
            return `<td class="${c === po.varia ? 'on' : ''}">${v ? `<span class="pdt-cel" style="--p:${pc}" title="${esc(p.nome)} · ${esc(c)}: ${brl(v)}"><span>${fmt(v).replace('R$ ', '')}</span></span>` : '<span class="pdt-cel nada">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
          <div class="pdt-escala"><span>${fmt(mn)}</span><i aria-hidden="true"></i><span>${fmt(mxx)}</span><span class="grow"></span><span>${rot}</span></div>`; };
      const vi = pi.flatMap(p => vals(p).map(x => Number(x.valor))), vm = pm.flatMap(p => [...vals(p).map(x => Number(x.valor)), Number((dadosDe(p).producao || {}).valor) || 0]).filter(Boolean);
      const facesN = [...new Set(pm.flatMap(p => vals(p).map(x => x.nome)))];
      corpo = `<section class="card" aria-labelledby="pdt-tm"><div class="hd"><h2 id="pdt-tm">Mapa de preços</h2><span>quanto mais forte, mais caro</span></div>
        ${pi.length ? tabela('<span class="sr">Produto</span>', pi, varsIns, (p, c) => Number((vals(p).find(x => x.nome === c) || {}).valor) || 0, Math.min(...vi), Math.max(...vi), 'preço por inserção') : ''}
        ${pm.length ? tabela('<span class="sr">Ponto</span>', pm, [...facesN, 'Produção'], (p, c) => c === 'Produção' ? Number((dadosDe(p).producao || {}).valor) || 0 : Number((vals(p).find(x => x.nome === c) || {}).valor) || 0, Math.min(...vm), Math.max(...vm), 'preço por mês; a produção é cobrada uma vez') : ''}</section>`;
    } else corpo = `<div class="pdt-grade">${ps.map(p => cartaoOoh(p, mx)).join('')}</div>`;
    return { title:titulo('Produtos'), actions:pode() ? `<button class="btn pri" data-act="pdNovoOoh">${S.svg('mais')}Novo produto</button>` : '',
      body:S.produtosAbas('ooh') + (todos.length ? topo + corpo : `<div class="card empty"><b>Nenhum produto cadastrado</b>${pode() ? `Cadastre o que ${esc(S.veh().nome)} vende: ${cats.map(k => S.nomeCategoria(k).toLowerCase()).join(', ')}.` : 'Quando o diretor cadastrar, os produtos aparecem aqui.'}</div>`)
        + (todos.length ? '<p class="muted small pdt-nota">Mudar um preço vale na hora para as propostas novas. Na proposta, estes produtos entram pelo botão "Produto".</p>' : '') };
  };
  // Página de um produto por inserção: os pontos onde ele roda e o preço
  const vistaPontos = p => {
    const d = dadosDe(p), pts = d.pontos || [], vs = (d.variacoes || []).filter(x => Number(x.valor) > 0), n = pts.length;
    const linha = (x, i) => `<div class="pdt-pt">${foto(x.foto, 64, 44, x.codigo)}<span class="pdt-pt-n"><b>${esc(cap(unidade(d, 1)))} ${esc(x.codigo)}</b><small class="muted">${esc(x.endereco || '')}</small></span>
      <span class="nw">${esc(x.cidade || '')}</span><span class="r nw">${x.impacto ? esc(x.impacto) + '/dia' : '—'}</span><span class="r nw">${esc(x.formato || '')}</span>${pode() ? tres('pdMenuPonto', p.id + ':' + i, 'ponto ' + x.codigo) : '<span></span>'}</div>`;
    const ex = vs[0], exQ = 30, exD = 30, exN = n || Number(d.frota) || 1, exTot = ex ? Number(ex.valor) * exQ * exN * exD : 0;
    return { title:`<span class="sub"><a data-go="${ehRadio() ? '/produtos/ooh' : '/produtos'}">← Produtos</a> · ${esc(S.veh().nome)}</span>${esc(p.nome)}`,
      actions:pode() ? `<button class="btn" data-act="pdEditarOoh" data-id="${p.id}">${S.svg('editar')}Editar produto</button><button class="btn pri" data-act="pdNovoPonto" data-id="${p.id}">${S.svg('mais')}Novo ponto</button>` : '',
      body:`<div class="pdt-pontos-tela"><section class="card"><div class="hd"><h2>Pontos <span class="pill">${n}</span></h2><small class="muted">onde o produto roda</small></div>
        ${n ? `<div class="pdt-pt pdt-pt-h"><span></span><span>Ponto</span><span>Cidade</span><span class="r">Impacto</span><span class="r">Formato</span><span></span></div>${pts.map(linha).join('')}` : `<p class="muted">Nenhum ponto ainda.${pode() ? ' Clique em "Novo ponto" para cadastrar o primeiro.' : ''}</p>`}</section>
        <section class="card pdt-preco"><h2>Preço</h2><small class="muted">por inserção · por dia · por ${unidade(d, 1)}</small>
          <div class="pdt-vars">${vs.length ? vs.map(x => chip(x.nome, x.valor)).join('') : '<span class="muted small">Sem preço ainda</span>'}</div>
          ${d.obs ? `<small class="muted">${esc(d.obs)}</small>` : ''}${d.funcionamento ? `<small class="muted">Funcionamento: ${esc(d.funcionamento)}</small>` : ''}${d.arquivo ? `<small class="muted">Arquivo: ${esc(d.arquivo)}</small>` : ''}
          ${ex ? `<div class="caixa pdt-calc"><b>Exemplo na proposta</b><span>${esc(ex.nome)} × ${exQ} inserções/dia × ${exN} ${unidade(d, exN)} × ${exD} dias</span><b>= ${brl(exTot)}</b></div>` : ''}</section></div>` };
  };
  // Formulário do produto de mídia exterior
  const linhaVar = (x, i, face) => `<div class="pdt-row ${face ? 'pdt-row-face' : 'pdt-row-v'}" data-linha="${i}"><input name="ov_n_${i}" value="${esc(x.nome || '')}" placeholder="${face ? 'Face A' : 'VT15"'}" aria-label="${face ? 'Face' : 'Variação'}">
    ${face ? `<input name="ov_o_${i}" value="${esc(x.obs || '')}" placeholder="Sentido (ex.: Centro → Chapada)" aria-label="Sentido">` : ''}
    <input name="ov_v_${i}" data-mask="dec" inputmode="decimal" value="${Number(x.valor) ? S.nfmt(x.valor) : ''}" placeholder="0,00" aria-label="Preço">
    <button type="button" class="btn tres" data-act="pdTirarLinha" aria-label="Tirar">×</button></div>`;
  const formOoh = (p, cat) => {
    const cats = catsOoh(); cat = (p && p.categoria) || cat || cats[0];
    p = p || { ativo:true, categoria:cat, nome:'', dados:{} };
    const d = dadosDe(p), pt = d.ponto || {}, pr = d.producao || {};
    const vIns = (d.cobranca === 'insercao' && (d.variacoes || []).length) ? d.variacoes : [{ nome:'VT15"' }, { nome:'VT30"' }, { nome:'VT45"' }, { nome:'VT60"' }];
    const vMes = (d.cobranca === 'mes' && (d.variacoes || []).length) ? d.variacoes : [{ nome:'Face A' }];
    const campo = (k, rot, val, ex = '', full) => `<label class="f"${full ? ' style="grid-column:1/-1"' : ''}>${rot}<input name="${k}" value="${esc(val || '')}"${ex ? ` placeholder="${esc(ex)}"` : ''}></label>`;
    S.dialog(`<h2>${p.id ? esc(p.nome) : 'Novo produto · ' + esc(S.veh().nome)}</h2>
      ${cats.length > 1 ? `<fieldset class="cat-escolha"><legend class="form-sec">Categoria</legend><div class="cat-ops">${cats.map(k => `<label class="cat-op"><input type="radio" name="categoria" value="${k}"${k === cat ? ' checked' : ''}><span>${esc(S.nomeCategoria(k))}</span></label>`).join('')}</div></fieldset>` : `<input type="hidden" name="categoria" value="${cat}">`}
      <div class="g2"><label class="f" style="grid-column:1/-1">Nome do produto<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Painéis de LED, Front light 1001, Empena 001"></label></div>
      <div class="pdt-bloco" data-cobra="insercao">
        <div class="g2"><label class="f">Vendido por<select name="unidade">${Object.entries(UNIDADE).map(([k, [um]]) => `<option value="${k}"${(d.unidade || 'painel') === k ? ' selected' : ''}>${um}</option>`).join('')}</select></label>
          ${campo('funcionamento', 'Funcionamento', d.funcionamento, 'Todos os dias · 6h às 0h')}${campo('arquivo', 'Arquivo padrão', d.arquivo, 'Vídeo MP4 · 1024 × 768 px', true)}</div>
        <div class="form-sec pdt-fsec">Preço por inserção · por dia · por ponto</div>
        <div class="pdt-rows" id="pdVarIns">${vIns.map((x, i) => linhaVar(x, i, false)).join('')}</div>
        <button type="button" class="btn sm" data-act="pdVarOohMais" data-face="" data-pd-add="1">${S.svg('mais')}Variação</button>
        <p class="muted small">Os pontos (painéis, ônibus, telas) você cadastra depois, na página do produto.</p></div>
      <div class="pdt-bloco" data-cobra="mes">
        <div class="g2">${campo('pt_codigo', 'Código do ponto', pt.codigo, '1001')}${campo('pt_formato', 'Formato', pt.formato, '9,00 × 3,00 m')}
          ${campo('pt_endereco', 'Endereço / referência', pt.endereco, 'Av. República do Líbano · Clube Monte Líbano', true)}${campo('pt_cidade', 'Cidade', pt.cidade, 'Cuiabá')}
          ${campo('pt_impacto', 'Fluxo diário', pt.impacto, '16 mil veículos')}${campo('pt_impacto_mes', 'Fluxo mensal', pt.impacto_mes, '480 mil veículos')}
          ${campo('pt_coords', 'Coordenadas', pt.coords, '-15.5702, -56.0861')}${campo('pt_maps', 'Link do Google Maps', pt.maps, 'https://goo.gl/maps/…', true)}</div>
        ${campoFoto(pt.foto)}
        <div class="form-sec pdt-fsec">Faces · preço por mês</div>
        <div class="pdt-rows" id="pdVarMes">${vMes.map((x, i) => linhaVar(x, i, true)).join('')}</div>
        <button type="button" class="btn sm" data-act="pdVarOohMais" data-face="1" data-pd-add="1">${S.svg('mais')}Face</button>
        <div class="form-sec pdt-fsec">Produção (cobrada uma vez)</div>
        <div class="g2">${campo('pr_nome', 'O que é produzido', pr.nome, 'Lona alta resolução')}<label class="f">Valor por face (R$)<input name="pr_valor" data-mask="dec" inputmode="decimal" value="${Number(pr.valor) ? S.nfmt(pr.valor) : ''}"></label></div></div>
      <label class="chk"><input type="checkbox" name="ativo"${p.ativo ? ' checked' : ''}>Aparece nas novas propostas</label>
      <div class="ed-rod">${S.rodapeEdicao('Salvar produto', p.id ? 'Descartar' : 'Cancelar')}</div>`,
      f => { const k = f.categoria, cobranca = COBRA[k] || 'mes';
        const vars = (pre, face) => Object.keys(f).filter(x => x.startsWith(pre + 'n_')).map(x => x.slice(pre.length + 2)).map(i => ({ nome:(f[pre + 'n_' + i] || '').trim(), obs:face ? (f[pre + 'o_' + i] || '').trim() : undefined, valor:S.num(f[pre + 'v_' + i]) })).filter(x => x.nome);
        const base = Object.assign({}, d, { cobranca });
        if (cobranca === 'insercao') Object.assign(base, { unidade:f.unidade, funcionamento:(f.funcionamento || '').trim(), arquivo:(f.arquivo || '').trim(), variacoes:vars('ov_', false), pontos:d.pontos || [] });
        else Object.assign(base, { variacoes:vars('ov_', true), producao:{ nome:(f.pr_nome || '').trim(), valor:S.num(f.pr_valor) },
          ponto:Object.assign({}, pt, { codigo:(f.pt_codigo || '').trim(), formato:(f.pt_formato || '').trim(), endereco:(f.pt_endereco || '').trim(), cidade:(f.pt_cidade || '').trim(), impacto:(f.pt_impacto || '').trim(), impacto_mes:(f.pt_impacto_mes || '').trim(), coords:(f.pt_coords || '').trim(), maps:(f.pt_maps || '').trim(), foto:f.foto || '' }) });
        S.run(async () => { const r = await S.salvar('produtos', Object.assign({ nome:f.nome.trim(), ativo:f.ativo === 'on', categoria:k, secao:'ooh', dados:base, detalhe:cobranca === 'mes' ? (f.pt_endereco || '').trim() : (f.funcionamento || '').trim() },
          p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo:'programa', ordem:oohProds().length }));
          if (!p.id && cobranca === 'insercao' && r) location.hash = '/produtos/' + r.id; }, 'Produto salvo'); }, { consulta:!!p.id });
    medio();
    alternarBloco();
  };
  // Mostra só os campos do jeito de cobrar da categoria escolhida; os escondidos não contam no envio
  const alternarBloco = () => { const d = document.getElementById('dlg'), f = d && d.querySelector('form'); if (!f || !f.querySelector('.pdt-bloco')) return;
    const k = (f.querySelector('[name="categoria"]:checked') || f.querySelector('[name="categoria"]')).value, c = COBRA[k] || 'mes';
    const ver = f.classList.contains('ver');
    f.querySelectorAll('.pdt-bloco').forEach(b => { const on = b.dataset.cobra === c; b.hidden = !on; b.querySelectorAll('input, select, textarea, button').forEach(el => {
      if (!on) { el.disabled = true; delete el.dataset.trava; } else if (ver && el.tagName !== 'BUTTON' && el.type !== 'hidden') { el.disabled = true; el.dataset.trava = '1'; } else el.disabled = false; }); }); };
  document.addEventListener('change', e => { if (e.target.name === 'categoria' && e.target.closest('#dlg')) alternarBloco(); });

  // Foto do ponto: reduzida no navegador (até 1000 px, JPEG) e guardada junto do produto
  const campoFoto = src => `<div class="pdt-foto-campo">${foto(src, 120, 84, 'Foto do ponto')}<div><b>Foto do ponto</b><small class="muted">JPG ou PNG. Sai no mídia kit.</small>
    <div class="row"><button type="button" class="btn sm" data-act="pdFotoEscolher">${S.svg('baixar')}${src ? 'Trocar foto' : 'Enviar foto'}</button>${src ? '<button type="button" class="btn sm" data-act="pdFotoTirar">Remover</button>' : ''}</div></div>
    <input type="file" accept="image/png,image/jpeg,image/webp" id="pdFotoArq" hidden><input type="hidden" name="foto" value="${esc(src || '')}"></div>`;
  const lerFoto = arq => new Promise((ok, erro) => { if (!/^image\/(png|jpe?g|webp)$/.test(arq.type)) return erro(new Error('Use uma foto JPG, PNG ou WebP.'));
    const url = URL.createObjectURL(arq), img = new Image(); img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível abrir essa foto.')); };
    img.onload = () => { const e = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .78)); }; img.src = url; });
  const trocarFoto = src => { const el = document.querySelector('#dlg .pdt-foto-campo'); if (!el) return; el.outerHTML = campoFoto(src); const d = document.getElementById('dlg'); if (d) d.dataset.sujo = '1'; };
  document.addEventListener('change', async e => { if (e.target.id !== 'pdFotoArq' || !e.target.files[0]) return;
    try { trocarFoto(await lerFoto(e.target.files[0])); } catch (er) { S.toast(er.message); } });

  // Ponto (painel, ônibus, tela) de um produto por inserção
  const formPonto = (p, i) => { const d = dadosDe(p), pts = d.pontos || [], x = i === undefined ? { id:S.uid() } : pts[i];
    const campo = (k, rot, ex = '', full) => `<label class="f"${full ? ' style="grid-column:1/-1"' : ''}>${rot}<input name="${k}" value="${esc(x[k] || '')}"${ex ? ` placeholder="${esc(ex)}"` : ''}${k === 'codigo' ? ' required' : ''}></label>`;
    S.dialog(`<h2>${i === undefined ? 'Novo ponto' : `Ponto ${esc(x.codigo)}`} · ${esc(p.nome)}</h2>
      <div class="g2">${campo('codigo', 'Código', '001')}${campo('cidade', 'Cidade', 'Cuiabá')}${campo('endereco', 'Endereço / referência', 'Av. Fernando Corrêa (ao lado do Hotel Ibis)', true)}
        ${campo('impacto', 'Impacto por dia', '10.000 veículos')}${campo('obs', 'Observação do impacto', 'BR 251 + tráfego local')}
        ${campo('formato', 'Formato', '5,12 × 2,88 m')}${campo('arquivo', 'Especificação do arquivo', d.arquivo || 'MP4 · 1024 × 768 px')}
        ${campo('coords', 'Coordenadas', '15°36\'05"S 56°05\'16"W')}${campo('maps', 'Link do Google Maps', 'https://goo.gl/maps/…')}</div>
      ${campoFoto(x.foto)}
      <div class="ed-rod">${S.rodapeEdicao('Salvar ponto', i !== undefined ? 'Descartar' : 'Cancelar')}</div>`,
      f => { const novo = Object.assign({}, x, ...['codigo', 'cidade', 'endereco', 'impacto', 'obs', 'formato', 'arquivo', 'coords', 'maps', 'foto'].map(k => ({ [k]:(f[k] || '').trim() })));
        const lista = [...pts]; if (i === undefined) lista.push(novo); else lista[i] = novo;
        S.run(() => S.salvar('produtos', { id:p.id, dados:Object.assign({}, d, { pontos:lista }) }), 'Ponto salvo'); }, { consulta:i !== undefined });
    medio();
  };

  // ---------- tela ----------
  S.views.produtos = id => {
    if (['digital', 'canais'].includes(id) || (id && (S.db.tabelas || []).some(t => t.id === id && S.tipoTabela(t) === 'digital'))) return S.views.cadastros(id);
    if (!ehRadio()) { const p = id && prod(id); return p && p.secao === 'ooh' && ehInsercao(p) ? vistaPontos(p) : vistaOoh(); }
    if (id === 'patrocinios') return vistaCotas();
    if (id === 'ooh' && catsOoh().length) return vistaOoh();
    const p = id && prod(id); if (p && p.secao === 'ooh' && ehInsercao(p)) return vistaPontos(p);
    return vistaRadio();
  };

  // ---------- ações ----------
  const novaLinha = (alvo, html) => { const c = document.getElementById(alvo); if (!c) return; c.insertAdjacentHTML('beforeend', html); const el = c.lastElementChild.querySelector('input, select'); if (el) el.focus();
    const d = document.getElementById('dlg'); if (d) d.dataset.sujo = '1'; };
  Object.assign(S.actions, {
    pdNovo: () => formRadio(null),
    poVista: d => { if (po.vista === d.v) return; po.vista = d.v; S.render(); },
    poCat: d => { po.cat = d.v; S.flip(S.render); },
    poVar: d => { po.varia = po.varia === d.v ? '' : d.v; S.render(); },
    pdVista: d => { if (pv.vista === d.v) return; pv.vista = d.v; S.render(); },
    pdVar: d => { pv.varia = pv.varia === d.id ? '' : d.id; S.render(); },
    pdNovaCota: () => formCota(null),
    pdNovoOoh: () => formOoh(null),
    pdEditarOoh: d => formOoh(prod(d.id)),
    pdVariacoes: () => formVariacoes(),
    pdFaixaMais: () => { novaLinha('pdFaixas', linhaFaixa({ dias:'1,2,3,4,5', ini:'', fim:'' }, nLinha++)); atualizaRoda(); },
    pdIncMais: () => { const fs = [...document.querySelectorAll('#pdFaixas .pdt-faixa')].map(r => ({ dias:r.querySelector('select').value, ini:r.querySelectorAll('input')[0].value, fim:r.querySelectorAll('input')[1].value }));
      novaLinha('pdInc', linhaInc({ formato_id:'', qtd:'', faixa:'todas' }, nLinha++, fs)); },
    pdVarOohMais: d => novaLinha(d.face ? 'pdVarMes' : 'pdVarIns', linhaVar({ nome:'' }, nLinha++, !!d.face)),
    pdTirarLinha: (d, b) => { const l = b.closest('.pdt-faixa, .pdt-row'), c = l && l.parentElement; if (!l) return;
      if (c.children.length === 1 && c.id === 'pdFaixas') return S.toast('O produto precisa de ao menos uma faixa (deixe os horários vazios para "a combinar").');
      l.remove(); atualizaRoda(); const dd = document.getElementById('dlg'); if (dd) dd.dataset.sujo = '1'; },
    pdFotoEscolher: () => document.getElementById('pdFotoArq').click(),
    pdFotoTirar: () => trocarFoto(''),
    pdMenu: (d, b) => { const p = prod(d.id); if (!p) return;
      S.menu(b, [{ label:'Editar', icon:'editar', act:'pdEditar', data:{ id:p.id } }, { label:p.ativo ? 'Tirar das novas propostas' : 'Voltar às novas propostas', act:'pdAtivo', data:{ id:p.id } }, '-', { label:'Excluir', act:'pdExcluir', data:{ id:p.id }, perigo:true }]); },
    pdMenuOoh: (d, b) => { const p = prod(d.id); if (!p) return;
      S.menu(b, [...(ehInsercao(p) ? [{ label:'Ver pontos', act:'pdAbrir', data:{ id:p.id } }] : []), { label:'Editar', icon:'editar', act:'pdEditarOoh', data:{ id:p.id } }, { label:p.ativo ? 'Tirar das novas propostas' : 'Voltar às novas propostas', act:'pdAtivo', data:{ id:p.id } }, '-', { label:'Excluir', act:'pdExcluir', data:{ id:p.id }, perigo:true }]); },
    pdAbrir: d => { location.hash = '/produtos/' + d.id; },
    pdEditar: d => { const p = prod(d.id); if (!p) return; if (p.secao === 'patrocinio') formCota(p); else formRadio(p); },
    pdAtivo: d => { const p = prod(d.id); if (p) S.run(() => S.salvar('produtos', { id:p.id, ativo:!p.ativo }), p.ativo ? 'Fora das novas propostas' : 'De volta às novas propostas'); },
    pdExcluir: async d => { const p = prod(d.id); if (!p) return;
      if (!await S.confirmar(`Excluir "${p.nome}"?\n\nPropostas e PIs já feitos continuam com o nome e o valor que tinham. Se for só para parar de vender, prefira "Tirar das novas propostas".`, { ok:'Excluir produto', perigo:true })) return;
      S.run(async () => { await S.excluir('produtos', p.id); await recarregar(); if (location.hash.includes(p.id)) location.hash = ehRadio() && p.secao === 'ooh' ? '/produtos/ooh' : '/produtos'; }, 'Produto excluído'); },
    pdNovoPonto: d => { const p = prod(d.id); if (p) formPonto(p); },
    pdMenuPonto: (d, b) => { const [id, i] = d.id.split(':'); S.menu(b, [{ label:'Editar', icon:'editar', act:'pdEditarPonto', data:{ id, i } }, '-', { label:'Tirar este ponto', act:'pdTirarPonto', data:{ id, i }, perigo:true }]); },
    pdEditarPonto: d => { const p = prod(d.id); if (p) formPonto(p, +d.i); },
    pdTirarPonto: async d => { const p = prod(d.id); if (!p) return; const dd = dadosDe(p), x = (dd.pontos || [])[+d.i]; if (!x) return;
      if (!await S.confirmar(`Tirar o ponto ${x.codigo}?`, { ok:'Tirar ponto', perigo:true })) return;
      S.run(() => S.salvar('produtos', { id:p.id, dados:Object.assign({}, dd, { pontos:dd.pontos.filter((_, j) => j !== +d.i) }) }), 'Ponto retirado'); },
  });

  // Para a proposta (propostas.js): itens de uma cota de patrocínio, com o valor do mês dividido pelas inserções
  S.itensDaCota = (cota, achar = prod) => { const d = dadosDe(cota), inc = (d.incluido || []).filter(x => Number(x.qtd) > 0 && achar(x.formato_id)), valor = Number(d.valor) || 0;
    const totalQ = inc.reduce((a, x) => a + Number(x.qtd), 0), unit = totalQ ? valor / totalQ : 0, fx = S.faixasDoTexto(cota.detalhe).faixas, grupo = S.uid();
    let resto = Math.round(valor * 100) / 100;
    return inc.map((x, k) => { const fm = achar(x.formato_id), usadas = x.faixa === 'todas' || x.faixa === undefined || x.faixa === '' ? fx : [fx[+x.faixa]].filter(Boolean);
      const dias = [...new Set(usadas.flatMap(f => f.dias.split(',').map(Number)))], q = Number(x.qtd);
      const total = k === inc.length - 1 ? resto : Math.round(q * unit * 100) / 100; resto = Math.round((resto - total) * 100) / 100;
      return { id:S.uid(), programa_id:cota.id, formato_id:fm.id, programa:cota.nome.trim(), formato:fm.nome.trim(), secao:'patrocinio', detalhe:cota.detalhe || '',
        dias:dias.length ? dias : [0, 1, 2, 3, 4, 5, 6], faixa:usadas.map(S.faixaHoras).filter(Boolean).join(' / '), insercoes:q, preco_tabela:unit, preco:unit, total,
        cota:{ id:cota.id, nome:cota.nome.trim(), valor, grupo } }; }); };

  // ---------- escolher um produto (proposta e combos) ----------
  // fonte(veiculoId) = { produtos, precos, tabela } do veículo: na proposta é o veículo aberto (S.db); nos combos, todos.
  const fonteAtual = () => ({ produtos:S.db.produtos, precos:S.db.precos, tabela:tabProd() });
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const precoNa = (fo, p, f) => { const x = fo.tabela && (fo.precos || []).find(y => y.tabela_id === fo.tabela.id && y.programa_id === p.id && y.formato_id === f.id); return x ? Number(x.preco) : 0; };
  const DIAS7 = [0, 1, 2, 3, 4, 5, 6];
  const comTotal = it => Object.assign(it, { total:r2((parseInt(it.insercoes) || 0) * (Number(it.preco) || 0)) });
  // Itens de proposta de um produto, conforme o que foi escolhido (o = { formato_id, qtd, variacao, por_dia, pontos, unidades, faces, producao })
  S.itensDoProduto = (p, o, fo, v) => { const d = dadosDe(p), achar = id => (fo.produtos || []).find(x => x.id === id);
    if (p.secao === 'patrocinio') return S.itensDaCota(p, achar);
    if (p.secao !== 'ooh') { const f = achar(o.formato_id), pr = f ? precoNa(fo, p, f) : 0; if (!f || !pr) return [];
      const it = S.itemDaTabela(p, f, pr, v); it.insercoes = parseInt(o.qtd) || 0; return [comTotal(it)]; }
    const dias = S.diasDoTexto(d.funcionamento) || DIAS7, faixa = S.faixaDoTexto(d.funcionamento || '');
    if (ehInsercao(p)) { const vr = (d.variacoes || []).find(x => x.nome === o.variacao), pd = parseInt(o.por_dia) || 0; if (!vr || !pd) return [];
      const base = { programa_id:p.id, formato:vr.nome, secao:'ooh', dias, faixa, preco_tabela:Number(vr.valor), preco:Number(vr.valor) };
      const pts = (d.pontos || []).filter(x => (o.pontos || []).includes(x.codigo));
      if (pts.length) return pts.map(x => comTotal(Object.assign({ id:S.uid(), programa:`${cap(unidade(d, 1))} ${x.codigo}`, detalhe:[x.endereco, x.cidade].filter(Boolean).join(' · '), por_dia:pd, insercoes:pd * 30, ooh:{ tipo:'insercao', produto_id:p.id, ponto:x.codigo } }, base)));
      const n = parseInt(o.unidades) || 0; if (!n) return [];
      return [comTotal(Object.assign({ id:S.uid(), programa:`${p.nome} · ${n} ${unidade(d, n)}`, detalhe:d.funcionamento || '', por_dia:pd * n, insercoes:pd * n * 30, ooh:{ tipo:'insercao', produto_id:p.id, unidades:n } }, base))]; }
    const faces = (d.variacoes || []).filter(x => (o.faces || []).includes(x.nome)), pr = d.producao || {}, pt = d.ponto || {};
    const its = faces.map(x => comTotal({ id:S.uid(), programa_id:p.id, programa:p.nome, formato:x.nome + (x.obs ? ` (${x.obs})` : ''), secao:'ooh', detalhe:pt.endereco || '',
      dias:DIAS7, faixa:'', insercoes:1, mensal:true, preco_tabela:Number(x.valor), preco:Number(x.valor), ooh:{ tipo:'mes', produto_id:p.id, face:x.nome } }));
    if (o.producao && Number(pr.valor) > 0 && faces.length) its.push(comTotal({ id:S.uid(), programa_id:p.id, programa:p.nome, formato:pr.nome || 'Produção', secao:'ooh', detalhe:'',
      dias:DIAS7, faixa:'', insercoes:faces.length, unica:true, preco_tabela:Number(pr.valor), preco:Number(pr.valor), ooh:{ tipo:'producao', produto_id:p.id } }));
    return its; };
  // Janela de escolha: veículo (se houver mais de um), produto e o que muda conforme o tipo; devolve os itens prontos
  S.escolherProduto = ({ titulo = 'Adicionar produto', veiculos, fonte = fonteAtual, tipos = ['radio', 'patrocinio', 'ooh'], onItens }) => {
    const vs = veiculos || [S.veh()];
    const lista_ = vid => (fonte(vid).produtos || []).filter(p => p.tipo === 'programa' && p.ativo && p.secao !== 'digital' && (p.secao === 'ooh' ? tipos.includes('ooh') : p.secao === 'patrocinio' ? tipos.includes('patrocinio') && (dadosDe(p).incluido || []).length : tipos.includes('radio') && (fonte(vid).produtos || []).some(f => f.tipo === 'formato' && precoNa(fonte(vid), p, f) > 0))).sort(ordem);
    const opsProd = vid => { const l = lista_(vid), g = (rot, xs) => xs.length ? `<optgroup label="${esc(rot)}">${xs.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</optgroup>` : '';
      return '<option value="">Escolha</option>' + SECOES.map(([k, n]) => g(n, l.filter(p => (SECOES.some(s => s[0] === p.secao) ? p.secao : 'programa') === k && !['ooh', 'patrocinio'].includes(p.secao)))).join('')
        + g('Patrocínios', l.filter(p => p.secao === 'patrocinio')) + Object.keys(COBRA).map(k => g(S.nomeCategoria(k), l.filter(p => p.secao === 'ooh' && p.categoria === k))).join(''); };
    const comItens = vs.filter(v => lista_(v.id).length);
    if (!comItens.length) return S.toast('Nenhum produto com preço para adicionar. Cadastre em Produtos.');
    S.dialog(`<h2>${esc(titulo)}</h2><div class="g2">
        ${comItens.length > 1 ? `<label class="f" style="grid-column:1/-1">Veículo<select name="veiculo">${comItens.map(v => `<option value="${v.id}">${esc(v.nome)}</option>`).join('')}</select></label>` : `<input type="hidden" name="veiculo" value="${comItens[0].id}">`}
        <label class="f" style="grid-column:1/-1">Produto<select name="produto" required>${opsProd(comItens[0].id)}</select></label></div>
      <div id="pdEsc" class="pdt-esc"></div><div id="pdEscTot" class="caixa" hidden></div>
      <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Adicionar</button></div>`,
      f => { const vid = f.veiculo, fo = fonte(vid), p = (fo.produtos || []).find(x => x.id === f.produto), v = vs.find(x => x.id === vid); if (!p) return;
        const its = S.itensDoProduto(p, lerOpcoes(f), fo, v); if (!its.length) return S.toast('Escolha a variação e a quantidade.');
        its.forEach(it => { it.veiculo_id = vid; }); onItens(its, v); });
    const dl = document.getElementById('dlg'), form = dl.querySelector('form'); dl.classList.add('medio'); const antes = dl.onclose; dl.onclose = e => { dl.classList.remove('medio'); if (antes) antes(e); };
    const lerOpcoes = f => ({ formato_id:f.formato, qtd:f.qtd, variacao:f.variacao, por_dia:f.por_dia, unidades:f.unidades, producao:f.producao === 'on',
      pontos:[...form.querySelectorAll('[name="ponto"]:checked')].map(x => x.value), faces:[...form.querySelectorAll('[name="face"]:checked')].map(x => x.value) });
    const detalhe = () => { const vid = form.veiculo.value, fo = fonte(vid), p = (fo.produtos || []).find(x => x.id === form.produto.value), box = document.getElementById('pdEsc'), d = dadosDe(p);
      if (!p) { box.innerHTML = ''; return; }
      if (p.secao === 'patrocinio') { box.innerHTML = `<div class="caixa"><b>${brl(d.valor)}</b> por mês · ${horario(p)}<br><small class="muted">${(d.incluido || []).map(x => { const f = (fo.produtos || []).find(y => y.id === x.formato_id); return `${x.qtd} ${esc(f ? f.nome : '')}`; }).join(' · ')}</small></div>`; return; }
      if (p.secao !== 'ooh') { const fs = (fo.produtos || []).filter(f => f.tipo === 'formato' && precoNa(fo, p, f) > 0).sort(ordem);
        box.innerHTML = `<div class="g2"><label class="f">Duração ou variação<select name="formato">${fs.map(f => `<option value="${f.id}">${esc(f.nome)} · ${brl(precoNa(fo, p, f))}</option>`).join('')}</select></label>
          <label class="f">Inserções por mês<input name="qtd" data-mask="int" inputmode="numeric" value="30" required></label></div><small class="muted">${horario(p)}</small>`; return; }
      const vars = (d.variacoes || []).filter(x => Number(x.valor) > 0);
      if (ehInsercao(p)) { const pts = d.pontos || [];
        box.innerHTML = `<div class="g2"><label class="f">Duração<select name="variacao">${vars.map(x => `<option value="${esc(x.nome)}">${esc(x.nome)} · ${brl(x.valor)} por inserção</option>`).join('')}</select></label>
          <label class="f">Inserções por dia (em cada ${unidade(d, 1)})<input name="por_dia" data-mask="int" inputmode="numeric" value="30" required></label></div>
          ${pts.length ? `<fieldset class="cat-escolha"><legend class="form-sec">Onde roda</legend><div class="cat-ops">${pts.map(x => `<label class="cat-op"><input type="checkbox" name="ponto" value="${esc(x.codigo)}" checked><span>${esc(cap(unidade(d, 1)))} ${esc(x.codigo)}${x.cidade ? ` · ${esc(x.cidade)}` : ''}</span></label>`).join('')}</div></fieldset>`
            : `<label class="f">Quantos ${unidade(d, 2)}<input name="unidades" data-mask="int" inputmode="numeric" value="${d.frota || 1}" required></label>`}
          <small class="muted">${esc(d.funcionamento || '')}. Na proposta a conta é por mês de 30 dias; no PI, a mesma quantidade todos os dias.</small>`; return; }
      box.innerHTML = `<fieldset class="cat-escolha"><legend class="form-sec">Faces</legend><div class="cat-ops">${vars.map(x => `<label class="cat-op"><input type="checkbox" name="face" value="${esc(x.nome)}" checked><span>${esc(x.nome)}${x.obs ? ` · ${esc(x.obs)}` : ''} · ${brl(x.valor)}/mês</span></label>`).join('')}</div></fieldset>
        ${Number((d.producao || {}).valor) > 0 ? `<label class="chk"><input type="checkbox" name="producao" checked>${esc(d.producao.nome || 'Produção')} · ${brl(d.producao.valor)} por face, cobrada uma vez</label>` : ''}`; };
    const total = () => { const vid = form.veiculo.value, fo = fonte(vid), p = (fo.produtos || []).find(x => x.id === form.produto.value), box = document.getElementById('pdEscTot');
      const its = p ? S.itensDoProduto(p, lerOpcoes(Object.fromEntries(new FormData(form))), fo, vs.find(x => x.id === vid)) : [];
      box.hidden = !its.length; if (!its.length) return; const mes = its.filter(x => !x.unica).reduce((a, x) => a + x.total, 0), uma = its.filter(x => x.unica).reduce((a, x) => a + x.total, 0);
      box.innerHTML = `Valor de tabela: <b>${brl(mes)}</b> por mês${uma ? ` + <b>${brl(uma)}</b> uma vez` : ''}`; };
    form.addEventListener('change', e => { if (e.target.name === 'veiculo') { form.produto.innerHTML = opsProd(form.veiculo.value); detalhe(); } else if (e.target.name === 'produto') detalhe(); S.mascarar(dl); total(); });
    form.addEventListener('input', total);
  };
  S.cotasAtivas = () => radioProds().filter(p => p.secao === 'patrocinio' && p.ativo && (dadosDe(p).incluido || []).length);
})();

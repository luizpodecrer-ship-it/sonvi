// SONVI · Combos do grupo (database/044, aprovado em 24/10/2026, Etapa 2 de Produtos).
// O diretor cria em Dashboard geral → Combos (#/combos): nome, "vale até" opcional, itens de qualquer veículo da empresa
// e um preço fechado. Os itens ficam guardados prontos (como itens de proposta, com veiculo_id e preço de tabela do dia).
// Na proposta (botão "Combo") eles entram fechados, com o preço dividido na proporção da tabela (S.itensDoCombo);
// aprovada, o SONVI gera um PI por veículo (gerar_pi_veiculo), e cada veículo fatura a sua parte.
(() => {
  const { esc, brl, dfmt } = S;
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const tabelaDe = its => r2((its || []).reduce((a, it) => a + (parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0), 0));
  const pct = (preco, tab) => tab > preco + .004 ? `${((1 - preco / tab) * 100).toFixed(1).replace('.', ',').replace(/,0$/, '')}%` : '';
  S.combosAtivos = () => (S.db.combos || []).filter(c => c.ativo && (!c.vale_ate || c.vale_ate >= S.today()) && (c.itens || []).length);
  // Itens do combo para a proposta: mesma lista, com o preço fechado dividido na proporção da tabela de cada item
  S.itensDoCombo = (c, proprio) => {
    const its = JSON.parse(JSON.stringify(c.itens || [])), tab = tabelaDe(its), preco = Number(c.preco) || 0, fator = tab ? preco / tab : 0, grupo = S.uid();
    let resto = r2(preco);
    return its.map((it, k) => { const n = parseInt(it.insercoes) || 0; it.id = S.uid(); it.preco = (Number(it.preco_tabela) || 0) * fator;
      it.total = k === its.length - 1 ? resto : r2(n * it.preco); resto = r2(resto - it.total); if (k === its.length - 1 && n) it.preco = it.total / n;
      it.combo = { id:c.id, nome:c.nome, preco, grupo }; if (it.veiculo_id === proprio) delete it.veiculo_id; return it; });
  };

  // Produtos e preços de todos os veículos (para montar o combo), guardados na memória enquanto a tela está aberta
  let fonte = null, carregando = false;
  const carregar = async () => { if (carregando) return; carregando = true;
    try { const ids = (S.db.veiculos || []).map(v => v.id);
      const [produtos, tabelas, combos] = await Promise.all([S.q(S.sb.from('produtos').select('*').in('veiculo_id', ids)), S.q(S.sb.from('tabelas_preco').select('*').in('veiculo_id', ids).eq('permanente', true)), S.q(S.sb.from('combos').select('*').order('nome'))]);
      const precos = tabelas.length ? await S.q(S.sb.from('precos').select('*').in('tabela_id', tabelas.map(t => t.id))) : [];
      fonte = {}; ids.forEach(id => { fonte[id] = { produtos:produtos.filter(p => p.veiculo_id === id), precos:precos.filter(p => p.veiculo_id === id), tabela:tabelas.find(t => t.veiculo_id === id) || null }; });
      S.db.combos = combos;
    } catch (e) { console.error(e); S.toast(S.erro(e)); fonte = fonte || {}; }
    carregando = false; if (S.ui.view === 'combos') S.render(); };
  S.combosUsar = f => { fonte = f; }; // testes

  // Editor: as mudanças ficam aqui até "Salvar combo"
  let ce = null;
  const novo = () => ({ id:null, nome:'', vale_ate:'', ativo:true, itens:[], preco:0, sujo:false, edit:true });
  const abrir = c => { ce = c ? { id:c.id, nome:c.nome, vale_ate:c.vale_ate || '', ativo:c.ativo, itens:JSON.parse(JSON.stringify(c.itens || [])), preco:Number(c.preco) || 0, sujo:false, edit:false } : novo(); };
  S.comboSujo = () => !!(ce && ce.sujo);
  const veic = id => S.veh(id) || {};
  const situacao = c => !c.ativo ? ['Inativo', 'gray'] : c.vale_ate && c.vale_ate < S.today() ? ['Vencido', 'orange'] : c.vale_ate ? [`até ${dfmt(c.vale_ate)}`, 'green'] : ['Sem prazo', 'blue'];
  const selos = its => [...new Set((its || []).map(it => it.veiculo_id))].map(id => `<span class="cb-selo" title="${esc(veic(id).nome || '')}">${S.vav(veic(id))}</span>`).join('');

  // Tela (aprovada em 24/10/2026): números do grupo, cartões com a mistura por veículo (na cor de cada um), tabela × combo,
  // desconto e validade; editor com os itens agrupados por veículo e, ao lado, o preço com "como o preço se divide". Estilos .cb-*.
  const valorIt = it => (parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0);
  const porVeic = its => { const m = {}; (its || []).forEach(it => { m[it.veiculo_id] = (m[it.veiculo_id] || 0) + valorIt(it); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const corV = id => /^#[0-9a-f]{6}$/i.test(veic(id).cor || '') ? veic(id).cor : S.COR_PADRAO;
  const curto = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const diasAte = d => Math.round((new Date(d) - new Date(S.today())) / 864e5);
  const comparar = (tab, preco, id) => `<span class="cb-cmp"><span class="cb-cmp-l"><span>Tabela</span><span class="cb-tr"><i style="width:100%"></i></span><b>${brl(tab)}</b></span>
    <span class="cb-cmp-l preco"><span>Combo</span><span class="cb-tr"><i${id ? ` id="${id}"` : ''} style="width:${tab ? Math.min(100, preco / tab * 100) : 0}%"></i></span><b${id ? ` id="${id}P"` : ''}>${brl(preco)}</b></span></span>`;
  // Lista (aprovada em 25/10/2026, adaptada do recurso "Aparición" da Moxen, licença permite uso dentro do produto): só os blocos,
  // um por combo (número, selos dos veículos, nome e a validade numa linha), que sobem e se endireitam como cartas, em ordem de
  // leitura. Clicar abre o editor; "Novo combo" é o último bloco. Estilos .cb-bloco / [data-ap] em sonvi.css.
  const linhaVal = c => { const venc = c.vale_ate && c.vale_ate < S.today();
    if (!c.ativo) return ['desligado · fora das propostas', true];
    if (venc) return [`venceu em ${dfmt(c.vale_ate)}`, true];
    if (!c.vale_ate) return ['sem data para acabar', false];
    const f = diasAte(c.vale_ate); return [f <= 60 ? `vale até ${dfmt(c.vale_ate).slice(0, 5)} · ${f ? `faltam ${f} dia${f === 1 ? '' : 's'}` : 'acaba hoje'}` : `vale até ${dfmt(c.vale_ate)}`, false]; };
  const bloco = (c, i) => { const [t, off] = linhaVal(c);
    return `<button type="button" class="cb-bloco${off ? ' off' : ''}" data-ap data-act="cbAbrir" data-id="${c.id}" aria-label="Abrir o combo ${esc(c.nome)}">
      <span class="cb-b-num" data-peca>${String(i + 1).padStart(2, '0')}</span><span class="cb-selos cb-b-selos" data-peca aria-hidden="true">${selos(c.itens)}</span>
      <b class="cb-b-nome" data-peca>${esc(c.nome)}</b><span class="cb-b-linha" data-peca>${t}</span></button>`; };
  let naLista = false;
  const aparece = () => { const els = [...document.querySelectorAll('#content [data-ap]:not([data-vis])')]; if (!els.length) return;
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => requestAnimationFrame(() => els.map(e => ({ e, r:e.getBoundingClientRect() }))
      .sort((a, b) => Math.abs(a.r.top - b.r.top) > 8 ? a.r.top - b.r.top : a.r.left - b.r.left)
      .forEach(({ e }, i) => { e.style.setProperty('--atraso', quieto ? '0s' : Math.min(i, 8) * .09 + 's'); e.setAttribute('data-vis', ''); }))); };

  // O combo abre para consulta (aprovado em 25/10/2026, igual ao PI e à tabela): no alto, Editar e ⋯ (Duplicar, Ligar/Desligar,
  // Excluir); editando, Descartar e Salvar combo lado a lado. "Aparece nas novas propostas" é uma chave no fim do cartão de preço.
  const editor = () => { const tab = tabelaDe(ce.itens), pv = porVeic(ce.itens), d = pct(ce.preco, tab), ed = ce.edit;
    const grupos = pv.map(([id, v]) => { const its = ce.itens.map((it, i) => [it, i]).filter(([it]) => it.veiculo_id === id), ve = veic(id);
      return `<div class="cb-gv" style="--v:${corV(id)}"><div class="cb-gv-hd">${S.vav(ve)}<b>${esc(ve.nome || 'Veículo')}</b><small>${its.length} ${its.length === 1 ? 'item' : 'itens'} · ${curto(v)}</small></div>
        ${its.map(([it, i]) => `<div class="cb-it${ed ? '' : ' ver'}"><span class="cb-it-n"><b>${esc(it.programa)}</b>${it.detalhe ? `<small>${esc(it.detalhe)}</small>` : ''}</span><span class="cb-it-f">${esc(it.formato)}</span><span class="cb-it-q">${esc(S.qtdItem(it))}</span>
          <span class="cb-it-v">${brl(valorIt(it))}${it.unica ? '<small>uma vez</small>' : ''}</span>${ed ? `<button type="button" class="btn tres" data-act="cbTirar" data-i="${i}" aria-label="Tirar ${esc(it.programa)}">${S.svg('fechar', 16)}</button>` : ''}</div>`).join('')}</div>`; }).join('');
    return `<div class="cb-ed2"><section class="card cb-ed" aria-labelledby="cb-td"><div class="hd"><h2 id="cb-td">Dados do combo</h2></div>
      ${ed ? `<div class="g2"><label class="f">Nome do combo<input data-cb="nome" value="${esc(ce.nome)}" placeholder="Ex.: Combo Verão Rádio + LED"></label>
        <label class="f">Vale até (opcional)<input type="date" data-cb="vale_ate" value="${esc(ce.vale_ate)}"></label></div>`
        : `<dl class="cb-dl"><div><dt>Nome do combo</dt><dd>${esc(ce.nome)}</dd></div><div><dt>Vale até</dt><dd>${ce.vale_ate ? dfmt(ce.vale_ate) : 'sem data para acabar'}</dd></div></dl>`}
      <div class="form-sec">Itens · de qualquer veículo do grupo</div>
      ${grupos || '<p class="muted">Nenhum item ainda. Adicione produtos de um ou mais veículos.</p>'}
      ${ed ? `<button type="button" class="btn sm cb-add" data-act="cbAdd">${S.svg('mais')}Adicionar produto</button>` : ''}</section>
      <section class="card cb-preco-card" aria-labelledby="cb-tp"><div class="hd"><h2 id="cb-tp">Preço do combo</h2></div>
        ${ed ? `<label class="f">Preço fechado (R$)<input data-cb="preco" data-mask="dec" inputmode="decimal" value="${ce.preco ? S.nfmt(ce.preco) : ''}" placeholder="0,00"></label>`
          : `<div class="cb-preco-v"><small>Preço fechado</small><b>${brl(ce.preco)}</b></div>`}
        ${comparar(tab, ce.preco, 'cbBar')}
        <span id="cbDesc">${d ? `<span class="pill fn-forte">${d} de desconto · ${brl(r2(tab - ce.preco))}</span>` : '<span class="pill fn-neutra">Sem desconto</span>'}</span>
        ${pv.length ? `<div><div class="cb-div-t">Como o preço se divide na proposta</div><div class="cb-div" id="cbDiv"></div><small class="muted">Cada veículo recebe a parte dele na proporção da tabela e gera o próprio PI.</small></div>` : ''}
        <label class="cb-liga"><span>Aparece nas novas propostas</span><input type="checkbox" role="switch" class="cb-sw" data-cb="ativo"${ce.ativo ? ' checked' : ''}></label></section></div>`; };
  const situ = () => { const venc = ce.vale_ate && ce.vale_ate < S.today(), f = ce.vale_ate ? diasAte(ce.vale_ate) : 0;
    return `<div class="cb-situ"><span class="pill ${ce.ativo && !venc ? 'fn-ok' : 'fn-neutra'}">${!ce.id ? 'Combo novo' : ce.ativo ? (venc ? 'Vencido' : 'Nas propostas') : 'Fora das propostas'}</span>
      ${ce.vale_ate ? `<span class="pill fn-neutra">${venc ? `venceu em ${dfmt(ce.vale_ate)}` : `vale até ${dfmt(ce.vale_ate).slice(0, 5)}${f <= 60 ? ` · ${f ? `faltam ${f} dia${f === 1 ? '' : 's'}` : 'acaba hoje'}` : ''}`}</span>` : ''}
      <span class="pill cb-sujo-p cb-sujo"${ce.sujo ? '' : ' hidden'}><i aria-hidden="true"></i>Alterações não salvas</span></div>`; };

  // Parte de cada veículo no preço fechado (proporção da tabela) e a comparação tabela × combo, ao vivo
  const atualizaPreco = () => { if (!ce) return; const tab = tabelaDe(ce.itens), p = Number(ce.preco) || 0, d = pct(p, tab);
    const bar = document.getElementById('cbBar'), bp = document.getElementById('cbBarP'), ds = document.getElementById('cbDesc'), dv = document.getElementById('cbDiv');
    if (bar) bar.style.width = (tab ? Math.min(100, p / tab * 100) : 0) + '%'; if (bp) bp.textContent = brl(p);
    if (ds) ds.innerHTML = d ? `<span class="pill fn-forte">${d} de desconto · ${brl(r2(tab - p))}</span>` : '<span class="pill fn-neutra">Sem desconto</span>';
    if (dv) dv.innerHTML = porVeic(ce.itens).map(([id, v]) => `<div class="cb-dv" style="--v:${corV(id)}">${S.vav(veic(id))}<b>${esc(veic(id).nome || '')}</b><em>${brl(tab ? p * v / tab : 0)}</em><span class="cb-dv-bar" aria-hidden="true"><i style="width:${tab ? v / tab * 100 : 0}%"></i></span></div>`).join(''); };

  S.views.combos = () => {
    if (!fonte) { carregar(); return { title:'<span class="sub">Grupo · valem em todos os veículos</span>Combos', actions:'', body:'<div class="card empty"><b>Carregando os produtos de todos os veículos…</b></div>' }; }
    const cs = S.db.combos || [];
    if (ce) { naLista = false; queueMicrotask(atualizaPreco);
      const acoes = ce.edit ? `<button class="btn" data-act="cbDescartar">Descartar</button><button class="btn pri" data-act="cbSalvar">Salvar combo</button>`
        : `<button class="btn tres" data-act="cbMenu" aria-label="Mais opções do combo">${S.svg('mais3')}</button><button class="btn pri" data-act="cbEditar">${S.svg('editar')}Editar</button>`;
      return { title:`<span class="sub"><a href="#/combos" data-act="cbVoltar" class="cb-volta">${S.svg('esq', 14)}Combos</a></span>${ce.id ? esc(ce.nome || 'Combo') : 'Novo combo'}`, actions:acoes,
        body:`${situ()}${editor()}<p class="muted small cb-nota">Só o diretor cria e edita combos. O consultor usa na proposta (botão "Combo"), sem mudar as quantidades. Aprovada a proposta, o SONVI gera um PI por veículo, e cada veículo fatura a sua parte (o preço do combo é dividido na proporção da tabela).</p>` }; }
    // Os blocos entram como cartas só quando a lista aparece (não a cada redesenho)
    const anima = !naLista; naLista = true;
    if (anima) queueMicrotask(aparece);
    const vis = anima ? '' : ' data-vis';
    const lista = `<section class="cb-grade" aria-label="Combos">${cs.map(bloco).join('')}
      <button type="button" class="cb-bloco cb-novo" data-ap data-act="cbNovo"><span class="cb-b-mais" data-peca aria-hidden="true">${S.svg('mais')}</span><b class="cb-b-nome" data-peca>Novo combo</b><span class="cb-b-linha" data-peca>${cs.length ? 'Junte produtos de qualquer veículo do grupo.' : 'Monte promoções com produtos de vários veículos (ex.: rádio + painel de LED + front light) e um preço fechado.'}</span></button></section>`;
    return { title:'<span class="sub">Grupo · valem em todos os veículos</span>Combos', actions:`<button class="btn pri" data-act="cbNovo">${S.svg('mais')}Novo combo</button>`,
      body:vis ? lista.replace(/ data-ap /g, ' data-ap data-vis ') : lista };
  };

  const sujar = () => { if (!ce.sujo) { ce.sujo = true; document.querySelectorAll('.cb-sujo').forEach(e => { e.hidden = false; }); } };
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.cb; if (!k || !ce || k === 'ativo') return;
    if (k === 'preco') { ce.preco = S.num(e.target.value); atualizaPreco(); } else if (k === 'ativo') ce.ativo = e.target.checked; else ce[k] = e.target.value; sujar(); });
  // A chave: editando, entra no que será salvo; na consulta, grava na hora
  document.addEventListener('change', e => { if (!(e.target.dataset && e.target.dataset.cb === 'ativo' && ce)) return;
    if (ce.edit) { ce.ativo = e.target.checked; sujar(); } else ligar(e.target.checked); });
  const ligar = v => { const id = ce.id; if (!id) return; S.run(async () => { const r = await S.salvar('combos', { id, ativo:v, atualizado_em:new Date().toISOString() }); abrir(Object.assign({}, (S.db.combos || []).find(c => c.id === id) || {}, r)); },
    v ? 'Combo de volta nas propostas' : 'Combo fora das novas propostas'); };
  const pergunta = async () => !ce || !ce.sujo || await S.confirmar('Sair sem salvar o combo?\n\nAs alterações que ainda não foram salvas serão perdidas.', { ok:'Sair sem salvar', voltar:'Continuar editando', perigo:true });

  Object.assign(S.actions, {
    cbNovo: async () => { if (!await pergunta()) return; ce = novo(); S.render(); window.scrollTo(0, 0); const el = document.querySelector('[data-cb="nome"]'); if (el) el.focus(); },
    cbAbrir: async d => { if (ce && ce.id === d.id) return; if (!await pergunta()) return; abrir((S.db.combos || []).find(c => c.id === d.id)); S.render(); window.scrollTo(0, 0); },
    cbVoltar: async () => { if (!await pergunta()) return; ce = null; S.render(); },
    cbDescartar: async () => { if (ce && ce.sujo && !await S.confirmar('Descartar as alterações do combo?', { ok:'Descartar', voltar:'Continuar editando', perigo:true })) return;
      const c = ce && ce.id && (S.db.combos || []).find(x => x.id === ce.id); ce = null; if (c) abrir(c); S.render(); },
    cbEditar: () => { if (!ce) return; ce.edit = true; S.render(); const el = document.querySelector('[data-cb="nome"]'); if (el) el.focus(); },
    cbMenu: (d, botao) => S.menu(botao, [{ label:'Duplicar combo', icon:'copia', act:'cbDuplicar' }, { label:ce.ativo ? 'Desligar das propostas' : 'Ligar nas propostas', icon:ce.ativo ? 'fechar' : 'check', act:'cbLigar' }, '-', { label:'Excluir combo', icon:'lixo', act:'cbExcluir', perigo:true }]),
    cbLigar: () => ligar(!ce.ativo),
    cbDuplicar: () => { ce = Object.assign(JSON.parse(JSON.stringify(ce)), { id:null, nome:`${ce.nome} (cópia)`, edit:true, sujo:true }); S.render(); window.scrollTo(0, 0); const el = document.querySelector('[data-cb="nome"]'); if (el) { el.focus(); el.select(); } },
    cbTirar: d => { ce.itens.splice(+d.i, 1); sujar(); S.render(); },
    cbAdd: () => S.escolherProduto({ titulo:'Adicionar ao combo', veiculos:(S.db.veiculos || []).filter(v => fonte[v.id]), fonte:vid => fonte[vid] || {},
      onItens:its => { its.forEach(it => { delete it.total; it.total = r2((parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0)); }); ce.itens.push(...its);
        if (!ce.preco) ce.preco = tabelaDe(ce.itens); sujar(); S.render(); } }),
    cbSalvar: () => { if (!ce.nome.trim()) { S.toast('Dê um nome ao combo.'); const el = document.querySelector('[data-cb="nome"]'); if (el) el.focus(); return; }
      if (!ce.itens.length) return S.toast('Adicione ao menos um produto ao combo.');
      if (!(ce.preco > 0)) return S.toast('Informe o preço do combo.');
      S.run(async () => { const r = await S.salvar('combos', Object.assign({ nome:ce.nome.trim(), vale_ate:ce.vale_ate || null, ativo:ce.ativo, itens:ce.itens, preco:r2(ce.preco), valor_tabela:tabelaDe(ce.itens), atualizado_em:new Date().toISOString() }, ce.id ? { id:ce.id } : {}));
        abrir(r); }, 'Combo salvo'); },
    cbExcluir: async () => { if (!ce || !ce.id || !await S.confirmar(`Excluir o combo "${ce.nome}"?\n\nPropostas que já usaram o combo continuam como estão.`, { ok:'Excluir combo', perigo:true })) return;
      const id = ce.id; S.run(async () => { await S.excluir('combos', id); ce = null; }, 'Combo excluído'); },
  });
  // Sair da tela com o combo sem salvar pergunta antes; ao entrar de novo, os produtos são recarregados
  let volta = false, antes = location.hash;
  window.addEventListener('hashchange', () => {
    if (volta) { volta = false; antes = location.hash; return; }
    if (antes.startsWith('#/combos') && !location.hash.startsWith('#/combos')) {
      if (ce && ce.sujo) { const destino = location.hash; volta = true; location.hash = antes;
        S.confirmar('Sair sem salvar o combo?\n\nAs alterações que ainda não foram salvas serão perdidas.', { ok:'Sair sem salvar', voltar:'Continuar editando', perigo:true }).then(ok => { if (ok) { ce = null; fonte = null; location.hash = destino; } }); return; }
      ce = null; fonte = null; naLista = false; }
    antes = location.hash; });
})();

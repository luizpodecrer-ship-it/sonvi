// SONVI · Combos do grupo (database/044, aprovado em 24/10/2026, Etapa 2 de Produtos).
// O diretor cria em Dashboard geral → Combos (#/combos): nome, "vale até" opcional, itens de qualquer veículo da empresa
// e um preço fechado. Os itens ficam guardados prontos (como itens de proposta, com veiculo_id e preço de tabela do dia).
// Na proposta (botão "Combo") eles entram fechados, com o preço dividido na proporção da tabela (S.itensDoCombo);
// aprovada, o SONVI gera um PI por veículo (gerar_pi_veiculo), e cada veículo fatura a sua parte.
(() => {
  const { esc, brl, dfmt } = S;
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const tabelaDe = its => r2((its || []).reduce((a, it) => a + (parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0), 0));
  const pct = (preco, tab) => tab > preco + .004 ? `${((1 - preco / tab) * 100).toFixed(1).replace('.', ',').replace(',0', '')}%` : '';
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
  const novo = () => ({ id:null, nome:'', vale_ate:'', ativo:true, itens:[], preco:0, sujo:false });
  const abrir = c => { ce = c ? { id:c.id, nome:c.nome, vale_ate:c.vale_ate || '', ativo:c.ativo, itens:JSON.parse(JSON.stringify(c.itens || [])), preco:Number(c.preco) || 0, sujo:false } : novo(); };
  S.comboSujo = () => !!(ce && ce.sujo);
  const veic = id => S.veh(id) || {};
  const situacao = c => !c.ativo ? ['Inativo', 'gray'] : c.vale_ate && c.vale_ate < S.today() ? ['Vencido', 'orange'] : c.vale_ate ? [`até ${dfmt(c.vale_ate)}`, 'green'] : ['Sem prazo', 'blue'];
  const selos = its => [...new Set((its || []).map(it => it.veiculo_id))].map(id => `<span class="cb-selo" title="${esc(veic(id).nome || '')}">${S.vav(veic(id))}</span>`).join('');

  const cartao = c => { const tab = tabelaDe(c.itens), [rot, tom] = situacao(c), on = ce && ce.id === c.id;
    return `<button type="button" class="card cb-card${on ? ' on' : ''}" data-act="cbAbrir" data-id="${c.id}"${on ? ' aria-current="true"' : ''}>
      <span class="cb-cab"><b>${esc(c.nome)}</b>${S.tag(rot, tom)}</span>
      <small class="muted">${new Set((c.itens || []).map(i => i.veiculo_id)).size} veículos · ${(c.itens || []).length} itens</small>
      <span class="cb-selos">${selos(c.itens)}</span>
      <span class="cb-pe"><small class="muted">tabela ${brl(tab)}${pct(c.preco, tab) ? ` · <b class="cb-desc">−${pct(c.preco, tab)}</b>` : ''}</small><b class="cb-preco">${brl(c.preco)}</b></span></button>`; };

  const editor = () => { const tab = tabelaDe(ce.itens), desc = r2(tab - ce.preco);
    const linhas = ce.itens.map((it, i) => `<tr><td>${S.vav(veic(it.veiculo_id))}</td><td><b>${esc(it.programa)}</b><br><small class="muted">${esc(veic(it.veiculo_id).nome || '')}</small></td><td>${esc(it.formato)}</td>
      <td class="r nw">${esc(S.qtdItem(it))}</td><td class="r nw">${brl((parseInt(it.insercoes) || 0) * (Number(it.preco_tabela) || 0))}${it.unica ? '<br><small class="muted">uma vez</small>' : ''}</td>
      <td class="r"><button type="button" class="btn tres" data-act="cbTirar" data-i="${i}" aria-label="Tirar ${esc(it.programa)}">×</button></td></tr>`).join('');
    return `<section class="card cb-ed" aria-label="Combo"><div class="hd"><h2>${ce.id ? esc(ce.nome || 'Combo') : 'Novo combo'}</h2><span class="sujo cb-sujo"${ce.sujo ? '' : ' hidden'}><i></i>Alterações não salvas</span></div>
      <div class="g2"><label class="f">Nome do combo<input data-cb="nome" value="${esc(ce.nome)}" placeholder="Ex.: Combo Verão Rádio + LED"></label>
        <label class="f">Vale até (opcional)<input type="date" data-cb="vale_ate" value="${esc(ce.vale_ate)}"></label></div>
      <div class="form-sec">Itens · de qualquer veículo do grupo</div>
      ${ce.itens.length ? `<div class="scroll"><table class="cb-tab"><thead><tr><th><span class="sr">Veículo</span></th><th>Produto</th><th>Variação</th><th class="r">Quantidade</th><th class="r">Tabela/mês</th><th><span class="sr">Tirar</span></th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<p class="muted">Nenhum item ainda.</p>'}
      <button type="button" class="btn sm cb-add" data-act="cbAdd">${S.svg('mais')}Adicionar produto</button>
      <div class="cb-conta"><span><small>Valor de tabela</small><b>${brl(tab)}</b></span>
        <label class="f">Preço do combo (R$)<input data-cb="preco" data-mask="dec" inputmode="decimal" value="${ce.preco ? S.nfmt(ce.preco) : ''}" placeholder="0,00"></label>
        <span><small>Desconto</small><b class="${desc > .004 ? 'cb-desc' : ''}" id="cbDesc">${desc > .004 ? `${brl(desc)} (${pct(ce.preco, tab)})` : '—'}</b></span></div>
      <label class="chk"><input type="checkbox" data-cb="ativo"${ce.ativo ? ' checked' : ''}>Aparece nas novas propostas</label>
      <div class="row mid"><span class="grow"></span>${ce.id ? `<button type="button" class="btn perigo" data-act="cbExcluir">Excluir</button>` : ''}<button type="button" class="btn" data-act="cbDescartar">${ce.id ? 'Descartar' : 'Cancelar'}</button><button type="button" class="btn pri" data-act="cbSalvar">Salvar combo</button></div></section>`; };

  S.views.combos = () => {
    if (!fonte) { carregar(); return { title:'<span class="sub">Grupo · valem em todos os veículos</span>Combos', actions:'', body:'<div class="card empty"><b>Carregando os produtos de todos os veículos…</b></div>' }; }
    const cs = S.db.combos || [];
    if (!ce && cs.length) abrir(cs[0]);
    const lista = cs.length ? cs.map(cartao).join('') : '<div class="card empty"><b>Nenhum combo ainda</b>Monte promoções com produtos de vários veículos (ex.: rádio + painel de LED + front light) e um preço fechado.</div>';
    return { title:'<span class="sub">Grupo · valem em todos os veículos</span>Combos', actions:`<button class="btn pri" data-act="cbNovo">${S.svg('mais')}Novo combo</button>`,
      body:`<div class="cb-tela"><div class="cb-lista">${lista}</div>${ce ? editor() : '<div class="card empty"><b>Escolha um combo</b>ou clique em "Novo combo".</div>'}</div>
        <p class="muted small cb-nota">Só o diretor cria e edita combos. O consultor usa na proposta (botão "Combo"), sem mudar as quantidades. Aprovada a proposta, o SONVI gera um PI por veículo, e cada veículo fatura a sua parte (o preço do combo é dividido na proporção da tabela).</p>` };
  };

  const sujar = () => { if (!ce.sujo) { ce.sujo = true; document.querySelectorAll('.cb-sujo').forEach(e => { e.hidden = false; }); } };
  const atualizaDesc = () => { const el = document.getElementById('cbDesc'); if (!el) return; const tab = tabelaDe(ce.itens), d = r2(tab - ce.preco); el.className = d > .004 ? 'cb-desc' : ''; el.textContent = d > .004 ? `${brl(d)} (${pct(ce.preco, tab)})` : '—'; };
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.cb; if (!k || !ce) return;
    if (k === 'preco') { ce.preco = S.num(e.target.value); atualizaDesc(); } else if (k === 'ativo') ce.ativo = e.target.checked; else ce[k] = e.target.value; sujar(); });
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.cb === 'ativo' && ce) { ce.ativo = e.target.checked; sujar(); } });
  const pergunta = async () => !ce || !ce.sujo || await S.confirmar('Sair sem salvar o combo?\n\nAs alterações que ainda não foram salvas serão perdidas.', { ok:'Sair sem salvar', voltar:'Continuar editando', perigo:true });

  Object.assign(S.actions, {
    cbNovo: async () => { if (!await pergunta()) return; ce = novo(); S.render(); const el = document.querySelector('[data-cb="nome"]'); if (el) el.focus(); },
    cbAbrir: async d => { if (ce && ce.id === d.id) return; if (!await pergunta()) return; abrir((S.db.combos || []).find(c => c.id === d.id)); S.render(); },
    cbDescartar: () => { const c = ce && ce.id && (S.db.combos || []).find(x => x.id === ce.id); ce = null; if (c) abrir(c); S.render(); },
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
      ce = null; fonte = null; }
    antes = location.hash; });
})();

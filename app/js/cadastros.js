// SONVI · tabelas comerciais do veículo: programas / faixas, formatos e tabela de preços com vigência.
(() => {
  const { esc, brl, dfmt } = S;
  let aba = 'precos';
  const TIPOS = { programa:['Programas e faixas', 'Programa ou faixa', 'Faixa horária (ex.: 06h-09h)'], formato:['Formatos', 'Formato', 'Duração ou detalhe (ex.: 30 segundos)'] };
  const prod = id => S.db.produtos.find(p => p.id === id) || {};
  const doTipo = t => S.db.produtos.filter(p => p.tipo === t).sort((a, b) => a.nome.localeCompare(b.nome));

  S.views.cadastros = () => {
    const seg = `<div class="seg">${[['precos', 'Tabela de preços'], ['programa', 'Programas e faixas'], ['formato', 'Formatos']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="cadAba" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body, botao;
    if (aba === 'precos') {
      const hoje = S.today(), lista = S.db.precos.slice().sort((a, b) => (prod(a.programa_id).nome || '').localeCompare(prod(b.programa_id).nome || '') || b.vigencia_inicio.localeCompare(a.vigencia_inicio));
      botao = 'Novo preço';
      body = `<div class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>Programa / faixa</th><th>Formato</th><th class="r">Preço</th><th>Vigência a partir de</th><th class="r">Desconto máx.</th><th></th></tr></thead><tbody>${lista.map(p => { const vig = S.preco(prod(p.programa_id).nome, prod(p.formato_id).nome);
        return `<tr class="click" data-act="cadPreco" data-id="${p.id}"><td><b>${esc(prod(p.programa_id).nome)}</b></td><td>${esc(prod(p.formato_id).nome)}</td><td class="r">${brl(p.preco)}</td><td>${dfmt(p.vigencia_inicio)}</td><td class="r">${Number(p.desconto_max)}%</td><td>${vig && vig.id === p.id ? S.tag('Vigente', 'green') : p.vigencia_inicio > hoje ? S.tag('Futuro', 'blue') : S.tag('Anterior', 'gray')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><b>Nenhum preço cadastrado</b>Cadastre programas e formatos e depois os preços.</div>'}
        <p class="muted small" style="margin-top:12px">Para reajustar, crie um novo preço com a nova data de vigência. Os PIs antigos guardam o preço da época.</p></div>`;
    } else {
      const lista = doTipo(aba); botao = aba === 'programa' ? 'Novo programa' : 'Novo formato';
      body = `<div class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>${TIPOS[aba][1]}</th><th>Detalhe</th><th></th></tr></thead><tbody>${lista.map(p => `<tr class="click" data-act="cadProduto" data-id="${p.id}"><td><b>${esc(p.nome)}</b></td><td>${esc(p.detalhe)}</td><td>${p.ativo ? '' : S.tag('Inativo', 'gray')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><b>Nenhum cadastro</b>Ex.: ${aba === 'programa' ? 'Manhã Total, Rotativo 06h-19h, Jornal da Cidade' : 'Spot 30", Testemunhal, Patrocínio de programa'}.</div>`}</div>`;
    }
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Tabelas comerciais`, actions:`<button class="btn pri" data-act="${aba === 'precos' ? 'cadPreco' : 'cadProduto'}">${S.svg('mais')}${botao}</button>`, body:seg + body };
  };

  const comExcluir = (tabela, id) => { const d = document.getElementById('dlg'), ok = d.onclose; d.onclose = () => { if (d.returnValue === 'excluir') { if (confirm('Excluir este cadastro?')) S.run(() => S.excluir(tabela, id), 'Excluído'); } else ok(); }; };
  const btnExcluir = { html:'<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir</button></div>' };

  Object.assign(S.actions, {
    cadAba: d => { aba = d.tab; S.render(); },
    cadProduto: d => { const p = d.id ? prod(d.id) : { ativo:true };
      S.form(p.id ? esc(p.nome) : (aba === 'programa' ? 'Novo programa ou faixa' : 'Novo formato'), [
        { k:'nome', label:TIPOS[p.tipo || aba][1], req:true, ph:(p.tipo || aba) === 'programa' ? 'Ex.: Manhã Total' : 'Ex.: Spot 30"' }, { k:'detalhe', label:TIPOS[p.tipo || aba][2].replace(/ \(ex\.:.*\)/, ''), ph:(p.tipo || aba) === 'programa' ? 'Ex.: 06h às 10h' : 'Ex.: 30 segundos' }, { k:'ativo', label:'Disponível para novos PIs', type:'checkbox' }, ...(p.id ? [btnExcluir] : [])], p,
        v => S.run(() => S.salvar('produtos', Object.assign({ nome:v.nome, detalhe:v.detalhe, ativo:v.ativo === 'on' }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo:aba })), 'Cadastro salvo'));
      if (p.id) comExcluir('produtos', p.id); },
    cadPreco: d => { const p = d.id ? S.db.precos.find(x => x.id === d.id) : { vigencia_inicio:S.today(), desconto_max:0 };
      const progs = doTipo('programa'), forms = doTipo('formato');
      if (!progs.length || !forms.length) return S.toast('Cadastre ao menos um programa e um formato antes dos preços.');
      S.form(p.id ? 'Editar preço' : 'Novo preço', [
        { k:'programa_id', label:'Programa / faixa', type:'select', options:progs.map(x => [x.id, x.nome]) }, { k:'formato_id', label:'Formato', type:'select', options:forms.map(x => [x.id, x.nome]) },
        { k:'preco', label:'Preço por inserção (R$)', req:true, ph:'Ex.: 68,00' }, { k:'vigencia_inicio', label:'Vigência a partir de', type:'date', req:true },
        { k:'desconto_max', label:'Desconto máximo (%)' }, ...(p.id ? [btnExcluir] : [])], Object.assign({}, p, { preco:S.nfmt(Number(p.preco)) }),
        v => S.run(() => S.salvar('precos', Object.assign({ programa_id:v.programa_id, formato_id:v.formato_id, preco:S.num(v.preco), vigencia_inicio:v.vigencia_inicio, desconto_max:S.num(v.desconto_max) }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId })), 'Preço salvo'));
      if (p.id) comExcluir('precos', p.id); }
  });
})();

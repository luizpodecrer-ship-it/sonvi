// SONVI · Agências do grupo (aprovado em 29/10/2026, database/058): item "Agências" no menu do Dashboard geral, só o diretor.
// Cadastro único: a agência é cadastrada uma vez e vale em todos os veículos. Por baixo cada veículo tem a sua cópia
// (cliente, proposta e PI apontam para ela) e o banco mantém as cópias iguais (salvar_agencia_grupo, excluir_agencia_grupo).
// Dentro do veículo a aba "Agências" saiu de Clientes; o cliente, a proposta e o PI continuam escolhendo a agência como antes.
(() => {
  const { esc } = S;
  const st = { lista:null, carregando:false, q:'' };
  const carregar = async () => { if (st.carregando) return; st.carregando = true;
    try { st.lista = await S.q(S.sb.rpc('agencias_grupo')) || []; } catch (e) { console.error(e); S.toast(S.erro(e)); st.lista = st.lista || []; }
    st.carregando = false; if (['agencias', 'admin'].includes(S.ui.view)) S.render(); };
  S.agenciasUsar = l => { st.lista = l; };   // testes
  S.agenciasLimpar = () => { st.lista = null; };

  const curto = v => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi` : v >= 1e4 ? `R$ ${Math.round(v / 1e3)} mil` : S.brl(v);
  const pct = v => `${String(Number(v) || 0).replace(".", ",")}%`;
  const selos = a => { const vs = (a.veiculos || []).map(id => S.veh(id)).filter(Boolean);
    return vs.length ? `<span class="ag-selos">${vs.map(v => `<span title="${esc(v.nome)}">${S.vav(v)}</span>`).join('')}</span>` : '<span class="muted">—</span>'; };

  // Desde 29/10/2026 a tela fica em Administração, na aba "Agências" (admin.js chama S.agenciasTela); #/agencias leva para lá
  S.views.agencias = () => { queueMicrotask(() => S.admAbrir && S.admAbrir('agencias')); return { title:'<span class="sub">Grupo</span>Administração', actions:'', body:'' }; };
  S.agenciasRecarregar = () => { st.lista = null; };
  S.agenciasTela = () => {
    const titulo = '<span class="sub">Grupo</span>Agências', acoes = `<button class="btn pri" data-act="agNova">${S.svg('mais')}Nova agência</button>`;
    if (!st.lista) { carregar(); return { title:titulo, actions:acoes, body:'<div class="card empty"><b>Carregando as agências…</b></div>' }; }
    const q = st.q.trim().toLowerCase(), qn = q.replace(/\D/g, '');
    const lista = st.lista.filter(a => { const d = a.dados || {}; return !q || [d.nome, d.razao_social, d.cidade].join(' ').toLowerCase().includes(q) || (qn.length > 2 && String(d.documento || '').replace(/\D/g, '').includes(qn)); });
    const total = st.lista.reduce((s, a) => s + Number(a.pis_valor || 0), 0), nv = (S.db.veiculos || []).length;
    const resumo = `<b>${st.lista.length} ${st.lista.length === 1 ? 'agência' : 'agências'}</b> · cadastra uma vez e vale nos ${nv} veículos · ${curto(total)} em PIs com agência em 12 meses`;
    const linha = a => { const d = a.dados || {};
      return `<tr class="click" data-act="agEditar" data-id="${a.grupo}">
        <td><div class="ag-nome"><span class="av soft" aria-hidden="true">${esc(S.iniciais(d.nome))}</span><span><b class="clamp2" title="${esc(d.nome)}">${esc(d.nome)}</b><small>${esc([d.documento, d.cidade].filter(Boolean).join(' · ')) || '—'}</small></span></div></td>
        <td class="r nw">${pct(d.comissao)}</td><td>${selos(a)}</td><td class="r nw">${a.clientes || 0}</td>
        <td class="r nw"><b>${a.pis_valor ? curto(Number(a.pis_valor)) : '—'}</b>${a.pis ? `<small class="ag-sub">${a.pis} PI${a.pis === 1 ? '' : 's'}</small>` : ''}</td>
        <td class="r"><div class="lin-acoes"><button class="btn sm" data-act="agEditar" data-id="${a.grupo}">Editar</button><button class="btn tres" data-act="agMenu" data-id="${a.grupo}" aria-label="Opções de ${esc(d.nome)}">${S.svg('mais3')}</button></div></td></tr>`; };
    const cel = a => { const d = a.dados || {};
      return `<div class="ag-cel" data-act="agEditar" data-id="${a.grupo}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(d.nome))}</span>
        <span class="ag-cel-tx"><b>${esc(d.nome)}</b><small>Comissão ${pct(d.comissao)} · ${a.clientes || 0} cliente${a.clientes === 1 ? '' : 's'}</small></span>
        <span class="ag-cel-v"><b>${a.pis_valor ? curto(Number(a.pis_valor)) : '—'}</b><small>12 meses</small></span></div>`; };
    const vazio = `<div class="empty"><b>${q ? 'Nenhuma agência encontrada' : 'Nenhuma agência cadastrada'}</b>${q ? 'Experimente outra busca.' : 'Cadastre a primeira pelo botão "Nova agência". Ela passa a valer em todos os veículos.'}</div>`;
    const card = `<section class="card ag-card" aria-labelledby="ag-t">
      <div class="ag-cab"><div><h2 id="ag-t">Cadastro único do grupo</h2><p>${resumo}</p></div>
        <label class="fin-busca ag-busca">${S.svg('busca')}<input value="${esc(st.q)}" data-ag="q" placeholder="Buscar agência ou CNPJ" aria-label="Buscar agências"></label></div>
      ${!lista.length ? vazio : S.celular ? `<div class="ag-lista">${lista.map(cel).join('')}</div>`
        : `<div class="scroll"><table class="ag-tab"><colgroup><col><col style="width:110px"><col style="width:22%"><col style="width:96px"><col style="width:150px"><col style="width:150px"></colgroup>
          <thead><tr><th>Agência</th><th class="r">Comissão</th><th>Comprou de</th><th class="r">Clientes</th><th class="r">PIs em 12 meses</th><th><span class="sr">Ações</span></th></tr></thead>
          <tbody>${lista.map(linha).join('')}</tbody></table></div>`}
      <p class="ag-nota">Dentro de cada veículo, o cliente, a proposta e o PI escolhem a agência desta lista.</p></section>`;
    return { title:titulo, actions:acoes, body:card };
  };

  // Busca sem redesenhar a tela inteira a cada letra perder o foco: redesenha e devolve o cursor
  document.addEventListener('input', e => { if (!e.target.dataset || e.target.dataset.ag !== 'q') return; st.q = e.target.value; const pos = e.target.selectionStart; S.render();
    const c = document.querySelector('[data-ag="q"]'); if (c) { c.focus(); try { c.setSelectionRange(pos, pos); } catch (er) { /* sem cursor */ } } });

  const achar = id => (st.lista || []).find(a => a.grupo === id);
  const formulario = a => {
    const d = a ? Object.assign({}, a.dados) : { pessoa:'pj', comissao:20 }, novo = !a;
    S.form(novo ? 'Nova agência' : esc(d.nome), [
      { k:'nome', label:'Nome da agência', req:true, ph:'Ex.: Agência Ponto Alto' },
      { k:'pessoa', label:'Tipo', type:'select', options:[['pj', 'Pessoa jurídica'], ['pf', 'Pessoa física']] },
      { k:'documento', label:'CNPJ / CPF' }, { html:'<div style="display:flex;align-items:flex-end"><button type="button" class="btn sm" data-act="pesCnpj">Preencher pelo CNPJ</button></div>' },
      { k:'razao_social', label:'Razão social' }, { k:'inscricao_estadual', label:'Inscrição estadual' },
      { k:'cep', label:'CEP' }, { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço', full:true },
      { k:'telefone', label:'Telefone' }, { k:'whatsapp', label:'WhatsApp' }, { k:'email', label:'E-mail', type:'email' },
      { k:'email_faturamento', label:'E-mail de faturamento', type:'email', ph:'financeiro@agencia.com.br' },
      { k:'contato_decide', label:'Contato' }, { k:'comissao', label:'Comissão padrão (%)' },
      { k:'observacoes', label:'Observações', type:'textarea' },
      { html:`<p class="muted small" style="grid-column:1/-1;margin:0">Vale em todos os ${(S.db.veiculos || []).length} veículos do grupo. Mudar aqui muda em todos.</p>` }],
      d, f => S.run(async () => {
        await S.q(S.sb.rpc('salvar_agencia_grupo', { p_grupo:novo ? null : a.grupo, p_dados:Object.assign({}, f, { comissao:String(S.num(f.comissao) || 0) }) }));
        st.lista = null; await carregar(); if (S.ui.vehicleId && S.carregarVeiculo) S.carregarVeiculo().catch(console.error);
      }, novo ? 'Agência cadastrada em todos os veículos' : 'Agência salva em todos os veículos'));
  };

  Object.assign(S.actions, {
    agNova: () => formulario(null),
    agEditar: d => { const a = achar(d.id); if (a) formulario(a); },
    agMenu: (d, botao) => { const a = achar(d.id); if (!a) return;
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'agEditar', data:{ id:d.id } }, '-', { label:'Excluir agência', icon:'lixo', act:'agExcluir', data:{ id:d.id }, perigo:true }]); },
    agExcluir: async d => { const a = achar(d.id); if (!a) return;
      if (a.vinculos) return S.toast(`${a.dados.nome} tem clientes, propostas ou PIs ligados e não pode ser excluída. Tire a agência deles antes.`);
      if (!await S.confirmar(`Excluir ${a.dados.nome}?\n\nA agência sai de todos os veículos.`, { ok:'Excluir agência', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.rpc('excluir_agencia_grupo', { p_grupo:a.grupo })); st.lista = null; await carregar(); if (S.ui.vehicleId && S.carregarVeiculo) S.carregarVeiculo().catch(console.error); }, 'Agência excluída');
    }
  });
})();

// SONVI · Agências do grupo (aprovado em 29/10/2026, database/058): item "Agências" no menu do Dashboard Gestão, só o diretor.
// Cadastro único: a agência é cadastrada uma vez e vale em todos os veículos. Por baixo cada veículo tem a sua cópia
// (cliente, proposta e PI apontam para ela) e o banco mantém as cópias iguais (salvar_agencia_grupo, excluir_agencia_grupo).
// Dentro do veículo a aba "Agências" saiu de Clientes; o cliente, a proposta e o PI continuam escolhendo a agência como antes.
(() => {
  const { esc } = S;
  const st = { lista:null, carregando:false, q:'', qv:'' };
  const carregar = async () => { if (st.carregando) return; st.carregando = true;
    try { st.lista = await S.q(S.sb.rpc('agencias_grupo')) || []; } catch (e) { console.error(e); S.toast(S.erro(e)); st.lista = st.lista || []; }
    st.carregando = false; if (['agencias', 'admin'].includes(S.ui.view)) S.render(); };
  S.agenciasUsar = l => { st.lista = l; };   // testes
  S.agenciasLimpar = () => { st.lista = null; };
  S.agenciasN = () => st.lista ? st.lista.length : null;   // contador no menu de Administração

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
    // Cadastro de empresa (29/10/2026, pedido do Luiz): nome e razão social, CNPJ, cidade, telefone e e-mail; nada de números de venda
    const resumo = `<b>${st.lista.length} ${st.lista.length === 1 ? 'agência' : 'agências'}</b> · cadastra uma vez e vale em todos os veículos`;
    const linha = a => { const d = a.dados || {};
      return `<tr class="click" data-act="agEditar" data-id="${a.grupo}">
        <td><div class="ag-nome"><span class="av soft" aria-hidden="true">${esc(S.iniciais(d.nome))}</span><span><b class="clamp2" title="${esc(d.nome)}">${esc(d.nome)}</b>${d.razao_social && d.razao_social !== d.nome ? `<small title="${esc(d.razao_social)}">${esc(d.razao_social)}</small>` : ''}</span></div></td>
        <td class="nw">${esc(fmtDoc(d.documento)) || '—'}</td><td class="nw ag-txt" title="${esc(d.cidade)}">${esc(d.cidade) || '—'}</td><td class="nw ag-c-tel">${esc(d.telefone || d.whatsapp) || '—'}</td>
        <td class="ag-txt ag-c-mail" title="${esc(d.email)}">${esc(d.email) || '—'}</td>
        <td class="r"><div class="lin-acoes"><button class="btn sm" data-act="agEditar" data-id="${a.grupo}">Editar</button><button class="btn tres" data-act="agMenu" data-id="${a.grupo}" aria-label="Opções de ${esc(d.nome)}">${S.svg('mais3')}</button></div></td></tr>`; };
    const cel = a => { const d = a.dados || {};
      return `<div class="ag-cel" data-act="agEditar" data-id="${a.grupo}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(d.nome))}</span>
        <span class="ag-cel-tx"><b>${esc(d.nome)}</b><small>${esc([fmtDoc(d.documento), d.cidade].filter(Boolean).join(' · ')) || '—'}</small></span></div>`; };
    const vazio = `<div class="empty"><b>${q ? 'Nenhuma agência encontrada' : 'Nenhuma agência cadastrada'}</b>${q ? 'Experimente outra busca.' : 'Cadastre a primeira pelo botão "Nova agência". Ela passa a valer em todos os veículos.'}</div>`;
    const pg = S.paginar('ag-grupo', lista, lista.length === 1 ? 'agência' : 'agências', q);   /* paginação padrão (08/11/2026) */
    const card = `<section class="card ag-card" aria-labelledby="ag-t">
      <div class="ag-cab"><div><h2 id="ag-t">Cadastro único do grupo</h2><p>${resumo}</p></div>
        <label class="fin-busca ag-busca">${S.svg('busca')}<input value="${esc(st.q)}" data-ag="q" placeholder="Buscar agência ou CNPJ" aria-label="Buscar agências"></label></div>
      ${!lista.length ? vazio : S.celular ? `<div class="ag-lista">${pg.itens.map(cel).join('')}</div>`
        : `<div class="scroll"><table class="ag-tab">
          <thead><tr><th>Agência</th><th class="ag-w-doc">CNPJ</th><th class="ag-w-cid">Cidade</th><th class="ag-w-tel ag-c-tel">Telefone</th><th class="ag-w-mail ag-c-mail">E-mail</th><th class="ag-w-ac"><span class="sr">Ações</span></th></tr></thead>
          <tbody>${pg.itens.map(linha).join('')}</tbody></table></div>`}${pg.html}
      <p class="ag-nota">Dentro de cada veículo, o cliente, a proposta e o PI escolhem a agência desta lista.</p></section>`;
    return { title:titulo, actions:acoes, body:card };
  };

  // Busca sem redesenhar a tela inteira a cada letra perder o foco: redesenha e devolve o cursor
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.ag; if (k !== 'q' && k !== 'qv') return; st[k] = e.target.value; const pos = e.target.selectionStart; S.render();
    const c = document.querySelector(`[data-ag="${k}"]`); if (c) { c.focus(); try { c.setSelectionRange(pos, pos); } catch (er) { /* sem cursor */ } } });

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
      { html:`<p class="muted small" style="grid-column:1/-1;margin:0">${S.me.diretor ? 'Vale em todos os veículos do grupo. Mudar aqui muda em todos.' : 'Entra no cadastro de agências do grupo e vale em todos os veículos. Para mudar uma agência já cadastrada, fale com o diretor.'}</p>` }],
      d, f => S.run(async () => {
        await S.q(S.sb.rpc('salvar_agencia_grupo', { p_grupo:novo ? null : a.grupo, p_dados:Object.assign({}, f, { comissao:String(S.num(f.comissao) || 0) }) }));
        st.lista = null; if (S.me.diretor) await carregar(); if (S.ui.vehicleId && S.carregarVeiculo) await S.carregarVeiculo().catch(console.error); S.render();
      }, novo ? { titulo:'Agência cadastrada', sub:`${f.nome} já vale em todos os veículos do grupo.` } : 'Agência salva em todos os veículos'));
    // Consultor e gerente só consultam a agência que já existe (alterar é do diretor)
    if (!novo && !S.me.diretor) { const b = document.querySelector('#dlg [data-act="formEditar"]'); if (b) b.remove(); }
  };

  // ---------- Agências dentro do veículo (03/11/2026, database/076) ----------
  // Menu "Agências" abaixo de Clientes, para diretor, gerente e consultor. Lista as agências do grupo (a cópia deste veículo);
  // "Nova agência" grava no cadastro único (salvar_agencia_grupo), que cria a agência em todos os veículos e em Administração › Agências.
  S.ICON['agencias-v'] = S.ICON.agencias;
  const doVeiculo = () => (S.db.pessoas || []).filter(p => p.tipo === 'agencia').sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const comoGrupo = p => ({ grupo:p.cadastro_id || p.id, dados:p });
  // Tela enxuta (08/11/2026, pedido do Luiz: "são apenas cadastros", menos informação; modelo "Cadastros enxutos"):
  // uma linha por agência com iniciais, nome, cidade embaixo e o CNPJ formatado; busca e paginação padrão (S.paginar). Estilos .cx-*.
  const fmtDoc = d => { const n = String(d || '').replace(/\D/g, ''); return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : n.length === 11 ? n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (d || ''); };
  const inicioAg = {};
  const entradaAg = vk => { const agora = performance.now(); if (!(vk in inicioAg)) inicioAg[vk] = agora; const t = agora - inicioAg[vk]; return t > 2000 ? '' : ` cx-entra" style="--t:-${Math.round(t)}ms`; };
  S.views['agencias-v'] = () => {
    const veh = S.veh(), titulo = `<span class="sub">${esc(veh ? veh.nome : '')}</span>Agências`, acoes = `<button class="btn pri" data-act="agNova">${S.svg('mais')}Nova agência</button>`;
    const todas = doVeiculo(), q = st.qv.trim().toLowerCase(), qn = q.replace(/\D/g, '');
    const lista = todas.filter(d => !q || [d.nome, d.razao_social, d.cidade].join(' ').toLowerCase().includes(q) || (qn.length > 2 && String(d.documento || '').replace(/\D/g, '').includes(qn)));
    const pg = S.paginar('agv|' + S.ui.vehicleId, lista, lista.length === 1 ? 'agência' : 'agências', q), ent = entradaAg(`ag|${S.ui.vehicleId}|${pg.de}`);
    const linha = (d, i) => `<div class="cx-l cx-ag" role="row" data-act="agVer" data-id="${d.id}" tabindex="0" style="--d:${Math.min(i, 14) * 30}ms">
        <span class="cx-nome" role="cell"><span class="cx-av" aria-hidden="true">${esc(S.iniciais(d.nome))}</span><span><b title="${esc(d.nome)}">${esc(d.nome)}</b><small>${esc(d.cidade) || 'Cidade não informada'}</small></span></span>
        <span class="cx-doc" role="cell">${esc(fmtDoc(d.documento)) || '<span class="muted">sem CNPJ</span>'}</span>
        <span role="cell" class="cx-ac"><span class="cx-ir" aria-hidden="true">${S.svg('seta', 16)}</span></span></div>`;
    const vazio = `<div class="empty"><b>${q ? 'Nenhuma agência encontrada' : 'Nenhuma agência cadastrada'}</b>${q ? 'Experimente outra busca.' : 'Cadastre a primeira pelo botão "Nova agência". Ela passa a valer em todos os veículos do grupo.'}</div>`;
    const body = `<section class="card cx" aria-label="Agências do grupo">
      <div class="cx-barra"><label class="fin-busca cx-busca">${S.svg('busca')}<input value="${esc(st.qv)}" data-ag="qv" placeholder="Buscar agência, CNPJ ou cidade" aria-label="Buscar agências"></label>
        <span class="cx-nota">${todas.length} ${todas.length === 1 ? 'agência' : 'agências'} · cadastro do grupo, vale em todos os veículos</span></div>
      ${!lista.length ? vazio : `<div class="cx-ls${ent}" role="table" aria-label="Agências">${pg.itens.map(linha).join('')}</div>`}
      ${pg.html}</section>`;
    return { title:titulo, actions:acoes, body };
  };
  document.addEventListener('keydown', e => { const l = e.target.closest && e.target.closest('.cx-ag'); if (l && (e.key === 'Enter' || e.key === ' ') && e.target === l) { e.preventDefault(); S.actions.agVer({ id:l.dataset.id }); } });

  Object.assign(S.actions, {
    agNova: () => formulario(null),
    agEditar: d => { const a = achar(d.id); if (a) formulario(a); },
    agVer: d => { const p = (S.db.pessoas || []).find(x => x.id === d.id && x.tipo === 'agencia'); if (p) formulario(comoGrupo(p)); },
    agMenu: (d, botao) => { const a = achar(d.id); if (!a) return;
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'agEditar', data:{ id:d.id } }, '-', { label:'Excluir agência', icon:'lixo', act:'agExcluir', data:{ id:d.id }, perigo:true }]); },
    agExcluir: async d => { const a = achar(d.id); if (!a) return;
      if (a.vinculos) return S.toast(`${a.dados.nome} tem clientes, propostas ou PIs ligados e não pode ser excluída. Tire a agência deles antes.`);
      if (!await S.confirmar(`Excluir ${a.dados.nome}?\n\nA agência sai de todos os veículos.`, { ok:'Excluir agência', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.rpc('excluir_agencia_grupo', { p_grupo:a.grupo })); st.lista = null; await carregar(); if (S.ui.vehicleId && S.carregarVeiculo) S.carregarVeiculo().catch(console.error); }, 'Agência excluída');
    }
  });
})();

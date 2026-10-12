// SONVI · clientes (anunciantes) e agências do veículo selecionado.
(() => {
  const { esc } = S;
  const SIT = { prospect:['Prospect', 'orange'], ativo:['Ativo', 'green'], inativo:['Inativo', 'gray'] };
  let aba = 'cliente';

  S.views.clientes = () => {
    const q = S.ui.q.toLowerCase(), lista = S.pessoas(aba).filter(p => !q || [p.nome, p.razao_social, p.documento, p.cidade, p.segmento].join(' ').toLowerCase().includes(q));
    const podeCriar = S.pode('diretor', 'gerente', 'consultor');
    const linhas = lista.map(p => `<tr class="click" data-act="pesEditar" data-id="${p.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(p.nome))}</span><div><b>${esc(p.nome)}</b><div class="muted small">${esc(p.razao_social)}</div></div></div></td><td>${esc(p.documento)}</td><td>${esc(p.cidade)}</td><td>${esc(p.telefone || p.whatsapp)}</td>
      ${aba === 'cliente' ? `<td>${esc(S.usuario(p.consultor_id))}</td><td>${esc(S.nome(p.agencia_id))}</td><td>${S.tag(...SIT[p.situacao])}</td>` : `<td class="r">${S.nfmt(Number(p.comissao)) || '0'}%</td>`}</tr>`).join('');
    return { title:`<span class="sub">${esc(S.veh().nome)} · ${S.pessoas(aba).length} ${aba === 'cliente' ? 'clientes' : 'agências'}</span>${aba === 'cliente' ? 'Clientes' : 'Agências'}`, actions:podeCriar ? `<button class="btn pri" data-act="pesNovo">${S.svg('mais')}${aba === 'cliente' ? 'Novo cliente' : 'Nova agência'}</button>` : '',
      body:`<div class="row mid" style="margin-bottom:16px"><div class="seg" style="margin:0">${[['cliente', 'Clientes'], ['agencia', 'Agências']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="pesAba" data-tab="${k}">${n}</button>`).join('')}</div><input type="search" class="grow" style="height:42px" placeholder="Buscar por nome, CNPJ, cidade ou segmento" value="${esc(S.ui.q)}" data-ui="q"></div>
        <div class="card">${lista.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>CNPJ / CPF</th><th>Cidade</th><th>Telefone</th>${aba === 'cliente' ? '<th>Consultor</th><th>Agência</th><th>Situação</th>' : '<th class="r">Comissão</th>'}</tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty"><b>Nenhum cadastro${q ? ' encontrado' : ''}</b>${S.pode('consultor') && aba === 'cliente' ? 'Aqui aparecem os clientes da sua carteira.' : ''}</div>`}</div>` };
  };

  function formulario(p) {
    const cliente = (p.tipo || aba) === 'cliente', gestor = S.pode('diretor', 'gerente'), novo = !p.id;
    const buscar = (id, label) => ({ html:`<div style="display:flex;align-items:flex-end"><button type="button" class="btn sm" data-act="${id}">${label}</button></div>` });
    const campos = [
      { k:'nome', label:cliente ? 'Nome fantasia ou nome' : 'Nome da agência', req:true, ph:cliente ? 'Ex.: Supermercado Três Irmãos' : 'Ex.: Agência Ponto Alto' },
      { k:'pessoa', label:'Tipo', type:'select', options:[['pj', 'Pessoa jurídica'], ['pf', 'Pessoa física']] },
      { k:'documento', label:'CNPJ / CPF' }, buscar('pesCnpj', 'Preencher pelo CNPJ'),
      { k:'razao_social', label:'Razão social' }, { k:'inscricao_estadual', label:'Inscrição estadual' },
      { k:'cep', label:'CEP' }, { k:'cidade', label:'Cidade / UF' },
      { k:'endereco', label:'Endereço', full:true },
      { k:'telefone', label:'Telefone' }, { k:'whatsapp', label:'WhatsApp' }, { k:'email', label:'E-mail', type:'email' },
      ...(cliente ? [
        { k:'segmento', label:'Segmento' }, { k:'contato_decide', label:'Contato que decide' }, { k:'contato_assina', label:'Contato que assina' },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Sem agência'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        { k:'situacao', label:'Situação', type:'select', options:Object.entries(SIT).map(([k, v]) => [k, v[0]]) },
        ...(gestor ? [{ k:'consultor_id', label:'Consultor responsável', type:'select', options:[['', 'Sem consultor'], ...S.consultores().map(u => [u.id, u.nome || u.email])] }] : [])
      ] : [{ k:'comissao', label:'Comissão padrão (%)' }]),
      { k:'observacoes', label:'Observações', type:'textarea' },
      ...(!novo && gestor ? [{ html:`<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir cadastro</button></div>` }] : [])];
    S.form(novo ? (cliente ? 'Novo cliente' : 'Nova agência') : esc(p.nome), campos, p, v => S.run(async () => {
      const row = Object.assign({}, v, { agencia_id:v.agencia_id || null });
      if (cliente) row.consultor_id = gestor ? (v.consultor_id || null) : (p.consultor_id || S.me.id); else { row.comissao = S.num(v.comissao); delete row.agencia_id; }
      if (p.id) row.id = p.id; else Object.assign(row, { veiculo_id:S.ui.vehicleId, tipo:cliente ? 'cliente' : 'agencia' });
      await S.salvar('pessoas', row);
    }, 'Cadastro salvo'));
    const d = document.getElementById('dlg'), ok = d.onclose;
    d.onclose = () => { if (d.returnValue === 'excluir') { if (confirm('Excluir este cadastro?')) S.run(() => S.excluir('pessoas', p.id), 'Cadastro excluído'); } else ok(); };
  }

  // Preenchimento pelo CNPJ (botão). O CEP se preenche sozinho ao completar os 8 números (core.js).
  const campo = n => document.querySelector(`#dlg [name="${n}"]`);
  async function buscar(url, usar) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(); usar(await r.json()); S.mascarar(document.getElementById('dlg')); S.toast('Dados preenchidos. Confira antes de salvar.'); }
    catch (e) { S.toast('Não encontrei. Confira o número e tente de novo.'); }
  }

  Object.assign(S.actions, {
    pesAba: d => { aba = d.tab; S.render(); },
    pesNovo: () => formulario({ tipo:aba, pessoa:'pj', situacao:'prospect', comissao:20, consultor_id:S.pode('consultor') ? S.me.id : '' }),
    pesEditar: d => { const p = S.pessoa(d.id); if (S.pode('diretor', 'gerente') || (S.pode('consultor') && (p.tipo === 'agencia' || p.consultor_id === S.me.id))) formulario(p); else S.toast('Seu perfil só pode consultar este cadastro.'); },
    pesCnpj: () => { const n = campo('documento').value.replace(/\D/g, ''); if (n.length !== 14) return S.toast('Digite os 14 números do CNPJ.');
      buscar('https://brasilapi.com.br/api/cnpj/v1/' + n, j => { campo('razao_social').value = j.razao_social || ''; if (!campo('nome').value) campo('nome').value = j.nome_fantasia || j.razao_social || ''; campo('cep').value = j.cep || ''; campo('endereco').value = [j.logradouro, j.numero, j.bairro].filter(Boolean).join(', '); campo('cidade').value = [j.municipio, j.uf].filter(Boolean).join(' / '); if (!campo('telefone').value) campo('telefone').value = j.ddd_telefone_1 || ''; }); }
  });
})();

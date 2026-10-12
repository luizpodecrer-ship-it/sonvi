// SONVI · administração (só o diretor): veículos do grupo e usuários com o perfil em cada rádio.
(() => {
  const { esc } = S;
  let aba = 'veiculos';
  const PERFIS_VINCULO = [['', 'Sem acesso'], ['gerente', 'Gerente comercial'], ['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro']];

  S.views.admin = () => {
    const seg = `<div class="seg">${[['veiculos', 'Veículos'], ['usuarios', 'Usuários']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="admAba" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body;
    if (aba === 'veiculos') {
      body = `<div class="card">${S.db.veiculos.length ? `<div class="scroll"><table><thead><tr><th>Rádio</th><th>Sigla do PI</th><th>CNPJ</th><th>Frequência</th><th>Cidade</th><th class="r">PIs emitidos</th></tr></thead><tbody>${S.db.veiculos.map(v => `<tr class="click" data-act="admVeiculo" data-id="${v.id}"><td><span class="dot" style="background:${esc(v.cor)}"></span> <b>${esc(v.nome)}</b><div class="muted small">${esc(v.razao_social)}</div></td><td>${esc(v.sigla)}</td><td>${esc(v.cnpj)}</td><td>${esc(v.frequencia)}</td><td>${esc(v.cidade)}</td><td class="r">${v.pi_seq}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Cadastre a primeira rádio</b>Cada veículo tem CNPJ, clientes, PIs e financeiro próprios.</div>'}</div>`;
    } else {
      body = `<div class="card"><div class="scroll"><table><thead><tr><th>Usuário</th><th>Acesso</th><th>Rádios e perfis</th></tr></thead><tbody>${S.db.usuarios.map(u => { const vs = S.db.vinculos.filter(x => x.usuario_id === u.id);
        return `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><b>${esc(u.nome) || '—'}</b><div class="muted small">${esc(u.email)}</div></td><td>${!u.ativo ? S.tag('Inativo', 'gray') : u.diretor ? S.tag('Diretor', 'purple') : vs.length ? S.tag('Ativo', 'green') : S.tag('Aguardando liberação', 'orange')}</td><td>${u.diretor ? 'Todas as rádios' : vs.map(x => `${esc((S.veh(x.veiculo_id) || {}).nome)} · ${S.PERFIS[x.perfil]}`).join('<br>') || '<span class="muted">Nenhuma</span>'}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="muted small" style="margin-top:12px">Para incluir alguém, peça que a pessoa abra o SONVI e toque em "Criar conta". Ela aparece aqui como "Aguardando liberação" e você define a rádio e o perfil.</p></div>`;
    }
    return { title:'<span class="sub">Grupo</span>Administração', actions:aba === 'veiculos' ? '<button class="btn pri" data-act="admVeiculo">Novo veículo</button>' : '', body:seg + body };
  };

  Object.assign(S.actions, {
    admAba: d => { aba = d.tab; S.render(); },
    admVeiculo: d => { const v = d.id ? S.veh(d.id) : { cor:'#0071e3' };
      S.form(v.id ? esc(v.nome) : 'Novo veículo', [
        { k:'nome', label:'Nome da rádio', req:true }, { k:'sigla', label:'Sigla do PI (ex.: CBN)', req:true },
        { k:'razao_social', label:'Razão social' }, { k:'cnpj', label:'CNPJ' }, { k:'inscricao_estadual', label:'Inscrição estadual' }, { k:'frequencia', label:'Frequência (ex.: 101,9 FM)' },
        { k:'rede_afiliada', label:'Rede afiliada' }, { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço', full:true },
        { k:'telefone', label:'Telefone' }, { k:'email', label:'E-mail', type:'email' }, { k:'dados_bancarios', label:'Dados bancários (banco, agência, conta, Pix)', type:'textarea' }, { k:'cor', label:'Cor da rádio', type:'color' }], v,
        f => S.run(async () => { const row = Object.assign({}, f, { sigla:f.sigla.toUpperCase().trim() }); if (v.id) row.id = v.id;
          const novo = await S.salvar('veiculos', row); if (!v.id) { S.ui.vehicleId = novo.id; await S.carregarVeiculo(); } }, 'Veículo salvo')); },
    admUsuario: d => { const u = S.db.usuarios.find(x => x.id === d.id), atual = v => (S.db.vinculos.find(x => x.usuario_id === u.id && x.veiculo_id === v.id) || {}).perfil || '';
      S.form(esc(u.nome || u.email), [
        { k:'ativo', label:'Usuário ativo', type:'checkbox' }, { k:'diretor', label:'Diretor (vê todas as rádios)', type:'checkbox' },
        ...S.db.veiculos.map(v => ({ k:'v_' + v.id, label:v.nome, type:'select', options:PERFIS_VINCULO }))],
        Object.assign({ ativo:u.ativo, diretor:u.diretor }, Object.fromEntries(S.db.veiculos.map(v => ['v_' + v.id, atual(v)]))),
        f => S.run(async () => {
          await S.q(S.sb.rpc('admin_usuario', { p_usuario:u.id, p_ativo:f.ativo === 'on', p_diretor:f.diretor === 'on' }));
          for (const v of S.db.veiculos) { const novo = f['v_' + v.id], antes = atual(v);
            if (novo === antes) continue;
            if (!novo) await S.q(S.sb.from('usuario_veiculos').delete().eq('usuario_id', u.id).eq('veiculo_id', v.id));
            else await S.q(S.sb.from('usuario_veiculos').upsert({ usuario_id:u.id, veiculo_id:v.id, perfil:novo })); }
          await S.carregarBase();
        }, 'Usuário atualizado')); }
  });
})();

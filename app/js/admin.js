// SONVI · administração (só o diretor): veículos do grupo e usuários com o perfil em cada rádio.
(() => {
  const { esc } = S;
  let aba = 'veiculos';
  const PERFIS_VINCULO = [['', 'Sem acesso'], ['gerente', 'Gerente comercial'], ['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro']];

  const vinculosDe = u => S.db.vinculos.filter(x => x.usuario_id === u.id && S.veh(x.veiculo_id));
  const acessoTexto = (u, sep = ' · ') => u.diretor ? 'Diretor · todas as rádios' : vinculosDe(u).map(x => `${esc(S.veh(x.veiculo_id).nome)}: ${S.PERFIS[x.perfil]}`).join(sep) || '<span class="muted">Nenhuma rádio</span>';
  const situacao = u => !u.ativo ? S.tag('Desativado', 'gray') : !u.ultimo_acesso ? S.tag('Aguardando primeiro acesso', 'orange') : !u.diretor && !vinculosDe(u).length ? S.tag('Sem rádio', 'orange') : S.tag('Ativo', 'green');

  // Chama a função do servidor que cria o acesso e gera o link (a chave secreta fica só lá)
  const servidor = async corpo => {
    const { data, error } = await S.sb.functions.invoke('usuarios', { body:Object.assign({ destino:location.origin + location.pathname }, corpo) });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ }
      if (/Failed to send|not found|404/i.test(m)) m = 'O serviço de cadastro de usuários ainda não está ativo no servidor.'; throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  };
  // Mostra o link de acesso para enviar pelo WhatsApp ou copiar
  const mostrarLink = (u, link, novo) => {
    const msg = `Olá, ${(u.nome || '').split(' ')[0]}! ${novo ? 'Seu acesso ao SONVI foi criado.' : 'Aqui está o seu link de acesso ao SONVI.'} Toque no link para criar a sua senha e entrar:\n\n${link}\n\nSe o link expirar, me peça um novo.`;
    const fone = String(u.celular || '').replace(/\D/g, ''), wa = `https://wa.me/${fone ? (fone.length <= 11 ? '55' : '') + fone : ''}?text=${encodeURIComponent(msg)}`;
    S.dialog(`<h2>${novo ? 'Usuário cadastrado' : 'Link de acesso'}</h2>
      <p>Envie este link para <b>${esc(u.nome || u.email)}</b>. Ao abrir, a pessoa cria a própria senha e já entra com o acesso que você definiu.</p>
      <div class="note info" style="margin:0;word-break:break-all;font-size:13px">${esc(link)}</div>
      <p class="muted small">O link vale por pouco tempo e só pode ser usado uma vez. Se expirar, gere outro pelo menu ⋯ do usuário.</p>
      <div class="row" style="flex-wrap:wrap"><span class="grow"></span><button type="button" class="btn" data-act="admCopiar" data-link="${esc(link)}">${S.svg('copia')}Copiar link</button><a class="btn pri" href="${esc(wa)}" target="_blank" rel="noopener">${S.svg('whats')}Enviar pelo WhatsApp</a><button class="btn" value="x">Fechar</button></div>`);
  };
  // Formulário do usuário: dados, função (diretor ou por rádio) e o perfil em cada rádio
  const formUsuario = (u, editar, valores) => {
    const novo = !u.id, ver = !novo && !editar, t = ver ? ' disabled data-trava="1"' : '', eu = u.id === S.me.id;
    const atual = v => valores ? valores['v_' + v.id] || '' : (S.db.vinculos.find(x => x.usuario_id === u.id && x.veiculo_id === v.id) || {}).perfil || '';
    const dir = valores ? valores.funcao === 'diretor' : !!u.diretor;
    const radios = `<div class="acessos" style="grid-column:1/-1"${dir ? ' hidden' : ''}><b>Rádios e perfis</b><small class="muted">Escolha o que a pessoa faz em cada rádio. "Sem acesso" esconde a rádio dela.</small>
      ${S.db.veiculos.map(v => `<label class="ac-l">${S.vav(v)}<span class="grow">${esc(v.nome)}</span><select name="v_${v.id}"${t} aria-label="Perfil em ${esc(v.nome)}">${PERFIS_VINCULO.map(([k, n]) => `<option value="${k}"${k === atual(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}</div>`;
    S.form(novo ? 'Cadastrar usuário' : esc(u.nome || u.email), [
      { k:'nome', label:'Nome', req:true, ph:'Nome completo' },
      novo ? { k:'email', label:'E-mail', type:'email', req:true, ph:'nome@empresa.com.br' } : { html:`<label class="f">E-mail<input value="${esc(u.email)}" disabled></label>` },
      { k:'celular', label:'Celular (WhatsApp)' },
      { html:`<label class="f">Função<select name="funcao" data-funcao="1"${t}${eu ? ' disabled' : ''}><option value="radios"${dir ? '' : ' selected'}>Por rádio (gerente, consultor…)</option><option value="diretor"${dir ? ' selected' : ''}>Diretor · todas as rádios</option></select>${eu ? '<input type="hidden" name="funcao" value="diretor"><small class="muted">Você não pode tirar o seu próprio acesso de diretor.</small>' : ''}</label>` },
      { html:radios }],
      valores || u, f => salvarUsuario(u, f), novo ? 'Cadastrar e gerar link' : 'Salvar', { editar });
  };
  const salvarUsuario = (u, f) => {
    const diretor = f.funcao === 'diretor', vinculos = S.db.veiculos.map(v => ({ veiculo_id:v.id, perfil:f['v_' + v.id] || '' })).filter(x => x.perfil);
    if (!diretor && !vinculos.length) { S.toast('Escolha pelo menos uma rádio e o perfil da pessoa nela.'); return formUsuario(u, true, f); }
    if (!u.id) return S.run(async () => {
      const r = await servidor({ acao:'criar', nome:f.nome, email:f.email, celular:f.celular, diretor, vinculos });
      await S.carregarBase(); S.render(); mostrarLink({ nome:f.nome, email:f.email, celular:f.celular }, r.link, true);
    });
    S.run(async () => { await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:f.nome, p_celular:f.celular || '', p_ativo:u.ativo, p_diretor:diretor, p_vinculos:vinculos })); await S.carregarBase(); }, 'Usuário salvo');
  };

  S.views.admin = () => {
    const seg = `<div class="seg">${[['veiculos', 'Veículos'], ['usuarios', 'Usuários']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="admAba" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body;
    if (aba === 'veiculos') {
      body = `<div class="card">${S.db.veiculos.length ? `<div class="scroll"><table><thead><tr><th>Rádio</th><th>Sigla do PI</th><th>CNPJ</th><th>Frequência</th><th>Cidade</th><th class="r">PIs emitidos</th><th></th></tr></thead><tbody>${S.db.veiculos.map(v => `<tr class="click" data-act="admVeiculo" data-id="${v.id}"><td><div style="display:flex;align-items:center;gap:12px">${S.vav(v)}<div><b>${esc(v.nome)}</b><div class="muted small">${esc(v.razao_social)}</div></div></div></td><td>${esc(v.sigla)}</td><td>${esc(v.cnpj)}</td><td>${esc(v.frequencia)}</td><td>${esc(v.cidade)}</td><td class="r">${v.pi_seq}</td><td class="r"><button class="btn sm" data-act="admVeiculo" data-id="${v.id}" data-editar="1">${S.svg('editar')}Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Cadastre a primeira rádio</b>Cada veículo tem CNPJ, clientes, PIs e financeiro próprios.</div>'}</div>`;
    } else {
      const us = S.db.usuarios;
      body = S.celular
        ? `<div class="card"><div class="list">${us.map(u => `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome) || '—'}</b><small>${acessoTexto(u)}</small><span style="margin-top:4px">${situacao(u)}</span></span><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></div>`).join('')}</div></div>`
        : `<div class="card"><div class="scroll"><table><thead><tr><th>Usuário</th><th>Situação</th><th>Rádios e perfis</th><th></th></tr></thead><tbody>${us.map(u =>
          `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><div><b>${esc(u.nome) || '—'}</b><div class="muted small">${esc(u.email)}${u.celular ? ' · ' + esc(u.celular) : ''}</div></div></div></td><td>${situacao(u)}</td><td>${acessoTexto(u, '<br>')}</td><td class="r"><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    return { title:'<span class="sub">Grupo</span>Administração', actions:aba === 'veiculos' ? `<button class="btn pri" data-act="admVeiculo">${S.svg('mais')}Novo veículo</button>` : `<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`, body:seg + body };
  };

  Object.assign(S.actions, {
    admAba: d => { aba = d.tab; S.render(); },
    admVeiculo: d => { const v = d.id ? S.veh(d.id) : {};
      S.form(v.id ? esc(v.nome) : 'Novo veículo', [
        { html:S.campoLogo(v, !!v.id && !d.editar) },
        { k:'nome', label:'Nome da rádio', req:true, ph:'Ex.: Rádio Verde' }, { k:'sigla', label:'Sigla do PI', req:true, ph:'Ex.: VERDE' },
        { k:'razao_social', label:'Razão social' }, { k:'cnpj', label:'CNPJ' }, { k:'inscricao_estadual', label:'Inscrição estadual' }, { k:'frequencia', label:'Frequência' },
        { k:'rede_afiliada', label:'Rede afiliada' }, { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço', full:true },
        { k:'telefone', label:'Telefone' }, { k:'email', label:'E-mail', type:'email' }, { k:'dados_bancarios', label:'Dados bancários', type:'textarea' }], v,
        f => S.run(async () => { const row = Object.assign({}, f, { sigla:f.sigla.toUpperCase().trim(), logo:f.logo || null, cor:(f.cor || S.COR_PADRAO).toLowerCase() }); if (v.id) row.id = v.id;
          const novo = await S.salvar('veiculos', row); if (!v.id) { S.ui.vehicleId = novo.id; await S.carregarVeiculo(); } }, 'Veículo salvo'), 'Salvar', { editar:!!d.editar }); },
    admUsuario: d => formUsuario(d.id ? S.db.usuarios.find(x => x.id === d.id) : {}, false),
    admUsuarioMenu: (d, botao) => { const u = S.db.usuarios.find(x => x.id === d.id), eu = u.id === S.me.id;
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'admUsuarioEditar', data:{ id:u.id } },
        { label:eu ? 'Gerar link para trocar a senha' : 'Gerar link de acesso', icon:'whats', act:'admLink', data:{ id:u.id } },
        ...(eu ? [] : ['-', u.ativo ? { label:'Desativar acesso', icon:'bloqueio', act:'admAtivo', data:{ id:u.id } } : { label:'Reativar acesso', icon:'check', act:'admAtivo', data:{ id:u.id } },
          { label:'Excluir usuário', icon:'lixo', act:'admExcluir', data:{ id:u.id }, perigo:true }])]); },
    admExcluir: d => { const u = S.db.usuarios.find(x => x.id === d.id);
      if (!confirm(`Excluir ${u.nome || u.email} de vez? Não dá para desfazer.\n\nSe a pessoa já trabalhou no sistema (PIs, clientes ou agenda), o SONVI não deixa excluir: use "Desativar acesso".`)) return;
      S.run(async () => { await servidor({ acao:'excluir', usuario_id:u.id }); await S.carregarBase(); }, 'Usuário excluído'); },
    admUsuarioEditar: d => formUsuario(S.db.usuarios.find(x => x.id === d.id), true),
    admLink: d => { const u = S.db.usuarios.find(x => x.id === d.id); S.run(async () => { const r = await servidor({ acao:'link', usuario_id:u.id }); mostrarLink(u, r.link, false); }); },
    admAtivo: d => { const u = S.db.usuarios.find(x => x.id === d.id), ativo = !u.ativo;
      if (!ativo && !confirm(`Desativar o acesso de ${u.nome || u.email}? A pessoa não consegue mais entrar; o histórico dela continua no sistema.`)) return;
      S.run(async () => { await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:u.nome || u.email, p_celular:u.celular || '', p_ativo:ativo, p_diretor:u.diretor, p_vinculos:vinculosDe(u).map(x => ({ veiculo_id:x.veiculo_id, perfil:x.perfil })) })); await S.carregarBase(); }, ativo ? 'Acesso reativado' : 'Acesso desativado'); },
    admCopiar: d => { navigator.clipboard.writeText(d.link).then(() => S.toast('Link copiado'), () => S.toast('Não foi possível copiar; selecione o link e copie.')); },
  });
  // Diretor esconde a lista de rádios (vê todas)
  document.addEventListener('change', e => { if (!e.target.dataset.funcao) return; const a = e.target.closest('form').querySelector('.acessos'); if (a) a.hidden = e.target.value === 'diretor'; });
})();

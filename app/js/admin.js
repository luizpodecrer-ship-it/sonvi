// SONVI · administração (só o diretor): veículos do grupo e usuários com o perfil em cada rádio.
(() => {
  const { esc } = S;
  let aba = 'veiculos';
  const PERFIS_VINCULO = [['', 'Sem acesso'], ['gerente', 'Gerente comercial'], ['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro'], ['programador', 'Programador musical']];

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
      { k:'email', label:'E-mail (é com ele que a pessoa entra)', type:'email', req:true, ph:'nome@empresa.com.br' },
      { k:'celular', label:'Celular (WhatsApp)' },
      { html:`<label class="f">Função<select name="funcao" data-funcao="1"${t}${eu ? ' disabled' : ''}><option value="radios"${dir ? '' : ' selected'}>Por rádio (gerente, consultor…)</option><option value="diretor"${dir ? ' selected' : ''}>Diretor · todas as rádios</option></select>${eu ? '<input type="hidden" name="funcao" value="diretor"><small class="muted">Você não pode tirar o seu próprio acesso de diretor.</small>' : ''}</label>` },
      { html:radios }],
      valores || u, f => salvarUsuario(u, f), novo ? 'Cadastrar e gerar link' : 'Salvar', { editar });
  };
  const salvarUsuario = (u, f) => {
    const diretor = f.funcao === 'diretor', vinculos = S.db.veiculos.map(v => ({ veiculo_id:v.id, perfil:f['v_' + v.id] || '' })).filter(x => x.perfil);
    if (!diretor && !vinculos.length) { formUsuario(u, true, f); return S.erroNoCampo('.acessos', 'Escolha pelo menos uma rádio e o perfil da pessoa nela.'); }
    if (!u.id) return S.run(async () => {
      const r = await servidor({ acao:'criar', nome:f.nome, email:f.email, celular:f.celular, diretor, vinculos });
      await S.carregarBase(); S.render(); mostrarLink({ nome:f.nome, email:f.email, celular:f.celular }, r.link, true);
    });
    // E-mail novo: troca na conta de entrada (função do servidor); a senha continua a mesma
    const email = String(f.email || '').trim().toLowerCase(), trocouEmail = !!email && email !== String(u.email || '').toLowerCase();
    S.run(async () => { if (trocouEmail) await servidor({ acao:'email', usuario_id:u.id, email });
      await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:f.nome, p_celular:f.celular || '', p_ativo:u.ativo, p_diretor:diretor, p_vinculos:vinculos })); await S.carregarBase(); },
      trocouEmail ? `Usuário salvo. ${String(f.nome).split(' ')[0]} agora entra com ${email} (a senha continua a mesma).` : 'Usuário salvo');
  };

  S.views.admin = () => {
    const seg = `<div class="seg">${[['veiculos', 'Veículos'], ['empresa', 'Empresa comercial'], ['usuarios', 'Usuários']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="admAba" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body;
    if (aba === 'veiculos') {
      body = `<div class="card">${S.db.veiculos.length ? `<div class="scroll"><table><thead><tr><th>Rádio</th><th>Sigla do PI</th><th>CNPJ</th><th>Frequência</th><th>Cidade</th><th class="r">PIs emitidos</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${S.db.veiculos.map(v => `<tr class="click" data-act="admVeiculo" data-id="${v.id}"><td><div style="display:flex;align-items:center;gap:12px">${S.vav(v)}<div><b>${esc(v.nome)}</b><div class="muted small">${esc(v.razao_social)}</div></div></div></td><td>${esc(v.sigla)}</td><td>${esc(v.cnpj)}</td><td>${esc(v.frequencia)}</td><td>${esc(v.cidade)}</td><td class="r">${v.pi_seq}</td><td class="r"><span class="row mid" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-act="admPropostas" data-id="${v.id}">${S.svg('propostas')}Propostas e PI</button><button class="btn sm" data-act="admTextosPI" data-id="${v.id}">${S.svg('pis')}Textos do PI</button><button class="btn sm" data-act="admVeiculo" data-id="${v.id}" data-editar="1">${S.svg('editar')}Editar</button></span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Cadastre a primeira rádio</b>Cada veículo tem CNPJ, clientes, PIs e financeiro próprios.</div>'}</div>`;
    } else if (aba === 'empresa') {
      const e = S.db.empresa || {}, curto = String(e.nome || 'Empresa comercial').split('·')[0].trim(), n = S.db.veiculos.length;
      const kv = (k, val) => `<div><small>${k}</small><span>${val ? esc(val) : '<span class="muted">—</span>'}</span></div>`;
      const marcaDe = v => v.pi_marca === 'comercial' ? esc(curto) : esc(v.nome);
      body = `<div class="emp-grid"><section class="card"><div class="hd"><h2>Empresa comercial</h2><span class="pill" style="--tone:var(--gray)">vale para ${n === 1 ? 'a rádio' : `as ${n} rádios`}</span></div>
          <div class="emp-cab"><span class="pr-logo"><img src="${esc(e.logo || 'img/head14.png')}" width="600" height="122" alt="Logo da ${esc(curto)}"></span><p class="muted small">A marca que sai nas propostas e, quando escolhida, nos PIs. Quem fatura continua sendo cada rádio.</p></div>
          <div class="emp-kv">${kv('Nome', e.nome)}${kv('CNPJ', e.cnpj)}${kv('Cidade', e.cidade)}${kv('E-mail', e.email)}${kv('Telefone', e.telefone)}${kv('Site', e.site)}
            ${kv('Assina as propostas', e.assina === 'consultor' ? 'Quem fez a proposta' : [e.responsavel, e.cargo].filter(Boolean).join(' · '))}</div>
          <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn pri" data-act="admEmpresa">${S.svg('editar')}Editar dados</button></div></section>
        <section class="card"><div class="hd"><h2>Propostas e PI por rádio</h2><span>cada rádio tem os seus</span></div>
          <div class="list">${S.db.veiculos.map(v => `<div>${S.vav(v)}<span class="tx"><b>${esc(v.nome)}</b><small>Faixa ${esc(v.prop_faixa || '07h às 19h')} · PI com a marca ${marcaDe(v)} · validade ${v.prop_validade || 15} dias</small></span><button class="btn sm" data-act="admPropostas" data-id="${v.id}" aria-label="Editar propostas e PI da ${esc(v.nome)}">${S.svg('editar')}Editar</button></div>`).join('')}</div></section></div>`;
    } else {
      const us = S.db.usuarios;
      body = S.celular
        ? `<div class="card"><div class="list">${us.map(u => `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome) || '—'}</b><small>${acessoTexto(u)}</small><span style="margin-top:4px">${situacao(u)}</span></span><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></div>`).join('')}</div></div>`
        : `<div class="card"><div class="scroll"><table><thead><tr><th>Usuário</th><th>Situação</th><th>Rádios e perfis</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${us.map(u =>
          `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><div><b>${esc(u.nome) || '—'}</b><div class="muted small">${esc(u.email)}${u.celular ? ' · ' + esc(u.celular) : ''}</div></div></div></td><td>${situacao(u)}</td><td>${acessoTexto(u, '<br>')}</td><td class="r"><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    return { title:'<span class="sub">Grupo</span>Administração', actions:aba === 'empresa' ? '' : aba === 'veiculos' ? `<button class="btn pri" data-act="admVeiculo">${S.svg('mais')}Novo veículo</button>` : `<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`, body:seg + body };
  };

  Object.assign(S.actions, {
    admAba: d => { aba = d.tab; S.render(); },
    admVeiculo: d => { const v = d.id ? S.veh(d.id) : {};
      S.form(v.id ? esc(v.nome) : 'Novo veículo', [
        { html:S.campoLogo(v, !!v.id && !d.editar) },
        { k:'nome', label:'Nome da rádio', req:true, ph:'Ex.: Rádio Verde' }, { k:'sigla', label:'Sigla do PI', req:true, ph:'Ex.: VERDE' },
        { k:'razao_social', label:'Razão social' }, { k:'cnpj', label:'CNPJ' }, { k:'inscricao_estadual', label:'Inscrição estadual' }, { k:'frequencia', label:'Frequência' },
        { k:'rede_afiliada', label:'Rede afiliada' }, { k:'cep', label:'CEP' }, { k:'endereco', label:'Endereço', full:true },
        { k:'cidade', label:'Cidade / UF' }, { k:'telefone', label:'Telefone' }, { k:'email', label:'E-mail', type:'email' }, { k:'dados_bancarios', label:'Dados bancários', type:'textarea' }], v,
        f => S.run(async () => { const row = Object.assign({}, f, { sigla:f.sigla.toUpperCase().trim(), logo:f.logo || null, cor:(f.cor || S.COR_PADRAO).toLowerCase() }); if (v.id) row.id = v.id;
          const novo = await S.salvar('veiculos', row); if (!v.id) { S.ui.vehicleId = novo.id; S.guardarRadio(novo.id); await S.carregarVeiculo(); } }, 'Veículo salvo'), 'Salvar', { editar:!!d.editar }); },
    // Textos que saem no PI impresso desta rádio: papel, cidade, condição de pagamento e condições gerais
    admTextosPI: d => { const v = S.veh(d.id);
      S.form(`Textos do PI · ${esc(v.nome)}`, [
        { k:'pi_papel', label:'Tamanho do papel', type:'select', options:[['legal', 'Ofício (Legal), deitado'], ['a4', 'A4, deitado']] },
        { k:'pi_cidade', label:'Cidade da assinatura e do foro', ph:'Ex.: Cuiabá/MT' },
        { k:'pi_pagamento', label:'Condição de pagamento padrão (sai no quadro de pagamento)', full:true, ph:'Ex.: Faturamento no mês da veiculação, vencimento dia 15 do mês seguinte' },
        { k:'pi_condicoes', label:'Condições gerais (dizeres obrigatórios no rodapé do PI) · uma cláusula por linha; {RADIO} e {CIDADE} viram o nome da rádio e a cidade', type:'textarea' },
        { html:`<div class="row mid" style="grid-column:1/-1;gap:10px"><button type="button" class="btn sm" data-act="admTextoPadrao">Usar o texto padrão do SONVI</button><span class="muted small">Revise cláusulas, prazos e multas com o jurídico da rádio. PIs já exportados não mudam.</span></div>` }],
        Object.assign({}, v, { pi_papel:v.pi_papel || 'legal', pi_cidade:v.pi_cidade || v.cidade || '', pi_condicoes:v.pi_condicoes || S.PI_CONDICOES_PADRAO }),
        f => S.run(async () => { const txt = (f.pi_condicoes || '').trim();
          await S.salvar('veiculos', { id:v.id, pi_papel:f.pi_papel, pi_cidade:(f.pi_cidade || '').trim(), pi_pagamento:(f.pi_pagamento || '').trim(), pi_condicoes:txt === S.PI_CONDICOES_PADRAO.trim() ? '' : txt }); }, 'Textos do PI salvos'), 'Salvar', { editar:true });
      const ta = document.querySelector('#dlg textarea[name=pi_condicoes]'); if (ta) ta.classList.add('alto');
      document.getElementById('dlg').classList.add('largo'); const dl = document.getElementById('dlg'), antes = dl.onclose; dl.onclose = e => { dl.classList.remove('largo'); if (antes) antes(e); }; },
    // Empresa comercial (Head 14): dados e logo que saem nas propostas e nos PIs com a marca dela
    admEmpresa: () => { const e = S.db.empresa || {};
      const logo = `<div class="logo-campo" style="grid-column:1/-1"><div class="emp-prev pr-logo" id="empPrev"><img src="${esc(e.logo || 'img/head14.png')}" width="600" height="122" alt="Logo atual"></div>
        <div class="logo-info"><b>Logo</b><small class="muted">Horizontal, PNG ou JPG com fundo branco ou transparente. Sai nas propostas e nos PIs.</small>
        <div class="row"><button type="button" class="btn sm" data-act="empLogoEscolher">${S.svg('baixar')}Trocar logo</button></div><small class="aviso" id="empAviso"></small></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" id="empLogoArq" hidden><input type="hidden" name="logo" value="${esc(e.logo || '')}"></div>`;
      S.form('Empresa comercial', [{ html:logo },
        { k:'nome', label:'Nome', req:true, full:true, ph:'Ex.: Head 14 · Vendas e Comunicação' }, { k:'razao_social', label:'Razão social' }, { k:'cnpj', label:'CNPJ' },
        { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço' }, { k:'email', label:'E-mail', type:'email' }, { k:'telefone', label:'Telefone' }, { k:'site', label:'Site', ph:'Ex.: head14.com.br' },
        { k:'assina', label:'Assina as propostas', type:'select', options:[['responsavel', 'O responsável abaixo'], ['consultor', 'Quem fez a proposta']] },
        { k:'responsavel', label:'Responsável', ph:'Nome de quem assina' }, { k:'cargo', label:'Cargo', ph:'Ex.: Diretor' },
        { k:'cor', label:'Cor principal (faixas e tabela da proposta)', type:'color' }, { k:'cor2', label:'Cor de destaque', type:'color' }],
        Object.assign({ cor:'#2b5fb5', cor2:'#f1853d', assina:'responsavel' }, e),
        f => S.run(async () => { const row = { nome:f.nome.trim(), razao_social:f.razao_social || '', cnpj:f.cnpj || '', cidade:f.cidade || '', endereco:f.endereco || '', email:f.email || '', telefone:f.telefone || '',
            site:f.site || '', assina:f.assina, responsavel:f.responsavel || '', cargo:f.cargo || '', cor:f.cor || '#2b5fb5', cor2:f.cor2 || '#f1853d', logo:f.logo || null, atualizado_em:new Date().toISOString() };
          S.db.empresa = e.id ? await S.q(S.sb.from('empresa_comercial').update(row).eq('id', e.id).select().single()) : await S.q(S.sb.from('empresa_comercial').insert(row).select().single()); }, 'Empresa comercial salva'), 'Salvar', { editar:true }); },
    empLogoEscolher: () => document.getElementById('empLogoArq').click(),
    // Padrões de proposta e PI de cada rádio
    admPropostas: d => { const v = S.veh(d.id), curto = String((S.db.empresa || {}).nome || 'Empresa comercial').split('·')[0].trim();
      S.form(`Propostas e PI · ${esc(v.nome)}`, [
        { k:'prop_faixa', label:'Faixa comercial padrão', ph:'Ex.: 07h às 19h' },
        { k:'pi_marca', label:'PI sai com a marca de (padrão)', type:'select', options:[['comercial', curto], ['radio', v.nome]] },
        { html:'<p class="muted small" style="grid-column:1/-1;margin-top:-6px">A faixa vai em cada item de rotativo da proposta e sai escrita no PI, para a OPEC lançar no Pulsar. A marca dá para trocar em cada PI.</p>' },
        { k:'prop_validade', label:'Validade padrão da proposta (dias)', type:'number' },
        { k:'prop_condicoes', label:'Condições comerciais padrão · uma por linha; {VALIDADE} vira o número de dias', type:'textarea' }],
        Object.assign({}, v, { prop_faixa:v.prop_faixa || '07h às 19h', pi_marca:v.pi_marca || 'radio', prop_validade:v.prop_validade || 15, prop_condicoes:v.prop_condicoes || S.PROP_CONDICOES_PADRAO }),
        f => { const val = parseInt(f.prop_validade);
          if (!(val >= 1 && val <= 365)) { S.actions.admPropostas(d); return S.erroNoCampo('prop_validade', 'Use de 1 a 365 dias.'); }
          S.run(async () => { const txt = (f.prop_condicoes || '').trim();
            await S.salvar('veiculos', { id:v.id, prop_faixa:(f.prop_faixa || '').trim() || '07h às 19h', pi_marca:f.pi_marca, prop_validade:val, prop_condicoes:txt === S.PROP_CONDICOES_PADRAO.trim() ? '' : txt }); }, 'Padrões de proposta salvos'); }, 'Salvar', { editar:true });
      const n = document.querySelector('#dlg [name=prop_validade]'); if (n) { n.min = 1; n.max = 365; } },
    admTextoPadrao: () => { const ta = document.querySelector('#dlg textarea[name=pi_condicoes]'); if (ta) ta.value = S.PI_CONDICOES_PADRAO; },
    admUsuario: d => formUsuario(d.id ? S.db.usuarios.find(x => x.id === d.id) : {}, false),
    admUsuarioMenu: (d, botao) => { const u = S.db.usuarios.find(x => x.id === d.id), eu = u.id === S.me.id;
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'admUsuarioEditar', data:{ id:u.id } },
        { label:eu ? 'Gerar link para trocar a senha' : 'Gerar link de acesso', icon:'whats', act:'admLink', data:{ id:u.id } },
        ...(eu ? [] : ['-', u.ativo ? { label:'Desativar acesso', icon:'bloqueio', act:'admAtivo', data:{ id:u.id } } : { label:'Reativar acesso', icon:'check', act:'admAtivo', data:{ id:u.id } },
          { label:'Excluir usuário', icon:'lixo', act:'admExcluir', data:{ id:u.id }, perigo:true }])]); },
    admExcluir: async d => { const u = S.db.usuarios.find(x => x.id === d.id);
      if (!await S.confirmar(`Excluir ${u.nome || u.email} de vez? Não dá para desfazer.\n\nSe a pessoa já trabalhou no sistema (PIs, clientes ou agenda), o SONVI não deixa excluir: use "Desativar acesso".`, { ok:'Excluir usuário', perigo:true })) return;
      S.run(async () => { await servidor({ acao:'excluir', usuario_id:u.id }); await S.carregarBase(); }, 'Usuário excluído'); },
    admUsuarioEditar: d => formUsuario(S.db.usuarios.find(x => x.id === d.id), true),
    admLink: d => { const u = S.db.usuarios.find(x => x.id === d.id); S.run(async () => { const r = await servidor({ acao:'link', usuario_id:u.id }); mostrarLink(u, r.link, false); }); },
    admAtivo: async d => { const u = S.db.usuarios.find(x => x.id === d.id), ativo = !u.ativo;
      if (!ativo && !await S.confirmar(`Desativar o acesso de ${u.nome || u.email}? A pessoa não consegue mais entrar; o histórico dela continua no sistema.`, { ok:'Desativar acesso', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:u.nome || u.email, p_celular:u.celular || '', p_ativo:ativo, p_diretor:u.diretor, p_vinculos:vinculosDe(u).map(x => ({ veiculo_id:x.veiculo_id, perfil:x.perfil })) })); await S.carregarBase(); }, ativo ? 'Acesso reativado' : 'Acesso desativado'); },
    admCopiar: d => { navigator.clipboard.writeText(d.link).then(() => S.toast('Link copiado'), () => S.toast('Não foi possível copiar; selecione o link e copie.')); },
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'empLogoArq' || !e.target.files[0]) return;
    const arq = e.target.files[0], aviso = document.getElementById('empAviso');
    if (!/^image\/(png|jpe?g|webp)$/.test(arq.type)) { aviso.textContent = 'Use uma imagem PNG, JPG ou WebP.'; return; }
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const k = Math.min(1, 900 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let u = c.toDataURL('image/webp', .92); if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/png');
      const f = document.querySelector('#dlg form'); f.logo.value = u; document.getElementById('empPrev').innerHTML = `<img src="${u}" width="${c.width}" height="${c.height}" alt="Logo novo">`;
      aviso.textContent = img.naturalWidth < 400 ? 'A imagem é pequena: pode sair borrada no PDF. O ideal é ter 600 px de largura ou mais.' : ''; document.getElementById('dlg').dataset.sujo = '1'; };
    img.onerror = () => { URL.revokeObjectURL(url); aviso.textContent = 'Não foi possível abrir essa imagem.'; };
    img.src = url;
  });
  // Diretor esconde a lista de rádios (vê todas)
  document.addEventListener('change', e => { if (!e.target.dataset.funcao) return; const a = e.target.closest('form').querySelector('.acessos'); if (a) a.hidden = e.target.value === 'diretor'; });
})();

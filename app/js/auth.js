// SONVI · acesso: entrar, criar a senha pelo link de acesso e as telas de quem ainda não foi liberado.
// Contas novas são criadas pelo diretor ou gerente (Usuários), com senha provisória enviada pelo WhatsApp.
// Quem entra com a senha provisória (usuarios.trocar_senha) ou pelo link do "Esqueci minha senha" cria a própria senha antes de usar o sistema.
(() => {
  const { esc } = S;

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  // Moldura das telas de acesso: painel azul da marca à esquerda (some no celular) e o conteúdo à direita
  // Sonvi Music: tela escura com a marca do Sonvi Music
  const molduraMusic = miolo => `<div class="acesso music"><div class="lado"><img class="marca" src="img/sonvi-music-branco.png" width="1074" height="300" alt="Sonvi Music">
    <div><h2>A programação da rádio, do acervo ao ar.</h2><p>Para programadores e locutores. Os comerciais vendidos chegam prontos da OPEC do SONVI.</p></div>
    <div class="eq" style="--tone:#0199ff" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div>
    <div class="forma">${miolo}</div></div>`;
  const moldura_ = miolo => `<div class="acesso"><div class="lado"><img class="marca" src="img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><img class="simbolo" src="img/simbolo-branco.svg" width="66" height="78" alt="">
    <div><h2>Do primeiro contato ao comercial no ar.</h2><p>Comercial, PI, OPEC, programação e financeiro da sua rádio em um só lugar.</p></div>
    <div class="eq" style="--tone:#fff;opacity:.6" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div>
    <div class="forma">${miolo}</div></div>`;

  const moldura = miolo => S.APP === 'music' ? molduraMusic(miolo) : moldura_(miolo);

  // Marca da empresa (cliente do SONVI) na tela de entrada: logo, ou o nome quando não tem logo
  const marcaOrg = () => S.orgPub ? (S.orgPub.logo ? `<img class="org-logo" src="${esc(S.orgPub.logo)}" width="600" height="122" alt="${esc(S.orgPub.nome)}">` : `<p class="org-nome">${esc(S.orgPub.nome)}</p>`) : '';
  const MINUTOS = [[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [480, '8 horas']];

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  S.telaDeAcesso = () => {
    if (S.ORG && S.orgPub === false) return moldura(`<div class="auth">${S.logo('logo')}<h1>Endereço não encontrado</h1><p class="muted">Não existe nenhuma empresa no SONVI com o endereço <b>sonvi.com.br/${esc(S.ORG)}</b>. Confira o endereço que você recebeu.</p><a class="btn" href="https://sonvi.com.br/">Conhecer o SONVI</a></div>`);
    if (!S.me && S.orgPub && S.orgPub.situacao === 'suspenso') return moldura(`<div class="auth">${marcaOrg()}<h1>Acesso suspenso</h1><p class="muted">O acesso da ${esc(S.orgPub.nome)} ao SONVI está suspenso no momento. Fale com a direção da empresa.</p></div>`);
    if (!S.me && S.esqueci) return moldura(S.esqueci === 'enviado'
      ? `<div class="auth">${S.logo('logo')}<h1>Confira o seu e-mail</h1><p class="muted">Se o e-mail estiver cadastrado, você vai receber em instantes um link para criar uma senha nova. O link vale por 1 hora.</p><p class="muted small">Não chegou? Olhe a caixa de spam ou peça ao diretor ou ao gerente uma senha provisória.</p><button class="btn" data-act="authVoltar">Voltar para entrar</button></div>`
      : `<form class="auth" data-form="esqueci">${S.logo('logo')}<h1>Esqueci minha senha</h1><p class="muted">Digite o e-mail do seu cadastro. Enviamos um link para você criar uma senha nova.</p>
        <label class="f">E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com.br"></label>
        <button class="btn pri">Enviar o link</button><button type="button" class="btn" data-act="authVoltar">Voltar para entrar</button></form>`);
    if (!S.me) return moldura(`<form class="auth" data-form="auth">${S.logo('logo')}${marcaOrg()}<h1>Entrar</h1><p class="muted">${S.orgPub ? `Equipe da ${esc(S.orgPub.nome)}. ` : ''}${S.APP === 'music' ? 'Acesso exclusivo de programadores e locutores das rádios.' : S.orgPub ? 'Use o e-mail e a senha do seu cadastro.' : 'Bem-vindo de volta. Use o e-mail e a senha do seu cadastro.'}</p>
        <label class="f">E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com.br"></label>
        <label class="f">Senha<input name="senha" type="password" required minlength="6" autocomplete="current-password" placeholder="Sua senha"></label>
        <button class="btn pri">Entrar</button>
        <p class="muted small"><a href="#" data-act="authEsqueci">Esqueci minha senha</a> · Ainda não tem acesso? Peça ao diretor ou ao gerente da rádio.</p></form>`);
    // Entrou com a senha provisória ou pelo link do "Esqueci minha senha": cria a própria senha antes de usar o sistema
    if (S.me.ativo && (S.definirSenha || S.me.trocar_senha)) return moldura(`<form class="auth" data-form="senha">${S.logo('logo')}<h1>Crie a sua senha</h1><p class="muted">Olá, ${esc((S.me.nome || '').split(' ')[0] || S.me.email)}! ${S.me.trocar_senha && !S.definirSenha ? 'Você entrou com uma senha provisória. ' : ''}Escolha a senha que você vai usar para entrar no ${S.APP === 'music' ? 'Sonvi Music' : 'SONVI'} com o e-mail <b>${esc(S.me.email)}</b>.</p>
        <label class="f">Nova senha<input name="senha" type="password" required minlength="8" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></label>
        <label class="f">Repita a senha<input name="senha2" type="password" required minlength="8" autocomplete="new-password" placeholder="Digite de novo"></label>
        <p class="muted small" style="margin-top:-6px">Use pelo menos 8 caracteres, com letras e números.</p>
        <button class="btn pri">Salvar senha e entrar</button></form>`);
    const sair = '<button class="btn" data-act="sair">Sair</button>';
    // Equipe SONVI: para ver os dados de um cliente, entra como suporte (fica registrado e o diretor do cliente vê)
    if (S.bloqueio === 'suporte') {
      const orgs = S.orgsSuporte || [], esta = orgs.find(o => o.slug === S.ORG);
      return moldura(`<form class="auth" data-form="suporte" novalidate>${S.logo('logo')}<h1>${esta ? `Entrar na ${esc(esta.nome)} como suporte` : 'Entrar como suporte'}</h1>
        <p class="muted">Você é da equipe SONVI e não faz parte da equipe de nenhum cliente. Para ver os dados de um cliente, entre como suporte: o motivo fica registrado e o diretor do cliente vê.</p>
        ${esta ? `<input type="hidden" name="slug" value="${esc(esta.slug)}">` : `<label class="f">Cliente<select name="slug" required><option value="">Escolha o cliente</option>${orgs.map(o => `<option value="${esc(o.slug)}">${esc(o.nome)}${o.situacao === 'suspenso' ? ' (suspenso)' : ''}</option>`).join('')}</select></label>`}
        <label class="f">Motivo<textarea name="motivo" rows="2" required placeholder="Ex.: conferir o PI CBN 0011 a pedido do diretor"></textarea></label>
        <label class="f">Duração<select name="minutos">${MINUTOS.map(([m, n]) => `<option value="${m}"${m === 30 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <p class="muted small" style="margin-top:-6px">Lá dentro aparece a faixa "Suporte SONVI" com a hora em que o acesso termina. O que você fizer fica no histórico como "Suporte SONVI".</p>
        <button class="btn pri">Entrar como suporte</button>${sair}</form>`);
    }
    if (S.bloqueio === 'suspenso') return moldura(`<div class="auth">${marcaOrg()}<h1>Acesso suspenso</h1><p class="muted">O acesso da ${esc(S.ctx.org.nome)} ao SONVI está suspenso no momento. Fale com a direção da empresa.</p>${sair}</div>`);
    if (!S.me.ativo) return moldura(`<div class="auth">${S.logo('logo')}<h1>Acesso desativado</h1><p class="muted">Fale com a direção para reativar o seu usuário.</p>${sair}</div>`);
    if (S.APP === 'music' && !S.me.diretor && !S.db.veiculos.length) return moldura(`<div class="auth">${S.logo('logo')}<h1>Sem acesso ao Sonvi Music</h1><p class="muted">Olá, ${esc((S.me.nome || S.me.email).split(' ')[0])}. O Sonvi Music é para programadores e locutores. Se você também trabalha com a programação, peça ao diretor para liberar o seu perfil.</p><a class="btn pri" href="./">Ir para o SONVI</a>${sair}</div>`);
    if (!S.db.veiculos.length && !S.me.diretor) return moldura(`<div class="auth">${S.logo('logo')}<h1>Olá, ${esc(S.me.nome || S.me.email)}</h1><p class="muted">Seu acesso ainda não tem nenhuma rádio. Peça ao diretor para escolher a sua rádio e o seu perfil.</p><button class="btn pri" data-act="authRecarregar">Verificar novamente</button>${sair}</div>`);
    return null;
  };

  Object.assign(S.actions, {
    authRecarregar: () => S.iniciar(),
    authEsqueci: () => { S.esqueci = 'pedir'; S.render(); const i = document.querySelector('[data-form=esqueci] input'); if (i) i.focus(); },
    authVoltar: () => { S.esqueci = null; S.render(); },
    encerrarSuporte: async () => { await S.run(async () => { await S.q(S.sb.rpc('encerrar_suporte')); }, 'Acesso de suporte encerrado'); S.ui.vehicleId = null; location.hash = ''; S.iniciar(); },
    contaMenu: (d, el) => S.menu(el, [{ label:'Trocar minha senha', icon:'chave', act:'trocarMinhaSenha' }, '-', { label:'Sair', icon:'voltar', act:'sair' }]),
    trocarMinhaSenha: () => S.trocarMinhaSenha(),
    sair: async () => { if (S.ctx && S.ctx.suporte) { try { await S.sb.rpc('encerrar_suporte'); } catch (e) { /* termina sozinho no horário */ } }
      await S.sb.auth.signOut(); S.me = null; S.ctx = null; S.bloqueio = null; S.db = {}; S.ui.vehicleId = null; location.hash = ''; S.render(); }
  });

  // Função "usuarios" do servidor (troca da própria senha e "Esqueci minha senha", que funciona sem login)
  S.contaServidor = async corpo => {
    const { data, error } = await S.sb.functions.invoke('usuarios', { body:Object.assign({ destino:location.origin + location.pathname }, corpo) });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  };
  // Trocar a própria senha (menu da conta, no rodapé da barra lateral)
  S.trocarMinhaSenha = () => S.form('Trocar minha senha', [
      { k:'senha', label:'Nova senha', type:'password', req:true, ph:'Mínimo de 8 caracteres, com letras e números' },
      { k:'senha2', label:'Repita a nova senha', type:'password', req:true, ph:'Digite de novo' }], {},
    f => { if (f.senha !== f.senha2) { S.trocarMinhaSenha(); return S.erroNoCampo('senha2', 'As duas senhas não são iguais.'); }
      if (!(f.senha.length >= 8 && /[A-Za-z]/.test(f.senha) && /\d/.test(f.senha))) { S.trocarMinhaSenha(); return S.erroNoCampo('senha', 'Use pelo menos 8 caracteres, com letras e números.'); }
      S.run(async () => { await S.contaServidor({ acao:'minha_senha', senha:f.senha }); }, 'Senha trocada'); }, 'Salvar senha', { editar:true });

  document.addEventListener('submit', async e => {
    const tipo = e.target.dataset.form;
    if (tipo !== 'auth' && tipo !== 'senha' && tipo !== 'esqueci' && tipo !== 'suporte') return;
    e.preventDefault();
    if (tipo === 'suporte') {
      const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button.pri');
      if (!f.slug) return S.erroNoCampo(e.target.querySelector('[name=slug]'), 'Escolha o cliente.');
      if (!String(f.motivo || '').trim()) return S.erroNoCampo(e.target.querySelector('[name=motivo]'), 'Escreva o motivo do acesso.');
      btn.disabled = true;
      try { await S.q(S.sb.rpc('iniciar_suporte', { p_slug:f.slug, p_motivo:f.motivo, p_minutos:Number(f.minutos) || 30 })); S.ui.vehicleId = null; await S.iniciar(); }
      catch (err) { S.toast(S.erro(err)); btn.disabled = false; }
      return;
    }
    const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button');
    if (tipo === 'senha' && f.senha !== f.senha2) return S.toast('As duas senhas não são iguais.');
    if (tipo === 'senha' && !(f.senha.length >= 8 && /[A-Za-z]/.test(f.senha) && /\d/.test(f.senha))) return S.toast('Use pelo menos 8 caracteres, com letras e números.');
    btn.disabled = true;
    try {
      if (tipo === 'esqueci') { await S.contaServidor({ acao:'esqueci', email:f.email }); S.esqueci = 'enviado'; return S.render(); }
      if (tipo === 'senha') {
        await S.contaServidor({ acao:'minha_senha', senha:f.senha });
        S.definirSenha = false; S.me.trocar_senha = false; S.toast(`Senha criada. Bem-vindo ao ${S.APP === 'music' ? 'Sonvi Music' : 'SONVI'}!`);
      } else {
        const { error } = await S.sb.auth.signInWithPassword({ email:f.email, password:f.senha });
        if (error) throw error;
      }
      await S.iniciar();
    } catch (err) { S.toast(S.erro(err)); btn.disabled = false; }
  });
})();

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

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  S.telaDeAcesso = () => {
    if (!S.me && S.esqueci) return moldura(S.esqueci === 'enviado'
      ? `<div class="auth">${S.logo('logo')}<h1>Confira o seu e-mail</h1><p class="muted">Se o e-mail estiver cadastrado, você vai receber em instantes um link para criar uma senha nova. O link vale por 1 hora.</p><p class="muted small">Não chegou? Olhe a caixa de spam ou peça ao diretor ou ao gerente uma senha provisória.</p><button class="btn" data-act="authVoltar">Voltar para entrar</button></div>`
      : `<form class="auth" data-form="esqueci">${S.logo('logo')}<h1>Esqueci minha senha</h1><p class="muted">Digite o e-mail do seu cadastro. Enviamos um link para você criar uma senha nova.</p>
        <label class="f">E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com.br"></label>
        <button class="btn pri">Enviar o link</button><button type="button" class="btn" data-act="authVoltar">Voltar para entrar</button></form>`);
    if (!S.me) return moldura(`<form class="auth" data-form="auth">${S.logo('logo')}<h1>Entrar</h1><p class="muted">${S.APP === 'music' ? 'Acesso exclusivo de programadores e locutores das rádios.' : 'Bem-vindo de volta. Use o e-mail e a senha do seu cadastro.'}</p>
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
    if (!S.me.ativo) return moldura(`<div class="auth">${S.logo('logo')}<h1>Acesso desativado</h1><p class="muted">Fale com a direção para reativar o seu usuário.</p>${sair}</div>`);
    if (S.APP === 'music' && !S.me.diretor && !S.db.veiculos.length) return moldura(`<div class="auth">${S.logo('logo')}<h1>Sem acesso ao Sonvi Music</h1><p class="muted">Olá, ${esc((S.me.nome || S.me.email).split(' ')[0])}. O Sonvi Music é para programadores e locutores. Se você também trabalha com a programação, peça ao diretor para liberar o seu perfil.</p><a class="btn pri" href="./">Ir para o SONVI</a>${sair}</div>`);
    if (!S.db.veiculos.length && !S.me.diretor) return moldura(`<div class="auth">${S.logo('logo')}<h1>Olá, ${esc(S.me.nome || S.me.email)}</h1><p class="muted">Seu acesso ainda não tem nenhuma rádio. Peça ao diretor para escolher a sua rádio e o seu perfil.</p><button class="btn pri" data-act="authRecarregar">Verificar novamente</button>${sair}</div>`);
    return null;
  };

  Object.assign(S.actions, {
    authRecarregar: () => S.iniciar(),
    authEsqueci: () => { S.esqueci = 'pedir'; S.render(); const i = document.querySelector('[data-form=esqueci] input'); if (i) i.focus(); },
    authVoltar: () => { S.esqueci = null; S.render(); },
    contaMenu: (d, el) => S.menu(el, [{ label:'Trocar minha senha', icon:'chave', act:'trocarMinhaSenha' }, '-', { label:'Sair', icon:'voltar', act:'sair' }]),
    trocarMinhaSenha: () => S.trocarMinhaSenha(),
    sair: async () => { await S.sb.auth.signOut(); S.me = null; S.db = {}; S.ui.vehicleId = null; location.hash = ''; S.render(); }
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
    if (tipo !== 'auth' && tipo !== 'senha' && tipo !== 'esqueci') return;
    e.preventDefault();
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

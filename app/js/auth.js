// SONVI · acesso: entrar, criar conta e as telas de quem ainda não foi liberado.
(() => {
  const { esc } = S;
  let modo = 'entrar';

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  // Moldura das telas de acesso: painel azul da marca à esquerda (some no celular) e o conteúdo à direita
  const moldura = miolo => `<div class="acesso"><div class="lado"><img class="marca" src="img/sonvi-branco.svg" alt="SONVI"><img class="simbolo" src="img/simbolo-branco.svg" alt="">
    <div><h2>Do primeiro contato ao comercial no ar.</h2><p>Comercial, PI, OPEC, programação e financeiro da sua rádio em um só lugar.</p></div>
    <div class="eq" style="--tone:#fff;opacity:.6" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div>
    <div class="forma">${miolo}</div></div>`;

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  S.telaDeAcesso = () => {
    if (!S.me) {
      const criar = modo === 'criar';
      return moldura(`<form class="auth" data-form="auth">${S.logo('logo')}<h1>${criar ? 'Criar acesso' : 'Entrar'}</h1><p class="muted">${criar ? 'Crie o seu acesso. A direção libera a sua rádio em seguida.' : 'Bem-vindo de volta. Use o e-mail e a senha do seu cadastro.'}</p>
        ${criar ? '<label class="f">Nome<input name="nome" required autocomplete="name"></label>' : ''}
        <label class="f">E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label class="f">Senha<input name="senha" type="password" required minlength="${criar ? 8 : 6}" autocomplete="${criar ? 'new-password' : 'current-password'}"></label>
        ${criar ? '<p class="muted small" style="margin-top:-6px">Mínimo de 8 caracteres, com letras e números.</p>' : ''}
        <button class="btn pri">${criar ? 'Criar conta' : 'Entrar'}</button>
        <a data-act="authModo">${criar ? 'Já tenho conta' : 'Criar conta'}</a></form>`);
    }
    const sair = '<button class="btn" data-act="sair">Sair</button>';
    if (!S.me.ativo) return moldura(`<div class="auth">${S.logo('logo')}<h1>Acesso desativado</h1><p class="muted">Fale com a direção para reativar o seu usuário.</p>${sair}</div>`);
    if (!S.db.veiculos.length && !S.me.diretor) return moldura(`<div class="auth">${S.logo('logo')}<h1>Olá, ${esc(S.me.nome || S.me.email)}</h1><p class="muted">Sua conta foi criada. Assim que a direção vincular você a uma rádio, o sistema abre aqui.</p><button class="btn pri" data-act="authRecarregar">Verificar novamente</button>${sair}</div>`);
    return null;
  };

  Object.assign(S.actions, {
    authModo: () => { modo = modo === 'criar' ? 'entrar' : 'criar'; S.render(); },
    authRecarregar: () => S.iniciar(),
    sair: async () => { await S.sb.auth.signOut(); S.me = null; S.db = {}; location.hash = ''; S.render(); }
  });

  document.addEventListener('submit', async e => {
    if (e.target.dataset.form !== 'auth') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      if (modo === 'criar') {
        const { data, error } = await S.sb.auth.signUp({ email:f.email, password:f.senha, options:{ data:{ nome:f.nome } } });
        if (error) throw error;
        if (!data.session) { modo = 'entrar'; S.render(); return S.toast('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.'); }
      } else {
        const { error } = await S.sb.auth.signInWithPassword({ email:f.email, password:f.senha });
        if (error) throw error;
      }
      await S.iniciar();
    } catch (err) { S.toast(S.erro(err)); btn.disabled = false; }
  });
})();

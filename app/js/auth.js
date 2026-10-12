// SONVI · acesso: entrar, criar conta e as telas de quem ainda não foi liberado.
(() => {
  const { esc } = S;
  let modo = 'entrar';

  // Devolve o HTML da tela de acesso, ou null quando o usuário pode usar o app
  S.telaDeAcesso = () => {
    if (!S.me) {
      const criar = modo === 'criar';
      return `<form class="auth card" data-form="auth"><div class="brand">SONVI</div><p class="muted">${criar ? 'Crie o seu acesso. A direção libera a sua rádio em seguida.' : 'Gestão comercial e de programação para rádios.'}</p>
        ${criar ? '<label class="f">Nome<input name="nome" required autocomplete="name"></label>' : ''}
        <label class="f">E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label class="f">Senha<input name="senha" type="password" required minlength="6" autocomplete="${criar ? 'new-password' : 'current-password'}"></label>
        <button class="btn pri">${criar ? 'Criar conta' : 'Entrar'}</button>
        <a data-act="authModo">${criar ? 'Já tenho conta' : 'Criar conta'}</a></form>`;
    }
    const sair = '<button class="btn" data-act="sair">Sair</button>';
    if (!S.me.ativo) return `<div class="auth card"><div class="brand">SONVI</div><b>Acesso desativado</b><p class="muted">Fale com a direção para reativar o seu usuário.</p>${sair}</div>`;
    if (!S.db.veiculos.length && !S.me.diretor) return `<div class="auth card"><div class="brand">SONVI</div><b>Olá, ${esc(S.me.nome || S.me.email)}</b><p class="muted">Sua conta foi criada. Assim que a direção vincular você a uma rádio, o sistema abre aqui.</p><button class="btn pri" data-act="authRecarregar">Verificar novamente</button>${sair}</div>`;
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

// SONVI · dados: toda conversa com a nuvem (Supabase) passa por aqui.
(() => {
  // Link de acesso (convite ou nova senha) chega com os dados no endereço; guardamos o tipo antes do Supabase ler e limpar
  const h = location.hash;
  S.definirSenha = /type=(invite|recovery)/.test(h);
  S.erroLink = /error_code=/.test(h) ? (/expired/.test(h) ? 'Este link de acesso expirou. Peça um novo ao diretor.' : 'Este link de acesso não vale mais. Peça um novo ao diretor.') : '';
  S.sb = supabase.createClient(window.SONVI_CONFIG.url, window.SONVI_CONFIG.key);
  S.limparEndereco = () => { if (/access_token|error_code|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/painel'); };

  const q = S.q = async promise => { const { data, error } = await promise; if (error) throw error; return data; };

  // Mensagens do banco em linguagem de gente
  S.erro = e => {
    const m = (e && e.message) || String(e);
    if (e && e.code === '23505') return 'Este CPF/CNPJ já está cadastrado neste veículo.';
    if (e && e.code === '23503') return 'Não é possível excluir: existem registros ligados a este cadastro.';
    if (e && (e.code === '42501' || /row-level security/i.test(m))) return 'Seu perfil não tem permissão para esta ação.';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (/already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar".';
    if (/Password should be|weak/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a nuvem. Verifique a internet e tente de novo.';
    return m;
  };

  // Executa uma ação na nuvem, avisa o resultado e redesenha a tela
  S.run = async (fn, ok) => {
    try { const r = await fn(); if (ok) S.toast(ok); S.render(); return r === undefined ? true : r; }
    catch (e) { console.error(e); S.toast(S.erro(e)); S.render(); return null; }
  };

  // Grava (cria ou altera) uma linha e mantém a cópia em memória igual à nuvem
  S.salvar = async (tabela, row) => {
    const { id, ...campos } = row;
    const r = id ? await q(S.sb.from(tabela).update(campos).eq('id', id).select().single()) : await q(S.sb.from(tabela).insert(campos).select().single());
    const list = S.db[tabela], i = list.findIndex(x => x.id === r.id);
    if (i >= 0) list[i] = r; else list.push(r);
    return r;
  };
  S.excluir = async (tabela, id) => { await q(S.sb.from(tabela).delete().eq('id', id)); S.db[tabela] = S.db[tabela].filter(x => x.id !== id); };

  // Quem está logado, seus veículos e colegas
  S.carregarBase = async () => {
    const { data:{ session } } = await S.sb.auth.getSession();
    S.limparEndereco();
    if (S.erroLink) { S.toast(S.erroLink); S.erroLink = ''; }
    if (!session) { S.me = null; return; }
    const [me, veiculos, vinculos, usuarios] = await Promise.all([
      q(S.sb.from('usuarios').select('*').eq('id', session.user.id).maybeSingle()),
      q(S.sb.from('veiculos').select('*').order('nome')),
      q(S.sb.from('usuario_veiculos').select('*')),
      q(S.sb.from('usuarios').select('*').order('nome'))]);
    S.me = me || { id:session.user.id, nome:'', email:session.user.email, ativo:true, diretor:false };
    Object.assign(S.db, { veiculos, vinculos, usuarios });
    if (!veiculos.some(v => v.id === S.ui.vehicleId)) S.ui.vehicleId = veiculos.length ? veiculos[0].id : null;
  };

  // Tudo o que pertence ao veículo selecionado. O banco só devolve o que o perfil pode ver.
  S.carregarVeiculo = async () => {
    const v = S.ui.vehicleId;
    Object.assign(S.db, { pessoas:[], produtos:[], precos:[], pis:[], agenda:[], lancamentos:[], hist:{}, midias:{} });
    if (!v) { S.perfil = S.me && S.me.diretor ? 'diretor' : null; return; }
    S.perfil = S.me.diretor ? 'diretor' : (S.db.vinculos.find(x => x.usuario_id === S.me.id && x.veiculo_id === v) || {}).perfil || null;
    const de = t => q(S.sb.from(t).select('*').eq('veiculo_id', v));
    const [pessoas, produtos, precos, pis, agenda, lancamentos] = await Promise.all([de('pessoas'), de('produtos'), de('precos'), de('pis'), de('agenda'), de('lancamentos')]);
    Object.assign(S.db, { pessoas, produtos, precos, pis:pis.map(S.piNorm), agenda, lancamentos });
  };

  S.recarregar = async () => { await S.carregarBase(); if (S.me) await S.carregarVeiculo(); };
})();

// SONVI · dados: toda conversa com a nuvem (Supabase) passa por aqui.
(() => {
  // Link de acesso (convite ou nova senha) chega com os dados no endereço; guardamos o tipo antes do Supabase ler e limpar
  const h = location.hash;
  S.definirSenha = /type=(invite|recovery)/.test(h);
  S.erroLink = /error_code=/.test(h) ? (/expired/.test(h) ? 'Este link de acesso expirou. Peça um novo ao diretor.' : 'Este link de acesso não vale mais. Peça um novo ao diretor.') : '';
  // O Sonvi Music guarda a sessão à parte: entrar no SONVI não entra no Sonvi Music, e vice-versa (como serão em endereços separados)
  S.sb = supabase.createClient(window.SONVI_CONFIG.url, window.SONVI_CONFIG.key, S.APP === 'music' ? { auth:{ storageKey:'sonvi-music-auth' } } : undefined);
  S.limparEndereco = () => { if (/access_token|error_code|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/painel'); };

  // Lembra só qual rádio estava aberta (preferência de tela, não é dado do sistema), por usuário
  const chaveRadio = () => 'sonvi-radio-' + ((S.me && S.me.id) || '');
  S.radioGuardada = () => { try { return localStorage.getItem(chaveRadio()) || null; } catch (e) { return null; } };
  S.guardarRadio = id => { try { if (id) localStorage.setItem(chaveRadio(), id); } catch (e) { /* navegador sem armazenamento */ } };

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
    const [me, veiculos, vinculos, usuarios, empresa] = await Promise.all([
      q(S.sb.from('usuarios').select('*').eq('id', session.user.id).maybeSingle()),
      q(S.sb.from('veiculos').select('*').order('nome')),
      q(S.sb.from('usuario_veiculos').select('*')),
      q(S.sb.from('usuarios').select('*').order('nome')),
      // Empresa comercial do grupo (Head 14): a marca das propostas e, quando escolhida, dos PIs
      S.APP === 'music' ? Promise.resolve([]) : q(S.sb.from('empresa_comercial').select('*').limit(1))]);
    S.me = me || { id:session.user.id, nome:'', email:session.user.email, ativo:true, diretor:false };
    Object.assign(S.db, { veiculos, vinculos, usuarios, empresa:empresa[0] || null });
    // No Sonvi Music aparecem só as rádios em que a pessoa trabalha com a programação
    if (S.APP === 'music' && !S.me.diretor) S.db.veiculos = veiculos.filter(v => vinculos.some(x => x.usuario_id === S.me.id && x.veiculo_id === v.id && S.MUSIC_PERFIS.includes(x.perfil)));
    // Volta para a rádio que estava aberta (guardada neste navegador); se ela não existir mais, abre a primeira
    if (!S.ui.vehicleId) S.ui.vehicleId = S.radioGuardada();
    if (!S.db.veiculos.some(v => v.id === S.ui.vehicleId)) S.ui.vehicleId = S.db.veiculos.length ? S.db.veiculos[0].id : null;
    S.guardarRadio(S.ui.vehicleId);
  };

  // Tudo o que pertence ao veículo selecionado. O banco só devolve o que o perfil pode ver.
  S.carregarVeiculo = async () => {
    const v = S.ui.vehicleId;
    Object.assign(S.db, { pessoas:[], produtos:[], precos:[], tabelas:[], pis:[], agenda:[], lancamentos:[], propostas:[], hist:{}, midias:{}, musVeiculo:null, musSemana:null });
    if (!v) { S.perfil = S.me && S.me.diretor ? 'diretor' : null; return; }
    S.perfil = S.me.diretor ? 'diretor' : (S.db.vinculos.find(x => x.usuario_id === S.me.id && x.veiculo_id === v) || {}).perfil || null;
    const de = t => q(S.sb.from(t).select('*').eq('veiculo_id', v));
    const [pessoas, produtos, precos, tabelas, pis, agenda, lancamentos, propostas] = await Promise.all([de('pessoas'), de('produtos'), de('precos'), de('tabelas_preco'), de('pis'), de('agenda'), de('lancamentos'),
      S.APP === 'music' ? Promise.resolve([]) : de('propostas')]);
    Object.assign(S.db, { pessoas, produtos, precos, tabelas, pis:pis.map(S.piNorm), agenda, lancamentos, propostas });
  };

  // Tabelas de preço e seus preços (depois de criar, salvar ou publicar uma tabela)
  S.recarregarTabelas = async () => { const v = S.ui.vehicleId;
    const [tabelas, precos] = await Promise.all([q(S.sb.from('tabelas_preco').select('*').eq('veiculo_id', v)), q(S.sb.from('precos').select('*').eq('veiculo_id', v))]);
    Object.assign(S.db, { tabelas, precos }); };

  // Programação musical: carrega só quando a pessoa abre o módulo (acervo, categorias, formatos, regras e a semana escolhida).
  // A semana vem com o dia anterior junto, para as regras que olham "ontem".
  const todos = async (tabela, v) => { const out = [];
    for (let i = 0; ; i += 1000) { const parte = await q(S.sb.from(tabela).select('*').eq('veiculo_id', v).order('id').range(i, i + 999)); out.push(...parte); if (parte.length < 1000) return out; } };
  S.carregarMusical = async (tudo) => {
    const v = S.ui.vehicleId; if (!v) return;
    if (tudo || S.db.musVeiculo !== v) {
      const [mus_categorias, mus_subcategorias, mus_grupos, mus_vinhetas, musicas, mus_formatos, cfg] = await Promise.all(
        ['mus_categorias', 'mus_subcategorias', 'mus_grupos', 'mus_vinhetas', 'musicas', 'mus_formatos'].map(t => todos(t, v))
          .concat(q(S.sb.from('mus_config').select('*').eq('veiculo_id', v).maybeSingle())));
      Object.assign(S.db, { mus_categorias, mus_subcategorias, mus_grupos, mus_vinhetas, musicas, mus_formatos, mus_config:cfg ? [cfg] : [], musVeiculo:v, musSemana:null });
    }
    const sem = S.ui.musSemana, ini = S.mus.somaDias(sem, -1), fim = S.mus.somaDias(sem, 6);
    S.db.mus_programacao = await q(S.sb.from('mus_programacao').select('*').eq('veiculo_id', v).gte('data', ini).lte('data', fim));
    S.db.musSemana = v + '|' + sem;
  };

  S.recarregar = async () => { await S.carregarBase(); if (S.me) await S.carregarVeiculo(); };
})();

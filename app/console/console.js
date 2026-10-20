// SONVI · Console (console.sonvi.com.br): o painel da equipe SONVI para cuidar dos clientes.
// Clientes (lista e cadastro completo), novo cliente com endereço próprio, suspender e reativar,
// diretor (nova senha provisória, adicionar outro diretor), rádios e acessos de suporte.
// Quem protege é o banco: as funções console_* e a função de borda "console" só respondem para plataforma_admins.
(() => {
  const { esc } = S;
  const sb = S.sb = supabase.createClient(window.SONVI_CONFIG.url, window.SONVI_CONFIG.key, { auth:{ storageKey:'sonvi-console-auth' } });
  const q = S.q = async p => { const { data, error } = await p; if (error) throw error; return data; };
  S.erro = e => { const m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a nuvem. Verifique a internet e tente de novo.';
    return m; };
  const cside = document.getElementById('cside'), cmain = document.getElementById('cmain');
  let D = null, sessao = null, carregando = true, busca = '';
  const hoje = () => new Date();
  const dataHora = d => d ? new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const quando = d => { if (!d) return 'nunca'; const t = new Date(d), h = hoje(), dias = Math.floor((new Date(h.toDateString()) - new Date(t.toDateString())) / 864e5);
    const hm = t.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); return dias === 0 ? `hoje às ${hm}` : dias === 1 ? `ontem às ${hm}` : t.toLocaleDateString('pt-BR'); };
  const endereco = slug => `sonvi.com.br/${slug}`;
  const SIT = { teste:['Em teste', 'sky'], ativo:['Ativo', 'green'], suspenso:['Suspenso', 'red'] };
  const sitPill = c => { const [n, t] = SIT[c.situacao] || [c.situacao, 'gray']; return `<span class="pill" style="--tone:var(--${t})">${n}${c.situacao === 'teste' && c.teste_ate ? ' até ' + S.dfmt(c.teste_ate) : ''}</span>`; };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const vav = r => r.logo ? `<span class="vav img"><img src="${r.logo}" width="500" height="500" alt=""></span>` : `<span class="vav" style="background:${esc(r.cor || '#0055ff')}">${esc(S.selo(r))}</span>`;
  const logoCli = (c, cls = 'cli-logo') => c.logo ? `<span class="${cls}"><img src="${esc(c.logo.startsWith('img/') ? '/' + c.logo : c.logo)}" width="600" height="122" alt=""></span>` : `<span class="${cls} sem" aria-hidden="true">${esc(S.iniciais(c.nome))}</span>`;
  const cliente = slug => (D && D.clientes || []).find(c => c.slug === slug);
  const servidor = async corpo => {
    const { data, error } = await sb.functions.invoke('console', { body:corpo });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  };
  const recarregar = async () => { D = await q(sb.rpc('console_dados')); };

  // ---------- Entrar ----------
  const telaEntrar = (msg = '') => `<div class="c-entrar"><div class="lado"><div class="c-marca"><img src="/img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <div><h2>O painel de quem cuida da plataforma.</h2><p>Clientes, rádios, acessos e suporte. Acesso restrito à equipe SONVI.</p></div>
      <p class="c-rodape">${S.svg('chave', 16)}console.sonvi.com.br · cada entrada de suporte fica registrada</p></div>
    <div class="forma"><form class="auth" data-form="entrar" novalidate><div class="c-marca so-cel"><img src="/img/sonvi.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <h1>Entrar no Console</h1>${msg ? `<p class="c-aviso" role="alert">${esc(msg)}</p>` : '<p class="muted">Use o seu e-mail e a sua senha do SONVI.</p>'}
      <label class="f">E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com.br"></label>
      <label class="f">Senha<input name="senha" type="password" required autocomplete="current-password" placeholder="Sua senha"></label>
      <button class="btn pri">Entrar</button></form></div></div>`;

  // ---------- Menu ----------
  const NAV = [['clientes', 'Clientes', 'predio'], ['suporte', 'Acessos de suporte', 'escudo']];
  const menu = rota => `<div class="c-marca"><img src="/img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
    <nav aria-label="Menu do Console">${NAV.map(([k, n, ic]) => `<a href="#/${k}" class="${rota === k || (k === 'clientes' && ['cliente', 'novo'].includes(rota)) ? 'on' : ''}"${rota === k ? ' aria-current="page"' : ''}>${ICONE[ic]}${n}</a>`).join('')}</nav>
    <div class="c-eu"><span class="av" aria-hidden="true">${esc(S.iniciais((D.eu || {}).nome || 'SONVI'))}</span><span class="tx"><b>${esc((D.eu || {}).nome || '')}</b><small>Equipe SONVI</small></span><button class="btn sm" data-act="sair">Sair</button></div>`;
  const ICONE = {
    predio:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
    escudo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>'
  };

  // ---------- Clientes ----------
  const telaClientes = () => {
    const cs = D.clientes, ativos = cs.filter(c => c.situacao !== 'suspenso'), susp = cs.length - ativos.length, radios = cs.reduce((s, c) => s + c.radios.length, 0);
    const usuarios = cs.reduce((s, c) => s + c.usuarios, 0), prop = cs.reduce((s, c) => s + c.propostas_mes, 0), pis = cs.reduce((s, c) => s + c.pis_mes, 0);
    const t = busca.trim().toLowerCase(), lista = cs.filter(c => !t || (c.nome + ' ' + c.slug + ' ' + c.cidade).toLowerCase().includes(t));
    const dir = c => { const ds = c.equipe.filter(u => u.diretor && u.ativo); return ds.length ? 'Diretor: ' + ds.map(d => d.nome).join(', ') : 'sem diretor'; };
    const ult = c => c.ultimo ? `${quando(c.ultimo.quando)}<small>${esc(c.ultimo.nome)}</small>` : 'nunca';
    const linhas = lista.map(c => `<tr class="click" data-go="/cliente/${esc(c.slug)}"><td><a href="#/cliente/${esc(c.slug)}" class="c-cli">${logoCli(c)}<span class="tx"><b>${esc(c.nome)}</b><small>${esc(endereco(c.slug))} · ${esc(dir(c))}</small></span></a></td>
        <td>${sitPill(c)}</td><td><span class="c-vavs">${c.radios.map(vav).join('')}</span></td><td class="r">${c.usuarios}</td>
        <td class="nowrap c-ult">${ult(c)}</td><td class="nowrap c-ult">${plural(c.propostas_mes, 'proposta', 'propostas')}<small>${plural(c.pis_mes, 'PI', 'PIs')}</small></td></tr>`).join('');
    const cartoes = lista.map(c => `<a class="c-cartao" href="#/cliente/${esc(c.slug)}">${logoCli(c)}<span class="tx"><b>${esc(c.nome)}</b><small>${esc(endereco(c.slug))}</small><small>${plural(c.radios.length, 'rádio', 'rádios')} · ${plural(c.usuarios, 'usuário', 'usuários')} · último acesso ${c.ultimo ? quando(c.ultimo.quando) : 'nunca'}</small><span>${sitPill(c)}</span></span></a>`).join('');
    const sup = D.suporte.slice(0, 5);
    return { titulo:'Clientes', sub:`Console SONVI · ${hoje().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit' })}`, acoes:`<a class="btn pri" href="#/novo">${S.svg('mais')}Novo cliente</a>`,
      corpo:`<div class="tiles"><div class="tile hero"><small>Clientes ativos</small><b>${ativos.length}</b><span>${susp ? plural(susp, 'suspenso', 'suspensos') : 'nenhum suspenso'}</span></div>
        <div class="tile"><small>Rádios na plataforma</small><b>${radios}</b><span>${esc(cs.flatMap(c => c.radios.map(r => r.nome)).slice(0, 3).join(', ') || '—')}${radios > 3 ? '…' : ''}</span></div>
        <div class="tile"><small>Usuários ativos</small><b>${usuarios}</b><span>em todos os clientes</span></div>
        <div class="tile"><small>Movimento no mês</small><b>${prop + pis}</b><span>${plural(prop, 'proposta', 'propostas')} · ${plural(pis, 'PI', 'PIs')}</span></div></div>
      <section class="card"><div class="hd"><h2>Todos os clientes</h2><label class="busca">${S.svg('busca')}<input type="search" data-busca placeholder="Buscar cliente ou endereço" aria-label="Buscar cliente" value="${esc(busca)}"></label></div>
        ${lista.length ? `<div class="scroll so-largo"><table><thead><tr><th>Cliente</th><th>Situação</th><th>Rádios</th><th class="r">Usuários</th><th>Último acesso</th><th>No mês</th></tr></thead><tbody>${linhas}</tbody></table></div><div class="list c-cartoes so-cel">${cartoes}</div>`
          : `<div class="empty"><b>${cs.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</b>${cs.length ? 'Confira o que foi digitado na busca.' : 'Cadastre o primeiro em "Novo cliente".'}</div>`}
</section>
      <section class="card"><div class="hd"><h2>Últimos acessos de suporte</h2>${D.suporte.length ? '<a href="#/suporte">Ver todos</a>' : ''}</div>${listaSuporte(sup, true)}</section>` };
  };

  const listaSuporte = (lista, comCliente) => lista.length ? `<div class="list">${lista.map(s => { const ativo = !s.encerrado_em && new Date(s.fim) > hoje();
      const min = Math.max(1, Math.round((new Date(s.encerrado_em && new Date(s.encerrado_em) < new Date(s.fim) ? s.encerrado_em : s.fim) - new Date(s.inicio)) / 6e4));
      return `<div><span class="ic" aria-hidden="true">${ICONE.escudo}</span><span class="tx"><b>${comCliente ? esc(s.cliente) + ' · ' : ''}${dataHora(s.inicio)}${ativo ? ' <span class="pill" style="--tone:var(--blue)">agora</span>' : ''}</b>
        <small>${esc(s.quem || 'Equipe SONVI')} · ${ativo ? 'até ' + S.hora(s.fim) : min + ' min'} · motivo: ${esc(s.motivo)}</small></span></div>`; }).join('')}</div>`
    : '<p class="muted">Nenhuma entrada ainda. Quando alguém da equipe SONVI entra no ambiente de um cliente como suporte, fica anotado aqui e o diretor do cliente também vê.</p>';

  // ---------- Equipe do cliente ----------
  const PERFIS = [['gerente', 'Gerente comercial'], ['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro'], ['programador', 'Programador'], ['locutor', 'Locutor']];
  const nomePerfil = k => (PERFIS.find(p => p[0] === k) || [k, k])[1];
  const funcaoTexto = (c, u) => u.diretor ? 'Diretor · todas as rádios' : u.vinculos.length ? u.vinculos.map(v => `${nomePerfil(v.perfil)} na ${(c.radios.find(r => r.id === v.veiculo_id) || {}).nome || 'rádio'}`).join(' · ') : 'sem rádio';
  const situacaoUsuario = u => !u.ativo ? '<span class="pill" style="--tone:var(--red)">Desativado</span>' : u.trocar_senha ? '<span class="pill" style="--tone:var(--orange)">Com senha provisória</span>'
    : `<span class="muted small nowrap">${u.ultimo_acesso ? 'último acesso ' + quando(u.ultimo_acesso) : 'nunca entrou'}</span>`;
  const daEquipe = (slug, id) => { const c = cliente(slug); return { c, u:c && c.equipe.find(x => x.id === id) }; };

  // Cadastro e edição de usuário: dados, função (diretor ou perfil em cada rádio)
  const formUsuario = (c, u = {}) => {
    const novoU = !u.id, dir = !!u.diretor, perfilEm = r => ((u.vinculos || []).find(v => v.veiculo_id === r.id) || {}).perfil || '';
    S.dialog(`<h2>${novoU ? 'Cadastrar usuário' : esc(u.nome)} · ${esc(c.nome)}</h2><div class="g2">
        <label class="f" style="grid-column:1/-1">Nome<input name="nome" required value="${esc(u.nome || '')}" placeholder="Nome completo"></label>
        <label class="f">E-mail (é com ele que entra)<input name="email" type="email" required value="${esc(u.email || '')}" placeholder="nome@empresa.com.br"></label>
        <label class="f">Celular (WhatsApp)<input name="celular" data-mask="tel" inputmode="tel" value="${esc(u.celular || '')}"></label>
        <label class="f" style="grid-column:1/-1">Função<select name="funcao" data-funcao><option value="radio"${dir ? '' : ' selected'}>Acesso por rádio</option><option value="diretor"${dir ? ' selected' : ''}>Diretor (todas as rádios e a administração)</option></select></label></div>
      <div class="acessos"${dir ? ' hidden' : ''}>${c.radios.map(r => `<div class="ac-l">${vav(r)}<b>${esc(r.nome)}</b><select name="v_${r.id}" aria-label="Perfil na ${esc(r.nome)}"><option value="">Sem acesso</option>${PERFIS.map(([k, n]) => `<option value="${k}"${perfilEm(r) === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`).join('') || '<p class="muted">Este cliente ainda não tem rádios.</p>'}</div>
      ${!novoU && u.diretor && c.equipe.filter(x => x.diretor && x.ativo && x.id !== u.id).length === 0 ? '<p class="c-aviso">Este é o único diretor ativo. Se tirar a função, o cliente fica sem diretor.</p>' : ''}
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${novoU ? 'Cadastrar' : 'Salvar'}</button></div>`,
      f => (async () => {
        const diretor = f.funcao === 'diretor', vinculos = diretor ? [] : c.radios.filter(r => f['v_' + r.id]).map(r => ({ veiculo_id:r.id, perfil:f['v_' + r.id] }));
        if (!diretor && !vinculos.length) { S.toast('Escolha o perfil em pelo menos uma rádio (ou a função de diretor).'); return formUsuario(c, Object.assign({}, u, { nome:f.nome, email:f.email, celular:f.celular, vinculos })); }
        try {
          if (novoU) { const r = await servidor({ acao:'novo_usuario', org:c.id, usuario:{ nome:f.nome, email:f.email, celular:f.celular }, diretor, vinculos });
            await recarregar(); render(); mostrarAcesso(cliente(c.slug) || c, { id:r.usuario_id, nome:f.nome, email:f.email.trim().toLowerCase(), celular:f.celular, diretor }, r.senha, 'Usuário cadastrado'); }
          else { await servidor({ acao:'editar_usuario', usuario_id:u.id, nome:f.nome, email:f.email, celular:f.celular, diretor, vinculos }); await recarregar(); render(); S.toast('Usuário salvo'); }
        } catch (e) { S.toast(S.erro(e)); }
      })());
    document.getElementById('dlg').dataset.guarda = '1';
  };

  // ---------- Um cliente ----------
  const telaCliente = slug => {
    const c = cliente(slug);
    if (!c) return { titulo:'Cliente não encontrado', sub:'Clientes', acoes:'', corpo:'<div class="card empty"><b>Este cliente não existe</b><a href="#/clientes">Voltar para a lista</a></div>' };
    const susp = c.situacao === 'suspenso', link = `https://sonvi.com.br/${c.slug}/`;
    const kv = (k, v) => `<div><small>${k}</small><span>${v ? esc(v) : '<span class="muted">—</span>'}</span></div>`;
    return { titulo:esc(c.nome), sub:'<a href="#/clientes">Clientes</a> › ' + esc(c.nome),
      acoes:`<button class="btn perigo" data-act="excluirCliente" data-id="${c.id}">${S.svg('lixo')}Excluir</button><button class="btn" data-act="situacao" data-id="${c.id}">${susp ? 'Reativar' : 'Suspender'}</button><a class="btn pri" href="${esc(link)}" target="_blank" rel="noopener">${ICONE.escudo}Entrar como suporte</a>`,
      corpo:`<div class="c-topo">${logoCli(c, 'cli-logo grande')}<span class="tx"><span>${sitPill(c)}</span><a href="${esc(link)}" target="_blank" rel="noopener">${esc(endereco(c.slug))} ↗</a><small class="muted">Sonvi Music: ${esc(endereco(c.slug))}/music · cliente desde ${S.dfmt(c.criado_em)}</small></span></div>
      <div class="c-minis"><div><small>Clientes cadastrados</small><b>${c.clientes}</b><small>${plural(c.radios.length, 'rádio', 'rádios')}</small></div>
        <div><small>Propostas no mês</small><b>${c.propostas_mes}</b><small>&nbsp;</small></div>
        <div><small>PIs no mês</small><b>${c.pis_mes}</b><small>${esc(c.radios.filter(r => r.pis_mes).map(r => `${r.pis_mes} ${r.sigla}`).join(' · ') || '—')}</small></div>
        <div><small>Último acesso</small><b>${c.ultimo ? quando(c.ultimo.quando).split(' às ')[0] : 'nunca'}</b><small>${c.ultimo ? esc((quando(c.ultimo.quando).split(' às ')[1] || '') + ' · ' + c.ultimo.nome) : '&nbsp;'}</small></div></div>
      <div class="c-grade">
        <section class="card"><div class="hd"><h2>Rádios</h2><button class="btn sm" data-act="novaRadio" data-id="${c.id}">${S.svg('mais')}Adicionar rádio</button></div>
          ${c.radios.length ? `<div class="list">${c.radios.map(r => `<div>${vav(r)}<span class="tx"><b>${esc(r.nome)}</b><small>${esc([r.frequencia, r.cidade].filter(Boolean).join(' · ') || 'sem cidade')} · ${plural(r.clientes, 'cliente', 'clientes')} · ${plural(r.pis, 'PI', 'PIs')}</small></span><button class="btn tres" data-act="radioMenu" data-id="${r.id}" data-org="${c.slug}" aria-label="Opções da ${esc(r.nome)}">${S.svg('mais3')}</button></div>`).join('')}</div>` : '<p class="muted">Nenhuma rádio.</p>'}
          <p class="muted small">Logo, cores, textos do PI e tabela de preços o diretor completa dentro do SONVI.</p></section>

        <section class="card"><div class="hd"><h2>Dados da empresa</h2><button class="btn sm" data-act="editarCliente" data-id="${c.id}">${S.svg('editar')}Editar dados</button></div>
          <div class="c-kv">${kv('Nome', c.nome)}${kv('CNPJ', c.cnpj)}${kv('Cidade', c.cidade)}${kv('Endereço no SONVI', endereco(c.slug))}${kv('Situação', (SIT[c.situacao] || [c.situacao])[0] + (c.situacao === 'teste' && c.teste_ate ? ' até ' + S.dfmt(c.teste_ate) : ''))}${kv('Plano', 'a definir')}</div></section>
        <section class="card c-largo"><div class="hd"><h2>Equipe</h2><span>${plural(c.equipe.filter(u => u.ativo).length, 'usuário ativo', 'usuários ativos')}</span><button class="btn sm" data-act="novoUsuario" data-id="${c.id}">${S.svg('mais')}Cadastrar usuário</button></div>
          ${c.equipe.length ? `<div class="list">${c.equipe.map(u => `<div class="${u.ativo ? '' : 'c-inativo'}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome || '—')}</b><small>${esc(funcaoTexto(c, u))}</small><small>${esc(u.email)}${u.celular ? ' · <span class="nowrap">' + esc(u.celular) + '</span>' : ''}</small></span>
            <span class="c-sit">${situacaoUsuario(u)}</span><button class="btn tres" data-act="usuarioMenu" data-id="${u.id}" data-org="${c.slug}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></div>`).join('')}</div>`
            : '<p class="c-aviso">Este cliente está sem equipe. Use "Cadastrar usuário" e escolha a função de diretor.</p>'}
          ${c.equipe.some(u => u.diretor && u.ativo) ? '' : c.equipe.length ? '<p class="c-aviso">Nenhum diretor ativo: o cliente fica sem quem cadastre a equipe e os dados da empresa.</p>' : ''}</section>
        <section class="card c-largo"><div class="hd"><h2>Acessos de suporte</h2><span class="pill" style="--tone:var(--gray)">o cliente também vê</span></div>${listaSuporte(c.suporte, false)}</section>
      </div>` };
  };

  // ---------- Novo cliente ----------
  let novo = null; // o que está sendo digitado (fica na tela até criar)
  const sugerirSlug = nome => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'e')
    .replace(/\b(ltda|me|eireli|s\/?a|sa)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const fimTeste = () => { const d = new Date(); d.setDate(d.getDate() + 30); return S.dia(d.toISOString()); };
  const telaNovo = () => {
    if (!novo) novo = { nome:'', cnpj:'', cidade:'', slug:'', slugMexido:false, logo:'', radios:[{ nome:'', sigla:'', cidade:'' }], dnome:'', demail:'', dcel:'', situacao:'teste', teste_ate:fimTeste(), slugMsg:'' };
    const n = novo, livre = n.slug && !n.slugMsg && n.slugOk === n.slug;
    return { titulo:'Novo cliente', sub:'<a href="#/clientes">Clientes</a> › Novo cliente', acoes:'',
      corpo:`<form class="card c-novo" data-form="novo" novalidate><p class="muted">O cliente nasce com o endereço próprio, as rádios e o diretor. A equipe dele quem cadastra é o diretor, dentro do SONVI.</p>
        <fieldset><legend><span class="n">1</span>Empresa</legend><div class="g2">
          <label class="f">Nome da empresa<input name="nome" required value="${esc(n.nome)}" placeholder="Ex.: Grupo Exemplo de Comunicação"></label>
          <label class="f">CNPJ<input name="cnpj" data-mask="cnpj" inputmode="numeric" value="${esc(n.cnpj)}" placeholder="00.000.000/0000-00"></label>
          <label class="f">Cidade / UF<input name="cidade" value="${esc(n.cidade)}" placeholder="Ex.: Rondonópolis / MT"></label></div>
          <label class="f">Endereço no SONVI<span class="c-slug${n.slugMsg ? ' ruim' : livre ? ' bom' : ''}"><span>sonvi.com.br/</span><input name="slug" value="${esc(n.slug)}" aria-label="Final do endereço" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="slugAviso">${livre ? '<span class="pill" style="--tone:var(--green)">✓ disponível</span>' : ''}</span>
            <small id="slugAviso" class="${n.slugMsg ? 'erro-campo' : 'muted'}">${n.slugMsg ? esc(n.slugMsg) : 'Só letras minúsculas, números e hífen. Sugerido a partir do nome; dá para mudar.' + (n.slug ? ` Sonvi Music: ${esc(endereco(n.slug))}/music` : '')}</small></label>
          <div class="c-logo-campo"><span class="c-logo-prev">${n.logo ? `<img src="${n.logo}" width="600" height="122" alt="Logo escolhida">` : '<span class="muted small">Sem logo</span>'}</span>
            <span class="tx"><b>Logo</b><small class="muted">Horizontal, PNG ou JPG. Aparece na tela de entrada do cliente e nas propostas.</small><span class="row"><button type="button" class="btn sm" data-act="logoEscolher">Escolher imagem</button>${n.logo ? '<button type="button" class="btn sm" data-act="logoTirar">Tirar</button>' : ''}</span></span>
            <input type="file" id="logoArq" accept="image/png,image/jpeg,image/webp" hidden></div></fieldset>
        <fieldset><legend><span class="n">2</span>Rádios</legend>
          <div class="c-radios">${n.radios.map((r, i) => `<div class="c-radio"><label class="f">Nome da rádio<input data-radio="${i}" data-campo="nome" value="${esc(r.nome)}" placeholder="Ex.: Rádio Exemplo FM"></label>
            <label class="f">Sigla do PI<input data-radio="${i}" data-campo="sigla" value="${esc(r.sigla)}" placeholder="EXEMPLO" data-mask="sigla" autocomplete="off"></label>
            <label class="f">Cidade / UF<input data-radio="${i}" data-campo="cidade" value="${esc(r.cidade)}" placeholder="Ex.: Rondonópolis / MT"></label>
            ${n.radios.length > 1 ? `<button type="button" class="btn sm tres" data-act="radioTirar" data-i="${i}" aria-label="Tirar a rádio ${i + 1}">${S.svg('lixo')}</button>` : '<span></span>'}</div>`).join('')}</div>
          <div class="row"><button type="button" class="btn sm" data-act="radioMais">${S.svg('mais')}Mais uma rádio</button></div>
          <p class="muted small">A sigla sai no número do PI (PI EXEMPLO 0001). Logo, cores, textos do PI e tabela de preços o diretor completa depois, dentro do SONVI.</p></fieldset>
        <fieldset><legend><span class="n">3</span>Diretor do cliente</legend><div class="g2">
          <label class="f">Nome<input name="dnome" required value="${esc(n.dnome)}" placeholder="Nome completo"></label>
          <label class="f">Celular (WhatsApp)<input name="dcel" data-mask="tel" inputmode="tel" value="${esc(n.dcel)}" placeholder="(65) 9 0000-0000"></label>
          <label class="f" style="grid-column:1/-1">E-mail (é com ele que o diretor entra)<input name="demail" type="email" required value="${esc(n.demail)}" placeholder="diretor@empresa.com.br"></label></div>
          <p class="muted small">Ao criar, o Console mostra a senha provisória com os botões WhatsApp, E-mail e Copiar. No primeiro acesso o diretor cria a própria senha.</p></fieldset>
        <fieldset><legend><span class="n">4</span>Situação</legend><div class="c-opcoes">
          <label class="c-op"><input type="radio" name="situacao" value="teste"${n.situacao === 'teste' ? ' checked' : ''}><span><b>Em teste</b><small>até <input type="date" name="teste_ate" value="${esc(n.teste_ate)}" aria-label="Fim do teste"> (30 dias). Depois o Console avisa.</small></span></label>
          <label class="c-op"><input type="radio" name="situacao" value="ativo"${n.situacao === 'ativo' ? ' checked' : ''}><span><b>Ativo</b><small>cliente contratado.</small></span></label></div></fieldset>
        <div class="row c-fim"><span class="grow"></span><a class="btn" href="#/clientes" data-act="novoCancelar">Cancelar</a><button class="btn pri">Criar cliente</button></div></form>` };
  };
  // Confere se o endereço está livre (no banco), um pouco depois de parar de digitar
  let tSlug = null;
  const conferirSlug = () => { clearTimeout(tSlug); const s = novo.slug;
    tSlug = setTimeout(async () => { if (!s) { novo.slugMsg = ''; return pintarSlug(); }
      try { const m = await q(sb.rpc('console_slug_livre', { p_slug:s })); if (novo && novo.slug === s) { novo.slugMsg = m || ''; novo.slugOk = m ? '' : s; pintarSlug(); } } catch (e) { /* sem conexão: confere de novo ao criar */ } }, 350); };
  const pintarSlug = () => { const caixa = document.querySelector('.c-slug'), aviso = document.getElementById('slugAviso'); if (!caixa || !novo) return;
    const livre = novo.slug && !novo.slugMsg && novo.slugOk === novo.slug;
    caixa.classList.toggle('ruim', !!novo.slugMsg); caixa.classList.toggle('bom', !!livre);
    const p = caixa.querySelector('.pill'); if (livre && !p) caixa.insertAdjacentHTML('beforeend', '<span class="pill" style="--tone:var(--green)">✓ disponível</span>'); if (!livre && p) p.remove();
    aviso.className = novo.slugMsg ? 'erro-campo' : 'muted';
    aviso.textContent = novo.slugMsg || 'Só letras minúsculas, números e hífen. Sugerido a partir do nome; dá para mudar.' + (novo.slug ? ` Sonvi Music: ${endereco(novo.slug)}/music` : ''); };

  // ---------- Acessos de suporte ----------
  const telaSuporte = () => ({ titulo:'Acessos de suporte', sub:'Console SONVI', acoes:'',
    corpo:`<section class="card"><div class="hd"><h2>Todas as entradas</h2><span>${plural(D.suporte.length, 'registro', 'registros')}</span></div>
      <p class="muted small">Para ver os dados de um cliente, entre pelo endereço dele (botão "Entrar como suporte" no cliente) e escreva o motivo. Cada entrada fica aqui e na tela de Administração do cliente.</p>${listaSuporte(D.suporte, true)}</section>` });

  // ---------- Desenhar ----------
  const rota = () => { const [v, id] = location.hash.replace(/^#\/?/, '').split('/'); return { v:['clientes', 'cliente', 'novo', 'suporte'].includes(v) ? v : 'clientes', id:decodeURIComponent(id || '') }; };
  let ultima = '';
  const render = () => {
    document.body.classList.toggle('fora', !D);
    if (carregando) { cside.innerHTML = ''; cmain.innerHTML = '<div class="carregando"><div class="eq" aria-label="Carregando"><span></span><span></span><span></span><span></span><span></span></div></div>'; return; }
    if (!D) { cside.innerHTML = ''; cmain.innerHTML = telaEntrar(S.avisoEntrar); document.title = 'Console SONVI'; return; }
    const { v, id } = rota(), t = v === 'cliente' ? telaCliente(id) : v === 'novo' ? telaNovo() : v === 'suporte' ? telaSuporte() : telaClientes();
    cside.innerHTML = menu(v);
    const chave = v + '/' + id;
    cmain.innerHTML = `<header class="c-bar${chave !== ultima ? ' entra' : ''}"><div><small class="c-sub">${t.sub}</small><h1>${t.titulo}</h1></div><div class="c-acoes">${t.acoes}</div></header><div class="c-corpo${chave !== ultima ? ' entra' : ''}">${t.corpo}</div>`;
    if (chave !== ultima) window.scrollTo(0, 0);
    ultima = chave; document.title = `${t.titulo.replace(/<[^>]+>/g, '')} · Console SONVI`;
    S.mascarar(cmain);
  };
  S.render = render;

  const iniciar = async () => {
    carregando = true; render();
    const { data:{ session } } = await sb.auth.getSession(); sessao = session; D = null;
    if (session) {
      try { const admin = await q(sb.rpc('eh_admin_plataforma'));
        if (!admin) { await sb.auth.signOut(); S.avisoEntrar = 'Este acesso não é da equipe SONVI. O Console é só para quem cuida da plataforma.'; }
        else { await recarregar(); S.avisoEntrar = ''; }
      } catch (e) { console.error(e); S.avisoEntrar = S.erro(e); }
    }
    carregando = false; render();
  };

  // ---------- Diálogo com os dados de acesso do diretor ----------
  const mostrarAcesso = (c, d, senha, titulo) => {
    const ende = `https://sonvi.com.br/${c.slug}/`, nome = (d.nome || '').split(' ')[0];
    const msg = `Olá${nome ? ', ' + nome : ''}! ${d.diretor === false ? `Seu acesso ao SONVI da ${c.nome} está pronto.` : `O SONVI da ${c.nome} está pronto e você é o diretor.`}\n\nEntre em: ${ende}\nE-mail: ${d.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.`;
    const fone = String(d.celular || '').replace(/\D/g, ''), wa = `https://wa.me/${fone ? (fone.length <= 11 ? '55' : '') + fone : ''}?text=${encodeURIComponent(msg)}`;
    S.dialog(`<h2>${esc(titulo)}</h2><p>Envie os dados de acesso para <b>${esc(d.nome || d.email)}</b>. No primeiro acesso, o SONVI pede que a pessoa crie a própria senha.</p>
      <div class="senha-prov"><div><small>Endereço</small><b>${esc(endereco(c.slug))}</b></div><div><small>Senha provisória</small><b class="num">${esc(senha)}</b></div><div style="grid-column:1/-1"><small>E-mail</small><b>${esc(d.email).replace('@', '@<wbr>')}</b></div></div>
      <p class="muted small">Esta senha aparece só agora. Se perder, gere outra em "Nova senha" (a anterior deixa de valer).</p>
      <div class="envio-acesso" role="group" aria-label="Enviar os dados de acesso">
        <a class="btn pri" href="${esc(wa)}" target="_blank" rel="noopener">${S.svg('whats')}WhatsApp</a>
        <button type="button" class="btn" data-act="enviarAcesso" data-id="${esc(d.id)}" data-senha="${esc(senha)}">${S.svg('email')}E-mail</button>
        <button type="button" class="btn" data-act="copiar" data-texto="${esc(msg)}">${S.svg('copia')}Copiar</button></div>
      <div class="row"><span class="grow"></span><button class="btn" value="x">Fechar</button></div>`);
  };

  // Logo horizontal (até 900 px de largura), como a da empresa comercial
  const lerLogoLargo = arq => new Promise((ok, erro) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(arq.type)) return erro(new Error('Use uma imagem PNG, JPG ou WebP.'));
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const k = Math.min(1, 900 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let u = c.toDataURL('image/webp', .92); if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/png');
      if (u.length > 580000) return erro(new Error('A imagem ficou grande demais. Use uma logo menor.')); ok(u); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível abrir essa imagem.')); };
    img.src = url;
  });

  // ---------- Ações ----------
  const A = S.actions = Object.assign(S.actions || {}, {
    sair: async () => { await sb.auth.signOut(); D = null; S.avisoEntrar = ''; location.hash = ''; render(); },
    copiar: d => navigator.clipboard.writeText(d.texto).then(() => S.toast('Mensagem copiada'), () => S.toast('Não foi possível copiar.')),
    enviarAcesso: async d => { try { const r = await servidor({ acao:'enviar_acesso', usuario_id:d.id, senha:d.senha }); S.toast(`E-mail enviado para ${r.email}`); } catch (e) { S.toast(S.erro(e)); } },
    situacao: async d => { const c = D.clientes.find(x => x.id === d.id), susp = c.situacao === 'suspenso';
      const ok = await S.confirmar(susp ? `Reativar a ${c.nome}? A equipe volta a entrar no SONVI na hora.` : `Suspender a ${c.nome}? Ninguém da equipe dela consegue mais usar o SONVI: quem entrar vê "Acesso suspenso". Os dados ficam guardados e voltam ao reativar.`,
        { ok:susp ? 'Reativar' : 'Suspender', perigo:!susp });
      if (!ok) return;
      try { await q(sb.rpc('console_salvar_cliente', { p_id:c.id, p:{ nome:c.nome, cnpj:c.cnpj, cidade:c.cidade, situacao:susp ? 'ativo' : 'suspenso' } })); await recarregar(); S.toast(susp ? `${c.nome} reativada` : `${c.nome} suspensa`); render(); }
      catch (e) { S.toast(S.erro(e)); } },
    editarCliente: d => { const c = D.clientes.find(x => x.id === d.id);
      S.form(`Dados · ${esc(c.nome)}`, [{ k:'nome', label:'Nome da empresa', req:true, full:true }, { k:'cnpj', label:'CNPJ', mask:'cnpj' }, { k:'cidade', label:'Cidade / UF' },
        { k:'situacao', label:'Situação', type:'select', options:[['teste', 'Em teste'], ['ativo', 'Ativo'], ['suspenso', 'Suspenso']] }, { k:'teste_ate', label:'Teste até (se em teste)', type:'date' },
        { html:`<div class="c-logo-campo" style="grid-column:1/-1"><span class="c-logo-prev" id="logoPrev">${c.logo ? `<img src="${esc(c.logo.startsWith('img/') ? '/' + c.logo : c.logo)}" width="600" height="122" alt="Logo atual">` : '<span class="muted small">Sem logo</span>'}</span>
          <span class="tx"><b>Logo</b><small class="muted">Aparece na tela de entrada do cliente.</small><span class="row"><button type="button" class="btn sm" data-act="logoEscolher">Trocar logo</button></span></span>
          <input type="file" id="logoArq" accept="image/png,image/jpeg,image/webp" hidden><input type="hidden" name="logo" value=""></div>` }],
        c, f => (async () => { try { const p = { nome:f.nome, cnpj:f.cnpj, cidade:f.cidade, situacao:f.situacao, teste_ate:f.teste_ate || '' }; if (f.logo) p.logo = f.logo;
          await q(sb.rpc('console_salvar_cliente', { p_id:c.id, p })); await recarregar(); S.toast('Dados salvos'); render(); } catch (e) { S.toast(S.erro(e)); } })(), 'Salvar', { editar:true }); },
    novaRadio: d => S.form('Adicionar rádio', [{ k:'nome', label:'Nome da rádio', req:true, full:true }, { k:'sigla', label:'Sigla do PI', req:true }, { k:'cidade', label:'Cidade / UF' }], {},
      f => (async () => { try { await q(sb.rpc('console_adicionar_radio', { p_org:d.id, p_nome:f.nome, p_sigla:f.sigla, p_cidade:f.cidade || '' })); await recarregar(); S.toast('Rádio adicionada'); render(); } catch (e) { S.toast(S.erro(e)); } })(), 'Adicionar'),
    novoUsuario: d => formUsuario(D.clientes.find(x => x.id === d.id)),
    usuarioMenu: (d, botao) => { const { u } = daEquipe(d.org, d.id);
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'usuarioEditar', data:d }, { label:'Gerar nova senha provisória', icon:'chave', act:'usuarioSenha', data:d },
        { label:u.ativo ? 'Desativar acesso' : 'Reativar acesso', icon:'olho', act:'usuarioAtivo', data:d }, '-', { label:'Excluir usuário', icon:'lixo', act:'usuarioExcluir', data:d, perigo:true }]); },
    usuarioEditar: d => { const { c, u } = daEquipe(d.org, d.id); formUsuario(c, u); },
    usuarioSenha: async d => { const { c, u } = daEquipe(d.org, d.id);
      if (!await S.confirmar(`Gerar uma nova senha provisória para ${u.nome}? A senha atual deixa de valer e, no próximo acesso, a pessoa cria uma nova.`, { ok:'Gerar senha' })) return;
      try { const r = await servidor({ acao:'senha', usuario_id:u.id }); await recarregar(); render(); mostrarAcesso(c, u, r.senha, 'Nova senha provisória'); } catch (e) { S.toast(S.erro(e)); } },
    usuarioAtivo: async d => { const { u } = daEquipe(d.org, d.id), ativo = !u.ativo;
      if (!await S.confirmar(ativo ? `Reativar o acesso de ${u.nome}? A pessoa volta a entrar com a senha dela.` : `Desativar o acesso de ${u.nome}? A pessoa é desconectada na hora e não entra mais até ser reativada. A carteira e o histórico continuam.`, { ok:ativo ? 'Reativar' : 'Desativar', perigo:!ativo })) return;
      try { await servidor({ acao:'ativo', usuario_id:u.id, ativo }); await recarregar(); render(); S.toast(ativo ? 'Acesso reativado' : 'Acesso desativado'); } catch (e) { S.toast(S.erro(e)); } },
    usuarioExcluir: d => { const { c, u } = daEquipe(d.org, d.id), outros = c.equipe.filter(x => x.ativo && x.id !== u.id);
      S.form(`Excluir ${esc(u.nome)}`, [{ html:`<p style="grid-column:1/-1">A conta de entrada é apagada e a pessoa sai da equipe da ${esc(c.nome)}. ${u.carteira ? `Ela tem ${plural(u.carteira, 'item', 'itens')} na carteira (clientes, propostas e PIs): escolha quem fica com eles.` : 'Ela não tem clientes, propostas nem PIs.'}</p>` },
        { k:'para', label:'A carteira passa para', type:'select', full:true, options:[...outros.map(x => [x.id, x.nome + (x.diretor ? ' (diretor)' : '')]), ['', 'Ninguém (ficam sem responsável)']] }], { para:(outros.find(x => x.diretor) || outros[0] || {}).id || '' },
        f => (async () => { try { await servidor({ acao:'excluir_usuario', usuario_id:u.id, para:f.para || null }); await recarregar(); render(); S.toast(`Usuário ${u.nome} excluído`); } catch (e) { S.toast(S.erro(e)); } })(), 'Excluir', { editar:true });
      const b = document.querySelector('#dlg button[value=ok]'); if (b) { b.classList.remove('pri'); b.classList.add('perigo'); } },
    radioMenu: (d, botao) => S.menu(botao, [{ label:'Editar', icon:'editar', act:'radioEditar', data:d }, '-', { label:'Excluir rádio', icon:'lixo', act:'radioExcluir', data:d, perigo:true }]),
    radioEditar: d => { const c = cliente(d.org), r = c.radios.find(x => x.id === d.id);
      S.form(`Editar · ${esc(r.nome)}`, [{ k:'nome', label:'Nome da rádio', req:true, full:true }, { k:'sigla', label:'Sigla do PI', req:true, mask:'sigla' }, { k:'cidade', label:'Cidade / UF' }], r,
        f => (async () => { try { await q(sb.rpc('console_salvar_radio', { p_veiculo:r.id, p_nome:f.nome, p_sigla:f.sigla, p_cidade:f.cidade || '' })); await recarregar(); render(); S.toast('Rádio salva'); } catch (e) { S.toast(S.erro(e)); } })(), 'Salvar', { editar:true }); },
    radioExcluir: d => { const c = cliente(d.org), r = c.radios.find(x => x.id === d.id);
      const tem = [plural(r.clientes, 'cliente', 'clientes'), plural(r.propostas, 'proposta', 'propostas'), plural(r.pis, 'PI', 'PIs'), plural(r.lancamentos, 'lançamento financeiro', 'lançamentos financeiros')].join(', ');
      S.form(`Excluir ${esc(r.nome)}`, [{ html:`<p style="grid-column:1/-1">Apaga a rádio com tudo o que é dela: ${esc(tem)}, follow-ups, tabelas de preço, programação musical e os arquivos dos PIs. <b>Não dá para desfazer.</b></p>` },
        { k:'confirma', label:`Para confirmar, digite a sigla: ${r.sigla}`, req:true, full:true }], {},
        f => (async () => { if (String(f.confirma || '').trim().toUpperCase() !== String(r.sigla).toUpperCase()) return S.toast('A sigla não confere. Nada foi apagado.');
          try { await servidor({ acao:'excluir_radio', veiculo:r.id }); await recarregar(); render(); S.toast(`${r.nome} excluída`); } catch (e) { S.toast(S.erro(e)); } })(), 'Excluir rádio', { editar:true });
      const b = document.querySelector('#dlg button[value=ok]'); if (b) { b.classList.remove('pri'); b.classList.add('perigo'); } },
    excluirCliente: d => { const c = D.clientes.find(x => x.id === d.id);
      S.form(`Excluir ${esc(c.nome)}`, [{ html:`<p style="grid-column:1/-1">Apaga o cliente inteiro: ${plural(c.radios.length, 'rádio', 'rádios')}, ${plural(c.clientes, 'cliente cadastrado', 'clientes cadastrados')}, propostas, PIs, financeiro, follow-ups, a equipe (${plural(c.equipe.length, 'conta de entrada', 'contas de entrada')}) e o endereço ${esc(endereco(c.slug))}. <b>Não dá para desfazer.</b> Para só bloquear o acesso, use "Suspender".</p>` },
        { k:'confirma', label:`Para confirmar, digite o endereço: ${c.slug}`, req:true, full:true }], {},
        f => (async () => { if (String(f.confirma || '').trim().toLowerCase() !== c.slug) return S.toast('O endereço não confere. Nada foi apagado.');
          try { await servidor({ acao:'excluir_cliente', org:c.id, confirma:c.slug }); await recarregar(); location.hash = '/clientes'; render(); S.toast(`${c.nome} excluído`); } catch (e) { S.toast(S.erro(e)); } })(), 'Excluir cliente', { editar:true });
      const b = document.querySelector('#dlg button[value=ok]'); if (b) { b.classList.remove('pri'); b.classList.add('perigo'); } },
    logoEscolher: () => document.getElementById('logoArq').click(),
    logoTirar: () => { novo.logo = ''; render(); },
    radioMais: () => { novo.radios.push({ nome:'', sigla:'', cidade:'' }); render(); const i = document.querySelectorAll('[data-campo=nome]'); if (i.length) i[i.length - 1].focus(); },
    radioTirar: d => { novo.radios.splice(Number(d.i), 1); render(); },
    novoCancelar: () => { novo = null; }
  });

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act], [data-go]'); if (!el || el.closest('.menu')) return;
    if (el.dataset.go && !e.target.closest('a[href]')) { location.hash = el.dataset.go; return; }
    const f = A[el.dataset.act]; if (!f) return;
    if (el.tagName === 'A' && el.dataset.act !== 'novoCancelar') e.preventDefault();
    f(Object.assign({}, el.dataset), el);
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-go]')) { e.preventDefault(); location.hash = e.target.dataset.go; } });
  window.addEventListener('hashchange', render);
  document.addEventListener('click', e => { if (S._menu && !e.target.closest('.menu') && !e.target.closest('[data-act$="Menu"]')) S.fecharMenu(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S._menu) S.fecharMenu(); });
  document.addEventListener('change', e => { if (!e.target.matches('[data-funcao]')) return; const a = e.target.closest('form').querySelector('.acessos'); if (a) a.hidden = e.target.value === 'diretor'; });
  document.addEventListener('input', e => {
    if (e.target.matches('[data-busca]')) { busca = e.target.value; const pos = e.target.selectionStart; render(); const i = document.querySelector('[data-busca]'); i.focus(); i.setSelectionRange(pos, pos); return; }
    const f = e.target.closest('form[data-form=novo]'); if (!f || !novo) return;
    const t = e.target;
    if (t.dataset.radio) { novo.radios[Number(t.dataset.radio)][t.dataset.campo] = t.dataset.campo === 'sigla' ? t.value.toUpperCase() : t.value; return; }
    if (t.name === 'slug') { const limpo = t.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (limpo !== t.value) t.value = limpo; novo.slug = limpo; novo.slugMexido = true; novo.slugOk = ''; conferirSlug(); return; }
    if (t.name in novo) novo[t.name] = t.value;
    if (t.name === 'nome' && !novo.slugMexido) { novo.slug = sugerirSlug(t.value); novo.slugOk = ''; f.slug.value = novo.slug; conferirSlug(); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.name === 'situacao' && novo && t.closest('form[data-form=novo]')) { novo.situacao = t.value; return; }
    if (t.id !== 'logoArq' || !t.files[0]) return;
    try { const u = await lerLogoLargo(t.files[0]);
      if (t.closest('#dlg')) { const f = t.closest('form'); f.logo.value = u; document.getElementById('logoPrev').innerHTML = `<img src="${u}" width="600" height="122" alt="Logo nova">`; document.getElementById('dlg').dataset.sujo = '1'; }
      else { novo.logo = u; render(); } }
    catch (err) { S.toast(err.message); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.dataset.form === 'entrar') { e.preventDefault(); const v = Object.fromEntries(new FormData(f)), b = f.querySelector('button');
      if (!v.email || !v.senha) return S.toast('Digite o e-mail e a senha.');
      b.disabled = true;
      try { const { error } = await sb.auth.signInWithPassword({ email:v.email, password:v.senha }); if (error) throw error; await iniciar(); }
      catch (err) { S.avisoEntrar = S.erro(err); render(); }
      return; }
    if (f.dataset.form !== 'novo') return;
    e.preventDefault();
    const n = novo, b = f.querySelector('button.pri');
    // Confere na tela antes de mandar (o banco confere de novo)
    const avisar = (campo, msg) => { const el = typeof campo === 'string' ? f.querySelector(campo) : campo; S.toast(msg); if (el) { el.focus(); el.setAttribute('aria-invalid', 'true'); el.addEventListener('input', () => el.removeAttribute('aria-invalid'), { once:true }); } };
    if (!n.nome.trim()) return avisar('[name=nome]', 'Informe o nome da empresa.');
    if (!n.slug) return avisar('[name=slug]', 'Escolha o endereço no SONVI.');
    const msg = await q(sb.rpc('console_slug_livre', { p_slug:n.slug })).catch(() => null);
    if (msg) { n.slugMsg = msg; pintarSlug(); return avisar('[name=slug]', msg); }
    const radios = n.radios.filter(r => r.nome.trim() || r.sigla.trim());
    if (!radios.length) return avisar('[data-campo=nome]', 'Cadastre pelo menos uma rádio.');
    const semSigla = radios.findIndex(r => !r.nome.trim() || !r.sigla.trim());
    if (semSigla >= 0) return avisar(`[data-radio="${n.radios.indexOf(radios[semSigla])}"][data-campo="${radios[semSigla].nome.trim() ? 'sigla' : 'nome'}"]`, 'Cada rádio precisa de nome e sigla do PI.');
    if (!n.dnome.trim()) return avisar('[name=dnome]', 'Informe o nome do diretor.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.demail.trim())) return avisar('[name=demail]', 'Digite um e-mail válido para o diretor.');
    const ate = f.teste_ate ? f.teste_ate.value : n.teste_ate;
    b.disabled = true;
    try {
      const r = await servidor({ acao:'criar_cliente', cliente:{ nome:n.nome.trim(), slug:n.slug, cnpj:n.cnpj, cidade:n.cidade, logo:n.logo, situacao:n.situacao, teste_ate:ate,
        radios:radios.map(x => ({ nome:x.nome.trim(), sigla:x.sigla.trim().toUpperCase(), cidade:x.cidade.trim() })) }, diretor:{ nome:n.dnome.trim(), email:n.demail.trim().toLowerCase(), celular:n.dcel } });
      await recarregar(); const c = cliente(r.slug) || { nome:n.nome, slug:n.slug }; novo = null;
      location.hash = '/cliente/' + r.slug; render();
      mostrarAcesso(c, { id:r.usuario_id, nome:n.dnome.trim(), email:n.demail.trim().toLowerCase(), celular:n.dcel }, r.senha, 'Cliente criado');
      S.toast(`${c.nome} criado em ${endereco(c.slug)}`);
    } catch (err) {
      b.disabled = false; S.toast(S.erro(err));
      // O cliente pode ter sido criado sem o diretor: atualiza a lista para não criar duas vezes
      if (/foi criado/.test(err.message)) { await recarregar(); novo = null; location.hash = '/cliente/' + n.slug; }
    }
  });

  iniciar();
})();

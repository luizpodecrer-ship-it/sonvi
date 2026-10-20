// SONVI · Console (console.sonvi.com.br): o painel da equipe SONVI para cuidar dos clientes.
// Menu (fluido, aprovado em 20/10/2026): Clientes · Financeiro · Suporte · Configurações.
// Clientes (lista com contrato, cadastro completo, rádios, equipe), Financeiro (mensalidades, baixa, avisos), Suporte (chamados e
// acessos de suporte), Configurações (equipe do Console com papéis, dados de cobrança e avisos).
// Quem protege é o banco: as funções console_* e a função de borda "console" só respondem para plataforma_admins, conforme o papel.
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
  const sitPill = c => { const [n, t] = SIT[c.situacao] || [c.situacao, 'gray']; return `<span class="pill" style="--tone:var(--${t})">${n}${c.situacao === 'teste' && c.teste_ate ? ' até ' + S.dfmt(c.teste_ate).slice(0, 5) : ''}</span>`; };
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
  const contaServidor = async corpo => {
    const { data, error } = await sb.functions.invoke('usuarios', { body:corpo });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro); return data;
  };

  // ---------- Papéis da equipe do Console ----------
  const NOME_PAPEL = { proprietario:'Proprietário', suporte:'Suporte', financeiro:'Financeiro' };
  const TOM_PAPEL = { proprietario:'blue', suporte:'sky', financeiro:'green' };
  const papel = () => (D && D.eu && D.eu.papel) || '';
  const pode = (...p) => p.includes(papel());
  const euNaEquipe = () => (D.equipe_console || []).find(u => u.id === (D.eu || {}).id) || {};

  // ---------- Datas e dinheiro ----------
  const hojeISO = () => S.dia(new Date().toISOString());
  const diasAte = v => Math.round((Date.parse(String(v).slice(0, 10) + 'T12:00:00') - Date.parse(hojeISO() + 'T12:00:00')) / 864e5);
  const curto = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  const nomeMes = (ym, comAno) => { const [y, m] = ym.split('-').map(Number), n = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month:'long' });
    return n[0].toUpperCase() + n.slice(1) + (comAno || y !== new Date().getFullYear() ? ' ' + y : ''); };
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const desde = d => { const min = Math.round((Date.now() - new Date(d)) / 6e4); if (min < 60) return `há ${Math.max(1, min)} min`; const h = Math.round(min / 60); if (h < 24) return `há ${h} h`; const dd = Math.round(h / 24); return dd < 8 ? `há ${dd} dia${dd === 1 ? '' : 's'}` : S.dfmt(S.dia(d)); };
  const duracao = min => min < 60 ? `${Math.round(min)} min` : min < 60 * 48 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dias`;

  // ---------- Contratos e cobranças ----------
  const FORMAS = [['boleto', 'Boleto'], ['pix', 'Pix'], ['boleto_pix', 'Boleto + Pix'], ['cartao', 'Cartão de crédito'], ['transferencia', 'Transferência']];
  const nomeForma = k => (FORMAS.find(f => f[0] === k) || [k, k])[1];
  const cobsDe = c => (D.cobrancas || []).filter(x => x.organizacao_id === c.id);
  const atrasada = x => x.situacao === 'aberta' && x.vencimento < hojeISO();
  const fimContrato = k => { const d = new Date(k.inicio + 'T12:00:00'); d.setMonth(d.getMonth() + Number(k.meses)); d.setDate(d.getDate() - 1); return S.dia(d.toISOString()); };
  const dCurta = d => { const f = S.dfmt(d); return f.slice(6) === String(new Date().getFullYear()) ? f.slice(0, 5) : f; };
  const contratoAte = k => !k ? '—' : k.inicio > hojeISO() ? 'a partir de ' + dCurta(k.inicio) : S.dfmt(fimContrato(k));
  const finPill = c => { const cs = cobsDe(c).filter(x => x.situacao !== 'cancelada');
    if (!c.contrato && !cs.length) return '<span class="pill" style="--tone:var(--gray)">Sem cobrança</span>';
    const at = cs.filter(atrasada); if (at.length) { const d = Math.max(...at.map(x => -diasAte(x.vencimento))); return `<span class="pill" style="--tone:var(--red)">Atrasado ${d} dia${d === 1 ? '' : 's'}</span>`; }
    return cs.length ? '<span class="pill" style="--tone:var(--green)">Em dia</span>' : '<span class="pill" style="--tone:var(--gray)">Sem cobrança</span>'; };
  const cobPill = x => { if (x.situacao === 'paga') return `<span class="pill" style="--tone:var(--green)">Paga em ${S.dfmt(x.pago_em).slice(0, 5)}</span>`;
    if (x.situacao === 'cancelada') return '<span class="pill" style="--tone:var(--gray)">Cancelada</span>';
    const d = diasAte(x.vencimento);
    if (d < 0) return `<span class="pill" style="--tone:var(--red)">Atrasada ${-d} dia${d === -1 ? '' : 's'}</span>`;
    if (d === 0) return '<span class="pill" style="--tone:var(--orange)">Vence hoje</span>';
    if (d <= 5) return `<span class="pill" style="--tone:var(--orange)">Vence em ${d} dia${d === 1 ? '' : 's'}</span>`;
    return '<span class="pill" style="--tone:var(--sky)">Em aberto</span>'; };
  const receitaContratada = () => D.clientes.filter(c => c.contrato && c.situacao !== 'suspenso' && Number(c.contrato.valor_mensal) > 0);

  // ---------- Chamados ----------
  const SITCH = { aberto:['Aberto', 'orange'], andamento:['Em andamento', 'sky'], aguardando:['Aguardando cliente', 'purple'], resolvido:['Resolvido', 'green'] };
  const PRIO = { baixa:['Baixa', 'gray'], normal:['Normal', 'gray'], alta:['Alta', 'orange'], urgente:['Urgente', 'red'] };
  const pillDe = (mapa, k) => { const [n, t] = mapa[k] || [k, 'gray']; return `<span class="pill" style="--tone:var(--${t})">${n}</span>`; };
  const numCh = ch => '#' + String(ch.numero).padStart(4, '0');
  const abertos = () => (D.chamados || []).filter(ch => ch.situacao !== 'resolvido');

  // ---------- Entrar ----------
  const telaEntrar = (msg = '') => `<div class="c-entrar"><div class="lado"><div class="c-marca"><img src="/img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <div><h2>O painel de quem cuida da plataforma.</h2><p>Clientes, rádios, acessos e suporte. Acesso restrito à equipe SONVI.</p></div>
      <p class="c-rodape">${S.svg('chave', 16)}console.sonvi.com.br · cada entrada de suporte fica registrada</p>${S.credito('escuro', '/')}</div>
    <div class="forma"><form class="auth" data-form="entrar" novalidate><div class="c-marca so-cel"><img src="/img/sonvi.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <h1>Entrar no Console</h1>${msg ? `<p class="c-aviso" role="alert">${esc(msg)}</p>` : '<p class="muted">Use o seu e-mail e a sua senha do SONVI.</p>'}
      <label class="f">E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com.br"></label>
      <label class="f">Senha<input name="senha" type="password" required autocomplete="current-password" placeholder="Sua senha"></label>
      <button class="btn pri">Entrar</button></form>${S.credito('auto', '/', 'cel')}</div></div>`;

  const telaCriarSenha = () => `<div class="c-entrar"><div class="lado"><div class="c-marca"><img src="/img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <div><h2>Bem-vindo ao Console.</h2><p>Você entrou com uma senha provisória. Crie a sua para continuar.</p></div><span></span>${S.credito('escuro', '/')}</div>
    <div class="forma"><form class="auth" data-form="senha" novalidate><div class="c-marca so-cel"><img src="/img/sonvi.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
      <h1>Crie a sua senha</h1><p class="muted">Olá, ${esc(((D.eu || {}).nome || '').split(' ')[0])}! Escolha a senha que você vai usar para entrar no Console com o e-mail <b>${esc((D.eu || {}).email || '')}</b>.</p>
      <label class="f">Nova senha<input name="senha" type="password" required autocomplete="new-password" minlength="8" placeholder="Pelo menos 8 caracteres, com letras e números"></label>
      <label class="f">Repita a senha<input name="senha2" type="password" required autocomplete="new-password" placeholder="Digite de novo"></label>
      <button class="btn pri">Salvar senha</button><button type="button" class="btn" data-act="sair">Sair</button></form>${S.credito('auto', '/', 'cel')}</div></div>`;

  // ---------- Menu (fluido: o realce desliza até o item sob o mouse; o ícone cresce e ganha a cor do item) ----------
  const NAV = [['clientes', 'Clientes', 'predio', '#4c9dff'], ['financeiro', 'Financeiro', 'cartao', '#3ddc97'], ['suporte', 'Suporte', 'escudo', '#f2a65a'], ['configuracoes', 'Configurações', 'engrenagem', '#b69cff']];
  const ICONE = {
    predio:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
    cartao:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
    escudo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>',
    engrenagem:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>'
  };
  const grupoDe = v => v === 'cliente' || v === 'novo' ? 'clientes' : v;
  const menu = rota => { const g = grupoDe(rota);
    const conta = { financeiro:(D.cobrancas || []).filter(atrasada).length, suporte:(D.chamados || []).filter(ch => ch.situacao === 'aberto').length };
    const itens = NAV.filter(([k]) => k !== 'configuracoes' || pode('proprietario'));
    return `<div class="c-marca"><img src="/img/sonvi-branco.svg" width="343" height="78" alt="SONVI"><span class="c-selo">CONSOLE</span></div>
    <nav aria-label="Menu do Console"><span class="realce" aria-hidden="true"></span>${itens.map(([k, n, ic, cor]) => `${k === 'configuracoes' ? '<span class="div" aria-hidden="true"></span>' : ''}<a href="#/${k}" style="--c:${cor}" class="${g === k ? 'on' : ''}"${g === k ? ' aria-current="page"' : ''}>${ICONE[ic]}<span>${n}</span>${conta[k] ? `<em aria-label="${conta[k]} ${k === 'financeiro' ? 'em atraso' : 'sem resposta'}">${conta[k]}</em>` : ''}</a>`).join('')}</nav>
    <div class="c-eu"><span class="av" aria-hidden="true">${esc(S.iniciais((D.eu || {}).nome || 'SONVI'))}</span><button class="tx" data-act="contaMenu" aria-haspopup="menu" title="Minha conta"><b>${esc((D.eu || {}).nome || '')}</b><small>${NOME_PAPEL[papel()] || 'Equipe SONVI'}</small></button><button class="btn sm" data-act="sair">Sair</button></div>`; };
  // O realce sai de onde estava (troca de tela) e vai até o item da tela; acompanha o mouse e o foco
  let realceY = null;
  const menuFluido = () => {
    const nav = cside.querySelector('nav'); if (!nav) return;
    const r = nav.querySelector('.realce'), itens = [...nav.querySelectorAll('a')], on = nav.querySelector('a.on');
    const ir = (a, sem) => { if (!a) { r.style.opacity = 0; return; } if (sem) r.style.transition = 'none';
      r.style.opacity = 1; r.style.transform = `translateY(${a.offsetTop}px)`; r.style.height = a.offsetHeight + 'px'; if (sem) { r.offsetHeight; r.style.transition = ''; }
      itens.forEach(x => x.classList.toggle('quente', x === a)); if (a === on) realceY = a.offsetTop; };
    if (realceY !== null && on) { r.style.transition = 'none'; r.style.opacity = 1; r.style.height = on.offsetHeight + 'px'; r.style.transform = `translateY(${realceY}px)`; r.offsetHeight; r.style.transition = ''; requestAnimationFrame(() => ir(on)); }
    else ir(on, true);
    itens.forEach(a => { a.addEventListener('mouseenter', () => ir(a)); a.addEventListener('focus', () => ir(a)); });
    nav.addEventListener('mouseleave', () => { ir(on); itens.forEach(x => x.classList.remove('quente')); });
    nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) { ir(on); itens.forEach(x => x.classList.remove('quente')); } });
  };

  // ---------- Clientes ----------
  const telaClientes = () => {
    const cs = D.clientes, ativos = cs.filter(c => c.situacao === 'ativo'), teste = cs.filter(c => c.situacao === 'teste').length;
    const t = busca.trim().toLowerCase(), lista = cs.filter(c => !t || (c.nome + ' ' + c.slug + ' ' + c.cidade).toLowerCase().includes(t));
    const dir = c => { const ds = c.equipe.filter(u => u.diretor && u.ativo); return ds.length ? 'Diretor: ' + ds.map(d => d.nome).join(', ') : 'sem diretor'; };
    const chDe = c => abertos().filter(ch => ch.organizacao_id === c.id).length;
    const mens = c => c.contrato && Number(c.contrato.valor_mensal) ? S.brl(c.contrato.valor_mensal) : '<span class="muted">—</span>';
    const pag = c => c.contrato ? `${esc(nomeForma(c.contrato.forma))} · dia ${c.contrato.dia_vencimento}` : '<span class="muted">sem contrato</span>';
    const linhas = lista.map(c => `<tr class="click" data-go="/cliente/${esc(c.slug)}"><td><a href="#/cliente/${esc(c.slug)}" class="c-cli">${logoCli(c)}<span class="tx"><b>${esc(c.nome)}</b><small>${esc(endereco(c.slug))}</small><small>${esc(dir(c))}</small></span></a></td>
        <td>${sitPill(c)}</td><td class="r nowrap">${mens(c)}</td><td class="nowrap">${pag(c)}</td><td class="nowrap">${contratoAte(c.contrato)}</td><td>${finPill(c)}</td><td class="r">${chDe(c) || '<span class="muted">0</span>'}</td></tr>`).join('');
    const cartoes = lista.map(c => `<a class="c-cartao" href="#/cliente/${esc(c.slug)}">${logoCli(c)}<span class="tx"><b>${esc(c.nome)}</b><small>${esc(endereco(c.slug))}</small><small>${c.contrato ? `${S.brl(c.contrato.valor_mensal)} · ${esc(nomeForma(c.contrato.forma))} · dia ${c.contrato.dia_vencimento}` : 'sem contrato'} · ${plural(chDe(c), 'chamado aberto', 'chamados abertos')}</small><span class="c-pills">${sitPill(c)}${finPill(c)}</span></span></a>`).join('');
    const mes = hojeISO().slice(0, 7), aReceber = (D.cobrancas || []).filter(x => x.situacao === 'aberta' && x.vencimento.slice(0, 7) === mes);
    const rc = receitaContratada(), ab = abertos(), urg = ab.filter(ch => ch.prioridade === 'urgente').length;
    return { titulo:'Clientes', sub:`Console SONVI · ${hoje().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit' })}`, acoes:pode('proprietario') ? `<a class="btn pri" href="#/novo">${S.svg('mais')}Novo cliente</a>` : '',
      corpo:`<div class="tiles"><div class="tile hero"><small>Clientes ativos</small><b>${ativos.length}</b><span>${teste ? plural(teste, 'em teste', 'em teste') : 'nenhum em teste'}</span></div>
        <div class="tile"><small>Receita mensal contratada</small><b>${curto(rc.reduce((t, c) => t + Number(c.contrato.valor_mensal), 0))}</b><span>${plural(rc.length, 'contrato', 'contratos')}</span></div>
        <div class="tile"><small>A receber em ${nomeMes(mes).toLowerCase()}</small><b>${curto(aReceber.reduce((t, x) => t + Number(x.valor), 0))}</b><span>${plural(aReceber.length, 'cobrança', 'cobranças')}</span></div>
        <div class="tile"><small>Chamados abertos</small><b>${ab.length}</b><span${urg ? ' class="ruim"' : ''}>${urg ? plural(urg, 'urgente', 'urgentes') : 'nenhum urgente'}</span></div></div>
      <section class="card"><div class="hd"><h2>Todos os clientes</h2><label class="busca">${S.svg('busca')}<input type="search" data-busca placeholder="Buscar cliente ou endereço" aria-label="Buscar cliente" value="${esc(busca)}"></label></div>
        ${lista.length ? `<div class="scroll so-largo"><table><thead><tr><th>Cliente</th><th>Situação</th><th class="r">Mensalidade</th><th>Pagamento</th><th>Contrato até</th><th>Financeiro</th><th class="r">Chamados</th></tr></thead><tbody>${linhas}</tbody></table></div><div class="list c-cartoes so-cel">${cartoes}</div>`
          : `<div class="empty"><b>${cs.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</b>${cs.length ? 'Confira o que foi digitado na busca.' : 'Cadastre o primeiro em "Novo cliente".'}</div>`}
      </section>` };
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

  // ---------- Contrato do cliente ----------
  const cartaoContrato = c => {
    const k = c.contrato, cs = cobsDe(c).filter(x => x.situacao !== 'cancelada'), edita = pode('proprietario', 'financeiro');
    const btn = edita ? `<button class="btn sm" data-act="contrato" data-id="${c.id}">${S.svg(k ? 'editar' : 'mais')}${k ? 'Editar contrato' : 'Cadastrar contrato'}</button>` : '';
    if (!k) return `<section class="card c-largo"><div class="hd"><h2>Contrato</h2><span class="pill" style="--tone:var(--gray)">Sem contrato</span>${btn}</div>
      <p class="muted">Cadastre o valor da mensalidade, o dia do vencimento e a forma de pagamento. Ao salvar, o Console cria as mensalidades do período e passa a mandar os avisos de vencimento.</p></section>`;
    const mensal = cs.filter(x => x.tipo === 'mensalidade'), pagas = mensal.filter(x => x.situacao === 'paga').length;
    const prox = cs.filter(x => x.situacao === 'aberta').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    const lista = [...cs.filter(x => x.situacao === 'aberta'), ...cs.filter(x => x.situacao === 'paga').reverse()].slice(0, 6).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const ate = d => d === 0 ? 'hoje' : d > 0 ? `em ${d} dia${d === 1 ? '' : 's'}` : `há ${-d} dia${d === -1 ? '' : 's'}`;
    return `<section class="card c-largo"><div class="hd"><h2>Contrato</h2>${finPill(c)}${btn}</div>
      <div class="c-kv c-kv3"><div><small>Mensalidade</small><span><b>${S.brl(k.valor_mensal)}</b> · ${esc(nomeForma(k.forma))}, dia ${k.dia_vencimento}</span></div>
        <div><small>Vigência</small><span><b>${S.dfmt(k.inicio)} a ${S.dfmt(fimContrato(k))}</b> · ${pagas} de ${k.meses} pagas</span></div>
        <div><small>Próxima</small><span>${prox ? `<b>${S.dfmt(prox.vencimento)}</b> · ${ate(diasAte(prox.vencimento))}` : '<span class="muted">nenhuma em aberto</span>'}</span></div>
        <div><small>Implantação</small><span>${Number(k.implantacao_valor) ? `${S.brl(k.implantacao_valor)} em ${k.implantacao_parcelas}x` : '<span class="muted">sem taxa</span>'}</span></div>
        <div><small>E-mail de cobrança</small><span>${k.email_cobranca ? esc(k.email_cobranca) : '<span class="muted">— (sem e-mail, os avisos não saem)</span>'}</span></div>
        <div><small>Quem paga · reajuste</small><span>${esc(k.pagador || c.nome)} · ${esc(k.reajuste || 'IPCA')}</span></div></div>
      ${lista.length ? `<div class="scroll"><table class="c-mini"><thead><tr><th>Referente</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${lista.map(x => `<tr><td>${esc(x.descricao)}</td><td class="nowrap">${S.dfmt(x.vencimento)}</td><td class="r nowrap">${S.brl(x.valor)}</td><td>${cobPill(x)}</td></tr>`).join('')}</tbody></table></div>
        <a class="c-link" href="#/financeiro" data-act="verFinCliente" data-id="${c.id}">Ver todas no Financeiro</a>` : ''}</section>`;
  };

  // ---------- Um cliente ----------
  const telaCliente = slug => {
    const c = cliente(slug);
    if (!c) return { titulo:'Cliente não encontrado', sub:'Clientes', acoes:'', corpo:'<div class="card empty"><b>Este cliente não existe</b><a href="#/clientes">Voltar para a lista</a></div>' };
    const susp = c.situacao === 'suspenso', link = `https://sonvi.com.br/${c.slug}/`, prop = pode('proprietario');
    const kv = (k, v) => `<div><small>${k}</small><span>${v ? esc(v) : '<span class="muted">—</span>'}</span></div>`;
    return { titulo:esc(c.nome), sub:'<a href="#/clientes">Clientes</a> › ' + esc(c.nome),
      acoes:`${pode('proprietario') ? `<button class="btn perigo" data-act="excluirCliente" data-id="${c.id}">${S.svg('lixo')}Excluir</button><button class="btn" data-act="situacao" data-id="${c.id}">${susp ? 'Reativar' : 'Suspender'}</button>` : ''}${pode('proprietario', 'suporte') ? `<a class="btn pri" href="${esc(link)}" target="_blank" rel="noopener">${ICONE.escudo}Entrar como suporte</a>` : ''}`,
      corpo:`<div class="c-topo">${logoCli(c, 'cli-logo grande')}<span class="tx"><span>${sitPill(c)}</span><a href="${esc(link)}" target="_blank" rel="noopener">${esc(endereco(c.slug))} ↗</a><small class="muted">Sonvi Music: ${esc(endereco(c.slug))}/music · cliente desde ${S.dfmt(c.criado_em)}</small></span></div>
      <div class="c-minis"><div><small>Clientes cadastrados</small><b>${c.clientes}</b><small>${plural(c.radios.length, 'rádio', 'rádios')}</small></div>
        <div><small>Propostas no mês</small><b>${c.propostas_mes}</b><small>&nbsp;</small></div>
        <div><small>PIs no mês</small><b>${c.pis_mes}</b><small>${esc(c.radios.filter(r => r.pis_mes).map(r => `${r.pis_mes} ${r.sigla}`).join(' · ') || '—')}</small></div>
        <div><small>Último acesso</small><b>${c.ultimo ? quando(c.ultimo.quando).split(' às ')[0] : 'nunca'}</b><small>${c.ultimo ? esc((quando(c.ultimo.quando).split(' às ')[1] || '') + ' · ' + c.ultimo.nome) : '&nbsp;'}</small></div></div>
      <div class="c-grade">
        ${cartaoContrato(c)}
        <section class="card"><div class="hd"><h2>Rádios</h2>${prop ? `<button class="btn sm" data-act="novaRadio" data-id="${c.id}">${S.svg('mais')}Adicionar rádio</button>` : ''}</div>
          ${c.radios.length ? `<div class="list">${c.radios.map(r => `<div>${vav(r)}<span class="tx"><b>${esc(r.nome)}</b><small>${esc([r.frequencia, r.cidade].filter(Boolean).join(' · ') || 'sem cidade')} · ${plural(r.clientes, 'cliente', 'clientes')} · ${plural(r.pis, 'PI', 'PIs')}</small></span>${prop ? `<button class="btn tres" data-act="radioMenu" data-id="${r.id}" data-org="${c.slug}" aria-label="Opções da ${esc(r.nome)}">${S.svg('mais3')}</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">Nenhuma rádio.</p>'}
          <p class="muted small">Logo, cores, textos do PI e tabela de preços o diretor completa dentro do SONVI.</p></section>

        <section class="card"><div class="hd"><h2>Dados da empresa</h2>${prop ? `<button class="btn sm" data-act="editarCliente" data-id="${c.id}">${S.svg('editar')}Editar dados</button>` : ''}</div>
          <div class="c-kv">${kv('Nome', c.nome)}${kv('CNPJ', c.cnpj)}${kv('Cidade', c.cidade)}${kv('Endereço no SONVI', endereco(c.slug))}${kv('Situação', (SIT[c.situacao] || [c.situacao])[0] + (c.situacao === 'teste' && c.teste_ate ? ' até ' + S.dfmt(c.teste_ate) : ''))}${kv('Chamados abertos', String(abertos().filter(ch => ch.organizacao_id === c.id).length))}</div></section>
        <section class="card c-largo"><div class="hd"><h2>Equipe</h2><span>${plural(c.equipe.filter(u => u.ativo).length, 'usuário ativo', 'usuários ativos')}</span>${prop ? `<button class="btn sm" data-act="novoUsuario" data-id="${c.id}">${S.svg('mais')}Cadastrar usuário</button>` : ''}</div>
          ${c.equipe.length ? `<div class="list">${c.equipe.map(u => `<div class="${u.ativo ? '' : 'c-inativo'}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome || '—')}</b><small>${esc(funcaoTexto(c, u))}</small><small>${esc(u.email)}${u.celular ? ' · <span class="nowrap">' + esc(u.celular) + '</span>' : ''}</small></span>
            <span class="c-sit">${situacaoUsuario(u)}</span>${prop ? `<button class="btn tres" data-act="usuarioMenu" data-id="${u.id}" data-org="${c.slug}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button>` : ''}</div>`).join('')}</div>`
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

  // ---------- Financeiro ----------
  const fin = { mes:null, filtro:'todas', cliente:'' };
  const telaFinanceiro = () => {
    if (!fin.mes) fin.mes = hojeISO().slice(0, 7);
    const edita = pode('proprietario', 'financeiro'), todas = (D.cobrancas || []).filter(x => !fin.cliente || x.organizacao_id === fin.cliente);
    const doMes = todas.filter(x => x.vencimento.slice(0, 7) === fin.mes), cfg = D.config || {};
    const rc = receitaContratada().filter(c => !fin.cliente || c.id === fin.cliente);
    const pagosMes = todas.filter(x => x.situacao === 'paga' && String(x.pago_em || '').slice(0, 7) === fin.mes);
    const aReceber = doMes.filter(x => x.situacao === 'aberta' && !atrasada(x)), emAtraso = todas.filter(atrasada);
    const maior = emAtraso.length ? Math.max(...emAtraso.map(x => -diasAte(x.vencimento))) : 0, prox = aReceber.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    const mesN = nomeMes(fin.mes).toLowerCase();
    let lista = fin.filtro === 'atrasadas' ? emAtraso : doMes.filter(x => fin.filtro === 'todas' || (fin.filtro === 'abertas' ? x.situacao === 'aberta' : x.situacao === 'paga'));
    lista = lista.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.cliente.localeCompare(b.cliente));
    const titulo = fin.filtro === 'atrasadas' ? 'Cobranças atrasadas' : `Cobranças de ${mesN}`;
    const acao = x => !edita ? '' : x.situacao === 'aberta' ? `<button class="btn sm" data-act="cobCobrar" data-id="${x.id}">${atrasada(x) ? 'Cobrar' : 'Enviar'}</button>` : x.situacao === 'paga' ? `<button class="btn sm" data-act="cobRecibo" data-id="${x.id}">Recibo</button>` : '';
    const linhas = lista.map(x => `<tr${x.situacao === 'cancelada' ? ' class="c-inativo"' : ''}><td><b>${esc(x.cliente)}</b><small>${esc(nomeForma(x.forma))}</small></td><td class="nowrap">${esc(x.descricao)}</td><td class="nowrap">${S.dfmt(x.vencimento)}</td><td class="r nowrap">${S.brl(x.situacao === 'paga' ? x.valor_pago ?? x.valor : x.valor)}</td><td>${cobPill(x)}</td>
      <td><div class="c-linha-acoes">${acao(x)}${edita ? `<button class="btn tres sm" data-act="cobMenu" data-id="${x.id}" aria-label="Opções da cobrança">${S.svg('mais3')}</button>` : ''}</div></td></tr>`).join('');
    const cartoes = lista.map(x => `<div class="c-cob"><span class="tx"><b>${esc(x.cliente)}</b><small>${esc(x.descricao)} · ${S.dfmt(x.vencimento)} · ${esc(nomeForma(x.forma))}</small><span class="c-pills">${cobPill(x)}</span></span><span class="vl"><b>${S.brl(x.situacao === 'paga' ? x.valor_pago ?? x.valor : x.valor)}</b><span class="c-linha-acoes">${acao(x)}${edita ? `<button class="btn tres sm" data-act="cobMenu" data-id="${x.id}" aria-label="Opções da cobrança">${S.svg('mais3')}</button>` : ''}</span></span></div>`).join('');
    const meses = [-1, 0, 1].map(n => somaMes(fin.mes, n));
    const antes = Number(cfg.aviso_dias_antes) || 5, depois = Number(cfg.aviso_dias_depois) || 3;
    return { titulo:'Financeiro', sub:'Console SONVI · cobrança pela ' + esc(cfg.empresa || 'Astravox'),
      acoes:`<div class="seg c-meses" role="group" aria-label="Mês">${meses.map(m => `<button class="${m === fin.mes ? 'on' : ''}" data-act="finMes" data-tab="${m}" aria-pressed="${m === fin.mes}">${nomeMes(m)}</button>`).join('')}</div>${edita ? `<button class="btn" data-act="avulso">${S.svg('mais')}Lançamento avulso</button>` : ''}`,
      corpo:`<div class="tiles"><div class="tile hero"><small>Receita mensal contratada</small><b>${curto(rc.reduce((t, c) => t + Number(c.contrato.valor_mensal), 0))}</b><span>${plural(rc.length, 'contrato', 'contratos')}</span></div>
        <div class="tile"><small>Recebido em ${mesN}</small><b>${curto(pagosMes.reduce((t, x) => t + Number(x.valor_pago ?? x.valor), 0))}</b><span>${plural(pagosMes.length, 'pagamento', 'pagamentos')}</span></div>
        <div class="tile"><small>A receber em ${mesN}</small><b>${curto(aReceber.reduce((t, x) => t + Number(x.valor), 0))}</b><span>${prox ? 'próxima ' + S.dfmt(prox.vencimento).slice(0, 5) : 'nada em aberto'}</span></div>
        <div class="tile"><small>Em atraso</small><b${emAtraso.length ? ' class="c-vermelho"' : ''}>${curto(emAtraso.reduce((t, x) => t + Number(x.valor), 0))}</b><span${emAtraso.length ? ' class="ruim"' : ''}>${emAtraso.length ? `${plural(emAtraso.length, 'cobrança', 'cobranças')} · ${maior} dia${maior === 1 ? '' : 's'}` : 'nada atrasado'}</span></div></div>
      <section class="card"><div class="hd"><h2>${titulo}</h2>
          <select data-fin-cliente aria-label="Cliente"><option value="">Todos os clientes</option>${D.clientes.map(c => `<option value="${c.id}"${fin.cliente === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
          <div class="seg" role="group" aria-label="Situação">${[['todas', 'Todas'], ['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['pagas', 'Pagas']].map(([k, n]) => `<button class="${fin.filtro === k ? 'on' : ''}" data-act="finFiltro" data-tab="${k}" aria-pressed="${fin.filtro === k}">${n}${k === 'atrasadas' && emAtraso.length ? ` (${emAtraso.length})` : ''}</button>`).join('')}</div>
          ${lista.length ? `<div class="scroll so-largo"><table><thead><tr><th>Cliente</th><th>Referente</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div><div class="list c-cobs so-cel">${cartoes}</div>`
            : `<div class="empty"><b>${fin.filtro === 'atrasadas' ? 'Nada atrasado' : 'Nenhuma cobrança'}</b>${D.clientes.some(c => c.contrato) ? 'Troque o mês ou o filtro.' : 'Cadastre o contrato no cliente (Clientes › cliente › Contrato) e as mensalidades aparecem aqui.'}</div>`}
          ${edita ? '<p class="muted small">No ⋯ de cada linha: dar baixa, reenviar a cobrança, mudar vencimento ou valor, cancelar, estornar e ver os avisos enviados.</p>' : ''}</section>
      <div class="c-grade">
          <section class="card"><div class="hd"><h2>Avisos automáticos</h2>${cfg.avisos_ligados ? '<span class="pill" style="--tone:var(--green)">Ligados</span>' : '<span class="pill" style="--tone:var(--gray)">Desligados</span>'}</div>
            <div class="c-tempo"><div><b>10 dias antes</b><span>A cobrança por e-mail, com Pix e dados para pagar</span></div><div><b>${antes} dias antes</b><span>Lembrete de vencimento</span></div>
              <div><b>No dia</b><span>"Vence hoje"</span></div><div><b>${depois} dias depois</b><span>Aviso de atraso, com cópia para ${cfg.email_resposta ? esc(cfg.email_resposta) : 'você'}</span></div><div><b>Ao dar baixa</b><span>Recibo por e-mail (opcional)</span></div></div>
            <p class="muted small">Saem de cobranca@sonvi.com.br, todo dia às 8h, para o e-mail de cobrança do contrato. WhatsApp entra depois, junto com a API oficial.${pode('proprietario') ? ' Ajuste em Configurações › Avisos.' : ''}</p></section>
          <section class="card"><div class="hd"><h2>Boleto e Pix automáticos</h2><span class="pill" style="--tone:var(--orange)">A configurar</span></div>
            <p class="muted">Dependem de uma conta num banco ou serviço de cobrança (ex.: Asaas, Efí, Inter, Mercado Pago). Com ela, o boleto e o Pix saem sozinhos e a baixa é automática quando o cliente paga.</p>
            <p class="muted">Até lá, a cobrança vai por e-mail com a chave Pix e os dados bancários de ${esc(cfg.empresa || 'Astravox')}${cfg.pix_chave ? '' : ' (cadastre em Configurações › Cobrança)'}, e a baixa é manual.</p></section>
        </div>` };
  };

  // ---------- Suporte ----------
  const sup = { aba:'chamados', cliente:'', situacao:'abertos', msgs:{}, carregando:'' };
  const carregarMsgs = async id => { if (sup.carregando === id) return; sup.carregando = id;
    try { sup.msgs[id] = await q(sb.rpc('chamado_mensagens', { p_chamado:id })); } catch (e) { S.toast(S.erro(e)); sup.msgs[id] = []; }
    sup.carregando = ''; if (rota().v === 'suporte' && rota().id === id) render(); };
  const telaSupChamados = sel => {
    const todos = D.chamados || [], ab = abertos(), urg = ab.filter(ch => ch.prioridade === 'urgente').length, mes = hojeISO().slice(0, 7);
    const aguard = todos.filter(ch => ch.situacao === 'aguardando'), resolvMes = todos.filter(ch => ch.resolvido_em && S.dia(ch.resolvido_em).slice(0, 7) === mes);
    const media = l => l.length ? l.reduce((t, x) => t + x, 0) / l.length : null;
    const tResol = media(resolvMes.map(ch => (new Date(ch.resolvido_em) - new Date(ch.criado_em)) / 6e4));
    const tPrim = media(todos.filter(ch => ch.primeira_resposta_em && S.dia(ch.criado_em).slice(0, 7) === mes).map(ch => (new Date(ch.primeira_resposta_em) - new Date(ch.criado_em)) / 6e4));
    const lista = todos.filter(ch => (!sup.cliente || ch.organizacao_id === sup.cliente) && (sup.situacao === 'todos' || (sup.situacao === 'abertos' ? ch.situacao !== 'resolvido' : ch.situacao === sup.situacao)));
    const ch = todos.find(x => x.id === sel), resp = pode('proprietario', 'suporte');
    const linhas = lista.map(x => `<tr class="click${x.id === sel ? ' sel' : ''}" data-go="/suporte/${x.id}"><td class="nowrap">${numCh(x)}</td><td><a href="#/suporte/${x.id}" class="c-ch"><b>${esc(x.assunto)}</b><small>${esc(x.cliente)}${x.radio ? ' · ' + esc(x.radio) : ''} · ${x.quem ? 'aberto por ' + esc(x.quem) : 'aberto pela equipe'}</small></a></td><td>${pillDe(PRIO, x.prioridade)}</td><td>${pillDe(SITCH, x.situacao)}</td><td class="nowrap muted">${desde(x.atualizado_em)}</td></tr>`).join('');
    let detalhe = '<section class="card c-ch-vazio"><div class="empty"><b>Escolha um chamado</b>A conversa aparece aqui. O cliente abre chamados de dentro do SONVI, no menu da conta (nome no rodapé) › "Falar com o suporte".</div></section>';
    if (ch) { const msgs = sup.msgs[ch.id]; if (!msgs) carregarMsgs(ch.id);
      const c = D.clientes.find(x => x.id === ch.organizacao_id) || {};
      detalhe = `<section class="card c-ch-det" id="chDet"><div class="hd"><h2>${numCh(ch)} · ${esc(ch.assunto)}</h2></div>
        <p class="muted small c-ch-meta">${esc(ch.cliente)}${ch.radio ? ' · ' + esc(ch.radio) : ''} · ${esc(ch.quem || 'equipe SONVI')} · aberto ${dataHora(ch.criado_em)}${c.slug && resp ? ` · <a href="https://sonvi.com.br/${esc(c.slug)}/" target="_blank" rel="noopener">Entrar como suporte ↗</a>` : ''}</p>
        ${resp ? `<div class="g2"><label class="f">Situação<select data-ch-campo="situacao" data-id="${ch.id}">${Object.entries(SITCH).map(([k, [n]]) => `<option value="${k}"${ch.situacao === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="f">Prioridade<select data-ch-campo="prioridade" data-id="${ch.id}">${Object.entries(PRIO).map(([k, [n]]) => `<option value="${k}"${ch.prioridade === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`
          : `<div class="c-pills">${pillDe(SITCH, ch.situacao)}${pillDe(PRIO, ch.prioridade)}</div>`}
        <div class="c-fio" aria-live="polite">${!msgs ? '<p class="muted">Carregando a conversa…</p>' : msgs.map(m => `<div class="c-msg${m.do_suporte ? ' nos' : ''}"><small>${esc(m.autor)} · ${dataHora(m.criado_em)}</small>${esc(m.texto).replace(/\n/g, '<br>')}</div>`).join('')}</div>
        ${resp ? `<form data-form="resposta" data-id="${ch.id}" novalidate><label class="f"><span class="sr">Resposta</span><textarea name="texto" rows="3" placeholder="Escreva a resposta… (o cliente recebe por e-mail e vê no SONVI)"></textarea></label>
          <div class="row c-ch-acoes"><span class="grow"></span>${ch.situacao !== 'resolvido' ? `<button type="button" class="btn sm" data-act="chResolver" data-id="${ch.id}">${S.svg('check')}Resolver</button>` : ''}<button class="btn sm pri">Responder</button></div></form>` : ''}</section>`; }
    return `<div class="tiles"><div class="tile hero"><small>Abertos</small><b>${ab.length}</b><span>${urg ? plural(urg, 'urgente', 'urgentes') : 'nenhum urgente'}</span></div>
        <div class="tile"><small>Aguardando o cliente</small><b>${aguard.length}</b><span>${aguard.length ? 'o mais antigo ' + desde(aguard.reduce((m, x) => x.atualizado_em < m ? x.atualizado_em : m, aguard[0].atualizado_em)) : '—'}</span></div>
        <div class="tile"><small>Resolvidos no mês</small><b>${resolvMes.length}</b><span>${tResol === null ? '—' : 'tempo médio ' + duracao(tResol)}</span></div>
        <div class="tile"><small>Primeira resposta</small><b>${tPrim === null ? '—' : duracao(tPrim)}</b><span>média do mês</span></div></div>
      <div class="c-duas">
        <section class="card"><div class="hd"><h2>Chamados</h2>
          <select data-sup-filtro="cliente" aria-label="Cliente"><option value="">Todos os clientes</option>${D.clientes.map(c => `<option value="${c.id}"${sup.cliente === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
          <select data-sup-filtro="situacao" aria-label="Situação">${[['abertos', 'Abertos'], ['todos', 'Todos'], ...Object.entries(SITCH).map(([k, [n]]) => [k, n])].map(([k, n]) => `<option value="${k}"${sup.situacao === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          ${lista.length ? `<div class="scroll so-largo"><table class="c-chs"><thead><tr><th>Nº</th><th>Chamado</th><th>Prioridade</th><th>Situação</th><th>Atualizado</th></tr></thead><tbody>${linhas}</tbody></table></div>
            <div class="list c-cartoes so-cel">${lista.map(x => `<a class="c-cartao${x.id === sel ? ' sel' : ''}" href="#/suporte/${x.id}"><span class="tx"><b>${numCh(x)} · ${esc(x.assunto)}</b><small>${esc(x.cliente)} · ${x.quem ? esc(x.quem) : 'equipe'} · ${desde(x.atualizado_em)}</small><span class="c-pills">${pillDe(PRIO, x.prioridade)}${pillDe(SITCH, x.situacao)}</span></span></a>`).join('')}</div>`
            : `<div class="empty"><b>${todos.length ? 'Nenhum chamado neste filtro' : 'Nenhum chamado ainda'}</b>${todos.length ? 'Troque o cliente ou a situação.' : 'Quando um cliente pedir ajuda pelo SONVI, o chamado aparece aqui e chega por e-mail.'}</div>`}</section>
        ${detalhe}</div>`;
  };
  const telaSuporte = id => {
    if (id === 'acessos') sup.aba = 'acessos'; else if (id) sup.aba = 'chamados';
    const abas = `<div class="seg c-meses" role="group" aria-label="Seção">${[['chamados', 'Chamados'], ['acessos', 'Acessos de suporte']].map(([k, n]) => `<button class="${sup.aba === k ? 'on' : ''}" data-act="supAba" data-tab="${k}" aria-pressed="${sup.aba === k}">${n}</button>`).join('')}</div>`;
    return { titulo:'Suporte', sub:'Console SONVI', acoes:abas + (sup.aba === 'chamados' && pode('proprietario', 'suporte') ? `<button class="btn pri" data-act="novoChamado">${S.svg('mais')}Novo chamado</button>` : ''),
      corpo:sup.aba === 'acessos' ? `<section class="card"><div class="hd"><h2>Todas as entradas</h2><span>${plural(D.suporte.length, 'registro', 'registros')}</span></div>
        <p class="muted small">Para ver os dados de um cliente, entre pelo endereço dele (botão "Entrar como suporte" no cliente ou no chamado) e escreva o motivo. Cada entrada fica aqui e na tela de Administração do cliente.</p>${listaSuporte(D.suporte, true)}</section>`
        : telaSupChamados(id && id !== 'acessos' ? id : '') };
  };

  // ---------- Configurações (só o proprietário) ----------
  let abaCfg = 'equipe';
  const telaConfig = () => {
    if (!pode('proprietario')) return { titulo:'Configurações', sub:'Console SONVI', acoes:'', corpo:'<div class="card empty"><b>Só o proprietário mexe nas configurações</b>Fale com quem administra o Console.</div>' };
    const cfg = D.config || {}, eq = D.equipe_console || [], euId = (D.eu || {}).id;
    const abas = `<div class="seg c-meses" role="group" aria-label="Seção">${[['equipe', 'Equipe do Console'], ['cobranca', 'Cobrança'], ['avisos', 'Avisos']].map(([k, n]) => `<button class="${abaCfg === k ? 'on' : ''}" data-act="cfgAba" data-tab="${k}" aria-pressed="${abaCfg === k}">${n}</button>`).join('')}</div>`;
    const sit = u => !u.ativo ? 'desativado' : u.trocar_senha ? (u.ultimo_acesso ? 'com senha provisória' : 'aguardando o primeiro acesso') : 'último acesso ' + quando(u.ultimo_acesso);
    let corpo = '';
    if (abaCfg === 'equipe') corpo = `<div class="c-duas">
      <section class="card"><div class="hd"><h2>Equipe do Console</h2><button class="btn sm pri" data-act="equipeNovo">${S.svg('mais')}Cadastrar usuário</button></div>
        <div class="list">${eq.map(u => `<div class="${u.ativo ? '' : 'c-inativo'}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome || '—')}${u.id === euId ? ' <span class="muted small">(você)</span>' : ''}</b><small>${esc(u.email)} · ${sit(u)}</small></span>
          <span class="pill" style="--tone:var(--${TOM_PAPEL[u.papel] || 'gray'})">${NOME_PAPEL[u.papel] || u.papel}</span>${u.id !== euId ? `<button class="btn tres" data-act="equipeMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button>` : '<span class="c-tres-vazio"></span>'}</div>`).join('')}</div>
        <p class="muted small">Cada pessoa recebe uma senha provisória (WhatsApp, e-mail ou copiar), como no SONVI, e cria a própria no primeiro acesso. A equipe do Console não aparece na equipe dos clientes.</p></section>
      <section class="card"><div class="hd"><h2>O que cada função pode fazer</h2></div>
        <div class="scroll"><table class="c-matriz"><thead><tr><th><span class="sr">Permissão</span></th><th>Proprietário</th><th>Suporte</th><th>Financeiro</th></tr></thead><tbody>
          ${[['Clientes: ver', '✓', '✓', '✓'], ['Clientes: criar, editar, excluir', '✓', '—', '—'], ['Contratos e mensalidades', '✓', 'ver', '✓'], ['Chamados', '✓', '✓', 'ver'], ['Entrar como suporte', '✓', '✓', '—'], ['Configurações', '✓', '—', '—']]
            .map(([n, ...v]) => `<tr><td>${n}</td>${v.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section></div>`;
    if (abaCfg === 'cobranca') corpo = `<form class="card c-cfg" data-form="config" novalidate><div class="hd"><h2>Quem cobra</h2></div>
        <div class="g2"><label class="f">Empresa<input name="empresa" required value="${esc(cfg.empresa || '')}"></label><label class="f">CNPJ<input name="cnpj" data-mask="cnpj" inputmode="numeric" value="${esc(cfg.cnpj || '')}"></label>
          <label class="f">Chave Pix<input name="pix_chave" value="${esc(cfg.pix_chave || '')}" placeholder="CNPJ, e-mail, celular ou chave aleatória" autocomplete="off"></label>
          <label class="f">E-mail que recebe respostas e cópias<input name="email_resposta" type="email" value="${esc(cfg.email_resposta || '')}" placeholder="financeiro@astravox.com.br"></label>
          <label class="f" style="grid-column:1/-1">Dados bancários (saem no e-mail de cobrança)<textarea name="dados_bancarios" rows="3" placeholder="Banco, agência, conta e favorecido">${esc(cfg.dados_bancarios || '')}</textarea></label>
          <label class="f">Multa após o vencimento (%)<input name="multa" data-mask="dec" inputmode="decimal" value="${esc(String(cfg.multa ?? 2).replace('.', ','))}"></label>
          <label class="f">Juros ao mês (%)<input name="juros" data-mask="dec" inputmode="decimal" value="${esc(String(cfg.juros ?? 1).replace('.', ','))}"></label>
          <label class="f" style="grid-column:1/-1">Serviço de boletos<select disabled data-nativo><option>A configurar depois</option></select></label></div>
        <div class="row"><span class="grow"></span><button class="btn pri">Salvar</button></div></form>`;
    if (abaCfg === 'avisos') corpo = `<form class="card c-cfg" data-form="config" novalidate><div class="hd"><h2>Avisos de cobrança por e-mail</h2></div>
        <label class="c-op"><input type="checkbox" name="avisos_ligados"${cfg.avisos_ligados ? ' checked' : ''}><span><b>Mandar os avisos automáticos</b><small>Todo dia às 8h (Cuiabá), de cobranca@sonvi.com.br para o e-mail de cobrança de cada contrato. Cliente suspenso não recebe.</small></span></label>
        <div class="g2"><label class="f">Lembrete: dias antes do vencimento<input name="aviso_dias_antes" type="number" min="1" max="30" value="${esc(cfg.aviso_dias_antes ?? 5)}"></label>
          <label class="f">Aviso de atraso: dias depois<input name="aviso_dias_depois" type="number" min="1" max="30" value="${esc(cfg.aviso_dias_depois ?? 3)}"></label></div>
        <div class="c-tempo"><div><b>10 dias antes</b><span>A cobrança, com a chave Pix e os dados bancários</span></div><div><b>Lembrete</b><span>"Vence em N dias"</span></div><div><b>No dia</b><span>"Vence hoje"</span></div><div><b>Atraso</b><span>Com multa e juros e cópia para o e-mail de respostas</span></div><div><b>Ao dar baixa</b><span>Recibo, se marcado na baixa</span></div></div>
        <p class="muted small">Cada aviso sai uma vez por cobrança. "Enviar" e "Cobrar" no Financeiro mandam na hora, fora da agenda.</p>
        <div class="row"><span class="grow"></span><button class="btn pri">Salvar</button></div></form>`;
    return { titulo:'Configurações', sub:'Console SONVI', acoes:abas, corpo };
  };

  // ---------- Desenhar ----------
  const rota = () => { const [v, id] = location.hash.replace(/^#\/?/, '').split('/'); return { v:['clientes', 'cliente', 'novo', 'financeiro', 'suporte', 'configuracoes'].includes(v) ? v : 'clientes', id:decodeURIComponent(id || '') }; };
  let ultima = '';
  const render = () => {
    document.body.classList.toggle('fora', !D);
    if (carregando) { cside.innerHTML = ''; cmain.innerHTML = '<div class="carregando"><div class="eq" aria-label="Carregando"><span></span><span></span><span></span><span></span><span></span></div></div>'; return; }
    if (!D) { cside.innerHTML = ''; cmain.innerHTML = telaEntrar(S.avisoEntrar); document.title = 'Console SONVI'; return; }
    if (euNaEquipe().trocar_senha) { document.body.classList.add('fora'); cside.innerHTML = ''; cmain.innerHTML = telaCriarSenha(); document.title = 'Crie a sua senha · Console SONVI'; return; }
    const { v, id } = rota(), t = v === 'cliente' ? telaCliente(id) : v === 'novo' ? telaNovo() : v === 'financeiro' ? telaFinanceiro() : v === 'suporte' ? telaSuporte(id) : v === 'configuracoes' ? telaConfig() : telaClientes();
    cside.innerHTML = menu(v); menuFluido();
    const chave = v + '/' + (v === 'suporte' ? sup.aba : id);
    cmain.innerHTML = `<header class="c-bar${chave !== ultima ? ' entra' : ''}"><div><small class="c-sub">${t.sub}</small><h1>${t.titulo}</h1></div><div class="c-acoes">${t.acoes}</div></header><div class="c-corpo${chave !== ultima ? ' entra' : ''}">${t.corpo}</div>`;
    if (chave !== ultima) window.scrollTo(0, 0);
    if (v === 'suporte' && id && id !== 'acessos' && window.matchMedia('(max-width:1100px)').matches && S._rolarCh !== id) { S._rolarCh = id; const det = document.getElementById('chDet'); if (det) det.scrollIntoView({ block:'start' }); }
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

  // Dados de acesso de quem entra na equipe do Console
  const mostrarAcessoConsole = (u, senha, titulo) => {
    const ende = 'https://sonvi.com.br/console/', nome = (u.nome || '').split(' ')[0];
    const msg = `Olá${nome ? ', ' + nome : ''}! Seu acesso ao Console SONVI está pronto (${NOME_PAPEL[u.papel] || u.papel}).\n\nEntre em: ${ende}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.`;
    const fone = String(u.celular || '').replace(/\D/g, ''), wa = `https://wa.me/${fone ? (fone.length <= 11 ? '55' : '') + fone : ''}?text=${encodeURIComponent(msg)}`;
    S.dialog(`<h2>${esc(titulo)}</h2><p>Envie os dados de acesso para <b>${esc(u.nome || u.email)}</b>. No primeiro acesso, o Console pede que a pessoa crie a própria senha.</p>
      <div class="senha-prov"><div><small>Endereço</small><b>sonvi.com.br/console</b></div><div><small>Senha provisória</small><b class="num">${esc(senha)}</b></div><div style="grid-column:1/-1"><small>E-mail</small><b>${esc(u.email).replace('@', '@<wbr>')}</b></div></div>
      <p class="muted small">Esta senha aparece só agora. Se perder, gere outra em "Gerar nova senha provisória" (a anterior deixa de valer).</p>
      <div class="envio-acesso" role="group" aria-label="Enviar os dados de acesso">
        <a class="btn pri" href="${esc(wa)}" target="_blank" rel="noopener">${S.svg('whats')}WhatsApp</a>
        <button type="button" class="btn" data-act="enviarAcessoConsole" data-id="${esc(u.id)}" data-senha="${esc(senha)}">${S.svg('email')}E-mail</button>
        <button type="button" class="btn" data-act="copiar" data-texto="${esc(msg)}">${S.svg('copia')}Copiar</button></div>
      <div class="row"><span class="grow"></span><button class="btn" value="x">Fechar</button></div>`);
  };
  // Recibo de uma cobrança paga, numa folha para imprimir ou salvar em PDF
  const abrirRecibo = x => {
    const cfg = D.config || {}, c = D.clientes.find(k => k.id === x.organizacao_id) || {}, k = c.contrato || {};
    const extenso = S.brl(x.valor_pago ?? x.valor), w = window.open('', '_blank');
    if (!w) return S.toast('O navegador bloqueou a nova janela. Libere as janelas do Console e tente de novo.');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo · ${esc(x.descricao)} · ${esc(c.nome || '')}</title>
      <style>body{font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:720px;margin:48px auto;padding:0 24px}h1{font-size:26px;margin:0 0 4px}.m{color:#6b6b74}
      .v{font-size:30px;font-weight:700;margin:22px 0}table{border-collapse:collapse;width:100%;margin:18px 0}td{padding:8px 0;border-bottom:1px solid #e2e6ee}td:first-child{color:#6b6b74;width:180px}
      .ass{margin-top:64px;border-top:1px solid #15171c;width:320px;padding-top:6px}button{margin-top:28px;padding:10px 18px;border-radius:8px;border:1px solid #15171c;background:#fff;font:600 13px sans-serif;cursor:pointer}@media print{button{display:none}}</style></head>
      <body><h1>Recibo</h1><div class="m">${esc(cfg.empresa || 'Astravox')} · CNPJ ${esc(cfg.cnpj || '')}</div>
      <div class="v">${extenso}</div>
      <p>Recebemos de <b>${esc(k.pagador || c.nome || '')}</b> a importância de <b>${extenso}</b>, referente a <b>${esc(x.descricao)}</b> do sistema SONVI.</p>
      <table><tr><td>Cliente</td><td>${esc(c.nome || '')}</td></tr><tr><td>Vencimento</td><td>${S.dfmt(x.vencimento)}</td></tr><tr><td>Pago em</td><td>${S.dfmt(x.pago_em)}</td></tr><tr><td>Forma</td><td>${esc(nomeForma(x.forma))}</td></tr>${x.observacao ? `<tr><td>Observação</td><td>${esc(x.observacao)}</td></tr>` : ''}</table>
      <p class="m">${esc(cfg.empresa || 'Astravox')}, ${new Date().toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' })}.</p><div class="ass">${esc(cfg.empresa || 'Astravox')}</div>
      <button onclick="print()">Imprimir ou salvar em PDF</button></body></html>`);
    w.document.close();
  };
  const cob = id => (D.cobrancas || []).find(x => x.id === id);
  const membro = id => (D.equipe_console || []).find(u => u.id === id);
  const formEquipe = (u = {}) => {
    const novoU = !u.id;
    S.form(novoU ? 'Cadastrar usuário no Console' : esc(u.nome), [{ k:'nome', label:'Nome', req:true, full:true }, { k:'email', label:'E-mail (é com ele que entra)', type:'email', req:true }, { k:'celular', label:'Celular (WhatsApp)' },
      { k:'papel', label:'Função', type:'select', full:true, options:[['suporte', 'Suporte · chamados e entrar como suporte'], ['financeiro', 'Financeiro · contratos e mensalidades'], ['proprietario', 'Proprietário · tudo, inclusive configurações']] }],
      Object.assign({ papel:'suporte' }, u),
      f => (async () => { try {
        if (novoU) { const r = await servidor({ acao:'equipe_novo', nome:f.nome, email:f.email, celular:f.celular, papel:f.papel }); await recarregar(); render();
          mostrarAcessoConsole({ id:r.usuario_id, nome:f.nome, email:f.email.trim().toLowerCase(), celular:f.celular, papel:f.papel }, r.senha, 'Usuário cadastrado'); }
        else { await servidor({ acao:'equipe_editar', usuario_id:u.id, nome:f.nome, email:f.email, celular:f.celular, papel:f.papel }); await recarregar(); render(); S.toast('Usuário salvo'); }
      } catch (e) { S.toast(S.erro(e)); } })(), novoU ? 'Cadastrar' : 'Salvar', { editar:true });
  };
  const mesesOpc = v => { const l = [1, 3, 6, 12, 18, 24, 36, 48, 60]; if (v && !l.includes(Number(v))) l.push(Number(v)); return l.sort((a, b) => a - b).map(n => [String(n), plural(n, 'mês', 'meses')]); };
  const perigoso = () => { const b = document.querySelector('#dlg button[value=ok]'); if (b) { b.classList.remove('pri'); b.classList.add('perigo'); } };

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
    novoCancelar: () => { novo = null; },

    // Conta
    contaMenu: (d, el) => S.menu(el, [{ label:'Trocar minha senha', icon:'chave', act:'trocarMinhaSenha' }, '-', { label:'Sair', icon:'voltar', act:'sair' }]),
    trocarMinhaSenha: () => S.form('Trocar minha senha', [{ k:'senha', label:'Nova senha', type:'password', req:true, full:true }, { k:'senha2', label:'Repita a nova senha', type:'password', req:true, full:true }], {},
      f => (async () => { if (f.senha !== f.senha2) return S.toast('As duas senhas não são iguais.');
        try { await contaServidor({ acao:'minha_senha', senha:f.senha }); S.toast('Senha trocada'); } catch (e) { S.toast(S.erro(e)); } })(), 'Trocar senha', { editar:true }),

    // Contrato
    contrato: d => { const c = D.clientes.find(x => x.id === d.id), k = c.contrato;
      const dir = c.equipe.find(u => u.diretor && u.ativo);
      const v = k ? Object.assign({}, k, { valor_mensal:String(k.valor_mensal).replace('.', ','), implantacao_valor:Number(k.implantacao_valor) ? String(k.implantacao_valor).replace('.', ',') : '' })
        : { valor_mensal:'', implantacao_valor:'', implantacao_parcelas:'1', dia_vencimento:'10', inicio:hojeISO(), meses:'12', reajuste:'IPCA', forma:'pix', email_cobranca:dir ? dir.email : '', pagador:[c.nome, c.cnpj ? 'CNPJ ' + c.cnpj : ''].filter(Boolean).join(' · ') };
      S.form(`Contrato · ${esc(c.nome)}`, [
        { k:'valor_mensal', label:'Valor da mensalidade (R$)', mask:'dec', req:true }, { k:'dia_vencimento', label:'Dia do vencimento', type:'select', options:Array.from({ length:28 }, (_, i) => [String(i + 1), 'Dia ' + (i + 1)]) },
        { k:'implantacao_valor', label:'Taxa de implantação (R$, opcional)', mask:'dec' }, { k:'implantacao_parcelas', label:'Implantação em', type:'select', options:Array.from({ length:12 }, (_, i) => [String(i + 1), (i + 1) + 'x']) },
        { k:'inicio', label:'Início da cobrança', type:'date', req:true }, { k:'meses', label:'Período do contrato', type:'select', options:mesesOpc(v.meses) },
        { k:'reajuste', label:'Reajuste anual', type:'select', options:[['IPCA', 'IPCA, no aniversário'], ['IGP-M', 'IGP-M, no aniversário'], ['Sem reajuste', 'Sem reajuste']] },
        { k:'forma', label:'Forma de pagamento', type:'select', options:FORMAS },
        { k:'email_cobranca', label:'E-mail de cobrança (para mais de um, separe com vírgula)', full:true, ph:'financeiro@empresa.com.br' },
        { k:'pagador', label:'Dados de quem paga', full:true, ph:'Razão social · CNPJ' }, { k:'observacoes', label:'Observações', type:'textarea' },
        { html:`<p class="muted small" style="grid-column:1/-1">Ao salvar, o Console cria as mensalidades do período (a primeira no dia escolhido do mês do início, ou do mês seguinte se o dia já passou) e as parcelas da implantação. Mudar o valor depois vale para as que estão em aberto e ainda não venceram; as pagas não mudam.</p>` }],
        v, f => (async () => {
          const mensal = S.num(f.valor_mensal), imp = S.num(f.implantacao_valor);
          if (mensal <= 0 && imp <= 0) return S.toast('Informe o valor da mensalidade.');
          const emails = String(f.email_cobranca || '').split(/[,;\s]+/).filter(Boolean);
          if (emails.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return S.toast('Confira o e-mail de cobrança.');
          try { const r = await q(sb.rpc('console_salvar_contrato', { p_org:c.id, p:{ valor_mensal:mensal, implantacao_valor:imp, implantacao_parcelas:Number(f.implantacao_parcelas), dia_vencimento:Number(f.dia_vencimento),
              inicio:f.inicio, meses:Number(f.meses), reajuste:f.reajuste, forma:f.forma, email_cobranca:emails.join(', '), pagador:f.pagador, observacoes:f.observacoes } }));
            await recarregar(); render(); S.toast(k ? 'Contrato salvo' : `Contrato salvo · ${plural(cobsDe(c).filter(x => x.situacao === 'aberta').length || r.mensalidades, 'cobrança criada', 'cobranças criadas')}`); }
          catch (e) { S.toast(S.erro(e)); } })(), 'Salvar contrato', { editar:true }); },
    verFinCliente: d => { fin.cliente = d.id; fin.filtro = 'todas'; location.hash = '/financeiro'; },

    // Financeiro
    finMes: d => { fin.mes = d.tab; if (fin.filtro === 'atrasadas') fin.filtro = 'todas'; render(); },
    finFiltro: d => { fin.filtro = d.tab; render(); },
    avulso: () => { if (!D.clientes.length) return S.toast('Cadastre um cliente antes.');
      S.form('Lançamento avulso', [{ k:'org', label:'Cliente', type:'select', full:true, options:D.clientes.map(c => [c.id, c.nome]) }, { k:'descricao', label:'Descrição', req:true, full:true, ph:'Ex.: Treinamento da equipe' },
        { k:'valor', label:'Valor (R$)', mask:'dec', req:true }, { k:'vencimento', label:'Vencimento', type:'date', req:true }, { k:'forma', label:'Forma de pagamento', type:'select', options:FORMAS }],
        { org:fin.cliente || D.clientes[0].id, vencimento:hojeISO(), forma:'pix' },
        f => (async () => { try { await q(sb.rpc('console_avulso', { p_org:f.org, p_descricao:f.descricao, p_valor:S.num(f.valor), p_vencimento:f.vencimento, p_forma:f.forma }));
          fin.mes = f.vencimento.slice(0, 7); await recarregar(); render(); S.toast('Lançamento criado'); } catch (e) { S.toast(S.erro(e)); } })(), 'Criar', { editar:true }); },
    cobMenu: (d, botao) => { const x = cob(d.id); if (!x) return;
      const it = x.situacao === 'aberta' ? [{ label:'Dar baixa', icon:'check', act:'cobBaixar', data:d }, { label:atrasada(x) ? 'Cobrar agora por e-mail' : 'Enviar a cobrança agora', icon:'email', act:'cobCobrar', data:d },
          { label:'Mudar vencimento ou valor', icon:'editar', act:'cobAlterar', data:d }, { label:'Ver avisos enviados', icon:'relogio', act:'cobAvisos', data:d }, '-', { label:'Cancelar a cobrança', icon:'lixo', act:'cobCancelar', data:d, perigo:true }]
        : x.situacao === 'paga' ? [{ label:'Ver recibo', icon:'doc', act:'cobRecibo', data:d }, { label:'Enviar recibo por e-mail', icon:'email', act:'cobReciboEmail', data:d }, { label:'Ver avisos enviados', icon:'relogio', act:'cobAvisos', data:d }, '-', { label:'Estornar a baixa', icon:'voltar', act:'cobEstornar', data:d, perigo:true }]
        : [{ label:'Reabrir a cobrança', icon:'voltar', act:'cobReabrir', data:d }];
      S.menu(botao, it); },
    cobBaixar: d => { const x = cob(d.id), c = D.clientes.find(k => k.id === x.organizacao_id) || {}, temEmail = !!(c.contrato && c.contrato.email_cobranca);
      S.form(`Dar baixa · ${esc(x.cliente)} · ${esc(x.descricao)}`, [{ k:'pago_em', label:'Pago em', type:'date', req:true }, { k:'valor', label:'Valor recebido (R$)', mask:'dec', req:true },
        { k:'observacao', label:'Observação', full:true, ph:'Ex.: Pix recebido, comprovante no e-mail' }, ...(temEmail ? [{ k:'recibo', label:`Enviar o recibo por e-mail para ${c.contrato.email_cobranca}`, type:'checkbox', full:true }] : [])],
        { pago_em:hojeISO(), valor:String(x.valor).replace('.', ','), recibo:temEmail && (D.config || {}).avisos_ligados },
        f => (async () => { try { await q(sb.rpc('console_baixar', { p_id:x.id, p_pago_em:f.pago_em, p_valor:S.num(f.valor), p_obs:f.observacao || '' }));
          let msg = 'Baixa feita'; if (f.recibo) { try { await servidor({ acao:'cobranca_recibo', id:x.id }); msg += ' · recibo enviado'; } catch (e) { msg += ` · recibo não enviado: ${S.erro(e)}`; } }
          await recarregar(); render(); S.toast(msg); } catch (e) { S.toast(S.erro(e)); } })(), 'Dar baixa', { editar:true }); },
    cobCobrar: async d => { const x = cob(d.id), c = D.clientes.find(k => k.id === x.organizacao_id) || {}, para = c.contrato && c.contrato.email_cobranca;
      if (!para) return S.toast('O contrato deste cliente não tem e-mail de cobrança. Cadastre em Clientes › cliente › Contrato.');
      if (!await S.confirmar(`Enviar agora a cobrança de ${x.descricao} (${S.brl(x.valor)}) para ${para}?`, { ok:'Enviar' })) return;
      try { const r = await servidor({ acao:'cobranca_enviar', id:x.id }); await recarregar(); render(); S.toast(`Cobrança enviada para ${r.para}`); } catch (e) { S.toast(S.erro(e)); } },
    cobRecibo: d => abrirRecibo(cob(d.id)),
    cobReciboEmail: async d => { try { const r = await servidor({ acao:'cobranca_recibo', id:d.id }); await recarregar(); render(); S.toast(`Recibo enviado para ${r.para}`); } catch (e) { S.toast(S.erro(e)); } },
    cobAlterar: d => { const x = cob(d.id);
      S.form(`${esc(x.cliente)} · ${esc(x.descricao)}`, [{ k:'vencimento', label:'Vencimento', type:'date', req:true }, { k:'valor', label:'Valor (R$)', mask:'dec', req:true }], { vencimento:x.vencimento, valor:String(x.valor).replace('.', ',') },
        f => (async () => { try { await q(sb.rpc('console_alterar_cobranca', { p_id:x.id, p_vencimento:f.vencimento, p_valor:S.num(f.valor), p_situacao:'aberta' })); await recarregar(); render(); S.toast('Cobrança alterada'); } catch (e) { S.toast(S.erro(e)); } })(), 'Salvar', { editar:true }); },
    cobCancelar: async d => { const x = cob(d.id);
      if (!await S.confirmar(`Cancelar a cobrança de ${x.descricao} (${S.brl(x.valor)}) da ${x.cliente}? Ela sai do a receber e não recebe mais avisos. Dá para reabrir depois.`, { ok:'Cancelar cobrança', voltar:'Voltar', perigo:true })) return;
      try { await q(sb.rpc('console_alterar_cobranca', { p_id:x.id, p_vencimento:x.vencimento, p_valor:x.valor, p_situacao:'cancelada' })); await recarregar(); render(); S.toast('Cobrança cancelada'); } catch (e) { S.toast(S.erro(e)); } },
    cobReabrir: async d => { const x = cob(d.id);
      try { await q(sb.rpc('console_alterar_cobranca', { p_id:x.id, p_vencimento:x.vencimento, p_valor:x.valor, p_situacao:'aberta' })); await recarregar(); render(); S.toast('Cobrança reaberta'); } catch (e) { S.toast(S.erro(e)); } },
    cobEstornar: async d => { const x = cob(d.id);
      if (!await S.confirmar(`Estornar a baixa de ${x.descricao} da ${x.cliente}? A cobrança volta a ficar em aberto.`, { ok:'Estornar', perigo:true })) return;
      try { await q(sb.rpc('console_estornar', { p_id:x.id })); await recarregar(); render(); S.toast('Baixa estornada'); } catch (e) { S.toast(S.erro(e)); } },
    cobAvisos: d => { const x = cob(d.id), NOME = { emissao:'Cobrança', lembrete:'Lembrete', hoje:'Vence hoje', atraso:'Atraso', reenvio:'Cobrança (enviada à mão)', recibo:'Recibo' };
      S.dialog(`<h2>Avisos · ${esc(x.cliente)} · ${esc(x.descricao)}</h2>${(x.avisos || []).length ? `<div class="list">${x.avisos.slice().reverse().map(a => `<div><span class="ic" aria-hidden="true">${S.svg('email')}</span><span class="tx"><b>${NOME[a.tipo] || esc(a.tipo)}</b><small>${dataHora(a.em)} · para ${esc(a.para || '')}</small></span></div>`).join('')}</div>`
        : '<p class="muted">Nenhum aviso enviado ainda para esta cobrança.</p>'}<div class="row"><span class="grow"></span><button class="btn" value="x">Fechar</button></div>`); },

    // Suporte
    supAba: d => { sup.aba = d.tab; location.hash = d.tab === 'acessos' ? '/suporte/acessos' : '/suporte'; render(); },
    chResolver: async d => { const ch = (D.chamados || []).find(x => x.id === d.id);
      try { await q(sb.rpc('console_chamado_situacao', { p_chamado:ch.id, p_situacao:'resolvido', p_prioridade:ch.prioridade })); await recarregar(); render(); S.toast(`${numCh(ch)} resolvido`); } catch (e) { S.toast(S.erro(e)); } },
    novoChamado: () => { if (!D.clientes.length) return S.toast('Nenhum cliente ainda.');
      S.form('Novo chamado', [{ k:'org', label:'Cliente', type:'select', full:true, options:D.clientes.map(c => [c.id, c.nome]) }, { k:'assunto', label:'Assunto', req:true, full:true, ph:'Ex.: Ajuda para cadastrar a segunda rádio' },
        { k:'prioridade', label:'Prioridade', type:'select', options:Object.entries(PRIO).map(([k, [n]]) => [k, n]) }, { k:'texto', label:'O que o cliente pediu', type:'textarea', req:true }],
        { org:sup.cliente || D.clientes[0].id, prioridade:'normal' },
        f => (async () => { try { const r = await q(sb.rpc('console_abrir_chamado', { p_org:f.org, p_assunto:f.assunto, p_texto:f.texto, p_prioridade:f.prioridade })); await recarregar(); location.hash = '/suporte/' + r.id; render(); S.toast(`Chamado #${String(r.numero).padStart(4, '0')} aberto`); }
          catch (e) { S.toast(S.erro(e)); } })(), 'Abrir chamado', { editar:true }); },

    // Configurações
    cfgAba: d => { abaCfg = d.tab; render(); },
    equipeNovo: () => formEquipe(),
    equipeMenu: (d, botao) => { const u = membro(d.id);
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'equipeEditar', data:d }, { label:'Gerar nova senha provisória', icon:'chave', act:'equipeSenha', data:d },
        { label:u.ativo ? 'Desativar acesso' : 'Reativar acesso', icon:'olho', act:'equipeAtivo', data:d }, '-', { label:'Excluir do Console', icon:'lixo', act:'equipeExcluir', data:d, perigo:true }]); },
    equipeEditar: d => formEquipe(membro(d.id)),
    equipeSenha: async d => { const u = membro(d.id);
      if (!await S.confirmar(`Gerar uma nova senha provisória para ${u.nome}? A senha atual deixa de valer e, no próximo acesso, a pessoa cria uma nova.`, { ok:'Gerar senha' })) return;
      try { const r = await servidor({ acao:'equipe_senha', usuario_id:u.id }); await recarregar(); render(); mostrarAcessoConsole(u, r.senha, 'Nova senha provisória'); } catch (e) { S.toast(S.erro(e)); } },
    equipeAtivo: async d => { const u = membro(d.id), ativo = !u.ativo;
      if (!await S.confirmar(ativo ? `Reativar o acesso de ${u.nome} ao Console?` : `Desativar o acesso de ${u.nome} ao Console? A pessoa é desconectada na hora e não entra mais até ser reativada.`, { ok:ativo ? 'Reativar' : 'Desativar', perigo:!ativo })) return;
      try { await servidor({ acao:'equipe_ativo', usuario_id:u.id, ativo }); await recarregar(); render(); S.toast(ativo ? 'Acesso reativado' : 'Acesso desativado'); } catch (e) { S.toast(S.erro(e)); } },
    equipeExcluir: async d => { const u = membro(d.id);
      if (!await S.confirmar(`Excluir ${u.nome} do Console? A pessoa sai da equipe e a conta de entrada é apagada (ou fica bloqueada, se já entrou como suporte em algum cliente, para manter o registro).`, { ok:'Excluir', perigo:true })) return;
      try { await servidor({ acao:'equipe_excluir', usuario_id:u.id }); await recarregar(); render(); S.toast(`${u.nome} saiu do Console`); } catch (e) { S.toast(S.erro(e)); } },
    enviarAcessoConsole: async d => { try { const r = await servidor({ acao:'equipe_enviar_acesso', usuario_id:d.id, senha:d.senha }); S.toast(`E-mail enviado para ${r.email}`); } catch (e) { S.toast(S.erro(e)); } }
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
  document.addEventListener('change', async e => { const t = e.target;
    if (t.matches('[data-fin-cliente]')) { fin.cliente = t.value; render(); return; }
    if (t.matches('[data-sup-filtro]')) { sup[t.dataset.supFiltro] = t.value; render(); return; }
    if (t.matches('[data-ch-campo]')) { const box = t.closest('.c-ch-det'), sit = box.querySelector('[data-ch-campo=situacao]').value, pr = box.querySelector('[data-ch-campo=prioridade]').value;
      try { await q(sb.rpc('console_chamado_situacao', { p_chamado:t.dataset.id, p_situacao:sit, p_prioridade:pr })); await recarregar(); render(); S.toast('Chamado atualizado'); } catch (err) { S.toast(S.erro(err)); } } });
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
    if (f.dataset.form === 'senha') { e.preventDefault(); const v = Object.fromEntries(new FormData(f)), b = f.querySelector('button.pri');
      if (v.senha.length < 8 || !/[A-Za-z]/.test(v.senha) || !/\d/.test(v.senha)) return S.toast('Use pelo menos 8 caracteres, com letras e números.');
      if (v.senha !== v.senha2) return S.toast('As duas senhas não são iguais.');
      b.disabled = true; try { await contaServidor({ acao:'minha_senha', senha:v.senha }); await recarregar(); S.toast('Senha criada. Bem-vindo ao Console!'); render(); } catch (err) { b.disabled = false; S.toast(S.erro(err)); }
      return; }
    if (f.dataset.form === 'resposta') { e.preventDefault(); const texto = f.texto.value.trim(), b = f.querySelector('button.pri'), id = f.dataset.id;
      if (!texto) { f.texto.focus(); return S.toast('Escreva a resposta.'); }
      b.disabled = true;
      try { await q(sb.rpc('responder_chamado', { p_chamado:id, p_texto:texto })); delete sup.msgs[id];
        servidor({ acao:'chamado_aviso', id }).catch(err => S.toast(`Resposta salva, mas o e-mail não saiu: ${S.erro(err)}`));
        await recarregar(); render(); S.toast('Resposta enviada'); } catch (err) { b.disabled = false; S.toast(S.erro(err)); }
      return; }
    if (f.dataset.form === 'config') { e.preventDefault(); const v = Object.fromEntries(new FormData(f)), p = {};
      if ('empresa' in v) Object.assign(p, { empresa:v.empresa, cnpj:v.cnpj, pix_chave:v.pix_chave, email_resposta:v.email_resposta, dados_bancarios:v.dados_bancarios, multa:S.num(v.multa), juros:S.num(v.juros) });
      else Object.assign(p, { avisos_ligados:!!f.avisos_ligados.checked, aviso_dias_antes:Number(v.aviso_dias_antes) || 5, aviso_dias_depois:Number(v.aviso_dias_depois) || 3 });
      if (p.email_resposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email_resposta)) return S.toast('Confira o e-mail de respostas.');
      try { await q(sb.rpc('console_salvar_config', { p })); await recarregar(); render(); S.toast('Configurações salvas'); } catch (err) { S.toast(S.erro(err)); }
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

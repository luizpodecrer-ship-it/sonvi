// SONVI · casca do app: barra lateral conforme o perfil, título da tela e eventos.
(() => {
  const { esc } = S;
  // Cada perfil enxerga só os módulos do seu trabalho; quem garante de verdade é o banco.
  const MUSIC = S.APP === 'music';
  // [tela, nome, perfis, endereço externo]. O Sonvi Music abre em outra aba, com login próprio.
  const NAV = MUSIC ? S.MUSIC_NAV : [
    ['geral', 'Dashboard Gestão', ['diretor']],   // só o diretor: todos os veículos (24/10/2026)
    ['combos', 'Combos', ['diretor']],           // combos do grupo (itens de vários veículos), só no Dashboard Gestão
    ['dashboard', 'Dashboard', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['followup', 'Follow-up', ['diretor', 'gerente', 'consultor']],
    ['clientes', 'Clientes', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['propostas', 'Propostas', ['diretor', 'gerente', 'consultor']],
    ['pis', 'PIs', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['opec', 'OPEC', ['diretor', 'opec']],
    ['vendas', 'Vendas', ['diretor', 'financeiro']],  // no lugar do Financeiro (27/10/2026): quem fatura e recebe é o financeiro de cada veículo
    ['produtos', 'Produtos', ['diretor', 'gerente', 'consultor']],
    ['admin', 'Administração', ['diretor']],
    ['chamados', 'Suporte', ['diretor']],        // chamados e acessos da equipe SONVI, só no Dashboard Gestão (25/10/2026)
    ['admin', 'Usuários', ['gerente']]]; // o gerente cadastra a equipe das rádios dele
  const SOON = [];

  // Quem só tem perfil da programação musical (programador, locutor) não tem tela no SONVI. O Sonvi Music está parado
  // desde 29/10/2026 e não tem mais link dentro do SONVI.
  S.views.soMusic = () => ({ title:`<span class="sub">${esc(S.veh() ? S.veh().nome : '')}</span>Olá, ${esc((S.me.nome || S.me.email).split(' ')[0])}`, actions:'',
    body:`<div class="card empty"><b>Nada para você aqui por enquanto</b>O seu acesso é da programação musical, que está parada no momento. Fale com o diretor se precisar de outro acesso.</div>` });

  let ultima = ''; // última tela desenhada: a animação de entrada só roda quando a tela muda
  let ultimoSide = ''; // barra lateral desenhada (sem o item marcado)

  // Faixa do acesso de suporte: quem é do SONVI vê sempre que está dentro do ambiente de um cliente e até que horas
  let fimSuporte = null;
  const faixaSuporte = sup => {
    let fx = document.getElementById('faixa-suporte');
    document.body.classList.toggle('com-suporte', !!sup);
    if (!sup) { if (fx) fx.remove(); return; }
    if (!fx) { fx = document.createElement('div'); fx.id = 'faixa-suporte'; fx.className = 'faixa-suporte'; document.getElementById('main').prepend(fx); }
    const fim = new Date(sup.fim), hora = fim.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    fx.innerHTML = `<span class="fs-tx">${S.svg('chave', 16)}<b>Suporte SONVI</b><span>${esc((S.ctx.org || {}).nome || '')} · termina às ${hora}</span></span><button type="button" class="btn sm" data-act="encerrarSuporte">Encerrar suporte</button>`;
    // Quando o horário acaba, o banco já não mostra mais nada: volta para a tela de suporte
    if (fimSuporte !== sup.id) { fimSuporte = sup.id; setTimeout(() => { if (S.ctx && S.ctx.suporte && S.ctx.suporte.id === sup.id) { S.toast('O acesso de suporte terminou.'); S.iniciar(); } }, Math.max(0, fim - Date.now()) + 1000); }
  };

  // Menu fluido do Dashboard Gestão e de todos os veículos (o mesmo do Console, 25/10/2026; divisor antes de Administração só no Dashboard Gestão): o realce desliza até o item sob o mouse ou o foco,
  // o ícone cresce e ganha a cor do item; na troca de tela o realce sai de onde estava e vai até o item novo. Só no computador.
  let realceY = null;
  const menuFluido = (side, liga, divisor) => {
    const nav = side.querySelector('nav'); if (!nav) return;
    nav.classList.toggle('fluido', liga);
    if (!liga) { realceY = null; return; }
    let r = nav.querySelector('.realce');
    if (!r) { r = document.createElement('span'); r.className = 'realce'; r.setAttribute('aria-hidden', 'true'); nav.prepend(r); }
    const itens = [...nav.querySelectorAll('a')];
    if (divisor) itens.forEach(a => { if (a.dataset.ico === 'admin' && !(a.previousElementSibling && a.previousElementSibling.classList.contains('div'))) a.insertAdjacentHTML('beforebegin', '<span class="div" aria-hidden="true"></span>'); });
    const on = () => nav.querySelector('a.on');
    const ir = (a, sem) => { if (!a) { r.style.opacity = 0; return; } if (sem) r.style.transition = 'none';
      r.style.opacity = 1; r.style.transform = `translateY(${a.offsetTop}px)`; r.style.height = a.offsetHeight + 'px'; if (sem) { r.offsetHeight; r.style.transition = ''; }
      itens.forEach(x => x.classList.toggle('quente', x === a && !x.classList.contains('on'))); r.classList.toggle('no-on', a === on()); if (a === on()) realceY = a.offsetTop; };
    const a0 = on();
    if (realceY !== null && a0 && realceY !== a0.offsetTop) { r.style.transition = 'none'; r.style.opacity = 1; r.style.height = a0.offsetHeight + 'px'; r.style.transform = `translateY(${realceY}px)`; r.offsetHeight; r.style.transition = ''; requestAnimationFrame(() => ir(a0)); }
    else ir(a0, true);
    if (nav.dataset.fluido) return; nav.dataset.fluido = '1';
    const volta = () => { if (!nav.classList.contains('fluido')) return; ir(on()); itens.forEach(x => x.classList.remove('quente')); };
    nav.addEventListener('mouseover', e => { const a = e.target.closest('a'); if (a && nav.classList.contains('fluido')) ir(a); });
    nav.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a && nav.classList.contains('fluido')) ir(a); });
    nav.addEventListener('mouseleave', volta);
    nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) volta(); });
  };

  S.render = () => {
    const content = document.getElementById('content'), bar = document.getElementById('bar');
    const acesso = S.carregando ? `<div class="carregando"><div style="display:grid;justify-items:center;gap:18px"><img src="img/simbolo.svg" width="66" height="78" alt="${MUSIC ? 'Sonvi Music' : 'SONVI'}"><div class="eq" aria-label="Carregando"><span></span><span></span><span></span><span></span><span></span></div></div></div>` : S.telaDeAcesso();
    document.body.classList.toggle('fora', !!acesso);
    faixaSuporte(!acesso && S.ctx && S.ctx.suporte);
    if (acesso) { S.temaRadio(null); document.getElementById('side').innerHTML = ''; ultimoSide = ''; bar.innerHTML = ''; content.innerHTML = acesso; document.title = MUSIC ? 'Sonvi Music' : 'SONVI'; ultima = ''; return; }

    // Diretor: entra pelo Dashboard Gestão (todos os veículos); lá o menu fica enxuto e não há veículo aberto
    const DIR = !MUSIC && !!(S.me && S.me.diretor), bruto = location.hash.replace(/^#\/?/, '').split('/')[0];
    let { view, id } = S.route();
    if (DIR && !bruto) view = 'geral';
    // Administração e Combos do diretor vivem no Dashboard Gestão (24/10/2026): abrir qualquer uma delas leva o menu para lá
    if (['geral', 'admin', 'combos', 'chamados', 'agencias'].includes(view)) S.ui.emGeral = DIR; else S.ui.emGeral = false;
    const geral = DIR && S.ui.emGeral, semVeiculo = !S.ui.vehicleId;
    const itens = NAV.filter(n => n[2].includes(S.perfil) && (!semVeiculo || ['admin', 'geral', 'combos', 'chamados', 'agencias'].includes(n[0])) && (!geral || ['geral', 'combos', 'agencias', 'admin', 'chamados'].includes(n[0])) && !(n[0] === 'combos' && !geral) && !(n[0] === 'agencias' && !geral) && !(n[0] === 'chamados' && !geral) && !(n[0] === 'geral' && !geral && !semVeiculo) && !(n[0] === 'admin' && DIR && !geral && !semVeiculo)), telas = itens.filter(n => !n[3]);
    if (!telas.some(n => n[0] === view) && view !== 'pi' && !(view === 'importar' && telas.some(n => n[0] === 'pis') && S.pode('diretor', 'gerente', 'consultor'))) view = telas.length ? telas[0][0] : 'soMusic';
    if (semVeiculo && !(DIR && ['geral', 'admin', 'combos', 'chamados', 'agencias'].includes(view))) view = MUSIC ? (telas[0] || ['hoje'])[0] : DIR ? 'geral' : 'admin';
    S.ui.view = view;   // tela realmente desenhada (com o hash vazio, o diretor vê o Dashboard Gestão)
    S.temaRadio(semVeiculo || geral ? null : S.veh());
    const active = view === 'pi' || view === 'importar' ? 'pis' : view, waiting = S.db.pis.filter(p => p.status === 'opec').length, atrasos = !MUSIC && S.fuAtrasados && !semVeiculo ? S.fuAtrasados() : 0, veh = semVeiculo ? null : S.veh();
    const inicio = MUSIC ? 'hoje' : DIR ? 'geral' : 'dashboard';
    const side = document.getElementById('side'), sideHtml = `<a class="brand" href="#/${inicio}" data-go="/${inicio}" aria-label="${MUSIC ? 'Sonvi Music' : DIR ? 'SONVI · Dashboard Gestão' : 'SONVI · Dashboard'}">${S.logo()}<img class="so-simbolo" src="img/simbolo.svg" width="66" height="78" alt=""></a>
      <button type="button" class="recolher" data-act="menuRecolher" aria-controls="side">${S.svg('recolher')}${S.svg('expandir')}<span class="sr">Recolher menu</span></button>
      ${semVeiculo || geral ? '' : S.seletorVeiculo(veh, DIR)}
      <nav aria-label="Menu principal">${itens.map(([k, n, , href], i) => { const ex = itens.length > 5 && i >= 4 ? ' extra' : ''; return href ? `<a href="${href}" target="_blank" rel="noopener" title="${n} (abre em outra aba)" class="externo${ex}" data-ico="${k}">${S.svg(k)}${n}${S.svg('abrir', 14)}</a>`
        : `<a href="#/${k}" data-go="/${k}" title="${n}" data-ico="${k}" class="${(active === k ? 'on' : '') + ex}"${active === k ? ' aria-current="page"' : ''}>${S.svg(k)}${n}${k === 'opec' && waiting ? `<span class="badge">${waiting}</span>` : ''}${k === 'followup' && atrasos ? `<span class="badge alerta" title="Retornos atrasados">${atrasos}</span>` : ''}</a>`; }).join('')}
      ${itens.length > 5 ? `<button type="button" class="nav-mais" data-act="navMais" aria-haspopup="menu">${S.svg('mais3')}Mais</button>` : ''}
      ${SOON.length ? '<div class="sec">Em breve</div>' : ''}${SOON.map(n => `<span class="soon">${S.svg('programacao')}${n}</span>`).join('')}</nav>
      <div class="eu"><span class="av" aria-hidden="true">${esc(S.iniciais(S.me.nome || S.me.email))}</span><div class="eu-conta" data-act="contaMenu" role="button" title="Minha conta" aria-haspopup="menu"><b title="${esc(S.me.nome || S.me.email)}">${esc(S.me.nome || S.me.email)}</b><small>${S.PERFIS[S.perfil] || ''}${S.perfil === 'diretor' ? ' · todos os veículos' : ''}</small></div><button class="btn sm" data-act="sair">Sair</button></div>`;
    // Mesma barra com outro item marcado: só troca a marcação (o logo e os itens não são recriados e nada pisca)
    const molde = sideHtml.replace(/ class="on( extra)?" aria-current="page"/g, ' class="$1"').replace(/class=" extra"/g, 'class="extra"');
    if (molde === ultimoSide) side.querySelectorAll('nav a[data-go]').forEach(a => { const on = a.dataset.go === '/' + active; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    else { side.innerHTML = sideHtml; ultimoSide = molde; }
    menuFluido(side, !MUSIC, geral);
    const mais = side.querySelector('.nav-mais'); if (mais) { mais.classList.toggle('on', !!side.querySelector('nav a.extra.on'));
      const bx = side.querySelector('nav a.extra .badge'), bm = mais.querySelector('.badge'); if (bm) bm.remove(); if (bx) mais.insertAdjacentHTML('beforeend', `<span class="badge" aria-label="${bx.textContent} pendentes">${bx.textContent}</span>`); }
    const v = (S.views[view] || S.views.soMusic)(id), chave = `${view}/${view === 'clientes' ? '' : id || ''}/${S.ui.vehicleId}/${S.ui.tab}`; // abas dentro da mesma tela não animam
    const anima = chave !== ultima; ultima = chave;
    bar.classList.toggle('entra', anima); content.classList.toggle('entra', anima);
    // O PI usa a largura toda da tela; a barra lateral fica só com os ícones
    // No Sonvi Music a barra lateral nunca recolhe: ao trocar de item nada sai do lugar
    const largo = !MUSIC && view === 'pi'; bar.classList.toggle('largo', largo); content.classList.toggle('largo', largo);
    // Menu recolhido (só ícones): a escolha da pessoa vale em todas as telas; sem escolha, só o PI recolhe sozinho
    const pref = menuPref(), recolhido = pref ? pref === 'recolhido' : largo;
    document.body.classList.toggle('compacto', recolhido);
    const rb = side.querySelector('.recolher'); if (rb) { rb.setAttribute('aria-expanded', String(!recolhido)); rb.title = recolhido ? 'Abrir menu' : 'Recolher menu'; rb.querySelector('.sr').textContent = recolhido ? 'Abrir menu' : 'Recolher menu'; }
    bar.innerHTML = `<h1>${v.title}</h1>${v.actions}`;
    content.innerHTML = v.body;
    if (S.poeRolos) S.poeRolos();
    if (S.segDesliza) S.segDesliza(content);
    if (S.menuDesliza) S.menuDesliza(content);   // números que rolam e ficam montados entre desenhos (S.roloFixo)
    requestAnimationFrame(() => content.querySelectorAll('.scroll').forEach(sc => { if (sc.scrollWidth > sc.clientWidth + 2 && !sc.querySelector('a[href], button, input, select, textarea, [tabindex]')) { const t = sc.closest('.card') && sc.closest('.card').querySelector('h2'); sc.tabIndex = 0; sc.setAttribute('role', 'region'); sc.setAttribute('aria-label', (t ? t.textContent.trim() + ': ' : '') + 'tabela, role para o lado para ver tudo'); } }));
    document.title = (MUSIC ? 'Sonvi Music' : 'SONVI') + (view === 'geral' ? ' · Dashboard Gestão' : semVeiculo || geral ? '' : ' · ' + veh.nome);
  };

  // Carrega tudo da nuvem e desenha
  S.iniciar = async () => {
    S.carregando = true; if (S.geralLimpar) S.geralLimpar(); S.render();
    try { await S.recarregar(); } catch (e) { console.error(e); S.toast(S.erro(e)); }
    S.carregando = false; S.render();
  };

  // Tudo o que é clicável também funciona pelo teclado: linhas, itens de lista e links internos recebem Tab
  // e abrem com Enter (ou Espaço, nos que fazem papel de botão). Vale para o que for desenhado depois, inclusive diálogos.
  const CLICAVEIS = '[data-act]:not(button):not(input):not(select):not(textarea):not(label):not([tabindex]), [data-go]:not(a[href]):not(button):not([tabindex])';
  const prepararTeclado = raiz => (raiz.querySelectorAll ? raiz.querySelectorAll(CLICAVEIS) : []).forEach(el => {
    if (el.tagName === 'A' && !el.hasAttribute('href') && el.dataset.go) { el.setAttribute('href', '#' + el.dataset.go); return; }
    el.tabIndex = 0; if (el.tagName !== 'TR' && !el.getAttribute('role')) el.setAttribute('role', 'button');
  });
  new MutationObserver(lista => lista.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { prepararTeclado(n); if (n.matches && n.matches(CLICAVEIS)) prepararTeclado(n.parentNode); } })))
    .observe(document.body, { childList:true, subtree:true });
  // Celular: o que não cabe na barra de abas fica no "Mais"
  // Preferência do menu lateral por pessoa (só a aparência; nada de conteúdo): 'recolhido' ou 'aberto'
  const chaveMenu = () => `sonvi-menu-${MUSIC ? 'music-' : ''}${(S.me && S.me.id) || ''}`;
  let menuMem = ''; // vale até recarregar quando o navegador não guarda nada
  const menuPref = () => { try { return localStorage.getItem(chaveMenu()) || menuMem; } catch (e) { return menuMem; } };
  S.actions.menuRecolher = () => {
    const agora = !document.body.classList.contains('compacto');
    menuMem = agora ? 'recolhido' : 'aberto'; try { localStorage.setItem(chaveMenu(), menuMem); } catch (e) { /* sem armazenamento: vale até recarregar */ }
    document.body.classList.toggle('compacto', agora); document.body.classList.add('mexendo-menu');
    setTimeout(() => document.body.classList.remove('mexendo-menu'), 320);
    const rb = document.querySelector('#side .recolher'); if (rb) { rb.setAttribute('aria-expanded', String(!agora)); rb.title = agora ? 'Abrir menu' : 'Recolher menu'; rb.querySelector('.sr').textContent = rb.title; rb.focus(); }
  };
  S.actions.navMais = (d, botao) => S.menu(botao, [...document.querySelectorAll('#side nav a.extra')].map(a => ({ label:(a.getAttribute('title') || a.textContent.trim()).replace(' (abre em outra aba)', '') + (a.querySelector('.badge') ? ` (${a.querySelector('.badge').textContent})` : ''), icon:a.dataset.ico,
    act:a.dataset.go ? 'navIr' : 'navAbrir', data:a.dataset.go ? { go:a.dataset.go } : { href:a.getAttribute('href') } })));
  S.actions.navIr = d => S.go(d.go);
  S.actions.navAbrir = d => window.open(d.href, '_blank', 'noopener');
  // "Pular para o conteúdo": primeiro item do Tab em cada tela
  S.actions.pular = () => { const c = document.getElementById('content'); c.tabIndex = -1; c.focus(); };
  document.addEventListener('keydown', e => {
    const el = e.target; if (!el.matches || !el.matches('[data-act][tabindex], [data-go][tabindex]')) return;
    if (e.key === 'Enter' || (e.key === ' ' && el.getAttribute('role') === 'button')) { e.preventDefault(); el.click(); }
  });
  document.addEventListener('click', e => {
    // Ctrl/Cmd/Shift+clique ou botão do meio num link do menu: o navegador abre em outra aba ou janela
    const link = e.target.closest('a[href^="#/"]'); if (link && (e.metaKey || e.ctrlKey || e.shiftKey || e.button)) return;
    const act = e.target.closest('[data-act]');
    if (act) { if (act.tagName === 'A') e.preventDefault(); S.actions[act.dataset.act](act.dataset, act); return; }
    const go = e.target.closest('[data-go]');
    const ctl = e.target.closest('input, select, button'); // um botão dentro de uma linha clicável não abre a linha; o próprio botão com data-go abre
    if (go && (!ctl || ctl === go)) { if (go.tagName === 'A') e.preventDefault(); if (go.dataset.go.startsWith('/pi/')) S.ui.tab = 'detalhes'; if (!go.dataset.go.startsWith('/pi')) S.ui.q = ''; S.go(go.dataset.go); }
  });
  // Alterações que ainda não foram salvas impedem trocar de veículo (seletor ou Dashboard Gestão)
  const pendente = () => S.piEd && S.piEd.sujo ? 'Salve ou cancele as alterações do PI antes de trocar de veículo.'
    : S.propSujo && S.propSujo() ? 'Salve ou descarte as alterações da proposta antes de trocar de veículo.'
    : S.tpSujo && S.tpSujo() ? 'Salve ou descarte as alterações da tabela de preços antes de trocar de veículo.' : '';
  // Dashboard Gestão → abre um veículo (carrega só os dados dele) e vai para o Dashboard dele
  S.abrirVeiculo = async (vid, destino = '/dashboard') => {
    if (vid !== S.ui.vehicleId) { const msg = pendente(); if (msg) return S.toast(msg); }
    S.ui.emGeral = false; S.ui.q = '';
    if (vid !== S.ui.vehicleId) {
      S.ui.vehicleId = vid; S.guardarRadio(vid);
      S.carregando = true; S.render();
      try { await S.carregarVeiculo(); } catch (err) { S.toast(S.erro(err)); }
      S.carregando = false;
    }
    S.go(destino);
  };
  // Troca de veículo (seletor do alto do menu, atalho Alt + número): busca na nuvem só os dados dele.
  // '__geral' (só o diretor) volta ao Dashboard Gestão. Alterações não salvas impedem a troca.
  S.trocarVeiculo = async vid => {
    if (vid === '__geral') { const msg = pendente(); if (msg) return S.toast(msg); return S.go('/geral'); }
    if (!vid || vid === S.ui.vehicleId) return;
    const msg = pendente(); if (msg) return S.toast(msg);
    S.ui.vehicleId = vid; S.ui.q = ''; S.guardarRadio(vid);
    if (S.route().view === 'pi') location.hash = '/pis';
    S.carregando = true; S.render();
    try { await S.carregarVeiculo(); } catch (err) { S.toast(S.erro(err)); }
    S.carregando = false; S.render();
  };
  document.addEventListener('change', async e => {
    const el = e.target, d = el.dataset;
    if (el.closest('dialog')) return;
    // Diretor: a última opção do seletor volta ao Dashboard Gestão (24/10/2026)
    if (d.ui === 'vehicleId' && el.value === '__geral') { el.value = S.ui.vehicleId; const msg = pendente(); if (msg) return S.toast(msg); return S.go('/geral'); }
    if (d.ui === 'vehicleId' && pendente()) { el.value = S.ui.vehicleId; return S.toast(pendente()); }
    if (d.ui === 'vehicleId') return S.trocarVeiculo(el.value);
    if (d.ui) { S.ui[d.ui] = el.value; return S.render(); }
    // Campo de data: enquanto a pessoa digita, o navegador avisa a cada pedaço (dia, mês, cada número do ano), e um ano
    // pela metade virava "0002" e a tela se redesenhava no meio da digitação (27/10/2026). Só vale ao sair do campo.
    if (el.type === 'date' && document.activeElement === el) {
      if (!el.dataset.esperaSair) { el.dataset.esperaSair = '1';
        el.addEventListener('blur', () => { delete el.dataset.esperaSair; if (el.isConnected) S.changes.some(handler => handler(el, el.dataset)); }, { once:true }); }
      return;
    }
    S.changes.some(handler => handler(el, d));
  });
  window.addEventListener('hashchange', () => { if (!S.carregando) S.render(); window.scrollTo(0, 0); });
  // Celular ou computador: algumas telas (como o PI) mudam de forma, então redesenha ao cruzar o limite
  const mqCel = window.matchMedia('(max-width: 820px)'); S.celular = mqCel.matches;
  mqCel.addEventListener('change', e => { S.celular = e.matches; if (!S.carregando && S.me) S.render(); });

  S.iniciar();
})();

// SONVI · casca do app: barra lateral conforme o perfil, título da tela e eventos.
(() => {
  const { esc } = S;
  const ICON = {
    painel:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    agenda:'<rect x="3.500" y="5" width="17" height="15.500" rx="3"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
    clientes:'<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.600-3.600 3.200-5.500 6.500-5.500s5.900 1.900 6.500 5.500"/><circle cx="17.500" cy="9" r="2.500"/><path d="M17 14.500c2.400.200 4 1.700 4.500 4.500"/>',
    pis:'<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    opec:'<circle cx="12" cy="12" r="9"/><path d="M8 12.500l2.800 2.800L16 9.800"/>',
    financeiro:'<circle cx="12" cy="12" r="9"/><path d="M14.500 9.300c-.500-.900-1.400-1.300-2.500-1.300-1.500 0-2.500.800-2.500 2s1 1.700 2.500 2 2.500.800 2.500 2-1 2-2.500 2c-1.200 0-2.100-.500-2.600-1.400M12 6.500V8M12 16v1.500"/>',
    cadastros:'<path d="M4 6h16M4 12h16M4 18h10"/>',
    admin:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>' };
  // Cada perfil enxerga só os módulos do seu trabalho; quem garante de verdade é o banco.
  const NAV = [
    ['painel', 'Painel', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['agenda', 'Agenda', ['diretor', 'gerente', 'consultor']],
    ['clientes', 'Clientes', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['pis', 'Pedidos', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['opec', 'OPEC', ['diretor', 'opec']],
    ['financeiro', 'Financeiro', ['diretor', 'financeiro']],
    ['cadastros', 'Tabelas', ['diretor', 'gerente']],
    ['admin', 'Administração', ['diretor']]];
  const SOON = ['Programação musical'];

  S.render = () => {
    const acesso = S.carregando ? '<div class="auth card"><div class="brand">SONVI</div><p class="muted">Carregando…</p></div>' : S.telaDeAcesso();
    document.body.classList.toggle('fora', !!acesso);
    if (acesso) { document.getElementById('side').innerHTML = ''; document.getElementById('bar').innerHTML = ''; document.getElementById('content').innerHTML = acesso; document.title = 'SONVI'; return; }

    const semVeiculo = !S.ui.vehicleId, itens = NAV.filter(n => n[2].includes(S.perfil) && (!semVeiculo || n[0] === 'admin'));
    let { view, id } = S.route();
    if (!itens.some(n => n[0] === view) && view !== 'pi') view = itens[0][0];
    if (semVeiculo) view = 'admin';
    const active = view === 'pi' ? 'pis' : view, waiting = S.db.pis.filter(p => p.status === 'opec').length;
    document.getElementById('side').innerHTML = `<div class="brand">SONVI</div>
      ${semVeiculo ? '' : `<label class="veh"><span class="dot" style="background:${esc(S.veh().cor)}"></span><select data-ui="vehicleId" aria-label="Veículo">${S.db.veiculos.map(v => `<option value="${v.id}"${v.id === S.ui.vehicleId ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>`}
      <nav>${itens.map(([k, n]) => `<a data-go="/${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICON[k]}</svg>${n}${k === 'opec' && waiting ? `<span class="badge">${waiting}</span>` : ''}</a>`).join('')}
      <div class="sec">Em breve</div>${SOON.map(n => `<span class="soon">${n}</span>`).join('')}</nav>
      <div class="eu"><div><b>${esc(S.me.nome || S.me.email)}</b><small>${S.PERFIS[S.perfil] || ''}</small></div><button class="btn sm" data-act="sair">Sair</button></div>`;
    const v = S.views[view](id);
    document.getElementById('bar').innerHTML = `<h1>${v.title}</h1>${v.actions}`;
    document.getElementById('content').innerHTML = v.body;
    document.title = 'SONVI' + (semVeiculo ? '' : ' · ' + S.veh().nome);
  };

  // Carrega tudo da nuvem e desenha
  S.iniciar = async () => {
    S.carregando = true; S.render();
    try { await S.recarregar(); } catch (e) { console.error(e); S.toast(S.erro(e)); }
    S.carregando = false; S.render();
  };

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) { if (act.tagName === 'A') e.preventDefault(); S.actions[act.dataset.act](act.dataset, act); return; }
    const go = e.target.closest('[data-go]');
    if (go && !e.target.closest('input, select, button')) { if (go.dataset.go.startsWith('/pi/')) S.ui.tab = 'detalhes'; if (!go.dataset.go.startsWith('/pi')) S.ui.q = ''; S.go(go.dataset.go); }
  });
  document.addEventListener('change', async e => {
    const el = e.target, d = el.dataset;
    if (el.closest('dialog')) return;
    if (d.ui === 'vehicleId') { // troca de rádio: busca na nuvem só os dados dela
      S.ui.vehicleId = el.value; S.ui.q = '';
      if (S.route().view === 'pi') location.hash = '/pis';
      S.carregando = true; S.render();
      try { await S.carregarVeiculo(); } catch (err) { S.toast(S.erro(err)); }
      S.carregando = false; return S.render();
    }
    if (d.ui) { S.ui[d.ui] = el.value; return S.render(); }
    S.changes.some(handler => handler(el, d));
  });
  window.addEventListener('hashchange', () => { if (!S.carregando) S.render(); window.scrollTo(0, 0); });

  S.iniciar();
})();

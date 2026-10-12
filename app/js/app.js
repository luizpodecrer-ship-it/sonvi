// SONVI · casca do app: barra lateral conforme o perfil, título da tela e eventos.
(() => {
  const { esc } = S;
  // Cada perfil enxerga só os módulos do seu trabalho; quem garante de verdade é o banco.
  const NAV = [
    ['painel', 'Painel', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['agenda', 'Agenda', ['diretor', 'gerente', 'consultor']],
    ['clientes', 'Clientes', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['pis', 'PIs', ['diretor', 'gerente', 'consultor', 'opec', 'financeiro']],
    ['opec', 'OPEC', ['diretor', 'opec']],
    ['financeiro', 'Financeiro', ['diretor', 'financeiro']],
    ['cadastros', 'Tabelas', ['diretor', 'gerente']],
    ['admin', 'Administração', ['diretor']]];
  const SOON = ['Programação musical'];

  let ultima = ''; // última tela desenhada: a animação de entrada só roda quando a tela muda

  S.render = () => {
    const content = document.getElementById('content'), bar = document.getElementById('bar');
    const acesso = S.carregando ? `<div class="carregando"><div style="display:grid;justify-items:center;gap:18px"><img src="img/simbolo.svg" alt="SONVI"><div class="eq" aria-label="Carregando"><span></span><span></span><span></span><span></span><span></span></div></div></div>` : S.telaDeAcesso();
    document.body.classList.toggle('fora', !!acesso);
    if (acesso) { document.getElementById('side').innerHTML = ''; bar.innerHTML = ''; content.innerHTML = acesso; document.title = 'SONVI'; ultima = ''; return; }

    const semVeiculo = !S.ui.vehicleId, itens = NAV.filter(n => n[2].includes(S.perfil) && (!semVeiculo || n[0] === 'admin'));
    let { view, id } = S.route();
    if (!itens.some(n => n[0] === view) && view !== 'pi') view = itens[0][0];
    if (semVeiculo) view = 'admin';
    const active = view === 'pi' ? 'pis' : view, waiting = S.db.pis.filter(p => p.status === 'opec').length, veh = semVeiculo ? null : S.veh();
    document.getElementById('side').innerHTML = `<a class="brand" data-go="/painel" aria-label="SONVI · Painel">${S.logo()}</a>
      ${semVeiculo ? '' : `<label class="veh" title="Trocar de rádio">${S.vav(veh)}<span class="vt"><b>${esc(veh.nome)}</b><small>${esc([veh.frequencia, veh.cidade].filter(Boolean).join(' · ') || 'Rádio selecionada')}</small></span>${S.svg('baixo')}<select data-ui="vehicleId" aria-label="Rádio">${S.db.veiculos.map(v => `<option value="${v.id}"${v.id === S.ui.vehicleId ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>`}
      <nav aria-label="Menu principal">${itens.map(([k, n]) => `<a data-go="/${k}" class="${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}>${S.svg(k)}${n}${k === 'opec' && waiting ? `<span class="badge">${waiting}</span>` : ''}</a>`).join('')}
      <div class="sec">Em breve</div>${SOON.map(n => `<span class="soon">${S.svg('programacao')}${n}</span>`).join('')}</nav>
      <div class="eu"><span class="av" aria-hidden="true">${esc(S.iniciais(S.me.nome || S.me.email))}</span><div><b>${esc(S.me.nome || S.me.email)}</b><small>${S.PERFIS[S.perfil] || ''}${S.perfil === 'diretor' ? ' · todas as rádios' : ''}</small></div><button class="btn sm" data-act="sair">Sair</button></div>`;
    const v = S.views[view](id), chave = `${view}/${id || ''}/${S.ui.vehicleId}/${S.ui.tab}`;
    const anima = chave !== ultima; ultima = chave;
    bar.classList.toggle('entra', anima); content.classList.toggle('entra', anima);
    bar.innerHTML = `<h1>${v.title}</h1>${v.actions}`;
    content.innerHTML = v.body;
    document.title = 'SONVI' + (semVeiculo ? '' : ' · ' + veh.nome);
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

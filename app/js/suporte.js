// SONVI · Falar com o suporte (rota #/suporte, menu da conta → "Falar com o suporte").
// O cliente abre chamados para a equipe SONVI e acompanha a conversa. Quem abriu vê os próprios; o diretor vê os da empresa.
// Banco: abrir_chamado, responder_chamado, chamado_mensagens e a tabela console_chamados (RLS por ve_chamado).
// Função de borda "console", ação chamado_aviso: avisa a equipe SONVI por e-mail (e o cliente quando o suporte responde).
(() => {
  const { esc } = S;
  const st = { lista:null, msgs:{}, carregando:false };
  const SIT = { aberto:['Aguardando o suporte', 'orange'], andamento:['Em andamento', 'sky'], aguardando:['Aguardando você', 'purple'], resolvido:['Resolvido', 'green'] };
  const PRIO = { baixa:'Baixa', normal:'Normal', alta:'Alta', urgente:'Urgente' };
  const num = ch => '#' + String(ch.numero).padStart(4, '0');
  const quando = d => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const pill = ch => { const [n, t] = SIT[ch.situacao] || [ch.situacao, 'gray']; return `<span class="pill" style="--tone:var(--${t})">${n}</span>`; };

  const carregar = async () => {
    if (st.carregando) return; st.carregando = true;
    try { st.lista = await S.q(S.sb.from('console_chamados').select('*').order('atualizado_em', { ascending:false })); }
    catch (e) { st.lista = []; S.toast(S.erro(e)); }
    st.carregando = false; if (S.route().view === 'suporte') S.render();
  };
  const carregarMsgs = async id => {
    if (st.msgs[id] === 'carregando') return; st.msgs[id] = 'carregando';
    try { st.msgs[id] = await S.q(S.sb.rpc('chamado_mensagens', { p_chamado:id })); } catch (e) { st.msgs[id] = []; S.toast(S.erro(e)); }
    if (S.route().view === 'suporte') S.render();
  };
  // Aviso por e-mail ao outro lado; se falhar, a mensagem já está guardada
  const avisar = id => S.sb.functions.invoke('console', { body:{ acao:'chamado_aviso', id } }).catch(() => {});

  S.views.suporte = id => {
    if (!st.lista) carregar();
    const lista = st.lista || [], ch = lista.find(x => x.id === id);
    const linhas = lista.map(x => `<a href="#/suporte/${x.id}" data-go="/suporte/${x.id}" class="${x.id === id ? 'on' : ''}"><span class="tx"><b>${num(x)} · ${esc(x.assunto)}</b><small>${quando(x.atualizado_em)} · prioridade ${PRIO[x.prioridade] || x.prioridade}</small></span>${pill(x)}</a>`).join('');
    let det = `<section class="card"><div class="empty"><b>${lista.length ? 'Escolha um chamado' : 'Precisa de ajuda?'}</b>${lista.length ? 'A conversa com a equipe SONVI aparece aqui.' : 'Abra um chamado e conte o que aconteceu. A equipe SONVI responde por aqui e você recebe a resposta por e-mail.'}</div></section>`;
    if (ch) {
      const m = st.msgs[ch.id]; if (!m) carregarMsgs(ch.id);
      det = `<section class="card sp-det" id="spDet"><div class="hd"><h2>${num(ch)} · ${esc(ch.assunto)}</h2>${pill(ch)}</div>
        <div class="sp-fio" aria-live="polite">${!Array.isArray(m) ? '<p class="muted">Carregando a conversa…</p>' : m.map(x => `<div class="sp-msg${x.do_suporte ? ' sup' : ''}"><small>${esc(x.autor)} · ${quando(x.criado_em)}</small>${esc(x.texto).replace(/\n/g, '<br>')}</div>`).join('')}</div>
        <form data-form="spResposta" data-id="${ch.id}" novalidate><label class="f"><span class="sr">Mensagem</span><textarea name="texto" rows="3" placeholder="${ch.situacao === 'resolvido' ? 'Escreva aqui se o problema voltou (o chamado é reaberto)' : 'Escreva a sua mensagem para o suporte'}"></textarea></label>
          <div class="row"><span class="grow"></span><button class="btn pri">${S.svg('seta')}Enviar</button></div></form></section>`;
    }
    return { title:`<span class="sub">Suporte SONVI · ${esc(S.me.nome || S.me.email)}</span>Falar com o suporte`,
      actions:`<button class="btn pri" data-act="spNovo">${S.svg('mais')}Novo chamado</button>`,
      body:!st.lista ? '<div class="card"><p class="muted">Carregando os chamados…</p></div>'
        : `<div class="sp-duas"><section class="card"><div class="hd"><h2>${S.me.diretor ? 'Chamados da empresa' : 'Seus chamados'}</h2><span>${lista.length || ''}</span></div>${lista.length ? `<div class="list sp-lista">${linhas}</div>` : '<p class="muted">Nenhum chamado ainda.</p>'}</section>${det}</div>` };
  };

  Object.assign(S.actions, {
    irSuporte: () => S.go('/suporte'),
    spNovo: () => {
      const radios = (S.db.veiculos || []).map(v => [v.id, v.nome]);
      S.form('Novo chamado', [{ k:'assunto', label:'Assunto', req:true, full:true, ph:'Ex.: O PI não chegou para a OPEC' },
        ...(radios.length ? [{ k:'veiculo', label:'Rádio', type:'select', options:[['', 'Todas / não se aplica'], ...radios] }] : []),
        { k:'prioridade', label:'Prioridade', type:'select', options:[['normal', 'Normal'], ['baixa', 'Baixa (dúvida, sem pressa)'], ['alta', 'Alta (atrapalha o trabalho)'], ['urgente', 'Urgente (parou tudo)']] },
        { k:'texto', label:'O que aconteceu? Conte com detalhes (tela, PI, cliente)', type:'textarea', req:true }],
        { veiculo:S.ui.vehicleId || '', prioridade:'normal' },
        f => S.run(async () => {
          const r = await S.q(S.sb.rpc('abrir_chamado', { p_assunto:f.assunto, p_texto:f.texto, p_prioridade:f.prioridade, p_veiculo:f.veiculo || null }));
          avisar(r.id); st.lista = null; location.hash = '/suporte/' + r.id;
        }, 'Chamado aberto. A equipe SONVI já foi avisada.'), 'Abrir chamado', { editar:true });
    }
  });

  document.addEventListener('submit', async e => {
    const f = e.target; if (f.dataset.form !== 'spResposta') return;
    e.preventDefault();
    const texto = f.texto.value.trim(), id = f.dataset.id, b = f.querySelector('button.pri');
    if (!texto) { S.erroNoCampo ? f.texto.focus() : null; return S.toast('Escreva a mensagem.'); }
    b.disabled = true;
    try { await S.q(S.sb.rpc('responder_chamado', { p_chamado:id, p_texto:texto })); avisar(id); delete st.msgs[id]; st.lista = null; S.toast('Mensagem enviada'); S.render(); }
    catch (err) { b.disabled = false; S.toast(S.erro(err)); }
  });
})();

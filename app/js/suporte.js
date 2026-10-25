// SONVI · Chat de suporte (aprovado em 20/10/2026): balão no canto inferior direito, em todas as telas do SONVI e do Sonvi Music.
// Cada conversa é um chamado do Console (console_chamados). A atendente tem um nome sorteado a cada acesso (a maioria feminino),
// que fica fixo dentro do chamado; a primeira mensagem recebe uma "Resposta automática" (chat_resposta_automatica) e a equipe
// responde pela tela Suporte do Console. Horário comercial: segunda a sexta, 8h às 18h (Cuiabá). Ao resolver: "Resolveu?".
// Banco: abrir_chamado, responder_chamado, chat_mensagens, chat_marcar_lido, chat_avaliar. E-mail: função "console", chamado_aviso.
// Não aparece nas telas de entrada nem no acesso de suporte (a equipe SONVI responde pelo Console).
(() => {
  const { esc } = S;
  const NOMES = ['Ana', 'Juliana', 'Mariana', 'Beatriz', 'Camila', 'Larissa', 'Fernanda', 'Gabriela', 'Patrícia', 'Renata', 'Aline', 'Bruna', 'Carolina', 'Letícia', 'Vanessa', 'Isabela', 'Rafael', 'Lucas', 'Bruno'];
  const MASC = ['Rafael', 'Lucas', 'Bruno'];
  const st = { aberto:false, vista:'conversa', atual:null, lista:null, msgs:{}, digitando:false, texto:'', previa:null, vistos:new Set(), nome:NOMES[Math.floor(Math.random() * NOMES.length)] };
  const SIT = { aberto:['Aguardando o suporte', 'orange'], andamento:['Em andamento', 'sky'], aguardando:['Aguardando você', 'purple'], resolvido:['Resolvido', 'green'] };
  const CHIPS = ['Problema com um PI', 'Senha e acesso', 'Dúvida no financeiro', 'Propostas e tabela', 'Outro assunto'];
  const ICO = {
    chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>',
    baixo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    enviar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    historico:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/></svg>',
    voltar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    fechar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const num = ch => '#' + String(ch.numero).padStart(4, '0');
  const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const quando = d => { const t = new Date(d), h = new Date(); return t.toDateString() === h.toDateString() ? 'hoje ' + hora(d) : t.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }); };
  // Horário comercial em Cuiabá (UTC-4)
  const cuiaba = () => new Date(Date.now() - 4 * 3600e3);
  const noHorario = () => { const d = cuiaba(), dia = d.getUTCDay(), h = d.getUTCHours(); return dia >= 1 && dia <= 5 && h >= 8 && h < 18; };
  const voltaQuando = () => { const d = cuiaba(), dia = d.getUTCDay(), h = d.getUTCHours();
    if (dia >= 1 && dia <= 5 && h < 8) return 'hoje às 8h';
    return (dia === 5 || dia === 6 ? 'segunda' : 'amanhã') + ' às 8h'; };
  const meu = ch => S.me && ch.aberto_por === S.me.id;
  const naoLido = ch => meu(ch) && ch.ultima_resposta_em && (!ch.lido_cliente_em || ch.ultima_resposta_em > ch.lido_cliente_em);
  const atual = () => (st.lista || []).find(c => c.id === st.atual);
  const nomeAtendente = () => (atual() || {}).atendente || st.nome;
  const visivel = () => !!(S.me && S.sb && !S.carregando && !document.body.classList.contains('fora') && !(S.ctx && S.ctx.suporte) && S.ctx);

  // ---------- nuvem ----------
  const carregarLista = async () => {
    try { st.lista = await S.q(S.sb.from('console_chamados').select('id, numero, assunto, situacao, atualizado_em, ultima_resposta_em, lido_cliente_em, atendente, avaliacao, aberto_por, criado_em').order('atualizado_em', { ascending:false }).limit(40)); }
    catch (e) { console.error(e); st.lista = st.lista || []; }
  };
  const carregarMsgs = async id => {
    try { const m = await S.q(S.sb.rpc('chat_mensagens', { p_chamado:id })); const mudou = !st.msgs[id] || st.msgs[id].length !== m.length; st.msgs[id] = m; return mudou; }
    catch (e) { console.error(e); st.msgs[id] = st.msgs[id] || []; return false; }
  };
  const marcarLido = async ch => { if (!ch || !naoLido(ch)) return; ch.lido_cliente_em = new Date().toISOString(); try { await S.sb.rpc('chat_marcar_lido', { p_chamado:ch.id }); } catch (e) { /* tenta na próxima */ } };
  const avisarEquipe = id => S.sb.functions.invoke('console', { body:{ acao:'chamado_aviso', id } }).catch(() => {});

  // ---------- desenho ----------
  let raiz = null;
  const montar = () => {
    if (raiz) return;
    raiz = document.createElement('div'); raiz.id = 'chatSup'; raiz.className = 'cs';
    raiz.innerHTML = `<section class="cs-painel" role="dialog" aria-modal="false" aria-label="Chat com o suporte SONVI" hidden></section>
      <div class="cs-previa" hidden></div>
      <button type="button" class="cs-balao" data-cs="alternar" aria-expanded="false" aria-label="Abrir o chat de suporte">${ICO.chat}${ICO.baixo}<span class="cs-conta" hidden></span></button>`;
    document.body.appendChild(raiz);
  };
  const cabecalho = () => { const n = nomeAtendente(), on = noHorario();
    return `<header class="cs-topo">${st.vista === 'lista' ? `<button type="button" class="cs-ic" data-cs="conversa" aria-label="Voltar para a conversa">${ICO.voltar}</button><b class="cs-titulo">${S.me.diretor ? 'Conversas da empresa' : 'Suas conversas'}</b>`
      : `<span class="cs-av" aria-hidden="true">${esc(n[0])}<i class="${on ? 'on' : ''}"></i></span><span class="cs-quem"><b>${esc(n)}</b><small class="${on ? 'on' : ''}">Suporte SONVI · ${on ? 'online agora' : 'volta ' + voltaQuando()}</small></span>
        <button type="button" class="cs-ic" data-cs="lista" aria-label="Conversas anteriores">${ICO.historico}</button>`}
      <button type="button" class="cs-ic" data-cs="fechar" aria-label="Fechar o chat">${ICO.fechar}</button></header>`; };
  const bolha = m => m.do_suporte ? `<div class="cs-m cs-ele"><small>${esc(m.autor)}</small><div>${esc(m.texto)}<time>${hora(m.criado_em)}</time></div></div>`
    : `<div class="cs-m cs-eu"><div>${esc(m.texto)}<time>${m.pendente ? 'enviando…' : hora(m.criado_em)}</time></div></div>`;
  const conversa = () => {
    const ch = atual(), msgs = ch ? st.msgs[ch.id] : [], primeiro = ((S.me.nome || '').split(' ')[0]) || '', n = nomeAtendente();
    const saudacao = `<div class="cs-m cs-ele"><small>${esc(n)} · Suporte SONVI</small><div>Olá${primeiro ? ', ' + esc(primeiro) : ''}! ${MASC.includes(n) ? 'Sou o' : 'Sou a'} ${esc(n)}, do suporte SONVI. Como posso ajudar? Escreva abaixo ou escolha um assunto.${noHorario() ? '' : `<br><br>Agora estamos fora do horário (segunda a sexta, das 8h às 18h). Pode deixar sua mensagem: a resposta chega ${voltaQuando()}, aqui e no seu e-mail.`}</div></div>`;
    const avaliar = ch && ch.situacao === 'resolvido' && !ch.avaliacao && meu(ch) ? `<div class="cs-avaliar"><b>Chamado ${num(ch)} resolvido. Resolveu o seu problema?</b><span><button type="button" class="btn sm" data-cs="resolveu">Resolveu</button><button type="button" class="btn sm" data-cs="naoResolveu">Ainda não</button></span></div>` : '';
    return `${ch ? `<div class="cs-faixa">Chamado ${num(ch)} · <span style="--tone:var(--${(SIT[ch.situacao] || [])[1] || 'gray'})">${(SIT[ch.situacao] || [ch.situacao])[0]}</span></div>` : ''}
      <div class="cs-msgs" aria-live="polite"><span class="cs-dia">${ch ? quando(ch.criado_em) : 'Hoje'}</span>${ch ? (msgs ? msgs.map(bolha).join('') : '<p class="muted small">Carregando…</p>') : saudacao + (st.msgsNova ? bolha({ do_suporte:false, texto:st.msgsNova, criado_em:new Date().toISOString(), pendente:true }) : '')}
        ${st.digitando ? '<div class="cs-m cs-ele"><div class="cs-pontos" aria-label="Escrevendo"><i></i><i></i><i></i></div></div>' : ''}${avaliar}</div>
      ${!ch && !st.digitando ? `<div class="cs-chips" role="group" aria-label="Assuntos rápidos">${CHIPS.map(c => `<button type="button" data-cs="chip" data-texto="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <form class="cs-form" data-cs-form novalidate><label class="sr" for="csTexto">Mensagem</label><textarea id="csTexto" rows="1" placeholder="${ch && ch.situacao === 'resolvido' ? 'Escreva se o problema voltou' : 'Escreva sua mensagem…'}">${esc(st.texto)}</textarea>
        <button class="cs-enviar" aria-label="Enviar">${ICO.enviar}</button></form>`;
  };
  const lista = () => { const l = (st.lista || []).filter(c => S.me.diretor || meu(c));
    return `<div class="cs-lista">${l.length ? l.map(c => `<button type="button" data-cs="abrirCh" data-id="${c.id}"><span class="tx"><b>${num(c)} · ${esc(c.assunto)}</b><small>${quando(c.atualizado_em)} · ${esc(c.atendente)}${naoLido(c) ? ' · <strong>resposta nova</strong>' : ''}</small></span><span class="pill" style="--tone:var(--${(SIT[c.situacao] || [])[1] || 'gray'})">${(SIT[c.situacao] || [c.situacao])[0]}</span></button>`).join('')
      : '<p class="muted">Nenhuma conversa ainda.</p>'}</div><div class="cs-rodape"><button type="button" class="btn pri" data-cs="nova">Nova conversa</button></div>`; };

  const pintar = (foco) => {
    if (!raiz) return;
    const mostra = visivel(); raiz.hidden = !mostra; if (!mostra) return;
    const painel = raiz.querySelector('.cs-painel'), balao = raiz.querySelector('.cs-balao'), previa = raiz.querySelector('.cs-previa'), conta = raiz.querySelector('.cs-conta');
    const nl = (st.lista || []).filter(naoLido).length;
    balao.classList.toggle('aberto', st.aberto); balao.setAttribute('aria-expanded', String(st.aberto));
    balao.setAttribute('aria-label', st.aberto ? 'Fechar o chat de suporte' : `Abrir o chat de suporte${nl ? `, ${nl} resposta${nl > 1 ? 's' : ''} nova${nl > 1 ? 's' : ''}` : ''}`);
    conta.hidden = st.aberto || !nl; conta.textContent = nl;
    previa.hidden = st.aberto || !st.previa;
    if (st.previa) previa.innerHTML = `<button type="button" class="cs-previa-tx" data-cs="abrirCh" data-id="${st.previa.id}"><small>${esc(st.previa.autor)} · agora</small><span>${esc(st.previa.texto.length > 140 ? st.previa.texto.slice(0, 140) + '…' : st.previa.texto)}</span></button><button type="button" class="cs-ic" data-cs="tirarPrevia" aria-label="Dispensar o aviso">${ICO.fechar}</button>`;
    document.body.classList.toggle('chat-aberto', st.aberto);
    if (!st.aberto) { painel.hidden = true; return; }
    const ant = document.activeElement && document.activeElement.id === 'csTexto';
    painel.innerHTML = cabecalho() + (st.vista === 'lista' ? lista() : conversa());
    painel.hidden = false;
    const box = painel.querySelector('.cs-msgs'); if (box) box.scrollTop = box.scrollHeight;
    const ta = painel.querySelector('#csTexto'); if (ta) ajustar(ta);
    if ((foco || ant) && ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  const ajustar = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };

  // ---------- ações ----------
  const abrir = async id => {
    montar(); st.aberto = true; st.previa = null; st.vista = 'conversa';
    if (!st.lista) await carregarLista();
    if (id) st.atual = id;
    else if (!st.atual) { const nl = (st.lista || []).find(naoLido), vivo = (st.lista || []).find(c => meu(c) && (c.situacao !== 'resolvido' || !c.avaliacao)); st.atual = (nl || vivo || {}).id || null; }
    pintar(true);
    const ch = atual(); if (ch) { await carregarMsgs(ch.id); marcarLido(ch); pintar(); }
  };
  const fechar = () => { st.aberto = false; pintar(); const b = raiz && raiz.querySelector('.cs-balao'); if (b) b.focus(); };
  const enviar = async texto => {
    texto = String(texto || '').trim(); if (!texto || st.digitando) return;
    let ch = atual(); st.texto = '';
    if (ch) { (st.msgs[ch.id] = st.msgs[ch.id] || []).push({ id:'p', do_suporte:false, texto, criado_em:new Date().toISOString(), pendente:true }); pintar(true);
      try { await S.q(S.sb.rpc('responder_chamado', { p_chamado:ch.id, p_texto:texto })); avisarEquipe(ch.id); await carregarMsgs(ch.id); await carregarLista(); if (S.chamadosAtualizar) S.chamadosAtualizar(); }
      catch (e) { st.msgs[ch.id] = st.msgs[ch.id].filter(m => !m.pendente); st.texto = texto; S.toast(S.erro(e)); }
      return pintar(true);
    }
    // Primeira mensagem: abre o chamado, avisa a equipe e recebe a resposta automática
    st.digitando = true; st.atual = null;
    st.msgsNova = texto; pintar();
    const inicio = Date.now();
    try {
      const r = await S.q(S.sb.rpc('abrir_chamado', { p_assunto:texto.slice(0, 120), p_texto:texto, p_prioridade:'normal', p_veiculo:S.ui.vehicleId || null, p_atendente:st.nome }));
      await avisarEquipe(r.id);
      await S.q(S.sb.rpc('chat_resposta_automatica', { p_chamado:r.id }));
      await Promise.all([carregarLista(), carregarMsgs(r.id)]);
      if (!(st.lista || []).some(c => c.id === r.id)) (st.lista = st.lista || []).unshift({ id:r.id, numero:r.numero, atendente:r.atendente, assunto:texto.slice(0, 120), situacao:'aberto', aberto_por:S.me.id, criado_em:new Date().toISOString(), atualizado_em:new Date().toISOString() });
      await new Promise(ok => setTimeout(ok, Math.max(0, 1100 - (Date.now() - inicio))));
      st.atual = r.id;
      if (S.chamadosAtualizar) S.chamadosAtualizar();
    } catch (e) { st.texto = texto; S.toast(S.erro(e)); }
    st.digitando = false; st.msgsNova = null; pintar(true);
  };

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cs]'); if (!b || !raiz || !raiz.contains(b)) return;
    const a = b.dataset.cs;
    if (a === 'alternar') return st.aberto ? fechar() : abrir();
    if (a === 'fechar') return fechar();
    if (a === 'lista') { st.vista = 'lista'; pintar(); await carregarLista(); return pintar(); }
    if (a === 'conversa') { st.vista = 'conversa'; return pintar(true); }
    if (a === 'nova') { st.atual = null; st.vista = 'conversa'; st.nome = NOMES[Math.floor(Math.random() * NOMES.length)]; return pintar(true); }
    if (a === 'abrirCh') return abrir(b.dataset.id);
    if (a === 'tirarPrevia') { st.previa = null; return pintar(); }
    if (a === 'chip') { if (b.dataset.texto === 'Outro assunto') { const ta = raiz.querySelector('#csTexto'); if (ta) ta.focus(); return; } return enviar(b.dataset.texto); }
    if (a === 'resolveu' || a === 'naoResolveu') { const ch = atual(); if (!ch) return;
      try { await S.q(S.sb.rpc('chat_avaliar', { p_chamado:ch.id, p_resolveu:a === 'resolveu' })); await Promise.all([carregarLista(), carregarMsgs(ch.id)]); S.toast(a === 'resolveu' ? 'Obrigado pelo retorno!' : 'Chamado reaberto'); }
      catch (err) { S.toast(S.erro(err)); } pintar(a === 'naoResolveu'); }
  });
  document.addEventListener('submit', e => { if (!e.target.matches('[data-cs-form]')) return; e.preventDefault(); enviar(e.target.querySelector('textarea').value); });
  document.addEventListener('input', e => { if (e.target.id !== 'csTexto') return; st.texto = e.target.value; ajustar(e.target); });
  document.addEventListener('keydown', e => {
    if (!raiz || !st.aberto) return;
    if (e.key === 'Escape' && raiz.contains(document.activeElement)) { e.preventDefault(); e.stopPropagation(); fechar(); }
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'csTexto') { e.preventDefault(); enviar(e.target.value); }
  }, true);

  // ---------- atualização sozinha ----------
  const buscarNovidades = async () => {
    if (!visivel() || document.hidden) return;
    const antes = JSON.stringify(atual() || null);
    await carregarLista();
    const novos = (st.lista || []).filter(c => naoLido(c) && !st.vistos.has(c.id + c.ultima_resposta_em));
    for (const c of novos) st.vistos.add(c.id + c.ultima_resposta_em);
    if (st.aberto) { const ch = atual(), mudou = ch && await carregarMsgs(ch.id); if (mudou) marcarLido(ch);
      if (!mudou && JSON.stringify(ch || null) === antes) return; }
    else if (novos.length && !st.primeiraBusca) { const c = novos[0]; await carregarMsgs(c.id);
      const ult = (st.msgs[c.id] || []).filter(m => m.do_suporte && !m.automatica).pop();
      st.previa = { id:c.id, autor:ult ? ult.autor : c.atendente + ' · Suporte SONVI', texto:ult ? ult.texto : `Chamado ${num(c)} resolvido. Conte se resolveu.` }; }
    st.primeiraBusca = false;
    const ta = document.getElementById('csTexto'); if (!(ta && document.activeElement === ta && st.texto)) pintar(); else pintar(true);
  };
  st.primeiraBusca = true;
  setInterval(() => { if (st.aberto && st.atual) buscarNovidades(); }, 10000);
  setInterval(() => { if (!st.aberto) buscarNovidades(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) buscarNovidades(); });

  // Link do e-mail (#/suporte/<id>) e o menu da conta abrem o chat
  const pelaRota = () => { const m = location.hash.match(/^#\/suporte(?:\/([0-9a-f-]{36}))?/); if (!m || !visivel()) return false;
    history.replaceState(null, '', location.pathname + location.search + '#/dashboard'); abrir(m[1] || null); return true; };
  S.actions.irSuporte = () => { if (S.ctx && S.ctx.suporte) { S.toast('Você está como Suporte SONVI: os chamados são respondidos no Console'); return; } if (!visivel()) { S.toast('O chat de suporte ainda está carregando. Tente de novo em instantes.'); return; } abrir(); };
  addEventListener('DOMContentLoaded', () => {
    const render = S.render;
    S.render = (...a) => { if (/^#\/suporte/.test(location.hash) && visivel()) { pelaRota(); } const r = render(...a); montar(); pintar();
      if (visivel() && !st.lista && !st.carregandoLista) { st.carregandoLista = true; buscarNovidades().then(() => { st.carregandoLista = false; }); } return r; };
  });
  S.chatSuporte = { abrir, fechar };
})();

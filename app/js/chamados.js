// SONVI · Suporte do grupo (aprovado em 25/10/2026): item "Suporte" no menu do Dashboard geral, só o diretor (rota #/chamados;
// #/suporte continua sendo o link que abre o chat). Faixa quando a equipe SONVI está dentro, quatro números, abas
// Chamados · Acessos da equipe SONVI, e paginação de 10 em 10 nas duas (adaptada de um componente de paginação, em JS puro).
// Os chamados são as conversas do chat (console_chamados, a RLS entrega os da empresa ao diretor); clicar abre o chat nele.
(() => {
  const { esc } = S;
  const POR = 10;
  const st = { aba:'chamados', sit:'abertos', pg:{ chamados:1, acessos:1 }, mes:S.today().slice(0, 7), lista:null, acessos:null, carregando:false };
  const carregar = async () => { if (st.carregando) return; st.carregando = true;
    try {
      const [ch, ac] = await Promise.all([
        S.q(S.sb.from('console_chamados').select('id, numero, assunto, situacao, veiculo_id, aberto_por, atendente, criado_em, atualizado_em, primeira_resposta_em, resolvido_em, ultima_resposta_em, lido_cliente_em, avaliacao').order('atualizado_em', { ascending:false }).limit(500)),
        S.q(S.sb.from('suporte_acessos').select('*').order('inicio', { ascending:false }).limit(1000))]);
      st.lista = ch || []; st.acessos = ac || [];
    } catch (e) { console.error(e); S.toast(S.erro(e)); st.lista = st.lista || []; st.acessos = st.acessos || []; }
    st.carregando = false; if (S.ui.view === 'chamados') S.render(); };
  S.chamadosUsar = (lista, acessos) => { st.lista = lista; st.acessos = acessos; }; // testes

  const SIT = { aberto:['Aberto', 'cs2-ab'], andamento:['Em andamento', 'cs2-ab'], aguardando:['Aguardando você', 'cs2-ag'], resolvido:['Resolvido', 'cs2-ok'] };
  const emAberto = c => c.situacao !== 'resolvido';
  const naoLido = c => c.ultima_resposta_em && (!c.lido_cliente_em || c.lido_cliente_em < c.ultima_resposta_em);
  const dataCurta = d => { if (!d) return '—'; const x = new Date(d), h = new Date(), min = Math.round((h - x) / 60000);
    if (min < 60) return min <= 1 ? 'agora' : `há ${min} min`;
    const hm = x.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    if (x.toDateString() === h.toDateString()) return `hoje, ${hm}`;
    return x.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:x.getFullYear() === h.getFullYear() ? undefined : '2-digit' }); };
  const dt = d => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const ativo = a => !a.encerrado_em && new Date(a.fim) > new Date();
  const fimReal = a => a.encerrado_em && new Date(a.encerrado_em) < new Date(a.fim) ? a.encerrado_em : a.fim;
  const minutos = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));
  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = ym => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}`; };
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  // Paginação: 1 … (atual ± 2, ou ± 1 no celular) … última
  const paginas = (a, n) => { if (n <= 7) return Array.from({ length:n }, (_, i) => i + 1);
    const delta = S.celular ? 1 : 2, r = [1]; let ini = Math.max(2, a - delta), fim = Math.min(n - 1, a + delta);
    if (a <= 2) fim = Math.min(n - 1, 1 + delta * 2); if (a >= n - 1) ini = Math.max(2, n - delta * 2);
    if (ini > 2) r.push('…'); for (let i = ini; i <= fim; i++) r.push(i); if (fim < n - 1) r.push('…'); r.push(n); return r; };
  const paginacao = (chave, total, rot) => { const n = Math.max(1, Math.ceil(total / POR)), a = Math.min(st.pg[chave], n), de = total ? (a - 1) * POR + 1 : 0, ate = Math.min(total, a * POR);
    if (!total) return '';
    return `<div class="pag-l"><small>${de}–${ate} de ${total} ${rot}</small>${n > 1 ? `<nav class="pag" aria-label="Páginas de ${rot}">
      <button type="button" class="pag-nav" data-act="chPagina" data-k="${chave}" data-v="${a - 1}"${a === 1 ? ' disabled' : ''} aria-label="Página anterior">${S.svg('esq', 16)}${S.celular ? 'Ant.' : 'Anterior'}</button>
      ${paginas(a, n).map(p => p === '…' ? '<span class="pag-rt" aria-hidden="true">…</span>' : `<button type="button" data-act="chPagina" data-k="${chave}" data-v="${p}"${p === a ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`).join('')}
      <button type="button" class="pag-nav" data-act="chPagina" data-k="${chave}" data-v="${a + 1}"${a === n ? ' disabled' : ''} aria-label="Próxima página">${S.celular ? 'Próx.' : 'Próxima'}${S.svg('seta', 16)}</button></nav>` : ''}</div>`; };
  const fatia = (l, chave) => { const n = Math.max(1, Math.ceil(l.length / POR)); if (st.pg[chave] > n) st.pg[chave] = n; return l.slice((st.pg[chave] - 1) * POR, st.pg[chave] * POR); };

  S.views.chamados = () => {
    const titulo = '<span class="sub">Grupo</span>Suporte', acoes = `<button class="btn pri" data-act="irSuporte">${S.svg('chamados')}Falar com o suporte</button>`;
    if (!st.lista) { carregar(); return { title:titulo, actions:acoes, body:'<div class="card empty"><b>Carregando os chamados…</b></div>' }; }
    const L = st.lista, A = st.acessos || [], mesHoje = S.today().slice(0, 7);
    const agora = A.find(ativo);
    const faixa = agora ? `<div class="cs2-agora" role="status"><i aria-hidden="true"></i><b>A equipe SONVI está dentro agora</b><span>"${esc(agora.motivo)}" · até ${hora(agora.fim)}</span></div>` : '';
    const abertos = L.filter(emAberto), aguard = L.filter(c => c.situacao === 'aguardando'), novos = L.filter(c => emAberto(c) && naoLido(c));
    const resMes = L.filter(c => c.situacao === 'resolvido' && (c.resolvido_em || c.atualizado_em || '').slice(0, 7) === mesHoje);
    const tempos = L.filter(c => c.primeira_resposta_em).map(c => minutos(c.criado_em, c.primeira_resposta_em));
    const media = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
    const kpis = `<div class="cs2-kpis"><div><small>Chamados abertos</small><b>${S.roloFixo('cs1', String(abertos.length))}</b><span>${novos.length ? `${novos.length} com resposta nova` : 'nenhuma resposta nova'}</span></div>
      <div><small>Aguardando você</small><b>${S.roloFixo('cs2', String(aguard.length))}</b><span>${aguard.length ? 'o suporte pediu uma informação' : 'nada pendente com vocês'}</span></div>
      <div><small>Resolvidos no mês</small><b>${S.roloFixo('cs3', String(resMes.length))}</b><span>${resMes.length ? `${resMes.filter(c => c.avaliacao === 'resolveu').length} avaliados "Resolveu"` : 'nenhum neste mês'}</span></div>
      <div><small>1ª resposta</small><b>${S.roloFixo('cs4', tempos.length ? fmtMin(media) : '—')}</b><span>${tempos.length ? 'em média' : 'sem chamados respondidos ainda'}</span></div></div>`;
    const abas = `<div class="seg cs2-abas" role="group" aria-label="Ver">${[['chamados', 'Chamados', L.length], ['acessos', S.celular ? 'Acessos SONVI' : 'Acessos da equipe SONVI', A.length]].map(([k, n, q]) => `<button class="${st.aba === k ? 'on' : ''}" data-act="chAba" data-v="${k}" aria-pressed="${st.aba === k}">${n} <span>${q}</span></button>`).join('')}</div>`;
    let corpo;
    if (st.aba === 'chamados') {
      const lista = L.filter(c => st.sit === 'todos' || (st.sit === 'abertos' ? emAberto(c) : !emAberto(c))), pg = fatia(lista, 'chamados');
      const chips = `<div class="pdt-var-chips" role="group" aria-label="Situação">${[['abertos', 'Em aberto', abertos.length], ['resolvidos', 'Resolvidos', L.length - abertos.length], ['todos', 'Todos', L.length]].map(([k, n, q]) => `<button data-act="chSit" data-v="${k}" aria-pressed="${st.sit === k}">${n} · ${q}</button>`).join('')}</div>`;
      const sit = c => { const s = SIT[c.situacao] || SIT.aberto; return `<span class="pill ${s[1]}">${c.situacao === 'resolvido' ? S.svg('check', 12) : '<i aria-hidden="true"></i>'}${s[0]}</span>`; };
      const veic = c => c.veiculo_id ? ((S.veh(c.veiculo_id) || {}).nome || '') : '';
      const vazio = `<div class="empty"><b>${st.sit === 'abertos' ? 'Nenhum chamado em aberto' : 'Nenhum chamado'}</b>Para falar com a equipe SONVI, use o balão no canto da tela ou o botão "Falar com o suporte".</div>`;
      const linhas = S.celular ? `<div class="cs2-cel">${pg.map(c => `<div class="cs2-c" data-act="chAbrir" data-id="${c.id}"><div><b>${esc(c.assunto)}${naoLido(c) ? '<span class="cs2-nova" title="Resposta nova"></span>' : ''}</b><small>#${c.numero}${veic(c) ? ' · ' + esc(veic(c)) : ''} · ${dataCurta(c.atualizado_em)}</small></div>${sit(c)}</div>`).join('')}</div>`
        : `<div class="scroll"><table class="cs2-t"><thead><tr><th>Nº</th><th>Assunto</th><th>Aberto por</th><th>Atendente</th><th>Situação</th><th class="r">Atualizado</th></tr></thead><tbody>
          ${pg.map(c => `<tr class="click" data-act="chAbrir" data-id="${c.id}"><td class="nw cs2-num">#${c.numero}</td><td><b>${esc(c.assunto)}</b>${naoLido(c) ? '<span class="cs2-nova" title="Resposta nova"></span>' : ''}${veic(c) ? `<small>${esc(veic(c))}</small>` : ''}</td>
            <td class="nw">${esc(S.usuario(c.aberto_por) || '—')}</td><td class="nw">${esc(c.atendente || '—')}</td><td>${sit(c)}</td><td class="r nw">${dataCurta(c.atualizado_em)}</td></tr>`).join('')}</tbody></table></div>`;
      corpo = `<section class="card" id="cs2-corpo" aria-labelledby="cs2-tc"><div class="hd"><div><h2 id="cs2-tc">Chamados</h2><p class="muted small" style="margin:2px 0 0">As conversas da empresa com o suporte SONVI. Clique para abrir no chat.</p></div>${chips}</div>
        <div class="cs2-lista">${pg.length ? linhas : vazio}</div>${paginacao('chamados', lista.length, 'chamados')}</section>`;
    } else {
      const doMes = A.filter(a => a.inicio.slice(0, 7) === st.mes), pg = fatia(doMes, 'acessos'), usado = doMes.reduce((s, a) => s + (ativo(a) ? 0 : minutos(a.inicio, fimReal(a))), 0);
      const fim = a => ativo(a) ? '<span class="pill cs2-ab"><i aria-hidden="true"></i>Agora</span>' : a.encerrado_em && new Date(a.encerrado_em) < new Date(a.fim) ? `<span class="pill cs2-ok">${S.svg('check', 12)}Encerrado</span>` : '<span class="pill fn-neutra">Tempo acabou</span>';
      const tempo = a => { const lib = minutos(a.inicio, a.fim), uso = ativo(a) ? minutos(a.inicio, new Date()) : minutos(a.inicio, fimReal(a));
        return `<span class="cs2-dur"><span class="cs2-b" aria-hidden="true"><i style="width:${Math.min(100, uso / lib * 100)}%"></i></span><span class="nw">${fmtMin(Math.min(uso, lib))} de ${fmtMin(lib)}</span></span>`; };
      const nav = `<div class="fn-nav cs2-mes"><button class="btn tres" data-act="chMes" data-v="-1" aria-label="Mês anterior">${S.svg('esq', 16)}</button><b>${nomeMes(st.mes)}</b><button class="btn tres" data-act="chMes" data-v="1" aria-label="Próximo mês"${st.mes >= mesHoje ? ' disabled' : ''}>${S.svg('seta', 16)}</button></div>`;
      const linhas = S.celular ? `<div class="cs2-cel">${pg.map(a => `<div class="cs2-c sem"><div><b>${esc(a.motivo)}</b><small>${dt(a.inicio)} · ${tempo(a)}</small></div>${fim(a)}</div>`).join('')}</div>`
        : `<div class="scroll"><table class="cs2-t"><thead><tr><th>Quando</th><th>Motivo</th><th>Quem</th><th>Tempo usado</th><th>Como terminou</th></tr></thead><tbody>
          ${pg.map(a => `<tr><td class="nw">${dt(a.inicio)}</td><td>${esc(a.motivo)}</td><td class="nw">Suporte SONVI</td><td>${tempo(a)}</td><td>${fim(a)}</td></tr>`).join('')}</tbody></table></div>`;
      corpo = `<section class="card" id="cs2-corpo" aria-labelledby="cs2-ta"><div class="hd"><div><h2 id="cs2-ta">Acessos da equipe SONVI</h2><p class="muted small" style="margin:2px 0 0">A equipe SONVI só vê os dados da empresa quando entra como suporte. Cada entrada fica anotada aqui; o que o suporte alterar aparece no histórico como "Suporte SONVI".</p></div>${nav}</div>
        <div class="cs2-lista">${pg.length ? linhas : `<div class="empty"><b>Nenhum acesso em ${nomeMes(st.mes).toLowerCase()}</b>A equipe SONVI não entrou no ambiente da empresa neste mês.</div>`}</div>
        ${paginacao('acessos', doMes.length, `acessos em ${MESES[+st.mes.slice(5) - 1]}${usado ? ` · ${fmtMin(usado)} usados` : ''}`)}</section>`;
    }
    return { title:titulo, actions:acoes, body:faixa + kpis + abas + corpo };
  };
  // Troca só o cartão da lista (página, filtro, mês, aba): números, faixa e abas não se mexem e a página não pula.
  // A lista entra com um esmaecer curto; na troca de página a altura fica a mesma, para os botões não saírem do lugar.
  const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const troca = (tipo, foco) => {
    const velho = document.getElementById('cs2-corpo'), content = document.getElementById('content');
    if (!velho || !content) return S.render();
    const t = document.createElement('template'); t.innerHTML = S.views.chamados().body;
    const novo = t.content.getElementById('cs2-corpo'); if (!novo) return S.render();
    content.classList.remove('entra');
    const abaN = t.content.querySelector('.cs2-abas'), abaV = content.querySelector('.cs2-abas'); if (abaN && abaV) abaV.replaceWith(abaN);
    const lv = velho.querySelector('.cs2-lista'), h = lv ? lv.getBoundingClientRect().height : 0;
    velho.replaceWith(novo);
    const ln = novo.querySelector('.cs2-lista');
    if (ln && tipo === 'pagina' && h) ln.style.minHeight = h + 'px';
    if (ln && !reduz()) ln.animate([{ opacity:0, transform:'translateY(4px)' }, { opacity:1, transform:'none' }], { duration:200, easing:'cubic-bezier(.22,1,.36,1)' });
    const r = novo.getBoundingClientRect(); if (r.top < 0) novo.scrollIntoView({ behavior:reduz() ? 'auto' : 'smooth', block:'start' });
    const f = foco && novo.querySelector(foco) || (foco && content.querySelector(foco)); if (f) f.focus({ preventScroll:true });
  };
  Object.assign(S.actions, {
    chAba: d => { if (st.aba === d.v) return; st.aba = d.v; troca('aba', `.cs2-abas [data-v="${d.v}"]`); },
    chSit: d => { if (st.sit === d.v) return; st.sit = d.v; st.pg.chamados = 1; troca('filtro', `[data-act="chSit"][data-v="${d.v}"]`); },
    chMes: d => { const n = somaMes(st.mes, +d.v); if (n > S.today().slice(0, 7)) return; st.mes = n; st.pg.acessos = 1; troca('mes', `[data-act="chMes"][data-v="${d.v}"]:not([disabled])`); },
    chPagina: d => { const v = Math.max(1, +d.v); if (st.pg[d.k] === v) return; st.pg[d.k] = v; troca('pagina', `[data-act="chPagina"][data-k="${d.k}"][aria-current]`); },
    chAbrir: d => { if (S.chatSuporte) S.chatSuporte.abrir(d.id); },
  });
  // ← → trocam de página (fora de campos e de janelas abertas)
  document.addEventListener('keydown', e => { if (S.ui.view !== 'chamados' || !st.lista || e.altKey || e.metaKey || e.ctrlKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (e.target.closest && e.target.closest('input, textarea, select, dialog, .cs')) return;
    const nav = [...document.querySelectorAll(`[data-act="chPagina"][data-k="${st.aba}"].pag-nav`)][e.key === 'ArrowLeft' ? 0 : 1];
    if (nav && !nav.disabled) { e.preventDefault(); nav.click(); } });
  // Ao entrar de novo na tela, busca de novo
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/chamados')) { st.lista = null; st.acessos = null; } });
})();

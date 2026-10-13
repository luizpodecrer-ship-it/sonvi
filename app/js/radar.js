// SONVI · Sonvi Music · Radar: o que está tocando nos streams (Spotify), comparado com o acervo da rádio.
// Regras para não comprometer a plataforma com os termos do Spotify:
//  - nada de copiar paradas: os atalhos abrem as paradas no próprio Spotify;
//  - a lista vem da playlist "Radar <rádio>" que o programador monta na conta DELE (login oficial do Spotify, sem senha passando pelo Sonvi);
//  - os dados do Spotify ficam só na memória da tela, nunca no banco; a marca do Spotify aparece onde os dados aparecem.
// A conexão usa o fluxo oficial com PKCE (sem chave secreta). O código de volta é capturado em music/index.html antes de tudo carregar.
(() => {
  if (S.APP !== 'music') return;
  const { esc } = S, M = S.mus;
  const API = 'https://api.spotify.com/v1', CONTAS = 'https://accounts.spotify.com';
  const ESCOPOS = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public';
  const ATALHOS = [['Top 50 Brasil', 'As mais ouvidas no país hoje', 'https://open.spotify.com/playlist/37i9dQZEVXbMXbN3EUUhlg'],
    ['Virais Brasil', 'O que está crescendo rápido', 'https://charts.spotify.com/charts/view/viral-br-daily/latest'],
    ['Lançamentos da semana', 'Novidades que saíram na sexta', 'https://open.spotify.com/search/Novidades%20da%20semana/playlists']];
  const PROG = ['diretor', 'gerente', 'programador'];

  const idApp = () => (window.SONVI_CONFIG || {}).spotifyClientId || '';
  // Sempre o mesmo endereço cadastrado no Spotify, venha a pessoa por /music, /music/ ou /music/index.html
  const volta = () => location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
  const chave = () => 'sonvi-spotify-' + ((S.me && S.me.id) || '');
  const ler = (k, area = localStorage) => { try { return JSON.parse(area.getItem(k) || 'null'); } catch (e) { return null; } };
  const gravar = (k, v, area = localStorage) => { try { v === null ? area.removeItem(k) : area.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: conecta de novo na próxima vez */ } };

  // Estado da tela (dados do Spotify só em memória)
  const r = { veic:null, carregando:false, erro:'', perfil:null, playlist:null, semPlaylist:false, faixas:[], toques:{}, ultima:{}, filtro:'todas', q:'', res:[], buscando:false, trocando:false };
  const zerar = () => Object.assign(r, { veic:S.ui.vehicleId, carregando:false, erro:'', playlist:null, semPlaylist:false, faixas:[], toques:{}, ultima:{}, res:[] });
  const nomePlaylist = () => 'Radar ' + (S.veh() ? S.veh().nome : 'Sonvi');

  // ---------- conexão (PKCE) ----------
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pedirToken = async corpo => {
    const resp = await fetch(CONTAS + '/api/token', { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(Object.assign({ client_id:idApp() }, corpo)) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(j.error_description || j.error || 'O Spotify recusou a conexão.');
    return { access:j.access_token, refresh:j.refresh_token, exp:Date.now() + ((j.expires_in || 3600) - 60) * 1000 };
  };
  let novo = null; // conexão recém-feita, antes de saber quem está logado
  const retorno = window.SPOTIFY_VOLTA; delete window.SPOTIFY_VOLTA;
  if (retorno) {
    const pk = ler('sonvi-spotify-pkce', sessionStorage); gravar('sonvi-spotify-pkce', null, sessionStorage);
    if (retorno.error || !pk || pk.estado !== retorno.state) r.erro = retorno.error === 'access_denied' ? 'Você cancelou a conexão com o Spotify.' : 'Não foi possível conectar ao Spotify. Tente de novo.';
    else novo = pedirToken({ grant_type:'authorization_code', code:retorno.code, redirect_uri:volta(), code_verifier:pk.verif })
      .catch(e => { r.erro = e.message; return null; }).then(t => { novo = t; if (S.me) S.render(); return t; });
  }
  const token = async () => {
    if (novo && typeof novo.then === 'function') await novo;
    if (novo && S.me) { gravar(chave(), novo); novo = null; }
    let t = ler(chave());
    if (!t) return null;
    if (Date.now() > t.exp) {
      try { const n = await pedirToken({ grant_type:'refresh_token', refresh_token:t.refresh }); t = Object.assign(t, n, { refresh:n.refresh || t.refresh }); gravar(chave(), t); }
      catch (e) { gravar(chave(), null); return null; }
    }
    return t;
  };
  const conectado = () => !!(novo || ler(chave()));
  const conectar = async () => {
    const verif = b64(crypto.getRandomValues(new Uint8Array(48))), estado = b64(crypto.getRandomValues(new Uint8Array(16)));
    const desafio = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif)));
    gravar('sonvi-spotify-pkce', { verif, estado }, sessionStorage);
    location.href = CONTAS + '/authorize?' + new URLSearchParams({ client_id:idApp(), response_type:'code', redirect_uri:volta(), code_challenge_method:'S256', code_challenge:desafio, state:estado, scope:ESCOPOS });
  };

  // ---------- API do Spotify ----------
  const api = async (caminho, op = {}) => {
    const t = await token();
    if (!t) { r.perfil = null; throw new Error('A conexão com o Spotify expirou. Conecte de novo.'); }
    const resp = await fetch(/^https?:/.test(caminho) ? caminho : API + caminho, Object.assign({}, op, { headers:{ Authorization:'Bearer ' + t.access, 'Content-Type':'application/json' } }));
    if (resp.status === 401) { gravar(chave(), null); r.perfil = null; throw new Error('A conexão com o Spotify expirou. Conecte de novo.'); }
    if (resp.status === 429) throw new Error('O Spotify pediu para esperar um pouco. Tente de novo em instantes.');
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({})), e = new Error((j.error && j.error.message) || 'O Spotify respondeu com erro ' + resp.status + '.'); e.status = resp.status;
      if (resp.status === 403) e.message = 'O Spotify não liberou esta conta para o app do Sonvi. Enquanto o app estiver em modo de desenvolvimento, só as contas cadastradas no painel do Spotify (até 5) conseguem usar.';
      throw e;
    }
    const txt = await resp.text(); return txt ? JSON.parse(txt) : null;
  };
  // Itens de uma playlist: o Spotify renomeou "tracks" para "items" em 2026; tenta o novo e cai no antigo
  const itens = async id => {
    let url = `/playlists/${id}/items?limit=50`, todos = [];
    try { await api(url.replace('limit=50', 'limit=1')); } catch (e) { if (e.status === 404 || e.status === 400) url = `/playlists/${id}/tracks?limit=50`; else throw e; }
    for (let i = 0; url && i < 8; i++) { const j = await api(url); todos = todos.concat(j.items || []); url = j.next; }
    return todos.map(it => it.item || it.track).filter(t => t && (t.type || 'track') === 'track' && t.id).map(faixa);
  };
  const capa = imgs => { const l = (imgs || []).slice().sort((a, b) => (a.width || 0) - (b.width || 0)); return (l.find(i => (i.width || 0) >= 120) || l[l.length - 1] || {}).url || ''; };
  const faixa = t => ({ id:t.id, uri:t.uri, titulo:t.name, artistas:(t.artists || []).map(a => a.name), album:(t.album || {}).name || '', lanc:(t.album || {}).release_date || '',
    capa:capa((t.album || {}).images), pop:typeof t.popularity === 'number' ? t.popularity : null, ms:t.duration_ms || 0, url:(t.external_urls || {}).spotify || '' });
  const adicionarNaLista = (uris) => api(`/playlists/${r.playlist.id}/items`, { method:'POST', body:JSON.stringify({ uris }) })
    .catch(e => e.status === 404 || e.status === 400 ? api(`/playlists/${r.playlist.id}/tracks`, { method:'POST', body:JSON.stringify({ uris }) }) : Promise.reject(e));

  // ---------- comparar com o acervo ----------
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s[-–]\s.*$/, '').replace(/\b(feat|ft)\b.*$/, '').replace(/[^a-z0-9]/g, '');
  const noAcervo = f => { const t = norm(f.titulo), arts = f.artistas.map(norm);
    return S.db.musicas.find(m => norm(m.titulo) === t && M.artistas(m).some(a => arts.includes(norm(a)))) || null; };
  const recente = f => f.lanc && (Date.now() - Date.parse(f.lanc.length === 4 ? f.lanc + '-01-01' : f.lanc)) / 864e5 <= 30;
  const quando = f => { if (!f.lanc) return ''; const d = Math.floor((Date.now() - Date.parse(f.lanc)) / 864e5);
    return f.lanc.length < 10 ? 'lançada em ' + f.lanc.slice(0, 4) : d <= 0 ? 'lançada hoje' : d <= 30 ? `lançada há ${d} dia${d > 1 ? 's' : ''}` : 'lançada em ' + f.lanc.split('-').reverse().join('/'); };

  // Toques dos últimos 7 dias, contados na programação gravada da rádio
  const contarToques = async () => {
    const hoje = S.today(), agora = new Date().getHours();
    const linhas = await S.q(S.sb.from('mus_programacao').select('data,hora,itens').eq('veiculo_id', S.ui.vehicleId).gte('data', M.somaDias(hoje, -6)).lte('data', hoje));
    const n = {}, ult = {};
    linhas.forEach(l => { if (l.data === hoje && l.hora > agora) return;
      (l.itens || []).forEach(s => { if (s.k !== 'MUS' || !s.musica) return; n[s.musica] = (n[s.musica] || 0) + 1;
        const k = l.data + ' ' + String(l.hora).padStart(2, '0'); if (!ult[s.musica] || ult[s.musica] < k) ult[s.musica] = k; }); });
    r.toques = n; r.ultima = ult;
  };

  const carregar = async () => {
    r.carregando = true; r.erro = '';
    try {
      if (S.db.musVeiculo !== S.ui.vehicleId) { if (!S.ui.musSemana) S.ui.musSemana = M.segunda(S.today()); await S.carregarMusical(); }
      if (!r.perfil) r.perfil = await api('/me');
      const nome = nomePlaylist().toLowerCase(); let url = '/me/playlists?limit=50', achada = null;
      for (let i = 0; url && !achada && i < 6; i++) { const j = await api(url); achada = (j.items || []).find(p => p && (p.name || '').trim().toLowerCase() === nome); url = j.next; }
      r.playlist = achada; r.semPlaylist = !achada;
      r.faixas = achada ? await itens(achada.id) : [];
      await contarToques();
    } catch (e) { console.error(e); r.erro = S.erro(e); }
    r.carregando = false; S.render();
  };

  // ---------- tela ----------
  const logo = (h = 20) => `<span class="sp-logo" style="--h:${h}px" role="img" aria-label="Spotify"><img class="cl" src="img/spotify-preto.png" alt=""><img class="es" src="img/spotify-branco.png" alt=""></span>`;
  const tituloTela = () => `<span class="sub">${esc(S.veh().nome)}</span>Radar`;
  const capaHtml = (f, cls = '') => f.capa ? `<img class="rad-capa${cls}" src="${esc(f.capa)}" alt="Capa de ${esc(f.album || f.titulo)}" loading="lazy">` : `<span class="rad-capa${cls} vazia"></span>`;

  const telaSemApp = () => `<div class="card empty radar"><b>O Radar ainda não está ligado ao Spotify</b>
    ${S.me.diretor ? 'Falta cadastrar o app do Sonvi no painel de desenvolvedores do Spotify e colocar o código dele (Client ID) na configuração. Peça ao Claude o passo a passo.' : 'O diretor precisa terminar a configuração do Spotify. Avise a direção.'}</div>`;

  const telaConectar = () => `<div class="radar rad-conectar card">${logo(32)}
    <h2>Conecte o seu Spotify ao Radar</h2>
    <p class="muted">Cada programador entra com a própria conta. O Sonvi só lê o que você autorizar e não publica nada no seu nome.</p>
    <ol class="rad-passos">
      <li><b>Entre com a sua conta do Spotify</b><small>Abre a página oficial do Spotify; você autoriza e volta para o Sonvi Music.</small></li>
      <li><b>Monte no Spotify a playlist “${esc(nomePlaylist())}”</b><small>Coloque nela o que quer acompanhar: das paradas, de lançamentos, de pedidos. Se ela não existir, o Sonvi cria para você.</small></li>
      <li><b>Veja tudo comparado com o acervo</b><small>O Radar mostra o que já toca na rádio, o que falta e o que está subindo.</small></li>
    </ol>
    <div class="rad-pode"><small>O SONVI PODE VER</small><span>✓ Suas playlists (para ler a “${esc(nomePlaylist())}”) · ✓ Busca de músicas e artistas</span>
      <small>O SONVI NÃO FAZ</small><span>✕ Não copia as paradas · ✕ Não guarda dados do Spotify · ✕ Não toca músicas do Spotify no ar</span></div>
    ${r.erro ? `<p class="rad-erro">${esc(r.erro)}</p>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="rdConectar">Entrar com o Spotify</button></div></div>`;

  const atalhos = () => `<div class="rad-atalhos">${ATALHOS.map(([n, d, url]) => `<a class="rad-atalho" href="${url}" target="_blank" rel="noopener" title="Abrir ${esc(n)} no Spotify">
      <span class="row mid" style="justify-content:space-between">${logo(18)}<span aria-hidden="true">↗</span></span><span><b>${n}</b><small>${d}</small></span></a>`).join('')}
    <div class="rad-playlist"><small>SUA PLAYLIST DE RADAR</small><b>“${esc(nomePlaylist())}”${r.playlist ? ` · ${r.faixas.length} música${r.faixas.length === 1 ? '' : 's'}` : ''}</b>
      <small class="muted">Adicione músicas a essa playlist no seu Spotify (ou pela busca aqui ao lado) e elas aparecem já comparadas com o acervo.</small>
      ${r.playlist && r.playlist.external_urls ? `<a href="${esc(r.playlist.external_urls.spotify)}" target="_blank" rel="noopener">Abrir no Spotify ↗</a>` : ''}</div></div>`;

  const linhaFaixa = f => {
    const m = noAcervo(f), tq = m ? r.toques[m.id] || 0 : 0, ult = m && r.ultima[m.id], cat = m ? (S.db.mus_categorias.find(c => c.id === m.categoria_id) || {}).nome || 'Sem categoria' : '';
    const info = m ? `${tq} toque${tq === 1 ? '' : 's'} em 7 dias${ult ? ' · última vez ' + ult.slice(8, 10) + '/' + ult.slice(5, 7) + ' às ' + ult.slice(11) + 'h' : ''}${m.ativa ? '' : ' · desativada'}` : 'Ainda não está no acervo';
    const pop = f.pop === null ? `<span class="muted small" title="O Spotify não enviou a popularidade para este app">—</span>` : `<span class="rad-pop"><i style="width:${f.pop}%"></i></span><b class="num">${f.pop}</b>`;
    return `<div class="rad-linha">${capaHtml(f)}
      <span class="rad-tit"><b>${esc(f.titulo)}</b><small>${esc(f.artistas.join(', '))}${f.lanc ? ` · <span class="${recente(f) ? 'rad-novo' : ''}">${quando(f)}</span>` : ''}</small></span>
      <span class="rad-popc">${pop}</span>
      <span class="rad-ac"><span class="rad-selo${m ? ' tem' : ''}">${m ? '● ' + esc(cat) : '○ Fora do acervo'}</span><small>${esc(info)}</small></span>
      <span class="rad-bt">${m ? `<button class="btn sm" data-act="musFicha" data-id="${m.id}">Ver no acervo</button>` : `<button class="btn sm pri" data-act="rdAcervo" data-id="${esc(f.id)}">+ Adicionar</button>`}
        ${f.url ? `<a class="btn sm rad-play" href="${esc(f.url)}" target="_blank" rel="noopener" title="Ouvir no Spotify" aria-label="Ouvir ${esc(f.titulo)} no Spotify">▶</a>` : ''}</span></div>`;
  };

  const painel = () => {
    const fx = r.faixas.map(f => Object.assign(f, { _m:noAcervo(f) }));
    const tem = fx.filter(f => f._m), falta = fx.filter(f => !f._m), novas = fx.filter(recente);
    const lista = { todas:fx, falta, tem, novas }[r.filtro] || fx;
    const comPop = fx.some(f => f.pop !== null);
    const subindo = tem.filter(f => f.pop !== null && f.pop >= 60 && (r.toques[f._m.id] || 0) <= 3).sort((a, b) => b.pop - a.pop).slice(0, 5);
    const busca = `<div class="card"><h2>Buscar no Spotify</h2>
      <form id="rdBusca" class="rad-busca"><input type="search" name="q" value="${esc(r.q)}" placeholder="Música ou artista" aria-label="Buscar no Spotify"><button class="btn sm pri" type="submit">${r.buscando ? '…' : 'Buscar'}</button></form>
      ${r.res.length ? `<div class="rad-res">${r.res.map(f => { const naLista = r.faixas.some(x => x.id === f.id);
        return `<div class="rad-r">${capaHtml(f, ' p')}<span class="rad-tit"><b>${esc(f.titulo)}</b><small>${esc(f.artistas.join(', '))}${f.lanc ? ' · ' + f.lanc.slice(0, 4) : ''}</small></span>
          ${naLista ? '<small class="muted">Na lista</small>' : `<button class="btn sm" data-act="rdPorNaLista" data-id="${esc(f.id)}">+ Lista</button>`}</div>`; }).join('')}</div>` : r.q && !r.buscando ? '<p class="muted small">Nada encontrado.</p>' : ''}</div>`;
    const sobe = comPop ? `<div class="card rad-escuro"><h2>Subindo nos streams</h2><p class="small">Músicas do acervo com popularidade alta no Spotify e pouca rotação na rádio</p>
        ${subindo.length ? subindo.map(f => `<div class="rad-sobe"><span><b>${esc(f.titulo)}</b><small>${esc(f.artistas[0] || '')} · ${r.toques[f._m.id] || 0} toque${(r.toques[f._m.id] || 0) === 1 ? '' : 's'} em 7 dias</small></span><b class="num">${f.pop}</b></div>`).join('')
          : '<p class="small">Nenhuma por enquanto: o que está em alta já toca bem na rádio.</p>'}</div>` : '';
    const tiles = `<div class="tiles rad-tiles">${[['Na sua lista', fx.length, 'músicas da playlist', true], ['Já no acervo', tem.length, `${tem.filter(f => (r.toques[f._m.id] || 0) > 0).length} tocando nos últimos 7 dias`], ['Fora do acervo', falta.length, 'para avaliar'], ['Lançadas há menos de 30 dias', novas.length, `${novas.filter(f => !f._m).length} fora do acervo`]]
      .map(([k, v, d, hero]) => `<div class="tile${hero ? ' hero' : ''}"><small>${k}</small><b>${v}</b><span>${d}</span></div>`).join('')}</div>`;
    const filtros = `<div class="seg" role="tablist">${[['todas', 'Todas', fx.length], ['falta', 'Não temos', falta.length], ['tem', 'Já temos', tem.length], ['novas', 'Lançamentos', novas.length]]
      .map(([k, n, q]) => `<button class="${r.filtro === k ? 'on' : ''}" data-act="rdFiltro" data-f="${k}" role="tab" aria-selected="${r.filtro === k}">${n} <small>${q}</small></button>`).join('')}</div>`;
    const corpoLista = r.semPlaylist ? `<div class="empty"><b>A playlist “${esc(nomePlaylist())}” ainda não existe no seu Spotify</b>Crie agora (fica privada, só você vê) e comece a colocar nela as músicas que quer acompanhar.<div style="margin-top:16px"><button class="btn pri" data-act="rdCriarPlaylist">Criar a playlist no meu Spotify</button></div></div>`
      : !fx.length ? `<div class="empty"><b>A playlist está vazia</b>Adicione músicas a ela no Spotify ou pela busca ao lado.</div>`
      : `<div class="rad-cab"><span></span><span>Música</span><span>Popularidade</span><span>No acervo da ${esc(S.veh().nome)}</span><span></span></div>${lista.map(linhaFaixa).join('') || '<p class="muted">Nada neste filtro.</p>'}
        <p class="muted small" style="margin-top:12px">“Popularidade” é o índice de 0 a 100 do próprio Spotify, consultado agora e não guardado. Os toques vêm da programação da rádio, calculados pelo Sonvi.</p>`;
    return `${atalhos()}${r.playlist ? tiles : ''}
      <div class="rad-cols"><div class="card rad-lista"><div class="hd"><h2>Lista de observação</h2>${r.playlist && fx.length ? filtros : ''}</div>${corpoLista}</div>
      <div>${r.playlist ? busca : ''}${sobe}<p class="rad-fonte"><small>Capas, nomes e popularidade fornecidos por</small>${logo(18)}</p></div></div>`;
  };

  S.views.radar = () => {
    if (!PROG.includes(S.perfil)) return { title:tituloTela(), actions:'', body:'<div class="card empty"><b>Radar</b>Só o programador, o gerente e o diretor usam o Radar.</div>' };
    if (r.veic !== S.ui.vehicleId) zerar();
    if (!idApp()) return { title:tituloTela(), actions:'', body:telaSemApp() };
    if (!conectado()) return { title:tituloTela(), actions:'', body:telaConectar() };
    if (!r.perfil && !r.carregando && !r.erro) carregar();
    if (r.carregando || (!r.perfil && !r.erro)) return { title:tituloTela(), actions:'', body:'<div class="card empty radar"><div class="eq" style="justify-content:center;margin-bottom:14px"><span></span><span></span><span></span><span></span><span></span></div>Lendo o seu Spotify…</div>' };
    if (!r.perfil) return { title:tituloTela(), actions:'', body:telaConectar() };
    const topo = `<div class="rad-topo"><div><h2>O que está tocando nos streams</h2><p class="muted">Acompanhe as paradas no Spotify e compare com o que a ${esc(S.veh().nome)} toca.</p></div>
      <div class="row mid"><span class="rad-conta">${logo(20)}<i></i><small>Conectado como <b>${esc(r.perfil.display_name || r.perfil.id || '')}</b></small></span>
      <button class="btn sm" data-act="rdSair" title="Desconectar o Spotify deste navegador">Desconectar</button><button class="btn pri" data-act="rdAtualizar">↻ Atualizar</button></div></div>`;
    return { title:tituloTela(), actions:'', body:`<div class="radar">${topo}${r.erro ? `<p class="rad-erro">${esc(r.erro)}</p>` : ''}${painel()}</div>` };
  };

  // ---------- ações ----------
  const achar = id => r.faixas.find(f => f.id === id) || r.res.find(f => f.id === id);
  Object.assign(S.actions, {
    rdConectar: () => conectar().catch(e => S.toast(e.message)),
    rdSair: async () => { if (!await S.confirmar('Desconectar o Spotify deste navegador? Você pode conectar de novo quando quiser.', { ok:'Desconectar' })) return; gravar(chave(), null); r.perfil = null; zerar(); S.render(); },
    rdAtualizar: () => { r.perfil = null; r.erro = ''; carregar(); S.render(); },
    rdFiltro: d => { r.filtro = d.f; S.render(); },
    rdCriarPlaylist: async () => {
      try { r.playlist = await api('/me/playlists', { method:'POST', body:JSON.stringify({ name:nomePlaylist(), public:false, description:'Músicas que a rádio acompanha no Radar do Sonvi Music.' }) }); r.semPlaylist = false; r.faixas = []; S.toast('Playlist criada no seu Spotify.'); }
      catch (e) { S.toast(S.erro(e)); }
      S.render();
    },
    rdPorNaLista: async d => {
      const f = achar(d.id); if (!f || !r.playlist) return;
      try { await adicionarNaLista([f.uri]); r.faixas.unshift(f); S.toast(`“${f.titulo}” entrou na sua lista do Radar.`); } catch (e) { S.toast(S.erro(e)); }
      S.render();
    },
    rdAcervo: d => {
      const f = achar(d.id); if (!f) return;
      if (!S.db.mus_categorias.length) return S.toast('Prepare a programação musical antes de cadastrar músicas.');
      if (!S.ui.musSemana) S.ui.musSemana = M.segunda(S.today());
      S.actions.musFicha({ pre:{ titulo:f.titulo, interprete:f.artistas[0] || '', interprete2:f.artistas[1] || '', disco:f.album, ano:(f.lanc || '').slice(0, 4), duracao:Math.round(f.ms / 1000), novidade:true } });
    }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'rdBusca') return;
    e.preventDefault(); r.q = (new FormData(e.target).get('q') || '').trim(); if (!r.q) { r.res = []; return S.render(); }
    r.buscando = true; S.render();
    try { const j = await api('/search?' + new URLSearchParams({ q:r.q, type:'track', limit:'10' })); r.res = ((j.tracks || {}).items || []).filter(Boolean).map(faixa); }
    catch (e2) { S.toast(S.erro(e2)); r.res = []; }
    r.buscando = false; S.render();
  });
})();

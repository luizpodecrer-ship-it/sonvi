// SONVI · clientes (anunciantes) e agências do veículo selecionado.
// Cada rádio tem o próprio cadastro. Para não digitar de novo, o cadastro pode nascer em várias rádios de uma vez,
// ser levado depois (menu ⋯) ou trazido de outra rádio pelo CNPJ; ao alterar, o sistema pergunta se atualiza as cópias.
// As cópias ficam ligadas por cadastro_id (e pelo CNPJ/CPF, documento_num). Regras no banco: database/015_cadastro_em_varias_radios.sql.
(() => {
  const { esc } = S;
  const SIT = { prospect:['Prospect', 'orange'], ativo:['Ativo', 'green'], inativo:['Inativo', 'gray'] };
  // Dados cadastrais: são os que vão iguais para as outras rádios (consultor, situação, agência, comissão e observações não)
  const CADASTRAIS = [['nome', 'Nome'], ['pessoa', 'Tipo'], ['razao_social', 'Razão social'], ['documento', 'CNPJ / CPF'], ['inscricao_estadual', 'Inscrição estadual'],
    ['cep', 'CEP'], ['endereco', 'Endereço'], ['cidade', 'Cidade / UF'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['email_faturamento', 'E-mail de faturamento'],
    ['contato_decide', 'Contato que decide'], ['contato_assina', 'Contato que assina'], ['segmento', 'Segmento']];
  let aba = 'cliente';
  // Estado do formulário aberto (rádios de destino, agências delas, cadastro trazido de outra rádio)
  const cad = { destinos:[], agencias:[], trazido:null, achados:[], ignorar:'' };

  // ---------- rádios ----------
  const perfilEm = v => S.me.diretor ? 'diretor' : (S.db.vinculos.find(x => x.usuario_id === S.me.id && x.veiculo_id === v) || {}).perfil || null;
  // Outras rádios em que a pessoa pode cadastrar (o consultor só nas que ele atende)
  const radiosDestino = () => S.db.veiculos.filter(v => v.id !== S.ui.vehicleId && ['diretor', 'gerente', 'consultor'].includes(perfilEm(v.id)));
  const consultoresDe = v => S.responsaveis(v);
  const podeAlterarLa = r => { const pf = perfilEm(r.veiculo_id); return pf === 'diretor' || pf === 'gerente' || (pf === 'consultor' && (r.tipo === 'agencia' || r.consultor_id === S.me.id)); };
  const nomeRadio = id => (S.veh(id) || {}).nome || 'outra rádio';

  // O mesmo cadastro nas outras rádios (só aparecem os que o perfil pode ver)
  const grupoDe = p => p.cadastro_id || p.id;
  const buscarIrmaos = async (tipo, grupo, num) => {
    const ou = [grupo && `cadastro_id.eq.${grupo}`, grupo && `id.eq.${grupo}`, num && `documento_num.eq.${num}`].filter(Boolean);
    if (!ou.length) return [];
    return S.q(S.sb.from('pessoas').select('*').eq('tipo', tipo).neq('veiculo_id', S.ui.vehicleId).or(ou.join(',')));
  };
  const agenciasDe = async ids => ids.length ? S.q(S.sb.from('pessoas').select('id,veiculo_id,nome,cadastro_id,documento_num').eq('tipo', 'agencia').in('veiculo_id', ids)) : [];
  const soNumeros = s => String(s || '').replace(/\D/g, '');

  // ---------- bloco "Cadastrar também em" (formulário novo e "Levar para outra rádio") ----------
  const agenciaNaRadio = (v, agId) => {
    const a = S.pessoa(agId); if (!a) return null;
    const g = grupoDe(a), n = soNumeros(a.documento);
    return cad.agencias.find(x => x.veiculo_id === v && (x.cadastro_id === g || x.id === g || (n && x.documento_num === n))) || null;
  };
  const situacaoAgencia = (v, agId) => {
    const a = S.pessoa(agId);
    if (!a) return `<span class="cad-ag ok">${S.svg('check')}<span>Sem agência</span></span>`;
    const la = agenciaNaRadio(v, agId);
    return la ? `<span class="cad-ag ok">${S.svg('check')}<span><b>${esc(a.nome)}</b> já está na ${esc(nomeRadio(v))}: o cliente vai ligado a ela.</span></span>`
      : `<span class="cad-ag falta"><span><b>${esc(a.nome)}</b> ainda não está na ${esc(nomeRadio(v))}.</span><label class="chk"><input type="checkbox" name="x_ag_${v}" checked>Cadastrar a agência também</label></span>`;
  };
  const blocoRadios = ({ tipo, consultor, agencia, ja = new Set(), marcar = false }) => {
    const linhas = cad.destinos.map(v => {
      if (ja.has(v.id)) return `<div class="cad-radio ja">${S.vav(v)}<b>${esc(v.nome)}</b><span class="cad-ja">${S.svg('check')}Já cadastrado</span></div>`;
      const pf = perfilEm(v.id), cons = consultoresDe(v.id);
      const padrao = cons.some(u => u.id === consultor) ? consultor : '';
      const campoCons = tipo !== 'cliente' ? '' : pf === 'consultor'
        ? `<div class="f">Consultor nesta rádio<span class="cad-fixo">${esc(S.me.nome || S.me.email)} (você)</span></div>`
        : `<label class="f">Consultor nesta rádio<select name="x_cons_${v.id}"><option value="">Sem consultor</option>${cons.map(u => `<option value="${u.id}"${u.id === padrao ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>`;
      return `<div class="cad-radio"><label class="cad-top"><input type="checkbox" name="x_rad_${v.id}"${marcar ? ' checked' : ''}>${S.vav(v)}<b>${esc(v.nome)}</b></label>
        ${tipo === 'cliente' ? `<div class="cad-det">${campoCons}<div class="f">Agência nesta rádio<div data-cad-ag="${v.id}">${situacaoAgencia(v.id, agencia)}</div></div></div>` : ''}</div>`;
    }).join('');
    return `<div class="cad-radios">${linhas}</div>`;
  };
  const destinosMarcados = f => cad.destinos.filter(v => f['x_rad_' + v.id] === 'on')
    .map(v => ({ veiculo_id:v.id, consultor_id:f['x_cons_' + v.id] || null, criar_agencia:f['x_ag_' + v.id] === 'on' }));
  const levar = async (id, destinos) => {
    const r = await S.q(S.sb.rpc('levar_pessoa', { p_origem:id, p_destinos:destinos }));
    return r || { criados:[], ja:[] };
  };
  const resumo = r => { const c = (r.criados || []).map(nomeRadio), j = (r.ja || []).map(nomeRadio);
    return [c.length && 'cadastrado também na ' + c.join(' e na '), j.length && 'já existia na ' + j.join(' e na ')].filter(Boolean).join('; '); };

  // ---------- lista (aprovada em 24/10/2026): carteira com números, consultores, mapa da carteira e a lista com as compras ----------
  // Compras = PIs que saíram do comercial (na OPEC, aprovados, programados, faturados) dos últimos 12 meses, pela data de criação.
  // Lista aprovada em 25/10/2026 (adaptada do recurso "Escalafón" da Moxen, licença permite uso dentro do produto; estilos .cl-* em sonvi.css):
  // só a lista, que se ordena pelos títulos. Cada linha viaja do lugar velho ao novo com mola e em cascata; as que sobem passam por cima,
  // com sombra. Uma pílula salta ao título que manda, a seta gira ao inverter e as outras colunas ficam mais fracas. Tons do veículo.
  const VENDA = ['opec', 'aprovado', 'programado', 'faturado'];
  const cf = { sit:'todos', cons:'', por:'comprado', sentido:'desc' };
  const curtoC = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  // Compras por mês (12 meses, o último é o atual) de cada pessoa, pelo campo do PI (cliente_id ou agencia_id)
  const compras = campo => { const h = S.today(), mes0 = (() => { const [y, m] = h.split('-').map(Number), d = new Date(y, m - 12, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const idx = ym => { const [y, m] = ym.split('-').map(Number), [y0, m0] = mes0.split('-').map(Number); return (y - y0) * 12 + (m - m0); };
    const out = {}; S.db.pis.filter(p => VENDA.includes(p.status) && p[campo]).forEach(p => { const i = idx(S.dia(p.criado_em).slice(0, 7)); if (i < 0 || i > 11) return;
      const r = out[p[campo]] = out[p[campo]] || { m:Array(12).fill(0), total:0 }; const v = S.calc(p).total; r.m[i] += v; r.total += v; });
    Object.values(out).forEach(r => { const k = r.m.map((v, i) => v ? i : -1).filter(i => i > -1).pop(); r.ult = k === undefined ? -1 : 11 - k; });
    return out; };
  const ultTxt = c => !c || c.ult < 0 ? 'nunca' : c.ult === 0 ? 'este mês' : c.ult === 1 ? 'há 1 mês' : `há ${c.ult} meses`;
  const ultCls = c => !c || c.ult < 0 ? 'cl-u-nunca' : c.ult === 0 ? 'cl-u-mes' : c.ult <= 3 ? 'cl-u-tri' : 'cl-u-sumiu';
  // Colunas: [chave, título, sentido de partida, classe]
  const colunas = cli => [['nome', cli ? 'Cliente' : 'Agência', 'asc', ''], ...(cli ? [['cons', 'Consultor', 'asc', 'cl-c-cons']] : []), ['cidade', 'Cidade', 'asc', 'cl-c-cid'],
    ['comprado', 'Comprado', 'desc', ''], ['ultima', 'Última compra', 'asc', 'cl-c-ult'], ...(cli ? [['sit', 'Situação', 'asc', 'cl-c-sit']] : [])];
  const DITO = { nome:['de A a Z', 'de Z a A'], cons:['consultor, de A a Z', 'consultor, de Z a A'], cidade:['cidade, de A a Z', 'cidade, de Z a A'],
    comprado:['quem comprou mais primeiro', 'quem comprou menos primeiro'], ultima:['compra mais recente primeiro', 'compra mais antiga primeiro'], sit:['situação, de A a Z', 'situação, de Z a A'] };
  const SETA = '<svg class="cl-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13m0 0-5-5m5 5 5-5"/></svg>';
  // Mola convertida em curva linear() do CSS: o navegador anima sem JavaScript a cada quadro
  const mola = (k, c) => { const pts = [0]; let x = 0, v = 0, t = 0;
    while (t < 3) { v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240; pts.push(x); if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break; }
    const out = []; for (let i = 0; i <= 50; i++) out.push(pts[Math.round(i / 50 * (pts.length - 1))].toFixed(4)); out[50] = '1';
    return { easing:'linear(' + out.join(', ') + ')', duration:Math.round(t * 1000) }; };
  const VIAJE = mola(170, 19), PILULA = mola(260, 22), ESCADA = 18;
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pilulaEm = null;
  const poePilula = salta => { const tab = document.querySelector('.cl-tab'); if (!tab) { pilulaEm = null; return; }
    const p = tab.querySelector('.cl-pilula'), b = tab.querySelector('[aria-sort="ascending"] button, [aria-sort="descending"] button'); if (!p || !b) return;
    const rt = tab.querySelector('.cl-tit').getBoundingClientRect(), rb = b.getBoundingClientRect(), x = rb.left - rt.left, w = rb.width;
    p.style.width = w.toFixed(1) + 'px'; p.style.transform = `translateX(${x.toFixed(1)}px)`;
    if (pilulaEm && !salta && !quieto() && p.animate) p.animate([{ transform:`translateX(${pilulaEm.x.toFixed(1)}px) scaleX(${(pilulaEm.w / w).toFixed(4)})` }, { transform:`translateX(${x.toFixed(1)}px)` }], PILULA);
    pilulaEm = { x, w }; };
  let tPil; window.addEventListener('resize', () => { clearTimeout(tPil); tPil = setTimeout(() => poePilula(true), 100); });
  // Reordena com a viagem: mede antes, redesenha, mede depois e anima a diferença (as que sobem passam por cima)
  const viaja = () => {
    const antes = new Map([...document.querySelectorAll('.cl-corpo [data-linha]')].map(f => [f.dataset.linha, f.getBoundingClientRect().top]));
    S.render(); poePilula(false);
    if (quieto()) return;
    const filas = [...document.querySelectorAll('.cl-corpo [data-linha]')]; if (!filas.length || !filas[0].animate) return;
    const alto = filas[0].offsetHeight;
    filas.forEach((f, i) => { if (!antes.has(f.dataset.linha)) return; const dy = antes.get(f.dataset.linha) - f.getBoundingClientRect().top; if (Math.abs(dy) < .5) return;
      const sobe = dy > 0, longe = Math.min(1, Math.abs(dy) / (alto * 3)); f.style.zIndex = sobe ? '3' : '1';
      const op = { duration:VIAJE.duration, easing:VIAJE.easing, delay:i * ESCADA, fill:'backwards' };
      f.animate([{ transform:`translateY(${dy.toFixed(1)}px)`, opacity:1 }, { transform:`translateY(${(dy * .55).toFixed(1)}px) scale(${(sobe ? 1 + .022 * longe : 1 - .02 * longe).toFixed(3)})`, opacity:sobe ? 1 : 1 - .35 * longe, offset:.3 }, { transform:'none', opacity:1 }], op);
      if (sobe) f.animate([{ opacity:0 }, { opacity:.3 + .7 * longe, offset:.3 }, { opacity:0 }], Object.assign({}, op, { pseudoElement:'::after' }));
      setTimeout(() => { f.style.zIndex = ''; }, VIAJE.duration + i * ESCADA); });
  };

  S.views.clientes = id => {
    aba = id === 'agencias' ? 'agencia' : 'cliente';
    const cli = aba === 'cliente', q = S.ui.q.toLowerCase(), todas = S.pessoas(aba), cp = compras(cli ? 'cliente_id' : 'agencia_id');
    const gestor = S.pode('diretor', 'gerente'), podeCriar = S.pode('diretor', 'gerente', 'consultor'), outras = radiosDestino().length > 0;
    const cols = colunas(cli); if (!cols.some(c => c[0] === cf.por)) { cf.por = 'comprado'; cf.sentido = 'desc'; }
    // Responsáveis: consultores e gerentes da rádio e quem mais tiver clientes (ex.: o diretor)
    const resp = !(cli && gestor) ? [] : [...S.responsaveis(), ...[...new Set(todas.map(p => p.consultor_id).filter(Boolean))].map(id => ({ id, nome:S.usuario(id) || 'Responsável' }))]
      .filter((u, i, l) => l.findIndex(x => x.id === u.id) === i && todas.some(p => p.consultor_id === u.id));
    if (cf.cons && !resp.some(u => u.id === cf.cons)) cf.cons = '';
    const nomeCons = p => p.consultor_id ? (S.usuario(p.consultor_id) || '') : '';
    const valor = (p, k) => { const c = cp[p.id]; return k === 'comprado' ? (c ? c.total : 0) : k === 'ultima' ? (c && c.ult >= 0 ? c.ult : 999) : k === 'cons' ? (nomeCons(p) || '￿') : k === 'sit' ? (SIT[p.situacao] || [''])[0] : String(p[k === 'nome' ? 'nome' : 'cidade'] || '￿'); };
    const lista = todas.filter(p => (!cli || !cf.cons || p.consultor_id === cf.cons) && (!cli || cf.sit === 'todos' || p.situacao === cf.sit)
      && (!q || [p.nome, p.razao_social, p.documento, p.cidade, p.segmento].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => { const x = valor(a, cf.por), y = valor(b, cf.por), r = typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR');
        return (r || a.nome.localeCompare(b.nome, 'pt-BR')) * (cf.sentido === 'asc' ? 1 : -1); });
    const max = Math.max(1, ...lista.map(p => (cp[p.id] || {}).total || 0)), tot = lista.reduce((s, p) => s + ((cp[p.id] || {}).total || 0), 0);
    const recentes = lista.filter(p => cp[p.id] && cp[p.id].ult <= 2).length, palavra = cli ? (lista.length === 1 ? 'cliente' : 'clientes') : (lista.length === 1 ? 'agência' : 'agências');
    const resumo = `${lista.length} ${palavra} · ${curtoC(tot)} em 12 meses · ${recentes} ${recentes === 1 ? 'comprou' : 'compraram'} nos últimos 3 meses`;
    const ini = cols.find(c => c[0] === cf.por)[2], estado = 'Ordenado: ' + DITO[cf.por][cf.sentido === ini ? 0 : 1];
    const tres = p => outras && podeAlterarLa(p) ? `<button class="btn tres" data-act="pesMenu" data-id="${p.id}" aria-label="Opções de ${esc(p.nome)}">${S.svg('mais3')}</button>` : '';
    const sub = p => cli ? [p.documento, p.telefone || p.whatsapp].filter(Boolean).join(' · ') : [`Comissão ${S.nfmt(Number(p.comissao)) || '0'}%`, (() => { const n = S.pessoas('cliente').filter(c => c.agencia_id === p.id).length; return n ? `${n} cliente${n === 1 ? '' : 's'}` : ''; })()].filter(Boolean).join(' · ');
    const comp = p => { const c = cp[p.id], v = c ? c.total : 0; return `<span class="cl-bar" aria-hidden="true"><i style="--p:${v ? (.08 + .92 * v / max).toFixed(3) : 0}"></i></span>${v ? curtoC(v) : '—'}`; };
    const sitPill = p => `<span class="pill cl-s-${esc(p.situacao)}">${esc((SIT[p.situacao] || [p.situacao])[0])}</span>`;
    const linha = p => `<div class="cl-fila" role="row" data-linha="${p.id}" data-act="pesEditar" data-id="${p.id}">
      <span class="cl-cel cl-nome" role="cell" data-col="nome"><span class="av soft" aria-hidden="true">${esc(S.iniciais(p.nome))}</span><span><b title="${esc(p.nome)}">${esc(p.nome)}</b>${sub(p) ? `<small>${esc(sub(p))}</small>` : ''}</span></span>
      ${cli ? `<span class="cl-cel cl-c-cons" role="cell" data-col="cons">${esc(nomeCons(p).split(' ')[0]) || '—'}</span>` : ''}
      <span class="cl-cel cl-c-cid" role="cell" data-col="cidade" title="${esc(p.cidade)}">${esc(p.cidade) || '—'}</span>
      <span class="cl-cel cl-comp" role="cell" data-col="comprado">${comp(p)}</span>
      <span class="cl-cel cl-c-ult" role="cell" data-col="ultima"><span class="pill ${ultCls(cp[p.id])}">${ultTxt(cp[p.id])}</span></span>
      ${cli ? `<span class="cl-cel cl-c-sit" role="cell" data-col="sit">${sitPill(p)}</span>` : ''}
      <span class="cl-acao" role="cell">${tres(p)}</span></div>`;
    const cab = `<div class="cl-fila cl-tit" role="row"><span class="cl-pilula" aria-hidden="true"></span>${cols.map(([k, n, s, cl]) => `<span role="columnheader" class="${cl}" data-col="${k}" aria-sort="${cf.por === k ? (cf.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-act="cliOrdem" data-v="${k}" data-sentido="${s}">${n}${SETA}</button></span>`).join('')}<span role="columnheader" class="cl-acao"><span class="sr">Opções</span></span></div>`;
    const cel = p => `<div class="cl-cel-l" data-flip="${p.id}" data-act="pesEditar" data-id="${p.id}"><span class="cl-nome"><span class="av soft" aria-hidden="true">${esc(S.iniciais(p.nome))}</span><span><b>${esc(p.nome)}</b><small>${esc([cli ? nomeCons(p).split(' ')[0] : '', p.cidade].filter(Boolean).join(' · ') || '—')}</small></span></span>
      <span class="cl-dir"><b>${cp[p.id] ? curtoC(cp[p.id].total) : '—'}</b><span class="pill ${ultCls(cp[p.id])}">${ultTxt(cp[p.id])}</span></span></div>`;
    const filtrado = q || cf.sit !== 'todos' || cf.cons;
    const vazio = `<div class="empty"><b>Nenhum cadastro${filtrado ? ' encontrado' : ''}</b>${filtrado ? 'Experimente outro filtro ou outra busca.' : S.pode('consultor') && cli ? 'Aqui aparecem os clientes da sua carteira.' : podeCriar ? (cli ? 'Cadastre o primeiro cliente pelo botão "Novo cliente".' : 'Cadastre a primeira agência pelo botão "Nova agência".') : ''}</div>`;
    const filtros = `<div class="cl-barra"><label class="fin-busca">${S.svg('busca')}<input value="${esc(S.ui.q)}" data-ui="q" placeholder="Buscar por nome, CNPJ, cidade ou segmento" aria-label="Buscar ${cli ? 'clientes' : 'agências'}"></label>
      ${cli ? `<select data-clif="sit" aria-label="Situação">${[['todos', 'Todas as situações'], ['ativo', 'Ativos'], ['prospect', 'Prospects'], ['inativo', 'Inativos']].map(([k, n]) => `<option value="${k}"${cf.sit === k ? ' selected' : ''}>${n} · ${k === 'todos' ? todas.length : todas.filter(p => p.situacao === k).length}</option>`).join('')}</select>` : ''}
      ${resp.length > 1 ? `<select data-clif="cons" aria-label="Consultor"><option value="">Todos os consultores</option>${resp.map(u => `<option value="${u.id}"${cf.cons === u.id ? ' selected' : ''}>${esc(u.nome)} · ${todas.filter(p => p.consultor_id === u.id).length}</option>`).join('')}</select>` : ''}</div>`;
    const card = `<section class="card cl-card" aria-labelledby="cl-t">${filtros}
      <div class="cl-cab"><div><h2 id="cl-t">${cli ? 'Clientes' : 'Agências'}</h2><p>${resumo}</p></div>${S.celular ? '' : `<span class="cl-estado" aria-live="polite">${estado}</span>`}</div>
      ${!lista.length ? vazio : S.celular ? `<div class="cl-cel-lista">${lista.map(cel).join('')}</div>`
        : `<div class="cl-tab ${cli ? 'cl-cli' : 'cl-ag'}" role="table" aria-labelledby="cl-t" data-por="${cf.por}">${cab}<div class="cl-corpo" role="rowgroup">${lista.map(linha).join('')}</div></div>`}</section>`;
    queueMicrotask(() => poePilula(true));
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>${cli ? 'Clientes' : 'Agências'}`, actions:podeCriar ? `<button class="btn pri" data-act="pesNovo">${S.svg('mais')}${cli ? 'Novo cliente' : 'Nova agência'}</button>` : '',
      body:`<div class="seg ct-abas" role="tablist" aria-label="Cadastros">${[['cliente', 'Clientes', S.pessoas('cliente').length], ['agencia', 'Agências', S.pessoas('agencia').length]].map(([k, n, c]) => `<button role="tab" aria-selected="${aba === k}" class="${aba === k ? 'on' : ''}" data-act="pesAba" data-tab="${k}">${n} <span>${c}</span></button>`).join('')}</div>${card}` };
  };
  S.actions.cliOrdem = d => { const k = d.v; cf.sentido = cf.por === k ? (cf.sentido === 'asc' ? 'desc' : 'asc') : d.sentido; cf.por = k; viaja(); };
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-clif]'); if (!s) return; cf[s.dataset.clif] = s.value; S.flip(S.render); });

  // ---------- formulário ----------
  async function formulario(p) {
    const cliente = (p.tipo || aba) === 'cliente', gestor = S.pode('diretor', 'gerente'), novo = !p.id, tipo = cliente ? 'cliente' : 'agencia';
    Object.assign(cad, { destinos:novo ? radiosDestino() : [], agencias:[], trazido:null, achados:[], ignorar:'' });
    if (novo && cliente && cad.destinos.length) { try { cad.agencias = await agenciasDe(cad.destinos.map(v => v.id)); } catch (e) { console.error(e); } }
    const buscar = (id, label) => ({ html:`<div style="display:flex;align-items:flex-end"><button type="button" class="btn sm" data-act="${id}">${label}</button></div>` });
    const bloco = novo && cad.destinos.length ? [{ html:`<div class="cad-bloco" style="grid-column:1/-1"><div class="cad-hd"><b>Cadastrar também em</b><small>${S.pode('consultor') ? 'Aparecem as rádios que você atende' : 'Aparecem as rádios em que você trabalha'}</small></div>
        ${blocoRadios({ tipo, consultor:p.consultor_id, agencia:p.agencia_id })}
        <small class="muted">Nome, CNPJ, endereço e contatos vão iguais. ${cliente ? 'A situação vai igual; consultor, PIs e financeiro ficam separados em cada rádio.' : 'Os PIs e o financeiro ficam separados em cada rádio.'}</small></div>` }] : [];
    const campos = [
      { k:'nome', label:cliente ? 'Nome fantasia ou nome' : 'Nome da agência', req:true, ph:cliente ? 'Ex.: Supermercado Três Irmãos' : 'Ex.: Agência Ponto Alto' },
      { k:'pessoa', label:'Tipo', type:'select', options:[['pj', 'Pessoa jurídica'], ['pf', 'Pessoa física']] },
      { k:'documento', label:'CNPJ / CPF' }, buscar('pesCnpj', 'Preencher pelo CNPJ'),
      ...(novo ? [{ html:'<div id="cadAchado" style="grid-column:1/-1" hidden></div>' }] : []),
      { k:'razao_social', label:'Razão social' }, { k:'inscricao_estadual', label:'Inscrição estadual' },
      { k:'cep', label:'CEP' }, { k:'cidade', label:'Cidade / UF' },
      { k:'endereco', label:'Endereço', full:true },
      { k:'telefone', label:'Telefone' }, { k:'whatsapp', label:'WhatsApp' }, { k:'email', label:'E-mail', type:'email' },
      { k:'email_faturamento', label:'E-mail de faturamento', type:'email', ph:'financeiro@empresa.com.br' },
      ...(cliente ? [
        { k:'segmento', label:'Segmento' }, { k:'contato_decide', label:'Contato que decide' }, { k:'contato_assina', label:'Contato que assina' },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Sem agência'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        { k:'situacao', label:'Situação', type:'select', options:Object.entries(SIT).map(([k, v]) => [k, v[0]]) },
        ...(gestor ? [{ k:'consultor_id', label:'Consultor responsável', type:'select', options:[['', 'Sem consultor'], ...S.responsaveis().map(u => [u.id, u.nome]), ...(p.consultor_id && !S.responsaveis().some(u => u.id === p.consultor_id) ? [[p.consultor_id, (S.usuario(p.consultor_id) || 'Responsável atual') + ' (sem acesso a esta rádio)']] : [])] }] : [])
      ] : [{ k:'comissao', label:'Comissão padrão (%)' }]),
      { k:'observacoes', label:'Observações', type:'textarea' },
      ...bloco,
      ...(!novo && gestor ? [{ html:`<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir cadastro</button></div>` }] : [])];
    S.form(novo ? (cliente ? 'Novo cliente' : 'Nova agência') : esc(p.nome), campos, p, v => salvar(p, v, { cliente, gestor, novo, tipo }));
    const d = document.getElementById('dlg'), ok = d.onclose;
    if (bloco.length) d.classList.add('medio');
    d.onclose = async () => { d.classList.remove('medio'); if (d.returnValue === 'excluir') { if (await S.confirmar('Excluir este cadastro?', { ok:'Excluir cadastro', perigo:true })) S.run(() => S.excluir('pessoas', p.id), 'Cadastro excluído'); } else ok(); };
    contarRadios();
  }

  async function salvar(p, v, { cliente, gestor, novo, tipo }) {
    const extras = {}; Object.keys(v).filter(k => k.startsWith('x_')).forEach(k => { extras[k] = v[k]; delete v[k]; });
    const row = Object.assign({}, v, { agencia_id:v.agencia_id || null });
    if (cliente) row.consultor_id = gestor ? (v.consultor_id || null) : (p.consultor_id || S.me.id); else { row.comissao = S.num(v.comissao); delete row.agencia_id; }
    if (p.id) row.id = p.id; else Object.assign(row, { veiculo_id:S.ui.vehicleId, tipo });
    if (novo && cad.trazido) row.cadastro_id = cad.trazido;
    const mudou = !novo ? CADASTRAIS.filter(([k]) => k in v && String(v[k] ?? '') !== String(p[k] ?? '')) : [];
    let irmaos = [], aviso = 'Cadastro salvo';
    const ok = await S.run(async () => {
      // As cópias nas outras rádios são procuradas antes de gravar (o CNPJ pode estar mudando)
      if (mudou.length) { try { irmaos = (await buscarIrmaos(tipo, grupoDe(p), soNumeros(p.documento))).filter(podeAlterarLa); } catch (e) { console.error(e); } }
      const r = await S.salvar('pessoas', row);
      const destinos = novo ? destinosMarcados(extras) : [];
      if (destinos.length) { const res = await levar(r.id, destinos); const t = resumo(res); if (t) aviso = 'Cadastro salvo: ' + t + '.';
        const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', r.id).single()); Object.assign(r, atual); }
    }, null);
    if (!ok) return;
    S.toast(aviso);
    if (irmaos.length) perguntarAtualizar(p, mudou, irmaos);
  }

  // Ao alterar: pergunta se leva os dados cadastrais para as outras rádios
  function perguntarAtualizar(velho, mudou, irmaos) {
    const p = S.pessoa(velho.id) || velho; // já com os dados novos
    const linhas = mudou.map(([k, n]) => `<div class="cad-mud"><span>${n}</span><span>${velho[k] ? `<s>${esc(velho[k])}</s>` : ''}<b>${esc(p[k] || '—')}</b></span></div>`).join('');
    const antes = p;
    const total = irmaos.length + 1;
    S.dialog(`<h2>Atualizar também nas outras rádios?</h2><p class="muted" style="margin-top:-8px">${esc(antes.nome)} também está ${irmaos.length > 1 ? 'nestas rádios' : 'nesta rádio'}. Marque onde atualizar.</p>
      <div><small class="cad-rot">O QUE MUDOU</small>${linhas}</div>
      <div class="cad-radios">${irmaos.map(r => `<label class="cad-radio cad-top"><input type="checkbox" name="x_${r.id}" checked>${S.vav(S.veh(r.veiculo_id))}<b>${esc(nomeRadio(r.veiculo_id))}</b></label>`).join('')}</div>
      <small class="muted">Só os dados cadastrais vão para as outras rádios. Consultor, situação, agência e observações de cada rádio continuam como estão.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Só na ${esc(S.veh().nome)}</button><button class="btn pri" value="ok" data-cad-total>Atualizar nas ${total} rádios</button></div>`,
    f => { const ids = irmaos.filter(r => f['x_' + r.id] === 'on').map(r => r.id); if (!ids.length) return;
      S.run(async () => { const n = await S.q(S.sb.rpc('atualizar_cadastros_irmaos', { p_origem:p.id, p_ids:ids })); S.toast(`Atualizado em ${n} outra${n === 1 ? '' : 's'} rádio${n === 1 ? '' : 's'}.`); }, null); });
  }

  // ---------- menu ⋯ › Levar para outra rádio ----------
  async function levarDialogo(p) {
    cad.destinos = radiosDestino(); cad.agencias = [];
    let irmaos = [];
    try { [irmaos, cad.agencias] = await Promise.all([buscarIrmaos(p.tipo, grupoDe(p), soNumeros(p.documento)), p.tipo === 'cliente' ? agenciasDe(cad.destinos.map(v => v.id)) : []]); }
    catch (e) { return S.toast(S.erro(e)); }
    const ja = new Set(irmaos.map(r => r.veiculo_id)), livres = cad.destinos.filter(v => !ja.has(v.id));
    S.dialog(`<h2>Levar para outra rádio</h2><p class="muted" style="margin-top:-8px">${esc(p.nome)} · ${esc(S.veh().nome)}</p>
      ${blocoRadios({ tipo:p.tipo, consultor:p.consultor_id, agencia:p.agencia_id, ja, marcar:livres.length === 1 })}
      <small class="muted">${S.pode('consultor') ? 'Aparecem só as rádios que você atende. ' : ''}${p.tipo === 'cliente' ? 'A situação (Ativo, Prospect, Inativo) vai igual. ' : ''}Nome, CNPJ, endereço e contatos vão iguais; PIs e financeiro ficam separados.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>${livres.length ? 'Cancelar' : 'Fechar'}</button>${livres.length ? '<button class="btn pri" value="ok" data-cad-levar>Cadastrar</button>' : ''}</div>`,
    f => { const destinos = destinosMarcados(f); if (!destinos.length) return S.toast('Marque pelo menos uma rádio.');
      S.run(async () => { const r = await levar(p.id, destinos); const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', p.id).single()); Object.assign(S.pessoa(p.id) || {}, atual);
        S.toast(('Pronto: ' + resumo(r) + '.').replace('Pronto: .', 'Nada para cadastrar.')); }, null); });
    document.getElementById('dlg').classList.add('medio');
    const dlg = document.getElementById('dlg'), fim = dlg.onclose; dlg.onclose = () => { dlg.classList.remove('medio'); if (fim) fim(); };
    contarRadios();
  }

  // Botão de salvar diz em quantas rádios vai cadastrar; a agência de cada rádio acompanha a escolhida no formulário
  function contarRadios() {
    const d = document.getElementById('dlg'); if (!d) return;
    const n = d.querySelectorAll('.cad-radios input[name^="x_rad_"]:checked').length;
    const pri = d.querySelector('.so-editar .btn.pri'); if (pri) pri.textContent = n ? `Salvar nas ${n + 1} rádios` : 'Salvar';
    const lev = d.querySelector('[data-cad-levar]'); if (lev) { lev.textContent = n === 1 ? 'Cadastrar na ' + nomeRadio(d.querySelector('.cad-radios input[name^="x_rad_"]:checked').name.slice(6)) : n ? `Cadastrar nas ${n} rádios` : 'Cadastrar'; lev.disabled = !n; }
    const tot = d.querySelector('[data-cad-total]'); if (tot) { const m = d.querySelectorAll('.cad-radios input[name^="x_"]:checked').length; tot.textContent = m ? `Atualizar nas ${m + 1} rádios` : 'Atualizar'; tot.disabled = !m; }
  }
  document.addEventListener('change', e => {
    const d = document.getElementById('dlg'); if (!d || !d.open || !d.contains(e.target)) return;
    if (e.target.closest('.cad-radios')) contarRadios();
    if (e.target.name === 'agencia_id') d.querySelectorAll('[data-cad-ag]').forEach(el => { el.innerHTML = situacaoAgencia(el.dataset.cadAg, e.target.value); });
  });

  // ---------- CNPJ já cadastrado em outra rádio ----------
  let espera = null;
  document.addEventListener('input', e => {
    const d = document.getElementById('dlg'); if (!d || !d.open || e.target.name !== 'documento' || !d.querySelector('#cadAchado')) return;
    clearTimeout(espera); espera = setTimeout(() => procurarDocumento(e.target.value), 350);
  });
  async function procurarDocumento(valor) {
    const box = document.querySelector('#dlg #cadAchado'); if (!box) return;
    const n = soNumeros(valor);
    if (![11, 14].includes(n.length)) { box.hidden = true; return; }
    // Cliente que já existe nesta rádio (de outro consultor): avisa quem atende, sem mostrar os dados, e não deixa salvar
    if (aba === 'cliente') { let dono = null;
      try { dono = await S.q(S.sb.rpc('cliente_de_outro', { p_veiculo:S.ui.vehicleId, p_doc:n })); } catch (e) { console.error(e); }
      const el = campo('documento');
      if (dono && el && soNumeros(el.value) === n) {
        const msg = S.pode('consultor') ? `Este cliente já é atendido por ${dono} nesta rádio. Fale com o gerente.` : `Este cliente já está cadastrado nesta rádio (consultor: ${dono}).`;
        el.setCustomValidity(msg); box.hidden = false;
        box.innerHTML = `<div class="cad-achado aviso" role="alert">${S.svg('bloqueio')}<div><b>${n.length === 14 ? 'CNPJ' : 'CPF'} já cadastrado nesta rádio</b><span>${esc(msg)}</span></div></div>`;
        return; } }
    if (n === cad.ignorar) { box.hidden = true; return; }
    let achados = [];
    try { achados = await buscarIrmaos(aba, null, n); } catch (e) { console.error(e); }
    cad.achados = achados; const a = achados[0];
    if (!a || cad.trazido) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="cad-achado">${S.vav(S.veh(a.veiculo_id))}<div><b>Esse ${n.length === 14 ? 'CNPJ' : 'CPF'} já está cadastrado na ${esc(nomeRadio(a.veiculo_id))}</b>
      <span>${esc([a.nome, a.cidade, a.telefone].filter(Boolean).join(' · '))}</span>
      <small class="muted">Trazer os dados de lá preenche o formulário. Você confere${aba === 'cliente' ? ' e escolhe o consultor desta rádio' : ''}.</small>
      <div class="row"><button type="button" class="btn sm pri" data-act="pesTrazer">Trazer os dados da ${esc(nomeRadio(a.veiculo_id))}</button><button type="button" class="btn sm" data-act="pesIgnorar">Não, é outro cadastro</button></div></div></div>`;
    // A rádio de onde veio já tem o cadastro: some do "Cadastrar também em"
    achados.forEach(r => { const c = document.querySelector(`#dlg input[name="x_rad_${r.veiculo_id}"]`); if (c) { c.checked = false; c.closest('.cad-radio').classList.add('ja'); c.closest('.cad-radio').innerHTML = `${S.vav(S.veh(r.veiculo_id))}<b>${esc(nomeRadio(r.veiculo_id))}</b><span class="cad-ja">${S.svg('check')}Já cadastrado</span>`; } });
    contarRadios();
  }

  // Preenchimento pelo CNPJ (botão). O CEP se preenche sozinho ao completar os 8 números (core.js).
  // Três serviços públicos, um de reserva do outro: se um estiver fora do ar ou limitando consultas, tenta o próximo.
  const campo = n => document.querySelector(`#dlg [name="${n}"]`);
  const FONTES_CNPJ = [
    n => ['https://brasilapi.com.br/api/cnpj/v1/' + n, j => j],
    n => ['https://minhareceita.org/' + n, j => j],
    n => ['https://publica.cnpj.ws/cnpj/' + n, j => { const e = j.estabelecimento || {};
      return { razao_social:j.razao_social, nome_fantasia:e.nome_fantasia, cep:e.cep, logradouro:[e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), numero:e.numero, bairro:e.bairro,
        municipio:(e.cidade || {}).nome, uf:(e.estado || {}).sigla, ddd_telefone_1:[e.ddd1, e.telefone1].filter(Boolean).join('') }; }]];
  async function dadosDoCnpj(n) {
    let naoExiste = 0;
    for (const fonte of FONTES_CNPJ) {
      const [url, ler] = fonte(n);
      try {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(url, { signal:ctrl.signal }); clearTimeout(t);
        if (r.ok) { const j = ler(await r.json()); if (j && j.razao_social) return j; }
        else if (r.status === 404 || r.status === 400) naoExiste++;
      } catch (e) { /* fora do ar ou demorou: tenta o próximo */ }
    }
    throw new Error(naoExiste >= 2 ? 'naoexiste' : 'fora');
  }
  S.dadosDoCnpj = n => dadosDoCnpj(n);   // usado também no cadastro da empresa comercial
  async function preencherCnpj(n) {
    const btn = document.querySelector('#dlg [data-act="pesCnpj"]'); if (btn) { btn.disabled = true; btn.textContent = 'Buscando…'; }
    try {
      const j = await dadosDoCnpj(n);
      campo('razao_social').value = j.razao_social || ''; if (!campo('nome').value) campo('nome').value = j.nome_fantasia || j.razao_social || '';
      campo('cep').value = j.cep || ''; campo('endereco').value = [j.logradouro, j.numero, j.bairro].filter(Boolean).join(', ');
      campo('cidade').value = [j.municipio, j.uf].filter(Boolean).join(' / '); if (!campo('telefone').value) campo('telefone').value = j.ddd_telefone_1 || '';
      S.mascarar(document.getElementById('dlg')); S.toast('Dados preenchidos. Confira antes de salvar.');
    } catch (e) { S.toast(e.message === 'naoexiste' ? 'Esse CNPJ não foi encontrado na Receita. Confira os números.' : 'Os serviços de consulta de CNPJ não responderam agora. Tente de novo em instantes ou preencha à mão.'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Preencher pelo CNPJ'; } }
  }

  Object.assign(S.actions, {
    pesAba: d => S.go(d.tab === 'agencia' ? '/clientes/agencias' : '/clientes'),
    pesNovo: () => formulario({ tipo:aba, pessoa:'pj', situacao:'prospect', comissao:20, consultor_id:S.pode('consultor') ? S.me.id : '' }),
    pesEditar: d => { const p = S.pessoa(d.id); if (S.pode('diretor', 'gerente') || (S.pode('consultor') && (p.tipo === 'agencia' || p.consultor_id === S.me.id))) formulario(p); else S.toast('Seu perfil só pode consultar este cadastro.'); },
    pesMenu: (d, botao) => S.menu(botao, [{ label:'Abrir', icon:'abrir', act:'pesEditar', data:{ id:d.id } }, { label:'Levar para outra rádio', icon:'copia', act:'pesLevar', data:{ id:d.id } }]),
    pesLevar: d => { const p = S.pessoa(d.id); if (p) levarDialogo(p); },
    pesTrazer: () => { const a = cad.achados[0]; if (!a) return;
      CADASTRAIS.forEach(([k]) => { const c = campo(k); if (c && a[k] != null && a[k] !== '') c.value = a[k]; });
      cad.trazido = grupoDe(a); S.mascarar(document.getElementById('dlg'));
      document.querySelector('#dlg #cadAchado').innerHTML = `<div class="cad-achado ok">${S.svg('check')}<span>Dados trazidos da ${esc(nomeRadio(a.veiculo_id))}. Confira e salve: os dois cadastros ficam ligados.</span></div>`; },
    pesIgnorar: () => { cad.ignorar = soNumeros((campo('documento') || {}).value); const b = document.querySelector('#dlg #cadAchado'); if (b) b.hidden = true; },
    pesCnpj: () => { const n = (campo('documento').value || '').replace(/\D/g, ''); if (n.length !== 14) return S.toast('Digite os 14 números do CNPJ.'); preencherCnpj(n); }
  });
})();

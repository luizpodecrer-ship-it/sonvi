// SONVI · tabelas de preço do veículo.
// Cada tabela é um documento com nome e situação: Rascunho → Agendada → Vigente → Encerrada (S.situacaoTabela, pi-regras.js).
// O diretor e o gerente preparam rascunhos; só o diretor publica, com a data de início (publicar_tabela, database/013).
// No editor nada vai para a nuvem até "Salvar": as mudanças ficam na tela, com "Descartar" para voltar.
// A grade tem programas, quadros e rotativo nas linhas (seções) e os formatos nas colunas; cada preço mostra o da tabela anterior.
// Os PIs pegam o preço da tabela vigente no dia em que são criados e guardam o próprio valor: mudar uma tabela não mexe em PIs antigos.
(() => {
  const { esc, brl, dfmt } = S;
  const lista = tipo => S.db.produtos.filter(p => p.tipo === tipo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  const prod = id => S.db.produtos.find(p => p.id === id) || {};
  const pode = () => S.pode('diretor', 'gerente');
  const diretor = () => S.pode('diretor');
  const chave = (p, f) => p + '|' + f;
  const pct = (novo, antes) => { if (!antes) return ''; const p = (novo / antes - 1) * 100; return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1).replace('.', ',').replace(',0', '') + '%'; };
  // Segundos do formato, lidos do nome ou do detalhe (Spot 30", 30 segundos, 30s)
  const segundos = f => { const m = /(\d+)\s*(?:"|''|”|s\b|seg)/i.exec(`${f.nome} ${f.detalhe}`); return m ? +m[1] : null; };

  // Seções da tabela, como no mídia kit, e os dois jeitos de cobrar um formato.
  // Digital (database/033): os perfis da rádio nas redes sociais são as linhas e os formatos digitais (post, reels, stories…)
  // são colunas próprias, cobradas por publicação. Mesma tabela, vigência e publicação da rádio.
  const SECOES = [['programa', 'Programas · horário determinado', 'Programa'], ['quadro', 'Quadros', 'Quadro'], ['rotativo', 'Rotativo · horário indeterminado', 'Rotativo'], ['digital', 'Digital · redes sociais', 'Perfil']];
  const SECOES_RADIO = SECOES.filter(s => s[0] !== 'digital');
  const ABA = { programa:'Programas', quadro:'Quadros', rotativo:'Rotativo', digital:'Digital' };
  const secaoDe = p => SECOES.some(s => s[0] === p.secao) ? p.secao : 'programa';
  const dig = p => p.secao === 'digital';
  const unico = f => f.cobranca === 'unico' && !dig(f);
  const colunas = () => { const fs = lista('formato').filter(f => !dig(f)); return [...fs.filter(f => !unico(f)), ...fs.filter(unico)]; };
  const colunasDig = () => lista('formato').filter(dig);
  const colunasDe = p => dig(p) ? colunasDig() : colunas();
  const horario = p => dig(p) ? (p.detalhe ? esc(p.detalhe) : 'Perfil não informado') : p.detalhe ? esc(p.detalhe).replace(/\n/g, '<br>') : 'Horário não informado';

  // ---------- tabelas ----------
  const tab = id => (S.db.tabelas || []).find(t => t.id === id);
  const sit = t => S.situacaoTabela(t);
  const ORDEM = { rascunho:0, agendada:1, vigente:2, encerrada:3 };
  const tabelas = () => (S.db.tabelas || []).slice().sort((a, b) => ORDEM[sit(a)] - ORDEM[sit(b)] || (sit(a) === 'agendada' ? a.inicio.localeCompare(b.inicio) : (b.inicio || b.criado_em || '').localeCompare(a.inicio || a.criado_em || '')));
  // Quem pode mexer agora: rascunho = diretor e gerente; agendada e vigente = só o diretor; encerrada = ninguém
  const podeEditar = t => { const s = sit(t); return s === 'rascunho' ? pode() : s === 'agendada' || s === 'vigente' ? diretor() : false; };
  const precosDe = id => { const o = {}; S.db.precos.filter(x => x.tabela_id === id).forEach(x => { o[chave(x.programa_id, x.formato_id)] = { preco:Number(x.preco), desconto_max:Number(x.desconto_max) }; }); return o; };
  // Fim de uma tabela publicada: o dia antes da próxima publicada
  const fimDe = t => { const prox = (S.db.tabelas || []).filter(x => x.situacao === 'publicada' && x.inicio > t.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    if (!prox) return null; const d = new Date(prox.inicio + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  const pisNoPeriodo = t => { const fim = fimDe(t); return S.db.pis.filter(p => { const d = (p.criado_em || '').slice(0, 10); return d >= t.inicio && (!fim || d <= fim); }).length; };
  // Tabela usada como "antes" na comparação: a de origem; sem origem, a vigente
  const baseDe = t => { if (t.base_id && tab(t.base_id)) return tab(t.base_id); const v = S.tabelaVigente(); return v && v.id !== t.id && sit(t) !== 'encerrada' && sit(t) !== 'vigente' ? v : null; };

  // Compara os preços com a tabela de antes: quantos mudaram, reajuste médio, maior e menor
  const comparar = (cel, base, mao) => {
    const ks = Object.keys(cel).filter(k => base[k] !== undefined && base[k] > 0), dif = ks.map(k => cel[k].preco / base[k] - 1);
    const mudaram = ks.filter(k => cel[k].preco !== base[k]).length;
    return { total:Object.keys(cel).length, comBase:ks.length, mudaram, iguais:ks.length - mudaram, mao:[...(mao || [])].filter(k => cel[k]).length,
      media:dif.length ? dif.reduce((a, b) => a + b, 0) / dif.length * 100 : null, maior:dif.length ? Math.max(...dif) * 100 : null, menor:dif.length ? Math.min(...dif) * 100 : null };
  };
  const fmtPct = n => n === null ? '—' : (n > 0.05 ? '+' : n < -0.05 ? '−' : '') + Math.abs(n).toFixed(1).replace('.', ',') + '%';

  // ---------- editor (as mudanças ficam aqui até Salvar) ----------
  let ed = null;            // { id, nome, inicio, cel:{chave:{preco, desconto_max}}, base:{chave:preco}, baseNome, mao:Set, sujo, corrigindo }
  let editando = null;      // célula com o campo de preço aberto { p, f }
  let secCel = 'programa';  // seção aberta no celular
  const massaUlt = { alvo:'tudo', op:'pct+', val:'', arr:'5' };   // último reajuste em massa, para não apagar ao redesenhar
  const abrir = t => { const b = baseDe(t), bp = b ? precosDe(b.id) : {};
    ed = { id:t.id, nome:t.nome, inicio:t.inicio || '', cel:precosDe(t.id), base:Object.fromEntries(Object.entries(bp).map(([k, v]) => [k, v.preco])), baseNome:b ? b.nome : '', mao:new Set(), sujo:false, corrigindo:false };
    editando = null; };
  const emEdicao = () => { const t = ed && tab(ed.id); return !!t && podeEditar(t) && (sit(t) !== 'vigente' || ed.corrigindo); };
  S.tpSujo = () => !!(ed && ed.sujo);
  const sujar = () => { if (!ed.sujo) { ed.sujo = true; document.querySelectorAll('.tp-sujo').forEach(e => { e.hidden = false; }); } };
  const descontoPadrao = cel => { const c = {}; Object.values(cel).forEach(x => { c[x.desconto_max] = (c[x.desconto_max] || 0) + 1; }); const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return k === undefined ? null : Number(k); };
  const descontoDo = (cel, p) => { const xs = lista('formato').map(f => cel[chave(p.id, f.id)]).filter(Boolean).map(x => x.desconto_max); return xs.length && xs.every(x => x === xs[0]) ? xs[0] : xs.length ? null : undefined; };

  // Visão usada pela grade: os preços do editor ou, na lista, os da vigente (só leitura)
  const visaoEditor = () => ({ cel:ed.cel, base:ed.base, mao:ed.mao, editar:emEdicao(), temBase:!!ed.baseNome });
  const visaoVigente = () => { const v = S.tabelaVigente(); return { cel:v ? precosDe(v.id) : {}, base:{}, mao:new Set(), editar:false, temBase:false }; };
  const temPreco = (v, p) => lista('formato').some(f => v.cel[chave(p.id, f.id)]);

  // Avisa quando um formato mais longo custa menos que um mais curto no mesmo programa
  const avisos = (v, p) => {
    if (dig(p)) return {};
    const fs = colunas().filter(f => !unico(f)).map(f => ({ f, s:segundos(f), x:v.cel[chave(p.id, f.id)] })).filter(o => o.s !== null && o.x);
    const out = {};
    fs.forEach(a => { const menor = fs.filter(b => b.s < a.s && b.x.preco > a.x.preco).sort((b, c) => c.s - b.s)[0]; if (menor) out[a.f.id] = `Mais barato que o ${menor.f.nome}`; });
    return out;
  };
  // Situação de um preço frente à tabela anterior: mudou, mudado à mão, igual ou novo
  const estado = (v, k) => { const x = v.cel[k], b = v.base[k]; if (!v.temBase || !x) return ''; if (b === undefined) return 'novo'; if (v.mao.has(k)) return 'mao'; return x.preco !== b ? 'mudou' : 'igual'; };
  const diferenca = (v, k) => { const x = v.cel[k], b = v.base[k], e = estado(v, k);
    return !e ? '' : e === 'novo' ? 'novo nesta tabela' : e === 'igual' ? 'igual à anterior' : `era ${S.nfmt(b) || '0,00'} · ${pct(x.preco, b)}`; };

  const celula = (v, p, f, av, primeiroUnico) => {
    const k = chave(p.id, f.id), x = v.cel[k], cls = `tp-cel${unico(f) ? ' uni' : ''}${primeiroUnico ? ' uni1' : ''}`;
    if (v.editar && editando && editando.p === p.id && editando.f === f.id) return `<span class="${cls}"><span class="tp-ed"><label for="tpEd">R$</label><input id="tpEd" data-mask="dec" inputmode="decimal" value="${x ? S.nfmt(x.preco) : ''}" placeholder="0,00" aria-label="Preço de ${esc(p.nome)} ${esc(f.nome)}"><button class="btn sm pri" data-act="tpCelOk" aria-label="Confirmar preço">${S.svg('check')}</button></span>${v.base[k] !== undefined ? `<small class="tp-dif">antes ${S.nfmt(v.base[k])}</small>` : ''}</span>`;
    if (!x) return `<span class="${cls}">${!v.editar ? '<span class="muted">—</span>' : temPreco(v, p) ? `<button class="tp-vazio leve" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}" aria-label="Definir preço de ${esc(p.nome)} ${esc(f.nome)}" title="Não é vendido. Clique para definir um preço.">—</button>` : `<button class="tp-vazio" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}">Definir preço</button>`}</span>`;
    const e = estado(v, k), dif = diferenca(v, k), aviso = av[f.id];
    return `<span class="${cls}"><button class="tp-preco ${e}${aviso ? ' aviso' : ''}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${v.editar ? '' : ' disabled'} title="Desconto máximo ${x.desconto_max}%">${brl(x.preco)}</button>${dif ? `<small class="tp-dif ${e}">${dif}</small>` : ''}${aviso ? `<small class="aviso">${esc(aviso)}</small>` : ''}</span>`;
  };

  const tres = (act, id, rotulo) => pode() ? `<button class="btn tres" data-act="${act}" data-id="${id}" aria-label="Opções de ${esc(rotulo)}">${S.svg('mais3')}</button>` : '';
  const botoesNovo = cls => SECOES_RADIO.map(([k, , n]) => `<button class="btn ${cls}" data-act="tpProduto" data-tipo="programa" data-secao="${k}">${S.svg('mais')}${n}</button>`).join('');
  const botoesDig = cls => `<button class="btn ${cls}" data-act="tpProduto" data-tipo="programa" data-secao="digital">${S.svg('mais')}Perfil</button><button class="btn ${cls}" data-act="tpProduto" data-tipo="formato" data-secao="digital">${S.svg('mais')}Formato digital</button>`;

  // Sem digital ainda e fora da edição: explica onde cadastrar (perfis e preços entram ao editar a tabela)
  const dicaDigital = () => { const t = ed && tab(ed.id), corrigir = t && sit(t) === 'vigente' && diretor() && !ed.corrigindo, rasc = t && sit(t) === 'rascunho';
    return `<section class="card tp-grade tp-dig"><div class="hd"><h2>Digital · redes sociais</h2><span>por publicação</span></div>
      <p class="muted" style="margin:0 0 ${corrigir ? 14 : 0}px">Venda publicações nos perfis da rádio (Instagram, Facebook, TikTok…). Para começar, ${rasc ? 'continue editando este rascunho' : corrigir ? 'clique em <b>Corrigir preços</b>' : 'abra a tabela e clique em <b>Corrigir preços</b> (ou crie uma nova tabela)'} e use <b>+ Perfil</b> e <b>+ Formato digital</b>, que aparecem neste cartão.</p>
      ${corrigir ? `<button class="btn pri" data-act="tpCorrigir">${S.svg('editar')}Corrigir preços</button>` : ''}</section>`; };

  // Digital no computador: perfis da rádio nas linhas e formatos digitais nas colunas
  const gradeDigital = (v, cadastro) => {
    const progs = lista('programa').filter(dig), forms = colunasDig(), menus = cadastro && pode();
    if (!progs.length && !forms.length && !menus) return pode() ? dicaDigital() : '';
    if (!progs.length && !forms.length) return menus ? `<section class="card tp-grade tp-dig"><div class="hd"><h2>Digital · redes sociais</h2><span>por publicação</span></div>
      <p class="muted" style="margin:0 0 14px">Venda publicações nos perfis da rádio (Instagram, Facebook, TikTok…). Cadastre os perfis e os formatos (post no feed, carrossel, reels, stories) e defina o preço de cada um. A produção do conteúdo já entra no preço.</p><div class="tp-novos">${botoesDig('tracej')}</div></section>` : '';
    if (!progs.length && !menus) return '';
    return `<section class="card tp-grade tp-dig"><div class="hd"><h2>Digital · redes sociais</h2><span>por publicação · a produção já está no preço</span></div><div class="scroll"><div class="tp-tab" style="--n:${Math.max(1, forms.length)}">
      <div class="tp-cab"><span class="muted small">Perfil da rádio</span>${forms.map(f => `<span class="tp-form${f.ativo ? '' : ' inativo'}"><span><b>${esc(f.nome)}</b><small>${esc(f.detalhe || 'por publicação')}${f.ativo ? '' : ' · fora das novas vendas'}</small></span>${menus ? tres('tpMenuForm', f.id, f.nome) : ''}</span>`).join('') || '<span class="muted small">Nenhum formato digital</span>'}
        <span class="tp-mais">${menus ? `<button class="btn sm tracej" data-act="tpProduto" data-tipo="formato" data-secao="digital">${S.svg('mais')}Formato</button>` : ''}</span></div>
      ${progs.map(p => `<div class="tp-row${p.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>${p.ativo ? '' : S.tag('Fora das novas vendas', 'gray')}</span>
        ${forms.map(f => celula(v, p, f, {}, false)).join('') || '<span></span>'}<span class="tp-mais">${menus ? tres('tpMenuProg', p.id, p.nome) : ''}</span></div>`).join('')}
      ${menus ? `<div class="tp-rodape tp-novos"><button class="btn sm tracej" data-act="tpProduto" data-tipo="programa" data-secao="digital">${S.svg('mais')}Perfil</button></div>` : ''}
    </div></div><p class="muted small" style="margin:10px 0 0">Cada perfil × formato tem um preço; "—" = não oferece.</p></section>`;
  };

  // Grade do computador
  const grade = (v, cadastro) => {
    const progs = lista('programa').filter(p => !dig(p)), forms = colunas(), desc = descontoPadrao(v.cel), menus = cadastro && pode();
    const secoes = SECOES_RADIO.map(([k, titulo]) => ({ k, titulo, itens:progs.filter(p => secaoDe(p) === k) })).filter(s => s.itens.length);
    const nDur = forms.filter(f => !unico(f)).length, nUni = forms.length - nDur, i1 = nDur;
    const grupos = nDur && nUni ? `<div class="tp-cab tp-grupos"><span></span><span class="tp-grupo" style="grid-column:span ${nDur}">Spot · preço por duração</span><span class="tp-grupo uni1" style="grid-column:span ${nUni}">Preço único</span><span></span></div>` : '';
    return `<div class="scroll"><div class="tp-tab" style="--n:${forms.length}">${grupos}
      <div class="tp-cab"><span class="muted small">Onde vai ao ar · dias e horário</span>${forms.map((f, i) => `<span class="tp-form${f.ativo ? '' : ' inativo'}${i === i1 ? ' uni1' : ''}"><span><b>${esc(f.nome)}</b><small>${esc(unico(f) ? (f.detalhe || 'valor único') : f.detalhe || '')}${f.ativo ? '' : ' · fora dos novos PIs'}</small></span>${menus ? tres('tpMenuForm', f.id, f.nome) : ''}</span>`).join('')}
        <span class="tp-mais">${menus ? `<button class="btn sm tracej" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button>` : ''}</span></div>
      ${secoes.map(s => `<div class="tp-secao">${esc(s.titulo)}</div>` + s.itens.map(p => { const av = avisos(v, p), dp = descontoDo(v.cel, p);
        return `<div class="tp-row${p.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>
          <span class="row mid" style="gap:6px">${dp !== undefined && dp !== desc ? S.tag(`Desconto máx. ${dp === null ? 'varia' : dp + '%'}`, 'blue') : ''}${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span></span>
          ${forms.map((f, i) => celula(v, p, f, av, i === i1)).join('')}<span class="tp-mais">${menus ? tres('tpMenuProg', p.id, p.nome) : ''}</span></div>`; }).join('')).join('')}
      ${menus ? `<div class="tp-rodape tp-novos">${botoesNovo('sm tracej')}</div>` : ''}
    </div></div>`;
  };

  // Celular: abas por seção; cada programa vira um cartão com os formatos em quadradinhos
  const cartoes = (v, cadastro) => {
    const progs = lista('programa'), menus = cadastro && pode();
    const secoes = SECOES.map(([k]) => ({ k, itens:progs.filter(p => secaoDe(p) === k) })).filter(s => s.itens.length || (s.k === 'digital' && menus && colunasDig().length));
    const ab = secoes.some(s => s.k === secCel) ? secCel : (secoes[0] || {}).k;
    const cartao = p => { const fs = colunasDe(p), av = avisos(v, p);
      const tile = f => { const k = chave(p.id, f.id), x = v.cel[k], e = estado(v, k), nome = segundos(f) && !unico(f) && !dig(f) ? `${segundos(f)}"` : f.nome;
        if (!x && !v.editar) return '';
        return `<button class="tp-mini ${e}${x ? '' : ' vazio'}${av[f.id] ? ' aviso' : ''}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${v.editar ? '' : ' disabled'} aria-label="${esc(f.nome)}: ${x ? brl(x.preco) : 'sem preço'}"><small>${esc(nome)}</small><b>${x ? S.nfmt(x.preco) : '—'}</b>${x && e && e !== 'igual' ? `<small class="tp-dif ${e}">${e === 'novo' ? 'novo' : pct(x.preco, v.base[k])}</small>` : ''}</button>`; };
      return `<div class="card tp-cartao${p.ativo ? '' : ' inativo'}"><div class="hd"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span>${menus ? tres('tpMenuProg', p.id, p.nome) : ''}</div>
        <div class="tp-minis">${fs.map(tile).join('')}</div></div>`; };
    const noDigital = ab === 'digital';
    return (secoes.length > 1 ? `<div class="seg tp-seg" role="tablist">${secoes.map(s => `<button role="tab" class="${s.k === ab ? 'on' : ''}" aria-selected="${s.k === ab}" data-act="tpSecao" data-secao="${s.k}">${ABA[s.k]}</button>`).join('')}</div>` : '')
      + (noDigital ? '<p class="muted small" style="margin:0 0 12px">Preço por publicação · a produção já está no preço.</p>' : '')
      + (secoes.find(s => s.k === ab) || { itens:[] }).itens.map(cartao).join('')
      + (menus ? `<div class="tp-novos">${noDigital ? botoesDig('tracej') : `${botoesNovo('tracej')}<button class="btn tracej" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button>${!secoes.some(s => s.k === 'digital') ? `<button class="btn tracej" data-act="tpProduto" data-tipo="programa" data-secao="digital">${S.svg('mais')}Perfil digital</button>` : ''}`}</div>` : '');
  };
  const corpoGrade = (v, cadastro) => {
    const semRadio = !lista('programa').some(p => !dig(p)) && !lista('formato').some(f => !dig(f));
    if (S.celular) return (semRadio && !lista('programa').length && !lista('formato').length ? vazioRadio(cadastro) : cartoes(v, cadastro)) + (!cadastro && pode() && !lista('programa').some(dig) ? dicaDigital() : '');
    return (semRadio ? vazioRadio(cadastro) : `<section class="card tp-grade">${grade(v, cadastro)}</section>`) + gradeDigital(v, cadastro);
  };
  const vazioRadio = cadastro => `<div class="card empty"><b>Monte a tabela de preços</b>Cadastre os formatos (ex.: Spot 30", cobrado por duração; Testemunhal, com preço único) e onde vão ao ar: programas, quadros e o rotativo. Os preços ficam no cruzamento.
      ${cadastro && pode() ? `<div class="row mid" style="justify-content:center;margin-top:18px"><button class="btn" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button><button class="btn pri" data-act="tpProduto" data-tipo="programa" data-secao="programa">${S.svg('mais')}Programa</button></div>` : ''}</div>`;

  // ---------- lista de tabelas ----------
  const periodo = t => { const s = sit(t), fim = s === 'encerrada' ? fimDe(t) : null;
    return s === 'rascunho' ? (t.inicio ? `Prevista para ${dfmt(t.inicio)}` : 'Sem data de início ainda') : s === 'agendada' ? `Começa em ${dfmt(t.inicio)}` : s === 'vigente' ? `Desde ${dfmt(t.inicio)}` : `${dfmt(t.inicio)} a ${fim ? dfmt(fim) : '—'}`; };
  const cartaoTabela = t => {
    const s = sit(t), [rot, tom] = S.SITUACAO_TABELA[s], cel = precosDe(t.id), b = baseDe(t), c = b ? comparar(cel, Object.fromEntries(Object.entries(precosDe(b.id)).map(([k, v]) => [k, v.preco]))) : null;
    const acao = s === 'rascunho' ? (pode() ? 'Continuar editando' : 'Abrir') : s === 'encerrada' ? 'Consultar' : 'Abrir';
    const info = s === 'rascunho' || s === 'agendada' ? ['Reajuste médio', c && c.media !== null ? fmtPct(c.media) : '—'] : ['PIs feitos no período', String(pisNoPeriodo(t))];
    const obs = s === 'rascunho' ? `Salvo em ${dfmt((t.atualizado_em || '').slice(0, 10))} às ${S.hora ? S.hora(t.atualizado_em) : ''} · ainda não vale` : s === 'agendada' ? 'Publicada. Até essa data vale a tabela atual.' : s === 'vigente' ? 'É a que os PIs novos usam hoje' : 'Só consulta';
    return `<article class="card tp-tabela ${s}"><div class="tp-tabela-cab"><div><h2>${esc(t.nome)}</h2><small class="muted">${periodo(t)}</small></div>${S.tag(rot, tom)}</div>
      <div class="tp-tabela-num"><div><small>Preços</small><b>${Object.keys(cel).length}</b></div><div><small>${info[0]}</small><b>${info[1]}</b></div></div>
      <small class="muted">${esc(obs)}</small>
      <div class="row mid"><button class="btn${s === 'rascunho' && pode() ? ' pri' : ''}" data-go="/cadastros/${t.id}">${acao}</button><button class="btn tres" data-act="tpMenuTabela" data-id="${t.id}" aria-label="Opções de ${esc(t.nome)}">${S.svg('mais3')}</button></div></article>`;
  };
  const vistaLista = () => {
    const ts = tabelas(), vig = S.tabelaVigente();
    const passos = `<div class="tp-ciclo"><span class="pill" style="--tone:var(--gray)">Rascunho</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--blue)">Agendada</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--green)">Vigente</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--gray)">Encerrada</span>
      <span class="muted small">Prepare a tabela nova em rascunho, com calma. ${diretor() ? 'Ao publicar, você escolhe' : 'O diretor publica e escolhe'} a data de início, e ela entra sozinha no dia. PIs já feitos nunca mudam.</span></div>`;
    const cartoesT = ts.length ? `<div class="tp-tabelas">${ts.map(cartaoTabela).join('')}</div>`
      : `<div class="card empty"><b>Nenhuma tabela de preços ainda</b>Crie a primeira tabela, cadastre os programas e formatos e defina os preços.${pode() ? `<div class="row mid" style="justify-content:center;margin-top:18px"><button class="btn pri" data-act="tpNova">${S.svg('mais')}Nova tabela</button></div>` : ''}</div>`;
    const previa = vig ? `<div class="hd tp-previa-cab"><h2>${esc(vig.nome)} · vigente</h2><a data-go="/cadastros/${vig.id}">Abrir</a></div>${corpoGrade(visaoVigente(), false)}<p class="muted small" style="margin-top:12px">Valores em R$ por inserção (no digital, por publicação); "—" = não é vendido nesse espaço.</p>` : '';
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Tabelas de preços`,
      actions:`${vig ? `<button class="btn" data-act="tpPdf" data-id="${vig.id}">${S.svg('baixar')}Baixar PDF da vigente</button>` : ''}${pode() ? `<button class="btn pri" data-act="tpNova">${S.svg('mais')}Nova tabela</button>` : ''}`,
      body:(ts.length ? passos : '') + cartoesT + previa };
  };

  // ---------- editor de uma tabela ----------
  const vistaTabela = t => {
    const s = sit(t), v = visaoEditor(), editar = v.editar, [rot, tom] = S.SITUACAO_TABELA[s], vig = S.tabelaVigente();
    const c = ed.baseNome ? comparar(ed.cel, ed.base, ed.mao) : null;
    const sujo = `<span class="sujo tp-sujo"${ed.sujo ? '' : ' hidden'}><i></i>Alterações não salvas</span>`;
    const botoesEdicao = `${sujo}<button class="btn" data-act="tpDescartar">Descartar</button><button class="btn${s === 'rascunho' && diretor() ? '' : ' pri'}" data-act="tpSalvarTabela">${s === 'rascunho' ? 'Salvar rascunho' : 'Salvar alterações'}</button>${s === 'rascunho' && diretor() ? `<button class="btn pri" data-act="tpPublicar">Publicar tabela…</button>` : ''}`;
    const acoes = editar ? botoesEdicao
      : `<button class="btn" data-act="tpPdf" data-id="${t.id}">${S.svg('baixar')}PDF</button>${s === 'vigente' && diretor() ? `<button class="btn pri" data-act="tpCorrigir">${S.svg('editar')}Corrigir preços</button>` : ''}${pode() && s !== 'rascunho' ? `<button class="btn${s === 'vigente' && diretor() ? '' : ' pri'}" data-act="tpNova" data-base="${t.id}">${S.svg('copia')}Usar como base de uma nova</button>` : ''}`;
    const texto = s === 'rascunho' ? `Rascunho: ainda não vale.${vig ? ` Os PIs continuam usando a ${esc(vig.nome)}.` : ''}${ed.baseNome ? ` Copiada da ${esc(ed.baseNome)}.` : ''}`
      : s === 'agendada' ? `Publicada: começa a valer em ${dfmt(t.inicio)}. Até lá os PIs usam a ${vig ? esc(vig.nome) : 'tabela atual'}.`
      : s === 'vigente' ? `Vigente desde ${dfmt(t.inicio)}: é a que os PIs novos usam.${ed.corrigindo ? ' A correção vale para os PIs feitos a partir de agora.' : ''}` : `Encerrada: valeu de ${dfmt(t.inicio)} a ${fimDe(t) ? dfmt(fimDe(t)) : '—'}. Só consulta.`;
    const campos = editar && s === 'rascunho' ? `<div class="tp-campos"><label class="f">Nome da tabela<input data-tp-nome="1" value="${esc(ed.nome)}" placeholder="Ex.: Tabela 2027"></label>
      <label class="f">Começa a valer em (previsto)<input type="date" data-tp-inicio="1" value="${esc(ed.inicio)}"></label></div>` : '';
    const faixa = `<div class="card tp-faixa">${S.tag(rot, tom)}<span>${texto}</span><span class="grow"></span>${s === 'agendada' && diretor() ? `<button class="btn sm" data-act="tpDespublicar" data-id="${t.id}">Voltar para rascunho</button>` : ''}${campos}
      ${s === 'rascunho' && !diretor() && editar ? '<small class="muted tp-quem">Quando estiver pronta, o diretor publica.</small>' : ''}</div>`;
    const forms = [...colunas(), ...colunasDig()];
    const massa = editar && Object.keys(ed.cel).length ? `<section class="card tp-massa" aria-label="Reajustar vários de uma vez">
      <div class="tp-massa-tit"><b>Reajustar vários de uma vez</b><small class="muted">${ed.baseNome ? `Calcula a partir dos preços da ${esc(ed.baseNome)}.` : 'Calcula a partir dos preços desta tabela.'} Você confere antes de salvar.</small></div>
      <label class="f">Aplicar em<select name="tp_alvo"><option value="tudo">Toda a tabela</option>${SECOES.filter(([k]) => lista('programa').some(p => secaoDe(p) === k)).map(([k, , n]) => `<option value="sec:${k}"${massaUlt.alvo === 'sec:' + k ? ' selected' : ''}>Só ${k === 'rotativo' ? 'o rotativo' : k === 'digital' ? 'o digital' : n.toLowerCase() + 's'}</option>`).join('')}${forms.map(f => `<option value="f:${f.id}"${massaUlt.alvo === 'f:' + f.id ? ' selected' : ''}>Só a coluna ${esc(f.nome)}${dig(f) ? ' (digital)' : ''}</option>`).join('')}</select></label>
      <label class="f">Reajuste<span class="duo"><select name="tp_op" aria-label="Tipo de reajuste">${[['pct+', 'Aumentar %'], ['pct-', 'Reduzir %'], ['brl+', 'Somar R$'], ['brl-', 'Tirar R$']].map(([k, n]) => `<option value="${k}"${massaUlt.op === k ? ' selected' : ''}>${n}</option>`).join('')}</select><input name="tp_val" data-mask="dec" inputmode="decimal" placeholder="Ex.: 8,5" value="${esc(massaUlt.val)}" aria-label="Valor do reajuste"></span></label>
      <label class="f">Arredondar<select name="tp_arr">${[['5', 'Para R$ 5,00'], ['1', 'Para R$ 1,00'], ['10', 'Para R$ 10,00'], ['0', 'Não arredondar']].map(([k, n]) => `<option value="${k}"${massaUlt.arr === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn pri" data-act="tpAplicar">Aplicar na grade</button>${ed.baseNome ? `<button class="btn" data-act="tpVoltarBase">Voltar aos preços da ${esc(ed.baseNome)}</button>` : ''}</section>` : '';
    const resumo = c && c.comBase ? `<div class="tiles tp-resumo">
      <div class="tile"><small>${s === 'rascunho' ? 'Começa a valer' : s === 'agendada' ? 'Começa a valer' : 'Valendo desde'}</small><b>${t.inicio || ed.inicio ? dfmt(s === 'rascunho' ? ed.inicio : t.inicio) : '—'}</b><small>${s === 'rascunho' ? (diretor() ? 'você confirma ao publicar' : 'o diretor confirma ao publicar') : periodo(t)}</small></div>
      <div class="tile"><small>Preços reajustados</small><b>${c.mudaram} de ${c.comBase}</b><small>${[c.iguais && `${c.iguais} igua${c.iguais > 1 ? 'is' : 'l'}`, c.mao && `${c.mao} à mão`, c.total > c.comBase && `${c.total - c.comBase} nov${c.total - c.comBase > 1 ? 'os' : 'o'}`].filter(Boolean).join(' · ') || 'todos'}</small></div>
      <div class="tile"><small>Reajuste médio</small><b>${fmtPct(c.media)}</b><small>menor ${fmtPct(c.menor)} · maior ${fmtPct(c.maior)}</small></div>
      <div class="tile"><small>Comparando com</small><b class="tp-comp">${esc(ed.baseNome)}</b><small>embaixo de cada preço: o valor de antes</small></div></div>` : '';
    const legenda = c ? `<div class="tp-legenda"><span><i class="tp-q mudou"></i>Reajustado</span><span><i class="tp-q mao"></i>Mudado à mão</span><span><i class="tp-q igual"></i>Igual à anterior</span><span><i class="tp-q novo"></i>Novo</span></div>` : '';
    const barraCel = editar ? `<div class="tp-barra">${sujo}<div class="row">${s === 'rascunho' && diretor() ? `<button class="btn" data-act="tpSalvarTabela">Salvar</button><button class="btn pri" data-act="tpPublicar">Publicar…</button>` : `<button class="btn" data-act="tpDescartar">Descartar</button><button class="btn pri" data-act="tpSalvarTabela">Salvar</button>`}</div></div>` : '';
    return { title:`<span class="sub">${pode() ? '<a data-go="/cadastros">← Tabelas de preços</a> · ' : 'Tabela de preços vigente · '}${esc(S.veh().nome)}</span>${esc(ed.nome || t.nome)}`,
      actions:editar ? `<span class="tp-topo">${acoes}</span>` : acoes, body:faixa + massa + resumo + legenda + corpoGrade(v, editar) + (editar && !S.celular ? `<p class="muted small" style="margin-top:12px">Clique num valor para digitar outro (Enter confirma, Esc desiste). Nada vale até ${s === 'rascunho' ? 'publicar' : 'salvar'}.</p>` : '') + barraCel };
  };

  S.views.cadastros = id => {
    // Consultor e outros perfis só consultam a tabela vigente (o banco nem entrega rascunhos para eles)
    if (!pode()) { const vig = S.tabelaVigente && S.tabelaVigente();
      if (!vig) return { title:`<span class="sub">${esc(S.veh().nome)}</span>Tabela de preços`, actions:'', body:`<div class="card empty"><b>Nenhuma tabela vigente</b>Quando a tabela de preços for publicada, ela aparece aqui para consulta.</div>` };
      if (!ed || ed.id !== vig.id) abrir(vig);
      return vistaTabela(vig); }
    const t = id && tab(id);
    if (!t) { if (ed && !ed.sujo) ed = null; return vistaLista(); }
    if (!ed || ed.id !== t.id) abrir(t);
    return vistaTabela(t);
  };

  // ---------- ações do editor ----------
  const confirmarCelula = () => {
    const el = document.getElementById('tpEd'); if (!el || !editando || !ed) return;
    const { p, f } = editando, k = chave(p, f), atual = ed.cel[k]; editando = null;
    if (!el.value.trim()) { if (atual) { delete ed.cel[k]; ed.mao.delete(k); sujar(); } return S.render(); }
    const v = S.num(el.value);
    if (!atual || atual.preco !== v) {
      const desc = atual ? atual.desconto_max : (descontoDo(ed.cel, prod(p)) ?? descontoPadrao(ed.cel) ?? 0);
      ed.cel[k] = { preco:v, desconto_max:Number(desc) || 0 }; if (ed.base[k] !== undefined) ed.mao.add(k); sujar(); }
    S.render();
  };
  // Grava tudo de uma vez: preços novos e alterados pela função do banco; os que saíram da tabela são apagados
  const gravar = async () => {
    const lista_ = Object.entries(ed.cel).map(([k, x]) => { const [p, f] = k.split('|'); return { programa_id:p, formato_id:f, preco:x.preco, desconto_max:x.desconto_max }; });
    const saiu = S.db.precos.filter(x => x.tabela_id === ed.id && !ed.cel[chave(x.programa_id, x.formato_id)]).map(x => x.id);
    await S.q(S.sb.rpc('salvar_tabela', { p_tabela:ed.id, p_nome:ed.nome, p_inicio:ed.inicio || null, p_precos:lista_ }));
    if (saiu.length) await S.q(S.sb.from('precos').delete().in('id', saiu));
    await S.recarregarTabelas();
    const mao = ed.mao; abrir(tab(ed.id)); ed.mao = mao;
  };
  const primeiroDoMes = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const nomeSugerido = () => { const ano = new Date().getFullYear() + 1, n = `Tabela ${ano}`; return (S.db.tabelas || []).some(t => t.nome === n) ? 'Tabela nova' : n; };
  const atualizaPublicar = () => { const f = document.querySelector('#dlg form'); if (!f || !f.elements.tp_inicio) return; const d = f.elements.tp_inicio.value;
    const ant = d ? (() => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - 1); return dfmt(x.toISOString().slice(0, 10)); })() : '…';
    f.querySelectorAll('[data-pub-ate]').forEach(e => { e.textContent = ant; }); f.querySelectorAll('[data-pub-dia]').forEach(e => { e.textContent = d ? dfmt(d) : '…'; });
    const ok = f.querySelector('button[value="ok"]'); if (ok) ok.textContent = d ? `Publicar para ${dfmt(d)}` : 'Publicar'; };
  document.addEventListener('input', e => { if (e.target.name === 'tp_inicio') atualizaPublicar(); });

  // ---------- PDF ----------
  const imprimir = t => {
    const v = S.veh(), forms = colunas().filter(f => f.ativo), progs = lista('programa').filter(p => p.ativo && !dig(p)), n = forms.length + 2, cel = ed && ed.id === t.id ? ed.cel : precosDe(t.id), desc = descontoPadrao(cel), s = sit(t);
    const linha = (p, fs = forms) => `<tr><td><b>${esc(p.nome)}</b></td><td>${horario(p)}</td>${fs.map(f => { const x = cel[chave(p.id, f.id)]; return `<td style="text-align:right">${x ? brl(x.preco) : '—'}</td>`; }).join('')}</tr>`;
    const fd = colunasDig().filter(f => f.ativo), pd = lista('programa').filter(p => p.ativo && dig(p));
    const digital = pd.length && fd.length ? `<h2 style="margin:18px 0 6px;font-size:15px">Digital · redes sociais</h2><table><thead><tr><th>Rede</th><th>Perfil</th>${fd.map(f => `<th style="text-align:right">${esc(f.nome)}</th>`).join('')}</tr></thead>
      <tbody>${pd.map(p => linha(p, fd)).join('')}</tbody></table><p>Valores por publicação; a produção do conteúdo já está no preço; as datas de publicação são combinadas com a rádio.</p>` : '';
    const quando = s === 'vigente' ? `Vigente desde ${dfmt(t.inicio)}` : s === 'agendada' ? `Válida a partir de ${dfmt(t.inicio)}` : s === 'encerrada' ? `Válida de ${dfmt(t.inicio)} a ${fimDe(t) ? dfmt(fimDe(t)) : '—'}` : 'Rascunho · ainda não vale';
    document.getElementById('print').innerHTML = `<div class="cab">${v.logo ? `<img src="${v.logo}" alt="">` : ''}<div><h1 style="border-left:6px solid ${v.cor || S.COR_PADRAO};padding-left:8px">${esc(v.nome)} · ${esc(t.nome)}</h1><div>${quando}${desc !== null ? ` · desconto máximo ${desc}%` : ''}</div></div></div>
      <table><thead><tr><th>Onde vai ao ar</th><th>Dias e horário</th>${forms.map(f => `<th style="text-align:right">${esc(f.nome)}</th>`).join('')}</tr></thead>
      <tbody>${SECOES_RADIO.map(([k, ti]) => { const l = progs.filter(p => secaoDe(p) === k); return l.length ? `<tr><th colspan="${n}" style="text-align:left">${esc(ti)}</th></tr>${l.map(p => linha(p)).join('')}` : ''; }).join('')}</tbody></table>
      <p>Valores por inserção; "—" = não é vendido.</p>${digital}<p>${esc([v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, v.telefone, v.email].filter(Boolean).join(' · '))}</p>`;
    setTimeout(() => window.print(), 60);
  };

  // ---------- programas e formatos (cadastro da rádio, vale para todas as tabelas) ----------
  const mover = async (id, dir) => {
    const it = prod(id), l = lista(it.tipo).filter(x => dig(x) === dig(it)), i = l.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    await Promise.all(l.map((x, k) => x.ordem === k ? null : S.salvar('produtos', { id:x.id, ordem:k })));
  };
  const formProduto = (tipo, p, secao) => {
    const prog = tipo === 'programa', comDesconto = prog && p.id && ed && emEdicao(), dp = comDesconto ? descontoDo(ed.cel, p) : undefined;
    const sec = p.id ? (dig(p) ? 'digital' : p.secao || 'programa') : secao || 'programa', digital = sec === 'digital';
    const novoTitulo = digital ? (prog ? 'Novo perfil nas redes' : 'Novo formato digital') : prog ? `Novo ${SECOES.find(x => x[0] === sec)[2].toLowerCase()}` : 'Novo formato';
    const campoDesc = comDesconto ? [{ k:'desconto', label:`Desconto máximo nesta tabela (%)${dp === null ? ' · hoje varia por formato' : ''}`, mask:'pct', ph:'Ex.: 30' }] : [];
    // Digital: perfil (rede + @) ou formato (post, reels, stories…), cobrado por publicação
    if (digital) return S.form(p.id ? esc(p.nome) : novoTitulo, prog ? [
      { k:'nome', label:'Rede social', req:true, ph:'Ex.: Instagram' },
      { k:'detalhe', label:'Perfil', ph:'Ex.: @suaradio' },
      ...campoDesc,
      { k:'ativo', label:'Aparece nas novas propostas e PIs', type:'checkbox' }] : [
      { k:'nome', label:'Formato', req:true, ph:'Ex.: Reels, Stories (3 telas), Post no feed' },
      { k:'detalhe', label:'Observação', ph:'Ex.: até 60 segundos · 3 telas' },
      { k:'ativo', label:'Aparece nas novas propostas e PIs', type:'checkbox' }],
      Object.assign({ ativo:true }, p, { desconto:dp === undefined || dp === null ? '' : String(dp) }),
      v => {
        if (comDesconto && v.desconto !== '' && v.desconto !== undefined) { const novo = S.num(v.desconto);
          colunasDig().forEach(f => { const x = ed.cel[chave(p.id, f.id)]; if (x && x.desconto_max !== novo) { x.desconto_max = novo; ed.sujo = true; } }); }
        S.run(async () => {
          const row = Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on', secao:'digital' }, prog ? {} : { cobranca:'unico' }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo, ordem:lista(tipo).filter(dig).length });
          await S.salvar('produtos', row); secCel = 'digital';
        }, prog ? 'Perfil salvo' : 'Formato salvo');
      }, 'Salvar', { editar:true });
    S.form(p.id ? esc(p.nome) : novoTitulo, prog ? [
      { k:'nome', label:sec === 'rotativo' ? 'Nome' : sec === 'quadro' ? 'Quadro' : 'Programa', req:true, ph:sec === 'rotativo' ? 'Ex.: Spot indeterminado' : sec === 'quadro' ? 'Ex.: Comunicação Política' : 'Ex.: Jornal da Manhã' },
      { k:'secao', label:'Seção da tabela', type:'select', options:SECOES_RADIO.map(([k, , n]) => [k, n]) },
      { k:'detalhe', label:'Dias e horário (uma linha para cada faixa)', type:'textarea', ph:'Ex.: Seg a sex · 6h às 20h\nSáb e dom · 6h às 11h' },
      ...(comDesconto ? [{ k:'desconto', label:`Desconto máximo nesta tabela (%)${dp === null ? ' · hoje varia por formato' : ''}`, mask:'pct', ph:'Ex.: 30' }] : []),
      { k:'ativo', label:'Aparece nos novos PIs', type:'checkbox' }] : [
      { k:'nome', label:'Formato', req:true, ph:'Ex.: Spot 30" ou Testemunhal' },
      { k:'cobranca', label:'Como é cobrado', type:'select', options:[['duracao', 'Por duração do spot (15", 30"...)'], ['unico', 'Preço único (testemunhal, patrocínio, menção)']] },
      { k:'detalhe', label:'Duração ou observação', ph:'Ex.: 30 segundos' },
      { k:'ativo', label:'Aparece nos novos PIs', type:'checkbox' }],
      Object.assign({ ativo:true, secao:sec, cobranca:/testemunhal|patroc|men[cç]/i.test(p.nome || '') ? 'unico' : 'duracao' }, p, { desconto:dp === undefined || dp === null ? '' : String(dp) }),
      v => {
        // O desconto mexe só na tabela aberta e fica pendente até Salvar
        if (comDesconto && v.desconto !== '' && v.desconto !== undefined) { const novo = S.num(v.desconto);
          lista('formato').forEach(f => { const x = ed.cel[chave(p.id, f.id)]; if (x && x.desconto_max !== novo) { x.desconto_max = novo; ed.sujo = true; } }); }
        S.run(async () => {
          const row = Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on' }, prog ? { secao:v.secao } : { cobranca:v.cobranca }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo, ordem:lista(tipo).length });
          await S.salvar('produtos', row);
          if (prog) secCel = v.secao;
        }, prog ? 'Salvo' : 'Formato salvo');
      }, 'Salvar', { editar:true });
  };

  Object.assign(S.actions, {
    // Lista
    tpNova: d => {
      const ts = tabelas(), vig = S.tabelaVigente(), base = d.base || (vig ? vig.id : '');
      S.dialog(`<h2>Nova tabela de preços</h2><p class="muted small">A tabela nasce como rascunho: dá para mudar à vontade e salvar quantas vezes quiser. Ela só passa a valer quando o diretor publicar, com a data de início.</p>
        <div class="g2"><label class="f">Nome<input name="tp_nome" required value="${esc(nomeSugerido())}" placeholder="Ex.: Tabela 2027"></label>
          <label class="f">Começa a valer em (previsto)<input type="date" name="tp_prev" value="${primeiroDoMes()}"></label>
          <label class="f" style="grid-column:1/-1">Começar com<select name="tp_base">${ts.map(t => `<option value="${t.id}"${t.id === base ? ' selected' : ''}>Os preços da ${esc(t.nome)} (${S.SITUACAO_TABELA[sit(t)][0].toLowerCase()})</option>`).join('')}<option value=""${base ? '' : ' selected'}>Tabela em branco</option></select></label></div>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Criar rascunho</button></div>`,
        v => S.run(async () => {
          const id = await S.q(S.sb.rpc('nova_tabela', { p_veiculo:S.ui.vehicleId, p_nome:v.tp_nome, p_base:v.tp_base || null, p_inicio:v.tp_prev || null }));
          await S.recarregarTabelas(); ed = null; location.hash = '/cadastros/' + id;
        }, 'Rascunho criado'));
    },
    tpMenuTabela: (d, botao) => { const t = tab(d.id), s = sit(t);
      S.menu(botao, [{ label:s === 'rascunho' && pode() ? 'Continuar editando' : 'Abrir', icon:'abrir', act:'tpAbrir', data:{ id:t.id } },
        ...(pode() ? [{ label:'Usar como base de uma nova', icon:'copia', act:'tpNova', data:{ base:t.id } }] : []),
        { label:'Baixar PDF', icon:'baixar', act:'tpPdf', data:{ id:t.id } },
        ...(s === 'agendada' && diretor() ? ['-', { label:'Voltar para rascunho', icon:'voltar', act:'tpDespublicar', data:{ id:t.id } }] : []),
        ...(s === 'rascunho' && pode() ? ['-', { label:'Excluir rascunho', icon:'lixo', act:'tpExcluirTabela', data:{ id:t.id }, perigo:true }] : [])]); },
    tpAbrir: d => { location.hash = '/cadastros/' + d.id; },
    tpExcluirTabela: async d => { const t = tab(d.id); if (!await S.confirmar(`Excluir o rascunho "${t.nome}"? Não dá para desfazer.`, { ok:'Excluir rascunho', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.from('tabelas_preco').delete().eq('id', t.id)); if (ed && ed.id === t.id) ed = null; await S.recarregarTabelas(); if (S.route().id === t.id) location.hash = '/cadastros'; }, 'Rascunho excluído'); },
    tpDespublicar: async d => { const t = tab(d.id);
      if (!await S.confirmar(`Voltar a "${t.nome}" para rascunho? Ela deixa de estar agendada para ${dfmt(t.inicio)} e pode ser mudada de novo antes de publicar.`, { ok:'Voltar para rascunho' })) return;
      S.run(async () => { await S.q(S.sb.rpc('despublicar_tabela', { p_tabela:t.id })); await S.recarregarTabelas(); if (ed && ed.id === t.id) abrir(tab(t.id)); }, 'Voltou para rascunho'); },
    tpPdf: d => imprimir(tab(d.id) || tab(ed && ed.id)),
    // Editor
    tpCorrigir: () => { ed.corrigindo = true; S.render(); },
    tpEditar: d => { if (!emEdicao()) return;
      if (S.celular) { const k = chave(d.p, d.f), x = ed.cel[k];
        return S.form(`${esc(prod(d.p).nome)} · ${esc(prod(d.f).nome)}`, [{ k:'preco', label:`Preço por ${dig(prod(d.f)) ? 'publicação' : 'inserção'} (R$)${ed.base[k] !== undefined ? ` · antes ${S.nfmt(ed.base[k])}` : ''}`, mask:'dec', ph:'Vazio = não é vendido' }], { preco:x ? S.nfmt(x.preco) : '' },
          v => { if (!String(v.preco || '').trim()) { if (x) { delete ed.cel[k]; ed.mao.delete(k); ed.sujo = true; } return S.render(); }
            const n = S.num(v.preco); if (!x || x.preco !== n) { ed.cel[k] = { preco:n, desconto_max:x ? x.desconto_max : (descontoDo(ed.cel, prod(d.p)) ?? descontoPadrao(ed.cel) ?? 0) }; if (ed.base[k] !== undefined) ed.mao.add(k); ed.sujo = true; }
            S.render(); }, 'Confirmar', { editar:true }); }
      editando = { p:d.p, f:d.f }; S.render();
      const el = document.getElementById('tpEd'); if (el) { S.mascarar(el.parentElement); el.focus(); el.select(); } },
    tpCelOk: () => confirmarCelula(),
    tpAplicar: () => {
      const q = n => document.querySelector(`.tp-massa [name="${n}"]`), alvo = q('tp_alvo').value, op = q('tp_op').value, val = S.num(q('tp_val').value), arr = Number(q('tp_arr').value);
      if (!val) { q('tp_val').focus(); return S.toast('Digite quanto reajustar.'); }
      Object.assign(massaUlt, { alvo, op, val:q('tp_val').value, arr:q('tp_arr').value });
      let n = 0;
      lista('programa').forEach(p => colunasDe(p).forEach(f => {
        if (alvo.startsWith('sec:') && secaoDe(p) !== alvo.slice(4)) return;
        if (alvo.startsWith('f:') && f.id !== alvo.slice(2)) return;
        const k = chave(p.id, f.id), x = ed.cel[k]; if (!x) return;
        const de = ed.base[k] !== undefined ? ed.base[k] : x.preco, novo = S.reajustar(de, op, val, arr);
        if (novo !== x.preco) { x.preco = novo; n++; } ed.mao.delete(k); }));
      if (n) ed.sujo = true; S.render(); S.toast(n ? `${n} preço${n > 1 ? 's' : ''} reajustado${n > 1 ? 's' : ''}. Confira e salve.` : 'Nenhum preço mudou.'); },
    tpVoltarBase: () => { let n = 0; Object.entries(ed.base).forEach(([k, b]) => { const x = ed.cel[k]; if (x && x.preco !== b) { x.preco = b; n++; } }); ed.mao.clear(); if (n) ed.sujo = true; S.render(); },
    tpDescartar: async () => { if (ed.sujo && !await S.confirmar('Descartar as alterações que ainda não foram salvas?', { ok:'Descartar', perigo:true })) return; abrir(tab(ed.id)); S.render(); },
    tpSalvarTabela: () => S.run(async () => { await gravar(); }, 'Tabela salva'),
    tpPublicar: () => {
      const vig = S.tabelaVigente(), c = ed.baseNome ? comparar(ed.cel, ed.base, ed.mao) : null, d0 = ed.inicio && ed.inicio >= S.today() ? ed.inicio : primeiroDoMes();
      S.dialog(`<h2>Publicar ${esc(ed.nome)}</h2>
        <label class="f">Começa a valer em<input type="date" name="tp_inicio" required min="${S.today()}" value="${d0}"></label>
        <div class="tp-pub">${vig ? `<div><i class="tp-pt" style="--tone:var(--green)"></i><span><b>Até <span data-pub-ate></span></b> continua valendo a ${esc(vig.nome)}, como hoje.</span></div>` : ''}
          <div><i class="tp-pt" style="--tone:var(--accent)"></i><span><b>A partir de <span data-pub-dia></span></b> os PIs novos já abrem com os preços da ${esc(ed.nome)}${c && c.media !== null ? ` (reajuste médio de ${fmtPct(c.media)})` : ''}.</span></div>
          <div><i class="tp-pt" style="--tone:var(--gray)"></i><span><b>PIs já feitos não mudam.</b> Cada PI guarda o preço do dia em que foi criado.</span></div></div>
        <p class="muted small">Até a data de início você ainda pode abrir a tabela e corrigir um preço, ou voltar com ela para rascunho.${ed.sujo ? ' As alterações que ainda não foram salvas são salvas junto.' : ''}</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn pri" value="ok">Publicar</button></div>`,
        v => S.run(async () => { if (ed.sujo) await gravar();
          await S.q(S.sb.rpc('publicar_tabela', { p_tabela:ed.id, p_inicio:v.tp_inicio })); await S.recarregarTabelas(); abrir(tab(ed.id));
        }, 'Tabela publicada'));
      atualizaPublicar(); },
    // Programas e formatos
    tpProduto: d => formProduto(d.tipo, {}, d.secao),
    tpSecao: d => { secCel = d.secao; S.render(); },
    tpMenuProg: (d, botao) => { const p = prod(d.id);
      S.menu(botao, [{ label:(dig(p) ? 'Editar rede e perfil' : 'Editar nome, seção, horário') + (ed && emEdicao() ? ' e desconto' : ''), icon:'editar', act:'tpEditarProd', data:{ id:p.id } }, { label:'Subir', icon:'seta', act:'tpMover', data:{ id:p.id, dir:-1 } }, { label:'Descer', icon:'baixo', act:'tpMover', data:{ id:p.id, dir:1 } },
        { label:p.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:p.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:p.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:p.id }, perigo:true }]); },
    tpMenuForm: (d, botao) => { const f = prod(d.id);
      S.menu(botao, [{ label:'Editar nome e cobrança', icon:'editar', act:'tpEditarProd', data:{ id:f.id } }, { label:'Mover para a esquerda', icon:'voltar', act:'tpMover', data:{ id:f.id, dir:-1 } }, { label:'Mover para a direita', icon:'seta', act:'tpMover', data:{ id:f.id, dir:1 } },
        { label:f.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:f.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:f.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:f.id }, perigo:true }]); },
    tpEditarProd: d => { const p = prod(d.id); formProduto(p.tipo, p); },
    tpMover: d => S.run(() => mover(d.id, +d.dir)),
    tpAtivo: d => { const p = prod(d.id); S.run(() => S.salvar('produtos', { id:p.id, ativo:!p.ativo }), p.ativo ? 'Não aparece mais nos novos PIs' : 'Voltou para os novos PIs'); },
    tpExcluir: async d => { const p = prod(d.id), n = S.db.precos.filter(x => x.programa_id === p.id || x.formato_id === p.id).length;
      if (!await S.confirmar(`Excluir "${p.nome}"${n ? ` e os ${n} preço(s) dele em todas as tabelas` : ''}? Os PIs já feitos não mudam.\n\nSe só quer que ele pare de aparecer nos PIs novos, use "Tirar dos novos PIs".`, { ok:'Excluir', perigo:true })) return;
      S.run(async () => { await S.excluir('produtos', p.id); S.db.precos = S.db.precos.filter(x => x.programa_id !== p.id && x.formato_id !== p.id);
        if (ed) Object.keys(ed.cel).forEach(k => { if (k.split('|').includes(p.id)) delete ed.cel[k]; }); }, 'Excluído'); },
  });

  // Campo de preço: Enter confirma, Esc desiste, sair do campo confirma
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'tpEd') return;
    if (e.key === 'Enter') { e.preventDefault(); confirmarCelula(); }
    if (e.key === 'Escape') { editando = null; S.render(); }
  });
  document.addEventListener('focusout', e => { if (e.target.id === 'tpEd' && !(e.relatedTarget && e.relatedTarget.dataset && e.relatedTarget.dataset.act === 'tpCelOk')) setTimeout(() => { if (document.getElementById('tpEd')) confirmarCelula(); }, 0); });
  // Nome e data prevista do rascunho: ficam pendentes até Salvar (sem redesenhar a tela)
  document.addEventListener('input', e => { if (!ed) return; if (e.target.dataset && e.target.dataset.tpNome) { ed.nome = e.target.value; sujar(); } if (e.target.dataset && e.target.dataset.tpInicio) { ed.inicio = e.target.value; sujar(); } });

  // Sair da tabela com alterações não salvas pergunta antes
  let voltando = false, hashAnterior = location.hash;
  window.addEventListener('hashchange', () => {
    if (voltando) { voltando = false; hashAnterior = location.hash; return; }
    const sai = ed && ed.sujo && location.hash !== '#/cadastros/' + ed.id;
    if (sai) { // volta para a tabela e pergunta; se a pessoa confirmar, segue para onde ia
      const destino = location.hash; voltando = true; location.hash = hashAnterior;
      S.confirmar('Sair sem salvar a tabela de preços?\n\nAs alterações que ainda não foram salvas serão perdidas.', { ok:'Sair sem salvar', voltar:'Continuar editando', perigo:true })
        .then(ok => { if (ok) { ed = null; location.hash = destino; } });
      return;
    }
    hashAnterior = location.hash;
  });
  window.addEventListener('beforeunload', e => { if (ed && ed.sujo) { e.preventDefault(); e.returnValue = ''; } });
})();

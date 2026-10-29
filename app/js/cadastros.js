// SONVI · Tabela de preços (database/013, 034 e 035). Duas áreas que não se misturam:
//   cada tabela é de Rádio (programas × formatos) ou Digital (entregas × canais, com pacotes de preço fechado), com vigência própria.
//   Rádio (/cadastros): as tabelas da rádio. Cada tabela é um documento com nome e situação: Em preparação → Agendada → Vigente →
//     Encerrada (S.situacaoTabela, pi-regras.js) e tem os PRÓPRIOS programas e formatos (tabelas_preco.programas/.formatos).
//     Nova tabela = cópia de outra (programas, formatos e preços) ou do zero (vazia). O diretor e o gerente preparam;
//     só o diretor publica, com a data de início (publicar_tabela). No editor nada vai para a nuvem até "Salvar".
//   Digital (/cadastros/digital): os canais da rádio nas redes (produtos tipo programa, secao digital) e as entregas sugeridas
//     (tipo formato, secao digital). Não há preço: o que é entregue e o valor entram na ação digital da proposta e do PI.
//   Programas e formatos (/cadastros/catalogo): o cadastro da rádio, de onde as tabelas tiram as linhas e colunas.
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

  // Seções da tabela, como no mídia kit, e os dois jeitos de cobrar um formato
  const SECOES = [['programa', 'Programas · horário determinado', 'Programa'], ['quadro', 'Quadros', 'Quadro'], ['rotativo', 'Rotativo · horário indeterminado', 'Rotativo']];
  const ABA = { programa:'Programas', quadro:'Quadros', rotativo:'Rotativo' };
  const secaoDe = p => SECOES.some(s => s[0] === p.secao) ? p.secao : 'programa';
  const dig = p => p.secao === 'digital';
  const radio = tipo => lista(tipo).filter(p => !dig(p));
  const digitais = tipo => lista(tipo).filter(dig);
  // Catálogo de onde a tabela tira linhas e colunas: rádio = programas/formatos; digital = canais (programa) e entregas (formato)
  const catalogo = (tt, tipo) => tt === 'digital' ? digitais(tipo) : radio(tipo);
  const tipoDe = t => S.tipoTabela(t);
  const NOME = { radio:'rádio', digital:'digital' };
  const unico = f => f.cobranca === 'unico';
  const horario = p => p.detalhe ? esc(p.detalhe).replace(/\n/g, '<br>') : 'Horário não informado';

  // ---------- tabelas ----------
  const tab = id => (S.db.tabelas || []).find(t => t.id === id);
  const sit = t => S.situacaoTabela(t);
  const ORDEM = { rascunho:0, agendada:1, vigente:2, encerrada:3 };
  const tabelas = (tt = 'radio') => (S.db.tabelas || []).filter(t => tipoDe(t) === tt).sort((a, b) => ORDEM[sit(a)] - ORDEM[sit(b)] || (sit(a) === 'agendada' ? a.inicio.localeCompare(b.inicio) : (b.inicio || b.criado_em || '').localeCompare(a.inicio || a.criado_em || '')));
  // Quem pode mexer agora: em preparação = diretor e gerente; agendada e vigente = só o diretor; encerrada = ninguém
  const podeEditar = t => { const s = sit(t); return s === 'rascunho' ? pode() : s === 'agendada' || s === 'vigente' ? diretor() : false; };
  const precosDe = id => { const o = {}; S.db.precos.filter(x => x.tabela_id === id).forEach(x => { o[chave(x.programa_id, x.formato_id)] = { preco:Number(x.preco), desconto_max:Number(x.desconto_max) }; }); return o; };
  // Programas e formatos de uma tabela (tabelas_preco.programas/.formatos); tabela antiga sem a lista usa os que têm preço
  const membros = t => { const ps = S.db.precos.filter(x => x.tabela_id === t.id);
    return { progs:(t.programas && t.programas.length) || (t.formatos && t.formatos.length) ? [...(t.programas || [])] : [...new Set(ps.map(x => x.programa_id))],
      forms:(t.programas && t.programas.length) || (t.formatos && t.formatos.length) ? [...(t.formatos || [])] : [...new Set(ps.map(x => x.formato_id))] }; };
  // Fim de uma tabela publicada: o dia antes da próxima publicada
  const fimDe = t => { const prox = (S.db.tabelas || []).filter(x => x.situacao === 'publicada' && x.inicio > t.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    if (!prox) return null; const d = new Date(prox.inicio + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  const pisNoPeriodo = t => { const fim = fimDe(t); return S.db.pis.filter(p => { const d = (p.criado_em || '').slice(0, 10); return d >= t.inicio && (!fim || d <= fim); }).length; };
  // Tabela usada como "antes" na comparação: a de origem (a tabela do zero não compara)
  const baseDe = t => t.base_id && tab(t.base_id) ? tab(t.base_id) : null;
  const vigenteDe = tt => S.tabelaVigente(S.today(), tt);

  // Compara os preços com a tabela de antes: quantos mudaram, reajuste médio, maior e menor
  const comparar = (cel, base, mao) => {
    const ks = Object.keys(cel).filter(k => base[k] !== undefined && base[k] > 0), dif = ks.map(k => cel[k].preco / base[k] - 1);
    const mudaram = ks.filter(k => cel[k].preco !== base[k]).length;
    return { total:Object.keys(cel).length, comBase:ks.length, mudaram, iguais:ks.length - mudaram, mao:[...(mao || [])].filter(k => cel[k]).length,
      media:dif.length ? dif.reduce((a, b) => a + b, 0) / dif.length * 100 : null, maior:dif.length ? Math.max(...dif) * 100 : null, menor:dif.length ? Math.min(...dif) * 100 : null };
  };
  const fmtPct = n => n === null ? '—' : (n > 0.05 ? '+' : n < -0.05 ? '−' : '') + Math.abs(n).toFixed(1).replace('.', ',') + '%';

  // ---------- editor (as mudanças ficam aqui até Salvar) ----------
  let ed = null;            // { id, tipo, nome, inicio, progs:[ids], forms:[ids], pacotes:[…], cel:{chave:{preco, desconto_max}}, base:{chave:preco}, baseNome, mao:Set, sujo, edit } · edit = clicou em Editar
  let pedirEdit = null;     // tabela que deve abrir já em edição (Editar no ⋯ da lista)
  let editando = null;      // célula com o campo de preço aberto { p, f }
  let secCel = 'programa';  // seção aberta no celular
  const massaUlt = { alvo:'tudo', op:'pct+', val:'', arr:'5' };   // último reajuste em massa, para não apagar ao redesenhar
  const abrir = t => { const b = baseDe(t), bp = b ? precosDe(b.id) : {}, m = membros(t);
    ed = { id:t.id, tipo:tipoDe(t), nome:t.nome, inicio:t.inicio || '', progs:m.progs, forms:m.forms, pacotes:JSON.parse(JSON.stringify(t.pacotes || [])), cel:precosDe(t.id), base:Object.fromEntries(Object.entries(bp).map(([k, v]) => [k, v.preco])), baseNome:b ? b.nome : '', mao:new Set(), sujo:false, edit:pedirEdit === t.id };
    pedirEdit = null; editando = null; };
  const emEdicao = () => { const t = ed && tab(ed.id); return !!t && podeEditar(t) && ed.edit; };
  S.tpSujo = () => !!(ed && ed.sujo);
  const sujar = () => { if (!ed.sujo) { ed.sujo = true; document.querySelectorAll('.tp-sujo').forEach(e => { e.hidden = false; }); } };
  const descontoPadrao = cel => { const c = {}; Object.values(cel).forEach(x => { c[x.desconto_max] = (c[x.desconto_max] || 0) + 1; }); const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return k === undefined ? null : Number(k); };
  const descontoDo = (cel, p) => { const xs = lista('formato').map(f => cel[chave(p.id, f.id)]).filter(Boolean).map(x => x.desconto_max); return xs.length && xs.every(x => x === xs[0]) ? xs[0] : xs.length ? null : undefined; };

  // Visão usada pela grade: os preços e itens do editor ou, na lista, os da vigente (só leitura)
  const visaoEditor = () => ({ tipo:ed.tipo, cel:ed.cel, base:ed.base, mao:ed.mao, editar:emEdicao(), temBase:!!ed.baseNome, progs:ed.progs, forms:ed.forms, pacotes:ed.pacotes });
  const visaoDe = t => { const m = t ? membros(t) : { progs:[], forms:[] }; return { tipo:t ? tipoDe(t) : 'radio', cel:t ? precosDe(t.id) : {}, base:{}, mao:new Set(), editar:false, temBase:false, progs:m.progs, forms:m.forms, pacotes:(t && t.pacotes) || [] }; };
  const visaoVigente = (tt = 'radio') => visaoDe(vigenteDe(tt));
  // Linhas e colunas da tabela, na ordem do cadastro (digital: progs = canais, forms = entregas)
  const progsDe = v => catalogo(v.tipo, 'programa').filter(p => v.progs.includes(p.id));
  const formsDe = v => { const fs = catalogo(v.tipo, 'formato').filter(f => v.forms.includes(f.id)); return v.tipo === 'digital' ? fs : [...fs.filter(f => !unico(f)), ...fs.filter(unico)]; };
  const temPreco = (v, p) => formsDe(v).some(f => v.cel[chave(p.id, f.id)]);

  // Avisa quando um formato mais longo custa menos que um mais curto no mesmo programa
  const avisos = (v, p) => {
    const fs = formsDe(v).filter(f => !unico(f)).map(f => ({ f, s:segundos(f), x:v.cel[chave(p.id, f.id)] })).filter(o => o.s !== null && o.x);
    const out = {};
    fs.forEach(a => { const menor = fs.filter(b => b.s < a.s && b.x.preco > a.x.preco).sort((b, c) => c.s - b.s)[0]; if (menor) out[a.f.id] = `Mais barato que o ${menor.f.nome}`; });
    return out;
  };
  // Situação de um preço frente à tabela anterior: mudou, mudado à mão, igual ou novo
  const estado = (v, k) => { const x = v.cel[k], b = v.base[k]; if (!v.temBase || !x) return ''; if (b === undefined) return 'novo'; if (v.mao.has(k)) return 'mao'; return x.preco !== b ? 'mudou' : 'igual'; };
  const diferenca = (v, k) => { const x = v.cel[k], b = v.base[k], e = estado(v, k);
    return !e ? '' : e === 'novo' ? 'novo nesta tabela' : e === 'igual' ? 'igual à anterior' : `era ${S.nfmt(b) || '0,00'} · ${pct(x.preco, b)}`; };

  const celula = (v, p, f, av, primeiroUnico) => {
    const k = chave(p.id, f.id), x = v.cel[k], cls = `tp-cel${unico(f) && v.tipo !== 'digital' ? ' uni' : ''}${primeiroUnico ? ' uni1' : ''}`;
    if (v.editar && editando && editando.p === p.id && editando.f === f.id) return `<span class="${cls}"><span class="tp-ed"><label for="tpEd">R$</label><input id="tpEd" data-mask="dec" inputmode="decimal" value="${x ? S.nfmt(x.preco) : ''}" placeholder="0,00" aria-label="Preço de ${esc(p.nome)} ${esc(f.nome)}"><button class="btn sm pri" data-act="tpCelOk" aria-label="Confirmar preço">${S.svg('check')}</button></span>${v.base[k] !== undefined ? `<small class="tp-dif">antes ${S.nfmt(v.base[k])}</small>` : ''}</span>`;
    if (!x) return `<span class="${cls}">${!v.editar ? '<span class="muted">—</span>' : temPreco(v, p) ? `<button class="tp-vazio leve" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}" aria-label="Definir preço de ${esc(p.nome)} ${esc(f.nome)}" title="Não é vendido. Clique para definir um preço.">—</button>` : `<button class="tp-vazio" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}">Definir preço</button>`}</span>`;
    const e = estado(v, k), dif = diferenca(v, k), aviso = av[f.id];
    return `<span class="${cls}"><button class="tp-preco ${e}${aviso ? ' aviso' : ''}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${v.editar ? '' : ' disabled'} title="Desconto máximo ${x.desconto_max}%">${brl(x.preco)}</button>${dif ? `<small class="tp-dif ${e}">${dif}</small>` : ''}${aviso ? `<small class="aviso">${esc(aviso)}</small>` : ''}</span>`;
  };

  const tres = (act, id, rotulo) => `<button class="btn tres" data-act="${act}" data-id="${id}" aria-label="Opções de ${esc(rotulo)}">${S.svg('mais3')}</button>`;
  const botoesAdd = cls => `<button class="btn ${cls}" data-act="tpAddProg">${S.svg('mais')}Adicionar programa</button><button class="btn ${cls}" data-act="tpAddForm">${S.svg('mais')}Adicionar formato</button>`;

  // Grade do computador: só os programas e formatos desta tabela
  const grade = v => {
    const progs = progsDe(v), forms = formsDe(v), desc = descontoPadrao(v.cel), menus = v.editar;
    const secoes = SECOES.map(([k, titulo]) => ({ k, titulo, itens:progs.filter(p => secaoDe(p) === k) })).filter(s => s.itens.length);
    const nDur = forms.filter(f => !unico(f)).length, nUni = forms.length - nDur, i1 = nDur;
    const grupos = nDur && nUni ? `<div class="tp-cab tp-grupos"><span></span><span class="tp-grupo" style="grid-column:span ${nDur}">Spot · preço por duração</span><span class="tp-grupo uni1" style="grid-column:span ${nUni}">Preço único</span><span></span></div>` : '';
    return `<div class="scroll"><div class="tp-tab" style="--n:${Math.max(1, forms.length)}">${grupos}
      <div class="tp-cab"><span class="muted small">Onde vai ao ar · dias e horário</span>${forms.map((f, i) => `<span class="tp-form${f.ativo ? '' : ' inativo'}${i === i1 ? ' uni1' : ''}"><span><b>${esc(f.nome)}</b><small>${esc(unico(f) ? (f.detalhe || 'valor único') : f.detalhe || '')}${f.ativo ? '' : ' · fora dos novos PIs'}</small></span>${menus ? tres('tpMenuForm', f.id, f.nome) : ''}</span>`).join('') || '<span class="muted small">Nenhum formato nesta tabela</span>'}
        <span class="tp-mais">${menus ? `<button class="btn sm tracej" data-act="tpAddForm">${S.svg('mais')}Formato</button>` : ''}</span></div>
      ${secoes.map(s => `<div class="tp-secao">${esc(s.titulo)}</div>` + s.itens.map(p => { const av = avisos(v, p), dp = descontoDo(v.cel, p);
        return `<div class="tp-row${p.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>
          <span class="row mid" style="gap:6px">${dp !== undefined && dp !== desc ? S.tag(`Desconto máx. ${dp === null ? 'varia' : dp + '%'}`, 'blue') : ''}${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span></span>
          ${forms.map((f, i) => celula(v, p, f, av, i === i1)).join('') || '<span></span>'}<span class="tp-mais">${menus ? tres('tpMenuProg', p.id, p.nome) : ''}</span></div>`; }).join('')).join('')}
      ${menus ? `<div class="tp-rodape tp-novos"><button class="btn sm tracej" data-act="tpAddProg">${S.svg('mais')}Adicionar programa</button></div>` : ''}
    </div></div>`;
  };

  // Celular: abas por seção; cada programa vira um cartão com os formatos em quadradinhos
  const cartoes = v => {
    const progs = progsDe(v), menus = v.editar, secoes = SECOES.map(([k]) => ({ k, itens:progs.filter(p => secaoDe(p) === k) })).filter(s => s.itens.length);
    const ab = secoes.some(s => s.k === secCel) ? secCel : (secoes[0] || {}).k;
    const cartao = p => { const fs = formsDe(v), av = avisos(v, p);
      const tile = f => { const k = chave(p.id, f.id), x = v.cel[k], e = estado(v, k), nome = segundos(f) && !unico(f) ? `${segundos(f)}"` : f.nome;
        if (!x && !v.editar) return '';
        return `<button class="tp-mini ${e}${x ? '' : ' vazio'}${av[f.id] ? ' aviso' : ''}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${v.editar ? '' : ' disabled'} aria-label="${esc(f.nome)}: ${x ? brl(x.preco) : 'sem preço'}"><small>${esc(nome)}</small><b>${x ? S.nfmt(x.preco) : '—'}</b>${x && e && e !== 'igual' ? `<small class="tp-dif ${e}">${e === 'novo' ? 'novo' : pct(x.preco, v.base[k])}</small>` : ''}</button>`; };
      return `<div class="card tp-cartao${p.ativo ? '' : ' inativo'}"><div class="hd"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span>${menus ? tres('tpMenuProg', p.id, p.nome) : ''}</div>
        <div class="tp-minis">${fs.map(tile).join('')}</div></div>`; };
    return (secoes.length > 1 ? `<div class="seg tp-seg" role="tablist">${secoes.map(s => `<button role="tab" class="${s.k === ab ? 'on' : ''}" aria-selected="${s.k === ab}" data-act="tpSecao" data-secao="${s.k}">${ABA[s.k]}</button>`).join('')}</div>` : '')
      + (secoes.find(s => s.k === ab) || { itens:[] }).itens.map(cartao).join('')
      + (menus ? `<div class="tp-novos">${botoesAdd('tracej')}</div>` : '');
  };
  // ---------- tabela digital: entregas nas linhas, canais nas colunas, e pacotes ----------
  const botoesAddDig = cls => `<button class="btn ${cls}" data-act="tpAddForm">${S.svg('mais')}Adicionar entrega</button><button class="btn ${cls}" data-act="tpAddProg">${S.svg('mais')}Adicionar canal</button>`;
  const gradeDig = v => {
    const ents = formsDe(v), canais = progsDe(v), menus = v.editar;
    if (S.celular) return ents.map(f => `<div class="card tp-cartao"><div class="hd"><span class="tp-prog"><b>${esc(f.nome)}</b>${f.detalhe ? `<small>${esc(f.detalhe)}</small>` : ''}</span>${menus ? tres('tpMenuForm', f.id, f.nome) : ''}</div>
        <div class="tp-minis">${canais.map(c => { const k = chave(c.id, f.id), x = v.cel[k]; if (!x && !v.editar) return '';
          return `<button class="tp-mini${x ? '' : ' vazio'}" data-act="tpEditar" data-p="${c.id}" data-f="${f.id}"${v.editar ? '' : ' disabled'} aria-label="${esc(c.nome)}: ${x ? brl(x.preco) : 'sem preço'}"><small>${esc(c.nome)}</small><b>${x ? S.nfmt(x.preco) : '—'}</b></button>`; }).join('')}</div></div>`).join('')
      + (menus ? `<div class="tp-novos">${botoesAddDig('tracej')}</div>` : '');
    return `<section class="card tp-grade"><div class="scroll"><div class="tp-tab" style="--n:${Math.max(1, canais.length)}">
      <div class="tp-cab"><span class="muted small">Entrega · preço por publicação</span>${canais.map(c => `<span class="tp-form${c.ativo ? '' : ' inativo'}"><span><b>${esc(c.nome)}</b><small>${esc(c.detalhe || '')}</small></span>${menus ? tres('tpMenuProg', c.id, c.nome) : ''}</span>`).join('') || '<span class="muted small">Nenhum canal nesta tabela</span>'}
        <span class="tp-mais">${menus ? `<button class="btn sm tracej" data-act="tpAddProg">${S.svg('mais')}Canal</button>` : ''}</span></div>
      ${ents.map(f => `<div class="tp-row${f.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(f.nome)}</b>${f.detalhe ? `<small>${esc(f.detalhe)}</small>` : ''}</span>
        ${canais.map(c => celula(v, c, f, {}, false)).join('') || '<span></span>'}<span class="tp-mais">${menus ? tres('tpMenuForm', f.id, f.nome) : ''}</span></div>`).join('')}
      ${menus ? `<div class="tp-rodape tp-novos"><button class="btn sm tracej" data-act="tpAddForm">${S.svg('mais')}Adicionar entrega</button><span class="muted small">só entregas digitais (Reels, Stories, Feed, Live…)</span></div>` : ''}
    </div></div></section>`;
  };
  // Valor de tabela de um pacote: soma de quantidade × preço da entrega no canal do pacote
  const valorPacote = (v, pk) => (pk.itens || []).reduce((s, it) => { const x = v.cel[chave(pk.canal_id, it.entrega_id)]; return s + (parseInt(it.qtd) || 0) * (x ? x.preco : 0); }, 0);
  const pacotesHtml = v => { const pks = v.pacotes || [];
    if (!pks.length && !v.editar) return '';
    const linha = (pk, i) => { const tb = valorPacote(v, pk), c = prod(pk.canal_id), desc = tb > 0 && pk.preco < tb ? Math.round((1 - pk.preco / tb) * 1000) / 10 : 0;
      return `<div class="tp-pk"><div class="tp-pk-info"><b>${esc(pk.nome)}</b><small class="muted">${esc([c.nome, c.detalhe].filter(Boolean).join(' '))}</small>
        <div class="ad-chips">${(pk.itens || []).filter(it => parseInt(it.qtd) > 0).map(it => `<span class="ad-chip">${esc((prod(it.entrega_id).nome || it.nome || '').trim())} · ${parseInt(it.qtd)}</span>`).join('')}</div></div>
        <span class="tp-pk-v"><b>${brl(pk.preco)}</b><small class="muted">tabela ${brl(tb)}${desc ? ` · ${String(desc).replace('.', ',')}% de desconto` : ''}</small></span>
        <span class="ad-x">${v.editar ? `<button class="btn sm" data-act="tpPacote" data-i="${i}">${S.svg('editar')}Editar</button><button class="x" data-act="tpTirarPacote" data-i="${i}" aria-label="Tirar o pacote ${esc(pk.nome)}" title="Tirar">×</button>` : ''}</span></div>`; };
    return `<section class="card tp-pks"><div class="hd"><h2>Pacotes</h2>${v.editar ? `<button class="btn sm" data-act="tpPacote" data-i="">${S.svg('mais')}Pacote</button>` : '<span>preço fechado</span>'}</div>
      ${pks.length ? pks.map(linha).join('') : '<p class="muted small" style="margin:0">Nenhum pacote. Ex.: "Pacote Presença" = 2 Reels + 8 Stories por um preço fechado; o consultor escolhe com um clique na ação digital.</p>'}</section>`; };

  // Tabela sem nenhum item (do zero)
  const vazia = v => { const d = v.tipo === 'digital';
    return `<div class="card empty"><b>Tabela vazia</b>${v.editar ? (d ? 'Adicione as entregas (Reels, Stories, Feed, Live…) e os canais que esta tabela vai ter. Eles vêm do cadastro digital, ou você cadastra um novo na hora.' : 'Adicione só os programas e formatos que esta tabela vai ter. Eles vêm do cadastro da rádio, ou você cadastra um novo na hora.') : `Esta tabela ainda não tem ${d ? 'entregas nem canais' : 'programas nem formatos'}.`}
    ${v.editar ? `<div class="row mid" style="justify-content:center;margin-top:18px;flex-wrap:wrap">${d ? botoesAddDig('') : botoesAdd('')}</div>` : ''}</div>`; };
  const corpoGrade = v => {
    if (!progsDe(v).length && !formsDe(v).length) return vazia(v) + (v.tipo === 'digital' ? pacotesHtml(v) : '');
    if (v.tipo === 'digital') return gradeDig(v) + pacotesHtml(v);
    return S.celular ? cartoes(v) : `<section class="card tp-grade">${grade(v)}</section>`;
  };

  // ---------- abas: Rádio e Digital, cada uma com as suas subabas ----------
  const ROTAS = { radio:[['tabelas', '/produtos', 'Tabelas'], ['catalogo', '/produtos/catalogo', 'Programas e formatos']], digital:[['tabelas', '/produtos/digital', 'Tabelas'], ['canais', '/produtos/canais', 'Canais e entregas']] };
  // Abas do topo: as de Produtos (produtos.js); dentro de Digital, as subabas Tabelas · Canais e entregas
  const abas = (area, subaba) => S.produtosAbas('digital')
      + (pode() && area === 'digital' ? `<nav class="tp-sub" aria-label="Digital">${ROTAS.digital.map(([k, rota, nome]) => `<a href="#${rota}" data-go="${rota}" class="${k === subaba ? 'on' : ''}"${k === subaba ? ' aria-current="page"' : ''}>${nome}</a>`).join('')}</nav>` : '');

  // ---------- lista de tabelas de um tipo ----------
  const periodo = t => { const s = sit(t), fim = s === 'encerrada' ? fimDe(t) : null;
    return s === 'rascunho' ? (t.inicio ? `Prevista para ${dfmt(t.inicio)}` : 'Sem data de início ainda') : s === 'agendada' ? `Começa em ${dfmt(t.inicio)}` : s === 'vigente' ? `Desde ${dfmt(t.inicio)}` : `${dfmt(t.inicio)} a ${fim ? dfmt(fim) : '—'}`; };
  const contagem = t => { const m = membros(t), d = tipoDe(t) === 'digital', q = (n, um, v) => `${n} ${n === 1 ? um : v}`;
    return d ? [q(m.forms.length, 'entrega', 'entregas'), q(m.progs.length, 'canal', 'canais'), q((t.pacotes || []).length, 'pacote', 'pacotes')].join(' · ') : [q(m.progs.length, 'programa', 'programas'), q(m.forms.length, 'formato', 'formatos')].join(' · '); };
  const cartaoTabela = t => {
    const s = sit(t), [rot, tom] = S.SITUACAO_TABELA[s], cel = precosDe(t.id), b = baseDe(t), c = b ? comparar(cel, Object.fromEntries(Object.entries(precosDe(b.id)).map(([k, v]) => [k, v.preco]))) : null;
    const acao = 'Abrir';
    const info = s === 'rascunho' || s === 'agendada' ? ['Reajuste médio', c && c.media !== null ? fmtPct(c.media) : '—'] : ['PIs feitos no período', String(pisNoPeriodo(t))];
    const obs = s === 'rascunho' ? `${contagem(t)} · ainda não vale` : s === 'agendada' ? 'Publicada. Até essa data vale a tabela atual.' : s === 'vigente' ? `${contagem(t)} · é a que se usa hoje` : 'Só consulta';
    return `<article class="card tp-tabela ${s}"><div class="tp-tabela-cab"><div><h2>${esc(t.nome)}</h2><small class="muted">${periodo(t)}</small></div>${S.tag(rot, tom)}</div>
      <div class="tp-tabela-num"><div><small>Preços</small><b>${Object.keys(cel).length}</b></div><div><small>${info[0]}</small><b>${info[1]}</b></div></div>
      <small class="muted">${esc(obs)}</small>
      <div class="row mid"><button class="btn${s === 'rascunho' && pode() ? ' pri' : ''}" data-go="/produtos/${t.id}">${acao}</button><button class="btn tres" data-act="tpMenuTabela" data-id="${t.id}" aria-label="Opções de ${esc(t.nome)}">${S.svg('mais3')}</button></div></article>`;
  };
  const vistaLista = tt => {
    const ts = tabelas(tt), vig = vigenteDe(tt), d = tt === 'digital', rot = d ? 'Nova tabela digital' : 'Nova tabela de rádio';
    const passos = `<div class="tp-ciclo"><span class="pill" style="--tone:var(--gray)">Em preparação</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--blue)">Agendada</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--green)">Vigente</span><span aria-hidden="true">→</span><span class="pill" style="--tone:var(--gray)">Encerrada</span>
      <span class="muted small">${d ? 'Tabelas digitais: entregas × canais e pacotes, com vigência própria (não mexem na de rádio).' : 'Tabelas de rádio: programas × formatos. Nada do digital aparece aqui.'} ${diretor() ? 'Ao publicar, você escolhe' : 'O diretor publica e escolhe'} a data de início. PIs já feitos nunca mudam.</span></div>`;
    const cartoesT = ts.length ? `<div class="tp-tabelas">${ts.map(cartaoTabela).join('')}${pode() ? `<button class="card tp-tabela tp-nova" data-act="tpNova" data-tipo="${tt}">${S.svg('mais')}<b>${rot}</b><small class="muted">${d ? 'vigência própria, não mexe na de rádio' : 'só programas e formatos da rádio'}</small></button>` : ''}</div>`
      : `<div class="card empty"><b>Nenhuma tabela ${NOME[tt]} ainda</b>${d ? 'Crie a tabela digital com o preço de cada entrega (Reels, Stories, Feed, Live…) por canal e os pacotes de preço fechado.' : 'Crie a primeira tabela, adicione os programas e formatos e defina os preços.'}${pode() ? `<div class="row mid" style="justify-content:center;margin-top:18px"><button class="btn pri" data-act="tpNova" data-tipo="${tt}">${S.svg('mais')}${rot}</button></div>` : ''}</div>`;
    const previa = vig ? `<div class="hd tp-previa-cab"><h2>${esc(vig.nome)} · vigente</h2><a data-go="/produtos/${vig.id}">Abrir</a></div>${corpoGrade(visaoVigente(tt))}<p class="muted small" style="margin-top:12px">Valores em R$ por ${d ? 'publicação' : 'inserção'}; "—" = não é vendido.</p>` : '';
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Produtos`,
      actions:`${vig ? `<button class="btn" data-act="tpPdf" data-id="${vig.id}">${S.svg('baixar')}PDF da vigente</button>` : ''}${pode() ? `<button class="btn pri" data-act="tpNova" data-tipo="${tt}">${S.svg('mais')}${rot}</button>` : ''}`,
      body:abas(tt, 'tabelas') + (ts.length ? passos : '') + cartoesT + previa };
  };

  // ---------- Digital · Canais e entregas (o cadastro digital) ----------
  // Cor do ícone pela rede (o resto fica com a cor da rádio)
  const rede = c => { const n = String(c.nome || '').toLowerCase(); return /insta/.test(n) ? ' ig' : /face/.test(n) ? ' fb' : /tik/.test(n) ? ' tt' : /you/.test(n) ? ' yt' : /linked/.test(n) ? ' li' : /whats/.test(n) ? ' wa' : ''; };
  const vistaCanais = () => {
    const canais = digitais('programa'), ents = digitais('formato');
    const nTab = (id, campo) => tabelas('digital').filter(t => membros(t)[campo].includes(id)).length;
    const emTab = (id, campo) => { const n = nTab(id, campo); return n ? `em ${n} ${n === 1 ? 'tabela' : 'tabelas'}` : 'em nenhuma tabela'; };
    const cartao = c => `<article class="card tp-canal${c.ativo ? '' : ' inativo'}"><div class="tp-canal-cab"><span class="tp-canal-ic${rede(c)}" aria-hidden="true">${esc((c.nome || '?').trim()[0] || '?')}</span><div><h2>${esc(c.nome)}</h2><small class="muted">${esc(c.detalhe) || 'perfil não informado'} · ${emTab(c.id, 'progs')}</small></div>${S.tag(c.ativo ? 'Ativo' : 'Inativo', c.ativo ? 'green' : 'gray')}</div>
      ${pode() ? `<div class="row mid"><button class="btn sm" data-act="tpEditarProd" data-id="${c.id}">${S.svg('editar')}Editar</button>${tres('tpMenuCanal', c.id, c.nome)}</div>` : ''}</article>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Produtos`, actions:pode() ? `<button class="btn pri" data-act="tpCanal">${S.svg('mais')}Canal</button>` : '',
      body:abas('digital', 'canais') + `<p class="muted tp-intro">O cadastro digital: os canais da rádio nas redes e as entregas que ela vende. Os preços ficam nas tabelas digitais. Os produtos de rádio ficam na aba Produtos.</p>
        <div class="tp-cats"><section class="card"><div class="hd"><h2>Canais da rádio</h2>${pode() ? `<button class="btn sm" data-act="tpCanal">${S.svg('mais')}Canal</button>` : ''}</div>
          <div class="tp-canais">${canais.map(cartao).join('') || '<p class="muted small" style="margin:0">Nenhum canal cadastrado.</p>'}</div></section>
        <section class="card"><div class="hd"><h2>Entregas</h2>${pode() ? `<button class="btn sm" data-act="tpEntrega">${S.svg('mais')}Entrega</button>` : ''}</div>
          ${ents.map(f => `<div class="tp-cat${f.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(f.nome)}</b>${f.detalhe ? `<small>${esc(f.detalhe)}</small>` : ''}</span><span class="muted small">${emTab(f.id, 'forms')}</span><span></span>${pode() ? tres('tpMenuEntrega', f.id, f.nome) : '<span></span>'}</div>`).join('') || '<p class="muted small" style="margin:0">Nenhuma entrega cadastrada. Ex.: Reels, Stories, Feed, Live.</p>'}
          <p class="muted small" style="margin:12px 0 0">Também viram atalhos na ação digital. Lá dá para digitar qualquer outra entrega (ex.: "Live com o cliente").</p></section></div>` };
  };

  // ---------- aba Programas e formatos: o cadastro da rádio ----------
  const vistaCatalogo = () => {
    const nTab = (id, campo) => tabelas('radio').filter(t => membros(t)[campo].includes(id)).length;
    const linha = (p, campo, sub) => { const n = nTab(p.id, campo);
      return `<div class="tp-cat${p.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${sub}</small></span><span class="muted small">${n ? `em ${n} ${n === 1 ? 'tabela' : 'tabelas'}` : 'em nenhuma tabela'}</span>
        <span>${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span>${pode() ? tres(campo === 'progs' ? 'tpMenuProgCat' : 'tpMenuFormCat', p.id, p.nome) : '<span></span>'}</div>`; };
    const progs = radio('programa'), forms = radio('formato');
    const blocos = SECOES.map(([k, titulo, n]) => { const l = progs.filter(p => secaoDe(p) === k);
      return `<section class="card"><div class="hd"><h2>${esc(ABA[k])}</h2>${pode() ? `<button class="btn sm" data-act="tpProduto" data-tipo="programa" data-secao="${k}">${S.svg('mais')}${n}</button>` : ''}</div>
        ${l.length ? l.map(p => linha(p, 'progs', horario(p))).join('') : `<p class="muted small" style="margin:0">Nenhum ${n.toLowerCase()} cadastrado.</p>`}</section>`; }).join('');
    const fs = `<section class="card"><div class="hd"><h2>Formatos</h2>${pode() ? `<button class="btn sm" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button>` : ''}</div>
      ${forms.length ? forms.map(f => linha(f, 'forms', esc(unico(f) ? `Preço único${f.detalhe ? ' · ' + f.detalhe : ''}` : `Por duração${f.detalhe ? ' · ' + f.detalhe : ''}`))).join('') : '<p class="muted small" style="margin:0">Nenhum formato cadastrado.</p>'}</section>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Produtos`, actions:'',
      body:abas('radio', 'catalogo') + `<p class="muted tp-intro">O cadastro da rádio. Cada tabela usa só os programas e formatos que você adicionar a ela; mudar o nome ou o horário aqui vale para todas.</p><div class="tp-cats">${blocos}${fs}</div>` };
  };

  // ---------- editor de uma tabela ----------
  const vistaTabela = t => {
    const s = sit(t), v = visaoEditor(), editar = v.editar, [rot, tom] = S.SITUACAO_TABELA[s], tt = tipoDe(t), d = tt === 'digital', vig = vigenteDe(tt);
    const c = ed.baseNome ? comparar(ed.cel, ed.base, ed.mao) : null;
    const sujo = `<span class="sujo tp-sujo"${ed.sujo ? '' : ' hidden'}><i></i>Alterações não salvas</span>`;
    const botoesEdicao = `${sujo}<button class="btn" data-act="tpDescartar">Descartar</button><button class="btn pri" data-act="tpSalvarTabela">Salvar</button>`;
    const publicar = s === 'rascunho' && diretor(), podeEd = podeEditar(t);
    const acoes = editar ? botoesEdicao
      : `<button class="btn" data-act="tpPdf" data-id="${t.id}">${S.svg('baixar')}PDF</button>${pode() ? `<button class="btn tres" data-act="tpMenuTabela" data-id="${t.id}" data-dentro="1" aria-label="Mais opções da tabela">${S.svg('mais3')}</button>` : ''}${podeEd ? `<button class="btn${publicar ? '' : ' pri'}" data-act="tpEditarTabela" data-id="${t.id}">${S.svg('editar')}Editar</button>` : ''}${publicar ? `<button class="btn pri" data-act="tpPublicar">Publicar…</button>` : ''}`;
    const texto = s === 'rascunho' ? `Em preparação: ainda não vale.${vig ? ` A ${esc(vig.nome)} continua vigente.` : ''}${d ? ' A tabela de rádio não muda.' : ''}${ed.baseNome ? ` Cópia da ${esc(ed.baseNome)}.` : ' Começou do zero.'}`
      : s === 'agendada' ? `Publicada: começa a valer em ${dfmt(t.inicio)}. Até lá os PIs usam a ${vig ? esc(vig.nome) : 'tabela atual'}.`
      : s === 'vigente' ? `Vigente desde ${dfmt(t.inicio)}: é a que as propostas e os PIs novos usam.${editar ? ' <b>Editando a tabela vigente:</b> o que você salvar vale para as propostas e PIs feitos a partir de agora; os já feitos não mudam.' : ''}` : `Encerrada: valeu de ${dfmt(t.inicio)} a ${fimDe(t) ? dfmt(fimDe(t)) : '—'}. Só consulta.`;
    const campos = editar ? `<div class="tp-campos"><label class="f">Nome da tabela<input data-tp-nome="1" value="${esc(ed.nome)}" placeholder="Ex.: Tabela 2027"></label>
      ${s === 'rascunho' ? `<label class="f">Começa a valer em (previsto)<input type="date" data-tp-inicio="1" value="${esc(ed.inicio)}"></label>` : s === 'agendada' ? `<label class="f">Começa a valer em<input type="date" data-tp-inicio="1" min="${S.today()}" value="${esc(ed.inicio)}"></label>` : ''}</div>` : '';
    const faixa = `<div class="card tp-faixa"><span class="tp-tags">${S.tag(rot, tom)}${S.tag(d ? 'Digital' : 'Rádio', d ? 'purple' : 'blue')}</span><span>${texto}</span><span class="grow"></span>${campos}
      ${s === 'rascunho' && !diretor() && editar ? '<small class="muted tp-quem">Quando estiver pronta, o diretor publica.</small>' : ''}</div>`;
    const forms = formsDe(v), progs = progsDe(v);
    const massa = editar && Object.keys(ed.cel).length ? `<section class="card tp-massa" aria-label="Reajustar vários de uma vez">
      <div class="tp-massa-tit"><b>Reajustar vários de uma vez</b><small class="muted">${ed.baseNome ? `Calcula a partir dos preços da ${esc(ed.baseNome)}.` : 'Calcula a partir dos preços desta tabela.'} Você confere antes de salvar.</small></div>
      <label class="f">Aplicar em<select name="tp_alvo"><option value="tudo">Toda a tabela</option>${d ? '' : SECOES.filter(([k]) => progs.some(p => secaoDe(p) === k)).map(([k, , n]) => `<option value="sec:${k}"${massaUlt.alvo === 'sec:' + k ? ' selected' : ''}>Só ${k === 'rotativo' ? 'o rotativo' : n.toLowerCase() + 's'}</option>`).join('')}${forms.map(f => `<option value="f:${f.id}"${massaUlt.alvo === 'f:' + f.id ? ' selected' : ''}>Só ${d ? 'a entrega' : 'a coluna'} ${esc(f.nome)}</option>`).join('')}</select></label>
      <label class="f">Reajuste<span class="duo"><select name="tp_op" aria-label="Tipo de reajuste">${[['pct+', 'Aumentar %'], ['pct-', 'Reduzir %'], ['brl+', 'Somar R$'], ['brl-', 'Tirar R$']].map(([k, n]) => `<option value="${k}"${massaUlt.op === k ? ' selected' : ''}>${n}</option>`).join('')}</select><input name="tp_val" data-mask="dec" inputmode="decimal" placeholder="Ex.: 8,5" value="${esc(massaUlt.val)}" aria-label="Valor do reajuste"></span></label>
      <label class="f">Arredondar<select name="tp_arr">${[['5', 'Para R$ 5,00'], ['1', 'Para R$ 1,00'], ['10', 'Para R$ 10,00'], ['0', 'Não arredondar']].map(([k, n]) => `<option value="${k}"${massaUlt.arr === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn pri" data-act="tpAplicar">Aplicar na grade</button>${ed.baseNome ? `<button class="btn" data-act="tpVoltarBase">Voltar aos preços da ${esc(ed.baseNome)}</button>` : ''}</section>` : '';
    const resumo = c && c.comBase ? `<div class="tiles tp-resumo">
      <div class="tile"><small>${s === 'rascunho' || s === 'agendada' ? 'Começa a valer' : 'Valendo desde'}</small><b>${t.inicio || ed.inicio ? dfmt(s === 'rascunho' ? ed.inicio : t.inicio) : '—'}</b><small>${s === 'rascunho' ? (diretor() ? 'você confirma ao publicar' : 'o diretor confirma ao publicar') : periodo(t)}</small></div>
      <div class="tile"><small>Preços reajustados</small><b>${c.mudaram} de ${c.comBase}</b><small>${[c.iguais && `${c.iguais} igua${c.iguais > 1 ? 'is' : 'l'}`, c.mao && `${c.mao} à mão`, c.total > c.comBase && `${c.total - c.comBase} nov${c.total - c.comBase > 1 ? 'os' : 'o'}`].filter(Boolean).join(' · ') || 'todos'}</small></div>
      <div class="tile"><small>Reajuste médio</small><b>${fmtPct(c.media)}</b><small>menor ${fmtPct(c.menor)} · maior ${fmtPct(c.maior)}</small></div>
      <div class="tile"><small>Comparando com</small><b class="tp-comp">${esc(ed.baseNome)}</b><small>embaixo de cada preço: o valor de antes</small></div></div>` : '';
    const legenda = c && c.comBase ? `<div class="tp-legenda"><span><i class="tp-q mudou"></i>Reajustado</span><span><i class="tp-q mao"></i>Mudado à mão</span><span><i class="tp-q igual"></i>Igual à anterior</span><span><i class="tp-q novo"></i>Novo</span></div>` : '';
    const barraCel = editar ? `<div class="tp-barra">${sujo}<div class="row"><button class="btn" data-act="tpDescartar">Descartar</button><button class="btn pri" data-act="tpSalvarTabela">Salvar</button></div></div>` : '';
    return { title:`<span class="sub">${pode() ? `<a data-go="/produtos${d ? '/digital' : ''}">← Produtos · ${d ? 'Digital' : 'Rádio'}</a> · ` : 'Produtos · '}${esc(S.veh().nome)}</span>${esc(ed.nome || t.nome)}`,
      actions:editar ? `<span class="tp-topo">${acoes}</span>` : acoes, body:(pode() ? '' : abas(tt, '')) + faixa + massa + resumo + legenda + corpoGrade(v) + (editar && !S.celular && (progs.length || forms.length) ? `<p class="muted small" style="margin-top:12px">Clique num valor para digitar outro (Enter confirma, Esc desiste). Nada vale até ${s === 'rascunho' ? 'publicar' : 'salvar'}.</p>` : '') + barraCel };
  };

  S.views.cadastros = id => {
    // Consultor e outros perfis só consultam a vigente de cada tipo (o banco nem entrega as em preparação para eles)
    if (!pode()) { const tt = id === 'digital' ? 'digital' : 'radio', vig = vigenteDe(tt);
      if (!vig) return { title:`<span class="sub">${esc(S.veh().nome)}</span>Produtos`, actions:'', body:abas(tt, '') + `<div class="card empty"><b>Nenhuma tabela ${NOME[tt]} vigente</b>Quando a tabela for publicada, ela aparece aqui para consulta.</div>` };
      if (!ed || ed.id !== vig.id) abrir(vig);
      return vistaTabela(vig); }
    if (id === 'digital') return vistaLista('digital');
    if (id === 'canais') return vistaCanais();
    if (id === 'catalogo') return vistaCatalogo();
    const t = id && tab(id);
    if (!t) { if (ed && !ed.sujo) ed = null; return vistaLista('radio'); }
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
  // Grava tudo de uma vez: programas e formatos da tabela, preços novos e alterados; os que saíram da tabela são apagados
  const gravar = async () => {
    const dentro = k => { const [p, f] = k.split('|'); return ed.progs.includes(p) && ed.forms.includes(f); };
    Object.keys(ed.cel).forEach(k => { if (!dentro(k)) delete ed.cel[k]; });
    const lista_ = Object.entries(ed.cel).map(([k, x]) => { const [p, f] = k.split('|'); return { programa_id:p, formato_id:f, preco:x.preco, desconto_max:x.desconto_max }; });
    const saiu = S.db.precos.filter(x => x.tabela_id === ed.id && !ed.cel[chave(x.programa_id, x.formato_id)]).map(x => x.id);
    await S.q(S.sb.rpc('salvar_itens_tabela', { p_tabela:ed.id, p_programas:ed.progs, p_formatos:ed.forms }));
    await S.q(S.sb.rpc('salvar_tabela', { p_tabela:ed.id, p_nome:ed.nome, p_inicio:ed.inicio || null, p_precos:lista_ }));
    if (ed.tipo === 'digital') await S.q(S.sb.rpc('salvar_pacotes_tabela', { p_tabela:ed.id, p_pacotes:ed.pacotes.filter(pk => ed.progs.includes(pk.canal_id)) }));
    if (saiu.length) await S.q(S.sb.from('precos').delete().in('id', saiu));
    await S.recarregarTabelas();
    const mao = ed.mao; abrir(tab(ed.id)); ed.mao = mao;
  };
  const primeiroDoMes = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const nomeSugerido = tt => { const ano = new Date().getFullYear() + 1, n = `${tt === 'digital' ? 'Digital' : 'Tabela'} ${ano}`; return (S.db.tabelas || []).some(t => t.nome === n) ? (tt === 'digital' ? 'Digital nova' : 'Tabela nova') : n; };
  const atualizaPublicar = () => { const f = document.querySelector('#dlg form'); if (!f || !f.elements.tp_inicio) return; const d = f.elements.tp_inicio.value;
    const ant = d ? (() => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - 1); return dfmt(x.toISOString().slice(0, 10)); })() : '…';
    f.querySelectorAll('[data-pub-ate]').forEach(e => { e.textContent = ant; }); f.querySelectorAll('[data-pub-dia]').forEach(e => { e.textContent = d ? dfmt(d) : '…'; });
    const ok = f.querySelector('button[value="ok"]'); if (ok) ok.textContent = d ? `Publicar para ${dfmt(d)}` : 'Publicar'; };
  document.addEventListener('input', e => { if (e.target.name === 'tp_inicio') atualizaPublicar(); });

  // Adicionar à tabela aberta programas (ou formatos) do cadastro da rádio, ou cadastrar um novo na hora
  const adicionarDlg = tipo => {
    if (!ed || !emEdicao()) return;
    const prog = tipo === 'programa', d = ed.tipo === 'digital', ja = prog ? ed.progs : ed.forms, fora = catalogo(ed.tipo, tipo).filter(p => !ja.includes(p.id));
    const nome = d ? (prog ? ['canal', 'canais', 'cadastro digital'] : ['entrega', 'entregas', 'cadastro digital']) : (prog ? ['programa', 'programas', 'cadastro da rádio'] : ['formato', 'formatos', 'cadastro da rádio']);
    const item = p => `<label class="tp-pick"><input type="checkbox" name="ids" value="${p.id}"><span><b>${esc(p.nome)}</b><small class="muted">${d ? esc(p.detalhe || '') : prog ? esc((p.detalhe || '').split('\n')[0]) || ABA[secaoDe(p)] : unico(p) ? 'preço único' : 'por duração'}${p.ativo ? '' : ' · inativo'}</small></span></label>`;
    const grupos = prog && !d ? SECOES.map(([k, titulo]) => { const l = fora.filter(p => secaoDe(p) === k); return l.length ? `<div class="tp-pick-g"><small class="muted">${esc(titulo)}</small>${l.map(item).join('')}</div>` : ''; }).join('') : fora.map(item).join('');
    S.dialog(`<h2>Adicionar ${nome[0]}</h2>
      ${fora.length ? `<p class="muted small" style="margin-top:-6px">Do ${nome[2]}, ${d ? (prog ? 'os canais' : 'as entregas') : 'os ' + nome[1]} que ainda não ${d && !prog ? 'estão' : 'estão'} nesta tabela:</p><div class="tp-picks">${grupos}</div>`
        : `<p class="muted">${fora.length === 0 && !catalogo(ed.tipo, tipo).length ? `Ainda não há ${nome[1]} no ${nome[2]}.` : `Todos já estão nesta tabela.`}</p>`}
      <div class="row mid" style="flex-wrap:wrap;margin-top:6px"><button type="button" class="btn sm tracej" data-tp-novo="1">${S.svg('mais')}Cadastrar ${nome[0]} ${d && !prog ? 'nova' : 'novo'}</button><span class="grow"></span>
        <button class="btn" value="cancel" formnovalidate>Cancelar</button>${fora.length ? '<button class="btn pri" value="ok">Adicionar</button>' : ''}</div>`,
      () => { const ids = [...document.querySelectorAll('#dlg [name="ids"]:checked')].map(i => i.value);
        if (!ids.length) throw new Error(`Marque ao menos ${d && !prog ? 'uma' : 'um'} ${nome[0]}.`);
        ids.forEach(id => { if (!ja.includes(id)) ja.push(id); }); sujar(); S.render(); });
    const dl = document.getElementById('dlg');
    dl.querySelector('[data-tp-novo]').addEventListener('click', () => { delete dl.dataset.sujo; dl.close('cancel'); setTimeout(() => d ? (prog ? formCanal({}, true) : formEntrega({}, true)) : formProduto(tipo, {}, 'programa', true), 50); });
  };

  // ---------- PDF ----------
  // Tabela digital: entregas × canais e os pacotes
  const imprimirDig = (t, vis) => {
    const v = S.veh(), ents = formsDe(vis).filter(f => f.ativo), canais = progsDe(vis).filter(c => c.ativo), s = sit(t);
    const quando = s === 'vigente' ? `Vigente desde ${dfmt(t.inicio)}` : s === 'agendada' ? `Válida a partir de ${dfmt(t.inicio)}` : s === 'encerrada' ? `Válida de ${dfmt(t.inicio)} a ${fimDe(t) ? dfmt(fimDe(t)) : '—'}` : 'Em preparação · ainda não vale';
    const pks = (vis.pacotes || []).map(pk => { const c = prod(pk.canal_id); return `<tr><td><b>${esc(pk.nome)}</b></td><td>${esc([c.nome, c.detalhe].filter(Boolean).join(' '))}</td><td>${(pk.itens || []).map(it => `${parseInt(it.qtd)} ${esc((prod(it.entrega_id).nome || it.nome || '').trim())}`).join(', ')}</td><td style="text-align:right">${brl(pk.preco)}</td></tr>`; }).join('');
    document.getElementById('print').innerHTML = `<div class="cab">${v.logo ? `<img src="${v.logo}" alt="">` : ''}<div><h1 style="border-left:6px solid ${v.cor || S.COR_PADRAO};padding-left:8px">${esc(v.nome)} · ${esc(t.nome)}</h1><div>Digital · ${quando}</div></div></div>
      <table><thead><tr><th>Entrega</th>${canais.map(c => `<th style="text-align:right">${esc(c.nome)}${c.detalhe ? ' ' + esc(c.detalhe) : ''}</th>`).join('')}</tr></thead>
      <tbody>${ents.map(f => `<tr><td><b>${esc(f.nome)}</b>${f.detalhe ? ` · ${esc(f.detalhe)}` : ''}</td>${canais.map(c => { const x = vis.cel[chave(c.id, f.id)]; return `<td style="text-align:right">${x ? brl(x.preco) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
      ${pks ? `<h2 style="margin:18px 0 6px;font-size:15px">Pacotes</h2><table><thead><tr><th>Pacote</th><th>Canal</th><th>Entregas</th><th style="text-align:right">Preço</th></tr></thead><tbody>${pks}</tbody></table>` : ''}
      <p>Valores por publicação; "—" = não oferece. A produção do conteúdo está incluída; as datas de publicação são combinadas com a rádio. ${esc([v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, v.telefone, v.financeiro_email || v.email].filter(Boolean).join(' · '))}</p>`;
    setTimeout(() => window.print(), 60);
  };
  const imprimir = t => {
    const v = S.veh(), vis = ed && ed.id === t.id ? visaoEditor() : visaoDe(t);
    if (vis.tipo === 'digital') return imprimirDig(t, vis);
    const forms = formsDe(vis).filter(f => f.ativo), progs = progsDe(vis).filter(p => p.ativo), n = forms.length + 2, cel = ed && ed.id === t.id ? ed.cel : precosDe(t.id), desc = descontoPadrao(cel), s = sit(t);
    const linha = p => `<tr><td><b>${esc(p.nome)}</b></td><td>${horario(p)}</td>${forms.map(f => { const x = cel[chave(p.id, f.id)]; return `<td style="text-align:right">${x ? brl(x.preco) : '—'}</td>`; }).join('')}</tr>`;
    const quando = s === 'vigente' ? `Vigente desde ${dfmt(t.inicio)}` : s === 'agendada' ? `Válida a partir de ${dfmt(t.inicio)}` : s === 'encerrada' ? `Válida de ${dfmt(t.inicio)} a ${fimDe(t) ? dfmt(fimDe(t)) : '—'}` : 'Em preparação · ainda não vale';
    document.getElementById('print').innerHTML = `<div class="cab">${v.logo ? `<img src="${v.logo}" alt="">` : ''}<div><h1 style="border-left:6px solid ${v.cor || S.COR_PADRAO};padding-left:8px">${esc(v.nome)} · ${esc(t.nome)}</h1><div>${quando}${desc !== null ? ` · desconto máximo ${desc}%` : ''}</div></div></div>
      <table><thead><tr><th>Onde vai ao ar</th><th>Dias e horário</th>${forms.map(f => `<th style="text-align:right">${esc(f.nome)}</th>`).join('')}</tr></thead>
      <tbody>${SECOES.map(([k, ti]) => { const l = progs.filter(p => secaoDe(p) === k); return l.length ? `<tr><th colspan="${n}" style="text-align:left">${esc(ti)}</th></tr>${l.map(linha).join('')}` : ''; }).join('')}</tbody></table>
      <p>Valores por inserção; "—" = não é vendido. ${esc([v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, v.telefone, v.financeiro_email || v.email].filter(Boolean).join(' · '))}</p>`;
    setTimeout(() => window.print(), 60);
  };

  // ---------- cadastro da rádio: programas, formatos, canais e sugestões ----------
  const mover = async (id, dir) => {
    const it = prod(id), l = lista(it.tipo).filter(x => dig(x) === dig(it)), i = l.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    await Promise.all(l.map((x, k) => x.ordem === k ? null : S.salvar('produtos', { id:x.id, ordem:k })));
  };
  // naTabela: cadastrado de dentro do editor, já entra na tabela aberta
  const formProduto = (tipo, p, secao, naTabela) => {
    const prog = tipo === 'programa', comDesconto = prog && p.id && ed && emEdicao() && ed.progs.includes(p.id), dp = comDesconto ? descontoDo(ed.cel, p) : undefined;
    const sec = p.id ? secaoDe(p) : secao || 'programa';
    const novoTitulo = prog ? `Novo ${SECOES.find(x => x[0] === sec)[2].toLowerCase()}` : 'Novo formato';
    S.form(p.id ? esc(p.nome) : novoTitulo, prog ? [
      { k:'nome', label:sec === 'rotativo' ? 'Nome' : sec === 'quadro' ? 'Quadro' : 'Programa', req:true, ph:sec === 'rotativo' ? 'Ex.: Spot indeterminado' : sec === 'quadro' ? 'Ex.: Comunicação Política' : 'Ex.: Jornal da Manhã' },
      { k:'secao', label:'Seção da tabela', type:'select', options:SECOES.map(([k, , n]) => [k, n]) },
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
          const row = Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on' }, prog ? { secao:v.secao } : { cobranca:v.cobranca, secao:'programa' }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo, ordem:radio(tipo).length });
          const r = await S.salvar('produtos', row);
          if (prog) secCel = v.secao;
          if (naTabela && r && r.id && ed) { (prog ? ed.progs : ed.forms).push(r.id); ed.sujo = true; }
        }, naTabela ? (prog ? 'Programa cadastrado e adicionado à tabela' : 'Formato cadastrado e adicionado à tabela') : prog ? 'Salvo' : 'Formato salvo');
      }, 'Salvar', { editar:true });
  };
  // Canal digital: rede + perfil (tipo programa, secao digital)
  const formCanal = (c, naTabela) => S.form(c.id ? esc(c.nome) : 'Novo canal', [
    { k:'nome', label:'Rede social', req:true, ph:'Ex.: Instagram' },
    { k:'detalhe', label:'Perfil', ph:'Ex.: @suaradio' },
    { k:'ativo', label:'Aparece nas novas propostas e PIs', type:'checkbox' }], Object.assign({ ativo:true }, c),
    v => S.run(async () => { const r = await S.salvar('produtos', Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on', secao:'digital' },
      c.id ? { id:c.id } : { veiculo_id:S.ui.vehicleId, tipo:'programa', ordem:digitais('programa').length }));
      if (naTabela && r && r.id && ed) { ed.progs.push(r.id); ed.sujo = true; } }, naTabela ? 'Canal cadastrado e adicionado à tabela' : 'Canal salvo'), 'Salvar', { editar:true });
  // Entrega digital (Reels, Stories, Feed, Live…): tipo formato, secao digital
  const formEntrega = (f, naTabela) => S.form(f.id ? esc(f.nome) : 'Nova entrega', [
    { k:'nome', label:'Entrega', req:true, ph:'Ex.: Reels, Stories, Feed, Live' },
    { k:'detalhe', label:'Observação (opcional)', ph:'Ex.: até 60 segundos · 3 telas' },
    { k:'ativo', label:'Aparece nas novas propostas e PIs', type:'checkbox' }], Object.assign({ ativo:true }, f),
    v => S.run(async () => { const r = await S.salvar('produtos', Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on', secao:'digital', cobranca:'unico' },
      f.id ? { id:f.id } : { veiculo_id:S.ui.vehicleId, tipo:'formato', ordem:digitais('formato').length }));
      if (naTabela && r && r.id && ed) { ed.forms.push(r.id); ed.sujo = true; } }, naTabela ? 'Entrega cadastrada e adicionada à tabela' : 'Entrega salva'), 'Salvar', { editar:true });
  // Pacote da tabela digital: nome, canal, quantidade de cada entrega e preço fechado (fica na tela até Salvar)
  const pacoteDlg = i => {
    const v = visaoEditor(), canais = progsDe(v), ents = formsDe(v), pk = i === '' || i === undefined ? null : ed.pacotes[+i];
    if (!canais.length || !ents.length) return S.toast('Adicione antes as entregas e o canal desta tabela.');
    const a = pk || { nome:'', canal_id:canais[0].id, itens:[], preco:0 }, q = id => ((a.itens || []).find(x => x.entrega_id === id) || {}).qtd || '';
    S.dialog(`<h2>${pk ? 'Editar pacote' : 'Novo pacote'}</h2>
      <div class="g2"><label class="f">Nome do pacote<input name="nome" required value="${esc(a.nome)}" placeholder="Ex.: Pacote Presença"></label>
        <label class="f">Canal<select name="canal">${canais.map(c => `<option value="${c.id}"${c.id === a.canal_id ? ' selected' : ''}>${esc(c.nome)}${c.detalhe ? ' · ' + esc(c.detalhe) : ''}</option>`).join('')}</select></label></div>
      <fieldset class="f tp-opts"><legend>Composição</legend><div class="tp-pk-ents">${ents.map(f => `<label class="tp-pk-ent"><span>${esc(f.nome)}<small class="muted" data-pk-preco="${f.id}"></small></span><input name="q_${f.id}" data-mask="int" inputmode="numeric" value="${q(f.id)}" placeholder="0" aria-label="Quantidade de ${esc(f.nome)}"></label>`).join('')}</div></fieldset>
      <div class="g2"><label class="f">Preço do pacote (R$)<input name="preco" data-mask="dec" inputmode="decimal" required value="${a.preco ? S.nfmt(a.preco) : ''}" placeholder="0,00"></label><div class="f"><small class="muted" id="tpPkTab" style="margin-top:28px"></small></div></div>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${pk ? 'Salvar pacote' : 'Adicionar pacote'}</button></div>`,
      x => { const itens = ents.map(f => ({ entrega_id:f.id, nome:f.nome.trim(), qtd:parseInt(x['q_' + f.id]) || 0 })).filter(it => it.qtd > 0);
        if (!itens.length) throw new Error('Coloque a quantidade de ao menos uma entrega.');
        const novo = { id:(pk && pk.id) || S.uid(), nome:x.nome.trim(), canal_id:x.canal, itens, preco:Math.round(S.num(x.preco) * 100) / 100 };
        if (pk) ed.pacotes[+i] = novo; else ed.pacotes.push(novo); sujar(); S.render(); });
    const f = document.querySelector('#dlg form');
    const conta = () => { const c = f.canal.value; let t = 0;
      ents.forEach(e => { const x = ed.cel[chave(c, e.id)], el = f.querySelector(`[data-pk-preco="${e.id}"]`); if (el) el.textContent = x ? ` · ${brl(x.preco)}` : ' · sem preço'; t += (parseInt(f['q_' + e.id].value) || 0) * (x ? x.preco : 0); });
      const p = S.num(f.preco.value); document.getElementById('tpPkTab').textContent = `Valor de tabela: ${brl(t)}${t > 0 && p > 0 && p < t ? ` · desconto de ${String(Math.round((1 - p / t) * 1000) / 10).replace('.', ',')}%` : ''}`; };
    f.addEventListener('input', conta); f.addEventListener('change', conta); conta();
  };
  const tirarDaTabela = (tipo, id) => { if (!ed) return; const lst = tipo === 'programa' ? ed.progs : ed.forms, i = lst.indexOf(id); if (i < 0) return;
    lst.splice(i, 1); Object.keys(ed.cel).forEach(k => { if (k.split('|').includes(id)) { delete ed.cel[k]; ed.mao.delete(k); } }); sujar(); S.render(); };

  Object.assign(S.actions, {
    // Lista
    // Nova tabela: primeiro o tipo (rádio ou digital); "Começar com" só mostra tabelas do mesmo tipo
    tpNova: d => {
      const tt0 = d.base && tab(d.base) ? tipoDe(tab(d.base)) : d.tipo === 'digital' ? 'digital' : 'radio';
      const opc = (val, titulo, sub, on, rec) => `<label class="tp-opt"><input type="radio" name="tp_base" value="${val}"${on ? ' checked' : ''}><span><span class="tp-opt-t"><b>${titulo}</b>${rec ? S.tag('recomendado', 'green') : ''}</span><small class="muted">${sub}</small></span></label>`;
      const bases = tt => { const ts = tabelas(tt), vig = vigenteDe(tt), base = d.base && tab(d.base) && tipoDe(tab(d.base)) === tt ? d.base : vig ? vig.id : (ts[0] || {}).id || '';
        return ts.map(t => opc(t.id, `Cópia da ${esc(t.nome)}`, `${contagem(t)} e ${Object.keys(precosDe(t.id)).length} preços (${S.SITUACAO_TABELA[sit(t)][0].toLowerCase()}). Você reajusta o que precisar.`, t.id === base, vig && t.id === vig.id)).join('')
          + opc('', 'Do zero', tt === 'digital' ? 'A tabela nasce vazia: você adiciona só as entregas e os canais que ela vai ter.' : 'A tabela nasce vazia: você adiciona só os programas e formatos que ela vai ter.', !base, false); };
      const tipo = (val, titulo, sub) => `<label class="tp-opt"><input type="radio" name="tp_tipo" value="${val}"${val === tt0 ? ' checked' : ''}><span><b>${titulo}</b><small class="muted">${sub}</small></span></label>`;
      S.dialog(`<h2>Nova tabela de preços</h2>
        <fieldset class="f tp-opts tp-tipos"><legend>Tabela de</legend>${tipo('radio', 'Rádio', 'Programas × formatos (spot, testemunhal)')}${tipo('digital', 'Digital', 'Entregas × canais (Reels, Stories, Feed, Live) e pacotes')}</fieldset>
        <div class="g2"><label class="f">Nome<input name="tp_nome" required value="${esc(nomeSugerido(tt0))}" placeholder="Ex.: Tabela 2027"></label>
          <label class="f">Começa a valer em (previsto)<input type="date" name="tp_prev" value="${primeiroDoMes()}"></label></div>
        <fieldset class="f tp-opts"><legend>Começar com</legend><div id="tpBases">${bases(tt0)}</div></fieldset>
        <p class="muted small" style="margin:0">Ela só passa a valer quando o diretor publicar, na data de início.</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Nova tabela</button></div>`,
        v => S.run(async () => {
          const id = await S.q(S.sb.rpc('nova_tabela', { p_veiculo:S.ui.vehicleId, p_nome:v.tp_nome, p_base:v.tp_base || null, p_inicio:v.tp_prev || null, p_tipo:v.tp_tipo === 'digital' ? 'digital' : 'radio' }));
          await S.recarregarTabelas(); ed = null; pedirEdit = id; location.hash = '/produtos/' + id;
        }, 'Tabela criada'));
      // Trocar o tipo troca as tabelas de origem (e o nome sugerido, se ainda não foi mexido)
      const f = document.querySelector('#dlg form'); let sug = nomeSugerido(tt0);
      f.addEventListener('change', e => { if (e.target.name !== 'tp_tipo') return; const tt = e.target.value;
        document.getElementById('tpBases').innerHTML = bases(tt); if (f.tp_nome.value === sug) { sug = nomeSugerido(tt); f.tp_nome.value = sug; } });
    },
    tpMenuTabela: (d, botao) => { const t = tab(d.id), s = sit(t), dentro = !!d.dentro, podeEx = s === 'rascunho' ? pode() : diretor();
      S.menu(botao, [...(dentro ? [] : [{ label:'Abrir', icon:'abrir', act:'tpAbrir', data:{ id:t.id } }]),
        ...(!dentro && podeEditar(t) ? [{ label:'Editar', icon:'editar', act:'tpEditarTabela', data:{ id:t.id } }] : []),
        ...(pode() ? [{ label:'Usar como base de uma nova', icon:'copia', act:'tpNova', data:{ base:t.id } }] : []),
        ...(dentro ? [] : [{ label:'Baixar PDF', icon:'baixar', act:'tpPdf', data:{ id:t.id } }]),
        ...(s === 'agendada' && diretor() ? ['-', { label:'Voltar para preparação', icon:'voltar', act:'tpDespublicar', data:{ id:t.id } }] : []),
        ...(podeEx ? ['-', { label:'Excluir tabela', icon:'lixo', act:'tpExcluirTabela', data:{ id:t.id }, perigo:true }] : [])]); },
    tpAbrir: d => { location.hash = '/produtos/' + d.id; },
    tpEditarTabela: d => { if (ed && ed.id === d.id && S.route().id === d.id) { ed.edit = true; return S.render(); }
      pedirEdit = d.id; if (ed && ed.id === d.id && !ed.sujo) ed = null; location.hash = '/produtos/' + d.id; },
    tpExcluirTabela: async d => { const t = tab(d.id), s = sit(t), tt = tipoDe(t), volta = tt === 'digital' ? '/produtos/digital' : '/produtos';
      const fim = () => S.run(async () => { await S.q(S.sb.rpc('excluir_tabela', { p_tabela:t.id })); if (ed && ed.id === t.id) ed = null;
        await S.recarregarTabelas(); if (S.route().id === t.id) location.hash = volta; }, 'Tabela excluída');
      if (s === 'vigente') {
        const ant = tabelas(tt).filter(x => x.id !== t.id && x.situacao === 'publicada' && x.inicio && x.inicio <= S.today()).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
        S.dialog(`<h2>Excluir a tabela vigente?</h2>
          <p>"${esc(t.nome)}" é a que se usa hoje. Ao excluir, ${ant ? `<b>a ${esc(ant.nome)} volta a valer</b> para as propostas e PIs novos` : `<b>fica sem tabela ${NOME[tt]} vigente</b> até você publicar outra`}. Propostas e PIs já feitos não mudam: os preços ficam guardados neles. Não dá para desfazer.</p>
          <label class="f">Para confirmar, digite o nome da tabela<input name="tp_conf" autocomplete="off" required placeholder="${esc(t.nome)}"></label>
          <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn danger" value="ok">Excluir tabela</button></div>`,
          () => fim());
        const campo = document.querySelector('#dlg [name="tp_conf"]'), confere = () => campo.setCustomValidity(campo.value.trim().toLowerCase() === String(t.nome).trim().toLowerCase() ? '' : `Digite o nome da tabela: ${t.nome}`);
        confere(); campo.addEventListener('input', confere); return; }
      const txt = s === 'rascunho' ? `Excluir a tabela "${t.nome}"? Ela ainda está em preparação.`
        : s === 'agendada' ? `Excluir a tabela "${t.nome}"? Ela está agendada para ${dfmt(t.inicio)} e ainda não começou a valer.`
        : `Excluir a tabela "${t.nome}"? Ela já foi encerrada e sai do histórico. Propostas e PIs já feitos não mudam.`;
      if (!await S.confirmar(`${txt} Os preços dela saem junto. Não dá para desfazer.`, { ok:'Excluir tabela', perigo:true })) return;
      fim(); },
    tpDespublicar: async d => { const t = tab(d.id);
      if (!await S.confirmar(`Voltar a "${t.nome}" para preparação? Ela deixa de estar agendada para ${dfmt(t.inicio)} e pode ser mudada de novo antes de publicar.`, { ok:'Voltar para preparação' })) return;
      S.run(async () => { await S.q(S.sb.rpc('despublicar_tabela', { p_tabela:t.id })); await S.recarregarTabelas(); if (ed && ed.id === t.id) abrir(tab(t.id)); }, 'Voltou para preparação'); },
    tpPdf: d => imprimir(tab(d.id) || tab(ed && ed.id)),
    // Editor
    tpEditar: d => { if (!emEdicao()) return;
      if (S.celular) { const k = chave(d.p, d.f), x = ed.cel[k];
        return S.form(`${esc(prod(d.p).nome)} · ${esc(prod(d.f).nome)}`, [{ k:'preco', label:`Preço por inserção (R$)${ed.base[k] !== undefined ? ` · antes ${S.nfmt(ed.base[k])}` : ''}`, mask:'dec', ph:'Vazio = não é vendido' }], { preco:x ? S.nfmt(x.preco) : '' },
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
      let n = 0; const v = visaoEditor();
      progsDe(v).forEach(p => formsDe(v).forEach(f => {
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
      if (!ed.progs.length || !ed.forms.length || !Object.keys(ed.cel).length) return S.toast('Antes de publicar, adicione programas e formatos e defina ao menos um preço.');
      const vig = S.tabelaVigente(), c = ed.baseNome ? comparar(ed.cel, ed.base, ed.mao) : null, d0 = ed.inicio && ed.inicio >= S.today() ? ed.inicio : primeiroDoMes();
      S.dialog(`<h2>Publicar ${esc(ed.nome)}</h2>
        <label class="f">Começa a valer em<input type="date" name="tp_inicio" required min="${S.today()}" value="${d0}"></label>
        <div class="tp-pub">${vig ? `<div><i class="tp-pt" style="--tone:var(--green)"></i><span><b>Até <span data-pub-ate></span></b> continua valendo a ${esc(vig.nome)}, como hoje.</span></div>` : ''}
          <div><i class="tp-pt" style="--tone:var(--accent)"></i><span><b>A partir de <span data-pub-dia></span></b> as propostas e os PIs novos já abrem com os preços da ${esc(ed.nome)}${c && c.media !== null ? ` (reajuste médio de ${fmtPct(c.media)})` : ''}.</span></div>
          <div><i class="tp-pt" style="--tone:var(--gray)"></i><span><b>PIs já feitos não mudam.</b> Cada PI guarda o preço do dia em que foi criado.</span></div></div>
        <p class="muted small">Até a data de início você ainda pode abrir a tabela e clicar em Editar para mudar preços ou a data.${ed.sujo ? ' As alterações que ainda não foram salvas são salvas junto.' : ''}</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn pri" value="ok">Publicar</button></div>`,
        v => S.run(async () => { if (ed.sujo) await gravar();
          await S.q(S.sb.rpc('publicar_tabela', { p_tabela:ed.id, p_inicio:v.tp_inicio })); await S.recarregarTabelas(); abrir(tab(ed.id));
        }, 'Tabela publicada'));
      atualizaPublicar(); },
    tpAddProg: () => adicionarDlg('programa'),
    tpAddForm: () => adicionarDlg('formato'),
    tpSecao: d => { secCel = d.secao; S.render(); },
    // Linha e coluna dentro da tabela aberta
    tpMenuProg: (d, botao) => { const p = prod(d.id);
      S.menu(botao, [{ label:dig(p) ? 'Editar canal' : 'Editar nome, seção, horário e desconto', icon:'editar', act:'tpEditarProd', data:{ id:p.id } }, '-', { label:'Tirar desta tabela', icon:'lixo', act:'tpTirar', data:{ id:p.id, tipo:'programa' }, perigo:true }]); },
    tpMenuForm: (d, botao) => { const f = prod(d.id);
      S.menu(botao, [{ label:dig(f) ? 'Editar entrega' : 'Editar nome e cobrança', icon:'editar', act:'tpEditarProd', data:{ id:f.id } }, '-', { label:'Tirar desta tabela', icon:'lixo', act:'tpTirar', data:{ id:f.id, tipo:'formato' }, perigo:true }]); },
    tpTirar: async d => { const p = prod(d.id), n = Object.keys(ed.cel).filter(k => k.split('|').includes(p.id)).length;
      if (n && !await S.confirmar(`Tirar "${p.nome}" desta tabela? ${n === 1 ? 'O preço dele sai' : `Os ${n} preços dele saem`} desta tabela quando você salvar. O cadastro continua.`, { ok:'Tirar da tabela', perigo:true })) return;
      tirarDaTabela(d.tipo, p.id); },
    // Cadastro da rádio (aba Programas e formatos)
    tpProduto: d => formProduto(d.tipo, {}, d.secao),
    tpEditarProd: d => { const p = prod(d.id); if (dig(p)) return p.tipo === 'programa' ? formCanal(p) : formEntrega(p); formProduto(p.tipo, p); },
    tpMenuProgCat: (d, botao) => { const p = prod(d.id);
      S.menu(botao, [{ label:'Editar nome, seção e horário', icon:'editar', act:'tpEditarProd', data:{ id:p.id } }, { label:'Subir', icon:'seta', act:'tpMover', data:{ id:p.id, dir:-1 } }, { label:'Descer', icon:'baixo', act:'tpMover', data:{ id:p.id, dir:1 } },
        { label:p.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:p.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:p.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:p.id }, perigo:true }]); },
    tpMenuFormCat: (d, botao) => { const f = prod(d.id);
      S.menu(botao, [{ label:'Editar nome e cobrança', icon:'editar', act:'tpEditarProd', data:{ id:f.id } }, { label:'Mover para cima', icon:'seta', act:'tpMover', data:{ id:f.id, dir:-1 } }, { label:'Mover para baixo', icon:'baixo', act:'tpMover', data:{ id:f.id, dir:1 } },
        { label:f.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:f.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:f.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:f.id }, perigo:true }]); },
    tpMover: d => S.run(() => mover(d.id, +d.dir)),
    tpAtivo: d => { const p = prod(d.id); S.run(() => S.salvar('produtos', { id:p.id, ativo:!p.ativo }), p.ativo ? (dig(p) ? (p.tipo === 'formato' ? 'Entrega inativa' : 'Canal inativo') : 'Não aparece mais nos novos PIs') : (dig(p) ? (p.tipo === 'formato' ? 'Entrega ativa' : 'Canal ativo') : 'Voltou para os novos PIs')); },
    tpExcluir: async d => { const p = prod(d.id), n = S.db.precos.filter(x => x.programa_id === p.id || x.formato_id === p.id).length;
      const txt = dig(p) ? `Excluir ${p.tipo === 'formato' ? 'a entrega' : 'o canal'} "${p.nome}"${n ? ` e os ${n} preço(s) dele nas tabelas digitais` : ''}? As ações já vendidas não mudam.`
        : `Excluir "${p.nome}" do cadastro da rádio${n ? ` e os ${n} preço(s) dele em todas as tabelas` : ''}? Os PIs já feitos não mudam.\n\nSe só quer que ele pare de aparecer nos PIs novos, use "Tirar dos novos PIs".`;
      if (!await S.confirmar(txt, { ok:'Excluir', perigo:true })) return;
      S.run(async () => { await S.excluir('produtos', p.id); S.db.precos = S.db.precos.filter(x => x.programa_id !== p.id && x.formato_id !== p.id);
        if (ed) { Object.keys(ed.cel).forEach(k => { if (k.split('|').includes(p.id)) delete ed.cel[k]; }); ed.progs = ed.progs.filter(x => x !== p.id); ed.forms = ed.forms.filter(x => x !== p.id); } }, 'Excluído'); },
    // Digital
    tpCanal: () => formCanal({}),
    tpMenuCanal: (d, botao) => { const c = prod(d.id);
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'tpEditarProd', data:{ id:c.id } }, { label:c.ativo ? 'Deixar inativo' : 'Deixar ativo', icon:c.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:c.id } }, '-', { label:'Excluir canal', icon:'lixo', act:'tpExcluir', data:{ id:c.id }, perigo:true }]); },
    tpEntrega: () => formEntrega({}),
    tpMenuEntrega: (d, botao) => { const f = prod(d.id);
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'tpEditarProd', data:{ id:f.id } }, { label:'Mover para cima', icon:'seta', act:'tpMover', data:{ id:f.id, dir:-1 } }, { label:'Mover para baixo', icon:'baixo', act:'tpMover', data:{ id:f.id, dir:1 } },
        { label:f.ativo ? 'Deixar inativa' : 'Deixar ativa', icon:f.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:f.id } }, '-', { label:'Excluir entrega', icon:'lixo', act:'tpExcluir', data:{ id:f.id }, perigo:true }]); },
    tpPacote: d => { if (!ed || !emEdicao()) return; pacoteDlg(d.i); },
    tpTirarPacote: async d => { const pk = ed.pacotes[+d.i]; if (!await S.confirmar(`Tirar o pacote "${pk.nome}" desta tabela?`, { ok:'Tirar pacote', perigo:true })) return; ed.pacotes.splice(+d.i, 1); sujar(); S.render(); },
  });

  // Campo de preço: Enter confirma, Esc desiste, sair do campo confirma
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'tpEd') return;
    if (e.key === 'Enter') { e.preventDefault(); confirmarCelula(); }
    if (e.key === 'Escape') { editando = null; S.render(); }
  });
  document.addEventListener('focusout', e => { if (e.target.id === 'tpEd' && !(e.relatedTarget && e.relatedTarget.dataset && e.relatedTarget.dataset.act === 'tpCelOk')) setTimeout(() => { if (document.getElementById('tpEd')) confirmarCelula(); }, 0); });
  // Nome e data prevista da tabela em preparação: ficam pendentes até Salvar (sem redesenhar a tela)
  document.addEventListener('input', e => { if (!ed) return; if (e.target.dataset && e.target.dataset.tpNome) { ed.nome = e.target.value; sujar(); } if (e.target.dataset && e.target.dataset.tpInicio) { ed.inicio = e.target.value; sujar(); } });

  // Sair da tabela com alterações não salvas pergunta antes
  let voltando = false, hashAnterior = location.hash;
  window.addEventListener('hashchange', () => {
    if (voltando) { voltando = false; hashAnterior = location.hash; return; }
    const sai = ed && ed.sujo && location.hash !== '#/produtos/' + ed.id;
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

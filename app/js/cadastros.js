// SONVI · tabela de preços do veículo, em grade: programas, quadros e rotativo nas linhas (em seções), formatos nas colunas, o preço no cruzamento.
// Formato por duração (spot 15", 30"...) ou de preço único (testemunhal, patrocínio): os de preço único ficam numa coluna à parte.
// Cada preço tem uma data de vigência. Uma "tabela" é o conjunto de preços que começa numa data; o reajuste cria a próxima.
// Os PIs guardam o preço da época em que foram feitos, então mudar a tabela não mexe em PIs antigos.
(() => {
  const { esc, brl, dfmt } = S;
  let versao = null;          // data da tabela aberta; null = a que vale hoje
  let editando = null;        // { p, f } = célula com o campo de preço aberto

  const lista = tipo => S.db.produtos.filter(p => p.tipo === tipo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  const prod = id => S.db.produtos.find(p => p.id === id) || {};
  const pode = () => S.pode('diretor', 'gerente');
  // Datas em que alguma tabela começou, da mais antiga para a mais nova
  const datas = () => [...new Set(S.db.precos.map(p => p.vigencia_inicio))].sort();
  const vigente = () => datas().filter(d => d <= S.today()).pop() || null;
  const aberta = () => versao && datas().includes(versao) ? versao : vigente();
  const modo = () => { const d = aberta(); return !d || d === vigente() ? 'vigente' : d > S.today() ? 'futura' : 'anterior'; };
  // O preço que vale numa data para um programa × formato (a linha mais recente que já começou)
  const precoEm = (p, f, data) => S.db.precos.filter(x => x.programa_id === p && x.formato_id === f && (!data || x.vigencia_inicio <= data)).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0] || null;
  const dataRef = () => modo() === 'vigente' ? S.today() : aberta();
  // Segundos do formato, lidos do nome ou do detalhe (Spot 30", 30 segundos, 30s)
  const segundos = f => { const m = /(\d+)\s*(?:"|''|”|s\b|seg)/i.exec(`${f.nome} ${f.detalhe}`); return m ? +m[1] : null; };
  const descontoPadrao = () => { const c = {}; lista('programa').forEach(p => lista('formato').forEach(f => { const x = precoEm(p.id, f.id, dataRef()); if (x) c[Number(x.desconto_max)] = (c[Number(x.desconto_max)] || 0) + 1; }));
    const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return k === undefined ? null : Number(k); };
  const descontoDo = p => { const xs = lista('formato').map(f => precoEm(p.id, f.id, dataRef())).filter(Boolean).map(x => Number(x.desconto_max)); return xs.length && xs.every(x => x === xs[0]) ? xs[0] : xs.length ? null : undefined; };

  // Avisa quando um formato mais longo custa menos que um mais curto no mesmo programa
  const avisos = p => {
    const fs = lista('formato').filter(f => f.cobranca !== 'unico').map(f => ({ f, s:segundos(f), x:precoEm(p.id, f.id, dataRef()) })).filter(o => o.s !== null && o.x);
    const out = {};
    fs.forEach(a => { const menor = fs.filter(b => b.s < a.s && Number(b.x.preco) > Number(a.x.preco)).sort((b, c) => c.s - b.s)[0]; if (menor) out[a.f.id] = `Mais barato que o ${menor.f.nome}`; });
    return out;
  };

  // Seções da tabela, como no mídia kit, e os dois jeitos de cobrar um formato
  const SECOES = [['programa', 'Programas · horário determinado', 'Programa'], ['quadro', 'Quadros', 'Quadro'], ['rotativo', 'Rotativo · horário indeterminado', 'Rotativo']];
  const secaoDe = p => SECOES.some(s => s[0] === p.secao) ? p.secao : 'programa';
  const unico = f => f.cobranca === 'unico';
  // Formatos por duração primeiro, depois os de preço único
  const colunas = () => { const fs = lista('formato'); return [...fs.filter(f => !unico(f)), ...fs.filter(unico)]; };
  const temPreco = p => lista('formato').some(f => precoEm(p.id, f.id, dataRef()));
  const horario = p => p.detalhe ? esc(p.detalhe).replace(/\n/g, '<br>') : 'Horário não informado';
  let secCel = 'programa';    // seção aberta no celular

  const celula = (p, f, av, primeiroUnico) => {
    const x = precoEm(p.id, f.id, dataRef()), so = modo() === 'anterior' || !pode(), proprio = x && (modo() !== 'futura' || x.vigencia_inicio === aberta());
    const cls = `tp-cel${unico(f) ? ' uni' : ''}${primeiroUnico ? ' uni1' : ''}`;
    if (editando && editando.p === p.id && editando.f === f.id) return `<span class="${cls}"><span class="tp-ed"><label for="tpEd">R$</label><input id="tpEd" data-mask="dec" inputmode="decimal" value="${x ? S.nfmt(Number(x.preco)) : ''}" placeholder="0,00" data-tp-p="${p.id}" data-tp-f="${f.id}" aria-label="Preço de ${esc(p.nome)} ${esc(f.nome)}"><button class="btn sm pri" data-act="tpSalvar" aria-label="Salvar preço">${S.svg('check')}</button></span></span>`;
    // Sem preço: "—" (não é vendido); quem edita vê "Definir preço" na linha vazia ou um "+" discreto
    if (!x) return `<span class="${cls}">${so ? '<span class="muted">—</span>' : temPreco(p) ? `<button class="tp-vazio leve" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}" aria-label="Definir preço de ${esc(p.nome)} ${esc(f.nome)}" title="Não é vendido. Clique para definir um preço.">—</button>` : `<button class="tp-vazio" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}">Definir preço</button>`}</span>`;
    const aviso = av[f.id];
    return `<span class="${cls}"><button class="tp-preco${aviso ? ' aviso' : ''}${proprio ? '' : ' herdado'}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${so ? ' disabled' : ''} title="${proprio ? `Vale desde ${dfmt(x.vigencia_inicio)} · desconto máx. ${Number(x.desconto_max)}%` : 'Sem reajuste nesta tabela: continua o preço anterior'}">${brl(x.preco)}</button>${aviso ? `<small class="aviso">${esc(aviso)}</small>` : ''}</span>`;
  };

  const tres = (act, id, rotulo) => pode() ? `<button class="btn tres" data-act="${act}" data-id="${id}" aria-label="Opções de ${esc(rotulo)}">${S.svg('mais3')}</button>` : '';
  const botoesNovo = cls => SECOES.map(([k, , n]) => `<button class="btn ${cls}" data-act="tpProduto" data-tipo="programa" data-secao="${k}">${S.svg('mais')}${n}</button>`).join('');

  // Celular: abas por seção; spots em quadradinhos, preço único numa faixa à parte
  const cartao = (p, desc) => {
    const av = avisos(p), dp = descontoDo(p), fs = lista('formato'), dur = fs.filter(f => !unico(f)), uni = fs.filter(unico), so = modo() === 'anterior' || !pode();
    const temDur = dur.some(f => precoEm(p.id, f.id, dataRef())) || !temPreco(p);
    const tile = f => { const x = precoEm(p.id, f.id, dataRef()), nome = segundos(f) ? `${segundos(f)}"` : f.nome;
      return `<button class="tp-mini${x ? '' : ' vazio'}${av[f.id] ? ' aviso' : ''}" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${so ? ' disabled' : ''} aria-label="${esc(f.nome)}: ${x ? brl(x.preco) : 'sem preço'}"><small>${esc(nome)}</small><b>${x ? (Number(x.preco) % 1 ? S.nfmt(Number(x.preco)) : Number(x.preco).toLocaleString('pt-BR')) : '—'}</b></button>`; };
    const comPreco = uni.filter(f => precoEm(p.id, f.id, dataRef())), semPreco = so ? [] : uni.filter(f => !precoEm(p.id, f.id, dataRef()));
    const faixaUni = f => `<button class="tp-unico" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}"${so ? ' disabled' : ''}><span>${esc(f.nome)}</span><b>${brl(precoEm(p.id, f.id, dataRef()).preco)}</b></button>`;
    const novos = semPreco.length ? `<div class="tp-unicos-novos">${semPreco.map(f => `<button class="tp-vazio" data-act="tpEditar" data-p="${p.id}" data-f="${f.id}" aria-label="Definir preço de ${esc(f.nome)}">+ ${esc(f.nome)}</button>`).join('')}</div>` : '';
    return `<div class="card tp-cartao${p.ativo ? '' : ' inativo'}"><div class="hd"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}${dp !== undefined && dp !== desc ? ` · desconto máx. ${dp === null ? 'varia' : dp + '%'}` : ''}</small>${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span>${tres('tpMenuProg', p.id, p.nome)}</div>
      ${temDur && dur.length ? `<div class="tp-minis">${dur.map(tile).join('')}</div>` : ''}${comPreco.map(faixaUni).join('')}${novos}</div>`;
  };

  S.views.cadastros = () => {
    const progs = lista('programa'), forms = colunas(), d = aberta(), m = modo(), desc = descontoPadrao(), ed = pode() && m !== 'anterior';
    const vers = datas(), vig = vigente();
    const seletor = vers.length > 1 ? `<label class="tp-versao"><span class="muted small">Tabela</span><select data-tp-versao="1" aria-label="Escolher tabela">${vers.slice().reverse().map(x => `<option value="${x}"${x === d ? ' selected' : ''}>${x === vig ? 'Vigente, desde ' : x > S.today() ? 'Próxima, a partir de ' : 'Anterior, de '}${dfmt(x)}</option>`).join('')}</select></label>` : '';
    const faixa = `<div class="card tp-faixa">${m === 'vigente' ? S.tag('Vigente', 'green') : m === 'futura' ? S.tag('Próxima', 'blue') : S.tag('Anterior', 'gray')}
      <b>${d ? (m === 'futura' ? `Começa a valer em ${dfmt(d)}` : m === 'anterior' ? `Valeu a partir de ${dfmt(d)}` : `Tabela válida desde ${dfmt(d)}`) : 'Nenhum preço cadastrado ainda'}</b>
      ${desc !== null ? `<span class="muted">Desconto máximo padrão: <b class="tp-ink">${desc}%</b></span>` : ''}<span class="grow"></span>${seletor}</div>`;
    const avisoModo = m === 'futura' ? '<div class="note info">Esta tabela ainda não vale. Preços em cinza continuam iguais aos de hoje; clique para mudar. Os PIs passam a usar estes preços a partir da data de início.</div>'
      : m === 'anterior' ? '<div class="note info">Tabela antiga, só para consulta. Para mudar preços, abra a vigente ou crie um reajuste.</div>' : '';
    const secoes = SECOES.map(([k, titulo]) => ({ k, titulo, itens:progs.filter(p => secaoDe(p) === k) })).filter(s => s.itens.length);

    let corpo;
    if (!progs.length && !forms.length) corpo = `<div class="card empty"><b>Monte a tabela de preços</b>Cadastre os formatos (ex.: Spot 30", cobrado por duração; Testemunhal, com preço único) e onde vão ao ar: programas, quadros e o rotativo. Os preços ficam no cruzamento.
      ${pode() ? `<div class="row mid" style="justify-content:center;margin-top:18px"><button class="btn" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button><button class="btn pri" data-act="tpProduto" data-tipo="programa" data-secao="programa">${S.svg('mais')}Programa</button></div>` : ''}</div>`;
    else if (S.celular) { const ab = secoes.some(s => s.k === secCel) ? secCel : (secoes[0] || {}).k;
      corpo = (secoes.length > 1 ? `<div class="seg tp-seg" role="tablist">${secoes.map(s => `<button role="tab" class="${s.k === ab ? 'on' : ''}" aria-selected="${s.k === ab}" data-act="tpSecao" data-secao="${s.k}">${esc(SECOES.find(x => x[0] === s.k)[2] + (s.k === 'rotativo' ? '' : 's'))}</button>`).join('')}</div>` : '')
        + (secoes.find(s => s.k === ab) || { itens:[] }).itens.map(p => cartao(p, desc)).join('')
        + (ed ? `<div class="tp-novos">${botoesNovo('tracej')}<button class="btn tracej" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button></div>` : ''); }
    else { const nDur = forms.filter(f => !unico(f)).length, nUni = forms.length - nDur, i1 = nDur;
      const grupos = nDur && nUni ? `<div class="tp-cab tp-grupos"><span></span>${nDur ? `<span class="tp-grupo" style="grid-column:span ${nDur}">Spot · preço por duração</span>` : ''}<span class="tp-grupo uni1" style="grid-column:span ${nUni}">Preço único</span><span></span></div>` : '';
      corpo = `<section class="card tp-grade"><div class="scroll"><div class="tp-tab" style="--n:${forms.length}">${grupos}
        <div class="tp-cab"><span class="muted small">Onde vai ao ar · dias e horário</span>${forms.map((f, i) => `<span class="tp-form${f.ativo ? '' : ' inativo'}${i === i1 ? ' uni1' : ''}"><span><b>${esc(f.nome)}</b><small>${esc(unico(f) ? (f.detalhe || 'valor único') : f.detalhe || '')}${f.ativo ? '' : ' · fora dos novos PIs'}</small></span>${tres('tpMenuForm', f.id, f.nome)}</span>`).join('')}
          <span class="tp-mais">${ed ? `<button class="btn sm tracej" data-act="tpProduto" data-tipo="formato">${S.svg('mais')}Formato</button>` : ''}</span></div>
        ${secoes.map(s => `<div class="tp-secao">${esc(s.titulo)}</div>` + s.itens.map(p => { const av = avisos(p), dp = descontoDo(p);
          return `<div class="tp-row${p.ativo ? '' : ' inativo'}"><span class="tp-prog"><b>${esc(p.nome)}</b><small>${horario(p)}</small>
            <span class="row mid" style="gap:6px">${dp !== undefined && dp !== desc ? S.tag(`Desconto máx. ${dp === null ? 'varia' : dp + '%'}`, 'blue') : ''}${p.ativo ? '' : S.tag('Fora dos novos PIs', 'gray')}</span></span>
            ${forms.map((f, i) => celula(p, f, av, i === i1)).join('')}<span class="tp-mais">${tres('tpMenuProg', p.id, p.nome)}</span></div>`; }).join('')).join('')}
        ${ed ? `<div class="tp-rodape tp-novos">${botoesNovo('sm tracej')}</div>` : ''}
      </div></div><p class="muted small" style="margin-top:12px">Valores em R$ por inserção; "—" = não é vendido nesse espaço. ${ed ? 'Clique num valor para mudar. ' : ''}Os PIs já feitos guardam o preço da época em que foram criados.</p></section>`; }

    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Tabela de preços`,
      actions:`${S.db.precos.length ? `<button class="btn" data-act="tpPdf">${S.svg('baixar')}Baixar PDF da tabela</button>` : ''}${pode() && S.db.precos.length ? `<button class="btn pri" data-act="tpReajuste">${S.svg('relogio')}Reajustar tabela</button>` : ''}`,
      body:(progs.length || forms.length ? faixa + avisoModo : '') + corpo };
  };

  // ---------- gravar ----------
  // Grava o preço da célula na tabela aberta: muda a linha dessa tabela, ou cria uma linha nova com a data dela
  const gravarPreco = async (pid, fid, valor) => {
    const d = modo() === 'futura' ? aberta() : (vigente() || S.today()), atual = precoEm(pid, fid, dataRef());
    const desc = atual ? Number(atual.desconto_max) : (descontoDo(prod(pid)) ?? descontoPadrao() ?? 0);
    if (atual && (modo() === 'vigente' || atual.vigencia_inicio === d)) return S.salvar('precos', { id:atual.id, preco:valor });
    return S.salvar('precos', { veiculo_id:S.ui.vehicleId, programa_id:pid, formato_id:fid, preco:valor, vigencia_inicio:d, desconto_max:Number(desc) || 0 });
  };
  const salvarEdicao = () => {
    const el = document.getElementById('tpEd'); if (!el || !editando) return;
    const v = S.num(el.value), { p, f } = editando, atual = precoEm(p, f, dataRef()); editando = null;
    if (!el.value.trim()) return S.render();
    if (atual && Number(atual.preco) === v && (modo() === 'vigente' || atual.vigencia_inicio === aberta())) return S.render();
    S.run(() => gravarPreco(p, f, v), 'Preço salvo');
  };
  // Reordena programas ou formatos: troca de lugar com o vizinho e grava a ordem de todos
  const mover = async (id, dir) => {
    const it = prod(id), l = lista(it.tipo), i = l.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    await Promise.all(l.map((x, k) => x.ordem === k ? null : S.salvar('produtos', { id:x.id, ordem:k })));
  };

  const formProduto = (tipo, p, secao) => {
    const prog = tipo === 'programa', dp = p.id && prog ? descontoDo(p) : undefined, sec = p.secao || secao || 'programa';
    const novoTitulo = prog ? `Novo ${SECOES.find(x => x[0] === sec)[2].toLowerCase()}` : 'Novo formato';
    S.form(p.id ? esc(p.nome) : novoTitulo, prog ? [
      { k:'nome', label:sec === 'rotativo' ? 'Nome' : sec === 'quadro' ? 'Quadro' : 'Programa', req:true, ph:sec === 'rotativo' ? 'Ex.: Spot indeterminado' : sec === 'quadro' ? 'Ex.: Comunicação Política' : 'Ex.: Jornal da Manhã' },
      { k:'secao', label:'Seção da tabela', type:'select', options:SECOES.map(([k, , n]) => [k, n]) },
      { k:'detalhe', label:'Dias e horário (uma linha para cada faixa)', type:'textarea', ph:'Ex.: Seg a sex · 6h às 20h\nSáb e dom · 6h às 11h' },
      ...(p.id ? [{ k:'desconto', label:`Desconto máximo (%)${dp === null ? ' · hoje varia por formato' : ''}`, mask:'pct', ph:'Ex.: 30' }] : []),
      { k:'ativo', label:'Aparece nos novos PIs', type:'checkbox' }] : [
      { k:'nome', label:'Formato', req:true, ph:'Ex.: Spot 30" ou Testemunhal' },
      { k:'cobranca', label:'Como é cobrado', type:'select', options:[['duracao', 'Por duração do spot (15", 30"...)'], ['unico', 'Preço único (testemunhal, patrocínio, menção)']] },
      { k:'detalhe', label:'Duração ou observação', ph:'Ex.: 30 segundos' },
      { k:'ativo', label:'Aparece nos novos PIs', type:'checkbox' }],
      Object.assign({ ativo:true, secao:sec, cobranca:/testemunhal|patroc|men[cç]/i.test(p.nome || '') ? 'unico' : 'duracao' }, p, { desconto:dp === undefined || dp === null ? '' : String(dp) }),
      v => S.run(async () => {
        const row = Object.assign({ nome:v.nome.trim(), detalhe:(v.detalhe || '').trim(), ativo:v.ativo === 'on' }, prog ? { secao:v.secao } : { cobranca:v.cobranca }, p.id ? { id:p.id } : { veiculo_id:S.ui.vehicleId, tipo, ordem:lista(tipo).length });
        await S.salvar('produtos', row);
        if (prog) secCel = v.secao;
        // Desconto do programa: vale para todos os preços dele na tabela aberta
        if (p.id && prog && v.desconto !== '' && v.desconto !== undefined) { const novo = S.num(v.desconto);
          await Promise.all(lista('formato').map(f => precoEm(p.id, f.id, dataRef())).filter(x => x && Number(x.desconto_max) !== novo).map(x => S.salvar('precos', { id:x.id, desconto_max:novo }))); }
      }, prog ? 'Salvo' : 'Formato salvo'), 'Salvar', { editar:true });
  };

  // ---------- reajuste ----------
  const primeiroDoMes = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const arredonda = (v, a) => a ? Math.round(v / a) * a : Math.round(v * 100) / 100;
  const previa = () => {
    const f = document.querySelector('#dlg form'); if (!f || !f.elements.tp_pct) return;
    const pct = S.num(f.elements.tp_pct.value), arr = Number(f.elements.tp_arr.value), data = f.elements.tp_data.value || S.today();
    const linhas = [];
    lista('programa').forEach(p => lista('formato').forEach(fm => { const x = precoEm(p.id, fm.id, data); if (x) linhas.push(`<div><span>${esc(p.nome)} · ${esc(fm.nome)}</span><span class="muted">${S.nfmt(Number(x.preco))}</span><span class="muted">→</span><b>${S.nfmt(arredonda(Number(x.preco) * (1 + pct / 100), arr))}</b></div>`); }));
    document.getElementById('tpPrevia').innerHTML = `<div class="tp-pv-cab"><span>Programa · formato</span><span>Antes</span><span></span><span>Depois</span></div>${linhas.join('')}`;
  };
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#dlg') && /^tp_/.test(e.target.name || '')) previa(); });
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#dlg') && /^tp_/.test(e.target.name || '')) previa(); });

  // ---------- PDF ----------
  const imprimir = () => {
    const v = S.veh(), forms = colunas().filter(f => f.ativo), progs = lista('programa').filter(p => p.ativo), d = aberta(), n = forms.length + 2;
    const linha = p => `<tr><td><b>${esc(p.nome)}</b></td><td>${horario(p)}</td>${forms.map(f => { const x = precoEm(p.id, f.id, dataRef()); return `<td style="text-align:right">${x ? brl(x.preco) : '—'}</td>`; }).join('')}</tr>`;
    document.getElementById('print').innerHTML = `<div class="cab">${v.logo ? `<img src="${v.logo}" alt="">` : ''}<div><h1 style="border-left:6px solid ${v.cor || S.COR_PADRAO};padding-left:8px">${esc(v.nome)} · Tabela de preços</h1><div>${d ? `${modo() === 'futura' ? 'Válida a partir de' : 'Vigente desde'} ${dfmt(d)}` : ''}${descontoPadrao() !== null ? ` · desconto máximo ${descontoPadrao()}%` : ''}</div></div></div>
      <table><thead><tr><th>Onde vai ao ar</th><th>Dias e horário</th>${forms.map(f => `<th style="text-align:right">${esc(f.nome)}</th>`).join('')}</tr></thead>
      <tbody>${SECOES.map(([k, t]) => { const l = progs.filter(p => secaoDe(p) === k); return l.length ? `<tr><th colspan="${n}" style="text-align:left">${esc(t)}</th></tr>${l.map(linha).join('')}` : ''; }).join('')}</tbody></table>
      <p>Valores por inserção; "—" = não é vendido. ${esc([v.razao_social, v.cnpj && 'CNPJ ' + v.cnpj, v.telefone, v.email].filter(Boolean).join(' · '))}</p>`;
    setTimeout(() => window.print(), 60);
  };

  Object.assign(S.actions, {
    tpEditar: d => { if (!pode() || modo() === 'anterior') return;
      if (S.celular) { const x = precoEm(d.p, d.f, dataRef());
        return S.form(`${esc(prod(d.p).nome)} · ${esc(prod(d.f).nome)}`, [{ k:'preco', label:'Preço por inserção (R$)', req:true, mask:'dec', ph:'Ex.: 68,00' }], { preco:x ? S.nfmt(Number(x.preco)) : '' },
          v => S.run(() => gravarPreco(d.p, d.f, S.num(v.preco)), 'Preço salvo'), 'Salvar', { editar:true }); }
      editando = { p:d.p, f:d.f }; S.render();
      const el = document.getElementById('tpEd'); if (el) { S.mascarar(el.parentElement); el.focus(); el.select(); } },
    tpSalvar: () => salvarEdicao(),
    tpProduto: d => formProduto(d.tipo, {}, d.secao),
    tpSecao: d => { secCel = d.secao; S.render(); },
    tpMenuProg: (d, botao) => { const p = prod(d.id);
      S.menu(botao, [{ label:'Editar nome, seção, horário e desconto', icon:'editar', act:'tpEditarProd', data:{ id:p.id } }, { label:'Subir', icon:'seta', act:'tpMover', data:{ id:p.id, dir:-1 } }, { label:'Descer', icon:'baixo', act:'tpMover', data:{ id:p.id, dir:1 } },
        { label:p.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:p.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:p.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:p.id }, perigo:true }]); },
    tpMenuForm: (d, botao) => { const f = prod(d.id);
      S.menu(botao, [{ label:'Editar nome e cobrança', icon:'editar', act:'tpEditarProd', data:{ id:f.id } }, { label:'Mover para a esquerda', icon:'voltar', act:'tpMover', data:{ id:f.id, dir:-1 } }, { label:'Mover para a direita', icon:'seta', act:'tpMover', data:{ id:f.id, dir:1 } },
        { label:f.ativo ? 'Tirar dos novos PIs' : 'Voltar para os novos PIs', icon:f.ativo ? 'bloqueio' : 'check', act:'tpAtivo', data:{ id:f.id } }, '-', { label:'Excluir', icon:'lixo', act:'tpExcluir', data:{ id:f.id }, perigo:true }]); },
    tpEditarProd: d => { const p = prod(d.id); formProduto(p.tipo, p); },
    tpMover: d => S.run(() => mover(d.id, +d.dir)),
    tpAtivo: d => { const p = prod(d.id); S.run(() => S.salvar('produtos', { id:p.id, ativo:!p.ativo }), p.ativo ? 'Não aparece mais nos novos PIs' : 'Voltou para os novos PIs'); },
    tpExcluir: d => { const p = prod(d.id), n = S.db.precos.filter(x => x.programa_id === p.id || x.formato_id === p.id).length;
      if (!confirm(`Excluir "${p.nome}"${n ? ` e os ${n} preço(s) dele em todas as tabelas` : ''}? Os PIs já feitos não mudam.\n\nSe só quer que ele pare de aparecer nos PIs novos, use "Tirar dos novos PIs".`)) return;
      S.run(async () => { await S.excluir('produtos', p.id); S.db.precos = S.db.precos.filter(x => x.programa_id !== p.id && x.formato_id !== p.id); }, 'Excluído'); },
    tpPdf: () => imprimir(),
    tpReajuste: () => {
      S.dialog(`<h2>Reajustar tabela</h2><p class="muted small">Cria uma tabela nova a partir da data escolhida. A atual continua valendo até o dia anterior, e os PIs já feitos não mudam.</p>
        <div class="g2"><label class="f">Nova tabela vale a partir de<input type="date" name="tp_data" required value="${primeiroDoMes()}"></label>
          <label class="f">Reajuste (%)<input name="tp_pct" required data-mask="dec" inputmode="decimal" placeholder="Ex.: 8,5"></label>
          <label class="f">Arredondar os preços<select name="tp_arr"><option value="0">Não arredondar</option><option value="0.5" selected>Para R$ 0,50</option><option value="1">Para R$ 1,00</option></select></label></div>
        <div class="tp-previa" id="tpPrevia"></div>
        <p class="muted small">Depois de criar, dá para ajustar um preço ou outro na tabela nova antes de ela começar a valer.</p>
        <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Criar tabela nova</button></div>`,
        v => {
          const data = v.tp_data, pct = S.num(v.tp_pct), arr = Number(v.tp_arr);
          if (!data) return S.toast('Escolha a data da nova tabela.');
          S.run(async () => {
            const novos = [], muda = [];
            lista('programa').forEach(p => lista('formato').forEach(f => { const x = precoEm(p.id, f.id, data); if (!x) return;
              const valor = arredonda(Number(x.preco) * (1 + pct / 100), arr);
              if (x.vigencia_inicio === data) muda.push({ id:x.id, preco:valor });
              else novos.push({ veiculo_id:S.ui.vehicleId, programa_id:p.id, formato_id:f.id, preco:valor, vigencia_inicio:data, desconto_max:Number(x.desconto_max) }); }));
            if (novos.length) { const r = await S.q(S.sb.from('precos').insert(novos).select()); S.db.precos.push(...r); }
            await Promise.all(muda.map(m => S.salvar('precos', m)));
            versao = data;
          }, `Tabela nova criada: vale a partir de ${dfmt(data)}`);
        });
      previa();
    },
  });

  // Campo de preço: Enter salva, Esc desiste, sair do campo salva
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'tpEd') return;
    if (e.key === 'Enter') { e.preventDefault(); salvarEdicao(); }
    if (e.key === 'Escape') { editando = null; S.render(); }
  });
  document.addEventListener('focusout', e => { if (e.target.id === 'tpEd' && !(e.relatedTarget && e.relatedTarget.dataset && e.relatedTarget.dataset.act === 'tpSalvar')) setTimeout(() => { if (document.getElementById('tpEd')) salvarEdicao(); }, 0); });
  S.changes.push((el, d) => { if (!d.tpVersao) return false; versao = el.value; editando = null; S.render(); return true; });
})();

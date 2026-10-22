// SONVI · Ação digital (database/034): o que a rádio vende nas redes sociais dela, na proposta e no PI.
// Uma ação = canal (cadastrado em Tabela de preços → Digital), nome opcional, entregas em texto livre com quantidade
// (ex.: Reels 2, Stories 8, Live com o cliente 1), período (ação única: de/até) e um valor só, digitado por quem vende.
// Depois de aprovado, cada entrega vira uma linha no acompanhamento do PI (marcar_entrega): data, publicado e link.
(() => {
  const { esc, brl, nfmt, num, dfmt } = S;
  const canais = () => S.db.produtos.filter(p => p.tipo === 'programa' && p.secao === 'digital').sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  const sugestoes = () => S.db.produtos.filter(p => p.tipo === 'formato' && p.secao === 'digital' && p.ativo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome)).map(p => p.nome.trim());
  const PADRAO = ['Reels', 'Stories', 'Feed', 'Carrossel', 'Live'];
  // Tabela digital vigente (database/035): preço de cada entrega no canal e pacotes de preço fechado
  const vigD = () => S.tabelaVigente(S.today(), 'digital');
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  S.precoEntrega = (canalId, nome, tab = vigD()) => { if (!tab || !canalId) return null;
    const e = S.db.produtos.find(p => p.tipo === 'formato' && p.secao === 'digital' && norm(p.nome) === norm(nome)); if (!e) return null;
    const x = S.precoNaTabela(tab.id, canalId, e.id); return x ? Number(x.preco) : null; };
  // Valor de tabela de uma ação: soma das entregas que têm preço na tabela digital vigente (as outras ficam de fora)
  S.acaoValorTabela = a => (a.entregas || []).reduce((s, e) => { const p = S.precoEntrega(a.canal_id, e.nome); return s + (p ? p * (parseInt(e.qtd) || 0) : 0); }, 0);

  // Entregas de uma ação, por extenso: "2 Reels, 8 Stories e 1 Live"
  S.acaoQtd = a => (a.entregas || []).reduce((s, e) => s + (parseInt(e.qtd) || 0), 0);
  S.acaoEntregasTxt = a => { const l = (a.entregas || []).filter(e => parseInt(e.qtd) > 0).map(e => `${parseInt(e.qtd)} ${e.nome}`); return l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || ''; };
  S.acaoPeriodo = a => !a.inicio ? '' : a.fim && a.fim !== a.inicio ? `${dfmt(a.inicio).slice(0, 5)} a ${dfmt(a.fim)}` : dfmt(a.inicio);
  S.acaoCanal = a => [a.perfil, a.detalhe].filter(Boolean).join(' ');
  S.acaoTitulo = a => a.nome || `Ação digital · ${a.perfil || 'canal'}`;
  // Uma linha por entrega, para o acompanhamento: [{ nome, k, de, n }] (n = posição na ação, 1 …)
  S.acaoUnidades = a => { const out = []; (a.entregas || []).forEach(e => { const q = parseInt(e.qtd) || 0; for (let k = 1; k <= q; k++) out.push({ nome:e.nome, k, de:q, n:out.length + 1 }); }); return out; };
  // Chips com as entregas (tela)
  S.acaoChips = a => (a.entregas || []).filter(e => parseInt(e.qtd) > 0).map(e => `<span class="ad-chip">${esc(e.nome)} · ${parseInt(e.qtd)}</span>`).join('');

  // Linha da ação na tela (proposta e PI). editar: { act:'prAcao'|'piAcao', data:'data-i="3"' }
  S.acaoHtml = (a, editar) => `<div class="ad-l"><div class="ad-info"><b>${esc(S.acaoTitulo(a))}</b> <span class="pill" style="--tone:var(--purple)">Ação única</span>
      <small class="muted">${esc(S.acaoCanal(a))}${a.inicio ? ' · ' + S.acaoPeriodo(a) : ''}</small><div class="ad-chips">${S.acaoChips(a) || '<span class="muted small">sem entregas</span>'}</div></div>
    <b class="ad-v">${brl(num(a.valor ?? a.total))}</b>
    <span class="ad-x">${editar ? `<button type="button" class="btn sm" data-act="${editar.act}" ${editar.data} data-op="editar">${S.svg('editar')}Editar</button><button type="button" class="x" data-act="${editar.act}" ${editar.data} data-op="tirar" aria-label="Tirar a ação ${esc(S.acaoTitulo(a))}" title="Tirar">×</button>` : ''}</span></div>`;

  // Janela da ação digital (nova ou editando). onSalvar recebe a ação pronta.
  S.acaoDigitalDlg = (atual, onSalvar) => {
    const cs = canais().filter(c => c.ativo || (atual && c.id === atual.canal_id));
    if (!cs.length) return S.toast(S.pode('diretor', 'gerente') ? 'Cadastre o canal da rádio antes, em Tabela de preços → Digital.' : 'Peça ao diretor para cadastrar o canal da rádio em Tabela de preços → Digital.');
    const a = Object.assign({ canal_id:cs[0].id, nome:'', entregas:[{ nome:'', qtd:'' }], inicio:'', fim:'', valor:0 }, JSON.parse(JSON.stringify(atual || {})));
    if (!a.entregas.length) a.entregas = [{ nome:'', qtd:'' }];
    const sug = [...new Set([...sugestoes(), ...(sugestoes().length ? [] : PADRAO)])];
    const linha = e => `<div class="ad-ent"><input name="e_nome" list="adSug" value="${esc(e.nome || '')}" placeholder="Ex.: Reels" aria-label="Entrega" autocomplete="off"><input name="e_qtd" data-mask="int" inputmode="numeric" value="${e.qtd || ''}" placeholder="Qtd." aria-label="Quantidade"><small class="muted ad-preco"></small><button type="button" class="x" data-ad="tirar" aria-label="Tirar esta entrega" title="Tirar">×</button></div>`;
    const tabD = vigD(), pks = tabD ? (tabD.pacotes || []) : [];
    S.dialog(`<h2>${atual ? 'Editar ação digital' : 'Ação digital'}</h2>
      <div class="g2"><label class="f">Canal<select name="canal" required>${cs.map(c => `<option value="${c.id}"${c.id === a.canal_id ? ' selected' : ''}>${esc(c.nome)}${c.detalhe ? ' · ' + esc(c.detalhe) : ''}</option>`).join('')}</select></label>
        <label class="f">Nome da ação (opcional)<input name="nome" value="${esc(a.nome)}" placeholder="Ex.: Black Friday"></label>
        ${pks.length ? `<label class="f" style="grid-column:1/-1">Começar de um pacote (opcional)<select name="pacote" data-nativo><option value="">Montar à mão</option>${pks.map(pk => `<option value="${pk.id}"${a.pacote_id === pk.id ? ' selected' : ''}>${esc(pk.nome)} · ${brl(num(pk.preco))}</option>`).join('')}</select></label>` : ''}</div>
      <fieldset class="f ad-ents"><legend>O que vai ser entregue</legend><div id="adEnts">${a.entregas.map(linha).join('')}</div>
        <div class="ad-atalhos"><small class="muted">Atalhos:</small>${sug.map(s => `<button type="button" class="ad-chip ad-add" data-ad="add" data-nome="${esc(s)}">+ ${esc(s)}</button>`).join('')}<button type="button" class="btn sm tracej" data-ad="add" data-nome="">${S.svg('mais')}Outra entrega</button></div>
        <datalist id="adSug">${sug.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist></fieldset>
      <div class="ad-per"><label class="f">Período · de<input type="date" name="inicio" required value="${esc(a.inicio)}"></label><label class="f">até<input type="date" name="fim" required value="${esc(a.fim || a.inicio)}"></label>
        <label class="f">Valor da ação (R$)<input name="valor" data-mask="dec" inputmode="decimal" required value="${num(a.valor) ? nfmt(num(a.valor)) : ''}" placeholder="0,00"></label></div>
      <div class="ad-tab" id="adTab" aria-live="polite"></div>
      <p class="muted small" style="margin:0">Ação única: um valor para tudo. As datas de cada publicação a rádio define depois da aprovação, dentro do período. A produção já está no valor.</p>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${atual ? 'Salvar ação' : 'Adicionar ação'}</button></div>`,
      () => { const f = document.querySelector('#dlg form'), c = canais().find(x => x.id === f.canal.value) || {};
        const ents = [...f.querySelectorAll('.ad-ent')].map(r => ({ nome:r.querySelector('[name="e_nome"]').value.trim(), qtd:parseInt(r.querySelector('[name="e_qtd"]').value) || 0 })).filter(e => e.nome && e.qtd > 0);
        const pk = f.pacote && pks.find(x => x.id === f.pacote.value), acao = { id:(atual && atual.id) || S.uid(), tipo:'acao', canal_id:c.id || null, perfil:(c.nome || '').trim(), detalhe:c.detalhe || '', nome:f.nome.value.trim(), entregas:ents,
          inicio:f.inicio.value, fim:f.fim.value || f.inicio.value, period:f.inicio.value.slice(0, 7), valor:Math.round(num(f.valor.value) * 100) / 100, pacote_id:pk ? pk.id : null, pacote:pk ? pk.nome : '' };
        acao.valor_tabela = Math.round(S.acaoValorTabela(acao) * 100) / 100;
        onSalvar(acao); });
    const dl = document.getElementById('dlg'), f = dl.querySelector('form'), box = document.getElementById('adEnts');
    dl.classList.add('medio'); const antes = dl.onclose; dl.onclose = e => { dl.classList.remove('medio'); if (antes) antes(e); };
    // Confere antes de salvar: ao menos uma entrega com nome e quantidade, fim depois do início, valor maior que zero
    const confere = () => { const rs = [...box.querySelectorAll('.ad-ent')], ok = rs.some(r => r.querySelector('[name="e_nome"]').value.trim() && parseInt(r.querySelector('[name="e_qtd"]').value) > 0);
      rs.forEach((r, i) => { const n = r.querySelector('[name="e_nome"]'), q = r.querySelector('[name="e_qtd"]');
        n.setCustomValidity(!ok && i === 0 ? 'Coloque ao menos uma entrega com quantidade.' : n.value.trim() && !(parseInt(q.value) > 0) ? '' : '');
        q.setCustomValidity(n.value.trim() && !(parseInt(q.value) > 0) ? 'Coloque a quantidade.' : ''); });
      f.fim.min = f.inicio.value || ''; f.fim.setCustomValidity(f.fim.value && f.inicio.value && f.fim.value < f.inicio.value ? 'O fim vem depois do início.' : '');
      f.valor.setCustomValidity(f.valor.value && !(num(f.valor.value) > 0) ? 'Coloque o valor da ação.' : ''); };
    // Preço de cada entrega na tabela digital vigente, valor de tabela e desconto sobre o valor da ação
    const precos = () => { const canal = f.canal.value; let t = 0, sem = [];
      box.querySelectorAll('.ad-ent').forEach(r => { const n = r.querySelector('[name="e_nome"]').value.trim(), q = parseInt(r.querySelector('[name="e_qtd"]').value) || 0, p = n ? S.precoEntrega(canal, n, tabD) : null;
        r.querySelector('.ad-preco').textContent = !n ? '' : p ? `× ${brl(p)}` : 'sem preço'; if (p) t += p * q; else if (n && q) sem.push(n); });
      const v = num(f.valor.value), el = document.getElementById('adTab');
      el.innerHTML = !tabD ? '<span class="muted">Sem tabela digital vigente: o valor de tabela não aparece.</span>' : t ? `<span>Valor de tabela <b>${brl(t)}</b></span>${v > 0 ? `<span>${v < t ? `Desconto <b>${brl(t - v)} (${String(Math.round((1 - v / t) * 1000) / 10).replace('.', ',')}%)</b>` : v > t ? `Acima da tabela <b>${brl(v - t)}</b>` : 'Igual à tabela'}</span>` : ''}${sem.length ? `<span class="muted">${esc(sem.join(', '))} sem preço na tabela</span>` : ''}` : '<span class="muted">As entregas desta ação não têm preço na tabela digital.</span>'; };
    if (f.pacote) f.pacote.addEventListener('change', () => { const pk = pks.find(x => x.id === f.pacote.value); if (!pk) return;
      if (pk.canal_id && [...f.canal.options].some(o => o.value === pk.canal_id)) f.canal.value = pk.canal_id;
      box.innerHTML = (pk.itens || []).map(it => linha({ nome:(S.db.produtos.find(p => p.id === it.entrega_id) || {}).nome || it.nome, qtd:it.qtd })).join('') || linha({}); S.mascarar(box);
      f.valor.value = nfmt(num(pk.preco)); if (!f.nome.value.trim()) f.nome.value = pk.nome; dl.dataset.sujo = '1'; confere(); precos(); });
    f.addEventListener('input', e => { if (e.target.name === 'inicio' && (!f.fim.value || f.fim.value < f.inicio.value)) f.fim.value = f.inicio.value; confere(); precos(); });
    f.addEventListener('change', e => { if (e.target.name === 'canal') precos(); });
    f.addEventListener('click', e => { const b = e.target.closest('[data-ad]'); if (!b) return;
      if (b.dataset.ad === 'tirar') { const r = b.closest('.ad-ent'); if (box.children.length > 1) r.remove(); else { r.querySelectorAll('input').forEach(i => { i.value = ''; }); } confere(); precos(); return; }
      // Atalho: preenche a primeira linha vazia ou cria uma nova, e leva o cursor para a quantidade
      let r = [...box.querySelectorAll('.ad-ent')].find(x => !x.querySelector('[name="e_nome"]').value.trim());
      if (!r) { box.insertAdjacentHTML('beforeend', linha({})); r = box.lastElementChild; S.mascarar(r); }
      const n = r.querySelector('[name="e_nome"]'); n.value = b.dataset.nome; (b.dataset.nome ? r.querySelector('[name="e_qtd"]') : n).focus(); dl.dataset.sujo = '1'; confere(); precos(); });
    confere(); precos();
  };
})();

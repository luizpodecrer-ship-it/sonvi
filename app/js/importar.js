// SONVI · Importar PI da agência (31/10/2026; layout aprovado no artifact "Importar PI · SONVI"; database/066,
// função de borda "importar_pi"). O cliente ou a agência manda o PI pronto (PDF, foto ou planilha): o SONVI lê,
// mostra tudo para conferir (cliente, agência, linhas ligadas aos nossos produtos, soma) e só então cria o PI em Rascunho,
// com o arquivo original na aba Mídias. Daí segue o fluxo de sempre (Enviar para a OPEC…).
(() => {
  const { esc } = S;
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const digitos = s => String(s || '').replace(/\D/g, '');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const ACEITA = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,application/pdf,image/*';
  let imp = null;   // a importação em conferência (só na memória da tela)

  // ---------- 1. enviar o arquivo ----------
  const abrir = () => {
    S.dialog(`<h2>Importar PI · ${esc(S.veh().nome)}</h2>
      <p class="muted" style="margin-top:-6px">Envie o PI que o cliente ou a agência mandou. O SONVI lê o documento e mostra tudo para você conferir antes de criar.</p>
      <label class="ip-solta" id="ipSolta">
        <span class="ip-ic" aria-hidden="true">${S.svg('baixar')}</span><b>Arraste o PI aqui</b><span class="muted small">ou</span>
        <span class="btn sm">Escolher arquivo</span>
        <input type="file" id="ipArq" accept="${ACEITA}" class="sr">
        <span class="ip-tipos"><span>PDF</span><span>JPG</span><span>PNG</span><span>Excel</span><span>CSV</span><span>até 15 MB</span></span>
      </label>
      ${S.celular ? `<label class="btn" style="justify-content:center;margin-top:10px">${S.svg('olho')}Tirar foto<input type="file" accept="image/*" capture="environment" class="sr" id="ipFoto"></label>` : ''}
      <p class="muted small" style="margin-top:12px">PDF gerado pelo sistema da agência dá a leitura mais exata. Foto ou print também funcionam: o que ficar com dúvida aparece marcado para você conferir.</p>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button></div>`);
    const d = document.getElementById('dlg'), zona = document.getElementById('ipSolta');
    const pega = f => { if (f) { d.close('cancel'); ler(f); } };
    d.querySelectorAll('input[type=file]').forEach(i => i.addEventListener('change', () => pega(i.files[0])));
    ['dragenter', 'dragover'].forEach(e => zona.addEventListener(e, ev => { ev.preventDefault(); zona.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(e => zona.addEventListener(e, ev => { ev.preventDefault(); zona.classList.remove('on'); }));
    zona.addEventListener('drop', ev => pega(ev.dataTransfer.files[0]));
  };

  // Arquivo → o que a função de borda recebe
  const base64 = blob => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = erro; r.readAsDataURL(blob); });
  const reduzir = f => new Promise(ok => {   // foto grande vira JPEG de até 2400 px (lê melhor e envia mais rápido)
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => { const k = Math.min(1, 2400 / Math.max(img.width, img.height)); if (k === 1 && f.size < 4e6) { URL.revokeObjectURL(u); return ok(f); }
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => ok(b || f), 'image/jpeg', 0.88); };
    img.onerror = () => { URL.revokeObjectURL(u); ok(f); }; img.src = u; });
  const carregaXlsx = () => window.XLSX ? Promise.resolve() : new Promise((ok, erro) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível abrir a planilha.')); document.head.appendChild(s); });
  const corpoDe = async f => {
    const nome = f.name || 'pi', ext = (nome.split('.').pop() || '').toLowerCase();
    if (f.size > 15 * 1048576) throw new Error('O arquivo passa de 15 MB.');
    if (ext === 'csv' || f.type === 'text/csv') return { nome, texto:await f.text() };
    if (['xlsx', 'xls'].includes(ext)) { await carregaXlsx(); const wb = XLSX.read(await f.arrayBuffer());
      return { nome, texto:wb.SheetNames.map(n => `### Aba ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS:';' })).join('\n\n') }; }
    if (ext === 'pdf' || f.type === 'application/pdf') return { nome, tipo:'application/pdf', base64:await base64(f) };
    if (/^image\//.test(f.type) || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { const b = await reduzir(f); return { nome, tipo:b.type || 'image/jpeg', base64:await base64(b) }; }
    throw new Error('Formato não aceito. Envie PDF, JPG, PNG ou planilha.');
  };

  // ---------- 2. lendo ----------
  const ETAPAS = ['Cliente, agência e veículo', 'Período e condições de pagamento', 'Grade de inserções dia a dia', 'Valores e conferência da soma'];
  const ler = async f => {
    S.dialog(`<h2>Lendo o PI…</h2>
      <div class="ip-arq"><span class="ip-ext">${esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4))}</span><span><b>${esc(f.name)}</b><small class="muted">${(f.size / 1024 > 1024 ? (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB')}</small></span></div>
      <ul class="ip-etapas" id="ipEt">${ETAPAS.map((e, i) => `<li class="${i ? 'depois' : 'agora'}"><i aria-hidden="true"></i>${e}</li>`).join('')}</ul>
      <p class="muted small">Leva de 20 segundos a 1 minuto, conforme o tamanho do PI.</p>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button></div>`);
    // "Cancelado" só pelo botão ou pelo Esc desta janela (o fechamento da janela anterior chega atrasado e não pode contar)
    const d = document.getElementById('dlg'); let cancelado = false, passo = 0;
    const cancela = () => { cancelado = true; };
    d.querySelector('button[value=cancel]').addEventListener('click', cancela);
    d.addEventListener('cancel', cancela);
    const solta = () => d.removeEventListener('cancel', cancela);
    const marca = n => { const li = [...(document.querySelectorAll('#ipEt li'))]; li.forEach((x, i) => { x.className = i < n ? 'feito' : i === n ? 'agora' : 'depois'; }); };
    const relogio = setInterval(() => { if (passo < ETAPAS.length - 1) marca(++passo); }, 9000);
    try {
      const corpo = Object.assign({ veiculo_id:S.ui.vehicleId }, await corpoDe(f));
      const limite = new Promise((_, nao) => setTimeout(() => nao(new Error('A leitura demorou demais. Tente de novo; se repetir, envie o PI em PDF.')), 170000));
      const { data, error } = await Promise.race([S.sb.functions.invoke('importar_pi', { body:corpo }), limite]);
      if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ } throw new Error(m); }
      if (data && data.erro) throw new Error(data.erro);
      clearInterval(relogio); solta(); if (cancelado) return; marca(ETAPAS.length); d.close('ok');
      await preparar(data.leitura || {}, f); S.go('/importar');
    } catch (e) { clearInterval(relogio); solta(); console.error(e); if (!cancelado) { if (d.open) d.close('cancel'); S.toast(S.erro(e)); } }
  };

  // ---------- 3. conferência ----------
  const chaveDe = l => digitos((l.agencia && l.agencia.cnpj) || (l.cliente && l.cliente.cnpj)) || sem((l.agencia && l.agencia.nome) || (l.cliente && l.cliente.nome));
  const acha = (tipo, dados) => { if (!dados) return null; const doc = digitos(dados.cnpj), n = sem(dados.nome), r = sem(dados.razao_social);
    const ps = S.pessoas(tipo);
    return (doc && ps.find(p => digitos(p.documento) === doc)) || (n && ps.find(p => sem(p.nome) === n || sem(p.razao_social) === n)) || (r && ps.find(p => sem(p.razao_social) === r || sem(p.nome) === r)) || null; };
  const programas = () => S.db.produtos.filter(p => p.tipo === 'programa' && !['digital', 'ooh', 'patrocinio'].includes(p.secao) && p.ativo !== false);
  const formatos = () => S.db.produtos.filter(p => p.tipo === 'formato' && p.secao !== 'digital' && p.ativo !== false);
  const textoLinha = l => sem(`${l.programa || ''} ${l.duracao || ''}`);

  const preparar = async (l, file) => {
    const chave = chaveDe(l);
    let mapas = [], repetido = null;
    try { mapas = await S.q(S.sb.from('pi_import_mapas').select('*').eq('veiculo_id', S.ui.vehicleId).eq('agencia_chave', chave)); } catch (e) { console.error(e); }
    if (l.numero_pi) { try { const r = await S.q(S.sb.from('pi_importacoes').select('pi_id, numero_agencia').eq('veiculo_id', S.ui.vehicleId).eq('agencia_chave', chave).eq('numero_agencia', String(l.numero_pi).trim())); repetido = (r || [])[0] || null; } catch (e) { console.error(e); } }
    const progs = programas(), fmts = formatos();
    const linhas = (l.linhas || []).map((x, i) => {
      const m = (mapas || []).find(k => k.texto === textoLinha(x));
      const p = m ? progs.find(q => q.nome === m.programa) : progs.find(q => q.id === x.produto_sugerido_id);
      const f = m ? fmts.find(q => q.nome === m.formato) : fmts.find(q => q.id === x.formato_sugerido_id);
      // A IA manda a grade curta por mês ({ mes:'2026-11', dias:'1:3,2:2' }); "dias" com a data completa ainda é aceito
      const curtos = [];
      (x.meses || []).forEach(m => { if (!/^\d{4}-\d{2}$/.test(String(m.mes || ''))) return;
        String(m.dias || '').split(/[,;\s]+/).forEach(p => { const [dd, q] = p.split(':'); const n = Number(dd);
          if (n >= 1 && n <= 31) curtos.push({ data:`${m.mes}-${String(n).padStart(2, '0')}`, qtd:Number(q || 1) }); }); });
      const dias = (curtos.length ? curtos : (x.dias || [])).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.data) && Number(d.qtd) > 0);
      const ins = dias.reduce((s, d) => s + Number(d.qtd), 0) || Number(x.insercoes_total) || 0;
      return { i, orig:x, prog:p ? p.id : (m && m.programa === '' ? '__texto' : ''), fmt:f ? f.id : (m && m.formato === '' ? '__texto' : ''), sozinho:!!m || !!(p && f),
        unit:Number(x.unitario) || 0, ins, dias, bonus:!!x.bonificada };
    });
    if (imp && imp.url) URL.revokeObjectURL(imp.url);
    imp = { l, file, url:URL.createObjectURL(file), tipo:file.type, chave, repetido, linhas,
      cli:(acha('cliente', l.cliente) || {}).id || '', ag:l.agencia && (l.agencia.nome || l.agencia.cnpj) ? ((acha('agencia', l.agencia) || {}).id || '') : '__direta',
      assinado:typeof l.assinado === 'boolean' ? l.assinado : null,
      titulo:String(l.campanha || '').trim() || `${(l.cliente && l.cliente.nome) || 'PI'} · ${l.periodo && l.periodo.inicio ? MESES[Number(l.periodo.inicio.slice(5, 7)) - 1] : ''}`.trim() };
  };

  const somas = () => { const bruto = imp.linhas.reduce((s, x) => s + (x.bonus ? 0 : x.unit * x.ins), 0), com = imp.ag !== '__direta' ? Number(imp.l.comissao_pct) || 0 : 0,
    desc = Number(imp.l.desconto_valor) || 0, total = Math.max(0, bruto - desc); return { bruto, desc, total, com, comissao:total * com / 100, liquido:total - total * com / 100 }; };
  const pendencias = () => {
    const p = [];
    if (!imp.cli) p.push('cadastrar ou escolher o cliente');
    if (imp.ag === '') p.push('cadastrar ou escolher a agência');
    imp.linhas.forEach(x => { if (!x.prog || !x.fmt) p.push(`ligar "${x.orig.programa}" a um produto`); if (!x.dias.length) p.push(`informar os dias de "${x.orig.programa}"`); });
    return p;
  };

  S.views.importar = () => {
    if (!imp) { setTimeout(() => S.go('/pis'), 0); return { title:'Importar PI', body:'' }; }
    const l = imp.l, s = somas(), pend = pendencias(), progs = programas(), fmts = formatos(), v = S.veh();
    const docTotal = Number(l.total_bruto) || 0, bate = !docTotal || Math.abs(docTotal - s.bruto) < 0.05;
    const vLido = sem(l.veiculo && l.veiculo.nome), outroVeic = vLido && !vLido.includes(sem(v.nome).split(' ')[0]) && !(v.sigla && vLido.includes(sem(v.sigla)));
    const cliAchado = imp.cli && S.pessoa(imp.cli);
    const opt = (lista, val, extra) => `<option value="">Escolha…</option>${lista.map(p => `<option value="${p.id}"${p.id === val ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="__texto"${val === '__texto' ? ' selected' : ''}>${esc(extra)}</option>`;
    const cliCampo = `<div class="ip-c${imp.cli ? '' : ' alerta'}"><label>Cliente</label>
      ${cliAchado ? `<div class="ip-v"><b>${esc(cliAchado.nome)}</b><span class="pill" style="--tone:var(--green)">Já cadastrado</span></div><small class="muted">${esc(cliAchado.documento || '')}${cliAchado.consultor_id ? ' · ' + esc(S.usuario(cliAchado.consultor_id)) : ''}</small>`
        : `<div class="ip-v"><b>${esc((l.cliente && l.cliente.nome) || '—')}</b><span class="pill" style="--tone:var(--orange)">Não cadastrado</span></div><small class="muted">${esc((l.cliente && l.cliente.cnpj) || 'sem CNPJ no PI')}</small>
          <div class="ip-acoes"><button class="btn sm" data-act="ipCadCli">Cadastrar cliente</button><select data-ip="cli" aria-label="Ou escolher um cliente já cadastrado"><option value="">ou escolher um cadastrado…</option>${S.pessoas('cliente').map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>`}</div>`;
    const agAchada = imp.ag && imp.ag !== '__direta' && S.pessoa(imp.ag);
    const agCampo = `<div class="ip-c${imp.ag === '' ? ' alerta' : ''}"><label>Agência</label>
      ${imp.ag === '__direta' ? `<div class="ip-v"><b>Venda direta</b></div>${l.agencia && l.agencia.nome ? `<small class="muted">O PI cita ${esc(l.agencia.nome)}</small>` : ''}`
        : agAchada ? `<div class="ip-v"><b>${esc(agAchada.nome)}</b><span class="pill" style="--tone:var(--green)">Já cadastrada</span></div>`
        : `<div class="ip-v"><b>${esc((l.agencia && l.agencia.nome) || '—')}</b><span class="pill" style="--tone:var(--orange)">Não cadastrada</span></div><small class="muted">${esc((l.agencia && l.agencia.cnpj) || '')}</small>
          <div class="ip-acoes">${S.pode('diretor') ? '<button class="btn sm" data-act="ipCadAg">Cadastrar no grupo</button>' : ''}<select data-ip="ag" aria-label="Escolher a agência"><option value="">${S.pode('diretor') ? 'ou escolher…' : 'Escolher…'}</option><option value="__direta">Venda direta</option>${S.pessoas('agencia').map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
          ${S.pode('diretor') ? '' : '<small class="muted">Só o diretor cadastra agência nova.</small>'}`}
      ${imp.ag !== '' ? `<button class="ip-troca" data-act="ipTrocaAg">Trocar</button>` : ''}</div>`;
    const kv = (rot, val) => `<div class="ip-c"><label>${rot}</label><div class="ip-v">${val || '<span class="muted">—</span>'}</div></div>`;
    const per = l.periodo || {}, pg = l.pagamento || {};
    const linhasHtml = imp.linhas.map(x => { const falta = !x.prog || !x.fmt || !x.dias.length;
      return `<tr class="${falta ? 'alerta' : ''}"><td><b>${esc(x.orig.programa)}</b><small class="muted">${esc([x.orig.duracao, x.orig.horario].filter(Boolean).join(' · '))}${x.bonus ? ' · bonificada' : ''}</small></td>
        <td class="ip-seta" aria-hidden="true">→</td>
        <td><select data-ip="prog" data-i="${x.i}" aria-label="Produto no SONVI">${opt(progs, x.prog, 'Manter o nome do PI da agência')}</select>
          <select data-ip="fmt" data-i="${x.i}" aria-label="Duração no SONVI">${opt(fmts, x.fmt, `Manter "${x.orig.duracao || 'sem duração'}"`)}</select>
          ${x.sozinho && x.prog && x.fmt ? '<small class="ip-ok">Ligado sozinho</small>' : ''}${!x.dias.length ? '<small class="ip-al">O PI não trouxe os dias: confira no documento</small>' : ''}</td>
        <td class="r">${x.ins}<small class="muted">${x.dias.length} ${x.dias.length === 1 ? 'dia' : 'dias'}</small></td><td class="r">${brl(x.unit)}</td><td class="r">${x.bonus ? '<span class="muted">bonificada</span>' : brl(x.unit * x.ins)}</td></tr>`; }).join('');
    const prev = /^image\//.test(imp.tipo) ? `<img src="${imp.url}" alt="PI original" class="ip-img">` : imp.tipo === 'application/pdf' ? `<iframe src="${imp.url}#view=FitH" title="PI original" class="ip-pdf"></iframe>` : `<p class="muted small">Planilha: ${esc(imp.file.name)}</p>`;
    const duvidas = (l.duvidas || []).filter(Boolean);
    const body = `
      ${imp.repetido ? `<div class="note aviso">Este PI da agência (nº ${esc(l.numero_pi)}) já foi importado neste veículo. <a href="#/pi/${imp.repetido.pi_id}" data-go="/pi/${imp.repetido.pi_id}">Abrir o PI que já existe</a></div>` : ''}
      ${outroVeic ? `<div class="note aviso">O PI parece ser para <b>${esc(l.veiculo.nome)}</b>, e você está na <b>${esc(v.nome)}</b>. Se for de outro veículo, troque de veículo no menu e importe de novo.</div>` : ''}
      ${duvidas.length ? `<div class="note info"><b>A leitura avisou:</b> ${duvidas.map(esc).join(' · ')}</div>` : ''}
      <div class="ip-conf">
        <aside class="ip-doc card" aria-label="Documento original">${prev}<a class="btn sm" href="${imp.url}" target="_blank" rel="noopener" style="justify-content:center">Ver original inteiro</a></aside>
        <div class="ip-blocos">
          <section class="card"><div class="hd"><h2>Dados do pedido</h2><span>Nada foi gravado ainda</span></div>
            <div class="ip-campos">${cliCampo}${agCampo}${kv('Nº do PI da agência', esc(l.numero_pi || ''))}${kv('Período', per.inicio ? `${S.dfmt(per.inicio)} a ${S.dfmt(per.fim || per.inicio)}` : '')}
              ${kv('Comissão da agência', imp.ag !== '__direta' ? `${Number(l.comissao_pct) || 0}%` : 'sem agência')}${kv('Pagamento', esc([pg.forma, pg.vencimento ? 'vencimento ' + S.dfmt(pg.vencimento) : ''].filter(Boolean).join(' · ')))}
              <div class="ip-c"><label>Autorização</label><div class="ip-v"><select data-ip="assinado" aria-label="O PI da agência está assinado?"><option value="sim"${imp.assinado === true ? ' selected' : ''}>Assinado / carimbado</option><option value="nao"${imp.assinado === false ? ' selected' : ''}>Sem assinatura</option><option value=""${imp.assinado === null ? ' selected' : ''}>Não sei</option></select></div><small class="muted">Vai para a OPEC junto com o original</small></div>
              <div class="ip-c ip-full"><label for="ipTit">Título do PI no SONVI</label><input id="ipTit" data-ip="titulo" value="${esc(imp.titulo)}"></div></div></section>
          <section class="card"><div class="hd"><h2>Inserções</h2><span>${imp.linhas.length} ${imp.linhas.length === 1 ? 'linha' : 'linhas'} · ${imp.linhas.reduce((t, x) => t + x.ins, 0)} inserções</span></div>
            <div class="scroll"><table class="ip-tab"><thead><tr><th>No PI da agência</th><th><span class="sr">vira</span></th><th>No SONVI</th><th class="r">Inserções</th><th class="r">Unitário</th><th class="r">Total</th></tr></thead><tbody>${linhasHtml || '<tr><td colspan="6" class="muted">Nenhuma linha foi lida.</td></tr>'}</tbody></table></div>
            <p class="muted small">A grade dia a dia vem do PI da agência. O preço que vale é o do PI. "Manter o nome" grava a linha como a agência escreveu; ligando a um produto, o SONVI lembra disso na próxima importação desta agência.</p></section>
          <section class="card"><div class="hd"><h2>Valores</h2></div>
            <div class="ip-soma"><div><small>Bruto</small><b>${brl(s.bruto)}</b></div>${s.desc ? `<div><small>Desconto</small><b>${brl(s.desc)}</b></div>` : ''}<div><small>Comissão da agência (${s.com}%)</small><b>${brl(s.comissao)}</b></div><div><small>Líquido para a ${esc(v.nome)}</small><b>${brl(s.liquido)}</b></div></div>
            ${docTotal ? `<div class="ip-confere ${bate ? 'ok' : 'nao'}">${bate ? `${S.svg('check')}A soma das linhas bate com o total do documento (${brl(docTotal)})` : `A soma das linhas (${brl(s.bruto)}) não bate com o total do documento (${brl(docTotal)}). Confira as linhas antes de criar.`}</div>` : '<div class="ip-confere nao">O documento não traz o total para conferir.</div>'}</section>
        </div>
      </div>
      <div class="ip-rod card">${pend.length ? `<span class="ip-falta">Falta: ${esc(pend.join(' · '))}</span>` : '<span class="ip-pronto">Tudo conferido</span>'}<span class="grow"></span>
        <button class="btn" data-act="ipCancelar">Cancelar</button><button class="btn pri" data-act="ipCriar"${pend.length || imp.repetido ? ' disabled' : ''}>${S.svg('check')}Criar PI</button></div>`;
    return { title:`<span class="sub"><a data-go="/pis">PIs</a>${S.svg('seta', 14)}${esc(v.nome)}</span>Conferir PI importado`, actions:'', body };
  };

  // Mudanças na conferência (sem ir para a nuvem)
  document.addEventListener('change', e => {
    const el = e.target.closest && e.target.closest('[data-ip]'); if (!el || !imp) return;
    const k = el.dataset.ip, x = el.dataset.i !== undefined ? imp.linhas[+el.dataset.i] : null;
    if (k === 'prog' && x) { x.prog = el.value; x.sozinho = false; }
    else if (k === 'fmt' && x) { x.fmt = el.value; x.sozinho = false; }
    else if (k === 'cli') imp.cli = el.value;
    else if (k === 'ag') imp.ag = el.value;
    else if (k === 'assinado') { imp.assinado = el.value === 'sim' ? true : el.value === 'nao' ? false : null; return; }
    else if (k === 'titulo') { imp.titulo = el.value; return; }
    S.render();
  });
  document.addEventListener('input', e => { if (imp && e.target.dataset && e.target.dataset.ip === 'titulo') imp.titulo = e.target.value; });

  // ---------- 4. criar o PI ----------
  const criar = () => S.run(async () => {
    const l = imp.l, v = S.veh(), s = somas(), progs = programas(), fmts = formatos();
    const nomeP = x => x.prog === '__texto' ? [x.orig.programa, x.orig.horario].filter(Boolean).join(' · ') : (progs.find(p => p.id === x.prog) || {}).nome || x.orig.programa;
    const nomeF = x => x.fmt === '__texto' ? (x.orig.duracao || '') : (fmts.find(p => p.id === x.fmt) || {}).nome || x.orig.duracao || '';
    const porMes = {};
    imp.linhas.forEach(x => x.dias.forEach(d => { const m = d.data.slice(0, 7); ((porMes[m] = porMes[m] || {})[x.i] = porMes[m][x.i] || {})[String(Number(d.data.slice(8, 10)))] = Number(d.qtd); }));
    const grids = Object.keys(porMes).sort().map(m => ({ id:S.uid(), period:m, praca:v.cidade || '', items:imp.linhas.filter(x => porMes[m][x.i]).map(x => ({
      id:S.uid(), piece:'', f1:nomeP(x), f2:nomeF(x), days:porMes[m][x.i], unit:x.unit, disc:{ type:'pct', value:0 }, bonus:x.bonus, faixa:x.orig.horario || '' })) }));
    const temAg = imp.ag && imp.ag !== '__direta', pg = l.pagamento || {};
    const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:temAg ? Number(l.comissao_pct) || 0 : 0 }, discount:{ type:'brl', value:Number(l.desconto_valor) || 0 }, grids,
      billing:{ type:temAg ? 10 : 20, firstDue:/^\d{4}-\d{2}-\d{2}$/.test(pg.vencimento || '') ? pg.vencimento : '', installments:1, method:pg.forma || 'Boleto', obsClient:String(l.observacoes || '').slice(0, 2000) },
      importado:{ numero:String(l.numero_pi || ''), agencia:(l.agencia && l.agencia.nome) || '', arquivo:imp.file.name, em:new Date().toISOString(), total_documento:Number(l.total_bruto) || null } } }).dados;
    const pi = S.piNorm(await S.q(S.sb.rpc('criar_pi', { p_veiculo:S.ui.vehicleId, p_titulo:imp.titulo.trim() || 'PI importado', p_cliente:imp.cli, p_agencia:temAg ? imp.ag : null, p_projeto:'', p_dados:dados })));
    // Original da agência guardado à parte das mídias (database/067); vai junto para a OPEC. Falha aqui não desfaz o PI: avisa
    try { await S.guardarOriginal(pi, imp.file, imp.assinado); }
    catch (e) { console.error(e); S.toast('O PI foi criado, mas o original da agência não subiu. Anexe pela aba Mídias.'); }
    try { await S.q(S.sb.from('pi_importacoes').insert({ veiculo_id:pi.veiculo_id, pi_id:pi.id, agencia_chave:imp.chave, numero_agencia:String(l.numero_pi || '').trim(), arquivo:imp.file.name })); } catch (e) { console.error(e); }
    try { const aprend = imp.linhas.filter(x => x.prog && x.fmt).map(x => ({ veiculo_id:pi.veiculo_id, agencia_chave:imp.chave, texto:textoLinha(x.orig),
        programa:x.prog === '__texto' ? '' : nomeP(x), formato:x.fmt === '__texto' ? '' : nomeF(x), atualizado_em:new Date().toISOString() }));
      if (aprend.length) await S.q(S.sb.from('pi_import_mapas').upsert(aprend, { onConflict:'veiculo_id,agencia_chave,texto' })); } catch (e) { console.error(e); }
    S.db.pis.push(pi); URL.revokeObjectURL(imp.url); imp = null; S.ui.tab = 'detalhes'; location.hash = '/pi/' + pi.id;
    return pi;
  }, { titulo:'PI criado', sub:'Importado do PI da agência. Confira e envie para a OPEC.' });

  S.importarUsar = async (l, f) => { await preparar(l, f); S.go('/importar'); };   // testes

  Object.assign(S.actions, {
    piImportar: () => abrir(),
    ipCancelar: async () => { if (!await S.confirmar('Descartar esta importação? Nada foi gravado.', { ok:'Descartar', perigo:true })) return; if (imp) URL.revokeObjectURL(imp.url); imp = null; S.go('/pis'); },
    ipTrocaAg: () => { imp.ag = ''; S.render(); },
    ipCriar: () => { if (!imp || pendencias().length) return; criar(); },
    ipCadCli: () => { const c = imp.l.cliente || {};
      S.run(async () => { const p = await S.salvar('pessoas', { veiculo_id:S.ui.vehicleId, tipo:'cliente', pessoa:digitos(c.cnpj).length === 11 ? 'pf' : 'pj', nome:String(c.nome || c.razao_social || 'Cliente').trim(),
          razao_social:c.razao_social || '', documento:c.cnpj || '', email:c.email || '', telefone:c.telefone || '', cidade:c.cidade || '', endereco:c.endereco || '', situacao:'ativo', consultor_id:S.pode('consultor') ? S.me.id : null });
        imp.cli = p.id; }, { titulo:'Cliente cadastrado', sub:c.nome || '' }); },
    ipCadAg: () => { const a = imp.l.agencia || {};
      S.run(async () => { await S.q(S.sb.rpc('salvar_agencia_grupo', { p_grupo:null, p_dados:{ nome:String(a.nome || a.razao_social).trim(), razao_social:a.razao_social || '', documento:a.cnpj || '', email:a.email || '', telefone:a.telefone || '', comissao:String(Number(imp.l.comissao_pct) || 0) } }));
        await S.carregarVeiculo(); imp.ag = (acha('agencia', a) || {}).id || ''; }, { titulo:'Agência cadastrada', sub:'Vale em todos os veículos do grupo' }); },
  });
})();

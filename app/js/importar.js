// SONVI · Importar PI da agência (31/10/2026; layout aprovado no artifact "Importar PI · SONVI"; database/066,
// função de borda "importar_pi"). O cliente ou a agência manda o PI pronto (PDF, foto ou planilha): o SONVI lê,
// mostra o essencial para conferir (versão simples de 31/10/2026: só o cliente é obrigatório; valor fechado ou por linha;
// linhas ligadas a produto, patrocínio ou projeto especial) e cria o PI em Rascunho, aberto em edição, com o original
// da agência guardado à parte (sempre deitado, folha.js). Daí segue o fluxo de sempre (Enviar para a OPEC…).
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

  // ---------- 3. conferência (versão simples, aprovada em 31/10/2026: artifact "Importar PI · versão simples") ----------
  // Só o cliente é obrigatório. Valor fechado do contrato ou preço de cada linha; linha ligada a produto, patrocínio,
  // projeto especial ou com o nome da agência; quantidade e dias ajustáveis; o PI abre em edição para terminar.
  const chaveDe = l => digitos((l.agencia && l.agencia.cnpj) || (l.cliente && l.cliente.cnpj)) || sem((l.agencia && l.agencia.nome) || (l.cliente && l.cliente.nome));
  const acha = (tipo, dados) => { if (!dados) return null; const doc = digitos(dados.cnpj), n = sem(dados.nome), r = sem(dados.razao_social);
    const ps = S.pessoas(tipo);
    return (doc && ps.find(p => digitos(p.documento) === doc)) || (n && ps.find(p => sem(p.nome) === n || sem(p.razao_social) === n)) || (r && ps.find(p => sem(p.razao_social) === r || sem(p.nome) === r)) || null; };
  const ordem = (a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome);
  const programas = () => S.db.produtos.filter(p => p.tipo === 'programa' && !['digital', 'ooh', 'patrocinio', 'projeto', 'projeto_modelo'].includes(p.secao) && p.ativo !== false).sort(ordem);
  const cotas = () => S.db.produtos.filter(p => p.tipo === 'programa' && p.secao === 'patrocinio' && p.ativo !== false).sort(ordem);
  const projetos = () => S.db.produtos.filter(p => p.tipo === 'programa' && p.secao === 'projeto' && p.ativo !== false).sort(ordem);
  const formatos = () => S.db.produtos.filter(p => p.tipo === 'formato' && p.secao !== 'digital' && p.ativo !== false).sort(ordem);
  const textoLinha = l => sem(`${l.programa || ''} ${l.duracao || ''}`);
  const GIRO = '__giro';
  // Valor da linha "No SONVI": id do produto, 'cota:<id>', 'proj:<id>' ou '__texto' (manter o nome da agência)
  const prodDe = v => { const id = String(v || '').replace(/^(cota|proj):/, ''); return id && id !== '__texto' ? S.db.produtos.find(p => p.id === id) || null : null; };
  const porNome = nome => { const n = sem(nome); if (!n) return ''; const c = cotas().find(p => sem(p.nome) === n), j = projetos().find(p => sem(p.nome) === n), p = programas().find(q => sem(q.nome) === n);
    return c ? 'cota:' + c.id : j ? 'proj:' + j.id : p ? p.id : ''; };
  const contem = txt => { const t = sem(txt); if (!t) return '';   // a linha cita o nome de um patrocínio ou projeto ("AQUI E NATIVA SEG-SEXTA…")
    const c = cotas().find(p => sem(p.nome).length > 3 && t.includes(sem(p.nome))), j = projetos().find(p => sem(p.nome).length > 3 && t.includes(sem(p.nome)));
    return c ? 'cota:' + c.id : j ? 'proj:' + j.id : ''; };
  const ehGrupo = v => /^(cota|proj):/.test(v || '');
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const mesesDe = l => { const ms = new Set(); (l.linhas || []).forEach(x => (x.meses || []).forEach(m => { if (/^\d{4}-\d{2}$/.test(m.mes || '')) ms.add(m.mes); }));
    const per = l.periodo || {}; if (/^\d{4}-\d{2}/.test(per.inicio || '')) { let m = per.inicio.slice(0, 7); const fim = /^\d{4}-\d{2}/.test(per.fim || '') ? per.fim.slice(0, 7) : m;
      for (let k = 0; k < 13 && m <= fim; k++) { ms.add(m); const [y, mm] = m.split('-').map(Number), d = new Date(y, mm, 1); m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } }
    if (!ms.size) ms.add(S.today().slice(0, 7)); return [...ms].sort(); };

  const preparar = async (l, file) => {
    const chave = chaveDe(l);
    let mapas = [], repetido = null;
    try { mapas = await S.q(S.sb.from('pi_import_mapas').select('*').eq('veiculo_id', S.ui.vehicleId).eq('agencia_chave', chave)); } catch (e) { console.error(e); }
    if (l.numero_pi) { try { const r = await S.q(S.sb.from('pi_importacoes').select('pi_id, numero_agencia').eq('veiculo_id', S.ui.vehicleId).eq('agencia_chave', chave).eq('numero_agencia', String(l.numero_pi).trim()).not('pi_id', 'is', null)); repetido = (r || [])[0] || null; } catch (e) { console.error(e); } }
    const fmts = formatos();
    const linhas = (l.linhas || []).map((x, i) => {
      const m = (mapas || []).find(k => k.texto === textoLinha(x));
      const sug = x.cota_sugerida_id && prodDe(x.cota_sugerida_id) ? (prodDe(x.cota_sugerida_id).secao === 'projeto' ? 'proj:' : 'cota:') + x.cota_sugerida_id
        : x.produto_sugerido_id && programas().some(p => p.id === x.produto_sugerido_id) ? x.produto_sugerido_id : '';
      const prog = m ? (m.programa === '' ? '__texto' : porNome(m.programa) || '__texto') : contem(x.programa) || sug || '__texto';
      const f = m ? fmts.find(q => q.nome === m.formato) : fmts.find(q => q.id === x.formato_sugerido_id);
      // A IA manda a grade curta por mês ({ mes:'2026-11', dias:'1:3,2:2' }); "dias" com a data completa ainda é aceito
      const curtos = [];
      (x.meses || []).forEach(mm => { if (!/^\d{4}-\d{2}$/.test(String(mm.mes || ''))) return;
        String(mm.dias || '').split(/[,;\s]+/).forEach(p => { const [dd, q] = p.split(':'); const n = Number(dd);
          if (n >= 1 && n <= 31) curtos.push({ data:`${mm.mes}-${String(n).padStart(2, '0')}`, qtd:Number(q || 1) }); }); });
      const dias = (curtos.length ? curtos : (x.dias || [])).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.data) && Number(d.qtd) > 0);
      const ins = dias.reduce((s, d) => s + Number(d.qtd), 0) || Number(x.insercoes_total) || 0;
      return { k:S.uid(), orig:x, nome:String(x.programa || '').trim(), prog, fmt:f ? f.id : '__texto', sozinho:!!m || prog !== '__texto', unit:Number(x.unitario) || 0, ins, dias, bonus:!!x.bonificada };
    });
    const unitsZero = !linhas.some(x => !x.bonus && x.unit > 0), docBruto = Number(l.total_bruto) || 0;
    const mg = (mapas || []).find(k => k.texto === GIRO), giro = mg && /^(0|90|180|270)$/.test(mg.programa) ? Number(mg.programa) : [0, 90, 180, 270].includes(Number(l.giro)) && l.giro !== null && l.giro !== undefined ? Number(l.giro) : null;
    if (imp && imp.url) URL.revokeObjectURL(imp.url);
    imp = { l, file, url:URL.createObjectURL(file), tipo:file.type, chave, repetido, linhas, meses:mesesDe(l), giro, giroLido:giro,
      modo:unitsZero && docBruto > 0 ? 'fechado' : 'linhas', valor:docBruto || linhas.reduce((t, x) => t + (x.bonus ? 0 : x.unit * x.ins), 0), com:Number(l.comissao_pct) || 0,
      juntar:linhas.some(x => x.prog.startsWith('cota:')) && linhas.some(x => !ehGrupo(x.prog)),
      cli:(acha('cliente', l.cliente) || {}).id || '', ag:l.agencia && (l.agencia.nome || l.agencia.cnpj) ? ((acha('agencia', l.agencia) || {}).id || '') : '__direta',
      assinado:typeof l.assinado === 'boolean' ? l.assinado : null,
      titulo:String(l.campanha || '').trim() && !/^\d{4}$/.test(String(l.campanha).trim()) ? String(l.campanha).trim() : `${(l.cliente && l.cliente.nome) || 'PI'} · ${cap(MESES[Number(mesesDe(l)[0].slice(5)) - 1])}` };
  };
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : '';

  // A cota (ou projeto) a que as outras linhas pertencem, quando "fazem parte do patrocínio" está marcado
  const grupoPrincipal = () => { const x = imp.linhas.find(y => ehGrupo(y.prog)); return x ? x.prog : ''; };
  const parte = x => imp.juntar && !ehGrupo(x.prog) && !!grupoPrincipal();
  const nomeSonvi = x => { const v = parte(x) ? grupoPrincipal() : x.prog, p = prodDe(v); return p ? p.nome.trim() : [x.nome || 'Linha', x.orig.horario].filter(Boolean).join(' · '); };
  const nomeFmt = x => x.fmt === '__texto' || !x.fmt ? (x.orig.duracao || '') : (formatos().find(f => f.id === x.fmt) || {}).nome || x.orig.duracao || '';
  // Dias da semana de onde a linha roda quando o PI não trouxe a grade: do patrocínio/produto; senão todos
  const diasSemana = x => { const p = prodDe(parte(x) ? grupoPrincipal() : x.prog); const d = p && (S.diasDoTexto(p.detalhe) || (p.dados && p.dados.dias)); return d && d.length ? d : [0, 1, 2, 3, 4, 5, 6]; };
  // Grade final da linha: a do PI ou, sem ela, a quantidade distribuída no(s) mês(es) do PI
  const diasFinais = x => { if (x.dias.length) return x.dias; if (!(x.ins > 0)) return [];
    const ms = imp.meses, out = []; let resto = x.ins;
    ms.forEach((m, k) => { const q = k === ms.length - 1 ? resto : Math.round(x.ins / ms.length); resto -= q;
      const r = S.distribuirMes(m, q, diasSemana(x), 1, 31); Object.entries(r.dias).forEach(([d, n]) => out.push({ data:`${m}-${String(d).padStart(2, '0')}`, qtd:n })); });
    return out; };
  // Unitário de cada linha: valor fechado dividido pelas inserções (linhas não bonificadas) ou o preço da linha
  const insPagas = () => imp.linhas.reduce((t, x) => t + (x.bonus ? 0 : Number(x.ins) || 0), 0);
  const unitDe = x => x.bonus ? 0 : imp.modo === 'fechado' ? (insPagas() ? imp.valor / insPagas() : 0) : x.unit;
  const somas = () => { const bruto = imp.modo === 'fechado' ? Number(imp.valor) || 0 : imp.linhas.reduce((s, x) => s + (x.bonus ? 0 : x.unit * x.ins), 0), com = imp.ag !== '__direta' ? Number(imp.com) || 0 : 0,
    desc = imp.modo === 'linhas' ? Number(imp.l.desconto_valor) || 0 : 0, total = Math.max(0, bruto - desc); return { bruto, desc, total, com, comissao:total * com / 100, liquido:total - total * com / 100 }; };
  const pendencias = () => imp.cli ? [] : ['o cliente'];

  let folha = null, folhaDe = null;   // o visualizador fica montado entre os desenhos da tela
  S.views.importar = () => {
    if (!imp) { setTimeout(() => S.go('/pis'), 0); return { title:'Importar PI', body:'' }; }
    const l = imp.l, s = somas(), pend = pendencias(), v = S.veh(), fmts = formatos();
    const docLiq = Number(l.total_liquido) || 0, docBruto = Number(l.total_bruto) || 0;
    const confere = docLiq ? { alvo:docLiq, nosso:s.liquido, rot:'líquido' } : docBruto ? { alvo:docBruto, nosso:s.bruto, rot:'bruto' } : null;
    const bate = confere && Math.abs(confere.alvo - confere.nosso) < 0.05;
    const vLido = sem(l.veiculo && l.veiculo.nome), outroVeic = vLido && !vLido.includes(sem(v.nome).split(' ')[0]) && !(v.sigla && vLido.includes(sem(v.sigla)));
    const cliAchado = imp.cli && S.pessoa(imp.cli), agAchada = imp.ag && imp.ag !== '__direta' && S.pessoa(imp.ag), per = l.periodo || {}, pg = l.pagamento || {};
    const mesesTxt = imp.meses.map(m => `${cap(MESES[Number(m.slice(5)) - 1])}/${m.slice(0, 4)}`).join(', ');
    const cliHtml = cliAchado ? `<div class="ip-it"><small>Cliente</small><b>${esc(cliAchado.nome)}</b></div>`
      : `<div class="ip-cli"><div class="ip-it"><small>Cliente</small><b>${esc((l.cliente && (l.cliente.nome || l.cliente.razao_social)) || 'não lido')}</b></div><span class="pill" style="--tone:var(--orange)">Não cadastrado</span>
          <button class="btn sm pri" data-act="ipCadCli">Cadastrar</button><select data-ip="cli" aria-label="Escolher um cliente já cadastrado" class="ip-sel-curto"><option value="">Escolher…</option>${S.pessoas('cliente').map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>`;
    const agHtml = imp.ag === '' ? `<div class="ip-cli"><div class="ip-it"><small>Agência</small><b>${esc((l.agencia && l.agencia.nome) || '—')}</b></div><span class="pill" style="--tone:var(--orange)">Não cadastrada</span>
          ${S.pode('diretor') ? '<button class="btn sm" data-act="ipCadAg">Cadastrar no grupo</button>' : ''}<select data-ip="ag" aria-label="Escolher a agência" class="ip-sel-curto"><option value="">Escolher…</option><option value="__direta">Venda direta</option>${S.pessoas('agencia').map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>`
      : `<div class="ip-it"><small>Agência</small><b>${imp.ag === '__direta' ? 'Venda direta' : esc(agAchada ? agAchada.nome : '')}${imp.ag !== '__direta' ? ` · ${Number(imp.com) || 0}%` : ''}</b><button class="ip-troca" data-act="ipTrocaAg">Trocar</button></div>`;
    const pedido = `<section class="card"><div class="hd"><h2>Pedido</h2><span>Nada foi gravado ainda</span></div>
      <div class="ip-resumo">${cliHtml}${agHtml}<div class="ip-it"><small>Nº na agência</small><b>${esc(l.numero_pi || '—')}</b></div><div class="ip-it"><small>Veiculação</small><b>${esc(mesesTxt)}</b></div>
        <span class="grow"></span>${imp.assinado === true ? '<span class="pill" style="--tone:var(--green)">Assinado</span>' : imp.assinado === false ? '<span class="pill" style="--tone:var(--orange)">Sem assinatura</span>' : ''}</div>
      <details class="ip-mais"${S.ui.ipMais ? ' open' : ''}><summary>Mais dados do PI</summary><div class="ip-mais-g">
        <label class="f">Título do PI no SONVI<input data-ip="titulo" value="${esc(imp.titulo)}"></label>
        <label class="f">O PI da agência está assinado?<select data-ip="assinado"><option value="sim"${imp.assinado === true ? ' selected' : ''}>Assinado / carimbado</option><option value="nao"${imp.assinado === false ? ' selected' : ''}>Sem assinatura</option><option value=""${imp.assinado === null ? ' selected' : ''}>Não sei</option></select></label>
        <div class="ip-it"><small>Período no documento</small><b>${per.inicio ? `${S.dfmt(per.inicio)} a ${S.dfmt(per.fim || per.inicio)}` : '—'}</b></div>
        <div class="ip-it"><small>Pagamento</small><b>${esc([pg.forma, pg.vencimento ? 'vence ' + S.dfmt(pg.vencimento) : ''].filter(Boolean).join(' · ') || '—')}</b></div>
        ${l.observacoes ? `<div class="ip-it ip-full"><small>Observações (vão para o PI)</small><span>${esc(l.observacoes)}</span></div>` : ''}
        ${(l.duvidas || []).filter(Boolean).length ? `<div class="ip-it ip-full"><small>A leitura avisou</small><span>${(l.duvidas || []).filter(Boolean).map(esc).join(' · ')}</span></div>` : ''}</div></details></section>`;
    const valor = `<section class="card"><div class="hd"><h2>Valor</h2><span>${imp.modo === 'fechado' && !imp.linhas.some(x => x.unit > 0) ? 'O PI veio com as linhas zeradas: valor fechado do contrato' : 'Escolha como o valor entra no PI'}</span></div>
      <div class="ip-modos" role="radiogroup" aria-label="Como o valor entra">
        <button type="button" role="radio" aria-checked="${imp.modo === 'fechado'}" class="ip-modo${imp.modo === 'fechado' ? ' on' : ''}" data-act="ipModo" data-v="fechado"><b>Valor fechado do contrato</b><span>Um valor só para o mês. O SONVI divide entre as linhas pelas inserções.</span></button>
        <button type="button" role="radio" aria-checked="${imp.modo === 'linhas'}" class="ip-modo${imp.modo === 'linhas' ? ' on' : ''}" data-act="ipModo" data-v="linhas"><b>Preço de cada linha</b><span>Usa o unitário de cada linha do PI da agência.</span></button></div>
      <div class="ip-contas">
        <div><small>Valor bruto${imp.meses.length > 1 ? ' do contrato' : ' do mês'}</small>${imp.modo === 'fechado' ? `<input class="ip-valor" data-ip="valor" data-mask="dec" inputmode="decimal" value="${S.nfmt(imp.valor)}" aria-label="Valor bruto do contrato">` : `<b>${brl(s.bruto)}</b>`}</div>
        <div><small>Comissão da agência</small>${imp.ag === '__direta' ? '<b>sem agência</b>' : `<span class="ip-pct"><input data-ip="com" data-mask="dec" inputmode="decimal" value="${S.nfmt(imp.com).replace(/,00$/, '')}" aria-label="Comissão da agência em %">% <b>${brl(s.comissao)}</b></span>`}</div>
        <div><small>Líquido para a ${esc(v.nome)}</small><b>${brl(s.liquido)}</b></div>
        <div><small>Confere com o PI</small>${confere ? `<b class="${bate ? 'ip-ok-t' : 'ip-al-t'}">${bate ? S.svg('check') + ' ' : ''}${brl(confere.alvo)}</b>${bate ? '' : `<small class="ip-al-t">o ${confere.rot} da tela é ${brl(confere.nosso)}</small>`}` : '<b class="muted">sem total</b>'}</div></div></section>`;
    const temGrupo = grupoPrincipal(), pg2 = prodDe(temGrupo);
    const opts = x => { const v_ = x.prog, o = (val, nome) => `<option value="${val}"${val === v_ ? ' selected' : ''}>${esc(nome)}</option>`;
      return `${cotas().length ? `<optgroup label="Patrocínios">${cotas().map(p => o('cota:' + p.id, p.nome)).join('')}</optgroup>` : ''}${projetos().length ? `<optgroup label="Projetos especiais">${projetos().map(p => o('proj:' + p.id, p.nome)).join('')}</optgroup>` : ''}
        <optgroup label="Produtos">${programas().map(p => o(p.id, p.nome)).join('')}</optgroup><optgroup label="Outro">${o('__texto', `Manter "${(x.nome || 'linha').slice(0, 40)}"`)}</optgroup>`; };
    const optF = x => `${fmts.map(f => `<option value="${f.id}"${f.id === x.fmt ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}<option value="__texto"${x.fmt === '__texto' ? ' selected' : ''}>Manter "${esc(x.orig.duracao || 'sem duração')}"</option>`;
    const linhasHtml = imp.linhas.map((x, n) => { const df = diasFinais(x), pt = parte(x);
      return `<tr${!(x.ins > 0) ? ' class="alerta"' : ''}><td>${x.nova ? `<input data-ip="nome" data-k="${x.k}" value="${esc(x.nome)}" placeholder="Programa ou faixa" aria-label="Nome da linha">` : `<b>${esc(x.nome || '—')}</b>`}<small class="muted">${esc([x.orig.duracao, x.orig.horario].filter(Boolean).join(' · '))}${x.bonus ? ' · bonificada' : ''}</small></td>
        <td>${pt ? `<div class="ip-parte">${esc(pg2.nome)}</div><small class="muted">Faz parte do ${temGrupo.startsWith('proj:') ? 'projeto' : 'patrocínio'}</small>` : `<select data-ip="prog" data-k="${x.k}" aria-label="Produto no SONVI"${ehGrupo(x.prog) ? ' class="ip-grupo"' : ''}>${opts(x)}</select>`}
          <select data-ip="fmt" data-k="${x.k}" aria-label="Duração no SONVI">${optF(x)}</select>${x.sozinho && x.prog !== '__texto' && !pt ? '<small class="ip-ok">Ligado sozinho</small>' : ''}</td>
        <td class="r"><input class="ip-qtd" data-ip="ins" data-k="${x.k}" data-mask="int" inputmode="numeric" value="${x.ins || ''}" placeholder="0" aria-label="Inserções de ${esc(x.nome)}"><small class="muted">${x.dias.length ? `${df.length} ${df.length === 1 ? 'dia' : 'dias'}` : x.ins > 0 ? `${df.length} dias (${esc(S.diasTexto(diasSemana(x)))})` : 'sem inserções'}</small></td>
        <td class="r nw">${x.bonus ? '<span class="muted">bonificada</span>' : brl(unitDe(x) * (Number(x.ins) || 0))}${imp.modo === 'linhas' ? `<small class="muted">${brl(x.unit)} cada</small>` : ''}</td>
        <td class="r"><span class="lin-acoes"><button class="btn sm" data-act="ipDias" data-k="${x.k}">Dias</button><button class="btn tres" data-act="ipTirar" data-k="${x.k}" aria-label="Tirar a linha ${esc(x.nome)}">×</button></span></td></tr>`; }).join('');
    const totIns = imp.linhas.reduce((t, x) => t + (Number(x.ins) || 0), 0);
    const linhas = `<section class="card"><div class="hd"><h2>Linhas</h2><span>${imp.linhas.length} ${imp.linhas.length === 1 ? 'linha' : 'linhas'} · ${totIns} inserções</span></div>
      ${temGrupo ? `<label class="chk ip-juntar"><input type="checkbox" data-ip="juntar"${imp.juntar ? ' checked' : ''}>As outras linhas fazem parte do ${temGrupo.startsWith('proj:') ? 'projeto' : 'patrocínio'} <b>${esc(pg2.nome)}</b>${pg2.detalhe ? ` (${esc(pg2.detalhe.split('\n').join(' · '))})` : ''}</label>` : ''}
      <div class="scroll"><table class="ip-tab"><thead><tr><th>No PI da agência</th><th>No SONVI</th><th class="r">Inserções</th><th class="r">Valor</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhasHtml || '<tr><td colspan="5" class="muted">Nenhuma linha foi lida. Use "+ Linha".</td></tr>'}</tbody></table></div>
      <div class="row mid" style="margin-top:10px;gap:10px;flex-wrap:wrap"><button class="btn sm" data-act="ipLinha">${S.svg('mais')}Linha</button><span class="muted small grow">Linha sem produto entra com o nome que a agência escreveu. Sem a grade do PI, as inserções são distribuídas no mês pelos dias do produto. "Dias" ajusta.</span></div></section>`;
    const body = `
      ${imp.repetido ? `<div class="note aviso">Este PI da agência (nº ${esc(l.numero_pi)}) já foi importado neste veículo (dá para criar outro mesmo assim). <a href="#/pi/${imp.repetido.pi_id}" data-go="/pi/${imp.repetido.pi_id}">Abrir o PI que já existe</a></div>` : ''}
      ${outroVeic ? `<div class="note aviso">O PI parece ser para <b>${esc(l.veiculo.nome)}</b>, e você está na <b>${esc(v.nome)}</b>. Se for de outro veículo, troque de veículo no menu e importe de novo.</div>` : ''}
      <div id="ip-folha" class="ip-folha"></div>
      <div class="ip-blocos">${pedido}${valor}${linhas}</div>
      <div class="ip-rod card">${pend.length ? `<span class="ip-falta">Falta só: ${esc(pend.join(' · '))}</span>` : '<span class="ip-pronto">Pronto para criar</span>'}<span class="muted small">O PI abre em edição para você terminar de ajustar.</span><span class="grow"></span>
        <button class="btn" data-act="ipCancelar">Cancelar</button><button class="btn pri" data-act="ipCriar"${pend.length ? ' disabled' : ''}>${S.svg('check')}Criar PI</button></div>`;
    setTimeout(poeFolha, 0);
    return { title:`<span class="sub"><a data-go="/pis">PIs</a>${S.svg('seta', 14)}${esc(v.nome)}</span>Conferir PI importado`, actions:'', body };
  };
  // Visualizador montado uma vez por importação e reposto no lugar a cada desenho (não recarrega o PDF)
  const poeFolha = () => { const lugar = document.getElementById('ip-folha'); if (!lugar || !imp) return;
    if (!folha || folhaDe !== imp) { folha = document.createElement('div'); folhaDe = imp;
      S_FOLHA().montar(folha, { url:imp.url, tipo:imp.tipo, nome:imp.file.name, titulo:`${imp.l.numero_pi ? 'Nº ' + imp.l.numero_pi + ' · ' : ''}${(imp.l.agencia && imp.l.agencia.nome) || imp.file.name}`, giro:imp.giro, aoGirar:g => { imp.giro = g; }, abrir:true }); }
    lugar.replaceChildren(folha); };
  const S_FOLHA = () => window.SONVI_FOLHA;

  // Mudanças na conferência (sem ir para a nuvem)
  const linhaK = k => imp.linhas.find(x => x.k === k);
  // Nova quantidade: redistribui nos mesmos dias da semana e meses que a linha já tinha
  const novaQtd = (x, q) => { x.ins = q; if (!x.dias.length) return;
    const ms = [...new Set(x.dias.map(d => d.data.slice(0, 7)))].sort(), out = []; let resto = q;
    ms.forEach((m, k) => { const doMes = x.dias.filter(d => d.data.startsWith(m)), sem_ = [...new Set(doMes.map(d => new Date(d.data + 'T12:00').getDay()))];
      const qm = k === ms.length - 1 ? resto : Math.round(q * doMes.reduce((t, d) => t + d.qtd, 0) / x.dias.reduce((t, d) => t + d.qtd, 0)); resto -= qm;
      const dias = doMes.map(d => +d.data.slice(8)), r = S.distribuirMes(m, qm, sem_, Math.min(...dias), Math.max(...dias));
      Object.entries(r.dias).forEach(([d, n]) => out.push({ data:`${m}-${String(d).padStart(2, '0')}`, qtd:n })); });
    x.dias = out; };
  document.addEventListener('change', e => {
    const el = e.target.closest && e.target.closest('[data-ip]'); if (!el || !imp) return;
    const k = el.dataset.ip, x = el.dataset.k ? linhaK(el.dataset.k) : null;
    if (k === 'prog' && x) { x.prog = el.value; x.sozinho = false; if (el.value.startsWith('cota:') || el.value.startsWith('proj:')) imp.juntar = imp.juntar || imp.linhas.filter(y => !ehGrupo(y.prog)).length > 0; }
    else if (k === 'fmt' && x) { x.fmt = el.value; x.sozinho = false; }
    else if (k === 'ins' && x) novaQtd(x, parseInt(String(el.value).replace(/\D/g, '')) || 0);
    else if (k === 'nome' && x) { x.nome = el.value; return; }
    else if (k === 'juntar') imp.juntar = el.checked;
    else if (k === 'valor') imp.valor = S.num(el.value);
    else if (k === 'com') imp.com = S.num(el.value);
    else if (k === 'cli') imp.cli = el.value;
    else if (k === 'ag') { imp.ag = el.value; const a = S.pessoa(el.value); if (a && a.comissao !== undefined && !(Number(imp.l.comissao_pct) > 0)) imp.com = S.num(a.comissao); }
    else if (k === 'assinado') { imp.assinado = el.value === 'sim' ? true : el.value === 'nao' ? false : null; return; }
    else if (k === 'titulo') { imp.titulo = el.value; return; }
    S.render();
  });
  document.addEventListener('input', e => { if (!imp || !e.target.dataset) return; const k = e.target.dataset.ip;
    if (k === 'titulo') imp.titulo = e.target.value; else if (k === 'nome') { const x = linhaK(e.target.dataset.k); if (x) x.nome = e.target.value; } });
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('ip-mais')) S.ui.ipMais = e.target.open; }, true);

  // Janela "Dias" da linha: mês, quantidade, dias da semana e intervalo (a mesma conta do Distribuir inserções do PI)
  const dlgDias = x => {
    const ms = [...new Set([...imp.meses, ...x.dias.map(d => d.data.slice(0, 7))])].sort(), m0 = (x.dias[0] && x.dias[0].data.slice(0, 7)) || ms[0];
    const ws = x.dias.length ? [...new Set(x.dias.map(d => new Date(d.data + 'T12:00').getDay()))] : diasSemana(x);
    const qMes = m => x.dias.filter(d => d.data.startsWith(m)).reduce((t, d) => t + d.qtd, 0);
    S.dialog(`<h2>Dias · ${esc(x.nome || 'linha')}</h2>
      <div class="g2">${ms.length > 1 ? `<label class="f">Mês<select name="mes">${ms.map(m => `<option value="${m}"${m === m0 ? ' selected' : ''}>${cap(MESES[Number(m.slice(5)) - 1])}/${m.slice(0, 4)}</option>`).join('')}</select></label>` : `<input type="hidden" name="mes" value="${m0}">`}
        <label class="f">Inserções no mês<input name="qtd" data-mask="int" inputmode="numeric" required value="${qMes(m0) || x.ins || ''}"></label>
        <label class="f">Do dia<input name="de" data-mask="int" inputmode="numeric" value="1"></label><label class="f">Até o dia<input name="ate" data-mask="int" inputmode="numeric" value="31"></label></div>
      <fieldset class="pj-diasf"><legend class="form-sec">Dias da semana</legend><div class="pj-chips">${S.SEMANA.map(k => `<label class="pj-chip"><input type="checkbox" name="dia_${k}"${ws.includes(k) ? ' checked' : ''}><span>${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][k]}</span></label>`).join('')}</div></fieldset>
      <p class="muted small" id="ipDiasPrev"></p>
      <div class="row" style="margin-top:14px"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Aplicar</button></div>`,
      f => { const dias = S.SEMANA.filter(k => f['dia_' + k] === 'on'); if (!dias.length) return S.toast('Marque ao menos um dia da semana.');
        const r = S.distribuirMes(f.mes, parseInt(f.qtd) || 0, dias, parseInt(f.de) || 1, parseInt(f.ate) || 31);
        x.dias = x.dias.filter(d => !d.data.startsWith(f.mes)).concat(Object.entries(r.dias).map(([d, n]) => ({ data:`${f.mes}-${String(d).padStart(2, '0')}`, qtd:n })));
        x.ins = x.dias.reduce((t, d) => t + d.qtd, 0); if (!imp.meses.includes(f.mes)) imp.meses = [...imp.meses, f.mes].sort(); S.render(); });
    const dl = document.getElementById('dlg'), prev = () => { const fd = Object.fromEntries(new FormData(dl.querySelector('form'))), dias = S.SEMANA.filter(k => fd['dia_' + k] === 'on');
      const r = S.distribuirMes(fd.mes, parseInt(fd.qtd) || 0, dias, parseInt(fd.de) || 1, parseInt(fd.ate) || 31), vs = Object.values(r.dias);
      document.getElementById('ipDiasPrev').textContent = r.total ? `${r.total} ${r.total === 1 ? 'inserção' : 'inserções'} em ${vs.length} ${vs.length === 1 ? 'dia' : 'dias'}: ${Math.min(...vs) === Math.max(...vs) ? Math.min(...vs) : `${Math.min(...vs)} a ${Math.max(...vs)}`} por dia` : 'Nenhum dia no intervalo.'; };
    dl.querySelector('form').addEventListener('input', prev); dl.querySelector('form').addEventListener('change', prev); prev(); };

  // ---------- 4. criar o PI ----------
  const criar = () => S.run(async () => {
    const l = imp.l, v = S.veh(), usadas = imp.linhas.filter(x => Number(x.ins) > 0);
    if (!usadas.length) throw new Error('Nenhuma linha com inserções. Coloque a quantidade em pelo menos uma linha.');
    const porMes = {};
    usadas.forEach(x => diasFinais(x).forEach(d => { const m = d.data.slice(0, 7); ((porMes[m] = porMes[m] || {})[x.k] = porMes[m][x.k] || {})[String(Number(d.data.slice(8, 10)))] = Number(d.qtd); }));
    const grids = Object.keys(porMes).sort().map(m => ({ id:S.uid(), period:m, praca:v.cidade || '', items:usadas.filter(x => porMes[m][x.k]).map(x => ({
      id:S.uid(), piece:'', f1:nomeSonvi(x), f2:nomeFmt(x), days:porMes[m][x.k], unit:unitDe(x), disc:{ type:'pct', value:0 }, bonus:x.bonus, faixa:x.orig.horario || '' })) }));
    const temAg = imp.ag && imp.ag !== '__direta', pg = l.pagamento || {};
    const dados = S.piNorm({ dados:{ commission:{ type:'pct', value:temAg ? Number(imp.com) || 0 : 0 }, discount:{ type:'brl', value:imp.modo === 'linhas' ? Number(l.desconto_valor) || 0 : 0 }, grids, marca:'comercial',   // PI importado sai sempre com a marca da empresa comercial (Head 14), de qualquer veículo (31/10/2026)
      billing:{ type:temAg ? 10 : 20, firstDue:/^\d{4}-\d{2}-\d{2}$/.test(pg.vencimento || '') ? pg.vencimento : '', installments:1, method:pg.forma || 'Boleto', obsClient:String(l.observacoes || '').slice(0, 2000) },
      importado:{ numero:String(l.numero_pi || ''), agencia:(l.agencia && l.agencia.nome) || '', arquivo:imp.file.name, em:new Date().toISOString(), total_documento:Number(l.total_bruto) || null, modo:imp.modo } } }).dados;
    const pi = S.piNorm(await S.q(S.sb.rpc('criar_pi', { p_veiculo:S.ui.vehicleId, p_titulo:imp.titulo.trim() || 'PI importado', p_cliente:imp.cli, p_agencia:temAg ? imp.ag : null, p_projeto:'', p_dados:dados })));
    // Original da agência guardado à parte das mídias (database/067), com o giro (073); vai junto para a OPEC
    try { await S.guardarOriginal(pi, imp.file, imp.assinado, imp.giro); }
    catch (e) { console.error(e); S.toast('O PI foi criado, mas o original da agência não subiu.'); }
    try { await S.q(S.sb.from('pi_importacoes').insert({ veiculo_id:pi.veiculo_id, pi_id:pi.id, agencia_chave:imp.chave, numero_agencia:String(l.numero_pi || '').trim(), arquivo:imp.file.name })); } catch (e) { console.error(e); }
    // Aprende por agência: cada linha (como ela escreve) → produto/patrocínio e duração; e o giro da folha
    try { const agora = new Date().toISOString(), aprend = imp.linhas.filter(x => !x.nova && x.nome).map(x => ({ veiculo_id:pi.veiculo_id, agencia_chave:imp.chave, texto:textoLinha(x.orig),
        programa:x.prog === '__texto' && !parte(x) ? '' : nomeSonvi(x), formato:x.fmt === '__texto' ? '' : nomeFmt(x), atualizado_em:agora }));
      if (imp.giro !== null && imp.giro !== undefined) aprend.push({ veiculo_id:pi.veiculo_id, agencia_chave:imp.chave, texto:GIRO, programa:String(imp.giro), formato:'', atualizado_em:agora });
      if (aprend.length) await S.q(S.sb.from('pi_import_mapas').upsert(aprend, { onConflict:'veiculo_id,agencia_chave,texto' })); } catch (e) { console.error(e); }
    S.db.pis.push(pi); URL.revokeObjectURL(imp.url); imp = null; folha = null; folhaDe = null;
    S.ui.tab = 'detalhes'; S.piEntrar(pi); location.hash = '/pi/' + pi.id;
    return pi;
  }, { titulo:'PI criado', sub:'Está aberto em edição: confira as grades e salve.' });

  S.importarUsar = async (l, f) => { await preparar(l, f); S.go('/importar'); };   // testes

  Object.assign(S.actions, {
    piImportar: () => abrir(),
    ipCancelar: async () => { if (!await S.confirmar('Descartar esta importação? Nada foi gravado.', { ok:'Descartar', perigo:true })) return; if (imp) URL.revokeObjectURL(imp.url); imp = null; folha = null; S.go('/pis'); },
    ipTrocaAg: () => { imp.ag = ''; S.render(); },
    ipMais: () => {},
    ipModo: d => { imp.modo = d.v; if (d.v === 'fechado' && !(imp.valor > 0)) imp.valor = imp.linhas.reduce((t, x) => t + (x.bonus ? 0 : x.unit * x.ins), 0); S.render(); },
    ipDias: d => { const x = linhaK(d.k); if (x) dlgDias(x); },
    ipTirar: async d => { const x = linhaK(d.k); if (!x) return; if (!await S.confirmar(`Tirar a linha "${x.nome || 'sem nome'}"?`, { ok:'Tirar', perigo:true })) return; imp.linhas = imp.linhas.filter(y => y !== x); S.render(); },
    ipLinha: () => { imp.linhas.push({ k:S.uid(), orig:{ programa:'', duracao:'', horario:'' }, nome:'', prog:'__texto', fmt:'__texto', sozinho:false, unit:0, ins:0, dias:[], bonus:false, nova:true }); S.render(); },
    ipCriar: async () => { if (!imp || pendencias().length) return;
      if (imp.repetido && !await S.confirmar(`O PI nº ${imp.l.numero_pi} desta agência já foi importado neste veículo. Criar outro PI mesmo assim?`, { ok:'Criar outro PI' })) return;
      criar(); },
    ipCadCli: () => { const c = imp.l.cliente || {};
      S.run(async () => { const p = await S.salvar('pessoas', { veiculo_id:S.ui.vehicleId, tipo:'cliente', pessoa:digitos(c.cnpj).length === 11 ? 'pf' : 'pj', nome:String(c.nome || c.razao_social || 'Cliente').trim(),
          razao_social:c.razao_social || '', documento:c.cnpj || '', email:c.email || '', telefone:c.telefone || '', cidade:c.cidade || '', endereco:c.endereco || '', situacao:'ativo', consultor_id:S.pode('consultor') ? S.me.id : null });
        imp.cli = p.id; }, { titulo:'Cliente cadastrado', sub:c.nome || '' }); },
    ipCadAg: () => { const a = imp.l.agencia || {};
      S.run(async () => { await S.q(S.sb.rpc('salvar_agencia_grupo', { p_grupo:null, p_dados:{ nome:String(a.nome || a.razao_social).trim(), razao_social:a.razao_social || '', documento:a.cnpj || '', email:a.email || '', telefone:a.telefone || '', comissao:String(Number(imp.com) || 0) } }));
        await S.carregarVeiculo(); imp.ag = (acha('agencia', a) || {}).id || ''; }, { titulo:'Agência cadastrada', sub:'Vale em todos os veículos do grupo' }); },
  });
})();

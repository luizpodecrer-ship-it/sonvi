// SONVI · folha do extrato de comissão (aprovada em 31/10/2026, artifact "Extrato de comissão · layout"). Usada pela tela
// (Visualizar extrato, PDF) e pela página pública extrato.html. Logo e cores da empresa comercial (nunca SONVI): sem logo
// cadastrado, a Head 14 usa img/head14.png e as outras empresas o nome. Estilos .ex2-* em sonvi.css (sempre claro, como papel).
// Também monta a mensagem organizada do WhatsApp (SONVI_EXTRATO.whats).
(() => {
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  const dfmt = d => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : '';
  const pctTxt = n => n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : String(Math.round(Number(n) * 100) / 100).replace('.', ',') + '%';
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const hex = (c, r) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : r;
  // Tom claro da cor da empresa (o PDF não entende color-mix)
  const tom = (c, a) => { const n = parseInt(c.slice(1), 16), m = k => Math.round(((n >> k) & 255) * a + 255 * (1 - a)); return `rgb(${m(16)},${m(8)},${m(0)})`; };
  const mesNome = m => MESES[+String(m).slice(5) - 1];

  // Números da folha a partir dos dados (itens e resumo)
  const contas = d => { const it = d.itens || [], r = d.resumo || {};
    const com = it.reduce((t, i) => t + Number(i.comissao || 0), 0), rec = it.reduce((t, i) => t + Number(i.valor_pago ?? i.liquido ?? 0), 0), liq = it.reduce((t, i) => t + Number(i.liquido || 0), 0);
    const pcts = [...new Set(it.map(i => i.pct).filter(p => p !== null && p !== undefined).map(Number))];
    const pct = r.pct !== undefined && r.pct !== null ? Number(r.pct) : pcts.length === 1 ? pcts[0] : null;
    return { com, rec, liq, pct, pcts, vend:Number(r.liquido_vendido ?? r.vendido ?? 0), meta:Number(r.meta || 0), fila:Number(r.fila || 0), atrasos:r.atrasos || [] }; };
  const logoDe = (emp, base = '') => emp.logo || (emp.slug === 'head14' ? base + 'img/head14.png' : '');

  const html = (d, op = {}) => { const emp = d.empresa || {}, c = contas(d), cor = hex(emp.cor, '#2b5fb5'), cor2 = hex(emp.cor2, '#f1853d'), nomeEmp = String(emp.nome || '').split('·')[0].trim(), m = mesNome(d.mes);
    const logo = logoDe(emp, op.base || '');
    const sit = d.situacao === 'paga' ? `<span class="ex2-selo paga">✓ Paga em ${dfmt(d.pago_em).slice(0, 5)}</span>` : d.situacao === 'fechado' ? '<span class="ex2-selo fechado">Fechado · a pagar</span>' : '<span class="ex2-selo previa">Prévia · pode mudar até o fechamento</span>';
    const porV = {}; (d.itens || []).forEach(i => { (porV[i.veiculo_id || ''] = porV[i.veiculo_id || ''] || []).push(i); });
    const blocos = Object.entries(porV).map(([vid, its]) => { const v = (d.veiculos || {})[vid] || {}, cv = hex(v.cor, '#6b6f7a');
      return `<div class="ex2-sec"><h4><span class="ex2-vsel" style="background:${cv}">${esc(String(v.sigla || '').slice(0, 4))}</span>${esc(v.nome || 'Veículo')}</h4>
        <table><thead><tr><th>Mês</th><th>Cliente</th><th class="r ex2-esc">Líquido no mês</th>${c.pcts.length > 1 ? '<th class="r ex2-esc">%</th>' : ''}<th class="r">Comissão</th></tr></thead><tbody>
        ${its.map(i => `<tr><td class="nw">${cap(mesNome(i.mes_pago || i.mes_ref || d.mes))}</td><td>${esc(i.cliente)}<small>${esc(i.pi_no)}</small></td><td class="r ex2-esc">${brl(i.liquido)}</td>${c.pcts.length > 1 ? `<td class="r ex2-esc">${pctTxt(i.pct)}</td>` : ''}<td class="r"><b>${brl(i.comissao)}</b></td></tr>`).join('')}</tbody></table>
        ${Object.keys(porV).length > 1 ? `<div class="ex2-subt">Subtotal <b>${brl(its.reduce((t, i) => t + Number(i.comissao || 0), 0))}</b></div>` : ''}</div>`; }).join('');
    const metaPct = c.meta ? Math.round(c.vend / c.meta * 100) : null;
    const atr = '';   /* 05/11/2026: o SONVI não acompanha mais pagamento (comissão no mês em que o PI vai ao ar, database/081) */
    return `<article class="ex2" style="--ex-cor:${cor};--ex-cor2:${cor2};--ex-soft:${tom(cor, .09)};--ex-soft2:${tom(cor, .13)}">
      <div class="ex2-topo"><span class="ex2-logo">${logo ? `<img src="${esc(logo)}" alt="${esc(nomeEmp)}">` : `<b>${esc(nomeEmp)}</b>`}</span><span class="ex2-tit"><b>Extrato de comissão</b>${cap(m)} de ${String(d.mes).slice(0, 4)}</span></div>
      <div class="ex2-cab"><div class="ex2-pessoa"><span class="ex2-av">${esc(ini(d.nome))}</span><span><b>${esc(d.nome)}</b><small>Consultor${c.pct !== null ? ` · comissão de ${pctTxt(c.pct)} do líquido` : ''}</small></span></div>
        <span class="ex2-quando">${d.fechado_em ? `Fechado em ${dfmt(String(d.fechado_em).slice(0, 10))}` : 'Mês em andamento'}</span></div>
      <div class="ex2-hero"><div><small>${d.situacao === 'previa' ? `Sua comissão de ${m} até agora` : `Sua comissão de ${m}`}</small><div class="ex2-valor">${brl(c.com)}</div>
        <div class="ex2-conta">${c.pct !== null ? `${pctTxt(c.pct)} de ` : ''}${brl(c.liq)} líquido dos PIs que vão ao ar no mês</div></div>${sit}</div>
      <div class="ex2-cards"><div class="ex2-c"><small>PIs que geram comissão</small><b>${(d.itens || []).length}</b><span>enviados para a OPEC, no ar no mês</span></div>
        <div class="ex2-c"><small>Vendido no mês</small><b>${brl0(c.vend)}</b>${metaPct !== null ? `<span class="ex2-barra"><i style="width:${Math.min(100, metaPct)}%"${metaPct >= 100 ? ' class="ok"' : ''}></i></span><span>${metaPct}% da meta de ${brl0(c.meta)}</span>` : '<span>valor líquido que vai ao ar no mês</span>'}</div>
        <div class="ex2-c"><small>Percentual</small><b>${c.pct !== null ? pctTxt(c.pct) : '—'}</b><span>sobre o valor líquido</span></div></div>
      ${blocos || '<p class="ex2-vazio">Nenhum PI no ar no mês ainda.</p>'}
      <div class="ex2-total"><span>Total da comissão</span><b>${brl(c.com)}</b></div>
      ${atr}
      ${op.assinaturas === false ? '' : `<div class="ex2-ass"><div>${esc(nomeEmp)}</div><div>${esc(d.nome)}</div></div>`}
      <div class="ex2-pe"><span>${esc(nomeEmp)}${emp.cidade ? ` · ${esc(emp.cidade)}` : ''}</span><span>${d.situacao === 'previa' ? `Prévia gerada em ${dfmt(new Date().toLocaleDateString('sv-SE'))}` : `Mês fechado em ${dfmt(String(d.fechado_em || '').slice(0, 10))}`}</span></div></article>`; };

  // Mensagem do WhatsApp: saudação, bloco organizado (negrito e um emoji por linha), link e assinatura
  const whats = (d, { saudacao = '', link = '', assinatura = '' } = {}) => { const c = contas(d), m = mesNome(d.mes), metaPct = c.meta ? Math.round(c.vend / c.meta * 100) : null;
    const sit = d.situacao === 'paga' ? `✅ Paga em ${dfmt(d.pago_em).slice(0, 5)}` : d.situacao === 'fechado' ? '🔒 Mês fechado · comissão a pagar' : '⏳ Prévia: o mês ainda está aberto e o valor pode mudar';
    return [saudacao || `Olá, ${String(d.nome || '').split(' ')[0]}! 👋`, '', `*Extrato de comissão · ${cap(m)}/${String(d.mes).slice(0, 4)}*`, '',
      `💰 Comissão: *${brl(c.com)}*`, `🧾 ${(d.itens || []).length} PI${(d.itens || []).length === 1 ? '' : 's'} no mês${c.pct !== null ? ` · ${pctTxt(c.pct)} do líquido` : ''}`,
      `📈 Vendido no mês: ${brl(c.vend)}${metaPct !== null ? ` · meta ${metaPct}%` : ''}`, sit,
      ...(link ? ['', 'Veja o extrato completo:', link] : []), ...(assinatura ? ['', assinatura] : [])].join('\n'); };

  window.SONVI_EXTRATO = { html, whats, contas };
})();

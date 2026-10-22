// SONVI · regras financeiras do PI. Funções puras: recebem um PI e devolvem números, sem tocar na tela.
(() => {
  const num = S.num;
  S.BILLING = { 10:'Faturar bruto contra a Agência', 20:'Faturar bruto contra o Cliente', 30:'Faturar líquido + comissão contra a Agência', 40:'Faturar líquido contra a Agência', 50:'Faturar líquido contra o Cliente' };

  // Garante que um PI vindo da nuvem tenha todos os campos que a tela espera
  S.piNorm = pi => {
    const d = pi.dados = pi.dados || {};
    d.commission = d.commission || { type:'pct', value:0 }; d.fee = d.fee || { type:'brl', value:0 }; d.discount = d.discount || { type:'brl', value:0 };
    d.pieces = d.pieces || []; d.grids = d.grids || []; d.digital = d.digital || []; d.briefing = d.briefing || '';
    pi.entregas = pi.entregas && typeof pi.entregas === 'object' ? pi.entregas : {};
    d.billing = Object.assign({ type:10, firstDue:'', installments:1, method:'Boleto', obsClient:'', obsVehicle:'' }, d.billing);
    pi.resultado = Object.assign({ leads:0, value:0, desc:'' }, pi.resultado);
    return pi;
  };

  // Comissão, honorários e descontos podem ser em % ou em R$
  const share = (rule, base) => rule.type === 'pct' ? base * num(rule.value) / 100 : num(rule.value);

  S.itemCalc = it => {
    const ins = Object.values(it.days || {}).reduce((s, n) => s + num(n), 0), gross = ins * num(it.unit);
    const sub = Math.max(0, gross - share(it.disc, gross));
    return { ins, gross, sub: it.bonus ? 0 : sub }; // item bonificado não é cobrado
  };

  // Ação digital (database/034): entregas (texto + quantidade) e um valor só; a rádio define as datas depois.
  // Itens antigos (033) eram quantidade × valor unitário.
  S.digCalc = it => { if (Array.isArray(it.entregas)) return { qtd:it.entregas.reduce((s, e) => s + Math.max(0, parseInt(e.qtd) || 0), 0), sub:Math.round(num(it.valor) * 100) / 100 };
    const qtd = Math.max(0, parseInt(it.qtd) || 0); return { qtd, sub:Math.round(qtd * num(it.unit) * 100) / 100 }; };

  S.calc = pi => {
    const d = pi.dados; let media = 0, bonus = 0, ins = 0, pub = 0, radio = 0, digital = 0;
    d.grids.forEach(g => g.items.forEach(it => { const c = S.itemCalc(it); ins += c.ins; if (it.bonus) bonus += c.gross; else { media += c.sub; radio += c.sub; } }));
    (d.digital || []).forEach(it => { const c = S.digCalc(it); pub += c.qtd; media += c.sub; digital += c.sub; });
    const discount = Math.min(media, share(d.discount, media));
    const total = media - discount;                                          // o que o cliente paga pela mídia
    const commission = pi.agencia_id ? Math.min(total, share(d.commission, total)) : 0; // parte da agência; sem agência não há comissão
    const net = total - commission;                                          // o que fica com a rádio
    const fee = pi.agencia_id ? share(d.fee, total) : 0;                     // honorários da agência, cobrados à parte do cliente
    return { media, bonus, ins, pub, radio, digital, discount, total, commission, net, fee };
  };

  // Quem paga quem, conforme a instrução de faturamento. C = cliente, A = agência, V = veículo (a rádio).
  S.billingEntries = (pi, c) => {
    const nomes = { C:S.nome(pi.cliente_id) || 'Cliente', A:S.nome(pi.agencia_id) || 'Agência', V:S.veh(pi.veiculo_id).nome };
    const e = (de, para, what, value) => ({ de, para, from:nomes[de], to:nomes[para], what, value });
    if (!pi.agencia_id) return [e('C', 'V', 'Valor total', c.total)]; // venda direta: o cliente paga a rádio
    const by = {
      10: [e('C', 'A', 'Valor total', c.total), e('A', 'V', 'Valor líquido', c.net)],
      20: [e('C', 'V', 'Valor total', c.total), e('V', 'A', 'Comissão', c.commission)],
      30: [e('C', 'A', 'Valor líquido', c.net), e('C', 'A', 'Comissão', c.commission), e('A', 'V', 'Valor líquido', c.net)],
      40: [e('C', 'A', 'Comissão', c.commission), e('A', 'V', 'Valor líquido', c.net)],
      50: [e('C', 'V', 'Valor líquido', c.net), e('C', 'A', 'Comissão', c.commission)] };
    const list = by[pi.dados.billing.type] || by[10];
    if (c.fee > 0) list.push(e('C', 'A', 'Honorários', c.fee));
    return list;
  };

  // Divide um valor em parcelas mensais; os centavos que sobram vão para a última
  S.parcels = (pi, value) => {
    const b = pi.dados.billing, n = Math.max(1, parseInt(b.installments) || 1), cents = Math.round(value * 100), base = Math.floor(cents / n);
    return Array.from({ length:n }, (_, k) => {
      let due = '';
      if (b.firstDue) {
        const [y, m, d] = b.firstDue.split('-').map(Number), dt = new Date(y, m - 1 + k, 1), last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        due = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
      }
      return { n:k + 1, due, value:(base + (k === n - 1 ? cents - base * n : 0)) / 100 };
    });
  };

  // O que entra no financeiro da rádio quando o PI é faturado: só o que a rádio recebe ou paga
  S.lancamentosDoPi = pi => {
    const c = S.calc(pi), out = [];
    S.billingEntries(pi, c).forEach(e => {
      const sentido = e.para === 'V' ? 'receber' : e.de === 'V' ? 'pagar' : null;
      if (!sentido || !e.value) return;
      S.parcels(pi, e.value).forEach(p => out.push({ sentido, descricao:`${S.piNo(pi)} · ${e.what}`, contraparte:sentido === 'receber' ? e.from : e.to, parcela:p.n, valor:p.value, vencimento:p.due || null, forma:pi.dados.billing.method }));
    });
    return out;
  };

  // ---------- tabelas de preço ----------
  // Situação de uma tabela: rascunho (só se prepara), agendada (publicada, ainda não começou),
  // vigente (a publicada mais recente que já começou) ou encerrada (substituída por outra).
  // Cada tipo (rádio ou digital, database/035) tem a sua vigente; sem tipo = rádio
  S.tipoTabela = t => (t && t.tipo) || 'radio';
  S.tabelaVigente = (data = S.today(), tipo = 'radio') => (S.db.tabelas || []).filter(t => t.situacao === 'publicada' && t.inicio <= data && S.tipoTabela(t) === tipo).sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null;
  S.situacaoTabela = t => { if (!t) return null; if (t.situacao !== 'publicada') return 'rascunho'; if (t.inicio > S.today()) return 'agendada';
    const v = S.tabelaVigente(S.today(), S.tipoTabela(t)); return v && v.id === t.id ? 'vigente' : 'encerrada'; };
  S.SITUACAO_TABELA = { rascunho:['Em preparação', 'gray'], agendada:['Agendada', 'blue'], vigente:['Vigente', 'green'], encerrada:['Encerrada', 'gray'] };
  // Preço de um programa × formato numa tabela (a vigente, se nenhuma for indicada). Rascunhos nunca entram no PI.
  S.precoNaTabela = (tabelaId, programaId, formatoId) => S.db.precos.find(x => x.tabela_id === tabelaId && x.programa_id === programaId && x.formato_id === formatoId) || null;
  S.ehDigital = p => !!p && p.secao === 'digital';
  S.preco = (programa, formato) => {
    const p = S.db.produtos.find(x => x.tipo === 'programa' && !S.ehDigital(x) && x.nome.trim() === String(programa || '').trim()), f = S.db.produtos.find(x => x.tipo === 'formato' && !S.ehDigital(x) && x.nome.trim() === String(formato || '').trim());
    const t = S.tabelaVigente();
    if (!p || !f || !t) return null;
    return S.precoNaTabela(t.id, p.id, f.id);
  };
  // Reajuste: aumenta/reduz em % ou soma/subtrai em R$, com arredondamento (0 = centavos)
  S.reajustar = (valor, op, quanto, arred) => {
    let v = Number(valor) || 0, q = Number(quanto) || 0;
    v = op === 'pct-' ? v * (1 - q / 100) : op === 'brl+' ? v + q : op === 'brl-' ? v - q : v * (1 + q / 100);
    v = arred ? Math.round(v / arred) * arred : Math.round(v * 100) / 100;
    return Math.max(0, v);
  };

  // O que falta para o PI poder seguir para a OPEC
  S.piProblems = pi => {
    const out = [];
    if (!pi.titulo.trim()) out.push('informe o título');
    if (!pi.cliente_id) out.push('escolha o cliente');
    const c = S.calc(pi);
    if (!c.ins && !c.pub) out.push('distribua ao menos uma inserção na grade ou coloque uma publicação digital');
    if (pi.dados.grids.some(g => g.items.some(it => S.itemCalc(it).ins && !num(it.unit) && !it.bonus))) out.push('há itens com inserções e sem valor unitário');
    if ((pi.dados.digital || []).some(it => !S.digCalc(it).qtd)) out.push('há ação digital sem entregas');
    return out;
  };
  // Condições gerais do PI (dizeres obrigatórios). Cada rádio pode ter o seu texto (veiculos.pi_condicoes);
  // vazio usa este padrão. {RADIO} e {CIDADE} viram o nome da rádio e a cidade do foro.
  S.PI_CONDICOES_PADRAO = [
    'A {RADIO} cumpre o Código Civil Brasileiro e o Código Brasileiro de Autorregulamentação Publicitária, e acata as decisões do CONAR.',
    '1. Do objeto. A CONTRATADA veiculará a publicidade descrita neste pedido, nos programas, datas e quantidades indicados.',
    '1.1. A inserção não transmitida por força maior, caso fortuito ou motivo legal será compensada em horário equivalente, sem caracterizar descumprimento.',
    '1.2. Se a veiculação for suspensa por ordem judicial, infração legal ou recomendação do CONAR, o ANUNCIANTE poderá substituir o material; não o fazendo, o faturamento segue normalmente, sem direito a crédito ou abatimento.',
    '1.3. O ANUNCIANTE declara conhecer e aceitar as normas do CONAR, que passam a integrar este instrumento.',
    '1.4. O ANUNCIANTE, ou sua agência, entrega o material com até 2 dias úteis de antecedência e responde por seu conteúdo e pelos direitos autorais.',
    '2. Da representação. Este pedido é assinado pelos representantes legais das partes ou por seus procuradores e vale a partir da assinatura.',
    '3. Do cancelamento. O ANUNCIANTE pode cancelar este pedido com aviso por escrito de 30 dias. As inserções do período de aviso são devidas e, sobre o saldo restante, incide multa de 20%.',
    '4. Do pagamento. O ANUNCIANTE autoriza a emissão de faturas, boletos e duplicatas, que podem ser cobrados pela rede bancária.',
    '4.1. O atraso sujeita o devedor a juros de 1% ao mês, multa de 2% sobre o valor em atraso e às despesas de cobrança, inclusive honorários advocatícios de 20% se houver cobrança judicial.',
    '5. Do faturamento. O faturamento é feito no mês da veiculação, com vencimento nas datas indicadas em "Condições e forma de pagamento".',
    '6. Do foro. Fica eleito o foro da comarca de {CIDADE} para resolver qualquer questão deste pedido.'].join('\n');
  S.piCondicoes = (texto, v) => String(texto || S.PI_CONDICOES_PADRAO).replace(/\{RADIO\}/g, v.nome || 'rádio').replace(/\{CIDADE\}/g, v.pi_cidade || v.cidade || '[cidade]');

  // ---------- propostas (database/017_propostas.sql) ----------
  // Dias da semana no padrão do JavaScript: 0 = domingo … 6 = sábado. Na tela a semana começa na segunda.
  S.SEMANA = [1, 2, 3, 4, 5, 6, 0];
  S.DIA_LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  S.DIA_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const DIA_CURTO = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const TOKEN = { DOM:0, SEG:1, TER:2, QUA:3, QUI:4, SEX:5, SAB:6 };
  // Dias escritos no horário do programa ("SEG À SEX - 11H ÀS 15H", "Sábado e domingo"). Sem dias escritos: null.
  S.diasDoTexto = txt => {
    const s = semAcento(txt), dias = new Set(), RE = '(DOM|SEG|TER|QUA|QUI|SEX|SAB)[A-Z]*\\.?';
    const faixa = new RegExp(`\\b${RE}\\s*(?:A|AO|ATE|-|–|/)\\s*${RE}`, 'g');
    let m, resto = s;
    while ((m = faixa.exec(s))) { let d = TOKEN[m[1]]; const fim = TOKEN[m[2]]; for (let k = 0; k < 7; k++) { dias.add(d); if (d === fim) break; d = (d + 1) % 7; } resto = resto.replace(m[0], ' '); }
    const solto = new RegExp(`\\b${RE}`, 'g'); while ((m = solto.exec(resto))) dias.add(TOKEN[m[1]]);
    return dias.size ? [...dias].sort((a, b) => a - b) : null;
  };
  // Faixa horária escrita no horário do programa ("11H ÀS 15H" → "11h às 15h"). Sem horário: ''.
  S.faixaDoTexto = txt => { const m = /(\d{1,2})\s*H\s*(\d{2})?\s*(?:A|AS|ATE|-|–)\s*(\d{1,2})\s*H\s*(\d{2})?/.exec(semAcento(txt)); if (!m) return '';
    const h = (a, b) => `${a.padStart(2, '0')}h${b || ''}`; return `${h(m[1], m[2])} às ${h(m[3], m[4])}`; };
  // "seg. a sáb.", "todos os dias", "seg., qua. e sex."
  S.diasTexto = dias => {
    const ds = S.SEMANA.filter(d => (dias || []).includes(d)); if (!ds.length) return 'nenhum dia'; if (ds.length === 7) return 'todos os dias';
    const pos = ds.map(d => S.SEMANA.indexOf(d)), seguido = pos.every((p, i) => !i || p === pos[i - 1] + 1);
    if (seguido && ds.length > 2) return `${DIA_CURTO[ds[0]]} a ${DIA_CURTO[ds[ds.length - 1]]}`;
    const n = ds.map(d => DIA_CURTO[d]); return n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
  };
  // Item novo de proposta a partir da tabela: rotativo vale os 7 dias (a não ser que o horário limite) e usa a faixa comercial da rádio
  S.itemDaTabela = (prog, fmt, preco, v) => {
    if (S.ehDigital(prog)) return { id:S.uid(), programa_id:prog.id, formato_id:fmt.id, programa:prog.nome.trim(), formato:fmt.nome.trim(), secao:'digital', detalhe:prog.detalhe || '',
      dias:[], faixa:'', insercoes:0, preco_tabela:Number(preco) || 0, preco:Number(preco) || 0, total:0 };
    const dias = S.diasDoTexto(prog.detalhe) || [0, 1, 2, 3, 4, 5, 6], pt = Number(preco) || 0;
    const faixa = S.faixaDoTexto(prog.detalhe) || (prog.secao === 'rotativo' ? (v && v.prop_faixa) || '07h às 19h' : '');
    return { id:S.uid(), programa_id:prog.id, formato_id:fmt.id, programa:prog.nome.trim(), formato:fmt.nome.trim(), secao:prog.secao || 'programa', detalhe:prog.detalhe || '',
      dias, faixa, insercoes:0, preco_tabela:pt, preco:pt, total:0 };
  };
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  // Totais da proposta (por mês): valor de tabela, investimento e o desconto negociado
  // Ação digital (secao 'digital', tipo 'acao'): entregas e um valor só (total), sem preço de tabela
  S.propTotais = p => { let ins = 0, pub = 0, tabela = 0, total = 0, radio = 0, digital = 0;
    (p.itens || []).forEach(it => { const t = Number(it.total) || 0;
      if (it.secao === 'digital') { pub += it.entregas ? S.acaoQtd(it) : parseInt(it.insercoes) || 0; digital += t; tabela += Number(it.valor_tabela) > 0 ? Number(it.valor_tabela) : t; }
      else { const n = parseInt(it.insercoes) || 0; ins += n; radio += t; tabela += n * (Number(it.preco_tabela) || 0); }
      total += t; });
    tabela = r2(tabela); total = r2(total); const desconto = r2(tabela - total);
    return { ins, pub, radio:r2(radio), digital:r2(digital), tabela, total, desconto, pct:tabela ? desconto / tabela * 100 : 0 }; };
  S.propNo = p => `${p.ano}/${String(p.numero).padStart(3, '0')}`;
  S.somaDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d + n, 12); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
  S.propVence = p => S.somaDias(p.data, Number(p.validade) || 0);
  S.PROP_CONDICOES_PADRAO = ['Faturamento mensal com vencimento todo dia 15.', 'Material fornecido pelo cliente até 3 dias úteis antes da estreia.', 'Período de veiculação: a definir com o cliente.', 'Proposta válida por {VALIDADE} dias a partir desta data.'].join('\n');

  // Distribuição automática do PI: em cada mês de veiculação (do dia de início até a véspera do mesmo dia no mês seguinte),
  // as inserções/mês de cada item são divididas por igual entre os dias permitidos. O que sobra da divisão vai para dias
  // espalhados ao longo do mês (posição ⌊(i + ½) × dias ÷ sobra⌋), nunca amontoado no começo. Sem limite por dia.
  // Devolve { meses:[{ period:'AAAA-MM', itens:{ índice:{ dia:quantidade } } }], soma, esperado, semDias:[índices], inicio, fim }
  S.distribuir = (itens, inicio, nMeses) => {
    const [y, m, d] = inicio.split('-').map(Number), dia = (yy, mm, dd) => new Date(yy, mm, Math.min(dd, new Date(yy, mm + 1, 0).getDate()), 12);
    const porMes = {}, semDias = new Set(); let soma = 0, esperado = 0;
    for (let k = 0; k < nMeses; k++) {
      const ini = dia(y, m - 1 + k, d), prox = dia(y, m + k, d), datas = [];
      for (const t = new Date(ini); t < prox; t.setDate(t.getDate() + 1)) datas.push(new Date(t));
      itens.forEach((it, i) => {
        const total = parseInt(it.insercoes) || 0; esperado += total; if (!total) return;
        const ok = datas.filter(t => (it.dias || []).includes(t.getDay())), n = ok.length;
        if (!n) { semDias.add(i); return; }
        const base = Math.floor(total / n), sobra = total - base * n, extra = new Set();
        for (let j = 0; j < sobra; j++) extra.add(Math.floor((j + 0.5) * n / sobra));
        ok.forEach((t, j) => { const q = base + (extra.has(j) ? 1 : 0); if (!q) return;
          const per = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`, g = porMes[per] || (porMes[per] = {}), ds = g[i] || (g[i] = {});
          ds[t.getDate()] = (ds[t.getDate()] || 0) + q; soma += q; });
      });
    }
    const fim = new Date(dia(y, m - 1 + nMeses, d)); fim.setDate(fim.getDate() - 1);
    const iso = t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return { meses:Object.keys(porMes).sort().map(period => ({ period, itens:porMes[period] })), soma, esperado, semDias:[...semDias], inicio, fim:iso(fim) };
  };
  // Etiqueta do pagamento do PI (vem de pagamento_dos_pis): pago, em aberto (com o próximo vencimento) ou atrasado
  S.PAG_PI = { pago:['Pago', 'green'], aberto:['Em aberto', 'blue'], atrasado:['Pagamento atrasado', 'red'] };
  S.pagPi = pi => { const r = ((S.db && S.db.pagPis) || {})[pi.id]; if (!r || !S.PAG_PI[r.situacao]) return '';
    const [t, c] = S.PAG_PI[r.situacao], prox = r.situacao !== 'pago' && r.proximo ? ` · vence ${S.dfmt(r.proximo).slice(0, 5)}` : '';
    return `<span class="pill pag-pi" style="--tone:var(--${c})" title="${t}${prox}">${t}${r.situacao === 'aberto' ? prox : ''}</span>`; };
})();

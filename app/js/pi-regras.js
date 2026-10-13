// SONVI · regras financeiras do PI. Funções puras: recebem um PI e devolvem números, sem tocar na tela.
(() => {
  const num = S.num;
  S.BILLING = { 10:'Faturar bruto contra a Agência', 20:'Faturar bruto contra o Cliente', 30:'Faturar líquido + comissão contra a Agência', 40:'Faturar líquido contra a Agência', 50:'Faturar líquido contra o Cliente' };

  // Garante que um PI vindo da nuvem tenha todos os campos que a tela espera
  S.piNorm = pi => {
    const d = pi.dados = pi.dados || {};
    d.commission = d.commission || { type:'pct', value:0 }; d.fee = d.fee || { type:'brl', value:0 }; d.discount = d.discount || { type:'brl', value:0 };
    d.pieces = d.pieces || []; d.grids = d.grids || []; d.briefing = d.briefing || '';
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

  S.calc = pi => {
    const d = pi.dados; let media = 0, bonus = 0, ins = 0;
    d.grids.forEach(g => g.items.forEach(it => { const c = S.itemCalc(it); ins += c.ins; if (it.bonus) bonus += c.gross; else media += c.sub; }));
    const discount = Math.min(media, share(d.discount, media));
    const total = media - discount;                                          // o que o cliente paga pela mídia
    const commission = pi.agencia_id ? Math.min(total, share(d.commission, total)) : 0; // parte da agência; sem agência não há comissão
    const net = total - commission;                                          // o que fica com a rádio
    const fee = pi.agencia_id ? share(d.fee, total) : 0;                     // honorários da agência, cobrados à parte do cliente
    return { media, bonus, ins, discount, total, commission, net, fee };
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
  S.tabelaVigente = (data = S.today()) => (S.db.tabelas || []).filter(t => t.situacao === 'publicada' && t.inicio <= data).sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null;
  S.situacaoTabela = t => { if (!t) return null; if (t.situacao !== 'publicada') return 'rascunho'; if (t.inicio > S.today()) return 'agendada';
    const v = S.tabelaVigente(); return v && v.id === t.id ? 'vigente' : 'encerrada'; };
  S.SITUACAO_TABELA = { rascunho:['Rascunho', 'gray'], agendada:['Agendada', 'blue'], vigente:['Vigente', 'green'], encerrada:['Encerrada', 'gray'] };
  // Preço de um programa × formato numa tabela (a vigente, se nenhuma for indicada). Rascunhos nunca entram no PI.
  S.precoNaTabela = (tabelaId, programaId, formatoId) => S.db.precos.find(x => x.tabela_id === tabelaId && x.programa_id === programaId && x.formato_id === formatoId) || null;
  S.preco = (programa, formato) => {
    const p = S.db.produtos.find(x => x.tipo === 'programa' && x.nome.trim() === String(programa || '').trim()), f = S.db.produtos.find(x => x.tipo === 'formato' && x.nome.trim() === String(formato || '').trim());
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
    if (!S.calc(pi).ins) out.push('distribua ao menos uma inserção na grade');
    if (pi.dados.grids.some(g => g.items.some(it => S.itemCalc(it).ins && !num(it.unit) && !it.bonus))) out.push('há itens com inserções e sem valor unitário');
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
})();

// SONVI · Metas mensais dos consultores (aprovado em 26/10/2026, database/049_repasse_e_metas.sql).
// A meta é por veículo, no cadastro do colaborador consultor. Vendido = valor líquido dos PIs que saíram do comercial
// (na OPEC, aprovados, programados e faturados), pela data de criação. O diretor vê todas; o consultor, só a própria.
(() => {
  const S = window.SONVI, esc = S.esc;
  const VENDIDO = ['opec', 'aprovado', 'programado', 'faturado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const cache = {}, buscando = {};
  const brl0 = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
  S.mesAtual = (desloca = 0) => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + desloca, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

  // Busca as metas do mês uma vez por mês (e de novo a cada entrada no SONVI); redesenha quando chegam
  S.metasDoMes = mes => {
    if (cache[mes]) return cache[mes];
    if (!buscando[mes] && S.sb) { buscando[mes] = true;
      S.q(S.sb.rpc('metas_do_mes', { p_mes:mes + '-01' })).then(l => { cache[mes] = l || []; }).catch(e => { console.error(e); cache[mes] = []; })
        .finally(() => { buscando[mes] = false; if (['dashboard', 'geral'].includes(S.route().view)) S.render(); }); }
    return null;
  };
  S.metasUsar = (mes, l) => { cache[mes] = l; };          // testes
  S.metasLimpar = () => { Object.keys(cache).forEach(k => delete cache[k]); };

  // Só o valor do mês (decidido em 27/10/2026): um PI de 3 meses conta em cada mês só a grade daquele mês (e a ação digital do mês),
  // no valor líquido (a mesma proporção do PI inteiro: desconto geral e comissão da agência). Sem grades, conta o PI no mês em que nasceu.
  const valorNoMes = (p, mes) => { const liq = Number(p.valor_liquido ?? p.valor_total ?? 0), d = p.dados || {}; let tot = 0, m = 0;
    (d.grids || []).forEach(g => (g.items || []).forEach(it => { const v = S.itemCalc(it).sub; tot += v; if (g.period === mes) m += v; }));
    (d.digital || []).forEach(a => { const v = S.digCalc(a).sub; tot += v; if (a.period === mes || String(a.inicio || '').slice(0, 7) === mes && !a.period) m += v; });
    if (!tot) return String(p.criado_em || '').slice(0, 7) === mes ? liq : 0;
    return m * liq / tot; };
  S.valorNoMes = valorNoMes;
  const vendidoDe = (pis, mes, usuario, veiculo) => pis.filter(p => VENDIDO.includes(p.status) && p.consultor_id === usuario && (!veiculo || p.veiculo_id === veiculo))
    .reduce((t, p) => t + valorNoMes(p, mes), 0);

  // Cartão "Metas de <mês>". opts: { mes, pis, veiculo (só esse veículo), meu (só a própria), vazio (texto quando não há meta) }
  S.metasHtml = ({ mes, pis, veiculo = null, meu = false, vazio = '' }) => {
    const l = S.metasDoMes(mes); if (!l) return '';
    const doMes = l.filter(x => (!veiculo || x.veiculo_id === veiculo) && (!meu || x.usuario_id === S.me.id));
    const nomeMes = MESES[+mes.slice(5) - 1];
    if (!doMes.length) return vazio ? `<section class="card mt"><div class="hd"><h2>Metas de ${nomeMes}</h2></div><p class="muted" style="margin:0">${vazio}</p></section>` : '';
    // Ritmo do mês: quanto do mês já passou (no mês atual); meses passados contam inteiros
    const hoje = new Date(), [y, m] = mes.split('-').map(Number), dias = new Date(y, m, 0).getDate();
    const ritmo = mes === S.mesAtual() ? hoje.getDate() / dias : mes < S.mesAtual() ? 1 : 0;
    const pessoas = {}; doMes.forEach(x => { const p = pessoas[x.colaborador_id] || (pessoas[x.colaborador_id] = { nome:x.nome, usuario:x.usuario_id, meta:0, vend:0, vs:[] });
      const v = vendidoDe(pis, mes, x.usuario_id, x.veiculo_id); p.meta += Number(x.meta); p.vend += v; p.vs.push({ v:S.veh(x.veiculo_id), meta:Number(x.meta), vend:v }); });
    const lista = Object.values(pessoas).sort((a, b) => b.vend / b.meta - a.vend / a.meta || a.nome.localeCompare(b.nome));
    const pct = (v, t) => t ? Math.round(v / t * 100) : 0;
    const tom = p => p.vend >= p.meta ? 'var(--green)' : ritmo && p.vend / p.meta < ritmo - 0.15 ? 'var(--orange)' : 'var(--accent)';
    const sub = p => { const falta = p.meta - p.vend;
      const partes = !veiculo && p.vs.length > 1 ? p.vs.map(x => `${esc((x.v || {}).nome || '')} ${pct(x.vend, x.meta)}%`).join(' · ') + ' · ' : '';
      return partes + (falta <= 0 ? 'meta batida' : `faltam ${brl0(falta)}`); };
    const meta = lista.reduce((t, p) => t + p.meta, 0), vend = lista.reduce((t, p) => t + p.vend, 0);
    const titulo = meu ? `Minha meta de ${nomeMes}` : `Metas de ${nomeMes}`;
    const resumo = meu || lista.length === 1 ? '' : `<span class="muted small">${veiculo ? esc((S.veh(veiculo) || {}).nome || '') : 'equipe'}: ${brl0(vend)} de ${brl0(meta)} · ${pct(vend, meta)}%</span>`;
    return `<section class="card mt"><div class="hd"><h2>${titulo}</h2>${resumo}</div><div class="mt-l">${lista.map(p => `<div class="mt-p">
        <div class="mt-top"><b>${meu ? 'Vendido no mês' : esc(p.nome)}</b><span class="mt-num">${brl0(p.vend)} de ${brl0(p.meta)} · <b>${pct(p.vend, p.meta)}%</b></span></div>
        <div class="prog" role="progressbar" aria-valuenow="${Math.min(100, pct(p.vend, p.meta))}" aria-valuemin="0" aria-valuemax="100" aria-label="Meta de ${esc(p.nome)}"><i style="width:${Math.min(100, pct(p.vend, p.meta))}%;background:${tom(p)}"></i>${ritmo > 0 && ritmo < 1 ? `<span class="mt-ritmo" style="left:${ritmo * 100}%" title="Onde deveria estar hoje"></span>` : ''}</div>
        <small class="muted">${sub(p)}</small></div>`).join('')}</div>
      <p class="muted small mt-pe">Valor líquido do que vai ao ar no mês, dos PIs enviados para a OPEC em diante (contrato de vários meses conta só a parte de cada mês).${ritmo > 0 && ritmo < 1 ? ' O risco na barra marca onde deveria estar hoje.' : ''}</p></section>`;
  };
})();

// SONVI · função de borda "followup": os resumos do Follow-up por e-mail (e, quando o número existir, WhatsApp).
// Chamada pelo agendador do banco (pg_cron) com a chave interna do cofre (cabeçalho x-sonvi-cron):
//   { acao: "diario" } às 7h30 (Cuiabá) → cria os follow-ups de proposta sem resposta e, só nas empresas com
//     "E-mail das 7h30" ligado (resumo_config.manha, desligado por padrão desde 07/11/2026), envia a agenda do dia.
//   { acao: "fimdia" } de hora em hora → na hora e nos dias escolhidos por cada empresa (Administração › Resumo do dia,
//     padrão 18h de segunda a sexta), envia o resumo do fim do dia (database/083, modelo aprovado em 07/11/2026):
//     consultor: o dia em números, o que registrou, o que ficou para trás, amanhã e a meta do mês;
//     diretor: a equipe de todos os veículos, atrasados, PIs (aguardando a OPEC abrir, devolvidos) e a meta do grupo.
//   Cada resumo sai uma vez por dia por pessoa, tipo e canal (tabela followup_envios, com situação e erro).
// O diretor logado pode pedir uma amostra do resumo do fim do dia para si: { acao: "teste" } (Authorization do usuário).
// E-mail pelo Resend (domínio sonvi.com.br; segredo RESEND_API_KEY). WhatsApp pela API oficial da Meta, só quando a empresa
// estiver com o WhatsApp ativo e os segredos WHATSAPP_TOKEN, WHATSAPP_NUMERO_ID e WHATSAPP_MODELO existirem; se falhar, vai por e-mail.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sonvi-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n]/g, '').trim().slice(0, 60);
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

// Cuiabá: UTC-4 o ano todo (sem horário de verão)
const FUSO = '-04:00';
const diaCuiaba = (d = new Date()) => new Date(d.getTime() - 4 * 3600e3).toISOString().slice(0, 10);
const somaDias = (dia: string, n: number) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const inicio = (dia: string) => new Date(dia + 'T00:00:00' + FUSO).toISOString();
const hora = (iso: string) => new Date(Date.parse(iso) - 4 * 3600e3).toISOString().slice(11, 16);
const ddmm = (dia: string) => dia.slice(8, 10) + '/' + dia.slice(5, 7);
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = (dia: string) => SEMANA[new Date(dia + 'T12:00:00Z').getUTCDay()];
const TIPO: Record<string, string> = { visita: 'visita', ligacao: 'ligação', whatsapp: 'WhatsApp', reuniao: 'reunião', retorno: 'retorno' };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Linha = { id: string; veiculo_id: string; consultor_id: string; cliente_id: string | null; tipo: string; quando: string; assunto: string; situacao: string; registrado_em: string | null };

type Cfg = { organizacao_id: string; hora: number; dias: number[]; manha: boolean; whatsapp_ativo: boolean };
type Teste = { id: string; email: string; nome: string; org: string };
type Envio = { usuario: string; tipo: string; para: string; de: string; assunto: string; html: string; canal: 'email' | 'whatsapp' | 'ambos';
  wa?: { celular: string; params: string[] } };

const brl = (n: number) => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const RESP: Record<string, [string, string]> = { interessado: ['Interessado', '#1d4ed8'], retorno: ['Pediu retorno', '#b45309'], proposta: ['Pediu proposta', '#6d28d9'],
  fechou: ['Fechou', '#0b7a52'], sem_interesse: ['Sem interesse', '#6b6b74'] };
const celularBR = (c: unknown) => { let d = String(c || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return /^55\d{10,11}$/.test(d) ? d : ''; };

// Busca em lotes (o filtro "in" tem limite de tamanho) e de 1.000 em 1.000
const emLotes = async (ids: string[], busca: (lote: string[]) => any) => {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    for (let k = 0; ; k += 1000) { const { data, error } = await busca(ids.slice(i, i + 150)).range(k, k + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; }
  }
  return out;
};

// WhatsApp pela API oficial da Meta (modelo de mensagem de utilidade aprovado). Sem os segredos, devolve "aguardando número".
const enviaWhatsapp = async (celular: string, params: string[]) => {
  const token = Deno.env.get('WHATSAPP_TOKEN'), numero = Deno.env.get('WHATSAPP_NUMERO_ID'), modelo = Deno.env.get('WHATSAPP_MODELO');
  if (!token || !numero || !modelo) return { ok: false, erro: 'WhatsApp aguardando número' };
  if (!celular) return { ok: false, erro: 'sem celular cadastrado' };
  const r = await fetch(`https://graph.facebook.com/v21.0/${numero}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: celular, type: 'template',
      template: { name: modelo, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 200) })) }] } }),
  });
  if (r.ok) return { ok: true, erro: '' };
  const j = await r.json().catch(() => ({})); return { ok: false, erro: String(j?.error?.message || r.status).slice(0, 300) };
};

// Envia e anota cada envio (uma vez por dia por pessoa, tipo e canal; a amostra não é anotada).
// WhatsApp que falha vira e-mail (situação "voltou_email") quando a pessoa escolheu só WhatsApp.
const enviarTodos = async (adm: any, chave: string, envios: Envio[], hoje: string, amostra: boolean) => {
  let enviados = 0; const falhas: string[] = [];
  const anota = async (e: Envio, canal: 'email' | 'whatsapp') => {
    if (amostra) return true;
    const { error } = await adm.from('followup_envios').insert({ dia: hoje, usuario_id: e.usuario, tipo: e.tipo, canal });
    return !error;   // erro = já enviado hoje
  };
  const marca = async (e: Envio, canal: 'email' | 'whatsapp', situacao: string, erro: string | null) => {
    if (!amostra) await adm.from('followup_envios').update({ situacao, erro }).match({ dia: hoje, usuario_id: e.usuario, tipo: e.tipo, canal });
  };
  const porEmail = async (e: Envio) => {
    if (!emailOk(String(e.para || ''))) { falhas.push(`${e.usuario}: sem e-mail`); await marca(e, 'email', 'falhou', 'sem e-mail válido'); return; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: e.de, to: [e.para], subject: e.assunto, html: e.html }),
    });
    if (r.ok) enviados++;
    else { const j = await r.json().catch(() => ({})); const m = String(j?.message || r.status); falhas.push(`${e.para}: ${m}`); await marca(e, 'email', 'falhou', m.slice(0, 300)); }
    await espera(600); // o Resend aceita poucos envios por segundo
  };
  for (const e of envios) {
    const querWa = e.canal !== 'email' && !!e.wa, querEmail = e.canal !== 'whatsapp' || !e.wa;
    let waOk = false;
    if (querWa && await anota(e, 'whatsapp')) {
      const r = await enviaWhatsapp(e.wa!.celular, e.wa!.params);
      waOk = r.ok; if (r.ok) enviados++;
      await marca(e, 'whatsapp', r.ok ? 'enviado' : querEmail ? 'falhou' : 'voltou_email', r.ok ? null : r.erro);
    }
    if ((querEmail || (querWa && !waOk)) && await anota(e, 'email')) await porEmail(e);
  }
  if (falhas.length) console.error('followup: falhas', falhas);
  return { enviados, falhas };
};

// ---------- Resumo do fim do dia ----------
const fimDoDia = async ({ adm, chave, orgs, cfgDe, empDe, slugDe, teste, hoje, agora, simular }: {
  adm: any; chave: string; orgs: string[]; cfgDe: (o: string) => Cfg; empDe: (u: any) => string; slugDe: Map<any, any>;
  teste: Teste | null; hoje: string; agora: Date; simular?: boolean }) => {
  const amanha = somaDias(hoje, 1), depois = somaDias(hoje, 2), ym = hoje.slice(0, 7), mesNome = MESES[+ym.slice(5) - 1];
  const fimMes = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).toISOString().slice(0, 10);
  let uteis = 0; for (let d = amanha; d <= fimMes; d = somaDias(d, 1)) { const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w > 0 && w < 6) uteis++; }
  const link = (org: string, rota: string) => { const sl = slugDe.get(org); return (sl ? `https://sonvi.com.br/${sl}/` : (Deno.env.get('APP_URL') || 'https://sonvi.com.br/').replace(/\/?$/, '/')) + '#/' + rota; };

  const { data: veiculos } = await adm.from('veiculos').select('id, nome, organizacao_id').in('organizacao_id', orgs);
  const vids = (veiculos || []).map((v: any) => v.id) as string[];
  if (!vids.length) return { enviados: 0, falhas: 0, nada: 'sem veículos' };
  const nomeVei = (id: string) => nomeLimpo((veiculos || []).find((v: any) => v.id === id)?.nome || 'Veículo');
  const orgVei = (id: string) => (veiculos || []).find((v: any) => v.id === id)?.organizacao_id;

  const [usuarios, vinculos, pendentes, feitos, props, hist, opec, devolvidos, vendas, colabs] = await Promise.all([
    emLotes(orgs, l => adm.from('usuarios').select('id, nome, email, celular, diretor, ativo, organizacao_id, resumo_ativo, resumo_canal').in('organizacao_id', l).eq('ativo', true).order('id')),
    emLotes(vids, l => adm.from('usuario_veiculos').select('usuario_id, veiculo_id, perfil').in('veiculo_id', l).order('usuario_id')),
    emLotes(vids, l => adm.from('agenda').select('id, veiculo_id, consultor_id, cliente_id, tipo, quando, assunto').in('veiculo_id', l).eq('situacao', 'agendado').lt('quando', inicio(depois)).order('id')),
    emLotes(vids, l => adm.from('agenda').select('id, veiculo_id, consultor_id, cliente_id, tipo, situacao, resposta, resultado, registrado_em').in('veiculo_id', l).in('situacao', ['realizado', 'nao_atendeu']).gte('registrado_em', inicio(hoje)).order('id')),
    emLotes(vids, l => adm.from('propostas').select('id, veiculo_id, consultor_id').in('veiculo_id', l).gte('enviada_em', inicio(hoje)).order('id')),
    adm.from('pi_historico').select('pi_id').eq('status', 'opec').gte('em', inicio(hoje)).order('pi_id').range(0, 4999).then((r: any) => r.data || []),
    emLotes(vids, l => adm.from('pis').select('id, veiculo_id').in('veiculo_id', l).eq('status', 'opec').order('id')),
    emLotes(vids, l => adm.from('pis').select('id, veiculo_id, numero').in('veiculo_id', l).eq('status', 'devolvido').order('id')),
    emLotes(vids, l => adm.from('vendas_lancadas').select('pi_id, veiculo_id, valor').in('veiculo_id', l).eq('mes', ym).order('id')),
    emLotes(orgs, l => adm.from('colaboradores').select('id, usuario_id, organizacao_id').in('organizacao_id', l).eq('ativo', true).eq('funcao', 'consultor').order('id')),
  ]);
  const idsHoje = [...new Set((hist as any[]).map(h => h.pi_id))] as string[];
  const pisHoje = idsHoje.length ? await emLotes(idsHoje, l => adm.from('pis').select('id, veiculo_id, consultor_id, valor_liquido').in('id', l).in('veiculo_id', vids).order('id')) : [];
  const idsVenda = [...new Set(vendas.map((v: any) => v.pi_id))] as string[];
  const donoPi = new Map((idsVenda.length ? await emLotes(idsVenda, l => adm.from('pis').select('id, consultor_id').in('id', l).order('id')) : []).map((p: any) => [p.id, p.consultor_id]));
  const lidos = new Set((opec.length ? await emLotes(opec.map((p: any) => p.id), l => adm.from('pi_leituras').select('pi_id').in('pi_id', l).order('pi_id')) : []).map((x: any) => x.pi_id));
  const motivos = new Map<string, string>();
  if (devolvidos.length) for (const h of await emLotes(devolvidos.map((p: any) => p.id), l => adm.from('pi_historico').select('pi_id, nota, em').in('pi_id', l).eq('status', 'devolvido').order('em', { ascending: false })))
    if (!motivos.has(h.pi_id)) motivos.set(h.pi_id, String(h.nota || '').replace(/^OPEC pelo link · [^:]*: /, ''));
  const metaRows = colabs.length ? await emLotes(colabs.map((c: any) => c.id), l => adm.from('colaborador_metas').select('colaborador_id, desde, metas').in('colaborador_id', l).lte('desde', ym + '-01').order('desde', { ascending: false })) : [];
  const metaDe = new Map<string, number>();   // usuario_id → soma das metas do mês
  for (const c of colabs) { const m = metaRows.find((r: any) => r.colaborador_id === c.id); if (!m || !c.usuario_id) continue;
    const soma = Object.entries(m.metas || {}).filter(([v]) => vids.includes(v)).reduce((s, [, x]) => s + (Number(x) || 0), 0);
    if (soma > 0) metaDe.set(c.usuario_id, (metaDe.get(c.usuario_id) || 0) + soma); }
  const vendidoDe = (uid: string) => vendas.filter((v: any) => donoPi.get(v.pi_id) === uid).reduce((s: number, v: any) => s + Number(v.valor || 0), 0);

  const clienteIds = [...new Set([...pendentes, ...feitos].map((a: any) => a.cliente_id).filter(Boolean))] as string[];
  const clientes = new Map((clienteIds.length ? await emLotes(clienteIds, l => adm.from('pessoas').select('id, nome').in('id', l).order('id')) : []).map((p: any) => [p.id, p.nome]));
  const nomeCli = (id: string | null) => esc(clientes.get(id) || 'Sem cliente');
  const nomeUsu = (id: string) => String((usuarios.find((u: any) => u.id === id) || {}).nome || 'Consultor');
  const primeiro = (n: string) => esc(String(n || '').trim().split(/\s+/)[0]);
  const atrasado = (a: any) => Date.parse(a.quando) < agora.getTime();
  const diasAtras = (a: any) => Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(diaCuiaba(new Date(a.quando)) + 'T12:00:00Z')) / 864e5);
  const ehAmanha = (a: any) => !atrasado(a) && diaCuiaba(new Date(a.quando)) === amanha;
  const dataLonga = `${diaSemana(hoje)}, ${ddmm(hoje)}`, diaAm = `${diaSemana(amanha)} ${ddmm(amanha)}`;

  // Números de uma pessoa (ou da equipe) num filtro de consultor
  const numeros = (f: (x: any) => boolean) => ({
    contatos: feitos.filter(f).length, propostas: props.filter(f).length,
    pis: pisHoje.filter(f).reduce((s: number, p: any) => s + Number(p.valor_liquido || 0), 0), npis: pisHoje.filter(f).length,
    atrasados: pendentes.filter((a: any) => f(a) && atrasado(a)), amanha: pendentes.filter((a: any) => f(a) && ehAmanha(a)),
  });

  // ---------- HTML simples, que funciona em qualquer leitor de e-mail ----------
  const CINZA = '#6b6b74', LINHA = '#eef0f3', VERM = '#b42318';
  const casca = (titulo: string, intro: string, miolo: string, botao: string, app: string, rodape: string) => `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:620px">
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 6px">${titulo}</h1><p style="color:#4b4b55;margin:0 0 18px">${intro}</p>${miolo}
    <p style="margin:24px 0"><a href="${app}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${botao}</a></p>
    <p style="color:${CINZA};font-size:12px">${rodape}</p></div>`;
  const nums = (l: [string, string, boolean?][]) => `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin:0 -6px 12px"><tr>${l.map(([k, v, alerta]) =>
    `<td style="width:25%;border:1px solid ${alerta ? '#f3c7c3' : '#e4e6eb'};background:${alerta ? '#fdf1f0' : '#fff'};border-radius:12px;padding:10px 12px;vertical-align:top"><span style="display:block;font-size:12px;color:${CINZA}">${k}</span><b style="font-size:20px;${alerta ? `color:${VERM}` : ''}">${v}</b></td>`).join('')}</tr></table>`;
  const bloco = (rotulo: string, linhas: string[], vazio = '') => (linhas.length || vazio) ? `<div style="border:1px solid #e4e6eb;border-radius:14px;padding:4px 16px 6px;margin:0 0 14px">
    <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${CINZA};margin:12px 0 4px">${rotulo}</p>${linhas.length ? linhas.join('') : `<p style="color:${CINZA};margin:6px 0 10px">${vazio}</p>`}</div>` : '';
  const item = (quando: string, texto: string, extra = '', tag = '') => `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${LINHA}"><tr>
    <td style="width:52px;padding:9px 0;vertical-align:top"><b>${quando}</b></td><td style="padding:9px 0;vertical-align:top">${texto}${extra ? `<br><span style="color:${VERM};font-size:13px">${extra}</span>` : ''}</td>
    ${tag ? `<td style="padding:9px 0;text-align:right;vertical-align:top;white-space:nowrap">${tag}</td>` : ''}</tr></table>`;
  const etiqueta = (t: string, cor: string) => `<span style="font-size:12px;font-weight:700;color:${cor}">${esc(t)}</span>`;
  const tipoTx = (t: string) => esc((TIPO[t] || t || '').replace(/^./, c => c.toUpperCase()));
  const linhaAtraso = (a: any, comQuem = false) => { const d = diasAtras(a);
    return item(d > 0 ? ddmm(diaCuiaba(new Date(a.quando))) : hora(a.quando), `<b>${nomeCli(a.cliente_id)}</b> · ${tipoTx(a.tipo)}${a.assunto ? ' · ' + esc(a.assunto) : ''}${comQuem ? ` <span style="color:${CINZA}">· ${esc(nomeUsu(a.consultor_id))}</span>` : ''}`,
      d > 0 ? `${plural(d, 'dia de atraso', 'dias de atraso')}: registre ou remarque` : 'Era para hoje: registre ou remarque'); };
  const barraMeta = (titulo: string, feito: number, meta: number) => { if (!meta) return '';
    const pc = Math.min(100, Math.round(feito / meta * 100));
    return `<div style="border:1px solid #e4e6eb;border-radius:14px;padding:12px 16px;margin:0 0 14px"><table role="presentation" style="width:100%;border-collapse:collapse"><tr>
      <td><b>${titulo}</b><br><span style="color:${CINZA};font-size:13px">${brl(feito)} de ${brl(meta)} · faltam ${plural(uteis, 'dia útil', 'dias úteis')}</span></td>
      <td style="text-align:right;font-size:20px;font-weight:700;color:#0055ff">${Math.round(feito / meta * 100)}%</td></tr></table>
      <div style="height:8px;border-radius:99px;background:#eef1f6;margin-top:8px"><div style="height:8px;border-radius:99px;background:#0055ff;width:${pc}%"></div></div></div>`; };
  const rodape = (org: string) => { const c = cfgDe(org), DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], d = [...(c.dias || [])].sort();
    const quando = d.join() === '1,2,3,4,5' ? 'todo dia útil' : d.join() === '1,2,3,4,5,6' ? 'de segunda a sábado' : 'nos dias ' + d.map(x => DS[x]).join(', ');
    return `Resumo automático, ${quando} às ${c.hora}h (horário de Cuiabá).`; };
  const quer = (u: any) => (u.resumo_canal === 'whatsapp' || u.resumo_canal === 'ambos') && cfgDe(u.organizacao_id).whatsapp_ativo ? u.resumo_canal : 'email';

  const envios: Envio[] = [];
  for (const org of orgs) {
    const vOrg = vids.filter(v => orgVei(v) === org);
    const naOrg = (x: any) => vOrg.includes(x.veiculo_id);
    const consIds = [...new Set(vinculos.filter((v: any) => v.perfil === 'consultor' && vOrg.includes(v.veiculo_id)).map((v: any) => v.usuario_id))] as string[];
    const consultores = usuarios.filter((u: any) => consIds.includes(u.id) && !u.diretor).sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    // Consultor
    if (!teste) for (const u of consultores.filter((x: any) => x.resumo_ativo !== false)) {
      const meu = (x: any) => naOrg(x) && x.consultor_id === u.id, n = numeros(meu);
      const seus = [...new Set(vinculos.filter((v: any) => v.usuario_id === u.id && v.perfil === 'consultor' && vOrg.includes(v.veiculo_id)).map((v: any) => v.veiculo_id))] as string[];
      const onde = seus.length === 1 ? nomeVei(seus[0]) : seus.length === 2 ? nomeVei(seus[0]) + ' e na ' + nomeVei(seus[1]) : '';   // 3 ou mais: "nos seus veículos"
      const reg = feitos.filter(meu).sort((a: any, b: any) => String(a.registrado_em).localeCompare(String(b.registrado_em)));
      const linhasReg = reg.map((a: any) => { const r = a.situacao === 'nao_atendeu' ? ['Não atendeu', CINZA] : RESP[a.resposta] || null;
        return item(hora(a.registrado_em), `<b>${nomeCli(a.cliente_id)}</b> · ${tipoTx(a.tipo)}${seus.length > 1 ? ` <span style="color:${CINZA}">(${esc(nomeVei(a.veiculo_id))})</span>` : ''}${a.resultado ? `<br><span style="color:${CINZA};font-size:13px">${esc(String(a.resultado).slice(0, 140))}</span>` : ''}`, '', r ? etiqueta(r[0], r[1]) : ''); });
      const atr = n.atrasados.sort((a: any, b: any) => a.quando.localeCompare(b.quando)), am = n.amanha.sort((a: any, b: any) => a.quando.localeCompare(b.quando));
      const meta = metaDe.get(u.id) || 0, vend = vendidoDe(u.id);
      const html = casca(`Boa noite, ${primeiro(u.nome)}`, onde ? `Assim foi o seu dia na ${esc(onde)}.` : `Assim foi o seu dia nos ${plural(seus.length, 'veículo', 'veículos')} em que você atua.`,
        nums([['Contatos feitos', String(n.contatos)], ['Propostas enviadas', String(n.propostas)], ['PIs enviados', n.npis ? brl(n.pis) : '0'], ['Atrasados', String(atr.length), atr.length > 0]])
        + bloco('O que você registrou hoje', linhasReg, 'Nenhum contato registrado hoje.')
        + bloco('Ficou para trás', atr.slice(0, 12).map(a => linhaAtraso(a)).concat(atr.length > 12 ? [`<p style="color:${CINZA};margin:8px 0">e mais ${atr.length - 12} no Follow-up</p>`] : []))
        + bloco(`Amanhã, ${diaAm}`, am.map((a: any) => item(hora(a.quando), `<b>${nomeCli(a.cliente_id)}</b> · ${tipoTx(a.tipo)}${a.assunto ? ' · ' + esc(a.assunto) : ''}`)), 'Nada marcado para amanhã ainda.')
        + barraMeta(`Meta de ${mesNome}`, vend, meta),
        'Abrir o Follow-up', link(org, 'followup'), rodape(org) + ' Para mudar o horário, fale com o diretor.');
      envios.push({ usuario: u.id, tipo: 'fim_consultor', para: u.email, canal: quer(u),
        de: `"${seus.length === 1 ? nomeVei(seus[0]) : empDe(u)} · Follow-up" <followup@sonvi.com.br>`,
        assunto: `Seu dia · ${dataLonga} · ${plural(n.contatos, 'contato', 'contatos')}${atr.length ? `, ${plural(atr.length, 'atrasado', 'atrasados')}` : ''}`, html,
        wa: { celular: celularBR(u.celular), params: [primeiro(u.nome), onde || 'seus veículos', String(n.contatos), String(n.propostas), n.npis ? `${n.npis} · ${brl(n.pis)}` : '0', String(atr.length), String(am.length), meta ? Math.round(vend / meta * 100) + '%' : '—'] } });
    }

    // Diretor (toda a equipe de todos os veículos da empresa)
    const diretores = teste ? [{ id: teste.id, nome: teste.nome, email: teste.email, organizacao_id: org, resumo_canal: 'email' }]
      : usuarios.filter((u: any) => u.diretor && u.organizacao_id === org && u.resumo_ativo !== false);
    if (!diretores.length) continue;
    const eq = numeros(naOrg);
    const linhasEq = consultores.map((c: any) => { const n = numeros((x: any) => naOrg(x) && x.consultor_id === c.id), meta = metaDe.get(c.id) || 0, zero = !n.contatos;
      const td = (v: string, extra = '') => `<td style="padding:8px 6px;text-align:right;${extra}">${v}</td>`;
      return `<tr style="border-top:1px solid ${LINHA};${zero ? 'background:#fff7ed' : ''}"><td style="padding:8px 6px">${esc(c.nome)}${zero ? `<br><span style="color:#b45309;font-size:12px;font-weight:700">sem registro hoje</span>` : ''}</td>
        ${td(String(n.contatos))}${td(String(n.atrasados.length), n.atrasados.length ? `color:${VERM};font-weight:700` : '')}${td(String(n.amanha.length))}${td(String(n.propostas))}${td(n.npis ? brl(n.pis) : '—')}${td(meta ? Math.round(vendidoDe(c.id) / meta * 100) + '%' : '—')}</tr>`; }).join('');
    const tabela = consultores.length ? `<div style="border:1px solid #e4e6eb;border-radius:14px;padding:4px 10px 6px;margin:0 0 14px"><p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${CINZA};margin:12px 6px 4px">Equipe hoje</p>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px"><tr style="color:${CINZA};font-size:12px;text-align:right"><th style="padding:6px;text-align:left">Consultor</th><th style="padding:6px">Contatos</th><th style="padding:6px">Atrasados</th><th style="padding:6px">Amanhã</th><th style="padding:6px">Propostas</th><th style="padding:6px">PIs</th><th style="padding:6px">Meta</th></tr>${linhasEq}</table></div>` : '';
    const atrEq = eq.atrasados.sort((a: any, b: any) => a.quando.localeCompare(b.quando));
    const aguarda = opec.filter((p: any) => naOrg(p) && !lidos.has(p.id)), dev = devolvidos.filter(naOrg);
    const vlist = (l: any[]) => { const n = [...new Set(l.map(p => nomeVei(p.veiculo_id)))]; return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : n[0] || ''; };
    const linhasPi = [aguarda.length ? item('', `<b>${plural(aguarda.length, 'PI aguardando', 'PIs aguardando')} a OPEC abrir</b> · ${esc(vlist(aguarda))}`) : '',
      ...dev.slice(0, 6).map((p: any) => item('', `<b>PI devolvido</b> pela OPEC · ${esc(nomeVei(p.veiculo_id))} nº ${p.numero}${motivos.get(p.id) ? ` · <span style="color:${CINZA}">${esc(String(motivos.get(p.id)).slice(0, 120))}</span>` : ''}`))].filter(Boolean)
      .map(h => h.replace('<td style="width:52px;padding:9px 0;vertical-align:top"><b></b></td>', ''));
    const metaG = consultores.reduce((s: number, c: any) => s + (metaDe.get(c.id) || 0), 0), vendG = consultores.filter((c: any) => metaDe.get(c.id)).reduce((s: number, c: any) => s + vendidoDe(c.id), 0);   // como no anel "Metas dos consultores"
    for (const u of diretores) {
      const html = casca(`Boa noite, ${primeiro(u.nome)}`, 'O dia da equipe em todos os veículos.',
        nums([['Contatos feitos', String(eq.contatos)], ['Propostas enviadas', String(eq.propostas)], ['PIs enviados hoje', eq.npis ? brl(eq.pis) : '0'], ['Atrasados', String(atrEq.length), atrEq.length > 0]])
        + tabela
        + bloco('Atrasados da equipe', atrEq.slice(0, 15).map(a => linhaAtraso(a, true)).concat(atrEq.length > 15 ? [`<p style="color:${CINZA};margin:8px 0">e mais ${atrEq.length - 15} no Dashboard Gestão</p>`] : []))
        + bloco('PIs', linhasPi)
        + barraMeta(`Meta do grupo em ${mesNome}`, vendG, metaG),
        'Abrir o Follow-up da equipe', link(org, 'geral/equipe'), rodape(org));
      envios.push({ usuario: u.id, tipo: 'fim_diretor', para: u.email, canal: teste ? 'email' : quer(u),
        de: `"${empDe(u)} · Follow-up" <followup@sonvi.com.br>`,
        assunto: `${teste ? '[Amostra] ' : ''}Fechamento do dia · ${dataLonga} · ${plural(eq.contatos, 'contato', 'contatos')}, ${plural(atrEq.length, 'atrasado', 'atrasados')}`, html,
        wa: teste ? undefined : { celular: celularBR((u as any).celular), params: [primeiro(u.nome), 'a equipe', String(eq.contatos), String(eq.propostas), eq.npis ? `${eq.npis} · ${brl(eq.pis)}` : '0', String(atrEq.length), String(eq.amanha.length), metaG ? Math.round(vendG / metaG * 100) + '%' : '—'] } });
    }
  }
  // Conferência sem enviar nada (só pelo agendador, com a chave interna)
  if (simular) return { simulado: true, resumos: envios.map(e => ({ tipo: e.tipo, canal: e.canal, assunto: e.assunto, de: e.de, wa: e.wa?.params })),
    html: Object.fromEntries(['fim_consultor', 'fim_diretor'].map(t => [t, envios.find(e => e.tipo === t)?.html || ''])) };
  const r = await enviarTodos(adm, chave, envios, hoje, !!teste);
  return { enviados: r.enviados, falhas: r.falhas.length, resumos: envios.length };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const chave = Deno.env.get('RESEND_API_KEY');
    if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado (falta a chave do Resend no Supabase).' }, 503);
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json().catch(() => ({}));

    // Quem chama: o agendador (chave do cofre) ou um diretor pedindo a amostra
    let teste: Teste | null = null;
    if (b.acao === 'diario' || b.acao === 'fimdia') {
      const { data: segredo } = await adm.rpc('followup_chave');
      if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
    } else if (b.acao === 'teste') {
      const auth = req.headers.get('Authorization') ?? '';
      const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      const { data: ehDiretor } = await quem.rpc('eh_diretor');
      if (!user || !ehDiretor) return resposta({ erro: 'Só o diretor pode pedir a amostra.' }, 403);
      const { data: eu } = await adm.from('usuarios').select('id, email, nome').eq('id', user.id).maybeSingle();
      const { data: org } = await quem.rpc('minha_org');   // no acesso de suporte, a empresa que está aberta
      const email = String(eu?.email || user.email || '');
      if (!emailOk(email)) return resposta({ erro: 'Seu usuário está sem e-mail válido.' }, 400);
      if (!org) return resposta({ erro: 'Empresa não encontrada.' }, 400);
      teste = { id: user.id, email, nome: String(eu?.nome || email.split('@')[0]), org: String(org) };
    } else return resposta({ erro: 'Ação desconhecida.' }, 400);

    // Link do botão: o endereço da empresa de cada pessoa (sonvi.com.br/<empresa>/)
    const { data: orgs } = await adm.from('organizacoes').select('id, slug, nome');
    const slugDe = new Map((orgs || []).map((o: any) => [o.id, o.slug]));
    // Remetente (regra de 29/10/2026: nunca "SONVI"): o veículo, ou a empresa comercial quando o e-mail junta vários veículos
    const { data: emps } = await adm.from('empresa_comercial').select('organizacao_id, nome');
    const empNome = new Map((emps || []).map((e: any) => [e.organizacao_id, String(e.nome || '')]));
    const orgNome = new Map((orgs || []).map((o: any) => [o.id, String(o.nome || '')]));
    const empDe = (u: any) => nomeLimpo(empNome.get(u?.organizacao_id) || orgNome.get(u?.organizacao_id) || 'Comercial');
    const appDe = (u: any) => { const sl = slugDe.get(u?.organizacao_id); return (sl ? `https://sonvi.com.br/${sl}/` : (Deno.env.get('APP_URL') || 'https://sonvi.com.br/').replace(/\/?$/, '/')) + '#/followup'; };
    const hoje = diaCuiaba(), ontem = somaDias(hoje, -1), amanha = somaDias(hoje, 1);

    // Configuração de cada empresa (database/083); sem linha, vale o padrão
    const { data: cfgs } = await adm.from('resumo_config').select('organizacao_id, hora, dias, manha, whatsapp_ativo');
    const cfgDe = (org: string): Cfg => (cfgs || []).find((c: any) => c.organizacao_id === org) || { organizacao_id: org, hora: 18, dias: [1, 2, 3, 4, 5], manha: false, whatsapp_ativo: false };

    // Resumo do fim do dia (agendador de hora em hora) e a amostra do diretor
    if (b.acao === 'fimdia' || teste) {
      const agora = new Date(), horaAgora = new Date(agora.getTime() - 4 * 3600e3).getUTCHours(), dow = new Date(hoje + 'T12:00:00Z').getUTCDay();
      const simular = !teste && b.simular === true;   // conferência: todas as empresas, sem enviar
      const orgs2 = teste ? [teste.org]
        : (orgs || []).map((o: any) => o.id).filter((id: string) => { const c = cfgDe(id); return simular || (c.hora === horaAgora && (c.dias || []).includes(dow)); });
      if (!orgs2.length) return resposta({ ok: true, dia: hoje, hora: horaAgora, enviados: 0, nada: 'nenhuma empresa nesta hora' });
      const r = await fimDoDia({ adm, chave, orgs: orgs2 as string[], cfgDe, empDe, slugDe, teste, hoje, agora, simular });
      return resposta({ ok: true, dia: hoje, ...r });
    }

    // E-mail das 7h30: só nas empresas que ligaram (os follow-ups automáticos são criados sempre)
    // Proposta enviada há 3 dias sem resposta vira follow-up (todo dia, às 7h30)
    let automaticos = 0;
    { const { data } = await adm.rpc('followup_automaticos'); automaticos = Number(data || 0); }
    const orgsManha = new Set((orgs || []).map((o: any) => o.id).filter((id: string) => cfgDe(id).manha));
    if (!orgsManha.size) return resposta({ ok: true, dia: hoje, automaticos, enviados: 0, manha: 'desligado' });

    // Listas inteiras, de 1.000 em 1.000 (o banco entrega no máximo 1.000 linhas por busca; 31/10/2026)
    const tudo = async (busca: any, ordem: string) => { const out: any[] = []; busca = busca.order(ordem);
      for (let i = 0; ; i += 1000) { const { data, error } = await busca.range(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) return { data: out }; } };
    const [{ data: veiculos }, { data: usuarios0 }, { data: vinculos }, { data: abertos }, { data: feitos }] = await Promise.all([
      tudo(adm.from('veiculos').select('id, nome, organizacao_id').order('nome'), 'id'),
      tudo(adm.from('usuarios').select('id, nome, email, diretor, ativo, organizacao_id').eq('ativo', true), 'id'),
      tudo(adm.from('usuario_veiculos').select('usuario_id, veiculo_id, perfil'), 'usuario_id'),
      tudo(adm.from('agenda').select('id, veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, situacao, registrado_em').eq('situacao', 'agendado').lt('quando', inicio(amanha)).order('quando'), 'id'),
      tudo(adm.from('agenda').select('id, veiculo_id, consultor_id, situacao').in('situacao', ['realizado', 'nao_atendeu']).gte('registrado_em', inicio(ontem)).lt('registrado_em', inicio(hoje)), 'id'),
    ]);
    const usuarios = (usuarios0 || []).filter((u: any) => orgsManha.has(u.organizacao_id));
    const abertas = ((abertos || []) as Linha[]).filter(a => usuarios.some((u: any) => u.id === a.consultor_id));
    const ids = [...new Set(abertas.map(a => a.cliente_id).filter(Boolean))] as string[];
    const pessoas: any[] = [];
    for (let i = 0; i < ids.length; i += 200) { const { data } = await adm.from('pessoas').select('id, nome').in('id', ids.slice(i, i + 200)); pessoas.push(...(data || [])); }
    const nomeCli = (id: string | null) => (pessoas || []).find((p: any) => p.id === id)?.nome || 'Sem cliente';
    const nomeUsu = (id: string) => (usuarios || []).find((u: any) => u.id === id)?.nome || 'Consultor';
    const nomeVei = (id: string) => (veiculos || []).find((v: any) => v.id === id)?.nome || 'Rádio';
    const atrasado = (a: Linha) => a.quando < inicio(hoje);
    const diasAtraso = (a: Linha) => Math.max(1, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(diaCuiaba(new Date(a.quando)) + 'T12:00:00Z')) / 864e5));

    // ---------- HTML simples, que funciona em qualquer leitor de e-mail ----------
    const casca = (titulo: string, intro: string, miolo: string, app: string) => `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:600px">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 8px">${titulo}</h1><p style="color:#4b4b55;margin:0 0 20px">${intro}</p>${miolo}
      <p style="margin:26px 0"><a href="${app}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Abrir o Follow-up</a></p>
      <p style="color:#6b6b74;font-size:12px">Resumo automático, todo dia às 7h30. Só chega quando há contatos para hoje ou retornos atrasados.</p></div>`;
    const bloco = (rotulo: string, linhas: string[]) => linhas.length ? `<div style="border:1px solid #e4e6eb;border-radius:14px;padding:4px 16px;margin:0 0 14px">
      <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b6b74;margin:12px 0 4px">${rotulo}</p>${linhas.join('')}</div>` : '';
    const item = (quando: string, texto: string, extra = '') => `<div style="display:flex;gap:12px;padding:9px 0;border-top:1px solid #eef0f3"><b style="min-width:50px">${quando}</b><span>${texto}${extra ? `<br><span style="color:#b42318;font-size:13px">${extra}</span>` : ''}</span></div>`;
    const linhaContato = (a: Linha, comConsultor = false) => item(atrasado(a) ? ddmm(diaCuiaba(new Date(a.quando))) : hora(a.quando),
      `<b>${esc(nomeCli(a.cliente_id))}</b> · ${esc(TIPO[a.tipo] || a.tipo)}${a.assunto ? ' · ' + esc(a.assunto) : ''}${comConsultor ? ` <span style="color:#6b6b74">· ${esc(nomeUsu(a.consultor_id))}</span>` : ''}`,
      atrasado(a) ? plural(diasAtraso(a), 'dia de atraso', 'dias de atraso') : '');

    // Resumo de uma rádio para gerente e diretor
    const resumoRadio = (vid: string) => {
      const da = abertas.filter(a => a.veiculo_id === vid), at = da.filter(atrasado), hj = da.filter(a => !atrasado(a));
      const regOntem = (feitos || []).filter((f: any) => f.veiculo_id === vid);
      const cons = [...new Set([...(vinculos || []).filter((v: any) => v.veiculo_id === vid && v.perfil === 'consultor').map((v: any) => v.usuario_id), ...da.map(a => a.consultor_id)])];
      const tabela = cons.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px"><tr style="color:#6b6b74;font-size:12px;text-align:left"><th style="padding:6px 0">Consultor</th><th style="text-align:right">Hoje</th><th style="text-align:right">Atrasados</th><th style="text-align:right">Registros ontem</th></tr>
        ${cons.map(c => { const n = at.filter(a => a.consultor_id === c).length; return `<tr style="border-top:1px solid #eef0f3"><td style="padding:8px 0">${esc(nomeUsu(c))}</td><td style="text-align:right">${hj.filter(a => a.consultor_id === c).length}</td><td style="text-align:right;${n ? 'color:#b42318;font-weight:700' : ''}">${n}</td><td style="text-align:right">${regOntem.filter((f: any) => f.consultor_id === c).length}</td></tr>`; }).join('')}</table>` : '';
      return { vazio: !da.length && !regOntem.length, at: at.length, hj: hj.length, ontem: regOntem.length,
        html: tabela + bloco('Atrasados da equipe', at.map(a => linhaContato(a, true))) };
    };

    const envios: { usuario: string; tipo: string; para: string; de: string; assunto: string; html: string }[] = [];
    const dataLonga = `${diaSemana(hoje)}, ${ddmm(hoje)}`;

    // Diretor: só as rádios da empresa dele (cada cliente do SONVI é uma organização)
    for (const u of (usuarios || []).filter((x: any) => x.diretor && x.organizacao_id && (!teste || x.id === teste.id))) {
      const partes = (veiculos || []).filter((v: any) => v.organizacao_id === u.organizacao_id).map((v: any) => ({ v, r: resumoRadio(v.id) })).filter(p => !p.r.vazio);
      if (!partes.length && !teste) continue;
      const at = partes.reduce((s, p) => s + p.r.at, 0), hj = partes.reduce((s, p) => s + p.r.hj, 0);
      const miolo = partes.length ? partes.map(p => `<h2 style="font-size:17px;margin:22px 0 8px">${esc(p.v.nome)} <span style="font-weight:400;color:#6b6b74;font-size:14px">· ${plural(p.r.hj, 'contato hoje', 'contatos hoje')}, ${plural(p.r.at, 'atrasado', 'atrasados')}</span></h2>${p.r.html}`).join('')
        : '<p style="color:#4b4b55">Nenhum contato marcado para hoje e nenhum atrasado nas rádios.</p>';
      envios.push({ usuario: u.id, tipo: 'diretor', para: u.email, de: `"${empDe(u)} · Follow-up" <followup@sonvi.com.br>`,
        assunto: `${teste ? '[Amostra] ' : ''}Follow-up das rádios · ${dataLonga} · ${plural(at, 'atrasado', 'atrasados')}`,
        html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`, `Hoje as equipes têm ${plural(hj, 'contato marcado', 'contatos marcados')} e ${plural(at, 'retorno atrasado', 'retornos atrasados')}.`, miolo, appDe(u)) });
    }

    if (!teste) {
      // Gerente: um e-mail com as rádios que ele gerencia
      const gerentes = [...new Set((vinculos || []).filter((v: any) => v.perfil === 'gerente').map((v: any) => v.usuario_id))];
      for (const gid of gerentes) {
        const u = (usuarios || []).find((x: any) => x.id === gid); if (!u || u.diretor) continue;
        const partes = (vinculos || []).filter((v: any) => v.usuario_id === gid && v.perfil === 'gerente').map((v: any) => ({ vid: v.veiculo_id, r: resumoRadio(v.veiculo_id) })).filter(p => !p.r.vazio);
        if (!partes.length) continue;
        const at = partes.reduce((s, p) => s + p.r.at, 0), hj = partes.reduce((s, p) => s + p.r.hj, 0);
        const um = partes.length === 1, nomeR = um ? nomeVei(partes[0].vid) : '';
        envios.push({ usuario: u.id, tipo: 'gerente', para: u.email, de: `"${um ? nomeLimpo(nomeR) : empDe(u)} · Follow-up" <followup@sonvi.com.br>`,
          assunto: `Follow-up da equipe${um ? ' · ' + nomeLimpo(nomeR) : ''} · ${plural(at, 'atrasado', 'atrasados')}`,
          html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`, `Sua equipe tem ${plural(hj, 'contato marcado', 'contatos marcados')} hoje e ${plural(at, 'retorno atrasado', 'retornos atrasados')}. Retorno que passou do dia sem registro aparece aqui.`,
            partes.map(p => `${um ? '' : `<h2 style="font-size:17px;margin:22px 0 8px">${esc(nomeVei(p.vid))}</h2>`}${p.r.html}`).join(''), appDe(u)) });
      }
      // Consultor: os contatos dele
      const consultores = [...new Set(abertas.map(a => a.consultor_id))];
      for (const cid of consultores) {
        const u = (usuarios || []).find((x: any) => x.id === cid); if (!u) continue;
        const meus = abertas.filter(a => a.consultor_id === cid), at = meus.filter(atrasado), hj = meus.filter(a => !atrasado(a));
        const radios = [...new Set(meus.map(a => a.veiculo_id))], um = radios.length === 1;
        const lista = (l: Linha[]) => l.map(a => linhaContato(a)).map((h, i) => um ? h : h.replace('</b> ·', `</b> <span style="color:#6b6b74">(${esc(nomeVei(l[i].veiculo_id))})</span> ·`));
        envios.push({ usuario: u.id, tipo: 'consultor', para: u.email, de: `"${um ? nomeLimpo(nomeVei(radios[0])) : empDe(u)} · Follow-up" <followup@sonvi.com.br>`,
          assunto: `Seus contatos de hoje · ${plural(hj.length, 'marcado', 'marcados')}${at.length ? `, ${plural(at.length, 'atrasado', 'atrasados')}` : ''}`,
          html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`,
            `Você tem ${plural(hj.length, 'contato', 'contatos')} hoje${at.length ? ` e ${plural(at.length, 'retorno atrasado', 'retornos atrasados')}. Os atrasados entram no resumo do seu gerente` : ''}.`,
            bloco('Atrasados', lista(at)) + bloco('Hoje', lista(hj)), appDe(u)) });
      }
    }

    const { enviados, falhas } = await enviarTodos(adm, chave, envios.map(e => ({ ...e, canal: 'email' as const })), hoje, false);
    return resposta({ ok: true, dia: hoje, automaticos, enviados, falhas: falhas.length });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

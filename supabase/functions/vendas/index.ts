// SONVI · função de borda "vendas" (database/055, aprovado em 27/10/2026): a Head 14 faz a gestão comercial e o
// financeiro de cada veículo fatura e recebe. Os e-mails saem com o nome do consultor do PI e do veículo ("João Victor · Nativa FM"
// <faturamento@sonvi.com.br>, nunca "SONVI", 29/10/2026) e a resposta vai para o e-mail dele.
//   { acao: "pedido", id }        → (diretor/financeiro logado) manda o pedido de faturamento ao financeiro do veículo,
//                                   com o link seguro confirmar.html?f=<token>. Também serve para reenviar.
//   { acao: "perguntar", id }     → (diretor/financeiro logado) pergunta agora se o cliente pagou a parcela (confirmar.html?p=<token>).
//   { acao: "diario" }            → (agendador, chave do cofre em x-sonvi-cron) lembrete semanal dos pedidos sem confirmação e
//                                   a pergunta "o cliente pagou?" no vencimento e depois uma vez por semana até a resposta.
// Envia pelo Resend (domínio sonvi.com.br); a chave fica no segredo RESEND_API_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sonvi-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n,;]/g, '').trim().slice(0, 60);
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
const brl = (v: unknown) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dfmt = (d: string) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
const diaCuiaba = (d = new Date()) => new Date(d.getTime() - 4 * 3600e3).toISOString().slice(0, 10);
const SEMANA = 7 * 864e5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const chave = Deno.env.get('RESEND_API_KEY');
    if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado (falta a chave do Resend no Supabase).' }, 503);
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json().catch(() => ({}));

    // Quem chama
    let quem: any = null, eu: any = null;
    if (b.acao === 'diario') {
      const { data: segredo } = await adm.rpc('followup_chave');
      if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
    } else if (b.acao === 'pedido' || b.acao === 'perguntar') {
      const auth = req.headers.get('Authorization') ?? '';
      quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      if (!user) return resposta({ erro: 'Entre no sistema para enviar.' }, 401);
      const { data: u } = await adm.from('usuarios').select('id, nome, email').eq('id', user.id).maybeSingle();
      eu = u || { id: user.id, nome: '', email: user.email };
    } else return resposta({ erro: 'Ação desconhecida.' }, 400);

    // Dados de apoio: empresa (nome curto), endereço do cliente do SONVI, consultor e telefone dele
    const empresaCurta = async (org: string) => { const { data } = await adm.from('empresa_comercial').select('nome').eq('organizacao_id', org).maybeSingle();
      return nomeLimpo(String(data?.nome || 'Head 14').split('·')[0]) || 'Head 14'; };
    const baseDe = async (org: string) => { const { data } = await adm.from('organizacoes').select('slug').eq('id', org).maybeSingle();
      return data?.slug ? `https://sonvi.com.br/${data.slug}/` : (Deno.env.get('APP_URL') || 'https://sonvi.com.br/').replace(/\/?$/, '/'); };
    const consultorDe = async (pi: any, reserva: any) => {
      const id = pi?.consultor_id || reserva?.id;
      const { data: u } = id ? await adm.from('usuarios').select('id, nome, email').eq('id', id).maybeSingle() : { data: null };
      const { data: c } = id ? await adm.from('colaboradores').select('celular').eq('usuario_id', id).limit(1).maybeSingle() : { data: null };
      const p = u || reserva || {}; return { nome: nomeLimpo(p.nome || ''), email: String(p.email || '').toLowerCase(), celular: String(c?.celular || '') };
    };
    const assinatura = (c: any, emp: string) => `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #eef0f3;font-size:14px">${c.nome ? `<b>${esc(c.nome)}</b><br>` : ''}<span style="color:#6b6b74">Consultor comercial · ${esc(emp)}${c.celular ? ` · ${esc(c.celular)}` : ''}</span></div>`;
    const casca = (veic: any, titulo: string, intro: string, quadro: [string, string][], botao: string, link: string, rodape: string, c: any, emp: string) =>
      `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
        <p style="margin:0 0 6px;font-weight:700">${esc(veic.nome)} · ${esc(titulo)}</p>
        <p style="margin:0 0 18px;color:#3f3f46">${intro}</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e4e6eb;border-radius:12px;font-size:14px">${quadro.map(([k, v], i) => `<tr${i ? ' style="border-top:1px solid #eef0f3"' : ''}><td style="padding:9px 14px;color:#6b6b74;white-space:nowrap">${esc(k)}</td><td style="padding:9px 14px"><b>${esc(v)}</b></td></tr>`).join('')}</table>
        <p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:${esc(/^#[0-9a-f]{6}$/i.test(veic.cor || '') ? veic.cor : '#0055ff')};color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;letter-spacing:.04em">${esc(botao)}</a></p>
        <p style="margin:0;color:#6b6b74;font-size:13px">${rodape}</p>${assinatura(c, emp)}</div>`;
    const envia = async (de: string, para: string, responder: string, assunto: string, html: string, texto: string) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto, ...(emailOk(responder) ? { reply_to: responder } : {}) }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`O serviço de e-mail recusou: ${j?.message || r.status}`); }
    };

    // ---------- pedido de faturamento ----------
    const mandarPedido = async (f: any, lembrete: boolean) => {
      const { data: v } = await adm.from('veiculos').select('id, nome, cor, organizacao_id, financeiro_email').eq('id', f.veiculo_id).maybeSingle();
      const para = String(v?.financeiro_email || '').trim().toLowerCase();
      if (!emailOk(para)) throw new Error('O e-mail do financeiro do veículo está vazio ou inválido (Administração › Veículos).');
      const { data: pi } = await adm.from('pis').select('id, consultor_id').eq('id', f.pi_id).maybeSingle();
      const [emp, base, c] = await Promise.all([empresaCurta(v.organizacao_id), baseDe(v.organizacao_id), consultorDe(pi, eu)]);
      const d = f.dados || {}, link = `${base}confirmar.html?f=${f.token}`;
      const quadro: [string, string][] = [['PI', [d.pi_no, d.titulo].filter(Boolean).join(' · ')], ['Cliente', [d.cliente, d.documento].filter(Boolean).join(' · ')],
        ['Mês veiculado', d.mes_nome || 'Período do PI'], ['Valor', brl(d.valor)], ['Vencimento', [d.vencimento ? dfmt(d.vencimento) : 'a combinar', d.forma].filter(Boolean).join(' · ')],
        ...(d.email_nota ? [['Nota e boleto para', d.email_nota] as [string, string]] : [])];
      const assunto = `${lembrete ? 'Lembrete: ' : ''}Faturar ${d.pi_no || 'PI'} · ${d.cliente || ''} · ${d.mes_nome ? d.mes_nome + ' · ' : ''}${brl(d.valor)}`.replace(/\s+/g, ' ').slice(0, 200);
      const html = casca(v, 'pedido de faturamento', lembrete ? `Ainda não recebemos a confirmação deste faturamento (pedido enviado em ${dfmt(diaCuiaba(new Date(f.criado_em)))}). Depois de emitir a nota, confirme pelo botão: o sistema fica atualizado na hora.`
        : `Olá! A ${esc(emp)} pede o faturamento abaixo. Depois de emitir a nota, confirme pelo botão: o sistema fica atualizado na hora.`,
        quadro, 'Confirmar faturamento', link, `O botão abre uma página segura; nada é confirmado só por abrir. O link vale só para este pedido. Dúvidas? Responda este e-mail${c.nome ? `: a resposta vai direto para ${esc(c.nome.split(' ')[0])}` : ''}.`, c, emp);
      const texto = `${v.nome} · pedido de faturamento\n\n${quadro.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\nConfirmar faturamento: ${link}\n\n${c.nome}\nConsultor comercial · ${emp}${c.celular ? ' · ' + c.celular : ''}`;
      await envia(`${nomeLimpo(c.nome ? c.nome + ' · ' + v.nome : v.nome)} <faturamento@sonvi.com.br>`, para, c.email || eu?.email || '', assunto, html, texto);
      await adm.from('fat_pedidos').update({ enviado_em: new Date().toISOString(), envios: (f.envios || 0) + 1, para }).eq('id', f.id);
    };

    // ---------- o cliente pagou? ----------
    const perguntar = async (l: any) => {
      const { data: v } = await adm.from('veiculos').select('id, nome, cor, sigla, organizacao_id, financeiro_email').eq('id', l.veiculo_id).maybeSingle();
      const para = String(v?.financeiro_email || '').trim().toLowerCase();
      if (!emailOk(para)) throw new Error('O e-mail do financeiro do veículo está vazio ou inválido (Administração › Veículos).');
      const { data: pi } = l.pi_id ? await adm.from('pis').select('id, numero, consultor_id').eq('id', l.pi_id).maybeSingle() : { data: null };
      const [emp, base, c] = await Promise.all([empresaCurta(v.organizacao_id), baseDe(v.organizacao_id), consultorDe(pi, eu)]);
      const piNo = pi ? `PI ${v.sigla} ${String(pi.numero).padStart(4, '0')}` : '';
      const link = `${base}confirmar.html?p=${l.pag_token}`, n = (l.pag_perguntas || 0) + 1;
      const quadro: [string, string][] = [['Cliente', l.contraparte || ''], ...(piNo ? [['PI', piNo] as [string, string]] : []), ...(l.nota_fiscal ? [['Nota fiscal', l.nota_fiscal] as [string, string]] : []),
        ['Vencimento', l.vencimento ? dfmt(l.vencimento) : 'a combinar'], ['Valor', brl(l.valor)]];
      const assunto = `O cliente pagou? ${l.contraparte || ''} · ${piNo ? piNo + ' · ' : ''}${brl(l.valor)}${l.vencimento ? ` (vence${l.vencimento < diaCuiaba() ? 'u' : ''} ${dfmt(l.vencimento).slice(0, 5)})` : ''}`.replace(/\s+/g, ' ').slice(0, 200);
      const html = casca(v, 'o cliente pagou?', n > 1 ? `Perguntamos antes e ainda não temos a resposta (esta é a ${n}ª vez). O cliente já pagou a parcela abaixo?` : 'O cliente já pagou a parcela abaixo?',
        quadro, 'Responder', link, 'Um clique: "Sim, pagou" (com a data e o valor) ou "Ainda não". Se ainda não pagou, perguntamos de novo em 7 dias. Nada é registrado só por abrir o link.', c, emp);
      const texto = `${v.nome} · o cliente pagou?\n\n${quadro.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\nResponder: ${link}\n\n${c.nome}\nConsultor comercial · ${emp}`;
      await envia(`${nomeLimpo(c.nome ? c.nome + ' · ' + v.nome : v.nome)} <faturamento@sonvi.com.br>`, para, c.email || eu?.email || '', assunto, html, texto);
      await adm.from('lancamentos').update({ pag_perguntas: n, pag_ultima: new Date().toISOString() }).eq('id', l.id);
    };

    if (b.acao === 'pedido') {
      const { data: f } = await quem.from('fat_pedidos').select('*').eq('id', String(b.id ?? '')).maybeSingle(); // RLS: diretor/financeiro do veículo
      if (!f) return resposta({ erro: 'Pedido não encontrado ou sem permissão.' }, 404);
      if (f.situacao === 'faturado') return resposta({ erro: 'Este faturamento já foi confirmado pelo financeiro.' }, 400);
      await mandarPedido(f, (f.envios || 0) > 0);
      return resposta({ ok: true });
    }
    if (b.acao === 'perguntar') {
      const { data: l } = await quem.from('lancamentos').select('*').eq('id', String(b.id ?? '')).maybeSingle(); // RLS
      if (!l || l.sentido !== 'receber') return resposta({ erro: 'Parcela não encontrada ou sem permissão.' }, 404);
      if (l.pago_em) return resposta({ erro: 'Esta parcela já está paga.' }, 400);
      await perguntar(l);
      return resposta({ ok: true });
    }

    // ---------- diário (agendador) ----------
    const agora = Date.now(), hoje = diaCuiaba(), falhas: string[] = []; let pedidos = 0, perguntas = 0;
    const { data: orgs } = await adm.from('organizacoes').select('id, situacao');
    const suspensa = new Set((orgs || []).filter((o: any) => o.situacao === 'suspenso').map((o: any) => o.id));
    const { data: veics } = await adm.from('veiculos').select('id, organizacao_id');
    const ativo = new Set((veics || []).filter((v: any) => !suspensa.has(v.organizacao_id)).map((v: any) => v.id));
    // Pedidos sem confirmação: lembrete uma vez por semana
    const { data: pend } = await adm.from('fat_pedidos').select('*').eq('situacao', 'enviado');
    for (const f of (pend || [])) {
      if (!ativo.has(f.veiculo_id)) continue;
      const ult = Date.parse(f.enviado_em || f.criado_em);
      if (agora - ult < SEMANA - 3600e3) continue;
      try { await mandarPedido(f, true); pedidos++; } catch (e) { falhas.push(`pedido ${f.id}: ${(e as Error).message}`); }
      await espera(600);
    }
    // Parcelas dos pedidos: no vencimento e depois uma vez por semana, enquanto não estiver paga
    const { data: todos } = await adm.from('fat_pedidos').select('id, pi_id, mes_ref');
    const chaves = new Set((todos || []).map((f: any) => `${f.pi_id}|${f.mes_ref}`));
    const { data: abertas } = await adm.from('lancamentos').select('*').eq('sentido', 'receber').is('pago_em', null).not('pi_id', 'is', null).lte('vencimento', hoje);
    for (const l of (abertas || [])) {
      if (!ativo.has(l.veiculo_id) || !chaves.has(`${l.pi_id}|${l.mes_ref || ''}`)) continue;
      const ult = Math.max(l.pag_ultima ? Date.parse(l.pag_ultima) : 0, l.pag_respondido_em ? Date.parse(l.pag_respondido_em) : 0);
      if (ult && agora - ult < SEMANA - 3600e3) continue;
      try { await perguntar(l); perguntas++; } catch (e) { falhas.push(`parcela ${l.id}: ${(e as Error).message}`); }
      await espera(600);
    }
    if (falhas.length) console.error('vendas: falhas', falhas);
    return resposta({ ok: true, dia: hoje, pedidos, perguntas, falhas: falhas.length });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

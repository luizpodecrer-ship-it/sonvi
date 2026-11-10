// SONVI · função de borda "whatsapp" (09/11/2026): conferência do número "SONVI Avisos" na API oficial da Meta.
// { acao: "teste", celular } → manda o modelo WHATSAPP_MODELO com valores de exemplo para o celular informado.
// Só com a chave do cofre no cabeçalho x-sonvi-cron (a mesma do agendador do resumo; rpc followup_chave): ninguém de fora dispara.
// Segredos: WHATSAPP_TOKEN, WHATSAPP_NUMERO_ID, WHATSAPP_MODELO (colados pelo Luiz no Supabase; nunca passam pelo chat).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const celularBR = (c: unknown) => { let d = String(c || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return /^55\d{10,11}$/.test(d) ? d : ''; };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: segredo } = await adm.rpc('followup_chave');
    if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.acao !== 'teste') return resposta({ erro: 'Ação desconhecida.' }, 400);
    const token = Deno.env.get('WHATSAPP_TOKEN'), numero = Deno.env.get('WHATSAPP_NUMERO_ID'), modelo = Deno.env.get('WHATSAPP_MODELO');
    const faltam = [['WHATSAPP_TOKEN', token], ['WHATSAPP_NUMERO_ID', numero], ['WHATSAPP_MODELO', modelo]].filter(x => !x[1]).map(x => x[0]);
    if (faltam.length) return resposta({ ok: false, erro: 'Faltam os segredos: ' + faltam.join(', ') }, 503);
    const para = celularBR(b.celular);
    if (!para) return resposta({ ok: false, erro: 'Celular inválido.' }, 400);
    const params = ['Luiz', 'VERDE FM', '6', '2', '3 · R$ 18.400', '1', '4', '72%'];
    const r = await fetch(`https://graph.facebook.com/v21.0/${numero}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template',
        template: { name: modelo, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }] } }),
    });
    const j = await r.json().catch(() => ({}));
    return resposta(r.ok ? { ok: true, id: j?.messages?.[0]?.id || '', para: para.slice(0, 4) + '…' + para.slice(-4) } : { ok: false, erro: j?.error?.message || String(r.status), codigo: j?.error?.code || null }, r.ok ? 200 : 502);
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, erro: (e as Error).message ?? String(e) }, 500);
  }
});

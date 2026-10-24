// SONVI · função de borda "email": o próprio sistema envia e-mails pelo Resend (domínio sonvi.com.br verificado).
// A chave do Resend fica só no servidor (segredo RESEND_API_KEY no Supabase); nunca vai para o navegador.
// Só envia sobre um PI ou uma proposta que a pessoa logada consegue ver (as regras do banco valem: RLS).
//   { tipo: "pi_opec", id, para, assunto, texto }     → remetente "<rádio> · SONVI" <pi@sonvi.com.br>; se quem envia é consultor, os gerentes da rádio vão em cópia
//   { tipo: "proposta", id, para, assunto, texto }    → remetente "<empresa comercial>" <propostas@sonvi.com.br>
//   { tipo: "cobranca", id, para, assunto, texto }    → parcela a receber (só diretor e financeiro a enxergam); remetente "<rádio> · Financeiro" <financeiro@sonvi.com.br>
// A resposta do destinatário vai para o e-mail de quem enviou (reply_to).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n]/g, '').trim().slice(0, 70);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const chave = Deno.env.get('RESEND_API_KEY');
    if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado (falta a chave do Resend no Supabase).' }, 503);
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return resposta({ erro: 'Entre no SONVI para enviar.' }, 401);

    const b = await req.json();
    const para = [...new Set(String(b.para ?? '').split(/[,;\s]+/).map((e: string) => e.trim().toLowerCase()).filter(Boolean))];
    if (!para.length || para.length > 5 || !para.every(emailOk)) return resposta({ erro: 'E-mail do destinatário inválido.' }, 400);
    const assunto = String(b.assunto ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 200);
    const texto = String(b.texto ?? '').trim().slice(0, 8000);
    if (!assunto || !texto) return resposta({ erro: 'Assunto e mensagem são obrigatórios.' }, 400);

    // O registro precisa existir e estar visível para quem envia (as regras do banco decidem)
    let remetente = '', link = '', copia: string[] = [];
    if (b.tipo === 'pi_opec') {
      const { data: pi } = await quem.from('pis').select('id, link_token, veiculo_id, veiculos(nome)').eq('id', String(b.id ?? '')).maybeSingle();
      if (!pi) return resposta({ erro: 'PI não encontrado ou sem permissão.' }, 404);
      remetente = `${nomeLimpo((pi as any).veiculos?.nome || 'Rádio')} · SONVI <pi@sonvi.com.br>`;
      // Consultor que manda o PI para a OPEC: os gerentes da rádio recebem cópia (precisam saber que foi enviado)
      const adm = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: vs } = await adm.from('usuario_veiculos').select('usuario_id, perfil').eq('veiculo_id', (pi as any).veiculo_id);
      if ((vs || []).some((x: any) => x.usuario_id === user.id && x.perfil === 'consultor')) {
        const ids = (vs || []).filter((x: any) => x.perfil === 'gerente').map((x: any) => x.usuario_id);
        const { data: gs } = ids.length ? await adm.from('usuarios').select('email').in('id', ids).eq('ativo', true) : { data: [] };
        copia = [...new Set((gs || []).map((g: any) => String(g.email || '').toLowerCase()).filter((e: string) => emailOk(e) && !para.includes(e)))].slice(0, 5);
      }
    } else if (b.tipo === 'proposta') {
      const { data: p } = await quem.from('propostas').select('id, link_token').eq('id', String(b.id ?? '')).maybeSingle();
      if (!p) return resposta({ erro: 'Proposta não encontrada ou sem permissão.' }, 404);
      const { data: e } = await quem.from('empresa_comercial').select('nome').limit(1).maybeSingle();
      remetente = `${nomeLimpo(String(e?.nome || 'Propostas').split('·')[0]) || 'Propostas'} <propostas@sonvi.com.br>`;
    } else if (b.tipo === 'cobranca') {
      const { data: l } = await quem.from('lancamentos').select('id, sentido, veiculos(nome)').eq('id', String(b.id ?? '')).maybeSingle();
      if (!l || (l as any).sentido !== 'receber') return resposta({ erro: 'Parcela não encontrada ou sem permissão.' }, 404);
      remetente = `${nomeLimpo((l as any).veiculos?.nome || 'Rádio')} · Financeiro <financeiro@sonvi.com.br>`;
    } else return resposta({ erro: 'Tipo de envio desconhecido.' }, 400);

    const { data: eu } = await quem.from('usuarios').select('nome, email').eq('id', user.id).maybeSingle();
    const responder = eu?.email || user.email || '';
    // Corpo em HTML simples: o texto como foi escrito, com os links clicáveis
    link = (texto.match(/https?:\/\/\S+/) || [''])[0];
    const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
      ${esc(texto).replace(/https?:\/\/\S+/g, u => `<a href="${u}" style="color:#0047d6">${u}</a>`).replace(/\n/g, '<br>')}
      ${link ? `<p style="margin:28px 0"><a href="${esc(link)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${b.tipo === 'pi_opec' ? 'Abrir o PI' : 'Ver a proposta'}</a></p>` : ''}
      <p style="color:#6b6b74;font-size:12px;margin-top:28px">Enviado pelo SONVI${eu?.nome ? ` por ${esc(eu.nome)}` : ''}. Para responder, é só responder este e-mail.</p></div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: para, ...(copia.length ? { cc: copia } : {}), subject: assunto, text: texto, html, ...(emailOk(responder) ? { reply_to: responder } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return resposta({ erro: `O serviço de e-mail recusou: ${j?.message || r.status}` }, 502);
    return resposta({ ok: true, id: j.id, gerentes: copia.length });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

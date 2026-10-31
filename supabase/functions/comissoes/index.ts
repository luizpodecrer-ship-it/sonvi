// SONVI · função de borda "comissoes" (database/068, aprovado em 31/10/2026, "Vendas e comissões").
//   { acao: "enviar_extrato", extrato, pdf, arquivo, mensagem } → (diretor logado) manda ao consultor o extrato de comissão do mês
//      fechado, com o PDF anexado (gerado na tela) e o link seguro extrato.html?e=<token>.
// Remetente: "<quem envia> · <empresa comercial>" <comissoes@sonvi.com.br>, resposta para quem enviou (nunca "SONVI");
// no acesso de suporte, só a empresa. Envia pelo Resend (segredo RESEND_API_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n,;]/g, '').trim().slice(0, 70);
const brl = (v: unknown) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const chave = Deno.env.get('RESEND_API_KEY');
    if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado.' }, 503);
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json().catch(() => ({}));
    if (b.acao !== 'enviar_extrato') return resposta({ erro: 'Ação desconhecida.' }, 400);

    const auth = req.headers.get('Authorization') ?? '';
    const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return resposta({ erro: 'Entre no sistema para enviar.' }, 401);

    // O banco confere se quem chama é diretor da empresa do extrato (e se o mês continua fechado)
    const { data: x, error } = await quem.rpc('extrato_para_envio', { p_extrato: String(b.extrato || '') });
    if (error) return resposta({ erro: error.message }, 400);
    const para = String(x.email || '').trim().toLowerCase();
    if (!emailOk(para)) return resposta({ erro: `${x.nome || 'O consultor'} não tem e-mail no cadastro (Administração › Colaboradores).` }, 400);
    const pdf = String(b.pdf || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(pdf) || pdf.length < 200) return resposta({ erro: 'O PDF do extrato não chegou. Tente de novo.' }, 400);
    if (pdf.length > 10 * 1024 * 1024 * 1.37) return resposta({ erro: 'O PDF ficou grande demais para o e-mail.' }, 400);

    const { data: eu } = await adm.from('usuarios').select('nome, email, organizacao_id').eq('id', user.id).maybeSingle();
    const suporte = !eu?.organizacao_id;
    const empresa = nomeLimpo(String(x.empresa || '').split('·')[0]) || 'Empresa';
    const meuNome = suporte ? '' : nomeLimpo(String(eu?.nome || '').split(' ')[0]);
    const from = `"${nomeLimpo(meuNome ? `${meuNome} · ${empresa}` : empresa)}" <comissoes@sonvi.com.br>`;
    const replyTo = !suporte && emailOk(String(eu?.email || '')) ? String(eu!.email).toLowerCase() : undefined;
    const link = `${x.slug ? `https://sonvi.com.br/${x.slug}/` : 'https://sonvi.com.br/'}extrato.html?e=${x.token}`;
    const nomeMes = `${MESES[+String(x.mes).slice(5) - 1]}/${String(x.mes).slice(0, 4)}`;
    const assunto = `Extrato de comissão · ${nomeMes} · ${empresa}`;
    const msg = String(b.mensagem || '').trim().slice(0, 3000) || `Olá! Segue o seu extrato de comissão de ${nomeMes}: ${brl(x.comissao)}.`;
    const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
      ${msg.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e4e6eb;font-size:14px;margin:6px 0 18px"><tr><td style="padding:10px 14px;color:#6b6b74">Comissão de ${esc(nomeMes)}</td><td style="padding:10px 14px;text-align:right"><b>${esc(brl(x.comissao))}</b></td></tr></table>
      <p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#15171c;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Ver o extrato</a></p>
      <p style="margin:0;color:#6b6b74;font-size:13px">O PDF do extrato vai anexado. ${esc(empresa)}.</p></div>`;
    const texto = `${msg}\n\nComissão de ${nomeMes}: ${brl(x.comissao)}\nVer o extrato: ${link}\n\nO PDF do extrato vai anexado.`;
    const arquivo = nomeLimpo(String(b.arquivo || `Extrato de comissão ${nomeMes}.pdf`)).replace(/[\\/:*?|]/g, '') || 'extrato.pdf';
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [para], subject: assunto, html, text: texto, ...(replyTo ? { reply_to: replyTo } : {}),
        attachments: [{ filename: /\.pdf$/i.test(arquivo) ? arquivo : arquivo + '.pdf', content: pdf }] }) });
    if (!r.ok) { const t = await r.text(); console.error('resend', r.status, t); return resposta({ erro: 'O e-mail não saiu. Tente de novo em instantes.' }, 502); }
    await quem.rpc('extrato_registrar_envio', { p_extrato: x.id, p_canal: 'email' });
    return resposta({ ok: true, para });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

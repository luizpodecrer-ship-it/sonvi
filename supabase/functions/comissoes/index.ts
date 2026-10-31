// SONVI · função de borda "comissoes" (database/068, aprovado em 31/10/2026, "Vendas e comissões").
//   { acao: "enviar_extrato", extrato, pdf, arquivo, mensagem } → (diretor logado) manda ao consultor o extrato de comissão do mês
//      fechado, com o PDF anexado (gerado na tela) e o link seguro extrato.html?e=<token>.
//   { acao: "enviar_previa", usuario, mes, comissao, pdf, arquivo, mensagem } → (diretor) a prévia do mês aberto (PDF e link da prévia).
// O e-mail repete o topo do extrato (layout aprovado em 31/10/2026): logo da empresa, comissão em destaque, números de apoio,
// botão "Ver o extrato completo" (no mês aberto, o link da prévia: extrato_previa_link) e o PDF anexado.
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
    if (b.acao !== 'enviar_extrato' && b.acao !== 'enviar_previa') return resposta({ erro: 'Ação desconhecida.' }, 400);
    const previa = b.acao === 'enviar_previa';

    const auth = req.headers.get('Authorization') ?? '';
    const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return resposta({ erro: 'Entre no sistema para enviar.' }, 401);

    // O banco confere se quem chama é diretor da empresa do extrato (e se o mês continua fechado)
    let x: any;
    if (previa) {
      if (!/^\d{4}-\d{2}$/.test(String(b.mes || ''))) return resposta({ erro: 'Mês inválido.' }, 400);
      const { data, error } = await quem.rpc('comissao_contato', { p_usuario: String(b.usuario || '') });
      if (error) return resposta({ erro: error.message }, 400);
      x = { ...data, mes: String(b.mes), comissao: Number(b.comissao) || 0 };
    } else {
      const { data, error } = await quem.rpc('extrato_para_envio', { p_extrato: String(b.extrato || '') });
      if (error) return resposta({ erro: error.message }, 400);
      x = data;
    }
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
    let token = x.token;
    if (previa) { const { data: t, error: et } = await quem.rpc('extrato_previa_link', { p_usuario: String(b.usuario || ''), p_mes: String(b.mes), p_resumo: b.resumo || {} });
      if (et) return resposta({ erro: et.message }, 400); token = t; }
    const link = `${x.slug ? `https://sonvi.com.br/${x.slug}/` : 'https://sonvi.com.br/'}extrato.html?e=${token}`;
    // Cores e logo da empresa comercial
    const { data: org } = x.slug ? await adm.from('organizacoes').select('id').eq('slug', x.slug).maybeSingle() : { data: null };
    const { data: ec } = org ? await adm.from('empresa_comercial').select('cor, cor2, logo, cidade').eq('organizacao_id', org.id).maybeSingle() : { data: null };
    const hex = (c: unknown, r: string) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : r;
    const cor = hex(ec?.cor, '#2b5fb5'), cor2 = hex(ec?.cor2, '#f1853d');
    const tom = (c: string, a: number) => { const n = parseInt(c.slice(1), 16), m = (k: number) => Math.round(((n >> k) & 255) * a + 255 * (1 - a)); return `rgb(${m(16)},${m(8)},${m(0)})`; };
    const logoUrl = /^https:\/\//.test(String(ec?.logo || '')) ? String(ec!.logo) : x.slug === 'head14' ? 'https://sonvi.com.br/img/head14.png' : '';
    const nm: any = b.numeros || {};
    const nomeMes = `${MESES[+String(x.mes).slice(5) - 1]}/${String(x.mes).slice(0, 4)}`;
    const mesLongo = `${MESES[+String(x.mes).slice(5) - 1]} de ${String(x.mes).slice(0, 4)}`, mesCurto = MESES[+String(x.mes).slice(5) - 1];
    const comissao = Number(nm.comissao ?? x.comissao ?? 0);
    const assunto = previa ? `Prévia da sua comissão de ${mesCurto}: ${brl(comissao)}` : `Sua comissão de ${mesCurto}: ${brl(comissao)}`;
    const msg = String(b.mensagem || '').trim().slice(0, 3000) || `Olá! Segue o seu extrato de comissão de ${nomeMes}: ${brl(x.comissao)}.`;
    const pctTxt = (n: unknown) => n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ',') + '%';
    const dmy = (d: string) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
    const sitTxt = nm.situacao === 'paga' ? `Paga em ${dmy(String(nm.pago_em))}` : nm.situacao === 'fechado' ? 'Mês fechado · a pagar' : 'Prévia · pode mudar até o fechamento';
    const sitCor = nm.situacao === 'paga' ? '#0e6b3e' : nm.situacao === 'fechado' ? cor : '#9a4a07';
    const metaPct = Number(nm.meta) ? Math.round(Number(nm.vendido || 0) / Number(nm.meta) * 100) : null;
    const linhas: [string, string][] = [['Recebido dos clientes', brl(nm.recebido ?? 0)], ['Vendido no mês', `${brl(nm.vendido ?? 0)}${metaPct !== null ? ` · meta ${metaPct}%` : ''}`],
      ...(Number(nm.fila) ? [['Comissão a caminho', brl(nm.fila)] as [string, string]] : []), ['Situação', sitTxt]];
    const assina = nomeLimpo(String(b.assina || empresa));
    const html = `<div style="background:#f3f5f9;padding:24px 12px;font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ec;border-radius:12px;border-collapse:separate;overflow:hidden">
    <tr><td style="padding:18px 22px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(empresa)}" height="34" style="display:block;height:34px;width:auto;border:0">` : `<b style="font-size:20px">${esc(empresa)}</b>`}</td>
      <td style="vertical-align:middle;text-align:right;font-size:13px;color:#4b4f5a"><b style="display:block;color:${cor};font-size:15px">${previa ? 'Prévia da comissão' : 'Extrato de comissão'}</b>${esc(mesLongo[0].toUpperCase() + mesLongo.slice(1))}</td></tr></table></td></tr>
    <tr><td style="padding:0;line-height:0;font-size:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="22%" style="height:4px;background:${cor2}"></td><td style="height:4px;background:${cor}"></td></tr></table></td></tr>
    <tr><td style="padding:22px">
      ${msg.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;color:#33363d">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
      <div style="text-align:center;padding:18px;border-radius:10px;background:${tom(cor, .1)};margin:4px 0 16px">
        <div style="color:#4b4f5a;font-weight:600;font-size:13px">${previa ? `Sua comissão de ${mesCurto} até agora` : `Sua comissão de ${mesCurto}`}</div>
        <div style="font-size:34px;line-height:1.15;font-weight:700;color:${cor}">${esc(brl(comissao))}</div>
        <div style="color:#4b4f5a;font-size:13px">${nm.pct !== null && nm.pct !== undefined ? `${pctTxt(nm.pct)} de ` : ''}${brl(nm.liquido ?? nm.recebido ?? 0)} pagos pelos seus clientes</div></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 18px">
        ${linhas.map(([k, v], i) => `<tr><td style="padding:7px 0;color:#5b606b;${i ? 'border-top:1px solid #f0f2f5' : ''}">${esc(k)}</td><td style="padding:7px 0;text-align:right;font-weight:700;${k === 'Situação' ? `color:${sitCor};` : ''}${i ? 'border-top:1px solid #f0f2f5' : ''}">${esc(v)}</td></tr>`).join('')}</table>
      <div style="text-align:center;margin:0 0 18px"><a href="${esc(link)}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px">Ver o extrato completo</a></div>
      <p style="margin:0;font-size:14px">${esc(assina)}</p></td></tr>
    <tr><td style="padding:12px 22px 18px;color:#8a8f99;font-size:12px;border-top:1px solid #f0f2f5">${esc(empresa)}${ec?.cidade ? ` · ${esc(ec.cidade)}` : ''} · O PDF ${previa ? 'da prévia' : 'do extrato'} vai anexado.</td></tr>
  </table></div>`;
    const texto = `${msg}\n\n${previa ? 'Prévia da comissão' : 'Comissão'} de ${nomeMes}: ${brl(comissao)}\n${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nVer o extrato completo: ${link}\n\n${assina}\nO PDF ${previa ? 'da prévia' : 'do extrato'} vai anexado.`;
    const arquivo = nomeLimpo(String(b.arquivo || `Extrato de comissão ${nomeMes}.pdf`)).replace(/[\\/:*?|]/g, '') || 'extrato.pdf';
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [para], subject: assunto, html, text: texto, ...(replyTo ? { reply_to: replyTo } : {}),
        attachments: [{ filename: /\.pdf$/i.test(arquivo) ? arquivo : arquivo + '.pdf', content: pdf }] }) });
    if (!r.ok) { const t = await r.text(); console.error('resend', r.status, t); return resposta({ erro: 'O e-mail não saiu. Tente de novo em instantes.' }, 502); }
    if (!previa) await quem.rpc('extrato_registrar_envio', { p_extrato: x.id, p_canal: 'email' });
    return resposta({ ok: true, para });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

// SONVI · cartão do link do extrato de comissão (31/10/2026). Quando o link extrato.html?e=<token> é colado no WhatsApp, o
// WhatsApp lê as etiquetas og: da página. Esta função do Netlify põe nelas o mês, o consultor e o valor da comissão, com a
// imagem da empresa comercial (Head 14: img/og-extrato-head14.png). Usa só a chave pública e a função extrato_por_token
// (a mesma da página). Qualquer erro devolve a página como está.
const SUPABASE = 'https://ccfsyhniwwspnpnpkjzf.supabase.co';
const CHAVE = 'sb_publishable_LHe0-gPl5-AffVTfV81lZQ_EmyzL1z1';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const res = await context.next();
  try {
    const token = new URL(req.url).searchParams.get('e') || '';
    if (!/^[0-9a-f-]{36}$/i.test(token) || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/extrato_por_token`, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token }) });
    const x = r.ok ? await r.json() : null;
    if (!x || x.reaberto) return res;
    const m = String(x.mes || ''), mes = `${MESES[+m.slice(5) - 1] || ''}/${m.slice(0, 4)}`;
    const com = (x.itens || []).reduce((t: number, i: { comissao?: number }) => t + Number(i.comissao || 0), 0);
    const emp = String((x.empresa || {}).nome || '').split('·')[0].trim();
    const sit = x.situacao === 'paga' ? ` · paga em ${String(x.pago_em || '').slice(8, 10)}/${String(x.pago_em || '').slice(5, 7)}` : x.situacao === 'previa' ? ' · prévia' : '';
    const titulo = `Extrato de comissão · ${mes[0].toUpperCase()}${mes.slice(1)}`, desc = `${x.nome || ''} · ${brl(com)}${sit}${emp ? ` · ${emp}` : ''}`;
    const img = (x.empresa || {}).slug === 'head14' ? 'https://sonvi.com.br/img/og-extrato-head14.png' : '';
    const meta = `<meta property="og:type" content="website"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}">`
      + (img ? `<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : '');
    const html = (await res.text()).replace('</head>', `${meta}</head>`);
    const h = new Headers(res.headers); h.delete('content-length');
    return new Response(html, { status: res.status, headers: h });
  } catch (_e) { return res; }
};

export const config = { path: ['/extrato.html', '/*/extrato.html'] };

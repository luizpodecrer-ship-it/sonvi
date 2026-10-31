// SONVI · função de borda "opec_link" (31/10/2026; database/067). Atende a página pública do PI (app/pi.html), que a OPEC
// abre pelo link do e-mail, sem login. Quem prova o acesso é o token do link (link_token do PI).
//   { acao: "abrir", token }                   → situação, PI original da agência e mídias (links para baixar, 30 dias)
//   { acao: "programar", token, nome, desde }  → marca programado (conta como aprovado) e avisa o consultor por e-mail
//   { acao: "devolver", token, nome, motivo }  → devolve com o motivo e avisa o consultor por e-mail
// Remetente dos avisos: "OPEC · <veículo>" (regra de 29/10/2026: nunca "SONVI").
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n,;]/g, '').trim().slice(0, 70);
const tam = (t: number) => t > 1048576 ? `${(t / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(t / 1024))} KB`;
const TRINTA_DIAS = 60 * 60 * 24 * 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const adm = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json().catch(() => ({}));
    const token = String(b.token || '');
    if (!/^[0-9a-f-]{36}$/i.test(token)) return resposta({ erro: 'Link incompleto.' }, 400);
    const { data: pi } = await adm.from('pis').select('id, numero, titulo, status, veiculo_id, consultor_id, cliente_id, veiculos(nome, sigla, cor, organizacao_id)')
      .eq('link_token', token).not('envio_html', 'is', null).maybeSingle();
    if (!pi) return resposta({ erro: 'PI não encontrado.' }, 404);
    const v: any = (pi as any).veiculos || {};
    const piNo = `PI ${v.sigla || ''} ${String((pi as any).numero).padStart(4, '0')}`;

    if (b.acao === 'abrir') {
      const pasta = `${pi.veiculo_id}/${pi.id}`;
      const { data: orig } = await adm.from('pi_originais').select('caminho, nome, tamanho, tipo, assinado').eq('pi_id', pi.id).maybeSingle();
      let original: any = null;
      if (orig) { const { data: s } = await adm.storage.from('midias').createSignedUrl(orig.caminho, TRINTA_DIAS);
        if (s?.signedUrl) original = { nome: orig.nome, tipo: orig.tipo, tamanho: tam(Number(orig.tamanho || 0)), assinado: orig.assinado, url: s.signedUrl }; }
      const midias: any[] = [];
      const { data: arqs } = await adm.storage.from('midias').list(pasta, { sortBy: { column: 'created_at', order: 'asc' } });
      const validos = (arqs || []).filter((f: any) => f.id && f.name);
      if (validos.length) { const { data: ass } = await adm.storage.from('midias').createSignedUrls(validos.map((f: any) => `${pasta}/${f.name}`), TRINTA_DIAS);
        validos.forEach((f: any, i: number) => { const u = (ass || [])[i]?.signedUrl; if (u) midias.push({ nome: String(f.name).replace(/^\d+_/, ''), info: tam(Number(f.metadata?.size || 0)), url: u, arquivo: true }); }); }
      const { data: links } = await adm.from('pi_links').select('url, titulo').eq('pi_id', pi.id).order('criado_em');
      (links || []).forEach((l: any) => { let host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch { /* */ }
        midias.push({ nome: String(l.titulo || host || 'Link'), info: host, url: String(l.url), arquivo: false }); });
      const { data: hs } = await adm.from('pi_historico').select('status, nota, em').eq('pi_id', pi.id).in('status', ['opec', 'programado', 'devolvido']).order('em', { ascending: false }).limit(5);
      const { data: lei } = await adm.from('pi_leituras').select('aberto_em').eq('pi_id', pi.id).maybeSingle();
      const prog = (hs || []).find((h: any) => h.status === 'programado');
      return resposta({ ok: true, status: pi.status, numero: piNo, veiculo: v.nome, cor: v.cor || '', recebido_em: lei?.aberto_em || null,
        programado: prog ? { em: prog.em, nota: String(prog.nota || '').replace(/^OPEC pelo link · /, '') } : null, original, midias });
    }

    if (b.acao !== 'programar' && b.acao !== 'devolver') return resposta({ erro: 'Ação desconhecida.' }, 400);
    const nome = String(b.nome || '').trim().slice(0, 80);
    let r: any;
    if (b.acao === 'programar') {
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde || '')) ? String(b.desde) : null;
      const { data, error } = await adm.rpc('pi_programar_por_link', { p_token: token, p_nome: nome, p_desde: desde });
      if (error) return resposta({ erro: error.message }, 400); r = data;
      if (r?.ja) return resposta({ ok: true, ja: true, status: r.status });
    } else {
      const motivo = String(b.motivo || '').trim().slice(0, 1000);
      const { data, error } = await adm.rpc('pi_devolver_por_link', { p_token: token, p_nome: nome, p_motivo: motivo });
      if (error) return resposta({ erro: error.message }, 400); r = data;
    }

    // Aviso ao consultor do PI (sem consultor: a quem mandou para a OPEC)
    const chave = Deno.env.get('RESEND_API_KEY');
    try {
      let para = '';
      if ((pi as any).consultor_id) { const { data: u } = await adm.from('usuarios').select('email').eq('id', (pi as any).consultor_id).maybeSingle(); para = String(u?.email || ''); }
      if (!emailOk(para)) { const { data: h } = await adm.from('pi_historico').select('usuario_id').eq('pi_id', pi.id).eq('status', 'opec').not('usuario_id', 'is', null).order('em', { ascending: false }).limit(1).maybeSingle();
        if (h?.usuario_id) { const { data: u } = await adm.from('usuarios').select('email').eq('id', h.usuario_id).maybeSingle(); para = String(u?.email || ''); } }
      if (chave && emailOk(para)) {
        const { data: o } = await adm.from('organizacoes').select('slug').eq('id', v.organizacao_id).maybeSingle();
        const { data: cli } = (pi as any).cliente_id ? await adm.from('pessoas').select('nome').eq('id', (pi as any).cliente_id).maybeSingle() : { data: null };
        const linkPi = `${o?.slug ? `https://sonvi.com.br/${o.slug}/` : 'https://sonvi.com.br/'}#/pi/${pi.id}`;
        const prog = b.acao === 'programar';
        const titulo = prog ? `${piNo} foi programado pela OPEC` : `${piNo} foi devolvido pela OPEC`;
        const linhas: [string, string][] = [['PI', `${piNo} · ${(pi as any).titulo || ''}`], ['Cliente', cli?.nome || '—'], ['Quem marcou', nome],
          ...(prog && b.desde ? [['A partir de', String(b.desde).split('-').reverse().join('/')] as [string, string]] : []),
          ...(!prog ? [['O que ajustar', String(b.motivo || '').trim()] as [string, string]] : [])];
        const cor = /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor : '#0055ff';
        const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
          <p style="margin:0 0 6px;font-weight:700">${esc(v.nome)} · ${esc(titulo)}</p>
          <p style="margin:0 0 18px;color:#3f3f46">${prog ? 'A OPEC marcou o PI como programado pelo link do e-mail. No SONVI ele já aparece como Programado.' : 'A OPEC devolveu o PI pelo link do e-mail. Ajuste no SONVI e envie de novo.'}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e4e6eb;font-size:14px">${linhas.map(([k, x], i) => `<tr${i ? ' style="border-top:1px solid #eef0f3"' : ''}><td style="padding:9px 14px;color:#6b6b74;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:9px 14px"><b>${esc(x)}</b></td></tr>`).join('')}</table>
          <p style="margin:24px 0"><a href="${esc(linkPi)}" style="display:inline-block;background:${esc(cor)};color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px">Abrir o PI no SONVI</a></p></div>`;
        const texto = `${titulo}\n\n${linhas.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\nAbrir o PI no SONVI: ${linkPi}`;
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `"${nomeLimpo('OPEC · ' + (v.nome || ''))}" <pi@sonvi.com.br>`, to: [para.toLowerCase()], subject: titulo, html, text: texto }) });
      }
    } catch (e) { console.error('aviso ao consultor', e); }
    return resposta({ ok: true, status: r?.status });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

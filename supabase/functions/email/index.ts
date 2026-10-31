// SONVI · função de borda "email": o próprio sistema envia e-mails pelo Resend (domínio sonvi.com.br verificado).
// A chave do Resend fica só no servidor (segredo RESEND_API_KEY no Supabase); nunca vai para o navegador.
// Só envia sobre um PI ou uma proposta que a pessoa logada consegue ver (as regras do banco valem: RLS).
// Remetente sempre "<consultor> · <veículo>" (29/10/2026: nunca "SONVI"); consultor = o do PI/proposta, senão quem envia.
//   { tipo: "pi_opec", id, para, assunto, texto }     → <pi@sonvi.com.br>; se quem envia é consultor, os gerentes da rádio vão em cópia.
//                                                        Leva junto as mídias do PI (versão 5, 25/10/2026): os arquivos do armazenamento "midias" como
//                                                        link para baixar (válido por 30 dias) e os links cadastrados (pi_links: WeTransfer, Google Drive…).
//                                                        Versão 8 (31/10/2026, database/067): o PI original da agência (pi_originais) vai à parte,
//                                                        com bloco "Documentos" e o arquivo anexado até 10 MB.
//   { tipo: "proposta", id, para, assunto, texto }    → <propostas@sonvi.com.br>
//   { tipo: "cobranca", id, para, assunto, texto }    → parcela a receber (só diretor e financeiro a enxergam); <financeiro@sonvi.com.br>
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
const nomeLimpo = (s: string) => String(s || '').replace(/[<>"\r\n,;]/g, '').trim().slice(0, 70);

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
    if (!user) return resposta({ erro: 'Entre no sistema para enviar.' }, 401);

    const b = await req.json();
    const para = [...new Set(String(b.para ?? '').split(/[,;\s]+/).map((e: string) => e.trim().toLowerCase()).filter(Boolean))];
    if (!para.length || para.length > 5 || !para.every(emailOk)) return resposta({ erro: 'E-mail do destinatário inválido.' }, 400);
    const assunto = String(b.assunto ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 200);
    const texto = String(b.texto ?? '').trim().slice(0, 8000);
    if (!assunto || !texto) return resposta({ erro: 'Assunto e mensagem são obrigatórios.' }, 400);

    // O registro precisa existir e estar visível para quem envia (as regras do banco decidem)
    let remetente = '', link = '', copia: string[] = [], veiculoNome = '', consultorId = '', caixa = '';
    let midias: { nome: string; url: string; info: string; arquivo: boolean }[] = [];
    let original: { nome: string; url: string; info: string; assinado: boolean | null; anexar: boolean } | null = null, piNo = '';
    if (b.tipo === 'pi_opec') {
      const { data: pi } = await quem.from('pis').select('id, numero, link_token, veiculo_id, consultor_id, veiculos(nome, sigla)').eq('id', String(b.id ?? '')).maybeSingle();
      if (!pi) return resposta({ erro: 'PI não encontrado ou sem permissão.' }, 404);
      veiculoNome = (pi as any).veiculos?.nome || ''; consultorId = (pi as any).consultor_id || ''; caixa = 'pi';
      piNo = `PI ${(pi as any).veiculos?.sigla || ''} ${String((pi as any).numero).padStart(4, '0')}`;
      // Mídias do PI: arquivos (link assinado de 30 dias, gerado com a chave do servidor) e links cadastrados (lidos com as regras de quem envia)
      const admM = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const pasta = `${(pi as any).veiculo_id}/${(pi as any).id}`;
      // PI original da agência (database/067): documento à parte, anexado ao e-mail até 10 MB (acima disso, só o link)
      const { data: orig } = await quem.from('pi_originais').select('caminho, nome, tamanho, assinado').eq('pi_id', (pi as any).id).maybeSingle();
      if (orig) { const { data: s } = await admM.storage.from('midias').createSignedUrl(orig.caminho, 60 * 60 * 24 * 30);
        const t = Number(orig.tamanho || 0);
        if (s?.signedUrl) original = { nome: orig.nome || 'PI da agência', url: s.signedUrl, info: t > 1048576 ? `${(t / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(t / 1024))} KB`, assinado: orig.assinado, anexar: t > 0 && t <= 10 * 1048576 }; }
      const { data: arqs } = await admM.storage.from('midias').list(pasta, { sortBy: { column: 'created_at', order: 'asc' } });
      const validos = (arqs || []).filter((f: any) => f.id && f.name);
      if (validos.length) {
        const { data: ass } = await admM.storage.from('midias').createSignedUrls(validos.map((f: any) => `${pasta}/${f.name}`), 60 * 60 * 24 * 30);
        validos.forEach((f: any, i: number) => { const u = (ass || [])[i]?.signedUrl; if (!u) return;
          const t = Number(f.metadata?.size || 0), tam = t > 1048576 ? `${(t / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(t / 1024))} KB`;
          midias.push({ nome: String(f.name).replace(/^\d+_/, ''), url: u.startsWith('http') ? u : `${url}/storage/v1${u}`, info: tam, arquivo: true }); });
      }
      const { data: links } = await quem.from('pi_links').select('url, titulo').eq('pi_id', (pi as any).id).order('criado_em');
      (links || []).forEach((l: any) => { let host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch { /* link estranho */ }
        midias.push({ nome: String(l.titulo || host || 'Link'), url: String(l.url), info: host, arquivo: false }); });
      // Consultor que manda o PI para a OPEC: os gerentes da rádio recebem cópia (precisam saber que foi enviado)
      const adm = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: vs } = await adm.from('usuario_veiculos').select('usuario_id, perfil').eq('veiculo_id', (pi as any).veiculo_id);
      if ((vs || []).some((x: any) => x.usuario_id === user.id && x.perfil === 'consultor')) {
        const ids = (vs || []).filter((x: any) => x.perfil === 'gerente').map((x: any) => x.usuario_id);
        const { data: gs } = ids.length ? await adm.from('usuarios').select('email').in('id', ids).eq('ativo', true) : { data: [] };
        copia = [...new Set((gs || []).map((g: any) => String(g.email || '').toLowerCase()).filter((e: string) => emailOk(e) && !para.includes(e)))].slice(0, 5);
      }
    } else if (b.tipo === 'proposta') {
      const { data: p } = await quem.from('propostas').select('id, link_token, consultor_id, veiculos(nome)').eq('id', String(b.id ?? '')).maybeSingle();
      if (!p) return resposta({ erro: 'Proposta não encontrada ou sem permissão.' }, 404);
      veiculoNome = (p as any).veiculos?.nome || ''; consultorId = (p as any).consultor_id || ''; caixa = 'propostas';
    } else if (b.tipo === 'cobranca') {
      const { data: l } = await quem.from('lancamentos').select('id, sentido, pi_id, veiculos(nome)').eq('id', String(b.id ?? '')).maybeSingle();
      if (!l || (l as any).sentido !== 'receber') return resposta({ erro: 'Parcela não encontrada ou sem permissão.' }, 404);
      veiculoNome = (l as any).veiculos?.nome || ''; caixa = 'financeiro';
      if ((l as any).pi_id) { const { data: lp } = await quem.from('pis').select('consultor_id').eq('id', (l as any).pi_id).maybeSingle(); consultorId = (lp as any)?.consultor_id || ''; }
    } else return resposta({ erro: 'Tipo de envio desconhecido.' }, 400);

    const { data: eu0 } = await quem.from('usuarios').select('nome, email, organizacao_id').eq('id', user.id).maybeSingle();
    // Acesso de suporte (equipe da plataforma, sem organização): não assina; fica o consultor do registro ou só o veículo
    const eu = eu0 && eu0.organizacao_id ? eu0 : { nome: '', email: '' };
    // Nome do consultor (o do PI/proposta; sem ele, quem envia) e do veículo no remetente; a resposta vai para o consultor
    let cons: any = null;
    if (consultorId && consultorId !== user.id) { const adm = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: cu } = await adm.from('usuarios').select('nome, email').eq('id', consultorId).maybeSingle(); cons = cu; }
    const quemNome = String((cons?.nome || eu?.nome || '')).trim(), nomeDe = nomeLimpo([quemNome, veiculoNome].filter(Boolean).join(' · ')) || nomeLimpo(veiculoNome) || 'Comercial';
    remetente = `"${nomeDe}" <${caixa}@sonvi.com.br>`;
    // Cobrança: a resposta vai para quem cobrou (financeiro); PI e proposta: para o consultor
    const responder = (caixa !== 'financeiro' && cons?.email && emailOk(cons.email) ? cons.email : '') || eu?.email || user.email || '';
    // Corpo em HTML simples: o texto como foi escrito, com os links clicáveis
    link = (texto.match(/https?:\/\/\S+/) || [''])[0];
    const selo = original ? (original.assinado === true ? 'assinado' : original.assinado === false ? 'sem assinatura' : '') : '';
    const textoOrig = original ? `\n\nPI original da agência${selo ? ` (${selo})` : ''}: ${original.url}${original.anexar ? '\n(também vai anexado a este e-mail)' : ''}` : '';
    const textoFinal = `${texto}${textoOrig}` + (midias.length ? `\n\nMídias do PI (${midias.length}):\n${midias.map(m => `- ${m.nome}${m.info ? ` (${m.info})` : ''}: ${m.url}`).join('\n')}${midias.some(m => m.arquivo) ? '\nOs links dos arquivos valem por 30 dias.' : ''}` : '');
    // PI para a OPEC: os dois documentos lado a lado (o PI SONVI pelo link da página, o original da agência anexado)
    const doc = (sigla: string, cor: string, titulo: string, sub: string, href: string, botao: string) => `<table role="presentation" style="width:100%;border:1px solid #e3e6ec;border-radius:12px;margin-top:10px;border-collapse:separate"><tr>
      <td style="width:46px;padding:12px 0 12px 14px"><div style="width:40px;height:48px;border-radius:6px;background:${cor};color:#fff;font:700 11px/48px Arial,sans-serif;text-align:center">${sigla}</div></td>
      <td style="padding:12px 10px"><b>${esc(titulo)}</b><br><span style="color:#6b6b74;font-size:13px">${sub}</span></td>
      <td style="padding:12px 14px;text-align:right;white-space:nowrap"><a href="${esc(href)}" style="color:#0047d6;font-weight:600">${botao}</a></td></tr></table>`;
    const blocoDocs = b.tipo === 'pi_opec' && link ? `<div style="margin:24px 0 0"><div style="font-weight:600">Documentos</div>
      ${doc('PI', '#0055ff', `${piNo} · ${veiculoNome}`, 'O pedido para lançar na programação · baixe o PDF na página', link, 'Abrir')}
      ${original ? doc('PDF', '#52525b', 'PI original da agência', `${selo === 'assinado' ? '<b style="color:#0b7a52">✓ Assinado</b> · ' : selo ? '<b style="color:#9a4d00">Sem assinatura</b> · ' : ''}${esc(original.nome)} · ${esc(original.info)}${original.anexar ? ' · anexado' : ''}`, original.url, 'Abrir') : ''}</div>` : '';
    const blocoMidias = midias.length ? `<div style="margin:24px 0 0;border:1px solid #e3e6ec;border-radius:12px;padding:14px 16px">
      <div style="font-weight:600;margin-bottom:8px">Mídias do PI (${midias.length})</div>
      ${midias.map(m => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #eef0f4"><span>${esc(m.nome)}<br><span style="color:#6b6b74;font-size:13px">${m.arquivo ? 'Arquivo' : 'Link'}${m.info ? ` · ${esc(m.info)}` : ''}</span></span><a href="${esc(m.url)}" style="color:#0047d6;font-weight:600;white-space:nowrap;align-self:center">${m.arquivo ? 'Baixar' : 'Abrir'}</a></div>`).join('')}
      ${midias.some(m => m.arquivo) ? '<div style="color:#6b6b74;font-size:12px;margin-top:6px">Os links dos arquivos valem por 30 dias.</div>' : ''}</div>` : '';
    const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
      ${esc(texto).replace(/https?:\/\/\S+/g, u => `<a href="${u}" style="color:#0047d6">${u}</a>`).replace(/\n/g, '<br>')}
      ${blocoDocs}
      ${link ? `<p style="margin:28px 0"><a href="${esc(link)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${b.tipo === 'pi_opec' ? 'Abrir o PI e marcar programado' : b.tipo === 'proposta' ? 'Ver a proposta' : 'Abrir'}</a></p>` : ''}
      ${blocoMidias}
      <p style="color:#6b6b74;font-size:12px;margin-top:28px">${esc(nomeDe)}. Para responder, é só responder este e-mail.</p></div>`;

    const enviar = (anexo: boolean) => fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: para, ...(copia.length ? { cc: copia } : {}), subject: assunto, text: textoFinal, html, ...(emailOk(responder) ? { reply_to: responder } : {}),
        ...(anexo && original?.anexar ? { attachments: [{ filename: original.nome.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'PI-da-agencia.pdf', path: original.url }] } : {}) }),
    });
    let r = await enviar(true);
    if (!r.ok && original?.anexar) { console.error('anexo recusado', await r.text().catch(() => '')); r = await enviar(false); }   // sem o anexo, o link continua no e-mail
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return resposta({ erro: `O serviço de e-mail recusou: ${j?.message || r.status}` }, 502);
    return resposta({ ok: true, id: j.id, gerentes: copia.length, midias: midias.length, original: !!original });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

// SONVI · função de borda "followup": o e-mail das 7h30 (Cuiabá) do Follow-up.
// Chamada todo dia pelo agendador do banco (pg_cron) com a chave interna do cofre (cabeçalho x-sonvi-cron):
//   { acao: "diario" } → cria os follow-ups de proposta sem resposta e envia:
//     consultor: os contatos dele de hoje e os atrasados (só se tiver algum);
//     gerente: o resumo da equipe da rádio (hoje, atrasados por consultor, registros de ontem);
//     diretor: o mesmo resumo de todas as rádios num e-mail só.
//   Cada resumo sai uma vez por dia por pessoa (tabela followup_envios).
// O diretor logado pode pedir uma amostra para si: { acao: "teste" } (Authorization do usuário).
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
    let teste: { id: string; email: string } | null = null;
    if (b.acao === 'diario') {
      const { data: segredo } = await adm.rpc('followup_chave');
      if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
    } else if (b.acao === 'teste') {
      const auth = req.headers.get('Authorization') ?? '';
      const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      const { data: ehDiretor } = await quem.rpc('eh_diretor');
      if (!user || !ehDiretor) return resposta({ erro: 'Só o diretor pode pedir a amostra.' }, 403);
      const { data: eu } = await adm.from('usuarios').select('id, email').eq('id', user.id).maybeSingle();
      if (!eu || !emailOk(eu.email)) return resposta({ erro: 'Seu usuário está sem e-mail válido.' }, 400);
      teste = eu;
    } else return resposta({ erro: 'Ação desconhecida.' }, 400);

    const app = (Deno.env.get('APP_URL') || 'https://teste.sonvi.com.br/').replace(/\/?$/, '/') + '#/followup';
    const hoje = diaCuiaba(), ontem = somaDias(hoje, -1), amanha = somaDias(hoje, 1);

    // Proposta enviada há 3 dias sem resposta vira follow-up antes de montar os e-mails
    let automaticos = 0;
    if (!teste) { const { data } = await adm.rpc('followup_automaticos'); automaticos = Number(data || 0); }

    const [{ data: veiculos }, { data: usuarios }, { data: vinculos }, { data: abertos }, { data: feitos }] = await Promise.all([
      adm.from('veiculos').select('id, nome, organizacao_id').order('nome'),
      adm.from('usuarios').select('id, nome, email, diretor, ativo, organizacao_id').eq('ativo', true),
      adm.from('usuario_veiculos').select('usuario_id, veiculo_id, perfil'),
      adm.from('agenda').select('id, veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, situacao, registrado_em').eq('situacao', 'agendado').lt('quando', inicio(amanha)).order('quando'),
      adm.from('agenda').select('id, veiculo_id, consultor_id, situacao').in('situacao', ['realizado', 'nao_atendeu']).gte('registrado_em', inicio(ontem)).lt('registrado_em', inicio(hoje)),
    ]);
    const abertas = (abertos || []) as Linha[];
    const ids = [...new Set(abertas.map(a => a.cliente_id).filter(Boolean))] as string[];
    const { data: pessoas } = ids.length ? await adm.from('pessoas').select('id, nome').in('id', ids) : { data: [] };
    const nomeCli = (id: string | null) => (pessoas || []).find((p: any) => p.id === id)?.nome || 'Sem cliente';
    const nomeUsu = (id: string) => (usuarios || []).find((u: any) => u.id === id)?.nome || 'Consultor';
    const nomeVei = (id: string) => (veiculos || []).find((v: any) => v.id === id)?.nome || 'Rádio';
    const atrasado = (a: Linha) => a.quando < inicio(hoje);
    const diasAtraso = (a: Linha) => Math.max(1, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(diaCuiaba(new Date(a.quando)) + 'T12:00:00Z')) / 864e5));

    // ---------- HTML simples, que funciona em qualquer leitor de e-mail ----------
    const casca = (titulo: string, intro: string, miolo: string) => `<div style="font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:600px">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 8px">${titulo}</h1><p style="color:#4b4b55;margin:0 0 20px">${intro}</p>${miolo}
      <p style="margin:26px 0"><a href="${app}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Abrir o Follow-up</a></p>
      <p style="color:#6b6b74;font-size:12px">Enviado pelo SONVI todo dia às 7h30. Só chega quando há contatos para hoje ou retornos atrasados.</p></div>`;
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
      envios.push({ usuario: u.id, tipo: 'diretor', para: u.email, de: 'SONVI · Follow-up <followup@sonvi.com.br>',
        assunto: `${teste ? '[Amostra] ' : ''}Follow-up das rádios · ${dataLonga} · ${plural(at, 'atrasado', 'atrasados')}`,
        html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`, `Hoje as equipes têm ${plural(hj, 'contato marcado', 'contatos marcados')} e ${plural(at, 'retorno atrasado', 'retornos atrasados')}.`, miolo) });
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
        envios.push({ usuario: u.id, tipo: 'gerente', para: u.email, de: `${um ? nomeLimpo(nomeR) + ' · ' : ''}SONVI <followup@sonvi.com.br>`,
          assunto: `Follow-up da equipe${um ? ' · ' + nomeLimpo(nomeR) : ''} · ${plural(at, 'atrasado', 'atrasados')}`,
          html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`, `Sua equipe tem ${plural(hj, 'contato marcado', 'contatos marcados')} hoje e ${plural(at, 'retorno atrasado', 'retornos atrasados')}. Retorno que passou do dia sem registro aparece aqui.`,
            partes.map(p => `${um ? '' : `<h2 style="font-size:17px;margin:22px 0 8px">${esc(nomeVei(p.vid))}</h2>`}${p.r.html}`).join('')) });
      }
      // Consultor: os contatos dele
      const consultores = [...new Set(abertas.map(a => a.consultor_id))];
      for (const cid of consultores) {
        const u = (usuarios || []).find((x: any) => x.id === cid); if (!u) continue;
        const meus = abertas.filter(a => a.consultor_id === cid), at = meus.filter(atrasado), hj = meus.filter(a => !atrasado(a));
        const radios = [...new Set(meus.map(a => a.veiculo_id))], um = radios.length === 1;
        const lista = (l: Linha[]) => l.map(a => linhaContato(a)).map((h, i) => um ? h : h.replace('</b> ·', `</b> <span style="color:#6b6b74">(${esc(nomeVei(l[i].veiculo_id))})</span> ·`));
        envios.push({ usuario: u.id, tipo: 'consultor', para: u.email, de: `${um ? nomeLimpo(nomeVei(radios[0])) + ' · ' : ''}SONVI <followup@sonvi.com.br>`,
          assunto: `Seus contatos de hoje · ${plural(hj.length, 'marcado', 'marcados')}${at.length ? `, ${plural(at.length, 'atrasado', 'atrasados')}` : ''}`,
          html: casca(`Bom dia, ${esc(String(u.nome || '').split(' ')[0])}`,
            `Você tem ${plural(hj.length, 'contato', 'contatos')} hoje${at.length ? ` e ${plural(at.length, 'retorno atrasado', 'retornos atrasados')}. Os atrasados entram no resumo do seu gerente` : ''}.`,
            bloco('Atrasados', lista(at)) + bloco('Hoje', lista(hj))) });
      }
    }

    // Envia (uma vez por dia por pessoa e tipo; a amostra não conta)
    let enviados = 0; const falhas: string[] = [];
    for (const e of envios) {
      if (!emailOk(String(e.para || ''))) { falhas.push(`${e.usuario}: sem e-mail`); continue; }
      if (!teste) {
        const { error } = await adm.from('followup_envios').insert({ dia: hoje, usuario_id: e.usuario, tipo: e.tipo });
        if (error) continue; // já enviado hoje
      }
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: e.de, to: [e.para], subject: e.assunto, html: e.html }),
      });
      if (r.ok) enviados++;
      else { const j = await r.json().catch(() => ({})); falhas.push(`${e.para}: ${j?.message || r.status}`);
        if (!teste) await adm.from('followup_envios').delete().match({ dia: hoje, usuario_id: e.usuario, tipo: e.tipo }); }
      await espera(600); // o Resend aceita poucos envios por segundo
    }
    if (falhas.length) console.error('followup: falhas', falhas);
    return resposta({ ok: true, dia: hoje, automaticos, enviados, falhas: falhas.length });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

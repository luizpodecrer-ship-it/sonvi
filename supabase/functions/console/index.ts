// SONVI · função de borda "console": o que o Console (console.sonvi.com.br) faz e precisa da chave secreta.
// Só a equipe SONVI (tabela plataforma_admins) usa. Os dados do cliente são gravados pelas funções console_* do banco;
// aqui ficam as contas de entrada (criar, editar, senha, bloquear, excluir) e as exclusões, que também apagam arquivos.
//   { acao: "criar_cliente", cliente: {...}, diretor: { nome, email, celular } } → { org, slug, usuario_id, senha }
//   { acao: "novo_usuario", org, usuario: { nome, email, celular }, diretor, vinculos } → { usuario_id, senha }
//   { acao: "editar_usuario", usuario_id, nome, email, celular, diretor, vinculos }
//   { acao: "senha", usuario_id }                    → { senha } (nova senha provisória)
//   { acao: "enviar_acesso", usuario_id, senha }     → manda os dados de acesso por e-mail
//   { acao: "ativo", usuario_id, ativo }             → desativa (desconecta) ou reativa
//   { acao: "excluir_usuario", usuario_id, para }    → a carteira passa para "para" (ou fica sem responsável)
//   { acao: "excluir_radio", veiculo }               → apaga a rádio com tudo o que é dela
//   { acao: "excluir_cliente", org, confirma }       → apaga o cliente inteiro (confirma = endereço do cliente)
// Equipe do Console (só o proprietário): equipe_novo, equipe_editar, equipe_senha, equipe_ativo, equipe_excluir, equipe_enviar_acesso.
// Financeiro (proprietário e financeiro): cobranca_enviar { id } (manda a cobrança agora), cobranca_recibo { id } (recibo da paga).
// Chamados: chamado_aviso { id } (qualquer pessoa que vê o chamado; avisa o outro lado por e-mail).
// Agendador (pg_cron, cabeçalho x-sonvi-cron): diario_cobranca → avisos de 10 dias antes (cobrança), N dias antes, no dia e N dias depois.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sonvi-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const PERFIS = ['gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor'];
const BANIDO = '876000h';
const senhaProvisoria = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(b, n => A[n % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string) => d ? d.slice(0, 10).split('-').reverse().join('/') : '';
const hojeCuiaba = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
const FORMAS: Record<string, string> = { boleto: 'Boleto', pix: 'Pix', boleto_pix: 'Boleto + Pix', cartao: 'Cartão de crédito', transferencia: 'Transferência' };
const PAPEIS = ['proprietario', 'suporte', 'financeiro'];
const NOME_PAPEL: Record<string, string> = { proprietario: 'Proprietário', suporte: 'Suporte', financeiro: 'Financeiro' };
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

// E-mail pelo Resend (domínio sonvi.com.br)
const enviarEmail = async (m: { from: string; to: string[]; cc?: string[]; reply_to?: string; subject: string; text: string; html: string }) => {
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) throw new Error('O envio de e-mail ainda não está configurado.');
  const corpo: any = { ...m };
  if (!corpo.cc?.length) delete corpo.cc;
  if (!corpo.reply_to || !emailOk(corpo.reply_to)) delete corpo.reply_to;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`O serviço de e-mail recusou: ${j?.message || r.status}`);
};
const casca = (titulo: string, miolo: string, rodape: string) => `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:560px">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b74;margin:0 0 6px">${esc(titulo)}</p>${miolo}
  <p style="color:#6b6b74;font-size:12px;margin-top:28px;border-top:1px solid #e2e6ee;padding-top:12px">${rodape}</p></div>`;
const linhaTab = (r: string, v: string) => `<tr><td style="color:#6b6b74;padding:4px 16px 4px 0;vertical-align:top">${esc(r)}</td><td><b>${v}</b></td></tr>`;

// Monta o e-mail de uma cobrança (tipo: emissao, lembrete, hoje, atraso, reenvio, recibo)
const emailCobranca = (tipo: string, c: any, k: any, cfg: any, hoje: string) => {
  const nome = c.cliente, venc = dataBR(c.vencimento), valor = brl(c.valor), falta = dias(c.vencimento, hoje);
  const quem = `${cfg.empresa} · CNPJ ${cfg.cnpj}`;
  const assunto: Record<string, string> = {
    emissao: `Cobrança ${c.descricao} · SONVI · vence ${venc}`, reenvio: `Cobrança ${c.descricao} · SONVI · vence ${venc}`,
    lembrete: `Lembrete: ${c.descricao} do SONVI vence em ${falta} dia${falta === 1 ? '' : 's'}`, hoje: `Vence hoje: ${c.descricao} do SONVI`,
    atraso: `Em atraso: ${c.descricao} do SONVI (venceu ${venc})`, recibo: `Recibo: ${c.descricao} do SONVI`,
  };
  const abre: Record<string, string> = {
    emissao: `Segue a cobrança do SONVI de <b>${esc(nome)}</b>.`, reenvio: `Segue de novo a cobrança do SONVI de <b>${esc(nome)}</b>.`,
    lembrete: `Lembrete: a cobrança do SONVI de <b>${esc(nome)}</b> vence em <b>${falta} dia${falta === 1 ? '' : 's'}</b>.`,
    hoje: `A cobrança do SONVI de <b>${esc(nome)}</b> vence <b>hoje</b>.`,
    atraso: `Não identificamos o pagamento da cobrança do SONVI de <b>${esc(nome)}</b>, que venceu em <b>${venc}</b>. Se já pagou, desconsidere e, se puder, responda com o comprovante.`,
    recibo: `Recebemos o pagamento do SONVI de <b>${esc(nome)}</b>. Obrigado!`,
  };
  const pago = tipo === 'recibo';
  let tab = linhaTab('Referente', esc(c.descricao)) + linhaTab(pago ? 'Pago em' : 'Vencimento', pago ? dataBR(c.pago_em) : venc) + linhaTab('Valor', pago ? brl(c.valor_pago ?? c.valor) : valor);
  if (!pago) tab += linhaTab('Forma', esc(FORMAS[c.forma] || c.forma));
  let pagar = '';
  if (!pago) {
    const partes: string[] = [];
    if (cfg.pix_chave && /pix/.test(c.forma)) partes.push(`<p style="margin:6px 0">Pix (chave): <b style="font-family:Menlo,Consolas,monospace">${esc(cfg.pix_chave)}</b></p>`);
    if (cfg.dados_bancarios && /transferencia|boleto|pix/.test(c.forma)) partes.push(`<p style="margin:6px 0;white-space:pre-line">${esc(cfg.dados_bancarios)}</p>`);
    if (/boleto/.test(c.forma)) partes.push(`<p style="margin:6px 0;color:#6b6b74">O boleto segue em mensagem separada ou pode ser pedido respondendo este e-mail.</p>`);
    if (partes.length) pagar = `<div style="background:#f4f6fa;border-radius:10px;padding:12px 16px;margin:14px 0"><p style="margin:0 0 4px;font-size:13px;color:#6b6b74">Como pagar</p>${partes.join('')}</div>`;
    if (tipo === 'atraso' && (Number(cfg.multa) || Number(cfg.juros))) pagar += `<p style="font-size:13px;color:#6b6b74">Após o vencimento: multa de ${String(cfg.multa).replace('.', ',')}% e juros de ${String(cfg.juros).replace('.', ',')}% ao mês.</p>`;
  }
  const miolo = `<p>Olá${k?.pagador ? ', ' + esc(k.pagador) : ''}!</p><p>${abre[tipo]}</p><table style="border-collapse:collapse;margin:14px 0;font-size:15px">${tab}</table>${pagar}<p>Dúvidas? É só responder este e-mail.</p>`;
  const html = casca(pago ? 'Recibo · SONVI' : 'Cobrança · SONVI', miolo, `${esc(quem)} · sistema SONVI`);
  const texto = `Olá!\n\n${abre[tipo].replace(/<[^>]+>/g, '')}\n\nReferente: ${c.descricao}\n${pago ? 'Pago em: ' + dataBR(c.pago_em) : 'Vencimento: ' + venc}\nValor: ${pago ? brl(c.valor_pago ?? c.valor) : valor}\n${!pago && cfg.pix_chave && /pix/.test(c.forma) ? 'Pix (chave): ' + cfg.pix_chave + '\n' : ''}${!pago && cfg.dados_bancarios ? cfg.dados_bancarios + '\n' : ''}\n${quem}`;
  return { subject: assunto[tipo], html, text: texto };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json();
    const config = async () => (await adm.from('console_config').select('*').eq('id', 1).single()).data;

    // Envia um aviso de cobrança e anota na cobrança (para não repetir)
    const avisar = async (c: any, tipo: string, cfg: any, hoje: string, copia = false) => {
      const { data: k } = await adm.from('console_contratos').select('email_cobranca, pagador').eq('organizacao_id', c.organizacao_id).maybeSingle();
      const para = String(k?.email_cobranca || '').split(/[,;\s]+/).filter(emailOk);
      if (!para.length) throw new Error('O contrato deste cliente não tem e-mail de cobrança.');
      const { data: o } = await adm.from('organizacoes').select('nome').eq('id', c.organizacao_id).maybeSingle();
      const m = emailCobranca(tipo, { ...c, cliente: o?.nome || '' }, k, cfg, hoje);
      await enviarEmail({ from: `${cfg.empresa} · SONVI <cobranca@sonvi.com.br>`, to: para, cc: copia && emailOk(cfg.email_resposta) ? [cfg.email_resposta] : [], reply_to: cfg.email_resposta, ...m });
      const avisos = [...(Array.isArray(c.avisos) ? c.avisos : []), { tipo, em: new Date().toISOString(), para: para.join(', ') }];
      await adm.from('console_cobrancas').update({ avisos }).eq('id', c.id);
      return para.join(', ');
    };

    // Agendador do banco: avisos automáticos de cobrança
    if (b.acao === 'diario_cobranca') {
      const { data: segredo } = await adm.rpc('followup_chave');
      if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
      const cfg = await config();
      if (!cfg?.avisos_ligados) return resposta({ ok: true, enviados: 0, desligados: true });
      const hoje = hojeCuiaba(), antes = Number(cfg.aviso_dias_antes) || 5, depois = Number(cfg.aviso_dias_depois) || 3, EMISSAO = Math.max(10, antes + 1);
      const { data: abertas } = await adm.from('console_cobrancas').select('*').eq('situacao', 'aberta');
      const { data: orgs } = await adm.from('organizacoes').select('id, situacao');
      const suspensa = new Set((orgs || []).filter((o: any) => o.situacao === 'suspenso').map((o: any) => o.id));
      let enviados = 0; const erros: string[] = [];
      for (const c of abertas || []) {
        if (suspensa.has(c.organizacao_id)) continue;
        const ja = new Set((c.avisos || []).map((a: any) => a.tipo)), hojeJa = (c.avisos || []).some((a: any) => String(a.em).slice(0, 10) === new Date().toISOString().slice(0, 10));
        if (hojeJa) continue;
        const d = dias(c.vencimento, hoje);
        let tipo = '';
        if (d <= -depois) { if (!ja.has('atraso')) tipo = 'atraso'; }
        else if (d === 0) { if (!ja.has('hoje')) tipo = 'hoje'; }
        else if (d > 0 && d <= antes) { if (!ja.has('lembrete') && !ja.has('hoje')) tipo = 'lembrete'; }
        else if (d > antes && d <= EMISSAO) { if (!ja.size) tipo = 'emissao'; }
        if (!tipo) continue;
        try { await avisar(c, tipo, cfg, hoje, tipo === 'atraso'); enviados++; await espera(600); } catch (e) { erros.push(`${c.id}: ${(e as Error).message}`); }
      }
      return resposta({ ok: true, enviados, erros });
    }

    const quem = createClient(url, publica, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user: eu } } = await quem.auth.getUser(token);
    if (!eu) return resposta({ erro: 'Entre de novo.' }, 401);

    // Chamado: avisa o outro lado da última mensagem (cliente → equipe SONVI; suporte → quem abriu)
    if (b.acao === 'chamado_aviso') {
      const { data: ch } = await quem.from('console_chamados').select('*').eq('id', String(b.id ?? '')).maybeSingle();
      if (!ch) return resposta({ erro: 'Chamado não encontrado.' }, 404);
      const { data: msgs } = await adm.from('console_chamado_msgs').select('texto, do_suporte, autor, criado_em').eq('chamado_id', ch.id).order('criado_em', { ascending: false }).limit(1);
      const ult = msgs?.[0]; if (!ult) return resposta({ ok: true });
      const { data: o } = await adm.from('organizacoes').select('nome, slug').eq('id', ch.organizacao_id).maybeSingle();
      const { data: autor } = await adm.from('usuarios').select('nome, email').eq('id', ult.autor).maybeSingle();
      const num = '#' + String(ch.numero).padStart(4, '0');
      let para: string[] = [], link = '', titulo = '', resp = '';
      if (ult.do_suporte) {
        const { data: abriu } = await adm.from('usuarios').select('email, ativo, organizacao_id').eq('id', ch.aberto_por).maybeSingle();
        if (!abriu?.organizacao_id || !abriu.ativo) return resposta({ ok: true, sem: 'destinatario' });
        para = [abriu.email]; link = `https://sonvi.com.br/${o?.slug}/#/suporte/${ch.id}`; titulo = `Suporte SONVI respondeu o chamado ${num}`;
        const cfg = await config(); resp = cfg?.email_resposta || '';
      } else {
        const { data: eq } = await adm.from('plataforma_admins').select('papel, usuarios!inner(email, ativo)').in('papel', ['proprietario', 'suporte']);
        para = (eq || []).filter((x: any) => x.usuarios?.ativo).map((x: any) => x.usuarios.email).filter(emailOk);
        link = `https://sonvi.com.br/console/#/suporte/${ch.id}`; titulo = `${o?.nome}: ${num} · ${ch.assunto}`; resp = autor?.email || '';
      }
      if (!para.length) return resposta({ ok: true, sem: 'destinatario' });
      const quemEscreveu = ult.do_suporte ? 'Suporte SONVI' : (autor?.nome || o?.nome || '');
      const miolo = `<p><b>${esc(num)} · ${esc(ch.assunto)}</b><br><span style="color:#6b6b74;font-size:13px">${esc(o?.nome || '')} · prioridade ${esc(ch.prioridade)}</span></p>
        <div style="background:#f4f6fa;border-radius:10px;padding:12px 16px;margin:14px 0;white-space:pre-line"><span style="font-size:12px;color:#6b6b74">${esc(quemEscreveu)}</span><br>${esc(ult.texto)}</div>
        <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">Abrir o chamado</a></p>`;
      try {
        await enviarEmail({ from: 'Suporte SONVI <suporte@sonvi.com.br>', to: para, reply_to: resp, subject: titulo,
          html: casca('Suporte SONVI', miolo, 'Responda pelo SONVI para tudo ficar registrado no chamado.'), text: `${titulo}\n\n${quemEscreveu}:\n${ult.texto}\n\nAbrir: ${link}` });
      } catch (e) { return resposta({ erro: (e as Error).message }, 502); }
      return resposta({ ok: true });
    }

    // Pessoa de um cliente (nunca a equipe SONVI)
    const alvo = async (id: string) => {
      const { data: u } = await adm.from('usuarios').select('id, nome, email, celular, ativo, diretor, trocar_senha, organizacao_id').eq('id', id).maybeSingle();
      return u && u.organizacao_id ? u : null;
    };
    const conferirPessoa = async (d: any, menos = '') => {
      const email = String(d?.email ?? '').trim().toLowerCase();
      if (!String(d?.nome ?? '').trim()) return 'Informe o nome.';
      if (!emailOk(email)) return 'E-mail inválido.';
      let q = adm.from('usuarios').select('id').ilike('email', email); if (menos) q = q.neq('id', menos);
      const { data: existe } = await q.maybeSingle();
      if (existe) return 'Já existe um usuário com esse e-mail no SONVI.';
      return '';
    };
    // Rádios e perfis só da empresa da pessoa (o gatilho do banco confere de novo)
    const gravarVinculos = async (id: string, org: string, diretor: boolean, vinculos: any) => {
      const lista = (Array.isArray(vinculos) ? vinculos : []).filter((v: any) => v && v.veiculo_id && PERFIS.includes(v.perfil));
      const { data: radios } = await adm.from('veiculos').select('id').eq('organizacao_id', org);
      const daOrg = new Set((radios || []).map((r: any) => r.id));
      if (lista.some((v: any) => !daOrg.has(v.veiculo_id))) throw new Error('Rádio de outro cliente.');
      if (!diretor && !lista.length) throw new Error('Escolha pelo menos uma rádio e o perfil nela (ou a função de diretor).');
      const { error: e0 } = await adm.from('usuario_veiculos').delete().eq('usuario_id', id); if (e0) throw e0;
      if (!diretor && lista.length) { const { error } = await adm.from('usuario_veiculos').insert(lista.map((v: any) => ({ usuario_id: id, veiculo_id: v.veiculo_id, perfil: v.perfil }))); if (error) throw error; }
    };
    // Cria a conta já confirmada, com senha provisória, dentro da organização
    const criarPessoa = async (org: string, d: any, diretor: boolean, vinculos: any = []) => {
      const email = String(d?.email ?? '').trim().toLowerCase(), nome = String(d?.nome ?? '').trim(), celular = String(d?.celular ?? '').trim();
      const senha = senhaProvisoria();
      const { data, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) throw new Error(/already|registered|exists/i.test(error.message) ? 'Já existe um usuário com esse e-mail no SONVI.' : error.message);
      const { error: e1 } = await adm.from('usuarios').update({ nome, celular, diretor, ativo: true, trocar_senha: true, organizacao_id: org }).eq('id', data.user.id);
      if (e1) throw e1;
      if (!diretor) await gravarVinculos(data.user.id, org, false, vinculos);
      return { usuario_id: data.user.id, senha };
    };

    const { data: papel } = await quem.rpc('console_papel');
    if (!papel) return resposta({ erro: 'Acesso só para a equipe SONVI.' }, 403);
    const exige = (...p: string[]) => { if (!p.includes(papel as string)) throw Object.assign(new Error('A sua função no Console não permite isso.'), { status: 403 }); };
    const PROPRIETARIO = ['criar_cliente', 'novo_usuario', 'novo_diretor', 'editar_usuario', 'senha', 'senha_diretor', 'ativo', 'excluir_usuario', 'excluir_radio', 'excluir_cliente', 'enviar_acesso',
      'equipe_novo', 'equipe_editar', 'equipe_senha', 'equipe_ativo', 'equipe_excluir', 'equipe_enviar_acesso'];
    if (PROPRIETARIO.includes(b.acao)) exige('proprietario');
    if (['cobranca_enviar', 'cobranca_recibo'].includes(b.acao)) exige('proprietario', 'financeiro');

    if (b.acao === 'cobranca_enviar' || b.acao === 'cobranca_recibo') {
      const { data: c } = await adm.from('console_cobrancas').select('*').eq('id', String(b.id ?? '')).maybeSingle();
      if (!c) return resposta({ erro: 'Cobrança não encontrada.' }, 404);
      const recibo = b.acao === 'cobranca_recibo';
      if (recibo && c.situacao !== 'paga') return resposta({ erro: 'Esta cobrança ainda não foi paga.' }, 409);
      if (!recibo && c.situacao !== 'aberta') return resposta({ erro: 'Só dá para cobrar o que está em aberto.' }, 409);
      const cfg = await config(), hoje = hojeCuiaba();
      const tipo = recibo ? 'recibo' : dias(c.vencimento, hoje) < 0 ? 'atraso' : 'reenvio';
      try { return resposta({ ok: true, para: await avisar(c, tipo, cfg, hoje) }); } catch (e) { return resposta({ erro: (e as Error).message }, 400); }
    }

    // Equipe do Console
    const daEquipe = async (id: string) => {
      const { data: a } = await adm.from('plataforma_admins').select('usuario_id, papel').eq('usuario_id', id).maybeSingle();
      if (!a) return null;
      const { data: u } = await adm.from('usuarios').select('id, nome, email, celular, ativo, trocar_senha').eq('id', id).maybeSingle();
      return u ? { ...u, papel: a.papel } : null;
    };
    const proprietariosAtivos = async () => {
      const { data } = await adm.from('plataforma_admins').select('usuario_id, usuarios!inner(ativo)').eq('papel', 'proprietario');
      return (data || []).filter((x: any) => x.usuarios?.ativo).map((x: any) => x.usuario_id);
    };

    if (b.acao === 'equipe_novo') {
      const erro = await conferirPessoa(b);
      if (erro) return resposta({ erro }, 400);
      if (!PAPEIS.includes(b.papel)) return resposta({ erro: 'Escolha a função.' }, 400);
      const email = String(b.email).trim().toLowerCase(), nome = String(b.nome).trim(), senha = senhaProvisoria();
      const { data, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe um usuário com esse e-mail no SONVI.' : error.message }, 400);
      const { error: e1 } = await adm.from('usuarios').update({ nome, celular: String(b.celular ?? '').trim(), diretor: false, ativo: true, trocar_senha: true, organizacao_id: null }).eq('id', data.user.id);
      if (e1) return resposta({ erro: e1.message }, 400);
      const { error: e2 } = await adm.from('plataforma_admins').insert({ usuario_id: data.user.id, papel: b.papel });
      if (e2) return resposta({ erro: e2.message }, 400);
      return resposta({ usuario_id: data.user.id, senha });
    }

    if (b.acao === 'equipe_editar') {
      const u = await daEquipe(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Pessoa não encontrada na equipe do Console.' }, 404);
      const erro = await conferirPessoa(b, u.id);
      if (erro) return resposta({ erro }, 400);
      if (!PAPEIS.includes(b.papel)) return resposta({ erro: 'Escolha a função.' }, 400);
      if (u.papel === 'proprietario' && b.papel !== 'proprietario' && (await proprietariosAtivos()).filter(id => id !== u.id).length === 0)
        return resposta({ erro: 'É preciso ter pelo menos um proprietário ativo.' }, 400);
      const email = String(b.email).trim().toLowerCase();
      if (email !== String(u.email || '').toLowerCase()) {
        const { error } = await adm.auth.admin.updateUserById(u.id, { email, email_confirm: true });
        if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe outro usuário com esse e-mail.' : error.message }, 400);
      }
      await adm.from('usuarios').update({ nome: String(b.nome).trim(), email, celular: String(b.celular ?? '').trim() }).eq('id', u.id);
      await adm.from('plataforma_admins').update({ papel: b.papel }).eq('usuario_id', u.id);
      return resposta({ ok: true });
    }

    if (b.acao === 'equipe_senha') {
      const u = await daEquipe(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Pessoa não encontrada na equipe do Console.' }, 404);
      if (u.id === eu.id) return resposta({ erro: 'Para a sua senha, use "Trocar minha senha".' }, 400);
      const senha = senhaProvisoria();
      const { error } = await adm.auth.admin.updateUserById(u.id, { password: senha });
      if (error) return resposta({ erro: error.message }, 400);
      await adm.from('usuarios').update({ trocar_senha: true }).eq('id', u.id);
      return resposta({ senha });
    }

    if (b.acao === 'equipe_ativo' || b.acao === 'equipe_excluir') {
      const u = await daEquipe(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Pessoa não encontrada na equipe do Console.' }, 404);
      if (u.id === eu.id) return resposta({ erro: 'Você não pode fazer isso com a sua própria conta.' }, 400);
      if (u.papel === 'proprietario' && (await proprietariosAtivos()).filter(id => id !== u.id).length === 0) return resposta({ erro: 'É preciso ter pelo menos um proprietário ativo.' }, 400);
      if (b.acao === 'equipe_ativo') {
        const ativo = !!b.ativo;
        const { error } = await adm.auth.admin.updateUserById(u.id, { ban_duration: ativo ? 'none' : BANIDO });
        if (error) return resposta({ erro: error.message }, 400);
        await adm.from('usuarios').update({ ativo }).eq('id', u.id);
        return resposta({ ok: true });
      }
      // Excluir: sai da equipe; a conta é apagada (ou, se já entrou como suporte em algum cliente, fica bloqueada para manter o registro)
      await adm.from('usuarios').update({ ativo: false }).eq('id', u.id);
      const { error: e0 } = await adm.from('plataforma_admins').delete().eq('usuario_id', u.id);
      if (e0) return resposta({ erro: e0.message }, 400);
      const { error } = await adm.auth.admin.deleteUser(u.id);
      if (error) { await adm.auth.admin.updateUserById(u.id, { ban_duration: BANIDO }); return resposta({ ok: true, bloqueado: true }); }
      return resposta({ ok: true });
    }

    if (b.acao === 'equipe_enviar_acesso') {
      const u = await daEquipe(String(b.usuario_id ?? '')), senha = String(b.senha ?? '');
      if (!u || !u.ativo) return resposta({ erro: 'Pessoa não encontrada ou desativada.' }, 404);
      if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(senha)) return resposta({ erro: 'Senha provisória inválida.' }, 400);
      if (!u.trocar_senha) return resposta({ erro: 'Esta pessoa já criou a própria senha. Gere uma nova senha provisória antes de enviar.' }, 409);
      const destino = 'https://sonvi.com.br/console/', nome = String(u.nome || '').split(' ')[0];
      const miolo = `<p>Olá${nome ? ', ' + esc(nome) : ''}!</p><p>Seu acesso ao <b>Console SONVI</b> está pronto, com a função <b>${esc(NOME_PAPEL[u.papel] || u.papel)}</b>.</p>
        <table style="border-collapse:collapse;margin:18px 0;font-size:15px">${linhaTab('Endereço', esc(destino.replace('https://', '')))}${linhaTab('E-mail', esc(u.email))}${linhaTab('Senha provisória', `<span style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(senha)}</span>`)}</table>
        <p style="margin:24px 0"><a href="${destino}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Entrar no Console</a></p>`;
      const { data: remet } = await adm.from('usuarios').select('email').eq('id', eu.id).maybeSingle();
      try {
        await enviarEmail({ from: 'SONVI <acesso@sonvi.com.br>', to: [u.email], reply_to: remet?.email, subject: 'Seu acesso ao Console SONVI', html: casca('Console SONVI', miolo, 'No primeiro acesso você vai criar a sua própria senha.'),
          text: `Seu acesso ao Console SONVI está pronto (${NOME_PAPEL[u.papel] || u.papel}).\n\nEntre em: ${destino}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.` });
      } catch (e) { return resposta({ erro: (e as Error).message }, 502); }
      return resposta({ ok: true, email: u.email });
    }

    if (b.acao === 'criar_cliente') {
      const erro = await conferirPessoa(b.diretor);
      if (erro) return resposta({ erro: erro.replace('Informe o nome.', 'Informe o nome do diretor.') }, 400);
      const { data: org, error } = await quem.rpc('console_criar_cliente', { p: b.cliente || {} });
      if (error) return resposta({ erro: error.message }, 400);
      try {
        const d = await criarPessoa(org as string, b.diretor, true);
        return resposta({ org, slug: String(b.cliente?.slug || '').trim().toLowerCase(), ...d });
      } catch (e) {
        return resposta({ org, erro: `O cliente foi criado, mas o diretor não: ${(e as Error).message} Abra o cliente e use "Cadastrar usuário".` }, 400);
      }
    }

    if (b.acao === 'novo_usuario' || b.acao === 'novo_diretor') {
      const pessoa = b.usuario || b.diretor, diretor = b.acao === 'novo_diretor' || !!b.diretor;
      const erro = await conferirPessoa(pessoa);
      if (erro) return resposta({ erro }, 400);
      const { data: o } = await adm.from('organizacoes').select('id').eq('id', String(b.org ?? '')).maybeSingle();
      if (!o) return resposta({ erro: 'Cliente não encontrado.' }, 404);
      try { return resposta(await criarPessoa(o.id, pessoa, diretor === true, b.vinculos)); } catch (e) { return resposta({ erro: (e as Error).message }, 400); }
    }

    if (b.acao === 'editar_usuario') {
      const u = await alvo(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      const erro = await conferirPessoa(b, u.id);
      if (erro) return resposta({ erro }, 400);
      const email = String(b.email).trim().toLowerCase(), diretor = !!b.diretor;
      try {
        if (email !== String(u.email || '').toLowerCase()) {
          const { error } = await adm.auth.admin.updateUserById(u.id, { email, email_confirm: true });
          if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe outro usuário com esse e-mail.' : error.message }, 400);
        }
        await gravarVinculos(u.id, u.organizacao_id, diretor, b.vinculos);
        const { error: e1 } = await adm.from('usuarios').update({ nome: String(b.nome).trim(), email, celular: String(b.celular ?? '').trim(), diretor }).eq('id', u.id);
        if (e1) throw e1;
      } catch (e) { return resposta({ erro: (e as Error).message }, 400); }
      return resposta({ ok: true });
    }

    if (b.acao === 'senha' || b.acao === 'senha_diretor') {
      const u = await alvo(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      const senha = senhaProvisoria();
      const { error } = await adm.auth.admin.updateUserById(u.id, { password: senha });
      if (error) return resposta({ erro: error.message }, 400);
      await adm.from('usuarios').update({ trocar_senha: true }).eq('id', u.id);
      return resposta({ senha });
    }

    if (b.acao === 'ativo') {
      const u = await alvo(String(b.usuario_id ?? '')), ativo = !!b.ativo;
      if (!u) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      const { error } = await adm.auth.admin.updateUserById(u.id, { ban_duration: ativo ? 'none' : BANIDO });
      if (error) return resposta({ erro: error.message }, 400);
      await adm.from('usuarios').update({ ativo }).eq('id', u.id);
      return resposta({ ok: true });
    }

    if (b.acao === 'excluir_usuario') {
      const u = await alvo(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      const { data: passou, error: e0 } = await quem.rpc('console_preparar_exclusao', { p_usuario: u.id, p_para: b.para ? String(b.para) : null });
      if (e0) return resposta({ erro: e0.message }, 400);
      const { error } = await adm.auth.admin.deleteUser(u.id);
      if (error) return resposta({ erro: error.message }, 400);
      return resposta({ ok: true, passou });
    }

    // Arquivos do PI de uma rádio (armazenamento "midias", em <veiculo>/<pi>/arquivo)
    const apagarArquivos = async (veiculo: string) => {
      const st = adm.storage.from('midias');
      const { data: pastas } = await st.list(veiculo, { limit: 1000 });
      for (const p of pastas || []) {
        const { data: arqs } = await st.list(`${veiculo}/${p.name}`, { limit: 1000 });
        const nomes = (arqs || []).map((a: any) => `${veiculo}/${p.name}/${a.name}`);
        if (p.id) nomes.push(`${veiculo}/${p.name}`);
        if (nomes.length) await st.remove(nomes);
      }
    };

    if (b.acao === 'excluir_radio') {
      const veiculo = String(b.veiculo ?? '');
      const { data: v } = await adm.from('veiculos').select('id').eq('id', veiculo).maybeSingle();
      if (!v) return resposta({ erro: 'Rádio não encontrada.' }, 404);
      const { data: apagou, error } = await quem.rpc('console_excluir_radio', { p_veiculo: veiculo });
      if (error) return resposta({ erro: error.message }, 400);
      try { await apagarArquivos(veiculo); } catch (e) { console.error(e); }
      return resposta({ ok: true, apagou });
    }

    if (b.acao === 'excluir_cliente') {
      const org = String(b.org ?? '');
      const { data: radios } = await adm.from('veiculos').select('id').eq('organizacao_id', org);
      const { data: equipe, error } = await quem.rpc('console_excluir_cliente', { p_org: org, p_confirma: String(b.confirma ?? '') });
      if (error) return resposta({ erro: error.message }, 400);
      for (const r of radios || []) { try { await apagarArquivos(r.id); } catch (e) { console.error(e); } }
      const { data: admins } = await adm.from('plataforma_admins').select('usuario_id');
      const sonvi = new Set((admins || []).map((a: any) => a.usuario_id));
      let contas = 0;
      for (const id of (equipe as string[]) || []) { if (sonvi.has(id)) continue; const { error: e1 } = await adm.auth.admin.deleteUser(id); if (!e1) contas++; else console.error(e1); }
      return resposta({ ok: true, contas });
    }

    if (b.acao === 'enviar_acesso') {
      const u = await alvo(String(b.usuario_id ?? '')), senha = String(b.senha ?? '');
      if (!u || !u.ativo) return resposta({ erro: 'Usuário não encontrado ou desativado.' }, 404);
      if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(senha)) return resposta({ erro: 'Senha provisória inválida.' }, 400);
      if (!u.trocar_senha) return resposta({ erro: 'Esta pessoa já criou a própria senha. Gere uma nova senha provisória antes de enviar.' }, 409);
      const { data: o } = await adm.from('organizacoes').select('nome, slug').eq('id', u.organizacao_id).maybeSingle();
      const chave = Deno.env.get('RESEND_API_KEY');
      if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado.' }, 503);
      const destino = `https://sonvi.com.br/${o?.slug}/`, nome = String(u.nome || '').split(' ')[0];
      const texto = `Olá${nome ? ', ' + nome : ''}!\n\n${u.diretor ? `O SONVI da ${o?.nome} está pronto e você é o diretor.` : `Seu acesso ao SONVI da ${o?.nome} está pronto.`}\n\nEntre em: ${destino}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.${u.diretor ? ' Depois, em Administração, você completa as rádios, cadastra a equipe e a tabela de preços.\n\n' : '\n\n'}Equipe SONVI`;
      const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:520px">
        <p>Olá${nome ? ', ' + esc(nome) : ''}!</p><p>${u.diretor ? `O SONVI da <b>${esc(o?.nome || '')}</b> está pronto e você é o diretor.` : `Seu acesso ao SONVI da <b>${esc(o?.nome || '')}</b> está pronto.`}</p>
        <table style="border-collapse:collapse;margin:18px 0;font-size:15px"><tr><td style="color:#6b6b74;padding:4px 16px 4px 0">Endereço</td><td><b>${esc(destino.replace('https://', ''))}</b></td></tr>
        <tr><td style="color:#6b6b74;padding:4px 16px 4px 0">E-mail</td><td><b>${esc(u.email)}</b></td></tr>
        <tr><td style="color:#6b6b74;padding:4px 16px 4px 0">Senha provisória</td><td><b style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(senha)}</b></td></tr></table>
        <p style="margin:24px 0"><a href="${esc(destino)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Entrar no SONVI</a></p>
        <p style="color:#6b6b74;font-size:13px">No primeiro acesso você vai criar a sua própria senha.${u.diretor ? ' Depois, em Administração, você completa as rádios, cadastra a equipe e a tabela de preços.' : ''} Dúvidas? É só responder este e-mail.</p></div>`;
      const { data: remet } = await adm.from('usuarios').select('email').eq('id', eu.id).maybeSingle();
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'SONVI <acesso@sonvi.com.br>', to: [u.email], subject: `Seu acesso ao SONVI · ${o?.nome}`, text: texto, html, ...(emailOk(remet?.email || '') ? { reply_to: remet!.email } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return resposta({ erro: `O serviço de e-mail recusou: ${j?.message || r.status}` }, 502);
      return resposta({ ok: true, email: u.email });
    }

    return resposta({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, (e as any)?.status || 500);
  }
});

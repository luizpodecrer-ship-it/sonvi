// SONVI · função de borda "console": o que o Console (console.sonvi.com.br) faz e precisa da chave secreta.
// Só a equipe SONVI (tabela plataforma_admins) usa. Os dados do cliente são gravados pelas funções console_* do banco;
// aqui ficam só as contas de entrada dos diretores.
//   { acao: "criar_cliente", cliente: {...}, diretor: { nome, email, celular } } → { org, slug, usuario_id, senha }
//   { acao: "novo_diretor", org, diretor: { nome, email, celular } }            → { usuario_id, senha }
//   { acao: "senha_diretor", usuario_id }                                       → { senha } (nova senha provisória)
//   { acao: "enviar_acesso", usuario_id, senha }                                → manda os dados de acesso por e-mail
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const senhaProvisoria = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(b, n => A[n % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const quem = createClient(url, publica, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user: eu } } = await quem.auth.getUser(token);
    if (!eu) return resposta({ erro: 'Entre no Console de novo.' }, 401);
    const { data: admin } = await quem.rpc('eh_admin_plataforma');
    if (!admin) return resposta({ erro: 'Acesso só para a equipe SONVI.' }, 403);
    const b = await req.json();

    // Cria a conta do diretor já confirmada, com senha provisória, dentro da organização
    const criarDiretor = async (org: string, d: any) => {
      const email = String(d?.email ?? '').trim().toLowerCase(), nome = String(d?.nome ?? '').trim(), celular = String(d?.celular ?? '').trim();
      const senha = senhaProvisoria();
      const { data, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) throw new Error(/already|registered|exists/i.test(error.message) ? 'Já existe um usuário com esse e-mail no SONVI.' : error.message);
      const { error: e1 } = await adm.from('usuarios').update({ nome, celular, diretor: true, ativo: true, trocar_senha: true, organizacao_id: org }).eq('id', data.user.id);
      if (e1) throw e1;
      return { usuario_id: data.user.id, senha };
    };
    const conferirDiretor = async (d: any) => {
      const email = String(d?.email ?? '').trim().toLowerCase();
      if (!String(d?.nome ?? '').trim()) return 'Informe o nome do diretor.';
      if (!emailOk(email)) return 'E-mail do diretor inválido.';
      const { data: existe } = await adm.from('usuarios').select('id').ilike('email', email).maybeSingle();
      if (existe) return 'Já existe um usuário com esse e-mail no SONVI.';
      return '';
    };

    if (b.acao === 'criar_cliente') {
      const erro = await conferirDiretor(b.diretor);
      if (erro) return resposta({ erro }, 400);
      const { data: org, error } = await quem.rpc('console_criar_cliente', { p: b.cliente || {} });
      if (error) return resposta({ erro: error.message }, 400);
      try {
        const d = await criarDiretor(org as string, b.diretor);
        return resposta({ org, slug: String(b.cliente?.slug || '').trim().toLowerCase(), ...d });
      } catch (e) {
        return resposta({ org, erro: `O cliente foi criado, mas o diretor não: ${(e as Error).message} Abra o cliente e use "Adicionar diretor".` }, 400);
      }
    }

    if (b.acao === 'novo_diretor') {
      const erro = await conferirDiretor(b.diretor);
      if (erro) return resposta({ erro }, 400);
      const { data: o } = await adm.from('organizacoes').select('id').eq('id', String(b.org ?? '')).maybeSingle();
      if (!o) return resposta({ erro: 'Cliente não encontrado.' }, 404);
      return resposta(await criarDiretor(o.id, b.diretor));
    }

    // Diretor de algum cliente (o Console não mexe na equipe; isso é com o diretor, dentro do SONVI)
    const diretorAlvo = async (id: string) => {
      const { data: u } = await adm.from('usuarios').select('id, nome, email, ativo, diretor, trocar_senha, organizacao_id').eq('id', id).maybeSingle();
      return u && u.diretor && u.organizacao_id ? u : null;
    };

    if (b.acao === 'senha_diretor') {
      const u = await diretorAlvo(String(b.usuario_id ?? ''));
      if (!u) return resposta({ erro: 'Diretor não encontrado.' }, 404);
      const senha = senhaProvisoria();
      const { error } = await adm.auth.admin.updateUserById(u.id, { password: senha });
      if (error) return resposta({ erro: error.message }, 400);
      await adm.from('usuarios').update({ trocar_senha: true }).eq('id', u.id);
      return resposta({ senha });
    }

    if (b.acao === 'enviar_acesso') {
      const u = await diretorAlvo(String(b.usuario_id ?? '')), senha = String(b.senha ?? '');
      if (!u || !u.ativo) return resposta({ erro: 'Diretor não encontrado ou desativado.' }, 404);
      if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(senha)) return resposta({ erro: 'Senha provisória inválida.' }, 400);
      if (!u.trocar_senha) return resposta({ erro: 'O diretor já criou a própria senha. Gere uma nova senha provisória antes de enviar.' }, 409);
      const { data: o } = await adm.from('organizacoes').select('nome, slug').eq('id', u.organizacao_id).maybeSingle();
      const chave = Deno.env.get('RESEND_API_KEY');
      if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado.' }, 503);
      const destino = `https://sonvi.com.br/${o?.slug}/`, nome = String(u.nome || '').split(' ')[0];
      const texto = `Olá${nome ? ', ' + nome : ''}!\n\nO SONVI da ${o?.nome} está pronto e você é o diretor.\n\nEntre em: ${destino}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha. Depois, em Administração, você cadastra as rádios, a equipe e a tabela de preços.\n\nEquipe SONVI`;
      const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:520px">
        <p>Olá${nome ? ', ' + esc(nome) : ''}!</p><p>O SONVI da <b>${esc(o?.nome || '')}</b> está pronto e você é o diretor.</p>
        <table style="border-collapse:collapse;margin:18px 0;font-size:15px"><tr><td style="color:#6b6b74;padding:4px 16px 4px 0">Endereço</td><td><b>${esc(destino.replace('https://', ''))}</b></td></tr>
        <tr><td style="color:#6b6b74;padding:4px 16px 4px 0">E-mail</td><td><b>${esc(u.email)}</b></td></tr>
        <tr><td style="color:#6b6b74;padding:4px 16px 4px 0">Senha provisória</td><td><b style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(senha)}</b></td></tr></table>
        <p style="margin:24px 0"><a href="${esc(destino)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Entrar no SONVI</a></p>
        <p style="color:#6b6b74;font-size:13px">No primeiro acesso você vai criar a sua própria senha. Depois, em Administração, você completa as rádios, cadastra a equipe e a tabela de preços. Dúvidas? É só responder este e-mail.</p></div>`;
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
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

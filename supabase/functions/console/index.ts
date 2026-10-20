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
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

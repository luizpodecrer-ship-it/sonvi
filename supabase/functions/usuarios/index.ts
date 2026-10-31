// SONVI · função de borda "usuarios": cria o acesso de um novo usuário com senha provisória, troca senhas e bloqueia acessos.
// Roda no servidor do Supabase, onde a chave secreta (service_role) fica guardada; ela nunca vai para o navegador.
// Diretor: tudo. Gerente: só nas rádios em que é gerente, e só consultor, OPEC, financeiro, programador e locutor
// (não cria diretor nem gerente, não mexe em diretor, gerente nem em si mesmo, não exclui). Os outros perfis só trocam a própria senha.
//   { acao: "criar", nome, email, celular, diretor, vinculos: [{ veiculo_id, perfil }] }  → { usuario_id, senha }  (senha provisória)
//   { acao: "senha", usuario_id }          → { senha }  nova senha provisória (a pessoa troca no próximo acesso)
//   { acao: "minha_senha", senha }         → a pessoa logada define a própria senha (obrigatório depois da provisória)
//   { acao: "enviar_acesso", usuario_id, senha } → manda por e-mail os dados de acesso com a senha provisória
//   { acao: "ativo", usuario_id, ativo }   → bloqueia (desconecta) ou libera a conta de entrada; o cadastro muda antes por salvar_usuario
//   { acao: "email", usuario_id, email }   → troca o e-mail de entrada; a senha continua a mesma
//   { acao: "excluir", usuario_id, para }  → só o diretor; a carteira passa para "para" (ou fica sem responsável)
//   { acao: "esqueci", email, destino }    → SEM login: manda pelo e-mail (Resend) o link para criar uma senha nova
//   { acao: "link", usuario_id, destino }  → (antigo) link de acesso; mantido por compatibilidade
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const PERFIS = ['gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor'];
const PERFIS_DO_GERENTE = ['consultor', 'opec', 'financeiro', 'programador', 'locutor'];
const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
// Nome da empresa do cliente (regra do Luiz, 31/10/2026: nada chega como "SONVI"; o cliente se sente dono do sistema)
const nomeEmpresa = async (adm: any, org: string | null) => { if (!org) return 'Comercial';
  const { data: e } = await adm.from('empresa_comercial').select('nome').eq('organizacao_id', org).maybeSingle();
  const { data: o } = e?.nome ? { data: null } : await adm.from('organizacoes').select('nome').eq('id', org).maybeSingle();
  return String(e?.nome || o?.nome || 'Comercial').replace(/[<>"\r\n,;]/g, '').trim().slice(0, 60) || 'Comercial'; };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Senha provisória fácil de ditar e digitar no celular: 3 grupos de 4, sem letras e números que se confundem (0/O, 1/l/I)
const senhaProvisoria = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(b, n => A[n % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};
const BANIDO = '876000h'; // ~100 anos: conta bloqueada até ser reativada

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json();
    const destino = typeof b.destino === 'string' && /^https:\/\/([a-z0-9-]+\.)*sonvi\.com\.br\//.test(b.destino) ? b.destino : 'https://teste.sonvi.com.br/';

    // "Esqueci minha senha": não exige login. A resposta é sempre a mesma, exista o e-mail ou não (ninguém descobre quem tem conta).
    if (b.acao === 'esqueci') {
      const email = String(b.email ?? '').trim().toLowerCase();
      const pronto = resposta({ ok: true });
      if (!emailOk(email)) return resposta({ erro: 'Digite um e-mail válido.' }, 400);
      const { data: u } = await adm.from('usuarios').select('id, nome, ativo, organizacao_id').ilike('email', email).maybeSingle();
      if (!u || !u.ativo) return pronto;
      const { data, error } = await adm.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: destino } });
      if (error) { console.error(error); return pronto; }
      const chave = Deno.env.get('RESEND_API_KEY');
      if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado. Peça ao diretor uma senha provisória.' }, 503);
      const link = data.properties.action_link, nome = String(u.nome || '').split(' ')[0];
      const sistema = await nomeEmpresa(adm, u.organizacao_id);
      const texto = `Olá${nome ? ', ' + nome : ''}!\n\nRecebemos um pedido para criar uma senha nova no sistema da ${sistema}. Abra o link abaixo e escolha a sua senha:\n\n${link}\n\nO link vale por 1 hora e só funciona uma vez. Se não foi você que pediu, ignore este e-mail: a sua senha continua a mesma.`;
      const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:520px">
        <p>Olá${nome ? ', ' + esc(nome) : ''}!</p><p>Recebemos um pedido para criar uma senha nova no sistema da ${esc(sistema)}.</p>
        <p style="margin:26px 0"><a href="${esc(link)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Criar senha nova</a></p>
        <p style="color:#6b6b74;font-size:13px">O link vale por 1 hora e só funciona uma vez. Se não foi você que pediu, ignore este e-mail: a sua senha continua a mesma.</p></div>`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `"${sistema}" <acesso@sonvi.com.br>`, to: [email], subject: `Criar senha nova · ${sistema}`, text: texto, html }) });
      if (!r.ok) console.error(await r.text());
      return pronto;
    }

    // Daqui para baixo precisa estar logado
    const quem = createClient(url, publica, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user: eu } } = await quem.auth.getUser(token);
    if (!eu) return resposta({ erro: 'Entre de novo no sistema.' }, 401);

    // A própria senha: qualquer pessoa logada (é assim que a senha provisória deixa de valer)
    if (b.acao === 'minha_senha') {
      const senha = String(b.senha ?? '');
      if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return resposta({ erro: 'Use pelo menos 8 caracteres, com letras e números.' }, 400);
      const { error } = await adm.auth.admin.updateUserById(eu.id, { password: senha });
      if (error) return resposta({ erro: /same|different/i.test(error.message) ? 'Escolha uma senha diferente da provisória.' : error.message }, 400);
      await adm.from('usuarios').update({ trocar_senha: false }).eq('id', eu.id);
      return resposta({ ok: true });
    }

    // Cada cliente do SONVI (organização) só enxerga a própria equipe e as próprias rádios.
    // No acesso de suporte, minha_org é a organização atendida e o suporte age como diretor dela.
    const { data: ehDiretor } = await quem.rpc('eh_diretor');
    const { data: org } = await quem.rpc('minha_org');
    if (!org) return resposta({ erro: 'Acesso não encontrado.' }, 403);
    const { data: daOrg } = await adm.from('veiculos').select('id').eq('organizacao_id', org);
    const radiosDaOrg = new Set((daOrg || []).map((x: any) => x.id));
    const { data: euAtivo } = await adm.from('usuarios').select('ativo, organizacao_id').eq('id', eu.id).maybeSingle();
    const { data: gv } = euAtivo?.ativo ? await adm.from('usuario_veiculos').select('veiculo_id').eq('usuario_id', eu.id).eq('perfil', 'gerente') : { data: [] };
    const minhas = new Set((gv || []).map((x: any) => x.veiculo_id).filter((v: string) => radiosDaOrg.has(v)));
    const suporte = !euAtivo?.organizacao_id;
    if (!ehDiretor && !minhas.size) return resposta({ erro: 'Apenas o diretor e o gerente podem cadastrar usuários.' }, 403);
    // Gerente só cuida de quem está nas rádios dele e não é diretor nem gerente (regra do banco: pode_gerenciar_usuario)
    const podeCuidar = async (alvo: string) => { const { data } = await quem.rpc('pode_gerenciar_usuario', { alvo }); return !!data; };
    const negado = () => resposta({ erro: 'Você só pode cuidar de consultores, OPEC, financeiro, programadores e locutores das rádios em que é gerente.' }, 403);

    if (b.acao === 'criar') {
      const email = String(b.email ?? '').trim().toLowerCase(), nome = String(b.nome ?? '').trim(), celular = String(b.celular ?? '').trim();
      if (!nome) return resposta({ erro: 'Informe o nome.' }, 400);
      if (!emailOk(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
      const diretor = !!b.diretor;
      const vinculos = (Array.isArray(b.vinculos) ? b.vinculos : []).filter((v: any) => v && v.veiculo_id && PERFIS.includes(v.perfil));
      if (!ehDiretor) {
        if (diretor) return resposta({ erro: 'Só o diretor pode cadastrar outro diretor.' }, 403);
        if (vinculos.some((v: any) => !PERFIS_DO_GERENTE.includes(v.perfil))) return resposta({ erro: 'O gerente cadastra consultor, OPEC, financeiro, programador e locutor.' }, 403);
        if (vinculos.some((v: any) => !minhas.has(v.veiculo_id))) return resposta({ erro: 'Você só pode dar acesso nas rádios em que é gerente.' }, 403);
      }
      if (vinculos.some((v: any) => !radiosDaOrg.has(v.veiculo_id))) return resposta({ erro: 'Rádio não encontrada.' }, 403);
      if (!diretor && !vinculos.length) return resposta({ erro: 'Escolha pelo menos uma rádio e o perfil nela.' }, 400);
      const { data: existe } = await adm.from('usuarios').select('id').ilike('email', email).maybeSingle();
      if (existe) return resposta({ erro: ehDiretor ? 'Já existe um usuário com esse e-mail.' : 'Já existe um usuário com esse e-mail. Se ele trabalha em outra rádio, peça ao diretor para dar acesso a ele na sua.' }, 409);

      // Cria a conta já confirmada, com a senha provisória
      const senha = senhaProvisoria();
      const { data, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe um usuário com esse e-mail.' : error.message }, 400);
      const id = data.user.id;
      const { error: e1 } = await adm.from('usuarios').update({ nome, celular, diretor, ativo: true, trocar_senha: true, organizacao_id: org }).eq('id', id);
      if (e1) throw e1;
      if (!diretor) {
        const { error: e2 } = await adm.from('usuario_veiculos').insert(vinculos.map((v: any) => ({ usuario_id: id, veiculo_id: v.veiculo_id, perfil: v.perfil })));
        if (e2) throw e2;
      }
      return resposta({ usuario_id: id, senha });
    }

    if (b.acao === 'senha') {
      const id = String(b.usuario_id ?? '');
      if (id === eu.id) return resposta({ erro: 'Para a sua própria senha, use "Trocar minha senha".' }, 400);
      if (!await podeCuidar(id)) return negado();
      const senha = senhaProvisoria();
      const { error } = await adm.auth.admin.updateUserById(id, { password: senha });
      if (error) return resposta({ erro: error.message }, 400);
      await adm.from('usuarios').update({ trocar_senha: true }).eq('id', id);
      return resposta({ senha });
    }

    // Envia por e-mail (Resend) os dados de acesso com a senha provisória que acabou de aparecer na tela de quem cadastrou
    if (b.acao === 'enviar_acesso') {
      const id = String(b.usuario_id ?? ''), senha = String(b.senha ?? '');
      if (!await podeCuidar(id)) return negado();
      if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(senha)) return resposta({ erro: 'Senha provisória inválida.' }, 400);
      const { data: u } = await adm.from('usuarios').select('nome, email, ativo, trocar_senha').eq('id', id).maybeSingle();
      if (!u || !u.ativo) return resposta({ erro: 'Usuário não encontrado ou desativado.' }, 404);
      if (!u.trocar_senha) return resposta({ erro: 'Esta pessoa já criou a própria senha. Gere uma nova senha provisória antes de enviar.' }, 409);
      const chave = Deno.env.get('RESEND_API_KEY');
      if (!chave) return resposta({ erro: 'O envio de e-mail ainda não está configurado.' }, 503);
      const { data: remet0 } = await adm.from('usuarios').select('nome, email').eq('id', eu.id).maybeSingle();
      const remet = suporte ? { nome: '', email: '' } : remet0;   // no acesso de suporte não assina ninguém (nunca "SONVI")
      const sistema = await nomeEmpresa(adm, org), nome = String(u.nome || '').split(' ')[0];
      const texto = `Olá${nome ? ', ' + nome : ''}!\n\nSeu acesso ao sistema da ${sistema} está pronto.\n\nEntre em: ${destino}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.${remet?.nome ? `\n\nCadastrado por ${remet.nome}.` : ''}`;
      const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171c;max-width:520px">
        <p>Olá${nome ? ', ' + esc(nome) : ''}!</p><p>Seu acesso ao sistema da ${esc(sistema)} está pronto.</p>
        <table style="border-collapse:collapse;margin:18px 0;font-size:15px"><tr><td style="color:#6b6b74;padding:4px 16px 4px 0">E-mail</td><td><b>${esc(u.email)}</b></td></tr>
        <tr><td style="color:#6b6b74;padding:4px 16px 4px 0">Senha provisória</td><td><b style="font-family:Menlo,Consolas,monospace;font-size:17px;letter-spacing:.04em">${esc(senha)}</b></td></tr></table>
        <p style="margin:24px 0"><a href="${esc(destino)}" style="display:inline-block;background:#0055ff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Entrar no sistema</a></p>
        <p style="color:#6b6b74;font-size:13px">No primeiro acesso você vai criar a sua própria senha.${remet?.nome ? ` Cadastrado por ${esc(remet.nome)}. Dúvidas? É só responder este e-mail.` : ''}</p></div>`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `"${remet?.nome ? String(remet.nome).replace(/[<>"\r\n,;]/g, '').slice(0, 40) + ' · ' : ''}${sistema}" <acesso@sonvi.com.br>`, to: [u.email], subject: `Seu acesso ao sistema · ${sistema}`, text: texto, html, ...(emailOk(remet?.email || '') ? { reply_to: remet!.email } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return resposta({ erro: `O serviço de e-mail recusou: ${j?.message || r.status}` }, 502);
      return resposta({ ok: true, email: u.email });
    }

    if (b.acao === 'ativo') {
      const id = String(b.usuario_id ?? ''), ativo = !!b.ativo;
      if (id === eu.id) return resposta({ erro: 'Você não pode desativar o seu próprio acesso.' }, 400);
      { const { data } = await quem.rpc('usuario_so_nas_minhas', { alvo: id }); if (!data) return negado(); }
      // Bloqueado: a conta de entrada não renova mais a sessão (sai do sistema) e não consegue entrar de novo
      const { error } = await adm.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : BANIDO });
      if (error) return resposta({ erro: error.message }, 400);
      return resposta({ ok: true });
    }

    if (b.acao === 'link') {
      if (String(b.usuario_id ?? '') !== eu.id && !await podeCuidar(String(b.usuario_id ?? ''))) return negado();
      const { data: u, error } = await adm.auth.admin.getUserById(String(b.usuario_id ?? ''));
      if (error || !u?.user?.email) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      const { data, error: e1 } = await adm.auth.admin.generateLink({ type: 'recovery', email: u.user.email, options: { redirectTo: destino } });
      if (e1) return resposta({ erro: e1.message }, 400);
      return resposta({ link: data.properties.action_link });
    }

    if (b.acao === 'email') {
      const id = String(b.usuario_id ?? ''), email = String(b.email ?? '').trim().toLowerCase();
      if (!await podeCuidar(id)) return negado();
      if (!emailOk(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
      const { data: outro } = await adm.from('usuarios').select('id').ilike('email', email).neq('id', id).maybeSingle();
      if (outro) return resposta({ erro: 'Já existe outro usuário com esse e-mail.' }, 409);
      const { error } = await adm.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe outro usuário com esse e-mail.' : error.message }, 400);
      const { error: e1 } = await adm.from('usuarios').update({ email }).eq('id', id);
      if (e1) throw e1;
      return resposta({ ok: true, email });
    }

    // Excluir: só o diretor. Antes, a carteira (clientes, propostas, PIs e follow-ups) passa para quem ele escolher,
    // ou fica sem responsável (para: null; os follow-ups da pessoa vão embora junto com ela). Regra no banco: preparar_exclusao_usuario.
    if (b.acao === 'excluir') {
      const id = String(b.usuario_id ?? ''), para = b.para ? String(b.para) : null;
      if (!ehDiretor) return resposta({ erro: 'Só o diretor exclui usuários. Use "Desativar acesso".' }, 403);
      if (eu.id === id) return resposta({ erro: 'Você não pode excluir o seu próprio usuário.' }, 400);
      const { data: passou, error: e0 } = await quem.rpc('preparar_exclusao_usuario', { p_usuario: id, p_para: para });
      if (e0) return resposta({ erro: e0.message }, 400);
      const { error } = await adm.auth.admin.deleteUser(id);
      if (error) return resposta({ erro: error.message }, 400);
      return resposta({ ok: true, passou });
    }

    return resposta({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

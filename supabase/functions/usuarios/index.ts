// SONVI · função de borda "usuarios": cria o acesso de um novo usuário e gera links de acesso.
// Roda no servidor do Supabase, onde a chave secreta (service_role) fica guardada; ela nunca vai para o navegador.
// Só o diretor pode usar. Não manda e-mail: devolve um link que o diretor envia pelo WhatsApp.
//   { acao: "criar", nome, email, celular, diretor, vinculos: [{ veiculo_id, perfil }], destino }
//   { acao: "link", usuario_id, destino }
//   { acao: "email", usuario_id, email }  (troca o e-mail de entrada; a senha continua a mesma)
//   { acao: "excluir", usuario_id }  (só quem não tem PI, cliente, agenda nem histórico; os outros se desativam)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const PERFIS = ['gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!, secreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Quem está chamando: precisa ser diretor ativo (a regra é do banco, eh_diretor)
    const quem = createClient(url, publica, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: ehDiretor, error: e0 } = await quem.rpc('eh_diretor');
    if (e0 || !ehDiretor) return resposta({ erro: 'Apenas o diretor pode cadastrar usuários.' }, 403);

    const adm = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json();
    const destino = typeof b.destino === 'string' && /^https?:\/\//.test(b.destino) ? b.destino : undefined;

    if (b.acao === 'criar') {
      const email = String(b.email ?? '').trim().toLowerCase(), nome = String(b.nome ?? '').trim(), celular = String(b.celular ?? '').trim();
      if (!nome) return resposta({ erro: 'Informe o nome.' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
      const diretor = !!b.diretor;
      const vinculos = (Array.isArray(b.vinculos) ? b.vinculos : []).filter((v: any) => v && v.veiculo_id && PERFIS.includes(v.perfil));
      if (!diretor && !vinculos.length) return resposta({ erro: 'Escolha pelo menos uma rádio e o perfil nela.' }, 400);
      const { data: existe } = await adm.from('usuarios').select('id').ilike('email', email).maybeSingle();
      if (existe) return resposta({ erro: 'Já existe um usuário com esse e-mail.' }, 409);

      // Cria a conta e o link de convite (a pessoa define a senha ao abrir)
      const { data, error } = await adm.auth.admin.generateLink({ type: 'invite', email, options: { data: { nome }, redirectTo: destino } });
      if (error) return resposta({ erro: /already|registered/i.test(error.message) ? 'Já existe um usuário com esse e-mail.' : error.message }, 400);
      const id = data.user.id;
      const { error: e1 } = await adm.from('usuarios').update({ nome, celular, diretor, ativo: true }).eq('id', id);
      if (e1) throw e1;
      if (!diretor) {
        const { error: e2 } = await adm.from('usuario_veiculos').insert(vinculos.map((v: any) => ({ usuario_id: id, veiculo_id: v.veiculo_id, perfil: v.perfil })));
        if (e2) throw e2;
      }
      return resposta({ usuario_id: id, link: data.properties.action_link });
    }

    if (b.acao === 'link') {
      const { data: u, error } = await adm.auth.admin.getUserById(String(b.usuario_id ?? ''));
      if (error || !u?.user?.email) return resposta({ erro: 'Usuário não encontrado.' }, 404);
      // Quem já tem conta recebe um link para entrar e criar uma senha nova
      const { data, error: e1 } = await adm.auth.admin.generateLink({ type: 'recovery', email: u.user.email, options: { redirectTo: destino } });
      if (e1) return resposta({ erro: e1.message }, 400);
      return resposta({ link: data.properties.action_link });
    }

    if (b.acao === 'email') {
      const id = String(b.usuario_id ?? ''), email = String(b.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
      const { data: outro } = await adm.from('usuarios').select('id').ilike('email', email).neq('id', id).maybeSingle();
      if (outro) return resposta({ erro: 'Já existe outro usuário com esse e-mail.' }, 409);
      // Troca na conta de entrada já confirmado (sem mandar e-mail de confirmação) e no cadastro do SONVI
      const { error } = await adm.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Já existe outro usuário com esse e-mail.' : error.message }, 400);
      const { error: e1 } = await adm.from('usuarios').update({ email }).eq('id', id);
      if (e1) throw e1;
      return resposta({ ok: true, email });
    }

    if (b.acao === 'excluir') {
      const id = String(b.usuario_id ?? '');
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: { user: eu } } = await quem.auth.getUser(token);
      if (eu && eu.id === id) return resposta({ erro: 'Você não pode excluir o seu próprio usuário.' }, 400);
      // Quem já tem trabalho no sistema não é apagado: some do histórico e a agenda iria junto
      const conta = async (tabela: string, coluna: string) => { const { count } = await adm.from(tabela).select('*', { count: 'exact', head: true }).eq(coluna, id); return count ?? 0; };
      const [pis, clientes, agenda, hist] = await Promise.all([conta('pis', 'consultor_id'), conta('pessoas', 'consultor_id'), conta('agenda', 'consultor_id'), conta('pi_historico', 'usuario_id')]);
      if (pis + clientes + agenda + hist > 0) {
        const partes = [pis && `${pis} PI${pis > 1 ? 's' : ''}`, clientes && `${clientes} cliente${clientes > 1 ? 's' : ''}`, agenda && `${agenda} compromisso${agenda > 1 ? 's' : ''} na agenda`, hist && 'movimentações no histórico de PIs'].filter(Boolean).join(', ');
        return resposta({ erro: `Não dá para excluir: este usuário já tem ${partes}. Use "Desativar acesso" para bloquear a entrada sem perder o histórico.` }, 409);
      }
      const { error } = await adm.auth.admin.deleteUser(id);
      if (error) return resposta({ erro: error.message }, 400);
      return resposta({ ok: true });
    }

    return resposta({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

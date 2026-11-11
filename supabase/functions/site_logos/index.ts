// SONVI · função de borda "site_logos" (11/11/2026): copia os logos dos veículos (veiculos.logo) para o cofre público
// "site" (clientes/<nome>.png), usados na seção Clientes do site sonvi.com.br. Rodar de novo quando um logo mudar.
// Só com a chave do cofre no cabeçalho x-sonvi-cron (a mesma do agendador do resumo; rpc followup_chave).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
// nome do veículo no banco → nome do arquivo no site
const ARQUIVOS: Record<string, string> = { 'VERDE FM': 'verde-fm', 'NATIVA FM': 'nativa-fm', 'CBN CUIABÁ': 'cbn-cuiaba',
  'IMPACTO MÍDIA EXTERIOR': 'impacto', 'INSIDE DOOR': 'inside-door', 'MÍDIA ON': 'midia-on' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: segredo } = await adm.rpc('followup_chave');
    if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);
    const { data: vs, error } = await adm.from('veiculos').select('nome, logo').in('nome', Object.keys(ARQUIVOS));
    if (error) throw error;
    const feitos: unknown[] = [];
    for (const v of vs || []) {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(v.logo || ''));
      if (!m) { feitos.push({ nome: v.nome, erro: 'sem logo' }); continue; }
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/jpeg' ? 'jpg' : m[1] === 'image/webp' ? 'webp' : 'svg';
      const caminho = `clientes/${ARQUIVOS[v.nome]}.${ext}`;
      const { error: e2 } = await adm.storage.from('site').upload(caminho, bytes, { contentType: m[1], upsert: true, cacheControl: '86400' });
      // largura e altura do PNG (bytes 16–23) para conferir o formato
      const dv = new DataView(bytes.buffer); const tam = ext === 'png' ? `${dv.getUint32(16)}x${dv.getUint32(20)}` : '';
      feitos.push({ nome: v.nome, caminho, kb: Math.round(bytes.length / 1024), tam, erro: e2?.message || null });
    }
    return resposta({ ok: true, feitos });
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, erro: (e as Error).message ?? String(e) }, 500);
  }
});

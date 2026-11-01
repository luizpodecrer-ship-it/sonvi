// SONVI · função de borda "limpeza" (31/10/2026; database/074). Apaga os arquivos da aba Mídias dos PIs
// 90 dias depois do fim da veiculação (o PI, os links e o PI original da agência ficam).
//   { acao: "diario" }  → agendador (pg_cron sonvi-midias-0430, chave do cofre em x-sonvi-cron)
// Cada PI limpo fica registrado em midias_limpezas (a aba Mídias mostra o aviso).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const DIAS = 90;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = await req.json().catch(() => ({}));
    if (b.acao !== 'diario') return resposta({ erro: 'Ação desconhecida.' }, 400);
    const { data: segredo } = await adm.rpc('followup_chave');
    if (!segredo || req.headers.get('x-sonvi-cron') !== segredo) return resposta({ erro: 'Não autorizado.' }, 401);

    const { data: lista, error } = await adm.rpc('midias_vencidas', { p_dias: DIAS });
    if (error) throw error;
    // Agrupa por PI
    const porPi = new Map<string, { veiculo_id: string; fim: string; caminhos: string[]; bytes: number }>();
    for (const r of (lista || []) as any[]) {
      const g = porPi.get(r.pi_id) || { veiculo_id: r.veiculo_id, fim: r.fim, caminhos: [], bytes: 0 };
      g.caminhos.push(r.caminho); g.bytes += Number(r.tamanho || 0); porPi.set(r.pi_id, g);
    }
    let arquivos = 0, bytes = 0, pis = 0; const falhas: string[] = [];
    for (const [pi_id, g] of porPi) {
      for (let i = 0; i < g.caminhos.length; i += 100) {
        const parte = g.caminhos.slice(i, i + 100);
        const { error: e } = await adm.storage.from('midias').remove(parte);
        if (e) { falhas.push(`${pi_id}: ${e.message}`); continue; }
        arquivos += parte.length;
      }
      if (falhas.some(f => f.startsWith(pi_id))) continue;
      const { data: antes } = await adm.from('midias_limpezas').select('arquivos, bytes').eq('pi_id', pi_id).maybeSingle();
      await adm.from('midias_limpezas').upsert({ pi_id, veiculo_id: g.veiculo_id, fim_veiculacao: g.fim, arquivos: (antes?.arquivos || 0) + g.caminhos.length, bytes: Number(antes?.bytes || 0) + g.bytes, em: new Date().toISOString() });
      bytes += g.bytes; pis++;
    }
    console.log(JSON.stringify({ pis, arquivos, bytes, falhas }));
    return resposta({ ok: true, pis, arquivos, bytes, falhas });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

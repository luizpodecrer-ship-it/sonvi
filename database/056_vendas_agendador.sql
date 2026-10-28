-- 056 · Agendador do Vendas (27/10/2026): todo dia às 9h de Cuiabá (13h UTC) a função de borda "vendas" manda
-- o lembrete semanal dos pedidos de faturamento sem confirmação e a pergunta "o cliente pagou?" das parcelas que
-- venceram (no vencimento e depois uma vez por semana até a resposta). Mesma chave do cofre do follow-up.
select cron.unschedule('sonvi-vendas-0900') where exists (select 1 from cron.job where jobname = 'sonvi-vendas-0900');
select cron.schedule('sonvi-vendas-0900', '0 13 * * *', $$
  select net.http_post(
    url := 'https://ccfsyhniwwspnpnpkjzf.supabase.co/functions/v1/vendas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sonvi-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1)),
    body := '{"acao":"diario"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

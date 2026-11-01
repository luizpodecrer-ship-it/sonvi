-- SONVI · Limpeza automática das mídias do PI (31/10/2026, pedido do Luiz)
-- Os arquivos da aba Mídias (spots, VTs, textos) são apagados 90 dias depois do fim da veiculação do PI.
-- Ficam: o PI, o histórico, os links (pi_links) e o PI original da agência (pasta original/).
-- Quem apaga é a função de borda "limpeza" (a API de armazenamento), chamada todo dia às 04h30 de Cuiabá.

-- Registro do que foi apagado (a aba Mídias mostra o aviso)
create table if not exists public.midias_limpezas (
  pi_id uuid primary key references public.pis(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  arquivos int not null default 0,
  bytes bigint not null default 0,
  fim_veiculacao date,
  em timestamptz not null default now()
);
alter table public.midias_limpezas enable row level security;
drop policy if exists midias_limpezas_ver on public.midias_limpezas;
create policy midias_limpezas_ver on public.midias_limpezas for select to authenticated
  using (public.perfil_no_veiculo(veiculo_id) is not null);
revoke all on public.midias_limpezas from anon, authenticated;
grant select on public.midias_limpezas to authenticated;

-- Último dia de veiculação do PI: fim do último mês com inserções na grade ou o fim da ação digital; sem nada, o dia em que nasceu
create or replace function public.fim_veiculacao_pi(p_dados jsonb, p_criado timestamptz)
returns date language sql immutable set search_path = '' as $$
  select coalesce(greatest(
    (select (max(m) || '-01')::date + interval '1 month' - interval '1 day' from unnest(public.meses_do_pi(p_dados)) m)::date,
    (select max((a->>'fim')::date) from jsonb_array_elements(coalesce(p_dados->'digital', '[]'::jsonb)) a where a->>'fim' ~ '^\d{4}-\d{2}-\d{2}$')),
    (p_criado at time zone 'America/Cuiaba')::date);
$$;

-- Arquivos que já podem sair: mídias (fora de original/) de PIs aprovados, programados ou faturados,
-- cuja veiculação terminou há mais de p_dias dias. Só a chave do servidor executa.
create or replace function public.midias_vencidas(p_dias int default 90)
returns table (pi_id uuid, veiculo_id uuid, caminho text, tamanho bigint, fim date)
language sql stable security definer set search_path = '' as $$
  select p.id, p.veiculo_id, o.name, coalesce((o.metadata->>'size')::bigint, 0), public.fim_veiculacao_pi(p.dados, p.criado_em)
    from public.pis p
    join storage.objects o on o.bucket_id = 'midias' and o.name like p.veiculo_id::text || '/' || p.id::text || '/%'
   where p.status in ('aprovado', 'programado', 'faturado')
     and o.name not like p.veiculo_id::text || '/' || p.id::text || '/original/%'
     and public.fim_veiculacao_pi(p.dados, p.criado_em) < (now() at time zone 'America/Cuiaba')::date - p_dias;
$$;
revoke all on function public.midias_vencidas(int) from public, anon, authenticated;
grant execute on function public.midias_vencidas(int) to service_role;
revoke all on function public.fim_veiculacao_pi(jsonb, timestamptz) from public, anon;
grant execute on function public.fim_veiculacao_pi(jsonb, timestamptz) to authenticated, service_role;

-- Agendador: todo dia às 04h30 de Cuiabá (08h30 UTC), com a mesma chave do cofre dos outros agendadores
select cron.unschedule('sonvi-midias-0430') where exists (select 1 from cron.job where jobname = 'sonvi-midias-0430');
select cron.schedule('sonvi-midias-0430', '30 8 * * *', $$
  select net.http_post(
    url := 'https://ccfsyhniwwspnpnpkjzf.supabase.co/functions/v1/limpeza',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sonvi-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1)),
    body := '{"acao":"diario"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

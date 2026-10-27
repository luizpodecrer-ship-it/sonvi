-- 053 · Faturar mês a mês o PI de vários meses (decidido em 27/10/2026)
-- Contrato de novembro, dezembro e janeiro = 3 faturamentos, um por mês veiculado, cada um com o valor daquele mês
-- (parte do PI proporcional às grades e ações digitais do mês). Vencimento padrão: dia 5 do próprio mês veiculado
-- (veiculos.fat_dia, dá para mudar na janela). O PI só fica "Faturado" quando o último mês for faturado.
-- PI de um mês só continua como antes (faturar_pi, parcelas da aba Faturamento).

alter table public.lancamentos add column if not exists mes_ref text check (mes_ref is null or mes_ref ~ '^\d{4}-\d{2}$');
create index if not exists lancamentos_pi_mes on public.lancamentos (pi_id, mes_ref);
alter table public.veiculos add column if not exists fat_dia int not null default 5 check (fat_dia between 1 and 28);

-- Meses em que o PI vai ao ar (grades com alguma inserção e ações digitais)
create or replace function public.meses_do_pi(p_dados jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct m order by m), '{}') from (
    select g->>'period' m from jsonb_array_elements(coalesce(p_dados->'grids', '[]'::jsonb)) g
     where exists (select 1 from jsonb_array_elements(coalesce(g->'items', '[]'::jsonb)) it, jsonb_each_text(coalesce(it->'days', '{}'::jsonb)) d where d.value ~ '^\d+$' and d.value::int > 0)
    union
    select coalesce(nullif(a->>'period', ''), left(a->>'inicio', 7)) from jsonb_array_elements(coalesce(p_dados->'digital', '[]'::jsonb)) a) q
  where m ~ '^\d{4}-\d{2}$';
$$;

create or replace function public.faturar_pi_mes(p_pi uuid, p_mes text, p_lancamentos jsonb) returns public.pis
language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_perfil text; v_meses text[];
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if v_perfil is null or v_perfil not in ('diretor', 'financeiro') then raise exception 'Apenas o financeiro pode faturar'; end if;
  if v_pi.status not in ('aprovado', 'programado') then raise exception 'Só é possível faturar PIs aprovados ou programados'; end if;
  v_meses := public.meses_do_pi(v_pi.dados);
  if not (p_mes = any(v_meses)) then raise exception 'Este PI não vai ao ar em %', p_mes; end if;
  if exists (select 1 from public.lancamentos where pi_id = p_pi and mes_ref = p_mes) then raise exception 'Este mês do PI já foi faturado'; end if;

  insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma, mes_ref)
  select v_pi.veiculo_id, p_pi, l.sentido, coalesce(l.descricao, ''), coalesce(l.contraparte, ''), coalesce(l.parcela, 1), coalesce(l.valor, 0), l.vencimento, coalesce(l.forma, ''), p_mes
  from jsonb_to_recordset(coalesce(p_lancamentos, '[]'::jsonb)) as l(sentido text, descricao text, contraparte text, parcela integer, valor numeric, vencimento date, forma text);

  -- Último mês faturado: o PI vira "Faturado"
  if not exists (select 1 from unnest(v_meses) m where not exists (select 1 from public.lancamentos where pi_id = p_pi and mes_ref = m)) then
    perform set_config('sonvi.status_rpc', '1', true);
    update public.pis set status = 'faturado' where id = p_pi returning * into v_pi;
    perform set_config('sonvi.status_rpc', '', true);
    insert into public.pi_historico (pi_id, status, usuario_id) values (p_pi, 'faturado', (select auth.uid()));
  end if;
  return v_pi;
end;
$$;
revoke execute on function public.faturar_pi_mes(uuid, text, jsonb) from public, anon;
grant execute on function public.faturar_pi_mes(uuid, text, jsonb) to authenticated;
grant execute on function public.meses_do_pi(jsonb) to authenticated;

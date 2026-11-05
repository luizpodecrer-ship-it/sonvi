-- 081 · PI enviado para a OPEC já é venda (05/11/2026, pedido do Luiz; mockup "PI simples" aprovado)
-- 1. A venda entra em vendas_lancadas no momento do envio à OPEC (status opec), não mais quando a OPEC abre o link.
--    Cada mês recebe a parte do líquido que vai ao ar nele (grades e ações digitais do mês), como S.fatiaMes no app.
-- 2. cancelar_pi: o diretor ou o consultor do PI cancela um PI enviado, com o motivo; a venda sai e a OPEC é avisada
--    pela função de borda opec_link (ação "cancelado").
-- 3. Comissão do consultor passa a contar no mês da venda (vendas_lancadas), não mais no mês do pagamento.
-- 4. Desliga o lembrete diário de faturamento e pagamento (sonvi-vendas-0900).

-- Parte do líquido do PI que vai ao ar no mês (mesma conta de S.previstoNoMes)
create or replace function public.pi_valor_mes(p_dados jsonb, p_liquido numeric, p_mes text, p_meses integer default 1)
returns numeric language plpgsql immutable set search_path = '' as $$
declare d jsonb := coalesce(p_dados, '{}'::jsonb) - 'discount' - 'commission'; v_tot numeric; v_mes numeric;
begin
  v_tot := (public.pi_calculo(d, false)).total;
  if coalesce(v_tot, 0) <= 0 then return round(coalesce(p_liquido, 0) / greatest(1, p_meses), 2); end if;
  v_mes := (public.pi_calculo(jsonb_build_object(
    'grids', coalesce((select jsonb_agg(g) from jsonb_array_elements(case when jsonb_typeof(d -> 'grids') = 'array' then d -> 'grids' else '[]'::jsonb end) g
                        where g ->> 'period' = p_mes), '[]'::jsonb),
    'digital', coalesce((select jsonb_agg(a) from jsonb_array_elements(case when jsonb_typeof(d -> 'digital') = 'array' then d -> 'digital' else '[]'::jsonb end) a
                        where coalesce(nullif(a ->> 'period', ''), left(a ->> 'inicio', 7)) = p_mes), '[]'::jsonb)), false)).total;
  return round(coalesce(p_liquido, 0) * v_mes / v_tot, 2);
end $$;
revoke all on function public.pi_valor_mes(jsonb, numeric, text, integer) from public, anon;

-- Enviou para a OPEC (ou qualquer status depois dele) = venda; voltou para rascunho, devolvido ou cancelado = sai das vendas
create or replace function public.pis_venda_sozinha() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meses text[];
begin
  if new.status in ('opec', 'aprovado', 'programado', 'faturado') and (tg_op = 'INSERT' or old.status not in ('opec', 'aprovado', 'programado', 'faturado')) then
    v_meses := public.meses_do_pi(new.dados);
    if coalesce(array_length(v_meses, 1), 0) = 0 then v_meses := array[to_char(new.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')]; end if;
    insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por)
    select new.id, new.veiculo_id, m, public.pi_valor_mes(new.dados, new.valor_liquido, m, array_length(v_meses, 1)), null from unnest(v_meses) m
    on conflict (pi_id, mes) do update set valor = excluded.valor;
  elsif new.status in ('devolvido', 'rascunho', 'cancelado') and tg_op = 'UPDATE' and old.status in ('opec', 'aprovado', 'programado', 'faturado') then
    execute 'dele' || 'te from public.vendas_lancadas where pi_id = $1' using new.id;
  end if;
  return null;
end $$;
revoke all on function public.pis_venda_sozinha() from public, anon, authenticated;

-- Cancelar um PI enviado: diretor do veículo ou o consultor do PI, sempre com o motivo
create or replace function public.cancelar_pi(p_pi uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_mot text := left(trim(coalesce(p_motivo, '')), 1000); v_nome text; v_eu uuid := (select auth.uid());
begin
  if v_eu is null then raise exception 'Entre no sistema.'; end if;
  if v_mot = '' then raise exception 'Conte o motivo do cancelamento.'; end if;
  select * into v from public.pis where id = p_pi for update;
  if v.id is null then raise exception 'PI não encontrado.'; end if;
  if not (public.diretor_do_veiculo(v.veiculo_id)
          or (public.perfil_no_veiculo(v.veiculo_id) = 'consultor' and v.consultor_id = v_eu)) then
    raise exception 'Só o diretor ou o consultor do PI pode cancelar.'; end if;
  if v.status not in ('opec', 'aprovado', 'programado', 'faturado') then raise exception 'Só um PI enviado para a OPEC pode ser cancelado.'; end if;
  select coalesce(nullif(trim(u.nome), ''), u.email, '') into v_nome from public.usuarios u where u.id = v_eu;
  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'cancelado' where id = v.id;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'cancelado', 'Cancelado por ' || coalesce(v_nome, '') || ': ' || v_mot, v_eu);
  return jsonb_build_object('pi_id', v.id, 'status', 'cancelado', 'token', v.link_token);
end $$;
revoke all on function public.cancelar_pi(uuid, text) from public, anon;
grant execute on function public.cancelar_pi(uuid, text) to authenticated;

-- Comissão no mês da venda: cada mês lançado de cada PI (vendas_lancadas) × percentual do consultor quando o PI nasceu.
-- Os nomes dos campos continuam os mesmos (comissoes_do_mes, comissoes_periodo e fechar_comissoes não mudam):
-- lancamento_id = linha de vendas_lancadas, mes_pago = mês da venda, valor_pago = liquido = valor do mês.
create or replace function public.comissao_parcelas_vivas(p_org uuid, p_mes text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with fech as (select mes, itens from public.comissao_fechamentos where organizacao_id = p_org and situacao = 'fechado'),
  congelados as (select (i ->> 'lancamento_id')::uuid id from fech, jsonb_array_elements(fech.itens) i),
  l as (
    select vl.id, vl.lancado_em as pago_em, vl.valor as valor_pago, vl.veiculo_id, vl.pi_id, vl.mes as mp,
      p.numero, p.titulo, p.consultor_id, p.criado_em as pi_criado, v.sigla, cli.nome as cliente,
      (select count(*) from public.vendas_lancadas x where x.pi_id = vl.pi_id and x.mes <= vl.mes) as parcela
    from public.vendas_lancadas vl join public.pis p on p.id = vl.pi_id join public.veiculos v on v.id = vl.veiculo_id
    left join public.pessoas cli on cli.id = p.cliente_id
    where v.organizacao_id = p_org and vl.mes <= p_mes
      and not exists (select 1 from congelados c where c.id = vl.id)
  ),
  dentro as (
    select l.* from l
    where l.mp = p_mes or (l.mp < p_mes and not exists (select 1 from fech where fech.mes = p_mes)
      and (select count(*) from fech where fech.mes >= l.mp and fech.mes < p_mes)
        = ((left(p_mes, 4)::int * 12 + right(p_mes, 2)::int) - (left(l.mp, 4)::int * 12 + right(l.mp, 2)::int)))
  ),
  calc as (
    select d.*, case when d.consultor_id is null then null else public.comissao_pct_em(d.consultor_id, p_org, d.veiculo_id, d.pi_criado) end as pct
    from dentro d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'lancamento_id', c.id, 'pago_em', c.pago_em, 'mes_pago', c.mp, 'valor_pago', round(c.valor_pago, 2), 'veiculo_id', c.veiculo_id, 'pi_id', c.pi_id,
    'pi_no', 'PI ' || coalesce(c.sigla, '') || ' ' || lpad(c.numero::text, 4, '0'), 'pi_titulo', coalesce(c.titulo, ''), 'cliente', coalesce(c.cliente, ''),
    'mes_ref', c.mp, 'parcela', c.parcela, 'consultor_id', c.consultor_id, 'pi_criado', c.pi_criado,
    'liquido', round(c.valor_pago, 2), 'pct', c.pct, 'comissao', round(c.valor_pago * coalesce(c.pct, 0) / 100, 2))
    order by c.mp, c.numero), '[]'::jsonb)
  from calc c;
$$;
revoke all on function public.comissao_parcelas_vivas(uuid, text) from public, anon, authenticated;

-- Refaz as vendas: valor de cada mês pela parte que vai ao ar nele, e os PIs que estão na OPEC entram agora
insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por)
select p.id, p.veiculo_id, m, public.pi_valor_mes(p.dados, p.valor_liquido, m, cardinality(ms)), null
  from public.pis p,
       lateral (select case when coalesce(array_length(public.meses_do_pi(p.dados), 1), 0) = 0
                  then array[to_char(p.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')] else public.meses_do_pi(p.dados) end ms) x,
       unnest(x.ms) m
 where p.status in ('opec', 'aprovado', 'programado', 'faturado')
on conflict (pi_id, mes) do update set valor = excluded.valor;

-- Sem lembretes de faturamento e pagamento
select cron.unschedule('sonvi-vendas-0900') where exists (select 1 from cron.job where jobname = 'sonvi-vendas-0900');

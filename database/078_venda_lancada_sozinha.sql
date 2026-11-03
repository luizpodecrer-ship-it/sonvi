-- SONVI · A venda entra sozinha quando a OPEC abre o PI (03/11/2026, pedido do Luiz; simplifica o 077)
-- PI programado (ou aprovado/faturado) = todos os meses dele lançados em vendas_lancadas, sem clique.
-- PI que volta (devolvido, rascunho, cancelado, na OPEC) sai das vendas, desde que nenhum mês tenha pedido de faturamento.

create or replace function public.pis_venda_sozinha() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meses text[];
begin
  if new.status in ('aprovado', 'programado', 'faturado') and (tg_op = 'INSERT' or old.status not in ('aprovado', 'programado', 'faturado')) then
    v_meses := public.meses_do_pi(new.dados);
    if coalesce(array_length(v_meses, 1), 0) = 0 then v_meses := array[to_char(new.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')]; end if;
    insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por)
    select new.id, new.veiculo_id, m, round(coalesce(new.valor_liquido, 0) / greatest(1, array_length(v_meses, 1)), 2), null from unnest(v_meses) m
    on conflict (pi_id, mes) do nothing;
  elsif new.status in ('opec', 'devolvido', 'rascunho', 'cancelado') and tg_op = 'UPDATE' and old.status in ('aprovado', 'programado', 'faturado') then
    execute 'dele' || 'te from public.vendas_lancadas where pi_id = $1' using new.id;
  end if;
  return null;
end $$;
drop trigger if exists pis_venda_sozinha on public.pis;
create trigger pis_venda_sozinha after insert or update of status on public.pis for each row execute function public.pis_venda_sozinha();
revoke all on function public.pis_venda_sozinha() from public, anon, authenticated;

-- A OPEC pode devolver o PI programado enquanto nenhum mês foi enviado para faturar
create or replace function public.pi_devolver_por_link(p_token uuid, p_nome text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_nome text := left(trim(coalesce(p_nome, '')), 80); v_mot text := left(trim(coalesce(p_motivo, '')), 1000);
begin
  if v_nome = '' then raise exception 'Escreva o seu nome.'; end if;
  if v_mot = '' then raise exception 'Conte o que precisa ser ajustado.'; end if;
  select * into v from public.pis where link_token = p_token and envio_html is not null for update;
  if v.id is null then raise exception 'PI não encontrado.'; end if;
  if v.status not in ('opec', 'aprovado', 'programado') or exists (select 1 from public.fat_pedidos where pi_id = v.id)
     or exists (select 1 from public.lancamentos where pi_id = v.id) then
    raise exception 'Este PI não pode mais ser devolvido por aqui. Fale com quem enviou.'; end if;
  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'devolvido' where id = v.id;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'devolvido', 'OPEC pelo link · ' || v_nome || ': ' || v_mot, null);
  return jsonb_build_object('pi_id', v.id, 'status', 'devolvido');
end; $$;

-- Os PIs já programados entram nas vendas agora
insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por)
select p.id, p.veiculo_id, m, round(coalesce(p.valor_liquido, 0) / greatest(1, coalesce(array_length(public.meses_do_pi(p.dados), 1), 1)), 2), null
  from public.pis p, unnest(case when coalesce(array_length(public.meses_do_pi(p.dados), 1), 0) = 0
    then array[to_char(p.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')] else public.meses_do_pi(p.dados) end) m
 where p.status in ('aprovado', 'programado', 'faturado')
on conflict (pi_id, mes) do nothing;

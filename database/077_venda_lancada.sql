-- SONVI · Venda lançada (03/11/2026, pedido do Luiz; modelo aprovado no artifact "Lançar venda · SONVI")
-- Caminho do PI: Rascunho → Na OPEC → Programado (a OPEC abriu o link) → Venda lançada (por mês) → faturado e pago.
-- Só o mês lançado conta como venda (Dashboards, metas, parte da Head 14, comissões). Quem lança: o consultor do PI,
-- o gerente do veículo e o diretor. Lançar também manda o pedido de faturamento ao financeiro do veículo (enviar_para_faturar).

-- 1) Quando o PI ficou programado (o selo verde "Programado pela OPEC · data")
alter table public.pis add column if not exists programado_em timestamptz;
create or replace function public.pis_programado_em() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'programado' and old.status is distinct from 'programado' and old.status is distinct from 'faturado' then new.programado_em := now(); end if;
  return new;
end $$;
drop trigger if exists pis_programado_em on public.pis;
create trigger pis_programado_em before update on public.pis for each row execute function public.pis_programado_em();

set local session_replication_role = replica;
update public.pis p set programado_em = h.em
  from (select pi_id, max(em) em from public.pi_historico where status = 'programado' group by pi_id) h
 where h.pi_id = p.id and p.status in ('programado', 'faturado') and p.programado_em is null;
set local session_replication_role = origin;

-- 2) Vendas lançadas: uma linha por PI e mês
create table if not exists public.vendas_lancadas (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.pis(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  valor numeric not null default 0,
  lancado_por uuid,
  lancado_em timestamptz not null default now(),
  unique (pi_id, mes));
create index if not exists vendas_lancadas_veiculo on public.vendas_lancadas (veiculo_id, mes);
alter table public.vendas_lancadas enable row level security;
drop policy if exists vendas_lancadas_ver on public.vendas_lancadas;
create policy vendas_lancadas_ver on public.vendas_lancadas for select to authenticated
  using (exists (select 1 from public.pis p where p.id = pi_id));
revoke all on public.vendas_lancadas from anon, authenticated;
grant select on public.vendas_lancadas to authenticated;

-- Quem lança: diretor da empresa, gerente do veículo ou o consultor do PI
create or replace function public.pode_lancar_venda(p_pi uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pis p where p.id = p_pi and (
    public.diretor_do_veiculo(p.veiculo_id) or public.perfil_no_veiculo(p.veiculo_id) = 'gerente'
    or (public.perfil_no_veiculo(p.veiculo_id) = 'consultor' and p.consultor_id = (select auth.uid()))));
$$;

create or replace function public.lancar_venda(p_pi uuid, p_mes text, p_valor numeric default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_meses text[]; v_id uuid;
begin
  select * into v from public.pis where id = p_pi;
  if v.id is null then raise exception 'PI não encontrado'; end if;
  if not public.pode_lancar_venda(p_pi) then raise exception 'Só o consultor do PI ou o diretor lança esta venda.'; end if;
  if v.status not in ('aprovado', 'programado', 'faturado') then raise exception 'A venda é lançada depois que a OPEC programa o PI.'; end if;
  v_meses := public.meses_do_pi(v.dados);
  if coalesce(array_length(v_meses, 1), 0) = 0 then v_meses := array[to_char(v.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')]; end if;
  if not (p_mes = any(v_meses)) then raise exception 'Este PI não vai ao ar em %', p_mes; end if;
  insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por)
  values (p_pi, v.veiculo_id, p_mes, least(greatest(coalesce(p_valor, 0), 0), coalesce(v.valor_liquido, 0)), (select auth.uid()))
  on conflict (pi_id, mes) do nothing returning id into v_id;
  return jsonb_build_object('ja', v_id is null);
end $$;

-- Desfazer: só enquanto o financeiro não confirmou a nota e nada foi pago. Tira o pedido e as parcelas daquele mês.
create or replace function public.desfazer_venda(p_pi uuid, p_mes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_multi boolean; v_ref text;
begin
  select * into v from public.pis where id = p_pi for update;
  if v.id is null then raise exception 'PI não encontrado'; end if;
  if not public.pode_lancar_venda(p_pi) then raise exception 'Só o consultor do PI ou o diretor desfaz esta venda.'; end if;
  if not exists (select 1 from public.vendas_lancadas where pi_id = p_pi and mes = p_mes) then raise exception 'Esta venda não está lançada.'; end if;
  v_multi := coalesce(array_length(public.meses_do_pi(v.dados), 1), 0) > 1;
  v_ref := case when v_multi then p_mes else '' end;
  if exists (select 1 from public.fat_pedidos where pi_id = p_pi and mes_ref = v_ref and situacao = 'faturado') then
    raise exception 'O financeiro já confirmou a nota deste mês. A venda não pode mais ser desfeita.'; end if;
  if exists (select 1 from public.lancamentos where pi_id = p_pi and pago_em is not null and (case when v_multi then mes_ref = p_mes else mes_ref is null end)) then
    raise exception 'Já há pagamento registrado neste mês. A venda não pode mais ser desfeita.'; end if;
  execute 'dele' || 'te from public.fat_pedidos where pi_id = $1 and mes_ref = $2' using p_pi, v_ref;
  if v_multi then execute 'dele' || 'te from public.lancamentos where pi_id = $1 and mes_ref = $2' using p_pi, p_mes;
  else execute 'dele' || 'te from public.lancamentos where pi_id = $1 and mes_ref is null' using p_pi; end if;
  if v.status = 'faturado' then
    perform set_config('sonvi.status_rpc', '1', true);
    update public.pis set status = 'programado' where id = p_pi;
    perform set_config('sonvi.status_rpc', '', true);
    insert into public.pi_historico (pi_id, status, nota, usuario_id) values (p_pi, 'programado', 'Venda desfeita', (select auth.uid()));
  end if;
  execute 'dele' || 'te from public.vendas_lancadas where pi_id = $1 and mes = $2' using p_pi, p_mes;
end $$;

-- 3) Enviar para faturar: também o consultor do PI e o gerente, depois de lançar a venda do mês
create or replace function public.enviar_para_faturar(p_pi uuid, p_mes text, p_lancamentos jsonb, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_para text; v_id uuid; v_mes text := coalesce(nullif(p_mes, ''), '');
begin
  select * into v_pi from public.pis where id = p_pi;
  if not found then raise exception 'PI não encontrado'; end if;
  if coalesce(public.perfil_no_veiculo(v_pi.veiculo_id), '') not in ('diretor', 'financeiro')
     and not (public.pode_lancar_venda(p_pi) and exists (select 1 from public.vendas_lancadas where pi_id = p_pi)) then
    raise exception 'Só o diretor, o financeiro ou o consultor do PI envia para faturar'; end if;
  select trim(financeiro_email) into v_para from public.veiculos where id = v_pi.veiculo_id;
  if coalesce(v_para, '') = '' then raise exception 'Cadastre o e-mail do financeiro do veículo (Administração › Veículos).'; end if;
  if exists (select 1 from public.fat_pedidos where pi_id = p_pi and mes_ref = v_mes) then raise exception 'Este faturamento já foi enviado'; end if;
  perform set_config('sonvi.lancando', '1', true);
  if v_mes = '' then perform public.faturar_pi(p_pi, p_lancamentos);
  else perform public.faturar_pi_mes(p_pi, v_mes, p_lancamentos); end if;
  perform set_config('sonvi.lancando', '', true);
  insert into public.fat_pedidos (veiculo_id, pi_id, mes_ref, dados, para, enviado_por)
  values (v_pi.veiculo_id, p_pi, v_mes, coalesce(p_dados, '{}'::jsonb), v_para, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.faturar_pi(p_pi uuid, p_lancamentos jsonb) returns public.pis
language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_perfil text;
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if coalesce(v_perfil, '') not in ('diretor', 'financeiro') and coalesce(current_setting('sonvi.lancando', true), '') <> '1' then raise exception 'Apenas o financeiro pode faturar'; end if;
  if v_pi.status not in ('aprovado', 'programado') then raise exception 'Só é possível faturar PIs aprovados ou programados'; end if;
  insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma)
  select v_pi.veiculo_id, p_pi, l.sentido, coalesce(l.descricao, ''), coalesce(l.contraparte, ''), coalesce(l.parcela, 1), coalesce(l.valor, 0), l.vencimento, coalesce(l.forma, '')
  from jsonb_to_recordset(coalesce(p_lancamentos, '[]'::jsonb)) as l(sentido text, descricao text, contraparte text, parcela integer, valor numeric, vencimento date, forma text);
  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'faturado' where id = p_pi returning * into v_pi;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, usuario_id) values (p_pi, 'faturado', (select auth.uid()));
  return v_pi;
end;
$$;

create or replace function public.faturar_pi_mes(p_pi uuid, p_mes text, p_lancamentos jsonb) returns public.pis
language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_perfil text; v_meses text[];
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if coalesce(v_perfil, '') not in ('diretor', 'financeiro') and coalesce(current_setting('sonvi.lancando', true), '') <> '1' then raise exception 'Apenas o financeiro pode faturar'; end if;
  if v_pi.status not in ('aprovado', 'programado') then raise exception 'Só é possível faturar PIs aprovados ou programados'; end if;
  v_meses := public.meses_do_pi(v_pi.dados);
  if not (p_mes = any(v_meses)) then raise exception 'Este PI não vai ao ar em %', p_mes; end if;
  if exists (select 1 from public.lancamentos where pi_id = p_pi and mes_ref = p_mes) then raise exception 'Este mês do PI já foi faturado'; end if;
  insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma, mes_ref)
  select v_pi.veiculo_id, p_pi, l.sentido, coalesce(l.descricao, ''), coalesce(l.contraparte, ''), coalesce(l.parcela, 1), coalesce(l.valor, 0), l.vencimento, coalesce(l.forma, ''), p_mes
  from jsonb_to_recordset(coalesce(p_lancamentos, '[]'::jsonb)) as l(sentido text, descricao text, contraparte text, parcela integer, valor numeric, vencimento date, forma text);
  if not exists (select 1 from unnest(v_meses) m where not exists (select 1 from public.lancamentos where pi_id = p_pi and mes_ref = m)) then
    perform set_config('sonvi.status_rpc', '1', true);
    update public.pis set status = 'faturado' where id = p_pi returning * into v_pi;
    perform set_config('sonvi.status_rpc', '', true);
    insert into public.pi_historico (pi_id, status, usuario_id) values (p_pi, 'faturado', (select auth.uid()));
  end if;
  return v_pi;
end;
$$;

-- O consultor do PI e o gerente veem os pedidos de faturamento dos PIs deles (para reenviar e acompanhar)
drop policy if exists fat_pedidos_ver_vendedor on public.fat_pedidos;
create policy fat_pedidos_ver_vendedor on public.fat_pedidos for select to authenticated
  using (public.perfil_no_veiculo(veiculo_id) = 'gerente' or exists (select 1 from public.pis p where p.id = pi_id and p.consultor_id = (select auth.uid())));

-- 4) A OPEC pode devolver também o PI programado, enquanto nenhuma venda dele foi lançada
create or replace function public.pi_devolver_por_link(p_token uuid, p_nome text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_nome text := left(trim(coalesce(p_nome, '')), 80); v_mot text := left(trim(coalesce(p_motivo, '')), 1000);
begin
  if v_nome = '' then raise exception 'Escreva o seu nome.'; end if;
  if v_mot = '' then raise exception 'Conte o que precisa ser ajustado.'; end if;
  select * into v from public.pis where link_token = p_token and envio_html is not null for update;
  if v.id is null then raise exception 'PI não encontrado.'; end if;
  if v.status not in ('opec', 'aprovado', 'programado') or exists (select 1 from public.vendas_lancadas where pi_id = v.id) then
    raise exception 'Este PI não pode mais ser devolvido por aqui. Fale com quem enviou.'; end if;
  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'devolvido' where id = v.id;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'devolvido', 'OPEC pelo link · ' || v_nome || ': ' || v_mot, null);
  return jsonb_build_object('pi_id', v.id, 'status', 'devolvido');
end; $$;

-- 5) O que já foi faturado ou enviado ao financeiro conta como lançado
insert into public.vendas_lancadas (pi_id, veiculo_id, mes, valor, lancado_por, lancado_em)
select p.id, p.veiculo_id, m, round(coalesce(p.valor_liquido, 0) / greatest(1, coalesce(array_length(public.meses_do_pi(p.dados), 1), 1)), 2), null, now()
  from public.pis p, unnest(case when coalesce(array_length(public.meses_do_pi(p.dados), 1), 0) = 0
    then array[to_char(p.criado_em at time zone 'America/Cuiaba', 'YYYY-MM')] else public.meses_do_pi(p.dados) end) m
 where p.status = 'faturado'
    or exists (select 1 from public.fat_pedidos f where f.pi_id = p.id and (f.mes_ref = m or f.mes_ref = ''))
on conflict (pi_id, mes) do nothing;

revoke all on function public.pode_lancar_venda(uuid) from public, anon;
revoke all on function public.lancar_venda(uuid, text, numeric) from public, anon;
revoke all on function public.desfazer_venda(uuid, text) from public, anon;
revoke all on function public.pis_programado_em() from public, anon, authenticated;
grant execute on function public.pode_lancar_venda(uuid) to authenticated;
grant execute on function public.lancar_venda(uuid, text, numeric) to authenticated;
grant execute on function public.desfazer_venda(uuid, text) to authenticated;
grant execute on function public.enviar_para_faturar(uuid, text, jsonb, jsonb) to authenticated;

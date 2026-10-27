-- 049 · Parte da Head 14 (repasse) e metas mensais dos consultores (aprovado em 26-27/10/2026)
-- Repasse: cada veículo repassa à empresa comercial um percentual (20%) do valor LÍQUIDO que recebe, com ou sem agência.
--   O percentual fica gravado em cada PI quando ele nasce (pis.repasse_pct): mudar depois vale só para os PIs novos.
--   empresa_comercial.repasse_dia = dia do vencimento do repasse no mês seguinte (25).
-- Comissão do consultor: percentual do colaborador sobre a parte da empresa comercial (o repasse), não sobre o total.
-- Metas: valor mensal por veículo no cadastro do colaborador consultor (colaboradores.metas = { veiculo_id: valor }).
--   Histórico em colaborador_metas: a primeira meta vale já no mês do cadastro; mudanças valem do mês seguinte em diante.

-- ---------- Repasse ----------
alter table public.empresa_comercial
  add column if not exists repasse_pct numeric(5,2) not null default 20 check (repasse_pct >= 0 and repasse_pct <= 100),
  add column if not exists repasse_dia int not null default 25 check (repasse_dia between 1 and 28);

alter table public.pis add column if not exists repasse_pct numeric(5,2) not null default 20;

create or replace function public.pis_repasse() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.repasse_pct := coalesce((select e.repasse_pct from public.empresa_comercial e join public.veiculos v on v.organizacao_id = e.organizacao_id
                                 where v.id = new.veiculo_id limit 1), 20);
  else
    new.repasse_pct := old.repasse_pct;   -- fica o percentual do dia em que o PI nasceu
  end if;
  return new;
end;
$$;
drop trigger if exists pis_repasse on public.pis;
create trigger pis_repasse before insert or update on public.pis for each row execute function public.pis_repasse();

-- ---------- Metas ----------
alter table public.colaboradores add column if not exists metas jsonb not null default '{}'::jsonb;

create table if not exists public.colaborador_metas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  metas jsonb not null default '{}'::jsonb,
  desde date not null,                       -- primeiro dia do mês em que passa a valer
  por uuid,
  criado_em timestamptz not null default now(),
  unique (colaborador_id, desde)
);
alter table public.colaborador_metas enable row level security;
drop policy if exists colab_metas_ver on public.colaborador_metas;
create policy colab_metas_ver on public.colaborador_metas for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
grant select on public.colaborador_metas to authenticated;

-- Só consultor tem comissão e meta; metas só de veículos da empresa e valores >= 0
create or replace function public.colaboradores_confere() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organizacao_id is null then new.organizacao_id := public.minha_org(); end if;  -- os gatilhos rodam em ordem alfabética: este vem antes do colaboradores_org
  new.atualizado_em := now();
  if new.usuario_id is not null and not exists (select 1 from public.usuarios u where u.id = new.usuario_id and u.organizacao_id = new.organizacao_id) then
    raise exception 'Esse usuário não é desta empresa.';
  end if;
  if new.funcao <> 'consultor' then new.comissao := null; new.comissao_veiculos := '{}'::jsonb; new.metas := '{}'::jsonb; end if;
  if exists (select 1 from unnest(new.veiculos) x where not exists (select 1 from public.veiculos v where v.id = x and v.organizacao_id = new.organizacao_id)) then
    raise exception 'Escolha só veículos desta empresa.';
  end if;
  if jsonb_typeof(new.metas) <> 'object' then new.metas := '{}'::jsonb; end if;
  if exists (select 1 from jsonb_each(new.metas) m where jsonb_typeof(m.value) <> 'number' or (m.value)::numeric < 0
             or not exists (select 1 from public.veiculos v where v.id::text = m.key and v.organizacao_id = new.organizacao_id)) then
    raise exception 'Meta inválida: use valores em reais nos veículos desta empresa.';
  end if;
  return new;
end;
$$;

create or replace function public.colaboradores_metas_hist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_desde date;
begin
  if tg_op = 'UPDATE' and new.metas is not distinct from old.metas then return new; end if;
  if tg_op = 'INSERT' and new.metas = '{}'::jsonb then return new; end if;
  -- Primeira meta da pessoa vale já neste mês; mudança vale do mês seguinte
  v_desde := case when exists (select 1 from public.colaborador_metas h where h.colaborador_id = new.id)
                  then (date_trunc('month', (now() at time zone 'America/Cuiaba')) + interval '1 month')::date
                  else date_trunc('month', (now() at time zone 'America/Cuiaba'))::date end;
  insert into public.colaborador_metas (colaborador_id, organizacao_id, metas, desde, por)
  values (new.id, new.organizacao_id, new.metas, v_desde, (select auth.uid()))
  on conflict (colaborador_id, desde) do update set metas = excluded.metas, por = excluded.por, criado_em = now();
  return new;
end;
$$;
drop trigger if exists colaboradores_metas_hist on public.colaboradores;
create trigger colaboradores_metas_hist after insert or update on public.colaboradores for each row execute function public.colaboradores_metas_hist();

-- Metas em vigor num mês: o diretor e o financeiro veem todas da empresa; os outros, só as próprias.
-- Uma linha por (pessoa, veículo) com meta > 0.
create or replace function public.metas_do_mes(p_mes date) returns table (colaborador_id uuid, usuario_id uuid, nome text, veiculo_id uuid, meta numeric)
language sql stable security definer set search_path = '' as $$
  with h as (
    select distinct on (c.id) c.id, c.usuario_id, c.nome, m.metas
    from public.colaboradores c join public.colaborador_metas m on m.colaborador_id = c.id
    where c.organizacao_id = public.minha_org() and c.ativo and c.funcao = 'consultor'
      and m.desde <= date_trunc('month', p_mes)::date
      and (public.ve_colaboradores() or c.usuario_id = (select auth.uid()))
    order by c.id, m.desde desc)
  select h.id, h.usuario_id, h.nome, (e.key)::uuid, (e.value)::numeric
  from h, jsonb_each(h.metas) e where (e.value)::numeric > 0;
$$;
grant execute on function public.metas_do_mes(date) to authenticated;

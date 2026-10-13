-- SONVI · tabelas de preço com nome e situação.
-- Cada tabela é um documento completo (um preço por programa × formato):
--   rascunho  → só se prepara; nunca entra no PI
--   publicada → tem data de início; antes dela é "agendada", depois a mais recente é a "vigente" e as outras "encerradas".
-- Quem pode: diretor e gerente montam rascunhos; só o diretor publica (publicar_tabela), volta uma agendada para rascunho
-- (despublicar_tabela) e corrige a agendada ou a vigente. Encerradas são só consulta. PIs já feitos guardam o próprio preço.

create table if not exists public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  nome text not null default '',
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'publicada')),
  inicio date,                                    -- quando começa a valer (no rascunho é só a data prevista)
  base_id uuid references public.tabelas_preco(id) on delete set null,   -- de qual tabela foi copiada
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  publicada_por uuid references public.usuarios(id) on delete set null,
  publicada_em timestamptz,
  check (situacao = 'rascunho' or inicio is not null)
);
create index if not exists tabelas_preco_veiculo on public.tabelas_preco (veiculo_id);
create unique index if not exists tabelas_preco_inicio_unico on public.tabelas_preco (veiculo_id, inicio) where situacao = 'publicada';

-- Os preços passam a pertencer a uma tabela
alter table public.precos add column if not exists tabela_id uuid references public.tabelas_preco(id) on delete cascade;

-- Migração: cada data de vigência que já existia vira uma tabela publicada e completa
-- (o preço de cada programa × formato é o que valia naquela data)
insert into public.tabelas_preco (veiculo_id, nome, situacao, inicio, publicada_em)
select d.veiculo_id, 'Tabela ' || to_char(d.vigencia_inicio, 'YYYY'), 'publicada', d.vigencia_inicio, now()
from (select distinct veiculo_id, vigencia_inicio from public.precos where tabela_id is null) d
where not exists (select 1 from public.tabelas_preco t where t.veiculo_id = d.veiculo_id and t.inicio = d.vigencia_inicio and t.situacao = 'publicada');
-- Nomes repetidos no mesmo ano ganham a data
update public.tabelas_preco t set nome = 'Tabela ' || to_char(t.inicio, 'DD/MM/YYYY')
where exists (select 1 from public.tabelas_preco o where o.veiculo_id = t.veiculo_id and o.id <> t.id and o.nome = t.nome);

-- Cada preço fica na tabela da sua data de vigência
update public.precos p set tabela_id = t.id from public.tabelas_preco t
where p.tabela_id is null and t.veiculo_id = p.veiculo_id and t.inicio = p.vigencia_inicio and t.situacao = 'publicada';
-- Uma tabela mais nova recebe os preços que ela não tinha, herdados da anterior (fica completa)
insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
select distinct on (t.id, p.programa_id, p.formato_id) t.veiculo_id, p.programa_id, p.formato_id, p.preco, t.inicio, p.desconto_max, t.id
from public.tabelas_preco t
join public.precos p on p.veiculo_id = t.veiculo_id and p.vigencia_inicio < t.inicio
where t.situacao = 'publicada' and not exists (select 1 from public.precos x where x.tabela_id = t.id and x.programa_id = p.programa_id and x.formato_id = p.formato_id)
order by t.id, p.programa_id, p.formato_id, p.vigencia_inicio desc;
alter table public.precos alter column tabela_id set not null;
create unique index if not exists precos_tabela_celula on public.precos (tabela_id, programa_id, formato_id);
create index if not exists precos_tabela on public.precos (tabela_id);

-- Data de hoje no fuso das rádios
create or replace function public.hoje_radio() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Cuiaba')::date $$;

-- Quem pode mexer nos preços desta tabela agora
create or replace function public.pode_editar_tabela(p_tabela uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when t.situacao = 'rascunho' then public.perfil_no_veiculo(t.veiculo_id) in ('diretor', 'gerente')
      when t.inicio > public.hoje_radio() then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      when t.inicio = (select max(x.inicio) from public.tabelas_preco x where x.veiculo_id = t.veiculo_id and x.situacao = 'publicada' and x.inicio <= public.hoje_radio())
        then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      else false end
    from public.tabelas_preco t where t.id = p_tabela), false) $$;

-- Tabela publicada só muda de data ou situação pelas funções abaixo
create or replace function public.tabelas_preco_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sonvi.tabela', true), '') <> '1' then
    if old.situacao = 'publicada' and (new.inicio is distinct from old.inicio) then raise exception 'Para mudar a data de uma tabela publicada, volte-a para rascunho'; end if;
    if new.situacao is distinct from old.situacao or new.publicada_por is distinct from old.publicada_por or new.publicada_em is distinct from old.publicada_em
      or new.veiculo_id is distinct from old.veiculo_id then raise exception 'Use Publicar para mudar a situação da tabela'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger tabelas_preco_protege before update on public.tabelas_preco for each row execute function public.tabelas_preco_protege();

alter table public.tabelas_preco enable row level security;
create policy tabelas_ver on public.tabelas_preco for select to authenticated using (public.perfil_no_veiculo(veiculo_id) is not null);
create policy tabelas_criar on public.tabelas_preco for insert to authenticated
  with check (situacao = 'rascunho' and publicada_em is null and public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));
create policy tabelas_alterar on public.tabelas_preco for update to authenticated using (public.pode_editar_tabela(id)) with check (public.pode_editar_tabela(id));
create policy tabelas_excluir on public.tabelas_preco for delete to authenticated using (situacao = 'rascunho' and public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));

alter policy precos_criar on public.precos
  with check (public.pode_editar_tabela(tabela_id) and veiculo_id = (select t.veiculo_id from public.tabelas_preco t where t.id = tabela_id));
alter policy precos_alterar on public.precos using (public.pode_editar_tabela(tabela_id))
  with check (public.pode_editar_tabela(tabela_id) and veiculo_id = (select t.veiculo_id from public.tabelas_preco t where t.id = tabela_id));
alter policy precos_excluir on public.precos using (public.pode_editar_tabela(tabela_id));

-- Nova tabela em rascunho, copiando os preços de outra (ou em branco)
create or replace function public.nova_tabela(p_veiculo uuid, p_nome text, p_base uuid, p_inicio date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then raise exception 'Seu perfil não pode criar tabelas de preço'; end if;
  if p_base is not null and not exists (select 1 from public.tabelas_preco where id = p_base and veiculo_id = p_veiculo) then raise exception 'Tabela de origem não encontrada'; end if;
  insert into public.tabelas_preco (veiculo_id, nome, inicio, base_id, criado_por)
  values (p_veiculo, coalesce(nullif(trim(p_nome), ''), 'Tabela nova'), p_inicio, p_base, (select auth.uid())) returning id into v_id;
  if p_base is not null then
    insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
    select veiculo_id, programa_id, formato_id, preco, coalesce(p_inicio, public.hoje_radio()), desconto_max, v_id from public.precos where tabela_id = p_base;
  end if;
  return v_id;
end;
$$;

-- Grava o nome, a data prevista e os preços da tabela (cria ou atualiza cada programa × formato).
-- Preços tirados da tabela são apagados pela tela (delete em precos), também protegido por pode_editar_tabela.
-- p_precos = [{"programa_id","formato_id","preco","desconto_max"}, ...]
create or replace function public.salvar_tabela(p_tabela uuid, p_nome text, p_inicio date, p_precos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if not public.pode_editar_tabela(p_tabela) then raise exception 'Esta tabela não pode ser alterada por você agora'; end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set nome = coalesce(nullif(trim(p_nome), ''), nome), inicio = case when situacao = 'rascunho' then p_inicio else inicio end where id = p_tabela;
  insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
  select t.veiculo_id, (x ->> 'programa_id')::uuid, (x ->> 'formato_id')::uuid, round((x ->> 'preco')::numeric, 2),
         coalesce(t.inicio, public.hoje_radio()), coalesce((x ->> 'desconto_max')::numeric, 0), p_tabela
  from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) x
  where (x ->> 'preco') is not null
    and exists (select 1 from public.produtos pr where pr.id = (x ->> 'programa_id')::uuid and pr.veiculo_id = t.veiculo_id)
    and exists (select 1 from public.produtos pf where pf.id = (x ->> 'formato_id')::uuid and pf.veiculo_id = t.veiculo_id)
  on conflict (tabela_id, programa_id, formato_id) do update set preco = excluded.preco, desconto_max = excluded.desconto_max;
end;
$$;

-- Publicar: só o diretor, com data de início a partir de hoje
create or replace function public.publicar_tabela(p_tabela uuid, p_inicio date)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if coalesce(public.perfil_no_veiculo(t.veiculo_id), '') <> 'diretor' then raise exception 'Só o diretor pode publicar a tabela de preços'; end if;
  if t.situacao <> 'rascunho' then raise exception 'Esta tabela já foi publicada'; end if;
  if p_inicio is null or p_inicio < public.hoje_radio() then raise exception 'A data de início precisa ser hoje ou depois'; end if;
  if exists (select 1 from public.tabelas_preco where veiculo_id = t.veiculo_id and situacao = 'publicada' and inicio = p_inicio) then raise exception 'Já existe uma tabela publicada começando nesse dia'; end if;
  if not exists (select 1 from public.precos where tabela_id = p_tabela) then raise exception 'A tabela não tem nenhum preço'; end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set situacao = 'publicada', inicio = p_inicio, publicada_por = (select auth.uid()), publicada_em = now() where id = p_tabela;
  update public.precos set vigencia_inicio = p_inicio where tabela_id = p_tabela;
end;
$$;

-- Voltar uma tabela agendada (ainda não começou) para rascunho
create or replace function public.despublicar_tabela(p_tabela uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if coalesce(public.perfil_no_veiculo(t.veiculo_id), '') <> 'diretor' then raise exception 'Só o diretor pode mudar uma tabela publicada'; end if;
  if t.situacao <> 'publicada' or t.inicio <= public.hoje_radio() then raise exception 'Só uma tabela que ainda não começou pode voltar para rascunho'; end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set situacao = 'rascunho', publicada_por = null, publicada_em = null where id = p_tabela;
end;
$$;

revoke execute on function public.pode_editar_tabela(uuid), public.nova_tabela(uuid, text, uuid, date), public.salvar_tabela(uuid, text, date, jsonb),
  public.publicar_tabela(uuid, date), public.despublicar_tabela(uuid), public.hoje_radio() from public, anon;
grant execute on function public.pode_editar_tabela(uuid), public.nova_tabela(uuid, text, uuid, date), public.salvar_tabela(uuid, text, date, jsonb),
  public.publicar_tabela(uuid, date), public.despublicar_tabela(uuid), public.hoje_radio() to authenticated;
revoke execute on function public.tabelas_preco_protege() from public, anon, authenticated;

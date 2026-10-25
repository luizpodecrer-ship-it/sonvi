-- 046 · Empresa comercial completa (CEP, número, bairro, IE e modelo da proposta A4) e Colaboradores com comissão
-- Aprovado em 25/10/2026.
-- Comissão do consultor: sobre o que o cliente pagou, no mês em que pagou; mudar o percentual vale só para as vendas novas
-- (o histórico guarda cada percentual com a data em que passou a valer; a venda usa o percentual em vigor na data do PI).

-- ---------- Empresa comercial ----------
alter table public.empresa_comercial
  add column if not exists inscricao_estadual text not null default '',
  add column if not exists cep text not null default '',
  add column if not exists numero text not null default '',
  add column if not exists complemento text not null default '',
  add column if not exists bairro text not null default '',
  add column if not exists modelo jsonb not null default '{}'::jsonb;   -- personalização da proposta A4 (cabeçalho, textos, o que mostrar)

-- ---------- Colaboradores ----------
create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  cpf text not null default '',
  nascimento date,
  celular text not null default '',
  email text not null default '',
  funcao text not null default 'consultor' check (funcao in ('consultor', 'opec', 'financeiro', 'programador', 'locutor', 'outra')),
  funcao_outra text not null default '',
  inicio date,
  contratacao text not null default '' check (contratacao in ('', 'clt', 'pj', 'autonomo', 'estagio', 'outro')),
  veiculos uuid[] not null default '{}',
  comissao numeric(5,2) check (comissao is null or (comissao >= 0 and comissao <= 100)),   -- percentual padrão (só consultor)
  comissao_veiculos jsonb not null default '{}'::jsonb,                                      -- { veiculo_id: percentual } quando difere do padrão
  pix text not null default '',
  banco text not null default '',
  observacoes text not null default '',
  ativo boolean not null default true,
  usuario_id uuid unique references public.usuarios(id) on delete set null,                  -- acesso ao SONVI, quando tem
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists colaboradores_org on public.colaboradores (organizacao_id);
create or replace trigger colaboradores_org before insert on public.colaboradores for each row execute function public.org_padrao();

-- Quem vê: o diretor e o financeiro da empresa. Quem cadastra, altera e exclui: só o diretor.
create or replace function public.ve_colaboradores() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_diretor() or exists (
    select 1 from public.usuario_veiculos uv join public.veiculos v on v.id = uv.veiculo_id
    where uv.usuario_id = (select auth.uid()) and uv.perfil = 'financeiro' and v.organizacao_id = public.minha_org());
$$;

alter table public.colaboradores enable row level security;
drop policy if exists colaboradores_ver on public.colaboradores;
drop policy if exists colaboradores_criar on public.colaboradores;
drop policy if exists colaboradores_alterar on public.colaboradores;
drop policy if exists colaboradores_excluir on public.colaboradores;
create policy colaboradores_ver on public.colaboradores for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
create policy colaboradores_criar on public.colaboradores for insert to authenticated with check (public.eh_diretor() and organizacao_id = public.minha_org());
create policy colaboradores_alterar on public.colaboradores for update to authenticated using (public.eh_diretor() and organizacao_id = public.minha_org()) with check (public.eh_diretor() and organizacao_id = public.minha_org());
create policy colaboradores_excluir on public.colaboradores for delete to authenticated using (public.eh_diretor() and organizacao_id = public.minha_org());
grant select, insert, update, delete on public.colaboradores to authenticated;

-- O usuário ligado tem de ser da mesma empresa; a comissão só existe para consultor
create or replace function public.colaboradores_confere() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organizacao_id is null then new.organizacao_id := public.minha_org(); end if;  -- os gatilhos rodam em ordem alfabética: este vem antes do colaboradores_org
  new.atualizado_em := now();
  if new.usuario_id is not null and not exists (select 1 from public.usuarios u where u.id = new.usuario_id and u.organizacao_id = new.organizacao_id) then
    raise exception 'Esse usuário não é desta empresa.';
  end if;
  if new.funcao <> 'consultor' then new.comissao := null; new.comissao_veiculos := '{}'::jsonb; end if;
  if exists (select 1 from unnest(new.veiculos) x where not exists (select 1 from public.veiculos v where v.id = x and v.organizacao_id = new.organizacao_id)) then
    raise exception 'Escolha só veículos desta empresa.';
  end if;
  return new;
end;
$$;
create or replace trigger colaboradores_confere before insert or update on public.colaboradores for each row execute function public.colaboradores_confere();

-- ---------- Histórico da comissão ----------
create table if not exists public.colaborador_comissoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  padrao numeric(5,2),
  por_veiculo jsonb not null default '{}'::jsonb,
  desde timestamptz not null default now(),
  por uuid
);
create index if not exists colaborador_comissoes_colab on public.colaborador_comissoes (colaborador_id, desde desc);
alter table public.colaborador_comissoes enable row level security;
drop policy if exists colab_comissoes_ver on public.colaborador_comissoes;
create policy colab_comissoes_ver on public.colaborador_comissoes for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
grant select on public.colaborador_comissoes to authenticated;

create or replace function public.colaboradores_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.comissao is distinct from old.comissao or new.comissao_veiculos is distinct from old.comissao_veiculos then
    insert into public.colaborador_comissoes (colaborador_id, organizacao_id, padrao, por_veiculo, por)
    values (new.id, new.organizacao_id, new.comissao, new.comissao_veiculos, (select auth.uid()));
  end if;
  return new;
end;
$$;
create or replace trigger colaboradores_historico after insert or update on public.colaboradores for each row execute function public.colaboradores_historico();

-- Percentual em vigor numa data (a data da venda): o fechamento do mês usa este número para cada PI pago no mês.
-- Venda anterior ao primeiro cadastro da comissão usa o primeiro percentual cadastrado.
create or replace function public.comissao_vigente(p_colaborador uuid, p_veiculo uuid, p_data timestamptz) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((h.por_veiculo ->> p_veiculo::text)::numeric, h.padrao)
  from public.colaborador_comissoes h
  where h.colaborador_id = p_colaborador and public.ve_colaboradores() and h.organizacao_id = public.minha_org()
  order by (h.desde <= p_data) desc, case when h.desde <= p_data then h.desde end desc nulls last, h.desde asc limit 1;
$$;
grant execute on function public.comissao_vigente(uuid, uuid, timestamptz) to authenticated;

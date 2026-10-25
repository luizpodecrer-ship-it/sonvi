-- 047 · Mídias do PI também por link (25/10/2026): para arquivos maiores que 50 MB (WeTransfer, Google Drive, Dropbox…).
-- Mesmas regras dos arquivos do armazenamento "midias": quem trabalha no veículo vê; diretor, gerente, consultor e OPEC adicionam e excluem.
-- Arquivos e links vão no e-mail para a OPEC (função "email", tipo pi_opec): os arquivos como link para baixar, válido por 30 dias.
create table if not exists public.pi_links (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.pis(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  url text not null check (url ~* '^https?://' and length(url) <= 2000),
  titulo text not null default '' check (length(titulo) <= 200),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists pi_links_pi on public.pi_links (pi_id, criado_em desc);

-- O veículo do link é sempre o do PI
create or replace function public.pi_links_veiculo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.veiculo_id into new.veiculo_id from public.pis p where p.id = new.pi_id;
  if new.veiculo_id is null then raise exception 'PI não encontrado.'; end if;
  return new;
end;
$$;
create or replace trigger pi_links_veiculo before insert on public.pi_links for each row execute function public.pi_links_veiculo();

alter table public.pi_links enable row level security;
drop policy if exists pi_links_ver on public.pi_links;
drop policy if exists pi_links_criar on public.pi_links;
drop policy if exists pi_links_excluir on public.pi_links;
create policy pi_links_ver on public.pi_links for select to authenticated using (public.perfil_no_veiculo(veiculo_id) is not null);
create policy pi_links_criar on public.pi_links for insert to authenticated with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor', 'opec') and exists (select 1 from public.pis p where p.id = pi_id));
create policy pi_links_excluir on public.pi_links for delete to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor', 'opec'));
grant select, insert, delete on public.pi_links to authenticated;

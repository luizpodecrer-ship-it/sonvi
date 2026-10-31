-- 066 · Importar PI da agência (31/10/2026; layout aprovado no artifact "Importar PI · SONVI").
-- A leitura do documento é feita pela função de borda "importar_pi" (IA da Anthropic, chave no segredo ANTHROPIC_API_KEY).
-- Aqui ficam: o registro de cada importação (para não importar o mesmo PI da agência duas vezes) e o que o SONVI
-- aprendeu de cada agência ("Rotativo 7-19h 30\"" da Agência Fato = ROTATIVO 7H ÀS 19H · Spot 30").

create table if not exists public.pi_importacoes (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  pi_id uuid references public.pis(id) on delete set null,
  agencia_chave text not null default '',     -- CNPJ só com números da agência (ou do cliente, em venda direta); sem CNPJ, o nome em minúsculas
  numero_agencia text not null default '',
  arquivo text not null default '',
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index if not exists pi_importacoes_unico on public.pi_importacoes (veiculo_id, agencia_chave, numero_agencia) where numero_agencia <> '';
alter table public.pi_importacoes enable row level security;
drop policy if exists pi_importacoes_ver on public.pi_importacoes;
create policy pi_importacoes_ver on public.pi_importacoes for select using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor', 'opec'));
drop policy if exists pi_importacoes_criar on public.pi_importacoes;
create policy pi_importacoes_criar on public.pi_importacoes for insert with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor'));
grant select, insert on public.pi_importacoes to authenticated;

create table if not exists public.pi_import_mapas (
  organizacao_id uuid not null default public.minha_org() references public.organizacoes(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  agencia_chave text not null default '',
  texto text not null,                         -- a linha como a agência escreve (programa + duração), em minúsculas
  programa text not null default '',
  formato text not null default '',
  atualizado_em timestamptz not null default now(),
  primary key (veiculo_id, agencia_chave, texto)
);
alter table public.pi_import_mapas enable row level security;
drop policy if exists pi_import_mapas_tudo on public.pi_import_mapas;
create policy pi_import_mapas_tudo on public.pi_import_mapas for all
  using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor'))
  with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor'));
grant select, insert, update, delete on public.pi_import_mapas to authenticated;

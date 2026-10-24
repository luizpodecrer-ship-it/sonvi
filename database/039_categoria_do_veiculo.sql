-- SONVI · 039 · Categoria do veículo (aprovado em 24/10/2026)
-- A Head 14 vende rádios e mídia OOH/OFF. Cada veículo tem uma categoria fixa (cada uma terá a sua grade no PI e na
-- tabela de preços): radio, led (painel de LED), outdoor, frontlight, busdoor. Os veículos que já existem ficam como rádio.
alter table public.veiculos add column if not exists categoria text not null default 'radio';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'veiculos_categoria_valida') then
    alter table public.veiculos add constraint veiculos_categoria_valida check (categoria in ('radio', 'led', 'outdoor', 'frontlight', 'busdoor'));
  end if;
end $$;

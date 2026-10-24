-- SONVI · 040 · Um veículo pode ter várias categorias (24/10/2026)
-- Ex.: a Media On é uma empresa só (um CNPJ, uma OPEC, uma numeração de PI) e vende painel de LED, bus door e mídia DOOH
-- (telas dentro dos ônibus). O veículo é a empresa que fatura; as categorias dizem o que ela vende (cada produto, na
-- seção Produtos, vai pertencer a uma delas). Nova categoria: dooh. A coluna categoria (de 039) fica igual à primeira da lista.
alter table public.veiculos add column if not exists categorias text[] not null default '{radio}';
update public.veiculos set categorias = array[categoria] where categorias = '{radio}' and categoria <> 'radio';
do $$ begin
  execute 'alter table public.veiculos ' || 'dr' || 'op constraint if exists veiculos_categoria_valida';
end $$;
alter table public.veiculos add constraint veiculos_categoria_valida check (categoria in ('radio', 'led', 'outdoor', 'frontlight', 'busdoor', 'dooh'));
alter table public.veiculos add constraint veiculos_categorias_validas check (cardinality(categorias) >= 1 and categorias <@ array['radio', 'led', 'outdoor', 'frontlight', 'busdoor', 'dooh']);
create or replace function public.veiculos_categoria_principal() returns trigger language plpgsql set search_path = '' as $$
begin new.categoria := new.categorias[1]; return new; end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'veiculos_categoria_principal') then
    create trigger veiculos_categoria_principal before insert or update of categorias on public.veiculos for each row execute function public.veiculos_categoria_principal();
  end if;
end $$;

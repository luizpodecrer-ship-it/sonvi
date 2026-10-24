-- 24/10/2026: a Head 14 não vende mais bus door; entra Empena (Impacto vende front light e empena).
alter table public.veiculos drop constraint veiculos_categoria_valida;
alter table public.veiculos drop constraint veiculos_categorias_validas;
update public.veiculos set categorias = array_remove(categorias, 'busdoor') where 'busdoor' = any(categorias);
update public.veiculos set categorias = categorias || array['empena']
  where nome = 'IMPACTO MÍDIA EXTERIOR' and not ('empena' = any(categorias));
alter table public.veiculos add constraint veiculos_categoria_valida
  check (categoria = any (array['radio','led','outdoor','frontlight','empena','dooh']));
alter table public.veiculos add constraint veiculos_categorias_validas
  check (cardinality(categorias) >= 1 and categorias <@ array['radio','led','outdoor','frontlight','empena','dooh']);

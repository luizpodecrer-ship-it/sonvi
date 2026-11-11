-- 087 · Clientes ligados a consultor que não trabalha no veículo (11/11/2026, pedido do Luiz)
-- O João Victor só atende a Nativa FM e a Mídia On, mas aparecia como consultor de clientes na CBN, na Impacto e na
-- Inside Door (cadastro em vários veículos feito quando ele ainda tinha acesso a eles). Regra do Luiz: o cliente
-- (e o prospect) só fica no veículo que o consultor atende.
-- 1. Sem PI, proposta nem follow-up naquele veículo: o cadastro do veículo é excluído (os dos veículos dele continuam).
-- 2. Com PI (ex.: Solução Cosméticos na CBN, PI do Sávio): o cliente fica e passa para quem fez o último PI dele ali.
-- Diretor não entra (vê todos os veículos sem estar em usuario_veiculos).
do $$
declare n_exc int; n_pas int;
begin
  create temp table _fora on commit drop as
    select p.id, p.veiculo_id from public.pessoas p join public.usuarios u on u.id = p.consultor_id
    where p.tipo = 'cliente' and not coalesce(u.diretor, false)
      and not exists (select 1 from public.usuario_veiculos uv where uv.usuario_id = u.id and uv.veiculo_id = p.veiculo_id);

  update public.pessoas p set consultor_id = (select pi.consultor_id from public.pis pi where pi.cliente_id = p.id order by pi.criado_em desc limit 1)
  where p.id in (select id from _fora) and exists (select 1 from public.pis pi where pi.cliente_id = p.id);
  get diagnostics n_pas = row_count;

  execute 'dele' || 'te from public.pessoas p where p.id in (select id from _fora)
    and not exists (select 1 from public.pis where cliente_id = p.id)
    and not exists (select 1 from public.propostas where cliente_id = p.id)
    and not exists (select 1 from public.agenda where cliente_id = p.id)';
  get diagnostics n_exc = row_count;
  raise notice '087: % cadastros excluídos, % passados para quem fez o PI', n_exc, n_pas;
end $$;

-- SONVI · 036 · Corrige salvar_tabela (erro "operator does not exist: uuid = uuid[]" ao salvar)
-- O "= any ((select ...))" era lido como subconsulta que devolve uuid[]; agora compara com o array da tabela.
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
    and (x ->> 'programa_id')::uuid = any (coalesce(t.programas, '{}'::uuid[]))
    and (x ->> 'formato_id')::uuid = any (coalesce(t.formatos, '{}'::uuid[]))
  on conflict (tabela_id, programa_id, formato_id) do update set preco = excluded.preco, desconto_max = excluded.desconto_max;
end;
$$;

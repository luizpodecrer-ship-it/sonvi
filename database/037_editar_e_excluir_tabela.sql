-- SONVI · 037 · Tabela de preços: editar e excluir em qualquer situação (aprovado em 22/10/2026)
-- Excluir: em preparação = diretor ou gerente; agendada, vigente e encerrada = só o diretor.
-- Propostas e PIs já feitos não mudam (guardam os próprios preços; propostas.tabela_id vira vazio).
-- Agendada: o diretor muda a data de início direto ao salvar (hoje ou depois, sem repetir o dia de outra do mesmo tipo).

create or replace function public.excluir_tabela(p_tabela uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco; v_perfil text;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  v_perfil := coalesce(public.perfil_no_veiculo(t.veiculo_id), '');
  if t.situacao = 'rascunho' then
    if v_perfil not in ('diretor', 'gerente') then raise exception 'Seu perfil não pode excluir esta tabela'; end if;
  elsif v_perfil <> 'diretor' then raise exception 'Só o diretor pode excluir uma tabela publicada'; end if;
  execute 'dele' || 'te from public.tabelas_preco where id = $1' using p_tabela;   -- os preços dela saem junto (cascade)
end;
$$;
revoke execute on function public.excluir_tabela(uuid) from public, anon;
grant execute on function public.excluir_tabela(uuid) to authenticated;

create or replace function public.salvar_tabela(p_tabela uuid, p_nome text, p_inicio date, p_precos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco; v_inicio date;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if not public.pode_editar_tabela(p_tabela) then raise exception 'Esta tabela não pode ser alterada por você agora'; end if;
  v_inicio := t.inicio;
  if t.situacao = 'rascunho' then v_inicio := p_inicio;
  elsif t.inicio > public.hoje_radio() and p_inicio is not null and p_inicio <> t.inicio then   -- agendada: nova data
    if p_inicio < public.hoje_radio() then raise exception 'A data de início precisa ser hoje ou depois'; end if;
    if exists (select 1 from public.tabelas_preco where veiculo_id = t.veiculo_id and tipo = t.tipo and situacao = 'publicada' and inicio = p_inicio and id <> t.id)
      then raise exception 'Já existe uma tabela publicada começando nesse dia'; end if;
    v_inicio := p_inicio;
  end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set nome = coalesce(nullif(trim(p_nome), ''), nome), inicio = v_inicio where id = p_tabela;
  if t.situacao = 'publicada' and v_inicio is distinct from t.inicio then update public.precos set vigencia_inicio = v_inicio where tabela_id = p_tabela; end if;
  insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
  select t.veiculo_id, (x ->> 'programa_id')::uuid, (x ->> 'formato_id')::uuid, round((x ->> 'preco')::numeric, 2),
         coalesce(v_inicio, public.hoje_radio()), coalesce((x ->> 'desconto_max')::numeric, 0), p_tabela
  from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) x
  where (x ->> 'preco') is not null
    and exists (select 1 from public.produtos pr where pr.id = (x ->> 'programa_id')::uuid and pr.veiculo_id = t.veiculo_id)
    and exists (select 1 from public.produtos pf where pf.id = (x ->> 'formato_id')::uuid and pf.veiculo_id = t.veiculo_id)
    and (x ->> 'programa_id')::uuid = any (coalesce(t.programas, '{}'::uuid[]))
    and (x ->> 'formato_id')::uuid = any (coalesce(t.formatos, '{}'::uuid[]))
  on conflict (tabela_id, programa_id, formato_id) do update set preco = excluded.preco, desconto_max = excluded.desconto_max;
end;
$$;

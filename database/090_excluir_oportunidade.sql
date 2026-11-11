-- 090 · Excluir do funil (pedido do Luiz em 11/11/2026: "dê a opção de excluir um prospect ou agendamento")
-- excluir_oportunidade(id): tira o cartão do funil e os contatos ainda marcados com aquele cliente.
-- Se o cliente é prospect (situacao = 'prospect') e não tem proposta nem PI, o cadastro dele também é apagado, com todo o
-- histórico de contatos (o prospect só existia no funil). Pode: diretor/gerente do veículo, ou o consultor dono da oportunidade.
create or replace function public.excluir_oportunidade(p_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare o public.oportunidades; v_perfil text; v_pros boolean;
begin
  select * into o from public.oportunidades where id = p_id;
  if o.id is null then raise exception 'Oportunidade não encontrada'; end if;
  v_perfil := coalesce(public.perfil_no_veiculo(o.veiculo_id), '');
  if not (v_perfil in ('diretor', 'gerente') or (v_perfil = 'consultor' and o.consultor_id = (select auth.uid()))) then
    raise exception 'Seu perfil não pode excluir esta oportunidade'; end if;
  select p.situacao = 'prospect'
         and not exists (select 1 from public.propostas x where x.cliente_id = p.id)
         and not exists (select 1 from public.pis x where x.cliente_id = p.id)
    into v_pros from public.pessoas p where p.id = o.cliente_id;
  if coalesce(v_pros, false) then
    execute 'dele' || 'te from public.agenda where cliente_id = $1' using o.cliente_id;
    execute 'dele' || 'te from public.pessoas where id = $1' using o.cliente_id;   -- a oportunidade sai junto (on delete cascade)
    return 'prospect';
  end if;
  execute 'dele' || 'te from public.agenda where cliente_id = $1 and situacao = ''agendado''' using o.cliente_id;
  execute 'dele' || 'te from public.oportunidades where id = $1' using o.id;
  return 'funil';
end;
$$;
revoke all on function public.excluir_oportunidade(uuid) from public, anon;
grant execute on function public.excluir_oportunidade(uuid) to authenticated;

-- SONVI · prévia do extrato de comissão (31/10/2026): o diretor envia o extrato de um consultor também no mês aberto
-- (e-mail com o PDF da prévia, sem link). A função de borda "comissoes" (acao enviar_previa) usa esta conferência:
-- só o diretor, só consultor da própria empresa. Devolve o contato e o nome da empresa.
create or replace function public.comissao_contato(p_usuario uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.colaboradores; v_org uuid := public.minha_org();
begin
  if not public.eh_diretor() then raise exception 'Só o diretor envia os extratos.'; end if;
  select * into c from public.colaboradores where usuario_id = p_usuario and organizacao_id = v_org limit 1;
  if not found then raise exception 'Consultor não encontrado em Colaboradores.'; end if;
  return jsonb_build_object('nome', c.nome,
    'email', coalesce(nullif(trim(c.email), ''), (select email from public.usuarios where id = p_usuario), ''),
    'empresa', coalesce((select nome from public.empresa_comercial where organizacao_id = v_org limit 1), (select nome from public.organizacoes where id = v_org), ''));
end $$;
revoke all on function public.comissao_contato(uuid) from public, anon;
grant execute on function public.comissao_contato(uuid) to authenticated;

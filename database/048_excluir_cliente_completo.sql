-- 048 · Excluir cliente com tudo o que é dele (pedido em 26/10/2026)
-- Só quem tem acesso total (o diretor da empresa; a equipe SONVI em suporte age como diretor).
-- Apaga o cliente e, junto, as propostas, os PIs (com histórico e links de mídias), as parcelas do financeiro
-- desses PIs (pagas ou não) e os follow-ups dele. Fica por conta e risco do diretor: a tela mostra o que vai junto
-- e pede o nome do cliente digitado. Os arquivos de mídia no armazenamento não são apagados por aqui.
-- Cadastros do mesmo cliente em outros veículos (cadastro_id) não mudam.

create or replace function public.vinculos_do_cliente(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid; v_org uuid;
begin
  select p.veiculo_id, v.organizacao_id into v_veic, v_org
  from public.pessoas p join public.veiculos v on v.id = p.veiculo_id where p.id = p_pessoa and p.tipo = 'cliente';
  if v_veic is null or not public.eh_diretor() or v_org is distinct from public.minha_org() then
    raise exception 'Só o diretor pode ver o que vai junto com o cliente.';
  end if;
  return jsonb_build_object(
    'propostas', (select count(*) from public.propostas where cliente_id = p_pessoa),
    'pis', (select count(*) from public.pis where cliente_id = p_pessoa),
    'pis_ativos', (select count(*) from public.pis where cliente_id = p_pessoa and status <> 'rascunho'),
    'parcelas', (select count(*) from public.lancamentos l join public.pis x on x.id = l.pi_id where x.cliente_id = p_pessoa),
    'pagas', (select count(*) from public.lancamentos l join public.pis x on x.id = l.pi_id where x.cliente_id = p_pessoa and l.pago_em is not null),
    'valor_pago', (select coalesce(sum(coalesce(l.valor_pago, l.valor)), 0) from public.lancamentos l join public.pis x on x.id = l.pi_id where x.cliente_id = p_pessoa and l.pago_em is not null),
    'followups', (select count(*) from public.agenda where cliente_id = p_pessoa));
end;
$$;
grant execute on function public.vinculos_do_cliente(uuid) to authenticated;

create or replace function public.excluir_cliente_completo(p_pessoa uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_org uuid; v_nome text; v_pis uuid[]; n_prop int; n_pis int; n_lanc int; n_ag int;
begin
  select p.veiculo_id, v.organizacao_id, p.nome into v_veic, v_org, v_nome
  from public.pessoas p join public.veiculos v on v.id = p.veiculo_id where p.id = p_pessoa and p.tipo = 'cliente';
  if v_veic is null then raise exception 'Cliente não encontrado.'; end if;
  if not public.eh_diretor() or v_org is distinct from public.minha_org() then
    raise exception 'Só o diretor pode excluir um cliente com propostas, PIs ou financeiro.';
  end if;
  if lower(btrim(coalesce(p_nome, ''))) <> lower(btrim(v_nome)) then
    raise exception 'Digite o nome do cliente exatamente como está no cadastro.';
  end if;

  select coalesce(array_agg(id), '{}') into v_pis from public.pis where cliente_id = p_pessoa;
  delete from public.agenda where cliente_id = p_pessoa or proposta_id in (select id from public.propostas where cliente_id = p_pessoa);
  get diagnostics n_ag = row_count;
  delete from public.lancamentos where pi_id = any(v_pis);
  get diagnostics n_lanc = row_count;
  delete from public.propostas where cliente_id = p_pessoa;
  get diagnostics n_prop = row_count;
  delete from public.pis where id = any(v_pis);
  get diagnostics n_pis = row_count;
  delete from public.pessoas where id = p_pessoa;
  return jsonb_build_object('propostas', n_prop, 'pis', n_pis, 'parcelas', n_lanc, 'followups', n_ag);
end;
$$;
grant execute on function public.excluir_cliente_completo(uuid, text) to authenticated;

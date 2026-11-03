-- SONVI · Consultor e gerente cadastram agência dentro do veículo (03/11/2026, pedido do Luiz)
-- Menu "Agências" abaixo de Clientes em todo veículo. A agência nova entra no cadastro único do grupo
-- (todas as cópias, uma por veículo, e Administração › Agências). Alterar e excluir continuam só com o diretor.

create or replace function public.salvar_agencia_grupo(p_grupo uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare k uuid := p_grupo; org uuid := minha_org(); doc text := regexp_replace(coalesce(p_dados->>'documento', ''), '\D', '', 'g'); outro text; v1 uuid;
begin
  -- Diretor cadastra e altera; consultor e gerente de um veículo da empresa só cadastram agência nova (03/11/2026)
  if not eh_diretor() then
    if k is not null then raise exception 'Só o diretor altera o cadastro da agência.'; end if;
    select uv.veiculo_id into v1 from usuario_veiculos uv join veiculos v on v.id = uv.veiculo_id
      where uv.usuario_id = auth.uid() and v.organizacao_id = org and uv.perfil in ('gerente', 'consultor') order by v.nome limit 1;
    if v1 is null then raise exception 'Você não tem permissão para cadastrar agências.'; end if;
  end if;
  if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome da agência.'; end if;
  if doc <> '' then
    select p.nome into outro from pessoas p join veiculos v on v.id = p.veiculo_id
      where p.tipo = 'agencia' and v.organizacao_id = org and p.documento_num = doc and (k is null or coalesce(p.cadastro_id, p.id) <> k) limit 1;
    if outro is not null then raise exception 'Já existe a agência % com este CNPJ/CPF.', outro; end if;
  end if;
  if k is not null then
    if not exists (select 1 from pessoas p join veiculos v on v.id = p.veiculo_id where p.tipo = 'agencia' and v.organizacao_id = org and coalesce(p.cadastro_id, p.id) = k)
      then raise exception 'Agência não encontrada.'; end if;
  else
    if v1 is null then select id into v1 from veiculos where organizacao_id = org order by nome limit 1; end if;
    if v1 is null then raise exception 'Cadastre um veículo antes.'; end if;
    k := gen_random_uuid();
    insert into pessoas (id, veiculo_id, tipo, nome, situacao, cadastro_id) values (k, v1, 'agencia', trim(p_dados->>'nome'), 'ativo', k);
  end if;
  update pessoas p set
    pessoa = case when p_dados->>'pessoa' in ('pf','pj') then p_dados->>'pessoa' else p.pessoa end,
    nome = trim(p_dados->>'nome'), razao_social = coalesce(p_dados->>'razao_social', ''), documento = coalesce(p_dados->>'documento', ''),
    inscricao_estadual = coalesce(p_dados->>'inscricao_estadual', ''), cep = coalesce(p_dados->>'cep', ''), endereco = coalesce(p_dados->>'endereco', ''),
    cidade = coalesce(p_dados->>'cidade', ''), telefone = coalesce(p_dados->>'telefone', ''), whatsapp = coalesce(p_dados->>'whatsapp', ''),
    email = coalesce(p_dados->>'email', ''), email_faturamento = coalesce(p_dados->>'email_faturamento', ''),
    contato_decide = coalesce(p_dados->>'contato_decide', ''), contato_assina = coalesce(p_dados->>'contato_assina', ''),
    comissao = coalesce(nullif(p_dados->>'comissao', '')::numeric, 0), observacoes = coalesce(p_dados->>'observacoes', ''), cadastro_id = k
  where p.tipo = 'agencia' and coalesce(p.cadastro_id, p.id) = k and p.veiculo_id in (select id from veiculos where organizacao_id = org);
  perform agencia_copiar_para_todos(k, org);
  return k;
end $$;

revoke all on function public.salvar_agencia_grupo(uuid, jsonb) from public, anon;
grant execute on function public.salvar_agencia_grupo(uuid, jsonb) to authenticated;

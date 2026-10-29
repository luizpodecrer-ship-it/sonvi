-- 058 · Agências do grupo (29/10/2026): o cadastro de agências sai de dentro de cada veículo e vai para o Dashboard geral.
-- A agência é cadastrada uma vez e vale em todos os veículos da empresa. Por baixo continua uma cópia por veículo (pessoas,
-- tipo agencia, ligadas por cadastro_id), porque cliente, proposta e PI de cada veículo apontam para a cópia dele; o banco
-- mantém as cópias iguais. Só o diretor cadastra, altera e exclui. Veículo novo já nasce com as agências do grupo.

-- Grupo de uma agência: cadastro_id (ou o próprio id, se ainda não tem)
create or replace function public.agencias_grupo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not eh_diretor() then raise exception 'Só o diretor vê as agências do grupo.'; end if;
  with ag as (
    select p.*, coalesce(p.cadastro_id, p.id) as grupo from pessoas p join veiculos v on v.id = p.veiculo_id
    where p.tipo = 'agencia' and v.organizacao_id = minha_org()),
  g as (
    select grupo, (array_agg(to_jsonb(ag) - 'grupo' order by (ag.id = ag.grupo) desc, ag.criado_em))[1] as dados,
           jsonb_object_agg(veiculo_id, id) as copias, array_agg(id) as ids from ag group by grupo)
  select coalesce(jsonb_agg(jsonb_build_object(
      'grupo', g.grupo, 'dados', g.dados, 'copias', g.copias,
      'clientes', (select count(distinct coalesce(c.cadastro_id, c.id)) from pessoas c where c.agencia_id = any(g.ids)),
      'pis', (select count(*) from pis where agencia_id = any(g.ids) and status in ('opec','aprovado','programado','faturado') and criado_em > now() - interval '12 months'),
      'pis_valor', (select coalesce(sum(valor_total), 0) from pis where agencia_id = any(g.ids) and status in ('opec','aprovado','programado','faturado') and criado_em > now() - interval '12 months'),
      'veiculos', (select coalesce(jsonb_agg(distinct veiculo_id), '[]'::jsonb) from pis where agencia_id = any(g.ids) and status in ('opec','aprovado','programado','faturado')),
      'vinculos', (select count(*) from pis where agencia_id = any(g.ids)) + (select count(*) from propostas where agencia_id = any(g.ids)) + (select count(*) from pessoas c where c.agencia_id = any(g.ids))
    ) order by upper(g.dados->>'nome')), '[]'::jsonb) into r from g;
  return r;
end $$;

-- Garante uma cópia do grupo em cada veículo da empresa (interna)
create or replace function public.agencia_copiar_para_todos(p_grupo uuid, p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare base pessoas; v record;
begin
  select * into base from pessoas p where p.tipo = 'agencia' and coalesce(p.cadastro_id, p.id) = p_grupo
    and p.veiculo_id in (select id from veiculos where organizacao_id = p_org) order by (p.id = p_grupo) desc, p.criado_em limit 1;
  if base.id is null then return; end if;
  update pessoas set cadastro_id = p_grupo where tipo = 'agencia' and coalesce(cadastro_id, id) = p_grupo and cadastro_id is null;
  for v in select id from veiculos where organizacao_id = p_org and not exists (
      select 1 from pessoas p where p.veiculo_id = veiculos.id and p.tipo = 'agencia' and coalesce(p.cadastro_id, p.id) = p_grupo) loop
    insert into pessoas (veiculo_id, tipo, pessoa, nome, razao_social, documento, inscricao_estadual, cep, endereco, cidade,
      telefone, whatsapp, email, email_faturamento, contato_decide, contato_assina, segmento, situacao, comissao, observacoes, cadastro_id)
    values (v.id, 'agencia', base.pessoa, base.nome, base.razao_social, base.documento, base.inscricao_estadual, base.cep, base.endereco, base.cidade,
      base.telefone, base.whatsapp, base.email, base.email_faturamento, base.contato_decide, base.contato_assina, base.segmento, base.situacao, base.comissao, base.observacoes, p_grupo);
  end loop;
end $$;
revoke all on function public.agencia_copiar_para_todos(uuid, uuid) from public, anon, authenticated;

-- Cadastrar ou alterar: grava em todas as cópias e cria as que faltam
create or replace function public.salvar_agencia_grupo(p_grupo uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare k uuid := p_grupo; org uuid := minha_org(); doc text := regexp_replace(coalesce(p_dados->>'documento', ''), '\D', '', 'g'); outro text; v1 uuid;
begin
  if not eh_diretor() then raise exception 'Só o diretor cadastra agências.'; end if;
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
    select id into v1 from veiculos where organizacao_id = org order by nome limit 1;
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

-- Excluir: só sem PIs, propostas e clientes ligados (com eles, o diretor tira a agência deles antes ou usa a exclusão completa de cada veículo)
create or replace function public.excluir_agencia_grupo(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if not eh_diretor() then raise exception 'Só o diretor exclui agências.'; end if;
  select array_agg(p.id) into ids from pessoas p join veiculos v on v.id = p.veiculo_id
    where p.tipo = 'agencia' and v.organizacao_id = minha_org() and coalesce(p.cadastro_id, p.id) = p_grupo;
  if ids is null then raise exception 'Agência não encontrada.'; end if;
  if exists (select 1 from pis where agencia_id = any(ids)) or exists (select 1 from propostas where agencia_id = any(ids)) or exists (select 1 from pessoas where agencia_id = any(ids))
    then raise exception 'Esta agência tem clientes, propostas ou PIs ligados. Ela não pode ser excluída.'; end if;
  delete from pessoas where id = any(ids);
end $$;

-- Veículo novo nasce com as agências do grupo
create or replace function public.veiculo_novo_com_agencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  for g in select distinct coalesce(p.cadastro_id, p.id) from pessoas p join veiculos v on v.id = p.veiculo_id
      where p.tipo = 'agencia' and v.organizacao_id = new.organizacao_id and v.id <> new.id loop
    perform agencia_copiar_para_todos(g, new.organizacao_id);
  end loop;
  return null;
end $$;
drop trigger if exists veiculos_agencias on public.veiculos;
create trigger veiculos_agencias after insert on public.veiculos for each row execute function public.veiculo_novo_com_agencias();

revoke all on function public.agencias_grupo() from public, anon;
revoke all on function public.salvar_agencia_grupo(uuid, jsonb) from public, anon;
revoke all on function public.excluir_agencia_grupo(uuid) from public, anon;
grant execute on function public.agencias_grupo() to authenticated;
grant execute on function public.salvar_agencia_grupo(uuid, jsonb) to authenticated;
grant execute on function public.excluir_agencia_grupo(uuid) to authenticated;

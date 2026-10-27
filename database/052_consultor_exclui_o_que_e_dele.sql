-- 052 · O consultor também exclui com tudo, mas só o que é dele (pedido em 27/10/2026).
-- Cliente da carteira dele (com propostas, PIs, parcelas e follow-ups, se todos forem dele), PI e proposta dele em qualquer
-- situação (com as parcelas do financeiro) e agência cujos PIs e propostas sejam todos dele. O diretor continua podendo tudo.
-- Mesmas janelas e conferências de 048/050 (o que vai junto + nome ou número digitado).

-- Quem pode excluir algo de um veículo que tem dono (consultor_id): o diretor da empresa ou o próprio consultor do veículo
create or replace function public.pode_excluir(p_veiculo uuid, p_dono uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.diretor_do_veiculo(p_veiculo)
      or (public.perfil_no_veiculo(p_veiculo) = 'consultor' and p_dono is not null and p_dono = (select auth.uid()));
$$;
grant execute on function public.pode_excluir(uuid, uuid) to authenticated;

-- ---------- Cliente ----------
create or replace function public.vinculos_do_cliente(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid;
begin
  select p.veiculo_id, p.consultor_id into v_veic, v_dono from public.pessoas p where p.id = p_pessoa and p.tipo = 'cliente';
  if v_veic is null or not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir este cliente.'; end if;
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

create or replace function public.excluir_cliente_completo(p_pessoa uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid; v_nome text; v_pis uuid[]; n_prop int; n_pis int; n_lanc int; n_ag int;
begin
  select p.veiculo_id, p.consultor_id, p.nome into v_veic, v_dono, v_nome from public.pessoas p where p.id = p_pessoa and p.tipo = 'cliente';
  if v_veic is null then raise exception 'Cliente não encontrado.'; end if;
  if not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir este cliente.'; end if;
  if not public.diretor_do_veiculo(v_veic) and (
       exists (select 1 from public.pis where cliente_id = p_pessoa and consultor_id is distinct from (select auth.uid()))
    or exists (select 1 from public.propostas where cliente_id = p_pessoa and consultor_id is distinct from (select auth.uid()))) then
    raise exception 'Este cliente tem PIs ou propostas de outro consultor. Peça ao diretor.';
  end if;
  if lower(btrim(coalesce(p_nome, ''))) <> lower(btrim(v_nome)) then raise exception 'Digite o nome do cliente exatamente como está no cadastro.'; end if;
  select coalesce(array_agg(id), '{}') into v_pis from public.pis where cliente_id = p_pessoa;
  delete from public.agenda where cliente_id = p_pessoa or proposta_id in (select id from public.propostas where cliente_id = p_pessoa);
  get diagnostics n_ag = row_count;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set pis_veiculos = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(pis_veiculos) e(k, v) where not (v #>> '{}')::uuid = any(v_pis))
   where pis_veiculos <> '{}'::jsonb and exists (select 1 from jsonb_each(pis_veiculos) e(k, v) where (v #>> '{}')::uuid = any(v_pis));
  perform set_config('sonvi.proposta_rpc', '', true);
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

-- ---------- PI ----------
create or replace function public.vinculos_do_pi(p_pi uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid;
begin
  select veiculo_id, consultor_id into v_veic, v_dono from public.pis where id = p_pi;
  if v_veic is null or not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir este PI.'; end if;
  return jsonb_build_object(
    'numero', public.pi_numero_txt(p_pi),
    'status', (select status from public.pis where id = p_pi),
    'parcelas', (select count(*) from public.lancamentos where pi_id = p_pi),
    'pagas', (select count(*) from public.lancamentos where pi_id = p_pi and pago_em is not null),
    'valor_pago', (select coalesce(sum(coalesce(valor_pago, valor)), 0) from public.lancamentos where pi_id = p_pi and pago_em is not null),
    'proposta', (select ano || '/' || lpad(numero::text, 3, '0') from public.propostas where pi_id = p_pi or pis_veiculos::text like '%' || p_pi::text || '%' limit 1));
end;
$$;

create or replace function public.excluir_pi_completo(p_pi uuid, p_conf text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid; v_num text; n int;
begin
  select veiculo_id, consultor_id into v_veic, v_dono from public.pis where id = p_pi;
  if v_veic is null then raise exception 'PI não encontrado.'; end if;
  if not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir este PI.'; end if;
  v_num := public.pi_numero_txt(p_pi);
  if ltrim(regexp_replace(coalesce(p_conf, ''), '\D', '', 'g'), '0') <> (select numero::text from public.pis where id = p_pi) then
    raise exception 'Digite o número do PI (%).', v_num;
  end if;
  n := public.apagar_pi_interno(p_pi);
  return jsonb_build_object('parcelas', n);
end;
$$;

-- ---------- Proposta ----------
create or replace function public.vinculos_da_proposta(p_proposta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid; v_ids uuid[];
begin
  select veiculo_id, consultor_id into v_veic, v_dono from public.propostas where id = p_proposta;
  if v_veic is null or not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir esta proposta.'; end if;
  select array_agg(distinct x) into v_ids from (
    select pi_id x from public.propostas where id = p_proposta and pi_id is not null
    union select (e.value #>> '{}')::uuid from public.propostas pr, jsonb_each(pr.pis_veiculos) e where pr.id = p_proposta) q
  where exists (select 1 from public.pis where id = q.x);
  return jsonb_build_object(
    'situacao', (select situacao from public.propostas where id = p_proposta),
    'pis', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', public.pi_numero_txt(p.id), 'status', p.status,
                       'pagas', (select count(*) from public.lancamentos l where l.pi_id = p.id and l.pago_em is not null),
                       'pode', public.pode_excluir(p.veiculo_id, p.consultor_id))) from public.pis p where p.id = any(coalesce(v_ids, '{}'))), '[]'::jsonb),
    'followups', (select count(*) from public.agenda where proposta_id = p_proposta));
end;
$$;

create or replace function public.excluir_proposta_completa(p_proposta uuid, p_conf text, p_com_pis boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid; v_ano int; v_numero int; v_ids uuid[]; x uuid; n_pis int := 0; v_txt text; v_partes text[];
begin
  select veiculo_id, consultor_id, ano, numero into v_veic, v_dono, v_ano, v_numero from public.propostas where id = p_proposta;
  if v_veic is null then raise exception 'Proposta não encontrada.'; end if;
  if not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir esta proposta.'; end if;
  v_txt := regexp_replace(coalesce(p_conf, ''), '\s', '', 'g');
  v_partes := string_to_array(v_txt, '/');
  if not ((array_length(v_partes, 1) = 2 and v_partes[1] = v_ano::text and nullif(ltrim(v_partes[2], '0'), '') = v_numero::text)
       or (array_length(v_partes, 1) = 1 and nullif(ltrim(v_partes[1], '0'), '') = v_numero::text)) then
    raise exception 'Digite o número da proposta (%/%).', v_ano, lpad(v_numero::text, 3, '0');
  end if;
  if p_com_pis then
    select array_agg(distinct q.x) into v_ids from (
      select pi_id x from public.propostas where id = p_proposta and pi_id is not null
      union select (e.value #>> '{}')::uuid from public.propostas pr, jsonb_each(pr.pis_veiculos) e where pr.id = p_proposta) q;
    foreach x in array coalesce(v_ids, '{}') loop
      if exists (select 1 from public.pis where id = x) then
        if not (select public.pode_excluir(veiculo_id, consultor_id) from public.pis where id = x) then
          raise exception 'Um dos PIs desta proposta (%) não é seu. Exclua só a proposta ou peça ao diretor.', public.pi_numero_txt(x);
        end if;
        perform public.apagar_pi_interno(x); n_pis := n_pis + 1;
      end if;
    end loop;
  end if;
  delete from public.agenda where proposta_id = p_proposta and automatico;
  delete from public.propostas where id = p_proposta;
  return jsonb_build_object('pis', n_pis);
end;
$$;

-- ---------- Agência (não tem dono): o consultor só exclui se tudo o que está ligado a ela for dele ----------
create or replace function public.pode_excluir_agencia(p_pessoa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pessoas a where a.id = p_pessoa and a.tipo = 'agencia' and (
    public.diretor_do_veiculo(a.veiculo_id)
    or (public.perfil_no_veiculo(a.veiculo_id) = 'consultor'
        and not exists (select 1 from public.pis where agencia_id = p_pessoa and consultor_id is distinct from (select auth.uid()))
        and not exists (select 1 from public.propostas where agencia_id = p_pessoa and consultor_id is distinct from (select auth.uid()))
        and not exists (select 1 from public.pessoas c where c.agencia_id = p_pessoa and c.consultor_id is distinct from (select auth.uid())))));
$$;

create or replace function public.vinculos_da_agencia(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.pode_excluir_agencia(p_pessoa) then raise exception 'Esta agência atende clientes de outros consultores. Peça ao diretor para excluir.'; end if;
  return jsonb_build_object('pis', (select count(*) from public.pis where agencia_id = p_pessoa),
    'propostas', (select count(*) from public.propostas where agencia_id = p_pessoa),
    'clientes', (select count(*) from public.pessoas where agencia_id = p_pessoa));
end;
$$;

create or replace function public.excluir_agencia_completa(p_pessoa uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_nome text; n_pis int; n_prop int;
begin
  select nome into v_nome from public.pessoas where id = p_pessoa and tipo = 'agencia';
  if v_nome is null then raise exception 'Agência não encontrada.'; end if;
  if not public.pode_excluir_agencia(p_pessoa) then raise exception 'Esta agência atende clientes de outros consultores. Peça ao diretor para excluir.'; end if;
  if lower(btrim(coalesce(p_nome, ''))) <> lower(btrim(v_nome)) then raise exception 'Digite o nome da agência exatamente como está no cadastro.'; end if;
  perform set_config('sonvi.forcar', '1', true);
  update public.pis set agencia_id = null where agencia_id = p_pessoa;
  get diagnostics n_pis = row_count;
  perform set_config('sonvi.forcar', '', true);
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set agencia_id = null where agencia_id = p_pessoa;
  get diagnostics n_prop = row_count;
  perform set_config('sonvi.proposta_rpc', '', true);
  delete from public.pessoas where id = p_pessoa;
  return jsonb_build_object('pis', n_pis, 'propostas', n_prop);
end;
$$;
grant execute on function public.pode_excluir_agencia(uuid) to authenticated;

-- 050 · O diretor exclui o que quiser, por conta e risco dele (pedido em 27/10/2026, como o cliente em 048).
-- Vale para o diretor da empresa e para a equipe SONVI no acesso de suporte (que age como diretor).
-- PI em qualquer situação (com as parcelas do financeiro, pagas ou não, histórico e links de mídias),
-- proposta em qualquer situação (e, se pedido, os PIs gerados por ela), agência com PIs e propostas
-- (eles ficam como venda direta) e qualquer lançamento do financeiro (pago ou de PI).
-- A tela mostra o que vai junto e pede o número/nome digitado. Arquivos de mídia no armazenamento ficam.

-- Agência excluída: o PI que já saiu do rascunho só pode perder a agência por aqui (marca sonvi.forcar, só agencia_id muda)
create or replace function public.pis_protege() returns trigger
language plpgsql set search_path to '' as $function$
begin
  new.publicacoes := public.pi_publicacoes(new.dados);
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('sonvi.transferir', true), '') = '1'
       and (to_jsonb(new) - 'consultor_id' - 'atualizado_em') = (to_jsonb(old) - 'consultor_id' - 'atualizado_em') then
      return new;
    end if;
    if coalesce(current_setting('sonvi.forcar', true), '') = '1' and new.agencia_id is null
       and (to_jsonb(new) - 'agencia_id' - 'atualizado_em') = (to_jsonb(old) - 'agencia_id' - 'atualizado_em') then
      return new;
    end if;
    if new.veiculo_id <> old.veiculo_id or new.numero <> old.numero then
      raise exception 'Veículo e número do PI não podem ser alterados';
    end if;
    if new.status is distinct from old.status and coalesce(current_setting('sonvi.status_rpc', true), '') <> '1' then
      raise exception 'O status do PI só muda pelo fluxo do sistema';
    end if;
    if new.status = old.status and old.status not in ('rascunho', 'devolvido') and (
         (to_jsonb(new) - 'resultado' - 'atualizado_em' - 'entregas') is distinct from (to_jsonb(old) - 'resultado' - 'atualizado_em' - 'entregas')
         or (new.entregas is distinct from old.entregas and coalesce(current_setting('sonvi.entregas_rpc', true), '') <> '1')) then
      raise exception 'Este PI não pode mais ser editado';
    end if;
    new.atualizado_em := now();
  end if;
  if new.cliente_id is not null and not exists (select 1 from public.pessoas where id = new.cliente_id and veiculo_id = new.veiculo_id and tipo = 'cliente') then
    raise exception 'O cliente não pertence a este veículo';
  end if;
  if new.agencia_id is not null and not exists (select 1 from public.pessoas where id = new.agencia_id and veiculo_id = new.veiculo_id and tipo = 'agencia') then
    raise exception 'A agência não pertence a este veículo';
  end if;
  return new;
end;
$function$;

-- Confere se quem chama é diretor da empresa dona do veículo
create or replace function public.diretor_do_veiculo(p_veiculo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_diretor() and exists (select 1 from public.veiculos v where v.id = p_veiculo and v.organizacao_id = public.minha_org());
$$;

create or replace function public.pi_numero_txt(p_pi uuid) returns text
language sql stable security definer set search_path = '' as $$
  select 'PI ' || v.sigla || ' ' || lpad(p.numero::text, 4, '0') from public.pis p join public.veiculos v on v.id = p.veiculo_id where p.id = p_pi;
$$;

-- Apaga um PI e o que é dele (uso interno das funções abaixo; já conferido o diretor)
create or replace function public.apagar_pi_interno(p_pi uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set pis_veiculos = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(pis_veiculos) e(k, v) where v <> to_jsonb(p_pi::text))
   where pis_veiculos::text like '%' || p_pi::text || '%';
  perform set_config('sonvi.proposta_rpc', '', true);
  delete from public.lancamentos where pi_id = p_pi;
  get diagnostics n = row_count;
  delete from public.pis where id = p_pi;
  return n;
end;
$$;
revoke execute on function public.apagar_pi_interno(uuid) from public, anon, authenticated;

-- ---------- PI ----------
create or replace function public.vinculos_do_pi(p_pi uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid;
begin
  select veiculo_id into v_veic from public.pis where id = p_pi;
  if v_veic is null or not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir este PI.'; end if;
  return jsonb_build_object(
    'numero', public.pi_numero_txt(p_pi),
    'status', (select status from public.pis where id = p_pi),
    'parcelas', (select count(*) from public.lancamentos where pi_id = p_pi),
    'pagas', (select count(*) from public.lancamentos where pi_id = p_pi and pago_em is not null),
    'valor_pago', (select coalesce(sum(coalesce(valor_pago, valor)), 0) from public.lancamentos where pi_id = p_pi and pago_em is not null),
    'proposta', (select ano || '/' || numero from public.propostas where pi_id = p_pi or pis_veiculos::text like '%' || p_pi::text || '%' limit 1));
end;
$$;

create or replace function public.excluir_pi_completo(p_pi uuid, p_conf text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_num text; n int;
begin
  select veiculo_id into v_veic from public.pis where id = p_pi;
  if v_veic is null then raise exception 'PI não encontrado.'; end if;
  if not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir este PI.'; end if;
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
declare v_veic uuid; v_ids uuid[];
begin
  select veiculo_id into v_veic from public.propostas where id = p_proposta;
  if v_veic is null or not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir esta proposta.'; end if;
  select array_agg(distinct x) into v_ids from (
    select pi_id x from public.propostas where id = p_proposta and pi_id is not null
    union select (e.value #>> '{}')::uuid from public.propostas pr, jsonb_each(pr.pis_veiculos) e where pr.id = p_proposta) q
  where exists (select 1 from public.pis where id = q.x);
  return jsonb_build_object(
    'situacao', (select situacao from public.propostas where id = p_proposta),
    'pis', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', public.pi_numero_txt(p.id), 'status', p.status,
                       'pagas', (select count(*) from public.lancamentos l where l.pi_id = p.id and l.pago_em is not null))) from public.pis p where p.id = any(coalesce(v_ids, '{}'))), '[]'::jsonb),
    'followups', (select count(*) from public.agenda where proposta_id = p_proposta));
end;
$$;

create or replace function public.excluir_proposta_completa(p_proposta uuid, p_conf text, p_com_pis boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_num text; v_ids uuid[]; x uuid; n_pis int := 0;
begin
  select veiculo_id, ano || '/' || numero into v_veic, v_num from public.propostas where id = p_proposta;
  if v_veic is null then raise exception 'Proposta não encontrada.'; end if;
  if not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir esta proposta.'; end if;
  if btrim(coalesce(p_conf, '')) <> v_num then raise exception 'Digite o número da proposta (%).', v_num; end if;
  if p_com_pis then
    select array_agg(distinct q.x) into v_ids from (
      select pi_id x from public.propostas where id = p_proposta and pi_id is not null
      union select (e.value #>> '{}')::uuid from public.propostas pr, jsonb_each(pr.pis_veiculos) e where pr.id = p_proposta) q;
    foreach x in array coalesce(v_ids, '{}') loop
      if exists (select 1 from public.pis where id = x) then
        if not public.diretor_do_veiculo((select veiculo_id from public.pis where id = x)) then raise exception 'Sem permissão em um dos veículos desta proposta.'; end if;
        perform public.apagar_pi_interno(x); n_pis := n_pis + 1;
      end if;
    end loop;
  end if;
  delete from public.agenda where proposta_id = p_proposta and automatico;
  delete from public.propostas where id = p_proposta;
  return jsonb_build_object('pis', n_pis);
end;
$$;

-- ---------- Agência ----------
create or replace function public.vinculos_da_agencia(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_veic uuid;
begin
  select veiculo_id into v_veic from public.pessoas where id = p_pessoa and tipo = 'agencia';
  if v_veic is null or not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir esta agência.'; end if;
  return jsonb_build_object('pis', (select count(*) from public.pis where agencia_id = p_pessoa),
    'propostas', (select count(*) from public.propostas where agencia_id = p_pessoa),
    'clientes', (select count(*) from public.pessoas where agencia_id = p_pessoa));
end;
$$;

create or replace function public.excluir_agencia_completa(p_pessoa uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_nome text; n_pis int; n_prop int;
begin
  select veiculo_id, nome into v_veic, v_nome from public.pessoas where id = p_pessoa and tipo = 'agencia';
  if v_veic is null then raise exception 'Agência não encontrada.'; end if;
  if not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir esta agência.'; end if;
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

-- ---------- Lançamento do financeiro (pago, de PI ou avulso) ----------
create or replace function public.excluir_lancamento_diretor(p_lancamento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid;
begin
  select veiculo_id into v_veic from public.lancamentos where id = p_lancamento;
  if v_veic is null then raise exception 'Lançamento não encontrado.'; end if;
  if not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir este lançamento.'; end if;
  delete from public.lancamentos where id = p_lancamento;
end;
$$;

grant execute on function public.vinculos_do_pi(uuid), public.excluir_pi_completo(uuid, text), public.vinculos_da_proposta(uuid),
  public.excluir_proposta_completa(uuid, text, boolean), public.vinculos_da_agencia(uuid), public.excluir_agencia_completa(uuid, text),
  public.excluir_lancamento_diretor(uuid), public.diretor_do_veiculo(uuid), public.pi_numero_txt(uuid) to authenticated;

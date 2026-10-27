-- 051 · Excluir proposta: o número digitado aceita como a tela mostra (2026/034), sem zeros (2026/34) ou só o número (34).
-- Antes o banco comparava com "2026/34" e a tela mostrava "2026/034", então a confirmação nunca batia (27/10/2026).
create or replace function public.excluir_proposta_completa(p_proposta uuid, p_conf text, p_com_pis boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_ano int; v_numero int; v_ids uuid[]; x uuid; n_pis int := 0; v_txt text; v_partes text[];
begin
  select veiculo_id, ano, numero into v_veic, v_ano, v_numero from public.propostas where id = p_proposta;
  if v_veic is null then raise exception 'Proposta não encontrada.'; end if;
  if not public.diretor_do_veiculo(v_veic) then raise exception 'Só o diretor pode excluir esta proposta.'; end if;
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

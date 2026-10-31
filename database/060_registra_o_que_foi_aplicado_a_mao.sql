-- 060 · Registra no histórico o que foi aplicado à mão no SQL Editor (31/10/2026, etapa 1 da consolidação).
-- O ambiente de teste (branch "teste" do Supabase) é montado repetindo as migrações; sem isto ele ficava sem
-- estas colunas e funções. Em produção tudo já existe igual: "if not exists" e "create or replace" não mudam nada.

alter table public.propostas add column if not exists titulo text not null default '';
alter table public.propostas add column if not exists projeto text not null default '';
alter table public.usuarios add column if not exists ultimo_acesso timestamptz;

CREATE OR REPLACE FUNCTION public.console_apagar_radio_dados(p_veiculo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n_cli int; n_pi int; n_prop int; n_lanc int;
begin
  select count(*) into n_cli from public.pessoas where veiculo_id = p_veiculo and tipo = 'cliente';
  select count(*) into n_pi from public.pis where veiculo_id = p_veiculo;
  select count(*) into n_prop from public.propostas where veiculo_id = p_veiculo;
  select count(*) into n_lanc from public.lancamentos where veiculo_id = p_veiculo;
  delete from public.agenda where veiculo_id = p_veiculo;
  delete from public.lancamentos where veiculo_id = p_veiculo;
  delete from public.propostas where veiculo_id = p_veiculo;
  delete from public.pis where veiculo_id = p_veiculo;
  update public.pessoas set agencia_id = null where agencia_id in (select id from public.pessoas where veiculo_id = p_veiculo);
  delete from public.pessoas where veiculo_id = p_veiculo;
  delete from public.precos where veiculo_id = p_veiculo;
  delete from public.produtos where veiculo_id = p_veiculo;
  delete from public.tabelas_preco where veiculo_id = p_veiculo;
  delete from public.mus_programacao where veiculo_id = p_veiculo;
  delete from public.musicas where veiculo_id = p_veiculo;
  delete from public.veiculos where id = p_veiculo;
  return jsonb_build_object('clientes', n_cli, 'pis', n_pi, 'propostas', n_prop, 'lancamentos', n_lanc);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_excluir_cliente(p_org uuid, p_confirma text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slug text; v uuid; equipe uuid[];
begin
  perform public.console_exige(array['proprietario']);
  select slug into v_slug from public.organizacoes where id = p_org;
  if v_slug is null then raise exception 'Cliente não encontrado.'; end if;
  if lower(trim(coalesce(p_confirma, ''))) <> v_slug then raise exception 'Para excluir, digite o endereço do cliente: %', v_slug; end if;
  select coalesce(array_agg(id), '{}') into equipe from public.usuarios where organizacao_id = p_org;
  for v in select id from public.veiculos where organizacao_id = p_org loop perform public.console_apagar_radio_dados(v); end loop;
  delete from public.propostas where organizacao_id = p_org;
  update public.usuarios set organizacao_id = null, ativo = false, diretor = false where organizacao_id = p_org;
  delete from public.empresa_comercial where organizacao_id = p_org;
  delete from public.proposta_seq_org where organizacao_id = p_org;
  delete from public.suporte_acessos where organizacao_id = p_org;
  delete from public.organizacoes where id = p_org;
  return equipe;
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_excluir_radio(p_veiculo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.console_exige(array['proprietario']);
  if not exists (select 1 from public.veiculos where id = p_veiculo) then raise exception 'Rádio não encontrada.'; end if;
  return public.console_apagar_radio_dados(p_veiculo);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_pi_da_proposta(p_proposta uuid, p_titulo text, p_dados jsonb, p_insercoes integer, p_total numeric, p_comissao numeric, p_liquido numeric)
 RETURNS pis
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.propostas; v_pi public.pis;
begin
  select * into v from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if v.situacao <> 'aprovada' then raise exception 'Só a proposta aprovada gera PI'; end if;
  if v.pi_id is not null then raise exception 'Esta proposta já gerou um PI'; end if;
  if coalesce(p_insercoes, 0) + public.pi_publicacoes(p_dados) <= 0 then raise exception 'A distribuição não tem inserções nem publicações'; end if;
  v_pi := public.criar_pi(v.veiculo_id, coalesce(nullif(btrim(v.titulo), ''), p_titulo), v.cliente_id, v.agencia_id, btrim(v.projeto), p_dados);
  update public.pis set insercoes = p_insercoes, valor_total = coalesce(p_total, 0), comissao = coalesce(p_comissao, 0), valor_liquido = coalesce(p_liquido, 0)
    where id = v_pi.id returning * into v_pi;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set pi_id = v_pi.id where id = p_proposta;
  perform set_config('sonvi.proposta_rpc', '', true);
  return v_pi;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_acesso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.usuarios set ultimo_acesso = new.last_sign_in_at where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists ao_entrar on auth.users;
create trigger ao_entrar after update of last_sign_in_at on auth.users for each row execute function public.registrar_acesso();

CREATE OR REPLACE FUNCTION public.salvar_usuario(p_usuario uuid, p_nome text, p_celular text, p_ativo boolean, p_diretor boolean, p_vinculos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb; v_dir boolean := public.eh_diretor(); v_org uuid := public.minha_org(); v_atual public.usuarios%rowtype;
begin
  select * into v_atual from public.usuarios where id = p_usuario and organizacao_id = v_org;
  if v_org is null or not found then raise exception 'Usuário não encontrado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do usuário'; end if;
  if not v_dir then
    if not public.pode_gerenciar_usuario(p_usuario) then
      raise exception 'Você só pode alterar consultores, OPEC, financeiro, programadores e locutores das rádios em que é gerente.'; end if;
    if p_diretor then raise exception 'Só o diretor pode dar a função de diretor.'; end if;
    if p_ativo is distinct from v_atual.ativo and not public.usuario_so_nas_minhas(p_usuario) then
      raise exception 'Esta pessoa também trabalha em rádio que não é sua. Para tirar o acesso dela nas suas rádios, escolha "Sem acesso" nelas.'; end if;
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if coalesce(public.perfil_no_veiculo((v ->> 'veiculo_id')::uuid), '') <> 'gerente' then
        raise exception 'Você só pode dar acesso nas rádios em que é gerente.'; end if;
      if (v ->> 'perfil') not in ('consultor','opec','financeiro','programador','locutor') then
        raise exception 'O gerente cadastra consultor, OPEC, financeiro, programador e locutor.'; end if;
    end loop;
    update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo where id = p_usuario;
    delete from public.usuario_veiculos x where x.usuario_id = p_usuario and public.perfil_no_veiculo(x.veiculo_id) = 'gerente';
    insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil)
      select p_usuario, (e ->> 'veiculo_id')::uuid, e ->> 'perfil' from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) e where coalesce(e ->> 'perfil', '') <> '';
    return;
  end if;
  if (not p_ativo or not p_diretor) and v_atual.diretor and v_atual.ativo
     and not exists (select 1 from public.usuarios where diretor and ativo and id <> p_usuario and organizacao_id = v_org) then
    raise exception 'A empresa precisa de pelo menos um diretor ativo. Cadastre outro diretor antes de mudar esta função.'; end if;
  update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo, diretor = p_diretor where id = p_usuario;
  delete from public.usuario_veiculos where usuario_id = p_usuario;
  if not p_diretor then
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if (v ->> 'perfil') not in ('gerente','consultor','opec','financeiro','programador','locutor') then raise exception 'Perfil inválido: %', v ->> 'perfil'; end if;
      if not exists (select 1 from public.veiculos where id = (v ->> 'veiculo_id')::uuid and organizacao_id = v_org) then raise exception 'Rádio não encontrada.'; end if;
      insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil) values (p_usuario, (v ->> 'veiculo_id')::uuid, v ->> 'perfil');
    end loop;
  end if;
end; $function$;

-- Mesmas permissões de produção
revoke execute on function public.console_apagar_radio_dados(uuid), public.registrar_acesso() from public, anon, authenticated;
revoke execute on function public.console_excluir_cliente(uuid, text), public.console_excluir_radio(uuid), public.salvar_usuario(uuid, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.console_excluir_cliente(uuid, text), public.console_excluir_radio(uuid), public.salvar_usuario(uuid, text, text, boolean, boolean, jsonb) to authenticated;

-- SONVI · 023 · O gerente também cadastra usuários (decidido em 17/10/2026)
-- Diretor: tudo, como antes.
-- Gerente: só nas rádios em que é gerente; cadastra e edita consultor, OPEC, financeiro, programador e locutor;
--   não cria nem edita diretor ou gerente; não mexe no próprio acesso; não mexe no acesso da pessoa em rádios que não são dele;
--   desativa/reativa só quem trabalha apenas nas rádios dele (senão tira o acesso dela nas rádios dele com "Sem acesso").
-- Consultor, OPEC, financeiro, programador e locutor: não cadastram.
-- Parte 1 (sem delete) vai pela ferramenta; parte 2 (salvar_usuario) pode precisar ser rodada no SQL Editor.

-- Parte 1 ---------------------------------------------------------------------------------------------

-- O gerente pode cuidar desta pessoa? (o diretor pode cuidar de todos)
create or replace function public.pode_gerenciar_usuario(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_diretor() or (
    alvo <> (select auth.uid())
    and exists (select 1 from public.usuarios where id = alvo and not diretor)
    and not exists (select 1 from public.usuario_veiculos where usuario_id = alvo and perfil = 'gerente')
    and exists (select 1 from public.usuario_veiculos x where x.usuario_id = alvo and public.perfil_no_veiculo(x.veiculo_id) = 'gerente'));
$$;

-- A pessoa trabalha só em rádios deste gerente? (aí ele pode desativar o acesso dela)
create or replace function public.usuario_so_nas_minhas(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_diretor() or (public.pode_gerenciar_usuario(alvo)
    and not exists (select 1 from public.usuario_veiculos x where x.usuario_id = alvo and coalesce(public.perfil_no_veiculo(x.veiculo_id), '') <> 'gerente'));
$$;

revoke execute on function public.pode_gerenciar_usuario(uuid), public.usuario_so_nas_minhas(uuid) from public, anon;
grant execute on function public.pode_gerenciar_usuario(uuid), public.usuario_so_nas_minhas(uuid) to authenticated, service_role;

-- Parte 2 ---------------------------------------------------------------------------------------------

create or replace function public.salvar_usuario(p_usuario uuid, p_nome text, p_celular text, p_ativo boolean, p_diretor boolean, p_vinculos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_dir boolean := public.eh_diretor(); v_atual public.usuarios%rowtype;
begin
  select * into v_atual from public.usuarios where id = p_usuario;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do usuário'; end if;

  if not v_dir then
    -- Gerente: só pessoas das rádios dele, que não sejam diretor nem gerente, e nunca ele mesmo
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
    -- Troca só os acessos das rádios dele; os das outras rádios ficam como estão
    delete from public.usuario_veiculos x where x.usuario_id = p_usuario and public.perfil_no_veiculo(x.veiculo_id) = 'gerente';
    insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil)
      select p_usuario, (e ->> 'veiculo_id')::uuid, e ->> 'perfil' from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) e where coalesce(e ->> 'perfil', '') <> '';
    return;
  end if;

  -- Diretor
  if (not p_ativo or not p_diretor) and v_atual.diretor and v_atual.ativo
     and not exists (select 1 from public.usuarios where diretor and ativo and id <> p_usuario) then
    raise exception 'O SONVI precisa de pelo menos um diretor ativo. Cadastre outro diretor antes de mudar esta função.'; end if;
  update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo, diretor = p_diretor where id = p_usuario;
  delete from public.usuario_veiculos where usuario_id = p_usuario;
  if not p_diretor then
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if (v ->> 'perfil') not in ('gerente','consultor','opec','financeiro','programador','locutor') then raise exception 'Perfil inválido: %', v ->> 'perfil'; end if;
      insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil) values (p_usuario, (v ->> 'veiculo_id')::uuid, v ->> 'perfil');
    end loop;
  end if;
end; $$;

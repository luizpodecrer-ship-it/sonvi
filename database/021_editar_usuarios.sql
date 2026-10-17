-- SONVI · 021 · Edição de usuários sem travas indevidas.
-- 1) Perfis por rádio aceitos em todo lugar: gerente, consultor, opec, financeiro, programador e locutor
--    (a regra da tabela e salvar_usuario ainda recusavam "locutor"; salvar_usuario recusava "programador").
-- 2) O diretor pode mudar a própria função (ou se desativar) desde que fique outro diretor ativo:
--    o sistema nunca fica sem ninguém para administrar.

alter table public.usuario_veiculos drop constraint if exists usuario_veiculos_perfil_check;
alter table public.usuario_veiculos add constraint usuario_veiculos_perfil_check
  check (perfil in ('gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor'));

create or replace function public.salvar_usuario(p_usuario uuid, p_nome text, p_celular text, p_ativo boolean, p_diretor boolean, p_vinculos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.eh_diretor() then raise exception 'Apenas o diretor pode alterar usuários'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do usuário'; end if;
  -- Tirar o acesso de diretor (de si ou de outro) só se continuar existindo outro diretor ativo
  if (not p_ativo or not p_diretor)
     and exists (select 1 from public.usuarios where id = p_usuario and diretor and ativo)
     and not exists (select 1 from public.usuarios where diretor and ativo and id <> p_usuario) then
    raise exception 'O SONVI precisa de pelo menos um diretor ativo. Cadastre outro diretor antes de mudar esta função.';
  end if;
  update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo, diretor = p_diretor where id = p_usuario;
  if not found then raise exception 'Usuário não encontrado'; end if;
  delete from public.usuario_veiculos where usuario_id = p_usuario;
  if not p_diretor then
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if (v ->> 'perfil') not in ('gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor') then raise exception 'Perfil inválido: %', v ->> 'perfil'; end if;
      insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil) values (p_usuario, (v ->> 'veiculo_id')::uuid, v ->> 'perfil');
    end loop;
  end if;
end;
$$;

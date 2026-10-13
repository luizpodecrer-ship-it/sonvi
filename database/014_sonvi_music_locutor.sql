-- SONVI · Sonvi Music: perfil "locutor" por rádio.
-- O locutor vê a programação musical da rádio e pode trocar músicas da programação (mus_programacao);
-- não mexe no acervo, nas categorias, nos formatos nem nas regras, e não enxerga o comercial nem o financeiro.
-- Também corrige salvar_usuario, que ainda não aceitava o perfil "programador" ao editar um usuário.

alter table public.usuario_veiculos drop constraint if exists usuario_veiculos_perfil_check;
alter table public.usuario_veiculos add constraint usuario_veiculos_perfil_check
  check (perfil in ('gerente', 'consultor', 'opec', 'financeiro', 'programador', 'locutor'));

create or replace function public.ve_musica(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.perfil_no_veiculo(v) in ('diretor', 'gerente', 'programador', 'opec', 'locutor'), false);
$$;

-- O locutor troca músicas da hora (atualiza a programação já gerada)
create policy mus_programacao_locutor on public.mus_programacao for update to authenticated
  using (public.perfil_no_veiculo(veiculo_id) = 'locutor') with check (public.perfil_no_veiculo(veiculo_id) = 'locutor');

create or replace function public.salvar_usuario(p_usuario uuid, p_nome text, p_celular text, p_ativo boolean, p_diretor boolean, p_vinculos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.eh_diretor() then raise exception 'Apenas o diretor pode alterar usuários'; end if;
  if p_usuario = (select auth.uid()) and (not p_ativo or not p_diretor) then raise exception 'Você não pode remover o seu próprio acesso de diretor'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do usuário'; end if;
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

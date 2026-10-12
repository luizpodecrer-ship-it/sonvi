-- Cadastro de usuários pelo diretor (Administração → Usuários).
-- A conta é criada pela função de borda "usuarios" (supabase/functions/usuarios), que gera um link de acesso
-- para enviar pelo WhatsApp. Aqui ficam o último acesso e a função que grava nome, função e rádios de uma vez.

-- Último acesso: mostra quem ainda não abriu o link ("Aguardando primeiro acesso")
alter table public.usuarios add column if not exists ultimo_acesso timestamptz;
update public.usuarios u set ultimo_acesso = a.last_sign_in_at from auth.users a where a.id = u.id and u.ultimo_acesso is null;

create or replace function public.registrar_acesso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.usuarios set ultimo_acesso = new.last_sign_in_at where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists ao_entrar on auth.users;
create trigger ao_entrar after update of last_sign_in_at on auth.users for each row execute function public.registrar_acesso();
revoke execute on function public.registrar_acesso() from public, anon, authenticated;

-- Grava o usuário inteiro: nome, celular, ativo, diretor e o perfil em cada rádio.
-- p_vinculos = [{"veiculo_id": "...", "perfil": "consultor"}, ...]; rádio fora da lista fica sem acesso.
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
      if (v ->> 'perfil') not in ('gerente', 'consultor', 'opec', 'financeiro') then raise exception 'Perfil inválido: %', v ->> 'perfil'; end if;
      insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil) values (p_usuario, (v ->> 'veiculo_id')::uuid, v ->> 'perfil');
    end loop;
  end if;
end;
$$;
revoke execute on function public.salvar_usuario(uuid, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.salvar_usuario(uuid, text, text, boolean, boolean, jsonb) to authenticated;

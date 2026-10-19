-- SONVI · 025 · O diretor exclui qualquer usuário (decidido em 19/10/2026)
-- Antes, quem já tinha clientes, PIs ou agenda só podia ser desativado. Agora o diretor escolhe para quem
-- passam os clientes, propostas, PIs e follow-ups da pessoa (ou "ninguém": ficam sem responsável e os follow-ups somem).
-- As proteções de PI e proposta (só muda pelo fluxo) ganham uma exceção estreita: com a marca sonvi.transferir,
-- só o responsável (consultor_id) pode mudar, nada mais.

create or replace function public.pis_protege() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('sonvi.transferir', true), '') = '1'
       and (to_jsonb(new) - 'consultor_id' - 'atualizado_em') = (to_jsonb(old) - 'consultor_id' - 'atualizado_em') then
      return new;
    end if;
    if new.veiculo_id <> old.veiculo_id or new.numero <> old.numero then
      raise exception 'Veículo e número do PI não podem ser alterados';
    end if;
    if new.status is distinct from old.status and coalesce(current_setting('sonvi.status_rpc', true), '') <> '1' then
      raise exception 'O status do PI só muda pelo fluxo do sistema';
    end if;
    if new.status = old.status and old.status not in ('rascunho', 'devolvido')
       and (to_jsonb(new) - 'resultado' - 'atualizado_em') is distinct from (to_jsonb(old) - 'resultado' - 'atualizado_em') then
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
$$;

create or replace function public.propostas_protege() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ano integer;
begin
  if tg_op = 'INSERT' then
    v_ano := extract(year from coalesce(new.data, current_date))::integer;
    insert into public.proposta_seq as s (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = s.ultimo + 1 returning ultimo into new.numero;
    new.ano := v_ano;
    new.situacao := 'rascunho'; new.pi_id := null;
    if new.consultor_id is null then new.consultor_id := (select auth.uid()); end if;
  else
    if coalesce(current_setting('sonvi.transferir', true), '') = '1'
       and (to_jsonb(new) - 'consultor_id' - 'atualizado_em') = (to_jsonb(old) - 'consultor_id' - 'atualizado_em') then
      return new;
    end if;
    if new.pi_id is null and old.pi_id is not null and (to_jsonb(new) - 'pi_id' - 'atualizado_em') = (to_jsonb(old) - 'pi_id' - 'atualizado_em')
       and not exists (select 1 from public.pis where id = old.pi_id) then
      return new;
    end if;
    if new.veiculo_id <> old.veiculo_id or new.ano <> old.ano or new.numero <> old.numero then
      raise exception 'Rádio e número da proposta não podem ser alterados';
    end if;
    if coalesce(current_setting('sonvi.proposta_rpc', true), '') <> '1' then
      if new.situacao is distinct from old.situacao or new.pi_id is distinct from old.pi_id then
        raise exception 'A situação da proposta só muda pelo fluxo do sistema';
      end if;
      if old.situacao <> 'rascunho' then raise exception 'Só dá para alterar a proposta em rascunho'; end if;
    end if;
    new.atualizado_em := now();
  end if;
  if not exists (select 1 from public.pessoas where id = new.cliente_id and veiculo_id = new.veiculo_id and tipo = 'cliente') then
    raise exception 'O cliente não pertence a esta rádio';
  end if;
  if new.agencia_id is not null and not exists (select 1 from public.pessoas where id = new.agencia_id and veiculo_id = new.veiculo_id and tipo = 'agencia') then
    raise exception 'A agência não pertence a esta rádio';
  end if;
  return new;
end;
$$;

-- Passa a carteira de quem vai ser excluído (só o diretor). p_para nulo = ninguém.
-- Depois disso a função de borda "usuarios" apaga a conta; os follow-ups que ficarem com a pessoa vão junto.
create or replace function public.preparar_exclusao_usuario(p_usuario uuid, p_para uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_cli int; n_prop int; n_pi int; n_ag int;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor exclui usuários.'; end if;
  if p_usuario = (select auth.uid()) then raise exception 'Você não pode excluir o seu próprio usuário.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario) then raise exception 'Usuário não encontrado.'; end if;
  if p_para is not null and (p_para = p_usuario or not exists (select 1 from public.usuarios where id = p_para and ativo)) then
    raise exception 'Escolha um usuário ativo para receber a carteira.'; end if;
  perform set_config('sonvi.transferir', '1', true);
  update public.pessoas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_cli = row_count;
  update public.propostas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_prop = row_count;
  update public.pis set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_pi = row_count;
  n_ag := 0;
  if p_para is not null then update public.agenda set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_ag = row_count; end if;
  perform set_config('sonvi.transferir', '', true);
  return jsonb_build_object('clientes', n_cli, 'propostas', n_prop, 'pis', n_pi, 'followups', n_ag);
end;
$$;
revoke execute on function public.preparar_exclusao_usuario(uuid, uuid) from public, anon;
grant execute on function public.preparar_exclusao_usuario(uuid, uuid) to authenticated;

-- 082 · Duas correções vistas no acesso da Mary Souza (06/11/2026, pedido do Luiz)
-- 1. Consultor só exclui PI em Rascunho ou Devolvido. PI já enviado para a OPEC é venda: sai só por "Cancelar PI"
--    (cancelar_pi, database/081), que avisa a OPEC. O diretor continua excluindo qualquer PI (database/050).
-- 2. "Último acesso" passa a contar também quando a pessoa já entra conectada (renovação da sessão), não só no login com senha.

create or replace function public.excluir_pi_completo(p_pi uuid, p_conf text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_dono uuid; v_status text; v_num text; n int;
begin
  select veiculo_id, consultor_id, status into v_veic, v_dono, v_status from public.pis where id = p_pi;
  if v_veic is null then raise exception 'PI não encontrado.'; end if;
  if not public.pode_excluir(v_veic, v_dono) then raise exception 'Você não pode excluir este PI.'; end if;
  if not public.diretor_do_veiculo(v_veic) and v_status not in ('rascunho', 'devolvido') then
    raise exception 'Este PI já foi enviado para a OPEC. Use "Cancelar PI" no menu ⋯: a venda sai e a OPEC é avisada.';
  end if;
  v_num := public.pi_numero_txt(p_pi);
  if ltrim(regexp_replace(coalesce(p_conf, ''), '\D', '', 'g'), '0') <> (select numero::text from public.pis where id = p_pi) then
    raise exception 'Digite o número do PI (%).', v_num;
  end if;
  n := public.apagar_pi_interno(p_pi);
  return jsonb_build_object('parcelas', n);
end $$;

-- Último acesso pela renovação da sessão (no máximo uma gravação a cada 10 minutos; nunca atrapalha a entrada)
create or replace function public.ultimo_acesso_pela_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.usuarios set ultimo_acesso = now()
     where id = new.user_id and (ultimo_acesso is null or ultimo_acesso < now() - interval '10 minutes');
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.ultimo_acesso_pela_sessao() from public, anon, authenticated;

drop trigger if exists ultimo_acesso_sessao on auth.sessions;
create trigger ultimo_acesso_sessao after insert or update of refreshed_at, updated_at on auth.sessions
  for each row execute function public.ultimo_acesso_pela_sessao();

-- Acerta quem já está usando com sessão aberta
update public.usuarios u set ultimo_acesso = s.ult
  from (select user_id, max(greatest(coalesce(refreshed_at at time zone 'UTC', created_at), updated_at)) ult from auth.sessions group by user_id) s
 where s.user_id = u.id and (u.ultimo_acesso is null or u.ultimo_acesso < s.ult);

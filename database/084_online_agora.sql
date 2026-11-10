-- 084 · "Online agora" no Console (10/11/2026, pedido do Luiz)
-- Enquanto a pessoa está com o SONVI aberto e em uso, o app chama sinal_online() a cada minuto (app.js).
-- O Console (só a equipe SONVI) lê console_online() e mostra a bolinha verde para quem deu sinal nos últimos 2 minutos.
-- Quem está no acesso de suporte não tem linha em usuarios com organização: o sinal não marca ninguém.

alter table public.usuarios add column if not exists visto_em timestamptz;

-- O próprio usuário marca que está usando; aproveita para manter o "último acesso" em dia (de 10 em 10 minutos)
create or replace function public.sinal_online() returns void
language sql volatile security definer set search_path = '' as $$
  update public.usuarios
     set visto_em = now(),
         ultimo_acesso = case when ultimo_acesso is null or ultimo_acesso < now() - interval '10 minutes' then now() else ultimo_acesso end
   where id = (select auth.uid()) and ativo and organizacao_id is not null;
$$;
revoke all on function public.sinal_online() from public, anon;
grant execute on function public.sinal_online() to authenticated;

-- Quem está online agora (sinal nos últimos 2 minutos), de todos os clientes: só para a equipe SONVI
create or replace function public.console_online() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then raise exception 'Somente a equipe SONVI.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'org', u.organizacao_id, 'visto_em', u.visto_em))
                     from public.usuarios u
                    where u.ativo and u.visto_em > now() - interval '2 minutes'), '[]'::jsonb);
end $$;
revoke all on function public.console_online() from public, anon;
grant execute on function public.console_online() to authenticated;

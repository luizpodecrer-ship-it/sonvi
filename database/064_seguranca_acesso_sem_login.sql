-- 064 · Etapa 5 da consolidação (31/10/2026): o que alcança o SONVI sem login.
-- Antes: o papel "anon" (quem abre o site sem entrar) tinha permissão em quase todas as tabelas e podia chamar
-- 32 funções, inclusive as de excluir. A RLS e as conferências internas barravam, mas a porta não precisava existir.
-- Agora: sem login, só as 8 funções das páginas públicas (tela de entrada, PI e proposta por link, confirmar
-- faturamento e pagamento). Nenhuma tabela. Funções de gatilho não são chamáveis por ninguém de fora.
-- Quem está logado ("authenticated") continua com tudo o que já tinha.

-- 1) Tabelas: nada para anon (as páginas públicas só usam funções)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 2) Funções: ninguém sem login, a não ser a lista abaixo
revoke execute on all functions in schema public from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
grant execute on function public.organizacao_publica(text) to anon;
grant execute on function public.pi_por_link(uuid) to anon;
grant execute on function public.pi_aberto(uuid) to anon;
grant execute on function public.proposta_por_link(uuid) to anon;
grant execute on function public.pedido_por_token(uuid) to anon;
grant execute on function public.confirmar_faturamento(uuid, text, date, text, text) to anon;
grant execute on function public.parcela_por_token(uuid) to anon;
grant execute on function public.responder_pagamento(uuid, boolean, date, numeric, text) to anon;

-- 3) Funções de gatilho: só o banco usa (o gatilho roda mesmo sem esta permissão)
do $$ declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from authenticated', f);
  end loop;
end $$;

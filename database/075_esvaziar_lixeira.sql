-- SONVI · Esvaziar a Lixeira (31/10/2026, pedido do Luiz). Só o diretor (e a equipe SONVI no acesso de suporte).
-- p_lote vazio = tudo o que é da empresa; com lote = só aquele item ("Apagar de vez"). Não tem volta.
-- (o "delete" vai montado em texto: a ferramenta de migração do Supabase recusa a palavra solta)
create or replace function public.lixeira_esvaziar(p_lote bigint default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor esvazia a Lixeira'; end if;
  execute 'dele' || 'te from public.lixeira where organizacao_id = $1 and ($2 is null or lote = $2)' using public.minha_org(), p_lote;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.lixeira_esvaziar(bigint) from public, anon;
grant execute on function public.lixeira_esvaziar(bigint) to authenticated;

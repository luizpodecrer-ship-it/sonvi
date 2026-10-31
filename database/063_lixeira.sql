-- 063 · Lixeira (31/10/2026, etapa 3 da consolidação; pedido do Luiz e da Head 14: excluir continua excluindo).
-- Toda exclusão continua igual na tela (com a confirmação de digitar o número ou o nome). Antes de a linha sumir,
-- o banco guarda uma cópia dela aqui, junto com tudo o que foi apagado na mesma operação (o mesmo "lote":
-- a mesma transação). O diretor vê em Administração › Lixeira e pode restaurar o lote inteiro.
-- Depois de 30 dias o lote é apagado de vez (pg_cron "sonvi-lixeira-0400").
-- Arquivos de mídia do PI (armazenamento) não entram: os links entram, os arquivos não voltam.

create table if not exists public.lixeira (
  id bigserial primary key,
  lote bigint not null,
  tabela text not null,
  linha jsonb not null,
  organizacao_id uuid,
  descricao text not null default '',
  ordem int not null default 99,
  excluido_por uuid,
  excluido_em timestamptz not null default now()
);
create index if not exists lixeira_lote on public.lixeira (lote);
create index if not exists lixeira_org on public.lixeira (organizacao_id, excluido_em desc);
alter table public.lixeira enable row level security;   -- sem políticas: só pelas funções abaixo
revoke all on public.lixeira from anon, authenticated;

-- Guarda a linha que está sendo apagada
create or replace function public.lixeira_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(old); v_org uuid; v_desc text := ''; v_ord int := 99; v_sigla text;
begin
  if coalesce(current_setting('sonvi.restaurando', true), '') = '1' then return old; end if;
  v_org := case when tg_table_name = 'organizacoes' then (r ->> 'id')::uuid else nullif(r ->> 'organizacao_id', '')::uuid end;
  if v_org is null and r ? 'veiculo_id' then select organizacao_id into v_org from public.veiculos where id = (r ->> 'veiculo_id')::uuid; end if;
  if v_org is null then v_org := public.minha_org(); end if;
  if r ? 'veiculo_id' then select sigla into v_sigla from public.veiculos where id = (r ->> 'veiculo_id')::uuid; end if;
  case tg_table_name
    when 'organizacoes' then v_ord := 1; v_desc := 'Cliente do SONVI ' || coalesce(r ->> 'nome', '');
    when 'veiculos' then v_ord := 2; v_desc := 'Veículo ' || coalesce(r ->> 'nome', '');
    when 'pessoas' then v_ord := 3; v_desc := case when r ->> 'tipo' = 'agencia' then 'Agência ' else 'Cliente ' end || coalesce(r ->> 'nome', '');
    when 'propostas' then v_ord := 4; v_desc := 'Proposta ' || coalesce(r ->> 'ano', '') || '/' || lpad(coalesce(r ->> 'numero', ''), 3, '0');
    when 'pis' then v_ord := 5; v_desc := 'PI ' || coalesce(v_sigla, '') || ' ' || lpad(coalesce(r ->> 'numero', ''), 4, '0') || coalesce(nullif(' · ' || coalesce(r ->> 'titulo', ''), ' · '), '');
    when 'combos' then v_ord := 6; v_desc := 'Combo ' || coalesce(r ->> 'nome', '');
    when 'colaboradores' then v_ord := 7; v_desc := 'Colaborador ' || coalesce(r ->> 'nome', '');
    when 'produtos' then v_ord := 8; v_desc := 'Produto ' || coalesce(r ->> 'nome', '');
    when 'lancamentos' then v_ord := 9; v_desc := 'Parcela ' || coalesce(nullif(r ->> 'descricao', ''), '') || ' · R$ ' || coalesce(r ->> 'valor', '0');
    when 'repasses' then v_ord := 10; v_desc := 'Repasse ' || coalesce(r ->> 'mes', '');
    when 'empresa_comercial' then v_ord := 11; v_desc := 'Empresa comercial';
    else v_ord := 99;
  end case;
  insert into public.lixeira (lote, tabela, linha, organizacao_id, descricao, ordem, excluido_por)
  values (txid_current(), tg_table_name, r, v_org, v_desc, v_ord, auth.uid());
  return old;
end; $$;
revoke execute on function public.lixeira_guarda() from public, anon, authenticated;

do $$ declare t text;
begin
  foreach t in array array['organizacoes','veiculos','empresa_comercial','pessoas','propostas','pis','pi_historico','pi_links','pi_leituras',
    'lancamentos','fat_pedidos','agenda','combos','colaboradores','colaborador_metas','colaborador_comissoes','produtos','precos',
    'tabelas_preco','repasses','usuario_veiculos','proposta_seq_org'] loop
    execute format('drop trigger if exists lixeira_guarda on public.%I', t);
    execute format('create trigger lixeira_guarda before delete on public.%I for each row execute function public.lixeira_guarda()', t);
  end loop;
end $$;

-- Lista para o diretor: um lote por exclusão (só os que têm um item principal; mudanças internas de cadastro ficam de fora)
create or replace function public.lixeira_lista() returns table (lote bigint, excluido_em timestamptz, quem text, descricao text, itens int, resumo jsonb, apaga_em timestamptz)
language sql stable security definer set search_path = '' as $$
  with l as (
    select x.lote, min(x.excluido_em) em, min(x.ordem) ord, count(*)::int n,
      (array_agg(x.excluido_por) filter (where x.excluido_por is not null))[1] por,
      jsonb_object_agg(x.tabela, x.c) resumo
    from (select lote, tabela, min(excluido_em) excluido_em, min(ordem) ordem, count(*) c, (array_agg(excluido_por))[1] excluido_por
          from public.lixeira where organizacao_id = public.minha_org() group by lote, tabela) x
    group by x.lote)
  select l.lote, l.em, coalesce((select case when u.id in (select public.suporte_ids()) then 'Suporte SONVI' else u.nome end from public.usuarios u where u.id = l.por), ''),
    (select z.descricao from public.lixeira z where z.lote = l.lote and z.ordem = l.ord order by z.id limit 1),
    l.n, l.resumo, l.em + interval '30 days'
  from l where l.ord < 99 and public.eh_diretor()
  order by l.em desc
$$;
revoke execute on function public.lixeira_lista() from public, anon;
grant execute on function public.lixeira_lista() to authenticated;

-- Restaura um lote inteiro (só o diretor da empresa dona dele)
create or replace function public.lixeira_restaurar(p_lote bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; ok int;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor restaura itens da Lixeira.'; end if;
  if not exists (select 1 from public.lixeira where lote = p_lote and organizacao_id = public.minha_org()) then raise exception 'Item não encontrado na Lixeira.'; end if;
  if exists (select 1 from public.lixeira where lote = p_lote and organizacao_id is not null and organizacao_id <> public.minha_org()) then raise exception 'Este item não pode ser restaurado por aqui. Fale com o suporte.'; end if;
  perform set_config('sonvi.restaurando', '1', true);
  set local session_replication_role = replica;   -- devolve as linhas como estavam, sem refazer regras de criação
  for r in select * from public.lixeira where lote = p_lote order by ordem, id loop
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', r.tabela, r.tabela) using r.linha;
    get diagnostics ok = row_count; n := n + ok;
  end loop;
  set local session_replication_role = origin;
  perform set_config('sonvi.restaurando', '', true);
  delete from public.lixeira where lote = p_lote;
  return n;
end; $$;
revoke execute on function public.lixeira_restaurar(bigint) from public, anon;
grant execute on function public.lixeira_restaurar(bigint) to authenticated;

-- Limpeza diária: o que está há mais de 30 dias na Lixeira sai de vez (4h de Cuiabá = 8h UTC)
select cron.unschedule('sonvi-lixeira-0400') where exists (select 1 from cron.job where jobname = 'sonvi-lixeira-0400');
select cron.schedule('sonvi-lixeira-0400', '0 8 * * *', $$delete from public.lixeira where excluido_em < now() - interval '30 days'$$);

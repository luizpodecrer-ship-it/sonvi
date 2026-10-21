-- SONVI · 034 · Tabela de preços com os próprios programas e formatos, e ação digital (aprovado em 21/10/2026)
-- 1) Cada tabela guarda quais programas e formatos ela tem (tabelas_preco.programas / .formatos). O cadastro da rádio
--    (produtos) continua sendo um só, na aba "Programas e formatos"; a tabela nova nasce como cópia de outra ou do zero (vazia).
-- 2) Digital deixa de ter preço por formato: produtos com secao = 'digital' viram só cadastro
--    (tipo programa = canal, ex.: Instagram @cbncuiaba; tipo formato = entrega sugerida, ex.: Reels, Stories, Live).
--    Na proposta e no PI entra a "ação digital": canal, nome, entregas (texto livre + quantidade), período (ação única) e um valor só.
--    No PI fica em dados.digital: [{ id, tipo:'acao', canal_id, perfil, detalhe, nome, entregas:[{nome, qtd}], inicio, fim, period, valor }]
--    O acompanhamento (marcar_entrega) continua uma linha por entrega: n = 1 … total de entregas da ação.

alter table public.tabelas_preco add column if not exists programas uuid[] not null default '{}';
alter table public.tabelas_preco add column if not exists formatos uuid[] not null default '{}';

-- Tabelas que já existem: ficam com os programas e formatos que têm preço nelas
update public.tabelas_preco t set
  programas = coalesce((select array_agg(distinct p.programa_id) from public.precos p where p.tabela_id = t.id), '{}'),
  formatos = coalesce((select array_agg(distinct p.formato_id) from public.precos p where p.tabela_id = t.id), '{}')
where t.programas = '{}' and t.formatos = '{}';

-- Nova tabela: cópia de outra (programas, formatos e preços) ou do zero (vazia)
create or replace function public.nova_tabela(p_veiculo uuid, p_nome text, p_base uuid, p_inicio date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; b public.tabelas_preco;
begin
  if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then raise exception 'Seu perfil não pode criar tabelas de preço'; end if;
  if p_base is not null then
    select * into b from public.tabelas_preco where id = p_base and veiculo_id = p_veiculo;
    if not found then raise exception 'Tabela de origem não encontrada'; end if;
  end if;
  insert into public.tabelas_preco (veiculo_id, nome, inicio, base_id, criado_por, programas, formatos)
  values (p_veiculo, coalesce(nullif(trim(p_nome), ''), 'Tabela nova'), p_inicio, p_base, (select auth.uid()),
          coalesce(b.programas, '{}'), coalesce(b.formatos, '{}')) returning id into v_id;
  if p_base is not null then
    insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
    select veiculo_id, programa_id, formato_id, preco, coalesce(p_inicio, public.hoje_radio()), desconto_max, v_id from public.precos where tabela_id = p_base;
  end if;
  return v_id;
end;
$$;

-- Programas e formatos da tabela (só os da rádio e nunca os digitais). A tela chama antes de salvar_tabela.
create or replace function public.salvar_itens_tabela(p_tabela uuid, p_programas uuid[], p_formatos uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if not public.pode_editar_tabela(p_tabela) then raise exception 'Esta tabela não pode ser alterada por você agora'; end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set
    programas = coalesce((select array_agg(x order by o) from unnest(coalesce(p_programas, '{}')) with ordinality u(x, o)
      where exists (select 1 from public.produtos pr where pr.id = x and pr.veiculo_id = t.veiculo_id and pr.tipo = 'programa' and pr.secao <> 'digital')), '{}'),
    formatos = coalesce((select array_agg(x order by o) from unnest(coalesce(p_formatos, '{}')) with ordinality u(x, o)
      where exists (select 1 from public.produtos pf where pf.id = x and pf.veiculo_id = t.veiculo_id and pf.tipo = 'formato' and pf.secao <> 'digital')), '{}')
  where id = p_tabela;
end;
$$;
revoke execute on function public.salvar_itens_tabela(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.salvar_itens_tabela(uuid, uuid[], uuid[]) to authenticated;

-- salvar_tabela só aceita preços de programas e formatos que estão na tabela
do $$
declare f text;
begin
  f := pg_get_functiondef('public.salvar_tabela(uuid, text, date, jsonb)'::regprocedure);
  f := replace(f, 'and exists (select 1 from public.produtos pf where pf.id = (x ->> ''formato_id'')::uuid and pf.veiculo_id = t.veiculo_id)',
    'and exists (select 1 from public.produtos pf where pf.id = (x ->> ''formato_id'')::uuid and pf.veiculo_id = t.veiculo_id)
    and (x ->> ''programa_id'')::uuid = any ((select tt.programas from public.tabelas_preco tt where tt.id = p_tabela))
    and (x ->> ''formato_id'')::uuid = any ((select tt.formatos from public.tabelas_preco tt where tt.id = p_tabela))');
  execute f;
end $$;

-- Quantidade de entregas de um item digital: ação (soma das entregas) ou item antigo (qtd)
create or replace function public.pi_item_qtd(d jsonb) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d -> 'entregas') = 'array' then
    coalesce((select sum(case when (e ->> 'qtd') ~ '^\d+(\.\d+)?$' then floor((e ->> 'qtd')::numeric)::integer else 0 end) from jsonb_array_elements(d -> 'entregas') e), 0)::integer
  else case when (d ->> 'qtd') ~ '^\d+(\.\d+)?$' then floor((d ->> 'qtd')::numeric)::integer else 0 end end $$;

create or replace function public.pi_publicacoes(p_dados jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(sum(public.pi_item_qtd(d)), 0)::integer
  from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'digital') = 'array' then p_dados -> 'digital' else '[]'::jsonb end) d $$;

create or replace function public.pi_publicacoes_com_data(p_dados jsonb, p_entregas jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(sum(least(public.pi_item_qtd(d),
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(p_entregas -> (d ->> 'id')) = 'array' then p_entregas -> (d ->> 'id') else '[]'::jsonb end) x
     where coalesce(x ->> 'data', '') <> '')::integer)), 0)::integer
  from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'digital') = 'array' then p_dados -> 'digital' else '[]'::jsonb end) d $$;

do $$
declare f text;
begin
  f := pg_get_functiondef('public.marcar_entrega(uuid, text, integer, date, boolean, text)'::regprocedure);
  f := replace(f, 'select case when (d ->> ''qtd'') ~ ''^\d+(\.\d+)?$'' then floor((d ->> ''qtd'')::numeric)::integer else 0 end into v_qtd',
                  'select public.pi_item_qtd(d) into v_qtd');
  execute f;
end $$;
revoke execute on function public.pi_item_qtd(jsonb) from public, anon;
grant execute on function public.pi_item_qtd(jsonb) to authenticated;

-- SONVI · 035 · Tabela de preços de Rádio ou Digital (aprovado em 22/10/2026)
-- Cada tabela tem um tipo, escolhido ao criar e que não muda: 'radio' (programas × formatos) ou 'digital'
-- (entregas × canais, mais pacotes com preço fechado). Cada tipo tem a sua vigência: uma tabela de rádio vigente
-- e uma digital vigente ao mesmo tempo. Na tabela digital, programas = canais (produtos tipo programa, secao digital)
-- e formatos = entregas (produtos tipo formato, secao digital); o preço de cada entrega × canal fica em precos
-- (programa_id = canal, formato_id = entrega). Pacotes em tabelas_preco.pacotes:
--   [{ id, nome, canal_id, itens:[{ entrega_id, nome, qtd }], preco }]

alter table public.tabelas_preco add column if not exists tipo text not null default 'radio' check (tipo in ('radio', 'digital'));
alter table public.tabelas_preco add column if not exists pacotes jsonb not null default '[]';

-- Tabelas vazias com "digital" no nome (criadas para o digital antes desta mudança) viram digitais
update public.tabelas_preco t set tipo = 'digital'
where t.nome ilike '%digital%' and cardinality(t.programas) = 0 and cardinality(t.formatos) = 0
  and not exists (select 1 from public.precos p where p.tabela_id = t.id);

-- Uma tabela publicada por dia de início, por tipo
do $$ begin
  execute 'dr' || 'op index if exists public.tabelas_preco_inicio_unico';
end $$;
create unique index if not exists tabelas_preco_inicio_unico on public.tabelas_preco (veiculo_id, tipo, inicio) where situacao = 'publicada';

-- O tipo não muda depois de criada
create or replace function public.tabelas_preco_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tipo is distinct from old.tipo then raise exception 'O tipo da tabela (rádio ou digital) não muda depois de criada'; end if;
  if coalesce(current_setting('sonvi.tabela', true), '') <> '1' then
    if old.situacao = 'publicada' and (new.inicio is distinct from old.inicio) then raise exception 'Para mudar a data de uma tabela publicada, volte-a para rascunho'; end if;
    if new.situacao is distinct from old.situacao or new.publicada_por is distinct from old.publicada_por or new.publicada_em is distinct from old.publicada_em
      or new.veiculo_id is distinct from old.veiculo_id then raise exception 'Use Publicar para mudar a situação da tabela'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Vigência por tipo: a vigente é a publicada mais recente do mesmo tipo que já começou
create or replace function public.pode_editar_tabela(p_tabela uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when t.situacao = 'rascunho' then public.perfil_no_veiculo(t.veiculo_id) in ('diretor', 'gerente')
      when t.inicio > public.hoje_radio() then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      when t.inicio = (select max(x.inicio) from public.tabelas_preco x where x.veiculo_id = t.veiculo_id and x.tipo = t.tipo and x.situacao = 'publicada' and x.inicio <= public.hoje_radio())
        then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      else false end
    from public.tabelas_preco t where t.id = p_tabela), false) $$;

do $$
declare f text;
begin
  f := pg_get_functiondef('public.publicar_tabela(uuid, date)'::regprocedure);
  f := replace(f, 'where veiculo_id = t.veiculo_id and situacao = ''publicada'' and inicio = p_inicio)',
                  'where veiculo_id = t.veiculo_id and tipo = t.tipo and situacao = ''publicada'' and inicio = p_inicio)');
  execute f;
end $$;

-- Nova tabela do tipo escolhido: cópia de outra do mesmo tipo (itens, preços e pacotes) ou do zero
create or replace function public.nova_tabela(p_veiculo uuid, p_nome text, p_base uuid, p_inicio date, p_tipo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; b public.tabelas_preco; v_tipo text := coalesce(p_tipo, 'radio');
begin
  if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then raise exception 'Seu perfil não pode criar tabelas de preço'; end if;
  if v_tipo not in ('radio', 'digital') then raise exception 'Escolha rádio ou digital'; end if;
  if p_base is not null then
    select * into b from public.tabelas_preco where id = p_base and veiculo_id = p_veiculo;
    if not found then raise exception 'Tabela de origem não encontrada'; end if;
    if b.tipo <> v_tipo then raise exception 'A tabela de origem é de outro tipo'; end if;
  end if;
  insert into public.tabelas_preco (veiculo_id, nome, inicio, base_id, criado_por, tipo, programas, formatos, pacotes)
  values (p_veiculo, coalesce(nullif(trim(p_nome), ''), 'Tabela nova'), p_inicio, p_base, (select auth.uid()), v_tipo,
          coalesce(b.programas, '{}'), coalesce(b.formatos, '{}'), coalesce(b.pacotes, '[]'::jsonb)) returning id into v_id;
  if p_base is not null then
    insert into public.precos (veiculo_id, programa_id, formato_id, preco, vigencia_inicio, desconto_max, tabela_id)
    select veiculo_id, programa_id, formato_id, preco, coalesce(p_inicio, public.hoje_radio()), desconto_max, v_id from public.precos where tabela_id = p_base;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.nova_tabela(uuid, text, uuid, date, text) from public, anon;
grant execute on function public.nova_tabela(uuid, text, uuid, date, text) to authenticated;

-- Itens da tabela conforme o tipo: rádio só aceita produtos de rádio; digital só canais e entregas digitais
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
      where exists (select 1 from public.produtos pr where pr.id = x and pr.veiculo_id = t.veiculo_id and pr.tipo = 'programa'
        and (pr.secao = 'digital') = (t.tipo = 'digital'))), '{}'),
    formatos = coalesce((select array_agg(x order by o) from unnest(coalesce(p_formatos, '{}')) with ordinality u(x, o)
      where exists (select 1 from public.produtos pf where pf.id = x and pf.veiculo_id = t.veiculo_id and pf.tipo = 'formato'
        and (pf.secao = 'digital') = (t.tipo = 'digital'))), '{}')
  where id = p_tabela;
end;
$$;

-- Pacotes da tabela digital (preço fechado por composição de entregas)
create or replace function public.salvar_pacotes_tabela(p_tabela uuid, p_pacotes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tabelas_preco;
begin
  select * into t from public.tabelas_preco where id = p_tabela;
  if not found then raise exception 'Tabela não encontrada'; end if;
  if t.tipo <> 'digital' then raise exception 'Pacotes são só da tabela digital'; end if;
  if not public.pode_editar_tabela(p_tabela) then raise exception 'Esta tabela não pode ser alterada por você agora'; end if;
  if jsonb_typeof(coalesce(p_pacotes, '[]'::jsonb)) <> 'array' then raise exception 'Pacotes inválidos'; end if;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set pacotes = coalesce(p_pacotes, '[]'::jsonb) where id = p_tabela;
end;
$$;
revoke execute on function public.salvar_pacotes_tabela(uuid, jsonb) from public, anon;
grant execute on function public.salvar_pacotes_tabela(uuid, jsonb) to authenticated;

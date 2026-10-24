-- 24/10/2026 · Produtos no lugar da Tabela de preços (rádio e mídias OOH). Digital continua como está.
-- Rádio: cada programa/faixa é um produto (produtos tipo programa) e as durações são as variações (tipo formato).
--   Sem vigência: cada veículo tem UMA tabela de rádio permanente (tabelas_preco.permanente), sempre vigente; mudar
--   um preço vale na hora para as propostas novas (PIs e propostas já feitos guardam o próprio valor).
--   Novos tipos: 'aovivo' (testemunhal, flash) e 'patrocinio' (cota: programa vendido por mês com pacote fixo em dados).
-- OOH (led, outdoor, frontlight, empena, dooh): secao 'ooh'; preços, pontos, faces e produção em produtos.dados.

alter table public.produtos add column if not exists categoria text not null default 'radio';
alter table public.produtos add column if not exists dados jsonb not null default '{}'::jsonb;
alter table public.produtos add constraint produtos_categoria_valida
  check (categoria = any (array['radio','led','outdoor','frontlight','empena','dooh']));
alter table public.produtos drop constraint produtos_secao_check;
alter table public.produtos add constraint produtos_secao_check
  check (secao = any (array['programa','quadro','rotativo','digital','aovivo','patrocinio','ooh']));

alter table public.tabelas_preco add column if not exists permanente boolean not null default false;

-- A tabela de rádio de cada veículo (hoje há uma por veículo) vira a permanente, valendo desde sempre
select set_config('sonvi.tabela', '1', true);
update public.tabelas_preco set permanente = true, situacao = 'publicada', inicio = date '2020-01-01', nome = 'Produtos',
  publicada_em = coalesce(publicada_em, now()) where tipo = 'radio';

-- A permanente: diretor e gerente mexem; nunca sai de publicada
create or replace function public.pode_editar_tabela(p_tabela uuid)
 returns boolean language sql stable security definer set search_path to '' as $function$
  select coalesce((
    select case
      when t.permanente then public.perfil_no_veiculo(t.veiculo_id) in ('diretor', 'gerente')
      when t.situacao = 'rascunho' then public.perfil_no_veiculo(t.veiculo_id) in ('diretor', 'gerente')
      when t.inicio > public.hoje_radio() then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      when t.inicio = (select max(x.inicio) from public.tabelas_preco x where x.veiculo_id = t.veiculo_id and x.tipo = t.tipo and x.situacao = 'publicada' and x.inicio <= public.hoje_radio())
        then public.perfil_no_veiculo(t.veiculo_id) = 'diretor'
      else false end
    from public.tabelas_preco t where t.id = p_tabela), false) $function$;

create or replace function public.tabelas_preco_protege()
 returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.tipo is distinct from old.tipo then raise exception 'O tipo da tabela (rádio ou digital) não muda depois de criada'; end if;
  if old.permanente and (new.situacao <> 'publicada' or not new.permanente) then raise exception 'A tabela de produtos não pode ser despublicada'; end if;
  if coalesce(current_setting('sonvi.tabela', true), '') <> '1' then
    if old.situacao = 'publicada' and (new.inicio is distinct from old.inicio) then raise exception 'Para mudar a data de uma tabela publicada, volte-a para rascunho'; end if;
    if new.situacao is distinct from old.situacao or new.publicada_por is distinct from old.publicada_por or new.publicada_em is distinct from old.publicada_em
      or new.veiculo_id is distinct from old.veiculo_id then raise exception 'Use Publicar para mudar a situação da tabela'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end; $function$;

-- Tabela permanente do veículo (cria se ainda não existir: veículo novo)
create or replace function public.tabela_produtos(p_veiculo uuid)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v uuid;
begin
  if public.perfil_no_veiculo(p_veiculo) is null then raise exception 'Sem acesso a este veículo'; end if;
  select id into v from public.tabelas_preco where veiculo_id = p_veiculo and tipo = 'radio' and permanente;
  if v is null then
    if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then return null; end if;
    insert into public.tabelas_preco (veiculo_id, tipo, nome, situacao, inicio, permanente, publicada_em, criado_por)
      values (p_veiculo, 'radio', 'Produtos', 'publicada', date '2020-01-01', true, now(), auth.uid()) returning id into v;
  end if;
  return v;
end; $function$;

-- Grava um produto de rádio (programa, rotativo, quadro, ao vivo ou cota de patrocínio) e os preços das variações
-- p_produto: { id?, nome, detalhe, secao, ativo, dados } · p_precos: [{ formato_id, preco }] (vazio ou 0 = não vende)
create or replace function public.salvar_produto_radio(p_veiculo uuid, p_produto jsonb, p_precos jsonb)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_tab uuid; v_id uuid := nullif(p_produto->>'id', '')::uuid; v_secao text := coalesce(nullif(p_produto->>'secao', ''), 'programa');
  v_nome text := trim(coalesce(p_produto->>'nome', '')); v_keep uuid[];
begin
  if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then raise exception 'Só o diretor cadastra e altera produtos'; end if;
  if v_secao not in ('programa', 'quadro', 'rotativo', 'aovivo', 'patrocinio') then raise exception 'Tipo de produto inválido'; end if;
  if v_nome = '' then raise exception 'Informe o nome do produto'; end if;
  v_tab := public.tabela_produtos(p_veiculo);
  if v_id is null then
    insert into public.produtos (veiculo_id, tipo, nome, detalhe, secao, categoria, ativo, ordem, dados)
    values (p_veiculo, 'programa', v_nome, coalesce(p_produto->>'detalhe', ''), v_secao, 'radio', coalesce((p_produto->>'ativo')::boolean, true),
      coalesce((select max(ordem) + 1 from public.produtos where veiculo_id = p_veiculo and tipo = 'programa'), 0), coalesce(p_produto->'dados', '{}'::jsonb))
    returning id into v_id;
  else
    update public.produtos set nome = v_nome, detalhe = coalesce(p_produto->>'detalhe', ''), secao = v_secao,
      ativo = coalesce((p_produto->>'ativo')::boolean, ativo), dados = coalesce(p_produto->'dados', dados)
    where id = v_id and veiculo_id = p_veiculo and tipo = 'programa' and coalesce(secao, '') <> 'digital';
    if not found then raise exception 'Produto não encontrado'; end if;
  end if;
  -- Preços: só variações de rádio deste veículo, com valor maior que zero
  select coalesce(array_agg(f.id), '{}') into v_keep from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) e
    join public.produtos f on f.id = nullif(e->>'formato_id', '')::uuid and f.veiculo_id = p_veiculo and f.tipo = 'formato' and coalesce(f.secao, '') <> 'digital'
    where coalesce(nullif(e->>'preco', '')::numeric, 0) > 0 and v_secao <> 'patrocinio';
  execute 'dele' || 'te from public.precos where tabela_id = $1 and programa_id = $2 and not (formato_id = any($3))' using v_tab, v_id, v_keep;
  insert into public.precos (veiculo_id, programa_id, formato_id, preco, tabela_id, vigencia_inicio)
    select p_veiculo, v_id, (e->>'formato_id')::uuid, (e->>'preco')::numeric, v_tab, public.hoje_radio()
    from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) e where nullif(e->>'formato_id', '')::uuid = any(v_keep)
  on conflict (tabela_id, programa_id, formato_id) do update set preco = excluded.preco;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set
    programas = coalesce((select array_agg(p.id order by p.ordem, p.nome) from public.produtos p where p.id in (select programa_id from public.precos where tabela_id = v_tab)), '{}'),
    formatos = coalesce((select array_agg(p.id order by p.ordem, p.nome) from public.produtos p where p.id in (select formato_id from public.precos where tabela_id = v_tab)), '{}')
  where id = v_tab;
  return v_id;
end; $function$;

revoke all on function public.tabela_produtos(uuid) from public, anon;
revoke all on function public.salvar_produto_radio(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.tabela_produtos(uuid) to authenticated;
grant execute on function public.salvar_produto_radio(uuid, jsonb, jsonb) to authenticated;

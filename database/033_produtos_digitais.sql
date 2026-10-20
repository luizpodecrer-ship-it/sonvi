-- SONVI · 033 · Produtos digitais (aprovado em 20/10/2026)
-- As rádios também vendem publicações nas redes sociais delas (Instagram, Facebook, TikTok…): post, carrossel, reels, stories.
-- Na tabela de preços entra a seção "digital": cada perfil da rádio é uma linha (produtos.tipo = 'programa', secao = 'digital')
-- e os formatos digitais são colunas próprias (produtos.tipo = 'formato', secao = 'digital'). Mesma tabela, vigência e publicação.
-- Na proposta o item digital tem quantidade por mês (sem dias nem faixa). No PI fica em dados.digital:
--   [{ id, period:'AAAA-MM', programa_id, formato_id, perfil, detalhe, formato, tema, qtd, unit }]
-- A rádio define as datas: depois de aprovado, quem cuida das redes (por enquanto diretor, gerente ou OPEC) marca a data
-- prevista e o "publicado" (com o link) de cada publicação em pis.entregas, só pela função marcar_entrega:
--   { "<id do item>": [ { data, publicado, link, por, em }, … ] }
-- O PI só fica "Programado" quando todas as publicações têm data. A produção do conteúdo já está no preço.

-- Seção digital (vale para perfis e para formatos)
do $$ begin
  execute 'alter table public.produtos ' || 'dr' || 'op constraint if exists produtos_secao_check';
end $$;
alter table public.produtos add constraint produtos_secao_check check (secao in ('programa', 'quadro', 'rotativo', 'digital'));

-- Totais e acompanhamento
alter table public.pis add column if not exists publicacoes integer not null default 0;   -- publicações digitais do PI (todas as linhas)
alter table public.pis add column if not exists entregas jsonb not null default '{}';     -- datas e links das publicações
alter table public.propostas add column if not exists publicacoes integer not null default 0; -- publicações por mês

-- Quantas publicações os dados do PI pedem (soma das quantidades em dados.digital)
create or replace function public.pi_publicacoes(p_dados jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(sum(case when (d ->> 'qtd') ~ '^\d+(\.\d+)?$' then floor((d ->> 'qtd')::numeric)::integer else 0 end), 0)::integer
  from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'digital') = 'array' then p_dados -> 'digital' else '[]'::jsonb end) d $$;

-- Quantas publicações já têm data marcada (só conta até a quantidade de cada item)
create or replace function public.pi_publicacoes_com_data(p_dados jsonb, p_entregas jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(sum(least(
    case when (d ->> 'qtd') ~ '^\d+(\.\d+)?$' then floor((d ->> 'qtd')::numeric)::integer else 0 end,
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(p_entregas -> (d ->> 'id')) = 'array' then p_entregas -> (d ->> 'id') else '[]'::jsonb end) x
     where coalesce(x ->> 'data', '') <> '')::integer)), 0)::integer
  from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'digital') = 'array' then p_dados -> 'digital' else '[]'::jsonb end) d $$;

-- Proteção do PI: publicações sempre conferem com os dados; fora do rascunho, as entregas só mudam por marcar_entrega
create or replace function public.pis_protege() returns trigger language plpgsql set search_path = '' as $$
begin
  new.publicacoes := public.pi_publicacoes(new.dados);
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
    if new.status = old.status and old.status not in ('rascunho', 'devolvido') and (
         (to_jsonb(new) - 'resultado' - 'atualizado_em' - 'entregas') is distinct from (to_jsonb(old) - 'resultado' - 'atualizado_em' - 'entregas')
         or (new.entregas is distinct from old.entregas and coalesce(current_setting('sonvi.entregas_rpc', true), '') <> '1')) then
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

-- Data prevista, publicado e link de uma publicação (n = 1, 2, … até a quantidade do item)
create or replace function public.marcar_entrega(p_pi uuid, p_item text, p_n integer, p_data date, p_publicado boolean, p_link text default '')
returns public.pis language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_perfil text; v_qtd integer; v_arr jsonb; v_data date := p_data;
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if coalesce(v_perfil, '') not in ('diretor', 'gerente', 'opec') then raise exception 'Seu perfil não marca as publicações'; end if;
  if v_pi.status not in ('aprovado', 'programado', 'faturado') then raise exception 'As publicações são marcadas depois que o PI é aprovado'; end if;
  select case when (d ->> 'qtd') ~ '^\d+(\.\d+)?$' then floor((d ->> 'qtd')::numeric)::integer else 0 end into v_qtd
  from jsonb_array_elements(coalesce(v_pi.dados -> 'digital', '[]'::jsonb)) d where d ->> 'id' = p_item limit 1;
  if v_qtd is null then raise exception 'Item digital não encontrado neste PI'; end if;
  if p_n is null or p_n < 1 or p_n > v_qtd then raise exception 'Publicação fora da quantidade do item'; end if;
  if coalesce(p_publicado, false) and v_data is null then v_data := public.hoje_radio(); end if;
  v_arr := case when jsonb_typeof(v_pi.entregas -> p_item) = 'array' then v_pi.entregas -> p_item else '[]'::jsonb end;
  while jsonb_array_length(v_arr) < v_qtd loop v_arr := v_arr || jsonb_build_array(jsonb_build_object('data', null, 'publicado', false, 'link', '')); end loop;
  v_arr := jsonb_set(v_arr, array[(p_n - 1)::text], jsonb_build_object('data', v_data, 'publicado', coalesce(p_publicado, false),
    'link', left(trim(coalesce(p_link, '')), 500), 'por', (select auth.uid()), 'em', now()));
  perform set_config('sonvi.entregas_rpc', '1', true);
  update public.pis set entregas = jsonb_set(case when jsonb_typeof(entregas) = 'object' then entregas else '{}'::jsonb end, array[p_item], v_arr)
    where id = p_pi returning * into v_pi;
  perform set_config('sonvi.entregas_rpc', '', true);
  return v_pi;
end;
$$;
revoke execute on function public.marcar_entrega(uuid, text, integer, date, boolean, text) from public, anon;
grant execute on function public.marcar_entrega(uuid, text, integer, date, boolean, text) to authenticated;
revoke execute on function public.pi_publicacoes(jsonb), public.pi_publicacoes_com_data(jsonb, jsonb) from public, anon;
grant execute on function public.pi_publicacoes(jsonb), public.pi_publicacoes_com_data(jsonb, jsonb) to authenticated;

-- Regras que contavam só inserções passam a aceitar publicações; Programado exige data em todas as publicações
do $$
declare f text;
begin
  f := pg_get_functiondef('public.mudar_status_pi(uuid, text, text)'::regprocedure);
  f := replace(f, 'or v_pi.insercoes = 0) then raise exception ''Informe o cliente e ao menos uma inserção antes de enviar para a OPEC'';',
    'or v_pi.insercoes + v_pi.publicacoes = 0) then raise exception ''Informe o cliente e ao menos uma inserção ou publicação antes de enviar para a OPEC''; end if;
  if p_status = ''programado'' and v_pi.publicacoes > public.pi_publicacoes_com_data(v_pi.dados, v_pi.entregas) then
    raise exception ''Antes de marcar como programado, defina a data de todas as publicações digitais'';');
  execute f;

  f := pg_get_functiondef('public.gerar_pi_da_proposta(uuid, text, jsonb, integer, numeric, numeric, numeric)'::regprocedure);
  f := replace(f, 'if coalesce(p_insercoes, 0) <= 0 then raise exception ''A distribuição não tem inserções'';',
    'if coalesce(p_insercoes, 0) + public.pi_publicacoes(p_dados) <= 0 then raise exception ''A distribuição não tem inserções nem publicações'';');
  execute f;

  f := pg_get_functiondef('public.mudar_situacao_proposta(uuid, text, text)'::regprocedure);
  f := replace(f, '(v.insercoes = 0 or jsonb_array_length(v.itens) = 0)', '(v.insercoes + v.publicacoes = 0 or jsonb_array_length(v.itens) = 0)');
  execute f;

  f := pg_get_functiondef('public.enviar_proposta(uuid, text, text, text, uuid)'::regprocedure);
  f := replace(f, 'if v.insercoes = 0 or jsonb_array_length(v.itens) = 0', 'if v.insercoes + v.publicacoes = 0 or jsonb_array_length(v.itens) = 0');
  execute f;
end $$;

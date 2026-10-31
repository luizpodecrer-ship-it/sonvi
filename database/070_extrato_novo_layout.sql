-- SONVI · extrato de comissão com o novo layout (aprovado em 31/10/2026, artifact "Extrato de comissão · layout").
-- 1) O link do extrato passa a existir também no mês aberto (prévia): comissao_previas guarda um token por consultor e mês e
--    o resumo de apoio (vendido, meta, comissão a caminho, clientes em atraso) da última vez que o diretor enviou. A comissão
--    e as parcelas da prévia são a conta do momento. Quando o mês fecha, o mesmo link mostra o extrato oficial.
-- 2) extrato_por_token devolve tudo o que a folha precisa: empresa (nome, logo, cores, slug), situação (prévia, fechado, paga),
--    parcelas com o veículo, os veículos (nome, sigla, cor) e o resumo.
create table if not exists public.comissao_previas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  usuario_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  resumo jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, mes, usuario_id)
);
alter table public.comissao_previas enable row level security;
drop policy if exists comissao_prev_ver on public.comissao_previas;
create policy comissao_prev_ver on public.comissao_previas for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
revoke all on public.comissao_previas from anon, authenticated;
grant select on public.comissao_previas to authenticated;

-- Link da prévia (só o diretor): cria ou atualiza e devolve o token
create or replace function public.extrato_previa_link(p_usuario uuid, p_mes text, p_resumo jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); v_token uuid;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor envia os extratos.'; end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
  if not exists (select 1 from public.colaboradores where usuario_id = p_usuario and organizacao_id = v_org) then raise exception 'Consultor não encontrado em Colaboradores.'; end if;
  insert into public.comissao_previas (organizacao_id, mes, usuario_id, resumo) values (v_org, p_mes, p_usuario, coalesce(p_resumo, '{}'))
  on conflict (organizacao_id, mes, usuario_id) do update set resumo = coalesce(excluded.resumo, '{}'), atualizado_em = now()
  returning token into v_token;
  return v_token;
end $$;

-- Contato do consultor (e-mail da prévia): agora com o slug da empresa, para o logo e o link
create or replace function public.comissao_contato(p_usuario uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.colaboradores; v_org uuid := public.minha_org();
begin
  if not public.eh_diretor() then raise exception 'Só o diretor envia os extratos.'; end if;
  select * into c from public.colaboradores where usuario_id = p_usuario and organizacao_id = v_org limit 1;
  if not found then raise exception 'Consultor não encontrado em Colaboradores.'; end if;
  return jsonb_build_object('nome', c.nome,
    'email', coalesce(nullif(trim(c.email), ''), (select email from public.usuarios where id = p_usuario), ''),
    'empresa', coalesce((select nome from public.empresa_comercial where organizacao_id = v_org limit 1), (select nome from public.organizacoes where id = v_org), ''),
    'slug', (select slug from public.organizacoes where id = v_org));
end $$;

create or replace function public.extrato_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.comissao_extratos; pv public.comissao_previas; f public.comissao_fechamentos; v_org uuid; v_uid uuid; v_mes text;
  v_itens jsonb; v_res jsonb; v_sit text; v_pago jsonb; v_fech timestamptz; v_emp jsonb; v_veics jsonb;
begin
  select * into e from public.comissao_extratos where token = p_token;
  if found then
    select * into f from public.comissao_fechamentos where id = e.fechamento_id;
    if f.situacao <> 'fechado' then return jsonb_build_object('reaberto', true); end if;
    v_org := e.organizacao_id; v_uid := e.usuario_id; v_mes := f.mes;
  else
    select * into pv from public.comissao_previas where token = p_token;
    if not found then return null; end if;
    v_org := pv.organizacao_id; v_uid := pv.usuario_id; v_mes := pv.mes;
    -- o mês fechou depois do envio: o mesmo link mostra o extrato oficial
    select * into f from public.comissao_fechamentos where organizacao_id = v_org and mes = v_mes and situacao = 'fechado';
  end if;
  if f.id is not null then
    v_itens := f.itens; v_res := coalesce(f.resumo -> v_uid::text, '{}'::jsonb); v_pago := f.pagos -> v_uid::text; v_fech := f.fechado_em;
    v_sit := case when v_pago is not null then 'paga' else 'fechado' end;
  else
    v_itens := public.comissao_parcelas_vivas(v_org, v_mes); v_res := coalesce(pv.resumo, '{}'::jsonb); v_sit := 'previa';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('pago_em', i -> 'pago_em', 'cliente', i -> 'cliente', 'pi_no', i -> 'pi_no', 'mes_ref', i -> 'mes_ref', 'veiculo_id', i -> 'veiculo_id',
      'liquido', i -> 'liquido', 'valor_pago', i -> 'valor_pago', 'pct', i -> 'pct', 'comissao', i -> 'comissao') order by i ->> 'pago_em'), '[]'::jsonb) into v_itens
  from jsonb_array_elements(v_itens) i where (i ->> 'consultor_id')::uuid = v_uid;
  select coalesce(jsonb_object_agg(v.id::text, jsonb_build_object('nome', v.nome, 'sigla', v.sigla, 'cor', v.cor)), '{}'::jsonb) into v_veics
  from public.veiculos v where v.organizacao_id = v_org and v.id::text in (select i ->> 'veiculo_id' from jsonb_array_elements(v_itens) i);
  select jsonb_build_object('nome', coalesce(ec.nome, o.nome), 'logo', coalesce(ec.logo, ''), 'cor', coalesce(ec.cor, ''), 'cor2', coalesce(ec.cor2, ''), 'cidade', coalesce(ec.cidade, ''), 'slug', o.slug)
    into v_emp from public.organizacoes o left join public.empresa_comercial ec on ec.organizacao_id = o.id where o.id = v_org limit 1;
  return jsonb_build_object('mes', v_mes, 'situacao', v_sit, 'fechado_em', v_fech, 'pago_em', v_pago, 'empresa', v_emp,
    'nome', coalesce((select nome from public.colaboradores where usuario_id = v_uid and organizacao_id = v_org limit 1), v_res ->> 'nome', ''),
    'resumo', v_res, 'itens', v_itens, 'veiculos', v_veics);
end $$;

revoke all on function public.extrato_previa_link(uuid, text, jsonb), public.extrato_por_token(uuid), public.comissao_contato(uuid) from public, anon;
grant execute on function public.extrato_previa_link(uuid, text, jsonb), public.comissao_contato(uuid), public.extrato_por_token(uuid) to authenticated;
grant execute on function public.extrato_por_token(uuid) to anon;   -- página pública do extrato (de propósito)

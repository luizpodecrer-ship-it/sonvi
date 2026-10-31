-- SONVI · Vendas e comissões (aprovado em 31/10/2026, artifact "Vendas e comissões").
-- Administração › Pessoas › Vendas e comissões: vendas de cada consultor mês a mês, comissão e o fechamento do mês.
-- Comissão = percentual cadastrado do consultor (colaboradores.comissao, com exceção por veículo em comissao_veiculos)
--            × valor líquido que o cliente pagou, no mês do pagamento. Vale o percentual em vigor quando o PI nasceu
--            (colaborador_comissoes guarda cada mudança; mudar o percentual vale só para as vendas novas).
-- Fechamento (só o diretor): congela as parcelas do mês (itens) e o resumo por consultor; o que for pago depois, de um mês
-- fechado, entra no primeiro mês aberto seguinte. Reabrir pede motivo e fica no histórico (a linha fica como "reaberto").
-- Extrato por consultor: link seguro sem login (extrato.html?e=<token>), e-mail com o PDF e WhatsApp com o link.

create table if not exists public.comissao_fechamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  situacao text not null default 'fechado' check (situacao in ('fechado', 'reaberto')),
  fechado_em timestamptz not null default now(),
  fechado_por uuid,
  itens jsonb not null default '[]',
  resumo jsonb not null default '{}',
  pagos jsonb not null default '{}',
  reaberto_em timestamptz,
  reaberto_por uuid,
  motivo text not null default ''
);
create unique index if not exists comissao_fechamentos_um_por_mes on public.comissao_fechamentos (organizacao_id, mes) where situacao = 'fechado';
create index if not exists comissao_fechamentos_org on public.comissao_fechamentos (organizacao_id, mes);

create table if not exists public.comissao_extratos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.comissao_fechamentos(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  envios jsonb not null default '[]',
  criado_em timestamptz not null default now(),
  unique (fechamento_id, usuario_id)
);

alter table public.comissao_fechamentos enable row level security;
alter table public.comissao_extratos enable row level security;
drop policy if exists comissao_fech_ver on public.comissao_fechamentos;
create policy comissao_fech_ver on public.comissao_fechamentos for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
drop policy if exists comissao_ext_ver on public.comissao_extratos;
create policy comissao_ext_ver on public.comissao_extratos for select to authenticated using (organizacao_id = public.minha_org() and public.ve_colaboradores());
revoke all on public.comissao_fechamentos, public.comissao_extratos from anon;
revoke all on public.comissao_fechamentos, public.comissao_extratos from authenticated;
grant select on public.comissao_fechamentos, public.comissao_extratos to authenticated;

-- Percentual em vigor numa data (mesma regra de comissao_vigente, sem a conferência de quem chama: uso interno)
create or replace function public.comissao_pct_em(p_usuario uuid, p_org uuid, p_veiculo uuid, p_data timestamptz)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(h.por_veiculo ->> p_veiculo::text, '')::numeric, h.padrao)
  from public.colaboradores c join public.colaborador_comissoes h on h.colaborador_id = c.id
  where c.usuario_id = p_usuario and c.organizacao_id = p_org
  order by (h.desde <= p_data) desc, case when h.desde <= p_data then h.desde end desc nulls last, h.desde asc limit 1;
$$;

-- Parcelas pagas que entram no mês (ainda não congeladas): pagas no mês, e as pagas antes cujo mês já estava fechado
-- (entram no primeiro mês aberto). Uso interno.
create or replace function public.comissao_parcelas_vivas(p_org uuid, p_mes text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with fech as (select mes, itens from public.comissao_fechamentos where organizacao_id = p_org and situacao = 'fechado'),
  congelados as (select (i ->> 'lancamento_id')::uuid id from fech, jsonb_array_elements(fech.itens) i),
  l as (
    select l.id, l.pago_em, coalesce(l.valor_pago, l.valor) as valor_pago, l.veiculo_id, l.pi_id, l.contraparte, l.mes_ref, l.parcela,
      to_char(l.pago_em, 'YYYY-MM') as mp, p.numero, p.titulo, p.consultor_id, p.criado_em as pi_criado, p.valor_total, p.valor_liquido,
      p.agencia_id, coalesce(p.dados -> 'billing' ->> 'type', '10') as fat_tipo, v.sigla, cli.nome as cliente
    from public.lancamentos l join public.pis p on p.id = l.pi_id join public.veiculos v on v.id = l.veiculo_id
    left join public.pessoas cli on cli.id = p.cliente_id
    where v.organizacao_id = p_org and l.sentido = 'receber' and l.pago_em is not null
      and l.pago_em < ((p_mes || '-01')::date + interval '1 month')
      and not exists (select 1 from congelados c where c.id = l.id)
  ),
  dentro as (
    select l.* from l
    where l.mp = p_mes or (l.mp < p_mes and not exists (select 1 from fech where fech.mes = p_mes)
      and (select count(*) from fech where fech.mes >= l.mp and fech.mes < p_mes)
        = ((left(p_mes, 4)::int * 12 + right(p_mes, 2)::int) - (left(l.mp, 4)::int * 12 + right(l.mp, 2)::int)))
  ),
  calc as (
    select d.*,
      least(1, case when d.agencia_id is null or d.fat_tipo = '20' then case when d.valor_total > 0 then coalesce(d.valor_liquido, d.valor_total) / d.valor_total else 1 end else 1 end) as fator,
      case when d.consultor_id is null then null else public.comissao_pct_em(d.consultor_id, p_org, d.veiculo_id, d.pi_criado) end as pct
    from dentro d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'lancamento_id', c.id, 'pago_em', c.pago_em, 'mes_pago', c.mp, 'valor_pago', round(c.valor_pago, 2), 'veiculo_id', c.veiculo_id, 'pi_id', c.pi_id,
    'pi_no', 'PI ' || coalesce(c.sigla, '') || ' ' || lpad(c.numero::text, 4, '0'), 'pi_titulo', coalesce(c.titulo, ''), 'cliente', coalesce(c.cliente, c.contraparte, ''),
    'mes_ref', coalesce(c.mes_ref, ''), 'parcela', c.parcela, 'consultor_id', c.consultor_id, 'pi_criado', c.pi_criado,
    'liquido', round(c.valor_pago * c.fator, 2), 'pct', c.pct, 'comissao', round(c.valor_pago * c.fator * coalesce(c.pct, 0) / 100, 2))
    order by c.pago_em, c.numero), '[]'::jsonb)
  from calc c;
$$;
revoke all on function public.comissao_pct_em(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.comissao_parcelas_vivas(uuid, text) from public, anon, authenticated;

-- Comissões de um mês: o que está congelado (mês fechado) ou a conta do momento (mês aberto).
-- Diretor e financeiro veem todos; o consultor, só as próprias parcelas e o próprio fechamento.
create or replace function public.comissoes_do_mes(p_mes text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); v_todos boolean := public.ve_colaboradores(); v_eu uuid := (select auth.uid());
  f public.comissao_fechamentos; v_itens jsonb; v_hist jsonb; v_ext jsonb;
begin
  if v_org is null or v_eu is null then raise exception 'Entre no sistema.'; end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
  select * into f from public.comissao_fechamentos where organizacao_id = v_org and mes = p_mes and situacao = 'fechado';
  v_itens := case when f.id is not null then f.itens else public.comissao_parcelas_vivas(v_org, p_mes) end;
  if not v_todos then
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_itens from jsonb_array_elements(v_itens) i where (i ->> 'consultor_id')::uuid = v_eu;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fechado_em', h.fechado_em, 'fechado_por', h.fechado_por, 'reaberto_em', h.reaberto_em, 'reaberto_por', h.reaberto_por, 'motivo', h.motivo) order by h.reaberto_em), '[]'::jsonb)
    into v_hist from public.comissao_fechamentos h where h.organizacao_id = v_org and h.mes = p_mes and h.situacao = 'reaberto' and v_todos;
  if f.id is not null then
    select coalesce(jsonb_object_agg(e.usuario_id::text, jsonb_build_object('id', e.id, 'token', e.token, 'envios', e.envios)), '{}'::jsonb) into v_ext
    from public.comissao_extratos e where e.fechamento_id = f.id and (v_todos or e.usuario_id = v_eu);
  end if;
  return jsonb_build_object('mes', p_mes, 'itens', v_itens, 'reaberturas', v_hist,
    'fechamento', case when f.id is null then null else jsonb_build_object('id', f.id, 'fechado_em', f.fechado_em, 'fechado_por', f.fechado_por,
      'resumo', case when v_todos then f.resumo else coalesce(jsonb_build_object(v_eu::text, f.resumo -> v_eu::text), '{}'::jsonb) end,
      'pagos', case when v_todos then f.pagos else jsonb_strip_nulls(jsonb_build_object(v_eu::text, f.pagos -> v_eu::text)) end,
      'extratos', coalesce(v_ext, '{}'::jsonb)) end);
end $$;

-- Comissão por consultor e mês num intervalo (gráfico de 12 meses). Mesmo acesso de comissoes_do_mes.
create or replace function public.comissoes_periodo(p_de text, p_ate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); v_todos boolean := public.ve_colaboradores(); v_eu uuid := (select auth.uid());
  m date; v_mes text; v_itens jsonb; v_out jsonb := '[]'::jsonb; v_fech boolean;
begin
  if v_org is null or v_eu is null then raise exception 'Entre no sistema.'; end if;
  if p_de !~ '^\d{4}-\d{2}$' or p_ate !~ '^\d{4}-\d{2}$' or p_de > p_ate then raise exception 'Período inválido.'; end if;
  m := (p_de || '-01')::date;
  while m <= (p_ate || '-01')::date loop
    v_mes := to_char(m, 'YYYY-MM');
    select itens into v_itens from public.comissao_fechamentos where organizacao_id = v_org and mes = v_mes and situacao = 'fechado';
    v_fech := found;
    if not v_fech then v_itens := public.comissao_parcelas_vivas(v_org, v_mes); end if;
    v_out := v_out || coalesce((select jsonb_agg(jsonb_build_object('mes', v_mes, 'fechado', v_fech, 'consultor_id', x.cid, 'recebido', x.rec, 'liquido', x.liq, 'comissao', x.com))
      from (select (i ->> 'consultor_id')::uuid cid, sum((i ->> 'valor_pago')::numeric) rec, sum((i ->> 'liquido')::numeric) liq, sum((i ->> 'comissao')::numeric) com
            from jsonb_array_elements(v_itens) i where v_todos or (i ->> 'consultor_id')::uuid = v_eu group by 1) x), '[]'::jsonb);
    m := m + interval '1 month';
  end loop;
  return v_out;
end $$;

-- Percentual de comissão em vigor hoje de cada consultor, por veículo (Dashboards, metas). Diretor, financeiro e gerente
-- (dos veículos em que é gerente) veem a equipe; o consultor, só o dele.
create or replace function public.comissoes_pct()
returns table(usuario_id uuid, veiculo_id uuid, pct numeric) language sql stable security definer set search_path = '' as $$
  select c.usuario_id, v::uuid, public.comissao_pct_em(c.usuario_id, c.organizacao_id, v::uuid, now())
  from public.colaboradores c, unnest(c.veiculos) v
  where c.organizacao_id = public.minha_org() and c.funcao = 'consultor' and c.usuario_id is not null
    and (public.ve_colaboradores() or c.usuario_id = (select auth.uid()) or public.perfil_no_veiculo(v::uuid) = 'gerente');
$$;

-- Fechar o mês (só o diretor). p_resumo: números de apoio por consultor que a tela calcula (vendido bruto e líquido, meta),
-- guardados para o extrato. A comissão e as parcelas vêm do banco.
create or replace function public.fechar_comissoes(p_mes text, p_resumo jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); v_id uuid; v_itens jsonb; v_res jsonb := '{}'::jsonb; r record;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor fecha as comissões.'; end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
  if p_mes > to_char(now() at time zone 'America/Cuiaba', 'YYYY-MM') then raise exception 'Este mês ainda não começou.'; end if;
  if exists (select 1 from public.comissao_fechamentos where organizacao_id = v_org and mes = p_mes and situacao = 'fechado') then raise exception 'Este mês já está fechado.'; end if;
  v_itens := public.comissao_parcelas_vivas(v_org, p_mes);
  for r in select (i ->> 'consultor_id')::uuid cid, sum((i ->> 'valor_pago')::numeric) rec, sum((i ->> 'liquido')::numeric) liq, sum((i ->> 'comissao')::numeric) com, count(*) n
           from jsonb_array_elements(v_itens) i where i ->> 'consultor_id' is not null group by 1 loop
    v_res := v_res || jsonb_build_object(r.cid::text, coalesce(p_resumo -> r.cid::text, '{}'::jsonb) || jsonb_build_object('recebido', r.rec, 'liquido_pago', r.liq, 'comissao', r.com, 'parcelas', r.n,
      'nome', coalesce((select nome from public.colaboradores where usuario_id = r.cid and organizacao_id = v_org limit 1), (select nome from public.usuarios where id = r.cid), '')));
  end loop;
  -- consultores sem parcela paga no mês, mas com vendas (aparecem no extrato com comissão zero)
  for r in select key from jsonb_each(coalesce(p_resumo, '{}'::jsonb)) where not (v_res ? key) and key ~ '^[0-9a-f-]{36}$' loop
    if exists (select 1 from public.colaboradores where usuario_id = r.key::uuid and organizacao_id = v_org) then
      v_res := v_res || jsonb_build_object(r.key, (p_resumo -> r.key) || jsonb_build_object('recebido', 0, 'liquido_pago', 0, 'comissao', 0, 'parcelas', 0,
        'nome', (select nome from public.colaboradores where usuario_id = r.key::uuid and organizacao_id = v_org limit 1)));
    end if;
  end loop;
  insert into public.comissao_fechamentos (organizacao_id, mes, fechado_por, itens, resumo)
  values (v_org, p_mes, (select auth.uid()), v_itens, v_res) returning id into v_id;
  insert into public.comissao_extratos (fechamento_id, organizacao_id, usuario_id)
  select v_id, v_org, key::uuid from jsonb_each(v_res);
  return v_id;
end $$;

create or replace function public.reabrir_comissoes(p_mes text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_diretor() then raise exception 'Só o diretor reabre as comissões.'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo para reabrir.'; end if;
  update public.comissao_fechamentos set situacao = 'reaberto', reaberto_em = now(), reaberto_por = (select auth.uid()), motivo = trim(p_motivo)
  where organizacao_id = public.minha_org() and mes = p_mes and situacao = 'fechado';
  if not found then raise exception 'Este mês não está fechado.'; end if;
end $$;

-- Marca (ou desmarca, com data vazia) a comissão como paga ao consultor
create or replace function public.comissoes_pagas(p_mes text, p_usuarios uuid[], p_data date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pagos jsonb; u uuid;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor marca o pagamento das comissões.'; end if;
  select pagos into v_pagos from public.comissao_fechamentos where organizacao_id = public.minha_org() and mes = p_mes and situacao = 'fechado';
  if not found then raise exception 'Feche o mês antes de marcar o pagamento.'; end if;
  foreach u in array coalesce(p_usuarios, '{}') loop
    v_pagos := case when p_data is null then v_pagos - u::text else v_pagos || jsonb_build_object(u::text, p_data) end;
  end loop;
  update public.comissao_fechamentos set pagos = v_pagos where organizacao_id = public.minha_org() and mes = p_mes and situacao = 'fechado';
end $$;

-- Dados para enviar o extrato (tela e função de borda "comissoes"): só o diretor
create or replace function public.extrato_para_envio(p_extrato uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.comissao_extratos; f public.comissao_fechamentos; c public.colaboradores;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor envia os extratos.'; end if;
  select * into e from public.comissao_extratos where id = p_extrato and organizacao_id = public.minha_org();
  if not found then raise exception 'Extrato não encontrado.'; end if;
  select * into f from public.comissao_fechamentos where id = e.fechamento_id;
  if f.situacao <> 'fechado' then raise exception 'O mês foi reaberto: feche de novo para enviar.'; end if;
  select * into c from public.colaboradores where usuario_id = e.usuario_id and organizacao_id = e.organizacao_id limit 1;
  return jsonb_build_object('id', e.id, 'token', e.token, 'mes', f.mes, 'usuario_id', e.usuario_id,
    'nome', coalesce(c.nome, (select nome from public.usuarios where id = e.usuario_id), ''),
    'email', coalesce(nullif(trim(c.email), ''), (select email from public.usuarios where id = e.usuario_id), ''),
    'celular', coalesce(nullif(trim(c.celular), ''), (select celular from public.usuarios where id = e.usuario_id), ''),
    'comissao', coalesce((f.resumo -> e.usuario_id::text ->> 'comissao')::numeric, 0),
    'empresa', coalesce((select nome from public.empresa_comercial where organizacao_id = e.organizacao_id limit 1), (select nome from public.organizacoes where id = e.organizacao_id), ''),
    'slug', (select slug from public.organizacoes where id = e.organizacao_id));
end $$;

create or replace function public.extrato_registrar_envio(p_extrato uuid, p_canal text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_diretor() then raise exception 'Só o diretor envia os extratos.'; end if;
  if p_canal not in ('email', 'whatsapp', 'pdf') then raise exception 'Canal inválido.'; end if;
  update public.comissao_extratos set envios = envios || jsonb_build_array(jsonb_build_object('canal', p_canal, 'em', now(), 'por', (select auth.uid())))
  where id = p_extrato and organizacao_id = public.minha_org();
end $$;

-- Página pública do extrato (extrato.html?e=<token>), sem login: só o extrato daquele consultor, de um mês fechado
create or replace function public.extrato_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.comissao_extratos; f public.comissao_fechamentos; v_itens jsonb;
begin
  select * into e from public.comissao_extratos where token = p_token;
  if not found then return null; end if;
  select * into f from public.comissao_fechamentos where id = e.fechamento_id;
  if f.situacao <> 'fechado' then return jsonb_build_object('reaberto', true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('pago_em', i -> 'pago_em', 'cliente', i -> 'cliente', 'pi_no', i -> 'pi_no', 'liquido', i -> 'liquido', 'pct', i -> 'pct', 'comissao', i -> 'comissao')
    order by i ->> 'pago_em'), '[]'::jsonb) into v_itens
  from jsonb_array_elements(f.itens) i where (i ->> 'consultor_id')::uuid = e.usuario_id;
  return jsonb_build_object('mes', f.mes, 'fechado_em', f.fechado_em, 'pago_em', f.pagos -> e.usuario_id::text,
    'empresa', coalesce((select nome from public.empresa_comercial where organizacao_id = e.organizacao_id limit 1), (select nome from public.organizacoes where id = e.organizacao_id), ''),
    'resumo', f.resumo -> e.usuario_id::text, 'itens', v_itens);
end $$;

revoke all on function public.comissoes_do_mes(text), public.comissoes_periodo(text, text), public.comissoes_pct(), public.fechar_comissoes(text, jsonb),
  public.reabrir_comissoes(text, text), public.comissoes_pagas(text, uuid[], date), public.extrato_para_envio(uuid), public.extrato_registrar_envio(uuid, text),
  public.extrato_por_token(uuid) from public, anon;
grant execute on function public.comissoes_do_mes(text), public.comissoes_periodo(text, text), public.comissoes_pct(), public.fechar_comissoes(text, jsonb),
  public.reabrir_comissoes(text, text), public.comissoes_pagas(text, uuid[], date), public.extrato_para_envio(uuid), public.extrato_registrar_envio(uuid, text),
  public.extrato_por_token(uuid) to authenticated;
grant execute on function public.extrato_por_token(uuid) to anon;   -- página pública do extrato (de propósito)

-- Lixeira: o fechamento apagado (ao excluir a organização) entra como as outras tabelas
do $$ begin
  if exists (select 1 from pg_proc where proname = 'lixeira_guarda') then
    drop trigger if exists lixeira_guarda on public.comissao_fechamentos;
    create trigger lixeira_guarda before delete on public.comissao_fechamentos for each row execute function public.lixeira_guarda();
  end if;
end $$;

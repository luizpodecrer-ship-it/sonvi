-- 088 · Follow-up novo: funil, registro com valor/interesse/local, prospect rápido, comentário e troca de dono
-- (aprovado pelo Luiz em 11/11/2026, modelos "Follow-up novo · modelo" e "Follow-up da equipe · modelo")
-- Etapas: prospeccao · primeiro_contato · reuniao · proposta · negociacao · fechou · perdeu.
-- Uma oportunidade aberta por cliente; cada contato da agenda aponta para ela (agenda.oportunidade_id).

-- ── 1. Oportunidades (o funil) ───────────────────────────────────────────────
create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  cliente_id uuid not null references public.pessoas(id) on delete cascade,
  consultor_id uuid references public.usuarios(id) on delete set null,
  etapa text not null default 'prospeccao' check (etapa in ('prospeccao', 'primeiro_contato', 'reuniao', 'proposta', 'negociacao', 'fechou', 'perdeu')),
  valor numeric(14, 2),
  interesses text[] not null default '{}',
  motivo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  fechado_em timestamptz
);
create unique index if not exists oportunidades_uma_aberta on public.oportunidades (cliente_id) where etapa not in ('fechou', 'perdeu');
create index if not exists oportunidades_veiculo on public.oportunidades (veiculo_id, etapa);
create index if not exists oportunidades_consultor on public.oportunidades (consultor_id);
alter table public.oportunidades enable row level security;
create policy oportunidades_ver on public.oportunidades for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy oportunidades_criar on public.oportunidades for insert to authenticated with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy oportunidades_alterar on public.oportunidades for update to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())))
  with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy oportunidades_excluir on public.oportunidades for delete to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));

-- ── 2. Agenda: oportunidade e local da visita ────────────────────────────────
alter table public.agenda add column if not exists oportunidade_id uuid references public.oportunidades(id) on delete set null;
alter table public.agenda add column if not exists local_lat numeric(9, 6);
alter table public.agenda add column if not exists local_lng numeric(9, 6);
alter table public.agenda add column if not exists local_precisao numeric(8, 1);
create index if not exists agenda_oportunidade on public.agenda (oportunidade_id);

-- ── 3. Comentários do diretor (o consultor vê no Follow-up dele) ─────────────
create table if not exists public.followup_comentarios (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  para_id uuid references public.usuarios(id) on delete cascade,
  autor_id uuid references public.usuarios(id) on delete set null default auth.uid(),
  agenda_id uuid references public.agenda(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 1000),
  criado_em timestamptz not null default now(),
  lido_em timestamptz
);
create index if not exists followup_comentarios_para on public.followup_comentarios (para_id, lido_em);
alter table public.followup_comentarios enable row level security;
create policy followup_comentarios_ver on public.followup_comentarios for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or para_id = (select auth.uid()));
create policy followup_comentarios_lido on public.followup_comentarios for update to authenticated using (para_id = (select auth.uid())) with check (para_id = (select auth.uid()));
-- criar só pela função comentar_followup

-- ── 4. Etapa automática a partir da resposta do cliente ──────────────────────
create or replace function public.etapa_pela_resposta(p_atual text, p_situacao text, p_resposta text, p_tipo text)
returns text language sql immutable set search_path to '' as $$
  select case
    when p_resposta = 'fechou' then 'fechou'
    when p_resposta = 'sem_interesse' then 'perdeu'
    when p_resposta = 'proposta' then case when p_atual in ('negociacao') then p_atual else 'proposta' end
    when p_resposta in ('interessado', 'retorno') then
      case when p_atual in ('proposta', 'negociacao') then p_atual
           when p_tipo in ('visita', 'reuniao') then 'reuniao'
           when p_atual = 'reuniao' then 'reuniao'
           else 'primeiro_contato' end
    else coalesce(p_atual, 'prospeccao') end;
$$;

-- ── 5. Registrar contato (troca a versão de 020): etapa, valor, interesse e local ─
drop function if exists public.registrar_followup(uuid, text, text, text, text, timestamptz, text, text);
create or replace function public.registrar_followup(p_id uuid, p_situacao text, p_resposta text, p_resultado text, p_motivo text,
  p_proximo timestamptz, p_proximo_tipo text, p_proximo_assunto text,
  p_etapa text default null, p_valor numeric default null, p_interesses text[] default null,
  p_lat numeric default null, p_lng numeric default null, p_precisao numeric default null)
returns public.agenda language plpgsql set search_path to '' as $$
declare a public.agenda; r public.agenda; o public.oportunidades; v_etapa text;
begin
  select * into a from public.agenda where id = p_id for update;
  if not found then raise exception 'Contato não encontrado'; end if;
  if a.situacao <> 'agendado' then raise exception 'Este contato já foi registrado'; end if;
  if p_situacao not in ('realizado', 'nao_atendeu', 'cancelado') then raise exception 'Situação inválida'; end if;
  if p_situacao = 'realizado' and coalesce(p_resposta, '') = '' then raise exception 'Escolha o que o cliente respondeu'; end if;
  if p_situacao <> 'realizado' then p_resposta := null; end if;
  if (p_situacao = 'nao_atendeu' or p_resposta in ('interessado', 'retorno', 'proposta')) and p_proximo is null then
    raise exception 'Marque a data do próximo contato'; end if;
  if p_resposta = 'sem_interesse' and coalesce(trim(p_motivo), '') = '' then raise exception 'Escolha o motivo'; end if;
  if p_proximo is not null and coalesce(p_proximo_tipo, '') not in ('visita', 'ligacao', 'whatsapp', 'reuniao') then raise exception 'Tipo do próximo contato inválido'; end if;
  if p_etapa is not null and p_etapa not in ('prospeccao', 'primeiro_contato', 'reuniao', 'proposta', 'negociacao', 'fechou', 'perdeu') then raise exception 'Etapa inválida'; end if;
  if p_resposta in ('sem_interesse', 'fechou') or p_etapa in ('fechou', 'perdeu') then p_proximo := null; end if;

  update public.agenda set situacao = p_situacao, resposta = p_resposta, resultado = coalesce(p_resultado, ''),
    motivo = case when p_resposta = 'sem_interesse' then coalesce(p_motivo, '') else '' end,
    realizado = true, registrado_em = now(), proxima_data = (p_proximo at time zone 'America/Cuiaba')::date,
    local_lat = case when a.tipo = 'visita' and p_situacao = 'realizado' then p_lat end,
    local_lng = case when a.tipo = 'visita' and p_situacao = 'realizado' then p_lng end,
    local_precisao = case when a.tipo = 'visita' and p_situacao = 'realizado' then p_precisao end
  where id = p_id returning * into r;
  if r.id is null then raise exception 'Seu perfil não pode registrar este contato'; end if;

  -- A oportunidade do cliente: a do contato, ou a aberta, ou uma nova
  if a.cliente_id is not null then
    if a.oportunidade_id is not null then select * into o from public.oportunidades where id = a.oportunidade_id; end if;
    if o.id is null or o.etapa in ('fechou', 'perdeu') then
      select * into o from public.oportunidades where cliente_id = a.cliente_id and etapa not in ('fechou', 'perdeu') limit 1; end if;
    if o.id is null and p_situacao <> 'cancelado' then
      insert into public.oportunidades (veiculo_id, cliente_id, consultor_id, etapa) values (a.veiculo_id, a.cliente_id, a.consultor_id, 'prospeccao') returning * into o; end if;
    if o.id is not null then
      v_etapa := coalesce(p_etapa, public.etapa_pela_resposta(o.etapa, p_situacao, p_resposta, a.tipo));
      update public.oportunidades set etapa = v_etapa, atualizado_em = now(),
        valor = coalesce(p_valor, valor), interesses = coalesce(p_interesses, interesses),
        motivo = case when v_etapa = 'perdeu' then coalesce(nullif(trim(p_motivo), ''), motivo) else motivo end,
        fechado_em = case when v_etapa in ('fechou', 'perdeu') then coalesce(fechado_em, now()) else null end
      where id = o.id returning * into o;
      update public.agenda set oportunidade_id = o.id where id = r.id returning * into r;
    end if;
  end if;

  if p_proximo is not null then
    insert into public.agenda (veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, origem_id, proposta_id, oportunidade_id)
    values (a.veiculo_id, a.consultor_id, a.cliente_id, p_proximo_tipo, p_proximo, coalesce(p_proximo_assunto, ''), a.id, a.proposta_id,
      case when o.etapa in ('fechou', 'perdeu') then null else o.id end);
  end if;
  return r;
end;
$$;

-- ── 6. Novo prospect (cadastro rápido): cliente "prospect" no veículo, oportunidade e o primeiro contato ─
create or replace function public.novo_prospect(p_veiculo uuid, p_nome text, p_contato text, p_telefone text, p_valor numeric, p_interesses text[],
  p_tipo text, p_quando timestamptz, p_assunto text, p_consultor uuid default null)
returns uuid language plpgsql set search_path to '' as $$
declare v_perfil text := public.perfil_no_veiculo(p_veiculo); v_cons uuid; v_cli uuid; v_op uuid; v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if v_perfil is null or v_perfil not in ('diretor', 'gerente', 'consultor') then raise exception 'Seu perfil não pode cadastrar prospect neste veículo'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da empresa'; end if;
  if coalesce(p_tipo, '') not in ('visita', 'ligacao', 'whatsapp', 'reuniao') then raise exception 'Escolha o tipo do primeiro contato'; end if;
  if p_quando is null then raise exception 'Marque a data do primeiro contato'; end if;
  v_cons := case when v_perfil = 'consultor' then (select auth.uid()) else p_consultor end;
  if exists (select 1 from public.pessoas where veiculo_id = p_veiculo and tipo = 'cliente' and upper(trim(nome)) = upper(trim(p_nome))) then
    raise exception 'Já existe um cliente com esse nome neste veículo. Agende o contato a partir dele.'; end if;
  insert into public.pessoas (veiculo_id, tipo, pessoa, nome, contato_decide, telefone, whatsapp, situacao, consultor_id)
  values (p_veiculo, 'cliente', 'pj', upper(trim(p_nome)), coalesce(trim(p_contato), ''), v_tel, v_tel, 'prospect', v_cons) returning id into v_cli;
  insert into public.oportunidades (veiculo_id, cliente_id, consultor_id, etapa, valor, interesses)
  values (p_veiculo, v_cli, v_cons, 'prospeccao', p_valor, coalesce(p_interesses, '{}')) returning id into v_op;
  insert into public.agenda (veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, oportunidade_id)
  values (p_veiculo, coalesce(v_cons, (select auth.uid())), v_cli, p_tipo, p_quando, coalesce(p_assunto, ''), v_op);
  return v_cli;
end;
$$;

-- ── 7. Mover a oportunidade de etapa (arrastar no funil) ─────────────────────
create or replace function public.mover_oportunidade(p_id uuid, p_etapa text, p_motivo text default '')
returns public.oportunidades language plpgsql set search_path to '' as $$
declare o public.oportunidades;
begin
  if p_etapa not in ('prospeccao', 'primeiro_contato', 'reuniao', 'proposta', 'negociacao', 'fechou', 'perdeu') then raise exception 'Etapa inválida'; end if;
  if p_etapa = 'perdeu' and coalesce(trim(p_motivo), '') = '' then raise exception 'Escolha o motivo'; end if;
  update public.oportunidades set etapa = p_etapa, atualizado_em = now(), motivo = case when p_etapa = 'perdeu' then trim(p_motivo) else motivo end,
    fechado_em = case when p_etapa in ('fechou', 'perdeu') then coalesce(fechado_em, now()) else null end
  where id = p_id returning * into o;
  if o.id is null then raise exception 'Seu perfil não pode mudar esta oportunidade'; end if;
  return o;
end;
$$;

-- ── 8. Comentário do diretor/gerente num contato ou numa oportunidade ────────
create or replace function public.comentar_followup(p_agenda uuid, p_oportunidade uuid, p_texto text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_vei uuid; v_para uuid; v_id uuid;
begin
  if p_agenda is not null then select veiculo_id, consultor_id into v_vei, v_para from public.agenda where id = p_agenda;
  elsif p_oportunidade is not null then select veiculo_id, consultor_id into v_vei, v_para from public.oportunidades where id = p_oportunidade; end if;
  if v_vei is null then raise exception 'Contato não encontrado'; end if;
  if coalesce(public.perfil_no_veiculo(v_vei), '') not in ('diretor', 'gerente') then raise exception 'Só o diretor ou o gerente comenta no follow-up'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a orientação'; end if;
  insert into public.followup_comentarios (veiculo_id, para_id, autor_id, agenda_id, oportunidade_id, texto)
  values (v_vei, v_para, (select auth.uid()), p_agenda, p_oportunidade, trim(p_texto)) returning id into v_id;
  return v_id;
end;
$$;

-- ── 9. Passar um cliente para outro consultor do mesmo veículo ───────────────
create or replace function public.passar_cliente(p_cliente uuid, p_novo uuid, p_levar boolean default true)
returns void language plpgsql security definer set search_path to '' as $$
declare v_vei uuid;
begin
  select veiculo_id into v_vei from public.pessoas where id = p_cliente and tipo = 'cliente';
  if v_vei is null then raise exception 'Cliente não encontrado'; end if;
  if coalesce(public.perfil_no_veiculo(v_vei), '') not in ('diretor', 'gerente') then raise exception 'Só o diretor ou o gerente passa clientes'; end if;
  if not exists (select 1 from public.usuarios u where u.id = p_novo and u.ativo and u.organizacao_id = (select organizacao_id from public.veiculos where id = v_vei)
                 and (u.diretor or exists (select 1 from public.usuario_veiculos uv where uv.usuario_id = u.id and uv.veiculo_id = v_vei and uv.perfil in ('consultor', 'gerente')))) then
    raise exception 'Escolha alguém que atende este veículo'; end if;
  update public.pessoas set consultor_id = p_novo where id = p_cliente;
  update public.oportunidades set consultor_id = p_novo, atualizado_em = now() where cliente_id = p_cliente and etapa not in ('fechou', 'perdeu');
  if p_levar then update public.agenda set consultor_id = p_novo where cliente_id = p_cliente and situacao = 'agendado';
  else update public.agenda set situacao = 'cancelado', registrado_em = now(), resultado = 'Cancelado ao passar o cliente para outro consultor' where cliente_id = p_cliente and situacao = 'agendado'; end if;
end;
$$;

revoke all on function public.etapa_pela_resposta(text, text, text, text) from public, anon;
revoke all on function public.registrar_followup(uuid, text, text, text, text, timestamptz, text, text, text, numeric, text[], numeric, numeric, numeric) from public, anon;
revoke all on function public.novo_prospect(uuid, text, text, text, numeric, text[], text, timestamptz, text, uuid) from public, anon;
revoke all on function public.mover_oportunidade(uuid, text, text) from public, anon;
revoke all on function public.comentar_followup(uuid, uuid, text) from public, anon;
revoke all on function public.passar_cliente(uuid, uuid, boolean) from public, anon;
grant execute on function public.etapa_pela_resposta(text, text, text, text) to authenticated;
grant execute on function public.registrar_followup(uuid, text, text, text, text, timestamptz, text, text, text, numeric, text[], numeric, numeric, numeric) to authenticated;
grant execute on function public.novo_prospect(uuid, text, text, text, numeric, text[], text, timestamptz, text, uuid) to authenticated;
grant execute on function public.mover_oportunidade(uuid, text, text) to authenticated;
grant execute on function public.comentar_followup(uuid, uuid, text) to authenticated;
grant execute on function public.passar_cliente(uuid, uuid, boolean) to authenticated;
grant select, insert, update, delete on public.oportunidades to authenticated;
grant select, update on public.followup_comentarios to authenticated;

-- ── 10. Funil de partida: clientes com contato marcado ou ainda prospect ganham a oportunidade aberta ─
insert into public.oportunidades (veiculo_id, cliente_id, consultor_id, etapa, criado_em)
select p.veiculo_id, p.id, p.consultor_id,
  coalesce((select public.etapa_pela_resposta('prospeccao', a.situacao, a.resposta, a.tipo) from public.agenda a
            where a.cliente_id = p.id and a.situacao = 'realizado' and a.resposta is not null and a.resposta not in ('fechou', 'sem_interesse')
            order by a.registrado_em desc nulls last limit 1), 'prospeccao'),
  p.criado_em
from public.pessoas p
where p.tipo = 'cliente' and (p.situacao = 'prospect' or exists (select 1 from public.agenda a where a.cliente_id = p.id and a.situacao = 'agendado'))
  and not exists (select 1 from public.oportunidades o where o.cliente_id = p.id and o.etapa not in ('fechou', 'perdeu'));
update public.agenda a set oportunidade_id = o.id from public.oportunidades o
where o.cliente_id = a.cliente_id and o.etapa not in ('fechou', 'perdeu') and a.situacao = 'agendado' and a.oportunidade_id is null;

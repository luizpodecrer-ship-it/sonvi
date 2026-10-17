-- SONVI · 020 · Follow-up (no lugar da Agenda): visitas e contatos com resultado, próximo passo obrigatório,
-- follow-up automático de proposta sem resposta e resumo diário por e-mail às 7h30 (Cuiabá).
-- A tabela continua sendo public.agenda; cada linha é um contato (visita, ligação, WhatsApp, reunião).

-- ============ estrutura ============
alter table public.agenda drop constraint if exists agenda_tipo_check;
alter table public.agenda add constraint agenda_tipo_check check (tipo in ('visita', 'ligacao', 'whatsapp', 'reuniao', 'retorno'));
alter table public.agenda
  add column if not exists situacao text not null default 'agendado' check (situacao in ('agendado', 'realizado', 'nao_atendeu', 'cancelado')),
  add column if not exists resposta text check (resposta in ('interessado', 'retorno', 'proposta', 'fechou', 'sem_interesse')),
  add column if not exists motivo text not null default '',          -- por que o cliente não quis
  add column if not exists origem_id uuid references public.agenda(id) on delete set null,   -- contato que gerou este
  add column if not exists proposta_id uuid references public.propostas(id) on delete set null,
  add column if not exists automatico boolean not null default false, -- criado pelo sistema (proposta sem resposta)
  add column if not exists registrado_em timestamptz;
-- O que já estava registrado na agenda antiga conta como realizado
update public.agenda set situacao = 'realizado', registrado_em = coalesce(registrado_em, quando) where realizado and situacao = 'agendado';
create index if not exists agenda_abertos on public.agenda (veiculo_id, consultor_id, quando) where situacao = 'agendado';
create index if not exists agenda_proposta on public.agenda (proposta_id);
create index if not exists agenda_origem on public.agenda (origem_id);

-- ============ registrar um contato ============
-- Grava como foi e já cria o próximo contato numa tacada só. Security invoker: valem as regras da agenda
-- (o consultor só mexe nos dele; gerente e diretor em todos da rádio).
-- Regras: realizado pede a resposta do cliente; interessado, pediu retorno e pediu proposta pedem o próximo contato;
-- sem interesse pede o motivo; cliente não atendeu pede a nova tentativa.
create function public.registrar_followup(
  p_id uuid, p_situacao text, p_resposta text, p_resultado text, p_motivo text,
  p_proximo timestamptz, p_proximo_tipo text, p_proximo_assunto text
) returns public.agenda
language plpgsql security invoker set search_path = '' as $$
declare a public.agenda; r public.agenda;
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
  if p_resposta = 'sem_interesse' then p_proximo := null; end if;

  update public.agenda set situacao = p_situacao, resposta = p_resposta, resultado = coalesce(p_resultado, ''),
    motivo = case when p_resposta = 'sem_interesse' then coalesce(p_motivo, '') else '' end,
    realizado = true, registrado_em = now(), proxima_data = (p_proximo at time zone 'America/Cuiaba')::date
  where id = p_id returning * into r;
  if r.id is null then raise exception 'Seu perfil não pode registrar este contato'; end if;

  if p_proximo is not null then
    insert into public.agenda (veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, origem_id, proposta_id)
    values (a.veiculo_id, a.consultor_id, a.cliente_id, p_proximo_tipo, p_proximo, coalesce(p_proximo_assunto, ''), a.id, a.proposta_id);
  end if;
  return r;
end;
$$;
revoke execute on function public.registrar_followup(uuid, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.registrar_followup(uuid, text, text, text, text, timestamptz, text, text) to authenticated;

-- ============ proposta sem resposta vira follow-up ============
-- Proposta enviada há 3 dias ou mais, ainda no prazo e sem nenhum follow-up ligado a ela: cria uma ligação
-- para hoje às 10h (Cuiabá) com o consultor da proposta. Uma vez por proposta. Roda antes do e-mail das 7h30.
create function public.followup_automaticos() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.agenda (veiculo_id, consultor_id, cliente_id, tipo, quando, assunto, proposta_id, automatico)
  select p.veiculo_id, p.consultor_id, p.cliente_id, 'ligacao',
    ((now() at time zone 'America/Cuiaba')::date + time '10:00') at time zone 'America/Cuiaba',
    'Resposta da proposta ' || p.ano || '/' || lpad(p.numero::text, 3, '0'), p.id, true
  from public.propostas p
  where p.situacao = 'enviada' and p.consultor_id is not null
    and p.enviada_em <= now() - interval '3 days'
    and p.data + p.validade >= (now() at time zone 'America/Cuiaba')::date
    and not exists (select 1 from public.agenda a where a.proposta_id = p.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.followup_automaticos() from public, anon, authenticated;
grant execute on function public.followup_automaticos() to service_role;

-- ============ e-mail das 7h30 ============
-- Registro de envio: o mesmo resumo não sai duas vezes no mesmo dia para a mesma pessoa
create table public.followup_envios (
  dia date not null,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('consultor', 'gerente', 'diretor')),
  enviado_em timestamptz not null default now(),
  primary key (dia, usuario_id, tipo)
);
alter table public.followup_envios enable row level security;
-- Só a função do servidor (service_role) grava e lê; ninguém pelo app
revoke all on public.followup_envios from anon, authenticated;

-- Senha interna que o agendador manda para a função de borda "followup" (fica no cofre do banco)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'sonvi_followup_cron', 'Chave do agendador do resumo de follow-up');

create function public.followup_chave() returns text
language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1;
$$;
revoke execute on function public.followup_chave() from public, anon, authenticated;
grant execute on function public.followup_chave() to service_role;

-- Todo dia às 7h30 de Cuiabá (11h30 UTC; Cuiabá não tem horário de verão)
select cron.schedule('sonvi-followup-0730', '30 11 * * *', $cron$
  select net.http_post(
    url := 'https://ccfsyhniwwspnpnpkjzf.supabase.co/functions/v1/followup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sonvi-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1)),
    body := '{"acao":"diario"}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);

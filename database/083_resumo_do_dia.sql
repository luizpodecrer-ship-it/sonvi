-- 083 · Resumo do fim do dia (aprovado pelo Luiz em 07/11/2026, modelo "Resumo do fim do dia" e "Follow-up da equipe")
-- 1. Configuração por empresa (Administração › Resumo do dia, só o diretor): horário (17h a 20h, Cuiabá), dias da semana,
--    e-mail das 7h30 ligado ou não (desligado por padrão) e WhatsApp (fica "aguardando número" até o número SONVI Avisos existir).
-- 2. Por pessoa: recebe ou não o resumo e por qual canal (E-mail · WhatsApp · Os dois). Enquanto o WhatsApp não estiver ativo, tudo sai por e-mail.
-- 3. Registro de envios com canal, situação e erro (se o WhatsApp falhar, volta para o e-mail).
-- 4. Agendador de hora em hora: a função de borda "followup" (ação fimdia) só envia na hora e nos dias de cada empresa.

create table if not exists public.resumo_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  hora int not null default 18 check (hora between 17 and 20),
  dias int[] not null default '{1,2,3,4,5}',            -- 0 = domingo … 6 = sábado
  manha boolean not null default false,                   -- e-mail das 7h30 com a agenda do dia
  whatsapp_ativo boolean not null default false,          -- liga quando o número SONVI Avisos estiver aprovado na Meta
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null
);
alter table public.resumo_config enable row level security;
drop policy if exists resumo_config_ler on public.resumo_config;
create policy resumo_config_ler on public.resumo_config for select to authenticated
  using (organizacao_id = public.minha_org() and public.eh_diretor());
insert into public.resumo_config (organizacao_id) select id from public.organizacoes on conflict do nothing;

alter table public.usuarios add column if not exists resumo_ativo boolean not null default true;
alter table public.usuarios add column if not exists resumo_canal text not null default 'email';
alter table public.usuarios drop constraint if exists usuarios_resumo_canal_check;
alter table public.usuarios add constraint usuarios_resumo_canal_check check (resumo_canal in ('email', 'whatsapp', 'ambos'));

-- Registro de envios: novos tipos (fim do dia) e o canal de cada envio
alter table public.followup_envios add column if not exists canal text not null default 'email';
alter table public.followup_envios add column if not exists situacao text not null default 'enviado';
alter table public.followup_envios add column if not exists erro text;
alter table public.followup_envios drop constraint if exists followup_envios_tipo_check;
alter table public.followup_envios add constraint followup_envios_tipo_check check (tipo in ('consultor', 'gerente', 'diretor', 'fim_consultor', 'fim_diretor'));
alter table public.followup_envios drop constraint if exists followup_envios_canal_check;
alter table public.followup_envios add constraint followup_envios_canal_check check (canal in ('email', 'whatsapp'));
alter table public.followup_envios drop constraint if exists followup_envios_situacao_check;
alter table public.followup_envios add constraint followup_envios_situacao_check check (situacao in ('enviado', 'falhou', 'voltou_email'));
alter table public.followup_envios drop constraint if exists followup_envios_pkey;
alter table public.followup_envios add primary key (dia, usuario_id, tipo, canal);

-- Tela da configuração: tudo de uma vez (só o diretor da empresa)
create or replace function public.resumo_config_ler() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); c public.resumo_config;
begin
  if v_org is null or not public.eh_diretor() then raise exception 'Só o diretor configura o resumo do dia.'; end if;
  select * into c from public.resumo_config where organizacao_id = v_org;
  return jsonb_build_object(
    'hora', coalesce(c.hora, 18), 'dias', to_jsonb(coalesce(c.dias, '{1,2,3,4,5}'::int[])), 'manha', coalesce(c.manha, false),
    'whatsapp_ativo', coalesce(c.whatsapp_ativo, false),
    'pessoas', coalesce((select jsonb_agg(p order by p->>'ordem', p->>'nome') from (
        select jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'celular', u.celular,
          'perfil', case when u.diretor then 'diretor' else 'consultor' end, 'ordem', case when u.diretor then '0' else '1' end,
          'ativo', u.resumo_ativo, 'canal', u.resumo_canal) p
        from public.usuarios u
        where u.organizacao_id = v_org and u.ativo
          and (u.diretor or exists (select 1 from public.usuario_veiculos uv join public.veiculos v on v.id = uv.veiculo_id
                                    where uv.usuario_id = u.id and uv.perfil = 'consultor' and v.organizacao_id = v_org))) x), '[]'::jsonb),
    'envios', coalesce((select jsonb_agg(jsonb_build_object('dia', e.dia, 'nome', u.nome, 'tipo', e.tipo, 'canal', e.canal,
          'situacao', e.situacao, 'erro', e.erro, 'em', e.enviado_em) order by e.enviado_em desc)
        from (select e.* from public.followup_envios e join public.usuarios uu on uu.id = e.usuario_id
              where uu.organizacao_id = v_org and e.dia >= (now() at time zone 'America/Cuiaba')::date - 6 order by e.enviado_em desc limit 40) e
        join public.usuarios u on u.id = e.usuario_id), '[]'::jsonb));
end $$;

create or replace function public.resumo_config_salvar(p_hora int, p_dias int[], p_manha boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org();
begin
  if v_org is null or not public.eh_diretor() then raise exception 'Só o diretor configura o resumo do dia.'; end if;
  if p_hora is null or p_hora not between 17 and 20 then raise exception 'Escolha um horário entre 17h e 20h.'; end if;
  if p_dias is null or cardinality(p_dias) = 0 then raise exception 'Escolha pelo menos um dia da semana.'; end if;
  if exists (select 1 from unnest(p_dias) d where d not between 0 and 6) then raise exception 'Dia da semana inválido.'; end if;
  insert into public.resumo_config (organizacao_id, hora, dias, manha, atualizado_em, atualizado_por)
  values (v_org, p_hora, (select array_agg(distinct d order by d) from unnest(p_dias) d), coalesce(p_manha, false), now(), (select auth.uid()))
  on conflict (organizacao_id) do update set hora = excluded.hora, dias = excluded.dias, manha = excluded.manha,
    atualizado_em = now(), atualizado_por = excluded.atualizado_por;
end $$;

create or replace function public.resumo_pessoa_salvar(p_usuario uuid, p_ativo boolean, p_canal text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); v_wa boolean;
begin
  if v_org is null or not public.eh_diretor() then raise exception 'Só o diretor configura o resumo do dia.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario and organizacao_id = v_org) then raise exception 'Pessoa não encontrada.'; end if;
  select whatsapp_ativo into v_wa from public.resumo_config where organizacao_id = v_org;
  if coalesce(p_canal, 'email') not in ('email', 'whatsapp', 'ambos') then raise exception 'Canal inválido.'; end if;
  if p_canal <> 'email' and not coalesce(v_wa, false) then raise exception 'O WhatsApp ainda está aguardando o número. Por enquanto o resumo sai por e-mail.'; end if;
  update public.usuarios set resumo_ativo = coalesce(p_ativo, true), resumo_canal = coalesce(p_canal, 'email') where id = p_usuario;
end $$;

revoke all on function public.resumo_config_ler() from public, anon;
revoke all on function public.resumo_config_salvar(int, int[], boolean) from public, anon;
revoke all on function public.resumo_pessoa_salvar(uuid, boolean, text) from public, anon;
grant execute on function public.resumo_config_ler() to authenticated;
grant execute on function public.resumo_config_salvar(int, int[], boolean) to authenticated;
grant execute on function public.resumo_pessoa_salvar(uuid, boolean, text) to authenticated;

-- Empresa nova já nasce com a configuração padrão (18h, segunda a sexta)
create or replace function public.resumo_config_nova_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin insert into public.resumo_config (organizacao_id) values (new.id) on conflict do nothing; return new; end $$;
revoke all on function public.resumo_config_nova_org() from public, anon, authenticated;
drop trigger if exists resumo_config_nova_org on public.organizacoes;
create trigger resumo_config_nova_org after insert on public.organizacoes for each row execute function public.resumo_config_nova_org();

-- Agendador de hora em hora (a função decide quem recebe naquela hora)
select cron.unschedule('sonvi-followup-fimdia') where exists (select 1 from cron.job where jobname = 'sonvi-followup-fimdia');
select cron.schedule('sonvi-followup-fimdia', '0 * * * *', $c$
  select net.http_post(
    url := 'https://ccfsyhniwwspnpnpkjzf.supabase.co/functions/v1/followup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sonvi-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1)),
    body := '{"acao":"fimdia"}'::jsonb,
    timeout_milliseconds := 120000);
$c$);

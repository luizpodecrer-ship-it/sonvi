-- SONVI · 026 · Clientes (organizações), dono da plataforma e acesso de suporte (decidido em 19/10/2026)
-- O SONVI passa a ter vários clientes. Cada cliente (organização) tem endereço próprio (sonvi.com.br/<slug>),
-- as próprias rádios, a própria empresa comercial e a própria equipe; nada de um cliente aparece em outro.
-- O dono da plataforma (plataforma_admins) não faz parte da equipe de nenhum cliente: entra no ambiente de um
-- cliente só por um acesso de suporte com motivo e prazo, registrado em suporte_acessos e visível ao diretor do cliente.
-- Parte A vai pela ferramenta; a parte B (salvar_usuario e os vínculos antigos do Luiz) é rodada pelo Luiz no SQL Editor.

-- ============================== Parte A ==============================

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  cnpj text not null default '',
  cidade text not null default '',
  logo text,
  situacao text not null default 'ativo' check (situacao in ('teste', 'ativo', 'suspenso')),
  teste_ate date,
  criado_em timestamptz not null default now()
);
alter table public.organizacoes enable row level security;

create table if not exists public.plataforma_admins (
  usuario_id uuid primary key references public.usuarios(id),
  criado_em timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;

create table if not exists public.suporte_acessos (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.usuarios(id),
  organizacao_id uuid not null references public.organizacoes(id),
  motivo text not null check (length(trim(motivo)) > 0),
  inicio timestamptz not null default now(),
  fim timestamptz not null,
  encerrado_em timestamptz
);
alter table public.suporte_acessos enable row level security;
create index if not exists suporte_acessos_admin on public.suporte_acessos (admin_id, fim);
create index if not exists suporte_acessos_org on public.suporte_acessos (organizacao_id, inicio desc);

alter table public.veiculos add column if not exists organizacao_id uuid references public.organizacoes(id);
alter table public.empresa_comercial add column if not exists organizacao_id uuid unique references public.organizacoes(id);
alter table public.usuarios add column if not exists organizacao_id uuid references public.organizacoes(id);

-- Primeiro cliente: Head 14 (dona das rádios que já existem)
insert into public.organizacoes (nome, slug, cnpj, cidade, situacao)
select 'Head 14', 'head14', coalesce((select cnpj from public.empresa_comercial limit 1), ''), coalesce((select cidade from public.empresa_comercial limit 1), ''), 'ativo'
where not exists (select 1 from public.organizacoes where slug = 'head14');
update public.veiculos set organizacao_id = (select id from public.organizacoes where slug = 'head14') where organizacao_id is null;
update public.empresa_comercial set organizacao_id = (select id from public.organizacoes where slug = 'head14') where organizacao_id is null;
alter table public.veiculos alter column organizacao_id set not null;

-- ---------- Quem é quem ----------
create or replace function public.eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plataforma_admins where usuario_id = (select auth.uid()));
$$;

-- Cliente do acesso de suporte em andamento (só para o dono da plataforma)
create or replace function public.suporte_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.organizacao_id from public.suporte_acessos s join public.plataforma_admins a on a.usuario_id = s.admin_id
  where s.admin_id = (select auth.uid()) and s.encerrado_em is null and s.fim > now()
  order by s.inicio desc limit 1;
$$;

-- O cliente de quem está usando: o da equipe, ou o do acesso de suporte
create or replace function public.minha_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.organizacao_id from public.usuarios u where u.id = (select auth.uid()) and u.ativo and u.organizacao_id is not null),
    public.suporte_org());
$$;

-- Diretor: do próprio cliente (que não pode estar suspenso), ou o suporte durante o acesso
create or replace function public.eh_diretor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u join public.organizacoes o on o.id = u.organizacao_id
                 where u.id = (select auth.uid()) and u.diretor and u.ativo and o.situacao <> 'suspenso')
      or public.suporte_org() is not null;
$$;

-- Perfil na rádio: só rádios do próprio cliente; cliente suspenso não enxerga nada (o suporte enxerga)
create or replace function public.perfil_no_veiculo(v uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.veiculos x join public.organizacoes o on o.id = x.organizacao_id
                     where x.id = v and x.organizacao_id = public.minha_org() and (o.situacao <> 'suspenso' or public.suporte_org() is not null)) then null
    when public.eh_diretor() then 'diretor'
    else (select uv.perfil from public.usuario_veiculos uv join public.usuarios u on u.id = uv.usuario_id
          where uv.usuario_id = (select auth.uid()) and uv.veiculo_id = v and u.ativo)
  end;
$$;

create or replace function public.pode_gerenciar_usuario(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.eh_diretor() and exists (select 1 from public.usuarios where id = alvo and organizacao_id = public.minha_org())) or (
    alvo <> (select auth.uid())
    and exists (select 1 from public.usuarios where id = alvo and not diretor)
    and not exists (select 1 from public.usuario_veiculos where usuario_id = alvo and perfil = 'gerente')
    and exists (select 1 from public.usuario_veiculos x where x.usuario_id = alvo and public.perfil_no_veiculo(x.veiculo_id) = 'gerente'));
$$;

create or replace function public.usuario_so_nas_minhas(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.eh_diretor() and exists (select 1 from public.usuarios where id = alvo and organizacao_id = public.minha_org())) or (public.pode_gerenciar_usuario(alvo)
    and not exists (select 1 from public.usuario_veiculos x where x.usuario_id = alvo and coalesce(public.perfil_no_veiculo(x.veiculo_id), '') <> 'gerente'));
$$;

-- Nova rádio e empresa comercial nascem no cliente de quem cria
create or replace function public.org_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organizacao_id is null then new.organizacao_id := public.minha_org(); end if;
  return new;
end;
$$;
create or replace trigger veiculos_org before insert on public.veiculos for each row execute function public.org_padrao();
create or replace trigger empresa_org before insert on public.empresa_comercial for each row execute function public.org_padrao();

-- ---------- Regras (políticas) presas ao cliente ----------
alter policy veiculos_criar on public.veiculos with check (public.eh_diretor() and organizacao_id = public.minha_org());
alter policy veiculos_alterar on public.veiculos using (public.eh_diretor() and organizacao_id = public.minha_org()) with check (public.eh_diretor() and organizacao_id = public.minha_org());
alter policy veiculos_excluir on public.veiculos using (public.eh_diretor() and organizacao_id = public.minha_org());
alter policy empresa_ver on public.empresa_comercial using (organizacao_id = public.minha_org());
alter policy empresa_criar on public.empresa_comercial with check (public.eh_diretor() and organizacao_id = public.minha_org());
alter policy empresa_alterar on public.empresa_comercial using (public.eh_diretor() and organizacao_id = public.minha_org()) with check (public.eh_diretor() and organizacao_id = public.minha_org());
alter policy usuarios_ver on public.usuarios using (id = (select auth.uid()) or (public.eh_diretor() and organizacao_id = public.minha_org()) or public.colega(id));
alter policy vinculos_criar on public.usuario_veiculos with check (public.perfil_no_veiculo(veiculo_id) = 'diretor');
alter policy vinculos_alterar on public.usuario_veiculos using (public.perfil_no_veiculo(veiculo_id) = 'diretor') with check (public.perfil_no_veiculo(veiculo_id) = 'diretor');
alter policy vinculos_excluir on public.usuario_veiculos using (public.perfil_no_veiculo(veiculo_id) = 'diretor');

create policy suporte_ver on public.suporte_acessos for select to authenticated
  using (admin_id = (select auth.uid()) or (public.eh_diretor() and organizacao_id = public.minha_org()));
create policy organizacao_ver on public.organizacoes for select to authenticated
  using (id = public.minha_org() or public.eh_admin_plataforma());

-- ---------- Excluir usuário: só dentro do próprio cliente ----------
create or replace function public.preparar_exclusao_usuario(p_usuario uuid, p_para uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_cli int; n_prop int; n_pi int; n_ag int;
begin
  if not public.eh_diretor() then raise exception 'Só o diretor exclui usuários.'; end if;
  if p_usuario = (select auth.uid()) then raise exception 'Você não pode excluir o seu próprio usuário.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario and organizacao_id = public.minha_org()) then raise exception 'Usuário não encontrado.'; end if;
  if p_para is not null and (p_para = p_usuario or not exists (select 1 from public.usuarios where id = p_para and ativo and organizacao_id = public.minha_org())) then
    raise exception 'Escolha um usuário ativo da equipe para receber a carteira.'; end if;
  perform set_config('sonvi.transferir', '1', true);
  update public.pessoas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_cli = row_count;
  update public.propostas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_prop = row_count;
  update public.pis set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_pi = row_count;
  n_ag := 0;
  if p_para is not null then update public.agenda set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_ag = row_count; end if;
  perform set_config('sonvi.transferir', '', true);
  return jsonb_build_object('clientes', n_cli, 'propostas', n_prop, 'pis', n_pi, 'followups', n_ag);
end;
$$;

-- ---------- Endereço do cliente (página de entrada, sem login) ----------
create or replace function public.organizacao_publica(p_slug text)
returns table (nome text, slug text, situacao text, logo text)
language sql stable security definer set search_path = '' as $$
  select o.nome, o.slug, o.situacao, coalesce(o.logo, e.logo)
  from public.organizacoes o left join public.empresa_comercial e on e.organizacao_id = o.id
  where o.slug = lower(trim(p_slug));
$$;

-- ---------- Contexto de quem entrou: cliente, se é dono da plataforma e se está em suporte ----------
create or replace function public.meu_contexto() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin', public.eh_admin_plataforma(),
    'diretor', public.eh_diretor(),
    'org', (select jsonb_build_object('id', o.id, 'nome', o.nome, 'slug', o.slug, 'situacao', o.situacao) from public.organizacoes o where o.id = public.minha_org()),
    'suporte', (select jsonb_build_object('id', s.id, 'fim', s.fim, 'motivo', s.motivo, 'org', s.organizacao_id) from public.suporte_acessos s
                where s.admin_id = (select auth.uid()) and s.encerrado_em is null and s.fim > now() order by s.inicio desc limit 1));
$$;

-- ---------- Acesso de suporte (só o dono da plataforma) ----------
create or replace function public.iniciar_suporte(p_slug text, p_motivo text, p_minutos integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_fim timestamptz;
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso de suporte só para o SONVI.'; end if;
  select id into v_org from public.organizacoes where slug = lower(trim(p_slug));
  if v_org is null then raise exception 'Cliente não encontrado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo do acesso.'; end if;
  if p_minutos is null or p_minutos < 5 or p_minutos > 480 then raise exception 'Escolha de 5 minutos a 8 horas.'; end if;
  update public.suporte_acessos set encerrado_em = now() where admin_id = (select auth.uid()) and encerrado_em is null and fim > now();
  v_fim := now() + make_interval(mins => p_minutos);
  insert into public.suporte_acessos (admin_id, organizacao_id, motivo, fim) values ((select auth.uid()), v_org, trim(p_motivo), v_fim);
  return v_fim;
end;
$$;

create or replace function public.encerrar_suporte() returns void
language sql security definer set search_path = '' as $$
  update public.suporte_acessos set encerrado_em = now() where admin_id = (select auth.uid()) and encerrado_em is null and fim > now();
$$;

create or replace function public.organizacoes_para_suporte()
returns table (nome text, slug text, situacao text)
language sql stable security definer set search_path = '' as $$
  select nome, slug, situacao from public.organizacoes where public.eh_admin_plataforma() order by nome;
$$;

revoke execute on function public.eh_admin_plataforma(), public.suporte_org(), public.minha_org(), public.meu_contexto(),
  public.iniciar_suporte(text, text, integer), public.encerrar_suporte(), public.organizacoes_para_suporte(), public.org_padrao() from public, anon;
grant execute on function public.eh_admin_plataforma(), public.suporte_org(), public.minha_org(), public.meu_contexto(),
  public.iniciar_suporte(text, text, integer), public.encerrar_suporte(), public.organizacoes_para_suporte() to authenticated;
grant execute on function public.organizacao_publica(text) to anon, authenticated;

-- ---------- A equipe da Head 14 e o dono da plataforma ----------
-- Luiz (dono do SONVI) sai da equipe da Head 14; a carteira dele passa para o Savio (diretor da Head 14)
do $$
declare v_luiz uuid := (select id from public.usuarios where lower(email) = 'luizpodecrer@gmail.com');
        v_savio uuid := (select id from public.usuarios where lower(email) = 'savio@head14.com.br');
        v_org uuid := (select id from public.organizacoes where slug = 'head14');
begin
  update public.usuarios set organizacao_id = v_org where organizacao_id is null and id <> coalesce(v_luiz, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_luiz is not null then
    insert into public.plataforma_admins (usuario_id) values (v_luiz) on conflict do nothing;
    if v_savio is not null then
      perform set_config('sonvi.transferir', '1', true);
      update public.pessoas set consultor_id = v_savio where consultor_id = v_luiz;
      update public.propostas set consultor_id = v_savio where consultor_id = v_luiz;
      update public.pis set consultor_id = v_savio where consultor_id = v_luiz;
      update public.agenda set consultor_id = v_savio where consultor_id = v_luiz;
      perform set_config('sonvi.transferir', '', true);
    end if;
    update public.usuarios set diretor = false, organizacao_id = null where id = v_luiz;
  end if;
end $$;


-- ============================== Parte A2 (aplicada pela ferramenta: 026b e 026c)
-- O acesso a uma rádio só pode ser dado a quem é da mesma organização; quem ainda não tem organização passa a ser da organização da rádio.
create or replace function public.vinculo_na_organizacao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; u_org uuid;
begin
  select organizacao_id into v_org from public.veiculos where id = new.veiculo_id;
  select organizacao_id into u_org from public.usuarios where id = new.usuario_id;
  if u_org is null then
    update public.usuarios set organizacao_id = v_org where id = new.usuario_id;
  elsif u_org <> v_org then
    raise exception 'Esta pessoa é de outro cliente do SONVI.';
  end if;
  return new;
end;
$$;
revoke execute on function public.vinculo_na_organizacao() from public, anon, authenticated;
create or replace trigger vinculo_na_organizacao before insert or update of veiculo_id, usuario_id on public.usuario_veiculos
  for each row execute function public.vinculo_na_organizacao();

-- Quem é do suporte SONVI: o cliente vê só "Suporte SONVI" (histórico, PI etc.), nunca o nome da pessoa.
create or replace function public.suporte_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select usuario_id from public.plataforma_admins;
$$;
revoke execute on function public.suporte_ids() from public, anon;
grant execute on function public.suporte_ids() to authenticated;
update public.organizacoes set logo = 'img/head14.png' where slug = 'head14' and logo is null;

-- ============================== Parte B (rodada pelo Luiz no SQL Editor)
-- salvar_usuario passa a valer só dentro da organização de quem chama; e o Luiz perde os vínculos antigos com as rádios da Head 14.
create or replace function public.salvar_usuario(p_usuario uuid, p_nome text, p_celular text, p_ativo boolean, p_diretor boolean, p_vinculos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_dir boolean := public.eh_diretor(); v_org uuid := public.minha_org(); v_atual public.usuarios%rowtype;
begin
  select * into v_atual from public.usuarios where id = p_usuario and organizacao_id = v_org;
  if v_org is null or not found then raise exception 'Usuário não encontrado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do usuário'; end if;

  if not v_dir then
    if not public.pode_gerenciar_usuario(p_usuario) then
      raise exception 'Você só pode alterar consultores, OPEC, financeiro, programadores e locutores das rádios em que é gerente.'; end if;
    if p_diretor then raise exception 'Só o diretor pode dar a função de diretor.'; end if;
    if p_ativo is distinct from v_atual.ativo and not public.usuario_so_nas_minhas(p_usuario) then
      raise exception 'Esta pessoa também trabalha em rádio que não é sua. Para tirar o acesso dela nas suas rádios, escolha "Sem acesso" nelas.'; end if;
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if coalesce(public.perfil_no_veiculo((v ->> 'veiculo_id')::uuid), '') <> 'gerente' then
        raise exception 'Você só pode dar acesso nas rádios em que é gerente.'; end if;
      if (v ->> 'perfil') not in ('consultor','opec','financeiro','programador','locutor') then
        raise exception 'O gerente cadastra consultor, OPEC, financeiro, programador e locutor.'; end if;
    end loop;
    update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo where id = p_usuario;
    delete from public.usuario_veiculos x where x.usuario_id = p_usuario and public.perfil_no_veiculo(x.veiculo_id) = 'gerente';
    insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil)
      select p_usuario, (e ->> 'veiculo_id')::uuid, e ->> 'perfil' from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) e where coalesce(e ->> 'perfil', '') <> '';
    return;
  end if;

  if (not p_ativo or not p_diretor) and v_atual.diretor and v_atual.ativo
     and not exists (select 1 from public.usuarios where diretor and ativo and id <> p_usuario and organizacao_id = v_org) then
    raise exception 'A empresa precisa de pelo menos um diretor ativo. Cadastre outro diretor antes de mudar esta função.'; end if;
  update public.usuarios set nome = trim(p_nome), celular = coalesce(p_celular, ''), ativo = p_ativo, diretor = p_diretor where id = p_usuario;
  delete from public.usuario_veiculos where usuario_id = p_usuario;
  if not p_diretor then
    for v in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb)) loop
      if coalesce(v ->> 'perfil', '') = '' then continue; end if;
      if (v ->> 'perfil') not in ('gerente','consultor','opec','financeiro','programador','locutor') then raise exception 'Perfil inválido: %', v ->> 'perfil'; end if;
      if not exists (select 1 from public.veiculos where id = (v ->> 'veiculo_id')::uuid and organizacao_id = v_org) then raise exception 'Rádio não encontrada.'; end if;
      insert into public.usuario_veiculos (usuario_id, veiculo_id, perfil) values (p_usuario, (v ->> 'veiculo_id')::uuid, v ->> 'perfil');
    end loop;
  end if;
end; $$;

delete from public.usuario_veiculos where usuario_id = (select id from public.usuarios where lower(email) = 'luizpodecrer@gmail.com');

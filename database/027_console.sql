-- SONVI · Console (console.sonvi.com.br): o painel da equipe SONVI para cuidar dos clientes (organizações).
-- Tudo aqui exige eh_admin_plataforma(). Criar o diretor (conta de entrada) fica na função de borda "console".
-- Também: numeração das propostas passa a ser por empresa (cada cliente começa em 2026/1).
-- Parte A vai pela ferramenta; a parte B (tirar a numeração antiga, que era única no grupo todo) é rodada pelo Luiz no SQL Editor.

-- ============================== Parte A
-- Numeração das propostas por empresa e ano
create table if not exists public.proposta_seq_org (
  organizacao_id uuid not null references public.organizacoes(id),
  ano integer not null,
  ultimo integer not null default 0,
  primary key (organizacao_id, ano)
);
alter table public.proposta_seq_org enable row level security;
insert into public.proposta_seq_org (organizacao_id, ano, ultimo)
  select (select id from public.organizacoes where slug = 'head14'), ano, ultimo from public.proposta_seq
  on conflict do nothing;
alter table public.propostas add column if not exists organizacao_id uuid references public.organizacoes(id);

create or replace function public.propostas_protege() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ano integer; v_org uuid;
begin
  if tg_op = 'INSERT' then
    v_ano := extract(year from coalesce(new.data, current_date))::integer;
    v_org := (select organizacao_id from public.veiculos where id = new.veiculo_id);
    insert into public.proposta_seq_org as s (organizacao_id, ano, ultimo) values (v_org, v_ano, 1)
      on conflict (organizacao_id, ano) do update set ultimo = s.ultimo + 1 returning ultimo into new.numero;
    new.ano := v_ano; new.organizacao_id := v_org;
    new.situacao := 'rascunho'; new.pi_id := null;
    if new.consultor_id is null then new.consultor_id := (select auth.uid()); end if;
  else
    -- Preenchimento da empresa nas propostas antigas (027): só essa coluna muda
    if old.organizacao_id is null and new.organizacao_id is not null and (to_jsonb(new) - 'organizacao_id') = (to_jsonb(old) - 'organizacao_id') then
      return new;
    end if;
    new.organizacao_id := old.organizacao_id;
    if coalesce(current_setting('sonvi.transferir', true), '') = '1'
       and (to_jsonb(new) - 'consultor_id' - 'atualizado_em') = (to_jsonb(old) - 'consultor_id' - 'atualizado_em') then
      return new;
    end if;
    if new.pi_id is null and old.pi_id is not null and (to_jsonb(new) - 'pi_id' - 'atualizado_em') = (to_jsonb(old) - 'pi_id' - 'atualizado_em')
       and not exists (select 1 from public.pis where id = old.pi_id) then
      return new;
    end if;
    if new.veiculo_id <> old.veiculo_id or new.ano <> old.ano or new.numero <> old.numero then
      raise exception 'Rádio e número da proposta não podem ser alterados';
    end if;
    if coalesce(current_setting('sonvi.proposta_rpc', true), '') <> '1' then
      if new.situacao is distinct from old.situacao or new.pi_id is distinct from old.pi_id then
        raise exception 'A situação da proposta só muda pelo fluxo do sistema';
      end if;
      if old.situacao <> 'rascunho' then raise exception 'Só dá para alterar a proposta em rascunho'; end if;
    end if;
    new.atualizado_em := now();
  end if;
  if not exists (select 1 from public.pessoas where id = new.cliente_id and veiculo_id = new.veiculo_id and tipo = 'cliente') then
    raise exception 'O cliente não pertence a esta rádio';
  end if;
  if new.agencia_id is not null and not exists (select 1 from public.pessoas where id = new.agencia_id and veiculo_id = new.veiculo_id and tipo = 'agencia') then
    raise exception 'A agência não pertence a esta rádio';
  end if;
  return new;
end;
$$;

update public.propostas p set organizacao_id = v.organizacao_id from public.veiculos v where v.id = p.veiculo_id and p.organizacao_id is null;
create unique index if not exists propostas_org_ano_numero on public.propostas (organizacao_id, ano, numero);

-- Logo da organização: imagem pequena (data URL), como a das rádios
alter table public.organizacoes add constraint organizacoes_logo_tamanho
  check (logo is null or logo like 'img/%' or (logo like 'data:image/%' and length(logo) <= 600000)) not valid;

-- Endereços que não podem virar nome de cliente (pastas do site e nomes de sistema)
create or replace function public.slug_reservado(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(coalesce(p_slug, '')) = any (array['site','console','music','js','css','img','api','app','admin','www','teste','suporte','sonvi',
    'index.html','pi.html','proposta.html','login','entrar','ajuda','status','blog','email','mail']);
$$;

-- Endereço livre? null = livre; senão o motivo
create or replace function public.console_slug_livre(p_slug text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s text := lower(trim(coalesce(p_slug, '')));
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if s !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then return 'Use de 1 a 40 letras minúsculas, números ou hífen (sem hífen no começo nem no fim).'; end if;
  if public.slug_reservado(s) then return 'Este endereço é reservado do SONVI.'; end if;
  if exists (select 1 from public.organizacoes where slug = s) then return 'Já existe um cliente com este endereço.'; end if;
  return null;
end;
$$;

-- Tudo o que o Console mostra, numa chamada só
create or replace function public.console_dados() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; mes date := date_trunc('month', now() at time zone 'America/Cuiaba')::date;
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  select jsonb_build_object(
    'clientes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'slug', o.slug, 'cnpj', o.cnpj, 'cidade', o.cidade, 'logo', coalesce(o.logo, e.logo), 'situacao', o.situacao,
        'teste_ate', o.teste_ate, 'criado_em', o.criado_em,
        'radios', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sigla', v.sigla, 'cor', v.cor, 'logo', v.logo, 'cidade', v.cidade, 'frequencia', v.frequencia,
            'clientes', (select count(*) from public.pessoas p where p.veiculo_id = v.id and p.tipo = 'cliente'),
            'pis', (select count(*) from public.pis x where x.veiculo_id = v.id),
            'pis_mes', (select count(*) from public.pis x where x.veiculo_id = v.id and x.criado_em >= mes)) order by v.nome)
          from public.veiculos v where v.organizacao_id = o.id), '[]'::jsonb),
        'diretores', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'celular', u.celular, 'ativo', u.ativo,
            'trocar_senha', u.trocar_senha, 'ultimo_acesso', u.ultimo_acesso) order by u.nome)
          from public.usuarios u where u.organizacao_id = o.id and u.diretor), '[]'::jsonb),
        'usuarios', (select count(*) from public.usuarios u where u.organizacao_id = o.id and u.ativo),
        'ultimo', (select jsonb_build_object('quando', u.ultimo_acesso, 'nome', u.nome) from public.usuarios u
                   where u.organizacao_id = o.id and u.ultimo_acesso is not null order by u.ultimo_acesso desc limit 1),
        'clientes', (select count(*) from public.pessoas p join public.veiculos v on v.id = p.veiculo_id where v.organizacao_id = o.id and p.tipo = 'cliente'),
        'propostas_mes', (select count(*) from public.propostas p where p.organizacao_id = o.id and p.criado_em >= mes),
        'pis_mes', (select count(*) from public.pis x join public.veiculos v on v.id = x.veiculo_id where v.organizacao_id = o.id and x.criado_em >= mes),
        'suporte', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'encerrado_em', s.encerrado_em, 'motivo', s.motivo,
            'quem', (select nome from public.usuarios where id = s.admin_id)) order by s.inicio desc)
          from (select * from public.suporte_acessos where organizacao_id = o.id order by inicio desc limit 20) s), '[]'::jsonb)
      ) order by o.nome) from public.organizacoes o left join public.empresa_comercial e on e.organizacao_id = o.id), '[]'::jsonb),
    'suporte', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'encerrado_em', s.encerrado_em, 'motivo', s.motivo,
        'cliente', o.nome, 'slug', o.slug, 'quem', (select nome from public.usuarios where id = s.admin_id)) order by s.inicio desc)
      from (select * from public.suporte_acessos order by inicio desc limit 100) s join public.organizacoes o on o.id = s.organizacao_id), '[]'::jsonb),
    'eu', (select jsonb_build_object('nome', nome, 'email', email) from public.usuarios where id = (select auth.uid()))
  ) into r;
  return r;
end;
$$;

-- Novo cliente: organização, empresa comercial e rádios. O diretor é criado depois pela função de borda.
create or replace function public.console_criar_cliente(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_motivo text; r jsonb; v_slug text := lower(trim(coalesce(p ->> 'slug', '')));
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if coalesce(trim(p ->> 'nome'), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  v_motivo := public.console_slug_livre(v_slug);
  if v_motivo is not null then raise exception '%', v_motivo; end if;
  if coalesce(p ->> 'situacao', 'teste') not in ('teste', 'ativo') then raise exception 'Situação inválida.'; end if;
  if jsonb_array_length(coalesce(p -> 'radios', '[]'::jsonb)) = 0 then raise exception 'Cadastre pelo menos uma rádio.'; end if;
  insert into public.organizacoes (nome, slug, cnpj, cidade, logo, situacao, teste_ate)
    values (trim(p ->> 'nome'), v_slug, coalesce(trim(p ->> 'cnpj'), ''), coalesce(trim(p ->> 'cidade'), ''), nullif(p ->> 'logo', ''),
            coalesce(p ->> 'situacao', 'teste'), case when coalesce(p ->> 'situacao', 'teste') = 'teste' then nullif(p ->> 'teste_ate', '')::date end)
    returning id into v_org;
  insert into public.empresa_comercial (nome, cnpj, cidade, logo, organizacao_id)
    values (trim(p ->> 'nome'), coalesce(trim(p ->> 'cnpj'), ''), coalesce(trim(p ->> 'cidade'), ''), nullif(p ->> 'logo', ''), v_org);
  for r in select * from jsonb_array_elements(p -> 'radios') loop
    if coalesce(trim(r ->> 'nome'), '') = '' or coalesce(trim(r ->> 'sigla'), '') = '' then raise exception 'Cada rádio precisa de nome e sigla do PI.'; end if;
    insert into public.veiculos (nome, sigla, cidade, organizacao_id, cor)
      values (trim(r ->> 'nome'), upper(trim(r ->> 'sigla')), coalesce(trim(r ->> 'cidade'), ''), v_org, '#0055ff');
  end loop;
  return v_org;
end;
$$;

-- Editar dados, situação (teste / ativo / suspenso) e logo do cliente
create or replace function public.console_salvar_cliente(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if coalesce(trim(p ->> 'nome'), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  if coalesce(p ->> 'situacao', '') not in ('teste', 'ativo', 'suspenso') then raise exception 'Situação inválida.'; end if;
  update public.organizacoes set nome = trim(p ->> 'nome'), cnpj = coalesce(trim(p ->> 'cnpj'), ''), cidade = coalesce(trim(p ->> 'cidade'), ''),
    logo = case when p ? 'logo' then nullif(p ->> 'logo', '') else logo end,
    situacao = p ->> 'situacao', teste_ate = case when p ->> 'situacao' = 'teste' then nullif(p ->> 'teste_ate', '')::date end
  where id = p_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  -- Sem logo própria na empresa comercial, as propostas usam a do cliente
  if p ? 'logo' and nullif(p ->> 'logo', '') is not null then
    update public.empresa_comercial set logo = p ->> 'logo' where organizacao_id = p_id and logo is null;
  end if;
end;
$$;

create or replace function public.console_adicionar_radio(p_org uuid, p_nome text, p_sigla text, p_cidade text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_sigla), '') = '' then raise exception 'Informe o nome e a sigla do PI.'; end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then raise exception 'Cliente não encontrado.'; end if;
  insert into public.veiculos (nome, sigla, cidade, organizacao_id, cor) values (trim(p_nome), upper(trim(p_sigla)), coalesce(trim(p_cidade), ''), p_org, '#0055ff') returning id into v;
  return v;
end;
$$;

revoke execute on function public.console_slug_livre(text), public.console_dados(), public.console_criar_cliente(jsonb),
  public.console_salvar_cliente(uuid, jsonb), public.console_adicionar_radio(uuid, text, text, text) from public, anon;
grant execute on function public.console_slug_livre(text), public.console_dados(), public.console_criar_cliente(jsonb),
  public.console_salvar_cliente(uuid, jsonb), public.console_adicionar_radio(uuid, text, text, text) to authenticated;

-- ============================== Parte B (rodada pelo Luiz no SQL Editor)
-- A numeração antiga era única no grupo todo; agora vale propostas_org_ano_numero (por empresa).
alter table public.propostas drop constraint propostas_ano_numero_key;

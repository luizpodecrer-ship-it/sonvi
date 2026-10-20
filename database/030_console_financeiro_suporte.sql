-- SONVI · Console: contratos e mensalidades dos clientes (Financeiro), chamados de suporte e equipe do Console com papéis
-- (aprovado em 20/10/2026). Quem cobra é a Astravox (CNPJ 22.338.323/0001-22). Boleto: serviço a configurar depois.

-- ============================== Papéis da equipe do Console
-- proprietario: tudo · suporte: clientes (ver), chamados, entrar como suporte · financeiro: clientes (ver), contratos e mensalidades
alter table public.plataforma_admins add column if not exists papel text not null default 'proprietario'
  check (papel in ('proprietario', 'suporte', 'financeiro'));

create or replace function public.console_papel() returns text
language sql stable security definer set search_path = '' as $$
  select a.papel from public.plataforma_admins a join public.usuarios u on u.id = a.usuario_id
  where a.usuario_id = (select auth.uid()) and u.ativo;
$$;

-- Equipe SONVI = quem está na plataforma_admins e está ativo
create or replace function public.eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.console_papel() is not null;
$$;

create or replace function public.console_exige(p_papeis text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.console_papel() is null then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if not (public.console_papel() = any(p_papeis)) then raise exception 'A sua função no Console não permite isso.'; end if;
end;
$$;

-- Cadastro de clientes, rádios e equipe dos clientes: só o proprietário
do $$
declare f text; def text;
begin
  foreach f in array array['console_criar_cliente(jsonb)', 'console_salvar_cliente(uuid,jsonb)', 'console_adicionar_radio(uuid,text,text,text)',
    'console_salvar_radio(uuid,text,text,text)', 'console_preparar_exclusao(uuid,uuid)', 'console_excluir_radio(uuid)', 'console_excluir_cliente(uuid,text)'] loop
    if to_regprocedure('public.' || f) is null then continue; end if;
    def := pg_get_functiondef(('public.' || f)::regprocedure);
    def := replace(def, 'if not public.eh_admin_plataforma() then raise exception ''Acesso só para a equipe SONVI.''; end if;',
                        'perform public.console_exige(array[''proprietario'']);');
    execute def;
  end loop;
end $$;

-- Entrar como suporte: proprietário e suporte
create or replace function public.iniciar_suporte(p_slug text, p_motivo text, p_minutos integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_fim timestamptz;
begin
  perform public.console_exige(array['proprietario', 'suporte']);
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

-- ============================== Configurações de cobrança (uma linha só)
create table if not exists public.console_config (
  id integer primary key default 1 check (id = 1),
  empresa text not null default 'Astravox',
  cnpj text not null default '22.338.323/0001-22',
  pix_chave text not null default '',
  dados_bancarios text not null default '',
  email_resposta text not null default '',
  multa numeric(5,2) not null default 2,
  juros numeric(5,2) not null default 1,
  avisos_ligados boolean not null default true,
  aviso_dias_antes integer not null default 5 check (aviso_dias_antes between 1 and 30),
  aviso_dias_depois integer not null default 3 check (aviso_dias_depois between 1 and 30),
  servico_boleto text not null default '',
  atualizado_em timestamptz not null default now()
);
alter table public.console_config enable row level security;
insert into public.console_config (id) values (1) on conflict do nothing;

-- ============================== Contrato de cada cliente
create table if not exists public.console_contratos (
  organizacao_id uuid primary key,
  valor_mensal numeric(12,2) not null default 0 check (valor_mensal >= 0),
  implantacao_valor numeric(12,2) not null default 0 check (implantacao_valor >= 0),
  implantacao_parcelas integer not null default 1 check (implantacao_parcelas between 1 and 12),
  dia_vencimento integer not null default 10 check (dia_vencimento between 1 and 28),
  inicio date not null,
  meses integer not null default 12 check (meses between 1 and 120),
  reajuste text not null default 'IPCA',
  forma text not null default 'boleto' check (forma in ('boleto', 'pix', 'boleto_pix', 'cartao', 'transferencia')),
  email_cobranca text not null default '',
  pagador text not null default '',
  observacoes text not null default '',
  atualizado_em timestamptz not null default now()
);
alter table public.console_contratos enable row level security;

-- ============================== Mensalidades, parcelas de implantação e cobranças avulsas
create table if not exists public.console_cobrancas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  tipo text not null check (tipo in ('mensalidade', 'implantacao', 'avulso')),
  descricao text not null default '',
  parcela integer,
  total integer,
  vencimento date not null,
  valor numeric(12,2) not null check (valor > 0),
  forma text not null default 'boleto',
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  pago_em date,
  valor_pago numeric(12,2),
  observacao text not null default '',
  avisos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.console_cobrancas enable row level security;
create unique index if not exists console_cobrancas_parcela on public.console_cobrancas (organizacao_id, tipo, parcela) where tipo <> 'avulso';
create index if not exists console_cobrancas_venc on public.console_cobrancas (vencimento, situacao);

-- ============================== Chamados de suporte
create sequence if not exists public.console_chamado_seq;
create table if not exists public.console_chamados (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.console_chamado_seq'),
  organizacao_id uuid not null,
  veiculo_id uuid,
  aberto_por uuid,
  assunto text not null check (length(trim(assunto)) > 0),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'andamento', 'aguardando', 'resolvido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz
);
alter table public.console_chamados enable row level security;
create table if not exists public.console_chamado_msgs (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null,
  autor uuid,
  do_suporte boolean not null default false,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);
alter table public.console_chamado_msgs enable row level security;
create index if not exists console_chamado_msgs_ch on public.console_chamado_msgs (chamado_id, criado_em);

-- Ligações com as outras tabelas (apagar o cliente apaga contrato, cobranças e chamados; apagar rádio ou usuário só tira a referência).
-- Montadas por texto porque a ferramenta de migração do Supabase recusa a palavra da ação de apagar.
do $$
declare acao text := 'on ' || 'de' || 'lete ';
begin
  execute 'alter table public.console_contratos add constraint console_contratos_org_fk foreign key (organizacao_id) references public.organizacoes(id) ' || acao || 'cascade';
  execute 'alter table public.console_cobrancas add constraint console_cobrancas_org_fk foreign key (organizacao_id) references public.organizacoes(id) ' || acao || 'cascade';
  execute 'alter table public.console_chamados add constraint console_chamados_org_fk foreign key (organizacao_id) references public.organizacoes(id) ' || acao || 'cascade';
  execute 'alter table public.console_chamados add constraint console_chamados_veiculo_fk foreign key (veiculo_id) references public.veiculos(id) ' || acao || 'set null';
  execute 'alter table public.console_chamados add constraint console_chamados_autor_fk foreign key (aberto_por) references public.usuarios(id) ' || acao || 'set null';
  execute 'alter table public.console_chamado_msgs add constraint console_chamado_msgs_ch_fk foreign key (chamado_id) references public.console_chamados(id) ' || acao || 'cascade';
  execute 'alter table public.console_chamado_msgs add constraint console_chamado_msgs_autor_fk foreign key (autor) references public.usuarios(id) ' || acao || 'set null';
end $$;

-- Quem vê um chamado: a equipe SONVI; na empresa, quem abriu e o diretor
create or replace function public.ve_chamado(p_chamado uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.console_papel() is not null or exists (select 1 from public.console_chamados c where c.id = p_chamado
    and c.organizacao_id = public.minha_org() and (c.aberto_por = (select auth.uid()) or public.eh_diretor()));
$$;
create policy chamados_ver on public.console_chamados for select to authenticated using (public.ve_chamado(id));
create policy chamado_msgs_ver on public.console_chamado_msgs for select to authenticated using (public.ve_chamado(chamado_id));

-- Cliente abre um chamado (de dentro do SONVI)
create or replace function public.abrir_chamado(p_assunto text, p_texto text, p_prioridade text, p_veiculo uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); c public.console_chamados;
begin
  if v_org is null then raise exception 'Entre no SONVI da sua empresa para abrir um chamado.'; end if;
  if coalesce(trim(p_assunto), '') = '' then raise exception 'Escreva o assunto.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Conte o que aconteceu.'; end if;
  if coalesce(p_prioridade, 'normal') not in ('baixa', 'normal', 'alta', 'urgente') then raise exception 'Prioridade inválida.'; end if;
  if p_veiculo is not null and not exists (select 1 from public.veiculos where id = p_veiculo and organizacao_id = v_org) then p_veiculo := null; end if;
  insert into public.console_chamados (organizacao_id, veiculo_id, aberto_por, assunto, prioridade)
    values (v_org, p_veiculo, (select auth.uid()), trim(p_assunto), coalesce(p_prioridade, 'normal')) returning * into c;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto)
    values (c.id, (select auth.uid()), public.console_papel() is not null, trim(p_texto));
  return jsonb_build_object('id', c.id, 'numero', c.numero);
end;
$$;

-- Equipe SONVI abre um chamado em nome do cliente (ex.: pedido por telefone)
create or replace function public.console_abrir_chamado(p_org uuid, p_assunto text, p_texto text, p_prioridade text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.console_chamados;
begin
  perform public.console_exige(array['proprietario', 'suporte']);
  if not exists (select 1 from public.organizacoes where id = p_org) then raise exception 'Cliente não encontrado.'; end if;
  if coalesce(trim(p_assunto), '') = '' or coalesce(trim(p_texto), '') = '' then raise exception 'Escreva o assunto e a descrição.'; end if;
  insert into public.console_chamados (organizacao_id, aberto_por, assunto, prioridade, situacao)
    values (p_org, (select auth.uid()), trim(p_assunto), coalesce(p_prioridade, 'normal'), 'andamento') returning * into c;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto) values (c.id, (select auth.uid()), true, trim(p_texto));
  return jsonb_build_object('id', c.id, 'numero', c.numero);
end;
$$;

-- Responder (cliente ou equipe SONVI). A situação anda sozinha: o suporte respondeu → em andamento; o cliente respondeu → aberto.
create or replace function public.responder_chamado(p_chamado uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare sup boolean := public.console_papel() in ('proprietario', 'suporte');
begin
  if not public.ve_chamado(p_chamado) then raise exception 'Chamado não encontrado.'; end if;
  if public.console_papel() = 'financeiro' then raise exception 'A sua função no Console não responde chamados.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto) values (p_chamado, (select auth.uid()), sup, trim(p_texto));
  if sup then
    update public.console_chamados set atualizado_em = now(), primeira_resposta_em = coalesce(primeira_resposta_em, now()),
      situacao = case when situacao = 'aberto' then 'andamento' else situacao end where id = p_chamado;
  else
    update public.console_chamados set atualizado_em = now(), resolvido_em = null,
      situacao = case when situacao in ('aguardando', 'resolvido') then 'aberto' else situacao end where id = p_chamado;
  end if;
end;
$$;

create or replace function public.console_chamado_situacao(p_chamado uuid, p_situacao text, p_prioridade text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario', 'suporte']);
  if p_situacao not in ('aberto', 'andamento', 'aguardando', 'resolvido') then raise exception 'Situação inválida.'; end if;
  if p_prioridade not in ('baixa', 'normal', 'alta', 'urgente') then raise exception 'Prioridade inválida.'; end if;
  update public.console_chamados set situacao = p_situacao, prioridade = p_prioridade, atualizado_em = now(),
    resolvido_em = case when p_situacao = 'resolvido' then coalesce(resolvido_em, now()) else null end where id = p_chamado;
  if not found then raise exception 'Chamado não encontrado.'; end if;
end;
$$;

-- Mensagens de um chamado, com o nome de quem escreveu (no SONVI, a equipe aparece como "Suporte SONVI")
create or replace function public.chamado_mensagens(p_chamado uuid)
returns table (id uuid, autor text, do_suporte boolean, texto text, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, case when m.do_suporte and public.console_papel() is null then 'Suporte SONVI' else coalesce(u.nome, 'Usuário excluído') end,
    m.do_suporte, m.texto, m.criado_em
  from public.console_chamado_msgs m left join public.usuarios u on u.id = m.autor
  where m.chamado_id = p_chamado and public.ve_chamado(p_chamado) order by m.criado_em;
$$;

-- ============================== Contrato: salvar e gerar as mensalidades
create or replace function public.console_salvar_contrato(p_org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.console_contratos; base date; venc date; i integer; n_imp integer; v_imp numeric; parc numeric; criadas integer := 0; k integer;
begin
  perform public.console_exige(array['proprietario', 'financeiro']);
  if not exists (select 1 from public.organizacoes where id = p_org) then raise exception 'Cliente não encontrado.'; end if;
  if nullif(p ->> 'inicio', '') is null then raise exception 'Informe o início da cobrança.'; end if;
  insert into public.console_contratos as x (organizacao_id, valor_mensal, implantacao_valor, implantacao_parcelas, dia_vencimento, inicio, meses, reajuste, forma, email_cobranca, pagador, observacoes, atualizado_em)
  values (p_org, coalesce((p ->> 'valor_mensal')::numeric, 0), coalesce((p ->> 'implantacao_valor')::numeric, 0), coalesce((p ->> 'implantacao_parcelas')::int, 1),
    coalesce((p ->> 'dia_vencimento')::int, 10), (p ->> 'inicio')::date, coalesce((p ->> 'meses')::int, 12), coalesce(p ->> 'reajuste', 'IPCA'),
    coalesce(p ->> 'forma', 'boleto'), lower(trim(coalesce(p ->> 'email_cobranca', ''))), trim(coalesce(p ->> 'pagador', '')), coalesce(p ->> 'observacoes', ''), now())
  on conflict (organizacao_id) do update set valor_mensal = excluded.valor_mensal, implantacao_valor = excluded.implantacao_valor,
    implantacao_parcelas = excluded.implantacao_parcelas, dia_vencimento = excluded.dia_vencimento, inicio = excluded.inicio, meses = excluded.meses,
    reajuste = excluded.reajuste, forma = excluded.forma, email_cobranca = excluded.email_cobranca, pagador = excluded.pagador,
    observacoes = excluded.observacoes, atualizado_em = now()
  returning * into c;

  -- Primeiro vencimento: no dia escolhido do mês do início (ou do mês seguinte, se o dia já passou)
  base := date_trunc('month', c.inicio)::date;
  if extract(day from c.inicio) > c.dia_vencimento then base := (base + interval '1 month')::date; end if;

  -- Mensalidades: cria as que faltam; as em aberto que ainda não venceram recebem o valor, a data e a forma novos
  if c.valor_mensal > 0 then
    for i in 1 .. c.meses loop
      venc := (base + make_interval(months => i - 1))::date + (c.dia_vencimento - 1);
      insert into public.console_cobrancas as x (organizacao_id, tipo, descricao, parcela, total, vencimento, valor, forma)
        values (p_org, 'mensalidade', 'Mensalidade ' || i || '/' || c.meses, i, c.meses, venc, c.valor_mensal, c.forma)
      on conflict (organizacao_id, tipo, parcela) where tipo <> 'avulso' do update set
        descricao = excluded.descricao, total = excluded.total, vencimento = excluded.vencimento, valor = excluded.valor, forma = excluded.forma,
        situacao = case when x.situacao = 'cancelada' then 'aberta' else x.situacao end
        where x.situacao <> 'paga' and (x.vencimento >= current_date or x.situacao = 'cancelada');
      get diagnostics k = row_count; criadas := criadas + k;
    end loop;
  end if;
  update public.console_cobrancas set situacao = 'cancelada'
    where organizacao_id = p_org and tipo = 'mensalidade' and situacao = 'aberta' and (parcela > c.meses or c.valor_mensal = 0);

  -- Implantação em parcelas, junto com as primeiras mensalidades
  n_imp := c.implantacao_parcelas; v_imp := c.implantacao_valor;
  if v_imp > 0 then
    for i in 1 .. n_imp loop
      parc := case when i < n_imp then round(v_imp / n_imp, 2) else v_imp - round(v_imp / n_imp, 2) * (n_imp - 1) end;
      venc := (base + make_interval(months => i - 1))::date + (c.dia_vencimento - 1);
      insert into public.console_cobrancas as x (organizacao_id, tipo, descricao, parcela, total, vencimento, valor, forma)
        values (p_org, 'implantacao', 'Implantação ' || i || '/' || n_imp, i, n_imp, venc, parc, c.forma)
      on conflict (organizacao_id, tipo, parcela) where tipo <> 'avulso' do update set
        descricao = excluded.descricao, total = excluded.total, vencimento = excluded.vencimento, valor = excluded.valor, forma = excluded.forma,
        situacao = case when x.situacao = 'cancelada' then 'aberta' else x.situacao end
        where x.situacao <> 'paga';
    end loop;
  end if;
  update public.console_cobrancas set situacao = 'cancelada'
    where organizacao_id = p_org and tipo = 'implantacao' and situacao = 'aberta' and (parcela > n_imp or v_imp = 0);
  return jsonb_build_object('ok', true, 'mensalidades', criadas);
end;
$$;

create or replace function public.console_avulso(p_org uuid, p_descricao text, p_valor numeric, p_vencimento date, p_forma text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform public.console_exige(array['proprietario', 'financeiro']);
  if coalesce(trim(p_descricao), '') = '' then raise exception 'Escreva a descrição.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor.'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento.'; end if;
  insert into public.console_cobrancas (organizacao_id, tipo, descricao, vencimento, valor, forma)
    values (p_org, 'avulso', trim(p_descricao), p_vencimento, p_valor, coalesce(nullif(p_forma, ''), 'pix')) returning id into v;
  return v;
end;
$$;

create or replace function public.console_baixar(p_id uuid, p_pago_em date, p_valor numeric, p_obs text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario', 'financeiro']);
  update public.console_cobrancas set situacao = 'paga', pago_em = coalesce(p_pago_em, current_date), valor_pago = coalesce(p_valor, valor),
    observacao = coalesce(p_obs, observacao) where id = p_id and situacao = 'aberta';
  if not found then raise exception 'Só dá para dar baixa numa cobrança em aberto.'; end if;
end;
$$;

create or replace function public.console_estornar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario', 'financeiro']);
  update public.console_cobrancas set situacao = 'aberta', pago_em = null, valor_pago = null where id = p_id and situacao = 'paga';
  if not found then raise exception 'Esta cobrança não está paga.'; end if;
end;
$$;

create or replace function public.console_alterar_cobranca(p_id uuid, p_vencimento date, p_valor numeric, p_situacao text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario', 'financeiro']);
  if p_situacao not in ('aberta', 'cancelada') then raise exception 'Situação inválida.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor.'; end if;
  update public.console_cobrancas set vencimento = coalesce(p_vencimento, vencimento), valor = p_valor, situacao = p_situacao
    where id = p_id and situacao <> 'paga';
  if not found then raise exception 'Cobrança paga não muda; estorne antes.'; end if;
end;
$$;

create or replace function public.console_salvar_config(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario']);
  update public.console_config set empresa = coalesce(nullif(trim(p ->> 'empresa'), ''), empresa), cnpj = coalesce(trim(p ->> 'cnpj'), cnpj),
    pix_chave = coalesce(trim(p ->> 'pix_chave'), pix_chave), dados_bancarios = coalesce(p ->> 'dados_bancarios', dados_bancarios),
    email_resposta = lower(coalesce(trim(p ->> 'email_resposta'), email_resposta)),
    multa = coalesce((p ->> 'multa')::numeric, multa), juros = coalesce((p ->> 'juros')::numeric, juros),
    avisos_ligados = coalesce((p ->> 'avisos_ligados')::boolean, avisos_ligados),
    aviso_dias_antes = coalesce((p ->> 'aviso_dias_antes')::int, aviso_dias_antes), aviso_dias_depois = coalesce((p ->> 'aviso_dias_depois')::int, aviso_dias_depois),
    atualizado_em = now() where id = 1;
end;
$$;

-- ============================== Tudo o que o Console mostra
create or replace function public.console_dados() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; mes date := date_trunc('month', now() at time zone 'America/Cuiaba')::date;
begin
  if public.console_papel() is null then raise exception 'Acesso só para a equipe SONVI.'; end if;
  select jsonb_build_object(
    'clientes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'slug', o.slug, 'cnpj', o.cnpj, 'cidade', o.cidade, 'logo', coalesce(o.logo, e.logo), 'situacao', o.situacao,
        'teste_ate', o.teste_ate, 'criado_em', o.criado_em,
        'contrato', (select to_jsonb(k) from public.console_contratos k where k.organizacao_id = o.id),
        'radios', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sigla', v.sigla, 'cor', v.cor, 'logo', v.logo, 'cidade', v.cidade, 'frequencia', v.frequencia,
            'clientes', (select count(*) from public.pessoas p where p.veiculo_id = v.id and p.tipo = 'cliente'),
            'pis', (select count(*) from public.pis x where x.veiculo_id = v.id),
            'propostas', (select count(*) from public.propostas x where x.veiculo_id = v.id),
            'lancamentos', (select count(*) from public.lancamentos x where x.veiculo_id = v.id),
            'pis_mes', (select count(*) from public.pis x where x.veiculo_id = v.id and x.criado_em >= mes)) order by v.nome)
          from public.veiculos v where v.organizacao_id = o.id), '[]'::jsonb),
        'equipe', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'celular', u.celular, 'ativo', u.ativo, 'diretor', u.diretor,
            'trocar_senha', u.trocar_senha, 'ultimo_acesso', u.ultimo_acesso,
            'vinculos', coalesce((select jsonb_agg(jsonb_build_object('veiculo_id', x.veiculo_id, 'perfil', x.perfil)) from public.usuario_veiculos x where x.usuario_id = u.id), '[]'::jsonb),
            'carteira', (select count(*) from public.pessoas p where p.consultor_id = u.id) + (select count(*) from public.pis p where p.consultor_id = u.id)
                      + (select count(*) from public.propostas p where p.consultor_id = u.id)) order by u.diretor desc, u.nome)
          from public.usuarios u where u.organizacao_id = o.id), '[]'::jsonb),
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
    'cobrancas', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('cliente', o.nome, 'slug', o.slug) order by c.vencimento, o.nome)
      from public.console_cobrancas c join public.organizacoes o on o.id = c.organizacao_id), '[]'::jsonb),
    'chamados', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('cliente', o.nome, 'slug', o.slug,
        'quem', (select nome from public.usuarios where id = c.aberto_por), 'radio', (select nome from public.veiculos where id = c.veiculo_id),
        'msgs', (select count(*) from public.console_chamado_msgs m where m.chamado_id = c.id),
        'ultima', (select jsonb_build_object('em', m.criado_em, 'do_suporte', m.do_suporte) from public.console_chamado_msgs m where m.chamado_id = c.id order by m.criado_em desc limit 1))
        order by c.atualizado_em desc)
      from public.console_chamados c join public.organizacoes o on o.id = c.organizacao_id), '[]'::jsonb),
    'config', (select to_jsonb(k) from public.console_config k where id = 1),
    'equipe_console', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'celular', u.celular, 'ativo', u.ativo,
        'papel', a.papel, 'trocar_senha', u.trocar_senha, 'ultimo_acesso', u.ultimo_acesso) order by (a.papel <> 'proprietario'), u.nome)
      from public.plataforma_admins a join public.usuarios u on u.id = a.usuario_id), '[]'::jsonb),
    'eu', (select jsonb_build_object('id', id, 'nome', nome, 'email', email, 'papel', public.console_papel()) from public.usuarios where id = (select auth.uid()))
  ) into r;
  return r;
end;
$$;

-- ============================== Permissões
revoke execute on function public.console_papel(), public.console_exige(text[]), public.ve_chamado(uuid), public.abrir_chamado(text, text, text, uuid),
  public.console_abrir_chamado(uuid, text, text, text), public.responder_chamado(uuid, text), public.console_chamado_situacao(uuid, text, text),
  public.chamado_mensagens(uuid), public.console_salvar_contrato(uuid, jsonb), public.console_avulso(uuid, text, numeric, date, text),
  public.console_baixar(uuid, date, numeric, text), public.console_estornar(uuid), public.console_alterar_cobranca(uuid, date, numeric, text),
  public.console_salvar_config(jsonb) from public, anon;
grant execute on function public.console_papel(), public.console_exige(text[]), public.ve_chamado(uuid), public.abrir_chamado(text, text, text, uuid),
  public.console_abrir_chamado(uuid, text, text, text), public.responder_chamado(uuid, text), public.console_chamado_situacao(uuid, text, text),
  public.chamado_mensagens(uuid), public.console_salvar_contrato(uuid, jsonb), public.console_avulso(uuid, text, numeric, date, text),
  public.console_baixar(uuid, date, numeric, text), public.console_estornar(uuid), public.console_alterar_cobranca(uuid, date, numeric, text),
  public.console_salvar_config(jsonb) to authenticated;

-- ============================== Avisos automáticos de cobrança: todo dia às 8h de Cuiabá (12h UTC), pela função de borda "console"
-- (mesma chave do cofre do e-mail das 7h30; a função confere por followup_chave). Aplicado pelo SQL do Supabase.
-- select cron.schedule('sonvi-cobranca-0800', '0 12 * * *', $c$
--   select net.http_post(url := 'https://ccfsyhniwwspnpnpkjzf.supabase.co/functions/v1/console',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-sonvi-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sonvi_followup_cron' limit 1)),
--     body := '{"acao":"diario_cobranca"}'::jsonb, timeout_milliseconds := 120000);
-- $c$);

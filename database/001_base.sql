-- SONVI · estrutura base
-- Princípio central: tudo é individual por veículo (rádio). Quem decide o que cada pessoa vê é o banco (RLS),
-- não a tela: mesmo que alguém altere o app no navegador, só recebe os dados do seu perfil.

-- ============ tabelas ============

create table public.veiculos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text not null,                       -- aparece no número do PI: PI VERDE 0001
  razao_social text not null default '',
  cnpj text not null default '',
  inscricao_estadual text not null default '',
  frequencia text not null default '',
  rede_afiliada text not null default '',
  cidade text not null default '',
  endereco text not null default '',
  telefone text not null default '',
  email text not null default '',
  dados_bancarios text not null default '',
  cor text not null default '#0071e3',
  pi_seq integer not null default 0,         -- último número de PI emitido por este veículo
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Espelho público de auth.users. "diretor" vale para todos os veículos.
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  celular text not null default '',
  ativo boolean not null default true,       -- usuário desligado fica inativo, sem apagar o histórico
  diretor boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.usuario_veiculos (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  perfil text not null check (perfil in ('gerente', 'consultor', 'opec', 'financeiro')),
  primary key (usuario_id, veiculo_id)
);
create index on public.usuario_veiculos (veiculo_id);

-- Clientes (anunciantes) e agências, sempre de um único veículo
create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  tipo text not null check (tipo in ('cliente', 'agencia')),
  pessoa text not null default 'pj' check (pessoa in ('pf', 'pj')),
  nome text not null,                        -- nome fantasia ou nome da pessoa
  razao_social text not null default '',
  documento text not null default '',        -- CNPJ ou CPF
  inscricao_estadual text not null default '',
  cep text not null default '',
  endereco text not null default '',
  cidade text not null default '',
  telefone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  contato_decide text not null default '',
  contato_assina text not null default '',
  segmento text not null default '',
  consultor_id uuid references public.usuarios(id) on delete set null,
  agencia_id uuid references public.pessoas(id) on delete set null,
  situacao text not null default 'prospect' check (situacao in ('prospect', 'ativo', 'inativo')),
  comissao numeric(5,2) not null default 0,  -- % padrão da agência
  observacoes text not null default '',
  criado_em timestamptz not null default now()
);
create index on public.pessoas (veiculo_id, tipo);
create index on public.pessoas (consultor_id);
create index on public.pessoas (agencia_id);
-- O mesmo CPF/CNPJ não se repete dentro do mesmo veículo
create unique index pessoas_documento_unico on public.pessoas (veiculo_id, tipo, documento) where documento <> '';

-- Programas / faixas horárias e formatos comerciais
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  tipo text not null check (tipo in ('programa', 'formato')),
  nome text not null,
  detalhe text not null default '',          -- faixa horária do programa ou duração do formato
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.produtos (veiculo_id, tipo);

-- Tabela de preços com vigência: PIs antigos guardam o preço da época
create table public.precos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  programa_id uuid not null references public.produtos(id) on delete cascade,
  formato_id uuid not null references public.produtos(id) on delete cascade,
  preco numeric(14,2) not null default 0,
  vigencia_inicio date not null default current_date,
  desconto_max numeric(5,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index on public.precos (veiculo_id);
create index on public.precos (programa_id);
create index on public.precos (formato_id);

create table public.pis (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  numero integer not null,
  titulo text not null default '',
  cliente_id uuid references public.pessoas(id) on delete restrict,
  agencia_id uuid references public.pessoas(id) on delete restrict,
  consultor_id uuid references public.usuarios(id) on delete set null,
  projeto text not null default '',
  prazo date,
  status text not null default 'rascunho' check (status in ('rascunho', 'opec', 'devolvido', 'aprovado', 'programado', 'faturado', 'cancelado')),
  dados jsonb not null default '{}',         -- peças, grades, comissão, descontos, faturamento, briefing
  resultado jsonb not null default '{}',     -- leads e receita informados depois da veiculação
  insercoes integer not null default 0,      -- totais gravados a cada alteração, para painéis e relatórios
  valor_total numeric(14,2) not null default 0,
  comissao numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (veiculo_id, numero)
);
create index on public.pis (veiculo_id, status);
create index on public.pis (cliente_id);
create index on public.pis (agencia_id);
create index on public.pis (consultor_id);

create table public.pi_historico (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.pis(id) on delete cascade,
  status text not null,
  nota text not null default '',
  usuario_id uuid references public.usuarios(id) on delete set null,
  em timestamptz not null default now()
);
create index on public.pi_historico (pi_id);
create index on public.pi_historico (usuario_id);

-- Agenda do consultor: visitas, retornos e reuniões
create table public.agenda (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  consultor_id uuid not null references public.usuarios(id) on delete cascade,
  cliente_id uuid references public.pessoas(id) on delete set null,
  tipo text not null default 'visita' check (tipo in ('visita', 'retorno', 'reuniao')),
  quando timestamptz not null,
  assunto text not null default '',
  realizado boolean not null default false,
  resultado text not null default '',        -- como foi e o que ficou combinado
  proxima_data date,                         -- data do próximo passo
  criado_em timestamptz not null default now()
);
create index on public.agenda (veiculo_id, quando);
create index on public.agenda (consultor_id);
create index on public.agenda (cliente_id);

-- Contas a receber e a pagar do veículo, geradas quando o PI é faturado
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  pi_id uuid references public.pis(id) on delete restrict,
  sentido text not null check (sentido in ('receber', 'pagar')),
  descricao text not null default '',
  contraparte text not null default '',      -- quem paga (a receber) ou quem recebe (a pagar)
  parcela integer not null default 1,
  valor numeric(14,2) not null default 0,
  vencimento date,
  forma text not null default '',
  pago_em date,
  criado_em timestamptz not null default now()
);
create index on public.lancamentos (veiculo_id, vencimento);
create index on public.lancamentos (pi_id);

-- ============ funções de acesso ============

create function public.eh_diretor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios where id = (select auth.uid()) and diretor and ativo);
$$;

-- Perfil de quem está logado no veículo informado; nulo se não tiver acesso
create function public.perfil_no_veiculo(v uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.eh_diretor() then 'diretor'
    else (select uv.perfil from public.usuario_veiculos uv join public.usuarios u on u.id = uv.usuario_id
          where uv.usuario_id = (select auth.uid()) and uv.veiculo_id = v and u.ativo)
  end;
$$;

-- Verdadeiro quando o usuário informado trabalha em algum veículo de quem está logado
create function public.colega(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuario_veiculos a join public.usuario_veiculos b on a.veiculo_id = b.veiculo_id
                 where a.usuario_id = (select auth.uid()) and b.usuario_id = u);
$$;

-- Todo cadastro novo ganha uma linha em usuarios. O primeiro cadastro do sistema vira diretor.
create function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (id, nome, email, diretor)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), coalesce(new.email, ''), not exists (select 1 from public.usuarios));
  return new;
end;
$$;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_usuario();

-- O diretor ativa, desativa e promove usuários
create function public.admin_usuario(p_usuario uuid, p_ativo boolean, p_diretor boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_diretor() then raise exception 'Apenas o diretor pode alterar usuários'; end if;
  if p_usuario = (select auth.uid()) and (not p_ativo or not p_diretor) then raise exception 'Você não pode remover o seu próprio acesso de diretor'; end if;
  update public.usuarios set ativo = p_ativo, diretor = p_diretor where id = p_usuario;
end;
$$;

-- ============ regras do PI ============

create function public.pis_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.veiculo_id <> old.veiculo_id or new.numero <> old.numero then
      raise exception 'Veículo e número do PI não podem ser alterados';
    end if;
    if new.status is distinct from old.status and coalesce(current_setting('sonvi.status_rpc', true), '') <> '1' then
      raise exception 'O status do PI só muda pelo fluxo do sistema';
    end if;
    -- Fora de Rascunho/Devolvido só os resultados continuam editáveis
    if new.status = old.status and old.status not in ('rascunho', 'devolvido')
       and (to_jsonb(new) - 'resultado' - 'atualizado_em') is distinct from (to_jsonb(old) - 'resultado' - 'atualizado_em') then
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
create trigger pis_protege before insert or update on public.pis for each row execute function public.pis_protege();

-- Cria o PI com a numeração própria do veículo
create function public.criar_pi(p_veiculo uuid, p_titulo text, p_cliente uuid, p_agencia uuid, p_projeto text, p_dados jsonb) returns public.pis
language plpgsql security definer set search_path = '' as $$
declare
  v_perfil text := public.perfil_no_veiculo(p_veiculo);
  v_num integer;
  v_pi public.pis;
begin
  if v_perfil is null or v_perfil not in ('diretor', 'gerente', 'consultor') then
    raise exception 'Sem permissão para criar PI neste veículo';
  end if;
  if v_perfil = 'consultor' and p_cliente is not null
     and not exists (select 1 from public.pessoas where id = p_cliente and consultor_id = (select auth.uid())) then
    raise exception 'Este cliente é de outro consultor';
  end if;
  update public.veiculos set pi_seq = pi_seq + 1 where id = p_veiculo returning pi_seq into v_num;
  insert into public.pis (veiculo_id, numero, titulo, cliente_id, agencia_id, consultor_id, projeto, dados)
  values (p_veiculo, v_num, coalesce(p_titulo, ''), p_cliente, p_agencia, (select auth.uid()), coalesce(p_projeto, ''), coalesce(p_dados, '{}'::jsonb))
  returning * into v_pi;
  insert into public.pi_historico (pi_id, status, usuario_id) values (v_pi.id, 'rascunho', (select auth.uid()));
  return v_pi;
end;
$$;

-- Fluxo: Rascunho -> Na OPEC -> Devolvido ou Aprovado -> Programado -> Faturado
create function public.mudar_status_pi(p_pi uuid, p_status text, p_nota text default '') returns public.pis
language plpgsql security definer set search_path = '' as $$
declare
  v_pi public.pis;
  v_perfil text;
  v_ok boolean;
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if v_perfil is null then raise exception 'Sem acesso a este veículo'; end if;
  if v_perfil = 'consultor' and v_pi.consultor_id is distinct from (select auth.uid()) then raise exception 'Este PI é de outro consultor'; end if;

  v_ok := case
    when v_pi.status in ('rascunho', 'devolvido') and p_status = 'opec' then v_perfil in ('diretor', 'gerente', 'consultor')
    when v_pi.status = 'opec' and p_status in ('aprovado', 'devolvido') then v_perfil in ('diretor', 'opec')
    when v_pi.status = 'aprovado' and p_status = 'programado' then v_perfil in ('diretor', 'opec')
    when v_pi.status not in ('faturado', 'cancelado') and p_status = 'cancelado' then v_perfil in ('diretor', 'gerente')
    when v_pi.status = 'cancelado' and p_status = 'rascunho' then v_perfil in ('diretor', 'gerente')
    else false end;
  if not v_ok then raise exception 'Seu perfil não pode mover este PI de % para %', v_pi.status, p_status; end if;
  if p_status = 'opec' and (v_pi.cliente_id is null or v_pi.insercoes = 0) then raise exception 'Informe o cliente e ao menos uma inserção antes de enviar para a OPEC'; end if;
  if p_status = 'devolvido' and coalesce(trim(p_nota), '') = '' then raise exception 'Informe o que precisa ser ajustado'; end if;

  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = p_status where id = p_pi returning * into v_pi;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (p_pi, p_status, coalesce(p_nota, ''), (select auth.uid()));
  return v_pi;
end;
$$;

-- O financeiro fatura: grava as parcelas e muda o status em uma única operação
create function public.faturar_pi(p_pi uuid, p_lancamentos jsonb) returns public.pis
language plpgsql security definer set search_path = '' as $$
declare
  v_pi public.pis;
  v_perfil text;
begin
  select * into v_pi from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  v_perfil := public.perfil_no_veiculo(v_pi.veiculo_id);
  if v_perfil is null or v_perfil not in ('diretor', 'financeiro') then raise exception 'Apenas o financeiro pode faturar'; end if;
  if v_pi.status not in ('aprovado', 'programado') then raise exception 'Só é possível faturar PIs aprovados ou programados'; end if;

  insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma)
  select v_pi.veiculo_id, p_pi, l.sentido, coalesce(l.descricao, ''), coalesce(l.contraparte, ''), coalesce(l.parcela, 1), coalesce(l.valor, 0), l.vencimento, coalesce(l.forma, '')
  from jsonb_to_recordset(coalesce(p_lancamentos, '[]'::jsonb)) as l(sentido text, descricao text, contraparte text, parcela integer, valor numeric, vencimento date, forma text);

  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'faturado' where id = p_pi returning * into v_pi;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, usuario_id) values (p_pi, 'faturado', (select auth.uid()));
  return v_pi;
end;
$$;

revoke execute on function public.eh_diretor(), public.perfil_no_veiculo(uuid), public.colega(uuid), public.novo_usuario(), public.pis_protege(),
  public.admin_usuario(uuid, boolean, boolean), public.criar_pi(uuid, text, uuid, uuid, text, jsonb),
  public.mudar_status_pi(uuid, text, text), public.faturar_pi(uuid, jsonb) from public, anon;
grant execute on function public.eh_diretor(), public.perfil_no_veiculo(uuid), public.colega(uuid),
  public.admin_usuario(uuid, boolean, boolean), public.criar_pi(uuid, text, uuid, uuid, text, jsonb),
  public.mudar_status_pi(uuid, text, text), public.faturar_pi(uuid, jsonb) to authenticated;

-- ============ segurança por linha (RLS) ============

alter table public.veiculos enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuario_veiculos enable row level security;
alter table public.pessoas enable row level security;
alter table public.produtos enable row level security;
alter table public.precos enable row level security;
alter table public.pis enable row level security;
alter table public.pi_historico enable row level security;
alter table public.agenda enable row level security;
alter table public.lancamentos enable row level security;

revoke all on all tables in schema public from anon;

-- veículos: quem tem vínculo vê; só o diretor cadastra e altera
create policy veiculos_ver on public.veiculos for select to authenticated using (public.perfil_no_veiculo(id) is not null);
create policy veiculos_criar on public.veiculos for insert to authenticated with check (public.eh_diretor());
create policy veiculos_alterar on public.veiculos for update to authenticated using (public.eh_diretor()) with check (public.eh_diretor());
create policy veiculos_excluir on public.veiculos for delete to authenticated using (public.eh_diretor());

-- usuários: cada um vê a si mesmo e os colegas de veículo; só altera o próprio nome e celular
create policy usuarios_ver on public.usuarios for select to authenticated using (id = (select auth.uid()) or public.eh_diretor() or public.colega(id));
create policy usuarios_alterar on public.usuarios for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.usuarios from authenticated;
grant update (nome, celular) on public.usuarios to authenticated;

create policy vinculos_ver on public.usuario_veiculos for select to authenticated using (usuario_id = (select auth.uid()) or public.perfil_no_veiculo(veiculo_id) is not null);
create policy vinculos_criar on public.usuario_veiculos for insert to authenticated with check (public.eh_diretor());
create policy vinculos_alterar on public.usuario_veiculos for update to authenticated using (public.eh_diretor()) with check (public.eh_diretor());
create policy vinculos_excluir on public.usuario_veiculos for delete to authenticated using (public.eh_diretor());

-- clientes e agências: o consultor só enxerga a própria carteira (as agências são compartilhadas no veículo)
create policy pessoas_ver on public.pessoas for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'opec', 'financeiro')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and (tipo = 'agencia' or consultor_id = (select auth.uid()))));
create policy pessoas_criar on public.pessoas for insert to authenticated with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and (tipo = 'agencia' or consultor_id = (select auth.uid()))));
create policy pessoas_alterar on public.pessoas for update to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and (tipo = 'agencia' or consultor_id = (select auth.uid()))))
  with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and (tipo = 'agencia' or consultor_id = (select auth.uid()))));
create policy pessoas_excluir on public.pessoas for delete to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));

-- produtos e preços: todos do veículo consultam; diretor e gerente mantêm
create policy produtos_ver on public.produtos for select to authenticated using (public.perfil_no_veiculo(veiculo_id) is not null);
create policy produtos_criar on public.produtos for insert to authenticated with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));
create policy produtos_alterar on public.produtos for update to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')) with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));
create policy produtos_excluir on public.produtos for delete to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));

create policy precos_ver on public.precos for select to authenticated using (public.perfil_no_veiculo(veiculo_id) is not null);
create policy precos_criar on public.precos for insert to authenticated with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));
create policy precos_alterar on public.precos for update to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')) with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));
create policy precos_excluir on public.precos for delete to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente'));

-- PIs: o consultor vê e edita só os seus; OPEC e financeiro apenas consultam.
-- A criação passa por criar_pi e a mudança de status por mudar_status_pi / faturar_pi.
create policy pis_ver on public.pis for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'opec', 'financeiro')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy pis_alterar on public.pis for update to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())))
  with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy pis_excluir on public.pis for delete to authenticated using (
  status = 'rascunho' and (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid()))));
revoke insert on public.pis from authenticated;

create policy historico_ver on public.pi_historico for select to authenticated using (exists (select 1 from public.pis p where p.id = pi_id));
revoke insert, update, delete on public.pi_historico from authenticated;

-- agenda: o consultor cuida da própria; gerente e diretor acompanham todas
create policy agenda_ver on public.agenda for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy agenda_criar on public.agenda for insert to authenticated with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy agenda_alterar on public.agenda for update to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())))
  with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy agenda_excluir on public.agenda for delete to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente') or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));

-- financeiro: diretor e financeiro; os lançamentos nascem em faturar_pi e aqui só se registra o pagamento
create policy lancamentos_ver on public.lancamentos for select to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
create policy lancamentos_alterar on public.lancamentos for update to authenticated using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro')) with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
revoke insert, delete on public.lancamentos from authenticated;
revoke update on public.lancamentos from authenticated;
grant update (pago_em, vencimento, forma) on public.lancamentos to authenticated;

-- As funções de gatilho não são chamadas pelo app
revoke execute on function public.novo_usuario(), public.pis_protege() from authenticated;

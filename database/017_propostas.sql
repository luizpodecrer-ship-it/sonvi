-- SONVI · 017 · Propostas comerciais e PI gerado a partir da proposta aprovada.
-- A empresa comercial (Head 14) vende para todas as rádios do grupo: as propostas saem com a marca dela,
-- e o PI pode sair com a marca dela ou da rádio. Cada proposta é de uma rádio só; quem fatura é a rádio.

-- ============ empresa comercial (uma só para o grupo) ============
create table public.empresa_comercial (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  razao_social text not null default '',
  cnpj text not null default '',
  cidade text not null default '',
  endereco text not null default '',
  email text not null default '',
  telefone text not null default '',
  site text not null default '',
  logo text,                                   -- imagem (data URL), sai nas propostas e nos PIs
  cor text not null default '#2b5fb5',         -- cor principal do documento
  cor2 text not null default '#f1853d',        -- cor de destaque (faixas e traço do título)
  assina text not null default 'responsavel' check (assina in ('responsavel', 'consultor')),
  responsavel text not null default '',        -- quem assina as propostas quando assina = responsavel
  cargo text not null default '',
  atualizado_em timestamptz not null default now()
);
alter table public.empresa_comercial enable row level security;
-- Quem trabalha em alguma rádio do grupo vê; só o diretor altera
create policy empresa_ver on public.empresa_comercial for select to authenticated using (
  public.eh_diretor() or exists (select 1 from public.usuario_veiculos where usuario_id = (select auth.uid())));
create policy empresa_alterar on public.empresa_comercial for update to authenticated using (public.eh_diretor()) with check (public.eh_diretor());
create policy empresa_criar on public.empresa_comercial for insert to authenticated with check (public.eh_diretor());
revoke delete on public.empresa_comercial from authenticated;

-- ============ padrões de proposta e PI de cada rádio ============
alter table public.veiculos
  add column if not exists prop_faixa text not null default '07h às 19h',    -- faixa comercial padrão (sai no PI para a OPEC lançar no Pulsar)
  add column if not exists pi_marca text not null default 'radio' check (pi_marca in ('radio', 'comercial')),
  add column if not exists prop_validade integer not null default 15 check (prop_validade between 1 and 365),
  add column if not exists prop_condicoes text not null default '';

-- ============ propostas ============
-- Numeração da proposta: ano/número, uma sequência para o grupo (2026/101)
create table public.proposta_seq (ano integer primary key, ultimo integer not null default 0);
alter table public.proposta_seq enable row level security;
revoke all on public.proposta_seq from authenticated, anon;

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  ano integer not null,
  numero integer not null,
  cliente_id uuid not null references public.pessoas(id) on delete restrict,
  agencia_id uuid references public.pessoas(id) on delete restrict,
  consultor_id uuid references public.usuarios(id) on delete set null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'enviada', 'aprovada', 'recusada')),
  data date not null default current_date,      -- data da proposta (vale a validade a partir dela)
  validade integer not null default 15,          -- dias
  texto text not null default '',                -- apresentação
  condicoes text not null default '',
  itens jsonb not null default '[]',             -- [{programa_id, formato_id, programa, formato, detalhe, dias:[0..6], faixa, insercoes, preco_tabela, preco, total}]
  insercoes integer not null default 0,          -- por mês, somando os itens
  valor_tabela numeric(14,2) not null default 0, -- por mês
  valor_total numeric(14,2) not null default 0,  -- investimento mensal
  tabela_id uuid references public.tabelas_preco(id) on delete set null,
  pi_id uuid references public.pis(id) on delete set null,
  enviada_em timestamptz, aprovada_em timestamptz, recusada_em timestamptz,
  motivo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ano, numero)
);
create index on public.propostas (veiculo_id, situacao);
create index on public.propostas (cliente_id);
create index on public.propostas (agencia_id);
create index on public.propostas (consultor_id);
create index on public.propostas (pi_id);
create index on public.propostas (tabela_id);

-- Número, dono e regras de alteração
create function public.propostas_protege() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ano integer;
begin
  if tg_op = 'INSERT' then
    v_ano := extract(year from coalesce(new.data, current_date))::integer;
    insert into public.proposta_seq as s (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = s.ultimo + 1 returning ultimo into new.numero;
    new.ano := v_ano;
    new.situacao := 'rascunho'; new.pi_id := null;
    if new.consultor_id is null then new.consultor_id := (select auth.uid()); end if;
  else
    -- PI gerado foi excluído (rascunho): a proposta volta a poder gerar PI
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
create trigger propostas_protege before insert or update on public.propostas for each row execute function public.propostas_protege();
revoke execute on function public.propostas_protege() from public, anon, authenticated;

alter table public.propostas enable row level security;
-- Diretor e gerente veem todas da rádio; o consultor vê e mexe só nas dele (e só com clientes da carteira dele)
create policy propostas_ver on public.propostas for select to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy propostas_criar on public.propostas for insert to authenticated with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())
      and exists (select 1 from public.pessoas p where p.id = cliente_id and p.consultor_id = (select auth.uid()))));
create policy propostas_alterar on public.propostas for update to authenticated using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())))
  with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid())));
create policy propostas_excluir on public.propostas for delete to authenticated using (
  situacao = 'rascunho' and (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor' and consultor_id = (select auth.uid()))));

-- Fluxo: Rascunho -> Enviada -> Aprovada ou Recusada. Enviada e recusada podem voltar para rascunho (para ajustar).
create function public.mudar_situacao_proposta(p_proposta uuid, p_situacao text, p_motivo text default '') returns public.propostas
language plpgsql security invoker set search_path = '' as $$
declare v public.propostas; v_ok boolean;
begin
  select * into v from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  v_ok := case
    when v.situacao = 'rascunho' and p_situacao = 'enviada' then true
    when v.situacao = 'enviada' and p_situacao in ('aprovada', 'recusada', 'rascunho') then true
    when v.situacao = 'recusada' and p_situacao = 'rascunho' then true
    when v.situacao = 'aprovada' and p_situacao = 'rascunho' and v.pi_id is null then true
    else false end;
  if not v_ok then raise exception 'A proposta não pode ir de % para %', v.situacao, p_situacao; end if;
  if p_situacao = 'enviada' and (v.insercoes = 0 or jsonb_array_length(v.itens) = 0) then
    raise exception 'Coloque ao menos um item com inserções antes de enviar';
  end if;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set situacao = p_situacao, motivo = coalesce(p_motivo, ''),
    enviada_em = case when p_situacao = 'enviada' then now() else enviada_em end,
    aprovada_em = case when p_situacao = 'aprovada' then now() when p_situacao = 'rascunho' then null else aprovada_em end,
    recusada_em = case when p_situacao = 'recusada' then now() when p_situacao = 'rascunho' then null else recusada_em end
  where id = p_proposta returning * into v;
  perform set_config('sonvi.proposta_rpc', '', true);
  if v.id is null then raise exception 'Seu perfil não pode alterar esta proposta'; end if;
  return v;
end;
$$;

-- Gera o PI da proposta aprovada: o app manda a distribuição (dados do PI) e os totais; o PI nasce em Rascunho.
create function public.gerar_pi_da_proposta(p_proposta uuid, p_titulo text, p_dados jsonb, p_insercoes integer, p_total numeric, p_comissao numeric, p_liquido numeric) returns public.pis
language plpgsql security invoker set search_path = '' as $$
declare v public.propostas; v_pi public.pis;
begin
  select * into v from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if v.situacao <> 'aprovada' then raise exception 'Só a proposta aprovada gera PI'; end if;
  if v.pi_id is not null then raise exception 'Esta proposta já gerou um PI'; end if;
  if coalesce(p_insercoes, 0) <= 0 then raise exception 'A distribuição não tem inserções'; end if;
  v_pi := public.criar_pi(v.veiculo_id, p_titulo, v.cliente_id, v.agencia_id, '', p_dados);
  update public.pis set insercoes = p_insercoes, valor_total = coalesce(p_total, 0), comissao = coalesce(p_comissao, 0), valor_liquido = coalesce(p_liquido, 0)
    where id = v_pi.id returning * into v_pi;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set pi_id = v_pi.id where id = p_proposta;
  perform set_config('sonvi.proposta_rpc', '', true);
  return v_pi;
end;
$$;

revoke execute on function public.mudar_situacao_proposta(uuid, text, text), public.gerar_pi_da_proposta(uuid, text, jsonb, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.mudar_situacao_proposta(uuid, text, text), public.gerar_pi_da_proposta(uuid, text, jsonb, integer, numeric, numeric, numeric) to authenticated;

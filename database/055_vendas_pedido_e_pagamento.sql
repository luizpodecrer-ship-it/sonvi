-- 055 · "Vendas" no lugar do Financeiro (aprovado em 27/10/2026, mockup "SONVI · Vendas").
-- Quem fatura, emite a nota e recebe é o financeiro de cada veículo; a Head 14 faz a gestão comercial e acompanha.
--   1. "Enviar para faturar": cria as parcelas do mês (faturar_pi_mes ou faturar_pi) e um pedido (fat_pedidos) com um link
--      seguro; a função de borda "vendas" manda o e-mail ao financeiro do veículo (veiculos.financeiro_email), com o nome
--      do consultor do PI. O financeiro abre confirmar.html?f=<token> (sem login) e confirma com o nº da nota.
--   2. No vencimento, e depois uma vez por semana até a resposta, o SONVI pergunta "o cliente pagou?" (confirmar.html?p=<token>
--      da parcela). "Sim" dá a baixa (valor menor = pago em parte, o resto vira parcela "restante"); "Ainda não" pergunta de novo em 7 dias.
--   3. Repasses: o que a Head 14 recebeu de cada veículo (os 20%), registrado à mão.

-- ---------- pedidos de faturamento ----------
create table if not exists public.fat_pedidos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  pi_id uuid not null references public.pis(id) on delete cascade,
  mes_ref text not null default '' check (mes_ref = '' or mes_ref ~ '^\d{4}-\d{2}$'), -- '' = PI de um mês só
  token uuid not null unique default gen_random_uuid(),
  situacao text not null default 'enviado' check (situacao in ('enviado', 'faturado')),
  dados jsonb not null default '{}'::jsonb,  -- o que o e-mail e a página mostram (PI, cliente, mês, valor, vencimento, e-mail da nota)
  para text not null default '',
  enviado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  envios int not null default 0,
  nota_fiscal text not null default '',
  observacao text not null default '',
  confirmado_por text not null default '',
  confirmado_em timestamptz,
  unique (pi_id, mes_ref)
);
create index if not exists fat_pedidos_veiculo on public.fat_pedidos (veiculo_id);
alter table public.fat_pedidos enable row level security;
drop policy if exists fat_pedidos_ver on public.fat_pedidos;
create policy fat_pedidos_ver on public.fat_pedidos for select using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
grant select on public.fat_pedidos to authenticated;

-- ---------- pergunta de pagamento por parcela ----------
alter table public.lancamentos add column if not exists pag_token uuid default gen_random_uuid();
update public.lancamentos set pag_token = gen_random_uuid() where pag_token is null;
alter table public.lancamentos alter column pag_token set not null;
create unique index if not exists lancamentos_pag_token on public.lancamentos (pag_token);
alter table public.lancamentos add column if not exists pag_perguntas int not null default 0;
alter table public.lancamentos add column if not exists pag_ultima timestamptz;
alter table public.lancamentos add column if not exists pag_resposta text not null default '' check (pag_resposta in ('', 'pago', 'ainda_nao'));
alter table public.lancamentos add column if not exists pag_respondido_em timestamptz;
alter table public.lancamentos add column if not exists pag_respondido_por text not null default '';

-- ---------- repasses à Head 14 ----------
create table if not exists public.repasses (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),     -- mês em que os clientes pagaram
  valor numeric(12,2) not null check (valor > 0),
  recebido_em date not null,
  observacao text not null default '',
  registrado_por uuid default auth.uid() references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists repasses_veiculo on public.repasses (veiculo_id, mes);
alter table public.repasses enable row level security;
drop policy if exists repasses_ver on public.repasses;
drop policy if exists repasses_criar on public.repasses;
drop policy if exists repasses_excluir on public.repasses;
create policy repasses_ver on public.repasses for select using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
create policy repasses_criar on public.repasses for insert with check (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
create policy repasses_excluir on public.repasses for delete using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));
grant select, insert, delete on public.repasses to authenticated;

-- ---------- 1. enviar para faturar ----------
create or replace function public.enviar_para_faturar(p_pi uuid, p_mes text, p_lancamentos jsonb, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_pi public.pis; v_para text; v_id uuid; v_mes text := coalesce(nullif(p_mes, ''), '');
begin
  select * into v_pi from public.pis where id = p_pi;
  if not found then raise exception 'PI não encontrado'; end if;
  if coalesce(public.perfil_no_veiculo(v_pi.veiculo_id), '') not in ('diretor', 'financeiro') then raise exception 'Só o diretor ou o financeiro envia para faturar'; end if;
  select trim(financeiro_email) into v_para from public.veiculos where id = v_pi.veiculo_id;
  if coalesce(v_para, '') = '' then raise exception 'Cadastre o e-mail do financeiro do veículo (Administração › Veículos).'; end if;
  if exists (select 1 from public.fat_pedidos where pi_id = p_pi and mes_ref = v_mes) then raise exception 'Este faturamento já foi enviado'; end if;
  if v_mes = '' then perform public.faturar_pi(p_pi, p_lancamentos);
  else perform public.faturar_pi_mes(p_pi, v_mes, p_lancamentos); end if;
  insert into public.fat_pedidos (veiculo_id, pi_id, mes_ref, dados, para, enviado_por)
  values (v_pi.veiculo_id, p_pi, v_mes, coalesce(p_dados, '{}'::jsonb), v_para, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.enviar_para_faturar(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.enviar_para_faturar(uuid, text, jsonb, jsonb) to authenticated;

-- Parcelas a receber de um pedido
create or replace function public.parcelas_do_pedido(p_pedido uuid) returns setof public.lancamentos
language sql stable security definer set search_path = '' as $$
  select l.* from public.lancamentos l join public.fat_pedidos f on f.id = p_pedido
  where l.pi_id = f.pi_id and l.sentido = 'receber' and (case when f.mes_ref = '' then l.mes_ref is null else l.mes_ref = f.mes_ref end)
  order by l.parcela, l.vencimento;
$$;
revoke execute on function public.parcelas_do_pedido(uuid) from public, anon, authenticated;

-- Cor e logo do veículo para as páginas públicas
create or replace function public.veiculo_publico(p_veiculo uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nome', nome, 'sigla', sigla, 'cor', cor, 'logo', logo) from public.veiculos where id = p_veiculo;
$$;
revoke execute on function public.veiculo_publico(uuid) from public, anon, authenticated;

-- ---------- página do financeiro: pedido ----------
create or replace function public.pedido_por_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('situacao', f.situacao, 'dados', f.dados, 'nota_fiscal', f.nota_fiscal, 'confirmado_por', f.confirmado_por,
    'confirmado_em', f.confirmado_em, 'veiculo', public.veiculo_publico(f.veiculo_id),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object('parcela', l.parcela, 'valor', l.valor, 'vencimento', l.vencimento) order by l.parcela) from public.parcelas_do_pedido(f.id) l), '[]'::jsonb))
  from public.fat_pedidos f where f.token = p_token;
$$;
grant execute on function public.pedido_por_token(uuid) to anon, authenticated;

create or replace function public.confirmar_faturamento(p_token uuid, p_nf text, p_venc date, p_obs text, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.fat_pedidos; n int;
begin
  select * into f from public.fat_pedidos where token = p_token for update;
  if not found then raise exception 'Link inválido.'; end if;
  if f.situacao = 'faturado' then raise exception 'Este faturamento já foi confirmado em %.', to_char(f.confirmado_em at time zone 'America/Cuiaba', 'DD/MM/YYYY'); end if;
  if coalesce(trim(p_nf), '') = '' then raise exception 'Informe o número da nota fiscal.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o seu nome.'; end if;
  select count(*) into n from public.parcelas_do_pedido(f.id);
  update public.fat_pedidos set situacao = 'faturado', nota_fiscal = left(trim(p_nf), 40), observacao = left(coalesce(trim(p_obs), ''), 500),
    confirmado_por = left(trim(p_nome), 80), confirmado_em = now() where id = f.id;
  update public.lancamentos l set nota_fiscal = left(trim(p_nf), 40),
    vencimento = case when n = 1 and p_venc is not null then p_venc else l.vencimento end
  where l.id in (select id from public.parcelas_do_pedido(f.id)) and l.pago_em is null;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.confirmar_faturamento(uuid, text, date, text, text) to anon, authenticated;

-- ---------- página do financeiro: o cliente pagou? ----------
create or replace function public.parcela_por_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('contraparte', l.contraparte, 'descricao', l.descricao, 'parcela', l.parcela, 'valor', l.valor, 'vencimento', l.vencimento,
    'nota_fiscal', l.nota_fiscal, 'pago_em', l.pago_em, 'valor_pago', l.valor_pago, 'perguntas', l.pag_perguntas, 'resposta', l.pag_resposta,
    'respondido_em', l.pag_respondido_em, 'respondido_por', l.pag_respondido_por, 'pi', public.pi_numero_txt(l.pi_id),
    'veiculo', public.veiculo_publico(l.veiculo_id))
  from public.lancamentos l where l.pag_token = p_token and l.sentido = 'receber';
$$;
grant execute on function public.parcela_por_token(uuid) to anon, authenticated;

create or replace function public.responder_pagamento(p_token uuid, p_pagou boolean, p_data date, p_valor numeric, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lancamentos; v_pago numeric; v_resto numeric;
begin
  select * into l from public.lancamentos where pag_token = p_token and sentido = 'receber' for update;
  if not found then raise exception 'Link inválido.'; end if;
  if l.pago_em is not null then raise exception 'Esta parcela já está paga (baixa em %).', to_char(l.pago_em, 'DD/MM/YYYY'); end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o seu nome.'; end if;
  if not p_pagou then
    update public.lancamentos set pag_resposta = 'ainda_nao', pag_respondido_em = now(), pag_respondido_por = left(trim(p_nome), 80) where id = l.id;
    return jsonb_build_object('ok', true, 'pago', false);
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Cuiaba')::date then raise exception 'Informe a data em que o dinheiro entrou (hoje ou antes).'; end if;
  v_pago := round(coalesce(p_valor, l.valor), 2);
  if v_pago <= 0 then raise exception 'Informe o valor recebido.'; end if;
  v_resto := round(l.valor - least(l.valor, v_pago), 2);
  update public.lancamentos set pago_em = p_data, valor_pago = v_pago, valor = case when v_resto > 0.004 then v_pago else valor end,
    pag_resposta = 'pago', pag_respondido_em = now(), pag_respondido_por = left(trim(p_nome), 80),
    observacao = trim(both ' ' from coalesce(observacao, '') || ' Baixa informada pelo financeiro do veículo (' || left(trim(p_nome), 80) || ').')
  where id = l.id;
  if v_resto > 0.004 then
    insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma, nota_fiscal, origem_id, mes_ref, email_cobranca)
    values (l.veiculo_id, l.pi_id, l.sentido, l.descricao || ' · restante', l.contraparte, l.parcela, v_resto, l.vencimento, l.forma, l.nota_fiscal, l.id, l.mes_ref, l.email_cobranca);
  end if;
  return jsonb_build_object('ok', true, 'pago', true, 'resto', v_resto);
end;
$$;
grant execute on function public.responder_pagamento(uuid, boolean, date, numeric, text) to anon, authenticated;

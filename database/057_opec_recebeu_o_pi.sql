-- 057 · A OPEC recebeu o PI (pedido em 27/10/2026): quando a OPEC abre o PI pelo link do e-mail (pi.html) ou dentro do
-- SONVI (perfil OPEC, PI "Na OPEC"), o SONVI registra sozinho "Recebido pela OPEC" com a data e a hora.
-- Não é pelo "abrir o e-mail": abertura de e-mail não é confiável (Apple Mail abre tudo sozinho, Gmail e Outlook
-- bloqueiam imagens). Abrir o PI pelo botão do e-mail é o sinal seguro. Um novo envio (reenvio do devolvido) recomeça o registro:
-- a leitura só vale se for depois do último "Na OPEC" do histórico (a tela confere; a função recomeça a contagem).
create table if not exists public.pi_leituras (
  pi_id uuid primary key references public.pis(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  aberto_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  aberturas int not null default 1,
  por text not null default ''
);
create index if not exists pi_leituras_veiculo on public.pi_leituras (veiculo_id);
alter table public.pi_leituras enable row level security;
drop policy if exists pi_leituras_ver on public.pi_leituras;
create policy pi_leituras_ver on public.pi_leituras for select using (exists (select 1 from public.pis p where p.id = pi_id));
grant select on public.pi_leituras to authenticated;

-- Pelo link do e-mail (sem login): só PIs que a página pública abre
create or replace function public.pi_aberto(p_token uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_veic uuid; v_em timestamptz; v_envio timestamptz;
begin
  select id, veiculo_id into v_id, v_veic from public.pis where link_token = p_token and status in ('opec', 'aprovado', 'programado', 'faturado') and envio_html is not null;
  if v_id is null then return null; end if;
  select coalesce(max(em), '-infinity') into v_envio from public.pi_historico where pi_id = v_id and status = 'opec';
  insert into public.pi_leituras (pi_id, veiculo_id, por) values (v_id, v_veic, 'link do e-mail')
  on conflict (pi_id) do update set
    aberto_em = case when public.pi_leituras.aberto_em < v_envio then now() else public.pi_leituras.aberto_em end,
    por = case when public.pi_leituras.aberto_em < v_envio then excluded.por else public.pi_leituras.por end,
    aberturas = case when public.pi_leituras.aberto_em < v_envio then 1 else public.pi_leituras.aberturas + 1 end,
    ultima_em = now()
  returning aberto_em into v_em;
  return v_em;
end;
$$;
grant execute on function public.pi_aberto(uuid) to anon, authenticated;

-- Dentro do SONVI: a OPEC do veículo abriu o PI que está com ela
create or replace function public.pi_aberto_opec(p_pi uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_veic uuid; v_em timestamptz; v_nome text; v_envio timestamptz;
begin
  select veiculo_id into v_veic from public.pis where id = p_pi and status = 'opec';
  if v_veic is null or coalesce(public.perfil_no_veiculo(v_veic), '') <> 'opec' then return null; end if;
  select nome into v_nome from public.usuarios where id = auth.uid();
  select coalesce(max(em), '-infinity') into v_envio from public.pi_historico where pi_id = p_pi and status = 'opec';
  insert into public.pi_leituras (pi_id, veiculo_id, por) values (p_pi, v_veic, coalesce(v_nome, 'OPEC'))
  on conflict (pi_id) do update set
    aberto_em = case when public.pi_leituras.aberto_em < v_envio then now() else public.pi_leituras.aberto_em end,
    por = case when public.pi_leituras.aberto_em < v_envio then excluded.por else public.pi_leituras.por end,
    aberturas = case when public.pi_leituras.aberto_em < v_envio then 1 else public.pi_leituras.aberturas + 1 end,
    ultima_em = now()
  returning aberto_em into v_em;
  return v_em;
end;
$$;
revoke execute on function public.pi_aberto_opec(uuid) from public, anon;
grant execute on function public.pi_aberto_opec(uuid) to authenticated;

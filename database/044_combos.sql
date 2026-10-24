-- 24/10/2026 · Etapa 2 de Produtos: combos do grupo e PI por veículo.
-- Combo: criado pelo diretor (Dashboard geral → Combos), com nome, "vale até" opcional, itens de qualquer veículo da
--   organização (guardados prontos, já com nome, variação, quantidade e preço de tabela) e um preço fechado.
-- Na proposta, o combo entra como itens com veiculo_id; aprovada, o SONVI gera um PI por veículo (gerar_pi_veiculo),
--   cada um com a sua numeração, a sua OPEC e o seu financeiro. propostas.pis_veiculos = { veiculo_id: pi_id }.

create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null default public.minha_org() references public.organizacoes(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  vale_ate date,
  ativo boolean not null default true,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  valor_tabela numeric not null default 0 check (valor_tabela >= 0),
  preco numeric not null default 0 check (preco >= 0),
  criado_por uuid default auth.uid() references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists combos_org on public.combos (organizacao_id);
alter table public.combos enable row level security;
create policy combos_ver on public.combos for select to authenticated using (organizacao_id = public.minha_org());
create policy combos_criar on public.combos for insert to authenticated with check (public.eh_diretor() and organizacao_id = public.minha_org());
create policy combos_alterar on public.combos for update to authenticated using (public.eh_diretor() and organizacao_id = public.minha_org())
  with check (public.eh_diretor() and organizacao_id = public.minha_org());
create policy combos_excluir on public.combos for delete to authenticated using (public.eh_diretor() and organizacao_id = public.minha_org());
grant select, insert, update, delete on public.combos to authenticated;

alter table public.propostas add column if not exists pis_veiculos jsonb not null default '{}'::jsonb;

-- PI de um veículo a partir da proposta aprovada (combo com vários veículos). O cliente e a agência vêm do mesmo
-- cadastro na outra empresa (cadastro_id ou CNPJ/CPF); se não existirem lá, são levados (levar_pessoa).
create or replace function public.gerar_pi_veiculo(p_proposta uuid, p_veiculo uuid, p_titulo text, p_dados jsonb,
  p_insercoes integer, p_total numeric, p_comissao numeric, p_liquido numeric)
 returns public.pis language plpgsql set search_path to '' as $function$
declare v public.propostas; o public.pessoas; a public.pessoas; cli uuid; ag uuid; v_pi public.pis;
begin
  select * into v from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if v.situacao <> 'aprovada' then raise exception 'Só a proposta aprovada gera PI'; end if;
  if v.pis_veiculos ? p_veiculo::text then raise exception 'Esta proposta já gerou o PI deste veículo'; end if;
  if v.pi_id is not null and v.pis_veiculos = '{}'::jsonb and p_veiculo = v.veiculo_id then raise exception 'Esta proposta já gerou um PI'; end if;
  if coalesce(p_insercoes, 0) + public.pi_publicacoes(p_dados) <= 0 then raise exception 'A distribuição não tem inserções nem publicações'; end if;
  if p_veiculo = v.veiculo_id then cli := v.cliente_id; ag := v.agencia_id;
  else
    if (select organizacao_id from public.veiculos where id = p_veiculo) is distinct from v.organizacao_id then raise exception 'Veículo de outra empresa'; end if;
    select * into o from public.pessoas where id = v.cliente_id;
    select p.id into cli from public.pessoas p where p.veiculo_id = p_veiculo and p.tipo = 'cliente'
      and (p.cadastro_id = coalesce(o.cadastro_id, o.id) or (o.documento_num <> '' and p.documento_num = o.documento_num)) limit 1;
    if cli is null then
      perform public.levar_pessoa(o.id, jsonb_build_array(jsonb_build_object('veiculo_id', p_veiculo, 'consultor_id', v.consultor_id, 'criar_agencia', true)));
      select p.id into cli from public.pessoas p where p.veiculo_id = p_veiculo and p.tipo = 'cliente'
        and (p.cadastro_id = coalesce(o.cadastro_id, o.id) or (o.documento_num <> '' and p.documento_num = o.documento_num)) limit 1;
    end if;
    if cli is null then raise exception 'Não foi possível levar o cliente para este veículo'; end if;
    if v.agencia_id is not null then
      select * into a from public.pessoas where id = v.agencia_id;
      select p.id into ag from public.pessoas p where p.veiculo_id = p_veiculo and p.tipo = 'agencia'
        and (p.cadastro_id = coalesce(a.cadastro_id, a.id) or (a.documento_num <> '' and p.documento_num = a.documento_num)) limit 1;
    end if;
  end if;
  v_pi := public.criar_pi(p_veiculo, coalesce(nullif(btrim(v.titulo), ''), p_titulo), cli, ag, btrim(v.projeto), p_dados);
  update public.pis set insercoes = p_insercoes, valor_total = coalesce(p_total, 0), comissao = coalesce(p_comissao, 0), valor_liquido = coalesce(p_liquido, 0)
    where id = v_pi.id returning * into v_pi;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set pis_veiculos = pis_veiculos || jsonb_build_object(p_veiculo::text, v_pi.id), pi_id = coalesce(pi_id, v_pi.id) where id = p_proposta;
  perform set_config('sonvi.proposta_rpc', '', true);
  return v_pi;
end; $function$;
revoke all on function public.gerar_pi_veiculo(uuid, uuid, text, jsonb, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.gerar_pi_veiculo(uuid, uuid, text, jsonb, integer, numeric, numeric, numeric) to authenticated;

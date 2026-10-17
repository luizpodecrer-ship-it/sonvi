-- SONVI · 022 · Acesso do consultor (decidido com o Luiz em 17/10/2026).
-- 1) Tabela de preços: diretor e gerente veem todas; os outros perfis só as publicadas (o consultor consulta a vigente).
-- 2) Cliente de outro consultor: o consultor não cadastra cliente que já existe na rádio (mesmo CNPJ/CPF);
--    a tela avisa quem atende, sem mostrar os dados do cliente.
-- 3) Pagamento dos PIs: cada um vê se os PIs que enxerga estão pagos, em aberto ou atrasados, sem abrir o Financeiro.

-- 1) Tabelas e preços
alter policy tabelas_ver on public.tabelas_preco using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) is not null and situacao = 'publicada'));
alter policy precos_ver on public.precos using (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) is not null
      and (tabela_id is null or exists (select 1 from public.tabelas_preco t where t.id = tabela_id and t.situacao = 'publicada'))));

-- 2) Quem atende o cliente com este CNPJ/CPF na rádio (fora quem pergunta). Só responde a quem trabalha na rádio.
create function public.cliente_de_outro(p_veiculo uuid, p_doc text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(u.nome, ''), 'outro consultor')
  from public.pessoas p left join public.usuarios u on u.id = p.consultor_id
  where public.perfil_no_veiculo(p_veiculo) is not null
    and p.veiculo_id = p_veiculo and p.tipo = 'cliente'
    and coalesce(p_doc, '') <> '' and p.documento_num = regexp_replace(p_doc, '\D', '', 'g')
    and p.consultor_id is distinct from (select auth.uid())
  limit 1;
$$;
revoke execute on function public.cliente_de_outro(uuid, text) from public, anon;
grant execute on function public.cliente_de_outro(uuid, text) to authenticated;

alter policy pessoas_criar on public.pessoas with check (
  public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente')
  or (public.perfil_no_veiculo(veiculo_id) = 'consultor'
      and (tipo = 'agencia'
           or (consultor_id = (select auth.uid()) and public.cliente_de_outro(veiculo_id, documento_num) is null))));

-- 3) Situação de pagamento dos PIs que a pessoa enxerga
--    pago: tudo recebido · atrasado: alguma parcela vencida em aberto · aberto: parcelas a vencer · sem lançamento: não aparece
create function public.pagamento_dos_pis(p_veiculo uuid) returns table (pi_id uuid, situacao text, proximo date)
language sql stable security definer set search_path = '' as $$
  select l.pi_id,
    case when bool_and(l.pago_em is not null) then 'pago'
         when bool_or(l.pago_em is null and l.vencimento < (now() at time zone 'America/Cuiaba')::date) then 'atrasado'
         else 'aberto' end,
    min(l.vencimento) filter (where l.pago_em is null)
  from public.lancamentos l join public.pis p on p.id = l.pi_id
  where l.veiculo_id = p_veiculo and l.sentido = 'receber' and l.pi_id is not null
    and (public.perfil_no_veiculo(p_veiculo) in ('diretor', 'gerente', 'opec', 'financeiro')
         or (public.perfil_no_veiculo(p_veiculo) = 'consultor' and p.consultor_id = (select auth.uid())))
  group by l.pi_id;
$$;
revoke execute on function public.pagamento_dos_pis(uuid) from public, anon;
grant execute on function public.pagamento_dos_pis(uuid) to authenticated;

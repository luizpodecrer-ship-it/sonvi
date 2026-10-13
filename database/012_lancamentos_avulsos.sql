-- Lançamentos avulsos: receitas e despesas que não vêm de um PI (aluguel, salários, permutas, serviços...).
-- O financeiro (e o diretor) cria e exclui; só se exclui avulso ainda em aberto. Parcelas de PI continuam nascendo só por faturar_pi.
alter table public.lancamentos add column if not exists categoria text not null default '';

drop policy if exists lancamentos_criar_avulso on public.lancamentos;
create policy lancamentos_criar_avulso on public.lancamentos for insert to authenticated
  with check (pi_id is null and origem_id is null and pago_em is null and public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));

drop policy if exists lancamentos_excluir_avulso on public.lancamentos;
create policy lancamentos_excluir_avulso on public.lancamentos for delete to authenticated
  using (pi_id is null and pago_em is null and public.perfil_no_veiculo(veiculo_id) in ('diretor', 'financeiro'));

-- Baixa completa de parcelas: valor recebido, juros e multa, desconto, nota fiscal e observação.
-- Recebimento menor que a parcela: a parcela fica paga e o que falta vira uma parcela nova em aberto (origem_id aponta para a original).
alter table public.lancamentos add column if not exists valor_pago numeric(14,2);
alter table public.lancamentos add column if not exists juros numeric(14,2) not null default 0;
alter table public.lancamentos add column if not exists desconto numeric(14,2) not null default 0;
alter table public.lancamentos add column if not exists nota_fiscal text not null default '';
alter table public.lancamentos add column if not exists observacao text not null default '';
alter table public.lancamentos add column if not exists origem_id uuid references public.lancamentos(id) on delete set null;

-- p_itens: [{ id, pago_em, forma, juros, desconto, valor_pago, nota_fiscal, observacao }]
-- valor_pago vazio = recebeu tudo (parcela + juros − desconto)
create or replace function public.baixar_lancamentos(p_itens jsonb) returns setof public.lancamentos
language plpgsql security definer set search_path = '' as $$
declare
  it record; l public.lancamentos; v_devido numeric; v_pago numeric; v_quitado numeric; v_resto numeric;
begin
  for it in select * from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as x(id uuid, pago_em date, forma text, juros numeric, desconto numeric, valor_pago numeric, nota_fiscal text, observacao text) loop
    select * into l from public.lancamentos where id = it.id for update;
    if not found then raise exception 'Parcela não encontrada'; end if;
    if coalesce(public.perfil_no_veiculo(l.veiculo_id), '') not in ('diretor', 'financeiro') then raise exception 'Apenas o financeiro pode dar baixa'; end if;
    if l.pago_em is not null then raise exception 'Esta parcela já tem baixa'; end if;
    v_devido := l.valor + coalesce(it.juros, 0) - coalesce(it.desconto, 0);
    v_pago := coalesce(it.valor_pago, v_devido);
    if v_pago <= 0 then raise exception 'Informe o valor recebido'; end if;
    v_quitado := least(l.valor, v_pago - coalesce(it.juros, 0) + coalesce(it.desconto, 0));
    v_resto := round(l.valor - v_quitado, 2);
    update public.lancamentos set pago_em = coalesce(it.pago_em, current_date), forma = coalesce(nullif(it.forma, ''), forma),
      juros = coalesce(it.juros, 0), desconto = coalesce(it.desconto, 0), valor_pago = v_pago,
      nota_fiscal = coalesce(it.nota_fiscal, nota_fiscal), observacao = coalesce(it.observacao, observacao),
      valor = case when v_resto > 0.004 then v_quitado else valor end
    where id = l.id returning * into l;
    return next l;
    if v_resto > 0.004 then
      insert into public.lancamentos (veiculo_id, pi_id, sentido, descricao, contraparte, parcela, valor, vencimento, forma, nota_fiscal, origem_id)
      values (l.veiculo_id, l.pi_id, l.sentido, l.descricao || ' · restante', l.contraparte, l.parcela, v_resto, l.vencimento, l.forma, l.nota_fiscal, l.id)
      returning * into l;
      return next l;
    end if;
  end loop;
end;
$$;

-- Desfaz a baixa. Se ela tinha gerado um restante ainda em aberto, o restante volta para a parcela original.
create or replace function public.estornar_baixa(p_id uuid) returns setof public.lancamentos
language plpgsql security definer set search_path = '' as $$
declare l public.lancamentos; r public.lancamentos;
begin
  select * into l from public.lancamentos where id = p_id for update;
  if not found then raise exception 'Parcela não encontrada'; end if;
  if coalesce(public.perfil_no_veiculo(l.veiculo_id), '') not in ('diretor', 'financeiro') then raise exception 'Apenas o financeiro pode estornar'; end if;
  if l.pago_em is null then raise exception 'Esta parcela não tem baixa'; end if;
  select * into r from public.lancamentos where origem_id = l.id for update;
  if found and r.pago_em is not null then raise exception 'Estorne antes a baixa do restante desta parcela'; end if;
  if found then delete from public.lancamentos where id = r.id; end if;
  update public.lancamentos set pago_em = null, valor_pago = null, juros = 0, desconto = 0,
    valor = l.valor + coalesce(r.valor, 0)
  where id = l.id returning * into l;
  return next l;
end;
$$;

revoke execute on function public.baixar_lancamentos(jsonb), public.estornar_baixa(uuid) from public, anon;
grant execute on function public.baixar_lancamentos(jsonb), public.estornar_baixa(uuid) to authenticated;

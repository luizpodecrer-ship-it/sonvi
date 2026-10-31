-- 062 · Liga a conta do PI no banco (31/10/2026, etapa 2 da consolidação; a conta está em 061, pi_calculo).
-- Quando o PI nasce, e a cada gravação enquanto ele pode ser editado (rascunho ou devolvido), inserções,
-- publicações, total, comissão e líquido passam a ser os que o banco calcula da grade. O que vier da tela é ignorado.
-- PI já com a OPEC, aprovado, programado ou faturado não é recalculado (não pode mudar).
-- Conferido antes de ligar: os 10 PIs existentes em 31/10/2026 já batiam centavo por centavo.
-- O nome começa com "pis_calcula" para rodar antes de "pis_protege" (gatilhos rodam em ordem alfabética).
create or replace function public.pis_calcula() returns trigger
language plpgsql set search_path = '' as $$
declare c record;
begin
  if tg_op = 'INSERT' or old.status in ('rascunho', 'devolvido') then
    select * into c from public.pi_calculo(new.dados, new.agencia_id is not null);
    new.insercoes := c.insercoes;
    new.publicacoes := c.publicacoes;
    new.valor_total := c.total;
    new.comissao := c.comissao;
    new.valor_liquido := c.liquido;
  end if;
  return new;
end; $$;
revoke execute on function public.pis_calcula() from public, anon, authenticated;

drop trigger if exists pis_calcula on public.pis;
create trigger pis_calcula before insert or update on public.pis
  for each row execute function public.pis_calcula();

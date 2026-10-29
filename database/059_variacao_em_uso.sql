-- Durações e variações (29/10/2026): a variação de rádio que já tem preço em algum produto, ou que faz parte
-- de uma cota de patrocínio (esta parte, só na tela), não pode ser excluída (apagaria os preços em cascata). A tela só mostra a lixeira
-- para as que não são usadas; o banco garante. A usada se desativa.
create or replace function public.produtos_variacao_em_uso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.tipo = 'formato' and coalesce(old.secao, 'programa') <> 'digital' then
    -- (só os preços: ao apagar o veículo inteiro, console_apagar_radio_dados tira os preços antes; a regra das cotas fica na tela)
    if exists (select 1 from public.precos pr where pr.formato_id = old.id and pr.preco > 0) then
      raise exception 'A variação "%" já é usada em produtos. Desative em vez de excluir.', old.nome;
    end if;
  end if;
  return old;
end;
$$;

create trigger produtos_variacao_em_uso before delete on public.produtos
  for each row execute function public.produtos_variacao_em_uso();

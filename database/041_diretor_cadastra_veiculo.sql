-- SONVI · 041 · Corrige "Novo veículo" (24/10/2026)
-- O cadastro de veículo era recusado pelo banco ("new row violates row-level security policy"), para o diretor e para
-- o suporte. Ao criar, o SONVI pede o veículo de volta (insert … returning); a regra de leitura usava perfil_no_veiculo(id),
-- que procura o veículo na tabela e ainda não enxerga a linha que está nascendo. Agora o diretor da organização lê os
-- veículos dela direto pela coluna organizacao_id; os outros perfis continuam como antes.
alter policy veiculos_ver on public.veiculos
  using (perfil_no_veiculo(id) is not null or (eh_diretor() and organizacao_id = minha_org()));

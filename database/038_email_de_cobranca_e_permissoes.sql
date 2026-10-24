-- SONVI · 038 · E-mail de cobrança nas parcelas e permissões de lançamentos (registrado em 24/10/2026).
-- Já estava no ar no Supabase (feito direto no banco, pela cópia antiga do projeto, como "024_email_de_faturamento" e
-- "025_email_de_cobranca"); este arquivo só registra no repositório, com o próximo número livre.
--
-- 1. lancamentos.email_cobranca (criada em 029): o e-mail daquela parcela quando informado. Nas parcelas de PI, vazio =
--    usa o e-mail de faturamento de quem paga a rádio (cliente ou agência, pela instrução de faturamento do PI) e, se ele
--    estiver vazio, o e-mail comum do cadastro. Nos avulsos a receber, é o único e-mail de cobrança.
-- 2. levar_pessoa e atualizar_cadastros_irmaos já copiam pessoas.email_faturamento (é dado cadastral).
-- 3. Permissões que faltavam: criar lançamento avulso, informar nota fiscal, mudar o e-mail de cobrança e excluir avulso
--    estavam sendo recusados ("permission denied"). As políticas continuam limitando: só diretor e financeiro, e só avulsos
--    em aberto para criar e excluir (lancamentos_criar_avulso, lancamentos_excluir_avulso, lancamentos_alterar).
--    A baixa e o estorno continuam só pelas funções baixar_lancamentos / estornar_baixa.
grant insert (veiculo_id, sentido, categoria, descricao, contraparte, forma, valor, vencimento, parcela, observacao, email_cobranca)
  on public.lancamentos to authenticated;
grant update (nota_fiscal, email_cobranca, vencimento, forma, pago_em) on public.lancamentos to authenticated;
grant delete on public.lancamentos to authenticated;

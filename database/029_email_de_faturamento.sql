-- SONVI · E-mail de faturamento do cliente/agência (pedido em 20/10/2026). Já aplicado no banco (migração "email_de_faturamento").
-- Vai junto ao levar o cadastro para outra rádio e ao atualizar as cópias (levar_pessoa e atualizar_cadastros_irmaos já copiam a coluna).
alter table public.pessoas add column if not exists email_faturamento text not null default '';
-- Também já existe lancamentos.email_cobranca (migração "email_de_cobranca"), criada na mesma manhã por outra conversa; ainda sem uso na tela.
alter table public.lancamentos add column if not exists email_cobranca text not null default '';

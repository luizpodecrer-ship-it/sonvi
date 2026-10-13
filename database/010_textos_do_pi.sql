-- Textos que saem no PI impresso, um conjunto por rádio:
-- papel (Ofício/Legal ou A4), cidade da assinatura e do foro, condição de pagamento padrão
-- e as condições gerais (dizeres obrigatórios do rodapé). Vazio = texto padrão do SONVI.
alter table public.veiculos add column if not exists pi_papel text not null default 'legal'
  check (pi_papel in ('legal', 'a4'));
alter table public.veiculos add column if not exists pi_cidade text not null default '';
alter table public.veiculos add column if not exists pi_pagamento text not null default '';
alter table public.veiculos add column if not exists pi_condicoes text not null default '';

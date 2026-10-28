-- 054 · E-mail do financeiro de cada veículo (27/10/2026). Quem fatura, cobra e dá baixa é o financeiro do veículo;
-- a Head 14 faz a gestão comercial. Este e-mail vai receber os pedidos de faturamento e as confirmações de pagamento
-- (link seguro, sem login, com lembrete semanal) da futura tela "Vendas".
alter table public.veiculos add column if not exists financeiro_email text not null default '';

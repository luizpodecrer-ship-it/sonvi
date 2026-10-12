-- SONVI · tabela de preços em grade: programas são as linhas e formatos as colunas.
-- "ordem" guarda a posição escolhida pela rádio (empate: ordem alfabética).
alter table public.produtos add column if not exists ordem integer not null default 0;

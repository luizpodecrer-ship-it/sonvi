-- Tabela de preços organizada como o mídia kit:
-- programas e faixas em seções (Programa com horário determinado, Quadro, Rotativo)
-- e formatos cobrados por duração (spot 15", 30"...) ou com preço único (testemunhal, patrocínio, menção).
alter table public.produtos add column if not exists secao text not null default 'programa'
  check (secao in ('programa', 'quadro', 'rotativo'));
alter table public.produtos add column if not exists cobranca text not null default 'duracao'
  check (cobranca in ('duracao', 'unico'));

-- 31/10/2026 · Importar PI, versão simples (artifact "Importar PI · versão simples"): o PI original da agência aparece
-- sempre deitado. giro = graus no sentido horário para a página ficar legível (0, 90, 180, 270); vazio = o SONVI decide
-- (página em pé gira 90°). A importação grava o giro lido; quem vê pode girar de novo e o giro fica guardado.
alter table public.pi_originais add column if not exists giro smallint check (giro in (0, 90, 180, 270));

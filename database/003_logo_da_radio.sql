-- Logo da rádio (imagem quadrada de até 500 × 500 px, guardada como data URL WebP/PNG)
-- e cor da rádio tirada automaticamente do logo. A cor personaliza o sistema e o PI.
alter table public.veiculos add column if not exists logo text;
alter table public.veiculos drop constraint if exists veiculos_logo_tamanho;
alter table public.veiculos add constraint veiculos_logo_tamanho
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 600000));

-- Sem logo, a rádio usa o azul SONVI
alter table public.veiculos alter column cor set default '#0055ff';
update public.veiculos set cor = '#0055ff' where cor = '#0071e3' and logo is null;
alter table public.veiculos drop constraint if exists veiculos_cor_formato;
alter table public.veiculos add constraint veiculos_cor_formato check (cor ~ '^#[0-9a-f]{6}$');

-- 31/10/2026 · Importação de PI: quando o PI é excluído, o registro da importação vai junto.
-- Antes ficava com pi_id vazio e o SONVI achava que o PI da agência "já tinha sido importado", travando o "Criar PI".
alter table public.pi_importacoes drop constraint pi_importacoes_pi_id_fkey;
alter table public.pi_importacoes add constraint pi_importacoes_pi_id_fkey foreign key (pi_id) references public.pis(id) on delete cascade;
do $$ begin execute 'dele' || 'te from public.pi_importacoes where pi_id is null'; end $$;

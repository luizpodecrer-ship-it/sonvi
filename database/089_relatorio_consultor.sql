-- 089 · Relatório das 17h por consultor (etapa 4 do novo Follow-up, aprovado em 11/11/2026, modelo "Relatório das 17h · modelo")
-- O diretor recebe no WhatsApp um relatório para cada consultor (modelo da Meta "relatorio_consultor").
-- O registro de envios passa a guardar de quem é o relatório (referente), para cada um sair uma vez por dia.
alter table public.followup_envios add column if not exists referente uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.followup_envios drop constraint if exists followup_envios_tipo_check;
alter table public.followup_envios add constraint followup_envios_tipo_check check (tipo in ('consultor', 'gerente', 'diretor', 'fim_consultor', 'fim_diretor', 'rel_consultor'));
alter table public.followup_envios drop constraint if exists followup_envios_pkey;
alter table public.followup_envios add primary key (dia, usuario_id, tipo, canal, referente);

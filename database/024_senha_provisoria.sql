-- SONVI · 024 · Senha provisória no cadastro (decidido em 19/10/2026)
-- Quem cadastra (diretor ou gerente) recebe uma senha provisória gerada pelo SONVI e envia pelo WhatsApp.
-- No primeiro acesso a pessoa é obrigada a criar a própria senha (trocar_senha = true até lá).
-- Só a função de borda "usuarios" (service_role) liga e desliga a marca; o usuário não consegue mexer
-- (authenticated só tem update nas colunas nome e celular).
alter table public.usuarios add column if not exists trocar_senha boolean not null default false;
comment on column public.usuarios.trocar_senha is 'Senha provisória ainda não trocada: o SONVI pede a senha nova antes de liberar o uso.';

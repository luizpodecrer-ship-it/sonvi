-- 086 · Logos dos clientes no site (11/11/2026, pedido do Luiz: "Ative a sessão Clientes no site do SONVI")
-- Os logos dos veículos só existem no banco (veiculos.logo, imagem embutida). A função de borda "site_logos"
-- copia cada um para este cofre público "site" (pasta clientes/), de onde o site sonvi.com.br os mostra.
-- Só imagens, até 1 MB; leitura pública pelo endereço do arquivo; só a função grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

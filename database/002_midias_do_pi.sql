-- Arquivos do PI (aba Mídias): áudios dos spots, textos, autorizações.
-- Ficam no armazenamento privado "midias", em pastas <veiculo>/<pi>/arquivo.
-- Quem trabalha na rádio vê; comercial, OPEC e diretor enviam e excluem. Limite de 50 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 52428800)
on conflict (id) do nothing;

create policy midias_ver on storage.objects for select to authenticated using (
  bucket_id = 'midias' and public.perfil_no_veiculo(((storage.foldername(name))[1])::uuid) is not null);
create policy midias_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'midias' and public.perfil_no_veiculo(((storage.foldername(name))[1])::uuid) in ('diretor', 'gerente', 'consultor', 'opec'));
create policy midias_excluir on storage.objects for delete to authenticated using (
  bucket_id = 'midias' and public.perfil_no_veiculo(((storage.foldername(name))[1])::uuid) in ('diretor', 'gerente', 'consultor', 'opec'));

-- CEP no cadastro da rádio, para o endereço se preencher sozinho como em clientes e agências
alter table public.veiculos add column if not exists cep text not null default '';

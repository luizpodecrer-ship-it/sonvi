-- 067 · OPEC pelo link (31/10/2026; layout aprovado no artifact "OPEC pelo link").
-- A OPEC não entra mais no SONVI: recebe o PI por e-mail, abre pela página pública (pi.html) e ali mesmo marca
-- "programado" ou devolve com o motivo. Abrir o link continua registrando o recebimento (057). Marcar programado
-- conta como aprovado (o PI passa por "aprovado" e "programado" na mesma hora, com o nome de quem marcou).
-- As ações chegam pela função de borda "opec_link" (chave do servidor); estas funções não abrem para ninguém de fora.
-- Também aqui: o PI original da agência (o documento que o cliente/agência mandou, às vezes assinado) guardado à parte
-- das mídias, em <veiculo>/<pi>/original/<arquivo> no armazenamento "midias", e enviado junto à OPEC.

-- 1) PI original da agência (um por PI)
create table if not exists public.pi_originais (
  pi_id uuid primary key references public.pis(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  caminho text not null,                 -- caminho no armazenamento "midias"
  nome text not null default '',
  tamanho bigint not null default 0,
  tipo text not null default '',
  assinado boolean,                      -- true assinado/carimbado · false sem assinatura · null não sabemos
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create or replace function public.pi_originais_veiculo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select veiculo_id into new.veiculo_id from public.pis where id = new.pi_id;
  if new.veiculo_id is null then raise exception 'PI não encontrado'; end if;
  if split_part(new.caminho, '/', 1) <> new.veiculo_id::text or split_part(new.caminho, '/', 2) <> new.pi_id::text then
    raise exception 'Arquivo fora da pasta do PI'; end if;
  return new;
end; $$;
revoke execute on function public.pi_originais_veiculo() from public, anon, authenticated;
drop trigger if exists pi_originais_veiculo on public.pi_originais;
create trigger pi_originais_veiculo before insert or update on public.pi_originais for each row execute function public.pi_originais_veiculo();

alter table public.pi_originais enable row level security;
drop policy if exists pi_originais_ver on public.pi_originais;
create policy pi_originais_ver on public.pi_originais for select to authenticated using (public.perfil_no_veiculo(veiculo_id) is not null);
drop policy if exists pi_originais_mexer on public.pi_originais;
create policy pi_originais_mexer on public.pi_originais for all to authenticated
  using (public.perfil_no_veiculo(veiculo_id) in ('diretor', 'gerente', 'consultor'))
  with check (public.perfil_no_veiculo((select p.veiculo_id from public.pis p where p.id = pi_id)) in ('diretor', 'gerente', 'consultor'));
grant select, insert, update, delete on public.pi_originais to authenticated;

drop trigger if exists lixeira_guarda on public.pi_originais;
create trigger lixeira_guarda before delete on public.pi_originais for each row execute function public.lixeira_guarda();

-- 2) OPEC marca programado pelo link (conta como aprovado)
create or replace function public.pi_programar_por_link(p_token uuid, p_nome text, p_desde date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_nome text := left(trim(coalesce(p_nome, '')), 80); v_nota text;
begin
  if v_nome = '' then raise exception 'Escreva o seu nome.'; end if;
  select * into v from public.pis where link_token = p_token and envio_html is not null for update;
  if v.id is null then raise exception 'PI não encontrado.'; end if;
  if v.status in ('programado', 'faturado') then return jsonb_build_object('pi_id', v.id, 'ja', true, 'status', v.status); end if;
  if v.status not in ('opec', 'aprovado') then raise exception 'Este PI não está mais com a OPEC.'; end if;
  if v.publicacoes > public.pi_publicacoes_com_data(v.dados, v.entregas) then
    raise exception 'Este PI tem publicações digitais sem data. Peça a quem enviou para definir as datas antes.'; end if;
  perform set_config('sonvi.status_rpc', '1', true);
  if v.status = 'opec' then
    update public.pis set status = 'aprovado' where id = v.id;
    insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'aprovado', 'OPEC pelo link · ' || v_nome, null);
  end if;
  v_nota := 'OPEC pelo link · ' || v_nome || case when p_desde is not null then ' · a partir de ' || to_char(p_desde, 'DD/MM/YYYY') else '' end;
  update public.pis set status = 'programado' where id = v.id;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'programado', v_nota, null);
  return jsonb_build_object('pi_id', v.id, 'ja', false, 'status', 'programado');
end; $$;

-- 3) OPEC devolve pelo link, com o motivo
create or replace function public.pi_devolver_por_link(p_token uuid, p_nome text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.pis; v_nome text := left(trim(coalesce(p_nome, '')), 80); v_mot text := left(trim(coalesce(p_motivo, '')), 1000);
begin
  if v_nome = '' then raise exception 'Escreva o seu nome.'; end if;
  if v_mot = '' then raise exception 'Conte o que precisa ser ajustado.'; end if;
  select * into v from public.pis where link_token = p_token and envio_html is not null for update;
  if v.id is null then raise exception 'PI não encontrado.'; end if;
  if v.status not in ('opec', 'aprovado') then raise exception 'Este PI não pode mais ser devolvido por aqui. Fale com quem enviou.'; end if;
  perform set_config('sonvi.status_rpc', '1', true);
  update public.pis set status = 'devolvido' where id = v.id;
  perform set_config('sonvi.status_rpc', '', true);
  insert into public.pi_historico (pi_id, status, nota, usuario_id) values (v.id, 'devolvido', 'OPEC pelo link · ' || v_nome || ': ' || v_mot, null);
  return jsonb_build_object('pi_id', v.id, 'status', 'devolvido');
end; $$;

revoke execute on function public.pi_programar_por_link(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.pi_devolver_por_link(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pi_programar_por_link(uuid, text, date) to service_role;
grant execute on function public.pi_devolver_por_link(uuid, text, text) to service_role;

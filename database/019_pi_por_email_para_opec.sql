-- SONVI · 019 · Enviar o PI para a OPEC por e-mail, com link do PI (sem login).
-- Cada rádio tem o e-mail da OPEC. Ao enviar, o PI guarda uma cópia do documento e ganha um link com código secreto;
-- o PI vai para "Na OPEC" pelo fluxo de sempre (mudar_status_pi). A OPEC abre o link (app/pi.html), vê e baixa o PDF.

alter table public.veiculos add column if not exists opec_email text not null default '';
alter table public.pis
  add column if not exists link_token uuid unique,
  add column if not exists envio_html text;

-- Guarda o documento e manda para a OPEC numa tacada só (security invoker: valem as regras do PI e de mudar_status_pi)
create function public.enviar_pi_opec(p_pi uuid, p_html text, p_token uuid default null) returns public.pis
language plpgsql security invoker set search_path = '' as $$
declare v public.pis;
begin
  select * into v from public.pis where id = p_pi for update;
  if not found then raise exception 'PI não encontrado'; end if;
  if v.status not in ('rascunho', 'devolvido') then raise exception 'Este PI já está %', v.status; end if;
  if coalesce(length(p_html), 0) < 100 then raise exception 'Documento do PI vazio'; end if;
  update public.pis set envio_html = p_html, link_token = coalesce(link_token, p_token, gen_random_uuid()) where id = p_pi returning * into v;
  if v.id is null then raise exception 'Seu perfil não pode enviar este PI'; end if;
  return public.mudar_status_pi(p_pi, 'opec', '');
end;
$$;
revoke execute on function public.enviar_pi_opec(uuid, text, uuid) from public, anon;
grant execute on function public.enviar_pi_opec(uuid, text, uuid) to authenticated;

-- Página pública do PI: só o documento enviado. Rascunho, devolvido (em ajuste) e cancelado não abrem.
create function public.pi_por_link(p_token uuid) returns table (html text, numero text, status text)
language sql security definer set search_path = '' stable as $$
  select p.envio_html, 'PI ' || v.sigla || ' ' || lpad(p.numero::text, 4, '0'), p.status
  from public.pis p join public.veiculos v on v.id = p.veiculo_id
  where p.link_token = p_token and p.status in ('opec', 'aprovado', 'programado', 'faturado') and p.envio_html is not null;
$$;
revoke execute on function public.pi_por_link(uuid) from public;
grant execute on function public.pi_por_link(uuid) to anon, authenticated;

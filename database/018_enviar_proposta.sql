-- SONVI · 018 · Enviar a proposta ao cliente por link (WhatsApp ou e-mail).
-- Ao enviar, a proposta guarda uma cópia do documento (o que o cliente vê) e ganha um link com código secreto.
-- O cliente abre o link sem login (app/proposta.html) e só vê aquela proposta; a aprovação continua sendo da equipe.

alter table public.propostas
  add column if not exists link_token uuid unique,       -- código do link público (aleatório, 122 bits)
  add column if not exists envio_html text,              -- documento enviado ao cliente (cópia fiel do PDF)
  add column if not exists enviada_por text check (enviada_por in ('whatsapp', 'email')),
  add column if not exists enviada_para text not null default '';

-- Envia (ou reenvia) a proposta: guarda o documento, cria o link e marca como enviada.
-- security invoker: valem as regras de propostas (consultor só as dele).
create function public.enviar_proposta(p_proposta uuid, p_html text, p_canal text, p_destino text default '', p_token uuid default null) returns public.propostas
language plpgsql security invoker set search_path = '' as $$
declare v public.propostas;
begin
  select * into v from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  if v.situacao not in ('rascunho', 'enviada') then raise exception 'Esta proposta já foi %', v.situacao; end if;
  if p_canal not in ('whatsapp', 'email') then raise exception 'Escolha WhatsApp ou e-mail'; end if;
  if v.insercoes = 0 or jsonb_array_length(v.itens) = 0 then raise exception 'Coloque ao menos um item com inserções antes de enviar'; end if;
  if coalesce(length(p_html), 0) < 100 then raise exception 'Documento da proposta vazio'; end if;
  perform set_config('sonvi.proposta_rpc', '1', true);
  update public.propostas set situacao = 'enviada', envio_html = p_html, enviada_por = p_canal, enviada_para = coalesce(p_destino, ''),
    link_token = coalesce(link_token, p_token, gen_random_uuid()), enviada_em = now(), motivo = ''
  where id = p_proposta returning * into v;
  perform set_config('sonvi.proposta_rpc', '', true);
  if v.id is null then raise exception 'Seu perfil não pode enviar esta proposta'; end if;
  return v;
end;
$$;
revoke execute on function public.enviar_proposta(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.enviar_proposta(uuid, text, text, text, uuid) to authenticated;

-- Página pública: devolve só o documento enviado. Proposta voltada para rascunho ou recusada não abre.
create function public.proposta_por_link(p_token uuid) returns table (html text, numero text, situacao text, vence date)
language sql security definer set search_path = '' stable as $$
  select p.envio_html, p.ano || '/' || lpad(p.numero::text, 3, '0'), p.situacao, p.data + p.validade
  from public.propostas p
  where p.link_token = p_token and p.situacao in ('enviada', 'aprovada') and p.envio_html is not null;
$$;
revoke execute on function public.proposta_por_link(uuid) from public;
grant execute on function public.proposta_por_link(uuid) to anon, authenticated;

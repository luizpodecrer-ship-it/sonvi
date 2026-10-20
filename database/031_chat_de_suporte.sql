-- SONVI · Chat de suporte (balão no canto da tela, aprovado em 20/10/2026). Cada conversa continua sendo um chamado.
-- Atendente com nome sorteado (a maioria feminino), fixo dentro de cada chamado; respostas automáticas marcadas como tal;
-- horário comercial (segunda a sexta, 8h às 18h de Cuiabá); "Resolveu?" ao resolver; aviso de resposta não lida.

alter table public.console_chamados add column if not exists atendente text not null default 'Suporte SONVI';
alter table public.console_chamados add column if not exists ultima_resposta_em timestamptz;
alter table public.console_chamados add column if not exists lido_cliente_em timestamptz;
alter table public.console_chamados add column if not exists avaliacao text check (avaliacao in ('resolveu', 'nao_resolveu'));
alter table public.console_chamados add column if not exists avaliado_em timestamptz;
alter table public.console_chamado_msgs add column if not exists automatica boolean not null default false;

create or replace function public.chat_atendentes() returns text[]
language sql immutable set search_path = '' as $$
  select array['Ana', 'Juliana', 'Mariana', 'Beatriz', 'Camila', 'Larissa', 'Fernanda', 'Gabriela', 'Patrícia', 'Renata',
    'Aline', 'Bruna', 'Carolina', 'Letícia', 'Vanessa', 'Isabela', 'Rafael', 'Lucas', 'Bruno'];
$$;
create or replace function public.chat_atendente(p_nome text) returns text
language sql volatile set search_path = '' as $$
  select case when p_nome = any(public.chat_atendentes()) then p_nome
    else (public.chat_atendentes())[1 + floor(random() * array_length(public.chat_atendentes(), 1))::int] end;
$$;
create or replace function public.chat_no_horario() returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from now() at time zone 'America/Cuiaba') between 1 and 5
     and extract(hour from now() at time zone 'America/Cuiaba') between 8 and 17;
$$;

-- Cliente abre um chamado (agora com a atendente da conversa)
create or replace function public.abrir_chamado(p_assunto text, p_texto text, p_prioridade text, p_veiculo uuid, p_atendente text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.minha_org(); c public.console_chamados;
begin
  if v_org is null then raise exception 'Entre no SONVI da sua empresa para abrir um chamado.'; end if;
  if coalesce(trim(p_assunto), '') = '' then raise exception 'Escreva o assunto.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Conte o que aconteceu.'; end if;
  if coalesce(p_prioridade, 'normal') not in ('baixa', 'normal', 'alta', 'urgente') then raise exception 'Prioridade inválida.'; end if;
  if p_veiculo is not null and not exists (select 1 from public.veiculos where id = p_veiculo and organizacao_id = v_org) then p_veiculo := null; end if;
  insert into public.console_chamados (organizacao_id, veiculo_id, aberto_por, assunto, prioridade, atendente)
    values (v_org, p_veiculo, (select auth.uid()), left(trim(p_assunto), 120), coalesce(p_prioridade, 'normal'), public.chat_atendente(p_atendente)) returning * into c;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto)
    values (c.id, (select auth.uid()), public.console_papel() is not null, trim(p_texto));
  return jsonb_build_object('id', c.id, 'numero', c.numero, 'atendente', c.atendente);
end;
$$;
revoke execute on function public.abrir_chamado(text, text, text, uuid) from public, anon, authenticated;

-- Resposta automática da primeira mensagem (o SONVI chama depois de avisar a equipe por e-mail): uma vez por chamado, só quem abriu
create or replace function public.chat_resposta_automatica(p_chamado uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.console_chamados; t text; num text; r text;
begin
  select * into c from public.console_chamados where id = p_chamado and aberto_por = (select auth.uid());
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if exists (select 1 from public.console_chamado_msgs where chamado_id = c.id and automatica) then return; end if;
  select lower(texto) into t from public.console_chamado_msgs where chamado_id = c.id order by criado_em limit 1;
  num := '#' || lpad(c.numero::text, 4, '0');
  r := case
    when t ~ '\mpi\M|opec|inser' then 'Chamado ' || num || ' aberto. Se puder, mande o número do PI (ex.: PI CBN 0014) e o que aparece na tela.'
    when t ~ 'senha|acesso|entrar|login|usu[aá]rio' then 'Chamado ' || num || ' aberto. Diga o e-mail de quem não consegue entrar. Enquanto isso, o "Esqueci minha senha" na tela de entrada manda um link novo.'
    when t ~ 'financeiro|boleto|pagamento|cobran|lan[cç]amento' then 'Chamado ' || num || ' aberto. Conte qual lançamento ou PI está com problema.'
    when t ~ 'proposta|tabela|pre[cç]o' then 'Chamado ' || num || ' aberto. Se for numa proposta, mande o número dela (ex.: 2026/12).'
    else 'Recebemos sua mensagem e abrimos o chamado ' || num || '.' end;
  r := r || case when public.chat_no_horario() then ' A equipe já foi avisada e responde aqui mesmo.'
    else ' Estamos fora do horário de atendimento (segunda a sexta, das 8h às 18h). A resposta chega no próximo horário, aqui e no seu e-mail.' end;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, automatica, texto) values (c.id, null, true, true, r);
end;
$$;

-- Responder: a resposta da equipe marca "resposta nova" para o cliente
create or replace function public.responder_chamado(p_chamado uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare sup boolean := public.console_papel() in ('proprietario', 'suporte');
begin
  if not public.ve_chamado(p_chamado) then raise exception 'Chamado não encontrado.'; end if;
  if public.console_papel() = 'financeiro' then raise exception 'A sua função no Console não responde chamados.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto) values (p_chamado, (select auth.uid()), sup, trim(p_texto));
  if sup then
    update public.console_chamados set atualizado_em = now(), ultima_resposta_em = now(), primeira_resposta_em = coalesce(primeira_resposta_em, now()),
      situacao = case when situacao = 'aberto' then 'andamento' else situacao end where id = p_chamado;
  else
    update public.console_chamados set atualizado_em = now(), resolvido_em = null, lido_cliente_em = now(),
      situacao = case when situacao in ('aguardando', 'resolvido') then 'aberto' else situacao end where id = p_chamado;
  end if;
end;
$$;

-- Resolver também conta como novidade para o cliente (aparece o "Resolveu?")
create or replace function public.console_chamado_situacao(p_chamado uuid, p_situacao text, p_prioridade text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.console_exige(array['proprietario', 'suporte']);
  if p_situacao not in ('aberto', 'andamento', 'aguardando', 'resolvido') then raise exception 'Situação inválida.'; end if;
  if p_prioridade not in ('baixa', 'normal', 'alta', 'urgente') then raise exception 'Prioridade inválida.'; end if;
  update public.console_chamados set prioridade = p_prioridade, atualizado_em = now(),
    ultima_resposta_em = case when p_situacao = 'resolvido' and situacao <> 'resolvido' then now() else ultima_resposta_em end,
    avaliacao = case when p_situacao = 'resolvido' and situacao <> 'resolvido' then null else avaliacao end,
    resolvido_em = case when p_situacao = 'resolvido' then coalesce(resolvido_em, now()) else null end,
    situacao = p_situacao where id = p_chamado;
  if not found then raise exception 'Chamado não encontrado.'; end if;
end;
$$;

-- O cliente leu as respostas
create or replace function public.chat_marcar_lido(p_chamado uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.console_chamados set lido_cliente_em = now() where id = p_chamado and public.ve_chamado(id) and public.console_papel() is null;
end;
$$;

-- "Resolveu?": não resolveu reabre o chamado
create or replace function public.chat_avaliar(p_chamado uuid, p_resolveu boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.console_chamados set avaliacao = case when p_resolveu then 'resolveu' else 'nao_resolveu' end, avaliado_em = now(), lido_cliente_em = now(),
    situacao = case when p_resolveu then situacao else 'aberto' end, resolvido_em = case when p_resolveu then resolvido_em else null end,
    atualizado_em = case when p_resolveu then atualizado_em else now() end
  where id = p_chamado and situacao = 'resolvido' and public.ve_chamado(id) and public.console_papel() is null;
  if not found then raise exception 'Este chamado não está esperando avaliação.'; end if;
  if not p_resolveu then
    insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, automatica, texto)
      values (p_chamado, null, true, true, 'Entendido, o chamado foi reaberto. Conte o que ainda não está certo.');
  end if;
end;
$$;

-- Mensagens: para o cliente a equipe aparece com o nome da atendente; a automática, como "Resposta automática"
-- (nome novo porque a lista de colunas mudou; chamado_mensagens antiga fica sem uso)
create or replace function public.chat_mensagens(p_chamado uuid)
returns table (id uuid, autor text, do_suporte boolean, texto text, criado_em timestamptz, automatica boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,
    case when m.automatica then 'Resposta automática'
         when m.do_suporte and public.console_papel() is null then c.atendente || ' · Suporte SONVI'
         else coalesce(u.nome, 'Usuário excluído') end,
    m.do_suporte, m.texto, m.criado_em, m.automatica
  from public.console_chamado_msgs m join public.console_chamados c on c.id = m.chamado_id left join public.usuarios u on u.id = m.autor
  where m.chamado_id = p_chamado and public.ve_chamado(p_chamado) order by m.criado_em;
$$;

-- A equipe que abre um chamado em nome do cliente também ganha uma atendente
create or replace function public.console_abrir_chamado(p_org uuid, p_assunto text, p_texto text, p_prioridade text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.console_chamados;
begin
  perform public.console_exige(array['proprietario', 'suporte']);
  if not exists (select 1 from public.organizacoes where id = p_org) then raise exception 'Cliente não encontrado.'; end if;
  if coalesce(trim(p_assunto), '') = '' or coalesce(trim(p_texto), '') = '' then raise exception 'Escreva o assunto e a descrição.'; end if;
  insert into public.console_chamados (organizacao_id, aberto_por, assunto, prioridade, situacao, atendente)
    values (p_org, (select auth.uid()), trim(p_assunto), coalesce(p_prioridade, 'normal'), 'andamento', public.chat_atendente(null)) returning * into c;
  insert into public.console_chamado_msgs (chamado_id, autor, do_suporte, texto) values (c.id, (select auth.uid()), true, trim(p_texto));
  return jsonb_build_object('id', c.id, 'numero', c.numero);
end;
$$;

revoke execute on function public.chat_atendentes(), public.chat_atendente(text), public.chat_no_horario(), public.abrir_chamado(text, text, text, uuid, text),
  public.chat_resposta_automatica(uuid), public.chat_marcar_lido(uuid), public.chat_avaliar(uuid, boolean), public.chat_mensagens(uuid) from public, anon;
grant execute on function public.chat_atendentes(), public.chat_atendente(text), public.chat_no_horario(), public.abrir_chamado(text, text, text, uuid, text),
  public.chat_resposta_automatica(uuid), public.chat_marcar_lido(uuid), public.chat_avaliar(uuid, boolean), public.chat_mensagens(uuid) to authenticated;

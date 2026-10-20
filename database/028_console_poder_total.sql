-- SONVI · Console com poder total (decidido em 20/10/2026): a equipe SONVI cadastra, edita e exclui clientes, rádios e usuários.
-- Parte A vai pela ferramenta. A parte B (excluir rádio e excluir cliente, que apagam dados) é rodada pelo Luiz no SQL Editor.

-- ============================== Parte A
-- Tudo o que o Console mostra, agora com a equipe de cada cliente
create or replace function public.console_dados() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; mes date := date_trunc('month', now() at time zone 'America/Cuiaba')::date;
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  select jsonb_build_object(
    'clientes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'slug', o.slug, 'cnpj', o.cnpj, 'cidade', o.cidade, 'logo', coalesce(o.logo, e.logo), 'situacao', o.situacao,
        'teste_ate', o.teste_ate, 'criado_em', o.criado_em,
        'radios', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'sigla', v.sigla, 'cor', v.cor, 'logo', v.logo, 'cidade', v.cidade, 'frequencia', v.frequencia,
            'clientes', (select count(*) from public.pessoas p where p.veiculo_id = v.id and p.tipo = 'cliente'),
            'pis', (select count(*) from public.pis x where x.veiculo_id = v.id),
            'propostas', (select count(*) from public.propostas x where x.veiculo_id = v.id),
            'lancamentos', (select count(*) from public.lancamentos x where x.veiculo_id = v.id),
            'pis_mes', (select count(*) from public.pis x where x.veiculo_id = v.id and x.criado_em >= mes)) order by v.nome)
          from public.veiculos v where v.organizacao_id = o.id), '[]'::jsonb),
        'equipe', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'celular', u.celular, 'ativo', u.ativo, 'diretor', u.diretor,
            'trocar_senha', u.trocar_senha, 'ultimo_acesso', u.ultimo_acesso,
            'vinculos', coalesce((select jsonb_agg(jsonb_build_object('veiculo_id', x.veiculo_id, 'perfil', x.perfil)) from public.usuario_veiculos x where x.usuario_id = u.id), '[]'::jsonb),
            'carteira', (select count(*) from public.pessoas p where p.consultor_id = u.id) + (select count(*) from public.pis p where p.consultor_id = u.id)
                      + (select count(*) from public.propostas p where p.consultor_id = u.id)) order by u.diretor desc, u.nome)
          from public.usuarios u where u.organizacao_id = o.id), '[]'::jsonb),
        'usuarios', (select count(*) from public.usuarios u where u.organizacao_id = o.id and u.ativo),
        'ultimo', (select jsonb_build_object('quando', u.ultimo_acesso, 'nome', u.nome) from public.usuarios u
                   where u.organizacao_id = o.id and u.ultimo_acesso is not null order by u.ultimo_acesso desc limit 1),
        'clientes', (select count(*) from public.pessoas p join public.veiculos v on v.id = p.veiculo_id where v.organizacao_id = o.id and p.tipo = 'cliente'),
        'propostas_mes', (select count(*) from public.propostas p where p.organizacao_id = o.id and p.criado_em >= mes),
        'pis_mes', (select count(*) from public.pis x join public.veiculos v on v.id = x.veiculo_id where v.organizacao_id = o.id and x.criado_em >= mes),
        'suporte', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'encerrado_em', s.encerrado_em, 'motivo', s.motivo,
            'quem', (select nome from public.usuarios where id = s.admin_id)) order by s.inicio desc)
          from (select * from public.suporte_acessos where organizacao_id = o.id order by inicio desc limit 20) s), '[]'::jsonb)
      ) order by o.nome) from public.organizacoes o left join public.empresa_comercial e on e.organizacao_id = o.id), '[]'::jsonb),
    'suporte', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'encerrado_em', s.encerrado_em, 'motivo', s.motivo,
        'cliente', o.nome, 'slug', o.slug, 'quem', (select nome from public.usuarios where id = s.admin_id)) order by s.inicio desc)
      from (select * from public.suporte_acessos order by inicio desc limit 100) s join public.organizacoes o on o.id = s.organizacao_id), '[]'::jsonb),
    'eu', (select jsonb_build_object('nome', nome, 'email', email) from public.usuarios where id = (select auth.uid()))
  ) into r;
  return r;
end;
$$;

-- Editar a rádio (nome, sigla do PI e cidade). Logo, cores e textos ficam com o diretor, no SONVI.
create or replace function public.console_salvar_radio(p_veiculo uuid, p_nome text, p_sigla text, p_cidade text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_sigla), '') = '' then raise exception 'Informe o nome e a sigla do PI.'; end if;
  update public.veiculos set nome = trim(p_nome), sigla = upper(trim(p_sigla)), cidade = coalesce(trim(p_cidade), '') where id = p_veiculo;
  if not found then raise exception 'Rádio não encontrada.'; end if;
end;
$$;

-- Antes de excluir um usuário pelo Console: a carteira passa para outra pessoa da mesma empresa (ou fica sem responsável)
create or replace function public.console_preparar_exclusao(p_usuario uuid, p_para uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; n_cli int; n_prop int; n_pi int; n_ag int;
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  select organizacao_id into v_org from public.usuarios where id = p_usuario;
  if v_org is null then raise exception 'Usuário não encontrado.'; end if;
  if p_para is not null and (p_para = p_usuario or not exists (select 1 from public.usuarios where id = p_para and ativo and organizacao_id = v_org)) then
    raise exception 'Escolha um usuário ativo da mesma empresa para receber a carteira.'; end if;
  perform set_config('sonvi.transferir', '1', true);
  update public.pessoas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_cli = row_count;
  update public.propostas set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_prop = row_count;
  update public.pis set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_pi = row_count;
  n_ag := 0;
  if p_para is not null then update public.agenda set consultor_id = p_para where consultor_id = p_usuario; get diagnostics n_ag = row_count; end if;
  perform set_config('sonvi.transferir', '', true);
  return jsonb_build_object('clientes', n_cli, 'propostas', n_prop, 'pis', n_pi, 'followups', n_ag);
end;
$$;

revoke execute on function public.console_salvar_radio(uuid, text, text, text), public.console_preparar_exclusao(uuid, uuid) from public, anon;
grant execute on function public.console_salvar_radio(uuid, text, text, text), public.console_preparar_exclusao(uuid, uuid) to authenticated;

-- ============================== Parte B (rodada pelo Luiz no SQL Editor)
-- Apaga uma rádio com tudo o que é dela (clientes, agências, PIs, propostas, financeiro, follow-ups, tabelas de preço,
-- programação musical e os acessos da equipe a ela). Os arquivos do PI (armazenamento "midias") a função "console" apaga.
create or replace function public.console_apagar_radio_dados(p_veiculo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_cli int; n_pi int; n_prop int; n_lanc int;
begin
  select count(*) into n_cli from public.pessoas where veiculo_id = p_veiculo and tipo = 'cliente';
  select count(*) into n_pi from public.pis where veiculo_id = p_veiculo;
  select count(*) into n_prop from public.propostas where veiculo_id = p_veiculo;
  select count(*) into n_lanc from public.lancamentos where veiculo_id = p_veiculo;
  delete from public.agenda where veiculo_id = p_veiculo;
  delete from public.lancamentos where veiculo_id = p_veiculo;
  delete from public.propostas where veiculo_id = p_veiculo;
  delete from public.pis where veiculo_id = p_veiculo;
  update public.pessoas set agencia_id = null where agencia_id in (select id from public.pessoas where veiculo_id = p_veiculo);
  delete from public.pessoas where veiculo_id = p_veiculo;
  delete from public.precos where veiculo_id = p_veiculo;
  delete from public.produtos where veiculo_id = p_veiculo;
  delete from public.tabelas_preco where veiculo_id = p_veiculo;
  delete from public.mus_programacao where veiculo_id = p_veiculo;
  delete from public.musicas where veiculo_id = p_veiculo;
  delete from public.veiculos where id = p_veiculo;
  return jsonb_build_object('clientes', n_cli, 'pis', n_pi, 'propostas', n_prop, 'lancamentos', n_lanc);
end;
$$;
revoke execute on function public.console_apagar_radio_dados(uuid) from public, anon, authenticated;

create or replace function public.console_excluir_radio(p_veiculo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  if not exists (select 1 from public.veiculos where id = p_veiculo) then raise exception 'Rádio não encontrada.'; end if;
  return public.console_apagar_radio_dados(p_veiculo);
end;
$$;

-- Apaga o cliente inteiro. Confirmação: o endereço do cliente digitado. Devolve as contas da equipe,
-- que a função "console" apaga em seguida (a conta de entrada fica fora do banco).
create or replace function public.console_excluir_cliente(p_org uuid, p_confirma text) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_slug text; v uuid; equipe uuid[];
begin
  if not public.eh_admin_plataforma() then raise exception 'Acesso só para a equipe SONVI.'; end if;
  select slug into v_slug from public.organizacoes where id = p_org;
  if v_slug is null then raise exception 'Cliente não encontrado.'; end if;
  if lower(trim(coalesce(p_confirma, ''))) <> v_slug then raise exception 'Para excluir, digite o endereço do cliente: %', v_slug; end if;
  select coalesce(array_agg(id), '{}') into equipe from public.usuarios where organizacao_id = p_org;
  for v in select id from public.veiculos where organizacao_id = p_org loop perform public.console_apagar_radio_dados(v); end loop;
  delete from public.propostas where organizacao_id = p_org;
  update public.usuarios set organizacao_id = null, ativo = false, diretor = false where organizacao_id = p_org;
  delete from public.empresa_comercial where organizacao_id = p_org;
  delete from public.proposta_seq_org where organizacao_id = p_org;
  delete from public.suporte_acessos where organizacao_id = p_org;
  delete from public.organizacoes where id = p_org;
  return equipe;
end;
$$;
revoke execute on function public.console_excluir_radio(uuid), public.console_excluir_cliente(uuid, text) from public, anon;
grant execute on function public.console_excluir_radio(uuid), public.console_excluir_cliente(uuid, text) to authenticated;

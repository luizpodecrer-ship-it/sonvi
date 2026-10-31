-- 065 · Permissões das tabelas por escrito (31/10/2026, etapa 5 da consolidação).
-- 1) Quem está logado ("authenticated") tinha também TRUNCATE (apagar a tabela inteira de uma vez, coisa que a RLS
--    não barra), TRIGGER, REFERENCES e MAINTAIN em todas as tabelas, herdados do padrão do Supabase. Saem.
-- 2) As permissões que valem (ler, incluir, alterar, excluir) ficam escritas aqui, iguais às da produção em
--    31/10/2026. Assim o ambiente de teste, montado pelas migrações, fica com as mesmas portas da produção.
--    Quem decide o que cada pessoa vê e muda continua sendo a RLS.
revoke truncate, trigger, references, maintain on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references, maintain on tables from authenticated;
grant delete, insert, select, update on public.agenda to authenticated;
grant delete, insert, select, update on public.colaborador_comissoes to authenticated;
grant delete, insert, select, update on public.colaborador_metas to authenticated;
grant delete, insert, select, update on public.colaboradores to authenticated;
grant delete, insert, select, update on public.combos to authenticated;
grant delete, insert, select, update on public.console_chamado_msgs to authenticated;
grant delete, insert, select, update on public.console_chamados to authenticated;
grant delete, insert, select, update on public.console_cobrancas to authenticated;
grant delete, insert, select, update on public.console_config to authenticated;
grant delete, insert, select, update on public.console_contratos to authenticated;
grant insert, select, update on public.empresa_comercial to authenticated;
grant delete, insert, select, update on public.fat_pedidos to authenticated;
grant delete, select on public.lancamentos to authenticated;
grant delete, insert, select, update on public.mus_categorias to authenticated;
grant delete, insert, select, update on public.mus_config to authenticated;
grant delete, insert, select, update on public.mus_formatos to authenticated;
grant delete, insert, select, update on public.mus_grupos to authenticated;
grant delete, insert, select, update on public.mus_programacao to authenticated;
grant delete, insert, select, update on public.mus_subcategorias to authenticated;
grant delete, insert, select, update on public.mus_vinhetas to authenticated;
grant delete, insert, select, update on public.musicas to authenticated;
grant delete, insert, select, update on public.organizacoes to authenticated;
grant delete, insert, select, update on public.pessoas to authenticated;
grant select on public.pi_historico to authenticated;
grant delete, insert, select, update on public.pi_leituras to authenticated;
grant delete, insert, select, update on public.pi_links to authenticated;
grant delete, select, update on public.pis to authenticated;
grant delete, insert, select, update on public.plataforma_admins to authenticated;
grant delete, insert, select, update on public.precos to authenticated;
grant delete, insert, select, update on public.produtos to authenticated;
grant delete, insert, select, update on public.proposta_seq_org to authenticated;
grant delete, insert, select, update on public.propostas to authenticated;
grant delete, insert, select, update on public.repasses to authenticated;
grant delete, insert, select, update on public.suporte_acessos to authenticated;
grant delete, insert, select, update on public.tabelas_preco to authenticated;
grant delete, insert, select, update on public.usuario_veiculos to authenticated;
grant select on public.usuarios to authenticated;
grant delete, insert, select, update on public.veiculos to authenticated;

-- 3) Funções para quem está logado, por escrito: todas, menos as internas (só o banco e as funções de borda usam)
--    e as de gatilho. Igual à produção; no ambiente de teste o Supabase não dá essa permissão sozinho.
grant execute on all functions in schema public to authenticated;
revoke execute on function public.apagar_pi_interno(uuid), public.console_apagar_radio_dados(uuid), public.agencia_copiar_para_todos(uuid, uuid),
  public.followup_automaticos(), public.followup_chave(), public.parcelas_do_pedido(uuid), public.veiculo_publico(uuid),
  public.abrir_chamado(text, text, text, uuid) from authenticated;
do $$ declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from authenticated', f);
  end loop;
end $$;

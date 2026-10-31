-- 31/10/2026 · Projetos especiais (Produtos › Projetos especiais; layout aprovado no artifact "Projetos especiais · CBN").
-- Projeto = produto de rádio (tipo programa) com secao 'projeto', vendido por mês:
--   detalhe = dias ("Seg a Sex"); dados = { dias:[1..5], valor, online:[{qtd,titulo,sub}], dial:[{qtd,titulo,sub}], rodape }.
--   Horário sempre rotativo. Sem preços em precos (o valor do mês fica em dados).
-- Modelo do veículo (o que todo projeto novo traz): uma linha secao 'projeto_modelo', ativo = false, mesmos dados sem dias/valor.

alter table public.produtos drop constraint produtos_secao_check;
alter table public.produtos add constraint produtos_secao_check
  check (secao = any (array['programa','quadro','rotativo','digital','aovivo','patrocinio','ooh','projeto','projeto_modelo']));

create or replace function public.salvar_produto_radio(p_veiculo uuid, p_produto jsonb, p_precos jsonb)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_tab uuid; v_id uuid := nullif(p_produto->>'id', '')::uuid; v_secao text := coalesce(nullif(p_produto->>'secao', ''), 'programa');
  v_nome text := trim(coalesce(p_produto->>'nome', '')); v_keep uuid[];
begin
  if coalesce(public.perfil_no_veiculo(p_veiculo), '') not in ('diretor', 'gerente') then raise exception 'Só o diretor cadastra e altera produtos'; end if;
  if v_secao not in ('programa', 'quadro', 'rotativo', 'aovivo', 'patrocinio', 'projeto', 'projeto_modelo') then raise exception 'Tipo de produto inválido'; end if;
  if v_nome = '' then raise exception 'Informe o nome do produto'; end if;
  -- Um modelo só por veículo
  if v_secao = 'projeto_modelo' and v_id is null then
    select id into v_id from public.produtos where veiculo_id = p_veiculo and secao = 'projeto_modelo' limit 1;
  end if;
  v_tab := public.tabela_produtos(p_veiculo);
  if v_id is null then
    insert into public.produtos (veiculo_id, tipo, nome, detalhe, secao, categoria, ativo, ordem, dados)
    values (p_veiculo, 'programa', v_nome, coalesce(p_produto->>'detalhe', ''), v_secao, 'radio',
      case when v_secao = 'projeto_modelo' then false else coalesce((p_produto->>'ativo')::boolean, true) end,
      coalesce((select max(ordem) + 1 from public.produtos where veiculo_id = p_veiculo and tipo = 'programa'), 0), coalesce(p_produto->'dados', '{}'::jsonb))
    returning id into v_id;
  else
    update public.produtos set nome = v_nome, detalhe = coalesce(p_produto->>'detalhe', ''), secao = v_secao,
      ativo = case when v_secao = 'projeto_modelo' then false else coalesce((p_produto->>'ativo')::boolean, ativo) end, dados = coalesce(p_produto->'dados', dados)
    where id = v_id and veiculo_id = p_veiculo and tipo = 'programa' and coalesce(secao, '') <> 'digital';
    if not found then raise exception 'Produto não encontrado'; end if;
  end if;
  select coalesce(array_agg(f.id), '{}') into v_keep from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) e
    join public.produtos f on f.id = nullif(e->>'formato_id', '')::uuid and f.veiculo_id = p_veiculo and f.tipo = 'formato' and coalesce(f.secao, '') <> 'digital'
    where coalesce(nullif(e->>'preco', '')::numeric, 0) > 0 and v_secao not in ('patrocinio', 'projeto', 'projeto_modelo');
  execute 'dele' || 'te from public.precos where tabela_id = $1 and programa_id = $2 and not (formato_id = any($3))' using v_tab, v_id, v_keep;
  insert into public.precos (veiculo_id, programa_id, formato_id, preco, tabela_id, vigencia_inicio)
    select p_veiculo, v_id, (e->>'formato_id')::uuid, (e->>'preco')::numeric, v_tab, public.hoje_radio()
    from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) e where nullif(e->>'formato_id', '')::uuid = any(v_keep)
  on conflict (tabela_id, programa_id, formato_id) do update set preco = excluded.preco;
  perform set_config('sonvi.tabela', '1', true);
  update public.tabelas_preco set
    programas = coalesce((select array_agg(p.id order by p.ordem, p.nome) from public.produtos p where p.id in (select programa_id from public.precos where tabela_id = v_tab)), '{}'),
    formatos = coalesce((select array_agg(p.id order by p.ordem, p.nome) from public.produtos p where p.id in (select formato_id from public.precos where tabela_id = v_tab)), '{}')
  where id = v_tab;
  return v_id;
end; $function$;

revoke all on function public.salvar_produto_radio(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_produto_radio(uuid, jsonb, jsonb) to authenticated;

-- Modelo da CBN (da página "Projeto especial" do mídia kit)
insert into public.produtos (veiculo_id, tipo, nome, detalhe, secao, categoria, ativo, ordem, dados)
select v.id, 'programa', 'Modelo dos projetos especiais', '', 'projeto_modelo', 'radio', false, 9999, jsonb_build_object(
  'online', jsonb_build_array(
    jsonb_build_object('qtd', 1, 'titulo', 'Full banner 730x72px', 'sub', 'no Portal da CBN Cuiabá'),
    jsonb_build_object('qtd', null, 'titulo', 'Logo na transmissão do YouTube', 'sub', 'ao vivo no canal da CBN Cuiabá'),
    jsonb_build_object('qtd', 1, 'titulo', 'Matéria mensal', 'sub', 'no Portal da CBN Cuiabá'),
    jsonb_build_object('qtd', null, 'titulo', 'Divulgação do quadro com o logo', 'sub', 'na rede social da CBN Cuiabá')),
  'dial', jsonb_build_array(
    jsonb_build_object('qtd', 132, 'titulo', 'Spots de 30"', 'sub', 'rotativo'),
    jsonb_build_object('qtd', 22, 'titulo', 'Citações de 5"', 'sub', 'abertura e encerramento'),
    jsonb_build_object('qtd', 90, 'titulo', 'Chamadas', 'sub', 'com citação')),
  'rodape', 'Valor incluindo produção e veiculação do material. Todo o conteúdo deve ser previamente enviado e aprovado pelo cliente.')
from public.veiculos v
where v.id = '608d70ff-7483-46f2-9aec-23ebae32ebfe'
  and not exists (select 1 from public.produtos p where p.veiculo_id = v.id and p.secao = 'projeto_modelo');

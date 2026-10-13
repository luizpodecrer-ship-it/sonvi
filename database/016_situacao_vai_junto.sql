-- SONVI · 016 · Ao levar um cliente para outra rádio, a situação vai junto (Ativo continua Ativo).
-- Antes o cliente nascia como Prospect na outra rádio. Também acerta as cópias já feitas que ficaram
-- como Prospect enquanto o cadastro de origem (o primeiro do grupo) está Ativo ou Inativo.

create or replace function public.levar_pessoa(p_origem uuid, p_destinos jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.pessoas; a public.pessoas; d jsonb; v uuid; perfil text; cons uuid; ag uuid; grupo uuid; grupo_ag uuid;
  criados uuid[] := '{}'; ja uuid[] := '{}'; nome_radio text;
begin
  select * into o from public.pessoas where id = p_origem;
  if not found then raise exception 'Cadastro não encontrado.'; end if;
  grupo := coalesce(o.cadastro_id, o.id);
  if o.cadastro_id is null then update public.pessoas set cadastro_id = grupo where id = o.id; end if;
  if o.agencia_id is not null then select * into a from public.pessoas where id = o.agencia_id; end if;

  for d in select * from jsonb_array_elements(coalesce(p_destinos, '[]'::jsonb)) loop
    v := (d->>'veiculo_id')::uuid;
    if v is null or v = o.veiculo_id then continue; end if;
    select nome into nome_radio from public.veiculos where id = v;
    perfil := public.perfil_no_veiculo(v);
    if perfil is null or perfil not in ('diretor', 'gerente', 'consultor') then
      raise exception 'Você não pode cadastrar na %.', coalesce(nome_radio, 'rádio escolhida');
    end if;

    -- Já está lá (ligado ou com o mesmo CNPJ/CPF)? Só liga, não duplica.
    if exists (select 1 from public.pessoas p where p.veiculo_id = v and p.tipo = o.tipo
               and (p.cadastro_id = grupo or (o.documento_num <> '' and p.documento_num = o.documento_num))) then
      update public.pessoas p set cadastro_id = grupo where p.veiculo_id = v and p.tipo = o.tipo and p.cadastro_id is null
        and o.documento_num <> '' and p.documento_num = o.documento_num;
      ja := ja || v; continue;
    end if;

    cons := null; ag := null;
    if o.tipo = 'cliente' then
      cons := case when perfil = 'consultor' then (select auth.uid()) else nullif(d->>'consultor_id', '')::uuid end;
      if cons is not null and not exists (select 1 from public.usuario_veiculos uv where uv.usuario_id = cons and uv.veiculo_id = v) then
        raise exception 'O consultor escolhido não trabalha na %.', nome_radio;
      end if;
      -- Agência: a mesma da outra rádio (ligada ou pelo CNPJ) ou criada junto
      if a.id is not null then
        grupo_ag := coalesce(a.cadastro_id, a.id);
        select p.id into ag from public.pessoas p where p.veiculo_id = v and p.tipo = 'agencia'
          and (p.cadastro_id = grupo_ag or (a.documento_num <> '' and p.documento_num = a.documento_num)) limit 1;
        if ag is null and coalesce((d->>'criar_agencia')::boolean, false) then
          if a.cadastro_id is null then update public.pessoas set cadastro_id = grupo_ag where id = a.id; end if;
          insert into public.pessoas (veiculo_id, tipo, pessoa, nome, razao_social, documento, inscricao_estadual, cep, endereco, cidade,
            telefone, whatsapp, email, contato_decide, contato_assina, segmento, comissao, situacao, cadastro_id)
          values (v, 'agencia', a.pessoa, a.nome, a.razao_social, a.documento, a.inscricao_estadual, a.cep, a.endereco, a.cidade,
            a.telefone, a.whatsapp, a.email, a.contato_decide, a.contato_assina, a.segmento, a.comissao, 'ativo', grupo_ag)
          returning id into ag;
        end if;
      end if;
    end if;

    begin
      insert into public.pessoas (veiculo_id, tipo, pessoa, nome, razao_social, documento, inscricao_estadual, cep, endereco, cidade,
        telefone, whatsapp, email, contato_decide, contato_assina, segmento, comissao, situacao, consultor_id, agencia_id, cadastro_id)
      values (v, o.tipo, o.pessoa, o.nome, o.razao_social, o.documento, o.inscricao_estadual, o.cep, o.endereco, o.cidade,
        o.telefone, o.whatsapp, o.email, o.contato_decide, o.contato_assina, o.segmento, o.comissao,
        o.situacao, cons, ag, grupo);
    exception when unique_violation then
      raise exception 'Esse CNPJ/CPF já está cadastrado na %, na carteira de outro consultor. Fale com o gerente de lá.', nome_radio;
    end;
    criados := criados || v;
  end loop;
  return jsonb_build_object('criados', to_jsonb(criados), 'ja', to_jsonb(ja));
end $$;

update public.pessoas c set situacao = o.situacao
from public.pessoas o
where c.cadastro_id is not null and o.id = c.cadastro_id and c.id <> o.id and c.tipo = 'cliente'
  and c.situacao = 'prospect' and o.situacao <> 'prospect';

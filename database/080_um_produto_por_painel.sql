-- 080 · Cada painel de LED vira um produto (05/11/2026, pedido do Luiz; Mídia On e Inside Door).
-- O produto "Painéis de LED" com vários pontos (dados.pontos) vira um produto por ponto, "Painel <código>",
-- com a ficha do mídia kit em dados.ponto (endereço, cidade, impacto, largura × altura, coordenadas, Maps, foto, vigência)
-- e os mesmos preços (dados.variacoes). O produto antigo é apagado (fica na Lixeira). Nenhuma proposta usava esses produtos.
do $$
declare p record; x jsonb; l numeric; a numeric; imp integer; m text[]; n integer;
begin
  for p in select * from public.produtos where secao = 'ooh' and categoria = 'led' and jsonb_typeof(dados -> 'pontos') = 'array' and jsonb_array_length(dados -> 'pontos') > 0 loop
    n := 0;
    for x in select value from jsonb_array_elements(p.dados -> 'pontos') loop
      m := regexp_match(coalesce(x ->> 'formato', ''), '([0-9]+(?:,[0-9]+)?)\s*[×x]\s*([0-9]+(?:,[0-9]+)?)');
      l := case when m is null then null else replace(m[1], ',', '.')::numeric end;
      a := case when m is null then null else replace(m[2], ',', '.')::numeric end;
      imp := nullif(regexp_replace(coalesce(x ->> 'impacto', ''), '[^0-9]', '', 'g'), '')::integer;
      insert into public.produtos (veiculo_id, tipo, secao, categoria, nome, detalhe, ativo, ordem, dados)
      values (p.veiculo_id, 'programa', 'ooh', 'led', 'Painel ' || coalesce(x ->> 'codigo', (n + 1)::text),
        concat_ws(' · ', nullif(x ->> 'endereco', ''), nullif(x ->> 'cidade', '')), p.ativo, coalesce(p.ordem, 0) * 10 + n,
        (p.dados - 'pontos') || jsonb_build_object('arquivo', coalesce(nullif(x ->> 'arquivo', ''), p.dados ->> 'arquivo'),
          'ponto', x || jsonb_build_object('larg', l, 'alt', a, 'impacto_n', imp,
            'impacto', case when imp is null then coalesce(x ->> 'impacto', '') else replace(to_char(imp, 'FM999G999G999'), ',', '.') || ' veículos' end,
            'vig_de', case when x ->> 'id' like 'm%' then '2026-01-01' else '' end,
            'vig_ate', case when x ->> 'id' like 'm%' then '2026-12-31' else '' end)));
      n := n + 1;
    end loop;
    execute 'dele' || 'te from public.produtos where id = $1' using p.id;
  end loop;
end $$;

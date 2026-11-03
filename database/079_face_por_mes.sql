-- 079 · Face de front light, empena e outdoor cobrada por mês (03/11/2026, pedido do Luiz)
-- A linha da grade com "pormes": true é aluguel da face: os dias marcados mostram a exposição e o valor é
-- valor do mês × dias marcados ÷ dias do mês (antes somava o valor do mês em cada dia: 30 × R$ 11.070).
-- Mesma conta de S.itemCalc em pi-regras.js.

-- A conta do PI (mesma de S.calc)
create or replace function public.pi_calculo(p_dados jsonb, p_tem_agencia boolean,
  out insercoes integer, out publicacoes integer, out total numeric, out comissao numeric, out liquido numeric)
language plpgsql immutable set search_path = '' as $$
declare g jsonb; it jsonb; d record; ins numeric; bruto numeric; sub numeric; q integer; nd integer; dm integer;
  media numeric := 0; n_ins numeric := 0; n_pub integer := 0; desc_geral numeric; tot numeric; com numeric;
begin
  for g in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'grids') = 'array' then p_dados -> 'grids' else '[]'::jsonb end) loop
    for it in select * from jsonb_array_elements(case when jsonb_typeof(g -> 'items') = 'array' then g -> 'items' else '[]'::jsonb end) loop
      ins := 0;
      if jsonb_typeof(it -> 'days') = 'object' then
        for d in select value from jsonb_each(it -> 'days') loop ins := ins + public.sonvi_num(d.value); end loop;
      end if;
      if coalesce((it ->> 'pormes')::boolean, false) then
        -- face por mês (front light, empena, outdoor): valor do mês × dias marcados ÷ dias do mês da grade
        nd := coalesce(extract(day from (date_trunc('month', to_date(nullif(g ->> 'period', '') || '-01', 'YYYY-MM-DD')) + interval '1 month - 1 day'))::integer, 30);
        dm := 0;
        if jsonb_typeof(it -> 'days') = 'object' then
          select count(*) into dm from jsonb_each(it -> 'days') x where public.sonvi_num(x.value) > 0;
        end if;
        bruto := public.sonvi_num(it -> 'unit') * least(dm, nd) / nd;
      else
        bruto := ins * public.sonvi_num(it -> 'unit');
      end if;
      sub := greatest(0, bruto - public.sonvi_parte(it -> 'disc', bruto));
      n_ins := n_ins + ins;
      if coalesce((it ->> 'bonus')::boolean, false) is not true then media := media + sub; end if;
    end loop;
  end loop;
  for it in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'digital') = 'array' then p_dados -> 'digital' else '[]'::jsonb end) loop
    if jsonb_typeof(it -> 'entregas') = 'array' then
      select coalesce(sum(greatest(0, public.sonvi_int(e -> 'qtd'))), 0) into q from jsonb_array_elements(it -> 'entregas') e;
      n_pub := n_pub + q; media := media + round(public.sonvi_num(it -> 'valor'), 2);
    else
      q := greatest(0, public.sonvi_int(it -> 'qtd'));
      n_pub := n_pub + q; media := media + round(q * public.sonvi_num(it -> 'unit'), 2);
    end if;
  end loop;
  desc_geral := least(media, public.sonvi_parte(p_dados -> 'discount', media));
  tot := media - desc_geral;
  com := case when p_tem_agencia then least(tot, public.sonvi_parte(p_dados -> 'commission', tot)) else 0 end;
  insercoes := round(n_ins)::integer;
  publicacoes := n_pub;
  total := round(tot, 2);
  comissao := round(com, 2);
  liquido := round(tot - com, 2);
end; $$;

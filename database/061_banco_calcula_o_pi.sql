-- 061 · O banco calcula os valores do PI (31/10/2026, etapa 2 da consolidação).
-- Antes, inserções, total, comissão e líquido chegavam prontos da tela e o banco gravava sem conferir.
-- Agora o banco refaz a mesma conta da tela (S.calc em pi-regras.js) a partir da grade (dados) sempre que o PI
-- nasce ou é gravado enquanto pode ser editado (rascunho ou devolvido). PI já enviado à OPEC não muda.
-- Conta (igual à tela):
--   item de rádio: inserções = soma dos dias; bruto = inserções × unitário; desconto do item (% ou R$); bonificado = não cobrado
--   ação digital: valor da ação (entregas em texto) ou quantidade × unitário (modelo antigo)
--   mídia = itens cobrados + ações; desconto geral (% ou R$, no máximo a mídia); total = mídia − desconto
--   comissão (só com agência) = % ou R$ sobre o total, no máximo o total; líquido = total − comissão

-- Número como a tela lê (S.num): aceita número ou texto "1.234,56"; o que não for número vale 0
create or replace function public.sonvi_num(v jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare s text; m text;
begin
  if v is null or jsonb_typeof(v) = 'null' then return 0; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) <> 'string' then return 0; end if;
  s := replace(v #>> '{}', '.', '');
  s := regexp_replace(s, ',', '.');
  m := substring(s from '^\s*([-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?)');
  return coalesce(m::numeric, 0);
exception when others then return 0;
end; $$;

-- Inteiro como a tela lê as quantidades das entregas (parseInt): só o começo inteiro do texto
create or replace function public.sonvi_int(v jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
declare m text;
begin
  if v is null or jsonb_typeof(v) not in ('number', 'string') then return 0; end if;
  m := substring(v #>> '{}' from '^\s*([-+]?\d+)');
  return coalesce(m::integer, 0);
exception when others then return 0;
end; $$;

-- Parte de uma regra { type:'pct'|'brl', value } sobre uma base
create or replace function public.sonvi_parte(regra jsonb, base numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when coalesce(regra ->> 'type', '') = 'pct' then base * public.sonvi_num(regra -> 'value') / 100
              else public.sonvi_num(regra -> 'value') end
$$;

-- A conta do PI (mesma de S.calc)
create or replace function public.pi_calculo(p_dados jsonb, p_tem_agencia boolean,
  out insercoes integer, out publicacoes integer, out total numeric, out comissao numeric, out liquido numeric)
language plpgsql immutable set search_path = '' as $$
declare g jsonb; it jsonb; d record; ins numeric; bruto numeric; sub numeric; q integer;
  media numeric := 0; n_ins numeric := 0; n_pub integer := 0; desc_geral numeric; tot numeric; com numeric;
begin
  for g in select * from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'grids') = 'array' then p_dados -> 'grids' else '[]'::jsonb end) loop
    for it in select * from jsonb_array_elements(case when jsonb_typeof(g -> 'items') = 'array' then g -> 'items' else '[]'::jsonb end) loop
      ins := 0;
      if jsonb_typeof(it -> 'days') = 'object' then
        for d in select value from jsonb_each(it -> 'days') loop ins := ins + public.sonvi_num(d.value); end loop;
      end if;
      bruto := ins * public.sonvi_num(it -> 'unit');
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

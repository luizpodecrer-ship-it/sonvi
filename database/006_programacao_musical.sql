-- SONVI · programação musical (módulo inspirado no "Musical" das automações de rádio).
-- Tudo é individual por veículo: acervo, categorias, formatos, regras e a grade de cada dia e hora.
-- Quem programa: diretor, gerente e o perfil "programador" (setor artístico, criado em 007). A OPEC consulta.

-- ============ tabelas ============

-- Categorias: além do nome, limite de juntas, prioridade (camada preenchida primeiro) e rotatividade (%)
create table public.mus_categorias (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  codigo text not null,
  nome text not null,
  max_juntas integer not null default 1 check (max_juntas between 1 and 20),
  prioridade integer not null default 1 check (prioridade between 1 and 9),
  rotatividade integer not null default 60 check (rotatividade between 0 and 100),
  cor integer not null default 0,            -- índice da paleta de categorias do sistema
  criado_em timestamptz not null default now(),
  unique (veiculo_id, codigo)
);

create table public.mus_subcategorias (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);
create index on public.mus_subcategorias (veiculo_id);

-- Grupos de conflito de vozes: artistas de voz parecida ficam afastados pela distância (minutos)
create table public.mus_grupos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  nome text not null,
  distancia integer not null default 30 check (distancia between 0 and 1440),
  artistas text[] not null default '{}',
  criado_em timestamptz not null default now()
);
create index on public.mus_grupos (veiculo_id);

create table public.mus_vinhetas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  nome text not null,
  duracao integer not null default 5 check (duracao between 1 and 600),  -- segundos
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.mus_vinhetas (veiculo_id);

-- Acervo: a ficha musical e as regras que valem só para cada música
create table public.musicas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  titulo text not null,
  interprete text not null,
  interprete2 text not null default '',
  compositor text not null default '',
  gravadora text not null default '',
  disco text not null default '',
  ano text not null default '',
  bpm integer,
  categoria_id uuid not null references public.mus_categorias(id) on delete restrict,
  subcategoria_id uuid references public.mus_subcategorias(id) on delete set null,
  ritmo text not null default 'M' check (ritmo in ('L', 'M', 'R')),
  peso integer not null default 3 check (peso between 1 and 5),
  voz text not null default 'M' check (voz in ('M', 'F', 'D')),
  origem text not null default 'N' check (origem in ('N', 'I')),
  novidade boolean not null default false,
  duracao integer not null default 180 check (duracao between 10 and 3600),   -- segundos
  entrada integer not null default 0,        -- onde a voz começa (s)
  termino integer not null default 0,        -- ponto de mixagem (s); 0 = fim da música
  intervalo_h integer not null default 0 check (intervalo_h between 0 and 168),  -- intervalo próprio; 0 = vale a rotatividade
  grupo_versoes text not null default '',    -- versões da mesma música (parent songs) têm o mesmo código
  espera_h integer not null default 2 check (espera_h between 0 and 168),       -- espera entre versões
  deve_tocar integer not null default 0 check (deve_tocar between 0 and 99),    -- compromisso por dia
  deve_de integer not null default 6 check (deve_de between 0 and 23),
  deve_ate integer not null default 22 check (deve_ate between 0 and 23),
  limite_dia integer not null default 0 check (limite_dia between 0 and 99),    -- 0 = sem limite
  ativa boolean not null default true,
  bloqueios text[] not null default '{}',    -- grade de restrição: "dia-hora" bloqueados (dia 0 = segunda)
  bloqueio_de text not null default '',      -- bloqueio fino por minutos (HH:MM)
  bloqueio_ate text not null default '',
  vinheta_id uuid references public.mus_vinhetas(id) on delete set null,  -- song ad: vinheta que toca antes
  arquivo text not null default '',
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.musicas (veiculo_id);
create index on public.musicas (categoria_id);
create index on public.musicas (subcategoria_id);
create index on public.musicas (vinheta_id);

-- Formatos: a receita de cada hora. posicoes = ["<id da categoria>", "VIN", "BRK", "INF", ...]
create table public.mus_formatos (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  nome text not null,
  cor integer not null default 0,
  posicoes jsonb not null default '[]',
  permitir_mover boolean not null default true,
  permitir_excluir boolean not null default true,
  automatico boolean not null default true,  -- falso = horário ao vivo, o locutor escolhe
  liberadas uuid[] not null default '{}',    -- categorias liberadas na busca manual (vazio = todas)
  criado_em timestamptz not null default now()
);
create index on public.mus_formatos (veiculo_id);

-- Configuração do veículo: ritmos, regras ligadas, grade da semana (formato por dia e hora) e textos informativos
create table public.mus_config (
  veiculo_id uuid primary key references public.veiculos(id) on delete cascade,
  ritmos jsonb not null default '{"L":{"nome":"Lento","max":2},"M":{"nome":"Médio","max":3},"R":{"nome":"Rápido","max":2}}',
  regras jsonb not null default '{}',
  grade jsonb not null default '[]',         -- 7 linhas (segunda a domingo) × 24 horas com o id do formato
  informativos jsonb not null default '["Hora certa", "Previsão do tempo", "Trânsito agora", "Agenda cultural"]',
  atualizado_em timestamptz not null default now()
);

-- A programação de cada dia e hora: itens = [{k:"MUS", cat, musica, manual}, {k:"VIN", vinheta}, {k:"BRK"}, {k:"INF", texto}]
create table public.mus_programacao (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  data date not null,
  hora integer not null check (hora between 0 and 23),
  formato_id uuid references public.mus_formatos(id) on delete set null,
  itens jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  unique (veiculo_id, data, hora)
);

-- ============ integridade: nada de uma rádio aponta para outra ============
create function public.musicas_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.mus_categorias where id = new.categoria_id and veiculo_id = new.veiculo_id) then
    raise exception 'A categoria não pertence a este veículo'; end if;
  if new.subcategoria_id is not null and not exists (select 1 from public.mus_subcategorias where id = new.subcategoria_id and veiculo_id = new.veiculo_id) then
    raise exception 'A subcategoria não pertence a este veículo'; end if;
  if new.vinheta_id is not null and not exists (select 1 from public.mus_vinhetas where id = new.vinheta_id and veiculo_id = new.veiculo_id) then
    raise exception 'A vinheta não pertence a este veículo'; end if;
  if tg_op = 'UPDATE' and new.veiculo_id <> old.veiculo_id then raise exception 'A música não pode mudar de veículo'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger musicas_protege before insert or update on public.musicas for each row execute function public.musicas_protege();

create function public.mus_programacao_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.formato_id is not null and not exists (select 1 from public.mus_formatos where id = new.formato_id and veiculo_id = new.veiculo_id) then
    raise exception 'O formato não pertence a este veículo'; end if;
  if jsonb_typeof(new.itens) <> 'array' then raise exception 'Itens da programação inválidos'; end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger mus_programacao_protege before insert or update on public.mus_programacao for each row execute function public.mus_programacao_protege();
revoke execute on function public.musicas_protege(), public.mus_programacao_protege() from public, anon, authenticated;

-- ============ acesso ============
-- Programa: diretor, gerente e programador. Consulta: os mesmos e a OPEC.
create function public.programa_musica(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.perfil_no_veiculo(v) in ('diretor', 'gerente', 'programador'), false);
$$;
create function public.ve_musica(v uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.perfil_no_veiculo(v) in ('diretor', 'gerente', 'programador', 'opec'), false);
$$;
revoke execute on function public.programa_musica(uuid), public.ve_musica(uuid) from public, anon;
grant execute on function public.programa_musica(uuid), public.ve_musica(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['mus_categorias', 'mus_subcategorias', 'mus_grupos', 'mus_vinhetas', 'musicas', 'mus_formatos', 'mus_config', 'mus_programacao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ve_musica(veiculo_id))', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.programa_musica(veiculo_id))', t || '_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.programa_musica(veiculo_id)) with check (public.programa_musica(veiculo_id))', t || '_alterar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.programa_musica(veiculo_id))', t || '_excluir', t);
  end loop;
end $$;

-- ============ ponto de partida de uma rádio ============
-- Cria categorias, vinhetas, formatos, grade da semana e regras padrão quando a rádio ainda não tem nada.
create function public.mus_iniciar(p_veiculo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c_suc uuid; c_lan uuid; c_rec uuid; c_fla uuid;
  f_dia uuid; f_noite uuid; f_madr uuid;
  v_grade jsonb := '[]'; v_linha jsonb; d int; h int;
begin
  if not public.programa_musica(p_veiculo) then raise exception 'Sem permissão para programar este veículo'; end if;
  if exists (select 1 from public.mus_categorias where veiculo_id = p_veiculo) then return; end if;

  insert into public.mus_categorias (veiculo_id, codigo, nome, max_juntas, prioridade, rotatividade, cor) values (p_veiculo, 'SUC', 'Sucessos', 1, 1, 70, 0) returning id into c_suc;
  insert into public.mus_categorias (veiculo_id, codigo, nome, max_juntas, prioridade, rotatividade, cor) values (p_veiculo, 'LAN', 'Lançamentos', 1, 2, 60, 3) returning id into c_lan;
  insert into public.mus_categorias (veiculo_id, codigo, nome, max_juntas, prioridade, rotatividade, cor) values (p_veiculo, 'REC', 'Recorrentes', 1, 3, 60, 1) returning id into c_rec;
  insert into public.mus_categorias (veiculo_id, codigo, nome, max_juntas, prioridade, rotatividade, cor) values (p_veiculo, 'FLA', 'Flashback', 2, 4, 50, 2) returning id into c_fla;
  insert into public.mus_vinhetas (veiculo_id, nome, duracao) values (p_veiculo, 'Vinheta de passagem 01', 5), (p_veiculo, 'Vinheta de passagem 02', 6);

  insert into public.mus_formatos (veiculo_id, nome, cor, posicoes) values (p_veiculo, 'Dia', 1, jsonb_build_array('INF', c_suc, c_fla, 'VIN', c_rec, c_suc, c_lan, 'BRK', c_fla, c_suc, 'VIN', c_rec, c_lan, c_suc, 'BRK', c_fla, c_rec)) returning id into f_dia;
  insert into public.mus_formatos (veiculo_id, nome, cor, posicoes) values (p_veiculo, 'Noite', 2, jsonb_build_array('INF', c_rec, c_fla, 'VIN', c_suc, c_fla, 'BRK', c_rec, c_lan, c_fla, 'VIN', c_suc, c_rec, c_fla)) returning id into f_noite;
  insert into public.mus_formatos (veiculo_id, nome, cor, posicoes) values (p_veiculo, 'Madrugada', 0, jsonb_build_array(c_fla, c_rec, 'VIN', c_fla, c_suc, 'BRK', c_fla, c_rec, 'VIN', c_fla, c_suc, c_rec, c_fla)) returning id into f_madr;

  for d in 0..6 loop
    v_linha := '[]';
    for h in 0..23 loop
      v_linha := v_linha || to_jsonb(case when h <= 5 then f_madr when h >= 19 then f_noite else f_dia end);
    end loop;
    v_grade := v_grade || jsonb_build_array(v_linha);
  end loop;

  insert into public.mus_config (veiculo_id, grade, regras) values (p_veiculo, v_grade,
    '{"on":{"FAIXA":true,"STATUS":true,"INT_MUS":true,"INT_INT":true,"SIM":true,"GRUPO":true,"RITMO":true,"CAT":true,"PESO":true,"POS":true,"HORA":true,"LIM":true,"CUSTOM":true,"CATPOS":true},"interprete_min":60,"peso_dist":2,"custom":[]}')
  on conflict (veiculo_id) do nothing;
end;
$$;
revoke execute on function public.mus_iniciar(uuid) from public, anon;
grant execute on function public.mus_iniciar(uuid) to authenticated;

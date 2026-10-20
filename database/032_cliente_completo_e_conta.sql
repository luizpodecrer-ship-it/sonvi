-- SONVI · Console: cadastro completo do cliente (razão social, endereço, contato e e-mails de cobrança) e conta para receber
-- estruturada (banco pela busca, agência, conta, tipo, favorecido, tipo de chave Pix). Aprovado em 20/10/2026.
-- O e-mail de cobrança passa a ficar só no cliente; o contrato recebe uma cópia (os avisos leem console_contratos.email_cobranca).
-- Os dados bancários continuam saindo no e-mail pelo texto console_config.dados_bancarios, montado aqui a partir dos campos.

alter table public.organizacoes add column if not exists razao_social text not null default '';
alter table public.organizacoes add column if not exists cep text not null default '';
alter table public.organizacoes add column if not exists endereco text not null default '';
alter table public.organizacoes add column if not exists numero text not null default '';
alter table public.organizacoes add column if not exists complemento text not null default '';
alter table public.organizacoes add column if not exists bairro text not null default '';
alter table public.organizacoes add column if not exists responsavel_financeiro text not null default '';
alter table public.organizacoes add column if not exists telefone text not null default '';
alter table public.organizacoes add column if not exists emails_cobranca text not null default '';

update public.organizacoes o set emails_cobranca = k.email_cobranca
  from public.console_contratos k where k.organizacao_id = o.id and o.emails_cobranca = '' and k.email_cobranca <> '';

alter table public.console_config add column if not exists razao_social text not null default '';
alter table public.console_config add column if not exists banco_codigo text not null default '';
alter table public.console_config add column if not exists banco_nome text not null default '';
alter table public.console_config add column if not exists agencia text not null default '';
alter table public.console_config add column if not exists agencia_dv text not null default '';
alter table public.console_config add column if not exists conta text not null default '';
alter table public.console_config add column if not exists conta_dv text not null default '';
alter table public.console_config add column if not exists conta_tipo text not null default 'corrente' check (conta_tipo in ('corrente', 'poupanca', 'pagamento'));
alter table public.console_config add column if not exists favorecido_proprio boolean not null default true;
alter table public.console_config add column if not exists favorecido_nome text not null default '';
alter table public.console_config add column if not exists favorecido_doc text not null default '';
alter table public.console_config add column if not exists pix_tipo text not null default 'cnpj' check (pix_tipo in ('cnpj', 'cpf', 'email', 'celular', 'aleatoria'));

-- Cliente: só o que vier no pedido muda (Suspender manda só nome e situação)
create or replace function public.console_salvar_cliente(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare emails text;
begin
  perform public.console_exige(array['proprietario']);
  if coalesce(trim(p ->> 'nome'), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  if coalesce(p ->> 'situacao', '') not in ('teste', 'ativo', 'suspenso') then raise exception 'Situação inválida.'; end if;
  if p ? 'emails_cobranca' then
    select coalesce(string_agg(distinct lower(e), ', '), '') into emails
      from regexp_split_to_table(coalesce(p ->> 'emails_cobranca', ''), '[,;\s]+') e where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  end if;
  update public.organizacoes set nome = trim(p ->> 'nome'),
    cnpj = case when p ? 'cnpj' then coalesce(trim(p ->> 'cnpj'), '') else cnpj end,
    cidade = case when p ? 'cidade' then coalesce(trim(p ->> 'cidade'), '') else cidade end,
    razao_social = case when p ? 'razao_social' then coalesce(trim(p ->> 'razao_social'), '') else razao_social end,
    cep = case when p ? 'cep' then coalesce(trim(p ->> 'cep'), '') else cep end,
    endereco = case when p ? 'endereco' then coalesce(trim(p ->> 'endereco'), '') else endereco end,
    numero = case when p ? 'numero' then coalesce(trim(p ->> 'numero'), '') else numero end,
    complemento = case when p ? 'complemento' then coalesce(trim(p ->> 'complemento'), '') else complemento end,
    bairro = case when p ? 'bairro' then coalesce(trim(p ->> 'bairro'), '') else bairro end,
    responsavel_financeiro = case when p ? 'responsavel_financeiro' then coalesce(trim(p ->> 'responsavel_financeiro'), '') else responsavel_financeiro end,
    telefone = case when p ? 'telefone' then coalesce(trim(p ->> 'telefone'), '') else telefone end,
    emails_cobranca = case when p ? 'emails_cobranca' then emails else emails_cobranca end,
    logo = case when p ? 'logo' then nullif(p ->> 'logo', '') else logo end,
    situacao = p ->> 'situacao', teste_ate = case when p ->> 'situacao' = 'teste' then nullif(p ->> 'teste_ate', '')::date end
  where id = p_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if p ? 'emails_cobranca' then update public.console_contratos set email_cobranca = emails where organizacao_id = p_id; end if;
  if p ? 'logo' and nullif(p ->> 'logo', '') is not null then
    update public.empresa_comercial set logo = p ->> 'logo' where organizacao_id = p_id and logo is null;
  end if;
end;
$$;

-- Contrato: o e-mail de cobrança vem do cadastro do cliente
create or replace function public.contrato_email_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(nullif(o.emails_cobranca, ''), new.email_cobranca) into new.email_cobranca from public.organizacoes o where o.id = new.organizacao_id;
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'contrato_email_do_cliente') then
    create trigger contrato_email_do_cliente before insert or update on public.console_contratos for each row execute function public.contrato_email_do_cliente();
  end if;
end $$;

-- Quem cobra e conta: o texto dos dados bancários do e-mail é montado dos campos
create or replace function public.console_salvar_config(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.console_config; tipo text;
begin
  perform public.console_exige(array['proprietario']);
  update public.console_config set empresa = coalesce(nullif(trim(p ->> 'empresa'), ''), empresa), cnpj = coalesce(trim(p ->> 'cnpj'), cnpj),
    razao_social = coalesce(trim(p ->> 'razao_social'), razao_social),
    pix_chave = coalesce(trim(p ->> 'pix_chave'), pix_chave), pix_tipo = coalesce(nullif(p ->> 'pix_tipo', ''), pix_tipo),
    email_resposta = lower(coalesce(trim(p ->> 'email_resposta'), email_resposta)),
    banco_codigo = coalesce(trim(p ->> 'banco_codigo'), banco_codigo), banco_nome = coalesce(trim(p ->> 'banco_nome'), banco_nome),
    agencia = coalesce(trim(p ->> 'agencia'), agencia), agencia_dv = coalesce(trim(p ->> 'agencia_dv'), agencia_dv),
    conta = coalesce(trim(p ->> 'conta'), conta), conta_dv = coalesce(trim(p ->> 'conta_dv'), conta_dv),
    conta_tipo = coalesce(nullif(p ->> 'conta_tipo', ''), conta_tipo),
    favorecido_proprio = coalesce((p ->> 'favorecido_proprio')::boolean, favorecido_proprio),
    favorecido_nome = coalesce(trim(p ->> 'favorecido_nome'), favorecido_nome), favorecido_doc = coalesce(trim(p ->> 'favorecido_doc'), favorecido_doc),
    multa = coalesce((p ->> 'multa')::numeric, multa), juros = coalesce((p ->> 'juros')::numeric, juros),
    avisos_ligados = coalesce((p ->> 'avisos_ligados')::boolean, avisos_ligados),
    aviso_dias_antes = coalesce((p ->> 'aviso_dias_antes')::int, aviso_dias_antes), aviso_dias_depois = coalesce((p ->> 'aviso_dias_depois')::int, aviso_dias_depois),
    atualizado_em = now() where id = 1 returning * into c;
  tipo := case c.conta_tipo when 'poupanca' then 'Conta poupança' when 'pagamento' then 'Conta de pagamento' else 'Conta corrente' end;
  update public.console_config set dados_bancarios = case when c.banco_codigo = '' or c.conta = '' then '' else
    'Transferência: ' || c.banco_nome || ' (' || c.banco_codigo || ')' || chr(10) ||
    'Agência ' || c.agencia || case when c.agencia_dv <> '' then '-' || c.agencia_dv else '' end || ' · ' || tipo || ' ' || c.conta || case when c.conta_dv <> '' then '-' || c.conta_dv else '' end || chr(10) ||
    'Favorecido: ' || case when c.favorecido_proprio then coalesce(nullif(c.razao_social, ''), c.empresa) || ' · CNPJ ' || c.cnpj
      else c.favorecido_nome || case when c.favorecido_doc <> '' then ' · ' || c.favorecido_doc else '' end end end
  where id = 1;
end;
$$;

-- console_dados: o cliente leva o cadastro completo em "dados"
do $$
declare def text;
begin
  def := pg_get_functiondef('public.console_dados()'::regprocedure);
  if position('''dados'', (select to_jsonb(o2)' in def) = 0 then
    def := replace(def, '''teste_ate'', o.teste_ate, ''criado_em'', o.criado_em,',
      '''teste_ate'', o.teste_ate, ''criado_em'', o.criado_em, ''dados'', (select to_jsonb(o2) - ''logo'' from public.organizacoes o2 where o2.id = o.id),');
    execute def;
  end if;
end $$;

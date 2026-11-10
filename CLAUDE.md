# SONVI

Sistema de gestão comercial para grupos de mídia (rádios e mídia exterior): propostas, PI, OPEC, vendas, comissões e financeiro. Cliente atual: **Head 14** (empresa comercial; diretor-geral Sávio). Dono do produto: **Luiz** (equipe SONVI, Astravox).

## Onde procurar (leia só o que precisar)

- **`MAPA.md`**: cada arquivo do app com telas, ações, funções `S.`, chamadas ao banco e funções de borda; tabelas, funções e gatilhos do banco com a migração onde estão. Gerado por `python3 ferramentas/mapa.py` (rode de novo depois de mudanças grandes e publique junto).
- **`docs/HISTORICO.md`**: o detalhe de cada assunto (decisões, datas, nomes de função e de estilo, layouts aprovados). Antes de mexer num assunto, leia a seção dele com Grep pelo título: Usuários/Nuvem · Clientes do SONVI e Console · Ambiente de teste e consolidação · Head 14 e Dashboard Gestão · Dashboard do veículo · Produtos (rádio, patrocínios, mídia exterior, projetos especiais) · Combos · Acesso do consultor · Regras do produto (PI, grade, cadastros, exclusões, e-mail de faturamento, mídias) · Visual · Follow-up · Tabela de preços/Digital · Propostas e PI automático · OPEC · Empresa comercial e Colaboradores · Parte da Head 14, comissão e metas · Mudanças de 29/10 (agências, data, Dashboard Gestão, metas) · Vendas e comissões · Suporte do grupo · Consulta → Editar → Salvar · Importar PI · Limpeza das mídias · OPEC pelo link · Venda pelo líquido · Venda lançada · PI enviado é venda · PI impresso · Financeiro · Relatórios do veículo · Sonvi Music · Site.
- Fato novo: o detalhe vai para a seção certa do `docs/HISTORICO.md`; aqui só entra o que for regra geral. Mantenha este arquivo curto.

## Como trabalhar com o Luiz

- Ele não é desenvolvedor: respostas em português do Brasil, sem jargão, com passo a passo quando ele precisar fazer algo.
- Mudança de tela ou de fluxo: mostrar a proposta ou o modelo (artifact) antes de implementar e esperar o "aprovado". Correção de erro pode ir direto.
- Ao terminar: confirmação curta do que mudou, como usar e o que ele precisa conferir. Apontar problemas vizinhos que notar.

## Código

- HTML, CSS e JavaScript puros, sem framework e sem build. Scripts clássicos carregados em ordem por `app/index.html`; tudo no objeto global `SONVI` (apelido `S`). Cada módulo (`app/js/*.js`) registra telas em `S.views` e ações em `S.actions` (botões com `data-act`).
- Regras de negócio em funções puras (`pi-regras.js`, `metas.js`, `musical-regras.js`), separadas da tela. Interface, nomes, colunas e comentários em português do Brasil.
- Cuidado com comentário `//` no meio de uma linha longa ou dentro de `${}`: ele corta o resto da linha. Use `/* */`.
- Visual: só as variáveis e classes de `app/css/sonvi.css` (nada de cores soltas nos módulos); ícones por `S.svg(nome)`, selo do veículo por `S.vav(v)`. Azul `#0055FF`, títulos em Sora, textos em Manrope, cartões de 12 px, botões "Swap Out" (`.btn`, `.pri`, `.danger`). Claro e escuro automáticos. Tudo responsivo (375 px, 1366–1440 px, 1920 px; no celular, tabelas viram cartões). Acessibilidade WCAG AA: nada de `confirm()` (use `S.confirmar`), erros com `S.erroNoCampo`, títulos de cartão em `<h2>`. Detalhe em "Visual" no histórico.
- **Gráficos e números sempre no padrão visual do SONVI** (regra do Luiz, 07/11/2026; vale para toda tela nova ou refeita): barras, colunas e anéis entram com mola e em cascata por keyframes que continuam entre redesenhos (atraso negativo `--t`, como `entrada` em vendas.js; nunca transição que pula para o fim quando a tela redesenha); números rolam com `S.roloFixo`; dica de vidro ao passar o mouse; grade com valores; brilho no item em destaque; cartões que sobem no hover; `prefers-reduced-motion` respeitado. Antes de publicar, conferir a animação quadro a quadro no Playwright (capturas em 150, 500, 900 e 1800 ms).
- Janelas: `S.dialog`/`S.form` (registro existente abre para consulta → Editar → Salvar); aviso de salvo `S.salvo`; avisos rápidos `S.toast`; gravações por `S.run`/`S.salvar`/`S.excluir` (dados.js).
- Lista na tela que pode passar de 15 itens: paginação padrão `S.paginar(chave, lista, palavra, filtros)` (core.js; 15 por página, bolinha que desliza, estilos `.cl-pag*`). Já usam: Clientes, Agências (veículo e Administração), Propostas, PIs (cada grupo).
- Lista que pode passar de 1.000 linhas: sempre `S.todos(busca)`, nunca `S.q` direto (o Supabase corta em 1.000 sem avisar).
- Nada de conteúdo em `localStorage` (exceções: sessão de login, veículo aberto `sonvi-radio-<usuário>`, menu recolhido, nome da OPEC na página pública, sessão do Spotify).

## Banco (Supabase)

- Produção `ccfsyhniwwspnpnpkjzf`; **teste** = branch `epesfnctzawxuerezvoa`. Toda mudança de tabela, função ou política vira arquivo novo numerado em `database/` (o próximo é o `085`), roda **primeiro no teste**, é conferida e só então vai para a produção. Nunca SQL à mão sem virar arquivo.
- A ferramenta recusa migração com `delete` literal: escreva `execute 'dele' || 'te from …'`.
- Regras do banco se testam em bloco `do $$ … raise exception 'RES …' $$` (nada fica gravado).
- Quem protege os dados é o banco (RLS por organização, veículo e perfil). Perfis: diretor (todos os veículos da empresa), gerente (sem uso na Head 14), consultor, opec, financeiro; equipe SONVI (`plataforma_admins`) entra só como suporte. Cada cliente do SONVI é uma organização; nada de uma aparece na outra.
- Sem login (`anon`) só executa as funções das páginas públicas; função nova que precise abrir sem login recebe `grant execute … to anon` de propósito.
- O PI nasce por `criar_pi`, vai à OPEC por `enviar_pi_opec`, é cancelado por `cancelar_pi` e muda de status pelas funções do link da OPEC (`mudar_status_pi` para o resto). Nunca update direto em `status`.
- O banco recalcula total, comissão, líquido e inserções do PI (`pi_calculo`, gatilho `pis_calcula`). **Mudou a conta em `S.calc`/`S.itemCalc`, mude também `pi_calculo`** (nova migração).
- Só a chave pública (publishable) no código; nunca a `service_role`.
- Funções de borda (`supabase/functions/<nome>/`): publicar com o arquivo nomeado `source/index.ts`, `entrypoint_path` = `source/index.ts`, `verify_jwt` = false (a função confere o login). E-mail pelo Resend (segredo `RESEND_API_KEY`), domínio sonvi.com.br.

## Regras de negócio que valem sempre

- Tudo é por veículo: clientes, PIs, numeração (`PI VERDE 0001`), OPEC e financeiro. Agências são cadastro do grupo (cópia em cada veículo). Proposta sai com a marca da empresa comercial; o PI escolhe a marca (empresa comercial ou veículo, `dados.marca`).
- Caminho do PI (05/11/2026): Rascunho → Enviado para a OPEC = **já é venda** (gatilho grava `vendas_lancadas`, valor do mês proporcional). A OPEC abrir o link só acende o selo verde "OPEC abriu" (`S.seloOpec`). PI enviado não se edita: a OPEC devolve pelo link (volta a Rascunho) ou o diretor/consultor do PI cancela com motivo (`cancelar_pi` + e-mail à OPEC pela `opec_link`, ação `cancelado`). O SONVI não acompanha faturamento nem pagamento.
- **Venda sempre pelo valor líquido** (bruto − comissão da agência) e **no mês em que vai ao ar** (`S.valorNoMes`, `S.fatiaMes`). Parte da Head 14 = 20% do líquido (`pis.repasse_pct`). Comissão do consultor = percentual cadastrado dele × líquido do PI enviado, no mês em que vai ao ar (`comissao_parcelas_vivas` lê `vendas_lancadas`).
- Mídia exterior: preço no próprio produto (faces/variações e produção). Front light, empena e outdoor são **por mês**: valor do mês × dias marcados ÷ dias do mês (`pormes`); LED e DOOH por inserção; produção cobrada uma vez.
- **Nada chega como "SONVI"** a clientes, OPEC e financeiro (e-mail, WhatsApp, páginas públicas, PDFs): remetente "<consultor> · <veículo>"; no acesso de suporte nunca o nome de quem está no suporte (`S.quemAssina`). Só o endereço sonvi.com.br e os e-mails @sonvi.com.br ficam. O Console (cobrança e suporte da SONVI aos clientes) pode dizer SONVI.
- Sonvi Music está parado desde 29/10/2026 (arquivos e tabelas continuam, sem link).

## Publicar

- Envio ao GitHub publica sozinho no Netlify. A cada publicação, troque o número `?v=` dos arquivos em `app/index.html` (data-hora). Commit com as linhas de autoria pedidas pela sessão.
- A Head 14 entra por `sonvi.com.br/head14`; páginas públicas: `pi.html` (OPEC), `proposta.html`, `confirmar.html`, `extrato.html`.

## Testar

- Telas: Playwright com `S.me`/`S.db` preenchidos em memória (sem login real); servidor local em `app/` (`python3 -m http.server 8765`, rodando em segundo plano). Conferir no computador (1440 px) e no celular (390 px).
- Nunca criar contas nem entrar com senha durante testes.

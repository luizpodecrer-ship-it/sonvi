// SONVI · clientes (anunciantes) e agências do veículo selecionado.
// Cada rádio tem o próprio cadastro. Para não digitar de novo, o cadastro pode nascer em várias rádios de uma vez,
// ser levado depois (menu ⋯) ou trazido de outra rádio pelo CNPJ; ao alterar, o sistema pergunta se atualiza as cópias.
// As cópias ficam ligadas por cadastro_id (e pelo CNPJ/CPF, documento_num). Regras no banco: database/015_cadastro_em_varias_radios.sql.
(() => {
  const { esc } = S;
  const SIT = { prospect:['Prospect', 'orange'], ativo:['Ativo', 'green'], inativo:['Inativo', 'gray'] };
  // Dados cadastrais: são os que vão iguais para as outras rádios (consultor, situação, agência, comissão e observações não)
  const CADASTRAIS = [['nome', 'Nome'], ['pessoa', 'Tipo'], ['razao_social', 'Razão social'], ['documento', 'CNPJ / CPF'], ['inscricao_estadual', 'Inscrição estadual'],
    ['cep', 'CEP'], ['endereco', 'Endereço'], ['cidade', 'Cidade / UF'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['email_faturamento', 'E-mail de faturamento'],
    ['contato_decide', 'Contato que decide'], ['contato_assina', 'Contato que assina'], ['segmento', 'Segmento']];
  let aba = 'cliente';
  // Estado do formulário aberto (rádios de destino, agências delas, cadastro trazido de outra rádio)
  const cad = { destinos:[], agencias:[], trazido:null, achados:[], ignorar:'' };

  // ---------- rádios ----------
  const perfilEm = v => S.me.diretor ? 'diretor' : (S.db.vinculos.find(x => x.usuario_id === S.me.id && x.veiculo_id === v) || {}).perfil || null;
  // Outras rádios em que a pessoa pode cadastrar (o consultor só nas que ele atende)
  const radiosDestino = () => S.db.veiculos.filter(v => v.id !== S.ui.vehicleId && ['diretor', 'gerente', 'consultor'].includes(perfilEm(v.id)));
  const consultoresDe = v => S.responsaveis(v);
  const podeAlterarLa = r => { const pf = perfilEm(r.veiculo_id); return pf === 'diretor' || pf === 'gerente' || (pf === 'consultor' && (r.tipo === 'agencia' || r.consultor_id === S.me.id)); };
  const nomeRadio = id => (S.veh(id) || {}).nome || 'outro veículo';

  // O mesmo cadastro nas outras rádios (só aparecem os que o perfil pode ver)
  const grupoDe = p => p.cadastro_id || p.id;
  const buscarIrmaos = async (tipo, grupo, num) => {
    const ou = [grupo && `cadastro_id.eq.${grupo}`, grupo && `id.eq.${grupo}`, num && `documento_num.eq.${num}`].filter(Boolean);
    if (!ou.length) return [];
    return S.q(S.sb.from('pessoas').select('*').eq('tipo', tipo).neq('veiculo_id', S.ui.vehicleId).or(ou.join(',')));
  };
  const agenciasDe = async ids => ids.length ? S.q(S.sb.from('pessoas').select('id,veiculo_id,nome,cadastro_id,documento_num').eq('tipo', 'agencia').in('veiculo_id', ids)) : [];
  const soNumeros = s => String(s || '').replace(/\D/g, '');

  // ---------- bloco "Cadastrar também em" (formulário novo e "Levar para outro veículo") ----------
  const agenciaNaRadio = (v, agId) => {
    const a = S.pessoa(agId); if (!a) return null;
    const g = grupoDe(a), n = soNumeros(a.documento);
    return cad.agencias.find(x => x.veiculo_id === v && (x.cadastro_id === g || x.id === g || (n && x.documento_num === n))) || null;
  };
  const situacaoAgencia = (v, agId) => {
    const a = S.pessoa(agId);
    if (!a) return `<span class="cad-ag ok">${S.svg('check')}<span>Sem agência</span></span>`;
    const la = agenciaNaRadio(v, agId);
    return la ? `<span class="cad-ag ok">${S.svg('check')}<span><b>${esc(a.nome)}</b> já está em ${esc(nomeRadio(v))}: o cliente vai ligado a ela.</span></span>`
      : `<span class="cad-ag falta"><span><b>${esc(a.nome)}</b> ainda não está em ${esc(nomeRadio(v))}.</span><label class="chk"><input type="checkbox" name="x_ag_${v}" checked>Cadastrar a agência também</label></span>`;
  };
  // Veículos numa linha só (08/11/2026, pedido do Luiz: marcador redondo "radio"); consultor e agência de cada veículo marcado aparecem embaixo.
  const blocoRadios = ({ tipo, consultor, agencia, ja = new Set(), marcar = false }) => {
    const chips = cad.destinos.map(v => ja.has(v.id)
      ? `<span class="radio cad-radio ja" title="Já cadastrado em ${esc(v.nome)}">${S.svg('check')}${S.vav(v)}<span class="lbl">${esc(v.nome)}</span></span>`
      : `<label class="radio cad-radio"><input type="checkbox" name="x_rad_${v.id}"${marcar ? ' checked' : ''}><span class="dot"></span>${S.vav(v)}<span class="lbl">${esc(v.nome)}</span></label>`).join('');
    const dets = tipo !== 'cliente' ? '' : cad.destinos.filter(v => !ja.has(v.id)).map(v => {
      const pf = perfilEm(v.id), cons = consultoresDe(v.id);
      const padrao = cons.some(u => u.id === consultor) ? consultor : '';
      const campoCons = pf === 'consultor'
        ? `<div class="f">Consultor<span class="cad-fixo">${esc(S.me.nome || S.me.email)} (você)</span></div>`
        : `<label class="f">Consultor<select name="x_cons_${v.id}"><option value="">Sem consultor</option>${cons.map(u => `<option value="${u.id}"${u.id === padrao ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>`;
      return `<div class="cad-det" data-cad-det="${v.id}"${marcar ? '' : ' hidden'}><div class="cad-det-t">${S.vav(v)}<b>${esc(v.nome)}</b></div>${campoCons}<div class="f">Agência<div data-cad-ag="${v.id}">${situacaoAgencia(v.id, agencia)}</div></div></div>`;
    }).join('');
    return `<div class="cad-radios"><div class="cad-linha">${chips}</div>${dets ? `<div class="cad-dets">${dets}</div>` : ''}</div>`;
  };
  const destinosMarcados = f => cad.destinos.filter(v => f['x_rad_' + v.id] === 'on')
    .map(v => ({ veiculo_id:v.id, consultor_id:f['x_cons_' + v.id] || null, criar_agencia:f['x_ag_' + v.id] === 'on' }));
  const levar = async (id, destinos) => {
    const r = await S.q(S.sb.rpc('levar_pessoa', { p_origem:id, p_destinos:destinos }));
    return r || { criados:[], ja:[] };
  };
  const resumo = r => { const c = (r.criados || []).map(nomeRadio), j = (r.ja || []).map(nomeRadio);
    return [c.length && 'cadastrado também na ' + c.join(' e na '), j.length && 'já existia na ' + j.join(' e na ')].filter(Boolean).join('; '); };

  // ---------- lista enxuta (08/11/2026, pedido do Luiz: "são apenas cadastros", menos informação; modelo "Cadastros enxutos") ----------
  // Uma linha por cliente: iniciais, nome com a cidade embaixo, consultor e situação. Filtros: busca, situação em pílulas e consultor.
  // O resto (CNPJ, contatos, endereço) fica no cadastro, que abre ao clicar. Paginação padrão (S.paginar). Estilos .cx-* em sonvi.css.
  const cf = { sit:'todos', cons:'' };
  const inicioCl = {};
  const entradaCl = vk => { const agora = performance.now(); if (!(vk in inicioCl)) inicioCl[vk] = agora; const t = agora - inicioCl[vk]; return t > 2000 ? '' : ` cx-entra" style="--t:-${Math.round(t)}ms`; };

  S.views.clientes = id => {
    // Agências saíram de dentro do veículo (29/10/2026): o cadastro é único do grupo, no Dashboard Gestão (agencias.js)
    aba = 'cliente'; if (id === 'agencias') queueMicrotask(() => S.me.diretor ? S.admAbrir('agencias') : S.go('/agencias-v'));
    const q = S.ui.q.toLowerCase(), qn = q.replace(/\D/g, ''), todas = S.pessoas('cliente');
    const gestor = S.pode('diretor', 'gerente'), podeCriar = S.pode('diretor', 'gerente', 'consultor'), outras = radiosDestino().length > 0;
    const resp = !gestor ? [] : [...S.responsaveis(), ...[...new Set(todas.map(p => p.consultor_id).filter(Boolean))].map(id => ({ id, nome:S.usuario(id) || 'Responsável' }))]
      .filter((u, i, l) => l.findIndex(x => x.id === u.id) === i && todas.some(p => p.consultor_id === u.id));
    if (cf.cons && !resp.some(u => u.id === cf.cons)) cf.cons = '';
    const nomeCons = p => p.consultor_id ? (S.usuario(p.consultor_id) || '') : '';
    const busca = p => (!cf.cons || p.consultor_id === cf.cons) && (!q || [p.nome, p.razao_social, p.cidade, p.segmento].join(' ').toLowerCase().includes(q) || (qn.length > 2 && String(p.documento || '').replace(/\D/g, '').includes(qn)));
    const FIL = [['todos', 'Todos'], ['ativo', 'Ativos'], ['prospect', 'Prospects'], ['inativo', 'Inativos']];
    const base = todas.filter(busca), lista = base.filter(p => cf.sit === 'todos' || p.situacao === cf.sit).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    const pg = S.paginar(`cli|${S.ui.vehicleId}`, lista, lista.length === 1 ? 'cliente' : 'clientes', [q, cf.sit, cf.cons].join('|'));
    const ent = entradaCl(`cl|${S.ui.vehicleId}|${pg.de}|${cf.sit}|${cf.cons}`);
    const tres = p => outras && podeAlterarLa(p) ? `<button class="btn tres" data-act="pesMenu" data-id="${p.id}" aria-label="Opções de ${esc(p.nome)}">${S.svg('mais3')}</button>` : '';
    const sitPill = p => `<span class="pill cl-s-${esc(p.situacao)}">${esc((SIT[p.situacao] || [p.situacao])[0])}</span>`;
    const linha = (p, i) => `<div class="cx-l" role="row" data-act="pesEditar" data-id="${p.id}" tabindex="0" style="--d:${Math.min(i, 14) * 30}ms">
        <span class="cx-nome" role="cell"><span class="cx-av" aria-hidden="true">${esc(S.iniciais(p.nome))}</span><span><b title="${esc(p.nome)}">${esc(p.nome)}</b><small>${esc(p.cidade) || 'Cidade não informada'}</small></span></span>
        ${resp.length > 1 || !S.celular ? `<span class="cx-cons" role="cell">${esc(nomeCons(p).split(' ')[0]) || '<span class="muted">—</span>'}</span>` : ''}
        <span role="cell" class="cx-sit">${sitPill(p)}</span><span role="cell" class="cx-ac">${tres(p)}<span class="cx-ir" aria-hidden="true">${S.svg('seta', 16)}</span></span></div>`;
    const filtrado = q || cf.sit !== 'todos' || cf.cons;
    const vazio = `<div class="empty"><b>Nenhum cliente${filtrado ? ' com esse filtro' : ''}</b>${filtrado ? 'Tire o filtro ou experimente outra busca.' : S.pode('consultor') ? 'Aqui aparecem os clientes da sua carteira.' : podeCriar ? 'Cadastre o primeiro cliente pelo botão "Novo cliente".' : 'Nenhum cliente cadastrado ainda.'}</div>`;
    const barra = `<div class="cx-barra"><label class="fin-busca cx-busca">${S.svg('busca')}<input value="${esc(S.ui.q)}" data-ui="q" placeholder="Buscar cliente, CNPJ ou cidade" aria-label="Buscar clientes"></label>
      <div class="cx-fil" role="group" aria-label="Situação">${FIL.map(([k, n]) => { const c = k === 'todos' ? base.length : base.filter(p => p.situacao === k).length; return k !== 'todos' && !c ? '' : `<button type="button" data-act="cliFil" data-v="${k}" aria-pressed="${cf.sit === k}">${n} <span>${c}</span></button>`; }).join('')}</div>
      ${resp.length > 1 ? `<select data-clif="cons" class="cx-sel" aria-label="Consultor"><option value="">Todos os consultores</option>${resp.map(u => `<option value="${u.id}"${cf.cons === u.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>` : ''}</div>`;
    const card = `<section class="card cx" aria-label="Clientes">${barra}
      ${!lista.length ? vazio : `<div class="cx-ls${ent}" role="table" aria-label="Clientes">${pg.itens.map(linha).join('')}</div>`}
      ${pg.html}</section>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Clientes`, actions:podeCriar ? `<button class="btn pri" data-act="pesNovo">${S.svg('mais')}Novo cliente</button>` : '', body:card };
  };
  S.actions.cliFil = d => { if (cf.sit === d.v) return; cf.sit = d.v; S.render(); };
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-clif]'); if (!s) return; cf[s.dataset.clif] = s.value; S.render(); });
  document.addEventListener('keydown', e => { const l = e.target.closest && e.target.closest('.cx-l[data-act="pesEditar"]'); if (l && (e.key === 'Enter' || e.key === ' ') && e.target === l) { e.preventDefault(); S.actions.pesEditar({ id:l.dataset.id }); } });

  // ---------- formulário ----------
  async function formulario(p) {
    const cliente = (p.tipo || aba) === 'cliente', gestor = S.pode('diretor', 'gerente'), novo = !p.id, tipo = cliente ? 'cliente' : 'agencia';
    Object.assign(cad, { destinos:novo ? radiosDestino() : [], agencias:[], trazido:null, achados:[], ignorar:'' });
    if (novo && cliente && cad.destinos.length) { try { cad.agencias = await agenciasDe(cad.destinos.map(v => v.id)); } catch (e) { console.error(e); } }
    const buscar = (id, label) => ({ html:`<div style="display:flex;align-items:flex-end"><button type="button" class="btn sm" data-act="${id}">${label}</button></div>` });
    const bloco = novo && cad.destinos.length ? [{ html:`<div class="cad-bloco" style="grid-column:1/-1"><div class="cad-hd"><b>Cadastrar também em</b><small>${S.pode('consultor') ? 'Aparecem os veículos que você atende' : 'Aparecem os veículos em que você trabalha'}</small></div>
        ${blocoRadios({ tipo, consultor:p.consultor_id, agencia:p.agencia_id })}
        <small class="muted">Nome, CNPJ, endereço e contatos vão iguais. ${cliente ? 'A situação vai igual; consultor, PIs e financeiro ficam separados em cada veículo.' : 'Os PIs e o financeiro ficam separados em cada veículo.'}</small></div>` }] : [];
    // Formulário largo em seções (08/11/2026, pedido do Luiz, modelo "Cadastro de cliente"): 4 colunas no computador, 1 no celular;
    // Excluir, Descartar e Salvar numa linha só, no rodapé.
    const podeExcluir = !novo && (gestor || (S.pode('consultor') && (!cliente || p.consultor_id === S.me.id)));
    const campos = [
      { sec:'Empresa' },
      { k:'nome', label:cliente ? 'Nome fantasia ou nome' : 'Nome da agência', req:true, ph:cliente ? 'Ex.: Supermercado Três Irmãos' : 'Ex.: Agência Ponto Alto', span:2 },
      { k:'pessoa', label:'Tipo', type:'select', options:[['pj', 'Pessoa jurídica'], ['pf', 'Pessoa física']] },
      cliente ? { k:'situacao', label:'Situação', type:'select', options:Object.entries(SIT).map(([k, v]) => [k, v[0]]) } : { k:'comissao', label:'Comissão padrão (%)' },
      { k:'documento', label:'CNPJ / CPF' }, buscar('pesCnpj', 'Preencher pelo CNPJ'), { k:'razao_social', label:'Razão social', span:2 },
      ...(novo ? [{ html:'<div id="cadAchado" style="grid-column:1/-1" hidden></div>' }] : []),
      { k:'inscricao_estadual', label:'Inscrição estadual' }, ...(cliente ? [{ k:'segmento', label:'Segmento' }] : []),
      { sec:'Endereço' },
      { k:'cep', label:'CEP' }, { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço', span:2 },
      { sec:'Contato' },
      { k:'telefone', label:'Telefone' }, { k:'whatsapp', label:'WhatsApp' }, { k:'email', label:'E-mail', type:'email' },
      { k:'email_faturamento', label:'E-mail de faturamento', type:'email', ph:'financeiro@empresa.com.br' },
      ...(cliente ? [
        { sec:'Comercial' },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Sem agência'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        ...(gestor ? [{ k:'consultor_id', label:'Consultor responsável', type:'select', options:[['', 'Sem consultor'], ...S.responsaveis().map(u => [u.id, u.nome]), ...(p.consultor_id && !S.responsaveis().some(u => u.id === p.consultor_id) ? [[p.consultor_id, (S.usuario(p.consultor_id) || 'Responsável atual') + ' (sem acesso a este veículo)']] : [])] }] : []),
        { k:'contato_decide', label:'Contato que decide' }, { k:'contato_assina', label:'Contato que assina' }] : []),
      { k:'observacoes', label:'Observações', type:'textarea' },
      ...bloco];
    S.form(novo ? (cliente ? 'Novo cliente' : 'Nova agência') : esc(p.nome), campos, p, v => salvar(p, v, { cliente, gestor, novo, tipo }), 'Salvar',
      { largo:true, rodapeEsq:podeExcluir ? `<button class="btn danger" value="excluir" formnovalidate aria-label="Excluir cadastro" title="Excluir cadastro">${S.svg('lixo')}<span>Excluir cadastro</span></button>` : '' });
    const d = document.getElementById('dlg'), ok = d.onclose;
    d.onclose = async () => { if (d.returnValue === 'excluir') excluirPessoa(p, cliente); else ok(); };
    contarRadios();
  }

  // Excluir cadastro. Cliente com propostas, PIs ou financeiro: só o diretor, por conta e risco dele (decidido em 26/10/2026,
  // database/048): a janela mostra o que vai junto e pede o nome digitado; excluir_cliente_completo apaga tudo de uma vez.
  async function excluirPessoa(p, cliente) {
    // Consultor (decidido em 27/10/2026, database/052): exclui o que é dele pelas funções do banco (não pode apagar direto na tabela)
    const consultor = !S.me.diretor && S.pode('consultor'), dono = cliente ? p.consultor_id === S.me.id : true;
    const simples = async () => { if (!await S.confirmar('Excluir este cadastro?', { ok:'Excluir cadastro', perigo:true })) return;
      if (consultor) S.run(async () => { await S.q(S.sb.rpc(cliente ? 'excluir_cliente_completo' : 'excluir_agencia_completa', { p_pessoa:p.id, p_nome:p.nome })); await S.carregarVeiculo(); }, 'Cadastro excluído');
      else S.run(() => S.excluir('pessoas', p.id), 'Cadastro excluído'); };
    const comTudo = S.me.diretor || (consultor && dono);
    if (consultor && !dono) return S.toast('Este cliente é de outro consultor. Só o diretor pode excluir.');
    if (!cliente) {
      if (!comTudo) return simples();
      // Diretor e consultor: agência com PIs ou propostas também sai; eles ficam como venda direta (database/050 e 052)
      let v; try { v = await S.q(S.sb.rpc('vinculos_da_agencia', { p_pessoa:p.id })); } catch (e) { return S.toast(S.erro(e)); }
      if (!(v.pis || v.propostas)) return simples();
      return S.excluirDigitando({ titulo:`Excluir ${esc(p.nome)}?`,
        itens:[v.pis && `${v.pis} PI${v.pis === 1 ? '' : 's'} passa${v.pis === 1 ? '' : 'm'} a ser venda direta (sem agência)`, v.propostas && `${v.propostas} proposta${v.propostas === 1 ? '' : 's'} também`, v.clientes && `${v.clientes} cliente${v.clientes === 1 ? '' : 's'} fica${v.clientes === 1 ? '' : 'm'} sem agência`].filter(Boolean),
        aviso:'A comissão e a instrução de faturamento desses PIs deixam de considerar a agência. Fica 30 dias na Lixeira, onde o diretor pode restaurar.',
        rotulo:'Para confirmar, digite o nome da agência', dica:p.nome, confere:t => t.trim().toLowerCase() === String(p.nome).trim().toLowerCase(), botao:'Excluir agência',
        onOk:f => S.run(async () => { await S.q(S.sb.rpc('excluir_agencia_completa', { p_pessoa:p.id, p_nome:f.ex_conf })); await S.carregarVeiculo(); }, 'Agência excluída') });
    }
    if (!comTudo) {
      if ((S.db.pis || []).some(x => x.cliente_id === p.id) || (S.db.propostas || []).some(x => x.cliente_id === p.id))
        return S.toast('Este cliente tem propostas ou PIs. Só o diretor ou o consultor dele pode excluir.');
      return simples();
    }
    let v; try { v = await S.q(S.sb.rpc('vinculos_do_cliente', { p_pessoa:p.id })); } catch (e) { return S.toast(S.erro(e)); }
    if (!(v.propostas || v.pis || v.parcelas || v.followups)) return simples();
    const n = (q, um, varios) => `${q} ${q === 1 ? um : varios}`, itens = [
      v.propostas && n(v.propostas, 'proposta', 'propostas'),
      v.pis && `${n(v.pis, 'PI', 'PIs')}${v.pis_ativos ? ` (${v.pis_ativos} já ${v.pis_ativos === 1 ? 'enviado' : 'enviados'} para a OPEC)` : ''}`,
      v.parcelas && `${n(v.parcelas, 'parcela', 'parcelas')} no financeiro${v.pagas ? `, ${v.pagas} já ${v.pagas === 1 ? 'paga' : 'pagas'} (${S.brl(v.valor_pago)})` : ''}`,
      v.followups && n(v.followups, 'follow-up', 'follow-ups')].filter(Boolean);
    S.dialog(`<h2>Excluir ${esc(p.nome)} com tudo?</h2>
      <p>Vai junto, em ${esc(S.veh().nome)}:</p>
      <ul class="lista-ex">${itens.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="note aviso" style="margin:0">Isso some do SONVI de vez: dashboards, relatórios, comissões e o caminho dos PIs nas OPECs mudam. Fica 30 dias na Lixeira, onde o diretor pode restaurar. Os cadastros deste cliente em outros veículos continuam.</p>
      <label class="f">Para confirmar, digite o nome do cliente<input name="ex_conf" autocomplete="off" required placeholder="${esc(p.nome)}"></label>
      <div class="row"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Voltar</button><button class="btn danger" value="ok">Excluir com tudo</button></div>`,
      f => S.run(async () => {
        await S.q(S.sb.rpc('excluir_cliente_completo', { p_pessoa:p.id, p_nome:f.ex_conf }));
        await S.carregarVeiculo();
      }, 'Cliente excluído com tudo o que era dele'));
    const campo = document.querySelector('#dlg [name="ex_conf"]'), confere = () => campo.setCustomValidity(campo.value.trim().toLowerCase() === String(p.nome).trim().toLowerCase() ? '' : `Digite o nome do cliente: ${p.nome}`);
    confere(); campo.addEventListener('input', confere);
  }

  async function salvar(p, v, { cliente, gestor, novo, tipo }) {
    const extras = {}; Object.keys(v).filter(k => k.startsWith('x_')).forEach(k => { extras[k] = v[k]; delete v[k]; });
    const row = Object.assign({}, v, { agencia_id:v.agencia_id || null });
    if (cliente) row.consultor_id = gestor ? (v.consultor_id || null) : (p.consultor_id || S.me.id); else { row.comissao = S.num(v.comissao); delete row.agencia_id; }
    if (p.id) row.id = p.id; else Object.assign(row, { veiculo_id:S.ui.vehicleId, tipo });
    if (novo && cad.trazido) row.cadastro_id = cad.trazido;
    const mudou = !novo ? CADASTRAIS.filter(([k]) => k in v && String(v[k] ?? '') !== String(p[k] ?? '')) : [];
    let irmaos = [], aviso = '';
    const ok = await S.run(async () => {
      // As cópias nas outras rádios são procuradas antes de gravar (o CNPJ pode estar mudando)
      if (mudou.length) { try { irmaos = (await buscarIrmaos(tipo, grupoDe(p), soNumeros(p.documento))).filter(podeAlterarLa); } catch (e) { console.error(e); } }
      const r = await S.salvar('pessoas', row);
      const destinos = novo ? destinosMarcados(extras) : [];
      if (destinos.length) { const res = await levar(r.id, destinos); const t = resumo(res); if (t) aviso = t;
        const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', r.id).single()); Object.assign(r, atual); }
    }, null);
    if (!ok) return;
    S.salvo(`${tipo === 'agencia' ? 'Agência' : 'Cliente'} ${novo ? 'cadastrad' : 'salv'}${tipo === 'agencia' ? 'a' : 'o'}`, { sub:(row.nome || p.nome || '') + (aviso ? ' · ' + aviso : '') });
    if (irmaos.length) perguntarAtualizar(p, mudou, irmaos);
  }

  // Ao alterar: pergunta se leva os dados cadastrais para as outras rádios
  function perguntarAtualizar(velho, mudou, irmaos) {
    const p = S.pessoa(velho.id) || velho; // já com os dados novos
    const linhas = mudou.map(([k, n]) => `<div class="cad-mud"><span>${n}</span><span>${velho[k] ? `<s>${esc(velho[k])}</s>` : ''}<b>${esc(p[k] || '—')}</b></span></div>`).join('');
    const antes = p;
    const total = irmaos.length + 1;
    S.dialog(`<h2>Atualizar também nos outros veículos?</h2><p class="muted" style="margin-top:-8px">${esc(antes.nome)} também está ${irmaos.length > 1 ? 'nestes veículos' : 'neste veículo'}. Marque onde atualizar.</p>
      <div><small class="cad-rot">O QUE MUDOU</small>${linhas}</div>
      <div class="cad-radios"><div class="cad-linha">${irmaos.map(r => `<label class="radio cad-radio"><input type="checkbox" name="x_${r.id}" checked><span class="dot"></span>${S.vav(S.veh(r.veiculo_id))}<span class="lbl">${esc(nomeRadio(r.veiculo_id))}</span></label>`).join('')}</div></div>
      <small class="muted">Só os dados cadastrais vão para os outros veículos. Consultor, situação, agência e observações de cada veículo continuam como estão.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Só em ${esc(S.veh().nome)}</button><button class="btn pri" value="ok" data-cad-total>Atualizar nos ${total} veículos</button></div>`,
    f => { const ids = irmaos.filter(r => f['x_' + r.id] === 'on').map(r => r.id); if (!ids.length) return;
      S.run(async () => { const n = await S.q(S.sb.rpc('atualizar_cadastros_irmaos', { p_origem:p.id, p_ids:ids })); S.salvo(`Atualizado em ${n} outro${n === 1 ? '' : 's'} veículo${n === 1 ? '' : 's'}.`); }, null); });
  }

  // ---------- menu ⋯ › Levar para outro veículo ----------
  async function levarDialogo(p) {
    cad.destinos = radiosDestino(); cad.agencias = [];
    let irmaos = [];
    try { [irmaos, cad.agencias] = await Promise.all([buscarIrmaos(p.tipo, grupoDe(p), soNumeros(p.documento)), p.tipo === 'cliente' ? agenciasDe(cad.destinos.map(v => v.id)) : []]); }
    catch (e) { return S.toast(S.erro(e)); }
    const ja = new Set(irmaos.map(r => r.veiculo_id)), livres = cad.destinos.filter(v => !ja.has(v.id));
    S.dialog(`<h2>Levar para outro veículo</h2><p class="muted" style="margin-top:-8px">${esc(p.nome)} · ${esc(S.veh().nome)}</p>
      ${blocoRadios({ tipo:p.tipo, consultor:p.consultor_id, agencia:p.agencia_id, ja, marcar:livres.length === 1 })}
      <small class="muted">${S.pode('consultor') ? 'Aparecem só os veículos que você atende. ' : ''}${p.tipo === 'cliente' ? 'A situação (Ativo, Prospect, Inativo) vai igual. ' : ''}Nome, CNPJ, endereço e contatos vão iguais; PIs e financeiro ficam separados.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>${livres.length ? 'Cancelar' : 'Fechar'}</button>${livres.length ? '<button class="btn pri" value="ok" data-cad-levar>Cadastrar</button>' : ''}</div>`,
    f => { const destinos = destinosMarcados(f); if (!destinos.length) return S.toast('Marque pelo menos um veículo.');
      S.run(async () => { const r = await levar(p.id, destinos); const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', p.id).single()); Object.assign(S.pessoa(p.id) || {}, atual);
        { const t = resumo(r); t ? S.salvo('Cadastro levado', { sub:t[0].toUpperCase() + t.slice(1) + '.' }) : S.toast('Nada para cadastrar.'); } }, null); });
    document.getElementById('dlg').classList.add('medio');
    const dlg = document.getElementById('dlg'), fim = dlg.onclose; dlg.onclose = () => { dlg.classList.remove('medio'); if (fim) fim(); };
    contarRadios();
  }

  // Botão de salvar diz em quantas rádios vai cadastrar; a agência de cada rádio acompanha a escolhida no formulário
  function contarRadios() {
    const d = document.getElementById('dlg'); if (!d) return;
    const n = d.querySelectorAll('.cad-radios input[name^="x_rad_"]:checked').length;
    const pri = d.querySelector('.so-editar .btn.pri'); if (pri) pri.textContent = n ? `Salvar nos ${n + 1} veículos` : 'Salvar';
    const lev = d.querySelector('[data-cad-levar]'); if (lev) { lev.textContent = n === 1 ? 'Cadastrar em ' + nomeRadio(d.querySelector('.cad-radios input[name^="x_rad_"]:checked').name.slice(6)) : n ? `Cadastrar nos ${n} veículos` : 'Cadastrar'; lev.disabled = !n; }
    const tot = d.querySelector('[data-cad-total]'); if (tot) { const m = d.querySelectorAll('.cad-radios input[name^="x_"]:checked').length; tot.textContent = m ? `Atualizar nos ${m + 1} veículos` : 'Atualizar'; tot.disabled = !m; }
  }
  document.addEventListener('change', e => {
    const d = document.getElementById('dlg'); if (!d || !d.open || !d.contains(e.target)) return;
    if (e.target.closest('.cad-radios')) { if (e.target.name?.startsWith('x_rad_')) { const det = d.querySelector(`[data-cad-det="${e.target.name.slice(6)}"]`); if (det) det.hidden = !e.target.checked; } contarRadios(); }
    if (e.target.name === 'agencia_id') d.querySelectorAll('[data-cad-ag]').forEach(el => { el.innerHTML = situacaoAgencia(el.dataset.cadAg, e.target.value); });
  });

  // ---------- CNPJ já cadastrado em outra rádio ----------
  let espera = null;
  document.addEventListener('input', e => {
    const d = document.getElementById('dlg'); if (!d || !d.open || e.target.name !== 'documento' || !d.querySelector('#cadAchado')) return;
    clearTimeout(espera); espera = setTimeout(() => procurarDocumento(e.target.value), 350);
  });
  async function procurarDocumento(valor) {
    const box = document.querySelector('#dlg #cadAchado'); if (!box) return;
    const n = soNumeros(valor);
    if (![11, 14].includes(n.length)) { box.hidden = true; return; }
    // Cliente que já existe nesta rádio (de outro consultor): avisa quem atende, sem mostrar os dados, e não deixa salvar
    if (aba === 'cliente') { let dono = null;
      try { dono = await S.q(S.sb.rpc('cliente_de_outro', { p_veiculo:S.ui.vehicleId, p_doc:n })); } catch (e) { console.error(e); }
      const el = campo('documento');
      if (dono && el && soNumeros(el.value) === n) {
        const msg = S.pode('consultor') ? `Este cliente já é atendido por ${dono} neste veículo. Fale com o gerente.` : `Este cliente já está cadastrado neste veículo (consultor: ${dono}).`;
        el.setCustomValidity(msg); box.hidden = false;
        box.innerHTML = `<div class="cad-achado aviso" role="alert">${S.svg('bloqueio')}<div><b>${n.length === 14 ? 'CNPJ' : 'CPF'} já cadastrado neste veículo</b><span>${esc(msg)}</span></div></div>`;
        return; } }
    if (n === cad.ignorar) { box.hidden = true; return; }
    let achados = [];
    try { achados = await buscarIrmaos(aba, null, n); } catch (e) { console.error(e); }
    cad.achados = achados; const a = achados[0];
    if (!a || cad.trazido) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="cad-achado">${S.vav(S.veh(a.veiculo_id))}<div><b>Esse ${n.length === 14 ? 'CNPJ' : 'CPF'} já está cadastrado em ${esc(nomeRadio(a.veiculo_id))}</b>
      <span>${esc([a.nome, a.cidade, a.telefone].filter(Boolean).join(' · '))}</span>
      <small class="muted">Trazer os dados de lá preenche o formulário. Você confere${aba === 'cliente' ? ' e escolhe o consultor deste veículo' : ''}.</small>
      <div class="row"><button type="button" class="btn sm pri" data-act="pesTrazer">Trazer os dados de ${esc(nomeRadio(a.veiculo_id))}</button><button type="button" class="btn sm" data-act="pesIgnorar">Não, é outro cadastro</button></div></div></div>`;
    // A rádio de onde veio já tem o cadastro: some do "Cadastrar também em"
    achados.forEach(r => { const c = document.querySelector(`#dlg input[name="x_rad_${r.veiculo_id}"]`); if (c) { c.checked = false; const det = document.querySelector(`#dlg [data-cad-det="${r.veiculo_id}"]`); if (det) det.remove();
      c.closest('.cad-radio').outerHTML = `<span class="radio cad-radio ja" title="Já cadastrado em ${esc(nomeRadio(r.veiculo_id))}">${S.svg('check')}${S.vav(S.veh(r.veiculo_id))}<span class="lbl">${esc(nomeRadio(r.veiculo_id))}</span></span>`; } });
    contarRadios();
  }

  // Preenchimento pelo CNPJ (botão). O CEP se preenche sozinho ao completar os 8 números (core.js).
  // Três serviços públicos, um de reserva do outro: se um estiver fora do ar ou limitando consultas, tenta o próximo.
  const campo = n => document.querySelector(`#dlg [name="${n}"]`);
  const FONTES_CNPJ = [
    n => ['https://brasilapi.com.br/api/cnpj/v1/' + n, j => j],
    n => ['https://minhareceita.org/' + n, j => j],
    n => ['https://publica.cnpj.ws/cnpj/' + n, j => { const e = j.estabelecimento || {};
      return { razao_social:j.razao_social, nome_fantasia:e.nome_fantasia, cep:e.cep, logradouro:[e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), numero:e.numero, bairro:e.bairro,
        municipio:(e.cidade || {}).nome, uf:(e.estado || {}).sigla, ddd_telefone_1:[e.ddd1, e.telefone1].filter(Boolean).join('') }; }]];
  async function dadosDoCnpj(n) {
    let naoExiste = 0;
    for (const fonte of FONTES_CNPJ) {
      const [url, ler] = fonte(n);
      try {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(url, { signal:ctrl.signal }); clearTimeout(t);
        if (r.ok) { const j = ler(await r.json()); if (j && j.razao_social) return j; }
        else if (r.status === 404 || r.status === 400) naoExiste++;
      } catch (e) { /* fora do ar ou demorou: tenta o próximo */ }
    }
    throw new Error(naoExiste >= 2 ? 'naoexiste' : 'fora');
  }
  S.dadosDoCnpj = n => dadosDoCnpj(n);   // usado também no cadastro da empresa comercial
  async function preencherCnpj(n) {
    const btn = document.querySelector('#dlg [data-act="pesCnpj"]'); if (btn) { btn.disabled = true; btn.textContent = 'Buscando…'; }
    try {
      const j = await dadosDoCnpj(n);
      campo('razao_social').value = j.razao_social || ''; if (!campo('nome').value) campo('nome').value = j.nome_fantasia || j.razao_social || '';
      campo('cep').value = j.cep || ''; campo('endereco').value = [j.logradouro, j.numero, j.bairro].filter(Boolean).join(', ');
      campo('cidade').value = [j.municipio, j.uf].filter(Boolean).join(' / '); if (!campo('telefone').value) campo('telefone').value = j.ddd_telefone_1 || '';
      S.mascarar(document.getElementById('dlg')); S.toast('Dados preenchidos. Confira antes de salvar.');
    } catch (e) { S.toast(e.message === 'naoexiste' ? 'Esse CNPJ não foi encontrado na Receita. Confira os números.' : 'Os serviços de consulta de CNPJ não responderam agora. Tente de novo em instantes ou preencha à mão.'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Preencher pelo CNPJ'; } }
  }

  Object.assign(S.actions, {
    pesAba: d => S.go(d.tab === 'agencia' ? '/clientes/agencias' : '/clientes'),
    pesNovo: () => formulario({ tipo:aba, pessoa:'pj', situacao:'prospect', comissao:20, consultor_id:S.pode('consultor') ? S.me.id : '' }),
    pesEditar: d => { const p = S.pessoa(d.id); if (S.pode('diretor', 'gerente') || (S.pode('consultor') && (p.tipo === 'agencia' || p.consultor_id === S.me.id))) formulario(p); else S.toast('Seu perfil só pode consultar este cadastro.'); },
    pesMenu: (d, botao) => S.menu(botao, [{ label:'Abrir', icon:'abrir', act:'pesEditar', data:{ id:d.id } }, { label:'Levar para outro veículo', icon:'copia', act:'pesLevar', data:{ id:d.id } },
      ...(S.pode('diretor', 'gerente', 'consultor') ? ['-', { label:'Excluir cadastro', icon:'lixo', act:'pesExcluir', data:{ id:d.id }, perigo:true }] : [])]),
    pesExcluir: d => { const p = S.db.pessoas.find(x => x.id === d.id); if (p) excluirPessoa(p, p.tipo === 'cliente'); },
    pesLevar: d => { const p = S.pessoa(d.id); if (p) levarDialogo(p); },
    pesTrazer: () => { const a = cad.achados[0]; if (!a) return;
      CADASTRAIS.forEach(([k]) => { const c = campo(k); if (c && a[k] != null && a[k] !== '') c.value = a[k]; });
      cad.trazido = grupoDe(a); S.mascarar(document.getElementById('dlg'));
      document.querySelector('#dlg #cadAchado').innerHTML = `<div class="cad-achado ok">${S.svg('check')}<span>Dados trazidos de ${esc(nomeRadio(a.veiculo_id))}. Confira e salve: os dois cadastros ficam ligados.</span></div>`; },
    pesIgnorar: () => { cad.ignorar = soNumeros((campo('documento') || {}).value); const b = document.querySelector('#dlg #cadAchado'); if (b) b.hidden = true; },
    pesCnpj: () => { const n = (campo('documento').value || '').replace(/\D/g, ''); if (n.length !== 14) return S.toast('Digite os 14 números do CNPJ.'); preencherCnpj(n); }
  });
})();

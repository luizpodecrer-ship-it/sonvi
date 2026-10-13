// SONVI · clientes (anunciantes) e agências do veículo selecionado.
// Cada rádio tem o próprio cadastro. Para não digitar de novo, o cadastro pode nascer em várias rádios de uma vez,
// ser levado depois (menu ⋯) ou trazido de outra rádio pelo CNPJ; ao alterar, o sistema pergunta se atualiza as cópias.
// As cópias ficam ligadas por cadastro_id (e pelo CNPJ/CPF, documento_num). Regras no banco: database/015_cadastro_em_varias_radios.sql.
(() => {
  const { esc } = S;
  const SIT = { prospect:['Prospect', 'orange'], ativo:['Ativo', 'green'], inativo:['Inativo', 'gray'] };
  // Dados cadastrais: são os que vão iguais para as outras rádios (consultor, situação, agência, comissão e observações não)
  const CADASTRAIS = [['nome', 'Nome'], ['pessoa', 'Tipo'], ['razao_social', 'Razão social'], ['documento', 'CNPJ / CPF'], ['inscricao_estadual', 'Inscrição estadual'],
    ['cep', 'CEP'], ['endereco', 'Endereço'], ['cidade', 'Cidade / UF'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'],
    ['contato_decide', 'Contato que decide'], ['contato_assina', 'Contato que assina'], ['segmento', 'Segmento']];
  let aba = 'cliente';
  // Estado do formulário aberto (rádios de destino, agências delas, cadastro trazido de outra rádio)
  const cad = { destinos:[], agencias:[], trazido:null, achados:[], ignorar:'' };

  // ---------- rádios ----------
  const perfilEm = v => S.me.diretor ? 'diretor' : (S.db.vinculos.find(x => x.usuario_id === S.me.id && x.veiculo_id === v) || {}).perfil || null;
  // Outras rádios em que a pessoa pode cadastrar (o consultor só nas que ele atende)
  const radiosDestino = () => S.db.veiculos.filter(v => v.id !== S.ui.vehicleId && ['diretor', 'gerente', 'consultor'].includes(perfilEm(v.id)));
  const consultoresDe = v => S.db.vinculos.filter(x => x.veiculo_id === v && x.perfil === 'consultor').map(x => S.db.usuarios.find(u => u.id === x.usuario_id)).filter(Boolean);
  const podeAlterarLa = r => { const pf = perfilEm(r.veiculo_id); return pf === 'diretor' || pf === 'gerente' || (pf === 'consultor' && (r.tipo === 'agencia' || r.consultor_id === S.me.id)); };
  const nomeRadio = id => (S.veh(id) || {}).nome || 'outra rádio';

  // O mesmo cadastro nas outras rádios (só aparecem os que o perfil pode ver)
  const grupoDe = p => p.cadastro_id || p.id;
  const buscarIrmaos = async (tipo, grupo, num) => {
    const ou = [grupo && `cadastro_id.eq.${grupo}`, grupo && `id.eq.${grupo}`, num && `documento_num.eq.${num}`].filter(Boolean);
    if (!ou.length) return [];
    return S.q(S.sb.from('pessoas').select('*').eq('tipo', tipo).neq('veiculo_id', S.ui.vehicleId).or(ou.join(',')));
  };
  const agenciasDe = async ids => ids.length ? S.q(S.sb.from('pessoas').select('id,veiculo_id,nome,cadastro_id,documento_num').eq('tipo', 'agencia').in('veiculo_id', ids)) : [];
  const soNumeros = s => String(s || '').replace(/\D/g, '');

  // ---------- bloco "Cadastrar também em" (formulário novo e "Levar para outra rádio") ----------
  const agenciaNaRadio = (v, agId) => {
    const a = S.pessoa(agId); if (!a) return null;
    const g = grupoDe(a), n = soNumeros(a.documento);
    return cad.agencias.find(x => x.veiculo_id === v && (x.cadastro_id === g || x.id === g || (n && x.documento_num === n))) || null;
  };
  const situacaoAgencia = (v, agId) => {
    const a = S.pessoa(agId);
    if (!a) return `<span class="cad-ag ok">${S.svg('check')}<span>Sem agência</span></span>`;
    const la = agenciaNaRadio(v, agId);
    return la ? `<span class="cad-ag ok">${S.svg('check')}<span><b>${esc(a.nome)}</b> já está na ${esc(nomeRadio(v))}: o cliente vai ligado a ela.</span></span>`
      : `<span class="cad-ag falta"><span><b>${esc(a.nome)}</b> ainda não está na ${esc(nomeRadio(v))}.</span><label class="chk"><input type="checkbox" name="x_ag_${v}" checked>Cadastrar a agência também</label></span>`;
  };
  const blocoRadios = ({ tipo, consultor, agencia, ja = new Set(), marcar = false }) => {
    const linhas = cad.destinos.map(v => {
      if (ja.has(v.id)) return `<div class="cad-radio ja">${S.vav(v)}<b>${esc(v.nome)}</b><span class="cad-ja">${S.svg('check')}Já cadastrado</span></div>`;
      const pf = perfilEm(v.id), cons = consultoresDe(v.id);
      const padrao = cons.some(u => u.id === consultor) ? consultor : '';
      const campoCons = tipo !== 'cliente' ? '' : pf === 'consultor'
        ? `<div class="f">Consultor nesta rádio<span class="cad-fixo">${esc(S.me.nome || S.me.email)} (você)</span></div>`
        : `<label class="f">Consultor nesta rádio<select name="x_cons_${v.id}"><option value="">Sem consultor</option>${cons.map(u => `<option value="${u.id}"${u.id === padrao ? ' selected' : ''}>${esc(u.nome || u.email)}</option>`).join('')}</select></label>`;
      return `<div class="cad-radio"><label class="cad-top"><input type="checkbox" name="x_rad_${v.id}"${marcar ? ' checked' : ''}>${S.vav(v)}<b>${esc(v.nome)}</b></label>
        ${tipo === 'cliente' ? `<div class="cad-det">${campoCons}<div class="f">Agência nesta rádio<div data-cad-ag="${v.id}">${situacaoAgencia(v.id, agencia)}</div></div></div>` : ''}</div>`;
    }).join('');
    return `<div class="cad-radios">${linhas}</div>`;
  };
  const destinosMarcados = f => cad.destinos.filter(v => f['x_rad_' + v.id] === 'on')
    .map(v => ({ veiculo_id:v.id, consultor_id:f['x_cons_' + v.id] || null, criar_agencia:f['x_ag_' + v.id] === 'on' }));
  const levar = async (id, destinos) => {
    const r = await S.q(S.sb.rpc('levar_pessoa', { p_origem:id, p_destinos:destinos }));
    return r || { criados:[], ja:[] };
  };
  const resumo = r => { const c = (r.criados || []).map(nomeRadio), j = (r.ja || []).map(nomeRadio);
    return [c.length && 'cadastrado também na ' + c.join(' e na '), j.length && 'já existia na ' + j.join(' e na ')].filter(Boolean).join('; '); };

  // ---------- lista ----------
  S.views.clientes = id => {
    aba = id === 'agencias' ? 'agencia' : 'cliente';
    const q = S.ui.q.toLowerCase(), lista = S.pessoas(aba).filter(p => !q || [p.nome, p.razao_social, p.documento, p.cidade, p.segmento].join(' ').toLowerCase().includes(q));
    const podeCriar = S.pode('diretor', 'gerente', 'consultor'), outras = radiosDestino().length > 0;
    const tres = p => outras && podeAlterarLa(p) ? `<button class="btn tres" data-act="pesMenu" data-id="${p.id}" aria-label="Opções de ${esc(p.nome)}">${S.svg('mais3')}</button>` : '';
    const linhas = lista.map(p => `<tr class="click" data-act="pesEditar" data-id="${p.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(p.nome))}</span><div><b>${esc(p.nome)}</b><div class="muted small">${esc(p.razao_social)}</div></div></div></td><td>${esc(p.documento)}</td><td>${esc(p.cidade)}</td><td>${esc(p.telefone || p.whatsapp)}</td>
      ${aba === 'cliente' ? `<td>${esc(S.usuario(p.consultor_id))}</td><td>${esc(S.nome(p.agencia_id))}</td><td>${S.tag(...SIT[p.situacao])}</td>` : `<td class="r">${S.nfmt(Number(p.comissao)) || '0'}%</td>`}<td class="r">${tres(p)}</td></tr>`).join('');
    return { title:`<span class="sub">${esc(S.veh().nome)} · ${S.pessoas(aba).length} ${aba === 'cliente' ? (S.pessoas(aba).length === 1 ? 'cliente' : 'clientes') : (S.pessoas(aba).length === 1 ? 'agência' : 'agências')}</span>${aba === 'cliente' ? 'Clientes' : 'Agências'}`, actions:podeCriar ? `<button class="btn pri" data-act="pesNovo">${S.svg('mais')}${aba === 'cliente' ? 'Novo cliente' : 'Nova agência'}</button>` : '',
      body:`<div class="row mid" style="margin-bottom:16px"><div class="seg" style="margin:0">${[['cliente', 'Clientes'], ['agencia', 'Agências']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="pesAba" data-tab="${k}">${n}</button>`).join('')}</div><input type="search" class="grow" style="height:42px" placeholder="Buscar por nome, CNPJ, cidade ou segmento" aria-label="Buscar clientes e agências" value="${esc(S.ui.q)}" data-ui="q"></div>
        <div class="card">${lista.length && S.celular ? `<div class="list cli-lista">${lista.map(p => `<div data-act="pesEditar" data-id="${p.id}" tabindex="-1"><span class="av soft" aria-hidden="true">${esc(S.iniciais(p.nome))}</span>
            <span class="tx"><b><a href="#/clientes" data-act="pesEditar" data-id="${p.id}">${esc(p.nome)}</a></b><small>${esc([p.documento, p.cidade].filter(Boolean).join(' · ') || p.razao_social || '—')}</small>
            ${aba === 'cliente' ? `<span class="cli-meta">${S.tag(...SIT[p.situacao])}${p.consultor_id ? `<small>${esc(S.usuario(p.consultor_id))}</small>` : ''}${p.agencia_id ? `<small>· ${esc(S.nome(p.agencia_id))}</small>` : ''}</span>` : `<span class="cli-meta"><small>Comissão ${S.nfmt(Number(p.comissao)) || '0'}%</small></span>`}</span>${tres(p)}</div>`).join('')}</div>`
          : lista.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>CNPJ / CPF</th><th>Cidade</th><th>Telefone</th>${aba === 'cliente' ? '<th>Consultor</th><th>Agência</th><th>Situação</th>' : '<th class="r">Comissão</th>'}<th><span class="sr">Opções</span></th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty"><b>Nenhum cadastro${q ? ' encontrado' : ''}</b>${S.pode('consultor') && aba === 'cliente' ? 'Aqui aparecem os clientes da sua carteira.' : ''}</div>`}</div>` };
  };

  // ---------- formulário ----------
  async function formulario(p) {
    const cliente = (p.tipo || aba) === 'cliente', gestor = S.pode('diretor', 'gerente'), novo = !p.id, tipo = cliente ? 'cliente' : 'agencia';
    Object.assign(cad, { destinos:novo ? radiosDestino() : [], agencias:[], trazido:null, achados:[], ignorar:'' });
    if (novo && cliente && cad.destinos.length) { try { cad.agencias = await agenciasDe(cad.destinos.map(v => v.id)); } catch (e) { console.error(e); } }
    const buscar = (id, label) => ({ html:`<div style="display:flex;align-items:flex-end"><button type="button" class="btn sm" data-act="${id}">${label}</button></div>` });
    const bloco = novo && cad.destinos.length ? [{ html:`<div class="cad-bloco" style="grid-column:1/-1"><div class="cad-hd"><b>Cadastrar também em</b><small>${S.pode('consultor') ? 'Aparecem as rádios que você atende' : 'Aparecem as rádios em que você trabalha'}</small></div>
        ${blocoRadios({ tipo, consultor:p.consultor_id, agencia:p.agencia_id })}
        <small class="muted">Nome, CNPJ, endereço e contatos vão iguais. ${cliente ? 'A situação vai igual; consultor, PIs e financeiro ficam separados em cada rádio.' : 'Os PIs e o financeiro ficam separados em cada rádio.'}</small></div>` }] : [];
    const campos = [
      { k:'nome', label:cliente ? 'Nome fantasia ou nome' : 'Nome da agência', req:true, ph:cliente ? 'Ex.: Supermercado Três Irmãos' : 'Ex.: Agência Ponto Alto' },
      { k:'pessoa', label:'Tipo', type:'select', options:[['pj', 'Pessoa jurídica'], ['pf', 'Pessoa física']] },
      { k:'documento', label:'CNPJ / CPF' }, buscar('pesCnpj', 'Preencher pelo CNPJ'),
      ...(novo ? [{ html:'<div id="cadAchado" style="grid-column:1/-1" hidden></div>' }] : []),
      { k:'razao_social', label:'Razão social' }, { k:'inscricao_estadual', label:'Inscrição estadual' },
      { k:'cep', label:'CEP' }, { k:'cidade', label:'Cidade / UF' },
      { k:'endereco', label:'Endereço', full:true },
      { k:'telefone', label:'Telefone' }, { k:'whatsapp', label:'WhatsApp' }, { k:'email', label:'E-mail', type:'email' },
      ...(cliente ? [
        { k:'segmento', label:'Segmento' }, { k:'contato_decide', label:'Contato que decide' }, { k:'contato_assina', label:'Contato que assina' },
        { k:'agencia_id', label:'Agência', type:'select', options:[['', 'Sem agência'], ...S.pessoas('agencia').map(a => [a.id, a.nome])] },
        { k:'situacao', label:'Situação', type:'select', options:Object.entries(SIT).map(([k, v]) => [k, v[0]]) },
        ...(gestor ? [{ k:'consultor_id', label:'Consultor responsável', type:'select', options:[['', 'Sem consultor'], ...S.consultores().map(u => [u.id, u.nome || u.email])] }] : [])
      ] : [{ k:'comissao', label:'Comissão padrão (%)' }]),
      { k:'observacoes', label:'Observações', type:'textarea' },
      ...bloco,
      ...(!novo && gestor ? [{ html:`<div style="grid-column:1/-1"><button class="btn sm danger" value="excluir" formnovalidate>Excluir cadastro</button></div>` }] : [])];
    S.form(novo ? (cliente ? 'Novo cliente' : 'Nova agência') : esc(p.nome), campos, p, v => salvar(p, v, { cliente, gestor, novo, tipo }));
    const d = document.getElementById('dlg'), ok = d.onclose;
    if (bloco.length) d.classList.add('medio');
    d.onclose = async () => { d.classList.remove('medio'); if (d.returnValue === 'excluir') { if (await S.confirmar('Excluir este cadastro?', { ok:'Excluir cadastro', perigo:true })) S.run(() => S.excluir('pessoas', p.id), 'Cadastro excluído'); } else ok(); };
    contarRadios();
  }

  async function salvar(p, v, { cliente, gestor, novo, tipo }) {
    const extras = {}; Object.keys(v).filter(k => k.startsWith('x_')).forEach(k => { extras[k] = v[k]; delete v[k]; });
    const row = Object.assign({}, v, { agencia_id:v.agencia_id || null });
    if (cliente) row.consultor_id = gestor ? (v.consultor_id || null) : (p.consultor_id || S.me.id); else { row.comissao = S.num(v.comissao); delete row.agencia_id; }
    if (p.id) row.id = p.id; else Object.assign(row, { veiculo_id:S.ui.vehicleId, tipo });
    if (novo && cad.trazido) row.cadastro_id = cad.trazido;
    const mudou = !novo ? CADASTRAIS.filter(([k]) => k in v && String(v[k] ?? '') !== String(p[k] ?? '')) : [];
    let irmaos = [], aviso = 'Cadastro salvo';
    const ok = await S.run(async () => {
      // As cópias nas outras rádios são procuradas antes de gravar (o CNPJ pode estar mudando)
      if (mudou.length) { try { irmaos = (await buscarIrmaos(tipo, grupoDe(p), soNumeros(p.documento))).filter(podeAlterarLa); } catch (e) { console.error(e); } }
      const r = await S.salvar('pessoas', row);
      const destinos = novo ? destinosMarcados(extras) : [];
      if (destinos.length) { const res = await levar(r.id, destinos); const t = resumo(res); if (t) aviso = 'Cadastro salvo: ' + t + '.';
        const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', r.id).single()); Object.assign(r, atual); }
    }, null);
    if (!ok) return;
    S.toast(aviso);
    if (irmaos.length) perguntarAtualizar(p, mudou, irmaos);
  }

  // Ao alterar: pergunta se leva os dados cadastrais para as outras rádios
  function perguntarAtualizar(velho, mudou, irmaos) {
    const p = S.pessoa(velho.id) || velho; // já com os dados novos
    const linhas = mudou.map(([k, n]) => `<div class="cad-mud"><span>${n}</span><span>${velho[k] ? `<s>${esc(velho[k])}</s>` : ''}<b>${esc(p[k] || '—')}</b></span></div>`).join('');
    const antes = p;
    const total = irmaos.length + 1;
    S.dialog(`<h2>Atualizar também nas outras rádios?</h2><p class="muted" style="margin-top:-8px">${esc(antes.nome)} também está ${irmaos.length > 1 ? 'nestas rádios' : 'nesta rádio'}. Marque onde atualizar.</p>
      <div><small class="cad-rot">O QUE MUDOU</small>${linhas}</div>
      <div class="cad-radios">${irmaos.map(r => `<label class="cad-radio cad-top"><input type="checkbox" name="x_${r.id}" checked>${S.vav(S.veh(r.veiculo_id))}<b>${esc(nomeRadio(r.veiculo_id))}</b></label>`).join('')}</div>
      <small class="muted">Só os dados cadastrais vão para as outras rádios. Consultor, situação, agência e observações de cada rádio continuam como estão.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Só na ${esc(S.veh().nome)}</button><button class="btn pri" value="ok" data-cad-total>Atualizar nas ${total} rádios</button></div>`,
    f => { const ids = irmaos.filter(r => f['x_' + r.id] === 'on').map(r => r.id); if (!ids.length) return;
      S.run(async () => { const n = await S.q(S.sb.rpc('atualizar_cadastros_irmaos', { p_origem:p.id, p_ids:ids })); S.toast(`Atualizado em ${n} outra${n === 1 ? '' : 's'} rádio${n === 1 ? '' : 's'}.`); }, null); });
  }

  // ---------- menu ⋯ › Levar para outra rádio ----------
  async function levarDialogo(p) {
    cad.destinos = radiosDestino(); cad.agencias = [];
    let irmaos = [];
    try { [irmaos, cad.agencias] = await Promise.all([buscarIrmaos(p.tipo, grupoDe(p), soNumeros(p.documento)), p.tipo === 'cliente' ? agenciasDe(cad.destinos.map(v => v.id)) : []]); }
    catch (e) { return S.toast(S.erro(e)); }
    const ja = new Set(irmaos.map(r => r.veiculo_id)), livres = cad.destinos.filter(v => !ja.has(v.id));
    S.dialog(`<h2>Levar para outra rádio</h2><p class="muted" style="margin-top:-8px">${esc(p.nome)} · ${esc(S.veh().nome)}</p>
      ${blocoRadios({ tipo:p.tipo, consultor:p.consultor_id, agencia:p.agencia_id, ja, marcar:livres.length === 1 })}
      <small class="muted">${S.pode('consultor') ? 'Aparecem só as rádios que você atende. ' : ''}${p.tipo === 'cliente' ? 'A situação (Ativo, Prospect, Inativo) vai igual. ' : ''}Nome, CNPJ, endereço e contatos vão iguais; PIs e financeiro ficam separados.</small>
      <div class="row cad-acoes"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>${livres.length ? 'Cancelar' : 'Fechar'}</button>${livres.length ? '<button class="btn pri" value="ok" data-cad-levar>Cadastrar</button>' : ''}</div>`,
    f => { const destinos = destinosMarcados(f); if (!destinos.length) return S.toast('Marque pelo menos uma rádio.');
      S.run(async () => { const r = await levar(p.id, destinos); const atual = await S.q(S.sb.from('pessoas').select('*').eq('id', p.id).single()); Object.assign(S.pessoa(p.id) || {}, atual);
        S.toast(('Pronto: ' + resumo(r) + '.').replace('Pronto: .', 'Nada para cadastrar.')); }, null); });
    document.getElementById('dlg').classList.add('medio');
    const dlg = document.getElementById('dlg'), fim = dlg.onclose; dlg.onclose = () => { dlg.classList.remove('medio'); if (fim) fim(); };
    contarRadios();
  }

  // Botão de salvar diz em quantas rádios vai cadastrar; a agência de cada rádio acompanha a escolhida no formulário
  function contarRadios() {
    const d = document.getElementById('dlg'); if (!d) return;
    const n = d.querySelectorAll('.cad-radios input[name^="x_rad_"]:checked').length;
    const pri = d.querySelector('.so-editar .btn.pri'); if (pri) pri.textContent = n ? `Salvar nas ${n + 1} rádios` : 'Salvar';
    const lev = d.querySelector('[data-cad-levar]'); if (lev) { lev.textContent = n === 1 ? 'Cadastrar na ' + nomeRadio(d.querySelector('.cad-radios input[name^="x_rad_"]:checked').name.slice(6)) : n ? `Cadastrar nas ${n} rádios` : 'Cadastrar'; lev.disabled = !n; }
    const tot = d.querySelector('[data-cad-total]'); if (tot) { const m = d.querySelectorAll('.cad-radios input[name^="x_"]:checked').length; tot.textContent = m ? `Atualizar nas ${m + 1} rádios` : 'Atualizar'; tot.disabled = !m; }
  }
  document.addEventListener('change', e => {
    const d = document.getElementById('dlg'); if (!d || !d.open || !d.contains(e.target)) return;
    if (e.target.closest('.cad-radios')) contarRadios();
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
    if (![11, 14].includes(n.length) || n === cad.ignorar) { box.hidden = true; return; }
    let achados = [];
    try { achados = await buscarIrmaos(aba, null, n); } catch (e) { console.error(e); }
    cad.achados = achados; const a = achados[0];
    if (!a || cad.trazido) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="cad-achado">${S.vav(S.veh(a.veiculo_id))}<div><b>Esse ${n.length === 14 ? 'CNPJ' : 'CPF'} já está cadastrado na ${esc(nomeRadio(a.veiculo_id))}</b>
      <span>${esc([a.nome, a.cidade, a.telefone].filter(Boolean).join(' · '))}</span>
      <small class="muted">Trazer os dados de lá preenche o formulário. Você confere${aba === 'cliente' ? ' e escolhe o consultor desta rádio' : ''}.</small>
      <div class="row"><button type="button" class="btn sm pri" data-act="pesTrazer">Trazer os dados da ${esc(nomeRadio(a.veiculo_id))}</button><button type="button" class="btn sm" data-act="pesIgnorar">Não, é outro cadastro</button></div></div></div>`;
    // A rádio de onde veio já tem o cadastro: some do "Cadastrar também em"
    achados.forEach(r => { const c = document.querySelector(`#dlg input[name="x_rad_${r.veiculo_id}"]`); if (c) { c.checked = false; c.closest('.cad-radio').classList.add('ja'); c.closest('.cad-radio').innerHTML = `${S.vav(S.veh(r.veiculo_id))}<b>${esc(nomeRadio(r.veiculo_id))}</b><span class="cad-ja">${S.svg('check')}Já cadastrado</span>`; } });
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
    pesMenu: (d, botao) => S.menu(botao, [{ label:'Abrir', icon:'abrir', act:'pesEditar', data:{ id:d.id } }, { label:'Levar para outra rádio', icon:'copia', act:'pesLevar', data:{ id:d.id } }]),
    pesLevar: d => { const p = S.pessoa(d.id); if (p) levarDialogo(p); },
    pesTrazer: () => { const a = cad.achados[0]; if (!a) return;
      CADASTRAIS.forEach(([k]) => { const c = campo(k); if (c && a[k] != null && a[k] !== '') c.value = a[k]; });
      cad.trazido = grupoDe(a); S.mascarar(document.getElementById('dlg'));
      document.querySelector('#dlg #cadAchado').innerHTML = `<div class="cad-achado ok">${S.svg('check')}<span>Dados trazidos da ${esc(nomeRadio(a.veiculo_id))}. Confira e salve: os dois cadastros ficam ligados.</span></div>`; },
    pesIgnorar: () => { cad.ignorar = soNumeros((campo('documento') || {}).value); const b = document.querySelector('#dlg #cadAchado'); if (b) b.hidden = true; },
    pesCnpj: () => { const n = (campo('documento').value || '').replace(/\D/g, ''); if (n.length !== 14) return S.toast('Digite os 14 números do CNPJ.'); preencherCnpj(n); }
  });
})();

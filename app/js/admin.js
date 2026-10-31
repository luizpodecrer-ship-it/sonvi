// SONVI · administração: veículos do grupo e usuários com o perfil em cada rádio.
// Diretor: tudo. Gerente: só a aba Usuários, nas rádios em que é gerente (consultor, OPEC, financeiro, programador e locutor).
// Quem garante é o banco (salvar_usuario, pode_gerenciar_usuario) e a função usuarios; aqui a tela só acompanha.
(() => {
  const { esc } = S;
  let aba = 'veiculos', celLista = true;   // no celular, Administração abre pela lista de seções (29/10/2026)
  const PERFIS_VINCULO = [['', 'Sem acesso'], ['gerente', 'Gerente comercial'], ['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro'], ['programador', 'Programador musical'], ['locutor', 'Locutor']];

  const vinculosDe = u => S.db.vinculos.filter(x => x.usuario_id === u.id && S.veh(x.veiculo_id));
  // Gerente (não diretor): rádios em que ele é gerente e quem ele pode cuidar (mesma regra do banco)
  const ehGer = () => !S.me.diretor;
  const minhas = () => S.db.veiculos.filter(v => S.db.vinculos.some(x => x.usuario_id === S.me.id && x.veiculo_id === v.id && x.perfil === 'gerente'));
  const ehMinha = id => minhas().some(v => v.id === id);
  const podeCuidar = u => !ehGer() || (u.id !== S.me.id && !u.diretor && !vinculosDe(u).some(x => x.perfil === 'gerente') && vinculosDe(u).some(x => ehMinha(x.veiculo_id)));
  const soNasMinhas = u => !ehGer() || (podeCuidar(u) && S.db.vinculos.filter(x => x.usuario_id === u.id).every(x => ehMinha(x.veiculo_id)));
  S.gerenteCadastra = () => !S.me.diretor && minhas().length > 0;
  const acessoTexto = (u, sep = ' · ') => u.diretor ? 'Diretor · todos os veículos' : vinculosDe(u).map(x => `${esc(S.veh(x.veiculo_id).nome)}: ${S.PERFIS[x.perfil]}`).join(sep) || '<span class="muted">Nenhuma rádio</span>';
  // Último acesso em palavras (hoje às 14:05, ontem, há 3 dias, 12/09/2026)
  const ultimo = u => { if (!u.ultimo_acesso) return '<span class="muted">nunca</span>'; const d = new Date(u.ultimo_acesso), h = new Date(), dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const n = Math.round((dia(h) - dia(d)) / 864e5), hm = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    return n <= 0 ? `hoje às ${hm}` : n === 1 ? `ontem às ${hm}` : n < 30 ? `há ${n} dias` : d.toLocaleDateString('pt-BR'); };
  const situacao = u => !u.ativo ? S.tag('Desativado', 'gray') : !u.ultimo_acesso ? S.tag('Aguardando primeiro acesso', 'orange') : u.trocar_senha ? S.tag('Com senha provisória', 'orange') : !u.diretor && !vinculosDe(u).length ? S.tag('Sem rádio', 'orange') : S.tag('Ativo', 'green');

  // Chama a função do servidor que cria o acesso e gera o link (a chave secreta fica só lá)
  const servidor = async corpo => {
    const { data, error } = await S.sb.functions.invoke('usuarios', { body:Object.assign({ destino:location.origin + location.pathname }, corpo) });
    if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) { /* sem corpo */ }
      if (/Failed to send|not found|404/i.test(m)) m = 'O serviço de cadastro de usuários ainda não está ativo no servidor.'; throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  };
  // Mostra a senha provisória (uma vez só) com a mensagem pronta para o WhatsApp. No primeiro acesso a pessoa cria a própria senha.
  const mostrarSenha = (u, senha, novo) => {
    const ende = location.origin + location.pathname, nome = (u.nome || '').split(' ')[0];
    const msg = `Olá${nome ? ', ' + nome : ''}! ${novo ? `Seu acesso ao sistema da ${S.empCurto()} foi criado.` : 'Aqui está a sua nova senha provisória.'}\n\nEntre em: ${ende}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.`;
    const fone = String(u.celular || '').replace(/\D/g, ''), wa = `https://wa.me/${fone ? (fone.length <= 11 ? '55' : '') + fone : ''}?text=${encodeURIComponent(msg)}`;
    S.dialog(`<h2>${novo ? 'Usuário cadastrado' : 'Nova senha provisória'}</h2>
      <p>Envie os dados de acesso para <b>${esc(u.nome || u.email)}</b>. No primeiro acesso, o SONVI pede que a pessoa crie a própria senha.</p>
      <div class="senha-prov"><div><small>E-mail</small><b>${esc(u.email).replace('@', '@<wbr>')}</b></div><div><small>Senha provisória</small><b class="num">${esc(senha)}</b></div></div>
      <p class="muted small">Esta senha aparece só agora. Se perder, gere outra pelo menu ⋯ do usuário (a anterior deixa de valer).</p>
      <div class="envio-acesso" role="group" aria-label="Enviar os dados de acesso">
        <a class="btn pri" href="${esc(wa)}" target="_blank" rel="noopener">${S.svg('whats')}WhatsApp</a>
        <button type="button" class="btn" data-act="admEnviarAcesso" data-id="${esc(u.id || '')}" data-senha="${esc(senha)}">${S.svg('email')}E-mail</button>
        <button type="button" class="btn" data-act="admCopiar" data-texto="${esc(msg)}">${S.svg('copia')}Copiar</button></div>
      <div class="row"><span class="grow"></span><button class="btn" value="x">Fechar</button></div>`);
  };
  // Formulário do usuário: dados, função (diretor ou por rádio) e o perfil em cada rádio
  const formUsuario = (u, editar, valores) => {
    const novo = !u.id, ver = !novo && !editar, t = ver ? ' disabled data-trava="1"' : '', eu = u.id === S.me.id;
    // O próprio diretor só fica travado se for o único diretor ativo (o SONVI nunca fica sem diretor)
    const trava = eu && !!u.diretor && !S.db.usuarios.some(x => x.id !== u.id && x.diretor && x.ativo);
    const atual = v => valores ? valores['v_' + v.id] || '' : (S.db.vinculos.find(x => x.usuario_id === u.id && x.veiculo_id === v.id) || {}).perfil || '';
    const dir = valores ? valores.funcao === 'diretor' : !!u.diretor;
    // Gerente: só as rádios dele; o acesso da pessoa em outras rádios aparece só como informação
    const ger = ehGer(), lista = ger ? minhas() : S.db.veiculos, perfis = PERFIS_VINCULO.filter(([k]) => k !== 'gerente');   // Head 14 não tem gerente (24/10/2026): a opção só aparece para quem já é gerente
    const fora = ger && u.id ? vinculosDe(u).filter(x => !ehMinha(x.veiculo_id)) : [];
    const radios = `<div class="acessos" style="grid-column:1/-1"${dir ? ' hidden' : ''}><b>Rádios e perfis</b><small class="muted">${ger ? 'Você dá acesso nas rádios em que é gerente.' : 'Escolha o que a pessoa faz em cada rádio.'} "Sem acesso" esconde a rádio dela.</small>
      ${lista.map(v => `<label class="ac-l">${S.vav(v)}<span class="grow">${esc(v.nome)}</span><select name="v_${v.id}"${t} aria-label="Perfil em ${esc(v.nome)}">${(perfis.some(([k]) => k === atual(v)) ? perfis : PERFIS_VINCULO).map(([k, n]) => `<option value="${k}"${k === atual(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}
      ${fora.length ? `<small class="muted">Também tem acesso em ${fora.map(x => `${esc(S.veh(x.veiculo_id).nome)} (${S.PERFIS[x.perfil]})`).join(', ')}. Isso fica com o diretor ou com o gerente de lá.</small>` : ''}</div>`;
    S.form(novo ? 'Cadastrar usuário' : esc(u.nome || u.email), [
      { k:'nome', label:'Nome', req:true, ph:'Nome completo' },
      { k:'email', label:'E-mail (é com ele que a pessoa entra)', type:'email', req:true, ph:'nome@empresa.com.br' },
      { k:'celular', label:'Celular (WhatsApp)' },
      ger ? { html:'<input type="hidden" name="funcao" value="radios">' } : { html:`<label class="f">Função<select name="funcao" data-funcao="1"${t}${trava ? ' disabled' : ''}><option value="radios"${dir ? '' : ' selected'}>Por veículo (consultor, OPEC…)</option><option value="diretor"${dir ? ' selected' : ''}>Diretor · todos os veículos</option></select>${trava ? '<input type="hidden" name="funcao" value="diretor"><small class="muted">Você é o único diretor ativo. Para mudar a sua função, cadastre outro diretor antes.</small>' : eu && dir ? '<small class="muted">Se deixar de ser diretor, você perde o acesso a Administração.</small>' : ''}</label>` },
      { html:radios }],
      valores || u, f => salvarUsuario(u, f), novo ? 'Cadastrar e gerar link' : 'Salvar', { editar });
    // Quem o gerente não pode cuidar (diretor, outro gerente, ele mesmo) abre só para consulta
    if (!novo && !podeCuidar(u)) { const b = document.querySelector('#dlg [data-act="formEditar"]'); if (b) b.remove(); }
  };
  const salvarUsuario = async (u, f) => {
    if (u.id && u.id === S.me.id && u.diretor && f.funcao !== 'diretor' && !await S.confirmar('Deixar de ser diretor?\n\nVocê passa a ver só as rádios e perfis escolhidos e perde o acesso a Administração. Só outro diretor consegue devolver.', { ok:'Deixar de ser diretor', perigo:true })) return;
    const diretor = f.funcao === 'diretor', vinculos = (ehGer() ? minhas() : S.db.veiculos).map(v => ({ veiculo_id:v.id, perfil:f['v_' + v.id] || '' })).filter(x => x.perfil);
    const temFora = ehGer() && u.id && vinculosDe(u).some(x => !ehMinha(x.veiculo_id));
    if (!diretor && !vinculos.length && !temFora) { formUsuario(u, true, f); return S.erroNoCampo('.acessos', 'Escolha pelo menos uma rádio e o perfil da pessoa nela.'); }
    if (!u.id) return S.run(async () => {
      const r = await servidor({ acao:'criar', nome:f.nome, email:f.email, celular:f.celular, diretor, vinculos });
      await S.carregarBase(); S.render(); mostrarSenha({ id:r.usuario_id, nome:f.nome, email:String(f.email).trim().toLowerCase(), celular:f.celular }, r.senha, true);
    });
    // E-mail novo: troca na conta de entrada (função do servidor); a senha continua a mesma
    const email = String(f.email || '').trim().toLowerCase(), trocouEmail = !!email && email !== String(u.email || '').toLowerCase();
    S.run(async () => { if (trocouEmail) await servidor({ acao:'email', usuario_id:u.id, email });
      await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:f.nome, p_celular:f.celular || '', p_ativo:u.ativo, p_diretor:diretor, p_vinculos:vinculos })); await S.carregarBase(); },
      trocouEmail ? `Usuário salvo. ${String(f.nome).split(' ')[0]} agora entra com ${email} (a senha continua a mesma).` : 'Usuário salvo');
  };

  // Proposta de exemplo (miniatura e prévia do modelo A4); o cliente é inventado e o veículo é o primeiro da empresa
  const amostraProposta = (cond) => { const v = S.db.veiculos[0] || {}, m = S.modeloProposta();
    return { veiculo_id:v.id, ano:new Date().getFullYear(), numero:104, data:S.today(), validade:15, consultor_id:S.me && S.me.id, texto:'',
      condicoes:String(cond ?? (m.condicoes || S.PROP_CONDICOES_PADRAO)).replace(/\{VALIDADE\}/g, 15),
      _cliente:{ nome:'Supermercado Exemplo', razao_social:'Supermercado Exemplo Ltda', documento:'12.345.678/0001-90', cidade:'Cuiabá / MT', pessoa:'pj' },
      itens:[{ programa:'ROTATIVO 7H ÀS 19H', formato:'30"', dias:[1, 2, 3, 4, 5, 6], faixa:'07h às 19h', insercoes:120, preco:40, preco_tabela:45, total:4800 },
        { programa:'Manhã', formato:'Testemunhal', dias:[1, 2, 3, 4, 5], insercoes:20, preco:120, preco_tabela:130, total:2400 },
        { programa:'Flash ao vivo', formato:'15"', dias:[1, 2, 3, 4, 5], insercoes:40, preco:30, preco_tabela:30, total:1200 }] }; };

  // ---------- Colaboradores (aprovado em 25/10/2026) ----------
  // Colaborador é a pessoa que trabalha no grupo (CPF, nascimento, função, veículos, Pix e, para o consultor, a comissão).
  // Usuário é só o acesso ao SONVI; o colaborador pode ter ou não. Comissão: sobre o que o cliente pagou, no mês em que pagou;
  // mudar o percentual vale só para as vendas novas (o banco guarda o histórico em colaborador_comissoes).
  const FUNCOES = [['consultor', 'Consultor'], ['opec', 'OPEC'], ['financeiro', 'Financeiro'], ['programador', 'Programador'], ['locutor', 'Locutor'], ['outra', 'Outra']];
  const CONTRATOS = [['', 'Não informar'], ['clt', 'CLT'], ['pj', 'PJ'], ['autonomo', 'Autônomo'], ['estagio', 'Estágio'], ['outro', 'Outro']];
  const col = { carregando:false, desligados:false };
  const carregarColab = async () => { if (col.carregando) return; col.carregando = true;
    try { S.db.colaboradores = await S.q(S.sb.from('colaboradores').select('*').order('nome')); }
    catch (e) { console.error(e); S.db.colaboradores = []; S.toast(S.erro(e)); }
    col.carregando = false; if (S.ui.view === 'admin' && aba === 'colaboradores') S.render(); };
  S.colaboradoresUsar = l => { S.db.colaboradores = l; };   // testes
  const pct = n => n === null || n === undefined || n === '' ? '' : String(Number(n)).replace('.', ',') + '%';
  const nomeFuncao = c => c.funcao === 'outra' ? (c.funcao_outra || 'Outra') : (FUNCOES.find(f => f[0] === c.funcao) || [, c.funcao])[1];
  const cpfOculto = c => { const d = String(c.cpf || '').replace(/\D/g, ''); return d.length === 11 ? `CPF ***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : 'CPF não informado'; };
  const mesAno = iso => { if (!iso) return '—'; const [y, m] = iso.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1]}/${y}`; };
  const excecoes = c => Object.entries(c.comissao_veiculos || {}).filter(([, v]) => v !== null && v !== '' && Number(v) !== Number(c.comissao));
  const acessoDe = c => { const u = c.usuario_id && S.db.usuarios.find(x => x.id === c.usuario_id); if (!u) return '<span class="pill fn-neutra">Sem acesso</span>';
    if (!u.ativo) return '<span class="pill fn-neutra">Acesso desativado</span>';
    const pf = u.diretor ? 'Diretor' : [...new Set(vinculosDe(u).map(x => S.PERFIS[x.perfil] || x.perfil))].join(', ') || 'Sem perfil';
    return `<span class="pill em-ok">${S.svg('check', 12)}${esc(pf)}</span>`; };
  const telaColaboradores = () => {
    if (!S.db.colaboradores) { carregarColab(); return '<div class="card empty"><b>Carregando os colaboradores…</b></div>'; }
    const todos = S.db.colaboradores, lista = todos.filter(c => col.desligados || c.ativo), ativos = todos.filter(c => c.ativo), cons = ativos.filter(c => c.funcao === 'consultor' && c.comissao !== null && c.comissao !== undefined);
    const media = cons.length ? cons.reduce((t, c) => t + Number(c.comissao), 0) / cons.length : 0;
    const resumo = `<b>${ativos.length} ativo${ativos.length === 1 ? '' : 's'}</b> · ${ativos.filter(c => c.funcao === 'consultor').length} consultor${ativos.filter(c => c.funcao === 'consultor').length === 1 ? '' : 'es'}${ativos.some(c => c.funcao === 'consultor') ? ` · comissão de ${pct(S.COMISSAO_PCT)} do líquido pago` : ''}`;
    const deslig = todos.length - ativos.length;
    const hd = `<div class="hd"><div><h2>Colaboradores</h2><p class="muted small" style="margin:3px 0 0">${resumo}</p></div>${deslig ? `<button class="btn sm" data-act="colDesligados" aria-pressed="${col.desligados}">${col.desligados ? 'Esconder' : 'Mostrar'} desligados (${deslig})</button>` : ''}</div>`;
    if (!todos.length) return `<section class="card">${hd}<div class="empty"><b>Cadastre o primeiro colaborador</b>Consultores, OPEC, financeiro, programadores e locutores. O consultor tem a comissão de cada venda, que o SONVI usa no fechamento do mês. Dar acesso ao SONVI é opcional.</div></section>`;
    const selos = c => { const vs = (c.veiculos || []).map(id => S.veh(id)).filter(Boolean); return vs.length ? `<span class="col-selos">${vs.slice(0, 4).map(v => S.vav(v)).join('')}${vs.length > 4 ? `<small>+${vs.length - 4}</small>` : ''}</span>` : '<span class="muted small">—</span>'; };
    const com = c => c.funcao !== 'consultor' ? '<span class="muted small">—</span>' : `<span class="col-pct">${pct(S.COMISSAO_PCT)}</span><small class="muted">do líquido pago</small>`;
    const linhas = S.celular
      ? `<div class="col-cel">${lista.map(c => `<div class="col-c${c.ativo ? '' : ' fora'}" data-act="colEditar" data-id="${c.id}"><span class="av soft" aria-hidden="true">${esc(S.iniciais(c.nome))}</span><span class="col-tx"><b>${esc(c.nome)}</b><small>${esc(nomeFuncao(c))}${c.funcao === 'consultor' ? ' · ' + pct(S.COMISSAO_PCT) : ''}${c.ativo ? '' : ' · desligado'}</small></span>${selos(c)}</div>`).join('')}</div>`
      : `<div class="scroll"><table class="col-t"><colgroup><col style="width:27%"><col style="width:12%"><col style="width:15%"><col style="width:17%"><col style="width:15%"><col style="width:84px"><col style="width:52px"></colgroup>
        <thead><tr><th>Colaborador</th><th>Função</th><th>Veículos</th><th>Comissão</th><th>Acesso ao SONVI</th><th>Desde</th><th><span class="sr">Opções</span></th></tr></thead><tbody>
        ${lista.map(c => `<tr class="click${c.ativo ? '' : ' fora'}" data-act="colEditar" data-id="${c.id}"><td><span class="col-p"><span class="av soft" aria-hidden="true">${esc(S.iniciais(c.nome))}</span><span class="col-tx"><b title="${esc(c.nome)}">${esc(c.nome)}</b><small>${cpfOculto(c)}${c.ativo ? '' : ' · desligado'}</small></span></span></td>
          <td class="nw">${esc(nomeFuncao(c))}</td><td>${selos(c)}</td><td><span class="col-com">${com(c)}</span></td><td>${acessoDe(c)}</td><td class="nw">${mesAno(c.inicio)}</td>
          <td class="r"><button class="btn tres" data-act="colMenu" data-id="${c.id}" aria-label="Opções de ${esc(c.nome)}">${S.svg('mais3')}</button></td></tr>`).join('')}</tbody></table></div>`;
    return `<section class="card col-lista">${hd}${linhas}</section>`;
  };
  // Formulário do colaborador: Dados pessoais · Trabalho · Comissão (só consultor) · Pagamento e acesso
  const formColab = (c = {}) => { const novo = !c.id, vs = S.db.veiculos, marcados = new Set(c.veiculos || []), cv = c.comissao_veiculos || {}, mt = c.metas || {}, rp = S.repassePct(), emp = S.empCurto();
    const livres = S.db.usuarios.filter(u => !u.diretor && !(S.db.colaboradores || []).some(x => x.usuario_id === u.id && x.id !== c.id));
    const ligado = c.usuario_id && S.db.usuarios.find(u => u.id === c.usuario_id);
    const inp = (k, rot, cls, extra = '') => `<label class="f ${cls}">${rot}<input name="${k}" value="${esc(c[k] ?? '')}"${extra}></label>`;
    S.dialog(`<div class="em-j-hd"><h2>${novo ? 'Novo colaborador' : esc(c.nome)}</h2>${novo ? '' : `<span class="muted small">${c.ativo ? 'ativo' : 'desligado'}</span>`}</div>
      <div class="em-painel"><div class="em-blocos">
        <fieldset class="em-bl"><legend>Dados pessoais</legend><div class="em-g">
          <label class="f s6">Nome completo<input name="nome" required value="${esc(c.nome || '')}" placeholder="Nome e sobrenome"></label>
          ${inp('cpf', 'CPF', 's3', ' data-mask="cpf" inputmode="numeric" autocomplete="off"')}${inp('nascimento', 'Data de nascimento', 's3', ' type="date"')}
          ${inp('celular', 'Celular / WhatsApp', 's3', ' data-mask="tel" inputmode="tel" autocomplete="off"')}${inp('email', 'E-mail', 's3', ' type="email" placeholder="nome@empresa.com.br"')}</div></fieldset>
        <fieldset class="em-bl"><legend>Trabalho</legend><div class="em-g">
          <div class="f s6"><span>Função</span><div class="em-opc" role="radiogroup" aria-label="Função">${FUNCOES.map(([k, n]) => `<label class="em-op"><input type="radio" name="funcao" value="${k}"${(c.funcao || 'consultor') === k ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
          <label class="f s6" data-so="outra"${c.funcao === 'outra' ? '' : ' hidden'}>Qual função?<input name="funcao_outra" value="${esc(c.funcao_outra || '')}" placeholder="Ex.: Produtor, motorista…"></label>
          ${inp('inicio', 'Início no grupo', 's3', ' type="date"')}
          <label class="f s3">Forma de contratação<select name="contratacao">${CONTRATOS.map(([k, n]) => `<option value="${k}"${(c.contratacao || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <div class="f s6"><span>Veículos em que atua</span><div class="em-opc">${vs.map(v => `<label class="em-op"><input type="checkbox" name="v_${v.id}"${marcados.has(v.id) ? ' checked' : ''}><span>${esc(v.nome)}</span></label>`).join('')}</div></div></div></fieldset>
        <fieldset class="em-bl col-com-bl" data-so="consultor"${(c.funcao || 'consultor') === 'consultor' ? '' : ' hidden'}><legend>Comissão e meta <span class="muted small" style="font:500 12px var(--font)">comissão de ${S.COMISSAO_PCT}% do valor líquido que o cliente pagou, no mês do pagamento (igual para todos os consultores)</span></legend>
          <div class="col-com-box">
            <div class="col-vs"><div class="col-v col-v-hd" aria-hidden="true"><span></span><span>Veículo</span><span>Comissão</span><span>Meta de vendas por mês</span></div>${vs.map(v => `<div class="col-v" data-v="${v.id}"${marcados.has(v.id) ? '' : ' hidden'}>${S.vav(v)}<span>${esc(v.nome)}</span><span class="col-pct-fixo">${S.COMISSAO_PCT}%</span><span class="col-meta-in"><small class="col-meta-rot">Meta por mês</small><b>R$</b><input name="mt_${v.id}" data-mask="dec" inputmode="decimal" value="${mt[v.id] ? String(Number(mt[v.id]).toFixed(2)).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" placeholder="sem meta" aria-label="Meta mensal na ${esc(v.nome)}" autocomplete="off"></span></div>`).join('')}</div>
            <small class="muted">A meta conta o valor líquido que vai ao ar no mês (PIs enviados para a OPEC em diante): contrato de vários meses conta só a parte de cada mês. ${novo ? 'Vale já neste mês.' : 'Mudar a meta vale a partir do mês que vem.'}</small>
            <p class="col-ex" id="colEx"></p></div></fieldset>
        <fieldset class="em-bl"><legend>Pagamento e acesso</legend><div class="em-g">
          ${inp('pix', 'Chave Pix', 's3', ' placeholder="CPF, e-mail, celular…"')}${inp('banco', 'Banco · agência · conta', 's3', ' placeholder="Opcional"')}
          <label class="f s6">Acesso ao SONVI<select name="usuario_id">${ligado ? `<option value="${ligado.id}" selected>Ligado a ${esc(ligado.nome || ligado.email)} (${esc(ligado.email)})</option><option value="">Desligar do usuário (o acesso continua; só tira a ligação)</option>`
            : `<option value="">Sem acesso ao SONVI</option><option value="__novo">Criar o acesso agora (senha provisória)</option>${livres.length ? `<optgroup label="Ligar a um usuário que já existe">${livres.map(u => `<option value="${u.id}">${esc(u.nome || u.email)} · ${esc(u.email)}</option>`).join('')}</optgroup>` : ''}`}</select>
            <small class="muted" id="colAcessoDica">${ligado ? 'Para mudar o perfil ou os veículos do acesso, use a aba Usuários.' : 'Ao criar o acesso, o perfil em cada veículo marcado é o da função.'}</small></label>
          <label class="f s6">Observações<textarea name="observacoes" rows="2" placeholder="Uso interno">${esc(c.observacoes || '')}</textarea></label></div></fieldset>
      </div></div>
      <div class="row em-pe"><small class="muted grow">CPF, nascimento e comissão só aparecem para o diretor e o financeiro.</small><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">${novo ? 'Salvar colaborador' : 'Salvar'}</button></div>`,
      f => salvarColab(c, f));
    const dl = document.getElementById('dlg'), form = dl.querySelector('form'); dl.dataset.guarda = '1'; dl.classList.add('em-dlg');
    const antes = dl.onclose; dl.onclose = ev => { dl.classList.remove('em-dlg'); if (antes) antes(ev); };
    const num = v => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
    const ajusta = () => { const fn = (form.querySelector('[name=funcao]:checked') || {}).value;
      form.querySelector('[data-so=outra]').hidden = fn !== 'outra'; form.querySelector('[data-so=consultor]').hidden = fn !== 'consultor';
      vs.forEach(v => { const r = form.querySelector(`.col-v[data-v="${v.id}"]`); if (r) r.hidden = !form.elements['v_' + v.id].checked; });
      const ex = document.getElementById('colEx'), mv = vs.filter(v => form.elements['v_' + v.id].checked), cp = S.COMISSAO_PCT;
      if (ex) { const k = mv.slice(0, 2).map((v, i) => ({ v, venda:i ? 5000 : 20000 }));
        ex.innerHTML = !k.length ? 'Marque os veículos em que ele atua.'
          : `Exemplo: se no mês os clientes dele pagarem ${k.map(x => `${S.brl(x.venda)} líquidos na ${esc(x.v.nome)}`).join(' e ')}, a comissão é de ${k.map(x => S.brl(x.venda * cp / 100)).join(' + ')}${k.length > 1 ? ` = <b>${S.brl(k.reduce((t, x) => t + x.venda * cp / 100, 0))}</b>` : ''}.`; }
      const sel = form.elements.usuario_id, dica = document.getElementById('colAcessoDica');
      if (sel && sel.value === '__novo' && dica) dica.textContent = fn === 'outra' ? 'Para criar o acesso, escolha uma função do SONVI (consultor, OPEC, financeiro, programador ou locutor).' : 'O e-mail vira o login. O perfil em cada veículo marcado é o da função; a senha provisória aparece ao salvar.'; };
    form.addEventListener('change', e => { ajusta();
      if (e.target.name === 'usuario_id' && e.target.value && e.target.value !== '__novo') { const u = S.db.usuarios.find(x => x.id === e.target.value); if (u) { if (!form.elements.nome.value) form.elements.nome.value = u.nome || ''; if (!form.elements.email.value) form.elements.email.value = u.email || ''; if (!form.elements.celular.value) form.elements.celular.value = u.celular || ''; } } });
    ajusta(); };
  const salvarColab = (c, f) => {
    const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100) / 100; };
    const veics = S.db.veiculos.filter(v => f['v_' + v.id]).map(v => v.id), consultor = f.funcao === 'consultor';
    const cv = {};   // comissão igual para todos (5%, 29/10/2026): sem percentual por veículo
    const reais = v => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100) / 100; };
    const metas = {}; if (consultor) veics.forEach(id => { const n = reais(f['mt_' + id]); if (n) metas[id] = n; });
    const comissao = consultor ? S.COMISSAO_PCT : null;
    const reabre = (campo, msg) => { formColab(Object.assign({}, c, f, { veiculos:veics, comissao, comissao_veiculos:cv, metas, usuario_id:c.usuario_id })); S.erroNoCampo(campo, msg); };
    if ([comissao, ...Object.values(cv)].some(n => n !== null && (n < 0 || n > 100))) return reabre('comissao', 'Use um percentual de 0 a 100.');
    const novoAcesso = f.usuario_id === '__novo';
    if (novoAcesso && !String(f.email || '').trim()) return reabre('email', 'Para criar o acesso, informe o e-mail (é com ele que a pessoa entra).');
    if (novoAcesso && f.funcao === 'outra') return reabre('usuario_id', 'Para criar o acesso, escolha uma função do SONVI.');
    if (novoAcesso && !veics.length) return reabre('usuario_id', 'Marque os veículos em que a pessoa vai ter acesso.');
    S.run(async () => {
      let usuarioId = novoAcesso ? null : (f.usuario_id || null), senha = null;
      if (novoAcesso) { const r = await servidor({ acao:'criar', nome:f.nome.trim(), email:f.email.trim(), celular:f.celular || '', diretor:false, vinculos:veics.map(id => ({ veiculo_id:id, perfil:f.funcao })) }); usuarioId = r.usuario_id; senha = r.senha; }
      const row = { nome:f.nome.trim(), cpf:f.cpf || '', nascimento:f.nascimento || null, celular:f.celular || '', email:String(f.email || '').trim(), funcao:f.funcao || 'consultor', funcao_outra:f.funcao === 'outra' ? (f.funcao_outra || '').trim() : '',
        inicio:f.inicio || null, contratacao:f.contratacao || '', veiculos:veics, comissao, comissao_veiculos:cv, metas, pix:f.pix || '', banco:f.banco || '', observacoes:f.observacoes || '', usuario_id:usuarioId };
      if (c.id) await S.q(S.sb.from('colaboradores').update(row).eq('id', c.id)); else await S.q(S.sb.from('colaboradores').insert(row));
      if (novoAcesso) await S.carregarBase();
      S.db.colaboradores = null; await carregarColab(); S.metasLimpar();
      if (senha) mostrarSenha({ id:usuarioId, nome:row.nome, email:row.email.toLowerCase(), celular:row.celular }, senha, true);
    }, { titulo:c.id ? 'Colaborador salvo' : 'Colaborador cadastrado', sub:f.nome.trim() });
  };

  // Prévia ao vivo do modelo A4 dentro da janela da empresa: monta a proposta de exemplo com o que está na tela
  const previa = () => { const dl = document.getElementById('dlg'), f = dl && dl.querySelector('form'), box = dl && dl.querySelector('.em-previa-folha'); if (!f || !box || box.closest('[hidden]')) return;
    const el = f.elements, real = S.db.empresa, rascunho = Object.assign({}, real || {}, { nome:el.nome.value, razao_social:el.razao_social.value, cnpj:el.cnpj.value, cidade:el.cidade.value, email:el.email.value,
      telefone:el.telefone.value, site:el.site.value, assina:el.assina.value, responsavel:el.responsavel.value, cargo:el.cargo.value, cor:el.cor.value, cor2:el.cor2.value, logo:el.logo.value || (real || {}).logo,
      modelo:{ logo:(f.querySelector('[name=m_logo]:checked') || {}).value, cabecalho:(f.querySelector('[name=m_cabecalho]:checked') || {}).value, apresentacao:el.m_apresentacao.value, condicoes:el.m_condicoes.value,
        tabela:el.m_tabela.checked, dados_cliente:el.m_dados_cliente.checked, ass_cliente:el.m_ass_cliente.checked, rodape:el.m_rodape.checked } });
    S.db.empresa = rascunho; try { box.innerHTML = S.htmlProposta(amostraProposta(el.m_condicoes.value.trim() || S.PROP_CONDICOES_PADRAO)); } finally { S.db.empresa = real; }
    const doc = box.querySelector('.prdoc'), k = Math.min(1, (box.parentElement.clientWidth - 28) / doc.offsetWidth); box.style.transform = `scale(${k})`; box.style.width = doc.offsetWidth * k + 'px'; box.style.height = doc.offsetHeight * k + 'px'; };

  S.admAbrir = k => { aba = k; celLista = false; if (k === 'agencias' && S.agenciasRecarregar) S.agenciasRecarregar(); if (S.route().view !== 'admin') S.go('/admin'); else S.render(); };
  // Lixeira (31/10/2026, database/063): o que foi excluído fica 30 dias guardado; o diretor restaura o lote inteiro
  let lix = null, lixBusca = false;
  const carregarLix = () => { lixBusca = true; S.q(S.sb.rpc('lixeira_lista')).then(l => { lix = l || []; if (S.route().view === 'admin') S.render(); })
    .catch(e => { console.error(e); lix = []; }).finally(() => { lixBusca = false; }); };
  const NOMES_LIX = { pis:['PI', 'PIs'], propostas:['proposta', 'propostas'], pessoas:['cadastro', 'cadastros'], lancamentos:['parcela', 'parcelas'], pi_historico:['registro de histórico', 'registros de histórico'],
    pi_links:['link de mídia', 'links de mídia'], agenda:['follow-up', 'follow-ups'], fat_pedidos:['pedido de faturamento', 'pedidos de faturamento'], produtos:['produto', 'produtos'], precos:['preço', 'preços'],
    combos:['combo', 'combos'], colaboradores:['colaborador', 'colaboradores'], veiculos:['veículo', 'veículos'], tabelas_preco:['tabela', 'tabelas'], repasses:['repasse', 'repasses'] };
  const resumoLix = r => Object.entries(r || {}).filter(([t]) => NOMES_LIX[t]).map(([t, n]) => `${n} ${NOMES_LIX[t][n === 1 ? 0 : 1]}`).join(' · ');
  const telaLixeira = () => {
    if (!lix) return '<div class="card"><p class="muted">Buscando a Lixeira…</p></div>';
    const dias = d => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 864e5));
    const linhas = lix.map(l => `<tr><td class="nw">${S.dfmt(S.dia(l.excluido_em))} ${S.hora(l.excluido_em)}</td><td><b class="clamp2">${esc(l.descricao)}</b><small class="muted">${esc(resumoLix(l.resumo))}</small></td><td class="nw">${esc(l.quem) || '—'}</td><td class="nw">${dias(l.apaga_em) === 0 ? 'hoje' : `em ${dias(l.apaga_em)} dia${dias(l.apaga_em) === 1 ? '' : 's'}`}</td>
      <td class="r"><button class="btn sm" data-act="lixRestaurar" data-id="${l.lote}">${S.svg('voltar')}Restaurar</button></td></tr>`).join('');
    const cartoes = lix.map(l => `<div><span class="tx"><b>${esc(l.descricao)}</b><small>${S.dfmt(S.dia(l.excluido_em))} ${S.hora(l.excluido_em)} · ${esc(l.quem) || '—'} · apaga ${dias(l.apaga_em) === 0 ? 'hoje' : `em ${dias(l.apaga_em)} dias`}</small><small>${esc(resumoLix(l.resumo))}</small></span><button class="btn sm" data-act="lixRestaurar" data-id="${l.lote}">Restaurar</button></div>`).join('');
    return `<section class="card"><div class="hd"><h2>Lixeira</h2><span>${lix.length ? `${lix.length} ${lix.length === 1 ? 'item excluído' : 'itens excluídos'}` : 'vazia'}</span></div>
      <p class="muted small" style="margin:-4px 0 14px">O que é excluído no SONVI fica guardado aqui por 30 dias, com tudo o que foi junto. Restaurar traz de volta como estava. Depois de 30 dias é apagado de vez. Arquivos de mídia enviados no PI não voltam; os links voltam.</p>
      ${!lix.length ? '<p class="muted">Nada foi excluído nos últimos 30 dias.</p>' : S.celular ? `<div class="list">${cartoes}</div>`
        : `<div class="scroll"><table><thead><tr><th>Excluído em</th><th>O que foi excluído</th><th>Quem excluiu</th><th>Apaga de vez</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div>`}</section>`;
  };

  S.views.admin = () => {
    if (ehGer()) aba = 'usuarios';
    // Menu vertical de seções (aprovado em 29/10/2026, quadro "SONVI · Agências, controle e metas", telas 7 e 8): grupos Grupo,
    // Pessoas e Cadastros, cada item com ícone, nome, uma linha de apoio e a quantidade. No celular, a lista é a primeira tela.
    const SECOES = [['Grupo', [['empresa', 'Empresa comercial', 'Dados e modelo da proposta', 'empresa', null], ['veiculos', 'Veículos', 'Quem fatura, OPEC e financeiro', 'veiculos', S.db.veiculos.length]]],
      ['Pessoas', [['colaboradores', 'Colaboradores', 'Equipe, metas e comissão', 'clientes', S.db.colaboradores ? S.db.colaboradores.filter(c => c.ativo).length : null], ['usuarios', 'Usuários e acessos', 'Quem entra e o que vê', 'chave', S.db.usuarios.length]]],
      ['Cadastros', [['agencias', 'Agências', 'Vale em todos os veículos', 'agencias', S.agenciasN ? S.agenciasN() : null], ['lixeira', 'Lixeira', 'Excluídos nos últimos 30 dias', 'lixo', lix ? lix.length : null]]]];
    if (!ehGer()) { if (!lix && !lixBusca) carregarLix(); if (!S.db.colaboradores) carregarColab(); if (S.agenciasN && S.agenciasN() === null) S.agenciasTela(); }   // contadores do menu
    const naCel = !ehGer() && S.celular && celLista;
    const menuAd = ehGer() ? '' : `<nav class="ad-menu menu-desliza" data-menu="admin" aria-label="Seções da administração">${SECOES.map(([g, its]) => `<span class="ad-menu-g">${g}</span>${its.map(([k, n, sub, ic, q]) =>
      `<a href="#/admin" data-cor="${k}" class="ad-menu-i${aba === k && !naCel ? ' on' : ''}" data-act="admAba" data-tab="${k}"${aba === k && !naCel ? ' aria-current="page"' : ''}><span class="ad-menu-ic" aria-hidden="true">${S.svg(ic)}</span><span class="ad-menu-tx"><b>${n}</b><small>${sub}</small></span>${q !== null && q !== undefined ? `<span class="ad-menu-n">${q}</span>` : ''}${S.celular ? `<span class="ad-menu-seta" aria-hidden="true">${S.svg('seta', 16)}</span>` : ''}</a>`).join('')}`).join('')}</nav>`;
    if (naCel) return { title:'<span class="sub">Grupo</span>Administração', actions:'', body:menuAd };
    let body;
    if (aba === 'veiculos') {
      // Lista enxuta (aprovada em 25/10/2026): resumo numa linha, uma linha por veículo (selo, nome e razão social, categorias, sigla,
      // frequência ou praça, cadastro em 5 partes (29/10/2026: sem PIs e sem dados bancários) com o que falta, Editar e ⋯). A cor do veículo só no selo e na barrinha. No celular, linhas compactas.
      const vs = [...S.db.veiculos].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')), ok = (v, k) => !!String(v[k] || '').trim();
      const PARTES = [['logo', 'logo', v => ok(v, 'logo')], ['cnpj', 'CNPJ e razão social', v => ok(v, 'cnpj') && ok(v, 'razao_social')], ['opec', 'e-mail da OPEC', v => ok(v, 'opec_email')], ['fin', 'e-mail do financeiro', v => ok(v, 'financeiro_email')], ['end', 'endereço e telefone', v => ok(v, 'endereco') && ok(v, 'telefone')]];
      const completos = vs.filter(v => PARTES.every(p => p[2](v))).length;
      const cor = v => /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor : S.COR_PADRAO;
      const barra = v => `<span class="adv-l-bar" style="--v:${cor(v)}" aria-hidden="true">${PARTES.map(p => `<i class="${p[2](v) ? 'ok' : ''}"></i>`).join('')}</span>`;
      const onde = v => S.temCategoria(v, 'radio') ? v.frequencia : v.cidade;
      const resumo = `<b>${vs.length} veículo${vs.length === 1 ? '' : 's'}</b> · ${completos} com cadastro completo`;
      const linhas = S.celular
        ? `<div class="adv-l-cel">${vs.map(v => { const falta = PARTES.filter(p => !p[2](v)).length;
            return `<div class="adv-l-c" data-act="admVeiculo" data-id="${v.id}" data-editar="1" aria-label="Editar ${esc(v.nome)}">${S.vav(v)}<span class="adv-l-tx"><b>${esc(v.nome)}</b><small>${S.categorias(v).map(k => esc(S.nomeCategoria(k))).join(' · ')}${v.sigla ? ' · ' + esc(v.sigla) : ''}</small></span>
              <span class="adv-l-dir">${barra(v)}<small>${falta ? `${falta} faltando` : 'Completo'}</small></span></div>`; }).join('')}</div>`
        : `<div class="scroll"><table class="adv-l"><colgroup><col style="width:26%"><col style="width:18%"><col style="width:64px"><col style="width:14%"><col style="width:28%"><col style="width:124px"></colgroup>
            <thead><tr><th>Veículo</th><th>Categorias</th><th>Sigla</th><th>Frequência / praça</th><th>Cadastro</th><th><span class="sr">Ações</span></th></tr></thead><tbody>
            ${vs.map(v => { const falta = PARTES.filter(p => !p[2](v)), txt = falta.length ? 'Falta: ' + falta.map(p => p[1]).join(', ') : 'Completo';
              return `<tr class="click" data-act="admVeiculo" data-id="${v.id}" data-editar="1">
                <td><span class="adv-l-v">${S.vav(v)}<span class="adv-l-tx"><b title="${esc(v.nome)}">${esc(v.nome)}</b><small title="${esc(v.razao_social)}">${esc(v.razao_social) || 'Razão social não informada'}</small></span></span></td>
                <td><span class="adv-l-cats">${S.categorias(v).map(k => `<span class="pill fn-neutra">${esc(S.nomeCategoria(k))}</span>`).join('')}</span></td>
                <td class="nw adv-l-sig">${esc(v.sigla) || '—'}</td><td class="nw adv-l-onde" title="${esc(onde(v))}">${esc(onde(v)) || '—'}</td>
                <td><span class="adv-l-cad">${barra(v)}<small class="${falta.length ? 'falta' : ''}" title="${esc(txt)}">${esc(txt)}</small></span></td>
                <td><span class="lin-acoes"><button class="btn sm" data-act="admVeiculo" data-id="${v.id}" data-editar="1">Editar</button><button class="btn tres" data-act="admVeiculoMenu" data-id="${v.id}" aria-label="Mais opções de ${esc(v.nome)}">${S.svg('mais3')}</button></span></td></tr>`; }).join('')}
            </tbody></table></div>`;
      body = vs.length ? `<section class="card adv-lista"><div class="hd"><div><h2>Veículos</h2><p class="muted small" style="margin:3px 0 0">${resumo}</p></div></div>${linhas}</section>`
        : '<div class="card"><div class="empty"><b>Cadastre o primeiro veículo</b>Rádio, painel de LED, outdoor, front light, empena ou mídia DOOH. Cada veículo tem CNPJ, clientes, PIs e financeiro próprios.</div></div>';
    } else if (aba === 'empresa') {
      // Empresa comercial (aprovada em 25/10/2026): cabeçalho com logo e CNPJ, Endereço · Contato · Quem assina lado a lado,
      // a miniatura de verdade da proposta A4 e a lista compacta dos padrões de cada veículo
      const e = S.db.empresa || {}, curto = String(e.nome || 'Empresa comercial').split('·')[0].trim(), n = S.db.veiculos.length, m = S.modeloProposta(e);
      const kv = (k, val) => `<div><small>${k}</small><span>${val ? esc(val) : '<span class="muted">—</span>'}</span></div>`;
      const marcaDe = v => v.pi_marca === 'comercial' ? esc(curto) : esc(v.nome);
      const falta = [['CNPJ', e.cnpj], ['razão social', e.razao_social], ['CEP', e.cep], ['endereço', e.endereco], ['e-mail', e.email], ['telefone', e.telefone]].filter(x => !String(x[1] || '').trim()).map(x => x[0]);
      const rua = [e.endereco, e.numero].filter(Boolean).join(', ') + (e.complemento ? ' · ' + e.complemento : '');
      const CAB = { fina:'Faixa fina no topo', larga:'Faixa larga com o logo', sem:'Sem faixa' };
      body = `<section class="card em-topo"><span class="em-logo"><img src="${esc(e.logo || S.logoReserva())}" width="600" height="122" alt="Logo da ${esc(curto)}"></span>
          <div class="em-id"><h2>${esc(e.nome || 'Empresa comercial')}</h2><span class="muted">${esc(e.razao_social) || 'Razão social não informada'}</span>
            <div class="em-tags">${e.cnpj ? `<span class="pill fn-neutra">CNPJ ${esc(e.cnpj)}</span>` : ''}${e.inscricao_estadual ? `<span class="pill fn-neutra">IE ${esc(e.inscricao_estadual)}</span>` : ''}<span class="pill fn-neutra">Vende para ${n} veículo${n === 1 ? '' : 's'}</span></div></div>
          ${falta.length ? `<span class="pill em-falta" title="Falta: ${esc(falta.join(', '))}">Falta: ${esc(falta.slice(0, 2).join(', '))}${falta.length > 2 ? ` +${falta.length - 2}` : ''}</span>` : `<span class="pill em-ok">${S.svg('check', 12)}Cadastro completo</span>`}</section>
        <div class="em-grade">
          <div class="em-tres">
            <section class="card em-c"><h2>Endereço</h2><div class="em-kv">${kv('CEP', e.cep)}${kv('Rua e número', rua)}${kv('Bairro · cidade', [e.bairro, e.cidade].filter(Boolean).join(' · '))}</div></section>
            <section class="card em-c"><h2>Contato</h2><div class="em-kv">${kv('E-mail', e.email)}${kv('Telefone', e.telefone)}${kv('Site', e.site)}</div></section>
            <section class="card em-c"><h2>Quem assina</h2><div class="em-kv">${kv('Nas propostas', e.assina === 'consultor' ? 'Quem fez a proposta' : e.responsavel)}${e.assina === 'consultor' ? '' : kv('Cargo', e.cargo)}</div></section>
          </div>
          <section class="card em-c em-mod"><div class="hd"><h2>Modelo da proposta (A4)</h2><button class="btn sm" data-act="admEmpresa" data-aba="modelo">Personalizar</button></div>
            <div class="em-mod-c"><div class="em-a4" aria-hidden="true"><div class="em-a4-in">${S.htmlProposta(amostraProposta())}</div></div>
              <div class="em-kv">${kv('Cores', ' ').replace('<span> </span>', `<span class="em-cores"><i style="background:${esc(e.cor || '#2b5fb5')}"></i><i style="background:${esc(e.cor2 || '#f1853d')}"></i></span>`)}${kv('Cabeçalho', `Logo ${m.logo === 'centro' ? 'no centro' : 'à esquerda'} · ${CAB[m.cabecalho].toLowerCase()}`)}${kv('Rodapé', m.rodape ? 'Dados da empresa' : 'Sem rodapé')}</div></div></section>
        </div>
        <section class="card"><div class="hd"><h2>Propostas e PI por veículo</h2><span>cada veículo tem os seus</span></div>
          <div class="list">${S.db.veiculos.map(v => `<div>${S.vav(v)}<span class="tx"><b>${esc(v.nome)}</b><small>Faixa ${esc(v.prop_faixa || '07h às 19h')} · PI com a marca ${marcaDe(v)} · validade ${v.prop_validade || 15} dias</small></span><button class="btn sm" data-act="admPropostas" data-id="${v.id}" aria-label="Editar propostas e PI da ${esc(v.nome)}">${S.svg('editar')}Editar</button></div>`).join('')}</div></section>`;
    } else if (aba === 'colaboradores') {
      body = telaColaboradores();
    } else if (aba === 'lixeira') {
      body = telaLixeira();
    } else if (aba === 'agencias') {
      // Agências do grupo (29/10/2026): cadastro único, vale em todos os veículos (agencias.js)
      body = S.agenciasTela().body;
    } else {
      // Gerente vê a equipe das rádios em que é gerente (ele mesmo e outros gerentes aparecem, só para consulta)
      const us = ehGer() ? S.db.usuarios.filter(u => vinculosDe(u).some(x => ehMinha(x.veiculo_id))) : S.db.usuarios;
      // Diretor (aprovado em 24/10/2026): "Quem acessa o quê", pessoas nas linhas e veículos nas colunas, com o perfil em cada um
      const vsU = S.db.veiculos, cor = v => /^#[0-9a-f]{6}$/i.test(v.cor || '') ? v.cor : S.COR_PADRAO;
      const matriz = `<section class="card"><div class="hd"><h2>Quem acessa o quê</h2><span>cada linha é uma pessoa; cada coluna, um veículo</span></div><div class="scroll ad-mz"><table><thead><tr><th>Pessoa</th>${vsU.map(v => `<th class="c" title="${esc(v.nome)}">${S.vav(v)}<span>${esc(v.sigla || v.nome)}</span></th>`).join('')}<th>Último acesso</th><th><span class="sr">Opções</span></th></tr></thead><tbody>
        ${us.map(u => { const vin = Object.fromEntries(vinculosDe(u).map(x => [x.veiculo_id, x.perfil]));
          return `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><div class="ad-p"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span><b>${esc(u.nome) || '—'}</b><small>${esc(u.email)}</small></span></div></td>
            ${u.diretor ? `<td colspan="${vsU.length}"><span class="ad-pp dir">Diretor · todos os veículos</span></td>` : vsU.map(v => `<td class="c">${vin[v.id] ? `<span class="ad-pp" style="--v:${cor(v)}">${esc(S.PERFIS[vin[v.id]] || vin[v.id])}</span>` : '<span class="ad-pp vazio" aria-label="sem acesso">—</span>'}</td>`).join('')}
            <td><div class="ad-ult"><span class="nw">${ultimo(u)}</span>${u.ativo && u.ultimo_acesso && !u.trocar_senha ? '' : situacao(u)}</div></td><td class="r"><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></td></tr>`; }).join('')}</tbody></table></div></section>`;
      body = !ehGer() && !S.celular ? matriz : S.celular
        ? `<div class="card"><div class="list">${us.map(u => `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome) || '—'}</b><small>${acessoTexto(u)}</small><small>Último acesso: ${ultimo(u)}</small><span style="margin-top:4px">${situacao(u)}</span></span><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></div>`).join('')}</div></div>`
        : `<div class="card"><div class="scroll"><table><thead><tr><th>Usuário</th><th>Situação</th><th>Último acesso</th><th>Rádios e perfis</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${us.map(u =>
          `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><div><b>${esc(u.nome) || '—'}</b><div class="muted small">${esc(u.email)}${u.celular ? ' · ' + esc(u.celular) : ''}</div></div></div></td><td>${situacao(u)}</td><td class="nowrap">${ultimo(u)}</td><td>${acessoTexto(u, '<br>')}</td><td class="r"><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    // Os acessos da equipe SONVI saíram daqui em 25/10/2026: ficam no Dashboard Gestão › Suporte (chamados.js)
    if (ehGer()) return { title:`<span class="sub">${esc(minhas().map(v => v.nome).join(' · '))}</span>Usuários`, actions:`<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`,
      body:`<p class="muted small" style="margin:0 0 14px">Você cadastra e edita consultores, OPEC, financeiro, programadores e locutores das rádios em que é gerente. Gerentes e diretores ficam com o diretor.</p>${body}` };
    return { title:'<span class="sub">Grupo</span>Administração', actions:aba === 'lixeira' ? '' : aba === 'agencias' ? `<button class="btn pri" data-act="agNova">${S.svg('mais')}Nova agência</button>` : aba === 'empresa' ? `<button class="btn pri" data-act="admEmpresa">${S.svg('editar')}Editar dados</button>` : aba === 'colaboradores' ? `<button class="btn pri" data-act="colNovo">${S.svg('mais')}Novo colaborador</button>` : aba === 'veiculos' ? `<button class="btn pri" data-act="admVeiculo">${S.svg('mais')}Novo veículo</button>` : `<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`, body:S.celular ? `<a href="#/admin" class="ad-voltar" data-act="admVoltar">${S.svg('esq', 16)}Administração</a>${body}` : `<div class="ad-lay">${menuAd}<div class="ad-corpo">${body}</div></div>` };
  };

  // Categoria do veículo no formulário: Frequência e Rede afiliada só aparecem para rádio
  const ICONE_CAT = { radio:'music', led:'paineis', outdoor:'imagem', frontlight:'imagem', empena:'imagem', dooh:'paineis' };
  // Marque tudo o que o veículo vende (ex.: Media On = painel de LED e mídia DOOH); a lista vai num campo escondido
  const campoCategoria = (v, travado) => `<fieldset class="cat-escolha" style="grid-column:1/-1"><legend class="form-sec">Categorias <span class="cat-dica">marque tudo o que o veículo vende</span></legend><div class="cat-ops">${S.CATEGORIAS.map(([k, n]) =>
    `<label class="cat-op"><input type="checkbox" data-cat="${k}"${S.temCategoria(v, k) ? ' checked' : ''}${travado ? ' disabled data-trava="1"' : ''}><span>${S.svg(ICONE_CAT[k] || 'imagem')}${n}</span></label>`).join('')}</div>
    <input type="hidden" name="categorias" value="${S.categorias(v).join(',')}"><small class="aviso" id="catAviso"></small></fieldset>`;
  const ajustarCategoria = () => { const f = document.querySelector('#dlg form'); if (!f || !f.querySelector('[data-cat]')) return;
    const marcadas = [...f.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat); f.elements.categorias.value = marcadas.join(',');
    const cat = marcadas[0] || 'radio', radio = marcadas.includes('radio');
    ['frequencia', 'rede_afiliada'].forEach(k => { const el = f.elements[k]; if (el) el.closest('label').hidden = !radio; });
    const cid = f.elements.cidade; if (cid) { const lb = cid.closest('label'); lb.firstChild.textContent = radio ? 'Cidade / praça' : 'Praça / cidade de atuação'; cid.placeholder = radio ? 'Ex.: Cuiabá / MT' : 'Ex.: Cuiabá e Várzea Grande / MT'; }
    const sg = f.elements.sigla; if (sg) sg.placeholder = { radio:'Ex.: VERDE', led:'Ex.: LEDCPA', outdoor:'Ex.: OUTH14', frontlight:'Ex.: FLCENTRO', empena:'Ex.: EMPCPA', dooh:'Ex.: MEDIAON' }[cat];
    const nm = f.elements.nome; if (nm) nm.placeholder = { radio:'Ex.: Rádio Verde', led:'Ex.: LED Av. do CPA', outdoor:'Ex.: Outdoor Head 14', frontlight:'Ex.: Front light Centro', empena:'Ex.: Impacto', dooh:'Ex.: Media On' }[cat];
    const av = document.getElementById('catAviso'); if (av) av.textContent = marcadas.length ? '' : 'Marque ao menos uma categoria.';
    f.onchange = e => { if (e.target.dataset && e.target.dataset.cat) ajustarCategoria(); }; };

  Object.assign(S.actions, {
    admVeiculoMenu: (d, botao) => S.menu(botao, [{ label:'Editar veículo', icon:'editar', act:'admVeiculo', data:{ id:d.id, editar:'1' } },
      ...(() => { const v = S.veh(d.id) || {}, f = k => !String(v[k] || '').trim(); return f('logo') || f('cnpj') || f('razao_social') || f('opec_email') || f('dados_bancarios') || f('endereco') || f('telefone') ? [{ label:'Completar cadastro', icon:'check', act:'admVeiculo', data:{ id:d.id, editar:'1' } }] : []; })(),
      { label:'Propostas e PI', icon:'propostas', act:'admPropostas', data:{ id:d.id } }, { label:'Textos do PI', icon:'pis', act:'admTextosPI', data:{ id:d.id } }]),
    admVoltar: () => { celLista = true; S.render(); },
    lixRestaurar: async d => { const l = (lix || []).find(x => String(x.lote) === String(d.id)); if (!l) return;
      if (!await S.confirmar(`Restaurar "${l.descricao}"?\n\nVolta tudo o que foi excluído junto (${resumoLix(l.resumo) || 'o item'}), como estava.`, { ok:'Restaurar' })) return;
      await S.run(async () => { await S.q(S.sb.rpc('lixeira_restaurar', { p_lote:Number(l.lote) })); lix = lix.filter(x => x !== l); await S.recarregar(); if (S.agenciasRecarregar) S.agenciasRecarregar(); }, { titulo:'Restaurado', sub:l.descricao });
      carregarLix(); },
    admAba: d => { aba = d.tab; celLista = false; if (aba === 'lixeira') carregarLix(); if (aba === 'agencias' && S.agenciasRecarregar) S.agenciasRecarregar(); S.render(); },
    admVeiculo: d => { const v = d.id ? S.veh(d.id) : {};
      S.form(v.id ? esc(v.nome) : 'Novo veículo', [
        { html:campoCategoria(v, !!v.id && !d.editar) },
        { html:'<b class="form-sec">Veículo</b>' },
        { html:S.campoLogo(v, !!v.id && !d.editar) },
        { k:'nome', label:'Nome do veículo', req:true, ph:'Ex.: Rádio Verde' }, { k:'sigla', label:'Sigla do PI', req:true, ph:'Ex.: VERDE' },
        { k:'frequencia', label:'Frequência', ph:'Ex.: 101,9 FM' }, { k:'rede_afiliada', label:'Rede afiliada', ph:'Ex.: CBN, Jovem Pan' },
        { k:'cidade', label:'Cidade / praça', full:true, ph:'Ex.: Cuiabá / MT' },
        { html:'<b class="form-sec">Quem fatura</b>' },
        { k:'razao_social', label:'Razão social', ph:'Como consta no CNPJ' }, { k:'cnpj', label:'CNPJ' }, { k:'inscricao_estadual', label:'Inscrição estadual' }, { k:'cep', label:'CEP' },
        { k:'endereco', label:'Endereço', full:true }, { k:'telefone', label:'Telefone' },
        // Só dois e-mails no veículo (29/10/2026): o da OPEC e o do financeiro (o e-mail geral saiu; o PI impresso mostra o do financeiro)
        { k:'opec_email', label:'E-mail da OPEC (recebe os PIs)', type:'email', full:true, ph:'opec@empresa.com.br' }, { k:'financeiro_email', label:'E-mail do financeiro (recebe os pedidos de faturamento e confirma os pagamentos; sai no PI impresso)', type:'email', full:true, ph:'financeiro@empresa.com.br' }], v,
        f => { const cats = String(f.categorias || '').split(',').filter(k => S.CATEGORIAS.some(c => c[0] === k));
          if (!cats.length) throw new Error('Marque ao menos uma categoria do veículo.');
          return S.run(async () => { const row = Object.assign({}, f, { categorias:cats, sigla:f.sigla.toUpperCase().trim(), logo:f.logo || null, cor:(f.cor || S.COR_PADRAO).toLowerCase() });
          delete row.categoria; if (!cats.includes('radio')) { row.frequencia = ''; row.rede_afiliada = ''; } if (v.id) row.id = v.id;
          const novo = await S.salvar('veiculos', row); if (!v.id) { S.ui.vehicleId = novo.id; S.guardarRadio(novo.id); await S.carregarVeiculo(); } }, 'Veículo salvo'); }, 'Salvar', { editar:!!d.editar }); ajustarCategoria(); },
    // Textos que saem no PI impresso desta rádio: papel, cidade, condição de pagamento e condições gerais
    admTextosPI: d => { const v = S.veh(d.id);
      S.form(`Textos do PI · ${esc(v.nome)}`, [
        { k:'pi_papel', label:'Tamanho do papel', type:'select', options:[['legal', 'Ofício (Legal), deitado'], ['a4', 'A4, deitado']] },
        { k:'pi_cidade', label:'Cidade da assinatura e do foro', ph:'Ex.: Cuiabá/MT' },
        { k:'pi_pagamento', label:'Condição de pagamento padrão (sai no quadro de pagamento)', full:true, ph:'Ex.: Faturamento no mês da veiculação, vencimento dia 15 do mês seguinte' },
        { k:'pi_condicoes', label:'Condições gerais (dizeres obrigatórios no rodapé do PI) · uma cláusula por linha; {RADIO} e {CIDADE} viram o nome da rádio e a cidade', type:'textarea' },
        { html:`<div class="row mid" style="grid-column:1/-1;gap:10px"><button type="button" class="btn sm" data-act="admTextoPadrao">Usar o texto padrão do SONVI</button><span class="muted small">Revise cláusulas, prazos e multas com o jurídico da rádio. PIs já exportados não mudam.</span></div>` }],
        Object.assign({}, v, { pi_papel:v.pi_papel || 'legal', pi_cidade:v.pi_cidade || v.cidade || '', pi_condicoes:v.pi_condicoes || S.PI_CONDICOES_PADRAO }),
        f => S.run(async () => { const txt = (f.pi_condicoes || '').trim();
          await S.salvar('veiculos', { id:v.id, pi_papel:f.pi_papel, pi_cidade:(f.pi_cidade || '').trim(), pi_pagamento:(f.pi_pagamento || '').trim(), pi_condicoes:txt === S.PI_CONDICOES_PADRAO.trim() ? '' : txt }); }, 'Textos do PI salvos'), 'Salvar', { editar:true });
      const ta = document.querySelector('#dlg textarea[name=pi_condicoes]'); if (ta) ta.classList.add('alto');
      document.getElementById('dlg').classList.add('largo'); const dl = document.getElementById('dlg'), antes = dl.onclose; dl.onclose = e => { dl.classList.remove('largo'); if (antes) antes(e); }; },
    // Empresa comercial (Head 14): dados e logo que saem nas propostas e nos PIs com a marca dela
    // Empresa comercial (aprovada em 25/10/2026): janela larga com duas abas, Dados (Empresa · Endereço · Contato · Quem assina)
    // e Modelo da proposta (cores, cabeçalho, textos e o que aparece), com a folha A4 mudando ao lado
    admEmpresa: (d = {}) => { const e = S.db.empresa || {}, m = S.modeloProposta(e), n = S.db.veiculos.length;
      const c = (k, rot, cls, extra = '') => `<label class="f ${cls}">${rot}<input name="${k}" value="${esc(e[k] || '')}"${extra}></label>`;
      const cores = (k, val, lista) => `<div class="em-cores-ed" role="group" aria-label="${k === 'cor' ? 'Cor principal' : 'Cor de destaque'}">${lista.map(x => `<button type="button" class="em-cor${x.toLowerCase() === String(val).toLowerCase() ? ' on' : ''}" data-act="empCor" data-k="${k}" data-v="${x}" style="background:${x}" aria-label="Cor ${x}" aria-pressed="${x.toLowerCase() === String(val).toLowerCase()}"></button>`).join('')}<label class="em-cor-livre" title="Outra cor">${S.svg('editar', 14)}<span class="sr">Outra cor</span><input type="color" name="${k}" value="${esc(val)}"></label></div>`;
      const opc = (k, val, lista) => `<div class="em-opc" role="radiogroup">${lista.map(([v, rot]) => `<label class="em-op"><input type="radio" name="m_${k}" value="${v}"${v === val ? ' checked' : ''}><span>${rot}</span></label>`).join('')}</div>`;
      const chave = (k, rot) => `<label class="em-ch"><span>${rot}</span><input type="checkbox" name="m_${k}"${m[k] ? ' checked' : ''}><i aria-hidden="true"></i></label>`;
      S.dialog(`<div class="em-j-hd"><h2>Empresa comercial</h2><span class="muted small">vale para ${n === 1 ? 'o veículo' : `os ${n} veículos`}</span></div>
        <div class="em-abas" role="tablist"><button type="button" role="tab" data-act="empAba" data-v="dados" aria-selected="${d.aba !== 'modelo'}">Dados</button><button type="button" role="tab" data-act="empAba" data-v="modelo" aria-selected="${d.aba === 'modelo'}">Modelo da proposta</button></div>
        <div class="em-painel" data-painel="dados"${d.aba === 'modelo' ? ' hidden' : ''}>
          <div class="logo-campo"><div class="emp-prev pr-logo" id="empPrev"><img src="${esc(e.logo || S.logoReserva())}" width="600" height="122" alt="Logo atual"></div>
            <div class="logo-info"><b>Logo</b><small class="muted">Horizontal, PNG ou JPG com fundo branco ou transparente. Sai nas propostas e nos PIs.</small>
            <div class="row"><button type="button" class="btn sm" data-act="empLogoEscolher">${S.svg('baixar')}Trocar logo</button></div><small class="aviso" id="empAviso"></small></div>
            <input type="file" accept="image/png,image/jpeg,image/webp" id="empLogoArq" hidden><input type="hidden" name="logo" value="${esc(e.logo || '')}"></div>
          <div class="em-blocos">
            <fieldset class="em-bl"><legend>Empresa</legend><div class="em-g">
              <label class="f s3">CNPJ<span class="em-com"><input name="cnpj" value="${esc(e.cnpj || '')}" data-mask="cnpj" inputmode="numeric" autocomplete="off"><button type="button" class="btn sm" data-act="empCnpj">Buscar</button></span></label>
              ${c('inscricao_estadual', 'Inscrição estadual', 's3', ' placeholder="Somente números ou Isento"')}
              ${c('razao_social', 'Razão social', 's6')}
              <label class="f s6">Nome que aparece no SONVI<input name="nome" required value="${esc(e.nome || '')}" placeholder="Ex.: Head 14"></label></div></fieldset>
            <fieldset class="em-bl"><legend>Endereço</legend><div class="em-g">
              ${c('cep', 'CEP', 's2', ' data-mask="cep" inputmode="numeric" autocomplete="off"')}${c('endereco', 'Rua / avenida', 's4')}
              ${c('numero', 'Número', 's2')}${c('complemento', 'Complemento', 's4', ' placeholder="Sala, andar…"')}
              ${c('bairro', 'Bairro', 's3')}${c('cidade', 'Cidade / UF', 's3', ' placeholder="Ex.: Cuiabá / MT"')}</div></fieldset>
            <fieldset class="em-bl"><legend>Contato</legend><div class="em-g">
              ${c('email', 'E-mail', 's6', ' type="email"')}${c('telefone', 'Telefone', 's3', ' data-mask="tel" inputmode="tel" autocomplete="off"')}${c('site', 'Site', 's3', ' placeholder="Ex.: head14.com.br"')}</div></fieldset>
            <fieldset class="em-bl"><legend>Quem assina as propostas</legend><div class="em-g">
              <label class="f s6">Assina<select name="assina"><option value="responsavel"${e.assina !== 'consultor' ? ' selected' : ''}>O responsável abaixo</option><option value="consultor"${e.assina === 'consultor' ? ' selected' : ''}>Quem fez a proposta</option></select></label>
              ${c('responsavel', 'Responsável', 's3', ' placeholder="Nome de quem assina"')}${c('cargo', 'Cargo', 's3', ' placeholder="Ex.: Diretor"')}</div></fieldset>
          </div></div>
        <div class="em-painel em-modelo" data-painel="modelo"${d.aba === 'modelo' ? '' : ' hidden'}>
          <div class="em-mod-ops">
            <fieldset class="em-bl"><legend>Cores</legend><div class="em-g">
              <div class="f s3"><span>Principal <small class="muted">(faixas e tabela)</small></span>${cores('cor', e.cor || '#2b5fb5', ['#2b5fb5', '#111114', '#0f766e', '#7c2d12', '#6d28d9'])}</div>
              <div class="f s3"><span>Destaque <small class="muted">(detalhes)</small></span>${cores('cor2', e.cor2 || '#f1853d', ['#f1853d', '#0055ff', '#15803d', '#d4a017', '#db2777'])}</div></div></fieldset>
            <fieldset class="em-bl"><legend>Cabeçalho</legend>
              <div class="f"><span>Posição do logo</span>${opc('logo', m.logo, [['esquerda', 'Esquerda'], ['centro', 'Centro']])}</div>
              <div class="f"><span>Estilo</span>${opc('cabecalho', m.cabecalho, [['fina', 'Faixa fina no topo'], ['larga', 'Faixa larga com o logo'], ['sem', 'Sem faixa']])}</div></fieldset>
            <fieldset class="em-bl"><legend>Textos</legend>
              <label class="f">Apresentação <small class="muted">(abre a proposta; {CLIENTE} vira o nome do cliente; opcional)</small><textarea name="m_apresentacao" rows="2" placeholder="Ex.: Obrigado pela oportunidade. Segue a proposta preparada para {CLIENTE}.">${esc(m.apresentacao)}</textarea></label>
              <label class="f">Condições comerciais padrão <small class="muted">(uma por linha; {VALIDADE} vira os dias; vale quando o veículo não tem as próprias)</small><textarea name="m_condicoes" rows="4" placeholder="${esc(S.PROP_CONDICOES_PADRAO)}">${esc(m.condicoes)}</textarea></label></fieldset>
            <fieldset class="em-bl"><legend>Mostrar na folha</legend>${chave('tabela', 'Valor de tabela e desconto')}${chave('dados_cliente', 'CNPJ e endereço do cliente')}${chave('ass_cliente', 'Linha de assinatura do cliente')}${chave('rodape', 'Rodapé com razão social, CNPJ e contato')}</fieldset>
          </div>
          <div class="em-previa" aria-label="Prévia da proposta"><small class="muted">Prévia com um cliente de exemplo</small><div class="em-previa-box"><div class="em-previa-folha"></div></div></div>
        </div>
        <div class="row em-pe"><span class="grow"></span><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn pri" value="ok">Salvar</button></div>`,
        f => S.run(async () => {
          const modelo = { logo:f.m_logo || 'esquerda', cabecalho:f.m_cabecalho || 'fina', apresentacao:(f.m_apresentacao || '').trim(), condicoes:(f.m_condicoes || '').trim(),
            tabela:!!f.m_tabela, dados_cliente:!!f.m_dados_cliente, ass_cliente:!!f.m_ass_cliente, rodape:!!f.m_rodape };
          const row = { nome:f.nome.trim(), razao_social:f.razao_social || '', cnpj:f.cnpj || '', inscricao_estadual:f.inscricao_estadual || '', cep:f.cep || '', endereco:f.endereco || '', numero:f.numero || '',
            complemento:f.complemento || '', bairro:f.bairro || '', cidade:f.cidade || '', email:f.email || '', telefone:f.telefone || '', site:f.site || '', assina:f.assina, responsavel:f.responsavel || '', cargo:f.cargo || '',
            cor:f.cor || '#2b5fb5', cor2:f.cor2 || '#f1853d', logo:f.logo || null, modelo, atualizado_em:new Date().toISOString() };
          S.db.empresa = e.id ? await S.q(S.sb.from('empresa_comercial').update(row).eq('id', e.id).select().single()) : await S.q(S.sb.from('empresa_comercial').insert(row).select().single()); }, 'Empresa comercial salva'));
      const dl = document.getElementById('dlg'); dl.dataset.guarda = '1'; dl.classList.add('em-dlg');
      const antes = dl.onclose; dl.onclose = ev => { dl.classList.remove('em-dlg'); window.removeEventListener('resize', previa); if (antes) antes(ev); };
      dl.querySelector('form').addEventListener('input', previa); dl.querySelector('form').addEventListener('change', previa); window.addEventListener('resize', previa);
      requestAnimationFrame(previa); },
    colNovo: () => { aba = 'colaboradores'; formColab({ ativo:true, funcao:'consultor' }); },
    colEditar: d => { const c = (S.db.colaboradores || []).find(x => x.id === d.id); if (c) formColab(c); },
    colDesligados: () => { col.desligados = !col.desligados; S.render(); },
    colMenu: (d, botao) => { const c = (S.db.colaboradores || []).find(x => x.id === d.id); if (!c) return;
      S.menu(botao, [{ label:'Editar', icon:'editar', act:'colEditar', data:{ id:c.id } }, { label:c.ativo ? 'Desligar' : 'Religar', icon:c.ativo ? 'voltar' : 'check', act:'colAtivo', data:{ id:c.id } }, '-', { label:'Excluir cadastro', icon:'lixo', act:'colExcluir', data:{ id:c.id }, perigo:true }]); },
    colAtivo: async d => { const c = S.db.colaboradores.find(x => x.id === d.id), ativo = !c.ativo;
      if (!ativo && !await S.confirmar(`Desligar ${c.nome}?\n\nO cadastro e o histórico de comissão ficam guardados. ${c.usuario_id ? 'O acesso ao SONVI não muda: para bloquear, desative o usuário na aba Usuários.' : ''}`, { ok:'Desligar' })) return;
      S.run(async () => { await S.q(S.sb.from('colaboradores').update({ ativo }).eq('id', c.id)); S.db.colaboradores = null; await carregarColab(); }, ativo ? 'Colaborador religado' : 'Colaborador desligado'); },
    colExcluir: async d => { const c = S.db.colaboradores.find(x => x.id === d.id);
      if (!await S.confirmar(`Excluir o cadastro de ${c.nome}?\n\nApaga também o histórico de comissão. Vendas e PIs não mudam. ${c.usuario_id ? 'O acesso ao SONVI continua (é da aba Usuários).' : ''} Para só tirar da lista, use Desligar.`, { ok:'Excluir', perigo:true })) return;
      S.run(async () => { await S.q(S.sb.from('colaboradores').delete().eq('id', c.id)); S.db.colaboradores = null; await carregarColab(); }, 'Cadastro excluído'); },
    empAba: d => { const dl = document.getElementById('dlg');
      dl.querySelectorAll('.em-abas [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === d.v)));
      dl.querySelectorAll('.em-painel').forEach(p => { p.hidden = p.dataset.painel !== d.v; }); previa(); },
    empCor: d => { const dl = document.getElementById('dlg'), inp = dl.querySelector(`input[name="${d.k}"]`); inp.value = d.v; dl.dataset.sujo = '1';
      dl.querySelectorAll(`[data-act="empCor"][data-k="${d.k}"]`).forEach(b => { const on = b.dataset.v === d.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); previa(); },
    empCnpj: () => { const f = document.querySelector('#dlg form'), n = String(f.cnpj.value).replace(/\D/g, ''), b = f.querySelector('[data-act="empCnpj"]');
      if (n.length !== 14) return S.erroNoCampo(f.cnpj, 'Digite os 14 números do CNPJ.');
      if (!S.dadosDoCnpj) return S.toast('Busca de CNPJ indisponível agora.');
      b.disabled = true; b.textContent = 'Buscando…';
      S.dadosDoCnpj(n).then(j => { const poe = (k, v) => { if (v && f.elements[k]) f.elements[k].value = v; };
        poe('razao_social', j.razao_social); if (!f.nome.value) poe('nome', j.nome_fantasia || j.razao_social);
        poe('cep', String(j.cep || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')); poe('endereco', j.logradouro ? [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ') : ''); poe('numero', j.numero); poe('complemento', j.complemento); poe('bairro', j.bairro);
        poe('cidade', [j.municipio, j.uf].filter(Boolean).join(' / ')); document.getElementById('dlg').dataset.sujo = '1'; S.toast('Dados do CNPJ preenchidos. Confira antes de salvar.'); })
        .catch(er => S.toast(er.message === 'naoexiste' ? 'CNPJ não encontrado na Receita.' : 'Não foi possível buscar agora. Preencha à mão.'))
        .finally(() => { b.disabled = false; b.textContent = 'Buscar'; }); },
    empLogoEscolher: () => document.getElementById('empLogoArq').click(),
    // Padrões de proposta e PI de cada rádio
    admPropostas: d => { const v = S.veh(d.id), curto = String((S.db.empresa || {}).nome || 'Empresa comercial').split('·')[0].trim();
      S.form(`Propostas e PI · ${esc(v.nome)}`, [
        { k:'prop_faixa', label:'Faixa comercial padrão', ph:'Ex.: 07h às 19h' },
        { k:'pi_marca', label:'PI sai com a marca de (padrão)', type:'select', options:[['comercial', curto], ['radio', v.nome]] },
        { html:'<p class="muted small" style="grid-column:1/-1;margin-top:-6px">A faixa vai em cada item de rotativo da proposta e sai escrita no PI, para a OPEC lançar no Pulsar. A marca dá para trocar em cada PI.</p>' },
        { k:'prop_validade', label:'Validade padrão da proposta (dias)', type:'number' },
        { k:'prop_condicoes', label:'Condições comerciais padrão · uma por linha; {VALIDADE} vira o número de dias', type:'textarea' }],
        Object.assign({}, v, { prop_faixa:v.prop_faixa || '07h às 19h', pi_marca:v.pi_marca || 'radio', prop_validade:v.prop_validade || 15, prop_condicoes:v.prop_condicoes || S.PROP_CONDICOES_PADRAO }),
        f => { const val = parseInt(f.prop_validade);
          if (!(val >= 1 && val <= 365)) { S.actions.admPropostas(d); return S.erroNoCampo('prop_validade', 'Use de 1 a 365 dias.'); }
          S.run(async () => { const txt = (f.prop_condicoes || '').trim();
            await S.salvar('veiculos', { id:v.id, prop_faixa:(f.prop_faixa || '').trim() || '07h às 19h', pi_marca:f.pi_marca, prop_validade:val, prop_condicoes:txt === S.PROP_CONDICOES_PADRAO.trim() ? '' : txt }); }, 'Padrões de proposta salvos'); }, 'Salvar', { editar:true });
      const n = document.querySelector('#dlg [name=prop_validade]'); if (n) { n.min = 1; n.max = 365; } },
    admTextoPadrao: () => { const ta = document.querySelector('#dlg textarea[name=pi_condicoes]'); if (ta) ta.value = S.PI_CONDICOES_PADRAO; },
    admUsuario: d => formUsuario(d.id ? S.db.usuarios.find(x => x.id === d.id) : {}, false),
    admUsuarioMenu: (d, botao) => { const u = S.db.usuarios.find(x => x.id === d.id), eu = u.id === S.me.id, pode = podeCuidar(u);
      const ativar = u.ativo ? { label:'Desativar acesso', icon:'bloqueio', act:'admAtivo', data:{ id:u.id } } : { label:'Reativar acesso', icon:'check', act:'admAtivo', data:{ id:u.id } };
      S.menu(botao, [pode ? { label:'Editar', icon:'editar', act:'admUsuarioEditar', data:{ id:u.id } } : { label:'Ver', icon:'editar', act:'admUsuario', data:{ id:u.id } },
        ...(eu ? [{ label:'Trocar minha senha', icon:'chave', act:'admMinhaSenha', data:{} }] : pode ? [{ label:'Gerar nova senha provisória', icon:'whats', act:'admSenha', data:{ id:u.id } }] : []),
        ...(eu || !pode ? [] : ehGer() ? (soNasMinhas(u) ? ['-', ativar] : [])
          : ['-', ativar, { label:'Excluir usuário', icon:'lixo', act:'admExcluir', data:{ id:u.id }, perigo:true }])]); },
    // Excluir (só o diretor): escolhe para quem vão clientes, propostas, PIs e follow-ups da pessoa
    admExcluir: d => { const u = S.db.usuarios.find(x => x.id === d.id), nome = u.nome || u.email;
      const outros = S.db.usuarios.filter(x => x.id !== u.id && x.ativo).sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || String(a.nome).localeCompare(b.nome));
      S.form(`Excluir ${esc(nome)}`, [
        { html:`<p style="grid-column:1/-1;margin:0">O usuário é apagado de vez e não consegue mais entrar. <b>Os clientes, as propostas e os PIs continuam no SONVI.</b></p>` },
        { k:'para', label:`Os clientes, propostas, PIs e follow-ups de ${nome.split(' ')[0]} passam para`, type:'select', full:true,
          options:[...outros.map(x => [x.id, (x.nome || x.email) + (x.id === S.me.id ? ' (você)' : x.diretor ? ' (diretor)' : '')]), ['', 'Ninguém: ficam sem responsável e os follow-ups são apagados']] },
        { html:'<p class="muted small" style="grid-column:1/-1;margin:0">Não dá para desfazer. Se a pessoa pode voltar, prefira "Desativar acesso".</p>' }],
        { para:S.me.id },
        f => S.run(async () => { const r = await servidor({ acao:'excluir', usuario_id:u.id, para:f.para || null }); await S.recarregar();
          const p = r.passou || {}, n = (p.clientes || 0) + (p.propostas || 0) + (p.pis || 0);
          if (n && f.para) S.salvo(`Usuário ${nome} excluído. ${p.clientes || 0} cliente(s), ${p.propostas || 0} proposta(s) e ${p.pis || 0} PI(s) passaram para ${(S.db.usuarios.find(x => x.id === f.para) || {}).nome || 'o novo responsável'}.`);
          else S.salvo('Usuário excluído', { sub:nome }); }), 'Excluir usuário', { editar:true });
      const ok = document.querySelector('#dlg button[value=ok]'); if (ok) ok.classList.add('perigo'); },
    admUsuarioEditar: d => formUsuario(S.db.usuarios.find(x => x.id === d.id), true),
    admSenha: async d => { const u = S.db.usuarios.find(x => x.id === d.id);
      if (!await S.confirmar(`Gerar uma nova senha provisória para ${u.nome || u.email}?\n\nA senha atual deixa de valer na hora e a pessoa cria uma nova no próximo acesso.`, { ok:'Gerar senha' })) return;
      S.run(async () => { const r = await servidor({ acao:'senha', usuario_id:u.id }); await S.carregarBase(); S.render(); mostrarSenha(u, r.senha, false); }); },
    admMinhaSenha: () => S.trocarMinhaSenha(),
    admEnviarAcesso: (d, el) => { el.disabled = true;
      S.run(async () => { try { const r = await servidor({ acao:'enviar_acesso', usuario_id:d.id, senha:d.senha }); el.innerHTML = `${S.svg('check')}Enviado`; S.toast(`Dados de acesso enviados para ${r.email}`); } catch (e) { el.disabled = false; throw e; } }); },
    admAtivo: async d => { const u = S.db.usuarios.find(x => x.id === d.id), ativo = !u.ativo;
      if (!ativo && !await S.confirmar(`Desativar o acesso de ${u.nome || u.email}? A pessoa sai do sistema e não consegue mais entrar; o histórico dela continua no SONVI.`, { ok:'Desativar acesso', perigo:true })) return;
      // Primeiro o cadastro (regras do banco), depois a conta de entrada: bloqueada, ela é desconectada e não entra mais
      S.run(async () => { await S.q(S.sb.rpc('salvar_usuario', { p_usuario:u.id, p_nome:u.nome || u.email, p_celular:u.celular || '', p_ativo:ativo, p_diretor:u.diretor, p_vinculos:vinculosDe(u).map(x => ({ veiculo_id:x.veiculo_id, perfil:x.perfil })) }));
        await servidor({ acao:'ativo', usuario_id:u.id, ativo }); await S.carregarBase(); }, ativo ? 'Acesso reativado' : 'Acesso desativado'); },
    admCopiar: d => { navigator.clipboard.writeText(d.texto || d.link).then(() => S.toast('Mensagem copiada'), () => S.toast('Não foi possível copiar; selecione o link e copie.')); },
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'empLogoArq' || !e.target.files[0]) return;
    const arq = e.target.files[0], aviso = document.getElementById('empAviso');
    if (!/^image\/(png|jpe?g|webp)$/.test(arq.type)) { aviso.textContent = 'Use uma imagem PNG, JPG ou WebP.'; return; }
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const k = Math.min(1, 900 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let u = c.toDataURL('image/webp', .92); if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/png');
      const f = document.querySelector('#dlg form'); f.logo.value = u; document.getElementById('empPrev').innerHTML = `<img src="${u}" width="${c.width}" height="${c.height}" alt="Logo novo">`; previa();
      aviso.textContent = img.naturalWidth < 400 ? 'A imagem é pequena: pode sair borrada no PDF. O ideal é ter 600 px de largura ou mais.' : ''; document.getElementById('dlg').dataset.sujo = '1'; };
    img.onerror = () => { URL.revokeObjectURL(url); aviso.textContent = 'Não foi possível abrir essa imagem.'; };
    img.src = url;
  });
  // Diretor esconde a lista de rádios (vê todas)
  document.addEventListener('change', e => { if (!e.target.dataset.funcao) return; const a = e.target.closest('form').querySelector('.acessos'); if (a) a.hidden = e.target.value === 'diretor'; });
})();

// SONVI · administração: veículos do grupo e usuários com o perfil em cada rádio.
// Diretor: tudo. Gerente: só a aba Usuários, nas rádios em que é gerente (consultor, OPEC, financeiro, programador e locutor).
// Quem garante é o banco (salvar_usuario, pode_gerenciar_usuario) e a função usuarios; aqui a tela só acompanha.
(() => {
  const { esc } = S;
  let aba = 'veiculos';
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
    const msg = `Olá${nome ? ', ' + nome : ''}! ${novo ? `Seu acesso ao ${S.APP === 'music' ? 'Sonvi Music' : 'SONVI'} foi criado.` : 'Aqui está a sua nova senha provisória.'}\n\nEntre em: ${ende}\nE-mail: ${u.email}\nSenha provisória: ${senha}\n\nNo primeiro acesso você vai criar a sua própria senha.`;
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

  S.views.admin = () => {
    if (ehGer()) aba = 'usuarios';
    const seg = ehGer() ? '' : `<div class="seg">${[['veiculos', 'Veículos'], ['empresa', 'Empresa comercial'], ['usuarios', 'Usuários']].map(([k, n]) => `<button class="${aba === k ? 'on' : ''}" data-act="admAba" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body;
    if (aba === 'veiculos') {
      // Agrupados por categoria (rádio, painel de LED, outdoor…); cada cartão só aparece se tiver veículo
      // Linha compacta: dados curtos sem quebra; ações = Editar + ⋯ (Propostas e PI, Textos do PI)
      const linha = (v, radio) => `<tr class="click" data-act="admVeiculo" data-id="${v.id}"><td><div class="adm-veic">${S.vav(v)}<div class="adm-veic-tx"><b>${esc(v.nome)}</b>${S.categorias(v).length > 1 ? `<span class="adm-cats">${S.categorias(v).map(k => `<span class="pill" style="--tone:var(--gray)">${esc(S.nomeCategoria(k))}</span>`).join('')}</span>` : `<small class="muted" title="${esc(v.razao_social)}">${esc(v.razao_social)}</small>`}</div></div></td><td class="nw">${esc(v.sigla)}</td><td class="nw">${esc(v.cnpj) || '<span class="muted">—</span>'}</td>${radio ? `<td class="nw">${esc(v.frequencia) || '<span class="muted">—</span>'}</td>` : ''}<td class="nw">${esc(v.cidade) || '<span class="muted">—</span>'}</td><td class="r">${v.pi_seq || 0}</td><td class="r"><span class="lin-acoes"><button class="btn sm" data-act="admVeiculo" data-id="${v.id}" data-editar="1">${S.svg('editar')}Editar</button><button class="btn tres" data-act="admVeiculoMenu" data-id="${v.id}" aria-label="Mais opções de ${esc(v.nome)}">${S.svg('mais3')}</button></span></td></tr>`;
      // Quem vende mais de uma categoria (ex.: Media On) fica no grupo "Várias categorias", com as etiquetas de cada uma
      const grupos = [...S.CATEGORIAS.map(([k, n]) => ({ k, n, vs:S.db.veiculos.filter(v => S.categorias(v).length === 1 && S.categoria(v) === k) })),
        { k:'varias', n:'Várias categorias', vs:S.db.veiculos.filter(v => S.categorias(v).length > 1) }].filter(g => g.vs.length);
      body = grupos.length ? grupos.map(g => `<section class="card adm-cat"><div class="hd"><h2>${esc(g.n)}</h2><span>${g.vs.length} veículo${g.vs.length === 1 ? '' : 's'}</span></div><div class="scroll"><table class="adm-veics"><colgroup><col class="c-v"><col class="c-s"><col class="c-d">${g.k === 'radio' ? '<col class="c-f">' : ''}<col class="c-c"><col class="c-n"><col class="c-a"></colgroup><thead><tr><th>Veículo</th><th>Sigla do PI</th><th>CNPJ</th>${g.k === 'radio' ? '<th>Frequência</th>' : ''}<th>${g.k === 'radio' ? 'Cidade' : 'Praça'}</th><th class="r">PIs</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${g.vs.map(v => linha(v, g.k === 'radio')).join('')}</tbody></table></div></section>`).join('')
        : '<div class="card"><div class="empty"><b>Cadastre o primeiro veículo</b>Rádio, painel de LED, outdoor, front light, empena ou mídia DOOH. Cada veículo tem CNPJ, clientes, PIs e financeiro próprios.</div></div>';
    } else if (aba === 'empresa') {
      const e = S.db.empresa || {}, curto = String(e.nome || 'Empresa comercial').split('·')[0].trim(), n = S.db.veiculos.length;
      const kv = (k, val) => `<div><small>${k}</small><span>${val ? esc(val) : '<span class="muted">—</span>'}</span></div>`;
      const marcaDe = v => v.pi_marca === 'comercial' ? esc(curto) : esc(v.nome);
      body = `<div class="emp-grid"><section class="card"><div class="hd"><h2>Empresa comercial</h2><span class="pill" style="--tone:var(--gray)">vale para ${n === 1 ? 'a rádio' : `as ${n} rádios`}</span></div>
          <div class="emp-cab"><span class="pr-logo"><img src="${esc(e.logo || S.logoReserva())}" width="600" height="122" alt="Logo da ${esc(curto)}"></span><p class="muted small">A marca que sai nas propostas e, quando escolhida, nos PIs. Quem fatura continua sendo cada rádio.</p></div>
          <div class="emp-kv">${kv('Nome', e.nome)}${kv('CNPJ', e.cnpj)}${kv('Cidade', e.cidade)}${kv('E-mail', e.email)}${kv('Telefone', e.telefone)}${kv('Site', e.site)}
            ${kv('Assina as propostas', e.assina === 'consultor' ? 'Quem fez a proposta' : [e.responsavel, e.cargo].filter(Boolean).join(' · '))}</div>
          <div class="row" style="margin-top:18px"><span class="grow"></span><button class="btn pri" data-act="admEmpresa">${S.svg('editar')}Editar dados</button></div></section>
        <section class="card"><div class="hd"><h2>Propostas e PI por rádio</h2><span>cada rádio tem os seus</span></div>
          <div class="list">${S.db.veiculos.map(v => `<div>${S.vav(v)}<span class="tx"><b>${esc(v.nome)}</b><small>Faixa ${esc(v.prop_faixa || '07h às 19h')} · PI com a marca ${marcaDe(v)} · validade ${v.prop_validade || 15} dias</small></span><button class="btn sm" data-act="admPropostas" data-id="${v.id}" aria-label="Editar propostas e PI da ${esc(v.nome)}">${S.svg('editar')}Editar</button></div>`).join('')}</div></section></div>`;
    } else {
      // Gerente vê a equipe das rádios em que é gerente (ele mesmo e outros gerentes aparecem, só para consulta)
      const us = ehGer() ? S.db.usuarios.filter(u => vinculosDe(u).some(x => ehMinha(x.veiculo_id))) : S.db.usuarios;
      body = S.celular
        ? `<div class="card"><div class="list">${us.map(u => `<div><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><span class="tx"><b>${esc(u.nome) || '—'}</b><small>${acessoTexto(u)}</small><small>Último acesso: ${ultimo(u)}</small><span style="margin-top:4px">${situacao(u)}</span></span><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></div>`).join('')}</div></div>`
        : `<div class="card"><div class="scroll"><table><thead><tr><th>Usuário</th><th>Situação</th><th>Último acesso</th><th>Rádios e perfis</th><th><span class="sr">Opções</span></th></tr></thead><tbody>${us.map(u =>
          `<tr class="click" data-act="admUsuario" data-id="${u.id}"><td><div style="display:flex;align-items:center;gap:12px"><span class="av soft" aria-hidden="true">${esc(S.iniciais(u.nome || u.email))}</span><div><b>${esc(u.nome) || '—'}</b><div class="muted small">${esc(u.email)}${u.celular ? ' · ' + esc(u.celular) : ''}</div></div></div></td><td>${situacao(u)}</td><td class="nowrap">${ultimo(u)}</td><td>${acessoTexto(u, '<br>')}</td><td class="r"><button class="btn tres" data-act="admUsuarioMenu" data-id="${u.id}" aria-label="Opções de ${esc(u.nome || u.email)}">${S.svg('mais3')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    // Transparência: toda entrada do suporte SONVI fica registrada (quando, quanto tempo e por quê) e o diretor vê aqui
    if (aba === 'usuarios' && !ehGer()) {
      const log = S.db.suporteLog || [], dt = d => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const dur = a => Math.max(1, Math.round((new Date(a.encerrado_em && new Date(a.encerrado_em) < new Date(a.fim) ? a.encerrado_em : a.fim) - new Date(a.inicio)) / 60000));
      const ativo = a => !a.encerrado_em && new Date(a.fim) > new Date();
      body += `<section class="card sup-log" style="margin-top:18px"><div class="hd"><h2>Acessos do suporte SONVI</h2><span>${log.length ? `${log.length} registro${log.length === 1 ? '' : 's'}` : 'nenhum até agora'}</span></div>
        <p class="muted small" style="margin:0 0 12px">A equipe SONVI só vê os dados da empresa quando entra como suporte. Cada entrada fica anotada aqui, com o motivo e o tempo. O que o suporte alterar aparece no histórico como "Suporte SONVI".</p>
        ${log.length ? `<div class="acc">${log.map(a => { const fimReal = a.encerrado_em && new Date(a.encerrado_em) < new Date(a.fim) ? a.encerrado_em : a.fim, hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
          const comoTerminou = ativo(a) ? 'Em andamento' : a.encerrado_em && new Date(a.encerrado_em) < new Date(a.fim) ? 'Encerrado pelo suporte' : 'Terminou no horário combinado';
          const previsto = Math.round((new Date(a.fim) - new Date(a.inicio)) / 60000), fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
          return `<details class="acc-item" name="suplog"${ativo(a) ? ' open' : ''}><summary><span class="ic" aria-hidden="true">${S.svg('chave')}</span>
            <span class="acc-tit"><b>${esc(a.motivo)}${ativo(a) ? ' <span class="pill" style="--tone:var(--blue)">agora</span>' : ''}</b><small>${dt(a.inicio)} · ${ativo(a) ? `até ${hora(a.fim)}` : fmtMin(dur(a))}</small></span><span class="acc-seta" aria-hidden="true">${S.svg('baixo')}</span></summary>
            <dl class="acc-corpo"><div><dt>Quem</dt><dd>Equipe SONVI (aparece como "Suporte SONVI")</dd></div><div><dt>Motivo</dt><dd>${esc(a.motivo)}</dd></div>
              <div><dt>Entrou</dt><dd>${dt(a.inicio)}</dd></div><div><dt>${ativo(a) ? 'Termina' : 'Saiu'}</dt><dd>${ativo(a) ? hora(a.fim) : dt(fimReal)}</dd></div>
              <div><dt>Tempo</dt><dd>${ativo(a) ? `liberado por ${fmtMin(previsto)}` : `${fmtMin(dur(a))} de ${fmtMin(previsto)} liberados`}</dd></div><div><dt>Situação</dt><dd>${comoTerminou}</dd></div></dl></details>`; }).join('')}</div>` : ''}</section>`;
    }
    if (ehGer()) return { title:`<span class="sub">${esc(minhas().map(v => v.nome).join(' · '))}</span>Usuários`, actions:`<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`,
      body:`<p class="muted small" style="margin:0 0 14px">Você cadastra e edita consultores, OPEC, financeiro, programadores e locutores das rádios em que é gerente. Gerentes e diretores ficam com o diretor.</p>${body}` };
    return { title:'<span class="sub">Grupo</span>Administração', actions:aba === 'empresa' ? '' : aba === 'veiculos' ? `<button class="btn pri" data-act="admVeiculo">${S.svg('mais')}Novo veículo</button>` : `<button class="btn pri" data-act="admUsuario">${S.svg('mais')}Cadastrar usuário</button>`, body:seg + body };
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
      { label:'Propostas e PI', icon:'propostas', act:'admPropostas', data:{ id:d.id } }, { label:'Textos do PI', icon:'pis', act:'admTextosPI', data:{ id:d.id } }]),
    admAba: d => { aba = d.tab; S.render(); },
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
        { k:'endereco', label:'Endereço', full:true }, { k:'telefone', label:'Telefone' }, { k:'email', label:'E-mail', type:'email' },
        { k:'opec_email', label:'E-mail da OPEC (recebe os PIs)', type:'email', full:true, ph:'opec@empresa.com.br' }, { k:'dados_bancarios', label:'Dados bancários', type:'textarea' }], v,
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
    admEmpresa: () => { const e = S.db.empresa || {};
      const logo = `<div class="logo-campo" style="grid-column:1/-1"><div class="emp-prev pr-logo" id="empPrev"><img src="${esc(e.logo || S.logoReserva())}" width="600" height="122" alt="Logo atual"></div>
        <div class="logo-info"><b>Logo</b><small class="muted">Horizontal, PNG ou JPG com fundo branco ou transparente. Sai nas propostas e nos PIs.</small>
        <div class="row"><button type="button" class="btn sm" data-act="empLogoEscolher">${S.svg('baixar')}Trocar logo</button></div><small class="aviso" id="empAviso"></small></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" id="empLogoArq" hidden><input type="hidden" name="logo" value="${esc(e.logo || '')}"></div>`;
      S.form('Empresa comercial', [{ html:logo },
        { k:'nome', label:'Nome', req:true, full:true, ph:'Ex.: Head 14 · Vendas e Comunicação' }, { k:'razao_social', label:'Razão social' }, { k:'cnpj', label:'CNPJ' },
        { k:'cidade', label:'Cidade / UF' }, { k:'endereco', label:'Endereço' }, { k:'email', label:'E-mail', type:'email' }, { k:'telefone', label:'Telefone' }, { k:'site', label:'Site', ph:'Ex.: head14.com.br' },
        { k:'assina', label:'Assina as propostas', type:'select', options:[['responsavel', 'O responsável abaixo'], ['consultor', 'Quem fez a proposta']] },
        { k:'responsavel', label:'Responsável', ph:'Nome de quem assina' }, { k:'cargo', label:'Cargo', ph:'Ex.: Diretor' },
        { k:'cor', label:'Cor principal (faixas e tabela da proposta)', type:'color' }, { k:'cor2', label:'Cor de destaque', type:'color' }],
        Object.assign({ cor:'#2b5fb5', cor2:'#f1853d', assina:'responsavel' }, e),
        f => S.run(async () => { const row = { nome:f.nome.trim(), razao_social:f.razao_social || '', cnpj:f.cnpj || '', cidade:f.cidade || '', endereco:f.endereco || '', email:f.email || '', telefone:f.telefone || '',
            site:f.site || '', assina:f.assina, responsavel:f.responsavel || '', cargo:f.cargo || '', cor:f.cor || '#2b5fb5', cor2:f.cor2 || '#f1853d', logo:f.logo || null, atualizado_em:new Date().toISOString() };
          S.db.empresa = e.id ? await S.q(S.sb.from('empresa_comercial').update(row).eq('id', e.id).select().single()) : await S.q(S.sb.from('empresa_comercial').insert(row).select().single()); }, 'Empresa comercial salva'), 'Salvar', { editar:true }); },
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
          if (n && f.para) S.toast(`Usuário ${nome} excluído. ${p.clientes || 0} cliente(s), ${p.propostas || 0} proposta(s) e ${p.pis || 0} PI(s) passaram para ${(S.db.usuarios.find(x => x.id === f.para) || {}).nome || 'o novo responsável'}.`);
          else S.toast(`Usuário ${nome} excluído.`); }), 'Excluir usuário', { editar:true });
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
      const f = document.querySelector('#dlg form'); f.logo.value = u; document.getElementById('empPrev').innerHTML = `<img src="${u}" width="${c.width}" height="${c.height}" alt="Logo novo">`;
      aviso.textContent = img.naturalWidth < 400 ? 'A imagem é pequena: pode sair borrada no PDF. O ideal é ter 600 px de largura ou mais.' : ''; document.getElementById('dlg').dataset.sujo = '1'; };
    img.onerror = () => { URL.revokeObjectURL(url); aviso.textContent = 'Não foi possível abrir essa imagem.'; };
    img.src = url;
  });
  // Diretor esconde a lista de rádios (vê todas)
  document.addEventListener('change', e => { if (!e.target.dataset.funcao) return; const a = e.target.closest('form').querySelector('.acessos'); if (a) a.hidden = e.target.value === 'diretor'; });
})();

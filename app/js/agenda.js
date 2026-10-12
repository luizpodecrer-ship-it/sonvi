// SONVI · agenda do consultor: visitas, retornos e reuniões, com o registro do que ficou combinado.
(() => {
  const { esc, dfmt } = S;
  const TIPOS = { visita:'Visita', retorno:'Retorno', reuniao:'Reunião' };
  const gestor = () => S.pode('diretor', 'gerente');

  S.views.agenda = () => {
    const hoje = S.today(), todos = S.db.agenda.slice().sort((a, b) => a.quando.localeCompare(b.quando));
    const abertos = todos.filter(a => !a.realizado), atras = abertos.filter(a => S.dia(a.quando) < hoje), deHoje = abertos.filter(a => S.dia(a.quando) === hoje), prox = abertos.filter(a => S.dia(a.quando) > hoje);
    const feitos = todos.filter(a => a.realizado).reverse().slice(0, 15);
    const COR = { visita:'blue', retorno:'orange', reuniao:'purple' };
    // Cada compromisso: horário à esquerda, cliente e assunto no meio, tipo e ações à direita (quebra no celular)
    const linha = a => `<div class="ag"><span class="qd"><b>${S.hora(a.quando)}</b><small>${dfmt(S.dia(a.quando)).slice(0, 5)}</small></span>
      <span class="tx"><b>${esc(S.nome(a.cliente_id)) || '—'}</b><small>${esc(a.assunto)}${gestor() ? ` · ${esc(S.usuario(a.consultor_id))}` : ''}</small>
        ${a.realizado ? `<small class="res">${esc(a.resultado)}${a.proxima_data ? ` · próximo passo em ${dfmt(a.proxima_data)}` : ''}</small>` : ''}</span>
      <span class="ac">${S.tag(TIPOS[a.tipo], COR[a.tipo])}${a.realizado ? '' : `<button class="btn sm pri" data-act="agFeito" data-id="${a.id}">Registrar</button>`}<button class="x" data-act="agExcluir" data-id="${a.id}" title="Excluir" aria-label="Excluir compromisso">×</button></span></div>`;
    const bloco = (titulo, lista, vazio) => `<div class="card"><h3>${titulo} <span class="muted small">${lista.length || ''}</span></h3>${lista.length ? `<div class="agenda">${lista.map(linha).join('')}</div>` : `<p class="muted">${vazio}</p>`}</div>`;
    const tile = (l, v, h) => `<div class="tile"><small>${l}</small><b>${v}</b><span>${h}</span></div>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Agenda`, actions:`<button class="btn pri" data-act="agNovo">${S.svg('mais')}Novo compromisso</button>`,
      body:`<div class="tiles">${tile('Hoje', deHoje.length, 'compromissos do dia')}${tile('Atrasados', atras.length, 'sem registro de resultado')}${tile('Próximos', prox.length, 'já agendados')}${tile('Realizados', todos.filter(a => a.realizado).length, `de ${todos.length} planejados`)}</div>
        ${atras.length ? bloco('Atrasados', atras, '') : ''}${bloco('Hoje', deHoje, 'Nada agendado para hoje.')}${bloco('Próximos', prox, 'Nenhum compromisso futuro.')}${bloco('Últimos realizados', feitos, 'Nenhum registro ainda.')}` };
  };

  Object.assign(S.actions, {
    agNovo: () => {
      const campos = [
        { k:'tipo', label:'Tipo', type:'select', options:Object.entries(TIPOS) },
        { k:'quando', label:'Data e hora', type:'datetime-local', req:true },
        { k:'cliente_id', label:'Cliente', type:'select', options:[['', 'Sem cliente'], ...S.pessoas('cliente').map(p => [p.id, p.nome])] },
        ...(gestor() ? [{ k:'consultor_id', label:'Consultor', type:'select', options:S.consultores().map(u => [u.id, u.nome || u.email]) }] : []),
        { k:'assunto', label:'Assunto', full:true }];
      if (gestor() && !S.consultores().length) return S.toast('Vincule um consultor a esta rádio antes de agendar.');
      S.form('Novo compromisso', campos, { quando:S.today() + 'T09:00' }, v => S.run(() => S.salvar('agenda', { veiculo_id:S.ui.vehicleId, consultor_id:v.consultor_id || S.me.id, cliente_id:v.cliente_id || null, tipo:v.tipo, quando:new Date(v.quando).toISOString(), assunto:v.assunto }), 'Compromisso agendado'));
    },
    // Registro da visita: como foi, o que ficou combinado e a data do próximo passo
    agFeito: d => { const a = S.db.agenda.find(x => x.id === d.id);
      S.form(`${TIPOS[a.tipo]} · ${esc(S.nome(a.cliente_id)) || 'sem cliente'}`, [
        { k:'resultado', label:'Como foi e o que ficou combinado', type:'textarea', req:true },
        { k:'proxima_data', label:'Data do próximo passo (opcional)', type:'date', full:true }], {},
        v => S.run(async () => {
          await S.salvar('agenda', { id:a.id, realizado:true, resultado:v.resultado, proxima_data:v.proxima_data || null });
          // O próximo passo já vira um retorno na agenda
          if (v.proxima_data) await S.salvar('agenda', { veiculo_id:a.veiculo_id, consultor_id:a.consultor_id, cliente_id:a.cliente_id, tipo:'retorno', quando:new Date(v.proxima_data + 'T09:00').toISOString(), assunto:'Retorno: ' + v.resultado.slice(0, 80) });
        }, 'Registro salvo'), 'Registrar'); },
    agExcluir: d => { if (confirm('Excluir este compromisso?')) S.run(() => S.excluir('agenda', d.id), 'Compromisso excluído'); }
  });
})();

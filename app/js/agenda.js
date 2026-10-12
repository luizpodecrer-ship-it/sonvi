// SONVI · agenda do consultor: visitas, retornos e reuniões, com o registro do que ficou combinado.
(() => {
  const { esc, dfmt } = S;
  const TIPOS = { visita:'Visita', retorno:'Retorno', reuniao:'Reunião' };
  const gestor = () => S.pode('diretor', 'gerente');

  S.views.agenda = () => {
    const hoje = S.today(), todos = S.db.agenda.slice().sort((a, b) => a.quando.localeCompare(b.quando));
    const abertos = todos.filter(a => !a.realizado), atras = abertos.filter(a => S.dia(a.quando) < hoje), deHoje = abertos.filter(a => S.dia(a.quando) === hoje), prox = abertos.filter(a => S.dia(a.quando) > hoje);
    const feitos = todos.filter(a => a.realizado).reverse().slice(0, 15);
    const linha = a => `<tr><td style="white-space:nowrap"><b>${dfmt(S.dia(a.quando))}</b> <span class="muted">${S.hora(a.quando)}</span></td><td>${S.tag(TIPOS[a.tipo], a.tipo === 'visita' ? 'blue' : a.tipo === 'retorno' ? 'orange' : 'purple')}</td><td><b>${esc(S.nome(a.cliente_id)) || '—'}</b><div class="muted small">${esc(a.assunto)}</div></td>${gestor() ? `<td>${esc(S.usuario(a.consultor_id))}</td>` : ''}
      <td>${a.realizado ? `<span class="small">${esc(a.resultado)}${a.proxima_data ? ` · próximo passo em ${dfmt(a.proxima_data)}` : ''}</span>` : ''}</td>
      <td class="r" style="white-space:nowrap">${a.realizado ? '' : `<button class="btn sm pri" data-act="agFeito" data-id="${a.id}">Registrar</button> `}<button class="x" data-act="agExcluir" data-id="${a.id}" title="Excluir">×</button></td></tr>`;
    const bloco = (titulo, lista, vazio) => `<div class="card"><h3>${titulo} <span class="muted small">${lista.length || ''}</span></h3>${lista.length ? `<div class="scroll"><table><tbody>${lista.map(linha).join('')}</tbody></table></div>` : `<p class="muted">${vazio}</p>`}</div>`;
    const tile = (l, v, h) => `<div class="tile"><small>${l}</small><b>${v}</b><span>${h}</span></div>`;
    return { title:`<span class="sub">${esc(S.veh().nome)}</span>Agenda`, actions:'<button class="btn pri" data-act="agNovo">Novo compromisso</button>',
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

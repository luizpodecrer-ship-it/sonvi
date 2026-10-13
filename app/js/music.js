// SONVI · Sonvi Music: o aplicativo de programação musical e estúdio, aberto em music/ (depois music.sonvi.com.br).
// Usa o mesmo banco, as mesmas contas e a mesma casca (app.js); muda a marca, o login e o menu.
// Cada item do menu abre uma parte da programação musical (musical.js). Quem pode o quê, o banco garante (ve_musica, programa_musica).
(() => {
  if (S.APP !== 'music') return;
  const { esc } = S;
  const TODOS = ['diretor', 'gerente', 'programador', 'locutor', 'opec'], PROG = ['diretor', 'gerente', 'programador'], CONSULTA = ['diretor', 'gerente', 'programador', 'opec'];
  // [tela, nome no menu, perfis, (externo), parte da programação musical]
  S.MUSIC_NAV = [
    ['hoje', 'Hoje no ar', TODOS],
    ['programacao', 'Programação', TODOS],
    ['radar', 'Radar', PROG],
    ['acervo', 'Acervo', CONSULTA],
    ['relogios', 'Relógios', PROG],
    ['categorias', 'Categorias', PROG],
    ['regras', 'Regras', PROG],
    ['paineis', 'Painéis', CONSULTA],
    ['comerciais', 'Comerciais da OPEC', CONSULTA],
    ['relatorios', 'Relatórios e ECAD', CONSULTA]];
  const PARTE = { programacao:'prog', acervo:'acervo', relogios:'formatos', categorias:'cats', regras:'regras', paineis:'paineis', relatorios:'rel' };
  const nome = k => (S.MUSIC_NAV.find(n => n[0] === k) || [k, k])[1];

  Object.entries(PARTE).forEach(([k, aba]) => {
    S.views[k] = () => { S.musAba(aba); const v = S.views.musical(); v.title = `<span class="sub">${esc(S.veh().nome)}</span>${nome(k)}`; return v; };
  });

  // Telas que chegam nas próximas etapas
  const emBreve = (k, texto) => () => ({ title:`<span class="sub">${esc(S.veh().nome)}</span>${nome(k)}`, actions:'',
    body:`<div class="card empty"><b>${nome(k)} · em construção</b>${texto}</div>` });
  S.views.hoje = emBreve('hoje', 'A tela do estúdio: relógio, a música no ar, o que vem a seguir, a contagem até o próximo break e o texto do testemunhal para o locutor ler.<div style="margin-top:18px"><button class="btn pri" data-go="/programacao">Abrir a programação</button></div>');
  S.views.comerciais = emBreve('comerciais', 'Os comerciais dos PIs programados pela OPEC, já encaixados nos breaks de cada hora, e o comprovante do que foi ao ar.');
})();

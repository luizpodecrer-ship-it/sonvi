// SONVI · programação musical: regras e geração automática (funções puras, sem tela).
// A semana vai de segunda (dia 0) a domingo (dia 6). O dia -1 (domingo anterior) entra só para conferir regras.
// Cada item de uma hora é um "slot": { k:'MUS', cat, musica, manual } · { k:'VIN', vinheta } · { k:'BRK' } · { k:'INF', texto }.
(() => {
  const M = S.mus = S.mus || {};

  // As regras, na ordem das luzes do indicador
  M.REGRAS = [
    ['FAIXA', 'Faixa horária', 'Grade de restrição (dia × hora) e bloqueio por minutos, na ficha da música.'],
    ['STATUS', 'Status da música', 'Música desativada no acervo não entra na programação.'],
    ['INT_MUS', 'Intervalo de música', 'Rotatividade % da categoria e intervalo próprio da música (ficha).'],
    ['INT_INT', 'Intervalo de intérprete', 'O mesmo artista não volta antes do tempo mínimo.'],
    ['SIM', 'Similares (versões)', 'Versões ligadas da mesma música respeitam a espera da ficha.'],
    ['GRUPO', 'Conflito de vozes', 'Artistas de voz parecida ficam afastados (grupos em Categorias).'],
    ['RITMO', 'Máx. ritmos juntos', 'Limite de músicas seguidas com o mesmo ritmo.'],
    ['CAT', 'Máx. categorias juntas', 'Limite de músicas seguidas da mesma categoria.'],
    ['PESO', 'Distância de peso', 'Músicas de peso 5 (as mais fortes) não ficam coladas.'],
    ['POS', 'Intervalo de posição', 'A música não repete a mesma posição desta hora no dia anterior.'],
    ['HORA', 'Música na mesma hora', 'A música não toca na mesma hora em que tocou no dia anterior.'],
    ['LIM', 'Limite por dia', 'Máximo de vezes por dia, na ficha da música.'],
    ['CUSTOM', 'Regras configuráveis', 'Regras criadas pela própria rádio.'],
    ['CATPOS', 'Categoria da posição', 'Avisa quando a música escolhida à mão é de outra categoria.']];
  M.NOME_REGRA = Object.fromEntries(M.REGRAS.map(r => [r[0], r[1]]));
  M.CAMPOS = { voz:{ label:'Voz', valores:[['M', 'Masculina'], ['F', 'Feminina'], ['D', 'Dupla']] }, origem:{ label:'Origem', valores:[['N', 'Nacional'], ['I', 'Internacional']] },
    novidade:{ label:'Novidade', valores:[['S', 'Sim'], ['N', 'Não']] }, subcategoria:{ label:'Subcategoria', valores:null } };
  M.DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  M.DC = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  M.DUR = { VIN:5, BRK:180, INF:60, VAZIO:210 };

  // ---------- utilitários ----------
  const pad = n => String(n).padStart(2, '0');
  M.pad = pad;
  M.relogio = seg => { const s = ((seg % 86400) + 86400) % 86400; return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)); };
  M.mmss = seg => { seg = Math.max(0, Math.round(seg || 0)); return pad(Math.floor(seg / 60)) + ':' + pad(seg % 60); };
  M.hms = seg => { seg = Math.round(seg || 0); const h = Math.floor(seg / 3600); return (h ? h + ':' : '') + pad(Math.floor(seg % 3600 / 60)) + ':' + pad(seg % 60); };
  M.minutos = m => m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? pad(m % 60) : '') : m + ' min';
  M.lerTempo = v => { const r = /^(\d{1,3}):(\d{2})$/.exec(String(v || '').trim()); return r ? (+r[1]) * 60 + (+r[2]) : null; };
  M.artistas = m => [m.interprete, m.interprete2].map(x => String(x || '').trim()).filter(Boolean);
  M.artistasTexto = m => M.artistas(m).join(' e ');
  const comum = (a, b) => a.find(x => b.includes(x)) || null;
  M.campo = (m, f) => f === 'novidade' ? (m.novidade ? 'S' : 'N') : f === 'subcategoria' ? m.subcategoria_id : m[f];
  // Datas ISO (AAAA-MM-DD) sem fuso: a semana é sempre a mesma em qualquer computador
  M.somaDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  M.segunda = iso => { const [y, m, d] = iso.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d)); return M.somaDias(iso, -((x.getUTCDay() + 6) % 7)); };
  M.dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  // Rótulo de uma regra criada pela rádio
  M.rotuloRegra = (c, subs) => {
    const f = M.CAMPOS[c.campo]; let v = c.valor;
    if (f.valores) { const x = f.valores.find(o => o[0] === c.valor); if (x) v = x[1]; } else { const s = (subs || []).find(o => o.id === c.valor); v = s ? s.nome : '?'; }
    return `No máximo ${c.max} ${c.tipo === 'seq' ? 'seguidas' : 'por hora'} com ${f.label.toLowerCase()} ${String(v).toLowerCase()}`;
  };

  // ---------- a linha do tempo ----------
  // dias: [{ di, data, horas:[[slots] × 24] }] → lista única em ordem, com o início de cada item em segundos desde a segunda 00:00
  M.linha = (dias, porId, vinPorId) => {
    const lista = [];
    dias.forEach(dia => {
      const wd = (dia.di + 7) % 7;
      for (let h = 0; h < 24; h++) {
        let t = dia.di * 86400 + h * 3600;
        (dia.horas[h] || []).forEach((slot, i) => {
          const musica = slot.k === 'MUS' && slot.musica ? porId[slot.musica] || null : null;
          const ad = musica && musica.vinheta_id ? vinPorId[musica.vinheta_id] || null : null;
          const dur = slot.k === 'MUS' ? (musica ? musica.duracao + (ad ? ad.duracao : 0) : M.DUR.VAZIO)
            : slot.k === 'VIN' ? (vinPorId[slot.vinheta] || { duracao:M.DUR.VIN }).duracao : M.DUR[slot.k] || 60;
          lista.push({ di:dia.di, data:dia.data, wd, h, i, slot, musica, ad, inicio:t, dur });
          t += dur;
        });
      }
    });
    return lista;
  };

  // Índices usados pelas regras: o que tocou em cada dia/hora e quantas vezes cada música tocou no dia
  M.contexto = (lista, cfg, musicas) => {
    const porDH = {}, noDia = {}, ativasCat = {}, gruposDe = {};
    musicas.forEach(m => { if (m.ativa) ativasCat[m.categoria_id] = (ativasCat[m.categoria_id] || 0) + 1; m._bl = new Set(m.bloqueios || []); });
    lista.forEach(e => { if (e.musica) M.marcar({ porDH, noDia }, e, e.musica); });
    return { lista, cats:cfg.cats, ritmos:cfg.ritmos, grupos:cfg.grupos, regras:cfg.regras, subs:cfg.subs, porDH, noDia, ativasCat,
      gruposDa: m => gruposDe[m.id] || (gruposDe[m.id] = cfg.grupos.filter(g => comum(g.artistas || [], M.artistas(m)))) };
  };
  M.marcar = (ctx, e, m) => {
    const k = e.di + '-' + e.h; if (!ctx.porDH[k]) ctx.porDH[k] = { ids:{}, pos:{} };
    ctx.porDH[k].ids[m.id] = 1; ctx.porDH[k].pos[e.i] = m.id;
    const d = e.di + '-' + m.id; ctx.noDia[d] = (ctx.noDia[d] || 0) + 1;
  };

  // Quantas músicas seguidas (antes ou depois) atendem à condição; vinhetas, breaks e informativos não quebram a sequência
  const seguidas = (lista, idx, dir, ok) => { let c = 0;
    for (let j = idx + dir; j >= 0 && j < lista.length; j += dir) { const e = lista[j]; if (e.slot.k !== 'MUS') continue; if (!e.musica || !ok(e.musica)) break; c++; }
    return c; };
  const pesoPerto = (lista, idx, dir, dist) => { let n = 0;
    for (let j = idx + dir; j >= 0 && j < lista.length; j += dir) { const e = lista[j]; if (e.slot.k !== 'MUS') continue; n++; if (n >= dist) return false; if (e.musica && e.musica.peso >= 5) return true; }
    return false; };
  // Rotatividade: quantas outras músicas da categoria tocaram desde a última vez desta (null = tudo certo)
  const giro = (lista, idx, m, dir, precisa) => { const vistas = {}; let n = 0;
    for (let j = idx + dir; j >= 0 && j < lista.length; j += dir) { const p = lista[j]; if (!p.musica) continue;
      if (p.musica.id === m.id) return n < precisa ? n : null;
      if (p.musica.categoria_id === m.categoria_id && !vistas[p.musica.id]) { vistas[p.musica.id] = 1; if (++n >= precisa) return null; } }
    return null; };

  // Confere uma música numa posição. "dosDoisLados" olha também o que vem depois (usado ao gerar e ao trocar à mão).
  // Devolve [{ regra, msg }] com cada regra quebrada.
  M.conferir = (ctx, idx, m, catPos, dosDoisLados) => {
    const out = [], R = ctx.regras, on = R.on || {}, lista = ctx.lista, e = lista[idx], t = e.inicio;
    const add = (regra, msg) => out.push({ regra, msg });
    const cat = ctx.cats[m.categoria_id];
    if (on.CATPOS && catPos && ctx.cats[catPos] && m.categoria_id !== catPos) add('CATPOS', `A posição pede ${ctx.cats[catPos].nome}; a música é de ${cat ? cat.nome : 'outra categoria'}`);
    if (on.STATUS && !m.ativa) add('STATUS', 'Música desativada no acervo');
    if (on.FAIXA) {
      if (m._bl.has(e.wd + '-' + e.h)) add('FAIXA', `Bloqueada na grade de restrição (${M.DC[e.wd]} ${pad(e.h)}h)`);
      else { const de = M.lerTempo(m.bloqueio_de), ate = M.lerTempo(m.bloqueio_ate), agora = Math.floor((((t % 86400) + 86400) % 86400) / 60);
        if (de !== null && ate !== null && agora >= de && agora < ate) add('FAIXA', `Bloqueada das ${m.bloqueio_de} às ${m.bloqueio_ate}`); }
    }
    const art = M.artistas(m), artW = (R.interprete_min || 0) * 60, intW = (m.intervalo_h || 0) * 3600, espW = (m.espera_h || 0) * 3600;
    const grupos = ctx.gruposDa(m); let gW = 0; grupos.forEach(g => { gW = Math.max(gW, g.distancia * 60); });
    const janela = Math.max(artW, intW, m.grupo_versoes ? espW : 0, gW), ja = {};
    const olhar = dir => {
      for (let j = idx + dir; j >= 0 && j < lista.length; j += dir) {
        const p = lista[j], dt = Math.abs(p.inicio - t); if (dt > janela) break; if (!p.musica) continue;
        const pm = p.musica, quando = (dir < 0 ? 'tocou há ' : 'toca daqui a ') + M.minutos(Math.round(dt / 60)), part = M.artistas(pm);
        if (on.INT_MUS && !ja.i && intW && pm.id === m.id && dt < intW) { ja.i = 1; add('INT_MUS', `Intervalo próprio: ${quando} (mínimo ${m.intervalo_h}h)`); }
        if (on.SIM && !ja.s && m.grupo_versoes && pm.grupo_versoes === m.grupo_versoes && pm.id !== m.id && dt < espW) { ja.s = 1; add('SIM', `A versão "${pm.titulo}" ${quando} (espera ${m.espera_h}h)`); }
        if (on.INT_INT && !ja.a && pm.id !== m.id && dt < artW) { const x = comum(part, art); if (x) { ja.a = 1; add('INT_INT', `${x} ${quando} (mínimo ${R.interprete_min} min)`); } }
        if (on.GRUPO && !ja.g && !comum(part, art)) { const g = grupos.find(g => dt < g.distancia * 60 && comum(g.artistas || [], part)); if (g) { ja.g = 1; add('GRUPO', `${g.nome}: "${pm.titulo}" ${quando}`); } }
      }
    };
    olhar(-1); if (dosDoisLados) olhar(1);
    if (on.INT_MUS && cat) {
      const precisa = Math.ceil(cat.rotatividade / 100 * ((ctx.ativasCat[m.categoria_id] || 1) - 1));
      if (precisa > 0) { const r = giro(lista, idx, m, -1, precisa);
        if (r !== null) add('INT_MUS', `Rotatividade: só ${r} de ${precisa} músicas de ${cat.nome} tocaram desde a última vez`);
        else if (dosDoisLados && giro(lista, idx, m, 1, precisa) !== null) add('INT_MUS', 'Rotatividade: repetiria cedo demais'); }
    }
    const sequencia = ok => 1 + seguidas(lista, idx, -1, ok) + (dosDoisLados ? seguidas(lista, idx, 1, ok) : 0);
    const rt = ctx.ritmos[m.ritmo];
    if (on.RITMO && rt) { const n = sequencia(x => x.ritmo === m.ritmo); if (n > rt.max) add('RITMO', `${n} músicas de ritmo ${rt.nome.toLowerCase()} seguidas (máximo ${rt.max})`); }
    if (on.CAT && cat) { const n = sequencia(x => x.categoria_id === m.categoria_id); if (n > cat.max_juntas) add('CAT', `${n} músicas de ${cat.nome} seguidas (máximo ${cat.max_juntas})`); }
    if (on.PESO && m.peso >= 5 && (R.peso_dist || 0) > 1 && (pesoPerto(lista, idx, -1, R.peso_dist) || (dosDoisLados && pesoPerto(lista, idx, 1, R.peso_dist))))
      add('PESO', `Outra música de peso 5 a menos de ${R.peso_dist} posições`);
    if (on.HORA) { const ontem = ctx.porDH[(e.di - 1) + '-' + e.h], amanha = dosDoisLados ? ctx.porDH[(e.di + 1) + '-' + e.h] : null;
      if (ontem && ontem.ids[m.id]) add('HORA', 'Já tocou nesta mesma hora no dia anterior');
      else if (amanha && amanha.ids[m.id]) add('HORA', 'Vai tocar nesta mesma hora no dia seguinte'); }
    if (on.POS) { const ontem = ctx.porDH[(e.di - 1) + '-' + e.h]; if (ontem && ontem.pos[e.i] === m.id) add('POS', `Mesma posição (${e.i + 1}ª) desta hora no dia anterior`); }
    if (on.LIM && m.limite_dia > 0) { const n = (ctx.noDia[e.di + '-' + m.id] || 0) - (e.musica && e.musica.id === m.id ? 1 : 0); if (n >= m.limite_dia) add('LIM', `Já tocou ${n}x neste dia (limite ${m.limite_dia})`); }
    if (on.CUSTOM) (R.custom || []).forEach(c => {
      const ok = x => M.campo(x, c.campo) === c.valor; if (!ok(m)) return;
      if (c.tipo === 'seq') { const n = sequencia(ok); if (n > c.max) add('CUSTOM', `${M.rotuloRegra(c, ctx.subs)} (${n} seguidas)`); }
      else { let n = 1;
        for (let j = idx - 1; j >= 0 && lista[j].di === e.di && lista[j].h === e.h; j--) if (lista[j].musica && ok(lista[j].musica)) n++;
        for (let j = idx + 1; j < lista.length && lista[j].di === e.di && lista[j].h === e.h; j++) if (lista[j].musica && ok(lista[j].musica)) n++;
        if (n > c.max) add('CUSTOM', `${M.rotuloRegra(c, ctx.subs)} (${n} nesta hora)`); }
    });
    return out;
  };

  // Os itens de uma hora a partir do formato (sem músicas ainda)
  M.itensDoFormato = (fmt, vinhetas, informativos, cont) => (fmt ? fmt.posicoes : []).map(p => {
    if (p === 'VIN') { const v = vinhetas[cont.v++ % Math.max(1, vinhetas.length)]; return { k:'VIN', vinheta:v ? v.id : null }; }
    if (p === 'BRK') return { k:'BRK' };
    if (p === 'INF') return { k:'INF', texto:informativos.length ? informativos[cont.i++ % informativos.length] : 'Texto informativo' };
    return { k:'MUS', cat:p, musica:null, manual:false };
  });

  // Geração automática, em camadas: primeiro a categoria de prioridade 1 em todas as horas, depois a 2, e assim por diante.
  // Para cada posição escolhe a música que quebra menos regras; no empate, a que está há mais tempo sem tocar.
  // dias: [{ di, data, horas, gerar:bool, auto:[24 × bool] }] — só os dias com gerar=true recebem músicas novas.
  M.gerar = (dias, cfg, musicas, vinPorId) => {
    const porId = Object.fromEntries(musicas.map(m => [m.id, m]));
    const lista = M.linha(dias, porId, vinPorId), ctx = M.contexto(lista, cfg, musicas), alvo = {};
    dias.forEach(d => { alvo[d.di] = d; });
    const ordem = Object.values(cfg.cats).sort((a, b) => a.prioridade - b.prioridade || a.codigo.localeCompare(b.codigo));
    ordem.forEach(cat => {
      const pool = musicas.filter(m => m.ativa && m.categoria_id === cat.id); if (!pool.length) return;
      const ultima = {};
      lista.forEach(e => { if (e.musica && e.musica.categoria_id === cat.id) ultima[e.musica.id] = Math.max(ultima[e.musica.id] ?? -Infinity, e.inicio); });
      lista.forEach((e, idx) => {
        const dia = alvo[e.di];
        if (!dia.gerar || !dia.auto[e.h] || e.slot.k !== 'MUS' || e.slot.cat !== cat.id || e.slot.manual || e.musica) return;
        let melhor = null, nota = Infinity;
        pool.forEach(m => {
          const v = M.conferir(ctx, idx, m, cat.id, true), lp = ultima[m.id];
          let n = v.length * 1e8 + (lp === undefined ? -1e9 : lp);
          if (m.deve_tocar > 0 && e.h >= m.deve_de && e.h <= m.deve_ate && (ctx.noDia[e.di + '-' + m.id] || 0) < m.deve_tocar) n -= 4 * 3600;
          if (n < nota) { nota = n; melhor = m; }
        });
        e.slot.musica = melhor.id; e.musica = melhor; ultima[melhor.id] = e.inicio; M.marcar(ctx, e, melhor);
      });
    });
    return dias;
  };

  // ---------- leitura de arquivos de áudio (nome e etiquetas ID3) ----------
  // "Artista - Música.mp3" → { interprete, titulo }
  M.peloNome = nome => { const base = String(nome).replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(), p = base.split(/\s+-\s+/);
    return p.length >= 2 ? { interprete:p[0].trim(), titulo:p.slice(1).join(' - ').trim() } : { interprete:'', titulo:base }; };
  // Etiquetas ID3 (v2.3/v2.4 e v1) do começo e do fim do MP3: título, artista, álbum, ano e gravadora
  M.lerEtiquetas = async arquivo => {
    const out = {};
    try {
      const ini = new Uint8Array(await arquivo.slice(0, 256 * 1024).arrayBuffer());
      if (ini[0] === 0x49 && ini[1] === 0x44 && ini[2] === 0x33) {
        const ver = ini[3], tam = (ini[6] << 21) | (ini[7] << 14) | (ini[8] << 7) | ini[9];
        let p = 10; const fim = Math.min(ini.length, 10 + tam);
        const txt = (b, a, z) => { const enc = b[a], dados = b.subarray(a + 1, z);
          const dec = new TextDecoder(enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1');
          return dec.decode(dados).replace(/\0/g, '').trim(); };
        const MAPA = { TIT2:'titulo', TPE1:'interprete', TALB:'disco', TYER:'ano', TDRC:'ano', TPUB:'gravadora', TCOM:'compositor', TBPM:'bpm' };
        while (p + 10 < fim) {
          const id = String.fromCharCode(ini[p], ini[p + 1], ini[p + 2], ini[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
          const sz = ver === 4 ? (ini[p + 4] << 21) | (ini[p + 5] << 14) | (ini[p + 6] << 7) | ini[p + 7] : (ini[p + 4] << 24) | (ini[p + 5] << 16) | (ini[p + 6] << 8) | ini[p + 7];
          if (sz <= 0 || p + 10 + sz > fim) break;
          if (MAPA[id]) out[MAPA[id]] = txt(ini, p + 10, p + 10 + sz);
          p += 10 + sz;
        }
      }
      if (!out.titulo && arquivo.size > 128) {
        const v1 = new Uint8Array(await arquivo.slice(arquivo.size - 128).arrayBuffer());
        if (v1[0] === 0x54 && v1[1] === 0x41 && v1[2] === 0x47) { const s = (a, z) => new TextDecoder('latin1').decode(v1.subarray(a, z)).replace(/\0/g, '').trim();
          out.titulo = s(3, 33); out.interprete = s(33, 63); out.disco = s(63, 93); out.ano = s(93, 97); }
      }
    } catch (e) { /* arquivo sem etiquetas legíveis */ }
    if (out.ano) out.ano = String(out.ano).slice(0, 4);
    if (out.bpm) out.bpm = parseInt(out.bpm, 10) || '';
    return out;
  };
  // Duração lida pelo próprio navegador (o arquivo não sai do computador)
  M.lerDuracao = arquivo => new Promise(ok => {
    const url = URL.createObjectURL(arquivo), a = new Audio(); let feito = false;
    const fim = v => { if (feito) return; feito = true; URL.revokeObjectURL(url); ok(v); };
    a.preload = 'metadata'; a.onloadedmetadata = () => fim(isFinite(a.duration) ? Math.round(a.duration) : 0); a.onerror = () => fim(0);
    setTimeout(() => fim(0), 8000); a.src = url;
  });

  // Planilha (CSV com ; ou ,) → linhas com os nomes das colunas em minúsculas e sem acento
  M.lerPlanilha = texto => {
    const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!linhas.length) return [];
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    const partes = l => { const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) { const c = l[i];
        if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; }
      out.push(cur); return out.map(x => x.trim()); };
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const cab = partes(linhas[0]).map(norm);
    return linhas.slice(1).map(l => { const v = partes(l), o = {}; cab.forEach((c, i) => { o[c] = v[i] || ''; }); return o; });
  };
})();

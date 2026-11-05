#!/usr/bin/env python3
"""Gera MAPA.md: o mapa do SONVI (arquivos, telas, ações, funções S.*, chamadas ao banco, funções de borda e
o que cada migração cria). Serve para achar onde mexer sem ler os arquivos inteiros.
Rodar da raiz do projeto:  python3 ferramentas/mapa.py
Rodar de novo depois de cada mudança grande (o arquivo é refeito do zero)."""
import re, os, glob, collections

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
lin = lambda t: t.count('\n') + 1
uniq = lambda xs: sorted(set(xs))

def junta(xs, n=60):
    xs = uniq(xs)
    return ', '.join(xs[:n]) + (f' … (+{len(xs) - n})' if len(xs) > n else '') if xs else '—'

out = ['# MAPA do SONVI', '',
       'Gerado por `ferramentas/mapa.py` (não editar à mão; rode o script de novo depois de mudanças grandes).',
       'Use para achar o arquivo e a função certos antes de abrir qualquer coisa; depois leia só o trecho (Grep/Read com offset).', '']

# ---------- app/js ----------
uso_rpc = collections.defaultdict(set)      # função do banco -> arquivos do app que chamam
uso_tab = collections.defaultdict(set)      # tabela -> arquivos
uso_fn = collections.defaultdict(set)       # função de borda -> arquivos
def_s = {}                                  # S.nome -> arquivo
arqs = sorted(glob.glob('app/js/*.js'))
blocos = []
TODO_APP = ''.join(open(a, encoding='utf-8').read() for a in arqs)
ACTS_USADAS = set(re.findall(r"data-act=\\?[\"']([A-Za-z_]\w*)", TODO_APP)) | set(re.findall(r"\bact\s*:\s*'([A-Za-z_]\w*)'", TODO_APP))
for a in arqs:
    t = open(a, encoding='utf-8').read(); nome = os.path.basename(a)
    views = re.findall(r"S\.views(?:\.([A-Za-z_]\w*)|\[\s*'([^']+)'\s*\])\s*=", t)
    views = [x or y for x, y in views]
    # ações: chaves "nome: (...) =>" dentro do arquivo que existem como data-act/act: em algum lugar do app
    acts = re.findall(r"S\.actions\.([A-Za-z_]\w*)\s*=", t)
    if 'S.actions' in t:
        acts += [k for k in re.findall(r"(?m)^\s+([a-z]\w*)\s*:\s*(?:async\s+)?(?:\([^)]*\)|[a-z_]\w*)\s*=>", t) if k in ACTS_USADAS]
    sdefs = re.findall(r"(?<![\w.])S\.([A-Za-z_]\w*)\s*=(?!=)", t)
    for s in sdefs:
        if s not in ('views', 'actions', 'ui', 'db', 'me', 'ctx'): def_s.setdefault(s, nome)
    rpcs = re.findall(r"rpc\(\s*'([a-z_0-9]+)'", t)
    tabs = re.findall(r"\.from\(\s*'([a-z_0-9]+)'", t)
    fns = re.findall(r"functions\.invoke\(\s*'([a-z_0-9]+)'", t) + re.findall(r"functions/v1/([a-z_0-9]+)", t)
    for r in rpcs: uso_rpc[r].add(nome)
    for r in tabs: uso_tab[r].add(nome)
    for r in fns: uso_fn[r].add(nome)
    blocos.append((nome, lin(t), views, acts, [s for s in sdefs if s not in ('views', 'actions')], rpcs, tabs, fns))

out += ['## App (`app/js/`, ordem de carga em `app/index.html`)', '']
for nome, n, views, acts, sdefs, rpcs, tabs, fns in blocos:
    out.append(f'### {nome} · {n} linhas')
    if views: out.append(f'- Telas (`S.views`): {junta(views)}')
    if acts: out.append(f'- Ações (`data-act`): {junta(acts, 80)}')
    if sdefs: out.append(f'- Define `S.`: {junta(sdefs, 80)}')
    if rpcs: out.append(f'- Banco (rpc): {junta(rpcs)}')
    if tabs: out.append(f'- Tabelas lidas/gravadas: {junta(tabs)}')
    if fns: out.append(f'- Funções de borda: {junta(fns)}')
    out.append('')

# ---------- páginas ----------
out += ['## Páginas soltas (`app/*.html`, `app/console/`)', '']
for a in sorted(glob.glob('app/*.html') + glob.glob('app/console/*.html') + glob.glob('app/console/*.js')):
    t = open(a, encoding='utf-8').read()
    rpcs = re.findall(r"rpc\(\s*['`]([a-z_0-9]+)", t) + re.findall(r"rpc/([a-z_0-9]+)", t)
    fns = re.findall(r"functions\.invoke\(\s*'([a-z_0-9]+)'", t) + re.findall(r"functions/v1/([a-z_0-9]+)", t)
    for r in rpcs: uso_rpc[r].add(a.replace('app/', ''))
    for r in fns: uso_fn[r].add(a.replace('app/', ''))
    out.append(f'- `{a}` ({lin(t)} linhas) · rpc: {junta(rpcs)} · borda: {junta(fns)}')
out.append('')

# ---------- funções de borda ----------
out += ['## Funções de borda (`supabase/functions/<nome>/`; publicar com o arquivo `source/index.ts`)', '']
for d in sorted(glob.glob('supabase/functions/*/')):
    nome = os.path.basename(d.rstrip('/'))
    fs = glob.glob(d + '**/*.ts', recursive=True)
    t = ''.join(open(f, encoding='utf-8').read() for f in fs)
    acoes = re.findall(r"acao\s*===?\s*'([a-z_0-9]+)'", t) + re.findall(r"case\s+'([a-z_0-9]+)'", t)
    rpcs = re.findall(r"rpc\(\s*'([a-z_0-9]+)'", t)
    rem = re.findall(r"<([a-z]+@sonvi\.com\.br)>", t)
    out.append(f'- **{nome}** ({", ".join(os.path.relpath(f, d) for f in fs)}) · ações: {junta(acoes)} · rpc: {junta(rpcs)} · remetentes: {junta(rem)} · chamada por: {junta(uso_fn.get(nome, []))}')
out.append('')

# ---------- banco ----------
fun_ult, fun_mig, tab_mig, gat = {}, collections.defaultdict(list), {}, {}
for a in sorted(glob.glob('database/*.sql')):
    t = open(a, encoding='utf-8').read(); m = os.path.basename(a)[:3]
    for f in re.findall(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)", t, re.I):
        fun_ult[f] = m; fun_mig[f].append(m)
    for tb in re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)", t, re.I):
        tab_mig.setdefault(tb, m)
    for g, tb in re.findall(r"create\s+trigger\s+([a-z_0-9]+)[^;]*?\son\s+(?:public\.)?([a-z_0-9]+)", t, re.I | re.S):
        gat[g] = (tb, m)
out += ['## Banco (`database/NNN_*.sql`)', '',
        'Mudou uma função? Copie a versão da **última** migração listada (é a que vale) para um arquivo novo.', '',
        '### Tabelas (migração que cria) e quem usa no app', '']
for tb in sorted(tab_mig):
    out.append(f'- `{tb}` ({tab_mig[tb]}) · app: {junta(uso_tab.get(tb, []))}')
out += ['', '### Funções (migrações em que aparece; a última vale) e quem chama no app', '']
for f in sorted(fun_mig):
    ms = uniq(fun_mig[f])
    out.append(f'- `{f}` ({" → ".join(ms)}) · app: {junta(uso_rpc.get(f, []))}')
out += ['', '### Gatilhos (tabela, migração)', '']
out.append(', '.join(f'`{g}` ({tb}, {m})' for g, (tb, m) in sorted(gat.items())))
falta = sorted(set(uso_rpc) - set(fun_mig))
if falta: out += ['', f'Chamadas do app sem função achada em `database/` (criadas à mão ou pelo Supabase): {", ".join(falta)}']
out.append('')

# ---------- onde fica o quê ----------
out += ['## Onde ficam os `S.` (função → arquivo)', '',
        ', '.join(f'`{k}` {v.replace(".js", "")}' for k, v in sorted(def_s.items(), key=lambda x: x[0].lower())), '']

open('MAPA.md', 'w', encoding='utf-8').write('\n'.join(out))
print(f'MAPA.md: {sum(len(x) for x in out)} caracteres, {len(blocos)} arquivos do app, {len(fun_mig)} funções do banco, {len(tab_mig)} tabelas')

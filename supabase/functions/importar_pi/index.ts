// SONVI · função de borda "importar_pi" (31/10/2026; database/066). Lê o PI que a agência ou o cliente mandou
// (PDF, foto ou planilha já convertida em texto) com a IA da Anthropic e devolve os dados organizados para a tela de
// conferência. Não grava nada: quem cria o PI é a tela, depois que a pessoa confere.
//   { veiculo_id, nome, tipo, base64 }   → PDF ou imagem (até 15 MB)
//   { veiculo_id, nome, texto }          → planilha (a tela converte em texto)
// Só para quem cria PI no veículo (diretor, gerente, consultor). A chave fica no segredo ANTHROPIC_API_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ESQUEMA = {
  type: 'object',
  properties: {
    numero_pi: { type: 'string', description: 'Número do PI/autorização no documento da agência ou do cliente. Vazio se não houver.' },
    data_emissao: { type: 'string', description: 'Data de emissão AAAA-MM-DD, ou vazio.' },
    agencia: { type: 'object', description: 'Agência de publicidade que emitiu o PI. null se o PI veio direto do anunciante.', properties: {
      nome: { type: 'string' }, razao_social: { type: 'string' }, cnpj: { type: 'string' }, email: { type: 'string' }, telefone: { type: 'string' } } },
    cliente: { type: 'object', description: 'Anunciante (o cliente).', properties: {
      nome: { type: 'string', description: 'Nome fantasia ou como aparece' }, razao_social: { type: 'string' }, cnpj: { type: 'string', description: 'CNPJ ou CPF como está' },
      email: { type: 'string' }, telefone: { type: 'string' }, cidade: { type: 'string' }, endereco: { type: 'string' } } },
    veiculo: { type: 'object', properties: { nome: { type: 'string', description: 'Emissora/veículo a quem o PI se destina' }, praca: { type: 'string' } } },
    campanha: { type: 'string', description: 'Título, campanha ou produto anunciado.' },
    periodo: { type: 'object', properties: { inicio: { type: 'string', description: 'AAAA-MM-DD' }, fim: { type: 'string', description: 'AAAA-MM-DD' } } },
    comissao_pct: { type: ['number', 'null'], description: 'Percentual de comissão/desconto-padrão da agência (ex.: 20). null se não houver.' },
    desconto_valor: { type: ['number', 'null'], description: 'Desconto geral em reais sobre o total, se houver (além da comissão). null se não houver.' },
    pagamento: { type: 'object', properties: { forma: { type: 'string', description: 'Boleto, depósito, Pix…' }, vencimento: { type: 'string', description: 'AAAA-MM-DD do 1º vencimento, ou vazio' }, condicoes: { type: 'string' } } },
    observacoes: { type: 'string', description: 'Observações e instruções importantes do PI (texto curto).' },
    assinado: { type: ['boolean', 'null'], description: 'true se o PI tem assinatura ou carimbo de autorização (da agência ou do anunciante); false se o espaço de assinatura está em branco ou não há assinatura; null se não dá para saber.' },
    linhas: { type: 'array', description: 'Uma linha por programa/formato da grade de inserções.', items: { type: 'object', properties: {
      programa: { type: 'string', description: 'Programa, horário ou tipo de inserção como escrito (ex.: Rotativo 7h às 19h).' },
      horario: { type: 'string', description: 'Faixa horária, se houver (ex.: 07h às 19h).' },
      duracao: { type: 'string', description: 'Duração ou formato (ex.: 30", Testemunhal 60").' },
      unitario: { type: 'number', description: 'Valor unitário bruto por inserção, em reais.' },
      insercoes_total: { type: 'integer', description: 'Total de inserções da linha.' },
      total: { type: 'number', description: 'Valor total bruto da linha, em reais.' },
      bonificada: { type: 'boolean', description: 'true se for bonificação/cortesia (sem custo).' },
      meses: { type: 'array', description: 'Grade de inserções, um item por mês. Se a grade só traz o número do dia, use o mês e o ano do cabeçalho/período.',
        items: { type: 'object', properties: {
          mes: { type: 'string', description: 'AAAA-MM' },
          dias: { type: 'string', description: 'Só os dias com inserção, no formato "dia:quantidade" separados por vírgula. Ex.: "3:2,4:2,5:1,10:3".' } },
          required: ['mes', 'dias'] } },
      produto_sugerido_id: { type: 'string', description: 'id do produto do catálogo do veículo que corresponde à linha, ou vazio.' },
      formato_sugerido_id: { type: 'string', description: 'id da duração/variação do catálogo que corresponde, ou vazio.' } },
      required: ['programa', 'unitario', 'insercoes_total', 'meses'] } },
    total_bruto: { type: ['number', 'null'], description: 'Valor total bruto escrito no documento.' },
    total_liquido: { type: ['number', 'null'], description: 'Valor líquido escrito no documento, se houver.' },
    duvidas: { type: 'array', items: { type: 'string' }, description: 'O que ficou ilegível, ambíguo ou foi deduzido (frases curtas em português).' },
  },
  required: ['cliente', 'linhas', 'duvidas'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  try {
    const chaveIA = Deno.env.get('ANTHROPIC_API_KEY');
    if (!chaveIA) return resposta({ erro: 'A leitura de PI ainda não está ligada: falta a chave da Anthropic no Supabase (segredo ANTHROPIC_API_KEY).' }, 503);
    const url = Deno.env.get('SUPABASE_URL')!, publica = Deno.env.get('SUPABASE_ANON_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    const quem = createClient(url, publica, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await quem.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!user) return resposta({ erro: 'Entre no SONVI para importar.' }, 401);

    const b = await req.json().catch(() => ({}));
    const veiculo = String(b.veiculo_id || '');
    const { data: perfil } = await quem.rpc('perfil_no_veiculo', { v: veiculo });
    if (!['diretor', 'gerente', 'consultor'].includes(String(perfil || ''))) return resposta({ erro: 'Seu perfil não cria PI neste veículo.' }, 403);

    // Catálogo do veículo (lido com as regras de quem chama) para a IA sugerir a ligação de cada linha
    const { data: v } = await quem.from('veiculos').select('nome, sigla, cidade, frequencia').eq('id', veiculo).maybeSingle();
    const { data: prods } = await quem.from('produtos').select('id, nome, tipo, secao, detalhe, ativo').eq('veiculo_id', veiculo).neq('secao', 'digital');
    const programas = (prods || []).filter((p: any) => p.tipo === 'programa' && p.ativo !== false && !['ooh', 'patrocinio'].includes(p.secao));
    const formatos = (prods || []).filter((p: any) => p.tipo === 'formato' && p.ativo !== false);
    const catalogo = `Veículo aberto no SONVI: ${v?.nome || ''} (sigla ${v?.sigla || ''}, ${v?.frequencia || ''} ${v?.cidade || ''}).\n` +
      `Produtos (programas) do veículo:\n${programas.map((p: any) => `- ${p.id} | ${p.nome}${p.detalhe ? ' | ' + String(p.detalhe).replace(/\n/g, '; ') : ''}`).join('\n') || '- (nenhum)'}\n` +
      `Durações e variações:\n${formatos.map((f: any) => `- ${f.id} | ${f.nome}`).join('\n') || '- (nenhuma)'}`;

    const conteudo: any[] = [];
    if (b.texto) conteudo.push({ type: 'text', text: `Planilha do PI (${String(b.nome || '')}), convertida em texto:\n\n${String(b.texto).slice(0, 200000)}` });
    else {
      const tipo = String(b.tipo || ''), dados = String(b.base64 || '');
      if (!dados) return resposta({ erro: 'Arquivo vazio.' }, 400);
      if (dados.length > 21_000_000) return resposta({ erro: 'Arquivo grande demais (até 15 MB).' }, 413);
      if (tipo === 'application/pdf') conteudo.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dados } });
      else if (/^image\/(png|jpeg|gif|webp)$/.test(tipo)) conteudo.push({ type: 'image', source: { type: 'base64', media_type: tipo, data: dados } });
      else return resposta({ erro: 'Formato não aceito. Envie PDF, JPG, PNG ou planilha.' }, 400);
    }
    conteudo.push({ type: 'text', text: `Este é um PI (pedido de inserção) de mídia enviado por uma agência ou anunciante para uma emissora. ` +
      `Leia o documento inteiro e registre tudo chamando a ferramenta registrar_pi uma única vez (obrigatório; não responda em texto). Regras: valores em reais como número (1.234,56 → 1234.56); ` +
      `datas AAAA-MM-DD; a grade de inserções vira "meses" (por mês, "dia:quantidade" só dos dias com inserção); não invente o que não está no documento ` +
      `(deixe vazio e diga em "duvidas"); confira se a soma das linhas bate com o total do documento e, se não bater, diga em "duvidas". ` +
      `Para cada linha, sugira o produto e a duração do catálogo abaixo que correspondem (pelo nome, horário e duração), só se tiver segurança.\n\n${catalogo}` });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chaveIA, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
        max_tokens: 16000,
        tools: [{ name: 'registrar_pi', description: 'Registra os dados lidos do PI.', input_schema: ESQUEMA }],
        tool_choice: { type: 'auto' },   // este modelo não aceita "tool"/"any" forçados; a instrução pede a ferramenta
        messages: [{ role: 'user', content: conteudo }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(j?.error?.message || r.status);
      console.error('Anthropic', r.status, JSON.stringify(j?.error || j));
      let erro = `A leitura falhou: ${msg}`;
      if (/credit balance/i.test(msg)) erro = 'A conta da Anthropic está sem créditos. Coloque créditos em console.anthropic.com › Billing e tente de novo.';
      else if (r.status === 401 || /api.key|x-api-key/i.test(msg)) erro = 'A chave da Anthropic no Supabase não foi aceita. Confira o segredo ANTHROPIC_API_KEY.';
      else if (r.status === 404 || /not_found|model:/i.test(msg)) erro = `O modelo de IA não foi encontrado (${msg}).`;
      return resposta({ erro }, 502);
    }
    const uso = (j.content || []).find((c: any) => c.type === 'tool_use');
    let leitura = uso?.input;
    if (!leitura) {   // reserva: a IA respondeu em texto; aproveita o JSON se houver
      const txt = (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
      const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
      if (a >= 0 && z > a) { try { leitura = JSON.parse(txt.slice(a, z + 1)); } catch (_) { /* não era JSON */ } }
      if (!leitura) console.error('Sem tool_use', j.stop_reason, txt.slice(0, 500));
    }
    if (!leitura || !Array.isArray(leitura.linhas)) return resposta({ erro: 'Não foi possível ler este documento. Confira se é um PI e tente de novo.' }, 422);
    return resposta({ ok: true, leitura, uso: j.usage });
  } catch (e) {
    console.error(e);
    return resposta({ erro: (e as Error).message ?? String(e) }, 500);
  }
});

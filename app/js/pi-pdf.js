// SONVI · PDF do PI gerado pelo próprio SONVI (10/11/2026). Antes o PDF saía pela impressão do navegador com @page deitado,
// mas o Safari do iPhone ignora o @page e gera A4 em pé: o PI saía espremido e sobreposto (PI NTV 0058, Nativa FM).
// Agora o documento (.pidoc, o mesmo da prévia) é desenhado num palco fora da tela, na largura da folha deitada, e vira PDF
// pelo html2pdf (carregado só na hora): Ofício (legal) ou A4 deitado, margem de 8 mm, igual no computador, tablet e celular.
// windowWidth do html2canvas faz o documento ser montado como no computador, sem as regras de celular do sonvi.css.
// Usado no SONVI (pi.js: Exportar e "Baixar PDF" do envio à OPEC) e na página da OPEC (pi.html).
(() => {
  const carregar = () => window.html2pdf ? Promise.resolve() : new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
    s.onload = ok; s.onerror = () => erro(new Error('Não foi possível preparar o PDF agora. Verifique a internet e tente de novo.')); document.head.appendChild(s); });
  const limpa = n => String(n || 'PI').replace(/[\\/:*?"<>|\r\n]/g, '-').trim().slice(0, 140) || 'PI';
  // html: o conteúdo de #print depois de S.buildPrint (ou o .pi-envio da página da OPEC); papel: 'a4' ou qualquer outro = Ofício
  window.sonviPdfPI = async (html, papel, nome) => {
    await carregar();
    const legal = papel !== 'a4', largura = legal ? 1284 : 1062;   /* área útil da folha deitada (menos 2 × 8 mm) a 96 px por polegada */
    const palco = document.createElement('div');
    palco.className = 'previa pdf-palco'; palco.setAttribute('aria-hidden', 'true');
    palco.style.cssText = `position:fixed;left:0;top:0;width:${largura}px;background:#fff;z-index:-1;pointer-events:none;opacity:1`;
    palco.innerHTML = html; document.body.appendChild(palco);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const alvo = palco.querySelector('.pidoc') || palco;
      alvo.style.width = largura + 'px'; alvo.style.minWidth = '0'; alvo.style.background = '#fff';
      await window.html2pdf().set({ margin:8, filename:limpa(nome).replace(/(\.pdf)?$/i, '.pdf'), image:{ type:'jpeg', quality:.96 },
        html2canvas:{ scale:2, backgroundColor:'#ffffff', useCORS:true, scrollX:0, scrollY:0 },
        jsPDF:{ unit:'mm', format:legal ? 'legal' : 'a4', orientation:'landscape' },
        pagebreak:{ mode:['css', 'legacy'], avoid:['tr', '.pd-box', '.pd-ass', '.pd-num', '.pd-topo', '.pd-fecho'] } }).from(alvo).save();
    } finally { palco.remove(); }
  };
})();

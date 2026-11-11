-- 085 · Liga o WhatsApp do Resumo do dia (10/11/2026)
-- O modelo "resumo_diario" (Utilidade, pt_BR, 8 variáveis) foi aprovado pela Meta em 10/11/2026 e o teste chegou
-- no celular do Luiz pelo número SONVI (+55 65 9819-1977). A partir daqui, em Administração › Resumo do dia,
-- o diretor pode escolher WhatsApp ou Os dois para cada pessoa (quem não tiver celular cadastrado recebe por e-mail).
update public.resumo_config set whatsapp_ativo = true, atualizado_em = now() where whatsapp_ativo = false;

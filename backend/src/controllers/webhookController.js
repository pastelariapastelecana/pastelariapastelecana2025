const { getPaymentDetails } = require('../services/mercadoPagoService');
// Removido: const { sendOrderConfirmationEmail } = require('../services/resendService');

async function handleMercadoPagoWebhook(req, res) {
    const notificationType = req.body.type;
    const paymentId = req.body.data?.id;

    if (!paymentId || !notificationType) {
        console.warn('Webhook recebido sem paymentId ou notificationType:', req.body);
        return res.status(400).send('paymentId e notificationType são obrigatórios.');
    }

    console.log(`[Webhook] Recebido evento do Mercado Pago: Payment ID=${paymentId}, Tipo=${notificationType}`);

    try {
        if (notificationType === 'payment') {
            const paymentDetails = await getPaymentDetails(paymentId);

            if (!paymentDetails) {
                console.warn(`[Webhook] Detalhes do pagamento não encontrados para ID: ${paymentId}. Ignorando notificação.`);
                return res.status(200).send('Payment not found, notification ignored.');
            }

            console.log(`[Webhook] Status do pagamento para ID ${paymentId}: ${paymentDetails.status}`);

            if (paymentDetails.status === 'approved') {
                // O webhook (IPN) não contém os detalhes completos do pedido (itens do carrinho, endereço de entrega).
                // O e-mail detalhado é enviado pelo orderController.js quando o frontend retorna da página de pagamento.
                // Aqui, apenas registramos o sucesso do pagamento.
                console.log(`[Webhook] Pagamento ID ${paymentId} aprovado. Aguardando confirmação detalhada do frontend.`);
            } else {
                console.log(`[Webhook] Pagamento ID ${paymentId} não aprovado. Status: ${paymentDetails.status}`);
                // Lógica futura para atualizar status de pagamento pendente/rejeitado no banco de dados.
            }
        } else {
            console.log(`[Webhook] Tópico ${notificationType} não é um evento de pagamento. Ignorando.`);
        }

        res.status(200).send('Webhook processado com sucesso.');
    } catch (error) {
        console.error(`[Webhook] Erro inesperado ao processar webhook para ID ${paymentId}:`, error.message);
        res.status(500).send('Erro interno ao processar webhook.');
    }
}

module.exports = { handleMercadoPagoWebhook };

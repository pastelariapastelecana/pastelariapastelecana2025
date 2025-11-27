const { getPaymentDetails } = require('../services/mercadoPagoService');
const { sendOrderConfirmationEmail } = require('../services/emailService');

// Função auxiliar para processar o pagamento e enviar o e-mail
async function processPaymentNotification(paymentId) {
    const paymentDetails = await getPaymentDetails(paymentId);

    if (!paymentDetails) {
        console.warn(`[Webhook] Detalhes do pagamento não encontrados para ID: ${paymentId}. Ignorando notificação.`);
        return { success: false, message: 'Payment not found.' };
    }

    console.log(`[Webhook] Status do pagamento para ID ${paymentId}: ${paymentDetails.status}`);

    if (paymentDetails.status === 'approved') {
        // Tenta obter o external_reference (ID do pedido interno)
        const orderId = paymentDetails.external_reference || 'N/A';
        
        // Garante que payer e suas propriedades existam antes de acessá-las
        const payerName = (paymentDetails.payer?.first_name || '') + ' ' + (paymentDetails.payer?.last_name || '');
        const payerEmail = paymentDetails.payer?.email || 'email_nao_disponivel@example.com';

        // O Mercado Pago não envia os detalhes completos do carrinho no IPN,
        // então usamos os dados disponíveis para notificar o lojista.
        const placeholderOrderDetails = {
            orderId: orderId, // Inclui o orderId
            items: paymentDetails.items && paymentDetails.items.length > 0 
                ? paymentDetails.items.map(item => ({ 
                    name: item.title, 
                    quantity: item.quantity, 
                    price: item.unit_price 
                }))
                : [{ name: 'Pedido via Mercado Pago IPN', quantity: 1, price: paymentDetails.transaction_amount }],
            
            deliveryDetails: { address: 'Endereço não disponível via IPN', number: 'N/A', neighborhood: 'N/A', city: 'N/A', zipCode: 'N/A' },
            deliveryFee: 0,
            totalPrice: paymentDetails.transaction_amount,
            totalWithDelivery: paymentDetails.transaction_amount,
            paymentMethod: 'Mercado Pago Checkout Pro (IPN)',
            payerName: payerName.trim() || 'Cliente Desconhecido',
            payerEmail: payerEmail,
            orderDate: new Date().toISOString(),
            paymentId: paymentDetails.id,
        };

        await sendOrderConfirmationEmail(placeholderOrderDetails);
        console.log(`[Webhook] E-mail de confirmação enviado para o pedido com ID de pagamento ${paymentId} (Order ID: ${orderId}).`);
        return { success: true, message: 'Payment approved and email sent.' };
    } else {
        console.log(`[Webhook] Pagamento ID ${paymentId} não aprovado. Status: ${paymentDetails.status}`);
        return { success: false, message: `Payment status is ${paymentDetails.status}.` };
    }
}

async function handleMercadoPagoWebhook(req, res) {
    // O Mercado Pago envia o ID do recurso na query string ou no corpo, dependendo da configuração.
    // Vamos priorizar o ID do corpo (data.id) ou o ID da query (id)
    const paymentId = req.body.data?.id || req.query.id;
    const notificationType = req.body.type || req.query.topic;

    if (!paymentId || notificationType !== 'payment') {
        console.warn('Webhook recebido sem paymentId ou não é um evento de pagamento. Ignorando:', req.body);
        // Retorna 200 OK para evitar reenvio do webhook
        return res.status(200).send('Notification received, but not a payment event or missing ID.');
    }

    console.log(`[Webhook] Recebido evento do Mercado Pago: Payment ID=${paymentId}, Tipo=${notificationType}`);

    try {
        await processPaymentNotification(paymentId);
        res.status(200).send('Webhook processado com sucesso.');
    } catch (error) {
        console.error(`[Webhook] Erro inesperado ao processar webhook para ID ${paymentId}:`, error.message);
        res.status(500).send('Erro interno ao processar webhook.');
    }
}

module.exports = { handleMercadoPagoWebhook };

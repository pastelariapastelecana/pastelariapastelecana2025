const nodemailer = require('nodemailer');

// Check for all required environment variables
const emailHost = process.env.EMAIL_HOST;
const emailPort = process.env.EMAIL_PORT;
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const orderRecipientEmail = process.env.ORDER_RECIPIENT_EMAIL;

if (!emailHost || !emailPort || !emailUser || !emailPass || !orderRecipientEmail) {
    const missingVars = [];
    if (!emailHost) missingVars.push('EMAIL_HOST');
    if (!emailPort) missingVars.push('EMAIL_PORT');
    if (!emailUser) missingVars.push('EMAIL_USER');
    if (!emailPass) missingVars.push('EMAIL_PASS');
    if (!orderRecipientEmail) missingVars.push('ORDER_RECIPIENT_EMAIL');
    console.error(`ERRO CRÍTICO: Variáveis de ambiente de e-mail ausentes no backend: ${missingVars.join(', ')}`);
    throw new Error(`Configuração de e-mail incompleta. Variáveis ausentes: ${missingVars.join(', ')}`);
}

// Log de depuração para confirmar as configurações lidas
console.log(`[EmailService] Tentando conectar ao SMTP: ${emailHost}:${emailPort} (Secure: ${parseInt(emailPort) === 465}) com usuário: ${emailUser}`);

const transporter = nodemailer.createTransport({
    host: emailHost,
    port: parseInt(emailPort),
    // Define 'secure' baseado na porta: true para 465, false para outras (como 587)
    secure: parseInt(emailPort) === 465, 
    auth: {
        user: emailUser,
        pass: emailPass,
    },
    tls: {
        // Permite conexões não autorizadas, útil para alguns hosts, mas deve ser evitado em produção se possível
        rejectUnauthorized: false,
    },
});

async function sendOrderConfirmationEmail(orderDetails) {
    const { items, deliveryDetails, deliveryFee, totalPrice, totalWithDelivery, paymentMethod, payerName, payerEmail, orderDate, paymentId, orderId } = orderDetails;

    const itemDetails = items.map(item => `
        <li>${item.name} (x${item.quantity}) - R$ ${item.price.toFixed(2)} cada</li>
    `).join('');

    const emailContent = `
        <h1>Novo Pedido Recebido!</h1>
        <p>Um novo pedido foi finalizado com sucesso em ${new Date(orderDate).toLocaleString('pt-BR')}.</p>
        ${orderId ? `<p><strong>ID do Pedido Interno (External Reference):</strong> ${orderId}</p>` : ''}
        ${paymentId ? `<p><strong>ID do Pagamento (Mercado Pago):</strong> ${paymentId}</p>` : ''}
        
        <h2>Detalhes do Cliente:</h2>
        <p><strong>Nome:</strong> ${payerName}</p>
        <p><strong>E-mail:</strong> ${payerEmail}</p>

        <h2>Detalhes da Entrega:</h2>
        <p><strong>Endereço:</strong> ${deliveryDetails.address}, ${deliveryDetails.number}, ${deliveryDetails.neighborhood}, ${deliveryDetails.city} - ${deliveryDetails.zipCode}</p>
        <p><strong>Taxa de Entrega:</strong> R$ ${deliveryFee ? deliveryFee.toFixed(2) : '0.00'}</p>

        <h2>Itens do Pedido:</h2>
        <ul>
            ${itemDetails}
        </ul>

        <h2>Resumo do Pagamento:</h2>
        <p><strong>Subtotal dos Itens:</strong> R$ ${totalPrice.toFixed(2)}</p>
        <p><strong>Taxa de Entrega:</strong> R$ ${deliveryFee ? deliveryFee.toFixed(2) : '0.00'}</p>
        <p><strong>Total Geral:</strong> R$ ${totalWithDelivery.toFixed(2)}</p>
        <p><strong>Método de Pagamento:</strong> ${paymentMethod === 'pix' ? 'PIX' : 'Mercado Pago'}</p>

        <p>Por favor, prepare o pedido e organize a entrega.</p>
        <p>Atenciosamente,<br>Sua Pastelaria Pastel & Cana</p>
    `;

    const mailOptions = {
        from: emailUser,
        to: orderRecipientEmail,
        subject: `Novo Pedido Recebido - #${orderId ? orderId.substring(0, 8) : new Date(orderDate).getTime()} (MP ID: ${paymentId})`,
        html: emailContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('E-mail de confirmação de pedido enviado com sucesso!');
    } catch (error) {
        console.error('Erro ao enviar e-mail de confirmação de pedido:', error);
        throw new Error('Falha ao enviar e-mail de confirmação.');
    }
}

module.exports = { sendOrderConfirmationEmail };

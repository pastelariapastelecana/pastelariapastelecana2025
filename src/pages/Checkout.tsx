"use client";

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCart } from '@/contexts/CartContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MapPin, CreditCard, Loader2, CheckCircle2, User, Mail, XCircle, Clock, LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Define a interface para os detalhes de entrega
interface DeliveryDetails {
    address: string;
    number: string;
    neighborhood: string;
    city: string;
    zipCode: string;
}

const Checkout = () => {
  const { items, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Tenta obter os detalhes de entrega do state de navegação ou do localStorage
  const initialDeliveryState = (location.state || {}) as {
    deliveryDetails?: DeliveryDetails;
    deliveryFee?: number | null;
  };

  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails | undefined>(initialDeliveryState.deliveryDetails);
  const [deliveryFee, setDeliveryFee] = useState<number | null | undefined>(initialDeliveryState.deliveryFee);

  const [paymentMethod, setPaymentMethod] = useState<'mercadopago'>('mercadopago');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed' | 'pending'>('idle');
  const [orderProcessed, setOrderProcessed] = useState(false);

  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');

  const totalWithDelivery = totalPrice + (deliveryFee || 0);

  // Efeito para carregar dados persistidos e inicializar estados
  useEffect(() => {
    const storedDetails = localStorage.getItem('checkoutDetails');
    const storedPayer = localStorage.getItem('payerDetails');

    // 1. Carregar detalhes de entrega se estiverem faltando no state (após redirecionamento)
    if ((!deliveryDetails || deliveryFee === undefined || deliveryFee === null) && storedDetails) {
        try {
            const parsedDetails = JSON.parse(storedDetails);
            setDeliveryDetails(parsedDetails.deliveryDetails);
            setDeliveryFee(parsedDetails.deliveryFee);
        } catch (e) {
            console.error("Erro ao parsear checkoutDetails do localStorage", e);
        }
    }

    // 2. Carregar dados do pagador
    if (storedPayer) {
        try {
            const parsedPayer = JSON.parse(storedPayer);
            setPayerName(parsedPayer.name || '');
            setPayerEmail(parsedPayer.email || '');
        } catch (e) {
            console.error("Erro ao parsear payerDetails do localStorage", e);
        }
    }
  }, [deliveryDetails, deliveryFee]);


  // Redireciona se o carrinho estiver vazio ou detalhes de entrega ausentes
  useEffect(() => {
    const isPaymentReturn = location.search.includes('status=');
    
    if (items.length === 0 && !orderProcessed && !isPaymentReturn) {
      toast.info('Por favor, revise seu carrinho e endereço de entrega.');
      navigate('/cardapio');
      return;
    }
    
    if (location.pathname === '/checkout' && items.length > 0 && (!deliveryDetails || deliveryFee === undefined || deliveryFee === null)) {
        if (localStorage.getItem('checkoutDetails') === null) {
            toast.info('Detalhes de entrega ausentes. Retorne ao carrinho.');
            navigate('/carrinho');
        }
    }
  }, [items, navigate, deliveryDetails, deliveryFee, orderProcessed, location.search, location.pathname]);

  const constructFullAddress = (details?: DeliveryDetails) => {
    if (!details) return '';
    const { address, number, neighborhood, city, zipCode } = details;
    return `${address}, ${number}, ${neighborhood}, ${city} - ${zipCode}`;
  };

  // Função para enviar os detalhes do pedido para o backend
  const sendOrderToBackend = useCallback(async (paymentId: string, paymentMethodUsed: string) => {
    
    const currentDeliveryDetails = deliveryDetails;
    const currentDeliveryFee = deliveryFee;
    const currentPayerName = payerName;
    const currentPayerEmail = payerEmail;

    if (!currentDeliveryDetails || currentDeliveryFee === null || currentDeliveryFee === undefined) {
        toast.error('Detalhes de entrega ou taxa de frete ausentes. Por favor, retorne ao carrinho.');
        setPaymentStatus('failed');
        return;
    }

    const orderDetails = {
        items: items,
        deliveryDetails: currentDeliveryDetails,
        deliveryFee: currentDeliveryFee,
        totalPrice: totalPrice,
        totalWithDelivery: totalPrice + (currentDeliveryFee || 0),
        paymentMethod: paymentMethodUsed,
        payerName: currentPayerName,
        payerEmail: currentPayerEmail,
        paymentId: paymentId,
        orderDate: new Date().toISOString(),
    };

    try {
        await axios.post(`${BACKEND_URL}/api/confirm-order`, orderDetails);
        
        toast.success('Pagamento Aprovado! Seu pedido está sendo preparado.');
        
        setPaymentStatus('success');
        setOrderProcessed(true);
        clearCart();
        localStorage.removeItem('checkoutDetails');
        localStorage.removeItem('payerDetails');
    } catch (error) {
        console.error('Erro ao confirmar pedido no backend:', error);
        toast.error('Ocorreu um erro ao finalizar seu pedido. Por favor, entre em contato.');
        setPaymentStatus('failed');
    }
  }, [items, deliveryDetails, deliveryFee, totalPrice, payerName, payerEmail, clearCart]);

  // Efeito para lidar com o retorno do Mercado Pago
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const status = query.get('status');
    const paymentId = query.get('payment_id');

    // Se já processamos o pedido, ignoramos.
    if (orderProcessed) return;

    if (status && paymentId) {
        // Se o status for aprovado e ainda não processamos, iniciamos o processamento.
        if (status === 'approved') {
            if (paymentStatus !== 'processing' && paymentStatus !== 'success') {
                setPaymentStatus('processing');
                sendOrderToBackend(paymentId, 'mercadopago_checkout_pro');
            }
        } else if (status === 'pending') {
            setPaymentStatus('pending');
        } else if (status === 'rejected') {
            setPaymentStatus('failed');
        }
    }
  }, [location.search, sendOrderToBackend, orderProcessed, paymentStatus]);

  // Efeito para persistir dados do checkout antes de redirecionar para o MP
  useEffect(() => {
    if (deliveryDetails && deliveryFee !== undefined && deliveryFee !== null) {
        localStorage.setItem('checkoutDetails', JSON.stringify({ deliveryDetails, deliveryFee }));
    }
    if (payerName.trim() && payerEmail.trim()) {
        localStorage.setItem('payerDetails', JSON.stringify({ name: payerName, email: payerEmail }));
    }
  }, [deliveryDetails, deliveryFee, payerName, payerEmail]);


  const handleCheckoutProPayment = async () => {
    if (!deliveryDetails || deliveryFee === null || deliveryFee === undefined || !payerName.trim() || !payerEmail.trim()) {
        toast.error('Por favor, preencha todos os dados do pagador e de entrega.');
        return;
    }

    setIsLoading(true);
    setPaymentStatus('processing');

    try {
        const orderItemsForMP = items.map(item => ({
            title: item.name,
            unit_price: parseFloat(item.price.toFixed(2)),
            quantity: item.quantity,
            currency_id: 'BRL',
            picture_url: item.imageUrl,
            description: item.description || item.name,
        }));

        // Adiciona a taxa de entrega como um item se ela existir
        if (deliveryFee && deliveryFee > 0) {
            orderItemsForMP.push({
                title: 'Taxa de Entrega',
                unit_price: parseFloat(deliveryFee.toFixed(2)),
                quantity: 1,
                currency_id: 'BRL',
                picture_url: '',
                description: 'Custo de entrega do pedido',
            });
        }

        const response = await axios.post(`${BACKEND_URL}/api/create-payment`, {
            items: orderItemsForMP,
            payer: {
                name: payerName,
                email: payerEmail,
            },
        });

        if (response.data && response.data.init_point) {
            // Redireciona para o Mercado Pago
            window.location.href = response.data.init_point; 
        } else {
            throw new Error('URL de pagamento do Mercado Pago não recebida.');
        }
    } catch (error) {
        console.error('Erro ao iniciar pagamento com Mercado Pago Checkout Pro:', error);
        toast.error('Ocorreu um erro ao iniciar o pagamento. Tente novamente.');
        setPaymentStatus('failed');
    } finally {
        setIsLoading(false);
    }
  };

  // Renderização da tela de status (Sucesso, Falha, Pendente)
  const renderStatusScreen = (status: 'success' | 'failed' | 'pending' | 'processing') => {
    let IconComponent: LucideIcon;
    let title, message, iconClass;

    switch (status) {
        case 'success':
            IconComponent = CheckCircle2;
            title = 'Pedido Realizado com Sucesso!';
            message = 'Agradecemos a sua compra. Seu pedido está sendo preparado!';
            iconClass = 'text-accent';
            break;
        case 'failed':
            IconComponent = XCircle;
            title = 'Pagamento Não Aprovado';
            message = 'Seu pagamento foi recusado ou falhou. Por favor, tente novamente ou escolha outro método.';
            iconClass = 'text-destructive';
            break;
        case 'pending':
            IconComponent = Clock;
            title = 'Pagamento Pendente';
            message = 'Seu pagamento está em análise. Assim que for aprovado, você receberá uma confirmação por e-mail.';
            iconClass = 'text-yellow-500';
            break;
        case 'processing':
            IconComponent = Loader2;
            title = 'Processando Pagamento...';
            message = 'Aguarde enquanto confirmamos seu pagamento e finalizamos o pedido.';
            iconClass = 'text-primary animate-spin';
            break;
        default:
            return null;
    }

    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center py-20">
            <IconComponent className={`w-24 h-24 mx-auto mb-6 ${iconClass}`} />
            <h2 className="text-3xl font-bold mb-4">{title}</h2>
            <p className="text-muted-foreground mb-8">
              {message}
            </p>
            {status !== 'processing' && (
                <Link to="/">
                    <Button variant="hero" size="lg">
                        Voltar para o Início
                    </Button>
                </Link>
            )}
            {status === 'failed' && (
                <Button variant="outline" size="lg" className="ml-4" onClick={() => navigate('/checkout')}>
                    Tentar Novamente
                </Button>
            )}
          </div>
        </main>
        <Footer />
      </div>
    );
  };

  // --- Lógica de Renderização Principal ---

  const query = new URLSearchParams(location.search);
  const urlStatus = query.get('status');

  // 1. Se o pedido foi processado com sucesso (via backend)
  if (orderProcessed || paymentStatus === 'success') {
    return renderStatusScreen('success');
  }
  
  // 2. Se estamos retornando do MP com um status, mostramos a tela de status correspondente.
  if (urlStatus === 'approved' || paymentStatus === 'processing') {
    // Se o status é 'approved' na URL, mas o pedido ainda não foi processado, mostramos 'processing'
    return renderStatusScreen('processing');
  }
  
  if (urlStatus === 'rejected' || paymentStatus === 'failed') {
    return renderStatusScreen('failed');
  }
  
  if (urlStatus === 'pending' || paymentStatus === 'pending') {
    return renderStatusScreen('pending');
  }

  // 3. Se o carrinho estiver vazio, mas não for um retorno de pagamento, redireciona (já tratado no useEffect).
  if (items.length === 0 && !urlStatus) {
      return null;
  }

  // 4. Se estiver na tela de checkout principal, mas os detalhes de entrega ainda não foram carregados (ou estão faltando)
  if (!deliveryDetails || deliveryFee === undefined || deliveryFee === null) {
    if (items.length > 0) {
        return renderStatusScreen('processing'); // Mostra tela de carregamento enquanto espera dados do localStorage
    }
    return null;
  }

  // 5. Renderização do formulário de checkout
  const isPayerDetailsMissing = !payerName.trim() || !payerEmail.trim();
  const isCheckoutButtonDisabled = items.length === 0 || isPayerDetailsMissing || isLoading;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] text-white py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Finalizar Pedido</h1>
            <p className="text-xl opacity-90">Confirme seus dados e escolha a forma de pagamento</p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            {/* Resumo do Pedido */}
            <div className="bg-card rounded-2xl shadow-lg p-6 md:p-8 mb-8">
              <h2 className="text-2xl font-bold mb-6">Seu Pedido</h2>
              <div className="space-y-4">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between border-b pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded-md" />
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.quantity} x R$ {item.price.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="font-bold">R$ {(item.quantity * item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 mt-4 space-y-2">
                {deliveryFee !== null && deliveryFee !== undefined && (
                  <div className="flex justify-between text-lg">
                    <span className="text-muted-foreground">Frete:</span>
                    <span className="font-medium text-accent">R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">R$ {totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Endereço de Entrega (apenas exibição) */}
            <div className="bg-card rounded-2xl shadow-lg p-6 md:p-8 mb-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-primary" />
                Endereço de Entrega
              </h2>
              <p className="text-lg text-muted-foreground">
                {constructFullAddress(deliveryDetails)}
              </p>
              <Button variant="link" className="pl-0 mt-2" onClick={() => navigate('/carrinho')}>
                Alterar Endereço
              </Button>
            </div>

            {/* Dados do Pagador */}
            <div className="bg-card rounded-2xl shadow-lg p-6 md:p-8 mb-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <User className="w-6 h-6 text-primary" />
                Dados do Pagador
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payerName">Nome Completo *</Label>
                  <Input
                    id="payerName"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="payerEmail">E-mail *</Label>
                  <Input
                    id="payerEmail"
                    type="email"
                    value={payerEmail}
                    onChange={(e) => setPayerEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Forma de Pagamento */}
            <div className="bg-card rounded-2xl shadow-lg p-6 md:p-8 mb-8">
              <h2 className="text-2xl font-bold mb-6">Forma de Pagamento</h2>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value: 'mercadopago') => {
                  setPaymentMethod(value);
                  setIsLoading(false);
                }}
                className="space-y-4"
              >
                <div className="flex items-center space-x-3 p-4 border rounded-lg">
                  <RadioGroupItem value="mercadopago" id="payment-mercadopago" />
                  <Label htmlFor="payment-mercadopago" className="flex items-center gap-2 text-lg font-medium cursor-pointer">
                    <CreditCard className="w-6 h-6 text-blue-600" />
                    Mercado Pago (Cartão de Crédito/Débito e PIX)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Total e Botão Finalizar */}
            <div className="bg-card rounded-2xl shadow-lg p-6 md:p-8">
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-lg">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">R$ {totalPrice.toFixed(2)}</span>
                </div>
                {deliveryFee !== null && deliveryFee !== undefined && (
                  <div className="flex justify-between text-lg">
                    <span className="text-muted-foreground">Frete:</span>
                    <span className="font-medium text-accent">R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-4 flex justify-between text-2xl font-bold">
                  <span>Total a Pagar:</span>
                  <span className="text-primary">R$ {totalWithDelivery.toFixed(2)}</span>
                </div>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={handleCheckoutProPayment}
                disabled={isCheckoutButtonDisabled}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                ) : (
                  'Finalizar Pedido'
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Checkout;

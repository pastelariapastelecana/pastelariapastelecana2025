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
import { MapPin, CreditCard, Loader2, CheckCircle2, User, Mail } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Definindo a interface para os detalhes do pedido salvos
interface SavedOrderDetails {
    items: typeof items;
    deliveryDetails: {
        address: string;
        number: string;
        neighborhood: string;
        city: string;
        zipCode: string;
    };
    deliveryFee: number;
    totalPrice: number;
    totalWithDelivery: number;
    payerName: string;
    payerEmail: string;
}

const Checkout = () => {
  const { items, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Detalhes de entrega iniciais vêm do state da navegação do Carrinho
  const initialDeliveryState = (location.state || {}) as {
    deliveryDetails?: SavedOrderDetails['deliveryDetails'];
    deliveryFee?: number | null;
  };

  // Usamos o estado local para armazenar os detalhes do pedido, que podem ser recuperados da sessão
  const [currentOrderDetails, setCurrentOrderDetails] = useState<{
    deliveryDetails: SavedOrderDetails['deliveryDetails'] | undefined;
    deliveryFee: number | null;
    items: typeof items;
    totalPrice: number;
    totalWithDelivery: number;
  }>({
    deliveryDetails: initialDeliveryState.deliveryDetails,
    deliveryFee: initialDeliveryState.deliveryFee === undefined ? null : initialDeliveryState.deliveryFee,
    items: items,
    totalPrice: totalPrice,
    totalWithDelivery: totalPrice + (initialDeliveryState.deliveryFee || 0),
  });

  const [paymentMethod, setPaymentMethod] = useState<'mercadopago'>('mercadopago');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');

  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');

  const { deliveryDetails, deliveryFee, totalWithDelivery } = currentOrderDetails;

  // Efeito para lidar com a perda de estado após o redirecionamento
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const status = query.get('status');
    
    if (status && !deliveryDetails) {
        const savedDetailsJson = sessionStorage.getItem('checkout_details');
        if (savedDetailsJson) {
            const savedDetails: SavedOrderDetails = JSON.parse(savedDetailsJson);
            
            // Atualiza o estado local com os dados recuperados
            setCurrentOrderDetails({
                deliveryDetails: savedDetails.deliveryDetails,
                deliveryFee: savedDetails.deliveryFee,
                items: savedDetails.items,
                totalPrice: savedDetails.totalPrice,
                totalWithDelivery: savedDetails.totalWithDelivery,
            });
            setPayerName(savedDetails.payerName);
            setPayerEmail(savedDetails.payerEmail);
            
            // Limpa os dados da sessão após a recuperação
            sessionStorage.removeItem('checkout_details');
        }
    }
  }, [location.search, deliveryDetails]);


  // Redireciona se o carrinho estiver vazio ou detalhes de entrega ausentes
  useEffect(() => {
    // Verifica se estamos na página de checkout e se os dados essenciais estão faltando
    if (location.pathname === '/checkout' && (currentOrderDetails.items.length === 0 || !deliveryDetails || deliveryFee === null)) {
      // Se o status for 'approved' ou 'pending', não redireciona imediatamente, pois pode estar processando
      const query = new URLSearchParams(location.search);
      const status = query.get('status');
      if (status !== 'approved' && status !== 'pending') {
        toast.info('Por favor, revise seu carrinho e endereço de entrega.');
        navigate('/carrinho');
      }
    }
  }, [currentOrderDetails.items.length, navigate, deliveryDetails, deliveryFee, location.pathname]);

  const constructFullAddress = (details?: SavedOrderDetails['deliveryDetails']) => {
    if (!details) return '';
    const { address, number, neighborhood, city, zipCode } = details;
    return `${address}, ${number}, ${neighborhood}, ${city} - ${zipCode}`;
  };

  // Função para enviar os detalhes do pedido para o backend
  const sendOrderToBackend = useCallback(async (paymentId: string, paymentMethodUsed: string, orderDetails: SavedOrderDetails) => {
    if (!orderDetails.deliveryDetails || orderDetails.deliveryFee === null) {
        toast.error('Detalhes de entrega ou taxa de frete ausentes. Por favor, retorne ao carrinho.');
        return;
    }

    const finalOrderDetails = {
        ...orderDetails,
        paymentMethod: paymentMethodUsed,
        paymentId: paymentId,
        orderDate: new Date().toISOString(),
    };

    console.log('[Checkout] Enviando pedido detalhado para o backend:', finalOrderDetails);

    try {
        await axios.post(`${BACKEND_URL}/api/confirm-order`, finalOrderDetails);
        toast.success('Pedido confirmado e notificação enviada!');
        setPaymentStatus('success');
        clearCart();
    } catch (error) {
        console.error('Erro ao confirmar pedido no backend:', error);
        toast.error('Ocorreu um erro ao finalizar seu pedido. Por favor, entre em contato.');
        setPaymentStatus('failed');
    }
  }, [clearCart]);

  // Efeito para lidar com o retorno do Mercado Pago na página de sucesso
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const status = query.get('status');
    const paymentId = query.get('payment_id');
    const processedKey = `mp_processed_${paymentId}`;

    if (location.pathname === '/checkout' && status && paymentId) {
        const savedDetailsJson = sessionStorage.getItem('checkout_details_temp');
        
        if (status === 'approved' && savedDetailsJson) {
            if (sessionStorage.getItem(processedKey) !== 'true') {
                sessionStorage.setItem(processedKey, 'true');
                setPaymentStatus('processing');
                
                const savedDetails: SavedOrderDetails = JSON.parse(savedDetailsJson);
                sendOrderToBackend(paymentId, 'mercadopago_checkout_pro', savedDetails);
            }
        } else if (status === 'pending') {
            toast.info('Seu pagamento está pendente. Aguardando confirmação.');
            setPaymentStatus('failed'); 
        } else if (status === 'rejected') {
            toast.error('Seu pagamento foi recusado. Por favor, tente novamente.');
            setPaymentStatus('failed');
        }
        
        // Limpa o item temporário após o processamento do status
        sessionStorage.removeItem('checkout_details_temp');
    }
  }, [location.search, location.pathname, sendOrderToBackend]);


  const handleCheckoutProPayment = async () => {
    if (!deliveryDetails || deliveryFee === null || !payerName.trim() || !payerEmail.trim()) {
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
        
        // 1. Salva todos os detalhes do pedido na sessão ANTES de redirecionar
        const detailsToSave: SavedOrderDetails = {
            deliveryDetails,
            deliveryFee,
            payerName,
            payerEmail,
            items: items,
            totalPrice: totalPrice,
            totalWithDelivery: totalWithDelivery,
        };
        sessionStorage.setItem('checkout_details_temp', JSON.stringify(detailsToSave));


        const response = await axios.post(`${BACKEND_URL}/api/create-payment`, {
            items: orderItemsForMP,
            payer: {
                name: payerName,
                email: payerEmail,
            },
        });

        if (response.data && response.data.init_point) {
            window.location.href = response.data.init_point; // Redireciona para o Mercado Pago
        } else {
            throw new Error('URL de pagamento do Mercado Pago não recebida.');
        }
    } catch (error) {
        console.error('Erro ao iniciar pagamento com Mercado Pago Checkout Pro:', error);
        toast.error('Ocorreu um erro ao iniciar o pagamento. Tente novamente.');
        setPaymentStatus('failed');
        setIsLoading(false);
        sessionStorage.removeItem('checkout_details_temp'); // Limpa se falhar antes do redirecionamento
    }
  };

  const isPayerDetailsMissing = !payerName.trim() || !payerEmail.trim();
  const isCheckoutButtonDisabled = items.length === 0 || isPayerDetailsMissing || isLoading || !deliveryDetails || deliveryFee === null;

  // Renderização de sucesso
  if (paymentStatus === 'success') {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center py-20">
            <CheckCircle2 className="w-24 h-24 mx-auto text-accent mb-6" />
            <h2 className="text-3xl font-bold mb-4">Pedido Realizado com Sucesso!</h2>
            <p className="text-muted-foreground mb-8">
              Agradecemos a sua compra. Seu pedido está sendo preparado!
            </p>
            <Link to="/">
              <Button variant="hero" size="lg">
                Voltar para o Início
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Renderização de carregamento/erro de dados
  if (!deliveryDetails || deliveryFee === undefined || deliveryFee === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center py-20">
            <Loader2 className="w-24 h-24 mx-auto text-primary animate-spin mb-6" />
            <h2 className="text-3xl font-bold mb-4">Carregando detalhes do pedido...</h2>
            <p className="text-muted-foreground mb-8">
              Se o carregamento demorar, por favor, retorne ao carrinho.
            </p>
            <Button onClick={() => navigate('/carrinho')} variant="hero" size="lg">
              Voltar para o Carrinho
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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
                {deliveryFee !== null && (
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
                    (Cartão de Crédito/Débito e PIX)
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
                {deliveryFee !== null && (
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

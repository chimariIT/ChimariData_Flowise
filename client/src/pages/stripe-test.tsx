import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  DollarSign,
  TestTube,
  AlertTriangle,
  Shield
} from "lucide-react";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

// Test card data for MCP testing
const TEST_CARDS = [
  {
    number: "4242424242424242",
    type: "Visa",
    scenario: "Successful Payment",
    description: "Standard test card for successful payments",
    cvc: "123",
    expiry: "12/34",
    color: "bg-green-500"
  },
  {
    number: "4000000000000002",
    type: "Visa",
    scenario: "Generic Decline",
    description: "Card will be declined with generic failure",
    cvc: "123", 
    expiry: "12/34",
    color: "bg-red-500"
  },
  {
    number: "4000000000009995",
    type: "Visa",
    scenario: "Insufficient Funds",
    description: "Card declined due to insufficient funds",
    cvc: "123",
    expiry: "12/34", 
    color: "bg-orange-500"
  },
  {
    number: "4000002500003155",
    type: "Visa",
    scenario: "3D Secure Required",
    description: "Requires 3D Secure authentication",
    cvc: "123",
    expiry: "12/34",
    color: "bg-blue-500"
  },
  {
    number: "5555555555554444",
    type: "Mastercard",
    scenario: "Successful Payment",
    description: "Mastercard test for successful payments",
    cvc: "123",
    expiry: "12/34",
    color: "bg-green-500"
  }
];

const MCPCheckoutForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  
  const [processing, setProcessing] = useState(false);
  const [amount, setAmount] = useState(29.99);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [selectedCard, setSelectedCard] = useState<typeof TEST_CARDS[0] | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [webhookTesting, setWebhookTesting] = useState(false);

  // Create payment intent when amount changes
  useEffect(() => {
    if (amount > 0) {
      createPaymentIntent();
    }
  }, [amount]);

  const createPaymentIntent = async () => {
    try {
      const response = await apiRequest("POST", "/api/create-payment-intent", {
        amount: amount,
        description: "Stripe MCP Test Payment",
        metadata: {
          test_mode: "mcp_testing",
          test_scenario: selectedCard?.scenario || "manual_entry"
        }
      });
      
      const data = await response.json();
      setClientSecret(data.clientSecret);
      
      toast({
        title: "Payment Intent Created",
        description: `Ready to process $${amount} payment`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create payment intent",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);
    setPaymentResult(null);

    const card = elements.getElement(CardElement);
    if (!card) return;

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: card,
          billing_details: {
            name: "MCP Test User",
          },
        }
      });

      if (error) {
        setPaymentResult({
          status: "failed",
          error: error.message,
          code: error.code,
          type: error.type,
          decline_code: error.decline_code
        });
        
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setPaymentResult({
          status: "succeeded",
          paymentIntent: paymentIntent,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          id: paymentIntent.id
        });
        
        toast({
          title: "Payment Successful!",
          description: `Processed $${(paymentIntent.amount / 100).toFixed(2)}`,
        });
      }
    } catch (error: any) {
      setPaymentResult({
        status: "error",
        error: error.message
      });
      
      toast({
        title: "Processing Error", 
        description: error.message,
        variant: "destructive",
      });
    }

    setProcessing(false);
  };

  const loadTestCard = (testCard: typeof TEST_CARDS[0]) => {
    setSelectedCard(testCard);
    
    // Clear the card element first
    const card = elements?.getElement(CardElement);
    if (card) {
      card.clear();
    }
    
    toast({
      title: "Test Card Loaded",
      description: `${testCard.type} - ${testCard.scenario}`,
    });
  };

  const testWebhook = async (eventType: string, paymentIntentId?: string) => {
    setWebhookTesting(true);
    try {
      const response = await apiRequest("POST", "/api/stripe/test-webhook", {
        eventType,
        paymentIntentId: paymentIntentId || paymentResult?.id
      });
      
      const data = await response.json();
      
      setWebhookEvents(prev => [{
        ...data.event,
        processed_at: new Date().toISOString(),
        test_mode: true
      }, ...prev]);
      
      toast({
        title: "Webhook Test Successful",
        description: `${eventType} event processed`,
      });
    } catch (error: any) {
      toast({
        title: "Webhook Test Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setWebhookTesting(false);
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: "16px",
        color: "#424770",
        "::placeholder": {
          color: "#aab7c4",
        },
      },
    },
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <TestTube className="h-8 w-8" />
          Stripe MCP Payment Testing
        </h1>
        <p className="text-muted-foreground">
          Test Stripe payment processing with various test cards and scenarios
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Test Cards Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Test Cards Library
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TEST_CARDS.map((testCard, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={`${testCard.color} text-white`}>
                      {testCard.type}
                    </Badge>
                    <span className="font-mono text-sm">{testCard.number}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadTestCard(testCard)}
                    data-testid={`load-test-card-${index}`}
                  >
                    Load Card
                  </Button>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{testCard.scenario}</div>
                  <div className="text-muted-foreground">{testCard.description}</div>
                  <div className="text-xs font-mono mt-1">
                    Exp: {testCard.expiry} | CVC: {testCard.cvc}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Payment Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Processing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.50"
                max="999999"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                data-testid="input-amount"
              />
            </div>

            <div>
              <Label>Card Details</Label>
              <div className="border rounded-md p-3 mt-1">
                <CardElement options={cardElementOptions} />
              </div>
              {selectedCard && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                  <strong>Loaded:</strong> {selectedCard.type} - {selectedCard.scenario}
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!stripe || processing || !clientSecret}
              className="w-full"
              data-testid="button-process-payment"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Process ${amount.toFixed(2)} Payment
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payment Result */}
      {paymentResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {paymentResult.status === "succeeded" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Payment Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge 
                  variant={paymentResult.status === "succeeded" ? "default" : "destructive"}
                >
                  {paymentResult.status.toUpperCase()}
                </Badge>
                {paymentResult.status === "succeeded" && (
                  <span className="text-sm text-muted-foreground">
                    ID: {paymentResult.id}
                  </span>
                )}
              </div>

              {paymentResult.status === "succeeded" ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Amount:</strong> ${(paymentResult.amount / 100).toFixed(2)}
                  </div>
                  <div>
                    <strong>Currency:</strong> {paymentResult.currency.toUpperCase()}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div><strong>Error:</strong> {paymentResult.error}</div>
                  {paymentResult.code && (
                    <div><strong>Code:</strong> {paymentResult.code}</div>
                  )}
                  {paymentResult.type && (
                    <div><strong>Type:</strong> {paymentResult.type}</div>
                  )}
                  {paymentResult.decline_code && (
                    <div><strong>Decline Code:</strong> {paymentResult.decline_code}</div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Webhook Testing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => testWebhook("payment_intent.succeeded")}
              disabled={webhookTesting}
              data-testid="test-webhook-success"
            >
              Test Success
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => testWebhook("payment_intent.payment_failed")}
              disabled={webhookTesting}
              data-testid="test-webhook-failed"
            >
              Test Failed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => testWebhook("payment_intent.canceled")}
              disabled={webhookTesting}
              data-testid="test-webhook-canceled"
            >
              Test Canceled
            </Button>
          </div>
          
          {webhookEvents.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Recent Webhook Events:</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {webhookEvents.slice(0, 5).map((event, index) => (
                  <div key={index} className="text-xs p-2 bg-gray-50 rounded">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{event.type}</span>
                      <Badge variant="secondary">Test</Badge>
                    </div>
                    <div className="text-gray-600">
                      {new Date(event.processed_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MCP Testing Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            MCP Testing Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>Test Environment:</strong> All payments use Stripe test mode with test API keys
          </div>
          <div>
            <strong>Test Cards:</strong> Use the provided test cards to simulate different payment scenarios
          </div>
          <div>
            <strong>Success Cards:</strong> 4242424242424242 (Visa), 5555555555554444 (Mastercard)
          </div>
          <div>
            <strong>Decline Cards:</strong> 4000000000000002 (Generic decline), 4000000000009995 (Insufficient funds)
          </div>
          <div>
            <strong>3D Secure:</strong> 4000002500003155 requires authentication flow
          </div>
          <div>
            <strong>Expiry & CVC:</strong> Use any future date (e.g., 12/34) and any 3-digit CVC
          </div>
          <div>
            <strong>Webhooks:</strong> Test webhook events using the buttons above to simulate real Stripe events
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const StripeTest = () => {
  return (
    <Elements stripe={stripePromise}>
      <MCPCheckoutForm />
    </Elements>
  );
};

export default StripeTest;
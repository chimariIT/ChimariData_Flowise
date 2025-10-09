import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  DollarSign, 
  Clock, 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  Loader2,
  CreditCard,
  Calculator
} from 'lucide-react';

interface CostItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface CostConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  operation: string;
  estimatedCost: number;
  costBreakdown?: CostItem[];
  estimatedDuration?: string;
  features: string[];
  journeyType: 'guided' | 'business' | 'technical';
  requiresPayment?: boolean;
  currentTier?: string;
  upgradeRequired?: boolean;
  className?: string;
}

export function CostConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  operation,
  estimatedCost,
  costBreakdown = [],
  estimatedDuration,
  features,
  journeyType,
  requiresPayment = true,
  currentTier = "Free",
  upgradeRequired = false,
  className = ''
}: CostConfirmationModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getJourneyTypeColor = (type: string) => {
    switch (type) {
      case 'guided': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'business': return 'bg-green-100 text-green-800 border-green-200';
      case 'technical': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleConfirm = async () => {
    if (!confirmed) return;
    
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setConfirmed(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl ${className}`} data-testid="cost-confirmation-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="modal-title">
            <Calculator className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription data-testid="modal-description">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Journey and Operation Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className={getJourneyTypeColor(journeyType)} data-testid="badge-journey-type">
                {journeyType.charAt(0).toUpperCase() + journeyType.slice(1)} Journey
              </Badge>
              <Badge variant="outline" data-testid="badge-current-tier">
                Current: {currentTier}
              </Badge>
            </div>
            {estimatedDuration && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                ~{estimatedDuration}
              </div>
            )}
          </div>

          {/* Upgrade Required Warning */}
          {upgradeRequired && (
            <Alert className="border-orange-200 bg-orange-50" data-testid="alert-upgrade-required">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-700">
                <strong>Upgrade Required:</strong> This operation requires a higher tier subscription. 
                You'll be prompted to upgrade after confirmation.
              </AlertDescription>
            </Alert>
          )}

          {/* Cost Breakdown */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="font-medium">Cost Breakdown</span>
            </div>
            
            {costBreakdown.length > 0 ? (
              <div className="space-y-2">
                {costBreakdown.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span>{item.description} (×{item.quantity})</span>
                    <span>{formatCurrency(item.total)}</span>
                  </div>
                ))}
                <Separator className="my-2" />
              </div>
            ) : (
              <div className="text-sm text-gray-600 mb-2">
                Base cost for {operation.toLowerCase()}
              </div>
            )}
            
            <div className="flex justify-between font-bold text-lg">
              <span>Total Estimated Cost</span>
              <span className="text-green-600" data-testid="text-total-cost">
                {formatCurrency(estimatedCost)}
              </span>
            </div>
          </div>

          {/* Features Included */}
          {features.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="font-medium">Included Features</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="capitalize">{feature.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Information */}
          {requiresPayment && (
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">Payment Information</span>
              </div>
              <div className="text-sm text-blue-700">
                {estimatedCost > 0 ? (
                  <>Payment will be processed securely. You'll receive a receipt after completion.</>
                ) : (
                  <>This operation is included in your current plan at no additional cost.</>
                )}
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Shield className="w-4 h-4" />
            <span>Secure transaction with 256-bit SSL encryption</span>
          </div>

          {/* Confirmation Checkbox */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="cost-confirmation"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              disabled={isProcessing}
              data-testid="checkbox-confirmation"
            />
            <Label htmlFor="cost-confirmation" className="text-sm leading-5">
              I understand the cost breakdown and authorize this {operation.toLowerCase()} 
              {estimatedCost > 0 && ` for ${formatCurrency(estimatedCost)}`}.
              {upgradeRequired && " I agree to upgrade my subscription if required."}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmed || isProcessing}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-confirm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm & {estimatedCost > 0 ? 'Pay' : 'Proceed'} {formatCurrency(estimatedCost)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
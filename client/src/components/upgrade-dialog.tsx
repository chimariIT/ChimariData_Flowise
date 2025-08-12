import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Upload, FileText, BarChart3, Brain } from "lucide-react";

interface UpgradeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  details?: {
    currentSize?: number;
    maxSize?: number;
  };
}

export default function UpgradeDialog({ isOpen, onClose, reason = 'general', details }: UpgradeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const getReasonContent = () => {
    switch (reason) {
      case 'file_size_limit':
        return {
          title: "File Size Limit Exceeded",
          description: `Your file (${details?.currentSize}MB) exceeds the free account limit of ${details?.maxSize}MB.`,
          icon: Upload,
          benefit: "Upload files up to 500MB"
        };
      case 'advanced_analysis':
        return {
          title: "Advanced Analysis Required",
          description: "Advanced statistical and machine learning analysis requires a paid subscription.",
          icon: Brain,
          benefit: "Unlock advanced ML algorithms"
        };
      case 'premium_visualizations':
        return {
          title: "Premium Visualizations",
          description: "Interactive and advanced chart types are available with a paid subscription.",
          icon: BarChart3,
          benefit: "Access all chart types"
        };
      default:
        return {
          title: "Upgrade Your Account",
          description: "Get access to all premium features with a paid subscription.",
          icon: Zap,
          benefit: "Unlock all features"
        };
    }
  };

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      // Navigate to pricing page
      window.location.href = '/#pricing';
      onClose();
    } catch (error) {
      console.error('Upgrade navigation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const content = getReasonContent();
  const Icon = content.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <DialogTitle className="text-lg">{content.title}</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Features */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Premium Features Include:
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span>{content.benefit}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span>Advanced AI insights and analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span>Priority customer support</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span>Unlimited project storage</span>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">ChimariData Pro</span>
              <Badge variant="secondary">Most Popular</Badge>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold">$29</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="text-sm text-gray-600">
              Everything you need for professional data analysis
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="flex-1"
              disabled={isLoading}
            >
              Continue Free
            </Button>
            <Button 
              onClick={handleUpgrade} 
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? "Redirecting..." : "Upgrade Now"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
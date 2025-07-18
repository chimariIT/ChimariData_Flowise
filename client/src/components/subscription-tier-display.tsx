import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, X, Upload, Database, Brain, Zap } from "lucide-react";

interface SubscriptionTierDisplayProps {
  currentTier: string;
  usage?: {
    uploads: number;
    dataVolumeMB: number;
    aiInsights: number;
  };
  onUpgrade?: () => void;
}

const TIER_INFO = {
  none: {
    name: 'No Subscription',
    price: 0,
    color: 'gray',
    features: { maxFiles: 0, maxFileSizeMB: 0, totalDataVolumeMB: 0, aiInsights: 0 }
  },
  trial: {
    name: 'Trial',
    price: 5,
    color: 'blue',
    features: { maxFiles: 1, maxFileSizeMB: 10, totalDataVolumeMB: 10, aiInsights: 1 }
  },
  starter: {
    name: 'Starter',
    price: 10,
    color: 'green',
    features: { maxFiles: 2, maxFileSizeMB: 50, totalDataVolumeMB: 100, aiInsights: 3 }
  },
  professional: {
    name: 'Professional',
    price: 20,
    color: 'purple',
    features: { maxFiles: 5, maxFileSizeMB: 100, totalDataVolumeMB: 500, aiInsights: 5 }
  },
  enterprise: {
    name: 'Enterprise',
    price: 50,
    color: 'gold',
    features: { maxFiles: -1, maxFileSizeMB: -1, totalDataVolumeMB: -1, aiInsights: -1 }
  }
};

export default function SubscriptionTierDisplay({ 
  currentTier, 
  usage = { uploads: 0, dataVolumeMB: 0, aiInsights: 0 },
  onUpgrade 
}: SubscriptionTierDisplayProps) {
  const tierInfo = TIER_INFO[currentTier as keyof typeof TIER_INFO] || TIER_INFO.none;
  const { features } = tierInfo;

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const isUnlimited = (value: number) => value === -1;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Badge variant={tierInfo.color === 'gray' ? 'secondary' : 'default'}>
                {tierInfo.name}
              </Badge>
              {tierInfo.price > 0 && (
                <span className="text-lg font-bold">${tierInfo.price}/month</span>
              )}
            </CardTitle>
            <CardDescription>
              {currentTier === 'none' ? 'Choose a plan to get started' : 'Your current subscription'}
            </CardDescription>
          </div>
          {onUpgrade && currentTier !== 'enterprise' && (
            <Button onClick={onUpgrade} size="sm">
              {currentTier === 'none' ? 'Choose Plan' : 'Upgrade'}
            </Button>
          )}
        </div>
      </CardHeader>
      
      {currentTier !== 'none' && (
        <CardContent className="space-y-6">
          {/* File Uploads */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>File Uploads</span>
              </div>
              <span>
                {usage.uploads} / {isUnlimited(features.maxFiles) ? '∞' : features.maxFiles}
              </span>
            </div>
            {!isUnlimited(features.maxFiles) && (
              <Progress value={getUsagePercentage(usage.uploads, features.maxFiles)} />
            )}
          </div>

          {/* Data Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Data Volume</span>
              </div>
              <span>
                {usage.dataVolumeMB}MB / {isUnlimited(features.totalDataVolumeMB) ? '∞' : `${features.totalDataVolumeMB}MB`}
              </span>
            </div>
            {!isUnlimited(features.totalDataVolumeMB) && (
              <Progress value={getUsagePercentage(usage.dataVolumeMB, features.totalDataVolumeMB)} />
            )}
          </div>

          {/* AI Insights */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <span>AI Insights</span>
              </div>
              <span>
                {usage.aiInsights} / {isUnlimited(features.aiInsights) ? '∞' : features.aiInsights}
              </span>
            </div>
            {!isUnlimited(features.aiInsights) && (
              <Progress value={getUsagePercentage(usage.aiInsights, features.aiInsights)} />
            )}
          </div>

          {/* Feature Capabilities */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-3">Plan Features</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>PII Detection</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Basic Analytics</span>
              </div>
              
              {currentTier !== 'trial' && (
                <>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Data Transformation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Statistical Analysis</span>
                  </div>
                </>
              )}
              
              {['professional', 'enterprise'].includes(currentTier) && (
                <>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Advanced Insights</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Export Options</span>
                  </div>
                </>
              )}
              
              {currentTier === 'enterprise' && (
                <>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>API Access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Priority Support</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
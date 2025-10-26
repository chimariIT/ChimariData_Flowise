import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, Check, Info, TrendingUp, DollarSign, Clock, FileText } from "lucide-react";

interface AgentRecommendation {
  dataSource: string;
  expectedDataSize: number;
  filesAnalyzed: number;
  dataQuality: number;
  analysisComplexity: 'low' | 'medium' | 'high' | 'very_high';
  recommendedAnalyses: string[];
  costEstimate: string;
  timeEstimate: string;
  rationale: string;
  dataCharacteristics?: {
    hasTimeSeries: boolean;
    hasCategories: boolean;
    hasText: boolean;
    hasNumeric: boolean;
  };
  relationships?: Array<{
    file1: string;
    file2: string;
    joinKey: string;
    confidence: number;
  }>;
}

interface AgentRecommendationDialogProps {
  recommendation: AgentRecommendation | null;
  onAccept: (recommendation: AgentRecommendation) => void;
  onModify: (recommendation: AgentRecommendation) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentRecommendationDialog({
  recommendation,
  onAccept,
  onModify,
  open,
  onOpenChange
}: AgentRecommendationDialogProps) {
  if (!recommendation) return null;

  const complexityColors = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-blue-100 text-blue-800 border-blue-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    very_high: 'bg-red-100 text-red-800 border-red-300'
  };

  const complexityColor = complexityColors[recommendation.analysisComplexity];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-6 w-6 text-primary" />
            Agent Recommendations Based on Your Data
          </DialogTitle>
          <DialogDescription>
            Our AI agents have analyzed your uploaded files and generated intelligent recommendations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Data Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Data Analysis Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Files Analyzed:</span>
                  <span className="font-medium">{recommendation.filesAnalyzed} dataset{recommendation.filesAnalyzed > 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Records:</span>
                  <span className="font-medium">~{recommendation.expectedDataSize.toLocaleString()} rows</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Data Quality:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{recommendation.dataQuality}%</span>
                    <Badge variant={recommendation.dataQuality >= 90 ? "default" : "secondary"}>
                      {recommendation.dataQuality >= 90 ? 'Excellent' : recommendation.dataQuality >= 70 ? 'Good' : 'Fair'}
                    </Badge>
                  </div>
                </div>
                {recommendation.relationships && recommendation.relationships.length > 0 && (
                  <div className="mt-3 p-2 bg-muted rounded-md">
                    <p className="text-xs font-medium mb-1">Detected Relationships:</p>
                    {recommendation.relationships.map((rel, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        • {rel.file1} ↔ {rel.file2} (via {rel.joinKey})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recommended Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Recommended Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Data Source:</span>
                <Badge variant="outline">{recommendation.dataSource.replace('_', ' ')}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Expected Size:</span>
                <span className="text-sm font-medium">{recommendation.expectedDataSize.toLocaleString()} rows</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Analysis Complexity:</span>
                <Badge className={complexityColor}>
                  {recommendation.analysisComplexity.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Proposed Analyses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Check className="h-4 w-4" />
                Proposed Analyses ({recommendation.recommendedAnalyses.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendation.recommendedAnalyses.map((analysis, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{analysis}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Cost & Time Estimates */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Cost</p>
                    <p className="text-lg font-semibold">{recommendation.costEstimate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Time</p>
                    <p className="text-lg font-semibold">{recommendation.timeEstimate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rationale */}
          {recommendation.rationale && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong className="font-medium">Why these recommendations?</strong>
                <p className="mt-1">{recommendation.rationale}</p>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onModify(recommendation)}>
            Modify Configuration
          </Button>
          <Button onClick={() => onAccept(recommendation)} className="gap-2">
            <Check className="h-4 w-4" />
            Accept & Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

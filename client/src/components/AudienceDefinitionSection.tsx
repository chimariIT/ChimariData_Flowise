import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Users, TrendingUp } from "lucide-react";

interface AudienceDefinitionSectionProps {
  primaryAudience: string;
  setPrimaryAudience: (value: string) => void;
  decisionContext: string;
  setDecisionContext: (value: string) => void;
}

export function AudienceDefinitionSection({
  primaryAudience,
  setPrimaryAudience,
  decisionContext,
  setDecisionContext
}: AudienceDefinitionSectionProps) {
  return (
    <div className="space-y-6">
      {/* Primary Audience */}
      <div>
        <Label className="text-base font-semibold mb-3 block">Primary Audience</Label>
        <RadioGroup value={primaryAudience} onValueChange={setPrimaryAudience}>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="executive" id="exec" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="exec" className="font-medium cursor-pointer">
                  Executive Leadership
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  C-suite, VPs - Focus on high-level insights, ROI, and strategic decisions
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="technical" id="tech" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="tech" className="font-medium cursor-pointer">
                  Technical Team
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Data scientists, engineers - Include detailed methodology, code, and statistical tests
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="business_ops" id="ops" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="ops" className="font-medium cursor-pointer">
                  Business Operations
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Managers, analysts - Focus on actionable insights, KPIs, and process improvements
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="marketing" id="marketing" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="marketing" className="font-medium cursor-pointer">
                  Marketing Team
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Marketing managers - Customer insights, campaign performance, segmentation
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="mixed" id="mixed" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mixed" className="font-medium cursor-pointer">
                  Mixed Audience
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Multiple stakeholders - Balanced approach with executive summary + technical details
                </p>
              </div>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* Decision Context */}
      <div>
        <Label htmlFor="decision-context" className="text-base font-semibold">
          What Decision Will This Support? (Optional)
        </Label>
        <p className="text-sm text-gray-600 mb-2">
          Understanding the decision helps us prioritize the most relevant insights
        </p>
        <Textarea
          id="decision-context"
          placeholder="Example: 'Deciding whether to expand to new markets' or 'Evaluating marketing campaign effectiveness' or 'Optimizing pricing strategy'..."
          value={decisionContext}
          onChange={(e) => setDecisionContext(e.target.value)}
          rows={3}
          className="mt-2"
        />
      </div>

      {/* Helpful Tip */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900 mb-1">Why This Matters</p>
            <p className="text-sm text-blue-700">
              Results for executives emphasize ROI and strategic impact.
              Results for technical teams include detailed methodology and code.
              We'll tailor everything to your audience's needs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}




















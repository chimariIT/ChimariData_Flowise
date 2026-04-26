import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Users, TrendingUp, CheckCircle } from "lucide-react";
import { getJourneyDisplayConfig } from "@/utils/journey-display";

interface AudienceDefinitionSectionProps {
  primaryAudience: string;
  setPrimaryAudience: (value: string) => void;
  decisionContext: string;
  setDecisionContext: (value: string) => void;
  journeyType?: string;
}

const ALL_AUDIENCES = [
  {
    value: "executive",
    id: "exec",
    label: "Executive Leadership",
    description: "C-suite, VPs - Focus on high-level insights, ROI, and strategic decisions",
  },
  {
    value: "technical",
    id: "tech",
    label: "Technical Team",
    description: "Data scientists, engineers - Include detailed methodology, code, and statistical tests",
  },
  {
    value: "business_ops",
    id: "ops",
    label: "Business Operations",
    description: "Managers, analysts - Focus on actionable insights, KPIs, and process improvements",
  },
  {
    value: "marketing",
    id: "marketing",
    label: "Marketing Team",
    description: "Marketing managers - Customer insights, campaign performance, segmentation",
  },
  {
    value: "mixed",
    id: "mixed",
    label: "Mixed Audience",
    description: "Multiple stakeholders - Balanced approach with executive summary + technical details",
  },
];

export function AudienceDefinitionSection({
  primaryAudience,
  setPrimaryAudience,
  decisionContext,
  setDecisionContext,
  journeyType = 'non-tech'
}: AudienceDefinitionSectionProps) {
  const displayConfig = getJourneyDisplayConfig(journeyType);
  const allowedAudiences = ALL_AUDIENCES.filter(a => displayConfig.allowedAudiences.includes(a.value));

  useEffect(() => {
    if (journeyType === 'non-tech' && primaryAudience !== 'executive') {
      setPrimaryAudience('executive');
    }
  }, [journeyType, primaryAudience, setPrimaryAudience]);

  // Non-tech: Auto-select executive and show a simple confirmation instead of radio group
  if (journeyType === 'non-tech') {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">Results tailored for executive leadership</p>
              <p className="text-sm text-blue-700 mt-1">
                We'll present insights focused on strategic decisions, ROI, and high-level trends — no technical jargon.
              </p>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="decision-context" className="text-base font-semibold">
            What decision will this support? (Optional)
          </Label>
          <p className="text-sm text-gray-600 mb-2">
            Tell us what you're trying to decide — we'll prioritize the most relevant findings
          </p>
          <Textarea
            id="decision-context"
            placeholder="Example: 'Should we expand to new markets?' or 'Which marketing channel gives us the best return?'"
            value={decisionContext}
            onChange={(e) => setDecisionContext(e.target.value)}
            rows={3}
            className="mt-2"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Audience */}
      <div>
        <Label className="text-base font-semibold mb-3 block">Primary Audience</Label>
        <RadioGroup value={primaryAudience} onValueChange={setPrimaryAudience}>
          <div className="space-y-3">
            {allowedAudiences.map((audience) => (
              <div key={audience.id} className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <RadioGroupItem value={audience.value} id={audience.id} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor={audience.id} className="font-medium cursor-pointer">
                    {audience.label}
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    {audience.description}
                  </p>
                </div>
              </div>
            ))}
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
              {journeyType === 'business'
                ? "We'll tailor KPIs, dashboards, and recommendations to your selected audience's priorities."
                : "Results for executives emphasize ROI and strategic impact. Results for technical teams include detailed methodology and code. We'll tailor everything to your audience's needs."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

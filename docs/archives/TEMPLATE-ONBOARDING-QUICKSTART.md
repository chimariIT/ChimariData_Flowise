# Template Onboarding - Quick Start

## 🚀 3-Minute Template Creation

### Step 1: Describe (30 seconds)
Navigate to `/template-onboarding` and describe your use case:

```
Example: "Predict employee attrition using satisfaction scores,
performance ratings, and tenure"
```

### Step 2: Review (1 minute)
AI generates:
- ✅ Template name and description
- ✅ Complete workflow (3-5 steps)
- ✅ Required data fields
- ✅ Recommended visualizations
- ✅ Business goals mapping
- ✅ Quality metrics (confidence, demand, complexity)

### Step 3: Approve (30 seconds)
1. Click "Validate Template"
2. Review validation results
3. Click "Approve & Register"

**Done!** Template is now live in the library.

---

## 📋 Supported Industries

| Industry | Common Use Cases |
|----------|-----------------|
| **Retail** | Churn prediction, inventory optimization, price analysis |
| **Finance** | Fraud detection, credit scoring, risk analysis |
| **Healthcare** | Readmission prediction, treatment effectiveness |
| **HR** | Attrition prediction, talent acquisition, performance |
| **Manufacturing** | Predictive maintenance, quality control, supply chain |
| **Marketing** | Campaign ROI, lead scoring, sentiment analysis |
| **Technology** | User analytics, security detection, performance |

---

## 💡 Writing Great Descriptions

### ✅ Good Examples

```
"Forecast sales for next quarter using historical data and seasonal trends"
```

```
"Identify high-risk loan applications based on credit history and income"
```

```
"Segment customers by lifetime value using purchase patterns"
```

### ❌ Avoid

```
"Customer analysis" (too vague)
```

```
"Predictions" (no context)
```

```
"Dashboard" (not analysis-focused)
```

---

## 🔧 API Quick Reference

### Generate from Description
```bash
POST /api/template-onboarding/generate-from-description
{
  "description": "Predict customer churn using behavior data",
  "industry": "retail"  # optional
}
```

### Validate Template
```bash
POST /api/template-onboarding/validate
{
  "template": { ... },
  "metadata": { ... }
}
```

### Approve Template
```bash
POST /api/template-onboarding/approve
{
  "template": { ... }
}
```

### Get Suggestions
```bash
GET /api/template-onboarding/suggestions?industry=finance
```

---

## 📊 Validation Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| **✅ approved** | Ready to use | Auto-registered |
| **⚠️ review_needed** | Needs review | Manual approval |
| **📝 draft** | Needs work | Edit and retry |
| **❌ rejected** | Has errors | Fix and resubmit |

---

## 🎯 Quality Thresholds

- **Confidence**: ≥70% for auto-approval
- **Workflow**: ≥3 steps recommended
- **Data Fields**: ≥4 fields for richness
- **Visualizations**: ≥2 for insights

---

## 🛠️ Common Issues

### Low Confidence?
**Fix**: Add more detail to description
- Specify data sources
- Mention business goals
- Include timeframe

### Validation Fails?
**Fix**: Check errors array
- Missing required fields?
- Invalid workflow config?
- Incomplete data definitions?

### Wrong Industry Detected?
**Fix**: Explicitly set industry parameter
```json
{ "industry": "healthcare" }
```

---

## 📚 Full Documentation
See `TEMPLATE-ONBOARDING-GUIDE.md` for complete details.

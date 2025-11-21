# User Journey Test Enhancement Plan

**Date**: October 23, 2025
**Existing Test**: `tests/complete-user-journey-with-tools.spec.ts`
**Purpose**: Add validation for PM coordination, checkpoints, billing transparency, and user-friendly messaging

---

## Current Test Coverage

### ✅ What's Already Tested

1. **User Authentication**
   - Registration
   - Login
   - Dashboard access

2. **Project Creation**
   - Business journey
   - Technical journey
   - Non-tech journey

3. **Data Upload**
   - File upload
   - Schema detection
   - Data preview

4. **Tool Execution**
   - Statistical analysis
   - ML model training
   - Visualization generation

5. **Artifact Generation**
   - Reports
   - Charts
   - Model files

### ⚠️ What's Missing (New Requirements)

1. **PM Coordination**
   - [ ] PM welcoming user with plain language
   - [ ] PM coordinating with specialized agents (DE, DS, Business)
   - [ ] PM delegating tasks based on user goals
   - [ ] PM synthesizing expert opinions

2. **Checkpoint Workflow**
   - [ ] User approval at each stage
   - [ ] Data upload checkpoint
   - [ ] Schema review checkpoint
   - [ ] Quality check checkpoint
   - [ ] Analysis plan approval checkpoint
   - [ ] Execution approval checkpoint
   - [ ] Results review checkpoint

3. **User-Friendly Messaging**
   - [ ] No technical jargon in messages
   - [ ] Plain language explanations
   - [ ] Clear "why" explanations, not just "what"
   - [ ] Help for users who don't know dataset requirements
   - [ ] Help for users who don't know technical analysis names

4. **Billing Transparency**
   - [ ] Cost displayed at every checkpoint
   - [ ] Itemized breakdown shown
   - [ ] Remaining quota displayed
   - [ ] Warnings when quota will be exceeded
   - [ ] Running total cost visible

5. **Artifact Delivery**
   - [ ] PM explains each artifact in plain language
   - [ ] User can review before accepting
   - [ ] Download links clearly visible
   - [ ] Dashboard shows all artifacts
   - [ ] Artifacts organized by stage

6. **Data Discovery**
   - [ ] PM helps users identify data requirements
   - [ ] PM suggests what data is needed based on goals
   - [ ] User doesn't need to know file size limits
   - [ ] User doesn't need to know technical column types

7. **Quality Checks**
   - [ ] Data quality report in plain language
   - [ ] Issues explained without jargon
   - [ ] Recommendations for fixing issues
   - [ ] User approval required before proceeding

8. **Progress Tracking**
   - [ ] Clear progress indicators (e.g., "Step 3 of 7")
   - [ ] Estimated time remaining
   - [ ] What's happening now
   - [ ] What's next

---

## Enhancement Plan

### Phase 1: Add Checkpoint Validation Tests

```typescript
test.describe('🎯 PM Checkpoint Workflow', () => {
  test('PM creates checkpoints with user-friendly messages', async ({ page }) => {
    // ... existing setup ...

    // After data upload, wait for PM checkpoint
    await page.waitForSelector('[data-testid="checkpoint-card"]');

    // Validate checkpoint message
    const checkpointMessage = await page.textContent('[data-testid="checkpoint-message"]');

    // Should NOT contain technical jargon
    expect(checkpointMessage).not.toMatch(/schema|ETL|API|JSON|SQL/i);

    // Should contain plain language
    expect(checkpointMessage).toContain('data');

    // Should show cost
    const costElement = await page.textContent('[data-testid="checkpoint-cost"]');
    expect(costElement).toMatch(/\$\d+\.\d{2}/);

    // Should show "why" explanation
    const explanation = await page.textContent('[data-testid="checkpoint-explanation"]');
    expect(explanation).toBeTruthy();
    expect(explanation.length).toBeGreaterThan(50);
  });
});
```

### Phase 2: Add PM Coordination Tests

```typescript
test.describe('🤝 PM Multi-Agent Coordination', () => {
  test('PM coordinates with specialized agents', async ({ page }) => {
    // ... existing setup ...

    // After user submits goal
    await page.fill('textarea[name="goal"]', 'I want to understand sales trends');
    await page.click('button[type="submit"]');

    // PM should coordinate with agents
    await page.waitForSelector('[data-testid="agent-activity"]');

    // Should show PM is working
    const pmActivity = await page.textContent('[data-testid="pm-status"]');
    expect(pmActivity).toMatch(/analyzing|coordinating|planning/i);

    // Should eventually show agent recommendations
    await page.waitForSelector('[data-testid="agent-recommendation"]');

    const recommendation = await page.textContent('[data-testid="agent-recommendation"]');
    expect(recommendation).toBeTruthy();
  });
});
```

### Phase 3: Add Billing Transparency Tests

```typescript
test.describe('💰 Billing Transparency', () => {
  test('Cost is visible at every checkpoint', async ({ page }) => {
    // ... navigate through journey ...

    const checkpoints = [
      'data-upload',
      'schema-review',
      'quality-check',
      'analysis-planning',
      'execution'
    ];

    for (const checkpoint of checkpoints) {
      await page.waitForSelector(`[data-testid="checkpoint-${checkpoint}"]`);

      // Cost should be visible
      const cost = await page.textContent('[data-testid="checkpoint-cost"]');
      expect(cost).toMatch(/\$\d+\.\d{2}/);

      // Breakdown should be available
      const breakdownBtn = page.locator('[data-testid="cost-breakdown"]');
      if (await breakdownBtn.isVisible()) {
        await breakdownBtn.click();
        const breakdown = await page.textContent('[data-testid="cost-items"]');
        expect(breakdown).toBeTruthy();
      }
    }
  });

  test('Quota warning appears when limit will be exceeded', async ({ page }) => {
    // ... setup user with low quota ...

    // Trigger expensive operation
    await page.click('[data-testid="run-analysis"]');

    // Should show warning
    await page.waitForSelector('[data-testid="quota-warning"]');

    const warning = await page.textContent('[data-testid="quota-warning"]');
    expect(warning).toContain('exceed');
    expect(warning).toContain('quota');
  });
});
```

### Phase 4: Add User-Friendly Messaging Tests

```typescript
test.describe('💬 User-Friendly Messaging', () => {
  test('PM uses plain language, no jargon', async ({ page }) => {
    // ... existing setup ...

    // Collect all messages from PM
    const messages = await page.$$eval('[data-testid^="pm-message"]',
      elements => elements.map(el => el.textContent)
    );

    // Check each message for jargon
    const technicalTerms = [
      'schema', 'ETL', 'API', 'JSON', 'SQL', 'DataFrame',
      'normalization', 'indexing', 'primary key', 'foreign key',
      'serialization', 'deserialization', 'CRUD', 'REST'
    ];

    messages.forEach((message, idx) => {
      technicalTerms.forEach(term => {
        expect(message.toLowerCase()).not.toContain(term.toLowerCase());
      });

      console.log(`✅ Message ${idx + 1} is jargon-free`);
    });
  });

  test('PM explains "why", not just "what"', async ({ page }) => {
    // ... navigate to checkpoint ...

    const explanation = await page.textContent('[data-testid="checkpoint-explanation"]');

    // Should contain "why" words
    const whyWords = ['because', 'so that', 'this helps', 'this ensures', 'to make sure'];
    const hasWhyExplanation = whyWords.some(word =>
      explanation.toLowerCase().includes(word)
    );

    expect(hasWhyExplanation).toBe(true);
  });
});
```

### Phase 5: Add Data Discovery Tests

```typescript
test.describe('🔍 PM Helps with Data Discovery', () => {
  test('User doesn\'t know what data they need', async ({ page }) => {
    // User provides only goal
    await page.fill('textarea[name="goal"]',
      'I want to reduce customer churn but I don\'t know what data I need'
    );
    await page.click('button[type="submit"]');

    // PM should suggest data requirements
    await page.waitForSelector('[data-testid="data-suggestions"]');

    const suggestions = await page.textContent('[data-testid="data-suggestions"]');
    expect(suggestions).toContain('customer');
    expect(suggestions).toMatch(/behavior|activity|purchase|usage/i);

    // PM should explain why this data is needed
    const reasoning = await page.textContent('[data-testid="data-reasoning"]');
    expect(reasoning).toBeTruthy();
    expect(reasoning).toContain('help');
  });

  test('PM doesn\'t ask about file size or technical details', async ({ page }) => {
    // ... navigate to upload ...

    const uploadInstructions = await page.textContent('[data-testid="upload-instructions"]');

    // Should NOT ask for technical details
    expect(uploadInstructions).not.toMatch(/MB|GB|bytes|rows|columns/i);
    expect(uploadInstructions).not.toMatch(/CSV format|data type|schema/i);

    // Should ask in simple terms
    expect(uploadInstructions).toMatch(/upload|choose|select/i);
  });
});
```

### Phase 6: Add Quality Check Tests

```typescript
test.describe('✅ Data Quality in Plain Language', () => {
  test('Quality report explains issues without jargon', async ({ page }) => {
    // ... upload data with quality issues ...

    await page.waitForSelector('[data-testid="quality-report"]');

    const report = await page.textContent('[data-testid="quality-report"]');

    // Should NOT use technical terms
    expect(report).not.toMatch(/null values|NaN|data type mismatch|cardinality/i);

    // Should use plain language
    expect(report).toMatch(/missing|empty|incomplete|unusual/i);

    // Should provide actionable recommendations
    const recommendations = await page.textContent('[data-testid="quality-recommendations"]');
    expect(recommendations).toContain('can');
    expect(recommendations).toMatch(/fix|clean|remove|update/i);
  });
});
```

### Phase 7: Add Progress Tracking Tests

```typescript
test.describe('📊 Progress Tracking', () => {
  test('User sees clear progress indicators', async ({ page }) => {
    // ... navigate through journey ...

    // Progress bar should be visible
    const progressBar = await page.locator('[data-testid="progress-bar"]');
    expect(await progressBar.isVisible()).toBe(true);

    // Progress percentage should be shown
    const progressText = await page.textContent('[data-testid="progress-text"]');
    expect(progressText).toMatch(/\d+%|Step \d+ of \d+/);

    // Current activity should be displayed
    const currentActivity = await page.textContent('[data-testid="current-activity"]');
    expect(currentActivity).toBeTruthy();

    // Time estimate should be shown
    const timeEstimate = await page.textContent('[data-testid="time-estimate"]');
    expect(timeEstimate).toMatch(/\d+.*minutes?|Complete/i);
  });
});
```

---

## Implementation Order

1. **Week 1**: Add checkpoint validation tests (Phase 1)
2. **Week 1**: Add PM coordination tests (Phase 2)
3. **Week 2**: Add billing transparency tests (Phase 3)
4. **Week 2**: Add user-friendly messaging tests (Phase 4)
5. **Week 3**: Add data discovery tests (Phase 5)
6. **Week 3**: Add quality check tests (Phase 6)
7. **Week 4**: Add progress tracking tests (Phase 7)
8. **Week 4**: Integration testing and refinement

---

## Success Criteria

### Test Must Validate:

- ✅ PM uses plain language (0 technical terms in user-facing messages)
- ✅ Cost is visible at every checkpoint
- ✅ User approves before each major step
- ✅ PM coordinates with specialized agents
- ✅ Data quality issues explained clearly
- ✅ Progress is always visible
- ✅ Help provided when user lacks knowledge
- ✅ All artifacts have clear explanations

### Test Must Fail If:

- ❌ Technical jargon appears in any user message
- ❌ Cost is hidden or unclear
- ❌ User is not asked for approval
- ❌ PM skips agent coordination
- ❌ Technical terms used without explanation
- ❌ User expected to know file size limits
- ❌ User expected to know analysis method names

---

## Next Steps

1. Review existing test structure
2. Add new test blocks for missing requirements
3. Update existing tests to validate user-friendliness
4. Add data-testid attributes to UI components
5. Run tests and identify gaps
6. Iterate based on failures
7. Document remaining issues in EXISTING_ARCHITECTURE_ANALYSIS.md

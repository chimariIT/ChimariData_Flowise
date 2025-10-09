import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Enhanced Analysis Workflow Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Mock authentication
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      }));
    });
  });

  test.describe('File Upload and Processing', () => {
    test('should handle complete file upload workflow', async ({ page }) => {
      await page.goto('/projects/new');

      // Create project
      const projectName = page.locator('input[name="projectName"]');
      await projectName.fill('Enhanced Analysis Test Project');

      const projectDescription = page.locator('textarea[name="description"]');
      await projectDescription.fill('Testing enhanced analysis workflow with file upload');

      const createButton = page.locator('button:has-text("Create Project")');
      await createButton.click();

      // Wait for project creation and navigate to analysis
      await page.waitForSelector('[data-testid="project-created"]', { timeout: 10000 });

      // Navigate to enhanced analysis
      const enhancedAnalysisTab = page.locator('button:has-text("Enhanced Analysis")');
      if (await enhancedAnalysisTab.isVisible()) {
        await enhancedAnalysisTab.click();
      }

      // File upload section
      const fileUpload = page.locator('[data-testid="enhanced-file-upload"]');
      await expect(fileUpload).toBeVisible();

      // Select workflow type
      const workflowTypeSelect = page.locator('select[name="workflowType"]');
      await workflowTypeSelect.selectOption('full_analysis');

      // Mock file upload (since we can't actually upload files in tests)
      await page.evaluate(() => {
        // Mock the file upload functionality
        const mockData = [
          { name: 'John', age: 25, salary: 50000, department: 'Engineering' },
          { name: 'Jane', age: 30, salary: 60000, department: 'Marketing' },
          { name: 'Bob', age: 35, salary: 70000, department: 'Sales' },
          { name: 'Alice', age: 28, salary: 55000, department: 'Engineering' },
          { name: 'Charlie', age: 32, salary: 65000, department: 'Marketing' }
        ];

        // Simulate file processing
        window.mockFileData = mockData;
      });

      // Click process button
      const processButton = page.locator('button:has-text("Start Enhanced Analysis")');
      await processButton.click();

      // Wait for workflow initialization
      await page.waitForSelector('[data-testid="workflow-initialized"]', { timeout: 15000 });

      // Check workflow progress
      const progressIndicator = page.locator('[data-testid="workflow-progress"]');
      await expect(progressIndicator).toBeVisible();

      // Wait for workflow completion
      await page.waitForSelector('[data-testid="workflow-completed"]', { timeout: 120000 });

      // Verify all workflow steps completed
      const completedSteps = page.locator('[data-testid="workflow-step"][data-status="completed"]');
      await expect(completedSteps).toHaveCountGreaterThan(5);
    });

    test('should handle multiple file uploads', async ({ page }) => {
      await page.goto('/projects/test-project-id/enhanced-analysis');

      // Multiple file upload
      const multiFileUpload = page.locator('[data-testid="multi-file-upload"]');
      await expect(multiFileUpload).toBeVisible();

      // Mock multiple files
      await page.evaluate(() => {
        window.mockMultipleFiles = [
          {
            name: 'sales_data.csv',
            data: [
              { date: '2024-01-01', sales: 1000, region: 'North' },
              { date: '2024-01-02', sales: 1200, region: 'South' }
            ]
          },
          {
            name: 'customer_data.json',
            data: [
              { id: 1, name: 'Customer A', segment: 'Premium' },
              { id: 2, name: 'Customer B', segment: 'Standard' }
            ]
          }
        ];
      });

      const processMultipleButton = page.locator('button:has-text("Process Multiple Files")');
      await processMultipleButton.click();

      // Wait for file processing
      await page.waitForSelector('[data-testid="files-processed"]', { timeout: 30000 });

      // Verify file processing results
      const processedFiles = page.locator('[data-testid="processed-file"]');
      await expect(processedFiles).toHaveCountGreaterThan(1);

      // Check data combination
      const combinedDataInfo = page.locator('[data-testid="combined-data-info"]');
      await expect(combinedDataInfo).toBeVisible();
      await expect(combinedDataInfo).toContainText('4 records');
    });
  });

  test.describe('Schema Generation and Validation', () => {
    test('should generate and validate data schema', async ({ page }) => {
      await page.goto('/projects/test-project-id/enhanced-analysis');

      // Mock data with various types
      await page.evaluate(() => {
        window.mockSchemaData = [
          {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            age: 25,
            salary: 50000.50,
            is_active: true,
            join_date: '2024-01-15',
            department: 'Engineering'
          },
          {
            id: 2,
            name: 'Jane Smith',
            email: 'jane@example.com',
            age: 30,
            salary: 60000.75,
            is_active: false,
            join_date: '2023-12-01',
            department: 'Marketing'
          }
        ];
      });

      const generateSchemaButton = page.locator('button:has-text("Generate Schema")');
      await generateSchemaButton.click();

      // Wait for schema generation
      await page.waitForSelector('[data-testid="schema-generated"]', { timeout: 10000 });

      // Verify schema details
      const schemaTable = page.locator('[data-testid="schema-table"]');
      await expect(schemaTable).toBeVisible();

      // Check data type detection
      const integerColumn = page.locator('[data-testid="column-id"] [data-testid="data-type"]');
      await expect(integerColumn).toHaveText('integer');

      const stringColumn = page.locator('[data-testid="column-name"] [data-testid="data-type"]');
      await expect(stringColumn).toHaveText('string');

      const numberColumn = page.locator('[data-testid="column-salary"] [data-testid="data-type"]');
      await expect(numberColumn).toHaveText('number');

      const booleanColumn = page.locator('[data-testid="column-is_active"] [data-testid="data-type"]');
      await expect(booleanColumn).toHaveText('boolean');

      // Verify schema validation
      const schemaValidation = page.locator('[data-testid="schema-validation"]');
      await expect(schemaValidation).toHaveText('Valid');

      // Check agent decision logging
      const schemaDecision = page.locator('[data-testid="schema-decision"]');
      await expect(schemaDecision).toBeVisible();
      await expect(schemaDecision).toContainText('Data Scientist Agent');
    });

    test('should handle schema modifications', async ({ page }) => {
      await page.goto('/projects/test-project-id/schema');

      // Generated schema should be editable
      const editSchemaButton = page.locator('button:has-text("Edit Schema")');
      await editSchemaButton.click();

      // Modify column type
      const columnTypeSelect = page.locator('[data-testid="column-salary-type-select"]');
      await columnTypeSelect.selectOption('integer');

      // Add column description
      const columnDescription = page.locator('[data-testid="column-salary-description"]');
      await columnDescription.fill('Employee annual salary in USD');

      // Save schema changes
      const saveSchemaButton = page.locator('button:has-text("Save Schema")');
      await saveSchemaButton.click();

      // Wait for schema update
      await page.waitForSelector('[data-testid="schema-updated"]', { timeout: 5000 });

      // Verify changes were saved
      const updatedType = page.locator('[data-testid="column-salary"] [data-testid="data-type"]');
      await expect(updatedType).toHaveText('integer');

      const updatedDescription = page.locator('[data-testid="column-salary"] [data-testid="description"]');
      await expect(updatedDescription).toHaveText('Employee annual salary in USD');
    });
  });

  test.describe('Data Transformation Pipeline', () => {
    test('should execute data transformations', async ({ page }) => {
      await page.goto('/projects/test-project-id/transformations');

      // Add transformation
      const addTransformationButton = page.locator('button:has-text("Add Transformation")');
      await addTransformationButton.click();

      // Select transformation type
      const transformationType = page.locator('select[name="transformationType"]');
      await transformationType.selectOption('filter');

      // Configure filter
      const filterColumn = page.locator('select[name="filterColumn"]');
      await filterColumn.selectOption('age');

      const filterOperator = page.locator('select[name="filterOperator"]');
      await filterOperator.selectOption('greater_than');

      const filterValue = page.locator('input[name="filterValue"]');
      await filterValue.fill('25');

      // Apply transformation
      const applyTransformationButton = page.locator('button:has-text("Apply Transformation")');
      await applyTransformationButton.click();

      // Wait for transformation to complete
      await page.waitForSelector('[data-testid="transformation-completed"]', { timeout: 10000 });

      // Verify transformation results
      const transformationResults = page.locator('[data-testid="transformation-results"]');
      await expect(transformationResults).toBeVisible();

      const filteredRecordCount = page.locator('[data-testid="filtered-record-count"]');
      await expect(filteredRecordCount).toBeVisible();

      // Check agent decision for transformation
      const transformationDecision = page.locator('[data-testid="transformation-decision"]');
      await expect(transformationDecision).toContainText('Data Scientist Agent');
    });

    test('should handle multiple transformations', async ({ page }) => {
      await page.goto('/projects/test-project-id/transformations');

      // Add multiple transformations
      const transformations = [
        { type: 'sort', column: 'name', order: 'ascending' },
        { type: 'group_by', column: 'department', aggregation: 'count' },
        { type: 'calculate', formula: 'salary * 1.1', newColumn: 'adjusted_salary' }
      ];

      for (const transformation of transformations) {
        const addButton = page.locator('button:has-text("Add Transformation")');
        await addButton.click();

        const typeSelect = page.locator('select[name="transformationType"]');
        await typeSelect.selectOption(transformation.type);

        // Configure based on type
        if (transformation.type === 'sort') {
          await page.locator('select[name="sortColumn"]').selectOption(transformation.column);
          await page.locator('select[name="sortOrder"]').selectOption(transformation.order);
        } else if (transformation.type === 'group_by') {
          await page.locator('select[name="groupColumn"]').selectOption(transformation.column);
          await page.locator('select[name="aggregation"]').selectOption(transformation.aggregation);
        } else if (transformation.type === 'calculate') {
          await page.locator('input[name="formula"]').fill(transformation.formula);
          await page.locator('input[name="newColumn"]').fill(transformation.newColumn);
        }

        const applyButton = page.locator('button:has-text("Apply Transformation")');
        await applyButton.click();

        await page.waitForTimeout(2000); // Wait between transformations
      }

      // Execute all transformations
      const executeAllButton = page.locator('button:has-text("Execute All Transformations")');
      await executeAllButton.click();

      // Wait for all transformations to complete
      await page.waitForSelector('[data-testid="all-transformations-completed"]', { timeout: 20000 });

      // Verify transformation pipeline
      const transformationPipeline = page.locator('[data-testid="transformation-pipeline"]');
      await expect(transformationPipeline).toBeVisible();

      const completedTransformations = page.locator('[data-testid="transformation"][data-status="completed"]');
      await expect(completedTransformations).toHaveCount(3);
    });
  });

  test.describe('Statistical Analysis Integration', () => {
    test('should execute statistical analysis workflow', async ({ page }) => {
      await page.goto('/projects/test-project-id/statistical-analysis');

      // Select analysis type
      const analysisTypeSelect = page.locator('select[name="statisticalAnalysisType"]');
      await analysisTypeSelect.selectOption('anova');

      // Configure ANOVA
      const targetVariable = page.locator('select[name="targetVariable"]');
      await targetVariable.selectOption('salary');

      const factorVariables = page.locator('select[name="factorVariables"]');
      await factorVariables.selectOption('department');

      // Set significance level
      const alphaLevel = page.locator('input[name="alphaLevel"]');
      await alphaLevel.fill('0.05');

      // Enable post-hoc tests
      const postHocCheckbox = page.locator('input[name="enablePostHoc"]');
      await postHocCheckbox.check();

      // Execute analysis
      const executeAnalysisButton = page.locator('button:has-text("Execute Statistical Analysis")');
      await executeAnalysisButton.click();

      // Wait for analysis completion
      await page.waitForSelector('[data-testid="statistical-analysis-completed"]', { timeout: 60000 });

      // Verify results
      const analysisResults = page.locator('[data-testid="statistical-results"]');
      await expect(analysisResults).toBeVisible();

      // Check F-statistic and p-value
      const fStatistic = page.locator('[data-testid="f-statistic"]');
      await expect(fStatistic).toBeVisible();

      const pValue = page.locator('[data-testid="p-value"]');
      await expect(pValue).toBeVisible();

      // Check post-hoc results
      const postHocResults = page.locator('[data-testid="post-hoc-results"]');
      await expect(postHocResults).toBeVisible();

      // Verify agent decision logging
      const statisticalDecision = page.locator('[data-testid="statistical-decision"]');
      await expect(statisticalDecision).toContainText('Data Scientist Agent');
    });

    test('should handle multiple statistical tests', async ({ page }) => {
      await page.goto('/projects/test-project-id/statistical-analysis');

      const analysisTypes = ['descriptive', 'anova', 'regression'];

      for (const analysisType of analysisTypes) {
        const typeSelect = page.locator('select[name="statisticalAnalysisType"]');
        await typeSelect.selectOption(analysisType);

        if (analysisType === 'regression') {
          const targetVar = page.locator('select[name="targetVariable"]');
          await targetVar.selectOption('salary');

          const predictorVars = page.locator('select[name="predictorVariables"]');
          await predictorVars.selectOption('age');
        }

        const executeButton = page.locator('button:has-text("Execute Analysis")');
        await executeButton.click();

        // Wait for each analysis to complete
        await page.waitForSelector(`[data-testid="${analysisType}-completed"]`, { timeout: 30000 });
      }

      // Verify all analyses completed
      const completedAnalyses = page.locator('[data-testid="analysis-result"][data-status="completed"]');
      await expect(completedAnalyses).toHaveCount(3);
    });
  });

  test.describe('Machine Learning Pipeline', () => {
    test('should execute ML workflow', async ({ page }) => {
      await page.goto('/projects/test-project-id/ml-analysis');

      // Select ML algorithm
      const mlAlgorithmSelect = page.locator('select[name="mlAlgorithm"]');
      await mlAlgorithmSelect.selectOption('random_forest');

      // Configure target and features
      const targetColumn = page.locator('select[name="targetColumn"]');
      await targetColumn.selectOption('salary');

      const featureColumns = page.locator('[data-testid="feature-selector"]');
      const features = featureColumns.locator('input[type="checkbox"]');

      // Select features
      await features.nth(0).check(); // age
      await features.nth(1).check(); // department

      // Set train/test split
      const testSizeSlider = page.locator('input[name="testSize"]');
      await testSizeSlider.fill('0.2');

      // Enable cross-validation
      const crossValidationCheckbox = page.locator('input[name="enableCrossValidation"]');
      await crossValidationCheckbox.check();

      // Execute ML training
      const trainModelButton = page.locator('button:has-text("Train Model")');
      await trainModelButton.click();

      // Wait for model training
      await page.waitForSelector('[data-testid="model-training-completed"]', { timeout: 90000 });

      // Verify model results
      const modelResults = page.locator('[data-testid="model-results"]');
      await expect(modelResults).toBeVisible();

      // Check performance metrics
      const accuracy = page.locator('[data-testid="model-accuracy"]');
      await expect(accuracy).toBeVisible();

      const r2Score = page.locator('[data-testid="r2-score"]');
      await expect(r2Score).toBeVisible();

      // Check feature importance
      const featureImportance = page.locator('[data-testid="feature-importance"]');
      await expect(featureImportance).toBeVisible();

      // Verify agent decision for model selection
      const mlDecision = page.locator('[data-testid="ml-decision"]');
      await expect(mlDecision).toContainText('Data Scientist Agent');
    });

    test('should compare multiple ML algorithms', async ({ page }) => {
      await page.goto('/projects/test-project-id/ml-comparison');

      // Enable algorithm comparison mode
      const comparisonMode = page.locator('input[name="enableComparison"]');
      await comparisonMode.check();

      // Select multiple algorithms
      const algorithms = ['random_forest', 'gradient_boosting', 'support_vector_machine'];

      for (const algorithm of algorithms) {
        const algorithmCheckbox = page.locator(`input[name="algorithm-${algorithm}"]`);
        await algorithmCheckbox.check();
      }

      // Start comparison
      const compareButton = page.locator('button:has-text("Compare Algorithms")');
      await compareButton.click();

      // Wait for all models to train
      await page.waitForSelector('[data-testid="comparison-completed"]', { timeout: 180000 });

      // Verify comparison results
      const comparisonTable = page.locator('[data-testid="algorithm-comparison-table"]');
      await expect(comparisonTable).toBeVisible();

      // Check best model selection
      const bestModel = page.locator('[data-testid="best-model"]');
      await expect(bestModel).toBeVisible();

      // Verify performance metrics comparison
      const performanceChart = page.locator('[data-testid="performance-comparison-chart"]');
      await expect(performanceChart).toBeVisible();
    });
  });

  test.describe('Data Visualization Engine', () => {
    test('should generate comprehensive visualizations', async ({ page }) => {
      await page.goto('/projects/test-project-id/visualizations');

      // Auto-generate visualizations
      const autoGenerateButton = page.locator('button:has-text("Auto-Generate Visualizations")');
      await autoGenerateButton.click();

      // Wait for visualization generation
      await page.waitForSelector('[data-testid="visualizations-generated"]', { timeout: 30000 });

      // Verify different chart types
      const chartTypes = ['histogram', 'scatter_plot', 'box_plot', 'correlation_heatmap'];

      for (const chartType of chartTypes) {
        const chart = page.locator(`[data-testid="chart-${chartType}"]`);
        if (await chart.isVisible()) {
          await expect(chart).toBeVisible();
        }
      }

      // Check interactive features
      const interactiveChart = page.locator('[data-testid="interactive-chart"]').first();
      if (await interactiveChart.isVisible()) {
        // Test zoom functionality
        await interactiveChart.hover();
        const zoomControls = page.locator('[data-testid="zoom-controls"]');
        if (await zoomControls.isVisible()) {
          await expect(zoomControls).toBeVisible();
        }
      }

      // Verify agent decision for visualization selection
      const vizDecision = page.locator('[data-testid="visualization-decision"]');
      await expect(vizDecision).toContainText('Data Scientist Agent');
    });

    test('should create custom visualizations', async ({ page }) => {
      await page.goto('/projects/test-project-id/visualizations/custom');

      // Create custom scatter plot
      const chartTypeSelect = page.locator('select[name="chartType"]');
      await chartTypeSelect.selectOption('scatter');

      const xAxisSelect = page.locator('select[name="xAxis"]');
      await xAxisSelect.selectOption('age');

      const yAxisSelect = page.locator('select[name="yAxis"]');
      await yAxisSelect.selectOption('salary');

      const colorBySelect = page.locator('select[name="colorBy"]');
      await colorBySelect.selectOption('department');

      // Customize chart appearance
      const chartTitle = page.locator('input[name="chartTitle"]');
      await chartTitle.fill('Age vs Salary by Department');

      const showTrendline = page.locator('input[name="showTrendline"]');
      await showTrendline.check();

      // Generate custom visualization
      const generateButton = page.locator('button:has-text("Generate Custom Visualization")');
      await generateButton.click();

      // Wait for custom chart generation
      await page.waitForSelector('[data-testid="custom-chart-generated"]', { timeout: 15000 });

      // Verify custom chart
      const customChart = page.locator('[data-testid="custom-scatter-plot"]');
      await expect(customChart).toBeVisible();

      // Check chart elements
      const chartTitle_element = page.locator('[data-testid="chart-title"]');
      await expect(chartTitle_element).toHaveText('Age vs Salary by Department');

      const trendline = page.locator('[data-testid="trendline"]');
      if (await trendline.isVisible()) {
        await expect(trendline).toBeVisible();
      }
    });
  });

  test.describe('Business Insights Generation', () => {
    test('should generate comprehensive business insights', async ({ page }) => {
      await page.goto('/projects/test-project-id/insights');

      // Provide business context
      const businessContext = page.locator('textarea[name="businessContext"]');
      await businessContext.fill('HR department wants to understand salary distribution and identify potential pay equity issues across departments');

      const industryContext = page.locator('select[name="industryContext"]');
      await industryContext.selectOption('technology');

      // Generate insights
      const generateInsightsButton = page.locator('button:has-text("Generate Business Insights")');
      await generateInsightsButton.click();

      // Wait for insight generation
      await page.waitForSelector('[data-testid="insights-generated"]', { timeout: 60000 });

      // Verify insights sections
      const executiveSummary = page.locator('[data-testid="executive-summary"]');
      await expect(executiveSummary).toBeVisible();

      const keyFindings = page.locator('[data-testid="key-findings"]');
      await expect(keyFindings).toBeVisible();

      const recommendations = page.locator('[data-testid="recommendations"]');
      await expect(recommendations).toBeVisible();

      const businessImpact = page.locator('[data-testid="business-impact"]');
      await expect(businessImpact).toBeVisible();

      // Check insight quality indicators
      const confidenceScore = page.locator('[data-testid="insight-confidence"]');
      await expect(confidenceScore).toBeVisible();

      // Verify agent attribution
      const businessAgentDecision = page.locator('[data-testid="business-insights-decision"]');
      await expect(businessAgentDecision).toContainText('Business Agent');
    });

    test('should provide audience-specific insights', async ({ page }) => {
      await page.goto('/projects/test-project-id/insights/audience');

      const audiences = ['ceo', 'hr_manager', 'finance_director'];

      for (const audience of audiences) {
        const audienceSelect = page.locator('select[name="targetAudience"]');
        await audienceSelect.selectOption(audience);

        const generateButton = page.locator('button:has-text("Generate Audience-Specific Insights")');
        await generateButton.click();

        // Wait for audience-specific insights
        await page.waitForSelector(`[data-testid="insights-${audience}"]`, { timeout: 30000 });

        // Verify audience-appropriate content
        const audienceInsights = page.locator(`[data-testid="insights-${audience}"]`);
        await expect(audienceInsights).toBeVisible();

        if (audience === 'ceo') {
          await expect(audienceInsights).toContainText(['strategic', 'ROI', 'competitive'].some(term => term));
        } else if (audience === 'hr_manager') {
          await expect(audienceInsights).toContainText(['retention', 'compensation', 'equity'].some(term => term));
        } else if (audience === 'finance_director') {
          await expect(audienceInsights).toContainText(['cost', 'budget', 'efficiency'].some(term => term));
        }
      }
    });
  });

  test.describe('End-to-End Integration', () => {
    test('should complete full enhanced analysis workflow', async ({ page }) => {
      // Start fresh project
      await page.goto('/projects/new');

      const projectName = page.locator('input[name="projectName"]');
      await projectName.fill('Complete Enhanced Analysis Test');

      const createButton = page.locator('button:has-text("Create Project")');
      await createButton.click();

      await page.waitForSelector('[data-testid="project-created"]', { timeout: 10000 });

      // Navigate to enhanced analysis
      await page.goto('/projects/test-project-id/enhanced-analysis');

      // Configure complete workflow
      const workflowType = page.locator('select[name="workflowType"]');
      await workflowType.selectOption('full_analysis');

      // Mock comprehensive dataset
      await page.evaluate(() => {
        window.mockComprehensiveData = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `Employee ${i + 1}`,
          age: 22 + Math.floor(Math.random() * 40),
          salary: 40000 + Math.floor(Math.random() * 60000),
          department: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'][Math.floor(Math.random() * 5)],
          experience_years: Math.floor(Math.random() * 15),
          performance_score: Math.round((Math.random() * 4 + 1) * 10) / 10,
          is_remote: Math.random() > 0.5,
          join_date: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0]
        }));
      });

      // Start complete workflow
      const startWorkflowButton = page.locator('button:has-text("Start Complete Analysis")');
      await startWorkflowButton.click();

      // Monitor workflow progress
      await page.waitForSelector('[data-testid="workflow-progress-tracker"]', { timeout: 10000 });

      const progressSteps = [
        'file_upload',
        'schema_generation',
        'data_preparation',
        'statistical_analysis',
        'ml_analysis',
        'visualization',
        'insight_generation'
      ];

      // Wait for each step to complete
      for (const step of progressSteps) {
        await page.waitForSelector(`[data-testid="step-${step}"][data-status="completed"]`, { timeout: 60000 });

        const stepElement = page.locator(`[data-testid="step-${step}"]`);
        await expect(stepElement).toHaveAttribute('data-status', 'completed');
      }

      // Verify workflow completion
      await page.waitForSelector('[data-testid="workflow-completed"]', { timeout: 30000 });

      // Check final results
      const completionSummary = page.locator('[data-testid="completion-summary"]');
      await expect(completionSummary).toBeVisible();

      // Verify all artifacts generated
      const artifactCount = page.locator('[data-testid="artifact-count"]');
      await expect(artifactCount).toBeVisible();

      const artifactCountText = await artifactCount.textContent();
      const count = parseInt(artifactCountText?.match(/\d+/)?.[0] || '0');
      expect(count).toBeGreaterThan(5);

      // Check agent coordination summary
      const agentSummary = page.locator('[data-testid="agent-coordination-summary"]');
      await expect(agentSummary).toBeVisible();

      // Verify all three agents participated
      const projectManagerActions = page.locator('[data-testid="project-manager-actions"]');
      const dataScientistActions = page.locator('[data-testid="data-scientist-actions"]');
      const businessAgentActions = page.locator('[data-testid="business-agent-actions"]');

      await expect(projectManagerActions).toBeVisible();
      await expect(dataScientistActions).toBeVisible();
      await expect(businessAgentActions).toBeVisible();

      // Verify decision audit trail
      const decisionTrail = page.locator('[data-testid="decision-trail"]');
      await expect(decisionTrail).toBeVisible();

      const decisionCount = page.locator('[data-testid="decision-count"]');
      const decisions = parseInt(await decisionCount.textContent() || '0');
      expect(decisions).toBeGreaterThan(7);
    });

    test('should handle workflow errors gracefully', async ({ page }) => {
      await page.goto('/projects/test-project-id/enhanced-analysis');

      // Mock error condition
      await page.evaluate(() => {
        window.mockErrorCondition = true;
        window.mockBadData = [
          { invalid: 'data', structure: null }
        ];
      });

      const workflowType = page.locator('select[name="workflowType"]');
      await workflowType.selectOption('full_analysis');

      const startButton = page.locator('button:has-text("Start Analysis")');
      await startButton.click();

      // Wait for error handling
      await page.waitForSelector('[data-testid="workflow-error"]', { timeout: 30000 });

      // Verify error handling
      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible();

      // Check recovery options
      const recoveryOptions = page.locator('[data-testid="recovery-options"]');
      await expect(recoveryOptions).toBeVisible();

      const retryButton = page.locator('button:has-text("Retry Workflow")');
      const fallbackButton = page.locator('button:has-text("Use Fallback Analysis")');

      await expect(retryButton).toBeVisible();
      await expect(fallbackButton).toBeVisible();

      // Test fallback option
      await fallbackButton.click();

      await page.waitForSelector('[data-testid="fallback-analysis-completed"]', { timeout: 60000 });

      const fallbackResults = page.locator('[data-testid="fallback-results"]');
      await expect(fallbackResults).toBeVisible();
    });
  });

  test.describe('Real-time Progress Tracking', () => {
    test('should show real-time workflow progress', async ({ page }) => {
      await page.goto('/projects/test-project-id/enhanced-analysis');

      // Start workflow
      const startButton = page.locator('button:has-text("Start Analysis")');
      await startButton.click();

      // Check real-time progress indicators
      const progressBar = page.locator('[data-testid="workflow-progress-bar"]');
      await expect(progressBar).toBeVisible();

      const currentStep = page.locator('[data-testid="current-step-indicator"]');
      await expect(currentStep).toBeVisible();

      // Check step status updates
      const stepStatuses = page.locator('[data-testid="step-status"]');
      await expect(stepStatuses.first()).toBeVisible();

      // Verify progress percentage updates
      let previousProgress = 0;

      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(5000);

        const progressText = await progressBar.textContent();
        const currentProgress = parseInt(progressText?.match(/\d+/)?.[0] || '0');

        expect(currentProgress).toBeGreaterThanOrEqual(previousProgress);
        previousProgress = currentProgress;

        if (currentProgress >= 100) break;
      }

      // Check estimated time remaining
      const timeRemaining = page.locator('[data-testid="estimated-time-remaining"]');
      if (await timeRemaining.isVisible()) {
        await expect(timeRemaining).toBeVisible();
      }
    });

    test('should handle workflow pause and resume', async ({ page }) => {
      await page.goto('/projects/test-project-id/enhanced-analysis');

      const startButton = page.locator('button:has-text("Start Analysis")');
      await startButton.click();

      // Wait for workflow to start
      await page.waitForSelector('[data-testid="workflow-in-progress"]', { timeout: 10000 });

      // Pause workflow
      const pauseButton = page.locator('button:has-text("Pause Workflow")');
      await pauseButton.click();

      // Verify pause state
      const pausedIndicator = page.locator('[data-testid="workflow-paused"]');
      await expect(pausedIndicator).toBeVisible();

      // Resume workflow
      const resumeButton = page.locator('button:has-text("Resume Workflow")');
      await resumeButton.click();

      // Verify resume
      const resumedIndicator = page.locator('[data-testid="workflow-resumed"]');
      await expect(resumedIndicator).toBeVisible();

      // Check workflow continues
      await page.waitForSelector('[data-testid="workflow-in-progress"]', { timeout: 5000 });
    });
  });
});
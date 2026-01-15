import { Router } from 'express';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizeQuestions, normalizeQuestion } from '../utils/question-normalizer';

const router = Router();

/**
 * PM Agent Goal Clarification Endpoint
 * Provides interactive goal clarification with the Project Manager Agent
 * Note: Authentication is handled at router level in index.ts
 */
router.post('/clarify-goal', async (req, res) => {
  try {
    const { goal, analysisGoal, projectId, sessionId, step, userResponse, businessQuestions, journeyType } = req.body;

    // Accept either 'goal' or 'analysisGoal' for backwards compatibility
    const userGoal = goal || analysisGoal;

    if (!userGoal) {
      return res.status(400).json({
        success: false,
        error: 'Goal or analysisGoal is required'
      });
    }

    console.log(`PM Agent clarifying goal for session ${sessionId || 'new'}, journey type: ${journeyType || 'unknown'}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Process clarification based on step
    let result: any;

    if (step === 'initial' || !step) {
      // First step: Summarize the goal and provide initial clarification
      // Ensure businessQuestions is an array
      let questions: string[] = [];
      if (Array.isArray(businessQuestions)) {
        questions = businessQuestions;
      } else if (typeof businessQuestions === 'string') {
        // If it's a string, try to parse it or split it
        try {
          questions = JSON.parse(businessQuestions);
        } catch {
          questions = businessQuestions.split('\n').filter(q => q.trim());
        }
      }

      const questionText = questions.length > 0
        ? `\n\nYour questions: ${questions.join(', ')}`
        : '';

      result = {
        type: 'summary',
        content: `I understand you want to analyze your data with the goal: "${userGoal}".${questionText}\n\nLet me help clarify the specifics for a ${journeyType || 'data analysis'} journey.`,
        originalGoal: userGoal,
        businessQuestions: questions,
        journeyType: journeyType,
        nextStep: 'question',
        clarification: {
          summary: `Your analysis goal is: ${userGoal}`,
          understoodGoals: extractGoals(userGoal, questions),
          clarifyingQuestions: await generateClarifyingQuestions(userGoal, questions),
          suggestedFocus: identifySuggestedFocus(userGoal, questions),
          identifiedGaps: identifyGaps(userGoal, questions),
          dataRequirements: identifyDataRequirements(userGoal, questions),
          estimatedComplexity: estimateComplexity(userGoal, questions)
        }
      };
    } else if (step === 'question') {
      // Generate clarifying question based on user's goal
      const clarifyingQuestion = await generateClarifyingQuestion(userGoal, userResponse);

      result = {
        type: 'question',
        content: clarifyingQuestion,
        nextStep: 'suggestion'
      };
    } else if (step === 'suggestion') {
      // Provide suggestions based on clarified goal
      const suggestions = await generateSuggestions(userGoal, userResponse);

      result = {
        type: 'suggestion',
        content: 'Based on your goal, I suggest focusing on these areas:',
        suggestions: suggestions,
        nextStep: 'complete'
      };
    } else {
      // Final step: Provide summarized clarified goal
      const clarifiedGoal = await summarizeClarifiedGoal(userGoal, userResponse);

      result = {
        type: 'complete',
        clarifiedGoal: clarifiedGoal,
        originalGoal: userGoal,
        changes: identifyChanges(userGoal, clarifiedGoal)
      };
    }

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM Agent clarification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clarify goal'
    });
  }
});

/**
 * Generate a clarifying question based on the goal
 */
async function generateClarifyingQuestion(goal: string, previousResponses?: string): Promise<string> {
  // Use AI to generate contextual questions
  // For now, return common clarifying questions based on goal keywords

  const lowerGoal = goal.toLowerCase();

  if (lowerGoal.includes('customer') || lowerGoal.includes('user')) {
    return 'What specific customer behavior or characteristic are you trying to understand?';
  } else if (lowerGoal.includes('sales') || lowerGoal.includes('revenue')) {
    return 'What are the key factors that drive your sales or revenue?';
  } else if (lowerGoal.includes('churn') || lowerGoal.includes('retention')) {
    return 'What stage of the customer lifecycle are you most concerned about?';
  } else if (lowerGoal.includes('market') || lowerGoal.includes('segment')) {
    return 'What segmentation criteria are most important for your business?';
  } else {
    return 'What specific business outcome are you trying to achieve with this analysis?';
  }
}

/**
 * Generate suggestions based on clarified goal
 */
async function generateSuggestions(goal: string, userResponse: string): Promise<string[]> {
  const lowerGoal = goal.toLowerCase();
  const lowerResponse = userResponse.toLowerCase();

  // Generate contextual suggestions
  const allSuggestions = [
    'Customer segmentation and profiling',
    'Trend analysis over time',
    'Correlation analysis between key metrics',
    'Predictive modeling for future outcomes',
    'Anomaly detection and outlier identification',
    'Comparative analysis across different groups',
    'Root cause analysis for identified issues',
    'Optimization recommendations'
  ];

  // Select relevant suggestions based on goal and response
  const relevantSuggestions: string[] = [];

  if (lowerGoal.includes('customer') || lowerResponse.includes('customer')) {
    relevantSuggestions.push(allSuggestions[0]);
  }
  if (lowerGoal.includes('trend') || lowerGoal.includes('time')) {
    relevantSuggestions.push(allSuggestions[1]);
  }
  if (lowerGoal.includes('correlation') || lowerGoal.includes('relationship')) {
    relevantSuggestions.push(allSuggestions[2]);
  }
  if (lowerGoal.includes('predict') || lowerGoal.includes('forecast')) {
    relevantSuggestions.push(allSuggestions[3]);
  }

  // Always include at least 3 suggestions
  return relevantSuggestions.length >= 3
    ? relevantSuggestions.slice(0, 3)
    : [...relevantSuggestions, ...allSuggestions.slice(0, 3 - relevantSuggestions.length)];
}

/**
 * Summarize the clarified goal based on original goal and user responses
 */
async function summarizeClarifiedGoal(originalGoal: string, userResponse: string): Promise<string> {
  // Combine original goal with clarifications
  if (!userResponse || userResponse.trim() === '') {
    return originalGoal;
  }

  return `${originalGoal}. Specifically focusing on: ${userResponse}`;
}

/**
 * Identify changes between original and clarified goal
 */
function identifyChanges(originalGoal: string, clarifiedGoal: string): string[] {
  const changes: string[] = [];

  if (clarifiedGoal.length > originalGoal.length) {
    changes.push('Added specific focus areas');
  }

  if (clarifiedGoal.toLowerCase() !== originalGoal.toLowerCase()) {
    changes.push('Refined scope based on clarification');
  }

  return changes;
}

/**
 * Identify data requirements based on goal and questions
 */
function identifyDataRequirements(goal: string, questions: string[] | string | undefined): string[] {
  const requirements: string[] = [];
  const lowerGoal = normalizeQuestion(goal).toLowerCase();

  // Ensure questions is an array and normalize them
  const questionArray = normalizeQuestions(questions);
  const allText = [lowerGoal, ...questionArray].join(' ').toLowerCase();

  // Common data requirements based on keywords
  if (allText.includes('customer') || allText.includes('user')) {
    requirements.push('Customer/user demographic data');
    requirements.push('Behavioral data (purchases, interactions, engagement)');
  }

  if (allText.includes('sales') || allText.includes('revenue')) {
    requirements.push('Transaction data with timestamps');
    requirements.push('Product/service information');
  }

  if (allText.includes('time') || allText.includes('trend') || allText.includes('over')) {
    requirements.push('Time-series data with consistent intervals');
  }

  if (allText.includes('segment') || allText.includes('group')) {
    requirements.push('Categorical variables for grouping');
  }

  if (allText.includes('predict') || allText.includes('forecast')) {
    requirements.push('Historical data (minimum 12 months recommended)');
    requirements.push('Relevant predictor variables');
  }

  // Default requirements if none identified
  if (requirements.length === 0) {
    requirements.push('Clean, structured data in CSV or Excel format');
    requirements.push('Column headers with clear names');
    requirements.push('Consistent data types per column');
  }

  return requirements;
}

/**
 * Estimate complexity based on goal and questions
 */
function estimateComplexity(goal: string, questions: string[] | string | undefined): string {
  // Ensure questions is an array and normalize them
  const questionArray = normalizeQuestions(questions);
  const normalizedGoal = normalizeQuestion(goal);
  const allText = [normalizedGoal, ...questionArray].join(' ').toLowerCase();
  let complexityScore = 0;

  // Increase complexity for advanced analysis types
  if (allText.includes('predict') || allText.includes('forecast') || allText.includes('model')) {
    complexityScore += 3;
  }

  if (allText.includes('machine learning') || allText.includes('ml') || allText.includes('ai')) {
    complexityScore += 3;
  }

  if (allText.includes('time series') || allText.includes('temporal') || allText.includes('trend')) {
    complexityScore += 2;
  }

  if (allText.includes('correlation') || allText.includes('relationship') || allText.includes('pattern')) {
    complexityScore += 1;
  }

  if (allText.includes('segment') || allText.includes('cluster') || allText.includes('group')) {
    complexityScore += 2;
  }

  if (questionArray.length > 3) {
    complexityScore += 1;
  }

  // Map score to complexity level
  if (complexityScore >= 5) {
    return 'expert';
  } else if (complexityScore >= 3) {
    return 'complex';
  } else if (complexityScore >= 1) {
    return 'moderate';
  } else {
    return 'simple';
  }
}

/**
 * Extract specific goals from the analysis goal
 */
function extractGoals(goal: string, questions: string[] | string | undefined): string[] {
  const goals: string[] = [];
  const lowerGoal = goal.toLowerCase();
  const questionArray = Array.isArray(questions) ? questions : [];

  // Extract main goal
  goals.push(goal);

  // Extract sub-goals from questions if provided
  if (questionArray.length > 0) {
    questionArray.forEach(q => {
      // Convert questions into goal statements
      const cleanQ = q.replace(/\?$/, '').trim();
      if (cleanQ.length > 10) {
        goals.push(`Understand: ${cleanQ}`);
      }
    });
  }

  // Add implicit goals based on keywords
  if (lowerGoal.includes('predict') || lowerGoal.includes('forecast')) {
    goals.push('Build predictive capability');
  }
  if (lowerGoal.includes('customer') || lowerGoal.includes('user')) {
    goals.push('Gain customer insights');
  }
  if (lowerGoal.includes('optimize') || lowerGoal.includes('improve')) {
    goals.push('Identify optimization opportunities');
  }

  return goals.slice(0, 4); // Limit to 4 goals
}

/**
 * Generate clarifying questions based on goal and context using AI
 */
async function generateClarifyingQuestions(goal: string, questions: string[] | string | undefined): Promise<Array<{ question: string; reason: string }>> {
  const questionArray = Array.isArray(questions) ? questions : [];

  // Get AI API key
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  // Fallback to keyword-based if no AI key
  if (!apiKey) {
    console.warn('⚠️  PM Agent: GOOGLE_AI_API_KEY not set - using contextual fallback questions');
    console.warn('   Set GOOGLE_AI_API_KEY for enhanced AI-powered guidance');
    return generateClarifyingQuestionsFallback(goal, questionArray);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const userQuestionsText = questionArray.length > 0
      ? `\n\nThe user also provided these specific questions:\n${questionArray.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : '';

    const prompt = `You are a Project Manager helping to clarify data analysis goals.

User's Analysis Goal: "${goal}"${userQuestionsText}

Based on this goal and questions, generate exactly 3 clarifying questions that would help you better understand what the user wants to achieve. These questions should:
1. Be directly related to the user's stated goal and questions
2. Help identify specific metrics, timeframes, or success criteria
3. Uncover any missing information needed to plan the analysis

Return ONLY a JSON array with this exact format (no markdown, no code blocks, just the JSON):
[
  {"question": "...", "reason": "..."},
  {"question": "...", "reason": "..."},
  {"question": "...", "reason": "..."}
]

Make the questions specific to this user's goal, not generic.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Remove markdown code blocks if present
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const clarifyingQuestions = JSON.parse(jsonText);

    // Validate structure
    if (Array.isArray(clarifyingQuestions) && clarifyingQuestions.length === 3) {
      console.log('✅ PM Agent: Generated AI-powered clarifying questions');
      return clarifyingQuestions;
    }

    console.warn('⚠️  PM Agent: AI returned invalid structure - using contextual fallback');
    // Fallback if structure is invalid
    return generateClarifyingQuestionsFallback(goal, questionArray);

  } catch (error) {
    console.error('❌ PM Agent: AI API error - using contextual fallback:', error);
    // Fallback to keyword-based
    return generateClarifyingQuestionsFallback(goal, questionArray);
  }
}

/**
 * Fallback keyword-based clarifying questions
 * Makes questions contextual by referencing the user's specific goal
 */
function generateClarifyingQuestionsFallback(goal: string, questionArray: string[]): Array<{ question: string; reason: string }> {
  const clarifyingQuestions: Array<{ question: string; reason: string }> = [];
  const lowerGoal = goal.toLowerCase();

  // Extract key subject from goal for more contextual questions
  // Use a smarter extraction that looks for the main subject
  let subject = 'this analysis';

  // Common patterns for extracting subject
  const patterns = [
    { keywords: ['customer', 'user', 'client'], subject: 'customer behavior analysis' },
    { keywords: ['sales', 'revenue'], subject: 'sales performance analysis' },
    { keywords: ['employee', 'staff', 'workforce', 'team'], subject: 'employee analysis' },
    { keywords: ['product', 'item', 'offering'], subject: 'product analysis' },
    { keywords: ['marketing', 'campaign', 'promotion'], subject: 'marketing analysis' },
    { keywords: ['teacher', 'educator', 'faculty', 'conference'], subject: 'teacher conference analysis' },
    { keywords: ['student', 'learner', 'pupil'], subject: 'student analysis' },
    { keywords: ['satisfaction', 'engagement'], subject: 'satisfaction and engagement analysis' },
    { keywords: ['performance', 'metrics'], subject: 'performance metrics analysis' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => lowerGoal.includes(keyword))) {
      subject = pattern.subject;
      break;
    }
  }

  // If still generic, extract meaningful noun phrases from goal
  if (subject === 'this analysis') {
    // Filter out first-person pronouns and common verbs
    const stopWords = ['i', 'want', 'to', 'need', 'have', 'will', 'should', 'would', 'can', 'could',
      'understand', 'analyze', 'analyze', 'analyze', 'what', 'how', 'why', 'where', 'when',
      'what', 'the', 'this', 'that', 'these', 'those', 'a', 'an', 'is', 'are', 'am'];

    const words = goal.split(/\s+/)
      .filter(word => !stopWords.includes(word.toLowerCase()))
      .filter(word => word.length > 2); // Remove short words

    if (words.length >= 2) {
      // Take first 2-3 meaningful words
      const significantWords = words.slice(0, 3).join(' ');
      subject = `${significantWords} analysis`;
    } else if (words.length === 1) {
      subject = `${words[0]} analysis`;
    } else {
      // Fallback: use key terms from the goal
      const keyTerms = lowerGoal.split(' ').filter(w => w.length > 4 && !stopWords.includes(w));
      if (keyTerms.length > 0) {
        subject = `${keyTerms[0]} analysis`;
      }
    }
  }

  // Add questions based on missing context - make them reference the goal
  if (questionArray.length === 0) {
    clarifyingQuestions.push({
      question: `For your goal of "${goal.substring(0, 50)}${goal.length > 50 ? '...' : ''}", what specific metrics or outcomes would indicate success?`,
      reason: 'Helps define clear, measurable success criteria for your specific analysis'
    });
  }

  if (!lowerGoal.includes('time') && !lowerGoal.includes('period') && !lowerGoal.includes('month') && !lowerGoal.includes('year')) {
    clarifyingQuestions.push({
      question: `What time period should we analyze for "${subject}"?`,
      reason: 'Ensures we focus on the most relevant timeframe for your analysis'
    });
  }

  if (lowerGoal.includes('customer') || lowerGoal.includes('user')) {
    clarifyingQuestions.push({
      question: 'Are you interested in specific customer segments (e.g., by region, product, value) or all customers?',
      reason: 'Helps focus the analysis on the segments most relevant to your goal'
    });
  }

  if (lowerGoal.includes('predict') || lowerGoal.includes('forecast')) {
    clarifyingQuestions.push({
      question: `For your predictive analysis on "${goal.substring(0, 40)}...", how far into the future do you need predictions?`,
      reason: 'Determines the forecasting horizon and appropriate modeling approach'
    });
  }

  if (lowerGoal.includes('compare') || lowerGoal.includes('versus') || lowerGoal.includes('vs')) {
    clarifyingQuestions.push({
      question: 'What specific dimensions or groups do you want to compare?',
      reason: 'Ensures we perform the right comparative analysis for your needs'
    });
  }

  if (lowerGoal.includes('optimize') || lowerGoal.includes('improve')) {
    clarifyingQuestions.push({
      question: `What are the key constraints or trade-offs we should consider when optimizing ${subject}?`,
      reason: 'Ensures recommendations are practical and align with business constraints'
    });
  }

  // Always ask about constraints if we don't have enough questions yet
  if (clarifyingQuestions.length < 3) {
    clarifyingQuestions.push({
      question: `Are there specific business rules, compliance requirements, or constraints for ${subject}?`,
      reason: 'Ensures the analysis and recommendations fit within your operational context'
    });
  }

  // Add a data-related question if still under 3
  if (clarifyingQuestions.length < 3) {
    clarifyingQuestions.push({
      question: 'What data sources or systems will this analysis need to consider?',
      reason: 'Helps plan data collection and integration requirements'
    });
  }

  return clarifyingQuestions.slice(0, 3); // Limit to 3 questions
}

/**
 * Identify suggested focus areas as an array
 */
function identifySuggestedFocus(goal: string, questions: string[] | string | undefined): string[] {
  const focusAreas: string[] = [];
  const normalizedGoal = normalizeQuestion(goal);
  const questionArray = normalizeQuestions(questions);
  const allText = [normalizedGoal, ...questionArray].join(' ').toLowerCase();

  // Identify focus areas based on content
  if (allText.includes('customer') || allText.includes('user')) {
    focusAreas.push('Customer behavior analysis');
    focusAreas.push('Customer segmentation');
  }

  if (allText.includes('sales') || allText.includes('revenue')) {
    focusAreas.push('Revenue trend analysis');
    focusAreas.push('Sales performance metrics');
  }

  if (allText.includes('predict') || allText.includes('forecast')) {
    focusAreas.push('Predictive modeling');
    focusAreas.push('Feature engineering');
  }

  if (allText.includes('time') || allText.includes('trend')) {
    focusAreas.push('Time series analysis');
  }

  if (allText.includes('segment') || allText.includes('group')) {
    focusAreas.push('Segmentation and clustering');
  }

  if (allText.includes('optimize') || allText.includes('improve')) {
    focusAreas.push('Optimization recommendations');
  }

  // Default focus areas
  if (focusAreas.length === 0) {
    focusAreas.push('Exploratory data analysis');
    focusAreas.push('Pattern identification');
    focusAreas.push('Insight generation');
  }

  return focusAreas.slice(0, 4); // Limit to 4 focus areas
}

/**
 * Identify gaps in the provided information
 */
function identifyGaps(goal: string, questions: string[] | string | undefined): string[] {
  const gaps: string[] = [];
  const lowerGoal = goal.toLowerCase();
  const questionArray = Array.isArray(questions) ? questions : [];

  // Check for missing critical information
  if (!lowerGoal.includes('data') && !lowerGoal.includes('dataset')) {
    gaps.push('Data source not specified');
  }

  if (!lowerGoal.includes('time') && !lowerGoal.includes('period') && !lowerGoal.includes('when')) {
    gaps.push('Time period not defined');
  }

  if (questionArray.length === 0) {
    gaps.push('No specific business questions provided');
  }

  if (!lowerGoal.includes('measure') && !lowerGoal.includes('metric') && !lowerGoal.includes('kpi')) {
    gaps.push('Success metrics not clearly defined');
  }

  if (lowerGoal.includes('predict') || lowerGoal.includes('forecast')) {
    if (!lowerGoal.includes('historical')) {
      gaps.push('Historical data requirements unclear');
    }
  }

  // If no gaps found, that's actually good
  if (gaps.length === 0) {
    return [];
  }

  return gaps.slice(0, 3); // Limit to 3 gaps
}

/**
 * Suggest follow-up questions for the user (used in prepare-step)
 * Frontend: POST /api/project-manager/suggest-questions
 */
router.post('/suggest-questions', async (req, res) => {
  try {
    const { goals, questions, journeyType } = req.body;

    // Generate contextual question suggestions
    const suggestions = await generateClarifyingQuestionsFallback(
      goals?.[0] || 'Analyze data',
      questions || []
    );

    res.json({
      success: true,
      suggestions: suggestions.map(s => s.question),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Question suggestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to suggest questions'
    });
  }
});

/**
 * DEPRECATED: This endpoint is superseded by the authenticated version in project-manager.ts
 * The proper endpoint handles sessionId correctly and saves to projectSessions table
 * Keeping this commented out to avoid route conflicts
 */
/*
router.post('/update-goal-after-clarification', async (req, res) => {
  try {
    const { projectId, clarifiedGoal, refinedQuestions, clarification } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId is required'
      });
    }

    // Update project with clarified information
    const { storage } = require('../storage');
    await storage.updateProject(projectId, {
      description: clarifiedGoal || undefined,
      clarification: clarification || undefined
    });

    // Log decision to audit trail
    const { db } = require('../db');
    const { decisionAudits } = require('@shared/schema');
    const { nanoid } = require('nanoid');

    if (db && decisionAudits) {
      try {
        await db.insert(decisionAudits).values({
          id: nanoid(),
          projectId,
          agent: 'project_manager',
          decisionType: 'goal_clarification',
          decision: `Clarified Analysis Goal: ${clarifiedGoal}`,
          reasoning: `User clarified goal through PM agent interaction. Refined questions: ${JSON.stringify(refinedQuestions || [])}`,
          alternatives: JSON.stringify([]),
          confidence: 100,
          context: JSON.stringify({ clarification }),
          userInput: clarifiedGoal,
          impact: 'high',
          reversible: true,
          timestamp: new Date()
        });
        console.log('✅ Logged goal clarification decision');
      } catch (logError) {
        console.error('Failed to log decision:', logError);
        // Continue - do not fail request
      }
    }

    res.json({
      success: true,
      message: 'Goal updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Goal update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update goal'
    });
  }
});
*/

export default router;







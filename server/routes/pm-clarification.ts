import { Router } from 'express';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { authenticateUser } from '../middleware/auth';

const router = Router();

/**
 * PM Agent Goal Clarification Endpoint
 * Provides interactive goal clarification with the Project Manager Agent
 */
router.post('/clarify-goal', authenticateUser, async (req, res) => {
  try {
    const { goal, projectId, step, userResponse } = req.body;

    if (!goal) {
      return res.status(400).json({
        success: false,
        error: 'Goal is required'
      });
    }

    console.log(`PM Agent clarifying goal for project ${projectId || 'new'}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Process clarification based on step
    let result: any;

    if (step === 'initial' || !step) {
      // First step: Summarize the goal
      result = {
        type: 'summary',
        content: `I understand you want to analyze your data with the goal: "${goal}". Let me help clarify the specifics.`,
        originalGoal: goal,
        nextStep: 'question'
      };
    } else if (step === 'question') {
      // Generate clarifying question based on user's goal
      const clarifyingQuestion = await generateClarifyingQuestion(goal, userResponse);
      
      result = {
        type: 'question',
        content: clarifyingQuestion,
        nextStep: 'suggestion'
      };
    } else if (step === 'suggestion') {
      // Provide suggestions based on clarified goal
      const suggestions = await generateSuggestions(goal, userResponse);
      
      result = {
        type: 'suggestion',
        content: 'Based on your goal, I suggest focusing on these areas:',
        suggestions: suggestions,
        nextStep: 'complete'
      };
    } else {
      // Final step: Provide summarized clarified goal
      const clarifiedGoal = await summarizeClarifiedGoal(goal, userResponse);
      
      result = {
        type: 'complete',
        clarifiedGoal: clarifiedGoal,
        originalGoal: goal,
        changes: identifyChanges(goal, clarifiedGoal)
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

export default router;




import express from 'express';
import { conversationalAgent } from '../conversational-agent';
import { adaptiveContentEngine } from '../adaptive-content-engine';
import { db } from '../db';
import { conversationStates, decisionAudits } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * Start a new conversation session
 */
router.post('/start', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { initialDescription, projectId, journeyId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!initialDescription) {
      return res.status(400).json({ error: 'Initial description is required' });
    }

    const conversation = await conversationalAgent.startConversation(
      userId.toString(),
      initialDescription,
      journeyId
    );

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Failed to start conversation:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

/**
 * Continue an existing conversation
 */
router.post('/:conversationId/continue', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { conversationId } = req.params;
    const { message, relatedGoals } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const updatedConversation = await conversationalAgent.continueConversation(
      conversationId,
      message,
      relatedGoals
    );

    res.json({
      success: true,
      conversation: updatedConversation
    });
  } catch (error) {
    console.error('Failed to continue conversation:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

/**
 * Get conversation state
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { conversationId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conversation = await conversationalAgent.getConversationState(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify user owns this conversation
    if (conversation.userId !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Failed to get conversation:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

/**
 * React to a message (helpful, not helpful, etc.)
 */
router.post('/:conversationId/react', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { conversationId } = req.params;
    const { messageId, reaction } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get conversation to verify ownership
    const conversation = await conversationalAgent.getConversationState(conversationId);
    if (!conversation || conversation.userId !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Store reaction in database (would need to extend schema for message reactions)
    // For now, just return success
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to react to message:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

/**
 * Get user's active conversations
 */
router.get('/user/active', async (req, res) => {
  try {
    const { userId } = req.user || {};

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conversations = await conversationalAgent.getUserActiveConversations(userId.toString());

    res.json(conversations);
  } catch (error) {
    console.error('Failed to get user conversations:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

/**
 * Confirm goals and proceed to analysis
 */
router.post('/:conversationId/confirm-goals', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { conversationId } = req.params;
    const { confirmedGoals } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get conversation
    const conversation = await conversationalAgent.getConversationState(conversationId);
    if (!conversation || conversation.userId !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update conversation state with confirmed goals
    const goals = (conversation as any).goalCandidates as Array<{ id: string; status: string }> | undefined;
    const updatedGoals = (goals || []).map((goal) => ({
      ...goal,
      status: confirmedGoals.includes(goal.id) ? 'confirmed' as const : goal.status
    }));

    await db
      .update(conversationStates)
      .set({
        goalCandidates: updatedGoals,
        currentPhase: 'execution_planning',
        updatedAt: new Date()
      })
      .where(eq(conversationStates.id, conversationId));

    res.json({
      success: true,
      confirmedGoals: updatedGoals.filter((g: any) => g.status === 'confirmed')
    });
  } catch (error) {
    console.error('Failed to confirm goals:', error);
      const msg = (error as any)?.message || 'Unknown error';
      res.status(500).json({ error: msg });
  }
});

export default router;
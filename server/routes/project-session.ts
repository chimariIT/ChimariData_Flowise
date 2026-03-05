/**
 * Project Session API Routes
 *
 * Secure server-side state management for multi-step user journeys.
 * Replaces insecure localStorage with tamper-proof server storage.
 *
 * Security Features:
 * - Server-authoritative state
 * - Integrity hashing to detect tampering
 * - IP and user-agent tracking
 * - Session expiry management
 * - Cross-device resume support
 */

import { Router } from 'express';
import { db } from '../db';
import { projectSessions } from '@shared/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import crypto from 'crypto';

type SessionJourneyType = 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';

const JOURNEY_TYPE_NORMALIZATION: Record<string, SessionJourneyType> = {
  'non-tech': 'non-tech',
  'non_tech': 'non-tech',
  'ai_guided': 'non-tech',
  guided: 'non-tech',
  business: 'business',
  'template_based': 'business',
  technical: 'technical',
  'self_service': 'technical',
  consultation: 'consultation',
  custom: 'custom',
};

function normalizeJourneyType(value?: string | string[]): SessionJourneyType | null {
  const input = Array.isArray(value) ? value[0] : value;
  if (!input) return null;
  const key = input.toLowerCase();
  return JOURNEY_TYPE_NORMALIZATION[key] ?? null;
}

const router = Router();

// Session expires after 14 days of inactivity (extended for long-running journeys)
const SESSION_EXPIRY_DAYS = 14;
// Grace period for expired sessions (48 hours to allow recovery)
const GRACE_PERIOD_HOURS = 48;

/**
 * Generate integrity hash for session data
 */
function generateDataHash(data: any): string {
  const dataString = JSON.stringify(data);
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Encrypt sensitive session data to protect from browser log exposure
 * Uses AES-256-GCM for authenticated encryption
 */
function encryptSessionData(data: any): string {
  const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-key-change-in-production';

  // Derive a 32-byte key from the secret
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

  // Generate a random 16-byte IV for each encryption
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Encrypt the data
  const dataString = JSON.stringify(data);
  let encrypted = cipher.update(dataString, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Return IV + Auth Tag + Encrypted Data (all in hex)
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt session data
 */
function decryptSessionData(encryptedData: string): any {
  try {
    const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-key-change-in-production';

    // Derive the same 32-byte key
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    // Split the encrypted string
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('❌ Failed to decrypt session data:', error);
    return null;
  }
}

/**
 * GET /api/project-session/current
 * Get or create current session for user
 */
router.get('/current', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const normalizedJourneyType = normalizeJourneyType(req.query.journeyType as string);
    if (!normalizedJourneyType) {
      return res.status(400).json({ error: 'Valid journeyType required' });
    }

    // Try to find active session
    const [existingSession] = await db
      .select()
      .from(projectSessions)
      .where(
        and(
          eq(projectSessions.userId, userId),
          eq(projectSessions.journeyType, normalizedJourneyType)
        )
      )
      .orderBy(desc(projectSessions.lastActivity))
      .limit(1);

    if (existingSession) {
      // Update last activity
      const [updated] = await db
        .update(projectSessions)
        .set({
          lastActivity: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectSessions.id, existingSession.id))
        .returning();

      return res.json({
        success: true,
        session: updated
      });
    }

    // Create new session
    const sessionId = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    const [newSession] = await db
      .insert(projectSessions)
      .values({
        id: sessionId,
        userId,
        journeyType: normalizedJourneyType,
        currentStep: 'prepare',
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        expiresAt,
        lastActivity: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({
      success: true,
      session: newSession,
      isNew: true
    });

  } catch (error: any) {
    console.error('Error fetching/creating session:', error);
    res.status(500).json({ error: error.message || 'Failed to get session' });
  }
});

/**
 * POST /api/project-session/:sessionId/update-step
 * Update session data for a specific step
 */
router.post('/:sessionId/update-step', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;
    const { step, data } = req.body;

    if (!step || !['prepare', 'data', 'execute', 'pricing', 'results'].includes(step)) {
      return res.status(400).json({ error: 'Valid step required (prepare, data, execute, pricing, results)' });
    }

    // Fetch session and verify ownership
    const [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.id, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this session' });
    }

    // Prepare update object first
    const updateData: any = {
      currentStep: step,
      lastActivity: new Date(),
      updatedAt: new Date(),
    };

    // ✅ Activity-based session management: extend expiry on any user activity
    const now = new Date();
    if (session.expiresAt) {
      const expiresAt = new Date(session.expiresAt);
      const hoursSinceExpiry = (now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60);

      // ✅ Allow grace period for recently expired sessions
      if (hoursSinceExpiry > GRACE_PERIOD_HOURS) {
        console.warn(`⚠️ Session ${sessionId} expired ${hoursSinceExpiry.toFixed(1)} hours ago at ${expiresAt}`);
        return res.status(410).json({
          error: 'Session expired',
          expiredAt: expiresAt,
          hint: 'Please create a new project session to continue'
        });
      }

      // ✅ Auto-renew on ANY activity if expired within grace period
      if (expiresAt < now && hoursSinceExpiry <= GRACE_PERIOD_HOURS) {
        console.log(`🔄 Auto-renewing recently expired session ${sessionId} (expired ${hoursSinceExpiry.toFixed(1)} hours ago) due to user activity`);
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_DAYS);
        updateData.expiresAt = newExpiresAt;
      } else {
        // ✅ Proactive renewal: extend session on any activity if within 2 days of expiring
        const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 2) {
          const newExpiresAt = new Date();
          newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_DAYS);
          console.log(`🔄 Auto-extending session ${sessionId} expiry from ${expiresAt} to ${newExpiresAt} due to user activity`);
          updateData.expiresAt = newExpiresAt;
        }
      }
    } else {
      // If no expiry set, set one now
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_DAYS);
      console.log(`📅 Setting expiry for session ${sessionId}: ${newExpiresAt}`);
      updateData.expiresAt = newExpiresAt;
    }

    // Update step-specific data
    switch (step) {
      case 'prepare':
        updateData.prepareData = data;

        // R4 FIX: Save business questions to project_questions table for pipeline linking
        if (data?.businessQuestions && session.projectId) {
          const projectId = session.projectId;
          const questionsText = typeof data.businessQuestions === 'string'
            ? data.businessQuestions.split('\n').map((q: string) => q.trim()).filter((q: string) => q)
            : Array.isArray(data.businessQuestions) ? data.businessQuestions : [];

          if (questionsText.length > 0) {
            console.log(`📝 [R4 Fix] Saving ${questionsText.length} questions to project_questions for project ${projectId}`);

            for (let idx = 0; idx < questionsText.length; idx++) {
              const questionText = questionsText[idx];
              // Generate stable question ID from project and question text
              const questionId = `q_${projectId.slice(0, 8)}_${idx + 1}`;

              try {
                // Upsert: check if exists first
                const existing = await db
                  .select()
                  .from(projectQuestions)
                  .where(and(
                    eq(projectQuestions.projectId, projectId),
                    eq(projectQuestions.questionText, questionText)
                  ))
                  .limit(1);

                if (existing.length === 0) {
                  await db.insert(projectQuestions).values({
                    id: questionId,
                    projectId: projectId,
                    questionText: questionText,
                    questionOrder: idx,
                    status: 'pending'
                  });
                  console.log(`✅ [R4 Fix] Inserted question ${questionId}: "${questionText.slice(0, 50)}..."`);
                } else {
                  console.log(`⏭️ [R4 Fix] Question already exists: "${questionText.slice(0, 50)}..."`);
                }
              } catch (insertErr: any) {
                // Ignore duplicate key errors (question already exists)
                if (!insertErr.message?.includes('duplicate') && !insertErr.message?.includes('unique')) {
                  console.warn(`⚠️ [R4 Fix] Failed to insert question: ${insertErr.message}`);
                }
              }
            }
          }
        }
        break;
      case 'data':
        updateData.dataUploadData = data;
        break;
      case 'execute':
        updateData.executeData = data;
        // Generate integrity hash for execution results
        if (data?.results) {
          updateData.dataHash = generateDataHash(data.results);
        }
        break;
      case 'pricing':
        updateData.pricingData = data;
        break;
      case 'results':
        updateData.resultsData = data;
        break;
    }

    // Update session
    const [updated] = await db
      .update(projectSessions)
      .set(updateData)
      .where(eq(projectSessions.id, sessionId))
      .returning();

    res.json({
      success: true,
      session: updated,
      message: `Session updated for ${step} step`
    });

  } catch (error: any) {
    console.error('Error updating session step:', error);
    res.status(500).json({ error: error.message || 'Failed to update session' });
  }
});

/**
 * POST /api/project-session/:sessionId/validate-execution
 * Server-side validation of execution results (prevents tampering)
 */
router.post('/:sessionId/validate-execution', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;
    const { executionResults } = req.body;

    // Fetch session
    const [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.id, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate execution results structure
    const requiredFields = ['totalAnalyses', 'dataSize', 'executionTime'];
    const hasRequiredFields = requiredFields.every(field =>
      executionResults && executionResults[field] !== undefined
    );

    if (!hasRequiredFields) {
      return res.status(400).json({
        error: 'Invalid execution results',
        required: requiredFields
      });
    }

    // Check for tampering - compare hash
    const clientHash = req.body.dataHash;
    const serverHash = generateDataHash(executionResults);

    if (session.dataHash && session.dataHash !== serverHash) {
      console.warn(`⚠️  Tampering detected for session ${sessionId}`);
      console.warn(`   Client hash: ${clientHash}`);
      console.warn(`   Server hash: ${serverHash}`);

      return res.status(400).json({
        error: 'Data integrity check failed. Please re-run analysis.',
        tamperingDetected: true
      });
    }

    // Mark as server-validated
    const [validated] = await db
      .update(projectSessions)
      .set({
        serverValidated: true,
        dataHash: serverHash,
        executeData: executionResults,
        updatedAt: new Date(),
      })
      .where(eq(projectSessions.id, sessionId))
      .returning();

    res.json({
      success: true,
      validated: true,
      session: validated,
      message: 'Execution results validated successfully'
    });

  } catch (error: any) {
    console.error('Error validating execution:', error);
    res.status(500).json({ error: error.message || 'Failed to validate execution' });
  }
});

/**
 * POST /api/project-session/:sessionId/link-project
 * Link session to created project
 */
router.post('/:sessionId/link-project', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    // Fetch session
    const [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.id, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Link project
    const [updated] = await db
      .update(projectSessions)
      .set({
        projectId,
        updatedAt: new Date(),
      })
      .where(eq(projectSessions.id, sessionId))
      .returning();

    res.json({
      success: true,
      session: updated,
      message: 'Project linked to session'
    });

  } catch (error: any) {
    console.error('Error linking project:', error);
    res.status(500).json({ error: error.message || 'Failed to link project' });
  }
});

/**
 * DELETE /api/project-session/:sessionId
 * Delete/expire a session
 */
router.delete('/:sessionId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;

    // Verify ownership
    const [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.id, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Soft delete by setting expiry to now
    await db
      .update(projectSessions)
      .set({
        expiresAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectSessions.id, sessionId));

    res.json({
      success: true,
      message: 'Session expired successfully'
    });

  } catch (error: any) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: error.message || 'Failed to delete session' });
  }
});

/**
 * POST /api/project-session/cleanup-expired
 * Cleanup expired sessions (admin/cron job)
 */
router.post('/cleanup-expired', async (req, res) => {
  try {
    const now = new Date();

    const deleted = await db
      .delete(projectSessions)
      .where(lt(projectSessions.expiresAt, now));

    res.json({
      success: true,
      message: `Cleaned up expired sessions`,
      deletedCount: deleted.rowCount || 0
    });

  } catch (error: any) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({ error: error.message || 'Failed to cleanup sessions' });
  }
});

export default router;

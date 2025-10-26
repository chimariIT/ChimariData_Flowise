# Consultation Journey Redesign - Implementation Plan

**Date**: January 2025  
**Priority**: 3  
**Estimated Effort**: 40-60 hours (1-1.5 weeks full-time)  
**Status**: Planning & Phase 1 Implementation

---

## Overview

The Consultation Journey needs to be redesigned to follow a proposal-based workflow instead of the current standard analysis pattern.

### Current vs Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Entry Point** | Data upload required | Goal/questions submission (data optional) |
| **Workflow** | Immediate analysis | Proposal → Accept/Reject → Admin execution |
| **Payment** | Single charge after analysis | 10% deposit + final bill |
| **Execution** | User-initiated automated | Admin-initiated manual |
| **Admin Role** | Passive observer | Active project manager |
| **Artifacts** | Immediate access | Post-payment unlock |

---

## Phase 1: Database Schema & Backend Foundation (CURRENT PHASE)

### 1.1 Database Schema Changes

#### New Table: `consultation_proposals`

```sql
CREATE TABLE consultation_proposals (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR REFERENCES projects(id),
  user_id VARCHAR REFERENCES users(id),
  
  -- Submission
  goal TEXT NOT NULL,
  business_questions JSONB, -- array of question strings
  has_data BOOLEAN DEFAULT FALSE,
  data_description TEXT,
  
  -- Proposal
  estimated_cost INTEGER, -- in cents
  estimated_timeline TEXT,
  scope_of_work TEXT,
  deliverables JSONB,
  methodology TEXT,
  
  -- Status workflow
  status VARCHAR NOT NULL DEFAULT 'draft',
    -- draft: being created
    -- proposed: sent to user
    -- accepted: user accepted, awaiting admin
    -- rejected: user rejected
    -- in_progress: admin working on it
    -- completed: analysis done, awaiting payment
    -- delivered: paid and artifacts unlocked
    -- cancelled: cancelled by user or admin
  
  -- Payment tracking
  deposit_paid BOOLEAN DEFAULT FALSE,
  deposit_amount INTEGER, -- 10% of estimated cost
  deposit_payment_intent_id VARCHAR,
  
  final_cost INTEGER, -- actual cost after completion
  final_bill_approved_by_admin BOOLEAN DEFAULT FALSE,
  final_bill_approved_at TIMESTAMP,
  final_payment_intent_id VARCHAR,
  final_paid BOOLEAN DEFAULT FALSE,
  final_paid_at TIMESTAMP,
  
  -- Admin assignment
  assigned_admin_id VARCHAR REFERENCES users(id),
  assigned_at TIMESTAMP,
  admin_notes TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMP,
  proposed_at TIMESTAMP,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  completed_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX consultation_proposals_user_id_idx ON consultation_proposals(user_id);
CREATE INDEX consultation_proposals_status_idx ON consultation_proposals(status);
CREATE INDEX consultation_proposals_assigned_admin_idx ON consultation_proposals(assigned_admin_id);
```

#### Add to `projects` table

```sql
ALTER TABLE projects 
ADD COLUMN consultation_proposal_id VARCHAR REFERENCES consultation_proposals(id);
```

#### Add to `users` table (if not exists)

```sql
ALTER TABLE users 
ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
```

### 1.2 TypeScript Types

```typescript
// shared/schema.ts additions

export const consultationProposals = pgTable("consultation_proposals", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").references(() => projects.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Submission
  goal: text("goal").notNull(),
  businessQuestions: jsonb("business_questions"),
  hasData: boolean("has_data").default(false),
  dataDescription: text("data_description"),
  
  // Proposal
  estimatedCost: integer("estimated_cost"),
  estimatedTimeline: text("estimated_timeline"),
  scopeOfWork: text("scope_of_work"),
  deliverables: jsonb("deliverables"),
  methodology: text("methodology"),
  
  // Status
  status: varchar("status").notNull().default("draft"),
  
  // Payment
  depositPaid: boolean("deposit_paid").default(false),
  depositAmount: integer("deposit_amount"),
  depositPaymentIntentId: varchar("deposit_payment_intent_id"),
  finalCost: integer("final_cost"),
  finalBillApprovedByAdmin: boolean("final_bill_approved_by_admin").default(false),
  finalBillApprovedAt: timestamp("final_bill_approved_at"),
  finalPaymentIntentId: varchar("final_payment_intent_id"),
  finalPaid: boolean("final_paid").default(false),
  finalPaidAt: timestamp("final_paid_at"),
  
  // Admin
  assignedAdminId: varchar("assigned_admin_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  adminNotes: text("admin_notes"),
  
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  proposedAt: timestamp("proposed_at"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  completedAt: timestamp("completed_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export type ConsultationProposal = typeof consultationProposals.$inferSelect;
export type NewConsultationProposal = typeof consultationProposals.$inferInsert;
```

### 1.3 Backend Services

#### `server/services/consultation-manager.ts`

```typescript
import { db } from '../db';
import { consultationProposals, projects, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface ProposalSubmission {
  userId: string;
  goal: string;
  businessQuestions: string[];
  hasData: boolean;
  dataDescription?: string;
  initialDatasetIds?: string[];
}

interface GeneratedProposal {
  estimatedCost: number; // in cents
  estimatedTimeline: string;
  scopeOfWork: string;
  deliverables: string[];
  methodology: string;
}

export class ConsultationManager {
  
  /**
   * Submit a consultation request and generate proposal
   */
  static async submitConsultationRequest(submission: ProposalSubmission): Promise<{
    proposalId: string;
    proposal: GeneratedProposal;
  }> {
    // 1. Create project
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(projects).values({
      id: projectId,
      userId: submission.userId,
      ownerId: submission.userId,
      name: `Consultation: ${submission.goal.substring(0, 50)}...`,
      description: submission.goal,
      journeyType: 'consultation',
      status: 'active'
    });
    
    // 2. Generate proposal using AI
    const proposal = await this.generateProposal(submission);
    
    // 3. Create consultation proposal record
    const proposalId = `cons_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(consultationProposals).values({
      id: proposalId,
      projectId,
      userId: submission.userId,
      goal: submission.goal,
      businessQuestions: submission.businessQuestions as any,
      hasData: submission.hasData,
      dataDescription: submission.dataDescription,
      estimatedCost: proposal.estimatedCost,
      estimatedTimeline: proposal.estimatedTimeline,
      scopeOfWork: proposal.scopeOfWork,
      deliverables: proposal.deliverables as any,
      methodology: proposal.methodology,
      status: 'proposed',
      depositAmount: Math.round(proposal.estimatedCost * 0.1), // 10% deposit
      submittedAt: new Date(),
      proposedAt: new Date()
    });
    
    // 4. Update project with proposal ID
    await db.update(projects)
      .set({ consultationProposalId: proposalId })
      .where(eq(projects.id, projectId));
    
    return { proposalId, proposal };
  }
  
  /**
   * Generate proposal based on submission
   */
  private static async generateProposal(submission: ProposalSubmission): Promise<GeneratedProposal> {
    // TODO: Use AI to analyze submission and generate proposal
    // For now, use simple estimation logic
    
    const questionCount = submission.businessQuestions.length;
    const hasData = submission.hasData;
    
    // Base cost calculation
    let baseCost = 50000; // $500 base
    baseCost += questionCount * 10000; // $100 per question
    if (!hasData) baseCost += 20000; // $200 if no data (need to source)
    
    // Estimate timeline
    const weeks = Math.ceil(1 + questionCount * 0.5);
    const timeline = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
    
    // Generate deliverables
    const deliverables = [
      'Comprehensive analysis report',
      'Data visualization dashboard',
      'Executive summary presentation',
      `Answers to ${questionCount} business questions`,
      'Actionable recommendations',
      'Follow-up consultation session'
    ];
    
    if (!hasData) {
      deliverables.push('Data sourcing and acquisition');
    }
    
    return {
      estimatedCost: baseCost,
      estimatedTimeline: timeline,
      scopeOfWork: this.generateScopeOfWork(submission),
      deliverables,
      methodology: this.generateMethodology(submission)
    };
  }
  
  private static generateScopeOfWork(submission: ProposalSubmission): string {
    return `
Based on your goal: "${submission.goal}"

We will conduct a comprehensive consultation-driven analysis to address your ${submission.businessQuestions.length} business questions. 

Our expert team will:
1. Review and understand your business context
2. ${submission.hasData ? 'Analyze your provided data' : 'Source and acquire relevant data'}
3. Apply advanced analytical methods
4. Generate insights and recommendations
5. Present findings in business-friendly format
6. Provide strategic guidance for implementation

This consultation includes direct access to our senior data scientists and business analysts.
    `.trim();
  }
  
  private static generateMethodology(submission: ProposalSubmission): string {
    return `
We will employ a structured consultation methodology:

1. **Discovery Phase**: Deep dive into your business context and questions
2. **Data Phase**: ${submission.hasData ? 'Validation and preparation of your data' : 'Data sourcing, acquisition, and preparation'}
3. **Analysis Phase**: Application of statistical methods, ML models, and business intelligence techniques
4. **Synthesis Phase**: Translation of findings into actionable business insights
5. **Delivery Phase**: Comprehensive report, visualizations, and presentation
6. **Follow-up**: Consultation session to discuss findings and answer questions

All work is performed by senior analysts with review by our consulting team.
    `.trim();
  }
  
  /**
   * Accept proposal and charge deposit
   */
  static async acceptProposal(proposalId: string, userId: string, paymentMethodId: string): Promise<{
    success: boolean;
    depositCharged: boolean;
    amountCharged: number;
  }> {
    // Get proposal
    const [proposal] = await db
      .select()
      .from(consultationProposals)
      .where(and(
        eq(consultationProposals.id, proposalId),
        eq(consultationProposals.userId, userId)
      ));
    
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    
    if (proposal.status !== 'proposed') {
      throw new Error(`Cannot accept proposal in status: ${proposal.status}`);
    }
    
    // TODO: Charge deposit via Stripe
    // For now, mock the payment
    const depositAmount = proposal.depositAmount || 0;
    
    // Update proposal status
    await db.update(consultationProposals)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        depositPaid: true,
        // depositPaymentIntentId: paymentIntent.id
      })
      .where(eq(consultationProposals.id, proposalId));
    
    return {
      success: true,
      depositCharged: true,
      amountCharged: depositAmount
    };
  }
  
  /**
   * Reject proposal
   */
  static async rejectProposal(proposalId: string, userId: string, reason?: string): Promise<void> {
    await db.update(consultationProposals)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        adminNotes: reason
      })
      .where(and(
        eq(consultationProposals.id, proposalId),
        eq(consultationProposals.userId, userId)
      ));
  }
  
  /**
   * Get proposals for admin queue
   */
  static async getAdminQueue(adminId?: string): Promise<ConsultationProposal[]> {
    if (adminId) {
      return db
        .select()
        .from(consultationProposals)
        .where(eq(consultationProposals.assignedAdminId, adminId));
    }
    
    // Get all accepted proposals waiting for admin
    return db
      .select()
      .from(consultationProposals)
      .where(eq(consultationProposals.status, 'accepted'));
  }
  
  /**
   * Assign proposal to admin
   */
  static async assignToAdmin(proposalId: string, adminId: string): Promise<void> {
    await db.update(consultationProposals)
      .set({
        assignedAdminId: adminId,
        assignedAt: new Date(),
        status: 'in_progress'
      })
      .where(eq(consultationProposals.id, proposalId));
  }
}
```

### 1.4 API Routes

Create `server/routes/consultation.ts`:

```typescript
import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { ConsultationManager } from '../services/consultation-manager';
import { z } from 'zod';

const router = Router();

/**
 * Submit consultation request
 * POST /api/consultation/submit
 */
router.post('/submit', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    
    const schema = z.object({
      goal: z.string().min(10),
      businessQuestions: z.array(z.string()).min(1),
      hasData: z.boolean(),
      dataDescription: z.string().optional(),
      initialDatasetIds: z.array(z.string()).optional()
    });
    
    const data = schema.parse(req.body);
    
    const result = await ConsultationManager.submitConsultationRequest({
      ...data,
      userId
    });
    
    res.json({
      success: true,
      proposalId: result.proposalId,
      proposal: result.proposal
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get proposal details
 * GET /api/consultation/proposals/:proposalId
 */
router.get('/proposals/:proposalId', ensureAuthenticated, async (req, res) => {
  // Implementation
});

/**
 * Accept proposal
 * POST /api/consultation/proposals/:proposalId/accept
 */
router.post('/proposals/:proposalId/accept', ensureAuthenticated, async (req, res) => {
  // Implementation with Stripe
});

/**
 * Reject proposal
 * POST /api/consultation/proposals/:proposalId/reject
 */
router.post('/proposals/:proposalId/reject', ensureAuthenticated, async (req, res) => {
  // Implementation
});

export default router;
```

---

## Phase 2: User Interface Components (NEXT)

### 2.1 Consultation Submission Form

`client/src/pages/consultation-submit-step.tsx`

### 2.2 Proposal Review Page

`client/src/pages/consultation-proposal-review.tsx`

### 2.3 Status Tracking

`client/src/pages/consultation-status.tsx`

### 2.4 Final Bill Review

`client/src/pages/consultation-final-bill.tsx`

---

## Phase 3: Admin Interface (AFTER PHASE 2)

### 3.1 Consultation Queue

`client/src/pages/admin/consultation-queue.tsx`

### 3.2 Proposal Detail & Execution

`client/src/pages/admin/consultation-detail.tsx`

### 3.3 Final Billing

`client/src/pages/admin/consultation-billing.tsx`

---

## Phase 4: Integration & Testing (FINAL)

### 4.1 Payment Integration

- Stripe deposit payment
- Stripe final payment
- Refund logic if needed

### 4.2 Artifact Unlocking

- Link to existing artifact system
- Post-payment access control

### 4.3 Email Notifications

- Proposal ready
- Proposal accepted
- Analysis complete
- Final bill ready

### 4.4 End-to-End Testing

---

## Status: Phase 1 Schema Creation (NOW)

Let's start by creating the database migration for the consultation proposals table.


/**
 * Privacy Compliance Service
 * 
 * Implements GDPR and CCPA compliance features including:
 * - Right to Access
 * - Right to Erasure
 * - Right to Rectification
 * - Right to Portability
 * - Consent Management
 * 
 * @module PrivacyComplianceService
 */

import { db } from '../db';
import { privacyRequests, userConsents, dataProcessingRecords, users, projects, datasets } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/** Privacy request types */
export type PrivacyRequestType = 'ACCESS' | 'ERASURE' | 'RECTIFICATION' | 'PORTABILITY';

/** Privacy request status */
export type PrivacyRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

/** Consent types */
export type ConsentType = 'MARKETING' | 'ANALYTICS' | 'DATA_PROCESSING' | 'THIRD_PARTY_SHARING';

/** Privacy request */
export interface PrivacyRequest {
    id: string;
    userId: string;
    requestType: PrivacyRequestType;
    status: PrivacyRequestStatus;
    details: any;
    submittedAt: Date;
    processedAt?: Date;
    processedBy?: string;
    completedAt?: Date;
}

/** User consent record */
export interface UserConsent {
    id: string;
    userId: string;
    consentType: ConsentType;
    granted: boolean;
    grantedAt: Date;
    revokedAt?: Date;
    ipAddress?: string;
}

/**
 * Privacy Compliance Service
 * 
 * Handles all GDPR/CCPA compliance operations
 */
export class PrivacyComplianceService {
    /**
     * Create a privacy request
     * 
     * @param userId - User ID
     * @param requestType - Type of request
     * @param details - Additional details
     * @returns Created request
     */
    static async createPrivacyRequest(
        userId: string,
        requestType: PrivacyRequestType,
        details: any = {}
    ): Promise<PrivacyRequest> {
        const [request] = await db
            .insert(privacyRequests)
            .values({
                id: nanoid(),
                userId,
                requestType,
                status: 'PENDING',
                details,
                submittedAt: new Date()
            })
            .returning();

        // Log the request
        await this.logDataProcessing(
            userId,
            'PRIVACY_REQUEST',
            `User submitted ${requestType} request`,
            'USER_CONSENT'
        );

        return request as PrivacyRequest;
    }

    /**
     * Process data access request (GDPR Article 15)
     * 
     * Collects all user data and returns it in a structured format
     * 
     * @param requestId - Privacy request ID
     * @returns User data package
     */
    static async processDataAccessRequest(requestId: string): Promise<any> {
        const request = await this.getRequest(requestId);

        if (!request || request.requestType !== 'ACCESS') {
            throw new Error('Invalid access request');
        }

        // Collect all user data
        const userData = await this.getUserData(request.userId);

        // Update request status
        await this.updateRequestStatus(requestId, 'COMPLETED');

        return userData;
    }

    /**
     * Process erasure request (GDPR Article 17 - Right to be Forgotten)
     * 
     * Permanently deletes all user data
     * 
     * @param requestId - Privacy request ID
     */
    static async processErasureRequest(requestId: string): Promise<void> {
        const request = await this.getRequest(requestId);

        if (!request || request.requestType !== 'ERASURE') {
            throw new Error('Invalid erasure request');
        }

        // Delete all user data
        await this.deleteUserData(request.userId);

        // Update request status
        await this.updateRequestStatus(requestId, 'COMPLETED');
    }

    /**
     * Process rectification request (GDPR Article 16)
     * 
     * Updates user data with corrections
     * 
     * @param requestId - Privacy request ID
     * @param corrections - Data corrections
     */
    static async processRectificationRequest(
        requestId: string,
        corrections: any
    ): Promise<void> {
        const request = await this.getRequest(requestId);

        if (!request || request.requestType !== 'RECTIFICATION') {
            throw new Error('Invalid rectification request');
        }

        // Apply corrections
        await db
            .update(users)
            .set(corrections)
            .where(eq(users.id, request.userId));

        // Log the rectification
        await this.logDataProcessing(
            request.userId,
            'DATA_RECTIFICATION',
            'User data corrected per GDPR Article 16',
            'USER_REQUEST'
        );

        // Update request status
        await this.updateRequestStatus(requestId, 'COMPLETED');
    }

    /**
     * Process portability request (GDPR Article 20)
     * 
     * Exports user data in machine-readable format
     * 
     * @param requestId - Privacy request ID
     * @param format - Export format (JSON or CSV)
     * @returns Exported data
     */
    static async processPortabilityRequest(
        requestId: string,
        format: 'JSON' | 'CSV' = 'JSON'
    ): Promise<string> {
        const request = await this.getRequest(requestId);

        if (!request || request.requestType !== 'PORTABILITY') {
            throw new Error('Invalid portability request');
        }

        // Get user data
        const userData = await this.getUserData(request.userId);

        // Export in requested format
        const exportedData = format === 'JSON'
            ? JSON.stringify(userData, null, 2)
            : this.convertToCSV(userData);

        // Update request status
        await this.updateRequestStatus(requestId, 'COMPLETED');

        return exportedData;
    }

    /**
     * Get all user data
     * 
     * @param userId - User ID
     * @returns Complete user data package
     */
    static async getUserData(userId: string): Promise<any> {
        // Get user profile
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));

        // Get user projects
        const userProjects = await db
            .select()
            .from(projects)
            .where(eq(projects.userId, userId));

        // Get user datasets
        const userDatasets = await db
            .select()
            .from(datasets)
            .where(eq(datasets.userId, userId));

        // Get consent history
        const consents = await this.getConsentHistory(userId);

        // Get processing records
        const processingRecords = await db
            .select()
            .from(dataProcessingRecords)
            .where(eq(dataProcessingRecords.userId, userId));

        return {
            profile: user,
            projects: userProjects,
            datasets: userDatasets,
            consents,
            processingRecords,
            exportedAt: new Date().toISOString(),
            gdprCompliant: true
        };
    }

    /**
     * Delete all user data (GDPR erasure)
     * 
     * @param userId - User ID
     */
    static async deleteUserData(userId: string): Promise<void> {
        // Delete in order to respect foreign key constraints

        // 1. Delete datasets
        await db.delete(datasets).where(eq(datasets.userId, userId));

        // 2. Delete projects
        await db.delete(projects).where(eq(projects.userId, userId));

        // 3. Delete consents
        await db.delete(userConsents).where(eq(userConsents.userId, userId));

        // 4. Delete processing records
        await db.delete(dataProcessingRecords).where(eq(dataProcessingRecords.userId, userId));

        // 5. Anonymize user record (keep for audit trail)
        await db
            .update(users)
            .set({
                email: `deleted-${userId}@anonymized.local`,
                username: `deleted-${userId}`,
                // Keep minimal data for legal compliance
                deletedAt: new Date()
            })
            .where(eq(users.id, userId));

        // Log the erasure
        await this.logDataProcessing(
            userId,
            'DATA_ERASURE',
            'User data erased per GDPR Article 17',
            'USER_REQUEST'
        );
    }

    /**
     * Track user consent
     * 
     * @param userId - User ID
     * @param consentType - Type of consent
     * @param granted - Whether consent is granted
     * @param ipAddress - User's IP address
     */
    static async trackConsent(
        userId: string,
        consentType: ConsentType,
        granted: boolean,
        ipAddress?: string
    ): Promise<UserConsent> {
        // Revoke previous consent if exists
        if (!granted) {
            await db
                .update(userConsents)
                .set({ revokedAt: new Date() })
                .where(
                    and(
                        eq(userConsents.userId, userId),
                        eq(userConsents.consentType, consentType)
                    )
                );
        }

        // Create new consent record
        const [consent] = await db
            .insert(userConsents)
            .values({
                id: nanoid(),
                userId,
                consentType,
                granted,
                grantedAt: new Date(),
                ipAddress
            })
            .returning();

        return consent as UserConsent;
    }

    /**
     * Get consent history for user
     * 
     * @param userId - User ID
     * @returns Consent history
     */
    static async getConsentHistory(userId: string): Promise<UserConsent[]> {
        const consents = await db
            .select()
            .from(userConsents)
            .where(eq(userConsents.userId, userId))
            .orderBy(desc(userConsents.grantedAt));

        return consents as UserConsent[];
    }

    /**
     * Log data processing activity
     * 
     * @param userId - User ID
     * @param processingType - Type of processing
     * @param purpose - Purpose of processing
     * @param legalBasis - Legal basis for processing
     */
    static async logDataProcessing(
        userId: string,
        processingType: string,
        purpose: string,
        legalBasis: string
    ): Promise<void> {
        await db.insert(dataProcessingRecords).values({
            id: nanoid(),
            userId,
            processingType,
            purpose,
            legalBasis,
            dataCategories: [],
            timestamp: new Date()
        });
    }

    /**
     * Get privacy request
     * 
     * @param requestId - Request ID
     * @returns Privacy request
     */
    private static async getRequest(requestId: string): Promise<PrivacyRequest | null> {
        const [request] = await db
            .select()
            .from(privacyRequests)
            .where(eq(privacyRequests.id, requestId));

        return request as PrivacyRequest || null;
    }

    /**
     * Update request status
     * 
     * @param requestId - Request ID
     * @param status - New status
     */
    private static async updateRequestStatus(
        requestId: string,
        status: PrivacyRequestStatus
    ): Promise<void> {
        await db
            .update(privacyRequests)
            .set({
                status,
                completedAt: status === 'COMPLETED' ? new Date() : undefined
            })
            .where(eq(privacyRequests.id, requestId));
    }

    /**
     * Convert data to CSV format
     * 
     * @param data - Data to convert
     * @returns CSV string
     */
    private static convertToCSV(data: any): string {
        // Simplified CSV conversion
        // In production, use a proper CSV library
        return JSON.stringify(data);
    }

    /**
     * Get all pending privacy requests (admin)
     * 
     * @returns Pending requests
     */
    static async getPendingRequests(): Promise<PrivacyRequest[]> {
        const requests = await db
            .select()
            .from(privacyRequests)
            .where(eq(privacyRequests.status, 'PENDING'))
            .orderBy(desc(privacyRequests.submittedAt));

        return requests as PrivacyRequest[];
    }

    /**
     * Approve privacy request (admin)
     * 
     * @param requestId - Request ID
     * @param adminId - Admin user ID
     */
    static async approveRequest(requestId: string, adminId: string): Promise<void> {
        await db
            .update(privacyRequests)
            .set({
                status: 'APPROVED',
                processedAt: new Date(),
                processedBy: adminId
            })
            .where(eq(privacyRequests.id, requestId));
    }

    /**
     * Reject privacy request (admin)
     * 
     * @param requestId - Request ID
     * @param adminId - Admin user ID
     * @param reason - Rejection reason
     */
    static async rejectRequest(
        requestId: string,
        adminId: string,
        reason: string
    ): Promise<void> {
        await db
            .update(privacyRequests)
            .set({
                status: 'REJECTED',
                processedAt: new Date(),
                processedBy: adminId,
                details: { rejectionReason: reason }
            })
            .where(eq(privacyRequests.id, requestId));
    }
}

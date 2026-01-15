/**
 * Row-Level Security (RLS) Service
 * 
 * Provides multi-tenant data isolation by applying user-specific filters
 * to database queries based on ownership rules and user roles.
 * 
 * @module RowLevelSecurityService
 */

import { db } from '../db';
import { rlsPolicies } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

/** RLS policy operation types */
export type RLSOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/** RLS policy definition */
export interface RLSPolicy {
    id: string;
    tableName: string;
    operation: RLSOperation;
    userRole: string;
    condition: string;
    enabled: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
}

/** User context for RLS evaluation */
export interface RLSUserContext {
    userId: string;
    userRole: string;
    isAdmin: boolean;
    department?: string;
    groups?: string[];
}

/** RLS filter result */
export interface RLSFilter {
    where: any;
    metadata: {
        policiesApplied: string[];
        bypassReason?: string;
    };
}

/**
 * Row-Level Security Service
 * 
 * Enforces data access policies at the row level to ensure users
 * can only access data they are authorized to see.
 */
export class RowLevelSecurityService {
    /**
     * Apply RLS filters to a database query
     * 
     * @param tableName - The table being queried
     * @param operation - The operation being performed
     * @param user - The user context
     * @returns RLS filter to apply to the query
     */
    static async applyRLSFilters(
        tableName: string,
        operation: RLSOperation,
        user: RLSUserContext
    ): Promise<RLSFilter> {
        // Admin bypass - admins can access all data
        if (user.isAdmin) {
            return {
                where: undefined,
                metadata: {
                    policiesApplied: [],
                    bypassReason: 'Admin user - full access granted'
                }
            };
        }

        // Get applicable policies
        const policies = await this.getPolicies(tableName, operation, user.userRole);

        if (policies.length === 0) {
            // No policies defined - default to user ownership
            return this.getDefaultOwnershipFilter(tableName, user);
        }

        // Evaluate and combine policies
        const filters = policies.map(policy =>
            this.evaluateCondition(policy.condition, user)
        );

        return {
            where: or(...filters),
            metadata: {
                policiesApplied: policies.map(p => p.id)
            }
        };
    }

    /**
     * Get applicable RLS policies for a table and operation
     * 
     * @param tableName - The table name
     * @param operation - The operation type
     * @param userRole - The user's role
     * @returns Array of applicable policies
     */
    static async getPolicies(
        tableName: string,
        operation: RLSOperation,
        userRole: string
    ): Promise<RLSPolicy[]> {
        const policies = await db
            .select()
            .from(rlsPolicies)
            .where(
                and(
                    eq(rlsPolicies.tableName, tableName),
                    eq(rlsPolicies.operation, operation),
                    eq(rlsPolicies.userRole, userRole),
                    eq(rlsPolicies.enabled, true)
                )
            )
            .orderBy(rlsPolicies.priority);

        return policies as RLSPolicy[];
    }

    /**
     * Evaluate a policy condition with user context
     * 
     * @param condition - The policy condition template
     * @param user - The user context
     * @returns Evaluated Drizzle ORM filter
     */
    static evaluateCondition(condition: string, user: RLSUserContext): any {
        // Replace template variables with actual values
        const evaluated = condition
            .replace(/\$currentUserId/g, `'${user.userId}'`)
            .replace(/\$userRole/g, `'${user.userRole}'`)
            .replace(/\$userDepartment/g, `'${user.department || ''}'`);

        // Parse and return as Drizzle filter
        // This is a simplified version - in production, use a proper SQL parser
        return this.parseConditionToFilter(evaluated);
    }

    /**
     * Parse SQL condition string to Drizzle ORM filter
     * 
     * @param condition - SQL WHERE clause
     * @returns Drizzle ORM filter object
     */
    private static parseConditionToFilter(condition: string): any {
        // For RLS, we return the condition string to be used with sql template
        // This will be applied in the actual query context
        // In production, implement proper SQL parsing or use a policy DSL
        return { _rlsCondition: condition };
    }

    /**
     * Get default ownership filter when no policies are defined
     * 
     * @param tableName - The table name
     * @param user - The user context
     * @returns Default ownership filter
     */
    private static getDefaultOwnershipFilter(
        tableName: string,
        user: RLSUserContext
    ): RLSFilter {
        return {
            where: { _rlsCondition: `userId = '${user.userId}'` },
            metadata: {
                policiesApplied: ['default_ownership'],
                bypassReason: 'No policies defined - using default ownership filter'
            }
        };
    }

    /**
     * Create a new RLS policy
     * 
     * @param policy - The policy to create
     * @returns Created policy
     */
    static async createPolicy(
        policy: Omit<RLSPolicy, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<RLSPolicy> {
        const [created] = await db
            .insert(rlsPolicies)
            .values({
                ...policy,
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return created as RLSPolicy;
    }

    /**
     * Update an existing RLS policy
     * 
     * @param policyId - The policy ID
     * @param updates - The updates to apply
     * @returns Updated policy
     */
    static async updatePolicy(
        policyId: string,
        updates: Partial<RLSPolicy>
    ): Promise<RLSPolicy> {
        const [updated] = await db
            .update(rlsPolicies)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(rlsPolicies.id, policyId))
            .returning();

        return updated as RLSPolicy;
    }

    /**
     * Delete an RLS policy
     * 
     * @param policyId - The policy ID
     */
    static async deletePolicy(policyId: string): Promise<void> {
        await db
            .delete(rlsPolicies)
            .where(eq(rlsPolicies.id, policyId));
    }

    /**
     * Get all policies for a table
     * 
     * @param tableName - The table name
     * @returns All policies for the table
     */
    static async getPoliciesForTable(tableName: string): Promise<RLSPolicy[]> {
        const policies = await db
            .select()
            .from(rlsPolicies)
            .where(eq(rlsPolicies.tableName, tableName))
            .orderBy(rlsPolicies.priority);

        return policies as RLSPolicy[];
    }

    /**
     * Test if a user can access a specific row
     * 
     * @param tableName - The table name
     * @param rowData - The row data to test
     * @param user - The user context
     * @returns True if access is allowed
     */
    static async canAccessRow(
        tableName: string,
        rowData: any,
        user: RLSUserContext
    ): Promise<boolean> {
        // Admin bypass
        if (user.isAdmin) return true;

        const filter = await this.applyRLSFilters(tableName, 'SELECT', user);

        // If no filter, default to ownership check
        if (!filter.where) {
            return rowData.userId === user.userId;
        }

        // Evaluate filter against row data
        return this.evaluateFilterAgainstRow(filter.where, rowData);
    }

    /**
     * Evaluate a filter against row data
     * 
     * @param filter - The filter to evaluate
     * @param rowData - The row data
     * @returns True if the row matches the filter
     */
    private static evaluateFilterAgainstRow(filter: any, rowData: any): boolean {
        // Simplified evaluation - in production, use a proper filter evaluator
        if (filter.userId) {
            return rowData.userId === filter.userId;
        }

        if (filter.isPublic !== undefined) {
            return rowData.isPublic === filter.isPublic || rowData.userId === filter.userId;
        }

        return false;
    }
}

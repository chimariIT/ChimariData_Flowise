/**
 * Validation Orchestrator
 * 
 * Cross-validates requirements from multiple sources and identifies conflicts.
 * Ensures consistency between Data Scientist requirements and PM Agent suggestions.
 */

import type { DataRequirementsMappingDocument } from './tools/required-data-elements-tool';

export interface ValidationConflict {
    element: string;
    requirementsSuggests: string;
    pmSuggests: string;
    confidence: {
        requirements: number;
        pm: number;
    };
    recommendation: string;
}

export interface CrossValidationResult {
    conflicts: ValidationConflict[];
    needsReview: boolean;
    overallConfidence: number;
    summary: string;
}

export class ValidationOrchestrator {
    /**
     * Cross-validate requirements document with PM Agent guidance
     */
    async crossValidate(
        requirementsDoc: DataRequirementsMappingDocument,
        pmGuidance?: any
    ): Promise<CrossValidationResult> {
        const conflicts: ValidationConflict[] = [];

        if (!pmGuidance || !pmGuidance.suggestedTransformations) {
            // No PM guidance to compare against
            return {
                conflicts: [],
                needsReview: false,
                overallConfidence: this.calculateDocumentConfidence(requirementsDoc),
                summary: 'No PM guidance available for cross-validation'
            };
        }

        // Check each required element against PM suggestions
        for (const element of requirementsDoc.requiredDataElements) {
            if (!element.transformationRequired || !element.transformationLogic) {
                continue;
            }

            // Find corresponding PM suggestion
            const pmSuggestion = pmGuidance.suggestedTransformations?.find(
                (t: any) => t.field === element.sourceField || t.targetField === element.elementName
            );

            if (pmSuggestion && pmSuggestion.operation !== element.transformationLogic.operation) {
                const reqConfidence = (element as any).confidence || 0.8;
                const pmConfidence = pmSuggestion.confidence || 0.7;

                conflicts.push({
                    element: element.elementName,
                    requirementsSuggests: element.transformationLogic.operation,
                    pmSuggests: pmSuggestion.operation,
                    confidence: {
                        requirements: reqConfidence,
                        pm: pmConfidence
                    },
                    recommendation: this.resolveConflict(reqConfidence, pmConfidence)
                });
            }
        }

        const overallConfidence = this.calculateDocumentConfidence(requirementsDoc);
        const needsReview = conflicts.length > 0 || overallConfidence < 0.7;

        return {
            conflicts,
            needsReview,
            overallConfidence,
            summary: this.generateSummary(conflicts, overallConfidence)
        };
    }

    /**
     * Calculate overall confidence for the requirements document
     */
    private calculateDocumentConfidence(doc: DataRequirementsMappingDocument): number {
        if (doc.requiredDataElements.length === 0) {
            return 0;
        }

        const confidences = doc.requiredDataElements.map(el => (el as any).confidence || 0.8);
        const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

        // Adjust based on completeness
        const completenessRatio = doc.completeness.elementsMapped / doc.completeness.totalElements;

        return avgConfidence * (0.7 + 0.3 * completenessRatio);
    }

    /**
     * Resolve conflict between two suggestions
     */
    private resolveConflict(reqConfidence: number, pmConfidence: number): string {
        if (reqConfidence > pmConfidence + 0.1) {
            return 'Use requirements suggestion (higher confidence)';
        } else if (pmConfidence > reqConfidence + 0.1) {
            return 'Use PM suggestion (higher confidence)';
        } else {
            return 'User review required (similar confidence)';
        }
    }

    /**
     * Generate validation summary
     */
    private generateSummary(conflicts: ValidationConflict[], confidence: number): string {
        if (conflicts.length === 0 && confidence >= 0.8) {
            return '✅ High confidence - ready for execution';
        } else if (conflicts.length === 0 && confidence >= 0.7) {
            return '⚠️ Medium confidence - review recommended';
        } else if (conflicts.length > 0) {
            return `⚠️ ${conflicts.length} conflicts detected - user review required`;
        } else {
            return '❌ Low confidence - manual review required';
        }
    }

    /**
     * Validate individual transformation
     */
    validateTransformation(transformation: any, requirements: any[]): {
        valid: boolean;
        confidence: number;
        issues: string[];
    } {
        const issues: string[] = [];
        let confidence = 0.8;

        // Check if transformation fulfills a requirement
        const relatedReq = requirements.find(req =>
            req.sourceField === transformation.config?.field
        );

        if (!relatedReq) {
            issues.push('Transformation does not fulfill any known requirement');
            confidence -= 0.2;
        }

        // Check if transformation might break required fields
        if (transformation.type === 'select') {
            const removedFields = requirements
                .filter(req => req.required && !transformation.config.columns.includes(req.sourceField))
                .map(req => req.elementName);

            if (removedFields.length > 0) {
                issues.push(`Removing required fields: ${removedFields.join(', ')}`);
                confidence -= 0.3;
            }
        }

        return {
            valid: confidence >= 0.5,
            confidence,
            issues
        };
    }
}

// Singleton instance
export const validationOrchestrator = new ValidationOrchestrator();

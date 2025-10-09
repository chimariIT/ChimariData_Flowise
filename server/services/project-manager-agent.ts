import { TechnicalAIAgent } from './technical-ai-agent';
import { BusinessAgent, BusinessContext } from './business-agent';
import { storage } from './storage';
import { PricingService } from './pricing';
import { nanoid } from 'nanoid';



type OrchestrationStatus = 'goal_extraction' | 'path_selection' | 'cost_approval' | 'ready_for_execution' | 'executing' | 'completed' | 'error';

interface OrchestrationState {
    status: OrchestrationStatus;
    history: Array<{ step: string; userInput?: any; agentOutput?: any; timestamp: Date; }>;
    lastAgentOutput?: any;
    userFeedback?: any;
    currentWorkflowStep?: string;
    dependencies?: WorkflowDependency[];
    artifacts?: ProjectArtifact[];
}

interface WorkflowDependency {
    id: string;
    stepName: string;
    dependsOn: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    artifacts?: string[];
    metadata?: any;
}

interface ProjectArtifact {
    id: string;
    type: 'dataset' | 'analysis' | 'visualization' | 'model' | 'report';
    name: string;
    description?: string;
    filePath?: string;
    metadata?: any;
    dependencies?: string[];
    createdAt: Date;
    version: string;
}

export class ProjectManagerAgent {
    private technicalAgent: TechnicalAIAgent;
    private businessAgent: BusinessAgent;

    constructor() {
        this.technicalAgent = new TechnicalAIAgent();
        this.businessAgent = new BusinessAgent();
    }

    async decideProject(userDescription: string, userId: string): Promise<{ decision: 'new' | 'existing', projectId?: string, existingProjects?: any[] }> {
        const existingProjects = await (storage as any).getProjectsByOwner(userId);

        if (!existingProjects || existingProjects.length === 0) {
            return { decision: 'new' };
        }

        const decision = await this.businessAgent.decideOnProject(userDescription, existingProjects);

        if (decision.shouldCreateNew) {
            return { decision: 'new', existingProjects };
        } else {
            return { decision: 'existing', projectId: decision.recommendedProjectId, existingProjects };
        }
    }

    private async getProjectAndState(projectId: string): Promise<{ project: any, state: OrchestrationState }> {
        const project = await storage.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const state = project.interactiveSession || {
            status: 'goal_extraction',
            history: [],
        };
        return { project, state };
    }

    private async updateProjectState(projectId: string, state: OrchestrationState) {
        await storage.updateProject(projectId, { interactiveSession: state });
    }

    async startGoalExtraction(projectId: string, userDescription: string, journeyType: string) {
        const { project, state } = await this.getProjectAndState(projectId);

        const context: BusinessContext = {
            projectName: project.name,
            projectDescription: project.description,
            recordCount: project.recordCount,
            dataSchema: project.schema,
        };

        const extractedGoals = await this.businessAgent.extractGoals(userDescription, journeyType, context);

        state.status = 'path_selection';
        state.lastAgentOutput = extractedGoals;
        state.history.push({
            step: 'startGoalExtraction',
            userInput: { userDescription, journeyType },
            agentOutput: extractedGoals,
            timestamp: new Date(),
        });

        await this.updateProjectState(projectId, state);
        return extractedGoals;
    }

    async confirmPathAndEstimateCost(projectId: string, userFeedback: { selectedPathName: string; modifications?: string }) {
        const { project, state } = await this.getProjectAndState(projectId);

        if (state.status !== 'path_selection') {
            throw new Error(`Cannot proceed. Project is in '${state.status}' status.`);
        }

        const analysisPath = state.lastAgentOutput.analysisPaths.find((p: any) => p.name === userFeedback.selectedPathName);
        if (!analysisPath) {
            throw new Error("Selected analysis path not found.");
        }

        const recordCount = project.data?.length || project.recordCount || 0;
        const cost = this.technicalAgent.estimateCost(analysisPath.type, recordCount, analysisPath.complexity);

        state.status = 'cost_approval';
        state.lastAgentOutput = { analysisPath, cost };
        state.userFeedback = userFeedback;
        state.history.push({
            step: 'confirmPathAndEstimateCost',
            userInput: userFeedback,
            agentOutput: { analysisPath, cost },
            timestamp: new Date(),
        });

        await this.updateProjectState(projectId, state);
        return { analysisPath, cost };
    }

    async approveCostAndExecute(projectId: string, userApproval: { approved: boolean }) {
        const { project, state } = await this.getProjectAndState(projectId);

        if (state.status !== 'cost_approval') {
            throw new Error(`Cannot execute. Project is in '${state.status}' status.`);
        }

        if (!userApproval.approved) {
            state.status = 'path_selection'; // Go back to path selection
            state.history.push({ step: 'approveCostAndExecute', userInput: userApproval, timestamp: new Date() });
            await this.updateProjectState(projectId, state);
            throw new Error("Cost not approved by user. Returning to path selection.");
        }

        const { analysisPath, cost } = state.lastAgentOutput;

        const checkoutSession = await PricingService.createCheckoutSession(projectId, cost.totalCost, cost.currency);
        await storage.updateProject(projectId, { paymentIntentId: checkoutSession.sessionId });

        state.status = 'ready_for_execution';
        state.history.push({ step: 'approveCostAndExecute', userInput: userApproval, timestamp: new Date() });
        await this.updateProjectState(projectId, state);

        // Execute analysis asynchronously
        this.executeAnalysis(projectId);

        return {
            message: "Analysis execution started.",
            checkoutUrl: checkoutSession.url,
        };
    }

    private async executeAnalysis(projectId: string) {
        const { project, state } = await this.getProjectAndState(projectId);
        const { analysisPath } = state.lastAgentOutput;

        try {
            state.status = 'executing';
            state.currentWorkflowStep = 'analysis_execution';
            await this.updateProjectState(projectId, state);

            // Initialize workflow dependencies for this analysis
            const workflow = await this.createWorkflowPlan(analysisPath, project);
            state.dependencies = workflow.dependencies;
            state.artifacts = [];
            await this.updateProjectState(projectId, state);

            // Execute workflow steps based on dependencies
            const executionResult = await this.executeWorkflow(projectId, workflow);

            await storage.updateProject(projectId, {
                analysisResults: { ...project.analysisResults, result: executionResult }
            });

            state.status = 'completed';
            state.lastAgentOutput = executionResult;
            state.history.push({ step: 'executeAnalysis', agentOutput: executionResult, timestamp: new Date() });
            await this.updateProjectState(projectId, state);

        } catch (error: any) {
            state.status = 'error';
            state.lastAgentOutput = { error: error.message };
            state.history.push({ step: 'executeAnalysis', agentOutput: { error: error.message }, timestamp: new Date() });
            await this.updateProjectState(projectId, state);
        }
    }

    // Advanced Workflow Orchestration Methods
    async createWorkflowPlan(analysisPath: any, project: any): Promise<{ dependencies: WorkflowDependency[] }> {
        const dependencies: WorkflowDependency[] = [];

        // Data preprocessing dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'data_preprocessing',
            dependsOn: [],
            status: 'pending',
            artifacts: ['cleaned_dataset'],
            metadata: { inputDataset: project.id }
        });

        // Statistical analysis dependency
        if (analysisPath.type === 'statistical' || analysisPath.type === 'comprehensive') {
            dependencies.push({
                id: nanoid(),
                stepName: 'statistical_analysis',
                dependsOn: ['data_preprocessing'],
                status: 'pending',
                artifacts: ['stats_report'],
                metadata: { analysisType: 'descriptive' }
            });
        }

        // Machine learning dependency
        if (analysisPath.type === 'ml' || analysisPath.type === 'comprehensive') {
            dependencies.push({
                id: nanoid(),
                stepName: 'feature_engineering',
                dependsOn: ['data_preprocessing'],
                status: 'pending',
                artifacts: ['feature_set'],
                metadata: { featureStrategy: 'auto' }
            });

            dependencies.push({
                id: nanoid(),
                stepName: 'model_training',
                dependsOn: ['feature_engineering'],
                status: 'pending',
                artifacts: ['trained_model'],
                metadata: { modelType: analysisPath.parameters?.modelType || 'auto' }
            });
        }

        // Visualization dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'visualization_generation',
            dependsOn: analysisPath.type === 'ml' ? ['model_training'] : ['statistical_analysis'],
            status: 'pending',
            artifacts: ['visualizations'],
            metadata: { chartTypes: analysisPath.parameters?.visualizations || ['auto'] }
        });

        // Report generation dependency
        dependencies.push({
            id: nanoid(),
            stepName: 'report_generation',
            dependsOn: ['visualization_generation'],
            status: 'pending',
            artifacts: ['final_report'],
            metadata: { format: ['pdf', 'interactive'] }
        });

        return { dependencies };
    }

    async executeWorkflow(projectId: string, workflow: { dependencies: WorkflowDependency[] }): Promise<any> {
        const { project, state } = await this.getProjectAndState(projectId);
        const results: any = {};
        const artifacts: ProjectArtifact[] = [];

        // Execute steps in dependency order
        const executionOrder = this.getExecutionOrder(workflow.dependencies);

        for (const stepName of executionOrder) {
            const dependency = workflow.dependencies.find(d => d.stepName === stepName);
            if (!dependency) continue;

            try {
                dependency.status = 'in_progress';
                await this.updateProjectState(projectId, { ...state, dependencies: workflow.dependencies });

                const stepResult = await this.executeWorkflowStep(stepName, dependency, project, results);
                results[stepName] = stepResult;

                // Create artifacts for this step
                if (dependency.artifacts) {
                    for (const artifactName of dependency.artifacts) {
                        const artifact: ProjectArtifact = {
                            id: nanoid(),
                            type: this.getArtifactType(artifactName),
                            name: artifactName,
                            description: `Generated from ${stepName}`,
                            metadata: stepResult,
                            dependencies: dependency.dependsOn,
                            createdAt: new Date(),
                            version: '1.0'
                        };
                        artifacts.push(artifact);
                    }
                }

                dependency.status = 'completed';

            } catch (error: any) {
                dependency.status = 'failed';
                results[stepName] = { error: error.message };
                console.error(`Workflow step ${stepName} failed:`, error);
            }

            await this.updateProjectState(projectId, {
                ...state,
                dependencies: workflow.dependencies,
                artifacts: artifacts
            });
        }

        return results;
    }

    private getExecutionOrder(dependencies: WorkflowDependency[]): string[] {
        const order: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (stepName: string) => {
            if (visiting.has(stepName)) {
                throw new Error(`Circular dependency detected involving ${stepName}`);
            }
            if (visited.has(stepName)) return;

            visiting.add(stepName);

            const dep = dependencies.find(d => d.stepName === stepName);
            if (dep) {
                for (const prerequisite of dep.dependsOn) {
                    visit(prerequisite);
                }
            }

            visiting.delete(stepName);
            visited.add(stepName);
            order.push(stepName);
        };

        for (const dep of dependencies) {
            visit(dep.stepName);
        }

        return order;
    }

    private async executeWorkflowStep(stepName: string, dependency: WorkflowDependency, project: any, previousResults: any): Promise<any> {
        switch (stepName) {
            case 'data_preprocessing':
                return this.technicalAgent.preprocessData(project.data, project.schema);

            case 'statistical_analysis':
                return this.technicalAgent.performStatisticalAnalysis(
                    previousResults.data_preprocessing?.cleanedData || project.data,
                    dependency.metadata
                );

            case 'feature_engineering':
                return this.technicalAgent.engineerFeatures(
                    previousResults.data_preprocessing?.cleanedData || project.data,
                    dependency.metadata
                );

            case 'model_training':
                return this.technicalAgent.trainModel(
                    previousResults.feature_engineering?.features,
                    dependency.metadata
                );

            case 'visualization_generation':
                return this.technicalAgent.generateVisualizations(
                    previousResults,
                    dependency.metadata
                );

            case 'report_generation':
                return this.generateComprehensiveReport(project, previousResults, dependency.metadata);

            default:
                throw new Error(`Unknown workflow step: ${stepName}`);
        }
    }

    private getArtifactType(artifactName: string): ProjectArtifact['type'] {
        if (artifactName.includes('dataset')) return 'dataset';
        if (artifactName.includes('model')) return 'model';
        if (artifactName.includes('visualization')) return 'visualization';
        if (artifactName.includes('report')) return 'report';
        return 'analysis';
    }

    private async generateComprehensiveReport(project: any, results: any, metadata: any): Promise<any> {
        return {
            projectSummary: {
                name: project.name,
                description: project.description,
                recordCount: project.recordCount,
                analysisType: 'comprehensive'
            },
            executiveSummary: this.generateExecutiveSummary(results),
            technicalFindings: results,
            recommendations: this.generateRecommendations(results),
            artifacts: metadata,
            generatedAt: new Date()
        };
    }

    private generateExecutiveSummary(results: any): string {
        let summary = "Analysis completed successfully. ";

        if (results.statistical_analysis) {
            summary += `Statistical analysis revealed key patterns in the data. `;
        }

        if (results.model_training) {
            summary += `Machine learning model was trained with ${results.model_training.accuracy || 'good'} performance. `;
        }

        if (results.visualization_generation) {
            summary += `Generated ${results.visualization_generation.charts?.length || 'multiple'} visualizations for insights. `;
        }

        return summary;
    }

    private generateRecommendations(results: any): string[] {
        const recommendations = [];

        if (results.statistical_analysis?.dataQuality?.completeness < 90) {
            recommendations.push("Improve data quality by addressing missing values");
        }

        if (results.model_training?.accuracy < 0.8) {
            recommendations.push("Consider feature engineering or alternative modeling approaches");
        }

        recommendations.push("Implement regular data monitoring and model retraining");
        recommendations.push("Share insights with stakeholders through interactive dashboards");

        return recommendations;
    }

    // Artifact Management Methods
    async getProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
        const { state } = await this.getProjectAndState(projectId);
        return state.artifacts || [];
    }

    async getArtifactLineage(projectId: string, artifactId: string): Promise<ProjectArtifact[]> {
        const artifacts = await this.getProjectArtifacts(projectId);
        const artifact = artifacts.find(a => a.id === artifactId);

        if (!artifact) return [];

        const lineage: ProjectArtifact[] = [artifact];

        // Recursively find dependencies
        const findDependencies = (deps: string[]) => {
            for (const depId of deps) {
                const depArtifact = artifacts.find(a => a.id === depId);
                if (depArtifact && !lineage.includes(depArtifact)) {
                    lineage.unshift(depArtifact);
                    if (depArtifact.dependencies) {
                        findDependencies(depArtifact.dependencies);
                    }
                }
            }
        };

        if (artifact.dependencies) {
            findDependencies(artifact.dependencies);
        }

        return lineage;
    }
}

// server/services/tool-initialization.ts
import { ToolRegistry } from './tool-registry';
import { 
  CSVToJSONConverter, 
  DataQualityChecker, 
  SchemaGenerator,
  dataTransformationToolsMetadata 
} from './data-transformation-tools';

export class ToolInitializationService {
  private toolRegistry: ToolRegistry;
  private initializedTools: Map<string, any> = new Map();

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Initialize all tools and register them with the dynamic registry
   */
  async initializeAllTools(): Promise<void> {
    console.log('🛠️ Initializing ChimariData Tool Ecosystem...');

    try {
      // Initialize data transformation tools
      await this.initializeDataTransformationTools();

      // Initialize external integration tools
      await this.initializeExternalIntegrationTools();

      // Initialize business logic tools
      await this.initializeBusinessLogicTools();

      // Set up tool dependencies and relationships
      await this.setupToolRelationships();

      console.log('✅ Tool ecosystem initialization completed successfully');
      console.log(`📊 Total registered tools: ${this.toolRegistry.getAllTools().length}`);
      
    } catch (error) {
      console.error('❌ Tool initialization failed:', error);
      throw error;
    }
  }

  private async initializeDataTransformationTools(): Promise<void> {
    console.log('🔄 Initializing data transformation tools...');

    // CSV to JSON Converter
    const csvConverter = new CSVToJSONConverter();
    const csvMetadata = dataTransformationToolsMetadata.find(m => m.id === 'csv_to_json_converter')!;
    await this.toolRegistry.registerTool(csvMetadata, csvConverter);
    this.initializedTools.set('csv_to_json_converter', csvConverter);

    // Data Quality Checker
    const qualityChecker = new DataQualityChecker();
    const qualityMetadata = dataTransformationToolsMetadata.find(m => m.id === 'data_quality_checker')!;
    await this.toolRegistry.registerTool(qualityMetadata, qualityChecker);
    this.initializedTools.set('data_quality_checker', qualityChecker);

    // Schema Generator
    const schemaGenerator = new SchemaGenerator();
    const schemaMetadata = dataTransformationToolsMetadata.find(m => m.id === 'schema_generator')!;
    await this.toolRegistry.registerTool(schemaMetadata, schemaGenerator);
    this.initializedTools.set('schema_generator', schemaGenerator);

    // Additional transformation tools
    await this.initializeAdvancedTransformationTools();

    console.log('✅ Data transformation tools initialized');
  }

  private async initializeAdvancedTransformationTools(): Promise<void> {
    // JSON to CSV Converter
    const jsonToCsvMetadata = {
      id: 'json_to_csv_converter',
      name: 'JSON to CSV Converter',
      description: 'Convert JSON data to CSV format with customizable field mapping',
      category: 'data_transformation' as any,
      version: '1.0.0',
      author: 'ChimariData Team',
      tags: ['json', 'csv', 'conversion', 'export'],
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array' },
          options: {
            type: 'object',
            properties: {
              delimiter: { type: 'string' },
              includeHeaders: { type: 'boolean' },
              fieldMapping: { type: 'object' }
            }
          }
        },
        required: ['data']
      },
      outputSchema: {
        type: 'object',
        properties: {
          csvContent: { type: 'string' },
          filePath: { type: 'string' },
          recordCount: { type: 'number' }
        }
      },
      configuration: {
        runtime: 'nodejs' as any,
        timeout: 180000,
        memory: 256,
        cpu: 1,
        storage: 512,
        environment: {},
        secrets: [],
        networkAccess: false,
        fileSystemAccess: true,
        databaseAccess: false
      },
      capabilities: [{
        name: 'json_to_csv_conversion',
        description: 'Convert JSON arrays to CSV format',
        inputTypes: ['json'],
        outputTypes: ['csv'],
        complexity: 'low' as any,
        estimatedDuration: 45,
        requiredResources: ['compute'],
        scalability: 'single' as any
      }],
      dependencies: [],
      pricing: {
        model: 'usage_based' as any,
        costPerExecution: 0.001
      },
      permissions: {
        userTypes: ['non_tech', 'business', 'technical', 'consultation'],
        subscriptionTiers: ['trial', 'starter', 'professional', 'enterprise'],
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 400,
          requestsPerDay: 1500
        },
        dataAccessLevel: 'read' as any
      },
      healthCheck: {
        interval: 60000,
        timeout: 5000,
        retryAttempts: 3
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: { cpu: 0, memory: 0, storage: 0 },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as any
    };

    const jsonToCsvHandler = {
      async execute(input: any, context: any) {
        const { data, options = {} } = input;
        const { delimiter = ',', includeHeaders = true, fieldMapping = {} } = options;

        const csvLines: string[] = [];
        
        if (data.length === 0) {
          return {
            executionId: context.executionId,
            toolId: 'json_to_csv_converter',
            status: 'success',
            result: { csvContent: '', recordCount: 0 },
            metrics: { duration: 100, resourcesUsed: { cpu: 1, memory: 10, storage: 0 }, cost: 0 }
          };
        }

        // Get headers
        const firstRecord = data[0];
        const headers = Object.keys(fieldMapping).length > 0 
          ? Object.keys(fieldMapping)
          : Object.keys(firstRecord);

        if (includeHeaders) {
          csvLines.push(headers.join(delimiter));
        }

        // Convert records
        data.forEach((record: any) => {
          const values = headers.map(header => {
            const fieldName = fieldMapping[header] || header;
            const value = record[fieldName] || '';
            return typeof value === 'string' && value.includes(delimiter) 
              ? `"${value.replace(/"/g, '""')}"` 
              : String(value);
          });
          csvLines.push(values.join(delimiter));
        });

        const csvContent = csvLines.join('\n');

        return {
          executionId: context.executionId,
          toolId: 'json_to_csv_converter',
          status: 'success',
          result: {
            csvContent,
            recordCount: data.length,
            headers: includeHeaders ? headers : null
          },
          metrics: {
            duration: 1000,
            resourcesUsed: { cpu: 5, memory: csvContent.length / 1024, storage: 0 },
            cost: (data.length / 1000) * 0.001
          }
        };
      },

      async validate(input: any) {
        const errors: any[] = [];
        if (!input.data || !Array.isArray(input.data)) {
          errors.push({ field: 'data', message: 'Data must be an array', code: 'INVALID_DATA' });
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
      },

      async getStatus() {
        return {
          status: 'active' as any,
          currentExecutions: 0,
          queuedExecutions: 0,
          lastActivity: new Date(),
          healthScore: 100,
          resourceUsage: { cpu: 1.5, memory: 32.0, storage: 5.1 }
        };
      },

      async configure() {},
      async shutdown() {}
    };

    await this.toolRegistry.registerTool(jsonToCsvMetadata, jsonToCsvHandler);
    this.initializedTools.set('json_to_csv_converter', jsonToCsvHandler);

    // Data Deduplicator
    const deduplicatorMetadata = {
      id: 'data_deduplicator',
      name: 'Data Deduplicator',
      description: 'Remove duplicate records from datasets with configurable matching criteria',
      category: 'data_transformation' as any,
      version: '1.0.0',
      author: 'ChimariData Team',
      tags: ['deduplication', 'cleaning', 'uniqueness'],
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array' },
          options: {
            type: 'object',
            properties: {
              keyFields: { type: 'array' },
              strategy: { type: 'string' },
              caseSensitive: { type: 'boolean' }
            }
          }
        },
        required: ['data']
      },
      outputSchema: {
        type: 'object',
        properties: {
          cleanedData: { type: 'array' },
          duplicatesRemoved: { type: 'number' },
          deduplicationReport: { type: 'object' }
        }
      },
      configuration: {
        runtime: 'nodejs' as any,
        timeout: 300000,
        memory: 512,
        cpu: 1,
        storage: 256,
        environment: {},
        secrets: [],
        networkAccess: false,
        fileSystemAccess: false,
        databaseAccess: false
      },
      capabilities: [{
        name: 'data_deduplication',
        description: 'Remove duplicate records based on configurable criteria',
        inputTypes: ['json', 'array'],
        outputTypes: ['cleaned_data', 'deduplication_report'],
        complexity: 'medium' as any,
        estimatedDuration: 120,
        requiredResources: ['compute'],
        scalability: 'parallel' as any
      }],
      dependencies: [],
      pricing: {
        model: 'usage_based' as any,
        costPerExecution: 0.005
      },
      permissions: {
        userTypes: ['business', 'technical', 'consultation'],
        subscriptionTiers: ['starter', 'professional', 'enterprise'],
        rateLimits: {
          requestsPerMinute: 30,
          requestsPerHour: 200,
          requestsPerDay: 800
        },
        dataAccessLevel: 'read' as any
      },
      healthCheck: {
        interval: 60000,
        timeout: 5000,
        retryAttempts: 3
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: { cpu: 0, memory: 0, storage: 0 },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as any
    };

    const deduplicatorHandler = {
      async execute(input: any, context: any) {
        const { data, options = {} } = input;
        const { keyFields = [], strategy = 'first', caseSensitive = true } = options;

        const startTime = Date.now();
        const seen = new Set();
        const cleanedData: any[] = [];
        const duplicates: any[] = [];

        data.forEach((record: any, index: number) => {
          let key: string;
          
          if (keyFields.length > 0) {
            // Use specified key fields
            key = keyFields.map((field: string) => {
              let value = record[field] || '';
              return caseSensitive ? value : String(value).toLowerCase();
            }).join('|');
          } else {
            // Use entire record as key
            key = JSON.stringify(record);
            if (!caseSensitive) {
              key = key.toLowerCase();
            }
          }

          if (!seen.has(key)) {
            seen.add(key);
            cleanedData.push(record);
          } else {
            duplicates.push({ record, originalIndex: index });
          }
        });

        const duration = Date.now() - startTime;

        return {
          executionId: context.executionId,
          toolId: 'data_deduplicator',
          status: 'success',
          result: {
            cleanedData,
            duplicatesRemoved: duplicates.length,
            deduplicationReport: {
              originalCount: data.length,
              uniqueCount: cleanedData.length,
              duplicateCount: duplicates.length,
              deduplicationRate: (duplicates.length / data.length) * 100,
              strategy,
              keyFields: keyFields.length > 0 ? keyFields : 'full_record'
            }
          },
          metrics: {
            duration,
            resourcesUsed: { cpu: 8, memory: data.length * 0.1, storage: 0 },
            cost: (data.length / 5000) * 0.005
          },
          artifacts: [{
            type: 'cleaned_data',
            data: cleanedData,
            metadata: { duplicatesRemoved: duplicates.length }
          }]
        };
      },

      async validate(input: any) {
        const errors: any[] = [];
        if (!input.data || !Array.isArray(input.data)) {
          errors.push({ field: 'data', message: 'Data must be an array', code: 'INVALID_DATA' });
        }
        
        const validStrategies = ['first', 'last', 'merge'];
        if (input.options?.strategy && !validStrategies.includes(input.options.strategy)) {
          errors.push({ 
            field: 'strategy', 
            message: `Strategy must be one of: ${validStrategies.join(', ')}`, 
            code: 'INVALID_STRATEGY' 
          });
        }

        return { isValid: errors.length === 0, errors, warnings: [] };
      },

      async getStatus() {
        return {
          status: 'active' as any,
          currentExecutions: 0,
          queuedExecutions: 0,
          lastActivity: new Date(),
          healthScore: 100,
          resourceUsage: { cpu: 3.2, memory: 78.5, storage: 8.3 }
        };
      },

      async configure() {},
      async shutdown() {}
    };

    await this.toolRegistry.registerTool(deduplicatorMetadata, deduplicatorHandler);
    this.initializedTools.set('data_deduplicator', deduplicatorHandler);
  }

  private async initializeExternalIntegrationTools(): Promise<void> {
    console.log('🔗 Initializing external integration tools...');

    // API Data Fetcher
    const apiDataFetcherMetadata = {
      id: 'api_data_fetcher',
      name: 'API Data Fetcher',
      description: 'Fetch data from external APIs with authentication and rate limiting support',
      category: 'external_integration' as any,
      version: '1.0.0',
      author: 'ChimariData Team',
      tags: ['api', 'integration', 'fetch', 'external_data'],
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string' },
          headers: { type: 'object' },
          params: { type: 'object' },
          auth: { type: 'object' }
        },
        required: ['url']
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'any' },
          status: { type: 'number' },
          headers: { type: 'object' },
          metadata: { type: 'object' }
        }
      },
      configuration: {
        runtime: 'nodejs' as any,
        timeout: 60000,
        memory: 256,
        cpu: 1,
        storage: 100,
        environment: {},
        secrets: ['api_keys'],
        networkAccess: true,
        fileSystemAccess: false,
        databaseAccess: false
      },
      capabilities: [{
        name: 'api_integration',
        description: 'Fetch data from external REST APIs',
        inputTypes: ['url', 'api_config'],
        outputTypes: ['json', 'xml', 'text'],
        complexity: 'medium' as any,
        estimatedDuration: 30,
        requiredResources: ['compute', 'network'],
        scalability: 'parallel' as any
      }],
      dependencies: [{
        type: 'library' as any,
        name: 'axios',
        version: '^1.0.0',
        required: true
      }],
      pricing: {
        model: 'usage_based' as any,
        costPerExecution: 0.002
      },
      permissions: {
        userTypes: ['technical', 'consultation'],
        subscriptionTiers: ['professional', 'enterprise'],
        rateLimits: {
          requestsPerMinute: 20,
          requestsPerHour: 100,
          requestsPerDay: 500
        },
        dataAccessLevel: 'read' as any
      },
      healthCheck: {
        interval: 120000,
        timeout: 10000,
        retryAttempts: 3
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: { cpu: 0, memory: 0, storage: 0 },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as any
    };

    const apiDataFetcherHandler = {
      async execute(input: any, context: any) {
        const { url, method = 'GET', headers = {}, params = {}, auth = {} } = input;
        
        // Simulate API call (in real implementation, use axios or fetch)
        const simulatedResponse = {
          data: {
            message: 'Simulated API response',
            timestamp: new Date().toISOString(),
            requestedUrl: url,
            method
          },
          status: 200,
          headers: { 'content-type': 'application/json' },
          metadata: {
            requestTime: new Date(),
            responseSize: 256
          }
        };

        return {
          executionId: context.executionId,
          toolId: 'api_data_fetcher',
          status: 'success',
          result: simulatedResponse,
          metrics: {
            duration: 2000,
            resourcesUsed: { cpu: 3, memory: 64, storage: 0 },
            cost: 0.002
          },
          artifacts: [{
            type: 'api_response',
            data: simulatedResponse.data,
            metadata: { url, status: simulatedResponse.status }
          }]
        };
      },

      async validate(input: any) {
        const errors: any[] = [];
        if (!input.url) {
          errors.push({ field: 'url', message: 'URL is required', code: 'MISSING_URL' });
        }
        
        try {
          new URL(input.url);
        } catch {
          errors.push({ field: 'url', message: 'Invalid URL format', code: 'INVALID_URL' });
        }

        return { isValid: errors.length === 0, errors, warnings: [] };
      },

      async getStatus() {
        return {
          status: 'active' as any,
          currentExecutions: 0,
          queuedExecutions: 0,
          lastActivity: new Date(),
          healthScore: 100,
          resourceUsage: { cpu: 2.1, memory: 45.3, storage: 3.7 }
        };
      },

      async configure() {},
      async shutdown() {}
    };

    await this.toolRegistry.registerTool(apiDataFetcherMetadata, apiDataFetcherHandler);
    this.initializedTools.set('api_data_fetcher', apiDataFetcherHandler);

    console.log('✅ External integration tools initialized');
  }

  private async initializeBusinessLogicTools(): Promise<void> {
    console.log('💼 Initializing business logic tools...');

    // KPI Calculator
    const kpiCalculatorMetadata = {
      id: 'kpi_calculator',
      name: 'KPI Calculator',
      description: 'Calculate business KPIs and metrics from datasets with customizable formulas',
      category: 'data_analysis' as any,
      version: '1.0.0',
      author: 'ChimariData Team',
      tags: ['kpi', 'metrics', 'business_intelligence', 'calculations'],
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array' },
          kpiDefinitions: { type: 'array' },
          timeFrame: { type: 'object' }
        },
        required: ['data', 'kpiDefinitions']
      },
      outputSchema: {
        type: 'object',
        properties: {
          kpiResults: { type: 'array' },
          summary: { type: 'object' },
          trends: { type: 'array' }
        }
      },
      configuration: {
        runtime: 'nodejs' as any,
        timeout: 300000,
        memory: 512,
        cpu: 2,
        storage: 256,
        environment: {},
        secrets: [],
        networkAccess: false,
        fileSystemAccess: false,
        databaseAccess: false
      },
      capabilities: [{
        name: 'kpi_calculation',
        description: 'Calculate business KPIs and performance metrics',
        inputTypes: ['json', 'business_data'],
        outputTypes: ['kpi_report', 'metrics_dashboard'],
        complexity: 'medium' as any,
        estimatedDuration: 180,
        requiredResources: ['compute'],
        scalability: 'parallel' as any
      }],
      dependencies: [],
      pricing: {
        model: 'usage_based' as any,
        costPerExecution: 0.01
      },
      permissions: {
        userTypes: ['business', 'consultation'],
        subscriptionTiers: ['professional', 'enterprise'],
        rateLimits: {
          requestsPerMinute: 20,
          requestsPerHour: 150,
          requestsPerDay: 600
        },
        dataAccessLevel: 'read' as any
      },
      healthCheck: {
        interval: 60000,
        timeout: 5000,
        retryAttempts: 3
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: { cpu: 0, memory: 0, storage: 0 },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as any
    };

    const kpiCalculatorHandler = {
      async execute(input: any, context: any) {
        const { data, kpiDefinitions, timeFrame = {} } = input;
        
        const kpiResults: any[] = [];
        
        kpiDefinitions.forEach((kpiDef: any) => {
          const result = this.calculateKPI(data, kpiDef, timeFrame);
          kpiResults.push(result);
        });

        const summary = {
          totalKPIs: kpiResults.length,
          dataPoints: data.length,
          timeFrame,
          calculatedAt: new Date()
        };

        return {
          executionId: context.executionId,
          toolId: 'kpi_calculator',
          status: 'success',
          result: {
            kpiResults,
            summary,
            trends: this.calculateTrends(kpiResults)
          },
          metrics: {
            duration: 3000,
            resourcesUsed: { cpu: 15, memory: data.length * 0.2, storage: 0 },
            cost: (kpiDefinitions.length * 0.002) + (data.length / 10000) * 0.01
          },
          artifacts: [{
            type: 'kpi_report',
            data: kpiResults,
            metadata: { timeFrame, totalKPIs: kpiResults.length }
          }]
        };
      },

      calculateKPI(data: any[], kpiDef: any, timeFrame: any) {
        // Simplified KPI calculation
        const { name, formula, aggregation = 'sum', field } = kpiDef;
        
        let value = 0;
        const relevantData = data.filter(record => {
          // Apply time frame filtering if specified
          if (timeFrame.start || timeFrame.end) {
            const recordDate = new Date(record.date || record.timestamp || Date.now());
            if (timeFrame.start && recordDate < new Date(timeFrame.start)) return false;
            if (timeFrame.end && recordDate > new Date(timeFrame.end)) return false;
          }
          return true;
        });

        switch (aggregation) {
          case 'sum':
            value = relevantData.reduce((sum, record) => sum + (Number(record[field]) || 0), 0);
            break;
          case 'average':
            value = relevantData.reduce((sum, record) => sum + (Number(record[field]) || 0), 0) / relevantData.length;
            break;
          case 'count':
            value = relevantData.length;
            break;
          case 'max':
            value = Math.max(...relevantData.map(record => Number(record[field]) || 0));
            break;
          case 'min':
            value = Math.min(...relevantData.map(record => Number(record[field]) || 0));
            break;
        }

        return {
          name,
          value: Math.round(value * 100) / 100,
          aggregation,
          field,
          dataPoints: relevantData.length,
          calculatedAt: new Date()
        };
      },

      calculateTrends(kpiResults: any[]) {
        // Simplified trend calculation
        return kpiResults.map(kpi => ({
          kpiName: kpi.name,
          trend: 'stable', // In real implementation, compare with historical data
          changePercent: 0,
          direction: 'neutral'
        }));
      },

      async validate(input: any) {
        const errors: any[] = [];
        if (!input.data || !Array.isArray(input.data)) {
          errors.push({ field: 'data', message: 'Data must be an array', code: 'INVALID_DATA' });
        }
        if (!input.kpiDefinitions || !Array.isArray(input.kpiDefinitions)) {
          errors.push({ field: 'kpiDefinitions', message: 'KPI definitions must be an array', code: 'INVALID_KPI_DEFINITIONS' });
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
      },

      async getStatus() {
        return {
          status: 'active' as any,
          currentExecutions: 0,
          queuedExecutions: 0,
          lastActivity: new Date(),
          healthScore: 100,
          resourceUsage: { cpu: 6.8, memory: 156.2, storage: 18.9 }
        };
      },

      async configure() {},
      async shutdown() {}
    };

    await this.toolRegistry.registerTool(kpiCalculatorMetadata, kpiCalculatorHandler);
    this.initializedTools.set('kpi_calculator', kpiCalculatorHandler);

    console.log('✅ Business logic tools initialized');
  }

  private async setupToolRelationships(): Promise<void> {
    console.log('🔗 Setting up tool relationships and workflows...');

    // Tools can suggest other tools in their execution results
    // This is already implemented in the nextSuggestedTools field

    // Set up tool categories for easy discovery
    const toolCategories = {
      'data_import': ['api_data_fetcher', 'csv_to_json_converter'],
      'data_quality': ['data_quality_checker', 'data_deduplicator'],
      'data_transformation': ['csv_to_json_converter', 'json_to_csv_converter', 'schema_generator'],
      'data_analysis': ['kpi_calculator'],
      'data_export': ['json_to_csv_converter']
    };

    console.log(`✅ Configured tool relationships across ${Object.keys(toolCategories).length} categories`);
  }

  /**
   * Get the tool registry instance
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get all initialized tools
   */
  getInitializedTools(): Map<string, any> {
    return this.initializedTools;
  }

  /**
   * Search tools by category or capabilities
   */
  async searchTools(query: any): Promise<any> {
    return await this.toolRegistry.searchTools(query);
  }

  /**
   * Execute a tool by ID
   */
  async executeTool(toolId: string, input: any, context: any): Promise<any> {
    return await this.toolRegistry.executeTool(toolId, input, context);
  }

  /**
   * Get system metrics and status
   */
  async getSystemStatus(): Promise<any> {
    const systemMetrics = await this.toolRegistry.getSystemMetrics();
    const allTools = this.toolRegistry.getAllTools();
    
    const toolsByCategory = allTools.reduce((acc, tool) => {
      acc[tool.category] = (acc[tool.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      ...systemMetrics,
      toolsByCategory,
      totalCategories: Object.keys(toolsByCategory).length,
      averageToolHealth: allTools.length > 0 ? 
        allTools.reduce((sum, tool) => sum + (tool.metrics?.uptime || 100), 0) / allTools.length : 100
    };
  }

  /**
   * Demonstrate dynamic tool registration
   */
  async demonstrateDynamicToolRegistration(): Promise<void> {
    console.log('🎯 Demonstrating dynamic tool registration...');

    // Example: Register a custom business logic tool at runtime
    const customToolMetadata = {
      id: 'custom_profit_analyzer',
      name: 'Custom Profit Analyzer',
      description: 'Analyze profit margins and financial performance metrics',
      category: 'custom_business_logic' as any,
      version: '0.1.0',
      author: 'Custom User',
      tags: ['profit', 'financial', 'custom', 'analysis'],
      inputSchema: {
        type: 'object',
        properties: {
          salesData: { type: 'array' },
          costData: { type: 'array' },
          timeFrame: { type: 'string' }
        },
        required: ['salesData', 'costData']
      },
      outputSchema: {
        type: 'object',
        properties: {
          profitMargin: { type: 'number' },
          totalProfit: { type: 'number' },
          profitTrend: { type: 'string' }
        }
      },
      configuration: {
        runtime: 'nodejs' as any,
        timeout: 120000,
        memory: 256,
        cpu: 1,
        storage: 100,
        environment: {},
        secrets: [],
        networkAccess: false,
        fileSystemAccess: false,
        databaseAccess: false
      },
      capabilities: [{
        name: 'profit_analysis',
        description: 'Analyze financial profit metrics',
        inputTypes: ['financial_data'],
        outputTypes: ['profit_report'],
        complexity: 'medium' as any,
        estimatedDuration: 90,
        requiredResources: ['compute'],
        scalability: 'single' as any
      }],
      dependencies: [],
      pricing: {
        model: 'free' as any
      },
      permissions: {
        userTypes: ['business', 'consultation'],
        subscriptionTiers: ['trial', 'starter', 'professional', 'enterprise'],
        rateLimits: {
          requestsPerMinute: 10,
          requestsPerHour: 50,
          requestsPerDay: 200
        },
        dataAccessLevel: 'read' as any
      },
      healthCheck: {
        interval: 60000,
        timeout: 5000,
        retryAttempts: 3
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: { cpu: 0, memory: 0, storage: 0 },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as any
    };

    const customToolHandler = {
      async execute(input: any, context: any) {
        const { salesData, costData, timeFrame } = input;
        
        // Simple profit calculation
        const totalSales = salesData.reduce((sum: number, sale: any) => sum + (sale.amount || 0), 0);
        const totalCosts = costData.reduce((sum: number, cost: any) => sum + (cost.amount || 0), 0);
        const totalProfit = totalSales - totalCosts;
        const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

        return {
          executionId: context.executionId,
          toolId: 'custom_profit_analyzer',
          status: 'success',
          result: {
            totalProfit: Math.round(totalProfit * 100) / 100,
            profitMargin: Math.round(profitMargin * 100) / 100,
            profitTrend: profitMargin > 20 ? 'excellent' : profitMargin > 10 ? 'good' : 'needs_improvement',
            analysis: {
              totalSales,
              totalCosts,
              salesCount: salesData.length,
              costCount: costData.length
            }
          },
          metrics: {
            duration: 1500,
            resourcesUsed: { cpu: 3, memory: 32, storage: 0 },
            cost: 0
          }
        };
      },

      async validate(input: any) {
        const errors: any[] = [];
        if (!input.salesData || !Array.isArray(input.salesData)) {
          errors.push({ field: 'salesData', message: 'Sales data must be an array', code: 'INVALID_SALES_DATA' });
        }
        if (!input.costData || !Array.isArray(input.costData)) {
          errors.push({ field: 'costData', message: 'Cost data must be an array', code: 'INVALID_COST_DATA' });
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
      },

      async getStatus() {
        return {
          status: 'active' as any,
          currentExecutions: 0,
          queuedExecutions: 0,
          lastActivity: new Date(),
          healthScore: 100,
          resourceUsage: { cpu: 1.0, memory: 16.0, storage: 2.1 }
        };
      },

      async configure() {},
      async shutdown() { console.log('Custom profit analyzer shutdown'); }
    };

    await this.toolRegistry.registerTool(customToolMetadata, customToolHandler);
    console.log('✅ Custom tool registered dynamically');

    // Wait a moment then deregister to demonstrate the capability
    setTimeout(async () => {
      await this.toolRegistry.deregisterTool('custom_profit_analyzer');
      console.log('✅ Custom tool deregistered');
    }, 5000);
  }

  /**
   * Shutdown all tools gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down tool ecosystem...');
    
    for (const [toolId, tool] of this.initializedTools) {
      try {
        await tool.shutdown?.();
        console.log(`✅ ${toolId} shutdown completed`);
      } catch (error) {
        console.error(`❌ Error shutting down ${toolId}:`, error);
      }
    }

    await this.toolRegistry.shutdown();
    console.log('🏁 Tool ecosystem shutdown completed');
  }
}

// Export singleton instance
export const toolSystem = new ToolInitializationService();
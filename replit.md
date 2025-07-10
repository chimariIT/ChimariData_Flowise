# ChimariData.com - Progressive Data Analytics Platform

## Project Overview
A streamlined data processing platform with four progressive paid paths: 1) Data Transformation, 2) Data Analysis, 3) Data Visualizations, and 4) AI Insights. Includes a free trial allowing 10MB uploads with descriptive analysis and visualizations without signup. Implements progressive pricing with discounts for using multiple features.

## Four Progressive Paths
1. **Data Transformation** - Clean, filter, and reshape data using Python (polars/pandas)
2. **Data Analysis** - Statistical analysis using Python stats libraries
3. **Data Visualizations** - Charts and graphs using matplotlib/plotly
4. **AI Insights** - Intelligent interpretation using Chimaridata AI stack

## Free Trial Features
- 10MB upload limit, no signup required
- Data schema detection and preview
- Basic descriptive analysis
- Simple visualizations

## AI Hierarchy (Chimaridata Stack)
- **Primary**: Gemini API
- **Fallback**: OpenAI → Anthropic → Ollama
- **Option**: Users can configure custom API keys

## Pricing Structure
- Progressive pricing model with discounts for multiple features
- Integration with Chimaridata Stripe accounts
- Set pricing tiers for each of the four paths

## Technical Architecture
- **Frontend**: React with TypeScript, comprehensive data workflow interface
- **Backend**: Express.js with Python integration for data processing
- **Storage**: In-memory storage with project management
- **Data Processing**: Python libraries (polars, pandas, matplotlib, stats)
- **AI Integration**: Multi-provider AI system with intelligent fallback
- **Payment**: Stripe integration with progressive pricing

## Recent Changes
- **ADVANCED ANALYTICS CAPABILITIES**: Comprehensive upgrade to enterprise-level data analytics (January 8, 2025)
- **PII Analysis & Consent System**: Automated detection of personally identifiable information with user consent workflow - IMPLEMENTED
- **Multi-Source Data Integration**: Google Drive and API integration for seamless data access - IMPLEMENTED
- **Advanced Data Transformation**: Multi-file joins, outlier detection, missing data analysis, and normality testing - IMPLEMENTED
- **Step-by-Step Guided Analysis**: User-defined analysis questions with ANOVA, ANCOVA, MANOVA, MANCOVA, Regression, and ML - IMPLEMENTED
- **MCP AI Engine**: Multi-provider AI system with user-defined roles and actions for comprehensive data insights - IMPLEMENTED
- **Enhanced Security**: PII detection, unique identifier selection, and data privacy compliance features - IMPLEMENTED
- **Enterprise-Grade Python Scripts**: Advanced statistical analysis capabilities with scipy and scikit-learn integration - IMPLEMENTED
- **CURRENT FIXES (January 8, 2025)**: 
  - Fixed PII detection integration in upload workflow
  - Added comprehensive Advanced Analysis modal with ANOVA, ANCOVA, MANOVA, MANCOVA, Regression, ML capabilities
  - Implemented Google Drive import functionality
  - Created PII consent dialog with anonymization options
  - **NEW: Interactive Data Anonymization Toolkit** - Comprehensive anonymization system with 8 different techniques:
    * Masking: Partial and full masking with asterisks
    * Substitution: Fake data generation and random character replacement
    * Encryption: AES-256 encryption (reversible) and SHA-256 hashing
    * Generalization: Date and numeric range generalization
    * Real-time preview with sample data transformation
    * Integrated into both PII detection workflow and data analysis interface
  - **NEW: Complete PII Workflow Implementation** (January 9, 2025):
    * Unified PII dialog across all upload paths (home page, dashboard, free trial)
    * Enhanced backend PII decision processing with proper anonymization
    * Added trial-specific PII decision endpoint
    * Implemented three-option PII handling: include (with warning), exclude (remove columns), anonymize (smart replacement)
    * Added comprehensive PII data processing for both paid and trial uploads
  - **CRITICAL SECURITY & WORKFLOW FIXES (January 10, 2025)**:
    * ✅ COMPLETED: Fixed cryptographic vulnerability by replacing deprecated createCipher with secure createCipheriv
    * ✅ COMPLETED: Resolved PII workflow divergence between trial and full upload paths
    * ✅ COMPLETED: Fixed Python processing JSON output issue (NaN values breaking trial analysis)
    * ✅ COMPLETED: Unified upload workflows while maintaining 10MB trial limit and payment requirements
    * ✅ COMPLETED: Added improved error handling and temporary data storage for trial PII decisions
    * ✅ COMPLETED: All PII decision paths (include, exclude, anonymize) now working correctly for both trial and full uploads
    * ✅ COMPLETED: Fixed middleware conflicts and syntax errors in unified PII decision endpoints
    * ✅ VERIFIED: Comprehensive testing shows both trial and full upload workflows functioning perfectly
    * ✅ COMPLETED: Fixed PII anonymization workflow issues (January 10, 2025):
      - Fixed free trial blank page issue after advanced anonymization setup
      - Fixed full feature not implementing anonymization configurations
      - Updated schema to show anonymized sample values instead of original PII data
      - Both trial and full workflows now properly display anonymized data in frontend
      - Fixed schema update logic to properly handle all three PII decision types: include, exclude, anonymize
      - Implemented proper anonymization configuration processing for both basic and advanced anonymization methods
    * ✅ COMPLETED: Frontend Component Wiring to Consolidated PII Module (January 10, 2025):
      - Unified all upload workflows to use PIIInterimDialog instead of multiple different components
      - Fixed MultiSourceUpload.tsx to use modern PII API (decision, anonymizationConfig) instead of legacy API
      - Added 30-second timeouts to all PII decision requests to prevent 504 errors during long anonymization operations
      - All frontend components (free-trial-uploader, upload-modal, MultiSourceUpload) now properly wired to consolidated PII module
      - Verified with comprehensive testing: all workflows successfully detect PII and return tempFileId for unified processing
    * ✅ COMPLETED: Unified Anonymization Module Implementation (January 10, 2025):
      - Created UnifiedPIIProcessor module that consolidates all PII decision logic (include, exclude, anonymize)
      - Eliminated code duplication across trial and full upload endpoints by using single anonymization module
      - Enhanced schema consistency: exclude removes PII columns, anonymize updates sample values with anonymized data
      - Implemented comprehensive logging and processing summaries for better transparency
      - All three PII decisions (include, exclude, anonymize) now consistently reflect user choices in schema, data verification, and column counts
      - Verified with testing: exclude reduces column count correctly, anonymize preserves structure with anonymized sample values

## User Preferences
- Wants four distinct progressive paths with set pricing
- Values Python-based data processing over complex authentication
- Prioritizes reliable data upload and multi-format support
- Prefers progressive pricing with discounts for multiple features
- Focuses on practical data insights and visualizations
- Wants Chimaridata AI integration with fallback options
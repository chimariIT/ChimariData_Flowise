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

## User Preferences
- Wants four distinct progressive paths with set pricing
- Values Python-based data processing over complex authentication
- Prioritizes reliable data upload and multi-format support
- Prefers progressive pricing with discounts for multiple features
- Focuses on practical data insights and visualizations
- Wants Chimaridata AI integration with fallback options
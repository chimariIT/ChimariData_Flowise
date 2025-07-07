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
- **ENHANCED DATA PROCESSING SYSTEM**: Major improvements to data handling and analysis (January 7, 2025)
- **Smart Header Detection**: Automatically detects header rows in datasets with title rows or metadata
- **Multivariate Analysis**: Enhanced Python analyzer with correlation analysis, group statistics, and variable recommendations
- **Payment Processing Integration**: Stripe payment system with upgrade modal for free trial users
- **Progressive Pricing**: Discounts for multiple features (15% for 2, 25% for 3, 35% for all 4)
- Implemented comprehensive file processing with intelligent data parsing
- Added scipy dependency for advanced statistical analysis capabilities

## User Preferences
- Wants four distinct progressive paths with set pricing
- Values Python-based data processing over complex authentication
- Prioritizes reliable data upload and multi-format support
- Prefers progressive pricing with discounts for multiple features
- Focuses on practical data insights and visualizations
- Wants Chimaridata AI integration with fallback options
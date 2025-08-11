# ChimariData.com - Progressive Data Analytics Platform

## Overview
ChimariData.com is a progressive data analytics platform offering four distinct paid paths: Data Transformation, Data Analysis, Data Visualizations, and AI Insights. It provides a free trial with basic descriptive analysis and visualizations for uploads up to 10MB, without requiring signup. The platform aims to deliver practical data insights, combining traditional analytics with advanced AI capabilities, and offers progressive pricing with discounts for multi-feature usage.

## User Preferences
- Wants four distinct progressive paths with set pricing
- Values Python-based data processing over complex authentication
- Prioritizes reliable data upload and multi-format support
- Prefers progressive pricing with discounts for multiple features
- Focuses on practical data insights and visualizations
- Wants Chimaridata AI integration with fallback options
- Requires all analysis features to have field configurations, view results, save to project, and export capabilities
- Prefers cloud data import in upload section rather than analysis section
- Expects transformations to include view transformed data, save to project, and export functionality

## System Architecture
The platform is built with a React TypeScript frontend for a comprehensive data workflow interface and an Express.js backend with Python integration for data processing. Core architectural decisions include:
- **UI/UX:** Focus on a streamlined workflow with a 5-tab layout (Overview, Schema, Transform, Analysis, AI Insights) and professional chart rendering (matplotlib/plotly) with dynamic labeling and enhanced visualization options. A clean grid layout for visualization options is implemented.
- **Technical Implementations:**
    - **Data Processing:** Utilizes Python libraries such as Polars, Pandas for transformation with view/save/export capabilities, statistical libraries (scipy, scikit-learn) for analysis, and Matplotlib/Plotly for visualizations with field configuration and export functionality.
    - **Visualization System:** Comprehensive visualization workshop with 8 chart types (bar, line, scatter, pie, histogram, boxplot, heatmap, violin) using pandas, matplotlib, seaborn, and plotly. Interactive field selection with aggregation options, real-time preview capabilities, on-screen viewing, save to project, and export functionality. Dedicated visualization workflow accessible via `/visualization/:projectId` route.
    - **AI Integration:** A multi-provider AI system (Chimaridata Stack) with Gemini API as primary and OpenAI, Anthropic, Ollama as fallbacks. Users can configure custom API keys.
    - **Storage:** Implements a hybrid storage system combining in-memory speed with PostgreSQL persistence, using a write-behind caching pattern for optimal performance and data recovery. Projects and user data are persistently stored.
    - **Security & PII:** Automated PII detection with a user consent workflow, offering options to include, exclude, or anonymize data using various techniques (masking, substitution, encryption, generalization). User-specific project authentication ensures data isolation.
    - **Authentication:** A unified registration-first system with email verification, supporting token-based authentication and handling local and OAuth providers. All users must create accounts to access the platform, with feature access differentiated by subscription status (free vs paid) rather than authentication status.
    - **Payment:** Integrated with Stripe for progressive pricing, handling payment completion and project creation.
    - **Advanced Analytics:** Comprehensive analytics modal offering statistical (ANOVA, ANCOVA, MANOVA, MANCOVA, Regression), machine learning (classification, regression, clustering, feature importance), and agentic analysis (business insights, comparative analysis, predictive insights, root cause analysis) capabilities. Features dynamic parameter configuration based on selected algorithms and supports multiple variable selection.
    - **Time Series Analysis:** Advanced forecasting capabilities with Prophet integration, trend analysis, seasonal decomposition, and confidence intervals for temporal data patterns.
    - **Cloud Data Connectors:** Support for AWS S3, Azure Blob Storage, and Google Cloud Storage integration for seamless data import from cloud platforms.

## External Dependencies
- **AI/ML:** Gemini API, OpenAI, Anthropic, Ollama
- **Payment Processing:** Stripe
- **Email Service:** SendGrid
- **Database:** PostgreSQL
- **Cloud Storage Integration:** AWS S3, Azure Blob Storage, Google Cloud Storage
- **Time Series:** Prophet forecasting library (Python)
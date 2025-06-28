# ChimariData.com - Data Analytics Platform

## Project Overview
A comprehensive data analytics platform with AI-powered natural language querying, featuring four distinct services with universal workflow requirements.

## Services Architecture

### Four Core Services
1. **Pay-per-Analysis** ($25+) - One-time analysis with instant payment
2. **Expert Consulting** ($150+) - Professional data science consultation
3. **Automated Analysis** - Six-tier subscription model (Free Trial, Starter, Basic, Professional, Premium, Enterprise)
4. **Enterprise Projects** - Custom enterprise solutions with dedicated intake

### Universal Workflow Requirements
Each service follows the same structured workflow:
1. **Question Collection Form** - Collect user's analysis questions and objectives
2. **Multi-Source Data Upload** - Support computer files, cloud platforms (Google, Microsoft, Apple), REST API
3. **PII Detection & Handling** - Automatic detection of sensitive data with user consent and anonymization options
4. **Malware Scanning** - Security scan before schema definition
5. **Schema Analysis** - Automatic data structure detection and column summarization
6. **Analysis Execution** - Service-specific processing and results

## Recent Changes
- Fixed pricing comparison tables to include Free Trial tier across all service pages
- Updated landing page terminology from "Three-Tier" to "Tiered Pricing Model"
- Implemented comprehensive service workflow requirements
- Added universal question collection and multi-source upload capability
- Removed "Meet Our Experts" section from Expert Consultation page per user request
- Created FreeTrialWorkflow component allowing users to access full workflow without authentication
- Added "Try Free - No Sign-up" button to landing page for immediate access to free trial workflow
- Implemented comprehensive PII detection system for all workflows
- Added PIIDetector service to identify SSN, addresses, names, emails, and phone numbers
- Created PIIDetectionDialog for user consent and anonymization options
- Integrated anonymization with lookup table generation for data translation
- Fixed React hooks errors in FreeTrialWorkflow by eliminating duplicate function declarations
- Replaced mock PII detection with real backend API integration in MultiSourceUpload component
- Added PII detection to trial upload endpoint for consistent behavior across all upload flows
- Fixed all component prop interface mismatches for consistent onComplete usage
- Resolved PII anonymization backend errors for mixed data types
- Updated free trial file size limit to 10MB
- Completed end-to-end PII detection and anonymization workflow - December 24, 2024
- Enhanced analysis results page with detailed, contextual results based on analysis type and user questions
- Added comprehensive data quality assessment, visualization previews, and targeted recommendations
- Implemented dynamic result generation that adapts to descriptive, predictive, or diagnostic analysis types - December 28, 2024
- Created comprehensive paid service results pages with detailed insights, interactive visualizations, and next-step recommendations
- Implemented OAuth authentication supporting email/password, Google, Microsoft, and Apple sign-in options
- Enhanced user schema with provider tracking and password hashing for secure authentication - December 28, 2024

## User Preferences
- Prefers comprehensive solutions with complete workflow implementation
- Values security features like malware scanning
- Requires consistent experience across all four services
- Focuses on data integrity and professional presentation
- Wants streamlined user experience - removed expert profiles section from consultation page
- Prioritizes accessibility - free trial users should access full workflow without authentication barriers

## Technical Architecture
- Frontend: React with TypeScript, Wouter routing, shadcn/ui components
- Backend: Express.js with TypeScript, Drizzle ORM, PostgreSQL
- AI Integration: Multiple providers (Anthropic, OpenAI, Google Gemini)
- File Processing: Multi-format support with schema detection
- Security: Malware scanning integration before data processing
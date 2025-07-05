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
- **Updated AI Analysis System (July 2025)** - Implemented multi-provider AI system using Gemini, Anthropic, and OpenAI APIs with intelligent fallback mechanisms for enhanced reliability and accuracy in data question analysis
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
- Implemented comprehensive error handling system with user-friendly error messages and recovery actions
- Added ErrorHandler class for consistent error processing and user message formatting
- Created ErrorDisplay component with actionable error messages and retry functionality
- Enhanced API error handling with proper HTTP status codes and structured error responses - December 28, 2024
- Implemented intelligent local analysis using Python pandas and numpy for data-specific question answering
- Added pandas-analyzer.py for comprehensive data analysis without external AI dependencies
- Created intelligent fallback system that analyzes actual data structure to answer user questions
- Increased file upload limit from 50MB to 100MB for larger dataset support
- Enhanced question analysis to provide contextual answers about customer counts, locations, demographics, and performance metrics
- Fixed timeout issues by replacing unreliable external AI service calls with local pandas processing - December 30, 2024
- Successfully implemented intelligent question-specific responses in free trial using enhanced fallback analysis
- Created comprehensive data examination system that provides contextual answers based on actual data content
- Enhanced campaign counting, location analysis, and performance metrics evaluation using real data values
- Replaced generic schema responses with specific insights like "you have 5 unique campaigns" and "customers located in New York, Los Angeles, Chicago, Miami" - December 30, 2024
- Implemented multi-question processing system that iterates through all user questions and provides intelligent, contextual answers for each
- Enhanced backend to process each question individually with field-aware intelligence (e.g., address fields for location questions)
- Updated frontend to display multiple question-answer pairs in organized, visually distinct sections
- System now handles complex scenarios like "where do customers live" by analyzing address/location fields automatically - December 30, 2024
- Implemented intelligent question semantic analysis using AI-powered preprocessing to understand user intent before data processing
- Added QuestionAnalyzer service that detects semantic mismatches (e.g., asking about "employees" when data contains "customers")
- System now provides clear feedback when questions don't match dataset content: "I couldn't find data about 'employees' in this dataset"
- Enhanced upload-trial route with semantic validation that prevents incorrect responses about unrelated entities - January 1, 2025
- Fixed signed-in upload workflow PII processing by integrating PIIDetectionDialog into upload-modal.tsx component
- Resolved authentication token inconsistency between apiClient and queryClient to fix dashboard button access
- Completed end-to-end PII detection workflow for both free trial and signed-in user uploads - January 1, 2025
- Fixed Google OAuth configuration to use correct Replit domain instead of localhost for callback URLs
- Resolved OAuth provider setup issues by correcting import paths and function names in authentication system
- Enhanced payment system with fallback pricing calculations and improved error handling for authentication failures
- Fixed OAuth routing domain detection logic to properly handle Replit domains without localhost fallback
- Completed end-to-end OAuth routing fix ensuring consistent domain usage across all authentication flows - January 5, 2025
- Major database schema update: Added sessions table for Replit Auth support and updated users table to use string IDs
- Implemented dual authentication system supporting both Google OAuth and Replit Auth with backward compatibility
- Updated storage interface to support both string-based (Replit) and integer-based (legacy) user IDs
- Enhanced MemStorage implementation with upsertUser method for seamless Replit Auth integration - January 5, 2025
- Completed authentication system simplification: removed dual authentication in favor of single Replit Auth implementation
- Systematically replaced old session-based authentication patterns with Replit Auth's isAuthenticated middleware
- Created getUserId() helper function for consistent user ID access patterns throughout the codebase
- Removed legacy authentication routes, session storage, and OAuth provider implementations - January 5, 2025
- Implemented modular OAuth provider system with Google authentication as primary provider
- Created server/oauth-providers.ts with extensible provider architecture for easy addition of Microsoft and Apple OAuth
- Developed dynamic frontend oauth-providers.tsx component that automatically displays all enabled providers
- Added comprehensive ADD_OAUTH_PROVIDERS.md documentation for future provider integration
- System designed for seamless provider addition: just add credentials and uncomment provider configurations - January 5, 2025
- Fixed critical email registration system that was broken due to OAuth conversion
- Implemented robust password constraints: minimum 8 characters with at least one letter and one capital letter
- Added comprehensive email verification system with secure token-based verification
- Created dual authentication system supporting both email registration and OAuth (Google) authentication
- Enhanced password security with bcrypt hashing and proper validation - January 5, 2025

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
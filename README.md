# ChimariData Platform

A comprehensive data science platform with AI-guided analysis journeys for non-tech, business, and technical users.

> **Note**: This repository now uses the **Python FastAPI backend** as the primary backend. The Node.js Express backend is legacy and should only be used for rollback scenarios. See [PYTHON_BACKEND_STARTUP.md](PYTHON_BACKEND_STARTUP.md) for complete setup instructions.

## 🚀 Quick Start

### Prerequisites
- **Python Backend**: Python 3.11+ (separate repository: `chimaridata-python-backend`)
- Node.js 18+ (frontend only)
- PostgreSQL database with pgvector extension
- Environment variables (see `.env.example`)

### Installation

```bash
# Install frontend dependencies
npm install

# Copy environment template
cp .env.example .env.development

# Update .env with your configuration
# (See Environment Variables section below)
```

### Starting the Application

**Option 1: Python Backend (Recommended)**

```bash
# Terminal 1: Start Python Backend
cd chimaridata-python-backend
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start Frontend
cd chimariapp2/ChimariData_Flowise-chimaridataApp2
npm run dev:frontend

# Visit http://localhost:5173
```

**Option 2: Node.js Backend (Legacy/Rollback Only)**

```bash
# Start both Node.js backend and frontend
npm run dev

# Visit http://localhost:5173
```

### Deployment

```bash
# Build for production
npm run build

# Start production server (if using Node.js backend)
npm run start
```

## 🌟 Features

### Analysis Journeys
- **Non-Tech Users**: Guided workflow with AI assistance
- **Business Users**: Advanced analytics with business insights
- **Technical Users**: Full data science toolkit with code generation

### Core Capabilities
- 📊 **Data Upload**: CSV, Excel, Google Drive, Cloud Storage
- 🔍 **PII Detection**: Automatic sensitive data identification
- 🛠️ **Data Transformation**: Filter, clean, aggregate, join datasets
- 📈 **Visualizations**: 8 chart types with field configuration
- 🤖 **AI Analysis**: Multi-provider AI insights (Gemini, OpenAI, Anthropic)
- 📋 **Time Series**: Prophet forecasting and trend analysis
- 📄 **Export**: PDF reports, CSV downloads, chart exports

### AI Services
- Google Gemini (default)
- OpenAI GPT models
- Anthropic Claude
- Multi-provider switching based on subscription

## 📋 Environment Variables

Create `.env` file with these variables:

```bash
# Required
DATABASE_URL="postgresql://..."
GOOGLE_AI_API_KEY="your_key"

# Optional but recommended
STRIPE_SECRET_KEY="sk_..."
VITE_STRIPE_PUBLIC_KEY="pk_..."
SENDGRID_API_KEY="SG..."

# Cloud Storage (optional)
AWS_ACCESS_KEY_ID="..."
AZURE_STORAGE_ACCOUNT_NAME="..."
GOOGLE_CLOUD_PROJECT_ID="..."

# OAuth (optional)
GOOGLE_CLIENT_ID="..."
GITHUB_CLIENT_ID="..."
```

## 🏗️ Architecture

### Backend (Primary: Python FastAPI)
- **Repository**: `chimaridata-python-backend` (separate)
- **Framework**: FastAPI + LangGraph agents
- **ORM**: SQLAlchemy (async) with PostgreSQL + pgvector
- **Port**: 8000
- **API Docs**: http://localhost:8000/docs (Swagger UI)

### Frontend
- React 18 with TypeScript
- Vite dev server (port 5173)
- Tailwind CSS + Radix UI
- React Query for state management
- Wouter for routing

### Backend (Legacy: Node.js Express)
- Express.js with TypeScript
- Drizzle ORM + PostgreSQL
- Port 5000
- **Use Case**: Emergency rollback only

### Key Services
- **Agent Orchestrator**: LangGraph-based multi-agent system (Python)
- **Semantic Matching**: Vector embeddings with pgvector (Python)
- **Analysis Execution**: Native Python subprocess (Python)
- **Transformation Engine**: Data manipulation pipeline (Python)
- **Billing & RBAC**: Stripe integration, role-based access (Python)

## 🧪 Testing

```bash
# Run Playwright tests
npm run test

# Run with UI
npm run test:ui

# Debug mode
npm run test:debug
```

## 📊 User Workflows

### 1. Data Preparation Journey
1. Upload data (file/cloud)
2. PII detection and anonymization
3. Schema analysis and validation
4. Journey type selection

### 2. Analysis Journey  
1. Data transformation
2. Visualization creation
3. Statistical analysis
4. AI-powered insights

### 3. Results & Export
1. Interactive dashboards
2. PDF report generation
3. Data downloads
4. Sharing capabilities

## 🔒 Security Features

- PII detection and anonymization
- File upload validation
- SQL injection prevention
- CSRF protection
- Rate limiting
- Secure session management

## 📈 Subscription Tiers

### Starter (Free)
- 50 AI queries/month
- Basic visualizations
- CSV/Excel upload
- Community support

### Professional ($29/month)
- 500 AI queries/month
- Advanced analysis
- Cloud storage integration
- Priority support
- Custom AI providers

### Enterprise (Custom)
- Unlimited usage
- White-label options
- Dedicated support
- Custom integrations

## 🔧 Development

### Project Structure
```
├── client/                    # React frontend (Vite)
├── server/                    # Legacy Node.js backend (Express)
├── shared/                    # Shared types and schemas
├── migrations/                # Database migrations (Drizzle)
├── python/                    # Legacy Python scripts for Node.js backend
└── uploads/                   # File upload directory

# Separate Repository
└── chimaridata-python-backend/  # Primary Python backend (FastAPI)
```

### Development Commands
```bash
npm run dev:frontend      # Frontend only (for Python backend)
npm run dev                # Full stack (Node.js backend - legacy)
npm run build              # Production build
npm run check              # TypeScript check
npm run test               # Run E2E tests
npm run db:push            # Push schema changes to DB
```

### Documentation
- `CLAUDE.md` - Complete development guide
- `PYTHON_BACKEND_STARTUP.md` - Python backend setup
- `docs/` - Architecture and API documentation

## 🚀 Deployment Options

### Replit Deployments (Recommended)
1. Connect GitHub repository
2. Configure environment variables
3. Deploy with auto-scaling

### Manual Deployment
1. Build: `npm run build`
2. Start: `npm run start`
3. Configure reverse proxy (Nginx)
4. Set up SSL certificate

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📞 Support

- Documentation: `/docs`
- GitHub Issues: Report bugs and feature requests
- Email: support@chimaridata.com

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for the data science community.
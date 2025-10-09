# ChimariData Platform

A comprehensive data science platform with AI-guided analysis journeys for non-tech, business, and technical users.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (or Neon/Supabase)
- Environment variables (see `.env.example`)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Update .env with your configuration
# (See Environment Variables section below)

# Start development server
npm run dev

# Visit http://localhost:3000
```

### Deployment

```bash
# Build for production
npm run build

# Start production server
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

### Frontend (`client/`)
- React 18 with TypeScript
- Tailwind CSS + Radix UI
- React Query for state management
- Wouter for routing

### Backend (`server/`)
- Express.js with TypeScript
- Drizzle ORM + PostgreSQL
- WebSocket for real-time updates
- Multi-provider AI integration

### Key Services
- **FileProcessor**: CSV/Excel parsing and schema detection
- **PythonProcessor**: Statistical analysis and ML
- **AIService**: Multi-provider AI integration
- **DataTransformer**: Data manipulation pipeline
- **PricingService**: Subscription and usage tracking

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
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
├── python/          # Python analysis scripts
└── uploads/         # File upload directory
```

### Adding New Features
1. Define schema in `shared/schema.ts`
2. Create backend service in `server/`
3. Add frontend components in `client/src/`
4. Update API routes in `server/routes.ts`

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
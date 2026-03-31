# Chimaridata Python Backend

**Data Science-as-a-Service platform with LangChain orchestration**

**Status**: ✅ Operational | **Python**: 3.11+ recommended (3.14 works with minor limitations)

---

## Quick Links

- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Multi-Provider Guide](MULTI_PROVIDER_GUIDE.md) - LLM provider configuration
- [API Documentation](http://localhost:8000/docs) - Swagger UI (when running)

---

## Overview

The Chimaridata Python Backend provides a comprehensive data science platform with:
- **Agentic Orchestration**: LangGraph-based multi-agent coordination
- **RAG Evidence Chain**: Semantic linking of questions → elements → insights → answers
- **Semantic Matching**: Vector-based question-to-element mapping
- **Transformation Engine**: Business-aware data transformations with dependency resolution
- **Analysis Modules**: Standardized statistical and ML analysis outputs
- **Real-time Updates**: WebSocket support for live progress tracking

**Architecture**: Python + FastAPI + LangChain + Pydantic + PostgreSQL (pgvector)

---

## Features

### 1. Agentic Workflow Orchestration

Multi-agent system with specialized agents:
- **Project Manager**: Coordinates end-to-end workflow
- **Data Scientist**: Designs and executes statistical analyses
- **Data Engineer**: Handles data quality and transformations
- **Business Agent**: Translates findings to business insights
- **Template Research**: Finds industry-specific templates
- **Customer Support**: Handles user questions and diagnostics

### 2. RAG Evidence Chain

Complete traceability from questions to answers:
- Question → Element semantic matching
- Element → Transformation linking
- Transformation → Insight mapping
- Insight → Answer generation

### 3. Semantic Matching

Vector-based matching using:
- OpenAI text embeddings
- Cosine similarity search
- Context-aware question interpretation
- Intent classification (trend, comparison, correlation, etc.)

### 4. Transformation Engine

Business-aware transformations:
- Dependency resolution (topological sort)
- Business definition application
- Multiple operation types (derive, aggregate, filter, join, etc.)
- Data cleaning and feature engineering

### 5. Analysis Types

Standardized analysis outputs:
- Descriptive Statistics
- Correlation Analysis
- Regression Analysis
- Clustering
- Time Series Forecasting
- Statistical Tests
- Text Analysis
- Group Analysis

---

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 16+ with pgvector extension
- Redis (optional, for production)
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/chimaridata/chimaridata-python-backend.git
cd chimaridata-python-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys and database credentials

# Run database migrations
python -m alembic upgrade head

# Start the server
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker Setup

```bash
# Using docker-compose
docker-compose up -d

# The server will be available at http://localhost:8000
```

---

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## API Endpoints

### Orchestrator

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/v1/orchestrator/session/create` | Create new workflow session |
| POST | `/api/v1/orchestrator/session/{id}/advance` | Advance workflow to next step |
| GET | `/api/v1/orchestrator/session/{id}/status` | Get session status |
| DELETE | `/api/v1/orchestrator/session/{id}` | Cleanup session |
| GET | `/api/v1/orchestrator/workflow/graph` | Get workflow graph |

### Semantic Matching

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/v1/semantic/generate-embeddings` | Generate column embeddings |
| POST | `/api/v1/semantic/map-questions` | Map questions to elements |
| POST | `/api/v1/semantic/select-analyses` | Select analysis types |

### Evidence Chain

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/v1/evidence/query` | Query evidence chain |
| GET | `/api/v1/evidence/project/{id}` | Get project evidence chain |
| POST | `/api/v1/evidence/generate-answer` | Generate RAG answer |

### Transformations

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/v1/transformations/compile` | Compile transformation plan |
| POST | `/api/v1/transformations/execute` | Execute transformation |

### Analysis

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/v1/analysis/execute` | Execute analysis |
| GET | `/api/v1/analysis/types` | Get available analysis types |

---

## WebSocket

Connect to real-time updates:

```
ws://localhost:8000/ws/{session_id}
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `subscribe` | Client → Server | Subscribe to session updates |
| `ping` | Client → Server | Keepalive |
| `pong` | Server → Client | Keepalive response |
| `progress` | Server → Client | Analysis progress |
| `error` | Server → Client | Error notification |
| `complete` | Server → Client | Analysis complete |

---

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_api/test_orchestrator.py

# Run integration tests
pytest tests/test_integration/
```

### Code Style

```bash
# Format code
black src tests

# Lint code
ruff check src tests

# Type checking
mypy src
```

---

## Project Structure

```
chimaridata-python-backend/
├── README.md
├── .env.example
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── src/
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # Configuration
│   ├── models/                   # Pydantic schemas
│   ├── services/                 # Business logic
│   ├── api/                      # API routes
│   ├── db/                       # Database
│   └── analysis_modules/          # Analysis scripts
├── tests/                        # Test suite
└── docs/                         # Documentation
```

---

## Environment Variables

| Variable | Required | Description |
|----------|-----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `DEFAULT_LLM_MODEL` | No | Default LLM (gpt-4) |
| `USE_PGVECTOR` | No | Use PGVector (true/false) |
| `PYTHON_HOST` | No | Bind host (0.0.0.0) |
| `PYTHON_PORT` | No | Bind port (8000) |
| `NODE_ENV` | No | Environment (development/production) |

---

## Performance

- **End-to-End Analysis**: 1-5 minutes (SLA)
- **Embedding Generation**: ~100ms per column
- **Semantic Search**: <200ms per query
- **Transformation Execution**: Varies by data size

---

## License

MIT

---

## Support

For issues and questions, see the main project repository:
https://github.com/chimaridata/ChimariData_Flowise-chimaridataApp2

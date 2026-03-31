# Integration Tests

This directory contains integration tests for the Chimaridata Python Backend.

## Test Structure

```
tests/
├── __init__.py              # pytest fixtures
├── conftest.py              # Additional pytest configuration
├── pytest.ini               # pytest configuration
├── test-requirements.txt      # test-specific dependencies
├── test_repositories/         # Repository layer tests
├── test_services/            # Service layer tests  
├── test_api/                 # API endpoint tests
├── test_analysis_modules/     # Analysis module tests
└── fixtures/                 # Test data fixtures
```

## Running Tests

### Prerequisites

1. Install test dependencies:
   ```bash
   pip install -r test-requirements.txt
   ```

2. Start the Python backend (required for API tests):
   ```bash
   cd chimaridata-python-backend
   python main.py
   ```
   The backend should be available at `http://localhost:8000/api/v1/health`

3. Run all tests:
   ```bash
   pytest -v
   ```

### Running Specific Test Groups

```bash
# Run only repository tests
pytest tests/test_repositories/ -v

# Run only API tests
pytest tests/test_api/ -v

# Run with coverage
pytest --cov=src --cov-report=html -v
```

### Test Categories

- **Unit Tests** (`@pytest.mark.unit`): Fast, isolated component tests
- **Integration Tests** (`@pytest.mark.integration`): Cross-component tests
- **Repository Tests** (`@pytest.mark.repository`): Data access layer tests
- **Service Tests** (`@pytest.mark.service`): Business logic tests
- **API Tests** (`@pytest.mark.api`): HTTP endpoint tests
- **Analysis Tests** (`@pytest.mark.analysis`): Analysis module tests

### Mock Strategy

The tests use **mock database sessions** to avoid:
- Actual database access during tests
- Slow test execution
- Test data pollution

Fixtures provided in `tests/__init__.py` supply sample data.

## CI/CD Integration

To run tests in CI/CD (e.g., GitHub Actions):

```yaml
name: Tests

on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
          cache: 'pip'
      - name: Install dependencies
        run: |
          pip install -r python/requirements.txt
          pip install -r test-requirements.txt
      - name: Run tests
        run: |
          pytest -v --cov=src --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

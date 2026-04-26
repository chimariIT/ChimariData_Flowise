"""
Chimaridata Python Backend Setup
"""

from setuptools import setup, find_packages

setup(
    name="chimaridata-python-backend",
    version="1.0.0",
    description="Data Science-as-a-Service platform with LangChain orchestration",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="Chimaridata",
    python_requires=">=3.11",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "fastapi>=0.104.1",
        "uvicorn[standard]>=0.24.0",
        "pydantic>=2.5.0",
        "langchain>=0.1.0",
        "langgraph>=0.0.20",
        "deepagents>=0.5.0",
        "openai>=1.10.0",
        "pandas>=2.1.4",
        "numpy>=1.26.0",
        "sqlalchemy>=2.0.25",
        "asyncpg>=0.29.0",
        "pgvector>=0.2.4",
        "stripe>=7.0.0",
        "pytest>=7.4.3",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.3",
            "pytest-cov>=4.1.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.12.0",
            "ruff>=0.1.9",
            "mypy>=1.7.0",
        ],
        "pii": [
            # PII detection (optional - requires Python <3.14 for spacy 3.8.x)
            "presidio>=2.2.295",
            "spacy>=3.7.0,<3.9.0",
        ],
        "all": [
            # Install all optional dependencies
            "chimaridata-python-backend[dev,pii]",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.11",
    ],
)

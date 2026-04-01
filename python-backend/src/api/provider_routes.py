"""
LLM Provider Management API

Endpoints for managing LLM provider configuration and listing available models.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import logging

from ..services.llm_providers import (
    LLMProvider,
    LLMConfig,
    get_llm,
    list_models,
    get_embedding_provider
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


# ============================================================================
# Request/Response Models
# ============================================================================

class ProviderInfo(BaseModel):
    """Information about a provider"""
    name: str
    display_name: str
    description: str
    requires_api_key: bool
    base_url: Optional[str] = None
    available: bool = False


class ModelInfo(BaseModel):
    """Information about a model"""
    name: str
    provider: str
    display_name: str


class ProviderConfig(BaseModel):
    """Provider configuration"""
    provider: str = Field(description="Provider name (openai, anthropic, gemini, openrouter, ollama)")
    model: Optional[str] = Field(default=None, description="Model name (uses provider default if not specified)")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: int = Field(default=2000, ge=1, le=128000, description="Maximum tokens to generate")


class ProviderTestRequest(BaseModel):
    """Request to test a provider"""
    provider: str
    model: Optional[str] = None
    prompt: str = Field(default="Hello, world!", description="Test prompt")


class ProviderTestResponse(BaseModel):
    """Response from provider test"""
    success: bool
    provider: str
    model: str
    response: Optional[str] = None
    error: Optional[str] = None
    latency_ms: float


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/list", response_model=List[ProviderInfo])
async def list_providers():
    """
    List all available LLM providers

    Returns information about supported providers including whether they are properly configured.
    """
    providers = []

    for provider in LLMProvider:
        config = LLMConfig.validate_provider(provider)

        info = ProviderInfo(
            name=provider.value,
            display_name=provider.value.title(),
            description=_get_provider_description(provider),
            requires_api_key=LLMConfig.API_KEY_VARS.get(provider) is not None,
            base_url=LLMConfig.get_base_url(provider),
            available=config
        )
        providers.append(info)

    return providers


@router.get("/{provider}/models", response_model=List[ModelInfo])
async def list_provider_models(provider: str):
    """
    List available models for a specific provider

    Args:
        provider: Provider name

    Returns list of available models for the provider
    """
    try:
        provider_enum = LLMProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    models = list_models(provider_enum)

    return [
        ModelInfo(
            name=model,
            provider=provider,
            display_name=model
        )
        for model in models
    ]


@router.post("/test", response_model=ProviderTestResponse)
async def test_provider(request: ProviderTestRequest):
    """
    Test a provider by sending a simple prompt

    Useful for verifying API keys and connectivity
    """
    import time

    try:
        provider_enum = LLMProvider(request.provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")

    start_time = time.time()

    try:
        llm = get_llm(
            provider=provider_enum,
            model=request.model
        )

        response = llm.invoke(request.prompt)
        latency = (time.time() - start_time) * 1000

        return ProviderTestResponse(
            success=True,
            provider=request.provider,
            model=request.model or LLMConfig.DEFAULT_MODELS.get(provider_enum, "unknown"),
            response=str(response.content),
            latency_ms=latency
        )

    except Exception as e:
        latency = (time.time() - start_time) * 1000
        logger.error(f"Provider test failed: {e}")

        return ProviderTestResponse(
            success=False,
            provider=request.provider,
            model=request.model or "unknown",
            error=str(e),
            latency_ms=latency
        )


@router.post("/embeddings/test")
async def test_embeddings(
    provider: str = "openai",
    text: str = "Test text for embeddings"
):
    """
    Test embedding generation for a provider

    Args:
        provider: Provider name
        text: Text to generate embeddings for

    Returns embedding vector or error
    """
    try:
        provider_enum = LLMProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    try:
        embeddings = get_embedding_provider(provider=provider_enum)
        vector = embeddings.embed_query(text)

        return {
            "success": True,
            "provider": provider,
            "dimension": len(vector),
            "sample_values": vector[:5],  # First 5 values
        }

    except Exception as e:
        logger.error(f"Embedding test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/default")
async def get_default_provider():
    """
    Get the default LLM provider configuration

    Returns the currently configured default provider and model
    """
    import os

    default_provider = os.getenv("DEFAULT_LLM_PROVIDER", "openai")
    default_model = LLMConfig.DEFAULT_MODELS.get(LLMProvider(default_provider))

    return {
        "provider": default_provider,
        "model": default_model,
        "temperature": 0.7,
        "max_tokens": 2000
    }


# ============================================================================
# Helper Functions
# ============================================================================

def _get_provider_description(provider: LLMProvider) -> str:
    """Get human-readable description for a provider"""
    descriptions = {
        LLMProvider.OPENAI: "OpenAI - GPT-4, GPT-4 Turbo, and other OpenAI models",
        LLMProvider.ANTHROPIC: "Anthropic - Claude 3 Opus, Sonnet, and Haiku",
        LLMProvider.GEMINI: "Google - Gemini Pro and other Google models",
        LLMProvider.OPENROUTER: "OpenRouter - Access to 100+ models via one API",
        LLMProvider.OLLAMA: "Ollama - Run Llama, Mistral, and other models locally"
    }
    return descriptions.get(provider, "Unknown provider")

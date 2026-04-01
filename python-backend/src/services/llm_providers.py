"""
LLM Provider Registry

Supports multiple LLM providers:
- OpenAI
- Anthropic (Claude)
- Google (Gemini)
- OpenRouter
- Ollama (Llama and other local models)
"""

from typing import Dict, Any, Optional, Literal
from enum import Enum
import logging
from os import getenv

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"


class LLMConfig:
    """Configuration for LLM providers"""

    # Default models for each provider
    DEFAULT_MODELS = {
        LLMProvider.OPENAI: "gpt-4",
        LLMProvider.ANTHROPIC: "claude-3-sonnet-20240229",
        LLMProvider.GEMINI: "gemini-pro",
        LLMProvider.OPENROUTER: "anthropic/claude-3-sonnet",
        LLMProvider.OLLAMA: "llama2"
    }

    # Environment variable names
    API_KEY_VARS = {
        LLMProvider.OPENAI: "OPENAI_API_KEY",
        LLMProvider.ANTHROPIC: "ANTHROPIC_API_KEY",
        LLMProvider.GEMINI: "GEMINI_API_KEY",
        LLMProvider.OPENROUTER: "OPENROUTER_API_KEY",
        LLMProvider.OLLAMA: None  # Ollama doesn't need an API key
    }

    # Base URLs
    BASE_URLS = {
        LLMProvider.OPENAI: None,
        LLMProvider.ANTHROPIC: None,
        LLMProvider.GEMINI: None,
        LLMProvider.OPENROUTER: "https://openrouter.ai/api/v1",
        LLMProvider.OLLAMA: "http://localhost:11434"
    }

    @classmethod
    def get_api_key(cls, provider: LLMProvider) -> Optional[str]:
        """Get API key for provider from environment"""
        env_var = cls.API_KEY_VARS.get(provider)
        if env_var:
            return getenv(env_var)
        return None

    @classmethod
    def get_base_url(cls, provider: LLMProvider) -> Optional[str]:
        """Get base URL for provider"""
        return cls.BASE_URLS.get(provider)

    @classmethod
    def validate_provider(cls, provider: LLMProvider) -> bool:
        """Check if provider has required configuration"""
        # Ollama doesn't need an API key
        if provider == LLMProvider.OLLAMA:
            return True

        api_key = cls.get_api_key(provider)
        if not api_key:
            logger.warning(f"No API key found for {provider.value}")
            return False

        return True


def get_llm(
    provider: LLMProvider = LLMProvider.OPENAI,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2000,
    **kwargs
) -> Any:
    """
    Factory function to create LLM instance

    Args:
        provider: LLM provider to use
        model: Model name (uses provider default if not specified)
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        **kwargs: Additional provider-specific parameters

    Returns:
        LangChain Chat model instance

    Raises:
        ValueError: If provider is not supported or configuration is invalid
    """
    if not isinstance(provider, LLMProvider):
        provider = LLMProvider(provider)

    if not LLMConfig.validate_provider(provider):
        raise ValueError(f"Provider {provider.value} is not properly configured")

    model = model or LLMConfig.DEFAULT_MODELS.get(provider)
    base_url = LLMConfig.get_base_url(provider)

    # Import provider-specific classes
    try:
        if provider == LLMProvider.OPENAI:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                openai_api_key=LLMConfig.get_api_key(provider),
                **kwargs
            )

        elif provider == LLMProvider.ANTHROPIC:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                anthropic_api_key=LLMConfig.get_api_key(provider),
                **kwargs
            )

        elif provider == LLMProvider.GEMINI:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model=model,
                temperature=temperature,
                google_api_key=LLMConfig.get_api_key(provider),
                **kwargs
            )

        elif provider == LLMProvider.OPENROUTER:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                openai_api_key=LLMConfig.get_api_key(provider),
                base_url=base_url,
                **kwargs
            )

        elif provider == LLMProvider.OLLAMA:
            from langchain_community.chat_models import ChatOllama
            return ChatOllama(
                model=model,
                temperature=temperature,
                base_url=base_url,
                **kwargs
            )

        else:
            raise ValueError(f"Unsupported provider: {provider}")

    except ImportError as e:
        logger.error(f"Failed to import provider {provider.value}: {e}")
        raise ValueError(f"Provider {provider.value} requires additional dependencies. Error: {e}")


def get_embedding_provider(
    provider: LLMProvider = LLMProvider.OPENAI,
    **kwargs
) -> Any:
    """
    Factory function to create embedding model instance

    Args:
        provider: LLM provider to use for embeddings
        **kwargs: Additional provider-specific parameters

    Returns:
        LangChain embeddings instance
    """
    if not isinstance(provider, LLMProvider):
        provider = LLMProvider(provider)

    try:
        if provider == LLMProvider.OPENAI:
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(
                openai_api_key=LLMConfig.get_api_key(provider),
                **kwargs
            )

        elif provider == LLMProvider.GEMINI:
            from langchain_google_genai import GoogleGenerativeAIEmbeddings
            return GoogleGenerativeAIEmbeddings(
                google_api_key=LLMConfig.get_api_key(provider),
                **kwargs
            )

        elif provider == LLMProvider.OLLAMA:
            from langchain_community.embeddings import OllamaEmbeddings
            return OllamaEmbeddings(
                base_url=LLMConfig.get_base_url(provider),
                **kwargs
            )

        else:
            # Default to OpenAI for other providers
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(
                openai_api_key=LLMConfig.get_api_key(LLMProvider.OPENAI),
                **kwargs
            )

    except ImportError as e:
        logger.error(f"Failed to create embeddings for {provider.value}: {e}")
        raise ValueError(f"Embeddings for {provider.value} require additional dependencies")


# Convenience functions for common use cases

def get_chat_llm(model: Optional[str] = None) -> Any:
    """
    Get default chat LLM (configurable via DEFAULT_LLM_PROVIDER env var)

    Args:
        model: Model name (optional)

    Returns:
        LangChain Chat model instance
    """
    default_provider = getenv("DEFAULT_LLM_PROVIDER", "openai")
    return get_llm(LLMProvider(default_provider), model=model)


def get_embeddings(model: Optional[str] = None) -> Any:
    """
    Get default embedding model (configurable via DEFAULT_EMBEDDING_PROVIDER env var)

    Args:
        model: Model name (optional)

    Returns:
        LangChain embeddings instance
    """
    default_provider = getenv("DEFAULT_EMBEDDING_PROVIDER", "openai")
    return get_embedding_provider(LLMProvider(default_provider))


# List all available models for a provider
def list_models(provider: LLMProvider) -> list[str]:
    """
    List available models for a provider

    Args:
        provider: LLM provider

    Returns:
        List of model names
    """
    # Common models for each provider
    MODELS = {
        LLMProvider.OPENAI: [
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "gpt-4o",
            "gpt-4o-mini"
        ],
        LLMProvider.ANTHROPIC: [
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
            "claude-2.1",
            "claude-2.0"
        ],
        LLMProvider.GEMINI: [
            "gemini-pro",
            "gemini-pro-vision",
            "gemini-ultra"
        ],
        LLMProvider.OPENROUTER: [
            # OpenRouter supports many models - these are popular ones
            "anthropic/claude-3-opus",
            "anthropic/claude-3-sonnet",
            "openai/gpt-4-turbo",
            "meta-llama/llama-3-70b",
            "mistralai/mistral-large"
        ],
        LLMProvider.OLLAMA: [
            "llama2",
            "llama2:13b",
            "llama2:70b",
            "mistral",
            "neural-chat",
            "codellama"
        ]
    }

    return MODELS.get(provider, [])

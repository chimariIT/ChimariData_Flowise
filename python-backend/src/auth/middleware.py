"""
Authentication and Authorization Middleware

Provides JWT validation, OAuth providers, and session management
for the Chimaridata Python backend.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import jwt
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

# JWT Configuration
SECRET_KEY = "your-secret-key-change-in-production"  # TODO: Load from env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week
REFRESH_TOKEN_EXPIRE_DAYS = 30

# OAuth Providers (configuration)
OAUTH_PROVIDERS = {
    "google": {
        "client_id": "TODO",  # Load from env
        "client_secret": "TODO",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scope": "openid email profile"
    },
    "github": {
        "client_id": "TODO",
        "client_secret": "TODO",
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "scope": "read:user user:email"
    },
    "microsoft": {
        "client_id": "TODO",
        "client_secret": "TODO",
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scope": "openid email profile"
    }
}

# ============================================================================
# Models
# ============================================================================

class TokenData(BaseModel):
    """Data encoded in JWT token"""
    user_id: str
    email: str
    is_admin: bool = False
    exp: Optional[datetime] = None
    iat: Optional[datetime] = None


class User(BaseModel):
    """User model"""
    id: str
    email: str
    name: Optional[str] = None
    is_admin: bool = False
    created_at: Optional[datetime] = None


class AuthResponse(BaseModel):
    """Response from auth endpoints"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: User


class LoginRequest(BaseModel):
    """Login request"""
    email: str
    password: str


class RegisterRequest(BaseModel):
    """Registration request"""
    email: str
    password: str
    name: Optional[str] = None


# ============================================================================
# JWT Utilities
# ============================================================================

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Data to encode in the token
        expires_delta: Optional expiration time override

    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def create_refresh_token(user_id: str) -> str:
    """
    Create a refresh token for long-lived sessions.

    Args:
        user_id: User ID to encode

    Returns:
        Encoded refresh token
    """
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    data = {
        "user_id": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token to decode

    Returns:
        TokenData with user information

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub") or payload.get("user_id")
        email = payload.get("email")
        is_admin = payload.get("is_admin", False)

        if not user_id or not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        return TokenData(
            user_id=user_id,
            email=email,
            is_admin=is_admin,
            exp=datetime.fromtimestamp(payload.get("exp")) if payload.get("exp") else None,
            iat=datetime.fromtimestamp(payload.get("iat")) if payload.get("iat") else None
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )


def verify_refresh_token(token: str) -> str:
    """
    Verify a refresh token and return the user ID.

    Args:
        token: Refresh token to verify

    Returns:
        User ID from the token

    Raises:
        HTTPException: If token is invalid
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired"
        )
    except jwt.JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {str(e)}"
        )


# ============================================================================
# FastAPI Security Dependencies
# ============================================================================

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> User:
    """
    Dependency to get the current authenticated user from request.

    Usage in FastAPI routes:
        @app.get("/protected")
        async def protected_route(user: User = Depends(get_current_user)):
            return {"user": user.email}

    Returns:
        User object

    Raises:
        HTTPException: If no credentials provided or token invalid
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_token(credentials.credentials)

    # In a real implementation, fetch user from database
    # For now, return user from token
    return User(
        id=token_data.user_id,
        email=token_data.email,
        is_admin=token_data.is_admin
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[User]:
    """
    Dependency to get current user if authenticated, None otherwise.

    Useful for routes that work for both authenticated and anonymous users.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """
    Dependency that requires user to be an admin.

    Usage:
        @app.delete("/admin/users/{user_id}")
        async def delete_user(user_id: str, admin: User = Depends(require_admin)):
            ...
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return user


# ============================================================================
# Auth Header Helpers
# ============================================================================

def get_auth_headers(token: str) -> Dict[str, str]:
    """
    Build authentication headers for API requests.

    Args:
        token: JWT access token

    Returns:
        Dictionary with Authorization header
    """
    return {"Authorization": f"Bearer {token}"}


def get_user_from_token(token: str) -> TokenData:
    """
    Extract user data from token (utility function).

    Args:
        token: JWT token

    Returns:
        TokenData with user information
    """
    return decode_token(token)


# ============================================================================
# OAuth Utilities
# ============================================================================

def get_oauth_url(provider: str, redirect_uri: str, state: str) -> str:
    """
    Generate OAuth authorization URL for a provider.

    Args:
        provider: Provider name (google, github, microsoft)
        redirect_uri: Redirect URI after auth
        state: CSRF protection state

    Returns:
        Authorization URL
    """
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider: {provider}"
        )

    config = OAUTH_PROVIDERS[provider]
    from urllib.parse import urlencode

    params = {
        "client_id": config["client_id"],
        "redirect_uri": redirect_uri,
        "scope": config["scope"],
        "response_type": "code",
        "state": state
    }

    return f"{config['auth_url']}?{urlencode(params)}"


async def exchange_oauth_code(provider: str, code: str, redirect_uri: str) -> Dict[str, Any]:
    """
    Exchange OAuth authorization code for access token.

    Args:
        provider: Provider name
        code: Authorization code from OAuth callback
        redirect_uri: Redirect URI used in authorization

    Returns:
        Dictionary with access_token and user info
    """
    import httpx

    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider: {provider}"
        )

    config = OAUTH_PROVIDERS[provider]

    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            config["token_url"],
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            }
        )
        token_data = token_response.json()

        if "error" in token_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"OAuth error: {token_data['error']}"
            )

        # Get user info
        user_response = await client.get(
            config["userinfo_url"],
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )
        user_info = user_response.json()

        return {
            "provider": provider,
            "provider_user_id": str(user_info.get("id") or user_info.get("sub")),
            "email": user_info.get("email"),
            "name": user_info.get("name") or user_info.get("login"),
            "picture": user_info.get("picture")
        }

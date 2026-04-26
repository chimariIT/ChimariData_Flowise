"""
Authentication Routes for Chimaridata Python Backend

Real implementation with:
- bcrypt password hashing
- JWT token issuance
- PostgreSQL user persistence
- Pydantic request validation
"""

from typing import Dict, Any, Optional, Tuple
import logging
import os
import base64
import hashlib
import hmac
import html
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import ORJSONResponse, RedirectResponse, HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict

from sqlalchemy import text as sa_text

from ..models.schemas import APIResponse
from ..models.database import db_manager, generate_uuid
from ..db import get_db_context
from ..auth.middleware import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_optional_user,
    User as AuthUser,
    security,
)

logger = logging.getLogger(__name__)

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
OAUTH_STATE_TTL_SECONDS = 10 * 60
DEFAULT_OAUTH_NEXT_PATH = "/dashboard"
DEFAULT_OAUTH_CALLBACK_PATH = "/api/auth/google/callback"


# ============================================================================
# Pydantic Request/Response Models
# ============================================================================

class LoginRequest(BaseModel):
    """Login request with validation"""
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    """Registration request with validation"""
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: Optional[str] = Field(None, max_length=200)
    firstName: Optional[str] = Field(None, max_length=100, alias="first_name")
    lastName: Optional[str] = Field(None, max_length=100, alias="last_name")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


class UserResponse(BaseModel):
    """User data returned to frontend"""
    id: str
    email: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    name: Optional[str] = None
    isAdmin: bool = False
    subscriptionTier: str = "trial"
    subscriptionStatus: str = "inactive"
    userRole: str = "non-tech"
    createdAt: Optional[str] = None


# ============================================================================
# Helper: hash and verify passwords
# ============================================================================

def _bootstrap_admin_emails() -> set[str]:
    configured = os.getenv("ADMIN_BOOTSTRAP_EMAILS", "")
    emails = {email.strip().lower() for email in configured.split(",") if email.strip()}
    if not emails:
        emails.add("admin@chimaridata.com")
    return emails


def _is_bootstrap_admin(email: Optional[str]) -> bool:
    return bool(email and email.strip().lower() in _bootstrap_admin_emails())


def _resolve_admin_flag(record: Dict[str, Any]) -> bool:
    return bool(record.get("is_admin", False)) or _is_bootstrap_admin(record.get("email"))

def _hash_password(password: str) -> str:
    """Hash password using bcrypt via passlib or hashlib fallback"""
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    except ImportError:
        import hashlib
        return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash"""
    try:
        import bcrypt
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except ImportError:
        import hashlib
        return hashlib.sha256(password.encode('utf-8')).hexdigest() == hashed


def _user_record_to_response(record) -> dict:
    """Convert a DB user record to frontend-compatible dict"""
    if record is None:
        return None
    first_name = record.get('first_name') or ''
    last_name = record.get('last_name') or ''
    name = record.get('name') or f"{first_name} {last_name}".strip() or record.get('email', '').split('@')[0]
    created = record.get('created_at')
    return {
        "id": record.get('id'),
        "email": record.get('email'),
        "firstName": first_name,
        "lastName": last_name,
        "name": name,
        "isAdmin": _resolve_admin_flag(record),
        "subscriptionTier": record.get('subscription_tier', 'trial'),
        "subscriptionStatus": record.get('subscription_status', 'inactive'),
        "userRole": record.get('user_role', 'non-tech'),
        "createdAt": created.isoformat() if created else None,
    }


def _is_configured(value: Optional[str]) -> bool:
    if not value:
        return False
    normalized = value.strip()
    if not normalized:
        return False

    lowered = normalized.lower()
    placeholder_prefixes = (
        "your_",
        "todo",
        "placeholder",
        "change_me",
        "replace_me",
    )
    return not any(lowered.startswith(prefix) for prefix in placeholder_prefixes)


def _normalize_public_base(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _infer_frontend_base_url(request: Request) -> str:
    candidates = [
        os.getenv("FRONTEND_URL"),
        os.getenv("BASE_URL"),
        os.getenv("PUBLIC_APP_URL"),
        os.getenv("APP_URL"),
        request.headers.get("origin"),
    ]

    referer = request.headers.get("referer")
    if referer:
        candidates.append(referer)

    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_proto and forwarded_host:
        candidates.append(f"{forwarded_proto}://{forwarded_host}")

    candidates.append(str(request.base_url))

    for candidate in candidates:
        normalized = _normalize_public_base(candidate)
        if normalized:
            return normalized

    return "http://localhost:5173"


def _sanitize_next_path(raw_next: Optional[str]) -> str:
    if not raw_next:
        return DEFAULT_OAUTH_NEXT_PATH

    candidate = raw_next.strip()
    if not candidate:
        return DEFAULT_OAUTH_NEXT_PATH

    # Reject absolute URLs and protocol-relative values.
    if candidate.startswith("http://") or candidate.startswith("https://") or candidate.startswith("//"):
        return DEFAULT_OAUTH_NEXT_PATH

    if not candidate.startswith("/"):
        candidate = "/" + candidate

    if len(candidate) > 512:
        return DEFAULT_OAUTH_NEXT_PATH

    return candidate


def _oauth_state_secret() -> str:
    return (
        os.getenv("OAUTH_STATE_SECRET")
        or os.getenv("JWT_SECRET")
        or os.getenv("SESSION_SECRET")
        or "oauth-state-secret-change-me"
    )


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign_oauth_state(payload: Dict[str, Any]) -> str:
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    signature = hmac.new(
        _oauth_state_secret().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{payload_b64}.{_b64url_encode(signature)}"


def _verify_oauth_state(state_token: str) -> Dict[str, Any]:
    try:
        payload_b64, signature_b64 = state_token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    expected_signature = hmac.new(
        _oauth_state_secret().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    try:
        provided_signature = _b64url_decode(signature_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=400, detail="OAuth state verification failed")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state payload")

    expires_at = int(payload.get("exp", 0))
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if expires_at <= now_ts:
        raise HTTPException(status_code=400, detail="OAuth state expired")

    return payload


def _split_name(full_name: Optional[str], fallback_email: str) -> Tuple[str, str]:
    if full_name and full_name.strip():
        parts = full_name.strip().split()
        if len(parts) == 1:
            return parts[0], ""
        return parts[0], " ".join(parts[1:])
    return fallback_email.split("@")[0], ""


def _google_oauth_config() -> Tuple[str, str]:
    client_id = (
        os.getenv("GOOGLE_CLIENT_ID")
        or os.getenv("GOOGLE_OAUTH_CLIENT_ID")
        or os.getenv("VITE_GOOGLE_CLIENT_ID")
    )
    client_secret = (
        os.getenv("GOOGLE_CLIENT_SECRET")
        or os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
        or os.getenv("VITE_GOOGLE_CLIENT_SECRET")
    )

    if not (_is_configured(client_id) and _is_configured(client_secret)):
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    return client_id.strip(), client_secret.strip()


def _build_google_redirect_uri(request: Request, frontend_base: str) -> str:
    explicit = os.getenv("GOOGLE_REDIRECT_URI")
    if _is_configured(explicit):
        return explicit.strip()
    return f"{frontend_base}{DEFAULT_OAUTH_CALLBACK_PATH}"


async def _get_or_create_oauth_user(email: str, provider: str, provider_id: Optional[str], display_name: Optional[str]) -> Dict[str, Any]:
    first_name, last_name = _split_name(display_name, email)

    async with get_db_context() as session:
        existing_result = await session.execute(
            sa_text("SELECT * FROM users WHERE email = :email"),
            {"email": email},
        )
        existing_row = existing_result.first()
        existing_record = dict(zip(existing_result.keys(), existing_row)) if existing_row else None

        if existing_record:
            await session.execute(
                sa_text(
                    """
                    UPDATE users
                    SET provider = :provider,
                        provider_id = COALESCE(:provider_id, provider_id),
                        first_name = COALESCE(NULLIF(first_name, ''), :first_name),
                        last_name = COALESCE(NULLIF(last_name, ''), :last_name),
                        updated_at = NOW()
                    WHERE id = :id
                    """
                ),
                {
                    "provider": provider,
                    "provider_id": provider_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "id": existing_record["id"],
                },
            )
            await session.commit()

            refreshed_result = await session.execute(
                sa_text("SELECT * FROM users WHERE id = :id"),
                {"id": existing_record["id"]},
            )
            refreshed_row = refreshed_result.first()
            return dict(zip(refreshed_result.keys(), refreshed_row)) if refreshed_row else existing_record

        user_id = generate_uuid()
        is_admin = _is_bootstrap_admin(email)
        await session.execute(
            sa_text(
                """
                INSERT INTO users (
                    id, email, first_name, last_name, provider, provider_id,
                    subscription_tier, subscription_status, user_role, is_admin,
                    trial_credits, email_verified, created_at, updated_at
                )
                VALUES (
                    :id, :email, :first_name, :last_name, :provider, :provider_id,
                    :subscription_tier, :subscription_status, :user_role, :is_admin,
                    :trial_credits, :email_verified, NOW(), NOW()
                )
                """
            ),
            {
                "id": user_id,
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "provider": provider,
                "provider_id": provider_id,
                "subscription_tier": "trial",
                "subscription_status": "inactive",
                "user_role": "non-tech",
                "is_admin": is_admin,
                "trial_credits": 100,
                "email_verified": True,
            },
        )
        await session.commit()

        created_result = await session.execute(
            sa_text("SELECT * FROM users WHERE id = :id"),
            {"id": user_id},
        )
        created_row = created_result.first()
        if not created_row:
            raise HTTPException(status_code=500, detail="Failed to create OAuth user")
        return dict(zip(created_result.keys(), created_row))


def _oauth_completion_page(token: str, redirect_url: str) -> HTMLResponse:
    safe_token = json.dumps(token)
    safe_redirect = json.dumps(redirect_url)
    html_doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing You In</title>
  </head>
  <body>
    <p>Completing sign-in...</p>
    <script>
      (function () {{
        try {{
          localStorage.setItem('auth_token', {safe_token});
          window.dispatchEvent(new Event('auth-token-stored'));
        }} catch (e) {{
          console.error('Failed to store auth token', e);
        }}
        window.location.replace({safe_redirect});
      }})();
    </script>
    <noscript>
      <p>Sign-in succeeded. Continue here:</p>
      <a href="{html.escape(redirect_url)}">Continue</a>
    </noscript>
  </body>
</html>"""
    return HTMLResponse(content=html_doc, status_code=200)


# ============================================================================
# Auth Endpoints
# ============================================================================

@router.post("/login")
async def login(request: LoginRequest):
    """
    User login — verifies credentials against DB, returns JWT + user.
    Response is FLAT (token + user at root level) for frontend compatibility.
    """
    try:
        # Query user from database using direct SQLAlchemy session
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT * FROM users WHERE email = :email"),
                {"email": request.email}
            )
            row = result.first()
            record = dict(zip(result.keys(), row)) if row else None

        if not record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Verify password
        hashed_password = record.get('hashed_password')
        if not hashed_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account exists but no password set. Use OAuth to sign in."
            )

        if not _verify_password(request.password, hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Generate JWT token
        token = create_access_token({
            "sub": record['id'],
            "user_id": record['id'],
            "email": record['email'],
            "is_admin": _resolve_admin_flag(record),
        })

        user_data = _user_record_to_response(record)

        # Return FLAT response (no data envelope) for frontend compatibility
        return ORJSONResponse(content={
            "success": True,
            "message": "Login successful",
            "token": token,
            "user": user_data,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/register")
async def register(request: RegisterRequest):
    """
    User registration — creates user in DB with hashed password.
    """
    try:
        # Check if user already exists
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT id FROM users WHERE email = :email"),
                {"email": request.email}
            )
            existing = result.first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists"
            )

        # Build name fields
        first_name = request.firstName or (request.name.split(' ')[0] if request.name else request.email.split('@')[0])
        last_name = request.lastName or (' '.join(request.name.split(' ')[1:]) if request.name and ' ' in request.name else '')

        # Hash password
        hashed = _hash_password(request.password)

        # Insert user
        user_id = generate_uuid()
        is_admin = _is_bootstrap_admin(request.email)
        async with get_db_context() as session:
            await session.execute(
                sa_text("""INSERT INTO users (id, email, hashed_password, first_name, last_name,
                   provider, subscription_tier, subscription_status, user_role, is_admin,
                   trial_credits, created_at, updated_at)
                   VALUES (:id, :email, :hashed_password, :first_name, :last_name,
                   :provider, :subscription_tier, :subscription_status, :user_role, :is_admin,
                   :trial_credits, NOW(), NOW())"""),
                {
                    "id": user_id, "email": request.email, "hashed_password": hashed,
                    "first_name": first_name, "last_name": last_name,
                    "provider": "email", "subscription_tier": "trial",
                    "subscription_status": "inactive", "user_role": "non-tech",
                    "is_admin": is_admin, "trial_credits": 100
                }
            )
            await session.commit()

        # Generate token for immediate login
        token = create_access_token({
            "sub": user_id,
            "user_id": user_id,
            "email": request.email,
            "is_admin": is_admin,
        })

        return ORJSONResponse(content={
            "success": True,
            "message": "Registration successful",
            "token": token,
            "user": {
                "id": user_id,
                "email": request.email,
                "firstName": first_name,
                "lastName": last_name,
                "name": f"{first_name} {last_name}".strip(),
                "isAdmin": is_admin,
                "subscriptionTier": "trial",
                "userRole": "non-tech",
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.get("/user")
async def get_user(user: AuthUser = Depends(get_current_user)):
    """
    Get current authenticated user from JWT token.
    """
    try:
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT * FROM users WHERE id = :id"),
                {"id": user.id}
            )
            row = result.first()
            record = dict(zip(result.keys(), row)) if row else None

        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user_data = _user_record_to_response(record)
        return ORJSONResponse(content={
            "success": True,
            "user": user_data,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get user")


@router.post("/refresh")
async def refresh_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """
    Refresh JWT token — issues new token from valid existing token.
    """
    try:
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No token provided"
            )

        # Decode existing token
        token_data = decode_token(credentials.credentials)

        # Verify user still exists
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT id, email, is_admin FROM users WHERE id = :id"),
                {"id": token_data.user_id}
            )
            row = result.first()
            record = dict(zip(result.keys(), row)) if row else None
        if not record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User no longer exists"
            )

        # Issue new token
        new_token = create_access_token({
            "sub": record['id'],
            "user_id": record['id'],
            "email": record['email'],
            "is_admin": _resolve_admin_flag(record),
        })

        return ORJSONResponse(content={
            "success": True,
            "message": "Token refreshed",
            "token": new_token,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Token refresh failed")


@router.post("/logout")
async def logout(user: Optional[AuthUser] = Depends(get_optional_user)):
    """
    Logout — server-side acknowledgment. Token invalidation is client-side.
    """
    return ORJSONResponse(content={
        "success": True,
        "message": "Logged out successfully"
    })


@router.get("/google")
async def start_google_oauth(
    request: Request,
    next: Optional[str] = None,
):
    """
    Start Google OAuth flow by redirecting to Google's authorization endpoint.
    """
    client_id, _ = _google_oauth_config()
    frontend_base = _infer_frontend_base_url(request)
    redirect_uri = _build_google_redirect_uri(request, frontend_base)
    next_path = _sanitize_next_path(next)

    now_ts = int(datetime.now(timezone.utc).timestamp())
    state_payload = {
        "provider": "google",
        "next": next_path,
        "frontend_base": frontend_base,
        "redirect_uri": redirect_uri,
        "exp": now_ts + OAUTH_STATE_TTL_SECONDS,
    }
    state_token = _sign_oauth_state(state_payload)

    auth_params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state_token,
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "access_type": "online",
    }

    google_auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(auth_params)}"
    return RedirectResponse(url=google_auth_url, status_code=302)


@router.get("/google/callback")
async def google_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """
    Handle Google OAuth callback, upsert user, issue platform JWT, and redirect.
    """
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth authorization code")
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")

    state_payload = _verify_oauth_state(state)
    if state_payload.get("provider") != "google":
        raise HTTPException(status_code=400, detail="Invalid OAuth provider state")

    frontend_base = _normalize_public_base(state_payload.get("frontend_base")) or "http://localhost:5173"
    redirect_uri = state_payload.get("redirect_uri")
    if not isinstance(redirect_uri, str) or not redirect_uri.strip():
        raise HTTPException(status_code=400, detail="Invalid OAuth redirect URI")

    next_path = _sanitize_next_path(state_payload.get("next"))
    client_id, client_secret = _google_oauth_config()

    async with httpx.AsyncClient(timeout=20.0) as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if token_response.status_code >= 400:
            logger.error(f"Google token exchange failed: {token_response.text}")
            raise HTTPException(status_code=400, detail="Google token exchange failed")

        token_payload = token_response.json()
        access_token = token_payload.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google token response missing access_token")

        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_response.status_code >= 400:
            logger.error(f"Google userinfo failed: {userinfo_response.text}")
            raise HTTPException(status_code=400, detail="Failed to fetch Google user profile")

        userinfo = userinfo_response.json()

    email = userinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account did not provide an email")

    user_record = await _get_or_create_oauth_user(
        email=email,
        provider="google",
        provider_id=str(userinfo.get("sub")) if userinfo.get("sub") else None,
        display_name=userinfo.get("name"),
    )

    token = create_access_token({
        "sub": user_record["id"],
        "user_id": user_record["id"],
        "email": user_record["email"],
        "is_admin": _resolve_admin_flag(user_record),
    })

    redirect_url = f"{frontend_base}{next_path}"
    return _oauth_completion_page(token=token, redirect_url=redirect_url)


@router.get("/providers")
async def get_auth_providers():
    """
    Get available authentication providers.
    """
    def _first_env_value(*env_names: str) -> Optional[str]:
        for env_name in env_names:
            value = os.getenv(env_name)
            if value is not None:
                return value
        return None

    def _build_provider(
        provider_id: str,
        name: str,
        auth_url: Optional[str],
        client_id_envs: Tuple[str, ...],
        client_secret_envs: Tuple[str, ...],
    ) -> Dict[str, Any]:
        client_id = _first_env_value(*client_id_envs)
        client_secret = _first_env_value(*client_secret_envs)

        missing_config: list[str] = []
        if not _is_configured(client_id):
            missing_config.append(client_id_envs[0])
        if not _is_configured(client_secret):
            missing_config.append(client_secret_envs[0])

        enabled = len(missing_config) == 0
        setup_hint = None
        if not enabled:
            setup_hint = f"{name} sign-in is unavailable right now. Please continue with email sign-in."

        return {
            "id": provider_id,
            "name": name,
            "enabled": enabled,
            "authUrl": auth_url if enabled else None,
            "setupHint": setup_hint,
            "missingConfig": missing_config,
        }

    google_provider = _build_provider(
        provider_id="google",
        name="Google",
        auth_url="/api/auth/google",
        client_id_envs=("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID"),
        client_secret_envs=("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "VITE_GOOGLE_CLIENT_SECRET"),
    )
    github_provider = _build_provider(
        provider_id="github",
        name="GitHub",
        auth_url="/api/auth/github",
        client_id_envs=("GITHUB_CLIENT_ID", "GITHUB_OAUTH_CLIENT_ID", "VITE_GITHUB_CLIENT_ID"),
        client_secret_envs=("GITHUB_CLIENT_SECRET", "GITHUB_OAUTH_CLIENT_SECRET", "VITE_GITHUB_CLIENT_SECRET"),
    )

    return ORJSONResponse(content={
        "success": True,
        "providers": [
            {"id": "email", "name": "Email", "enabled": True},
            google_provider,
            github_provider,
        ]
    })


@router.get("/providers/diagnostics")
async def get_auth_provider_diagnostics():
    """
    Return provider readiness details for environment validation dashboards.
    """
    providers_response = await get_auth_providers()
    providers_payload = json.loads(providers_response.body.decode("utf-8"))

    providers = providers_payload.get("providers", [])
    ready_providers = [
        p.get("id")
        for p in providers
        if p.get("id") not in {"email"} and p.get("enabled")
    ]

    return ORJSONResponse(
        content={
            "success": True,
            "environment": os.getenv("NODE_ENV", "development"),
            "readyProviderCount": len(ready_providers),
            "readyProviders": ready_providers,
            "providers": providers,
        }
    )


def include_auth_routes(app):
    """Include auth routes at /api/auth/* to match frontend expectations"""
    # The Vite proxy rewrites /api/auth/* to /auth/* so we mount WITHOUT /api prefix
    app.include_router(router, prefix="/auth", tags=["auth"])
    logger.info("Auth routes included at /auth/*")

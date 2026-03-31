"""
Authentication Routes for Chimaridata Python Backend

Provides REST API endpoints for:
- User login
- User registration
- Token refresh
- User session management

These routes are compatible with the frontend's auth API client.
"""

from typing import Dict, Any
import logging
import uuid

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse, ORJSONResponse
from pydantic import BaseModel
import json
from typing import Dict, Any

from ..models.schemas import APIResponse

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class LoginResponse(BaseModel):
    """Login response model - has token at root level for frontend compatibility"""
    success: bool
    message: str
    token: str
    user: Dict[str, Any]

class LoginRequest(BaseModel):
    """Login request"""
    email: str = Field(..., description="Email")
    password: str = Field(..., description="Password")


class RegisterRequest(BaseModel):
    """Registration request"""
    email: str = Field(..., description="Email")
    name: str = Field(..., description="Name")
    password: str = Field(..., description="Password")


# ============================================================================
# Authentication Endpoints (Compatible with frontend API client)
# These endpoints are at /api/auth/* to match frontend expectations
# ============================================================================

@router.post("/login")
async def login(request: LoginRequest):
    """User login endpoint - returns token at root level for frontend compatibility"""
    try:
        # Generate user and token
        user_id = str(uuid.uuid4())
        token = f"jwt_token_{uuid.uuid4().hex[:32]}"

        # Mock implementation - in production would verify credentials against database
        # Return token at root level for frontend compatibility
        response_data = {
            "success": True,
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user_id,
                "email": request.email,
                "name": request.email.split('@')[0],
                "is_admin": False,
                "tier": "trial"
            }
        }
        # Use ORJSONResponse to bypass any potential response wrapping
        return ORJSONResponse(content=response_data)
    except Exception as e:
        logger.error(f"Error in login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register", response_model=APIResponse)
async def register(request: RegisterRequest):
    """User registration endpoint"""
    try:
        # Mock implementation - in production would create user in database
        return APIResponse(
            success=True,
            message="Registration successful",
            data={
                "user_id": str(uuid.uuid4()),
                "email": request.email,
                "name": request.name,
                "tier": "trial"
            }
        )
    except Exception as e:
        logger.error(f"Error in registration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh", response_model=APIResponse)
async def refresh_token():
    """Token refresh endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Token refreshed",
            data={
                "token": f"refreshed_jwt_token_{uuid.uuid4().hex[:32]}",
            }
        )
    except Exception as e:
        logger.error(f"Error refreshing token: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout", response_model=APIResponse)
async def logout():
    """Logout endpoint"""
    try:
        return APIResponse(
            success=True,
            message="Logged out successfully"
        )
    except Exception as e:
        logger.error(f"Error in logout: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user", response_model=APIResponse)
async def get_current_user():
    """Get current user info"""
    try:
        # Mock implementation - in production would get user from JWT token
        return APIResponse(
            success=True,
            data={
                "id": str(uuid.uuid4()),
                "email": "user@example.com",
                "name": "Test User",
                "is_admin": False,
                "tier": "trial"
            }
        )
    except Exception as e:
        logger.error(f"Error getting user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/providers", response_model=APIResponse)
async def get_auth_providers():
    """Get available authentication providers"""
    try:
        return APIResponse(
            success=True,
            data={
                "providers": [
                    {"id": "email", "name": "Email", "enabled": True},
                    {"id": "google", "name": "Google", "enabled": False},
                    {"id": "github", "name": "GitHub", "enabled": False}
                ]
            }
        )
    except Exception as e:
        logger.error(f"Error getting providers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def include_auth_routes(app):
    """
    Include auth routes with /api prefix to match frontend expectations

    Args:
        app: FastAPI application instance
    """
    app.include_router(router, prefix="/api/auth")
    logger.info("Auth routes included at /api/auth/*")


# Add a simple test endpoint
@router.get("/test")
async def test_endpoint():
    """Test endpoint to check response format"""
    return {"direct": "response", "token": "test_token"}

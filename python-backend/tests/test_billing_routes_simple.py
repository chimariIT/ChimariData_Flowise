"""
Simplified Billing Routes Test

Tests billing routes without using app fixture to avoid circular imports.
"""

import sys
from pathlib import Path


def test_billing_routes_registration():
    """Test that billing routes are properly registered"""
    # Add src to path for imports
    src_dir = str(Path(__file__).parent / "src")
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)

    # Import main and initialize services manually
    from main import initialize_services
    initialize_services()

    # Now get the app
    from main import app

    billing_paths = [route.path for route in app.routes if "/billing" in route.path]

    assert len(billing_paths) > 0, f"Expected billing routes to be registered, got: {billing_paths}"

    print(f"✓ Billing routes registered: {billing_paths}")


if __name__ == "__main__":
    # Run test directly
    test_billing_routes_registration()
    print("\n✓ All tests passed!")

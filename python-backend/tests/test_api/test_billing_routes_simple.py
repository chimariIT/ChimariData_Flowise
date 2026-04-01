"""
Simplified Billing Routes Test

Tests billing routes without using app fixture to avoid circular imports.
"""

import pytest
import sys
from pathlib import Path
import importlib


def test_billing_routes_registration():
    """Test that billing routes are properly registered"""
    # Add src to path for imports
    src_dir = str(Path(__file__).parent.parent / "src")
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)

    # Use importlib to import main module explicitly
    spec = importlib.util.spec_from_file_location("main", src_dir + "/main.py")
    main = importlib.util.module_from_spec(spec)

    app = main.app

    billing_paths = [route.path for route in app.routes if "/billing" in route.path]

    assert len(billing_paths) > 0, f"Expected billing routes to be registered, got: {billing_paths}"

    print(f"✓ Billing routes registered: {billing_paths}")


if __name__ == "__main__":
    # Run test directly
    test_billing_routes_registration()
    print("\n✓ All tests passed!")

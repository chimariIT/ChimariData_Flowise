"""
Migration CLI Helper

Convenient script for running database migrations.
"""

import os
import sys
import subprocess
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()


def run_command(command: str, description: str) -> bool:
    """Run a shell command and return success status"""
    print(f"\n{'=' * 60}")
    print(f"Running: {description}")
    print(f"{'=' * 60}")
    print(f"\n$ {command}\n")

    result = subprocess.run(
        command,
        shell=True,
        cwd=Path(__file__).parent.parent,
        env=os.environ.copy(),
    )

    if result.returncode == 0:
        print(f"\n✓ {description} completed successfully")
        return True
    else:
        print(f"\n✗ {description} failed with exit code {result.returncode}")
        return False


def migrate(revision: str = "head"):
    """Run database migrations"""
    return run_command(
        f"alembic upgrade {revision}",
        f"Database Migration (to {revision})"
    )


def downgrade(revision: str = "-1"):
    """Rollback database migration"""
    return run_command(
        f"alembic downgrade {revision}",
        f"Database Rollback (to {revision})"
    )


def create_migration(message: str):
    """Create a new migration file"""
    return run_command(
        f'alembic revision -m "{message}"',
        f"Creating Migration: {message}"
    )


def show_current():
    """Show current migration version"""
    return run_command(
        "alembic current",
        "Current Migration Version"
    )


def show_history():
    """Show migration history"""
    return run_command(
        "alembic history",
        "Migration History"
    )


def stamp(revision: str = "head"):
    """Stamp database with specific revision without running migrations"""
    return run_command(
        f"alembic stamp {revision}",
        f"Stamping Database to {revision}"
    )


def reset_db():
    """Reset database (drop all tables and recreate)"""
    print("\n" + "=" * 60)
    print("WARNING: This will drop all database tables!")
    print("=" * 60)
    print("\nThis is a DESTRUCTIVE operation.")
    print("All data will be PERMANENTLY lost.")
    print("\nType 'yes' to confirm: ", end="", flush=True)

    confirmation = input()

    if confirmation.lower() != "yes":
        print("\n✗ Database reset cancelled")
        return False

    print("\nDropping all tables...")

    success = run_command(
        "alembic downgrade base",
        "Dropping all tables"
    )

    if success:
        print("\nRunning initial migration...")
        return migrate()
    else:
        return False


def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2:
        print("""
Chimaridata Database Migration Tool

Usage:
  python scripts/migrate.py <command> [arguments]

Commands:
  migrate [revision]    Run migrations (default: head)
  downgrade [revision]  Rollback migrations (default: one step back)
  create <message>       Create new migration file
  current              Show current migration version
  history               Show migration history
  stamp [revision]      Stamp database without running migrations
  reset                 Reset database (WARNING: destructive!)

Examples:
  python scripts/migrate.py migrate
  python scripts/migrate.py create "add new column"
  python scripts/migrate.py downgrade -1
  python scripts/migrate.py current
  python scripts/migrate.py reset
        """)
        return 1

    command = sys.argv[1]
    args = sys.argv[2:]

    commands = {
        "migrate": lambda: migrate(args[0] if args else "head"),
        "downgrade": lambda: downgrade(args[0] if args else "-1"),
        "create": lambda: create_migration(args[0] if args else "new migration"),
        "current": show_current,
        "history": show_history,
        "stamp": lambda: stamp(args[0] if args else "head"),
        "reset": reset_db,
    }

    if command in commands:
        success = commands[command]()
        sys.exit(0 if success else 1)
    else:
        print(f"Unknown command: {command}")
        print("Run 'python scripts/migrate.py' for help")
        sys.exit(1)


if __name__ == "__main__":
    main()

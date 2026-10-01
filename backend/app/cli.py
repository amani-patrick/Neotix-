"""Management CLI.

Usage:
    python -m app.cli import-episodes seed/episodes.csv
"""

import argparse
import sys

from app.db.session import SessionLocal
from app.services.import_service import import_episodes_csv


def cmd_import_episodes(args: argparse.Namespace) -> int:
    db = SessionLocal()
    try:
        report = import_episodes_csv(db, args.csv_path)
    finally:
        db.close()

    print("Episode import complete")
    print()
    print(f"Total rows: {report.total_rows:,}")
    print(f"Imported:   {report.imported:,}")
    print(f"Duplicate:  {report.duplicate:,}")
    print(f"Invalid:    {report.invalid:,}")
    print()
    if report.reasons:
        print("Reasons:")
        for reason, count in report.reasons.items():
            examples = report.examples.get(reason, [])
            example_txt = f"  e.g. {', '.join(examples)}" if examples else ""
            print(f"  {reason}: {count}{example_txt}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="Dataset Request Desk CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    imp = sub.add_parser("import-episodes", help="Import episodes from a CSV file (idempotent)")
    imp.add_argument("csv_path", help="Path to the episodes CSV export")
    imp.set_defaults(func=cmd_import_episodes)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

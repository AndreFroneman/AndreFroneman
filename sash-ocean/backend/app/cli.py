"""SASH Ocean command-line interface.

    python -m app.cli migrate               # apply database migrations
    python -m app.cli seed-demo [--force]   # (re)generate the synthetic demonstration world
    python -m app.cli run-analytics         # run detection, risk scoring and alerting once
    python -m app.cli create-user EMAIL ROLE [--org NAME]
    python -m app.cli create-api-key NAME --org NAME [--role API_USER|SENSOR] [--rate N]
    python -m app.cli worker                # background worker (feeds, connectors, analytics)
"""
from __future__ import annotations

import argparse
import getpass
import json
import logging
import sys

from sqlalchemy import select


def _migrate() -> None:
    from alembic import command
    from alembic.config import Config
    from app.core.config import BACKEND_ROOT

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(cfg, "head")


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="sash")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    p = sub.add_parser("seed-demo")
    p.add_argument("--force", action="store_true")
    sub.add_parser("run-analytics")
    p = sub.add_parser("create-user")
    p.add_argument("email")
    p.add_argument("role", choices=["ADMIN", "ANALYST", "CUSTOMER", "API_USER", "SENSOR"])
    p.add_argument("--org", default="SASH Operations")
    p.add_argument("--name", default="")
    p = sub.add_parser("create-api-key")
    p.add_argument("name")
    p.add_argument("--org", required=True)
    p.add_argument("--role", default="API_USER", choices=["API_USER", "SENSOR"])
    p.add_argument("--rate", type=int, default=None)
    sub.add_parser("worker")
    args = parser.parse_args(argv)

    if args.cmd == "migrate":
        _migrate()
        return 0
    if args.cmd == "worker":
        from app.worker import run_worker

        run_worker()
        return 0

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        if args.cmd == "seed-demo":
            from app.demo.seed import seed_demo

            print(json.dumps(seed_demo(db, force=args.force), indent=2, default=str))
        elif args.cmd == "run-analytics":
            from app.services.pipeline import run_analytics

            print(json.dumps(run_analytics(db, kind="MANUAL"), indent=2, default=str))
        elif args.cmd == "create-user":
            from app.core.security import hash_password, password_policy_errors
            from app.models import Organisation, User

            pw = getpass.getpass("Password: ")
            errs = password_policy_errors(pw)
            if errs:
                print("Password " + "; ".join(errs), file=sys.stderr)
                return 1
            org = db.scalar(select(Organisation).where(Organisation.name == args.org))
            if org is None:
                org = Organisation(name=args.org, tier="PROFESSIONAL")
                db.add(org)
                db.flush()
            db.add(User(email=args.email.lower(), full_name=args.name, role=args.role, organisation_id=org.id,
                        password_hash=hash_password(pw)))
            db.commit()
            print(f"created {args.role} user {args.email}")
        elif args.cmd == "create-api-key":
            from app.core.security import generate_api_key
            from app.models import ApiKey, Organisation

            org = db.scalar(select(Organisation).where(Organisation.name == args.org))
            if org is None:
                print(f"organisation '{args.org}' not found", file=sys.stderr)
                return 1
            full, prefix, digest = generate_api_key()
            db.add(ApiKey(organisation_id=org.id, name=args.name, prefix=prefix, key_hash=digest, role=args.role,
                          rate_limit_per_min=args.rate))
            db.commit()
            print("API key (shown once, store it securely):")
            print(full)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

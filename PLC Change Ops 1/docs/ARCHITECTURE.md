# PLC ChangeOps architecture

## Design intent

PLC ChangeOps is an orchestration and assurance layer. Nautilus remains the IEC 61131-3 runtime and compiler; Git remains the system of record. The workbench turns their capabilities into a repeatable plant workflow without giving a browser direct controller access.

## Trust zones

1. **User plane:** Browser, SSO and HTTPS reverse proxy.
2. **Management plane:** PLC ChangeOps API, policy engine, audit log and job queue.
3. **Engineering plane:** Git provider and CI runners that generate and verify artifacts.
4. **Control edge:** A plant-local adapter with allowlisted targets and operations.
5. **Control plane:** Nautilus runtime, EtherNet/IP devices and Ignition/Sparkplug B.

Only the control-edge adapter is permitted to communicate southbound. A release package is immutable and includes its source commit, generated tag/binding manifests, test evidence, approval claims and rollback artifact.

## Core services for the production phase

| Service | Responsibility |
| --- | --- |
| Web/API | Projects, tag registry, diffs, approvals and audit views |
| Generator | Canonical model to PLC declarations, HMI bindings and Sparkplug namespace |
| Verifier | Schema rules, compile, simulation, unit tests and policy checks |
| Job queue | Serialized controller work with retries, timeouts and idempotency keys |
| Edge adapter | Allowlisted Nautilus/controller commands and field-state capture |
| Evidence store | Append-only change, test, approval, deployment and rollback records |

## Safety gates

- No deployment from an unprotected branch.
- No artifact whose content hash differs from the approved test artifact.
- Two-person approval for medium/high-risk change sets.
- Maintenance-window enforcement at the edge, not only in the browser.
- Pre-deploy backup and automatic rollback package verification.
- Idempotent release jobs and exclusive per-controller locks.
- Emergency stop remains independent of this application.

## Adapter contract

Every southbound adapter should implement `discover`, `readState`, `validate`, `stage`, `activate`, `verify` and `rollback`. The first production adapter should wrap Nautilus. Vendor-specific PLC and HMI adapters can then reuse the same workflow and evidence model.

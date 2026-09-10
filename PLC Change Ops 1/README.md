# PLC ChangeOps

PLC ChangeOps is a container-ready controls engineering workbench designed to sit around Nautilus and a Git-based IEC 61131-3 workflow. It gives engineers one visual path from tag import to generated bindings, automated verification, approval, release, rollback and field-to-Git reconciliation.

## Run with Docker

```bash
docker compose up --build -d
```

Open `http://localhost:8080`. Health is available at `GET /api/health` and connector discovery at `GET /api/integrations`.

## Product boundary

This repository is a functional product prototype and deployment shell. The interface interactions, container health endpoint and webhook contract work. Production adapters for Nautilus, the Git provider, EtherNet/IP and Ignition/Sparkplug B should be connected behind the API boundary. Browser code must never talk directly to a PLC.

## Recommended production topology

- Run PLC ChangeOps in the plant DMZ or engineering services zone.
- Use a narrowly scoped edge adapter for southbound Nautilus/controller communication.
- Connect Git, CI and identity northbound over HTTPS.
- Require protected branch approval, a valid test artifact and an approved maintenance window.
- Store source commit, generated artifacts, test evidence, approver identities and rollback package for every deployment.

## Local development

```bash
npm ci
npm run dev
```

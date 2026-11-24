# Changelog

All notable changes to the CMMS Permit to Work (PTW) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-11-24 - Stage 1: Skeleton, Shared Package, and Dynamic Registry

### Added
- Monorepo workspace skeleton (`packages/shared`, `apps/api`, `apps/web` stub) with Node 20+ ESM and strict TypeScript.
- Core domain enums and types in `@ptw/shared`:
  - `UserRole`: `REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`.
  - `PermitStatus`: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `EXPIRED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED`.
  - `ApprovalStatus`, `WorkLogKind`, `ExtensionStatus`.
- Declarative permit type registry for:
  - `HOT_WORK` (welding/grinding/cutting/soldering, fire watch, extinguisher, combustible clearance, gas test).
  - `CONFINED_SPACE` (space ID, entry point, atmosphere test, attendant, rescue plan, ventilation).
  - `WORKING_AT_HEIGHT` (height in meters, access method, fall arrest, anchor points, drop zone barricading).
  - `ELECTRICAL_LOTO` (equipment tag, voltage level, isolation points, lock numbers, tag numbers, earthing, dead-tested verification).
- Dynamic Zod schema compiler (`packages/shared/src/registry/schema-generator.ts`) supporting:
  - `draft` mode: permissive validation allowing incremental field saves.
  - `submit` mode: strict type, bound (`min`/`max`), non-empty list, and domain timing rules.
  - Extensibility test verifying 5th permit type (`EXCAVATION`) registration with zero code changes.
- Express API configuration (`apps/api/src/config/env.ts`) with Zod-validated environment variables.
- Project documentation in `docs/`:
  - `PROGRESS.md`: append-only progress log.
  - `DECISIONS.md`: architectural decision records (`D-001` through `D-009`).
  - `AI_USAGE.md`: log of AI-generated components, human reviews, and error corrections.
  - `KNOWN_ISSUES.md`: deferred scope and stage boundaries.
  - `ARCHITECTURE.md`: component architecture, ERD, and state machine diagram.
  - `API.md`: endpoints specification, security roles, and standardized error envelopes.
- Git hooks and CI workflow (`.github/workflows/ci.yml`).

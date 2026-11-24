# AI Usage Log - CMMS Permit to Work (PTW)

This document tracks all AI-assisted engineering activities, prompts, generated modules, manual reviews, and human verifications.

---

## Stage 1: Skeleton, Shared Package & Type Registry
- **AI-Assisted Deliverables**:
  - Monorepo package configurations (`package.json`, `tsconfig.base.json`, workspace tsconfigs).
  - `@ptw/shared` domain definitions: roles, permit statuses, terminal states, work log kinds.
  - Declarative permit type registry for `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`.
  - Dynamic Zod schema generator (`buildDetailsZodSchema`, `buildDraftSchema`, `validatePermitDetails`).
  - Unit tests verifying schema compilation, draft leniency, submit strictness, gas test timing checks, and 5th-type (`EXCAVATION`) runtime registration.
  - API environment parser with Zod validation.
  - Architecture decision records (`D-001` through `D-009`) in `docs/DECISIONS.md`.
- **Human Review & Corrections**:
  - **Correction 1**: Fixed test import path error in `packages/shared/src/registry/schema-generator.test.ts` where `validatePermitDetails` was initially imported from `./definitions.js` rather than `./schema-generator.js`.
  - **Correction 2**: Cleaned up unused import `PermitTypeConfig` in `schema-generator.ts` and added explicit TypeScript parameter types `(i: ValidationIssue) => i.path.join('.')` to satisfy strict compiler flags (`noImplicitAny`, `noUnusedLocals`).
  - **Correction 3**: Added test file exclusion (`**/*.test.ts`) to `packages/shared/tsconfig.json` and `apps/api/tsconfig.json` so build outputs only contain production code while Vitest handles test execution.
  - **Correction 4**: Swapped PowerShell chaining operator from bash `&&` to `;` for Windows execution compatibility.
- **Uncertainties / Assumptions Verified**:
  - Verified that `bcryptjs` is fully compatible with standard bcrypt 10-round hashes without requiring Visual C++ Build Tools on Windows.
  - Verified that atmospheric readings in confined spaces require `tested_at` to be validated against `planned_start` to prevent historical data reuse.

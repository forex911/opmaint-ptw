# System Architecture - CMMS Permit to Work (PTW)

## 1. High-Level System Architecture

The Permit to Work (PTW) module is a backend service for industrial plant maintenance safety management. It governs the authorization lifecycle of dangerous maintenance operations (hot work, confined space, working at height, electrical LOTO).

```mermaid
flowchart TD
    Client["Web / Mobile CMMS Client"] -->|HTTP / JSON + Cookie| Express["Express API Server (apps/api)"]
    
    subgraph ExpressAPI ["Express API Layer"]
        AuthMid["Auth & Role Middleware"]
        PermitCtrl["Permits Controller"]
        TransService["State Machine Transition Service"]
        AuditService["Audit Log Service"]
        ExpiryService["Lazy Expiry & Sweeper"]
    end
    
    subgraph SharedPkg ["Shared Core (@ptw/shared)"]
        Enums["Roles & Statuses"]
        Registry["Permit Type Registry"]
        ZodGen["Dynamic Schema Generator"]
        ApiTypes["API Error Envelope & Types"]
    end
    
    Express --> AuthMid
    AuthMid --> PermitCtrl
    PermitCtrl --> TransService
    TransService --> AuditService
    PermitCtrl --> SharedPkg
    TransService --> SharedPkg
    
    subgraph Database ["PostgreSQL Database"]
        PermitsTable["permits (Core + details JSONB)"]
        ApprovalsTable["permit_approvals"]
        LogsTable["permit_work_logs"]
        AuditTable["audit_log (Append-only Trigger)"]
    end
    
    TransService -->|SELECT ... FOR UPDATE| PermitsTable
    TransService --> ApprovalsTable
    AuditService -->|INSERT ONLY| AuditTable
    ExpiryService -->|Overdue Sweep| PermitsTable
```

---

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    PLANTS ||--o{ AREAS : contains
    AREAS ||--o{ EQUIPMENT : contains
    USERS ||--o{ AREAS : owns
    USERS ||--o{ PERMITS : requests
    PLANTS ||--o{ PERMITS : locates
    AREAS ||--o{ PERMITS : locates
    EQUIPMENT ||--o{ PERMITS : isolates
    
    PERMITS ||--o{ PERMIT_PRECAUTIONS : requires
    PERMITS ||--o{ PERMIT_APPROVALS : mandates
    PERMITS ||--o{ PERMIT_WORK_LOGS : records
    PERMITS ||--o{ PERMIT_EXTENSIONS : tracks
    PERMITS ||--o{ AUDIT_LOG : audits
    USERS ||--o{ AUDIT_LOG : acts

    USERS {
        uuid id PK
        string name
        string email UK
        string password_hash
        string role
    }

    PLANTS {
        uuid id PK
        string name
    }

    AREAS {
        uuid id PK
        uuid plant_id FK
        string name
        uuid owner_id FK
    }

    EQUIPMENT {
        uuid id PK
        uuid area_id FK
        string tag
        string name
    }

    PERMITS {
        uuid id PK
        string permit_no UK
        string type
        string status
        uuid requester_id FK
        string contractor_team
        text work_description
        uuid plant_id FK
        uuid area_id FK
        uuid equipment_id FK
        timestamptz planned_start
        timestamptz planned_end
        text[] hazards
        text[] ppe
        jsonb details
        int version
        timestamptz created_at
        timestamptz updated_at
        text completion_notes
        timestamptz closed_at
        uuid verified_by FK
        timestamptz verified_at
    }

    PERMIT_APPROVALS {
        uuid id PK
        uuid permit_id FK
        string required_role
        uuid required_user_id FK
        string status
        uuid decided_by FK
        timestamptz decided_at
        text comment
        text signature_data
    }

    PERMIT_WORK_LOGS {
        uuid id PK
        uuid permit_id FK
        uuid logged_by FK
        text note
        string kind
        timestamptz created_at
    }

    PERMIT_EXTENSIONS {
        uuid id PK
        uuid permit_id FK
        uuid requested_by FK
        int extra_hours
        text reason
        string status
        uuid decided_by FK
        timestamptz decided_at
    }

    AUDIT_LOG {
        bigserial id PK
        uuid permit_id FK
        uuid actor_id FK
        string action
        jsonb from_value
        jsonb to_value
        text comment
        timestamptz created_at
    }
```

---

## 3. Permit Lifecycle State Machine

All transitions are strictly managed in the backend state machine. Direct writes to permit status are prohibited.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Create Draft
    
    DRAFT --> PENDING_APPROVAL : Submit (Requester, Full Validation)
    DRAFT --> CANCELLED : Cancel (Owner / Admin)
    
    PENDING_APPROVAL --> APPROVED : All Approvals Signed
    PENDING_APPROVAL --> REJECTED : Reject (Any Approver, Reason required)
    PENDING_APPROVAL --> EXPIRED : Overdue (now > planned_end)
    PENDING_APPROVAL --> CANCELLED : Cancel (Owner / Admin)
    
    APPROVED --> ACTIVE : Activate (Requester/Safety Officer, now >= planned_start)
    APPROVED --> EXPIRED : Overdue (now > planned_end)
    APPROVED --> CANCELLED : Cancel (Owner / Safety Officer / Admin)
    
    ACTIVE --> SUSPENDED : Suspend (Safety Officer / Admin)
    ACTIVE --> CLOSED : Close (Requester, Notes required)
    ACTIVE --> EXPIRED : Overdue (now > planned_end)
    ACTIVE --> CANCELLED : Cancel (Safety Officer / Admin)
    
    SUSPENDED --> ACTIVE : Resume (Safety Officer, Not expired)
    SUSPENDED --> EXPIRED : Overdue (now > planned_end)
    SUSPENDED --> CANCELLED : Cancel (Safety Officer / Admin)
    
    CLOSED --> CLOSED_VERIFIED : Verify (Safety Officer, No self-verification)
    
    REJECTED --> [*]
    EXPIRED --> [*]
    CLOSED_VERIFIED --> [*]
    CANCELLED --> [*]
```

---

## 4. Permit Type Extensibility Architecture

```mermaid
flowchart LR
    Config["PermitTypeConfig (code, fields, rules)"] --> Registry["Permit Type Registry (@ptw/shared)"]
    Registry -->|compile| DraftSchema["Zod Draft Schema (Permissive)"]
    Registry -->|compile| SubmitSchema["Zod Submit Schema (Strict)"]
    Registry -->|evaluate| DomainRules["Domain Rules (e.g. 60m Gas Test)"]
    
    DraftSchema --> DraftHandler["POST /permits & PATCH /permits/:id"]
    SubmitSchema --> SubmitHandler["POST /permits/:id/submit"]
    DomainRules --> SubmitHandler
```

---

## 5. Background Expiry Sweeper & Distributed Transaction Flow

```mermaid
sequenceDiagram
    autonumber
    participant Sweeper as ExpirySweeper / POST /internal/sweep
    participant DB as PostgreSQL 16 (ptw_cmms)
    participant StateMachine as transition() Engine
    participant Audit as audit_log (Append-Only)

    Note over Sweeper,DB: 1. Begin Batch Transaction & Row-Level Locking
    Sweeper->>DB: BEGIN;
    Sweeper->>DB: SELECT id FROM permits WHERE status IN ('PENDING_APPROVAL','APPROVED','ACTIVE','SUSPENDED') AND planned_end <= NOW() ORDER BY planned_end ASC FOR UPDATE SKIP LOCKED;
    DB-->>Sweeper: candidateIds = [id1, id2, ...] (Row locks held on connection)

    Note over Sweeper,Audit: 2. Per-Permit Savepoints & Authoritative Transitions
    loop For each candidate permit ID
        Sweeper->>StateMachine: transition(id, 'expire', actor=SYSTEM, client, now)
        StateMachine->>DB: SAVEPOINT sp_id;
        StateMachine->>DB: SELECT * FROM permits WHERE id = id FOR UPDATE;
        StateMachine->>DB: UPDATE permits SET status = 'EXPIRED', version = version + 1 WHERE id = id;
        StateMachine->>Audit: INSERT INTO audit_log (actor_id = NULL, action = 'expire', ...);
        alt Transition & Audit Success
            StateMachine->>DB: RELEASE SAVEPOINT sp_id;
        else Transition Failure / Constraint Error
            StateMachine->>DB: ROLLBACK TO SAVEPOINT sp_id;
        end
    end

    Note over Sweeper,DB: 3. Atomic Commit & Release of Distributed Row Locks
    Sweeper->>DB: COMMIT;
    Note over DB: All transitions and audit entries committed simultaneously; candidate row locks released.
```


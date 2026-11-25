import { getPool, getNextPermitNumber } from '../../db/client.js';
import { AppError } from '../../errors/app-error.js';
import {
  PermitStatus,
  UserRole,
  ALL_PERMIT_STATUSES,
  validatePermitDetails,
} from '@ptw/shared';
import { mapPermitRow } from './state-machine/transition-engine.js';
import { getAllowedActions } from './state-machine/transitions.js';
import { validateLocationConsistency } from './services/permit-validation.service.js';
import { bulkExpireOverduePermits } from './services/expiry.service.js';
import type { Permit, TransitionActor, PermitApproval } from './state-machine/types.js';

export interface CreatePermitInput {
  type: string;
  plantId: string;
  areaId: string;
  equipmentId?: string | null;
  contractorTeam: string;
  workDescription: string;
  plannedStart: string;
  plannedEnd: string;
  hazards?: string[];
  ppe?: string[];
  details?: Record<string, unknown>;
}

export interface UpdatePermitInput {
  version: number;
  plantId?: string;
  areaId?: string;
  equipmentId?: string | null;
  contractorTeam?: string;
  workDescription?: string;
  plannedStart?: string;
  plannedEnd?: string;
  hazards?: string[];
  ppe?: string[];
  details?: Record<string, unknown>;
}

export interface ListPermitsFilter {
  status?: PermitStatus;
  type?: string;
  areaId?: string;
  from?: string;
  to?: string;
  mine?: boolean;
  pendingMyApproval?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export class PermitsService {
  /**
   * Creates a new permit in DRAFT status.
   * Validates location hierarchy, draft details schema, and logs initial audit row.
   */
  async createPermit(input: CreatePermitInput, actor: TransitionActor): Promise<any> {
    const pool = getPool();

    // 1. Validate location hierarchy
    await validateLocationConsistency(pool, {
      plantId: input.plantId,
      areaId: input.areaId,
      equipmentId: input.equipmentId,
    });

    // 2. Validate details using draft mode
    const details = input.details || {};
    const validation = validatePermitDetails(input.type, details, 'draft', {
      plannedStart: new Date(input.plannedStart),
      plannedEnd: new Date(input.plannedEnd),
      now: new Date(),
    });

    if (!validation.valid) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.issues) {
        const path = issue.path.join('.') || 'details';
        fieldErrors[path] = fieldErrors[path] || [];
        fieldErrors[path].push(issue.message);
      }
      throw new AppError(422, 'VALIDATION_ERROR', 'Permit details validation failed', fieldErrors);
    }

    // 3. Generate sequential permit number
    const permitNo = await getNextPermitNumber(pool);

    // 4. Insert into database
    const insertRes = await pool.query(
      `INSERT INTO permits (
        permit_no, type, status, requester_id, contractor_team, work_description,
        plant_id, area_id, equipment_id, planned_start, planned_end, hazards, ppe, details, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
      RETURNING *`,
      [
        permitNo,
        input.type,
        PermitStatus.DRAFT,
        actor.id,
        input.contractorTeam,
        input.workDescription,
        input.plantId,
        input.areaId,
        input.equipmentId,
        new Date(input.plannedStart),
        new Date(input.plannedEnd),
        input.hazards || [],
        input.ppe || [],
        JSON.stringify(details),
      ]
    );

    const createdPermit = insertRes.rows[0];

    // 5. Audit log
    await pool.query(
      `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
       VALUES ($1, $2, 'create', NULL, $3, 'Permit drafted')`,
      [
        createdPermit.id,
        actor.id,
        JSON.stringify({ status: PermitStatus.DRAFT, permitNo: createdPermit.permit_no }),
      ]
    );

    return mapPermitRow(createdPermit);
  }

  /**
   * Updates an existing permit in DRAFT or PENDING_APPROVAL.
   * Enforces optimistic locking via version check.
   * If in PENDING_APPROVAL, resets approvals through the engine back to DRAFT.
   */
  async updatePermit(id: string, input: UpdatePermitInput, actor: TransitionActor): Promise<any> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch permit with row lock
      const permitRes = await client.query('SELECT * FROM permits WHERE id = $1 FOR UPDATE', [id]);
      if (permitRes.rows.length === 0) {
        throw AppError.notFound(`Permit with ID '${id}' not found`);
      }

      const current = permitRes.rows[0];

      // 2. Ownership check: requester or admin
      if (current.requester_id !== actor.id && actor.role !== UserRole.ADMIN) {
        throw new AppError(403, 'NOT_PERMIT_OWNER', 'Only the permit owner or an administrator can edit this permit');
      }

      // 3. Status barrier: only DRAFT or PENDING_APPROVAL
      if (current.status !== PermitStatus.DRAFT && current.status !== PermitStatus.PENDING_APPROVAL) {
        throw new AppError(
          409,
          'ILLEGAL_TRANSITION',
          `Permit in status '${current.status}' cannot be updated; only DRAFT or PENDING_APPROVAL permits may be edited`
        );
      }

      // 4. Optimistic locking version check
      if (input.version !== current.version) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          `Permit version conflict. Current database version is ${current.version}, provided version was ${input.version}. Please refresh and re-apply changes.`
        );
      }

      // 5. Validate location hierarchy if location fields are changing
      const nextPlantId = input.plantId || current.plant_id;
      const nextAreaId = input.areaId || current.area_id;
      const nextEquipmentId =
        input.equipmentId !== undefined ? input.equipmentId : current.equipment_id;

      if (input.plantId || input.areaId || input.equipmentId !== undefined) {
        await validateLocationConsistency(client as any, {
          plantId: nextPlantId,
          areaId: nextAreaId,
          equipmentId: nextEquipmentId,
        });
      }

      // 6. Validate dates
      const nextStart = input.plannedStart ? new Date(input.plannedStart) : new Date(current.planned_start);
      const nextEnd = input.plannedEnd ? new Date(input.plannedEnd) : new Date(current.planned_end);
      if (nextEnd <= nextStart) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          plannedEnd: ['planned_end must be strictly greater than planned_start'],
        });
      }

      // 7. Validate draft details schema
      const nextDetails = input.details !== undefined ? input.details : current.details;
      if (input.details) {
        const validation = validatePermitDetails(current.type, nextDetails, 'draft', {
          plannedStart: nextStart,
          plannedEnd: nextEnd,
          now: new Date(),
        });
        if (!validation.valid) {
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of validation.issues) {
            const path = issue.path.join('.') || 'details';
            fieldErrors[path] = fieldErrors[path] || [];
            fieldErrors[path].push(issue.message);
          }
          throw new AppError(422, 'VALIDATION_ERROR', 'Permit details validation failed', fieldErrors);
        }
      }

      // 8. If permit is in PENDING_APPROVAL, reset approvals back to PENDING (keep rows, do not move to DRAFT)
      let nextStatus = current.status;
      if (current.status === PermitStatus.PENDING_APPROVAL) {
        // Query existing approvals to record who had approved
        const existingApprovalsRes = await client.query(
          'SELECT id, required_role, required_user_id, status, decided_by FROM permit_approvals WHERE permit_id = $1',
          [id]
        );
        const previouslyApproved = existingApprovalsRes.rows.filter((a) => a.status === 'APPROVED');

        // Reset every approval row to PENDING
        await client.query(
          `UPDATE permit_approvals 
           SET status = 'PENDING', decided_by = NULL, decided_at = NULL, comment = NULL 
           WHERE permit_id = $1`,
          [id]
        );

        // Write approvals_reset audit row listing who had approved per D-021
        await client.query(
          `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
           VALUES ($1, $2, 'approvals_reset', $3, $4, $5)`,
          [
            id,
            actor.id,
            JSON.stringify({
              previouslyApproved: previouslyApproved.map((a) => ({
                id: a.id,
                requiredRole: a.required_role,
                decidedBy: a.decided_by,
              })),
            }),
            JSON.stringify({ status: 'PENDING' }),
            'Permit parameters modified during review; all approval tiers reset to PENDING',
          ]
        );
      }

      // 9. Execute update and calculate diffs
      const nextContractor = input.contractorTeam !== undefined ? input.contractorTeam : current.contractor_team;
      const nextDescription = input.workDescription !== undefined ? input.workDescription : current.work_description;
      const nextHazards = input.hazards !== undefined ? input.hazards : current.hazards;
      const nextPpe = input.ppe !== undefined ? input.ppe : current.ppe;

      const updateRes = await client.query(
        `UPDATE permits
         SET plant_id = $1, area_id = $2, equipment_id = $3,
             contractor_team = $4, work_description = $5,
             planned_start = $6, planned_end = $7,
             hazards = $8, ppe = $9, details = $10,
             status = $11, version = version + 1, updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [
          nextPlantId,
          nextAreaId,
          nextEquipmentId,
          nextContractor,
          nextDescription,
          nextStart,
          nextEnd,
          nextHazards,
          nextPpe,
          JSON.stringify(nextDetails),
          nextStatus,
          id,
        ]
      );

      const updated = updateRes.rows[0];

      // Record one audit row per changed field (from/to) per D-021
      const fieldDiffs: Array<{ field: string; from: any; to: any }> = [];

      if (input.contractorTeam !== undefined && input.contractorTeam !== current.contractor_team) {
        fieldDiffs.push({ field: 'contractorTeam', from: current.contractor_team, to: input.contractorTeam });
      }
      if (input.workDescription !== undefined && input.workDescription !== current.work_description) {
        fieldDiffs.push({ field: 'workDescription', from: current.work_description, to: input.workDescription });
      }
      if (input.plantId !== undefined && input.plantId !== current.plant_id) {
        fieldDiffs.push({ field: 'plantId', from: current.plant_id, to: input.plantId });
      }
      if (input.areaId !== undefined && input.areaId !== current.area_id) {
        fieldDiffs.push({ field: 'areaId', from: current.area_id, to: input.areaId });
      }
      if (input.equipmentId !== undefined && input.equipmentId !== current.equipment_id) {
        fieldDiffs.push({ field: 'equipmentId', from: current.equipment_id, to: input.equipmentId });
      }
      if (input.plannedStart !== undefined && new Date(input.plannedStart).getTime() !== new Date(current.planned_start).getTime()) {
        fieldDiffs.push({ field: 'plannedStart', from: current.planned_start, to: nextStart.toISOString() });
      }
      if (input.plannedEnd !== undefined && new Date(input.plannedEnd).getTime() !== new Date(current.planned_end).getTime()) {
        fieldDiffs.push({ field: 'plannedEnd', from: current.planned_end, to: nextEnd.toISOString() });
      }
      if (input.hazards !== undefined && JSON.stringify(input.hazards) !== JSON.stringify(current.hazards)) {
        fieldDiffs.push({ field: 'hazards', from: current.hazards, to: input.hazards });
      }
      if (input.ppe !== undefined && JSON.stringify(input.ppe) !== JSON.stringify(current.ppe)) {
        fieldDiffs.push({ field: 'ppe', from: current.ppe, to: input.ppe });
      }
      if (input.details !== undefined && JSON.stringify(input.details) !== JSON.stringify(current.details)) {
        fieldDiffs.push({ field: 'details', from: current.details, to: input.details });
      }

      for (const diff of fieldDiffs) {
        await client.query(
          `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
           VALUES ($1, $2, 'update', $3, $4, $5)`,
          [
            id,
            actor.id,
            JSON.stringify({ [diff.field]: diff.from }),
            JSON.stringify({ [diff.field]: diff.to }),
            `Field '${diff.field}' modified while in ${current.status}`,
          ]
        );
      }

      await client.query('COMMIT');
      return mapPermitRow(updated);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves permit details with joined human-readable references,
   * associated approvals, active work logs, and computed allowed actions.
   */
  async getPermitById(id: string, actor: TransitionActor): Promise<any> {
    const pool = getPool();

    // Lazy expiry check first
    await bulkExpireOverduePermits(pool);

    const permitRes = await pool.query(
      `SELECT 
         p.*,
         pl.name AS plant_name,
         a.name AS area_name,
         e.tag AS equipment_tag,
         e.name AS equipment_name,
         u.name AS requester_name,
         u.email AS requester_email
       FROM permits p
       LEFT JOIN plants pl ON pl.id = p.plant_id
       LEFT JOIN areas a ON a.id = p.area_id
       LEFT JOIN equipment e ON e.id = p.equipment_id
       LEFT JOIN users u ON u.id = p.requester_id
       WHERE p.id = $1`,
      [id]
    );

    if (permitRes.rows.length === 0) {
      throw AppError.notFound(`Permit with ID '${id}' not found`);
    }

    const row = permitRes.rows[0];
    const permit: Permit = mapPermitRow(row);

    // Fetch approvals
    const approvalsRes = await pool.query(
      `SELECT 
         pa.*,
         u.name AS decider_name,
         u.email AS decider_email
       FROM permit_approvals pa
       LEFT JOIN users u ON u.id = pa.decided_by
       WHERE pa.permit_id = $1
       ORDER BY pa.id ASC`,
      [id]
    );

    const approvals: PermitApproval[] = approvalsRes.rows.map((r) => ({
      id: r.id,
      permitId: r.permit_id,
      requiredRole: r.required_role,
      requiredUserId: r.required_user_id,
      status: r.status,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at ? new Date(r.decided_at) : null,
      comment: r.comment,
      signatureData: r.signature_data,
    }));

    // Fetch work logs
    const workLogsRes = await pool.query(
      `SELECT 
         wl.id,
         wl.permit_id AS "permitId",
         wl.logged_by AS "loggedBy",
         u.name AS "loggedByName",
         wl.note,
         wl.kind,
         wl.created_at AS "createdAt"
       FROM permit_work_logs wl
       LEFT JOIN users u ON u.id = wl.logged_by
       WHERE wl.permit_id = $1
       ORDER BY wl.created_at ASC`,
      [id]
    );

    // Compute dynamic allowed actions
    const allowedActions = getAllowedActions(permit, actor, approvals, new Date());

    return {
      permit: {
        ...permit,
        plantName: row.plant_name,
        areaName: row.area_name,
        equipmentTag: row.equipment_tag,
        equipmentName: row.equipment_name,
        requesterName: row.requester_name,
        requesterEmail: row.requester_email,
      },
      approvals: approvalsRes.rows.map((r) => ({
        id: r.id,
        permitId: r.permit_id,
        requiredRole: r.required_role,
        requiredUserId: r.required_user_id,
        status: r.status,
        decidedBy: r.decided_by,
        deciderName: r.decider_name,
        decidedAt: r.decided_at,
        comment: r.comment,
      })),
      workLogs: workLogsRes.rows,
      allowedActions,
    };
  }

  /**
   * Lists permits with server-side filters, pagination, and bulk expiry.
   * Reuses the state machine approve guard for pendingMyApproval filter.
   */
  async listPermits(filter: ListPermitsFilter, actor: TransitionActor): Promise<any> {
    const pool = getPool();

    // 1. Bulk expire overdue permits first so list never shows expired permits as active
    await bulkExpireOverduePermits(pool);

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (filter.status) {
      whereClauses.push(`p.status = $${pIdx++}`);
      params.push(filter.status);
    }

    if (filter.type) {
      whereClauses.push(`p.type = $${pIdx++}`);
      params.push(filter.type);
    }

    if (filter.areaId) {
      whereClauses.push(`p.area_id = $${pIdx++}`);
      params.push(filter.areaId);
    }

    if (filter.from) {
      whereClauses.push(`p.planned_start >= $${pIdx++}`);
      params.push(new Date(filter.from));
    }

    if (filter.to) {
      whereClauses.push(`p.planned_end <= $${pIdx++}`);
      params.push(new Date(filter.to));
    }

    if (filter.mine) {
      whereClauses.push(`p.requester_id = $${pIdx++}`);
      params.push(actor.id);
    }

    if (filter.pendingMyApproval) {
      whereClauses.push(`p.status = $${pIdx++}`);
      params.push(PermitStatus.PENDING_APPROVAL);

      whereClauses.push(`p.planned_end > NOW()`);

      whereClauses.push(`p.requester_id != $${pIdx++}`);
      params.push(actor.id);

      const actorIdParam = pIdx++;
      params.push(actor.id);

      const actorRoleParam = pIdx++;
      params.push(actor.role);

      whereClauses.push(`
        NOT EXISTS (
          SELECT 1 FROM permit_approvals pa_signed
          WHERE pa_signed.permit_id = p.id AND pa_signed.decided_by = $${actorIdParam}
        )
      `);

      whereClauses.push(`
        EXISTS (
          SELECT 1 FROM permit_approvals pa
          WHERE pa.permit_id = p.id
            AND pa.status = 'PENDING'
            AND (
              $${actorRoleParam} = 'ADMIN'
              OR (
                pa.required_role = $${actorRoleParam}
                AND (pa.required_user_id IS NULL OR pa.required_user_id = $${actorIdParam})
              )
            )
        )
      `);
    }

    const whereSql = whereClauses.join(' AND ');

    // Fetch total and records
    const countRes = await pool.query(`SELECT count(*) AS total FROM permits p WHERE ${whereSql}`, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const allowedSortColumns: Record<string, string> = {
      created_at: 'p.created_at',
      planned_start: 'p.planned_start',
      planned_end: 'p.planned_end',
      permit_no: 'p.permit_no',
      status: 'p.status',
    };
    const sortCol = allowedSortColumns[filter.sortBy || 'created_at'] || 'p.created_at';
    const sortOrder = filter.sortDir === 'asc' ? 'ASC' : 'DESC';

    const listQuery = `
      SELECT 
        p.*,
        pl.name AS plant_name,
        a.name AS area_name,
        e.tag AS equipment_tag,
        u.name AS requester_name
      FROM permits p
      LEFT JOIN plants pl ON pl.id = p.plant_id
      LEFT JOIN areas a ON a.id = p.area_id
      LEFT JOIN equipment e ON e.id = p.equipment_id
      LEFT JOIN users u ON u.id = p.requester_id
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const itemsRes = await pool.query(listQuery, [...params, limit, offset]);

    // Map rows and compute allowedActions
    const items = itemsRes.rows.map((row) => ({
      ...mapPermitRow(row),
      plantName: row.plant_name,
      areaName: row.area_name,
      equipmentTag: row.equipment_tag,
      requesterName: row.requester_name,
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns aggregated statistics: breakdown byStatus, activeNow, expiringIn2h, and pendingMyApproval.
   */
  async getPermitStats(actor: TransitionActor): Promise<any> {
    const pool = getPool();

    // 1. Bulk expire overdue permits first
    await bulkExpireOverduePermits(pool);

    // 2. Count by status
    const statusCountsRes = await pool.query(
      `SELECT status, count(*)::integer AS count FROM permits GROUP BY status`
    );

    const byStatus: Record<string, number> = {};
    for (const s of ALL_PERMIT_STATUSES) {
      byStatus[s] = 0;
    }
    for (const row of statusCountsRes.rows) {
      byStatus[row.status] = row.count;
    }

    // 3. Active now
    const activeNow = byStatus[PermitStatus.ACTIVE] || 0;

    // 4. Expiring in 2 hours
    const expiringRes = await pool.query(
      `SELECT count(*)::integer AS count 
       FROM permits 
       WHERE status = $1 
         AND planned_end > NOW() 
         AND planned_end <= NOW() + INTERVAL '2 hours'`,
      [PermitStatus.ACTIVE]
    );
    const expiringIn2h = expiringRes.rows[0].count;

    // 5. Pending my approval: evaluate approve guard for PENDING_APPROVAL permits
    const pendingPermitsRes = await pool.query(
      `SELECT * FROM permits WHERE status = $1`,
      [PermitStatus.PENDING_APPROVAL]
    );

    let pendingMyApproval = 0;
    if (pendingPermitsRes.rows.length > 0) {
      const pendingIds = pendingPermitsRes.rows.map((r) => r.id);
      const appRes = await pool.query(
        `SELECT * FROM permit_approvals WHERE permit_id = ANY($1::uuid[])`,
        [pendingIds]
      );
      const approvalsByPermit = new Map<string, PermitApproval[]>();
      for (const app of appRes.rows) {
        const list = approvalsByPermit.get(app.permit_id) || [];
        list.push({
          id: app.id,
          permitId: app.permit_id,
          requiredRole: app.required_role,
          requiredUserId: app.required_user_id,
          status: app.status,
          decidedBy: app.decided_by,
          decidedAt: app.decided_at,
          comment: app.comment,
          signatureData: app.signature_data,
        });
        approvalsByPermit.set(app.permit_id, list);
      }

      const now = new Date();
      for (const row of pendingPermitsRes.rows) {
        const permit = mapPermitRow(row);
        const apps = approvalsByPermit.get(permit.id) || [];
        const actions = getAllowedActions(permit, actor, apps, now);
        if (actions.includes('approve')) {
          pendingMyApproval++;
        }
      }
    }

    return {
      byStatus,
      activeNow,
      expiringIn2h,
      pendingMyApproval,
    };
  }

  /**
   * Retrieves ordered audit event timeline for a permit.
   * Labels NULL actors as "System" per D-018.
   */
  async getAuditTimeline(permitId: string): Promise<any> {
    const pool = getPool();

    // Verify permit exists
    const checkRes = await pool.query('SELECT id FROM permits WHERE id = $1', [permitId]);
    if (checkRes.rows.length === 0) {
      throw AppError.notFound(`Permit with ID '${permitId}' not found`);
    }

    const res = await pool.query(
      `SELECT 
         a.id,
         a.permit_id AS "permitId",
         a.actor_id AS "actorId",
         COALESCE(u.name, 'System') AS "actorName",
         COALESCE(u.email, 'system@cmms.local') AS "actorEmail",
         COALESCE(u.role, 'SYSTEM') AS "actorRole",
         a.action,
         a.from_value AS "fromValue",
         a.to_value AS "toValue",
         a.comment,
         a.created_at AS "createdAt"
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.permit_id = $1
       ORDER BY a.created_at ASC, a.id ASC`,
      [permitId]
    );

    return { timeline: res.rows };
  }

  /**
   * Records a work log on an ACTIVE permit.
   * ENTRY and EXIT logs support confined space attendant tracking.
   */
  async addWorkLog(permitId: string, kind: string, note: string, actor: TransitionActor): Promise<any> {
    const pool = getPool();

    // Check permit status
    const permitRes = await pool.query('SELECT status FROM permits WHERE id = $1', [permitId]);
    if (permitRes.rows.length === 0) {
      throw AppError.notFound(`Permit with ID '${permitId}' not found`);
    }

    if (permitRes.rows[0].status !== PermitStatus.ACTIVE) {
      throw new AppError(
        409,
        'ILLEGAL_TRANSITION',
        `Work logs can only be logged on ACTIVE permits. Current status is '${permitRes.rows[0].status}'`
      );
    }

    const insertRes = await pool.query(
      `INSERT INTO permit_work_logs (permit_id, logged_by, note, kind)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [permitId, actor.id, note, kind]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
       VALUES ($1, $2, 'work_log', NULL, $3, $4)`,
      [
        permitId,
        actor.id,
        JSON.stringify({ kind, workLogId: insertRes.rows[0].id }),
        `Work log added: ${kind} - ${note.slice(0, 60)}`,
      ]
    );

    return {
      id: insertRes.rows[0].id,
      permitId: insertRes.rows[0].permit_id,
      loggedBy: insertRes.rows[0].logged_by,
      note: insertRes.rows[0].note,
      kind: insertRes.rows[0].kind,
      createdAt: insertRes.rows[0].created_at,
    };
  }
}

export const permitsService = new PermitsService();

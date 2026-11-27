import bcrypt from 'bcryptjs';
import type pkg from 'pg';
import { getPool } from '../../db/client.js';
import { AppError } from '../../errors/app-error.js';
import { createGuardAppError } from '../../errors/guard-codes.js';
import {
  UserRole,
  TERMINAL_PERMIT_STATUSES,
  type CreateUserInput,
  type UpdateUserInput,
  type CreatePlantInput,
  type UpdatePlantInput,
  type CreateAreaInput,
  type UpdateAreaInput,
  type CreateEquipmentInput,
  type UpdateEquipmentInput,
  type ListAdminActivityQuery,
  type UserDto,
  type PlantDto,
  type AreaDto,
  type EquipmentDto,
  type AdminAuditLogDto,
  type PaginationMeta,
} from '@ptw/shared';
import {
  assertAdminGuard,
  guardCannotModifySelf,
  guardNotLastAdmin,
  guardReassignAreasBeforeRoleOrDeactivate,
  guardActiveAreaOwner,
  guardNoOpenPermits,
  guardNoActiveChildren,
} from './admin.guards.js';

const TERMINAL_LIST_SQL = TERMINAL_PERMIT_STATUSES.map((s) => `'${s}'`).join(', ');

function scrubSecrets(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(scrubSecrets);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (/password/i.test(k)) {
      continue;
    }
    out[k] = scrubSecrets(v);
  }
  return out;
}

async function recordAdminAudit(
  client: pkg.PoolClient,
  params: {
    actorId: string;
    entityType: 'USER' | 'PLANT' | 'AREA' | 'EQUIPMENT';
    entityId: string;
    action: string;
    fromValue?: unknown;
    toValue?: unknown;
  }
): Promise<void> {
  const fromJson =
    params.fromValue !== undefined && params.fromValue !== null
      ? JSON.stringify(scrubSecrets(params.fromValue))
      : null;
  const toJson =
    params.toValue !== undefined && params.toValue !== null
      ? JSON.stringify(scrubSecrets(params.toValue))
      : null;

  await client.query(
    `INSERT INTO admin_audit_log (actor_id, entity_type, entity_id, action, from_value, to_value)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [params.actorId, params.entityType, params.entityId, params.action, fromJson, toJson]
  );
}

/**
 * Updates pending AREA_OWNER approval rows on non-terminal permits when an area's owner changes,
 * keeping already-decided approvals untouched and writing one audit_log row per affected permit (D-028).
 */
async function reassignPendingApprovalsForArea(
  client: pkg.PoolClient,
  params: {
    areaId: string;
    oldOwnerId: string;
    newOwnerId: string;
    adminActorId: string;
  }
): Promise<number> {
  if (params.oldOwnerId === params.newOwnerId) {
    return 0;
  }

  const updatedRows = await client.query(
    `UPDATE permit_approvals pa
     SET required_user_id = $1
     FROM permits p
     WHERE pa.permit_id = p.id
       AND p.area_id = $2
       AND p.status NOT IN (${TERMINAL_LIST_SQL})
       AND pa.required_role = 'AREA_OWNER'
       AND pa.status = 'PENDING'
       AND pa.required_user_id IS DISTINCT FROM $1
     RETURNING pa.permit_id AS "permitId"`,
    [params.newOwnerId, params.areaId]
  );

  const affectedPermitIds = Array.from(
    new Set(updatedRows.rows.map((r: { permitId: string }) => r.permitId))
  );

  for (const permitId of affectedPermitIds) {
    await client.query(
      `INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment)
       VALUES ($1, $2, 'approver_reassigned', $3::jsonb, $4::jsonb, $5)`,
      [
        permitId,
        params.adminActorId,
        JSON.stringify({ requiredUserId: params.oldOwnerId }),
        JSON.stringify({ requiredUserId: params.newOwnerId }),
        'approver reassigned',
      ]
    );
  }

  return affectedPermitIds.length;
}

export class AdminService {
  // =========================================================================
  // USERS
  // =========================================================================

  async listUsers(): Promise<UserDto[]> {
    const pool = getPool();
    const usersRes = await pool.query(
      `SELECT id, name, email, role, is_active AS "isActive"
       FROM users
       ORDER BY name ASC, email ASC`
    );

    const areasRes = await pool.query(
      `SELECT id, plant_id AS "plantId", code, name, owner_id AS "ownerId", is_active AS "isActive"
       FROM areas
       ORDER BY code ASC`
    );

    const areasByOwner = new Map<string, UserDto['ownedAreas']>();
    for (const a of areasRes.rows) {
      const list = areasByOwner.get(a.ownerId) || [];
      list.push({
        id: a.id,
        plantId: a.plantId,
        code: a.code,
        name: a.name,
        isActive: a.isActive,
      });
      areasByOwner.set(a.ownerId, list);
    }

    return usersRes.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      ownedAreas: areasByOwner.get(u.id) || [],
    }));
  }

  async createUser(input: CreateUserInput, actorId: string): Promise<UserDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1', [
        input.email,
      ]);
      if (existing.rows.length > 0) {
        throw createGuardAppError('EMAIL_TAKEN', `Email '${input.email}' is already registered`);
      }

      const areaIds = input.areaIds || [];
      if (areaIds.length > 0 && input.role !== UserRole.AREA_OWNER) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Validation failed',
          { areaIds: ['Areas can only be assigned to users with the AREA_OWNER role'] }
        );
      }

      let targetAreas: Array<{ id: string; code: string; name: string; plantId: string; ownerId: string; isActive: boolean }> = [];
      if (areaIds.length > 0) {
        const areasRes = await client.query(
          `SELECT id, code, name, plant_id AS "plantId", owner_id AS "ownerId", is_active AS "isActive"
           FROM areas WHERE id = ANY($1::uuid[]) FOR UPDATE`,
          [areaIds]
        );
        if (areasRes.rows.length !== areaIds.length) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
            areaIds: ['One or more selected areas do not exist'],
          });
        }
        targetAreas = areasRes.rows;
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const insertRes = await client.query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, name, email, role, is_active AS "isActive"`,
        [input.name, input.email, passwordHash, input.role]
      );
      const created = insertRes.rows[0];

      for (const area of targetAreas) {
        await client.query('UPDATE areas SET owner_id = $1 WHERE id = $2', [created.id, area.id]);
        await reassignPendingApprovalsForArea(client, {
          areaId: area.id,
          oldOwnerId: area.ownerId,
          newOwnerId: created.id,
          adminActorId: actorId,
        });
        await recordAdminAudit(client, {
          actorId,
          entityType: 'AREA',
          entityId: area.id,
          action: 'UPDATE',
          fromValue: { ownerId: area.ownerId },
          toValue: { ownerId: created.id },
        });
      }

      await recordAdminAudit(client, {
        actorId,
        entityType: 'USER',
        entityId: created.id,
        action: 'CREATE',
        fromValue: null,
        toValue: {
          name: created.name,
          email: created.email,
          role: created.role,
          isActive: created.isActive,
          areaIds,
        },
      });

      await client.query('COMMIT');

      return {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        isActive: created.isActive,
        ownedAreas: targetAreas.map((a) => ({
          id: a.id,
          plantId: a.plantId,
          code: a.code,
          name: a.name,
          isActive: a.isActive,
        })),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateUser(userId: string, input: UpdateUserInput, actorId: string): Promise<UserDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        'SELECT id, name, email, role, is_active AS "isActive" FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (userRes.rows.length === 0) {
        throw AppError.notFound(`User with ID '${userId}' not found`);
      }
      const current = userRes.rows[0];

      // Lock active admins to prevent concurrent last-admin demotion/deactivation races
      const adminsRes = await client.query(
        `SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true FOR UPDATE`
      );
      const activeAdminCount = adminsRes.rows.length;

      const ownedAreasRes = await client.query(
        `SELECT id, code, name, plant_id AS "plantId", is_active AS "isActive"
         FROM areas WHERE owner_id = $1 ORDER BY code ASC FOR UPDATE`,
        [userId]
      );
      const ownedAreas = ownedAreasRes.rows;

      const nextName = input.name ?? current.name;
      const nextRole = input.role ?? current.role;
      const nextIsActive = input.isActive ?? current.isActive;

      assertAdminGuard(
        guardCannotModifySelf({
          actorId,
          targetUser: current,
          nextRole: input.role,
          nextIsActive: input.isActive,
        })
      );

      assertAdminGuard(
        guardNotLastAdmin({
          targetUser: current,
          activeAdminCount,
          nextRole: input.role,
          nextIsActive: input.isActive,
        })
      );

      assertAdminGuard(
        guardReassignAreasBeforeRoleOrDeactivate({
          targetUser: current,
          ownedAreas,
          nextRole: input.role,
          nextIsActive: input.isActive,
        })
      );

      if (input.areaIds !== undefined) {
        if (input.areaIds.length > 0 && nextRole !== UserRole.AREA_OWNER) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
            areaIds: ['Areas can only be assigned to users with the AREA_OWNER role'],
          });
        }
        if (!nextIsActive && input.areaIds.length > 0) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
            areaIds: ['Inactive users cannot be assigned areas'],
          });
        }
        if (input.areaIds.length > 0) {
          const areasRes = await client.query(
            `SELECT id, code, name, plant_id AS "plantId", owner_id AS "ownerId", is_active AS "isActive"
             FROM areas WHERE id = ANY($1::uuid[]) FOR UPDATE`,
            [input.areaIds]
          );
          if (areasRes.rows.length !== input.areaIds.length) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
              areaIds: ['One or more selected areas do not exist'],
            });
          }

          for (const area of areasRes.rows) {
            if (area.ownerId !== userId) {
              await client.query('UPDATE areas SET owner_id = $1 WHERE id = $2', [userId, area.id]);
              await reassignPendingApprovalsForArea(client, {
                areaId: area.id,
                oldOwnerId: area.ownerId,
                newOwnerId: userId,
                adminActorId: actorId,
              });
              await recordAdminAudit(client, {
                actorId,
                entityType: 'AREA',
                entityId: area.id,
                action: 'UPDATE',
                fromValue: { ownerId: area.ownerId },
                toValue: { ownerId: userId },
              });
            }
          }
        }
      }

      const updatedRes = await client.query(
        `UPDATE users
         SET name = $1, role = $2, is_active = $3
         WHERE id = $4
         RETURNING id, name, email, role, is_active AS "isActive"`,
        [nextName, nextRole, nextIsActive, userId]
      );
      const updated = updatedRes.rows[0];

      const action =
        current.isActive && !nextIsActive
          ? 'DEACTIVATE'
          : !current.isActive && nextIsActive
          ? 'REACTIVATE'
          : 'UPDATE';

      await recordAdminAudit(client, {
        actorId,
        entityType: 'USER',
        entityId: userId,
        action,
        fromValue: { name: current.name, role: current.role, isActive: current.isActive },
        toValue: { name: updated.name, role: updated.role, isActive: updated.isActive },
      });

      const finalOwnedRes = await client.query(
        `SELECT id, plant_id AS "plantId", code, name, is_active AS "isActive"
         FROM areas WHERE owner_id = $1 ORDER BY code ASC`,
        [userId]
      );

      await client.query('COMMIT');

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        ownedAreas: finalOwnedRes.rows,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async resetPassword(userId: string, newPassword: string, actorId: string): Promise<{ message: string }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT id, email FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (userRes.rows.length === 0) {
        throw AppError.notFound(`User with ID '${userId}' not found`);
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

      await recordAdminAudit(client, {
        actorId,
        entityType: 'USER',
        entityId: userId,
        action: 'RESET_PASSWORD',
        fromValue: null,
        toValue: { passwordUpdated: true },
      });

      await client.query('COMMIT');
      return { message: 'Password updated successfully' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // PLANTS
  // =========================================================================

  async listPlants(): Promise<PlantDto[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT
         p.id,
         p.code,
         p.name,
         p.address,
         p.is_active AS "isActive",
         count(a.id)::integer AS "areaCount"
       FROM plants p
       LEFT JOIN areas a ON a.plant_id = p.id
       GROUP BY p.id
       ORDER BY p.name ASC`
    );
    return res.rows;
  }

  async createPlant(input: CreatePlantInput, actorId: string): Promise<PlantDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const dup = await client.query('SELECT id FROM plants WHERE code = $1', [input.code]);
      if (dup.rows.length > 0) {
        throw createGuardAppError('CODE_TAKEN', `Plant code '${input.code}' already exists`);
      }

      const insertRes = await client.query(
        `INSERT INTO plants (code, name, address, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id, code, name, address, is_active AS "isActive"`,
        [input.code, input.name, input.address ?? null]
      );
      const created = insertRes.rows[0];

      await recordAdminAudit(client, {
        actorId,
        entityType: 'PLANT',
        entityId: created.id,
        action: 'CREATE',
        fromValue: null,
        toValue: created,
      });

      await client.query('COMMIT');
      return { ...created, areaCount: 0 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePlant(plantId: string, input: UpdatePlantInput, actorId: string): Promise<PlantDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const plantRes = await client.query(
        'SELECT id, code, name, address, is_active AS "isActive" FROM plants WHERE id = $1 FOR UPDATE',
        [plantId]
      );
      if (plantRes.rows.length === 0) {
        throw AppError.notFound(`Plant with ID '${plantId}' not found`);
      }
      const current = plantRes.rows[0];

      const nextCode = input.code ?? current.code;
      const nextName = input.name ?? current.name;
      const nextAddress = input.address !== undefined ? input.address : current.address;
      const nextIsActive = input.isActive ?? current.isActive;

      if (nextCode !== current.code) {
        const dup = await client.query('SELECT id FROM plants WHERE code = $1 AND id != $2', [
          nextCode,
          plantId,
        ]);
        if (dup.rows.length > 0) {
          throw createGuardAppError('CODE_TAKEN', `Plant code '${nextCode}' already exists`);
        }
      }

      if (current.isActive && nextIsActive === false) {
        const openPermitsRes = await client.query(
          `SELECT DISTINCT p.id, p.permit_no AS "permitNo", p.status
           FROM permits p
           LEFT JOIN areas a ON a.id = p.area_id
           WHERE (p.plant_id = $1 OR a.plant_id = $1)
             AND p.status NOT IN (${TERMINAL_LIST_SQL})
           ORDER BY p.permit_no ASC`,
          [plantId]
        );
        assertAdminGuard(guardNoOpenPermits('Plant', openPermitsRes.rows));

        const activeAreasRes = await client.query(
          `SELECT id, code, name FROM areas WHERE plant_id = $1 AND is_active = true ORDER BY code ASC`,
          [plantId]
        );
        assertAdminGuard(guardNoActiveChildren('Plant', 'areas', activeAreasRes.rows));
      }

      const updatedRes = await client.query(
        `UPDATE plants
         SET code = $1, name = $2, address = $3, is_active = $4
         WHERE id = $5
         RETURNING id, code, name, address, is_active AS "isActive"`,
        [nextCode, nextName, nextAddress, nextIsActive, plantId]
      );
      const updated = updatedRes.rows[0];

      const action =
        current.isActive && !nextIsActive
          ? 'DEACTIVATE'
          : !current.isActive && nextIsActive
          ? 'REACTIVATE'
          : 'UPDATE';

      await recordAdminAudit(client, {
        actorId,
        entityType: 'PLANT',
        entityId: plantId,
        action,
        fromValue: current,
        toValue: updated,
      });

      const countRes = await client.query(
        'SELECT count(*)::integer AS count FROM areas WHERE plant_id = $1',
        [plantId]
      );

      await client.query('COMMIT');
      return { ...updated, areaCount: countRes.rows[0].count };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // AREAS
  // =========================================================================

  async listAreas(plantId?: string): Promise<AreaDto[]> {
    const pool = getPool();
    const params: unknown[] = [];
    let whereSql = '';
    if (plantId) {
      params.push(plantId);
      whereSql = 'WHERE a.plant_id = $1';
    }

    const res = await pool.query(
      `SELECT
         a.id,
         a.plant_id AS "plantId",
         a.code,
         a.name,
         a.owner_id AS "ownerId",
         a.is_active AS "isActive",
         pl.name AS "plantName",
         pl.code AS "plantCode",
         u.name AS "ownerName",
         u.email AS "ownerEmail",
         count(e.id)::integer AS "equipmentCount"
       FROM areas a
       JOIN plants pl ON pl.id = a.plant_id
       LEFT JOIN users u ON u.id = a.owner_id
       LEFT JOIN equipment e ON e.area_id = a.id
       ${whereSql}
       GROUP BY a.id, pl.id, u.id
       ORDER BY pl.name ASC, a.name ASC`,
      params
    );
    return res.rows;
  }

  async createArea(input: CreateAreaInput, actorId: string): Promise<AreaDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const plantRes = await client.query(
        'SELECT id, name, code, is_active AS "isActive" FROM plants WHERE id = $1',
        [input.plantId]
      );
      if (plantRes.rows.length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          plantId: ['Selected plant does not exist'],
        });
      }
      if (!plantRes.rows[0].isActive) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          plantId: ['Cannot create an area under an inactive plant'],
        });
      }

      const ownerRes = await client.query(
        'SELECT id, name, email, role, is_active AS "isActive" FROM users WHERE id = $1',
        [input.ownerId]
      );
      assertAdminGuard(guardActiveAreaOwner(ownerRes.rows[0]));

      const dup = await client.query(
        'SELECT id FROM areas WHERE plant_id = $1 AND code = $2',
        [input.plantId, input.code]
      );
      if (dup.rows.length > 0) {
        throw createGuardAppError(
          'CODE_TAKEN',
          `Area code '${input.code}' already exists in this plant`
        );
      }

      const insertRes = await client.query(
        `INSERT INTO areas (plant_id, code, name, owner_id, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, plant_id AS "plantId", code, name, owner_id AS "ownerId", is_active AS "isActive"`,
        [input.plantId, input.code, input.name, input.ownerId]
      );
      const created = insertRes.rows[0];

      await recordAdminAudit(client, {
        actorId,
        entityType: 'AREA',
        entityId: created.id,
        action: 'CREATE',
        fromValue: null,
        toValue: created,
      });

      await client.query('COMMIT');
      return {
        ...created,
        plantName: plantRes.rows[0].name,
        plantCode: plantRes.rows[0].code,
        ownerName: ownerRes.rows[0].name,
        ownerEmail: ownerRes.rows[0].email,
        equipmentCount: 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateArea(areaId: string, input: UpdateAreaInput, actorId: string): Promise<AreaDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const areaRes = await client.query(
        `SELECT id, plant_id AS "plantId", code, name, owner_id AS "ownerId", is_active AS "isActive"
         FROM areas WHERE id = $1 FOR UPDATE`,
        [areaId]
      );
      if (areaRes.rows.length === 0) {
        throw AppError.notFound(`Area with ID '${areaId}' not found`);
      }
      const current = areaRes.rows[0];

      const nextPlantId = input.plantId ?? current.plantId;
      const nextCode = input.code ?? current.code;
      const nextName = input.name ?? current.name;
      const nextOwnerId = input.ownerId ?? current.ownerId;
      const nextIsActive = input.isActive ?? current.isActive;

      const plantRes = await client.query(
        'SELECT id, name, code, is_active AS "isActive" FROM plants WHERE id = $1',
        [nextPlantId]
      );
      if (plantRes.rows.length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          plantId: ['Selected plant does not exist'],
        });
      }
      if ((nextPlantId !== current.plantId || (!current.isActive && nextIsActive)) && !plantRes.rows[0].isActive) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          plantId: ['Target plant is inactive'],
        });
      }

      if (nextCode !== current.code || nextPlantId !== current.plantId) {
        const dup = await client.query(
          'SELECT id FROM areas WHERE plant_id = $1 AND code = $2 AND id != $3',
          [nextPlantId, nextCode, areaId]
        );
        if (dup.rows.length > 0) {
          throw createGuardAppError(
            'CODE_TAKEN',
            `Area code '${nextCode}' already exists in this plant`
          );
        }
      }

      if (nextOwnerId !== current.ownerId) {
        const ownerRes = await client.query(
          'SELECT id, name, email, role, is_active AS "isActive" FROM users WHERE id = $1 FOR UPDATE',
          [nextOwnerId]
        );
        assertAdminGuard(guardActiveAreaOwner(ownerRes.rows[0]));
      }

      if (current.isActive && nextIsActive === false) {
        const openPermitsRes = await client.query(
          `SELECT id, permit_no AS "permitNo", status
           FROM permits
           WHERE area_id = $1
             AND status NOT IN (${TERMINAL_LIST_SQL})
           ORDER BY permit_no ASC`,
          [areaId]
        );
        assertAdminGuard(guardNoOpenPermits('Area', openPermitsRes.rows));

        const activeEqRes = await client.query(
          `SELECT id, tag, name FROM equipment WHERE area_id = $1 AND is_active = true ORDER BY tag ASC`,
          [areaId]
        );
        assertAdminGuard(guardNoActiveChildren('Area', 'equipment', activeEqRes.rows));
      }

      const updatedRes = await client.query(
        `UPDATE areas
         SET plant_id = $1, code = $2, name = $3, owner_id = $4, is_active = $5
         WHERE id = $6
         RETURNING id, plant_id AS "plantId", code, name, owner_id AS "ownerId", is_active AS "isActive"`,
        [nextPlantId, nextCode, nextName, nextOwnerId, nextIsActive, areaId]
      );
      const updated = updatedRes.rows[0];

      // D-028: Reassign PENDING AREA_OWNER approvals on non-terminal permits in this area
      if (nextOwnerId !== current.ownerId) {
        await reassignPendingApprovalsForArea(client, {
          areaId,
          oldOwnerId: current.ownerId,
          newOwnerId: nextOwnerId,
          adminActorId: actorId,
        });
      }

      const action =
        current.isActive && !nextIsActive
          ? 'DEACTIVATE'
          : !current.isActive && nextIsActive
          ? 'REACTIVATE'
          : 'UPDATE';

      await recordAdminAudit(client, {
        actorId,
        entityType: 'AREA',
        entityId: areaId,
        action,
        fromValue: current,
        toValue: updated,
      });

      const ownerInfoRes = await client.query(
        'SELECT name, email FROM users WHERE id = $1',
        [updated.ownerId]
      );
      const eqCountRes = await client.query(
        'SELECT count(*)::integer AS count FROM equipment WHERE area_id = $1',
        [areaId]
      );

      await client.query('COMMIT');
      return {
        ...updated,
        plantName: plantRes.rows[0].name,
        plantCode: plantRes.rows[0].code,
        ownerName: ownerInfoRes.rows[0]?.name || null,
        ownerEmail: ownerInfoRes.rows[0]?.email || null,
        equipmentCount: eqCountRes.rows[0].count,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // EQUIPMENT
  // =========================================================================

  async listEquipment(areaId?: string): Promise<EquipmentDto[]> {
    const pool = getPool();
    const params: unknown[] = [];
    let whereSql = '';
    if (areaId) {
      params.push(areaId);
      whereSql = 'WHERE e.area_id = $1';
    }

    const res = await pool.query(
      `SELECT
         e.id,
         e.area_id AS "areaId",
         e.tag,
         e.name,
         e.is_active AS "isActive",
         a.name AS "areaName",
         a.code AS "areaCode",
         pl.id AS "plantId",
         pl.name AS "plantName"
       FROM equipment e
       JOIN areas a ON a.id = e.area_id
       JOIN plants pl ON pl.id = a.plant_id
       ${whereSql}
       ORDER BY e.tag ASC`,
      params
    );
    return res.rows;
  }

  async createEquipment(input: CreateEquipmentInput, actorId: string): Promise<EquipmentDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const areaRes = await client.query(
        `SELECT a.id, a.name, a.code, a.is_active AS "isActive",
                pl.id AS "plantId", pl.name AS "plantName", pl.is_active AS "plantIsActive"
         FROM areas a
         JOIN plants pl ON pl.id = a.plant_id
         WHERE a.id = $1`,
        [input.areaId]
      );
      if (areaRes.rows.length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          areaId: ['Selected area does not exist'],
        });
      }
      if (!areaRes.rows[0].isActive || !areaRes.rows[0].plantIsActive) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          areaId: ['Cannot add equipment under an inactive area or plant'],
        });
      }

      const dup = await client.query('SELECT id FROM equipment WHERE tag = $1', [input.tag]);
      if (dup.rows.length > 0) {
        throw createGuardAppError('CODE_TAKEN', `Equipment tag '${input.tag}' already exists`);
      }

      const insertRes = await client.query(
        `INSERT INTO equipment (area_id, tag, name, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id, area_id AS "areaId", tag, name, is_active AS "isActive"`,
        [input.areaId, input.tag, input.name]
      );
      const created = insertRes.rows[0];

      await recordAdminAudit(client, {
        actorId,
        entityType: 'EQUIPMENT',
        entityId: created.id,
        action: 'CREATE',
        fromValue: null,
        toValue: created,
      });

      await client.query('COMMIT');
      return {
        ...created,
        areaName: areaRes.rows[0].name,
        areaCode: areaRes.rows[0].code,
        plantId: areaRes.rows[0].plantId,
        plantName: areaRes.rows[0].plantName,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateEquipment(
    equipmentId: string,
    input: UpdateEquipmentInput,
    actorId: string
  ): Promise<EquipmentDto> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const eqRes = await client.query(
        'SELECT id, area_id AS "areaId", tag, name, is_active AS "isActive" FROM equipment WHERE id = $1 FOR UPDATE',
        [equipmentId]
      );
      if (eqRes.rows.length === 0) {
        throw AppError.notFound(`Equipment with ID '${equipmentId}' not found`);
      }
      const current = eqRes.rows[0];

      const nextAreaId = input.areaId ?? current.areaId;
      const nextTag = input.tag ?? current.tag;
      const nextName = input.name ?? current.name;
      const nextIsActive = input.isActive ?? current.isActive;

      const areaRes = await client.query(
        `SELECT a.id, a.name, a.code, a.is_active AS "isActive",
                pl.id AS "plantId", pl.name AS "plantName", pl.is_active AS "plantIsActive"
         FROM areas a
         JOIN plants pl ON pl.id = a.plant_id
         WHERE a.id = $1`,
        [nextAreaId]
      );
      if (areaRes.rows.length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          areaId: ['Selected area does not exist'],
        });
      }
      if (
        (nextAreaId !== current.areaId || (!current.isActive && nextIsActive)) &&
        (!areaRes.rows[0].isActive || !areaRes.rows[0].plantIsActive)
      ) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
          areaId: ['Target area or its parent plant is inactive'],
        });
      }

      if (nextTag !== current.tag) {
        const dup = await client.query('SELECT id FROM equipment WHERE tag = $1 AND id != $2', [
          nextTag,
          equipmentId,
        ]);
        if (dup.rows.length > 0) {
          throw createGuardAppError('CODE_TAKEN', `Equipment tag '${nextTag}' already exists`);
        }
      }

      if (current.isActive && nextIsActive === false) {
        const openPermitsRes = await client.query(
          `SELECT id, permit_no AS "permitNo", status
           FROM permits
           WHERE equipment_id = $1
             AND status NOT IN (${TERMINAL_LIST_SQL})
           ORDER BY permit_no ASC`,
          [equipmentId]
        );
        assertAdminGuard(guardNoOpenPermits('Equipment', openPermitsRes.rows));
      }

      const updatedRes = await client.query(
        `UPDATE equipment
         SET area_id = $1, tag = $2, name = $3, is_active = $4
         WHERE id = $5
         RETURNING id, area_id AS "areaId", tag, name, is_active AS "isActive"`,
        [nextAreaId, nextTag, nextName, nextIsActive, equipmentId]
      );
      const updated = updatedRes.rows[0];

      const action =
        current.isActive && !nextIsActive
          ? 'DEACTIVATE'
          : !current.isActive && nextIsActive
          ? 'REACTIVATE'
          : 'UPDATE';

      await recordAdminAudit(client, {
        actorId,
        entityType: 'EQUIPMENT',
        entityId: equipmentId,
        action,
        fromValue: current,
        toValue: updated,
      });

      await client.query('COMMIT');
      return {
        ...updated,
        areaName: areaRes.rows[0].name,
        areaCode: areaRes.rows[0].code,
        plantId: areaRes.rows[0].plantId,
        plantName: areaRes.rows[0].plantName,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // ADMIN ACTIVITY LOG
  // =========================================================================

  async listActivity(query: ListAdminActivityQuery): Promise<{
    items: AdminAuditLogDto[];
    pagination: PaginationMeta;
  }> {
    const pool = getPool();
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    let whereSql = '';
    if (query.entityType) {
      params.push(query.entityType);
      whereSql = 'WHERE l.entity_type = $1';
    }

    const countRes = await pool.query(
      `SELECT count(*)::integer AS total FROM admin_audit_log l ${whereSql}`,
      params
    );
    const total: number = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT
         l.id::text AS id,
         l.actor_id AS "actorId",
         u.name AS "actorName",
         u.email AS "actorEmail",
         l.entity_type AS "entityType",
         l.entity_id AS "entityId",
         l.action,
         l.from_value AS "fromValue",
         l.to_value AS "toValue",
         l.created_at AS "createdAt"
       FROM admin_audit_log l
       JOIN users u ON u.id = l.actor_id
       ${whereSql}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const items: AdminAuditLogDto[] = listRes.rows.map((r) => ({
      id: String(r.id),
      actorId: r.actorId,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      fromValue: r.fromValue,
      toValue: r.toValue,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

export const adminService = new AdminService();

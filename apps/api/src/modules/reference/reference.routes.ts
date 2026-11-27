import { Router, type Request } from 'express';
import { getPool } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../errors/app-error.js';
import { UserRole } from '@ptw/shared';

export const referenceRouter = Router();

function resolveIncludeInactive(req: Request): boolean {
  const includeInactive = req.query.includeInactive === 'true';
  if (includeInactive && req.user?.role !== UserRole.ADMIN) {
    throw AppError.forbidden(
      `Forbidden: only ADMIN may specify includeInactive=true`
    );
  }
  return includeInactive;
}

/**
 * GET /api/plants
 * Returns active plants (or all plants if ADMIN passes ?includeInactive=true).
 */
referenceRouter.get('/plants', requireAuth, async (req, res, next) => {
  try {
    const includeInactive = resolveIncludeInactive(req);
    const pool = getPool();
    const whereClause = includeInactive ? '' : 'WHERE is_active = true';
    const result = await pool.query(
      `SELECT id, name, code, address, is_active AS "isActive"
       FROM plants
       ${whereClause}
       ORDER BY name ASC`
    );
    res.status(200).json({ plants: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/areas
 * Returns active areas in active plants (or all areas if ADMIN passes ?includeInactive=true),
 * optionally filtered by ?plantId=<uuid>.
 */
referenceRouter.get('/areas', requireAuth, async (req, res, next) => {
  try {
    const includeInactive = resolveIncludeInactive(req);
    const pool = getPool();
    const plantId = req.query.plantId as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      conditions.push('a.is_active = true AND pl.is_active = true');
    }

    if (plantId) {
      params.push(plantId);
      conditions.push(`a.plant_id = $${params.length}`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT
        a.id,
        a.plant_id AS "plantId",
        a.code,
        a.name,
        a.owner_id AS "ownerId",
        a.is_active AS "isActive",
        pl.name AS "plantName",
        pl.code AS "plantCode",
        u.name AS "ownerName",
        u.email AS "ownerEmail"
      FROM areas a
      JOIN plants pl ON pl.id = a.plant_id
      LEFT JOIN users u ON u.id = a.owner_id
      ${whereSql}
      ORDER BY a.name ASC
    `;

    const result = await pool.query(query, params);
    res.status(200).json({ areas: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/equipment
 * Returns active equipment in active areas and active plants
 * (or all equipment if ADMIN passes ?includeInactive=true),
 * optionally filtered by ?areaId=<uuid>.
 */
referenceRouter.get('/equipment', requireAuth, async (req, res, next) => {
  try {
    const includeInactive = resolveIncludeInactive(req);
    const pool = getPool();
    const areaId = req.query.areaId as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      conditions.push('e.is_active = true AND a.is_active = true AND pl.is_active = true');
    }

    if (areaId) {
      params.push(areaId);
      conditions.push(`e.area_id = $${params.length}`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT
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
      ORDER BY e.tag ASC
    `;

    const result = await pool.query(query, params);
    res.status(200).json({ equipment: result.rows });
  } catch (err) {
    next(err);
  }
});

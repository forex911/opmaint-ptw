import { Router } from 'express';
import { getPool } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';

export const referenceRouter = Router();

// Every authenticated user can read reference hierarchy (D-020)
referenceRouter.use(requireAuth);

/**
 * GET /api/plants
 * Returns all plants.
 */
referenceRouter.get('/plants', async (_req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, created_at FROM plants ORDER BY name ASC');
    res.status(200).json({ plants: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/areas
 * Returns areas, optionally filtered by ?plantId=<uuid>.
 */
referenceRouter.get('/areas', async (req, res, next) => {
  try {
    const pool = getPool();
    const plantId = req.query.plantId as string | undefined;

    let query = `
      SELECT 
        a.id, 
        a.plant_id AS "plantId", 
        a.name, 
        a.owner_id AS "ownerId",
        u.name AS "ownerName",
        u.email AS "ownerEmail",
        a.created_at AS "createdAt"
      FROM areas a
      LEFT JOIN users u ON u.id = a.owner_id
    `;
    const params: any[] = [];

    if (plantId) {
      query += ' WHERE a.plant_id = $1';
      params.push(plantId);
    }

    query += ' ORDER BY a.name ASC';

    const result = await pool.query(query, params);
    res.status(200).json({ areas: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/equipment
 * Returns equipment, optionally filtered by ?areaId=<uuid>.
 */
referenceRouter.get('/equipment', async (req, res, next) => {
  try {
    const pool = getPool();
    const areaId = req.query.areaId as string | undefined;

    let query = `
      SELECT 
        e.id, 
        e.area_id AS "areaId", 
        e.tag, 
        e.name,
        e.created_at AS "createdAt"
      FROM equipment e
    `;
    const params: any[] = [];

    if (areaId) {
      query += ' WHERE e.area_id = $1';
      params.push(areaId);
    }

    query += ' ORDER BY e.tag ASC';

    const result = await pool.query(query, params);
    res.status(200).json({ equipment: result.rows });
  } catch (err) {
    next(err);
  }
});

import type { Pool } from 'pg';
import { AppError } from '../../../errors/app-error.js';

export interface LocationHierarchyParams {
  plantId: string;
  areaId: string;
  equipmentId?: string | null;
}

/**
 * Validates that the plant, area, and equipment hierarchy is consistent:
 * - The area exists and belongs to the specified plant.
 * - If equipment is specified, it exists and belongs to the specified area.
 * Throws HTTP 422 VALIDATION_ERROR on any mismatch.
 */
export async function validateLocationConsistency(
  pool: Pool,
  loc: LocationHierarchyParams
): Promise<void> {
  // 1. Verify plant exists
  const plantRes = await pool.query('SELECT id FROM plants WHERE id = $1', [loc.plantId]);
  if (plantRes.rows.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
      plantId: ['Selected plant does not exist'],
    });
  }

  // 2. Verify area exists and belongs to plant
  const areaRes = await pool.query('SELECT id, plant_id FROM areas WHERE id = $1', [loc.areaId]);
  if (areaRes.rows.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
      areaId: ['Selected area does not exist'],
    });
  }

  if (areaRes.rows[0].plant_id !== loc.plantId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
      areaId: ['Selected area does not belong to the selected plant'],
    });
  }

  // 3. If equipment is specified, verify it exists and belongs to area
  if (loc.equipmentId) {
    const equipRes = await pool.query('SELECT id, area_id FROM equipment WHERE id = $1', [
      loc.equipmentId,
    ]);
    if (equipRes.rows.length === 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
        equipmentId: ['Selected equipment does not exist'],
      });
    }

    if (equipRes.rows[0].area_id !== loc.areaId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', {
        equipmentId: ['Selected equipment does not belong to the specified area'],
      });
    }
  }
}

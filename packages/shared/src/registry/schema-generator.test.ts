import { describe, it, expect, beforeEach } from 'vitest';
import * as definitionsModule from './definitions.js';
import {
  PermitTypeCode,
  registerPermitType,
  resetPermitTypeRegistry,
  getPermitTypeConfig,
} from './definitions.js';
import {
  validatePermitDetails,
  type ValidationIssue,
} from './schema-generator.js';
import { UserRole } from '../roles.js';

describe('Permit Type Registry & Dynamic Schema Generator', () => {
  beforeEach(() => {
    resetPermitTypeRegistry();
  });

  describe('HOT_WORK validation', () => {
    it('accepts valid hot work details on submit', () => {
      const validDetails = {
        hot_work_type: 'welding',
        fire_watch_assigned: true,
        extinguisher_type: 'CO2 5kg',
        combustibles_cleared_radius_m: 10,
        gas_test: {
          lel_pct: 0,
          o2_pct: 20.9,
          tested_at: new Date().toISOString(),
        },
      };

      const result = validatePermitDetails(
        PermitTypeCode.HOT_WORK,
        validDetails,
        'submit'
      );
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('rejects invalid hot work details missing required fields on submit', () => {
      const incompleteDetails = {
        hot_work_type: 'welding',
        // missing fire_watch_assigned, extinguisher_type, etc.
      };

      const result = validatePermitDetails(
        PermitTypeCode.HOT_WORK,
        incompleteDetails,
        'submit'
      );
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      const paths = result.issues.map((i: ValidationIssue) => i.path.join('.'));
      expect(paths).toContain('fire_watch_assigned');
      expect(paths).toContain('extinguisher_type');
      expect(paths).toContain('combustibles_cleared_radius_m');
    });

    it('allows partial/incomplete details on draft mode', () => {
      const partialDetails = {
        hot_work_type: 'welding',
      };

      const result = validatePermitDetails(
        PermitTypeCode.HOT_WORK,
        partialDetails,
        'draft'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('CONFINED_SPACE validation & custom rules', () => {
    it('enforces gas test timing within 60 minutes of planned start', () => {
      const plannedStart = new Date(Date.now() + 30 * 60 * 1000); // starts in 30 mins
      const staleTestedAt = new Date(plannedStart.getTime() - 90 * 60 * 1000); // tested 90 mins before start

      const detailsWithStaleTest = {
        space_id: 'CS-TANK-01',
        entry_point: 'Manhole A',
        atmosphere_test: {
          o2_pct: 20.8,
          lel_pct: 0,
          h2s_ppm: 0,
          co_ppm: 0,
          tested_at: staleTestedAt.toISOString(),
        },
        standby_attendant: 'John Doe',
        rescue_plan: 'ERP-CS-001',
        ventilation_method: 'forced_mechanical',
      };

      const result = validatePermitDetails(
        PermitTypeCode.CONFINED_SPACE,
        detailsWithStaleTest,
        'submit',
        {
          plannedStart,
          plannedEnd: new Date(plannedStart.getTime() + 4 * 3600000),
        }
      );

      expect(result.valid).toBe(false);
      expect(result.issues.some((i: ValidationIssue) => i.code === 'ATMOSPHERE_TEST_STALE')).toBe(true);
    });

    it('passes when atmosphere test was taken 15 mins before planned start', () => {
      const plannedStart = new Date(Date.now() + 30 * 60 * 1000);
      const freshTestedAt = new Date(plannedStart.getTime() - 15 * 60 * 1000);

      const detailsWithFreshTest = {
        space_id: 'CS-TANK-01',
        entry_point: 'Manhole A',
        atmosphere_test: {
          o2_pct: 20.8,
          lel_pct: 0,
          h2s_ppm: 0,
          co_ppm: 0,
          tested_at: freshTestedAt.toISOString(),
        },
        standby_attendant: 'John Doe',
        rescue_plan: 'ERP-CS-001',
        ventilation_method: 'forced_mechanical',
      };

      const result = validatePermitDetails(
        PermitTypeCode.CONFINED_SPACE,
        detailsWithFreshTest,
        'submit',
        {
          plannedStart,
          plannedEnd: new Date(plannedStart.getTime() + 4 * 3600000),
        }
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Extensibility: Registering a 5th type (EXCAVATION)', () => {
    it('registers a fifth permit type dynamically with zero code changes elsewhere', () => {
      registerPermitType({
        code: 'EXCAVATION',
        name: 'Excavation Permit',
        description: 'Trenching and ground penetration.',
        fields: [
          {
            key: 'depth_m',
            label: 'Trench Depth',
            type: 'number',
            unit: 'm',
            min: 0,
            required: true,
          },
          {
            key: 'underground_utilities_scanned',
            label: 'Underground Utilities Scanned with Locator',
            type: 'boolean',
            required: true,
          },
          {
            key: 'shoring_installed',
            label: 'Shoring or Benching Installed',
            type: 'boolean',
            required: true,
          },
        ],
        requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
      });

      expect(getPermitTypeConfig('EXCAVATION')).toBeDefined();

      // Submit with missing fields fails
      const invalidExcavation = { depth_m: 1.8 };
      const failResult = validatePermitDetails(
        'EXCAVATION',
        invalidExcavation,
        'submit'
      );
      expect(failResult.valid).toBe(false);
      expect(failResult.issues.map((i: ValidationIssue) => i.path.join('.'))).toContain(
        'underground_utilities_scanned'
      );

      // Submit with all required fields succeeds
      const validExcavation = {
        depth_m: 1.8,
        underground_utilities_scanned: true,
        shoring_installed: true,
      };
      const passResult = validatePermitDetails(
        'EXCAVATION',
        validExcavation,
        'submit'
      );
      expect(passResult.valid).toBe(true);
    });
  });

  describe('Shared Gas Safety Thresholds & Submit Enforcement (K1)', () => {
    it('exports canonical GAS_SAFETY_THRESHOLDS constant', () => {
      const thresholds = (definitionsModule as any).GAS_SAFETY_THRESHOLDS;
      expect(thresholds).toEqual({
        lelMaxPct: 10,
        o2MinPct: 19.5,
        o2MaxPct: 23.5,
        h2sMaxPpm: 10,
        coMaxPpm: 35,
      });
    });

    it('rejects HOT_WORK submit with unsafe gas readings (UNSAFE_ATMOSPHERE) while keeping draft permissive', () => {
      const plannedStart = new Date(Date.now() + 30 * 60 * 1000);
      const unsafeDetails = {
        hot_work_type: 'welding',
        fire_watch_assigned: true,
        extinguisher_type: 'CO2 5kg',
        combustibles_cleared_radius_m: 10,
        gas_test: {
          lel_pct: 12,
          o2_pct: 18.2,
          tested_at: new Date().toISOString(),
        },
      };

      const draftResult = validatePermitDetails(
        PermitTypeCode.HOT_WORK,
        unsafeDetails,
        'draft',
        { plannedStart, plannedEnd: new Date(plannedStart.getTime() + 3600000) }
      );
      expect(draftResult.valid).toBe(true);

      const submitResult = validatePermitDetails(
        PermitTypeCode.HOT_WORK,
        unsafeDetails,
        'submit',
        { plannedStart, plannedEnd: new Date(plannedStart.getTime() + 3600000) }
      );
      expect(submitResult.valid).toBe(false);
      expect(
        submitResult.issues.some((i: ValidationIssue) => i.code === 'UNSAFE_ATMOSPHERE')
      ).toBe(true);
      expect(
        submitResult.issues.map((i: ValidationIssue) => i.path.join('.'))
      ).toEqual(expect.arrayContaining(['gas_test.lel_pct', 'gas_test.o2_pct']));
    });

    it('rejects CONFINED_SPACE submit with unsafe O2, H2S, or CO readings while keeping draft permissive', () => {
      const plannedStart = new Date(Date.now() + 30 * 60 * 1000);
      const unsafeDetails = {
        space_id: 'CS-TANK-01',
        entry_point: 'Manhole A',
        atmosphere_test: {
          o2_pct: 24.1,
          lel_pct: 0,
          h2s_ppm: 15,
          co_ppm: 42,
          tested_at: new Date(plannedStart.getTime() - 10 * 60 * 1000).toISOString(),
        },
        standby_attendant: 'John Doe',
        rescue_plan: 'ERP-CS-001',
        ventilation_method: 'forced_mechanical',
      };

      const draftResult = validatePermitDetails(
        PermitTypeCode.CONFINED_SPACE,
        unsafeDetails,
        'draft',
        { plannedStart, plannedEnd: new Date(plannedStart.getTime() + 3600000) }
      );
      expect(draftResult.valid).toBe(true);

      const submitResult = validatePermitDetails(
        PermitTypeCode.CONFINED_SPACE,
        unsafeDetails,
        'submit',
        { plannedStart, plannedEnd: new Date(plannedStart.getTime() + 3600000) }
      );
      expect(submitResult.valid).toBe(false);
      expect(
        submitResult.issues.some((i: ValidationIssue) => i.code === 'UNSAFE_ATMOSPHERE')
      ).toBe(true);
      expect(
        submitResult.issues.map((i: ValidationIssue) => i.path.join('.'))
      ).toEqual(
        expect.arrayContaining([
          'atmosphere_test.o2_pct',
          'atmosphere_test.h2s_ppm',
          'atmosphere_test.co_ppm',
        ])
      );
    });
  });
});

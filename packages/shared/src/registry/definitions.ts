import { UserRole } from '../roles.js';
import type { PermitTypeConfig, FieldDefinition, PermitTypeRuleResult } from './types.js';

export const GAS_SAFETY_THRESHOLDS = {
  lelMaxPct: 10,
  o2MinPct: 19.5,
  o2MaxPct: 23.5,
  h2sMaxPpm: 10,
  coMaxPpm: 35,
} as const;

export interface UnsafeAtmosphereReading {
  field: string;
  value: number;
  threshold: string;
  message: string;
}

/**
 * Evaluates recorded gas/atmosphere readings against GAS_SAFETY_THRESHOLDS.
 * Intended for submit-time enforcement while allowing drafts to remain permissive.
 */
export function evaluateGasThresholds(
  sectionKey: string,
  readings: Record<string, unknown> | undefined
): PermitTypeRuleResult {
  if (!readings) return { valid: true };
  const offendingReadings: UnsafeAtmosphereReading[] = [];

  const lel = readings['lel_pct'];
  if (typeof lel === 'number' && Number.isFinite(lel) && lel > GAS_SAFETY_THRESHOLDS.lelMaxPct) {
    offendingReadings.push({
      field: `${sectionKey}.lel_pct`,
      value: lel,
      threshold: `<= ${GAS_SAFETY_THRESHOLDS.lelMaxPct}%`,
      message: `LEL (${lel}%) exceeds maximum allowable limit (${GAS_SAFETY_THRESHOLDS.lelMaxPct}%)`,
    });
  }

  const o2 = readings['o2_pct'];
  if (
    typeof o2 === 'number' &&
    Number.isFinite(o2) &&
    (o2 < GAS_SAFETY_THRESHOLDS.o2MinPct || o2 > GAS_SAFETY_THRESHOLDS.o2MaxPct)
  ) {
    offendingReadings.push({
      field: `${sectionKey}.o2_pct`,
      value: o2,
      threshold: `${GAS_SAFETY_THRESHOLDS.o2MinPct}% - ${GAS_SAFETY_THRESHOLDS.o2MaxPct}%`,
      message: `O2 (${o2}%) is outside safe atmospheric range (${GAS_SAFETY_THRESHOLDS.o2MinPct}% - ${GAS_SAFETY_THRESHOLDS.o2MaxPct}%)`,
    });
  }

  const h2s = readings['h2s_ppm'];
  if (typeof h2s === 'number' && Number.isFinite(h2s) && h2s > GAS_SAFETY_THRESHOLDS.h2sMaxPpm) {
    offendingReadings.push({
      field: `${sectionKey}.h2s_ppm`,
      value: h2s,
      threshold: `<= ${GAS_SAFETY_THRESHOLDS.h2sMaxPpm} ppm`,
      message: `H2S (${h2s} ppm) exceeds permissible exposure limit (${GAS_SAFETY_THRESHOLDS.h2sMaxPpm} ppm)`,
    });
  }

  const co = readings['co_ppm'];
  if (typeof co === 'number' && Number.isFinite(co) && co > GAS_SAFETY_THRESHOLDS.coMaxPpm) {
    offendingReadings.push({
      field: `${sectionKey}.co_ppm`,
      value: co,
      threshold: `<= ${GAS_SAFETY_THRESHOLDS.coMaxPpm} ppm`,
      message: `CO (${co} ppm) exceeds safety threshold (${GAS_SAFETY_THRESHOLDS.coMaxPpm} ppm)`,
    });
  }

  if (offendingReadings.length > 0) {
    return {
      valid: false,
      code: 'UNSAFE_ATMOSPHERE',
      message: offendingReadings.map((r) => r.message).join('; '),
      details: { offendingReadings },
    };
  }

  return { valid: true };
}

export const PermitTypeCode = {
  HOT_WORK: 'HOT_WORK',
  CONFINED_SPACE: 'CONFINED_SPACE',
  WORKING_AT_HEIGHT: 'WORKING_AT_HEIGHT',
  ELECTRICAL_LOTO: 'ELECTRICAL_LOTO',
} as const;

export type PermitTypeCode = (typeof PermitTypeCode)[keyof typeof PermitTypeCode];

export const ALL_PERMIT_TYPE_CODES: readonly PermitTypeCode[] = [
  PermitTypeCode.HOT_WORK,
  PermitTypeCode.CONFINED_SPACE,
  PermitTypeCode.WORKING_AT_HEIGHT,
  PermitTypeCode.ELECTRICAL_LOTO,
] as const;

export const HOT_WORK_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'hot_work_type',
    label: 'Hot Work Type',
    type: 'select',
    required: true,
    options: ['welding', 'grinding', 'cutting', 'soldering'],
  },
  {
    key: 'fire_watch_assigned',
    label: 'Dedicated Fire Watch Assigned',
    type: 'boolean',
    required: true,
  },
  {
    key: 'extinguisher_type',
    label: 'Fire Extinguisher Type',
    type: 'text',
    required: true,
  },
  {
    key: 'combustibles_cleared_radius_m',
    label: 'Combustibles Cleared Radius',
    type: 'number',
    unit: 'm',
    min: 0,
    required: true,
  },
  {
    key: 'gas_test',
    label: 'Combustible Gas Test',
    type: 'readings',
    required: true,
    subFields: [
      {
        key: 'lel_pct',
        label: 'Lower Explosive Limit (LEL)',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: 'o2_pct',
        label: 'Oxygen Concentration (O2)',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: 'tested_at',
        label: 'Test Timestamp',
        type: 'datetime',
        required: true,
      },
    ],
  },
] as const;

export const CONFINED_SPACE_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'space_id',
    label: 'Confined Space ID / Identifier',
    type: 'text',
    required: true,
  },
  {
    key: 'entry_point',
    label: 'Designated Entry Point',
    type: 'text',
    required: true,
  },
  {
    key: 'atmosphere_test',
    label: 'Pre-Entry Atmosphere Test',
    type: 'readings',
    required: true,
    subFields: [
      {
        key: 'o2_pct',
        label: 'Oxygen (O2)',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: 'lel_pct',
        label: 'Flammable Gas / LEL',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: 'h2s_ppm',
        label: 'Hydrogen Sulfide (H2S)',
        type: 'number',
        unit: 'ppm',
        min: 0,
        required: true,
      },
      {
        key: 'co_ppm',
        label: 'Carbon Monoxide (CO)',
        type: 'number',
        unit: 'ppm',
        min: 0,
        required: true,
      },
      {
        key: 'tested_at',
        label: 'Test Timestamp',
        type: 'datetime',
        required: true,
      },
    ],
  },
  {
    key: 'standby_attendant',
    label: 'Designated Standby Attendant',
    type: 'text',
    required: true,
  },
  {
    key: 'rescue_plan',
    label: 'Emergency Rescue Plan Reference',
    type: 'text',
    required: true,
  },
  {
    key: 'ventilation_method',
    label: 'Ventilation Method',
    type: 'select',
    required: true,
    options: ['forced_mechanical', 'natural_draft', 'local_exhaust', 'continuous_purge'],
  },
] as const;

export const WORKING_AT_HEIGHT_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'height_m',
    label: 'Working Height',
    type: 'number',
    unit: 'm',
    min: 0,
    required: true,
  },
  {
    key: 'access_method',
    label: 'Access Method',
    type: 'select',
    required: true,
    options: ['scaffold', 'ladder', 'MEWP', 'rope'],
  },
  {
    key: 'fall_arrest_equipment',
    label: 'Fall Arrest Equipment Specified',
    type: 'text',
    required: true,
  },
  {
    key: 'anchor_point_checked',
    label: 'Anchor Points Inspected & Certified',
    type: 'boolean',
    required: true,
  },
  {
    key: 'barricading_below',
    label: 'Drop Zone Barricaded & Signposted',
    type: 'boolean',
    required: true,
  },
] as const;

export const ELECTRICAL_LOTO_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'equipment_tag',
    label: 'Equipment Tag Number',
    type: 'text',
    required: true,
  },
  {
    key: 'voltage_level',
    label: 'Voltage Level (e.g. 415V, 6.6kV, 11kV)',
    type: 'text',
    required: true,
  },
  {
    key: 'isolation_points',
    label: 'Electrical Isolation Points',
    type: 'list',
    listItemType: 'text',
    required: true,
  },
  {
    key: 'lock_numbers',
    label: 'Safety Padlock / Lock Numbers',
    type: 'list',
    listItemType: 'text',
    required: true,
  },
  {
    key: 'tag_numbers',
    label: 'Danger / Warning Tag Numbers',
    type: 'list',
    listItemType: 'text',
    required: true,
  },
  {
    key: 'earthing_applied',
    label: 'Portable Earths Applied',
    type: 'boolean',
    required: true,
  },
  {
    key: 'tested_dead_by',
    label: 'Tested Dead Verified By',
    type: 'text',
    required: true,
  },
] as const;

const BUILTIN_PERMIT_TYPES: Record<string, PermitTypeConfig> = {
  [PermitTypeCode.HOT_WORK]: {
    code: PermitTypeCode.HOT_WORK,
    name: 'Hot Work Permit',
    description: 'Work involving naked flames, sparks, welding, grinding, or heat production.',
    fields: HOT_WORK_FIELDS,
    requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
    rules: [
      {
        id: 'HOT_WORK_GAS_SAFETY_THRESHOLDS',
        description:
          'Hot work gas test readings must fall within safe atmospheric limits on submit.',
        validate: ({ details }) =>
          evaluateGasThresholds(
            'gas_test',
            details['gas_test'] as Record<string, unknown> | undefined
          ),
      },
    ],
  },
  [PermitTypeCode.CONFINED_SPACE]: {
    code: PermitTypeCode.CONFINED_SPACE,
    name: 'Confined Space Entry Permit',
    description: 'Entry into spaces with limited openings, poor natural ventilation, or hazardous atmosphere.',
    fields: CONFINED_SPACE_FIELDS,
    requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
    rules: [
      {
        id: 'CONFINED_SPACE_GAS_SAFETY_THRESHOLDS',
        description:
          'Confined space pre-entry atmosphere readings must fall within safe limits on submit.',
        validate: ({ details }) =>
          evaluateGasThresholds(
            'atmosphere_test',
            details['atmosphere_test'] as Record<string, unknown> | undefined
          ),
      },
      {
        id: 'CONFINED_SPACE_GAS_TEST_WINDOW',
        description:
          'Confined space atmosphere test must be recorded within 60 minutes before planned start.',
        validate: ({ details, plannedStart }) => {
          if (!plannedStart || Number.isNaN(plannedStart.getTime())) {
            return { valid: true };
          }
          const test = details['atmosphere_test'] as
            | { tested_at?: string | number | Date }
            | undefined;
          if (!test || !test.tested_at) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_MISSING',
              message: 'Atmosphere test with tested_at timestamp is required for confined space submit.',
              details: { field: 'atmosphere_test.tested_at' },
            };
          }
          const testedAtDate = new Date(test.tested_at);
          if (Number.isNaN(testedAtDate.getTime())) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_INVALID_DATE',
              message: 'Atmosphere test tested_at is not a valid date timestamp.',
              details: { field: 'atmosphere_test.tested_at' },
            };
          }
          const diffMs = plannedStart.getTime() - testedAtDate.getTime();
          const sixtyMinutesMs = 60 * 60 * 1000;
          // Test must have occurred within 60 minutes prior to plannedStart, or slightly after if starting now
          if (diffMs > sixtyMinutesMs) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_STALE',
              message: `Atmosphere test was conducted more than 60 minutes before planned start (${Math.round(diffMs / 60000)} mins prior). Re-testing is mandatory.`,
              details: { field: 'atmosphere_test.tested_at' },
            };
          }
          if (diffMs < -sixtyMinutesMs) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_IN_FUTURE',
              message: 'Atmosphere test timestamp cannot be far in the future relative to planned start.',
              details: { field: 'atmosphere_test.tested_at' },
            };
          }
          return { valid: true };
        },
      },
    ],
  },
  [PermitTypeCode.WORKING_AT_HEIGHT]: {
    code: PermitTypeCode.WORKING_AT_HEIGHT,
    name: 'Working at Height Permit',
    description: 'Work where a person could fall a distance liable to cause personal injury.',
    fields: WORKING_AT_HEIGHT_FIELDS,
    requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
  },
  [PermitTypeCode.ELECTRICAL_LOTO]: {
    code: PermitTypeCode.ELECTRICAL_LOTO,
    name: 'Electrical Isolation & LOTO Permit',
    description: 'Lockout/Tagout isolation of electrical circuits and switchgear.',
    fields: ELECTRICAL_LOTO_FIELDS,
    requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
  },
};

const permitTypeRegistry = new Map<string, PermitTypeConfig>(
  Object.entries(BUILTIN_PERMIT_TYPES)
);

export function registerPermitType(config: PermitTypeConfig): void {
  permitTypeRegistry.set(config.code, config);
}

export function getPermitTypeConfig(code: string): PermitTypeConfig | undefined {
  return permitTypeRegistry.get(code);
}

export function getAllPermitTypeConfigs(): PermitTypeConfig[] {
  return Array.from(permitTypeRegistry.values());
}

export function isPermitTypeRegistered(code: string): boolean {
  return permitTypeRegistry.has(code);
}

export function resetPermitTypeRegistry(): void {
  permitTypeRegistry.clear();
  for (const [code, config] of Object.entries(BUILTIN_PERMIT_TYPES)) {
    permitTypeRegistry.set(code, config);
  }
}

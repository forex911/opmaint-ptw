import { UserRole } from '../roles.js';
import type { PermitTypeConfig, FieldDefinition } from './types.js';

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
  },
  [PermitTypeCode.CONFINED_SPACE]: {
    code: PermitTypeCode.CONFINED_SPACE,
    name: 'Confined Space Entry Permit',
    description: 'Entry into spaces with limited openings, poor natural ventilation, or hazardous atmosphere.',
    fields: CONFINED_SPACE_FIELDS,
    requiredApproverRoles: [UserRole.AREA_OWNER, UserRole.SAFETY_OFFICER],
    rules: [
      {
        id: 'CONFINED_SPACE_GAS_TEST_WINDOW',
        description:
          'Confined space atmosphere test must be recorded within 60 minutes before planned start.',
        validate: ({ details, plannedStart }) => {
          const test = details['atmosphere_test'] as
            | { tested_at?: string | number | Date }
            | undefined;
          if (!test || !test.tested_at) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_MISSING',
              message: 'Atmosphere test with tested_at timestamp is required for confined space submit.',
            };
          }
          const testedAtDate = new Date(test.tested_at);
          if (Number.isNaN(testedAtDate.getTime())) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_INVALID_DATE',
              message: 'Atmosphere test tested_at is not a valid date timestamp.',
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
            };
          }
          if (diffMs < -sixtyMinutesMs) {
            return {
              valid: false,
              code: 'ATMOSPHERE_TEST_IN_FUTURE',
              message: 'Atmosphere test timestamp cannot be far in the future relative to planned start.',
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

import type { UserRole } from '../roles.js';

export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'boolean'
  | 'datetime'
  | 'list'
  | 'readings';

export interface SubFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'datetime' | 'boolean' | 'select';
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  options?: readonly string[];
  min?: number;
  max?: number;
  subFields?: readonly SubFieldDefinition[];
  listItemType?: 'text' | 'number';
}

export interface PermitTypeRuleContext {
  details: Record<string, unknown>;
  plannedStart: Date;
  plannedEnd: Date;
  now?: Date;
}

export interface PermitTypeRuleResult {
  valid: boolean;
  code?: string;
  message?: string;
}

export interface PermitTypeRule {
  id: string;
  description: string;
  validate: (context: PermitTypeRuleContext) => PermitTypeRuleResult;
}

export interface PermitTypeConfig {
  code: string;
  name: string;
  description: string;
  fields: readonly FieldDefinition[];
  requiredApproverRoles?: readonly UserRole[];
  rules?: readonly PermitTypeRule[];
}

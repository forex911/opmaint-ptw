import { z } from 'zod';
import type {
  FieldDefinition,
  SubFieldDefinition,
  PermitTypeRuleContext,
  PermitTypeRuleResult,
} from './types.js';
import { getPermitTypeConfig } from './definitions.js';

export type ValidationMode = 'submit' | 'draft';

function buildSubFieldZodSchema(
  subField: SubFieldDefinition,
  mode: ValidationMode
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  const isStrictRequired = mode === 'submit' && Boolean(subField.required);

  switch (subField.type) {
    case 'text':
      schema = z.string().trim();
      if (isStrictRequired) {
        schema = (schema as z.ZodString).min(1, `${subField.label} cannot be empty`);
      }
      break;

    case 'number': {
      let numSchema = z.coerce.number({
        required_error: `${subField.label} is required`,
        invalid_type_error: `${subField.label} must be a valid number`,
      });
      if (typeof subField.min === 'number') {
        numSchema = numSchema.min(
          subField.min,
          `${subField.label} must be at least ${subField.min}`
        );
      }
      if (typeof subField.max === 'number') {
        numSchema = numSchema.max(
          subField.max,
          `${subField.label} must be at most ${subField.max}`
        );
      }
      schema = z.preprocess((val) => {
        if (val === '' || val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
          return isStrictRequired ? undefined : null;
        }
        return val;
      }, isStrictRequired ? numSchema : numSchema.nullable().optional());
      return schema;
    }

    case 'boolean':
      schema = z.boolean();
      break;

    case 'datetime': {
      const dtSchema = z.union([
        z.string().datetime({ offset: true }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}T/, 'Must be an ISO datetime string'),
        z.date(),
      ]);
      schema = z.preprocess((val) => {
        if (val === '' || val === null || val === undefined) {
          return isStrictRequired ? undefined : null;
        }
        return val;
      }, isStrictRequired ? dtSchema : dtSchema.nullable().optional());
      return schema;
    }

    case 'select':
      if (subField.options && subField.options.length > 0) {
        schema = z.enum(subField.options as [string, ...string[]]);
      } else {
        schema = z.string().trim();
      }
      break;

    default:
      schema = z.unknown();
  }

  if (mode === 'draft' || !subField.required) {
    schema = schema.optional().nullable();
  }

  return schema;
}

function buildFieldZodSchema(
  field: FieldDefinition,
  mode: ValidationMode
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  const isStrictRequired = mode === 'submit' && Boolean(field.required);

  switch (field.type) {
    case 'text':
      schema = z.string().trim();
      if (isStrictRequired) {
        schema = (schema as z.ZodString).min(1, `${field.label} is required`);
      }
      break;

    case 'number': {
      let numSchema = z.coerce.number({
        required_error: `${field.label} is required`,
        invalid_type_error: `${field.label} must be a valid number`,
      });
      if (typeof field.min === 'number') {
        numSchema = numSchema.min(
          field.min,
          `${field.label} must be at least ${field.min}`
        );
      }
      if (typeof field.max === 'number') {
        numSchema = numSchema.max(
          field.max,
          `${field.label} must be at most ${field.max}`
        );
      }
      schema = z.preprocess((val) => {
        if (val === '' || val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val))) {
          return isStrictRequired ? undefined : null;
        }
        return val;
      }, isStrictRequired ? numSchema : numSchema.nullable().optional());
      return schema;
    }

    case 'boolean':
      schema = z.boolean();
      break;

    case 'datetime': {
      const dtSchema = z.union([
        z.string().datetime({ offset: true }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}T/, 'Must be an ISO datetime string'),
        z.date(),
      ]);
      schema = z.preprocess((val) => {
        if (val === '' || val === null || val === undefined) {
          return isStrictRequired ? undefined : null;
        }
        return val;
      }, isStrictRequired ? dtSchema : dtSchema.nullable().optional());
      return schema;
    }

    case 'select':
      if (field.options && field.options.length > 0) {
        schema = z.enum(field.options as [string, ...string[]]);
      } else {
        schema = z.string().trim();
      }
      break;

    case 'list': {
      const itemSchema =
        field.listItemType === 'number'
          ? z.coerce.number()
          : z.string().trim().min(1, 'List item cannot be empty');
      let listSchema = z.array(itemSchema);
      if (mode === 'submit' && field.required) {
        listSchema = listSchema.min(1, `${field.label} must have at least one entry`);
      }
      schema = listSchema;
      break;
    }

    case 'readings': {
      if (field.subFields && field.subFields.length > 0) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const sub of field.subFields) {
          shape[sub.key] = buildSubFieldZodSchema(sub, mode);
        }
        schema = z.object(shape);
      } else {
        schema = z.record(z.unknown());
      }
      break;
    }

    default:
      schema = z.unknown();
  }

  if (mode === 'draft' || !field.required) {
    schema = schema.optional().nullable();
  }

  return schema;
}

export function buildDetailsZodSchema(
  fields: readonly FieldDefinition[],
  mode: ValidationMode = 'submit'
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.key] = buildFieldZodSchema(field, mode);
  }
  return z.object(shape).passthrough();
}

export function getDetailsZodSchemaForType(
  typeCode: string,
  mode: ValidationMode = 'submit'
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const config = getPermitTypeConfig(typeCode);
  if (!config) {
    throw new Error(`Permit type '${typeCode}' is not registered in permit type registry`);
  }
  return buildDetailsZodSchema(config.fields, mode);
}

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ValidatePermitDetailsResult {
  valid: boolean;
  data?: Record<string, unknown>;
  issues: ValidationIssue[];
}

export function validatePermitDetails(
  typeCode: string,
  details: unknown,
  mode: ValidationMode,
  ruleContext?: Omit<PermitTypeRuleContext, 'details'>
): ValidatePermitDetailsResult {
  const config = getPermitTypeConfig(typeCode);
  if (!config) {
    return {
      valid: false,
      issues: [
        {
          path: ['type'],
          message: `Unknown or unregistered permit type '${typeCode}'`,
          code: 'UNREGISTERED_PERMIT_TYPE',
        },
      ],
    };
  }

  const schema = buildDetailsZodSchema(config.fields, mode);
  const parsed = schema.safeParse(details ?? {});

  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
      path: i.path,
      message: i.message,
      code: i.code,
    }));
    return {
      valid: false,
      issues,
    };
  }

  const validatedData = parsed.data as Record<string, unknown>;

  // In submit mode, always execute type-specific domain rules (including safety thresholds)
  if (mode === 'submit' && config.rules) {
    const context: PermitTypeRuleContext = {
      details: validatedData,
      plannedStart: ruleContext?.plannedStart,
      plannedEnd: ruleContext?.plannedEnd,
      now: ruleContext?.now ?? new Date(),
    };

    for (const rule of config.rules) {
      const result: PermitTypeRuleResult = rule.validate(context);
      if (!result.valid) {
        const offendingReadings = result.details?.['offendingReadings'];
        if (Array.isArray(offendingReadings) && offendingReadings.length > 0) {
          return {
            valid: false,
            data: validatedData,
            issues: offendingReadings.map((reading) => {
              const r = reading as {
                field?: string;
                message?: string;
                value?: number;
                threshold?: string;
              };
              return {
                path: r.field ? r.field.split('.') : ['details', rule.id],
                message: r.message ?? result.message ?? `Rule validation failed: ${rule.description}`,
                code: result.code ?? 'TYPE_RULE_FAILED',
                details: r as Record<string, unknown>,
              };
            }),
          };
        }

        const targetField = result.details?.['field'];
        return {
          valid: false,
          data: validatedData,
          issues: [
            {
              path: typeof targetField === 'string' ? targetField.split('.') : ['details', rule.id],
              message: result.message ?? `Rule validation failed: ${rule.description}`,
              code: result.code ?? 'TYPE_RULE_FAILED',
              details: result.details,
            },
          ],
        };
      }
    }
  }

  return {
    valid: true,
    data: validatedData,
    issues: [],
  };
}

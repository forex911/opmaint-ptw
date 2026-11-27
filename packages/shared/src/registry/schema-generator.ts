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

  switch (subField.type) {
    case 'text':
      schema = z.string().trim();
      if (mode === 'submit' && subField.required) {
        schema = (schema as z.ZodString).min(1, `${subField.label} cannot be empty`);
      }
      break;

    case 'number':
      schema = z.coerce.number();
      if (typeof subField.min === 'number') {
        schema = (schema as z.ZodNumber).min(
          subField.min,
          `${subField.label} must be at least ${subField.min}`
        );
      }
      if (typeof subField.max === 'number') {
        schema = (schema as z.ZodNumber).max(
          subField.max,
          `${subField.label} must be at most ${subField.max}`
        );
      }
      break;

    case 'boolean':
      schema = z.boolean();
      break;

    case 'datetime':
      // Accept string datetime or Date object, ensure valid date
      schema = z.union([
        z.string().datetime({ offset: true }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}T/, 'Must be an ISO datetime string'),
        z.date(),
      ]);
      break;

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

  switch (field.type) {
    case 'text':
      schema = z.string().trim();
      if (mode === 'submit' && field.required) {
        schema = (schema as z.ZodString).min(1, `${field.label} is required`);
      }
      break;

    case 'number':
      schema = z.coerce.number();
      if (typeof field.min === 'number') {
        schema = (schema as z.ZodNumber).min(
          field.min,
          `${field.label} must be at least ${field.min}`
        );
      }
      if (typeof field.max === 'number') {
        schema = (schema as z.ZodNumber).max(
          field.max,
          `${field.label} must be at most ${field.max}`
        );
      }
      break;

    case 'boolean':
      schema = z.boolean();
      break;

    case 'datetime':
      schema = z.union([
        z.string().datetime({ offset: true }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}T/, 'Must be an ISO datetime string'),
        z.date(),
      ]);
      break;

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

        return {
          valid: false,
          data: validatedData,
          issues: [
            {
              path: ['details', rule.id],
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

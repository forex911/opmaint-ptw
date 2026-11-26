import React from 'react';
import { getPermitTypeConfig, type FieldDefinition } from '@ptw/shared';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Input } from '../ui/Input.js';

interface DynamicFieldsProps {
  type: string;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
}

export const DynamicFields: React.FC<DynamicFieldsProps> = ({
  type,
  values,
  onChange,
  errors = {},
  readOnly = false,
}) => {
  const config = getPermitTypeConfig(type as any);

  if (!config) {
    return (
      <div className="p-4 bg-amber-50 text-amber-800 text-xs rounded-lg">
        No specific dynamic schema configured for permit type: {type}
      </div>
    );
  }

  const renderField = (field: FieldDefinition) => {
    const value = values[field.key];
    const fieldError = errors[field.key] || errors[`details.${field.key}`];

    switch (field.type) {
      case 'text':
        return (
          <Input
            key={field.key}
            label={field.label + (field.unit ? ` (${field.unit})` : '')}
            required={field.required}
            value={value || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            disabled={readOnly}
            error={fieldError}
          />
        );

      case 'number':
        return (
          <Input
            key={field.key}
            type="number"
            label={field.label + (field.unit ? ` (${field.unit})` : '')}
            required={field.required}
            min={field.min}
            max={field.max}
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => onChange(field.key, e.target.value === '' ? null : Number(e.target.value))}
            disabled={readOnly}
            error={fieldError}
          />
        );

      case 'select':
        return (
          <div key={field.key} className="w-full">
            <label
              htmlFor={field.key}
              className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider"
            >
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              id={field.key}
              value={value || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={readOnly}
              className={`w-full px-3.5 py-2 text-sm text-[#172033] bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                fieldError ? 'border-red-500' : 'border-[#E2E8F0] focus:border-emerald-600'
              }`}
            >
              <option value="">Select an option...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            {fieldError && <p className="mt-1 text-xs text-red-600 font-medium">{fieldError}</p>}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.key} className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <input
              type="checkbox"
              id={field.key}
              checked={!!value}
              onChange={(e) => onChange(field.key, e.target.checked)}
              disabled={readOnly}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            <label htmlFor={field.key} className="text-sm font-medium text-[#172033] cursor-pointer">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {fieldError && <p className="mt-1 text-xs text-red-600 font-medium">{fieldError}</p>}
          </div>
        );

      case 'datetime':
        return (
          <Input
            key={field.key}
            type="datetime-local"
            label={field.label}
            required={field.required}
            value={value ? new Date(value).toISOString().slice(0, 16) : ''}
            onChange={(e) => onChange(field.key, e.target.value ? new Date(e.target.value).toISOString() : null)}
            disabled={readOnly}
            error={fieldError}
          />
        );

      case 'list': {
        const listItems: string[] = Array.isArray(value) ? value : [];
        return (
          <div key={field.key} className="space-y-2 p-4 rounded-lg border border-slate-200 bg-slate-50/40">
            <label className="block text-xs font-semibold text-[#172033] uppercase tracking-wider">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {listItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...listItems];
                    next[idx] = e.target.value;
                    onChange(field.key, next);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = listItems.filter((_, i) => i !== idx);
                      onChange(field.key, next);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(field.key, [...listItems, ''])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            )}
          </div>
        );
      }

      case 'readings': {
        const readingsData = typeof value === 'object' && value !== null ? value : {};
        return (
          <div key={field.key} className="space-y-4 p-5 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-[#172033] flex items-center gap-2">
                  <span>{field.label}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    Gas Calibration Test
                  </span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record multi-gas detector measurements. Readings must fall within certified industrial safety thresholds.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field.subFields?.map((subField) => {
                const subVal = readingsData[subField.key];
                const subErr = errors[`${field.key}.${subField.key}`] || errors[`details.${field.key}.${subField.key}`];

                // Real-time gas threshold visual safety validation
                let safetyAlert: string | null = null;
                if (subField.key === 'lel_pct' && Number(subVal) > 10) {
                  safetyAlert = 'LEL exceeds maximum allowable hot work limit (10%)!';
                }
                if (subField.key === 'o2_pct' && (Number(subVal) < 19.5 || Number(subVal) > 23.5)) {
                  safetyAlert = 'O2 concentration is outside safe atmospheric range (19.5% – 23.5%)!';
                }
                if (subField.key === 'h2s_ppm' && Number(subVal) > 10) {
                  safetyAlert = 'H2S exceeds 10 ppm permissible exposure limit!';
                }
                if (subField.key === 'co_ppm' && Number(subVal) > 35) {
                  safetyAlert = 'CO concentration exceeds 35 ppm safety threshold!';
                }

                if (subField.type === 'number') {
                  return (
                    <div key={subField.key}>
                      <Input
                        type="number"
                        label={subField.label + (subField.unit ? ` (${subField.unit})` : '')}
                        required={subField.required}
                        min={subField.min}
                        max={subField.max}
                        value={subVal !== undefined && subVal !== null ? subVal : ''}
                        disabled={readOnly}
                        error={subErr}
                        onChange={(e) => {
                          const next = {
                            ...readingsData,
                            [subField.key]: e.target.value === '' ? null : Number(e.target.value),
                          };
                          onChange(field.key, next);
                        }}
                      />
                      {safetyAlert && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{safetyAlert}</span>
                        </div>
                      )}
                    </div>
                  );
                }

                if (subField.type === 'datetime') {
                  return (
                    <Input
                      key={subField.key}
                      type="datetime-local"
                      label={subField.label}
                      required={subField.required}
                      value={subVal ? new Date(subVal).toISOString().slice(0, 16) : ''}
                      disabled={readOnly}
                      error={subErr}
                      onChange={(e) => {
                        const next = {
                          ...readingsData,
                          [subField.key]: e.target.value ? new Date(e.target.value).toISOString() : null,
                        };
                        onChange(field.key, next);
                      }}
                    />
                  );
                }

                return (
                  <Input
                    key={subField.key}
                    type="text"
                    label={subField.label}
                    required={subField.required}
                    value={subVal || ''}
                    disabled={readOnly}
                    error={subErr}
                    onChange={(e) => {
                      const next = {
                        ...readingsData,
                        [subField.key]: e.target.value,
                      };
                      onChange(field.key, next);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-2">
        <h3 className="text-sm font-bold text-[#172033] uppercase tracking-wider">
          {config.name} Specification Details
        </h3>
        <p className="text-xs text-[#64748B] mt-0.5">{config.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {config.fields.map((field) => (
          <div
            key={field.key}
            className={field.type === 'readings' || field.type === 'list' ? 'md:col-span-2' : ''}
          >
            {renderField(field)}
          </div>
        ))}
      </div>
    </div>
  );
};

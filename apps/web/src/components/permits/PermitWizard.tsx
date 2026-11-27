import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Flame,
  Box,
  ArrowUpRight,
  Zap,
  Check,
  ChevronRight,
  ChevronLeft,
  Save,
  Send,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../ui/Button.js';
import { Card } from '../ui/Card.js';
import { Input } from '../ui/Input.js';
import { DynamicFields } from './DynamicFields.js';
import { PermitTypeCode } from '@ptw/shared';
import type { Permit } from '../../types/index.js';

const COMMON_HAZARDS = [
  'Flammable / Combustible Materials',
  'Toxic Gases / Vapors',
  'Oxygen Deficiency',
  'High Voltage / Stored Electrical Energy',
  'Working at Elevation / Fall Hazard',
  'Moving Mechanical Equipment',
  'Extreme Heat / Thermal Radiation',
  'Pressurized Piping / Steam',
];

const COMMON_PPE = [
  'Hard Hat (EN 397)',
  'Safety Glasses / Face Shield',
  'Safety Footwear with Steel Toe (EN ISO 20345)',
  'High-Visibility Vest',
  'Flame-Resistant Clothing',
  'Full Body Harness with Shock-Absorbing Lanyard',
  'Respirator / SCBA (Self-Contained Breathing Apparatus)',
  'Insulated Voltage-Rated Gloves',
];

const COMMON_PRECAUTIONS = [
  'Area inspected and cleared of debris prior to start',
  'Fire extinguisher inspected and positioned within 5 meters',
  'Lockout / Tagout (LOTO) locks and tags applied and verified',
  'Continuous atmospheric monitoring equipment calibrated and operational',
  'Barricades and warning signage erected around work perimeter',
  'Safety briefing conducted with all contractor crew members',
];

const STEP_2_FIELDS = new Set([
  'workDescription',
  'contractorTeam',
  'plantId',
  'areaId',
  'equipmentId',
  'plannedStart',
  'plannedEnd',
]);

const STEP_4_FIELDS = new Set(['hazards', 'ppe', 'precautions']);

const IGNORED_DETAIL_KEYS = new Set(['from', 'action', 'allowedActions', 'issues', 'fields', 'offendingReadings']);

function toDateTimeLocalInput(isoOrDate?: string | null): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function extractFieldErrors(details: unknown): Record<string, string> {
  const errorsObj: Record<string, string> = {};
  if (!details || typeof details !== 'object') return errorsObj;

  if (Array.isArray(details)) {
    details.forEach((issue: any) => {
      const path = Array.isArray(issue?.path) ? issue.path.join('.') : 'general';
      errorsObj[path || 'general'] = String(issue?.message || 'Invalid field');
    });
    return errorsObj;
  }

  const record = details as Record<string, unknown>;

  if (record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields)) {
    Object.entries(record.fields as Record<string, unknown>).forEach(([k, v]) => {
      errorsObj[k] = Array.isArray(v) ? String(v[0]) : String(v);
    });
  }

  if (Array.isArray(record.offendingReadings)) {
    record.offendingReadings.forEach((r: any) => {
      if (r?.field && r?.message) {
        errorsObj[String(r.field)] = String(r.message);
      }
    });
  }

  Object.entries(record).forEach(([k, v]) => {
    if (IGNORED_DETAIL_KEYS.has(k) || errorsObj[k]) return;
    if (Array.isArray(v) && v.length > 0) {
      errorsObj[k] = String(v[0]);
    } else if (typeof v === 'string' && v.trim() !== '') {
      errorsObj[k] = v;
    }
  });

  return errorsObj;
}

export function resolveStepForErrorKey(key: string): number {
  if (key === 'type') return 1;
  if (STEP_2_FIELDS.has(key)) return 2;
  if (STEP_4_FIELDS.has(key)) return 4;
  if (key === 'general' || key === '_root') return 5;
  return 3;
}

export interface PermitWizardProps {
  mode: 'create' | 'edit';
  initialPermit?: Permit;
  initialFieldErrors?: Record<string, string>;
  initialErrorMessage?: string | null;
}

export const PermitWizard: React.FC<PermitWizardProps> = ({
  mode,
  initialPermit,
  initialFieldErrors,
  initialErrorMessage,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initialStepFromErrors =
    initialFieldErrors && Object.keys(initialFieldErrors).length > 0
      ? Math.min(...Object.keys(initialFieldErrors).map(resolveStepForErrorKey))
      : 1;

  const [currentStep, setCurrentStep] = useState(initialStepFromErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage ?? null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(initialFieldErrors ?? {});
  const [currentVersion, setCurrentVersion] = useState<number>(initialPermit?.version ?? 1);
  const [hydratedId, setHydratedId] = useState<string | null>(initialPermit?.id ?? null);

  // Form State
  const [formData, setFormData] = useState(() => ({
    type: (initialPermit?.type || PermitTypeCode.HOT_WORK) as string,
    plantId: initialPermit?.plantId || '',
    areaId: initialPermit?.areaId || '',
    equipmentId: initialPermit?.equipmentId || '',
    contractorTeam: initialPermit?.contractorTeam || '',
    workDescription: initialPermit?.workDescription || '',
    plannedStart: toDateTimeLocalInput(initialPermit?.plannedStart),
    plannedEnd: toDateTimeLocalInput(initialPermit?.plannedEnd),
    hazards: [...(initialPermit?.hazards || [])] as string[],
    ppe: [...(initialPermit?.ppe || [])] as string[],
    precautions: [...(initialPermit?.precautions || [])] as string[],
    details: { ...(initialPermit?.details || {}) } as Record<string, any>,
  }));

  useEffect(() => {
    if (mode === 'edit' && initialPermit && initialPermit.id !== hydratedId) {
      setHydratedId(initialPermit.id);
      setCurrentVersion(initialPermit.version);
      setFormData({
        type: initialPermit.type,
        plantId: initialPermit.plantId,
        areaId: initialPermit.areaId,
        equipmentId: initialPermit.equipmentId || '',
        contractorTeam: initialPermit.contractorTeam,
        workDescription: initialPermit.workDescription,
        plannedStart: toDateTimeLocalInput(initialPermit.plannedStart),
        plannedEnd: toDateTimeLocalInput(initialPermit.plannedEnd),
        hazards: [...(initialPermit.hazards || [])],
        ppe: [...(initialPermit.ppe || [])],
        precautions: [...(initialPermit.precautions || [])],
        details: { ...(initialPermit.details || {}) },
      });
    }
  }, [mode, initialPermit, hydratedId]);

  // Fetch Reference Data
  const { data: plantsData } = useQuery({
    queryKey: ['plants'],
    queryFn: () => api.getPlants(),
  });

  const { data: areasData } = useQuery({
    queryKey: ['areas', formData.plantId],
    queryFn: () => api.getAreas(formData.plantId || undefined),
    enabled: !!formData.plantId,
  });

  const { data: equipmentData } = useQuery({
    queryKey: ['equipment', formData.areaId],
    queryFn: () => api.getEquipment(formData.areaId || undefined),
    enabled: !!formData.areaId,
  });

  // When plant changes via user action, reset area and equipment
  const handlePlantChange = (plantId: string) => {
    setFormData((prev) => ({
      ...prev,
      plantId,
      areaId: '',
      equipmentId: '',
    }));
  };

  // When area changes via user action, reset equipment
  const handleAreaChange = (areaId: string) => {
    setFormData((prev) => ({
      ...prev,
      areaId,
      equipmentId: '',
    }));
  };

  const toggleArrayItem = (key: 'hazards' | 'ppe' | 'precautions', item: string) => {
    setFormData((prev) => {
      const current = prev[key];
      const next = current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item];
      return { ...prev, [key]: next };
    });
  };

  const handleDetailChange = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      details: {
        ...prev.details,
        [key]: value,
      },
    }));
  };

  const handleSave = async (submitForApproval: boolean = false) => {
    setErrorMessage(null);
    setSaveNotice(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      let permitId = initialPermit?.id;

      if (mode === 'create') {
        const createPayload: Record<string, unknown> = {
          type: formData.type,
          plantId: formData.plantId,
          areaId: formData.areaId,
          contractorTeam: formData.contractorTeam,
          workDescription: formData.workDescription,
          plannedStart: formData.plannedStart ? new Date(formData.plannedStart).toISOString() : '',
          plannedEnd: formData.plannedEnd ? new Date(formData.plannedEnd).toISOString() : '',
          hazards: formData.hazards,
          ppe: formData.ppe,
          precautions: formData.precautions,
          details: formData.details,
        };

        if (formData.equipmentId && formData.equipmentId.trim() !== '') {
          createPayload.equipmentId = formData.equipmentId;
        }

        const res = await api.createPermit(createPayload);
        permitId = res.permit.id;
        setCurrentVersion(res.permit.version);

        if (submitForApproval) {
          await api.submitPermit(permitId, 'Initial submission for authorization');
        }

        navigate(`/permits/${permitId}`);
        return;
      }

      // Edit mode: PATCH with latest optimistic version
      if (!permitId) return;

      const patchPayload: Record<string, unknown> = {
        version: currentVersion,
        plantId: formData.plantId,
        areaId: formData.areaId,
        equipmentId: formData.equipmentId && formData.equipmentId.trim() !== '' ? formData.equipmentId : null,
        contractorTeam: formData.contractorTeam,
        workDescription: formData.workDescription,
        plannedStart: formData.plannedStart ? new Date(formData.plannedStart).toISOString() : undefined,
        plannedEnd: formData.plannedEnd ? new Date(formData.plannedEnd).toISOString() : undefined,
        hazards: formData.hazards,
        ppe: formData.ppe,
        precautions: formData.precautions,
        details: formData.details,
      };

      if (initialPermit?.status === 'DRAFT') {
        patchPayload.type = formData.type;
      }

      const updatedRes = await api.updatePermit(permitId, patchPayload);
      const refreshedVersion = updatedRes.permit.version;
      setCurrentVersion(refreshedVersion);
      queryClient.invalidateQueries({ queryKey: ['permit', permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-audit', permitId] });
      queryClient.invalidateQueries({ queryKey: ['permits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      if (submitForApproval) {
        const submittedRes = await api.submitPermit(permitId, 'Submitted from permit editor');
        if (submittedRes?.permit?.version) {
          setCurrentVersion(submittedRes.permit.version);
        }
        queryClient.invalidateQueries({ queryKey: ['permit', permitId] });
        navigate(`/permits/${permitId}`);
        return;
      }

      setSaveNotice(`Draft saved cleanly (v${refreshedVersion}). You can continue editing or submit when ready.`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        const errorsObj = extractFieldErrors(err.details);
        setFieldErrors(errorsObj);
        setErrorMessage(
          Object.keys(errorsObj).length > 0
            ? 'Validation error: Please review the highlighted fields below.'
            : err.message || 'Validation failed.'
        );
        const stepNums = Object.keys(errorsObj).map(resolveStepForErrorKey);
        if (stepNums.length > 0) {
          setCurrentStep(Math.min(...stepNums));
        }
      } else {
        setErrorMessage(err.message || 'Failed to save permit request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeCards = [
    {
      code: PermitTypeCode.HOT_WORK,
      label: 'Hot Work Permit',
      desc: 'Welding, torch cutting, open flame grinding, and spark-generating activities.',
      icon: <Flame className="w-6 h-6 text-amber-600" />,
      bg: 'hover:border-amber-500',
    },
    {
      code: PermitTypeCode.CONFINED_SPACE,
      label: 'Confined Space Entry',
      desc: 'Tanks, vessels, silos, pits, or enclosed areas with restricted entry/egress.',
      icon: <Box className="w-6 h-6 text-blue-600" />,
      bg: 'hover:border-blue-500',
    },
    {
      code: PermitTypeCode.WORKING_AT_HEIGHT,
      label: 'Working at Height',
      desc: 'Elevated structures, scaffold platforms, ladders, or fall risk exceeding 1.8m.',
      icon: <ArrowUpRight className="w-6 h-6 text-emerald-600" />,
      bg: 'hover:border-emerald-500',
    },
    {
      code: PermitTypeCode.ELECTRICAL_LOTO,
      label: 'Electrical Isolation (LOTO)',
      desc: 'Lockout/tagout of energized electrical circuits, switchgear, and motors.',
      icon: <Zap className="w-6 h-6 text-purple-600" />,
      bg: 'hover:border-purple-500',
    },
  ];

  const isPendingApprovalEdit = mode === 'edit' && initialPermit?.status === 'PENDING_APPROVAL';
  const showSubmitButton = mode === 'create' || initialPermit?.status === 'DRAFT';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Stepper Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">
            {mode === 'edit' && initialPermit
              ? `Edit Draft Permit ${initialPermit.permitNo}`
              : 'Draft New Permit to Work'}
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {mode === 'edit'
              ? `Editing stored permit fields (v${currentVersion}). Save draft changes or submit for authorization.`
              : 'Follow industrial safety protocols to request job authorization.'}
          </p>
        </div>

        {mode === 'edit' && initialPermit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/permits/${initialPermit.id}`)}
            className="gap-1.5 self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Permit</span>
          </Button>
        )}
      </div>

      {/* Stepper Indicator */}
      <div className="grid grid-cols-5 gap-2 text-xs font-semibold">
        {[
          { num: 1, label: 'Permit Type' },
          { num: 2, label: 'Job & Location' },
          { num: 3, label: 'Safety Details' },
          { num: 4, label: 'Precautions & PPE' },
          { num: 5, label: 'Review & Submit' },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => setCurrentStep(s.num)}
            className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
              currentStep === s.num
                ? 'bg-[#0E231D] text-white border-[#0E231D]'
                : currentStep > s.num
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              {currentStep > s.num ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <span>{s.num}.</span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {isPendingApprovalEdit && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Approvals Will Be Reset Upon Save</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Editing this permit while in <strong>PENDING_APPROVAL</strong> resets existing Area Owner and Safety Officer sign-offs back to PENDING.
            </p>
          </div>
        </div>
      )}

      {saveNotice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">{errorMessage}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                {Object.entries(fieldErrors).map(([k, msg]) => (
                  <li key={k}>
                    <strong className="font-mono">{k}</strong>: {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* STEP 1: Choose Type */}
      {currentStep === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-bold text-[#172033]">Step 1: Select Hazardous Permit Type</h2>
          <p className="text-xs text-[#64748B]">
            {isPendingApprovalEdit
              ? 'Permit type cannot be altered after submission (return to DRAFT only for type changes).'
              : 'Choose the operational category corresponding to the hazardous activity.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {typeCards.map((card) => {
              const selected = formData.type === card.code;
              return (
                <div
                  key={card.code}
                  onClick={() => {
                    if (!isPendingApprovalEdit) {
                      setFormData({ ...formData, type: card.code });
                    }
                  }}
                  className={`p-5 rounded-xl border-2 transition-all ${
                    isPendingApprovalEdit ? 'opacity-75 cursor-not-allowed' : `cursor-pointer ${card.bg}`
                  } ${
                    selected
                      ? 'border-[#059669] bg-emerald-50/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                      {card.icon}
                    </div>
                    {selected && (
                      <span className="p-1 rounded-full bg-[#059669] text-white">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-[#172033] mt-3">{card.label}</h3>
                  <p className="text-xs text-[#64748B] mt-1">{card.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="primary" onClick={() => setCurrentStep(2)} className="gap-2">
              <span>Next: Location & Window</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: Job & Location */}
      {currentStep === 2 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-base font-bold text-[#172033]">Step 2: Job Description, Location & Window</h2>

          <div className="space-y-4">
            <Input
              label="Work Description / Scope"
              required
              placeholder="e.g. Flare line pipe spool welding and NDT inspection"
              value={formData.workDescription}
              onChange={(e) => setFormData({ ...formData, workDescription: e.target.value })}
              error={fieldErrors['workDescription']}
            />

            <Input
              label="Contractor / Maintenance Crew"
              required
              placeholder="e.g. Apex Engineering Services Ltd."
              value={formData.contractorTeam}
              onChange={(e) => setFormData({ ...formData, contractorTeam: e.target.value })}
              error={fieldErrors['contractorTeam']}
            />

            {/* Cascading Location Selects */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              {/* Plant */}
              <div>
                <label htmlFor="plant-select" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Plant <span className="text-red-500">*</span>
                </label>
                <select
                  id="plant-select"
                  aria-label="Plant"
                  value={formData.plantId}
                  onChange={(e) => handlePlantChange(e.target.value)}
                  className={`w-full px-3 py-2 text-xs border rounded-lg bg-white text-slate-800 ${
                    fieldErrors['plantId'] ? 'border-red-500' : 'border-[#E2E8F0]'
                  }`}
                >
                  <option value="">Select Plant...</option>
                  {plantsData?.plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
                {fieldErrors['plantId'] && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors['plantId']}</p>
                )}
              </div>

              {/* Area */}
              <div>
                <label htmlFor="area-select" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Area <span className="text-red-500">*</span>
                </label>
                <select
                  id="area-select"
                  aria-label="Area"
                  value={formData.areaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                  disabled={!formData.plantId}
                  className={`w-full px-3 py-2 text-xs border rounded-lg bg-white text-slate-800 disabled:bg-slate-100 ${
                    fieldErrors['areaId'] ? 'border-red-500' : 'border-[#E2E8F0]'
                  }`}
                >
                  <option value="">Select Area...</option>
                  {areasData?.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
                {fieldErrors['areaId'] && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors['areaId']}</p>
                )}
              </div>

              {/* Equipment */}
              <div>
                <label htmlFor="equipment-select" className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Equipment <span className="text-slate-400 font-normal normal-case">(optional for draft)</span>
                </label>
                <select
                  id="equipment-select"
                  aria-label="Equipment"
                  value={formData.equipmentId}
                  onChange={(e) => setFormData({ ...formData, equipmentId: e.target.value })}
                  disabled={!formData.areaId || (equipmentData?.equipment && equipmentData.equipment.length === 0)}
                  className={`w-full px-3 py-2 text-xs border rounded-lg bg-white text-slate-800 disabled:bg-slate-100 ${
                    fieldErrors['equipmentId'] ? 'border-red-500' : 'border-[#E2E8F0]'
                  }`}
                >
                  <option value="">
                    {!formData.areaId
                      ? 'Select Area first...'
                      : equipmentData?.equipment && equipmentData.equipment.length === 0
                      ? 'No equipment in this area (optional)'
                      : 'Select Equipment (optional)...'}
                  </option>
                  {equipmentData?.equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} ({eq.tag})
                    </option>
                  ))}
                </select>
                {fieldErrors['equipmentId'] && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{fieldErrors['equipmentId']}</p>
                )}
              </div>
            </div>

            {/* Window: Planned Start & End */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="datetime-local"
                label="Planned Start Time"
                required
                value={formData.plannedStart}
                onChange={(e) => setFormData({ ...formData, plannedStart: e.target.value })}
                error={fieldErrors['plannedStart']}
              />
              <Input
                type="datetime-local"
                label="Planned End Time"
                required
                value={formData.plannedEnd}
                onChange={(e) => setFormData({ ...formData, plannedEnd: e.target.value })}
                error={fieldErrors['plannedEnd']}
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <Button variant="primary" onClick={() => setCurrentStep(3)}>
              <span>Next: Dynamic Safety Details</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3: Type-Specific Dynamic Fields */}
      {currentStep === 3 && (
        <Card className="p-6 space-y-5">
          <DynamicFields
            type={formData.type}
            values={formData.details}
            onChange={handleDetailChange}
            errors={fieldErrors}
          />

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <Button variant="primary" onClick={() => setCurrentStep(4)}>
              <span>Next: Hazards & Precautions</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4: Hazards, PPE & Precautions */}
      {currentStep === 4 && (
        <Card className="p-6 space-y-6">
          <h2 className="text-base font-bold text-[#172033]">Step 4: Safety Checklists (Hazards, PPE & Precautions)</h2>

          {/* Hazards */}
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-2">
              Identified Site Hazards
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {COMMON_HAZARDS.map((hazard) => {
                const checked = formData.hazards.includes(hazard);
                return (
                  <div
                    key={hazard}
                    onClick={() => toggleArrayItem('hazards', hazard)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#059669] focus:ring-[#059669]" />
                    <span>{hazard}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PPE */}
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-2">
              Required Personal Protective Equipment (PPE)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {COMMON_PPE.map((ppe) => {
                const checked = formData.ppe.includes(ppe);
                return (
                  <div
                    key={ppe}
                    onClick={() => toggleArrayItem('ppe', ppe)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#059669] focus:ring-[#059669]" />
                    <span>{ppe}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Precautions */}
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-2">
              Mandatory Safety Precautions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {COMMON_PRECAUTIONS.map((precaution) => {
                const checked = formData.precautions.includes(precaution);
                return (
                  <div
                    key={precaution}
                    onClick={() => toggleArrayItem('precautions', precaution)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#059669] focus:ring-[#059669]" />
                    <span>{precaution}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setCurrentStep(3)}>
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <Button variant="primary" onClick={() => setCurrentStep(5)}>
              <span>Next: Final Review</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 5: Review & Save / Submit */}
      {currentStep === 5 && (
        <Card className="p-6 space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-[#172033]">Step 5: Review & Authorize</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Verify all information before saving draft updates or dispatching for approval.
            </p>
          </div>

          {/* Summary Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="font-semibold text-slate-500 uppercase">Permit Type:</span>
              <p className="font-bold text-slate-900 mt-0.5">{formData.type.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 uppercase">Contractor Crew:</span>
              <p className="font-bold text-slate-900 mt-0.5">{formData.contractorTeam || 'N/A'}</p>
            </div>
            <div className="md:col-span-2">
              <span className="font-semibold text-slate-500 uppercase">Work Description:</span>
              <p className="font-medium text-slate-900 mt-0.5">{formData.workDescription || 'N/A'}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 uppercase">Planned Start:</span>
              <p className="font-mono text-slate-800 mt-0.5">{formData.plannedStart ? new Date(formData.plannedStart).toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500 uppercase">Planned End:</span>
              <p className="font-mono text-slate-800 mt-0.5">{formData.plannedEnd ? new Date(formData.plannedEnd).toLocaleString() : 'N/A'}</p>
            </div>
          </div>

          {/* Safety Checklists Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="font-bold text-slate-700">Hazards Selected ({formData.hazards.length})</span>
              <ul className="list-disc list-inside mt-2 text-slate-600 space-y-1">
                {formData.hazards.map((h) => (
                  <li key={h} className="text-[11px] truncate">{h}</li>
                ))}
              </ul>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="font-bold text-slate-700">PPE Required ({formData.ppe.length})</span>
              <ul className="list-disc list-inside mt-2 text-slate-600 space-y-1">
                {formData.ppe.map((p) => (
                  <li key={p} className="text-[11px] truncate">{p}</li>
                ))}
              </ul>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="font-bold text-slate-700">Precautions ({formData.precautions.length})</span>
              <ul className="list-disc list-inside mt-2 text-slate-600 space-y-1">
                {formData.precautions.map((p) => (
                  <li key={p} className="text-[11px] truncate">{p}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Dual Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200">
            <Button variant="outline" onClick={() => setCurrentStep(4)}>
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                size="md"
                onClick={() => handleSave(false)}
                isLoading={isSubmitting}
                className="flex-1 sm:flex-initial gap-2"
              >
                <Save className="w-4 h-4 text-slate-600" />
                <span>{mode === 'edit' ? 'Save Draft Changes' : 'Save Draft Only'}</span>
              </Button>

              {showSubmitButton && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleSave(true)}
                  isLoading={isSubmitting}
                  className="flex-1 sm:flex-initial gap-2 bg-[#059669] hover:bg-[#047857]"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit for Approval</span>
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

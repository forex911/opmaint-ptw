import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { api, ApiError } from '../api/client.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Input } from '../components/ui/Input.js';
import { DynamicFields } from '../components/permits/DynamicFields.js';
import { PermitTypeCode } from '@ptw/shared';

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

export const CreatePermitPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form State
  const [formData, setFormData] = useState({
    type: PermitTypeCode.HOT_WORK as string,
    plantId: '',
    areaId: '',
    equipmentId: '',
    contractorTeam: '',
    workDescription: '',
    plannedStart: '',
    plannedEnd: '',
    hazards: [] as string[],
    ppe: [] as string[],
    precautions: [] as string[],
    details: {} as Record<string, any>,
  });

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

  // Auto-select first plant when loaded
  useEffect(() => {
    if (plantsData?.plants && plantsData.plants.length > 0 && !formData.plantId) {
      setFormData((prev) => ({ ...prev, plantId: plantsData.plants[0].id }));
    }
  }, [plantsData, formData.plantId]);

  // When plant changes, reset area and equipment
  const handlePlantChange = (plantId: string) => {
    setFormData((prev) => ({
      ...prev,
      plantId,
      areaId: '',
      equipmentId: '',
    }));
  };

  // When area changes, reset equipment
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
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      // 1. Create permit (creates draft)
      const res = await api.createPermit({
        type: formData.type,
        plantId: formData.plantId,
        areaId: formData.areaId,
        equipmentId: formData.equipmentId,
        contractorTeam: formData.contractorTeam,
        workDescription: formData.workDescription,
        plannedStart: new Date(formData.plannedStart).toISOString(),
        plannedEnd: new Date(formData.plannedEnd).toISOString(),
        hazards: formData.hazards,
        ppe: formData.ppe,
        precautions: formData.precautions,
        details: formData.details,
      });

      const permitId = res.permit.id;

      // 2. If user chose Submit for Approval, advance state immediately
      if (submitForApproval) {
        await api.submitPermit(permitId, 'Initial submission for authorization');
      }

      navigate(`/permits/${permitId}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        setErrorMessage('Validation error: Please review the highlighted fields below.');
        if (err.details && typeof err.details === 'object') {
          const errorsObj: Record<string, string> = {};
          if (Array.isArray(err.details)) {
            err.details.forEach((issue: any) => {
              const path = issue.path?.join('.') || 'general';
              errorsObj[path] = issue.message;
            });
          } else {
            Object.entries(err.details as Record<string, any>).forEach(([k, v]) => {
              errorsObj[k] = Array.isArray(v) ? v[0] : String(v);
            });
          }
          setFieldErrors(errorsObj);
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Stepper Header */}
      <div>
        <h1 className="text-xl font-bold text-[#172033]">Draft New Permit to Work</h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Follow industrial safety protocols to request job authorization.
        </p>

        {/* Stepper Indicator */}
        <div className="grid grid-cols-5 gap-2 mt-6 text-xs font-semibold">
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
                  ? 'bg-[#14243A] text-white border-[#14243A]'
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
      </div>

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
            Choose the operational category corresponding to the hazardous activity.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {typeCards.map((card) => {
              const selected = formData.type === card.code;
              return (
                <div
                  key={card.code}
                  onClick={() => setFormData({ ...formData, type: card.code })}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${card.bg} ${
                    selected
                      ? 'border-[#2563EB] bg-blue-50/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                      {card.icon}
                    </div>
                    {selected && (
                      <span className="p-1 rounded-full bg-[#2563EB] text-white">
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
                <label className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Plant <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.plantId}
                  onChange={(e) => handlePlantChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-800"
                >
                  <option value="">Select Plant...</option>
                  {plantsData?.plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Area <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.areaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                  disabled={!formData.plantId}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-800 disabled:bg-slate-100"
                >
                  <option value="">Select Area...</option>
                  {areasData?.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Equipment */}
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5 uppercase tracking-wider">
                  Equipment <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.equipmentId}
                  onChange={(e) => setFormData({ ...formData, equipmentId: e.target.value })}
                  disabled={!formData.areaId}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white text-slate-800 disabled:bg-slate-100"
                >
                  <option value="">Select Equipment...</option>
                  {equipmentData?.equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} ({eq.tagNo})
                    </option>
                  ))}
                </select>
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
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#2563EB]" />
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
                        ? 'bg-blue-50 text-blue-900 border-blue-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#2563EB]" />
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
                    <input type="checkbox" checked={checked} readOnly className="rounded text-[#2563EB]" />
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

      {/* STEP 5: Review & Submit */}
      {currentStep === 5 && (
        <Card className="p-6 space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-[#172033]">Step 5: Review & Authorize</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Verify all information before saving as draft or dispatching for area owner & safety officer approval.
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

          {/* Dual Action Buttons: Save Draft vs Submit */}
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
                <span>Save Draft Only</span>
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={() => handleSave(true)}
                isLoading={isSubmitting}
                className="flex-1 sm:flex-initial gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
              >
                <Send className="w-4 h-4" />
                <span>Submit for Approval</span>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

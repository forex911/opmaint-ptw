import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;
import { env } from '../config/env.js';
import { getPool, closeDbConnection } from './client.js';
import {
  PermitTypeCode,
  PermitStatus,
  UserRole,
  validatePermitDetails,
} from '@ptw/shared';

export interface SeedCredentials {
  role: string;
  name: string;
  email: string;
  passwordPlain: string;
}

export const SEED_ACCOUNTS: SeedCredentials[] = [
  {
    role: UserRole.REQUESTER,
    name: 'Rajesh Kumar',
    email: 'requester@cmms.local',
    passwordPlain: 'PtwPass2026!',
  },
  {
    role: UserRole.AREA_OWNER,
    name: 'Suresh Raman',
    email: 'area.owner@cmms.local',
    passwordPlain: 'PtwPass2026!',
  },
  {
    role: UserRole.AREA_OWNER,
    name: 'Karthik Venkat',
    email: 'area.owner2@cmms.local',
    passwordPlain: 'PtwPass2026!',
  },
  {
    role: UserRole.SAFETY_OFFICER,
    name: 'Priya Nair',
    email: 'safety.officer@cmms.local',
    passwordPlain: 'PtwPass2026!',
  },
  {
    role: UserRole.ADMIN,
    name: 'Admin User',
    email: 'admin@cmms.local',
    passwordPlain: 'PtwPass2026!',
  },
];

export interface SeedPlantDef {
  code: string;
  name: string;
  address: string;
}

export const SEED_PLANTS: SeedPlantDef[] = [
  {
    code: 'PLANT-CHE-01',
    name: 'Manali Petrochemical Complex',
    address: 'Express Highway, Manali Industrial Zone, Chennai, Tamil Nadu 600068',
  },
  {
    code: 'PLANT-ENR-02',
    name: 'Ennore Power & Marine Terminal',
    address: 'Port Access Corridor, Voyalur Post, Ennore, Chennai, Tamil Nadu 600120',
  },
  {
    code: 'PLANT-CBE-03',
    name: 'Coimbatore Gas & Turbine Station',
    address: 'Trichy Road, Sulur Industrial Park, Coimbatore, Tamil Nadu 641402',
  },
];

export interface SeedAreaDef {
  plantCode: string;
  code: string;
  name: string;
  ownerEmail: string;
}

export const SEED_AREAS: SeedAreaDef[] = [
  // Manali Petrochemical Complex (PLANT-CHE-01)
  {
    plantCode: 'PLANT-CHE-01',
    code: 'AREA-MPC-01',
    name: 'Alkylation & Reforming Unit 02',
    ownerEmail: 'area.owner@cmms.local',
  },
  {
    plantCode: 'PLANT-CHE-01',
    code: 'AREA-MPC-02',
    name: 'Crude Distillation Column A',
    ownerEmail: 'area.owner@cmms.local',
  },
  {
    plantCode: 'PLANT-CHE-01',
    code: 'AREA-MPC-03',
    name: 'High Voltage Substation Yard 110kV',
    ownerEmail: 'area.owner2@cmms.local',
  },
  // Ennore Power & Marine Terminal (PLANT-ENR-02)
  {
    plantCode: 'PLANT-ENR-02',
    code: 'AREA-ENR-01',
    name: 'Boiler Island Block B',
    ownerEmail: 'area.owner@cmms.local',
  },
  {
    plantCode: 'PLANT-ENR-02',
    code: 'AREA-ENR-02',
    name: 'Marine Fuel Bunker Berth 3',
    ownerEmail: 'area.owner2@cmms.local',
  },
  {
    plantCode: 'PLANT-ENR-02',
    code: 'AREA-ENR-03',
    name: 'Cooling Water Pumphouse',
    ownerEmail: 'area.owner@cmms.local',
  },
  // Coimbatore Gas & Turbine Station (PLANT-CBE-03)
  {
    plantCode: 'PLANT-CBE-03',
    code: 'AREA-CBE-01',
    name: 'Turbine Generator Hall GT-1',
    ownerEmail: 'area.owner2@cmms.local',
  },
  {
    plantCode: 'PLANT-CBE-03',
    code: 'AREA-CBE-02',
    name: 'Gas Compression & Metering Station',
    ownerEmail: 'area.owner@cmms.local',
  },
];

export interface SeedEquipmentDef {
  areaCode: string;
  tag: string;
  name: string;
}

export const SEED_EQUIPMENT: SeedEquipmentDef[] = [
  // AREA-MPC-01
  { areaCode: 'AREA-MPC-01', tag: 'P-101A', name: 'Feed Charge Pump A' },
  { areaCode: 'AREA-MPC-01', tag: 'P-101B', name: 'Feed Charge Pump B (Standby)' },
  { areaCode: 'AREA-MPC-01', tag: 'V-204', name: 'Surge Vessel Column' },
  { areaCode: 'AREA-MPC-01', tag: 'R-101', name: 'Catalytic Reactor 01' },

  // AREA-MPC-02
  { areaCode: 'AREA-MPC-02', tag: 'C-101', name: 'Atmospheric Distillation Column' },
  { areaCode: 'AREA-MPC-02', tag: 'E-101A', name: 'Crude Preheater Exchanger A' },
  { areaCode: 'AREA-MPC-02', tag: 'P-202A', name: 'Bottoms Residue Pump' },

  // AREA-MPC-03
  { areaCode: 'AREA-MPC-03', tag: 'TR-110-1', name: '110kV Main Step-down Transformer' },
  { areaCode: 'AREA-MPC-03', tag: 'SWG-01', name: '11kV Switchgear Incomer Breaker' },
  { areaCode: 'AREA-MPC-03', tag: 'MCC-01', name: 'Motor Control Center Switchgear' },

  // AREA-ENR-01
  { areaCode: 'AREA-ENR-01', tag: 'BLR-02', name: 'High Pressure Steam Boiler #2' },
  { areaCode: 'AREA-ENR-01', tag: 'BFP-02A', name: 'Boiler Feedwater Pump 2A' },
  { areaCode: 'AREA-ENR-01', tag: 'ID-FAN-02', name: 'Induced Draft Flue Gas Fan' },
  { areaCode: 'AREA-ENR-01', tag: 'SHT-201', name: 'Superheater Header Steam Line' },

  // AREA-ENR-02
  { areaCode: 'AREA-ENR-02', tag: 'MLA-03', name: 'Marine Loading Arm Berth 3' },
  { areaCode: 'AREA-ENR-02', tag: 'BP-301', name: 'Bunker Fuel Transfer Pump' },
  { areaCode: 'AREA-ENR-02', tag: 'BD-301', name: 'Vapor Recovery Balancing Drum' },

  // AREA-ENR-03
  { areaCode: 'AREA-ENR-03', tag: 'CWP-01A', name: 'Primary Sea Cooling Water Pump A' },
  { areaCode: 'AREA-ENR-03', tag: 'CWP-01B', name: 'Primary Sea Cooling Water Pump B' },
  { areaCode: 'AREA-ENR-03', tag: 'FLT-101', name: 'Traveling Water Screen Filter' },

  // AREA-CBE-01
  { areaCode: 'AREA-CBE-01', tag: 'GT-01', name: '45MW Gas Turbine Generator' },
  { areaCode: 'AREA-CBE-01', tag: 'LOB-01', name: 'Turbine Lube Oil Skid System' },
  { areaCode: 'AREA-CBE-01', tag: 'EXC-01', name: 'Static Exciter Panel' },

  // AREA-CBE-02
  { areaCode: 'AREA-CBE-02', tag: 'C-301B', name: 'Centrifugal Gas Compressor' },
  { areaCode: 'AREA-CBE-02', tag: 'E-102', name: 'Shell & Tube Heat Exchanger' },
  { areaCode: 'AREA-CBE-02', tag: 'MTR-201', name: 'Custody Transfer Ultrasonic Gas Meter' },
];

export async function seedDatabase(customPool?: pkg.Pool): Promise<void> {
  const ownPool = !customPool && env.ADMIN_DATABASE_URL ? new Pool({ connectionString: env.ADMIN_DATABASE_URL }) : null;
  const pool = customPool || ownPool || getPool();
  const client = await pool.connect();

  console.log('🌱 Starting idempotent database seeding...');

  try {
    await client.query('BEGIN');

    // 1. Seed Users (idempotent upsert on users.email)
    console.log('  👤 Seeding Users...');
    const userMap = new Map<string, string>(); // email -> id

    for (const account of SEED_ACCOUNTS) {
      const passwordHash = await bcrypt.hash(account.passwordPlain, 10);
      const res = await client.query(
        `
        INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (email) DO UPDATE 
        SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true
        RETURNING id;
      `,
        [account.name, account.email, passwordHash, account.role]
      );
      userMap.set(account.email, res.rows[0].id);
    }

    const requesterId = userMap.get('requester@cmms.local')!;
    const areaOwnerId = userMap.get('area.owner@cmms.local')!;
    const safetyOfficerId = userMap.get('safety.officer@cmms.local')!;

    // 2. Seed Plants (idempotent upsert on plants.code)
    console.log('  🏭 Seeding Plants...');
    const plantMap = new Map<string, string>(); // plantCode -> id

    for (const plant of SEED_PLANTS) {
      const res = await client.query(
        `
        INSERT INTO plants (code, name, address, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, address = EXCLUDED.address, is_active = true
        RETURNING id;
      `,
        [plant.code, plant.name, plant.address]
      );
      plantMap.set(plant.code, res.rows[0].id);
    }

    // 3. Seed Areas (idempotent upsert on areas (plant_id, code))
    console.log('  📍 Seeding Areas...');
    const areaMap = new Map<string, string>(); // areaCode -> id

    for (const area of SEED_AREAS) {
      const plantId = plantMap.get(area.plantCode)!;
      const ownerId = userMap.get(area.ownerEmail) || areaOwnerId;

      const res = await client.query(
        `
        INSERT INTO areas (plant_id, code, name, owner_id, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (plant_id, code) DO UPDATE
        SET name = EXCLUDED.name, owner_id = EXCLUDED.owner_id, is_active = true
        RETURNING id;
      `,
        [plantId, area.code, area.name, ownerId]
      );
      areaMap.set(area.code, res.rows[0].id);
    }

    // 4. Seed Equipment (idempotent upsert on equipment.tag)
    console.log('  ⚙️  Seeding Equipment...');
    const eqMap = new Map<string, string>(); // tag -> id

    for (const eq of SEED_EQUIPMENT) {
      const areaId = areaMap.get(eq.areaCode)!;

      const res = await client.query(
        `
        INSERT INTO equipment (area_id, tag, name, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (tag) DO UPDATE
        SET area_id = EXCLUDED.area_id, name = EXCLUDED.name, is_active = true
        RETURNING id;
      `,
        [areaId, eq.tag, eq.name]
      );
      eqMap.set(eq.tag, res.rows[0].id);
    }

    // 5. Seed 11 Permits across all statuses (idempotent upsert on permits.permit_no)
    console.log('  📋 Seeding 11 Permits across all statuses with audit trails...');

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const plant1Id = plantMap.get('PLANT-CHE-01')!;
    const plant2Id = plantMap.get('PLANT-ENR-02')!;

    const area1Id = areaMap.get('AREA-MPC-01')!;
    const area2Id = areaMap.get('AREA-ENR-01')!;
    const area3Id = areaMap.get('AREA-MPC-03')!;

    const eq1Id = eqMap.get('P-101A')!;
    const eq2Id = eqMap.get('V-204')!;
    const eq3Id = eqMap.get('BLR-02')!;
    const eq4Id = eqMap.get('SHT-201')!;
    const eq5Id = eqMap.get('MCC-01')!;

    const permitDefinitions = [
      {
        permitNo: 'PTW-2026-0001',
        type: PermitTypeCode.HOT_WORK,
        status: PermitStatus.ACTIVE, // Expiring in under 2 hours (45 mins remaining)
        requesterId,
        contractorTeam: 'Apex Mechanical Contractors',
        workDescription: 'Flange cutting and piping modifications on feed pump discharge line',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq1Id,
        plannedStart: new Date(now - 3 * oneHour),
        plannedEnd: new Date(now + 45 * 60 * 1000), // 45m from now
        hazards: ['Sparks', 'Hot Surfaces', 'Flammable Vapours'],
        ppe: ['Safety Helmet', 'Safety Boots', 'Welding Helmet', 'Leather Gloves'],
        details: {
          hot_work_type: 'cutting',
          fire_watch_assigned: true,
          extinguisher_type: 'CO2 5kg & DCP 9kg',
          combustibles_cleared_radius_m: 15,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            tested_at: new Date(now - 3 * oneHour - 15 * 60 * 1000).toISOString(),
          },
        },
      },
      {
        permitNo: 'PTW-2026-0002',
        type: PermitTypeCode.CONFINED_SPACE,
        status: PermitStatus.ACTIVE, // Active with plenty of time (6h remaining)
        requesterId,
        contractorTeam: 'CleanTank Services Ltd',
        workDescription: 'Internal vessel inspection and ultrasonic thickness testing',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq2Id,
        plannedStart: new Date(now - 2 * oneHour),
        plannedEnd: new Date(now + 6 * oneHour),
        hazards: ['Toxic Atmosphere', 'Oxygen Deficiency', 'Claustrophobia'],
        ppe: ['Safety Helmet', 'Coveralls', 'Full Body Harness', 'Continuous Multi-Gas Monitor'],
        details: {
          space_id: 'V-204-VESSEL',
          entry_point: 'Manway A Bottom',
          atmosphere_test: {
            o2_pct: 20.9,
            lel_pct: 0,
            h2s_ppm: 0,
            co_ppm: 0,
            tested_at: new Date(now - 2 * oneHour - 20 * 60 * 1000).toISOString(),
          },
          standby_attendant: 'K. Murugan',
          rescue_plan: 'ERP-CS-204-TRIPOD',
          ventilation_method: 'forced_mechanical',
        },
      },
      {
        permitNo: 'PTW-2026-0003',
        type: PermitTypeCode.WORKING_AT_HEIGHT,
        status: PermitStatus.EXPIRED, // Expired permit
        requesterId,
        contractorTeam: 'Elevate Scaffolding Corp',
        workDescription: 'Upper platform handrail replacement and structural inspection',
        plantId: plant2Id,
        areaId: area2Id,
        equipmentId: eq3Id,
        plannedStart: new Date(now - 12 * oneHour),
        plannedEnd: new Date(now - 2 * oneHour), // Ended 2 hours ago
        hazards: ['Fall from Height', 'Dropped Objects'],
        ppe: ['Safety Helmet with Chin Strap', 'Double Lanyard Harness', 'Toe-Board Netting'],
        details: {
          height_m: 14.5,
          access_method: 'scaffold',
          fall_arrest_equipment: 'Self-retracting lifeline (SRL)',
          anchor_point_checked: true,
          barricading_below: true,
        },
      },
      {
        permitNo: 'PTW-2026-0004',
        type: PermitTypeCode.ELECTRICAL_LOTO,
        status: PermitStatus.REJECTED, // Rejected permit
        requesterId,
        contractorTeam: 'PowerGrid Isolations',
        workDescription: 'Switchgear breaker maintenance and contact resistance check',
        plantId: plant1Id,
        areaId: area3Id,
        equipmentId: eq5Id,
        plannedStart: new Date(now + 2 * oneHour),
        plannedEnd: new Date(now + 6 * oneHour),
        hazards: ['Arc Flash', 'Electric Shock', 'Stored Energy'],
        ppe: ['40 cal/cm2 Arc Flash Suit', '11kV Insulating Gloves', 'Face Shield'],
        details: {
          equipment_tag: 'MCC-01-FED-04',
          voltage_level: '11kV',
          isolation_points: ['Feeder 4 Bus Isolator', 'Control DC Switch'],
          lock_numbers: ['RED-LOCK-101', 'RED-LOCK-102'],
          tag_numbers: ['LOTO-TAG-901', 'LOTO-TAG-902'],
          earthing_applied: true,
          tested_dead_by: 'M. Senthil (Authorised Electrical Person)',
        },
      },
      {
        permitNo: 'PTW-2026-0005',
        type: PermitTypeCode.HOT_WORK,
        status: PermitStatus.CLOSED_VERIFIED, // Completed and verified
        requesterId,
        contractorTeam: 'Apex Mechanical Contractors',
        workDescription: 'Steam line bypass valve welding',
        plantId: plant2Id,
        areaId: area2Id,
        equipmentId: eq4Id,
        plannedStart: new Date(now - 24 * oneHour),
        plannedEnd: new Date(now - 16 * oneHour),
        hazards: ['Hot Surfaces', 'High Pressure Steam'],
        ppe: ['Welding Hood', 'Leather Apron', 'Safety Boots'],
        details: {
          hot_work_type: 'welding',
          fire_watch_assigned: true,
          extinguisher_type: 'DCP 9kg',
          combustibles_cleared_radius_m: 12,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.8,
            tested_at: new Date(now - 24 * oneHour - 10 * 60 * 1000).toISOString(),
          },
        },
        completionNotes: 'Welding completed, radiographic test passed, area cleared and housekeeping verified.',
        closedAt: new Date(now - 17 * oneHour),
        verifiedBy: safetyOfficerId,
        verifiedAt: new Date(now - 16 * oneHour),
      },
      {
        permitNo: 'PTW-2026-0006',
        type: PermitTypeCode.CONFINED_SPACE,
        status: PermitStatus.PENDING_APPROVAL, // Awaiting approvals
        requesterId,
        contractorTeam: 'Vessel Safe Techs',
        workDescription: 'Internal sludge desludging and high pressure jetting',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq2Id,
        plannedStart: new Date(now + 4 * oneHour),
        plannedEnd: new Date(now + 12 * oneHour),
        hazards: ['Hydrocarbon Residues', 'Oxygen Deficiency'],
        ppe: ['Supplied Air Respirator (SAR)', 'Chemical Suit', 'Safety Boots'],
        details: {
          space_id: 'V-204-VESSEL',
          entry_point: 'Shell Manhole 1',
          atmosphere_test: {
            o2_pct: 20.9,
            lel_pct: 0,
            h2s_ppm: 0,
            co_ppm: 0,
            tested_at: new Date(now + 3 * oneHour + 45 * 60 * 1000).toISOString(),
          },
          standby_attendant: 'D. Selvam',
          rescue_plan: 'ERP-T501-EXTRACTION',
          ventilation_method: 'continuous_purge',
        },
      },
      {
        permitNo: 'PTW-2026-0007',
        type: PermitTypeCode.HOT_WORK,
        status: PermitStatus.DRAFT, // Draft permit
        requesterId,
        contractorTeam: 'Tube Welders Chennai',
        workDescription: 'Heat exchanger tube leak repair and grinding',
        plantId: plant2Id,
        areaId: area2Id,
        equipmentId: eq4Id,
        plannedStart: new Date(now + 24 * oneHour),
        plannedEnd: new Date(now + 32 * oneHour),
        hazards: ['Sparks', 'Dust'],
        ppe: ['Eye Protection', 'Safety Boots'],
        details: {
          hot_work_type: 'grinding',
          fire_watch_assigned: true,
        },
      },
      {
        permitNo: 'PTW-2026-0008',
        type: PermitTypeCode.WORKING_AT_HEIGHT,
        status: PermitStatus.SUSPENDED, // Suspended permit
        requesterId,
        contractorTeam: 'Skyline Access Ltd',
        workDescription: 'Flare stack tip camera installation',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq1Id,
        plannedStart: new Date(now - 4 * oneHour),
        plannedEnd: new Date(now + 4 * oneHour),
        hazards: ['High Wind', 'Height Fall', 'Heat Radiation'],
        ppe: ['Fall Arrest Harness', 'Windbreaker', 'Radio Headset'],
        details: {
          height_m: 42.0,
          access_method: 'MEWP',
          fall_arrest_equipment: 'Dual-lanyard harness with shock absorber',
          anchor_point_checked: true,
          barricading_below: true,
        },
      },
      {
        permitNo: 'PTW-2026-0009',
        type: PermitTypeCode.ELECTRICAL_LOTO,
        status: PermitStatus.CLOSED, // Closed by requester, awaiting verification
        requesterId,
        contractorTeam: 'PowerGrid Isolations',
        workDescription: 'Feed pump motor insulation resistance testing',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq1Id,
        plannedStart: new Date(now - 8 * oneHour),
        plannedEnd: new Date(now - 2 * oneHour),
        hazards: ['High Voltage', 'Induced Current'],
        ppe: ['Dielectric Boots', 'Arc Face Shield', 'Leather Overgloves'],
        details: {
          equipment_tag: 'P-101A-MTR',
          voltage_level: '6.6kV',
          isolation_points: ['Breaker 6.6kV Rack-out', 'Control Power Fuse'],
          lock_numbers: ['YELLOW-LOCK-44'],
          tag_numbers: ['LOTO-TAG-122'],
          earthing_applied: true,
          tested_dead_by: 'K. Natarajan',
        },
        completionNotes: 'Motor testing complete, Megger reading 500 Megohms. Padlocks removed.',
        closedAt: new Date(now - 1 * oneHour),
      },
      {
        permitNo: 'PTW-2026-0010',
        type: PermitTypeCode.HOT_WORK,
        status: PermitStatus.CANCELLED, // Cancelled permit
        requesterId,
        contractorTeam: 'Apex Mechanical Contractors',
        workDescription: 'Secondary flare line bracket welding',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq2Id,
        plannedStart: new Date(now + 1 * oneHour),
        plannedEnd: new Date(now + 5 * oneHour),
        hazards: ['Sparks', 'Combustible gas'],
        ppe: ['Welding Hood', 'Safety Boots'],
        details: {
          hot_work_type: 'welding',
          fire_watch_assigned: true,
          extinguisher_type: 'CO2 5kg',
          combustibles_cleared_radius_m: 10,
          gas_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            tested_at: new Date(now + 1 * oneHour - 15 * 60 * 1000).toISOString(),
          },
        },
      },
      {
        permitNo: 'PTW-2026-0011',
        type: PermitTypeCode.WORKING_AT_HEIGHT,
        status: PermitStatus.APPROVED, // Fully approved, awaiting planned_start / activation
        requesterId,
        contractorTeam: 'Skyline Access Ltd',
        workDescription: 'Pipe rack overhead structural support painting',
        plantId: plant1Id,
        areaId: area1Id,
        equipmentId: eq1Id,
        plannedStart: new Date(now + 2 * oneHour),
        plannedEnd: new Date(now + 8 * oneHour),
        hazards: ['Fall from Height', 'Paint Fumes'],
        ppe: ['Safety Harness', 'Respirator Mask', 'Safety Boots'],
        details: {
          height_m: 8.5,
          access_method: 'scaffold',
          fall_arrest_equipment: 'Full body harness with dual lanyard',
          anchor_point_checked: true,
          barricading_below: true,
        },
      },
    ];

    for (const p of permitDefinitions) {
      const mode = p.status === PermitStatus.DRAFT ? 'draft' : 'submit';
      const validation = validatePermitDetails(p.type, p.details, mode);
      if (!validation.valid && p.status !== PermitStatus.DRAFT) {
        console.warn(`⚠️ Warning: Seed permit ${p.permitNo} details validation note:`, validation.issues);
      }

      const existingPermit = await client.query(
        'SELECT id FROM permits WHERE permit_no = $1',
        [p.permitNo]
      );

      let permitId: string;
      const isNew = existingPermit.rows.length === 0;

      if (!isNew) {
        permitId = existingPermit.rows[0].id;
        await client.query(
          `
          UPDATE permits SET 
            type = $2, status = $3, contractor_team = $4, work_description = $5,
            plant_id = $6, area_id = $7, equipment_id = $8, planned_start = $9, planned_end = $10,
            hazards = $11, ppe = $12, details = $13, version = $14, completion_notes = $15,
            closed_at = $16, verified_by = $17, verified_at = $18
          WHERE id = $1;
        `,
          [
            permitId,
            p.type,
            p.status,
            p.contractorTeam,
            p.workDescription,
            p.plantId,
            p.areaId,
            p.equipmentId,
            p.plannedStart,
            p.plannedEnd,
            p.hazards,
            p.ppe,
            JSON.stringify(p.details),
            1,
            p.completionNotes ?? null,
            p.closedAt ?? null,
            p.verifiedBy ?? null,
            p.verifiedAt ?? null,
          ]
        );
      } else {
        const res = await client.query(
          `
          INSERT INTO permits (
            permit_no, type, status, requester_id, contractor_team, work_description,
            plant_id, area_id, equipment_id, planned_start, planned_end, hazards, ppe,
            details, version, completion_notes, closed_at, verified_by, verified_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) RETURNING id;
        `,
          [
            p.permitNo,
            p.type,
            p.status,
            p.requesterId,
            p.contractorTeam,
            p.workDescription,
            p.plantId,
            p.areaId,
            p.equipmentId,
            p.plannedStart,
            p.plannedEnd,
            p.hazards,
            p.ppe,
            JSON.stringify(p.details),
            1,
            p.completionNotes ?? null,
            p.closedAt ?? null,
            p.verifiedBy ?? null,
            p.verifiedAt ?? null,
          ]
        );
        permitId = res.rows[0].id;
      }

      if (isNew) {
        // Seed precautions
        await client.query(
          `
          INSERT INTO permit_precautions (permit_id, text, checked, checked_by)
          VALUES 
            ($1, 'Area isolated and barricaded with warning tape', true, $2),
            ($1, 'Continuous gas monitoring device zeroed and calibrated', true, $2),
            ($1, 'Emergency escape route clear and unobstructed', true, $2);
        `,
          [permitId, requesterId]
        );

        // Seed approvals consistent with status
        const approvedStatuses: readonly string[] = [
          PermitStatus.APPROVED,
          PermitStatus.ACTIVE,
          PermitStatus.SUSPENDED,
          PermitStatus.CLOSED,
          PermitStatus.CLOSED_VERIFIED,
        ];
        const isApproved = approvedStatuses.includes(p.status);
        const isRejected = p.status === PermitStatus.REJECTED;

        await client.query(
          `
          INSERT INTO permit_approvals (
            permit_id, required_role, required_user_id, status, decided_by, decided_at, comment
          ) VALUES 
            ($1, 'AREA_OWNER', $2, $3, $4, $5, $6),
            ($1, 'SAFETY_OFFICER', $7, $8, $9, $10, $11);
        `,
          [
            permitId,
            areaOwnerId,
            isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING',
            isApproved || isRejected ? areaOwnerId : null,
            isApproved || isRejected ? new Date(now - 4 * oneHour) : null,
            isRejected ? 'Flammable atmosphere not sufficiently cleared' : 'Area inspection cleared for work',
            safetyOfficerId,
            isApproved ? 'APPROVED' : 'PENDING',
            isApproved ? safetyOfficerId : null,
            isApproved ? new Date(now - 3.5 * oneHour) : null,
            isApproved ? 'Safety equipment verified and compliant' : null,
          ]
        );

        // Seed audit events for permit lifecycle
        await client.query(
          `
          INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
          VALUES 
            ($1, $2, 'CREATE_DRAFT', NULL, jsonb_build_object('status', 'DRAFT'), 'Draft created by requester', $3),
            ($1, $2, 'SUBMIT', jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'PENDING_APPROVAL'), 'Submitted for plant authorization', $4);
        `,
          [
            permitId,
            requesterId,
            new Date(p.plannedStart.getTime() - 2 * oneHour),
            new Date(p.plannedStart.getTime() - 1.8 * oneHour),
          ]
        );

        if (isApproved) {
          await client.query(
            `
            INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
            VALUES 
              ($1, $2, 'APPROVE', jsonb_build_object('status', 'PENDING_APPROVAL'), jsonb_build_object('status', 'APPROVED'), 'All approvals completed', $3);
          `,
            [permitId, safetyOfficerId, new Date(p.plannedStart.getTime() - 1 * oneHour)]
          );
        }

        if (p.status === PermitStatus.ACTIVE || p.status === PermitStatus.CLOSED_VERIFIED) {
          await client.query(
            `
            INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
            VALUES 
              ($1, $2, 'ACTIVATE', jsonb_build_object('status', 'APPROVED'), jsonb_build_object('status', 'ACTIVE'), 'Permit activated on plant floor', $3);
          `,
            [permitId, requesterId, p.plannedStart]
          );

          await client.query(
            `
            INSERT INTO permit_work_logs (permit_id, logged_by, note, kind, created_at)
            VALUES ($1, $2, 'Toolbox talk completed, work initiated', 'ENTRY', $3);
          `,
            [permitId, requesterId, p.plannedStart]
          );
        }

        if (p.status === PermitStatus.CLOSED_VERIFIED) {
          await client.query(
            `
            INSERT INTO audit_log (permit_id, actor_id, action, from_value, to_value, comment, created_at)
            VALUES 
              ($1, $2, 'CLOSE', jsonb_build_object('status', 'ACTIVE'), jsonb_build_object('status', 'CLOSED'), 'Work finished', $3),
              ($1, $4, 'VERIFY', jsonb_build_object('status', 'CLOSED'), jsonb_build_object('status', 'CLOSED_VERIFIED'), 'Safety officer inspection complete', $5);
          `,
            [permitId, requesterId, p.closedAt, safetyOfficerId, p.verifiedAt]
          );
        }
      }
    }

    // Advance sequence past all seeded permit numbers so subsequent creations never collide
    await client.query(`
      SELECT setval(
        'ptw_permit_no_seq', 
        GREATEST(
          11, 
          COALESCE((SELECT MAX(SUBSTRING(permit_no FROM '\\d{4}$')::INTEGER) FROM permits WHERE permit_no ~ '^PTW-\\d{4}-\\d{4}$'), 0)
        ), 
        true
      );
    `);

    await client.query('COMMIT');

    console.log('\n===============================================================');
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY');
    console.log('===============================================================');
    console.log('Demo Credentials for Reviewers:');
    for (const acc of SEED_ACCOUNTS) {
      console.log(`  Role: ${acc.role.padEnd(16)} | Email: ${acc.email.padEnd(25)} | Password: ${acc.passwordPlain}`);
    }
    console.log('===============================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed with error:', err);
    throw err;
  } finally {
    client.release();
    if (ownPool) {
      await ownPool.end();
    }
  }
}

// If invoked directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => closeDbConnection())
    .catch((err) => {
      console.error('Seed execution failed:', err);
      process.exit(1);
    });
}

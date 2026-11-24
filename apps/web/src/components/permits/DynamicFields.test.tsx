import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicFields } from './DynamicFields.js';
import { PermitTypeCode } from '@ptw/shared';

describe('DynamicFields Component', () => {
  it('renders dynamic fields for HOT_WORK including gas test calibration', () => {
    const values = {
      hot_work_type: 'welding',
      fire_watch_assigned: true,
      extinguisher_type: 'CO2',
      combustibles_cleared_radius_m: 15,
      gas_test: {
        lel_pct: 0,
        o2_pct: 20.9,
      },
    };
    const onChange = vi.fn();

    render(
      <DynamicFields
        type={PermitTypeCode.HOT_WORK}
        values={values}
        onChange={onChange}
      />
    );

    expect(screen.getByText(/Hot Work Permit Specification Details/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hot Work Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dedicated Fire Watch Assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/Gas Calibration Test/i)).toBeInTheDocument();
  });

  it('displays real-time visual safety alert when LEL exceeds 10%', () => {
    const values = {
      gas_test: {
        lel_pct: 15, // Dangerously high LEL!
        o2_pct: 20.9,
      },
    };

    render(
      <DynamicFields
        type={PermitTypeCode.HOT_WORK}
        values={values}
        onChange={() => {}}
      />
    );

    expect(
      screen.getByText(/LEL exceeds maximum allowable hot work limit \(10%\)!/i)
    ).toBeInTheDocument();
  });

  it('displays safety alert when O2 is deficient (< 19.5%)', () => {
    const values = {
      atmosphere_test: {
        lel_pct: 0,
        o2_pct: 18.0, // Oxygen deficient!
      },
    };

    render(
      <DynamicFields
        type={PermitTypeCode.CONFINED_SPACE}
        values={values}
        onChange={() => {}}
      />
    );

    expect(
      screen.getByText(/O2 concentration is outside safe atmospheric range/i)
    ).toBeInTheDocument();
  });
});

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

  it('does not display false O2 alert when o2_pct is null/empty and alerts when H2S or CO exceed safe limits', () => {
    const emptyValues = {
      atmosphere_test: {
        lel_pct: null,
        o2_pct: null,
        h2s_ppm: null,
        co_ppm: null,
      },
    };

    const { rerender } = render(
      <DynamicFields
        type={PermitTypeCode.CONFINED_SPACE}
        values={emptyValues}
        onChange={() => {}}
      />
    );

    expect(
      screen.queryByText(/O2 concentration is outside safe atmospheric range/i)
    ).not.toBeInTheDocument();

    rerender(
      <DynamicFields
        type={PermitTypeCode.CONFINED_SPACE}
        values={{
          atmosphere_test: {
            lel_pct: 0,
            o2_pct: 20.9,
            h2s_ppm: 12,
            co_ppm: 40,
          },
        }}
        onChange={() => {}}
      />
    );

    expect(screen.getByText(/H2S exceeds 10 ppm/i)).toBeInTheDocument();
    expect(screen.getByText(/CO concentration exceeds 35 ppm/i)).toBeInTheDocument();
  });
});

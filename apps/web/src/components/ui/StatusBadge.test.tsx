import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge.js';
import { PermitStatus } from '@ptw/shared';

describe('StatusBadge Component', () => {
  it('renders correctly for ACTIVE status with label and icon', () => {
    render(<StatusBadge status={PermitStatus.ACTIVE} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders correctly for PENDING_APPROVAL status', () => {
    render(<StatusBadge status={PermitStatus.PENDING_APPROVAL} />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  it('renders correctly for DRAFT status', () => {
    render(<StatusBadge status={PermitStatus.DRAFT} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders correctly for EXPIRED status', () => {
    render(<StatusBadge status={PermitStatus.EXPIRED} />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('renders correctly for CLOSED_VERIFIED status', () => {
    render(<StatusBadge status={PermitStatus.CLOSED_VERIFIED} />);
    expect(screen.getByText('Closed (Verified)')).toBeInTheDocument();
  });
});

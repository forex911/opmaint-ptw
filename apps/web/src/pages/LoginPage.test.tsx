import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage.js';
import { AuthProvider } from '../context/AuthContext.js';

describe('LoginPage Component', () => {
  it('renders login form and reviewer quick-fill accounts', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthProvider>
    );

    expect(screen.getByText('OPMAINT CMMS')).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByText(/Reviewer Quick Demo Accounts/i)).toBeInTheDocument();
    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByText('Area Owner')).toBeInTheDocument();
    expect(screen.getByText('Safety Officer')).toBeInTheDocument();
    expect(screen.getByText('System Admin')).toBeInTheDocument();
  });

  it('populates credentials when a demo account button is clicked', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthProvider>
    );

    const safetyOfficerBtn = screen.getByText('Safety Officer');
    fireEvent.click(safetyOfficerBtn);

    const emailInput = screen.getByLabelText(/Work Email/i) as HTMLInputElement;
    expect(emailInput.value).toBe('safety.officer@cmms.local');
  });
});

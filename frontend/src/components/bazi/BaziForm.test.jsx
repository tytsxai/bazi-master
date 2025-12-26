import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BaziForm from './BaziForm';
import { describe, it, expect, vi } from 'vitest';

const defaultProps = {
    t: (key) => key,
    formData: {
        birthYear: '',
        birthMonth: '',
        birthDay: '',
        birthHour: '',
        gender: '',
        birthLocation: '',
        timezone: 'UTC+8'
    },
    errors: {},
    dateInputLimits: {
        birthYear: { min: 1900, max: 2024 },
        birthMonth: { min: 1, max: 12 },
        birthDay: { min: 1, max: 31 }
    },
    locationOptions: [],
    formatLocationLabel: (loc) => loc.name,
    onFieldChange: (field) => (e) => { },
    onSubmit: vi.fn((e) => e.preventDefault()),
    onOpenResetConfirm: vi.fn(),
    onCancel: vi.fn(),
    onFullAnalysis: vi.fn(),
    onOpenAiConfirm: vi.fn(),
    onSaveRecord: vi.fn(),
    onAddFavorite: vi.fn(),
    onOpenHistory: vi.fn(),
    isCalculating: false,
    isSaving: false,
    isFullLoading: false,
    isAiLoading: false,
    isAuthenticated: false,
    baseResult: null,
    fullResult: null,
    savedRecord: null,
    favoriteStatus: false,
    errorAnnouncement: ''
};

describe('BaziForm', () => {
    it('renders all input fields', () => {
        render(<BaziForm {...defaultProps} />);

        expect(screen.getByLabelText('bazi.birthYear')).toBeInTheDocument();
        expect(screen.getByLabelText('bazi.birthMonth')).toBeInTheDocument();
        expect(screen.getByLabelText('bazi.birthDay')).toBeInTheDocument();
        expect(screen.getByLabelText('bazi.birthHour')).toBeInTheDocument();
        expect(screen.getByLabelText('bazi.gender')).toBeInTheDocument();
        expect(screen.getByLabelText('bazi.birthLocation')).toBeInTheDocument();
    });

    it('displays validation errors', () => {
        const props = {
            ...defaultProps,
            errors: {
                birthYear: 'Year is required',
                gender: 'Gender is required'
            }
        };
        render(<BaziForm {...props} />);

        expect(screen.getByText('Year is required')).toBeInTheDocument();
        expect(screen.getByText('Gender is required')).toBeInTheDocument();
    });

    it('calls onSubmit when form is submitted', async () => {
        const onSubmit = vi.fn((e) => e.preventDefault());
        render(<BaziForm {...defaultProps} onSubmit={onSubmit} />);

        const submitBtn = screen.getByText('bazi.calculate');
        await userEvent.click(submitBtn);

        expect(onSubmit).toHaveBeenCalled();
    });

    it('disables calculate button while calculating', () => {
        render(<BaziForm {...defaultProps} isCalculating={true} />);

        const submitBtn = screen.getByText(/bazi.calculate/);
        expect(submitBtn).toBeDisabled();
    });

    it('shows full analysis button when base result is present', () => {
        render(<BaziForm {...defaultProps} baseResult={{ some: 'data' }} />);

        const fullAnalysisBtn = screen.getByTestId('bazi-full-analysis');
        expect(fullAnalysisBtn).toBeEnabled();
    });
});

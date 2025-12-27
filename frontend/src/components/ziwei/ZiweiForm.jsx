import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { useNavigate } from 'react-router-dom';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const GENDERS = [
    { value: 'male' },
    { value: 'female' }
];

export default function ZiweiForm({
    form,
    onChange,
    onSubmit,
    loading,
    saveLoading,
    errors,
    onReset
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-5">
            <label className="text-sm text-white/70">
                {t('bazi.birthYear')}
                <input
                    type="number"
                    value={form.birthYear}
                    onChange={onChange('birthYear')}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
                {errors.birthYear && <span className="mt-1 block text-xs text-rose-200">{errors.birthYear}</span>}
            </label>
            <label className="text-sm text-white/70">
                {t('bazi.birthMonth')}
                <input
                    type="number"
                    value={form.birthMonth}
                    onChange={onChange('birthMonth')}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
                {errors.birthMonth && <span className="mt-1 block text-xs text-rose-200">{errors.birthMonth}</span>}
            </label>
            <label className="text-sm text-white/70">
                {t('bazi.birthDay')}
                <input
                    type="number"
                    value={form.birthDay}
                    onChange={onChange('birthDay')}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
                {errors.birthDay && <span className="mt-1 block text-xs text-rose-200">{errors.birthDay}</span>}
            </label>
            <label className="text-sm text-white/70">
                {t('bazi.birthHour')}
                <select
                    value={form.birthHour}
                    onChange={onChange('birthHour')}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
                >
                    <option value="">{t('common.select')}</option>
                    {HOURS.map((hour) => (
                        <option key={hour} value={hour}>{hour}</option>
                    ))}
                </select>
                {errors.birthHour && <span className="mt-1 block text-xs text-rose-200">{errors.birthHour}</span>}
            </label>
            <label className="text-sm text-white/70">
                {t('bazi.gender')}
                <select
                    id="gender"
                    value={form.gender}
                    onChange={onChange('gender')}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
                >
                    {GENDERS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.value === 'male' ? t('bazi.genderMale') : t('bazi.genderFemale')}
                        </option>
                    ))}
                </select>
                {errors.gender && <span className="mt-1 block text-xs text-rose-200">{errors.gender}</span>}
            </label>
            <div className="md:col-span-5 flex flex-col gap-3 sm:flex-row mt-2">
                <Button
                    type="submit"
                    isLoading={loading}
                    disabled={saveLoading}
                    className="flex-1"
                >
                    {loading ? t('profile.calculating') : t('ziwei.generateChart')}
                </Button>
                <Button
                    variant="ghost"
                    onClick={onReset}
                    className="flex-1"
                >
                    {t('ziwei.reset')}
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => navigate('/')}
                    className="flex-1"
                >
                    {t('profile.cancel')}
                </Button>
            </div>
        </form>
    );
}

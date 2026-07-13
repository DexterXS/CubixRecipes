import { useEffect, useRef, useState } from 'react';
import {
  durationMinutesFromUnitValue,
  durationUnitFromMinutes,
  durationValueForUnit,
  type AuctionDurationUnit
} from './auctionDayFolders';
import './AuctionDurationPicker.css';

type AuctionDurationPickerProps = {
  minutes: number;
  disabled?: boolean;
  onChange: (minutes: number) => void;
};

const unitLabels: Record<AuctionDurationUnit, string> = {
  days: 'Дни',
  hours: 'Часы',
  minutes: 'Минуты'
};

const unitShortLabels: Record<AuctionDurationUnit, string> = {
  days: 'дн.',
  hours: 'ч.',
  minutes: 'мин.'
};

const durationUnits: AuctionDurationUnit[] = ['days', 'hours', 'minutes'];

function durationButtonLabel(minutes: number) {
  const unit = durationUnitFromMinutes(minutes);
  return `${durationValueForUnit(minutes, unit)} ${unitShortLabels[unit]}`;
}

export function AuctionDurationPicker({ minutes, disabled = false, onChange }: AuctionDurationPickerProps) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<AuctionDurationUnit>(() => durationUnitFromMinutes(minutes));
  const pickerRef = useRef<HTMLDivElement>(null);
  const value = durationValueForUnit(minutes, unit);

  useEffect(() => {
    setUnit(durationUnitFromMinutes(minutes));
  }, [minutes]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const applyValue = (nextValue: number, nextUnit = unit) => {
    onChange(durationMinutesFromUnitValue(nextValue, nextUnit));
  };

  const changeUnit = (nextUnit: AuctionDurationUnit) => {
    setUnit(nextUnit);
    onChange(durationMinutesFromUnitValue(durationValueForUnit(minutes, nextUnit), nextUnit));
  };

  return (
    <div className="auction-duration-picker" ref={pickerRef}>
      <button
        type="button"
        className="auction-duration-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{durationButtonLabel(minutes)}</span>
        <b aria-hidden="true">v</b>
      </button>

      {open && !disabled ? (
        <div className="auction-duration-picker-popover" role="dialog" aria-label="Выбор длительности аукциона">
          <div className="auction-duration-picker-stepper">
            <button type="button" onClick={() => applyValue(value - 1)}>-</button>
            <input
              type="number"
              min={1}
              value={value}
              onChange={(event) => applyValue(Number(event.target.value))}
            />
            <button type="button" onClick={() => applyValue(value + 1)}>+</button>
          </div>

          <div className="auction-duration-picker-units" role="group" aria-label="Тип длительности">
            {durationUnits.map((item) => (
              <button
                key={item}
                type="button"
                className={unit === item ? 'active' : ''}
                onClick={() => changeUnit(item)}
              >
                {unitLabels[item]}
              </button>
            ))}
          </div>

          <div className="auction-duration-picker-summary">
            {minutes} мин.
          </div>
          <button type="button" className="auction-duration-picker-close" onClick={() => setOpen(false)}>Готово</button>
        </div>
      ) : null}
    </div>
  );
}

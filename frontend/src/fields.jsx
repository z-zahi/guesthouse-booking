import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { NumberField } from '@base-ui/react/number-field';
import { Popover } from '@base-ui/react/popover';
import { Select } from '@base-ui/react/select';
import { today } from './api.js';
import { fmtDate, fmtMonth, shiftMonth } from './format.js';
import { Icon } from './ui.jsx';
import './fields.css';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const EARLIEST = '0001-01-01';
const LATEST = '9998-12-31';
const DAY_OFFSETS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => shortMonth.format(new Date(Date.UTC(2024, index, 1))));

export function Textarea({ label, ...props }) {
  return (
    <Field.Root className="field-label">
      <Field.Label>{label}</Field.Label>
      <Input {...props} render={<textarea />} />
    </Field.Root>
  );
}

export function NumberInput({ label, className, defaultValue, ...props }) {
  const initial = defaultValue === '' || defaultValue == null ? undefined : Number(defaultValue);
  return (
    <Field.Root className={`field-label ${className ?? ''}`}>
      <Field.Label>{label}</Field.Label>
      <NumberField.Root
        {...props}
        defaultValue={Number.isFinite(initial) ? initial : undefined}
        allowOutOfRange
        format={{ useGrouping: false }}
      >
        <NumberField.Input />
      </NumberField.Root>
    </Field.Root>
  );
}

export function ChoiceField({ label, items, placeholder, ...props }) {
  return (
    <Select.Root items={items} {...props}>
      <div className="field-label">
        <Select.Label>{label}</Select.Label>
        <Select.Trigger className="choice-trigger">
          <Select.Value className="choice-value" placeholder={placeholder} />
          <Select.Icon aria-hidden="true">⌄</Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner className="field-positioner" align="start" sideOffset={6} alignItemWithTrigger={false}>
          <Select.Popup className="field-popup">
            <Select.List className="field-options">
              {items.map(({ value, label }) => (
                <Select.Item key={value} value={value} className="field-option">
                  <Select.ItemText>{label}</Select.ItemText>
                  <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function isDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= EARLIEST &&
    value <= LATEST &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().startsWith(value)
  );
}

export function DateInput({ label, name, defaultValue = '', min = EARLIEST, required }) {
  const id = useId();
  const inputRef = useRef(null);
  const dayRef = useRef(null);
  const [value, setValue] = useState(defaultValue ?? '');
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(today);
  const dateToday = today();
  const month = active.slice(0, 7);
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = (Date.parse(`${shiftMonth(month, 1)}-01`) - first.getTime()) / 86400000;
  let error = '';
  if (!value && required) error = 'Enter a date or choose one from the calendar.';
  if (value && !isDate(value)) error = 'Enter a valid date in YYYY-MM-DD format.';
  if (isDate(value) && value < min) error = `Choose ${fmtDate(min)} or a later date.`;

  useLayoutEffect(() => {
    inputRef.current.setCustomValidity(error);
  }, [error]);

  const changeOpen = (next) => {
    if (next) setActive(isDate(value) && value >= min ? value : dateToday < min ? min : dateToday);
    setOpen(next);
  };

  const moveMonth = (amount) => {
    const next = `${shiftMonth(month, amount)}-01`;
    if (next > LATEST || next.slice(0, 7) < min.slice(0, 7)) return;
    setActive(next < min ? min : next);
  };

  const navigateDays = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveMonth(event.key === 'PageUp' ? -1 : 1);
    } else if (Object.hasOwn(DAY_OFFSETS, event.key)) {
      event.preventDefault();
      const date = new Date(`${active}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + DAY_OFFSETS[event.key]);
      const next = date.toISOString().slice(0, 10);
      if (next >= min && next <= LATEST) setActive(next);
    } else {
      return;
    }
    requestAnimationFrame(() => dayRef.current?.focus());
  };

  return (
    <div className="field-label date-field">
      <label htmlFor={id}>{label}</label>
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <div className="date-control">
          <Input
            id={id}
            ref={inputRef}
            name={name}
            value={value}
            onValueChange={setValue}
            onBlur={() => {
              if (value) setTouched(true);
            }}
            onInvalid={() => setTouched(true)}
            placeholder="YYYY-MM-DD…"
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            required={required}
            aria-invalid={(touched && !!error) || undefined}
            aria-describedby={touched && error ? `${id}-error` : undefined}
          />
          <Popover.Trigger className="date-trigger" aria-label={`Choose ${label.toLowerCase()} date`}>
            <Icon name="calendar" size={17} />
          </Popover.Trigger>
        </div>
        <Popover.Portal>
          <Popover.Positioner
            anchor={inputRef}
            className="field-positioner"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            <Popover.Popup className="field-popup picker-popup" initialFocus={dayRef}>
              <Popover.Title className="sr-only">{label} calendar</Popover.Title>
              <div className="picker-head">
                <Button
                  className="plain icon"
                  aria-label="Previous month"
                  disabled={month <= min.slice(0, 7)}
                  onClick={() => moveMonth(-1)}
                >
                  ‹
                </Button>
                <span aria-live="polite">{fmtMonth(month)}</span>
                <Button
                  className="plain icon"
                  aria-label="Next month"
                  disabled={month >= LATEST.slice(0, 7)}
                  onClick={() => moveMonth(1)}
                >
                  ›
                </Button>
              </div>
              <div className="date-grid" role="group" aria-label="Days" onKeyDown={navigateDays}>
                {WEEKDAYS.map((day) => (
                  <span className="picker-weekday" aria-hidden="true" key={day}>
                    {day}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, index) => (
                  <span key={`space-${index}`} />
                ))}
                {Array.from({ length: days }, (_, index) => {
                  const date = `${month}-${String(index + 1).padStart(2, '0')}`;
                  return (
                    <Button
                      key={date}
                      ref={date === active ? dayRef : undefined}
                      className="picker-option"
                      aria-label={fmtDate(date)}
                      aria-pressed={date === value}
                      aria-current={date === dateToday ? 'date' : undefined}
                      disabled={date < min}
                      tabIndex={date === active ? 0 : -1}
                      onClick={() => {
                        setValue(date);
                        setTouched(false);
                        setOpen(false);
                      }}
                    >
                      {index + 1}
                    </Button>
                  );
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {touched && error && (
        <span id={`${id}-error`} className="field-error" aria-live="polite">
          {error}
        </span>
      )}
    </div>
  );
}

export function MonthNavigation({ month, onChange }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(null);
  return (
    <div className="month-nav">
      <Button
        className="icon"
        aria-label="Previous month"
        disabled={month === '2000-01'}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        ‹
      </Button>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) setYear(Number(month.slice(0, 4)));
          setOpen(next);
        }}
      >
        <Popover.Trigger className="month-trigger" aria-label={`Choose month, ${fmtMonth(month)}`}>
          {fmtMonth(month)}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="field-positioner" sideOffset={8} collisionPadding={12}>
            <Popover.Popup className="field-popup picker-popup" initialFocus={selectedRef}>
              <Popover.Title className="sr-only">Choose Month</Popover.Title>
              <div className="picker-head">
                <Button
                  className="plain icon"
                  aria-label="Previous year"
                  disabled={year <= 2000}
                  onClick={() => setYear(year - 1)}
                >
                  ‹
                </Button>
                <span aria-live="polite">{year}</span>
                <Button
                  className="plain icon"
                  aria-label="Next year"
                  disabled={year >= 2099}
                  onClick={() => setYear(year + 1)}
                >
                  ›
                </Button>
              </div>
              <div className="month-grid">
                {MONTH_NAMES.map((name, index) => {
                  const date = `${year}-${String(index + 1).padStart(2, '0')}`;
                  return (
                    <Button
                      key={name}
                      ref={date === month ? selectedRef : undefined}
                      className="picker-option"
                      aria-pressed={date === month}
                      onClick={() => {
                        onChange(date);
                        setOpen(false);
                      }}
                    >
                      {name}
                    </Button>
                  );
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Button
        className="icon"
        aria-label="Next month"
        disabled={month === '2099-12'}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        ›
      </Button>
    </div>
  );
}

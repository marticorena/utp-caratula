import { useId } from 'react';
import type { HTMLInputTypeAttribute } from 'react';

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  list?: string;
  multiline?: boolean;
  type?: HTMLInputTypeAttribute;
  min?: number;
  step?: number;
}

/** Render a consistently labelled text input or textarea. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 350,
  list,
  multiline = false,
  type = 'text',
  min,
  step,
}: FieldProps) {
  const id = useId();

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={2}
        />
      ) : (
        <input
          id={id}
          type={type}
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          list={list}
          autoComplete="off"
        />
      )}
    </div>
  );
}

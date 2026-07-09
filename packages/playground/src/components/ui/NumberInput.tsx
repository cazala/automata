import React, { useEffect, useState } from "react";
import { Field } from "./Field";
import "./NumberInput.css";

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: NumberInputProps) {
  // Held as text while editing so intermediate states ("", "-") don't get
  // coerced out from under the caret.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    next = Math.round(next / step) * step;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <Field className="number-field">
      <label>
        <span>{label}</span>
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
        />
      </label>
    </Field>
  );
}

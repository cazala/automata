import React from "react";
import { Field } from "./Field";
import "./ColorInput.css";

interface ColorInputProps {
  label: string;
  value: string; // hex e.g. #rrggbb
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ColorInput({
  label,
  value,
  onChange,
  disabled = false,
}: ColorInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <Field className="color-field">
      <label className="color-label">
        <span>{label}</span>
        <span className="color-swatch" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={handleChange}
            disabled={disabled}
          />
        </span>
      </label>
    </Field>
  );
}

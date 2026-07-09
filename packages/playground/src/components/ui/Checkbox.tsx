import React from "react";
import "./Checkbox.css";
import { Field } from "./Field";

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: CheckboxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <Field className="checkbox-field">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        {label}
      </label>
    </Field>
  );
}

import React from "react";
import { Field } from "./Field";
import "./Slider.css";

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  formatValue,
}: SliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  const display = formatValue ? formatValue(value) : String(value);

  return (
    <Field className="slider-field">
      <label>
        <div className="slider-label-container">
          <span>
            {label}: {display}
          </span>
        </div>
        <div className="slider-container">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            className={`slider ${disabled ? "disabled" : ""}`}
          />
        </div>
      </label>
    </Field>
  );
}

import React from "react";
import "./Button.css";

interface ButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "primary" | "danger" | "warning";
  className?: string;
}

export function Button({
  onClick,
  children,
  title,
  disabled = false,
  active = false,
  variant = "default",
  className = "",
}: ButtonProps) {
  return (
    <button
      className={`ui-button ${variant} ${active ? "active" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

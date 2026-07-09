import React, { useState } from "react";
import "./CollapsibleSection.css";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  right,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="collapsible-title">
          <h4>{title}</h4>
        </div>
        <div className="collapsible-header-right">
          {right}
          <span className={`collapsible-arrow ${isOpen ? "open" : ""}`}>▼</span>
        </div>
      </div>
      <div
        className="collapsible-content"
        style={{ display: isOpen ? "block" : "none" }}
      >
        {children}
      </div>
    </div>
  );
}

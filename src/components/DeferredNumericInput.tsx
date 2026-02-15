"use client";

import { useCallback, useState } from "react";
import type { InputHTMLAttributes } from "react";

type DeferredNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: number;
  onCommit: (value: number) => void;
  parseValue?: (raw: string) => number;
  formatValue?: (value: number) => string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

type DeferredMoneyInputProps = Omit<
  DeferredNumberInputProps,
  "value" | "onCommit" | "parseValue" | "formatValue" | "inputMode"
> & {
  valueCents: number;
  onCommitCents: (valueCents: number) => void;
};

export function parseLooseNumber(raw: string): number {
  const normalized = raw.trim().replace(/,/g, "");
  if (!normalized || normalized === "." || normalized === "-" || normalized === "+") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatLooseNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe}`;
}

export function parseMoneyToCents(raw: string): number {
  return Math.max(0, Math.round(parseLooseNumber(raw) * 100));
}

export function formatCentsToMoney(valueCents: number): string {
  const safe = Number.isFinite(valueCents) ? valueCents : 0;
  return (safe / 100).toFixed(2);
}

export function DeferredNumberInput({
  value,
  onCommit,
  parseValue = parseLooseNumber,
  formatValue = formatLooseNumber,
  inputMode = "decimal",
  onFocus,
  onBlur,
  onKeyDown,
  disabled,
  readOnly,
  ...rest
}: DeferredNumberInputProps) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [isEditing, setIsEditing] = useState(false);

  const commitDraft = useCallback(() => {
    const parsed = parseValue(draft);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    if (!Object.is(nextValue, value)) {
      onCommit(nextValue);
    }
    setDraft(formatValue(nextValue));
  }, [draft, formatValue, onCommit, parseValue, value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode}
      value={isEditing ? draft : formatValue(value)}
      disabled={disabled}
      readOnly={readOnly}
      onFocus={(e) => {
        setDraft(formatValue(value));
        setIsEditing(true);
        onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={(e) => {
        setIsEditing(false);
        commitDraft();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setIsEditing(false);
          setDraft(formatValue(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function DeferredMoneyInput({ valueCents, onCommitCents, ...rest }: DeferredMoneyInputProps) {
  return (
    <DeferredNumberInput
      {...rest}
      value={valueCents}
      onCommit={onCommitCents}
      parseValue={parseMoneyToCents}
      formatValue={formatCentsToMoney}
      inputMode="decimal"
    />
  );
}

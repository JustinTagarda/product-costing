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
  decimalDigits?: number;
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

export function parseMoneyToCents(raw: string, decimalDigits = 2): number {
  const digits = Math.min(Math.max(Math.trunc(decimalDigits), 0), 2);
  const scale = 10 ** digits;
  const rescale = 10 ** (2 - digits);
  return Math.max(0, Math.round(parseLooseNumber(raw) * scale) * rescale);
}

export function formatCentsToMoney(valueCents: number, decimalDigits = 2): string {
  const safe = Number.isFinite(valueCents) ? valueCents : 0;
  const digits = Math.min(Math.max(Math.trunc(decimalDigits), 0), 2);
  return (safe / 100).toFixed(digits);
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

export function DeferredMoneyInput({
  valueCents,
  onCommitCents,
  decimalDigits = 2,
  ...rest
}: DeferredMoneyInputProps) {
  return (
    <DeferredNumberInput
      {...rest}
      value={valueCents}
      onCommit={onCommitCents}
      parseValue={(raw) => parseMoneyToCents(raw, decimalDigits)}
      formatValue={(value) => formatCentsToMoney(value, decimalDigits)}
      inputMode={decimalDigits === 0 ? "numeric" : "decimal"}
    />
  );
}

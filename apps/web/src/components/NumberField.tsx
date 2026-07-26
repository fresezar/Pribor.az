"use client";

/**
 * Temayla uyumlu sayı girişi — tarayıcının default (temaya uymayan, beyaz)
 * yuxarı/aşağı düymələrini gizleyip yerine .field ile aynı token'ları
 * kullanan özel bir spin kontrolü qoyur.
 */

type Props = {
  id?: string;
  value: number | string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export default function NumberField({ id, value, onChange, min, max, step = 1, placeholder }: Props) {
  const bump = (delta: number) => {
    const current = Number(value) || 0;
    let next = Math.round((current + delta) * 100) / 100;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    onChange(String(next));
  };

  return (
    <div className="num-field">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="num-spin">
        <button type="button" tabIndex={-1} onClick={() => bump(step)} aria-label="Artır">▲</button>
        <button type="button" tabIndex={-1} onClick={() => bump(-step)} aria-label="Azalt">▼</button>
      </div>
    </div>
  );
}

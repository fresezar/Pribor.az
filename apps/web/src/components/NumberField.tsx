"use client";

/**
 * Temayla uyumlu sayı girişi — tarayıcının default (temaya uymayan, beyaz)
 * yuxarı/aşağı düymələrini gizleyip yerine .field ile aynı token'ları
 * kullanan özel bir spin kontrolü qoyur.
 *
 * Yazılan metni kendi içinde tutar: sahə silinince ("") ana state 0'a düşse
 * bile input boş kalır — aksi halde "0" görünür ve sonraki rakam "065" olurdu.
 * Ana state gerçekten başka bir değere geçerse (ön-dolgu, düzenleme) senkronlanır.
 */

import { useEffect, useState } from "react";

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
  const [text, setText] = useState(() => (value === "" || value == null ? "" : String(value)));

  // Dışarıdan gelen değer yazdığımızdan farklıysa (prefill/düzenleme) devral.
  // Boş metin ile 0'ı eşdeğer sayarız; böylece silme sırasında "0" geri yazılmaz.
  useEffect(() => {
    const incoming = value === "" || value == null ? "" : String(value);
    if (Number(text || 0) !== Number(incoming || 0)) setText(incoming);
    // text bilinçli olarak bağımlılıkta değil: her tuşta kendini ezmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (next: string) => {
    setText(next);
    onChange(next);
  };

  const bump = (delta: number) => {
    const current = Number(text) || 0;
    let next = Math.round((current + delta) * 100) / 100;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    emit(String(next));
  };

  return (
    <div className="num-field">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => emit(e.target.value)}
      />
      <div className="num-spin">
        <button type="button" tabIndex={-1} onClick={() => bump(step)} aria-label="Artır">▲</button>
        <button type="button" tabIndex={-1} onClick={() => bump(-step)} aria-label="Azalt">▼</button>
      </div>
    </div>
  );
}

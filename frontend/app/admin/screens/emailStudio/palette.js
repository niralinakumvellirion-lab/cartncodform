'use client';
import _eng from '../../lib/emailEngine';

const { mix } = _eng || {};

export const PALETTE = [
  { g: 'Light and neutral', c: [['White','#ffffff'],['Pearl','#f1f1f4'],['Silver','#d9dbe1'],['Cream','#fbf3e4'],['Sand','#eadcc3'],['Blush','#fbdde4'],['Mint','#d8f3e6'],['Sky','#d6e8ff']] },
  { g: 'Soft colours',      c: [['Peach','#ffd9c2'],['Butter','#fff0b3'],['Lime','#e4f4b8'],['Aqua','#c9f0ee'],['Periwinkle','#d4d8ff'],['Lavender','#e6d5fb'],['Rose','#ffc9dc'],['Coral','#ffc4b8']] },
  { g: 'Bold colours',      c: [['Red','#dc2626'],['Orange','#f97316'],['Yellow','#facc15'],['Green','#16a34a'],['Teal','#0d9488'],['Blue','#2563eb'],['Purple','#7c3aed'],['Pink','#db2777']] },
  { g: 'Dark tones',        c: [['Charcoal','#1f2937'],['Slate','#334155'],['Navy','#0f1b3d'],['Forest','#0f2f23'],['Wine','#3b0a1e'],['Plum','#2a0f3d'],['Espresso','#2b1b12'],['Black','#0b0b10']] },
];

export const COLORS = ['#c2185b','#dc2626','#ea580c','#d97706','#0f766e','#0891b2','#4f46e5','#7c3aed','#111827'];

export function brandShades(hex) {
  if (!mix || !hex) return [];
  return [
    { name: 'Brand tint',    value: mix(hex, '#ffffff', 0.92) },
    { name: 'Soft tint',     value: mix(hex, '#ffffff', 0.80) },
    { name: 'Light tint',    value: mix(hex, '#ffffff', 0.60) },
    { name: 'Brand colour',  value: hex },
    { name: 'Deep brand',    value: mix(hex, '#000000', 0.40) },
    { name: 'Darkest brand', value: mix(hex, '#000000', 0.72) },
  ];
}

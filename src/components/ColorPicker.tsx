"use client";

import type { FC } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface ColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#A7D1ED', // Primary Soft Blue
  '#69B4EB', // Accent Darker Blue
  '#FFB6C1', // LightPink
  '#90EE90', // LightGreen
  '#FFFFE0', // LightYellow
  '#E6E6FA', // Lavender
  '#ADD8E6', // LightBlue
  '#D3D3D3', // LightGray
  '#FFCCCB', // LightRed
  '#FFDAB9', // PeachPuff
];

const ColorPicker: FC<ColorPickerProps> = ({
  selectedColor,
  onColorChange,
  colors = DEFAULT_COLORS,
}) => {
  return (
    <div className="grid grid-cols-5 gap-2 p-1">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            'h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all duration-150 ease-in-out transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            selectedColor === color ? 'border-primary ring-2 ring-primary' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
          onClick={() => onColorChange(color)}
          aria-label={`Select color ${color}`}
          aria-pressed={selectedColor === color}
        >
          {selectedColor === color && <Check className="h-5 w-5 text-white mix-blend-difference" />}
        </button>
      ))}
    </div>
  );
};

export default ColorPicker;

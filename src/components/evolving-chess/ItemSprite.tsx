'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  x?: number;
  y?: number;
  size?: number;
  className?: string;
}

/**
 * HIGH-PRECISION CLIPPING MASK RENDERING
 * Uses absolute pixel translation on the full 1340px sheet.
 * Accounting for 10x12 rectangular sprites and 1px gutters.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: The items are natively 10px wide.
  const scale = size / 10;
  
  return (
    <div 
      className={cn("overflow-hidden relative inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintains 10:12 native aspect ratio
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt="Equipment Sprite"
        className="absolute max-w-none"
        style={{
          // Sheet must be scaled proportionally based on original 1340px width.
          width: `${1340 * scale}px`,
          height: 'auto',
          // Direct pixel translation ensures zero drift across panels.
          transform: `translate(-${x * scale}px, -${y * scale}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

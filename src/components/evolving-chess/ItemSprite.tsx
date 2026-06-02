
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import placeholderImages from '@/app/lib/placeholder-images.json';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the uploaded sprite sheet using a clipped img element.
 * This is more robust than background-position for pixel art on high-DPI displays.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("relative overflow-hidden shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      aria-hidden="true"
    >
      <img
        src={spriteSheetUrl}
        alt=""
        style={{
          position: 'absolute',
          // The image is 16 icons wide, so its width should be 16x the display size
          width: `${size * 16}px`,
          height: 'auto',
          // Offset to show the specific icon
          left: `-${col * size}px`,
          top: `-${row * size}px`,
          imageRendering: 'pixelated',
          maxWidth: 'none', // Prevent interference from global styles
        }}
      />
    </div>
  );
}

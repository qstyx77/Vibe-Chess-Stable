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
 * ROBUST SPRITE RENDERING
 * Uses a masked container with an absolute-positioned img.
 * This avoids the scaling/clipping bugs common with object-fit: none or background-position
 * when dealing with high-resolution sprite sheets in modern browsers.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: how much are we enlarging the native 10px sprite?
  const scale = size / 10;
  
  // The sheet is natively 1340px wide. 
  // To keep the math consistent, we size the image relative to the container's scale.
  const scaledSheetWidth = 1340 * scale;

  return (
    <div 
      className={cn("shrink-0 inline-block overflow-hidden relative", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintain 10:12 aspect ratio
        backgroundColor: 'black', // Solid black background for Panel 3 high-contrast
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt="Item"
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: `${scaledSheetWidth}px`,
          height: 'auto',
          imageRendering: 'pixelated',
          // Move the image so the desired sprite is in the top-left of the parent div
          left: `-${x * scale}px`,
          top: `-${y * scale}px`,
        }}
      />
    </div>
  );
}

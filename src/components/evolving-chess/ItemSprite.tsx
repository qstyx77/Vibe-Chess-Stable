
'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import placeholderImages from '@/app/lib/placeholder-images.json';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet using a clipped Next.js Image component.
 * We use a 16-column layout to match the provided sheet geometry.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Use the local URL from the placeholder config
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("relative overflow-hidden shrink-0 inline-block bg-muted/20", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      aria-hidden="true"
    >
      <div 
        className="absolute"
        style={{
          width: `${size * 16}px`,
          height: `${size * 12}px`,
          left: `-${col * size}px`,
          top: `-${row * size}px`,
        }}
      >
        <Image
          src={spriteSheetUrl}
          alt=""
          fill
          unoptimized
          className="object-cover"
          style={{ imageRendering: 'pixelated' }}
          data-ai-hint="item sprites"
        />
      </div>
    </div>
  );
}

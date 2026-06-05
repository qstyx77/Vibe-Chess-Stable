'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { InventoryItemType } from '@/types';

interface ItemSpriteProps {
  type?: InventoryItemType;
  size?: number; // Target display width
  className?: string;
}

/**
 * 8-BIT SVG PIXEL ART ENGINE
 * Renders equipment items pixel-by-pixel using SVG rectangles.
 * This guarantees sharp visuals, correct identification, and perfect scaling.
 */
export function ItemSprite({ type, size = 16, className }: ItemSpriteProps) {
  if (!type) return null;

  // Each icon is designed on a 10x12 grid
  const renderIcon = () => {
    switch (type) {
      case 'mirror_shield':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Golden Rim */}
            <rect x="2" y="1" width="6" height="10" fill="#EAB308" />
            <rect x="1" y="2" width="8" height="8" fill="#EAB308" />
            {/* Mirror Surface */}
            <rect x="3" y="3" width="4" height="6" fill="#94A3B8" />
            <rect x="2" y="4" width="6" height="4" fill="#94A3B8" />
            {/* Shine */}
            <rect x="4" y="4" width="2" height="1" fill="#E2E8F0" />
            <rect x="3" y="5" width="1" height="1" fill="#E2E8F0" />
          </svg>
        );
      case 'swift_cloak':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Hood */}
            <rect x="3" y="1" width="4" height="4" fill="#EF4444" />
            <rect x="2" y="2" width="6" height="3" fill="#EF4444" />
            {/* Shoulders */}
            <rect x="1" y="5" width="8" height="6" fill="#EF4444" />
            <rect x="0" y="6" width="10" height="5" fill="#EF4444" />
            {/* Clasp */}
            <rect x="4.5" y="5" width="1" height="1" fill="#FDE047" />
            {/* Interior shadow */}
            <rect x="4" y="2" width="2" height="2" fill="#7F1D1D" />
          </svg>
        );
      case 'passive_armor':
      case 'plate_armor':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Chestplate Body */}
            <rect x="2" y="3" width="6" height="8" fill="#3B82F6" />
            <rect x="1" y="4" width="8" height="6" fill="#3B82F6" />
            {/* Shoulder Pads */}
            <rect x="1" y="2" width="3" height="3" fill="#1D4ED8" />
            <rect x="6" y="2" width="3" height="3" fill="#1D4ED8" />
            {/* Trim/Detail */}
            <rect x="3" y="5" width="4" height="1" fill="#60A5FA" />
            <rect x="4" y="6" width="2" height="4" fill="#1D4ED8" />
          </svg>
        );
      case 'cardinal_greaves':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Left Boot */}
            <rect x="1" y="4" width="3" height="7" fill="#22C55E" />
            <rect x="0" y="9" width="4" height="2" fill="#22C55E" />
            <rect x="1" y="11" width="3" height="1" fill="#14532D" />
            {/* Right Boot */}
            <rect x="6" y="4" width="3" height="7" fill="#22C55E" />
            <rect x="5" y="9" width="4" height="2" fill="#22C55E" />
            <rect x="6" y="11" width="3" height="1" fill="#14532D" />
            {/* Highlights */}
            <rect x="2" y="5" width="1" height="2" fill="#86EFAC" />
            <rect x="7" y="5" width="1" height="2" fill="#86EFAC" />
          </svg>
        );
      case 'drift_boots':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Left Boot (Swept) */}
            <rect x="1" y="5" width="3" height="6" fill="#0EA5E9" />
            <rect x="0" y="8" width="5" height="3" fill="#0EA5E9" />
            <rect x="1" y="11" width="4" height="1" fill="#0C4A6E" />
            {/* Right Boot (Swept) */}
            <rect x="6" y="5" width="3" height="6" fill="#0EA5E9" />
            <rect x="5" y="8" width="5" height="3" fill="#0EA5E9" />
            <rect x="6" y="11" width="4" height="1" fill="#0C4A6E" />
            {/* Wings/Speed detail */}
            <rect x="3" y="6" width="1" height="1" fill="#BAE6FD" />
            <rect x="8" y="6" width="1" height="1" fill="#BAE6FD" />
          </svg>
        );
      case 'queens_peace':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Band */}
            <rect x="2" y="4" width="6" height="6" fill="#CBD5E1" />
            <rect x="3" y="5" width="4" height="4" fill="#000" />
            {/* Gem Holder */}
            <rect x="3" y="2" width="4" height="3" fill="#94A3B8" />
            {/* Glowing Gem */}
            <rect x="4" y="3" width="2" height="2" fill="#60A5FA" />
            {/* Shine */}
            <rect x="4" y="3" width="1" height="1" fill="#E0F2FE" />
          </svg>
        );
      default:
        // Generic "Item" placeholder for unmapped types
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-50">
            <rect x="2" y="2" width="6" height="8" fill="#555" />
            <rect x="4" y="4" width="2" height="4" fill="#888" />
          </svg>
        );
    }
  };

  return (
    <div 
      className={cn("relative inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintains 10:12 aspect ratio
      }}
    >
      {renderIcon()}
    </div>
  );
}

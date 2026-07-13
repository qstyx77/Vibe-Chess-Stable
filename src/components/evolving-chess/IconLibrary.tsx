'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface IconProps {
  className?: string;
}

/** 8-BIT PIXEL PIECE COMPONENTS **/

export const PixelPawn = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="5" width="4" height="4" />
    <rect x="9" y="9" width="6" height="2" />
    <rect x="10" y="11" width="4" height="6" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelKnight = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="4" width="4" height="2" />
    <rect x="9" y="6" width="6" height="4" />
    <rect x="7" y="8" width="4" height="4" />
    <rect x="11" y="10" width="4" height="6" />
    <rect x="9" y="16" width="8" height="2" />
  </svg>
);

export const PixelBishop = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="3" width="2" height="2" />
    <rect x="10" y="5" width="4" height="4" />
    <rect x="11" y="9" width="2" height="2" />
    <rect x="10" y="11" width="4" height="6" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelRook = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="8" y="4" width="2" height="2" />
    <rect x="11" y="4" width="2" height="2" />
    <rect x="14" y="4" width="2" height="2" />
    <rect x="8" y="6" width="8" height="3" />
    <rect x="9" y="9" width="6" height="8" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelQueen = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="7" y="3" width="2" height="2" />
    <rect x="11" y="2" width="2" height="2" />
    <rect x="15" y="3" width="2" height="2" />
    <rect x="7" y="5" width="10" height="4" />
    <rect x="10" y="9" width="4" height="8" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelKing = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="1" width="2" height="4" />
    <rect x="10" y="2" width="4" height="2" />
    <rect x="8" y="5" width="8" height="4" />
    <rect x="10" y="9" width="4" height="8" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelArcher = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="4" width="4" height="2" />
    <rect x="9" y="6" width="6" height="4" />
    <rect x="7" y="8" width="4" height="4" />
    <rect x="11" y="10" width="4" height="6" />
    <rect x="9" y="16" width="8" height="2" />
    <rect x="16" y="6" width="1" height="8" />
    <rect x="15" y="5" width="1" height="1" />
    <rect x="15" y="14" width="1" height="1" />
  </svg>
);

export const PixelArchbishop = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="2" width="2" height="5" />
    <rect x="10" y="3" width="4" height="2" />
    <rect x="10" y="7" width="4" height="3" />
    <rect x="11" y="10" width="2" height="1" />
    <rect x="10" y="11" width="4" height="6" />
    <rect x="8" y="17" width="8" height="2" />
  </svg>
);

export const PixelPalace = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="7" y="3" width="2" height="2" />
    <rect x="10" y="3" width="4" height="2" />
    <rect x="15" y="3" width="2" height="2" />
    <rect x="7" y="5" width="10" height="3" />
    <rect x="9" y="8" width="6" height="9" />
    <rect x="7" y="17" width="10" height="2" />
  </svg>
);

/** BOSS ICONS **/

export const PixelHydra = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="4" y="6" width="3" height="3" />
    <rect x="5" y="9" width="2" height="4" />
    <rect x="10" y="4" width="4" height="4" />
    <rect x="11" y="8" width="2" height="8" />
    <rect x="17" y="6" width="3" height="3" />
    <rect x="17" y="9" width="2" height="4" />
    <rect x="6" y="14" width="12" height="4" />
    <rect x="5" y="18" width="14" height="2" />
  </svg>
);

export const PixelNecromancer = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="9" y="2" width="6" height="7" />
    <rect x="11" y="4" width="1" height="1" fill="white" />
    <rect x="13" y="4" width="1" height="1" fill="white" />
    <rect x="7" y="9" width="10" height="9" />
    <rect x="6" y="18" width="12" height="3" />
    <rect x="18" y="3" width="2" height="16" />
    <rect x="17" y="2" width="4" height="2" />
  </svg>
);

export const PixelColossus = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="9" y="1" width="6" height="5" />
    <rect x="5" y="6" width="14" height="5" />
    <rect x="7" y="11" width="10" height="9" />
    <rect x="4" y="8" width="4" height="9" />
    <rect x="16" y="8" width="4" height="9" />
    <rect x="6" y="20" width="12" height="2" />
  </svg>
);

export const PixelMirage = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="2" width="4" height="18" opacity="0.7" />
    <rect x="8" y="4" width="8" height="14" opacity="0.4" />
    <rect x="6" y="6" width="12" height="10" opacity="0.2" />
    <rect x="11" y="4" width="2" height="14" fill="white" opacity="0.9" />
  </svg>
);

export const PixelVoidEntity = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="8" y="8" width="8" height="8" />
    <rect x="6" y="6" width="12" height="12" opacity="0.6" />
    <rect x="4" y="4" width="16" height="16" opacity="0.3" />
    <rect x="2" y="2" width="20" height="20" opacity="0.1" />
    <rect x="11" y="11" width="2" height="2" fill="#EAB308" />
  </svg>
);

/** SPECIAL ASSETS **/

export const PixelAnvil = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="2" y="16" width="20" height="4" />
    <rect x="6" y="10" width="12" height="6" />
    <rect x="4" y="6" width="16" height="4" />
    <rect x="18" y="8" width="2" height="2" />
    <rect x="4" y="8" width="2" height="2" />
    <rect x="10" y="12" width="4" height="1" fillOpacity="0.3" />
  </svg>
);

export const VibeChessTitle = ({ className }: IconProps) => (
  <svg viewBox="0 0 200 40" className={cn("drop-shadow-[0_0_15px_hsl(var(--primary)/0.9)]", className)} xmlns="http://www.w3.org/2000/svg">
    <g className="animate-pixel-title-flash">
       {/* VIBE (Cyan) */}
       <g fill="hsl(var(--primary))">
          {/* V with Sword Points - Moved to x=5 */}
          <g transform="translate(5, 0)">
            <rect x="5" y="8" width="3" height="16" />
            <rect x="8" y="24" width="4" height="4" />
            <rect x="12" y="8" width="3" height="16" />
            <path d="M5 8l1.5-6 1.5 6h-3zM12 8l1.5-6 1.5 6h-3z" />
          </g>
          
          {/* I as TALLER Bishop silhouette - Moved to x=22 */}
          <g transform="translate(22, 2) scale(1.1, 1.4)">
            <rect x="11" y="3" width="2" height="2" />
            <rect x="10" y="5" width="4" height="4" />
            <rect x="11" y="9" width="2" height="2" />
            <rect x="10" y="11" width="4" height="6" />
            <rect x="8" y="17" width="8" height="2" />
          </g>
          
          {/* B - Moved to x=42 */}
          <g transform="translate(42, 0)">
            <rect x="0" y="6" width="3" height="22" />
            <rect x="3" y="6" width="8" height="3" />
            <rect x="11" y="9" width="3" height="6" />
            <rect x="3" y="15" width="8" height="3" />
            <rect x="11" y="18" width="3" height="7" />
            <rect x="3" y="25" width="8" height="3" />
          </g>
          
          {/* E - Moved to x=62 */}
          <g transform="translate(62, 0)">
            <rect x="0" y="6" width="3" height="22" />
            <rect x="3" y="6" width="10" height="3" />
            <rect x="3" y="15" width="7" height="3" />
            <rect x="3" y="25" width="10" height="3" />
          </g>
       </g>
       
       {/* CHESS (Magenta) - Group starts at x=88 */}
       <g fill="hsl(var(--accent))" transform="translate(88, 0)">
          {/* C */}
          <rect x="0" y="6" width="3" height="22" />
          <rect x="3" y="6" width="10" height="3" />
          <rect x="3" y="25" width="10" height="3" />
          
          {/* H as Two Rooks - Starts at x=20 */}
          <g transform="translate(20, 5) scale(1.1)">
             <rect x="0" y="4" width="2" height="2" />
             <rect x="3" y="4" width="2" height="2" />
             <rect x="6" y="4" width="2" height="2" />
             <rect x="0" y="6" width="8" height="3" />
             <rect x="1" y="9" width="6" height="8" />
             <rect x="0" y="17" width="8" height="2" />
             <rect x="8" y="11" width="4" height="3" />
             <g transform="translate(12, 0)">
               <rect x="0" y="4" width="2" height="2" />
               <rect x="3" y="4" width="2" height="2" />
               <rect x="6" y="4" width="2" height="2" />
               <rect x="0" y="6" width="8" height="3" />
               <rect x="1" y="9" width="6" height="8" />
               <rect x="0" y="17" width="8" height="2" />
             </g>
          </g>
          
          {/* E - Starts at x=52 */}
          <g transform="translate(52, 0)">
            <rect x="0" y="6" width="3" height="22" />
            <rect x="3" y="6" width="10" height="3" />
            <rect x="3" y="15" width="7" height="3" />
            <rect x="3" y="25" width="10" height="3" />
          </g>
          
          {/* S1 as Mirrored Knight - Starts at x=72 */}
          <g transform="translate(90, 6) scale(-1.1, 1.1)">
            <rect x="10" y="4" width="4" height="2" />
            <rect x="9" y="6" width="6" height="4" />
            <rect x="7" y="8" width="4" height="4" />
            <rect x="11" y="10" width="4" height="6" />
            <rect x="9" y="16" width="8" height="2" />
          </g>
          
          {/* S2 as Mirrored Knight - Starts at x=90 */}
          <g transform="translate(110, 6) scale(-1.1, 1.1)">
            <rect x="10" y="4" width="4" height="2" />
            <rect x="9" y="6" width="6" height="4" />
            <rect x="7" y="8" width="4" height="4" />
            <rect x="11" y="10" width="4" height="6" />
            <rect x="9" y="16" width="8" height="2" />
          </g>
       </g>
    </g>
  </svg>
);

/** UTILITY ICONS **/

export const PrayerHandsIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22l-1.5-3.5c-1-2.5-2-4.5-2-7.5 0-3 1-5 2.5-6.5L12 2l1 2.5c1.5 1.5 2.5 3.5 2.5 6.5 0 3-1 5-2 7.5L12 22z" fill="currentColor" fillOpacity="0.2" />
    <path d="M10 20l-1.5-3.5c-1-2.5-2-4.5-2-7.5 0-3 1-5 2.5-6.5L12 2" />
    <path d="M14 20l1.5-3.5c1-2.5 2-4.5 2-7.5 0-3-1-5-2.5-6.5L12 2" />
  </svg>
);

export const ShroomIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M2 14c0-5 4.5-8 10-8s10 3 10 8c0 1-1 1-1 1H3s-1 0-1-1z" />
    <path d="M9 15v4c0 1.5 1 2.5 3 2.5s3-1 3-2.5v-4H9z" />
    <circle cx="8" cy="10" r="1.5" fill="white" fillOpacity="0.8" />
    <circle cx="12" cy="8.5" r="1" fill="white" fillOpacity="0.8" />
    <circle cx="16" cy="11.5" r="2" fill="white" fillOpacity="0.8" />
  </svg>
);

export const ExplosionIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" fill="currentColor" fillOpacity="0.3" />
  </svg>
);

export const StarIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export const SkullIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 10l.01-.01M15 10l.01-.01M12 17v.01" />
    <path d="M12 2a7 7 0 0 0-7 7v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9a7 7 0 0 0-7-7z" />
    <path d="M10 22h4" />
  </svg>
);

export const BombIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="13" r="9" />
    <path d="M18.35 5.65l3.3-3.3" />
    <path d="M11 7V4" />
    <path d="M14 4h-3" />
  </svg>
);

export const CastleIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z" />
    <path d="M18 11V4H6v7" />
    <path d="M2 11h4V7h4v4h4V7h4v4h4" />
  </svg>
);

export const CrownIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
    <path d="M2 20h20" />
  </svg>
);

export const BowIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 3c-4 0-6 3-6 9s2 9 6 9" />
    <path d="M9 3c4 0 6 3 6 9s-2 9-6 9" />
    <path d="M3 12h18M18 8l4 4-4 4" />
  </svg>
);

export const ShieldIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const DaggerIcon = ({ className = "w-full h-full" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 2l-6 6" />
    <path d="M6 18l6-6M9 13l4 4" />
    <path d="M3 21l3-3" />
  </svg>
);

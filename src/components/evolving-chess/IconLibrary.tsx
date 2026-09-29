'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface IconProps {
  className?: string;
  suffix?: string;
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

export const PixelDancer = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="4" width="2" height="4" /> {/* Head */}
    <rect x="9" y="8" width="6" height="2" /> {/* Shoulders */}
    <rect x="10" y="10" width="4" height="6" /> {/* Body */}
    <rect x="7" y="14" width="2" height="4" /> {/* Left Leg (Extended) */}
    <rect x="15" y="12" width="2" height="4" /> {/* Right Leg (Lifted) */}
    <rect x="5" y="10" width="2" height="2" /> {/* Left Arm Pointing Up */}
    <rect x="17" y="10" width="2" height="2" /> {/* Right Arm Pointing Up */}
  </svg>
);

export const PixelMimic = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="8" width="12" height="10" /> {/* Main Box */}
    <rect x="5" y="10" width="14" height="6" />
    <rect x="8" y="6" width="8" height="2" /> {/* Lid */}
    <rect x="11" y="11" width="2" height="2" fill="white" fillOpacity="0.4" /> {/* Latch */}
    <rect x="7" y="12" width="2" height="2" fill="currentColor" opacity="0.3" /> {/* Glitch Squares */}
    <rect x="15" y="14" width="2" height="2" fill="currentColor" opacity="0.3" />
  </svg>
);

export const PixelGrappler = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="5" width="4" height="4" /> {/* Head */}
    <rect x="7" y="9" width="10" height="3" /> {/* Broad Shoulders */}
    <rect x="6" y="11" width="2" height="4" /> {/* Left Arm */}
    <rect x="16" y="11" width="2" height="4" /> {/* Right Arm */}
    <rect x="9" y="12" width="6" height="5" /> {/* Torso */}
    <rect x="8" y="17" width="8" height="2" /> {/* Base */}
  </svg>
);

export const PixelMycoMage = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Wizard Robe/Body */}
    <rect x="9" y="11" width="6" height="7" />
    <rect x="8" y="17" width="8" height="2" />
    
    {/* Mushroom Wizard Cap (Wide Brimmed Wizard Hat) */}
    <rect x="6" y="5" width="12" height="3" /> {/* Brim */}
    <rect x="8" y="3" width="8" height="2" /> {/* Cap Top */}
    <rect x="9" y="4" width="1" height="1" fill="white" /> {/* Spots */}
    <rect x="14" y="4" width="1" height="1" fill="white" />
    <rect x="11" y="6" width="2" height="1" fill="white" />

    {/* Arms */}
    <rect x="7" y="12" width="2" height="2" /> {/* Arm holding staff */}
    <rect x="15" y="12" width="2" height="2" /> {/* Free arm */}

    {/* Fungal Staff */}
    <rect x="6" y="7" width="1" height="11" fill="#78350F" />
    <rect x="5" y="5" width="3" height="3" fill="#EAB308" /> {/* Glowing staff crystal */}
    <rect x="6" y="6" width="1" height="1" fill="white" fillOpacity="0.5" />
  </svg>
);

export const PixelCommander = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="2" width="2" height="3" /> {/* Plume */}
    <rect x="10" y="5" width="4" height="4" /> {/* Head */}
    <rect x="8" y="9" width="8" height="2" /> {/* Armored Collar */}
    <rect x="10" y="11" width="4" height="6" /> {/* Body */}
    <rect x="8" y="17" width="8" height="2" /> {/* Base */}
  </svg>
);

export const PixelInfiltrator = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="5" width="2" height="2" /> {/* Hood Peak */}
    <rect x="10" y="7" width="4" height="3" /> {/* Head */}
    <rect x="9" y="10" width="6" height="1" /> {/* Shoulder Line */}
    <rect x="10" y="11" width="4" height="6" /> {/* Body */}
    <rect x="7" y="13" width="1" height="4" /> {/* Left Blade */}
    <rect x="16" y="13" width="1" height="4" /> {/* Right Blade */}
    <rect x="8" y="17" width="8" height="2" /> {/* Base */}
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

export const PixelHero = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="1" width="2" height="3" /> {/* Plume Top */}
    <rect x="10" y="2" width="4" height="2" /> {/* Plume Base */}
    <rect x="10" y="4" width="4" height="2" /> {/* Head */}
    <rect x="9" y="6" width="6" height="4" /> {/* Helmet */}
    <rect x="7" y="8" width="5" height="4" /> {/* Snout */}
    <rect x="11" y="10" width="4" height="6" /> {/* Body */}
    <rect x="13" y="10" width="3" height="4" /> {/* Cape Detail */}
    <rect x="9" y="16" width="8" height="2" /> {/* Base */}
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

export const PixelMirage = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="10" y="2" width="4" height="18" opacity="0.7" />
    <rect x="8" y="4" width="8" height="14" opacity="0.4" />
    <rect x="6" y="6" width="12" height="10" opacity="0.2" />
    <rect x="11" y="4" width="2" height="14" fill="white" opacity="0.9" />
  </svg>
);

export const PixelVoidEntity = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    {/* Outer Ripple */}
    <rect x="2" y="2" width="20" height="20" className="animate-void-ripple" style={{ animationDelay: '0.6s' }} />
    {/* Mid-Outer Ripple */}
    <rect x="4" y="4" width="16" height="16" className="animate-void-ripple" style={{ animationDelay: '0.4s' }} />
    {/* Mid-Inner Ripple */}
    <rect x="6" y="6" width="12" height="12" className="animate-void-ripple" style={{ animationDelay: '0.2s' }} />
    {/* Innermost Ripple */}
    <rect x="8" y="8" width="8" height="8" className="animate-void-ripple" style={{ animationDelay: '0s' }} />
    {/* Glowing Center */}
    <rect x="11" y="11" width="2" height="2" fill="#EAB308" className="animate-pulse" />
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

export const VibeChessTitle = ({ className, suffix = "" }: IconProps) => (
  <svg viewBox="0 0 220 40" className={cn(className, "animate-title-shimmer")} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id={`ascii-shader-title${suffix}`} x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="1" height="1" fill="white" />
      </pattern>
      <mask id={`ascii-mask-title${suffix}`}>
        <rect x="0" y="0" width="220" height="40" fill={`url(#ascii-shader-title${suffix})`} />
      </mask>
    </defs>
    <g mask={`url(#ascii-mask-title${suffix})`}>
       {/* VIBE */}
       <g fill="hsl(var(--primary))">
          {/* V */}
          <g className="animate-title-ripple" style={{ animationDelay: '0s' }}>
            <rect x="10" y="5" width="4" height="20" />
            <rect x="26" y="5" width="4" height="20" />
            <rect x="14" y="25" width="4" height="4" />
            <rect x="22" y="25" width="4" height="4" />
            <rect x="18" y="29" width="4" height="4" />
          </g>
          {/* I */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.1s' }}>
            <rect x="35" y="5" width="12" height="4" />
            <rect x="39" y="9" width="4" height="16" />
            <rect x="35" y="25" width="12" height="4" />
          </g>
          {/* B */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.2s' }}>
            <rect x="52" y="5" width="4" height="24" />
            <rect x="56" y="5" width="8" height="4" />
            <rect x="64" y="9" width="4" height="6" />
            <rect x="56" y="15" width="8" height="4" />
            <rect x="64" y="19" width="4" height="6" />
            <rect x="56" y="25" width="8" height="4" />
          </g>
          {/* E */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.3s' }}>
            <rect x="73" y="5" width="4" height="24" />
            <rect x="77" y="5" width="12" height="4" />
            <rect x="77" y="15" width="8" height="4" />
            <rect x="77" y="25" width="12" height="4" />
          </g>
       </g>
       
       {/* CHESS */}
       <g fill="hsl(var(--accent))">
          {/* C */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.4s' }}>
            <rect x="105" y="5" width="16" height="4" />
            <rect x="105" y="9" width="4" height="16" />
            <rect x="105" y="25" width="16" height="4" />
          </g>
          {/* H */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.5s' }}>
            <rect x="126" y="5" width="4" height="24" />
            <rect x="142" y="5" width="4" height="24" />
            <rect x="130" y="15" width="12" height="4" />
          </g>
          {/* E */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.6s' }}>
            <rect x="151" y="5" width="4" height="24" />
            <rect x="155" y="5" width="12" height="4" />
            <rect x="155" y="15" width="8" height="4" />
            <rect x="155" y="25" width="12" height="4" />
          </g>
          {/* S */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.7s' }}>
            <rect x="172" y="5" width="16" height="4" />
            <rect x="172" y="9" width="4" height="6" />
            <rect x="172" y="15" width="16" height="4" />
            <rect x="184" y="19" width="4" height="6" />
            <rect x="172" y="25" width="16" height="4" />
          </g>
          {/* S */}
          <g className="animate-title-ripple" style={{ animationDelay: '0.8s' }}>
            <rect x="193" y="5" width="16" height="4" />
            <rect x="193" y="9" width="4" height="6" />
            <rect x="193" y="15" width="16" height="4" />
            <rect x="205" y="19" width="4" height="6" />
            <rect x="193" y="25" width="16" height="4" />
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
    <path d="M14 20l1.5-3.5c1-2.5-2-4.5-2-7.5 0-3-1-5-2.5-6.5L12 2" />
  </svg>
);

export const ShroomIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Cap: Main Shape */}
    <rect x="9" y="6" width="6" height="2" />
    <rect x="7" y="8" width="10" height="2" />
    <rect x="5" y="10" width="14" height="4" />
    
    {/* Stem */}
    <rect x="10" y="14" width="4" height="5" />
    <rect x="9" y="19" width="6" height="2" />
    
    {/* High-Contrast Spots (Stay white regardless of parent color) */}
    <rect x="11" y="8" width="2" height="2" fill="white" />
    <rect x="7" y="11" width="2" height="2" fill="white" />
    <rect x="15" y="11" width="2" height="2" fill="white" />
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

/** LOBBY & SYSTEM ICONS (FULL COLOR) **/

export const PixelTome = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="2" y="4" width="10" height="16" fill="#10B981" />
    <rect x="12" y="4" width="10" height="16" fill="#059669" />
    <rect x="11" y="4" width="2" height="16" fill="black" fillOpacity="0.3" />
    <rect x="14" y="7" width="6" height="2" fill="white" fillOpacity="0.4" />
    <rect x="14" y="11" width="6" height="2" fill="white" fillOpacity="0.4" />
    <rect x="14" y="15" width="4" height="2" fill="white" fillOpacity="0.4" />
  </svg>
);

export const PixelSack = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="6" y="10" width="12" height="10" rx="3" fill="#78350F" />
    <rect x="5" y="12" width="14" height="6" rx="2" fill="#78350F" />
    <rect x="8" y="7" width="8" height="4" rx="1" fill="#451a03" />
    <rect x="7" y="8" width="10" height="2" fill="#92400E" opacity="0.3" />
    <rect x="11" y="9" width="2" height="1" fill="#FEF08A" />
    <rect x="10" y="8" width="1" height="3" fill="#B45309" />
    <rect x="13" y="8" width="1" height="3" fill="#B45309" />
    <rect x="8" y="13" width="1" height="1" fill="white" fillOpacity="0.2" />
  </svg>
);

export const PixelStall = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="4" y="4" width="16" height="4" fill="#B91C1C" />
    <rect x="4" y="4" width="4" height="4" fill="#EAB308" />
    <rect x="12" y="4" width="4" height="4" fill="#EAB308" />
    <rect x="6" y="8" width="1" height="10" fill="#78350F" />
    <rect x="17" y="8" width="1" height="10" fill="#78350F" />
    <rect x="4" y="14" width="16" height="6" fill="#92400E" />
    <rect x="5" y="15" width="14" height="1" fill="white" fillOpacity="0.2" />
  </svg>
);

export const PixelSwords = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <g transform="rotate(45 12 12)">
       <rect x="10" y="2" width="4" height="16" fill="#94A3B8" />
       <rect x="11" y="2" width="2" height="16" fill="#CBD5E1" />
       <rect x="7" y="15" width="10" height="2" fill="#EAB308" />
       <rect x="11" y="17" width="2" height="4" fill="#78350F" />
       <rect x="10.5" y="21" width="3" height="2" fill="#B45309" />
    </g>
    <g transform="rotate(-45 12 12)">
       <rect x="10" y="2" width="4" height="16" fill="#94A3B8" />
       <rect x="11" y="2" width="2" height="16" fill="#CBD5E1" />
       <rect x="7" y="15" width="10" height="2" fill="#EAB308" />
       <rect x="11" y="17" width="2" height="4" fill="#78350F" />
       <rect x="10.5" y="21" width="3" height="2" fill="#B45309" />
    </g>
  </svg>
);

export const PixelTrophy = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="6" y="4" width="12" height="8" fill="#EAB308" />
    <rect x="10" y="12" width="4" height="6" fill="#B45309" />
    <rect x="6" y="18" width="12" height="2" fill="#78350F" />
    <rect x="4" y="5" width="2" height="4" fill="#EAB308" />
    <rect x="18" y="5" width="2" height="4" fill="#EAB308" />
  </svg>
);

export const PixelRobotHead = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    {/* Using a hollow path with evenodd to ensure features are solid black (no dither) */}
    <path 
      fillRule="evenodd" 
      fill="currentColor"
      d="M6 8h12v10H6V8zm2 3h2v2H8v-2zm6 0h2v2h-2v-2zm-5 4h6v1H9v-1z M11 4h2v4h-2V4zm-1-2h4v2h-4V2z"
    />
  </svg>
);

export const PixelGear = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="11" y="2" width="2" height="20" fill="#475569" />
    <rect x="2" y="11" width="20" height="2" fill="#475569" />
    <rect x="6" y="6" width="12" height="12" fill="#64748B" />
    <rect x="11" y="11" width="2" height="2" fill="black" />
  </svg>
);

export const PixelUndo = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="12" y="6" width="2" height="12" fill="#3B82F6" />
    <rect x="14" y="6" width="4" height="2" fill="#3B82F6" />
    <rect x="14" y="16" width="4" height="2" fill="#3B82F6" />
    <rect x="6" y="10" width="6" height="4" fill="#2563EB" />
    <rect x="4" y="11" width="2" height="2" fill="#2563EB" />
  </svg>
);

export const PixelReset = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="8" y="4" width="8" height="2" fill="#EF4444" />
    <rect x="16" y="6" width="2" height="8" fill="#EF4444" />
    <rect x="8" y="14" width="8" height="2" fill="#EF4444" />
    <rect x="6" y="6" width="2" height="6" fill="#EF4444" />
    <rect x="4" y="6" width="2" height="2" fill="#DC2626" />
    <rect x="2" y="8" width="4" height="2" fill="#DC2626" />
    <rect x="4" y="10" width="2" height="2" fill="#DC2626" />
    <rect x="6" y="4" width="2" height="2" fill="black" fillOpacity="0.1" />
  </svg>
);

export const PixelMonitor = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect x="4" y="4" width="16" height="12" fill="#64748B" />
    <rect x="6" y="6" width="12" height="8" fill="#1e1b4b" fillOpacity="0.8" />
    <rect x="10" y="16" width="4" height="2" fill="#475569" />
    <rect x="7" y="18" width="10" height="2" fill="#475569" />
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

export const ExplosionIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="11" y="2" width="2" height="4" />
    <rect x="11" y="18" width="2" height="4" />
    <rect x="2" y="11" width="4" height="2" />
    <rect x="18" y="11" width="4" height="2" />
    <rect x="5" y="5" width="3" height="3" />
    <rect x="16" y="5" width="3" height="3" />
    <rect x="5" y="16" width="3" height="3" />
    <rect x="16" y="16" width="3" height="3" />
  </svg>
);

/** BACKGROUND ASSETS **/

export const PixelGemstoneMasonry = ({ className }: IconProps) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Brightened staggered gemstone bricks for better shader penetration */}
    {/* Row 1 */}
    <rect x="0" y="0" width="48" height="23" fill="#4ADE80" fillOpacity="0.9" /> {/* Luminous Mint Green */}
    <rect x="52" y="0" width="48" height="23" fill="#38BDF8" fillOpacity="0.9" /> {/* Luminous Sky Blue */}
    
    {/* Row 2 */}
    <rect x="0" y="27" width="23" height="23" fill="#C084FC" fillOpacity="0.9" /> {/* Luminous Amethyst */}
    <rect x="27" y="27" width="46" height="23" fill="#4ADE80" fillOpacity="0.9" /> {/* Luminous Mint Green */}
    <rect x="77" y="27" width="23" height="23" fill="#38BDF8" fillOpacity="0.9" /> {/* Luminous Sky Blue */}
    
    {/* Row 3 */}
    <rect x="0" y="54" width="48" height="23" fill="#38BDF8" fillOpacity="0.9" /> {/* Luminous Sky Blue */}
    <rect x="52" y="54" width="48" height="23" fill="#C084FC" fillOpacity="0.9" /> {/* Luminous Amethyst */}
    
    {/* Row 4 */}
    <rect x="0" y="81" width="23" height="19" fill="#4ADE80" fillOpacity="0.9" /> {/* Luminous Mint Green */}
    <rect x="27" y="81" width="46" height="19" fill="#38BDF8" fillOpacity="0.9" /> {/* Luminous Sky Blue */}
    <rect x="77" y="81" width="23" height="19" fill="#C084FC" fillOpacity="0.9" /> {/* Luminous Amethyst */}
    
    {/* Grout/Cracks */}
    <rect x="0" y="23" width="100" height="4" fill="black" fillOpacity="0.4" />
    <rect x="0" y="50" width="100" height="4" fill="black" fillOpacity="0.4" />
    <rect x="0" y="77" width="100" height="4" fill="black" fillOpacity="0.4" />
    <rect x="48" y="0" width="4" height="23" fill="black" fillOpacity="0.4" />
    <rect x="23" y="27" width="4" height="23" fill="black" fillOpacity="0.4" />
    <rect x="73" y="27" width="4" height="23" fill="black" fillOpacity="0.4" />
    <rect x="48" y="54" width="4" height="23" fill="black" fillOpacity="0.4" />
    <rect x="23" y="81" width="4" height="19" fill="black" fillOpacity="0.4" />
    <rect x="73" y="81" width="4" height="19" fill="black" fillOpacity="0.4" />
  </svg>
);
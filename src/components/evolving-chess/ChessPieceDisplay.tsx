import React, { memo } from 'react';
import type { Piece, ViewMode } from '@/types';
import { cn } from '@/lib/utils';
import { 
  PixelPawn, 
  PixelDancer,
  PixelMimic,
  PixelGrappler,
  PixelMycoMage,
  PixelCommander,
  PixelInfiltrator,
  PixelKnight, 
  PixelHero,
  PixelArcher,
  PixelBishop, 
  PixelArchbishop, 
  PixelRook, 
  PixelPalace, 
  PixelQueen, 
  PixelKing, 
  PixelHydra,
  PixelNecromancer,
  PixelColossus,
  PixelMirage,
  PixelVoidEntity,
  ShroomIcon
} from './IconLibrary';
import { ItemSprite } from './ItemSprite';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
  isSacrificeTarget?: boolean;
  isCommanderPromoTarget?: boolean;
  isPromoting?: boolean;
  isConverting?: boolean;
  isSnipeTarget?: boolean;
  effectiveLevel?: number;
  isGrimoirBoosted?: boolean;
  isMini?: boolean;
  isOnBoard?: boolean;
  isSelected?: boolean;
}

const PieceIconMap: Record<string, React.FC<{ className?: string }>> = {
  pawn: PixelPawn,
  dancer: PixelDancer,
  mimic: PixelMimic,
  grappler: PixelGrappler,
  myco_mage: PixelMycoMage,
  commander: PixelCommander,
  infiltrator: PixelInfiltrator,
  knight: PixelKnight,
  hero: PixelHero,
  archer: PixelArcher,
  bishop: PixelBishop,
  archbishop: PixelArchbishop,
  rook: PixelRook,
  palace: PixelPalace,
  queen: PixelQueen,
  king: PixelKing,
};

const FrozenOverlay = () => (
  <div className="absolute inset-0 z-[30] pointer-events-none overflow-hidden">
    {/* The Ice Block */}
    <div className="absolute inset-0 bg-sky-300/40 border-2 border-sky-500 animate-[frost-pulse_3s_infinite_ease-in-out]" />
    
    {/* Glints */}
    <div className="absolute top-[15%] left-[20%] w-1 h-1 bg-white animate-[ice-glint_4s_infinite]" style={{ animationDelay: '0.5s' }} />
    <div className="absolute top-[60%] left-[75%] w-1 h-1 bg-white animate-[ice-glint_4s_infinite]" style={{ animationDelay: '2.5s' }} />
    <div className="absolute top-[30%] left-[65%] w-0.5 h-0.5 bg-white animate-[ice-glint_4s_infinite]" style={{ animationDelay: '1.2s' }} />
  </div>
);

export const ChessPieceDisplay = memo(({
  piece,
  isKingInCheck = false,
  viewMode,
  isJustMoved = false,
  isSacrificeTarget = false,
  isCommanderPromoTarget = false,
  isPromoting = false,
  isConverting = false,
  isSnipeTarget = false,
  effectiveLevel,
  isGrimoirBoosted = false,
  isMini = false,
  isOnBoard = false,
  isSelected = false,
}: ChessPieceDisplayProps) => {
  
  if (piece.id?.startsWith('boss-colossus') && isOnBoard) {
      return null;
  }

  let IconComponent = PieceIconMap[piece.type] || PixelPawn;

  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';
  let bossStyle: React.CSSProperties = {};
  let animationClass = '';

  if (piece.id?.startsWith('boss-hydra')) {
    IconComponent = PixelHydra;
    pieceColorClass = ""; bossStyle = { color: '#10B981' };
    animationClass = "animate-hydra-idle";
  } else if (piece.id === 'boss-necro') {
    IconComponent = PixelNecromancer;
    pieceColorClass = ""; bossStyle = { color: '#8B5CF6' };
    animationClass = "animate-necro-hover";
  } else if (piece.id?.startsWith('boss-colossus')) {
    IconComponent = PixelColossus;
    pieceColorClass = ""; bossStyle = { color: '#64748B' };
  } else if (piece.id === 'boss-mirage') {
    IconComponent = PixelMirage;
    pieceColorClass = ""; bossStyle = { color: '#38BDF8' };
    animationClass = "animate-mirage-shimmer";
  } else if (piece.id === 'boss-entity') {
    IconComponent = PixelVoidEntity;
    pieceColorClass = ""; bossStyle = { color: '#4338CA' };
  }
  
  if (isConverting) {
    animationClass = piece.color === 'white' ? 'animate-color-flash-wtb' : 'animate-color-flash-btw';
  }

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPieceForTabletop = viewMode === 'tabletop' && piece.color === 'black';

  const level = piece.level || 1;
  let powerGlowClass = '';
  if (level >= 6) {
    powerGlowClass = 'animate-ascended-glow';
  } else if (level >= 4) {
    powerGlowClass = 'animate-power-glow';
  }

  const isExhausted = (piece.cooldownTurnsRemaining || 0) > 0;
  const isFrozen = (piece.frozenTurnsRemaining || 0) > 0;
  const displayLevelValue = effectiveLevel ?? level;

  return (
    <div className={cn("w-full h-full", shouldRotateBlackPieceForTabletop && "rotate-180")}>
      <div
        className={cn(
          "relative flex items-center justify-center w-full h-full",
          (isSacrificeTarget || isCommanderPromoTarget || isSnipeTarget) && "animate-pulse",
          isPromoting && "animate-ping",
          isExhausted && !isFrozen && "grayscale opacity-60 contrast-50",
          isFrozen && "grayscale-[0.3] brightness-[1.1]",
          piece.id === 'boss-entity' && "animate-void-vibe",
          isSelected && !isFrozen && "animate-hop",
          "origin-center"
        )}
      >
        {/* SHADER-TREATED WRAPPER FOR ART & STATUS ONLY */}
        <div className={cn(
            "absolute inset-0 ascii-shader flex items-center justify-center",
            pieceColorClass,
            animationClass,
            powerGlowClass,
            piece.isPoisoned && "animate-pulse drop-shadow-[0_0_8px_#22C55E]"
        )} style={bossStyle}>
            {isFrozen && <FrozenOverlay />}

            {piece.id === 'boss-entity' && !isMini && (
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-primary rounded-full animate-void-particle" style={{ '--x': '30px', '--y': '-35px' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-accent rounded-full animate-void-particle" style={{ '--x': '-35px', '--y': '25px', animationDelay: '0.8s' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-secondary rounded-full animate-void-particle" style={{ '--x': '25px', '--y': '30px', animationDelay: '1.6s' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-void-particle" style={{ '--x': '-28px', '--y': '-28px', animationDelay: '0.4s' } as React.CSSProperties} />
            </div>
            )}

            {piece.id === 'boss-mirage' && !isMini && (
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-sky-300 rounded-full animate-mirage-particle" style={{ '--dx': '40px', '--dy': '-40px' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-mirage-particle" style={{ '--dx': '-35px', '--dy': '35px', animationDelay: '1s' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-sky-100 rounded-full animate-mirage-particle" style={{ '--dx': '30px', '--dy': '45px', animationDelay: '2.2s' } as React.CSSProperties} />
                <div className="absolute top-1/2 left-1/2 w-0.5 h-0.5 bg-sky-400 rounded-full animate-mirage-particle" style={{ '--dx': '-45px', '--dy': '-20px', animationDelay: '0.5s' } as React.CSSProperties} />
            </div>
            )}

            <div className={cn(
            "w-[95%] h-[95%] relative z-[1] flex items-center justify-center origin-center",
            piece.id === 'boss-entity' && "animate-void-spin animate-void-color-cycle",
            isMini 
                ? ((['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage', 'commander', 'infiltrator'].includes(piece.type)) ? "scale-[180%]" : "scale-[200%]")
                : ((['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage', 'commander', 'infiltrator'].includes(piece.type)) ? "scale-90" : "scale-100")
            )}>
                <IconComponent className="w-full h-full drop-shadow-md" />
            </div>
        </div>

        {/* HUD ELEMENTS (NO SHADER) */}
        {piece.isShielded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]">
            <div className="w-[115%] h-[115%] border-2 border-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
          </div>
        )}

        {piece.heldItem && (
          <div className={cn(
            "absolute bottom-0 right-0 z-[5] origin-bottom-right transition-transform",
            isMini ? "scale-50" : "scale-100 md:scale-[1.3]"
          )}>
             <ItemSprite type={piece.heldItem} size={isMini ? 12 : 20} className="[--ascii-unit:1px]" />
          </div>
        )}

        {piece.type === 'myco_mage' && !isMini && (
            <div className="absolute bottom-0 left-0 z-[20] flex items-center gap-0.5 bg-black/60 px-1 rounded-tr-md">
                <ShroomIcon className="w-2 h-2 text-white" />
                <span className="text-[0.45rem] font-pixel text-white">{piece.shroomMana || 0}</span>
            </div>
        )}

        {displayLevelValue > 1 && (
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center font-pixel pointer-events-none z-[20]",
              isMini ? "text-[0.35rem]" : "text-[0.65rem] md:text-[0.975rem]"
            )}
            style={{ 
              textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000',
              color: isGrimoirBoosted ? '#C084FC' : 'hsl(var(--destructive))',
              marginTop: isMini ? '0.05rem' : (isOnBoard ? '0.195rem' : '0.15rem')
            }}
          >
            {displayLevelValue}
          </span>
        )}
      </div>
    </div>
  );
});
ChessPieceDisplay.displayName = 'ChessPieceDisplay';

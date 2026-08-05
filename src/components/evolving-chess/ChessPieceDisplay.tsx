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
  PixelBishop, 
  PixelRook, 
  PixelQueen, 
  PixelKing, 
  PixelArchbishop, 
  PixelPalace, 
  PixelArcher,
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

export function ChessPieceDisplay({
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
}: ChessPieceDisplayProps) {
  
  if (piece.id.startsWith('boss-colossus') && isOnBoard) {
      // The board uses LargeEntityOverlay to render the Colossus to prevent clipping
      return null;
  }

  let IconComponent = PieceIconMap[piece.type] || PixelPawn;

  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';
  let bossStyle: React.CSSProperties = {};

  // --- CUSTOM BOSS VISUALS ---
  if (piece.id.startsWith('boss-hydra')) {
    IconComponent = PixelHydra;
    pieceColorClass = ""; bossStyle = { color: '#10B981' }; // Emerald
  } else if (piece.id === 'boss-necro') {
    IconComponent = PixelNecromancer;
    pieceColorClass = ""; bossStyle = { color: '#8B5CF6' }; // Violet
  } else if (piece.id.startsWith('boss-colossus')) {
    IconComponent = PixelColossus;
    pieceColorClass = ""; bossStyle = { color: '#64748B' };
  } else if (piece.id === 'boss-mirage') {
    IconComponent = PixelMirage;
    pieceColorClass = ""; bossStyle = { color: '#38BDF8' }; // Sky
  } else if (piece.id === 'boss-entity') {
    IconComponent = PixelVoidEntity;
    pieceColorClass = ""; bossStyle = { color: '#4338CA' }; // Vibrant Indigo for better hue-rotation visibility
  }
  
  let animationClass = '';
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
  const displayLevelValue = effectiveLevel ?? level;

  return (
    <div
      className={cn(
        "w-full h-full",
        shouldRotateBlackPieceForTabletop && "rotate-180"
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center w-full h-full",
          pieceColorClass,
          (isSacrificeTarget || isCommanderPromoTarget || isSnipeTarget) && "animate-pulse",
          isPromoting && "animate-ping",
          animationClass,
          powerGlowClass,
          piece.isPoisoned && "animate-pulse drop-shadow-[0_0_8px_#22C55E]",
          isExhausted && "grayscale opacity-60 contrast-50",
          piece.id === 'boss-entity' && "animate-void-vibe",
          "origin-center"
        )}
        style={bossStyle}
      >
        {/* Subtle Void Particles */}
        {piece.id === 'boss-entity' && !isMini && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-primary rounded-full animate-void-particle" style={{ '--x': '30px', '--y': '-35px' } as React.CSSProperties} />
            <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-accent rounded-full animate-void-particle" style={{ '--x': '-35px', '--y': '25px', animationDelay: '0.8s' } as React.CSSProperties} />
            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-secondary rounded-full animate-void-particle" style={{ '--x': '25px', '--y': '30px', animationDelay: '1.6s' } as React.CSSProperties} />
            <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-void-particle" style={{ '--x': '-28px', '--y': '-28px', animationDelay: '0.4s' } as React.CSSProperties} />
          </div>
        )}

        {piece.isShielded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]">
            <div className="w-[115%] h-[115%] border-2 border-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
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

        {piece.heldItem && (
          <div className={cn(
            "absolute bottom-0 right-0 z-[5] bg-black/40 rounded-sm p-0.5 origin-bottom-right",
            isMini ? "scale-50" : "scale-100"
          )}>
             <ItemSprite 
               type={piece.heldItem} 
               size={isMini ? 10 : 13} 
             />
          </div>
        )}

        {piece.type === 'myco_mage' && !isMini && (
            <div className="absolute bottom-0 left-0 z-[20] flex items-center gap-0.5 bg-black/60 px-1 rounded-tr-md">
                <ShroomIcon className="w-2 h-2 text-white" />
                <span className="text-[8px] font-pixel text-white">{piece.shroomMana || 0}</span>
            </div>
        )}

        {displayLevelValue > 1 && (
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center font-pixel pointer-events-none z-[20]",
              isMini ? "text-[6.5px]" : "text-[11px] md:text-[13px]"
            )}
            style={{ 
              textShadow: `
                1.5px 1.5px 0 #000, 
                -1.5px 1.5px 0 #000, 
                1.5px -1.5px 0 #000, 
                -1.5px -1.5px 0 #000,
                0 1.5px 0 #000,
                0 -1.5px 0 #000,
                1.5px 0 0 #000,
                -1.5px 0 0 #000
              `,
              color: isGrimoirBoosted ? '#C084FC' : 'hsl(var(--destructive))',
              marginTop: isMini ? '1px' : '5px'
            }}
            aria-label={`Level ${displayLevelValue}`}
          >
            {displayLevelValue}
          </span>
        )}
      </div>
    </div>
  );
}

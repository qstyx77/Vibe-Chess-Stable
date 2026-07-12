import type { Piece, ViewMode } from '@/types';
import { cn } from '@/lib/utils';
import { 
  StarIcon, 
  SkullIcon, 
  PixelPawn, 
  PixelKnight, 
  PixelBishop, 
  PixelRook, 
  PixelQueen, 
  PixelKing, 
  PixelArchbishop, 
  PixelPalace, 
  PixelArcher 
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
}

const PieceIconMap: Record<string, React.FC<{ className?: string }>> = {
  pawn: PixelPawn,
  commander: PixelPawn,
  infiltrator: PixelPawn,
  knight: PixelKnight,
  hero: PixelKnight,
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
}: ChessPieceDisplayProps) {
  
  const IconComponent = PieceIconMap[piece.type] || PixelPawn;

  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';
  
  let animationClass = '';
  if (isConverting) {
    animationClass = piece.color === 'white' ? 'animate-color-flash-wtb' : 'animate-color-flash-btw';
  }

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPieceForTabletop = viewMode === 'tabletop' && piece.color === 'black';

  const isCommanderLike = piece.type === 'commander' || piece.type === 'hero';
  const isInfiltrator = piece.type === 'infiltrator';

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
          "origin-bottom"
        )}
      >
        {piece.isShielded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]">
            <div className="w-[115%] h-[115%] border-2 border-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
          </div>
        )}

        <div className={cn(
          "w-[95%] h-[95%] relative z-[1]",
          isMini 
            ? ((piece.type === 'pawn' || piece.type === 'commander' || piece.type === 'infiltrator') ? "scale-[180%]" : "scale-[200%]")
            : ((piece.type === 'pawn' || piece.type === 'commander' || piece.type === 'infiltrator') ? "scale-90" : "scale-100")
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

        {isCommanderLike && (
          <span
            className="absolute leading-none z-[2]"
            style={{
              top: '-1px',
              right: '-1px',
            }}
            aria-label={piece.type === 'hero' ? "Hero Star" : "Commander Star"}
          >
            <StarIcon className={cn(isMini ? "w-[6.5px] h-[6.5px]" : "w-[13px] h-[13px]", "text-yellow-400 drop-shadow-[0_0_1.5px_black]")} />
          </span>
        )}

        {isInfiltrator && (
          <span
            className="absolute leading-none z-[2]"
            style={{
              top: '-1px',
              right: '-1px',
            }}
            aria-label="Infiltrator Skull"
          >
            <SkullIcon className={cn(isMini ? "w-[6.5px] h-[6.5px]" : "w-[13px] h-[13px]", "text-destructive drop-shadow-[0_0_1.5px_black]")} />
          </span>
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

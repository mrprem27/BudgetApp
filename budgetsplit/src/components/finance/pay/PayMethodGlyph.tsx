import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { PayMethod } from '../../../constants/enums';
import type { FeatherName } from '../../../constants/palette';
import { IconCircle } from '../../ui/IconCircle';

/**
 * The one glyph per pay method (`W1-06`). Feather has no bank, wallet or banknote, and the
 * stand-ins it forced were wrong in a way you could see: a briefcase for a bank, a shopping bag
 * for a wallet, and a dollar sign for cash in a rupee app. Those three are drawn here on
 * Feather's own grid (24, stroke 2, round joins) so they sit beside the rest without a seam;
 * the others are Feather's.
 */
const FEATHER: Partial<Record<PayMethod, FeatherName>> = {
  [PayMethod.Upi]: 'smartphone',
  [PayMethod.Card]: 'credit-card',
  [PayMethod.Autopay]: 'repeat',
  [PayMethod.Other]: 'more-horizontal',
};

function Drawn({ method, size, color }: { method: PayMethod; size: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {method === PayMethod.Bank && (
        <>
          <Path d="M3 9.5 12 4l9 5.5" {...stroke} />
          <Path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18" {...stroke} />
        </>
      )}
      {method === PayMethod.Wallet && (
        <>
          <Path d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v3" {...stroke} />
          <Path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3" {...stroke} />
          <Path d="M17 12a2 2 0 0 0 0 4h4v-4z" {...stroke} />
        </>
      )}
      {method === PayMethod.Cash && (
        <>
          <Rect x={2} y={6} width={20} height={12} rx={2} {...stroke} />
          <Circle cx={12} cy={12} r={2.5} {...stroke} />
          <Path d="M6 12h.01M18 12h.01" {...stroke} />
        </>
      )}
    </Svg>
  );
}

/** A pay method's glyph at `size`, in `color`. */
export function PayMethodGlyph({ method, size = 16, color }: { method: PayMethod; size?: number; color: string }) {
  const f = FEATHER[method];
  return f ? <Feather name={f} size={size} color={color} /> : <Drawn method={method} size={size} color={color} />;
}

/** The glyph in `IconCircle`, for a row's leading slot. */
export function PayMethodDisc({ method, size = 32, color }: { method: PayMethod; size?: number; color: string }) {
  return <IconCircle size={size} color={color} glyph={<PayMethodGlyph method={method} size={Math.round(size / 2)} color={color} />} />;
}

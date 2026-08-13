import type { ModelId } from '../sim/models';
import { iconBear, iconFlower, iconRainbow } from '../ui/icons';

export type ChallengeKey = 'bear' | 'reach' | 'bloom';

export interface ChallengeDef {
  key: ChallengeKey;
  model: ModelId;
  /** カードに出す短い名前 */
  label: string;
  /** あそび方（ひらがな・ごく短く） */
  hint: string;
  icon: () => string;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    key: 'bear',
    model: 'bridge',
    label: 'くまさん',
    hint: 'ゆびで はしを ささえて！',
    icon: iconBear,
  },
  {
    key: 'reach',
    model: 'arch',
    label: 'にじの あし',
    hint: 'アーチを ぎゅーっ！',
    icon: iconRainbow,
  },
  {
    key: 'bloom',
    model: 'flower',
    label: 'にじの おはな',
    hint: 'おはなを ぎゅっ！',
    icon: iconFlower,
  },
];

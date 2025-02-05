import { Destructable, MapPlayer } from 'w3ts';

import { DESTRUCTABLE_TREE } from './constants';
import {
  Angle, Distance, isPointReachable, Loc, PolarProjection,
} from './location';
import { pickRandom } from './utils';

export function getDestructablesInRect(rect: rect, filter?: (d: Destructable) => boolean): Destructable[] {
  const result: Destructable[] = [];
  EnumDestructablesInRectAll(rect, () => {
    const des = Destructable.fromHandle(GetEnumDestructable());
    if (filter == null || filter(des)) {
      result.push(des);
    }
  });
  return result;
}

export function getDestructablesInRange(
  range: number,
  loc: Loc,
  filter?: (d: Destructable) => boolean,
): Destructable[] {
  const rect = Rect(loc.x - range, loc.y - range, loc.x + range, loc.y + range);
  const result = getDestructablesInRect(rect, (d) => Distance(loc, d) <= range && filter(d));
  RemoveRect(rect);
  return result;
}

const attempts = 20;

/**
 * Might return fewer locations than mostLocCount
 */
export function generateFogLocsBehindTrees(range: number, centerLoc: Loc, fogPlayer: MapPlayer, locCountAtMost: number, filter?: (loc: Loc) => boolean): Loc[] {
  const trees = getDestructablesInRange(range, centerLoc, (d) => d.typeId === DESTRUCTABLE_TREE);
  if (trees.length === 0) {
    return [];
  }

  const result: Loc[] = [];
  for (let cnt = 0; cnt < locCountAtMost; cnt++) {
    for (let i = 0; i < attempts; i++) {
      const tree = pickRandom(trees);
      const angleToTree = Angle(centerLoc, tree);
      const candidateLoc = PolarProjection(tree, GetRandomReal(100, 200), GetRandomReal(angleToTree - 30, angleToTree + 30));
      const reachable = isPointReachable(centerLoc, candidateLoc);
      const visible = fogPlayer.coordsVisible(candidateLoc.x, candidateLoc.y);
      if (reachable && !visible && (filter === undefined || filter(candidateLoc))) {
        result.push(candidateLoc);
        break;
      }
    }
  }
  return result;
}

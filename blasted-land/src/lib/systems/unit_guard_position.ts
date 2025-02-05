import { onChatCommand } from 'events/chat_commands/chat_commands.model';
import {
  currentLoc, Distance, Loc,
} from 'lib/location';
import { log } from 'lib/log';
import { angleDifference } from 'lib/maths/misc';
import { isPlayingPlayer } from 'lib/player';
import { isAttending } from 'lib/systems/unit_interaction';
import { getTimeS, setIntervalIndefinite } from 'lib/trigger';
import {
  isBuilding, isUnitIdle, isUnitRemoved, setUnitFacingWithRate,
} from 'lib/unit';
import { shuffleArray } from 'lib/utils';
import { Unit } from 'w3ts';
import { OrderId } from 'w3ts/globals';

enum Priority {
  HIGH = 0,
  MEDIUM = 1,
  LOW = 2
}

interface GuardPositonData {
  position: Loc
  angle: number
  maxRadius: number
  animation: string
  lastBusyTimeS: number
  lastAnimationSetS: number
  paused: boolean
  includeUserUnit: boolean
}

const unitPositions = [
  new Map<Unit, GuardPositonData>(),
  new Map<Unit, GuardPositonData>(),
  new Map<Unit, GuardPositonData>(),
];

const priorities = [Priority.LOW, Priority.MEDIUM, Priority.HIGH];

interface GuardOptions {
  maxRadius?: number,
  animation?: string,
  includeUserUnit?: boolean
}

export function setGuardPosition(
  u: Unit,
  loc: Loc,
  facing: number,
  options?: GuardOptions,
): void {
  if (isBuilding(u)) return;
  removeGuardPosition(u);

  unitPositions[Priority.HIGH].set(u, {
    position: loc,
    angle: facing,
    maxRadius: options?.maxRadius ?? 99999999,
    animation: options?.animation ?? '',
    lastBusyTimeS: -99,
    lastAnimationSetS: -999,
    paused: false,
    includeUserUnit: options?.includeUserUnit ?? false,
  });
}

export function guardCurrentPosition(unit: Unit, options?: GuardOptions): void {
  unit.issueImmediateOrder(OrderId.Stop);
  setGuardPosition(unit, currentLoc(unit), unit.facing, options);
}

export function removeGuardPosition(...units: Unit[]): void {
  for (const u of units) {
    if (isBuilding(u)) continue;
    u.removeGuardPosition();
    for (const priority of priorities) {
      unitPositions[priority].delete(u);
    }
  }
}

export function pauseGuardPosition(units: Unit[], isPaused: boolean): void {
  for (const u of units) {
    if (isBuilding(u)) continue;
    u.removeGuardPosition();
    for (const priority of priorities) {
      if (unitPositions[priority].has(u)) {
        unitPositions[priority].get(u).paused = isPaused;
        if (isPaused) {
          setGuardPositionPriority(u, Priority.LOW, priority);
        } else {
          setGuardPositionPriority(u, Priority.HIGH, priority);
        }
        break;
      }
    }
  }
}

export function daemonGuardPosition(): void {
  onChatCommand('-gup', true, () => {
    for (const priority of priorities) {
      log(`unitPositions[${priority}]`, unitPositions[priority].size);
    }
  });

  const unitsPerIteration = 5;
  for (const priority of priorities) {
    let shuffledUnits: Unit[] = [];
    let currentIndex = 0;

    // eslint-disable-next-line no-loop-func
    setIntervalIndefinite(0.1, () => {
      const now = getTimeS();
      if (currentIndex >= shuffledUnits.length) {
        currentIndex = 0;
        if (unitPositions[priority].size > 0) {
          // Start a new pass: shuffle the units
          shuffledUnits = shuffleArray(Array.from(unitPositions[priority].keys()));
        } else if (shuffledUnits.length > 0) {
          shuffledUnits = [];
        } else {
          // do nothing, both unitPositions[priority] and shuffledUnits is already empty
        }
      }

      const remainingUnits = shuffledUnits.length - currentIndex;
      if (remainingUnits === 0) return;
      const unitsToProcess = Math.min(unitsPerIteration, remainingUnits);

      for (let processedCount = 0; processedCount < unitsToProcess; processedCount++) {
        const unit = shuffledUnits[currentIndex];
        currentIndex++;

        // check if unit has been removed
        if (isUnitRemoved(unit)) {
          unitPositions[priority].delete(unit);
          continue;
        }

        // Check if the unit has been deleted during the pass
        const data = unitPositions[priority].get(unit);
        if (data) {
          const newPriority = updateUnit(unit, data, now);
          setGuardPositionPriority(unit, newPriority, priority);
        }
      }
    });
  }
}

function updateUnit(unit: Unit, data: GuardPositonData, now: number): Priority {
  const {
    position, angle, maxRadius, paused, animation, includeUserUnit,
  } = data;
  if (!unit.isAlive()
    || paused
    || (!includeUserUnit && isPlayingPlayer(unit.owner.handle))
    || unit.paused
  ) {
    return Priority.LOW;
  }

  const distance = Distance(unit, position);
  const idle = isUnitIdle(unit);
  let priority: Priority;

  if (distance > maxRadius) { // unit too far from guard area
    if (unit.currentOrder !== OrderId.Move) {
      unit.issueOrderAt(OrderId.Move, position.x, position.y);
    }
    priority = Priority.MEDIUM;
  } else if (distance > 50) { // unit far from guard position but still within guard area
    if ((idle || unit.currentOrder === OrderId.Move) && data.lastBusyTimeS + 1 < now) {
      unit.issueOrderAt(OrderId.Attack, position.x, position.y);
    }
    priority = Priority.HIGH;
  } else if (idle && !isAttending(unit)) { // unit is idle at guard position
    const angleDiff = angleDifference(unit.facing, angle);
    if (angleDiff > 0.1) {
      // idle unit not facing correct angle then face
      setUnitFacingWithRate(unit, angle);
      priority = Priority.HIGH;
      data.lastBusyTimeS = now;
    } else {
      // idle unit already facing correct angle then play animation if not already
      if (animation.length > 0 && data.lastAnimationSetS + 1 < data.lastBusyTimeS) {
        ResetUnitAnimation(unit.handle);
        unit.setAnimation(animation);
        data.lastAnimationSetS = now;
      }
      priority = Priority.LOW;
    }
  } else {
    priority = Priority.HIGH;
  }

  if (!idle || isAttending(unit)) {
    data.lastBusyTimeS = now;
  }

  return priority;
}

function setGuardPositionPriority(
  unit: Unit,
  newPriority: Priority,
  oldPriority: Priority,
): void {
  if (newPriority === oldPriority) return;
  unitPositions[newPriority].set(unit, unitPositions[oldPriority].get(unit));
  unitPositions[oldPriority].delete(unit);
}

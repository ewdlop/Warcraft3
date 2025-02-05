import { playerBlackTurban } from 'lib/constants';
import { generateFogLocsBehindTrees } from 'lib/destructable';
import {
  centerLocRect, currentLoc, Distance, isLocInRect, Loc,
} from 'lib/location';
import { log } from 'lib/log';
import { dialogue } from 'lib/quests/dialogue_sound';
import { notifyEventCompleted } from 'lib/quests/quest_log';
import { neutralHostileMap } from 'lib/resources/neutral_hostile';
import {
  UNIT_Assassin, UNIT_Bandit, UNIT_BanditLord, UNIT_Brigand, UNIT_Enforcer, UNIT_Rogue,
  UNIT_TYPE,
} from 'lib/resources/war3-units';
import { playSpeech } from 'lib/sound';
import { guardCurrentPosition, removeGuardPosition, setGuardPosition } from 'lib/systems/unit_guard_position';
import { getTimeS } from 'lib/trigger';
import {
  BUFF_ID_GENERIC, getUnitsInRangeOfLoc, getUnitsInRect, getUnitsOfPlayer,
} from 'lib/unit';
import {
  pickRandom, pickRandomWeighted, shuffleArray, waitUntil,
} from 'lib/utils';
import { MapPlayer, sleep, Unit } from 'w3ts';
import { OrderId } from 'w3ts/globals';

import { BaseQuest, BaseQuestProps } from '../base';

const banditTypes: [UNIT_TYPE, number][] = [
  UNIT_Bandit,
  UNIT_Brigand,
  UNIT_Rogue,
  UNIT_Assassin,
  UNIT_Enforcer,
  UNIT_BanditLord,
].map((u) => [u, 1000 / neutralHostileMap.get(u.id).hp]);

const weakestBanditPower = banditTypes.reduce((acc, [{ id }]) => Math.min(acc, neutralHostileMap.get(id).hp), 9999);

const banditFirstSounds = [
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-1.mp3',
    'Black Turban\'s bandit',
    'You thought you could wipe out one of our camps and face no consequences? The Black Turban Syndicate doesn\'t forgive, and today we avenge our fallen brothers!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-12.mp3',
    'Black Turban\'s bandit',
    'We may have failed before, but the Black Turban Syndicate\'s vengeance always finds a way—ask those we drowned in the river; they\'ll tell you we never stop.',
  ),
];

const banditAgainSounds = [
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-2.mp3',
    'Black Turban\'s bandit',
    'We\'re back, and this time we won\'t fail—consider this your final warning from the Black Turban Syndicate!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-3.mp3',
    'Black Turban\'s bandit',
    'Did you really believe you could escape our wrath? The Black Turban Syndicate always collects its debts!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-4.mp3',
    'Black Turban\'s bandit',
    'Time and time again, you\'ve slipped through our grasp, but the Black Turban Syndicate is relentless—we won\'t stop until vengeance is ours!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-5.mp3',
    'Black Turban\'s bandit',
    'You\'ve beaten us before, but the Black Turban Syndicate\'s resolve is unbreakable—we\'re here to settle this once and for all!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-6.mp3',
    'Black Turban\'s bandit',
    'No matter how many times we fall, we rise stronger—this time, you\'ll pay for every defeat you\'ve handed the Black Turban Syndicate!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-7.mp3',
    'Black Turban\'s bandit',
    'You\'ve escaped us before, but the shadows grow darker—the Black Turban Syndicate will haunt your every step until we have our revenge.',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-8.mp3',
    'Black Turban\'s bandit',
    'Every failure tightens our grip—tonight, the Black Turban Syndicate brings nightmares you can\'t escape.',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-9.mp3',
    'Black Turban\'s bandit',
    'You\'ve escaped our grasp before, but the Black Turban Syndicate will never relent—just like those who dared defy us in the past, whose screams still echo in the night!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-10.mp3',
    'Black Turban\'s bandit',
    'Your luck won\'t save you forever—the Black Turban Syndicate has a dark history with its enemies, and soon, you\'ll join the ranks of those who vanished into the shadows.',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-11.mp3',
    'Black Turban\'s bandit',
    'You\'ve escaped us too many times, but the Black Turban Syndicate never forgets—ever heard the screams of those we buried alive? Your turn is coming!',
  ),
  dialogue(
    'QuestSounds\\__refined\\black-turban\\black-turban-bandit-13.mp3',
    'Black Turban\'s bandit',
    'The Black Turban Syndicate flayed our last defector alive and left him for the vultures; your fate will be even worse.',
  ),
];
shuffleArray(banditAgainSounds);

const chaseRange = 5000;
const debug = false;

export class BlackTurban extends BaseQuest {
  static globalDisableCount = 0;

  static disable(): void {
    this.globalDisableCount++;
  }

  static enable(): void {
    this.globalDisableCount--;
  }

  constructor(public globals: BaseQuestProps & {
    banditPlayer: MapPlayer
    victimPlayer: MapPlayer
    banditHomeEntranceRect: rect
    banditHomeRect: rect
    safeRects: rect[]
  }) {
    super(globals);
    void this.register();
  }

  private async register(): Promise<void> {
    getUnitsInRect(gg_rct_Black_turban_base, (u) => u.owner === playerBlackTurban)
      .forEach((u) => {
        u.acquireRange = 1500;
        guardCurrentPosition(u);
      });

    const banditKing = Unit.fromHandle(gg_unit_n007_0901);

    await this.waitDependenciesDone();
    await sleep(60);

    const {
      banditPlayer, victimPlayer, safeRects,
    } = this.globals;

    const isUnsafeLoc = (loc: Loc): boolean => safeRects.every((rect) => !isLocInRect(loc, rect));

    void waitUntil(1, () => {
      if (!banditKing.isAlive()) {
        notifyEventCompleted('Black Turban Syndicate has been destroyed. They will no longer attack you at night.');
      }
      return !banditKing.isAlive();
    });

    for (let attempt = 0; banditKing.isAlive(); attempt++) {
      let victim: Unit;

      // Wait until night before finding victim
      debug && log('find victim');
      debug && log('safeRects.length', safeRects.length);
      await waitUntil(10, () => {
        if (!banditKing.isAlive()) return true;
        if (BlackTurban.globalDisableCount > 0) return false;
        if (!isNightTime()) return false;
        if (victimPlayer.isPlayerAlly(banditPlayer)) return false;

        debug && log('check candidate victims');
        const victimUnits = getUnitsOfPlayer(
          victimPlayer,
          (u) => u.isAlive() && !u.invulnerable && isUnsafeLoc(u),
        );
        if (victimUnits.length === 0) return false;
        victim = pickRandom(victimUnits);
        debug && log('found candidate victim', victim.name);

        if (generateFogLocsBehindTrees(1000, victim, victim.owner, 3, isUnsafeLoc).length >= 3) {
          return true;
        }
        debug && log('candidate victim doesnt have any nearby unsafe loc', victim.name);
        return false;
      });
      if (!banditKing.isAlive()) break;

      debug && log('found victim');

      // victim is found
      victim.shareVision(banditPlayer, true);

      // Calculate power of nearby enemies
      const victimNearbyAllies = getUnitsInRangeOfLoc(
        1500,
        victim,
        (u) => u.isAlive() && u.owner === victimPlayer,
      );
      const victimTotalPower = victimNearbyAllies.reduce((acc, u) => acc + u.maxLife, 0);

      // Start the bandit squad attack
      const attackTimeS = getTimeS();

      const bandits: Unit[] = [];
      let squadTotalPower = 0;
      const squadDesiredPower = Math.min(10000, victimTotalPower * GetRandomReal(1, 2.5));
      const locs: Loc[] = [];

      while (squadTotalPower < squadDesiredPower) {
        if (locs.length === 0) {
          locs.push(...generateFogLocsBehindTrees(1000, victim, victim.owner, 3, isUnsafeLoc));
        }

        if (locs.length > 0) {
          const banditType = pickRandomWeighted(banditTypes);
          const banditPower = neutralHostileMap.get(banditType.id).hp;

          if (banditPower + squadTotalPower > squadDesiredPower + weakestBanditPower * 2) {
            continue;
          }

          const loc = locs.pop();
          const bandit = Unit.create(banditPlayer, pickRandomWeighted(banditTypes).id, loc.x, loc.y);
          bandits.push(bandit);
          setGuardPosition(bandit, victim, 0);
          squadTotalPower += bandit.maxLife;
        } else {
          await sleep(1);
        }
      }

      // All bandits have same movement speed
      const avgSpeed = bandits.reduce((acc, u) => acc + u.moveSpeed, 0) / bandits.length;
      bandits.forEach((u) => u.moveSpeed = avgSpeed);

      // Leader speech
      const leader = bandits.reduce((best, u) => (best.level > u.level ? best : u));
      const banditSound = attempt < banditFirstSounds.length
        ? banditFirstSounds[attempt]
        : banditAgainSounds[attempt % banditAgainSounds.length];
      void waitUntil(1, () => {
        if (Distance(leader, victim) < 700) {
          void playSpeech(leader, banditSound);
          return true;
        }
        return false;
      }, 20);

      void this.handleBanditAttack(bandits, victim);

      await waitUntil(2, () => getTimeS() - attackTimeS > 120);
    }
  }

  async handleBanditAttack(bandits: Unit[], victim: Unit): Promise<void> {
    const {
      banditHomeEntranceRect, banditHomeRect,
    } = this.globals;

    // Make sure stucked bandits are eventually dead
    const initLocs = new Map(bandits.map((u) => [u, currentLoc(u)]));
    let bandits1 = bandits;
    void waitUntil(5, (idx) => {
      if (idx === 0) return false;
      bandits1.forEach((u) => {
        if (Distance(u, initLocs.get(u)) < 100) {
          u.applyTimedLife(BUFF_ID_GENERIC, 30);
        } else {
          u.cancelTimedLife();
        }
      });
      bandits1 = bandits1.filter((u) => u.isAlive());
      return bandits1.length === 0;
    });

    // Wait until either victim is dead,
    // or bandit squad is all dead or lost target
    await waitUntil(1, () => {
      let banditRetreats = true;
      for (const bandit of bandits) {
        if (bandit.isAlive() && Distance(bandit, victim) < chaseRange) {
          banditRetreats = false;
        }
        if (!bandit.isAlive()) {
          removeGuardPosition(bandit);
        }
      }
      return (!victim.isAlive() || banditRetreats);
    });

    // Alive bandits go home
    let aliveBandits = bandits.filter((u) => u.isAlive());
    if (aliveBandits.length > 0) {
      const banditEntrance = centerLocRect(banditHomeEntranceRect);
      const banditHome = centerLocRect(banditHomeRect);

      aliveBandits.forEach((u) => {
        u.issueImmediateOrder(OrderId.Stop);
        setGuardPosition(u, banditEntrance, 0);
      });

      // Remove bandit when they reach home
      for (;;) {
        await sleep(1);
        let someReached = false;
        for (const bandit of aliveBandits) {
          if (isLocInRect(bandit, banditHomeEntranceRect)) {
            setGuardPosition(bandit, banditHome, 0);
          }
          if (isLocInRect(bandit, banditHomeRect)) {
            bandit.destroy();
            someReached = true;
          }
        }
        if (someReached) {
          aliveBandits = aliveBandits.filter((u) => u.isAlive());
        }
        if (aliveBandits.length === 0) {
          break;
        }
      }
    }
  }
}

function isNightTime(): boolean {
  return GetTimeOfDay() < 6 || GetTimeOfDay() > 18;
}

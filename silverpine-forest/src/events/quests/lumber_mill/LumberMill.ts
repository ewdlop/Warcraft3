import { TalkGroup } from 'events/talk_group';
import { mainPlayer, playerForsaken } from 'lib/constants';
import {
  AngleBetweenLocs,
  centerLocRect,
  DistanceBetweenLocs, isLocInRect, Loc, PolarProjection,
  randomLocRect,
  templocation,
} from 'lib/location';
import { setAllianceState2Way } from 'lib/player';
import { createDialogSound } from 'lib/quests/dialogue_sound';
import {
  QuestLog,
} from 'lib/quests/quest_log';
import { UNIT_Ghoul, UNIT_Peasant } from 'lib/resources/war3-units';
import { guardCurrentPosition, pauseGuardPosition, setGuardPosition } from 'lib/systems/unit_guard_position';
import { setAttention } from 'lib/systems/unit_interaction';
import { setTimeout } from 'lib/trigger';
import { waitUntil } from 'lib/utils';
import {
  sleep, Unit,
} from 'w3ts';
import { OrderId } from 'w3ts/globals';

import { BaseQuest, BaseQuestProps } from '../base_quest';

const questName = 'Lumber Mill';
const questDescription = 'Go to lumber mill';
const questIcon = 'ReplaceableTextures\\CommandButtons\\BTNHumanLumberMill.blp';
const questItems = [
  'Find the southwest lumber mill',
  'Collect at least 750 lumbers',
  'Bring back the lumbers to John & Peter',
];
const rewardXp = 600;

let johnIntro: sound;
let peterIntro: sound;
let peterOutro1: sound;
let johnOutro1: sound;
let peterOutro2: sound;
let johnOutro2: sound;

export class LumberMill extends BaseQuest {
  constructor(public globals: BaseQuestProps & {
    john: Unit
    peter: Unit
    lumberMillCorpse1Rect: rect
    lumberMillCorpse2Rect: rect
    townRect1: rect
    townRect2: rect
    townKnight: Unit
  }) {
    super(globals);
    // John: ElevenLabs - Liam
    // Peter: ElevenLabs - Eric
    johnIntro = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-john-intro.mp3',
      'Villager John',
      "Ugh, we're never gonna fix this wheelbarrow without more lumber! The lumberjack team should've brought back wood hours ago.",
    );
    peterIntro = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-peter-intro.mp3',
      'Villager Peter',
      "Something's not right. Could you head southwest to the lumber mill and see what's taking so long? We really need that wood.",
    );

    peterOutro1 = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-peter-outro-1.mp3',
      'Villager Peter',
      "What?! The lumberjacks are dead and there's an undead base nearby? Forget the wheelbarrow, we need to report this to the army!",
    );
    johnOutro1 = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-john-outro-1.mp3',
      'Villager John',
      "Thank you for bringing the lumber, but this is far more urgent. We're heading to town right away.",
    );

    johnOutro2 = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-john-outro-2.mp3',
      'Villager John',
      'Oh my... Peter,... look at all the bodies!',
    );
    peterOutro2 = createDialogSound(
      'QuestSounds\\lumber-mill\\lumber-mill-peter-outro-2.mp3',
      'Villager Peter',
      'This... this is a massacre... We need to get out of here ... before they come back!',
    );
  }

  async register() {
    const {
      john, peter,
      lumberMillCorpse1Rect,
      lumberMillCorpse2Rect,
      townRect1,
      townRect2,
      townKnight,
    } = this.globals;
    john.name = 'Villager John';
    peter.name = 'Villager Peter';

    await this.waitDependenciesDone();

    // Wait to start
    const traveler = await this.talkToQuestGiver(john, true);

    pauseGuardPosition([john, peter], true);
    john.shareVision(traveler.owner, true);
    peter.shareVision(traveler.owner, true);

    // Setup lumber mill corpses and lumbers and ghouls
    const fleshCorpses: Unit[] = this.createCorpsesLumberMill();
    const ghouls: Unit[] = [];
    fleshCorpses.slice(0, 3).forEach((corpse) => {
      const ghoul = Unit.create(playerForsaken, UNIT_Ghoul.id, corpse.x, corpse.y, GetRandomDirectionDeg());
      guardCurrentPosition(ghoul, 1000, 'stand channel');
      ghouls.push(ghoul);
    });
    setAllianceState2Way(mainPlayer, playerForsaken, 'enemy');

    // Create lumber bundles
    CreateItemLoc(FourCC('lmbr'), templocation(GetRandomLocInRect(lumberMillCorpse1Rect)));
    CreateItemLoc(FourCC('lmbr'), templocation(GetRandomLocInRect(lumberMillCorpse1Rect)));
    CreateItemLoc(FourCC('lmbr'), templocation(GetRandomLocInRect(lumberMillCorpse2Rect)));

    async function getCloserToTraveler(unit: Unit) {
      const dest = PolarProjection(traveler, 200, AngleBetweenLocs(traveler, unit));
      unit.issueOrderAt(OrderId.Move, dest.x, dest.y);
      await waitUntil(0.234, () => DistanceBetweenLocs(unit, dest) <= 50);
      setAttention(unit, traveler);
    }

    getCloserToTraveler(john);
    getCloserToTraveler(peter);

    const talkGroup = new TalkGroup([john, peter, traveler]);
    await talkGroup.speak(john, johnIntro, traveler);
    await talkGroup.speak(peter, peterIntro, traveler);
    talkGroup.finish();

    pauseGuardPosition([john, peter], false);

    const questLog = await QuestLog.create({
      name: questName,
      description: questDescription,
      icon: questIcon,
      items: questItems,
    });

    // Wait player to reach lumber mill
    await waitUntil(0.456, () => isLocInRect(traveler, lumberMillCorpse1Rect) || isLocInRect(traveler, lumberMillCorpse2Rect));
    setTimeout(1, () => {
      ghouls.forEach((u) => u.issueTargetOrder(OrderId.Attack, traveler));
    });

    await questLog.completeItem(0);

    // Wait player to have enough lumber
    await waitUntil(0.213, () => traveler.owner.getState(PLAYER_STATE_RESOURCE_LUMBER) >= 750);
    await questLog.completeItem(1);

    // Wait player to return
    await this.waitForTurnIn(peter);
    ghouls.forEach((u) => { u.isAlive() && u.destroy(); });
    setAllianceState2Way(mainPlayer, playerForsaken, 'neutral');

    // John and Peter's dialogues after hearing the news
    getCloserToTraveler(john);
    getCloserToTraveler(peter);
    await talkGroup.speak(peter, peterOutro1, traveler);
    await talkGroup.speak(john, johnOutro1, traveler);
    talkGroup.finish();

    await sleep(0.5);
    setAttention(john, peter);
    setAttention(peter, john);

    traveler.addExperience(rewardXp, true);
    await questLog.completeWithRewards([
      `${rewardXp} experience`,
    ]);

    // John and Peter travel to checkpoint 1 then look at Lumber Mill
    async function travelToRect(unit: Unit, rect: rect, facingLoc: Loc) {
      await sleep(GetRandomReal(0, 0.5));
      const dest = centerLocRect(rect);
      setGuardPosition(unit, dest, AngleBetweenLocs(dest, facingLoc));
      await waitUntil(1, () => isLocInRect(unit, rect));
      setGuardPosition(unit, unit, AngleBetweenLocs(unit, facingLoc));
    }

    const lumberMillLoc = centerLocRect(lumberMillCorpse2Rect);

    await Promise.all([
      travelToRect(john, townRect1, lumberMillLoc),
      travelToRect(peter, townRect1, lumberMillLoc),
    ]);
    await talkGroup.speak(john, johnOutro2, undefined, false);
    await talkGroup.speak(peter, peterOutro2, undefined, false);
    talkGroup.finish();

    // Continue to travel to town
    await Promise.all([
      travelToRect(john, townRect2, townKnight),
      travelToRect(peter, townRect2, townKnight),
    ]);
    this.complete();
  }

  createCorpsesLumberMill() {
    const { lumberMillCorpse1Rect, lumberMillCorpse2Rect } = this.globals;

    const fleshCorpses: Unit[] = [];
    [
      lumberMillCorpse1Rect,
      lumberMillCorpse2Rect,
    ].forEach((rect) => {
      for (let i = 0; i < 3; i++) {
        fleshCorpses.push(Unit.fromHandle(
          CreatePermanentCorpseLocBJ(bj_CORPSETYPE_FLESH, UNIT_Peasant.id, Player(1), templocation(GetRandomLocInRect(rect)), GetRandomDirectionDeg()),
        ));
      }
      CreatePermanentCorpseLocBJ(bj_CORPSETYPE_BONE, UNIT_Peasant.id, Player(1), templocation(GetRandomLocInRect(rect)), GetRandomDirectionDeg());
    });
    return fleshCorpses;
  }

  onForceComplete() {
    const {
      john, peter,
      townRect2,
      townKnight,
    } = this.globals;

    const loc = randomLocRect(townRect2);
    john.setPosition(loc.x, loc.y);
    peter.setPosition(loc.x, loc.y);
    setGuardPosition(john, loc, AngleBetweenLocs(loc, townKnight));
    setGuardPosition(peter, loc, AngleBetweenLocs(loc, townKnight));
    setAttention(john, townKnight);
    setAttention(peter, townKnight);
    this.createCorpsesLumberMill();
  }
}
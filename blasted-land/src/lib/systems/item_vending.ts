import { colorize } from 'lib/colorize';
import { playerMain } from 'lib/constants';
import { MODEL_TomeOfRetrainingCaster } from 'lib/resources/war3-models';
import { buildTrigger, setTimeout } from 'lib/trigger';
import { setUnitScale, tieUnitToUnit } from 'lib/unit';
import { Effect, MapPlayer, Unit } from 'w3ts';

import { UnitInteraction } from './unit_interaction';

const dummyVendorId = FourCC('h008');

const dummyAbilities = [
  'A010', // 1
  'A011', // 2
  'A012', // 3
  'A00Y', // 4
  'A00V', // 5
  'A00W', // 6
  'A00X', // 7
  'A00Z', // 8
  'A013', // 9
  'A014', // 10
  'A015', // 11
  'A016', // 12
].map((code) => FourCC(code));

let globalGoldCost = 100;
const globalGoldCostIncrement = 50;
const errorSound = CreateSoundFromLabel('InterfaceError', false, false, false, 10, 10);

export function registerAbilitySeller(vendor: Unit, abilityIds: number[]): void {
  UnitInteraction.onStart(vendor, (buyer) => {
    if (buyer.owner !== playerMain || !buyer.owner.isPlayerAlly(vendor.owner)) {
      // don't sell to enemy or NPC
      return;
    }

    if (abilityIds.every((abilityId) => hasMaxLevelAbility(buyer, abilityId))) {
      // nothing to sell
      return;
    }

    const dummy = Unit.create(buyer.owner, dummyVendorId, vendor.x, vendor.y);
    dummy.skin = vendor.skin;
    dummy.selectionScale = 0.001;
    dummy.maxLife = vendor.maxLife;
    dummy.life = dummy.maxLife;
    dummy.color = vendor.owner.color;
    setUnitScale(dummy, 0);
    tieUnitToUnit(dummy, vendor);

    const abiMap = new Map<number, number>();

    abilityIds.forEach((abilityId, i) => {
      const dummyAbilityId = dummyAbilities[i];
      dummy.addAbility(dummyAbilityId);
      abiMap.set(dummyAbilityId, abilityId);
    });
    syncDummyToBuyer(dummy, buyer, abilityIds);

    SelectUnitForPlayerSingle(dummy.handle, buyer.owner.handle);

    // Run when dummyAbilities are casted, equivalent to buying the ability
    const learnTrigger = buildTrigger((t2) => {
      t2.registerUnitEvent(dummy, EVENT_UNIT_SPELL_EFFECT);
      t2.addCondition(() => dummyAbilities.includes(GetSpellAbilityId()));
      t2.addAction(() => {
        const dummyAbilityId = GetSpellAbilityId();
        const abilityId = abiMap.get(dummyAbilityId);

        // Check not enough gold
        if (dummy.owner.getState(PLAYER_STATE_RESOURCE_GOLD) < globalGoldCost) {
          let msg = 'Not enough gold.';
          msg = `\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n|cffffcc00${msg}|r`;
          if (MapPlayer.fromLocal() === dummy.owner) {
            ClearTextMessages();
            DisplayTimedTextToPlayer(dummy.owner.handle, 0.52, 0.96, 2.00, msg);
            StartSound(errorSound);
          }
          return;
        }

        // Charge gold
        dummy.owner.setState(PLAYER_STATE_RESOURCE_GOLD, dummy.owner.getState(PLAYER_STATE_RESOURCE_GOLD) - globalGoldCost);
        globalGoldCost += globalGoldCostIncrement;

        // Level ability up
        if (buyer.getAbility(abilityId)) {
          buyer.incAbilityLevel(abilityId);
        } else {
          buyer.addAbility(abilityId);
        }
        Effect.createAttachment(MODEL_TomeOfRetrainingCaster, buyer, 'origin').destroy();

        // Sync
        syncDummyToBuyer(dummy, buyer, abilityIds);
      });
    });

    buildTrigger((t3) => {
      t3.registerUnitEvent(dummy, EVENT_UNIT_DESELECTED);
      t3.addAction(() => {
        learnTrigger.destroy();
        dummy.destroy();
      });
    });
  });
}

function hasMaxLevelAbility(unit: Unit, abilityId: number): boolean {
  const currentAbility = unit.getAbility(abilityId);
  if (currentAbility) {
    return unit.getAbilityLevel(abilityId) >= BlzGetAbilityIntegerField(currentAbility, ABILITY_IF_LEVELS);
  }
  return false;
}

function syncDummyToBuyer(dummy: Unit, buyer: Unit, abilityIds: number[]): void {
  abilityIds.forEach((abilityId, i) => {
    const dummyAbilityId = dummyAbilities[i];
    if (!dummy.getAbility(dummyAbilityId)) {
      dummy.addAbility(dummyAbilityId);
    }

    if (hasMaxLevelAbility(buyer, abilityId)) {
      dummy.disableAbility(dummyAbilityId, true, true);
    }

    const level = buyer.getAbilityLevel(abilityId) || 0;

    // Icon
    BlzSetAbilityIcon(dummyAbilityId, BlzGetAbilityIcon(abilityId));

    // Mana cost
    const manaCost = BlzGetAbilityManaCost(abilityId, level - 1 + 1);
    dummy.setAbilityManaCost(dummyAbilityId, 1, manaCost);
    dummy.maxMana = Math.max(dummy.maxMana, manaCost);
    dummy.mana = dummy.maxMana;

    // Mana tooltip
    BlzSetAbilityTooltip(dummyAbilityId, BlzGetAbilityTooltip(abilityId, level - 1 + 1), 0);
    let extendedTooltip = `Gold cost: ${colorize.yellow(globalGoldCost)} - `;
    extendedTooltip += `Mana cost: ${colorize.sheepblue(manaCost)}\n\n`;
    extendedTooltip += BlzGetAbilityExtendedTooltip(abilityId, level - 1 + 1);
    BlzSetAbilityExtendedTooltip(dummyAbilityId, extendedTooltip, 0);
  });
}

export function registerAbilityVending(): void {
  setTimeout(0, () => {
  });
}
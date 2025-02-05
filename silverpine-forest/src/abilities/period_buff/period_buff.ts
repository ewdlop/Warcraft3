import { k0, k1 } from 'lib/debug/key_counter';
import {
  ABILITY_AbolishMagicCreep, ABILITY_AuraCommandCreep, ABILITY_AuraDevotionCreep, ABILITY_AuraEnduranceCreep,
  ABILITY_BloodlustCreep, ABILITY_FrostArmorCreepOld, ABILITY_HealCreepHigh, ABILITY_InnerFireCreep,
  ABILITY_LightningShieldCreep, ABILITY_RejuvinationCreep, ABILITY_RoarCreep, ABILITY_SpiritLink, ABILITY_TYPE,
  ABILITY_UnholyAuraCreep, ABILITY_UnholyFrenzyCreep,
} from 'lib/resources/war3-abilities';
import {
  MODEL_Brilliance, MODEL_CommandAura, MODEL_DevotionAura, MODEL_DrumsCasterHeal, MODEL_ImmolationREDTarget, MODEL_TrueshotAura, MODEL_UnholyAura, MODEL_VampiricAura,
} from 'lib/resources/war3-models';
import { setIntervalIndefinite, setTimeout } from 'lib/trigger';
import {
  createDummy, getUnitScale, setUnitScale, tieUnitToUnit,
} from 'lib/unit';
import { pickRandom } from 'lib/utils';
import { Unit } from 'w3ts';
import { OrderId } from 'w3ts/globals/order';

import {
  ABILITY_AuraBrillianceCreep, ABILITY_AuraTrueshotCreep, ABILITY_HolyLightItem, ABILITY_ImmolationCreep, ABILITY_VampiricAuraCreep,
} from '../../lib/resources/war3-abilities';

interface BaseAbility {
  ability: ABILITY_TYPE
  periodS: number
}

interface UnitTargetAbility extends BaseAbility {
  type: 'unit-target'
  orderId: OrderId
}

interface NoTargetAbility extends BaseAbility {
  type: 'no-target'
  orderId: OrderId
}

interface AuraAbility extends BaseAbility {
  type: 'aura'
  specialEffect: string
  attachmentPoint?: string
}

interface ActiveAuraTargetAbility extends BaseAbility {
  type: 'active-aura'
  orderId: OrderId
  specialEffect: string
  attachmentPoint?: string
}

const buffAbilities: (UnitTargetAbility | NoTargetAbility | AuraAbility | ActiveAuraTargetAbility)[] = [
  // Unit target
  {
    ability: ABILITY_BloodlustCreep, type: 'unit-target', orderId: OrderId.Bloodlust, periodS: 30,
  },
  {
    ability: ABILITY_HealCreepHigh, type: 'unit-target', orderId: OrderId.Heal, periodS: 30,
  },
  {
    ability: ABILITY_LightningShieldCreep, type: 'unit-target', orderId: OrderId.Lightningshield, periodS: 30,
  },
  {
    ability: ABILITY_SpiritLink, type: 'unit-target', orderId: OrderId.Spiritlink, periodS: 30,
  },
  {
    ability: ABILITY_InnerFireCreep, type: 'unit-target', orderId: OrderId.Innerfire, periodS: 30,
  },
  {
    ability: ABILITY_FrostArmorCreepOld, type: 'unit-target', orderId: OrderId.Frostarmor, periodS: 30,
  },
  {
    ability: ABILITY_UnholyFrenzyCreep, type: 'unit-target', orderId: OrderId.Unholyfrenzy, periodS: 30,
  },
  {
    ability: ABILITY_RejuvinationCreep, type: 'unit-target', orderId: OrderId.Rejuvination, periodS: 30,
  },
  {
    ability: ABILITY_AbolishMagicCreep, type: 'unit-target', orderId: OrderId.Autodispel, periodS: 30,
  },
  {
    ability: ABILITY_HolyLightItem, type: 'unit-target', orderId: OrderId.Holybolt, periodS: 30,
  },

  // No target
  {
    ability: ABILITY_RoarCreep, type: 'no-target', orderId: OrderId.Roar, periodS: 30,
  },

  // Aura
  {
    ability: ABILITY_UnholyAuraCreep, type: 'aura', specialEffect: MODEL_UnholyAura, periodS: 30,
  },
  {
    ability: ABILITY_AuraEnduranceCreep, type: 'aura', specialEffect: MODEL_CommandAura, periodS: 30,
  },
  {
    ability: ABILITY_AuraDevotionCreep, type: 'aura', specialEffect: MODEL_DevotionAura, periodS: 30,
  },
  {
    ability: ABILITY_VampiricAuraCreep, type: 'aura', specialEffect: MODEL_VampiricAura, periodS: 30,
  },
  {
    ability: ABILITY_AuraBrillianceCreep, type: 'aura', specialEffect: MODEL_Brilliance, periodS: 30,
  },
  {
    ability: ABILITY_AuraTrueshotCreep, type: 'aura', specialEffect: MODEL_TrueshotAura, periodS: 30,
  },
  {
    ability: ABILITY_AuraCommandCreep, type: 'aura', specialEffect: MODEL_DrumsCasterHeal, periodS: 30,
  },

  // Active aura
  {
    ability: ABILITY_ImmolationCreep,
    type: 'active-aura',
    orderId: OrderId.Immolation,
    specialEffect: MODEL_ImmolationREDTarget,
    periodS: 30,
    attachmentPoint: 'chest',
  },
];

export class PeriodBuff {
  private auraMap: Set<string> = new Set();

  constructor(private target: Unit) {
    setIntervalIndefinite(10, () => this.buffTarget());
  }

  buffTarget(): void {
    if (!this.target.isAlive()) {
      return;
    }

    const pickableAbilities = buffAbilities.filter((a) => !this.auraMap.has(a.ability.code));
    if (pickableAbilities.length === 0) {
      return;
    }
    k0('pb');
    const ability = pickRandom(pickableAbilities);
    switch (ability.type) {
      case 'unit-target': {
        this.buffUnitTargetAbility(ability);
        break;
      }
      case 'no-target': {
        this.buffNoTargetAbility(ability);
        break;
      }
      case 'aura': {
        this.buffAuraAbility(ability);
        break;
      }
      case 'active-aura': {
        this.buffActiveAuraAbility(ability);
        break;
      }
      default:
    }
    k1('pb');
  }

  buffUnitTargetAbility({ ability, orderId, periodS }: UnitTargetAbility): void {
    if (this.auraMap.has(ability.code)) {
      return;
    }

    k0('pb-t');
    const abilityId = ability.id;

    const dummy = createDummy(this.target.owner, this.target.x, this.target.y, this.target, 0.25);
    dummy.addAbility(abilityId);
    dummy.setAbilityLevel(abilityId, ability.levels);
    dummy.issueTargetOrder(orderId, this.target);

    this.auraMap.add(ability.code);
    setTimeout(periodS, () => {
      this.auraMap.delete(ability.code);
      k1('pb-t');
    });
  }

  buffNoTargetAbility({ ability, orderId, periodS }: NoTargetAbility): void {
    if (this.auraMap.has(ability.code)) {
      return;
    }
    k0('pb-nt');

    const abilityId = ability.id;

    const dummy = createDummy(this.target.owner, this.target.x, this.target.y, this.target, 0.25);
    dummy.addAbility(abilityId);
    dummy.setAbilityLevel(abilityId, ability.levels);
    dummy.issueImmediateOrder(orderId);

    this.auraMap.add(ability.code);
    setTimeout(periodS, () => {
      this.auraMap.delete(ability.code);
      k1('pb-nt');
    });
  }

  buffAuraAbility({ ability, periodS }: AuraAbility): void {
    if (this.auraMap.has(ability.code)) {
      return;
    }

    k0('pb-a');
    const abilityId = ability.id;

    const dummy = createDummy(this.target.owner, this.target.x, this.target.y, this.target, periodS);
    const scale = getUnitScale(this.target);
    setUnitScale(dummy, scale);
    dummy.addAbility(abilityId);
    dummy.setAbilityLevel(abilityId, ability.levels);
    tieUnitToUnit(dummy, this.target);

    this.auraMap.add(ability.code);
    setTimeout(periodS, () => {
      this.auraMap.delete(ability.code);
      k1('pb-a');
    });
  }

  buffActiveAuraAbility({ ability, orderId, periodS }: ActiveAuraTargetAbility): void {
    if (this.auraMap.has(ability.code)) {
      return;
    }

    k0('pb-aa');

    const abilityId = ability.id;

    const dummy = createDummy(this.target.owner, this.target.x, this.target.y, this.target, periodS);
    dummy.addAbility(abilityId);
    const scale = getUnitScale(this.target);
    setUnitScale(dummy, scale);
    dummy.setAbilityLevel(abilityId, ability.levels);
    tieUnitToUnit(dummy, this.target);
    dummy.issueImmediateOrder(orderId);

    this.auraMap.add(ability.code);
    setTimeout(periodS, () => {
      this.auraMap.delete(ability.code);
      k1('pb-aa');
    });
  }
}

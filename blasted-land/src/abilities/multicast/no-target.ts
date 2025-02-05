import { k0, k1 } from 'lib/debug/key_counter';
import { PolarProjection } from 'lib/location';
import { ABILITY_BladeMasterBladestorm } from 'lib/resources/war3-abilities';
import { getSpellType } from 'lib/spell';
import { buildTrigger, setTimeout } from 'lib/trigger';
import {
  createDummy, getUnitScale, growUnit, isDummy,
  safeRemoveDummy,
  setUnitScale,
  transitionUnitColor,
} from 'lib/unit';
import { Timer, Trigger, Unit } from 'w3ts';
import { OrderId } from 'w3ts/globals';

function isNotMorphAbility(): boolean {
  return BlzGetAbilityStringLevelField(
    GetSpellAbility(),
    ABILITY_SLF_NORMAL_FORM_UNIT_EME1,
    GetUnitAbilityLevel(GetSpellAbilityUnit(), GetSpellAbilityId()) - 1,
  ) === '';
}

export class MulticastNoTarget {
  static Data = {
    REPEAT_CAST: 3,
  };

  static register(abilityId?: number, specificCaster?: Unit): Trigger {
    return buildTrigger((t) => {
      t.registerAnyUnitEvent(EVENT_PLAYER_UNIT_SPELL_EFFECT);
      t.addCondition(() => !isDummy(Unit.fromHandle(GetSpellAbilityUnit()))
        && getSpellType().noTarget
        && IsHeroUnitId(GetUnitTypeId(GetSpellAbilityUnit()))
        && isNotMorphAbility());
      if (abilityId) {
        t.addCondition(() => GetSpellAbilityId() === abilityId);
      }
      if (specificCaster) {
        t.addCondition(() => GetSpellAbilityUnit() === specificCaster.handle);
      }
      t.addAction(() => {
        k0('mcnt');
        const abiId = GetSpellAbilityId();
        const caster = Unit.fromHandle(GetSpellAbilityUnit());
        const ability = caster.getAbility(abiId);
        const abiLevel = caster.getAbilityLevel(abiId);
        let order = caster.currentOrder;
        if (abiId === ABILITY_BladeMasterBladestorm.id) order = OrderId.Whirlwind;

        const castPoint = caster.getField(UNIT_RF_CAST_POINT) as number;
        const castBackSwing = caster.getField(UNIT_RF_CAST_BACK_SWING) as number;

        const dummy = createDummy(caster.owner, caster.x, caster.y, caster, 999, caster.facing);
        dummy.setflyHeight(caster.getflyHeight(), 0);
        dummy.skin = caster.skin;
        const scale = getUnitScale(caster);
        setUnitScale(dummy, scale);
        dummy.setVertexColor(200, 200, 255, 128);
        dummy.setField(UNIT_RF_CAST_POINT, castPoint);
        dummy.addAbility(abiId);
        dummy.setAbilityLevel(abiId, abiLevel);
        dummy.setAbilityCooldown(abiId, abiLevel - 1, 0);
        BlzSetAbilityRealLevelField(dummy.getAbility(abiId), ABILITY_RLF_CAST_RANGE, abiLevel - 1, 99999);
        if (abiId === ABILITY_BladeMasterBladestorm.id) {
          const damagePerSec = BlzGetAbilityRealLevelField(ability, ABILITY_RLF_DAMAGE_PER_SECOND_OWW1, abiLevel - 1);
          const areaOfEffect = BlzGetAbilityRealLevelField(ability, ABILITY_RLF_AREA_OF_EFFECT, abiLevel - 1);
          BlzSetAbilityRealLevelField(dummy.getAbility(abiId), ABILITY_RLF_DAMAGE_PER_SECOND_OWW1, abiLevel - 1, damagePerSec * 2);
          BlzSetAbilityRealLevelField(dummy.getAbility(abiId), ABILITY_RLF_AREA_OF_EFFECT, abiLevel - 1, areaOfEffect * 2);
        }

        growUnit(dummy, scale * 1.5, this.Data.REPEAT_CAST * castPoint);
        const targetLoc = GetSpellTargetLoc();

        const dummyCast = (): void => {
          dummy.issueImmediateOrder(order);
        };

        let castRemain = this.Data.REPEAT_CAST;
        dummyCast();

        const fadeDuration = (castPoint + castBackSwing + 0.1);
        let tLimitDuration = 2 * (castPoint + castBackSwing) - fadeDuration;
        if (abiId === ABILITY_BladeMasterBladestorm.id) {
          tLimitDuration = BlzGetAbilityRealLevelField(ability, ABILITY_RLF_DURATION_NORMAL, abiLevel - 1) - fadeDuration;
          dummy.moveSpeed = caster.defaultMoveSpeed;
          const patrolLoc = PolarProjection(dummy, 7 * dummy.moveSpeed / 3, dummy.facing);
          dummy.issueOrderAt(OrderId.Patrol, patrolLoc.x, patrolLoc.y);
        }

        buildTrigger((t2) => {
          let tLimit = Timer.create();
          const startCleanUp = (): void => {
            t2.destroy();
            tLimit.pause();
            tLimit.destroy();
            RemoveLocation(targetLoc);
            k0('mcnt-f');
            transitionUnitColor(
              dummy,
              {
                r: 200, g: 200, b: 255, a: 128,
              },
              {
                r: 200, g: 200, b: 255, a: 0,
              },
              fadeDuration,
              () => {
                safeRemoveDummy(dummy);
                k1('mcnt-f');
              },
            );
            k1('mcnt');
          };

          tLimit.start(tLimitDuration, false, () => startCleanUp());
          t2.registerUnitEvent(dummy, EVENT_UNIT_SPELL_ENDCAST);
          t2.addAction(() => {
            tLimit.pause();
            tLimit.destroy();
            tLimit = Timer.create();
            tLimit.start(tLimitDuration, false, () => startCleanUp());
            castRemain--;
            if (castRemain > 0) {
              setTimeout(0, () => dummyCast());
            }
            if (castRemain <= 1) {
              startCleanUp();
            }
          });
        });
      });
    });
  }
}

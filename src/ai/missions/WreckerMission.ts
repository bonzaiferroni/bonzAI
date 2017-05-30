import {RaidMission} from "./RaidMission";
import {Operation} from "../operations/Operation";
import {BoostLevel, RaidData} from "../../interfaces";
import {SpawnGroup} from "../SpawnGroup";
import {RaidOperation} from "../operations/RaidOperation";
import {Agent} from "../agents/Agent";
export class WreckerMission extends RaidMission {

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = WORK;
        this.specialistBoost = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        this.spawnCost = 11090;
        this.attackRange = 1;
        this.attackerBoosts = {
            [RESOURCE_CATALYZED_ZYNTHIUM_ACID]: true,
            [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: true,
            [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: true,
            [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: true,
        };
    }

    protected attackCreeps(attacker: Agent): boolean {

        let creepTargets = _(attacker.pos.findInRange(attacker.room.hostiles, 3))
            .filter((c: Creep) => _.filter(c.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType === STRUCTURE_RAMPART).length === 0)
            .sortBy("hits")
            .value();

        if (creepTargets.length === 0) {
            return false;
        }

        let closest = attacker.pos.findClosestByRange(creepTargets);
        let range = attacker.pos.getRangeTo(closest);

        if (range === 1 || attacker.massAttackDamage() >= 10) {
            attacker.rangedMassAttack();
        } else {
            attacker.rangedAttack(closest);
        }
        return false;
    }

    protected clearActions(attackingCreep: boolean) {
        let fleeing = this.squadFlee();
        if (fleeing) { return; }

        super.clearActions(attackingCreep);
    }

}

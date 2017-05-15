import {RaidMission} from "./RaidMission";
import {Operation} from "../operations/Operation";
import {RaidData, BoostLevel, RaidActionType, RaidAction} from "../../interfaces";
import {SpawnGroup} from "../SpawnGroup";
import {Agent} from "./Agent";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "./HostileAgent";
export class FireflyMission extends RaidMission {

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = RANGED_ATTACK;
        this.specialistBoost = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        this.spawnCost = 12440;
        this.attackRange = 3;
        this.attacksCreeps = true;
        this.attackerBoosts = [
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        ];
        this.killCreeps = operation.memory.killCreeps;
    }

    protected clearActions(attackingCreep: boolean) {
        let meleeThreats = _(this.raidData.getHostileAgents(this.raidData.attackRoom.name))
            .filter(x => x.pos.inRangeTo(this.attacker, 3) || x.pos.inRangeTo(this.healer, 3))
            .filter(x => x.potentials[ATTACK] > 0)
            .sortBy(x => x.pos.getRangeTo(this.healer))
            .value();

        if (meleeThreats.length > 0) {
            if (this.attacker.fatigue > 0 || !this.attacker.pos.isNearTo(this.healer)) {
                this.attacker.travelTo(this.healer);
                return;
            }

            if (this.attacker.pos.getRangeToClosest(meleeThreats) > 2
                && this.healer.pos.getRangeToClosest(meleeThreats) > 3) {
                return;
            }

            let ret = PathFinder.search(this.healer.pos, {pos: meleeThreats[0].pos, range: 10 }, {flee: true });
            if (ret.path.length > 0) {
                this.healer.travelTo(ret.path[0]);
                this.attacker.travelTo(this.healer);
                return;
            }
        }

        this.standardClearActions(attackingCreep);
    }

    protected attackerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({ [TOUGH]: 1, [MOVE]: 2, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({ [TOUGH]: 5, [MOVE]: 25, [RANGED_ATTACK]: 20 });
        } else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({ [TOUGH]: 24, [MOVE]: 10, [RANGED_ATTACK]: 16 });
        } else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 8, [RANGED_ATTACK]: 20 });
        } else {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 10, [RANGED_ATTACK]: 28});
        }
    };

    protected focusCreeps() {
        let closest = this.attacker.pos.findClosestByRange(_.filter(this.attacker.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Source Keeper" && c.body.length > 10;
        }));
        if (closest) {
            let range = this.attacker.pos.getRangeTo(closest);
            if (range > 3) {
                Agent.squadTravel(this.attacker, this.healer, closest);
            } else if (range < 3) {
                this.squadFlee(closest);
            }
            return true;
        } else {
            return false;
        }
    }

    protected getHeadhunterAction(hostileAgents: HostileAgent[]): RaidAction {
        return {
            type: RaidActionType.Headhunter,
        };
    }
}

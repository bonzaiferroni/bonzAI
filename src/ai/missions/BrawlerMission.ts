import {RaidMission} from "./RaidMission";
import {RaidAction, RaidActionType, RaidData} from "../../interfaces";
import {SpawnGroup} from "../SpawnGroup";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "./HostileAgent";
export class BrawlerMission extends RaidMission {

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = ATTACK;
        this.specialistBoost = RESOURCE_CATALYZED_UTRIUM_ACID;
        this.spawnCost = 10550;
        this.attackRange = 1;
        this.attacksCreeps = true;
        this.attackerBoosts = [
            RESOURCE_CATALYZED_UTRIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        ];
        this.killCreeps = operation.memory.killCreeps;
    }

    public clearActions(attackingCreep: boolean) {
        this.standardClearActions(attackingCreep);
    }

    protected getHeadhunterAction(hostileAgents: HostileAgent[]): RaidAction {
        return {
            type: RaidActionType.Headhunter,
        };
    }
}

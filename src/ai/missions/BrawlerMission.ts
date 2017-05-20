import {RaidMission} from "./RaidMission";
import {RaidAction, RaidActionType, RaidData} from "../../interfaces";
import {SpawnGroup} from "../SpawnGroup";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "../agents/HostileAgent";
import {helper} from "../../helpers/helper";
export class BrawlerMission extends RaidMission {

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = ATTACK;
        this.specialistBoost = RESOURCE_CATALYZED_UTRIUM_ACID;
        this.spawnCost = 10550;
        this.attackRange = 1;
        this.attackerBoosts = [
            RESOURCE_CATALYZED_UTRIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        ];
        this.braveMode = true;
    }

    protected clearActions(attackingCreep: boolean) {
        let fleeing = this.squadFlee();
        if (fleeing) { return; }

        return super.clearActions(attackingCreep);
    }

    protected getHeadhunterAction(hostileAgents: HostileAgent[]): RaidAction {
        let nearest = this.attacker.pos.findClosestByRange(hostileAgents);
        if (!nearest) { return; }

        return {
            type: RaidActionType.Headhunter,
            id: nearest.id,
        };
    }
}

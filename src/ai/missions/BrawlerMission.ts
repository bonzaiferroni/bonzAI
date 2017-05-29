import {RaidMission} from "./RaidMission";
import {RaidAction, RaidActionType, RaidData} from "../../interfaces";
import {SpawnGroup} from "../SpawnGroup";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "../agents/HostileAgent";
import {helper} from "../../helpers/helper";
export class BrawlerMission extends RaidMission {

    constructor(operation: RaidOperation, name: string) {
        super(operation, name);
        this.specialistPart = ATTACK;
        this.specialistBoost = RESOURCE_CATALYZED_UTRIUM_ACID;
        this.spawnCost = 10550;
        this.attackRange = 1;
        this.attackerBoosts = {
            [RESOURCE_CATALYZED_UTRIUM_ACID]: true,
            [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: true,
            [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: true,
            [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: true,
        };
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

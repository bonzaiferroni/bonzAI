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

    protected clearActions() {
        let fleeing = this.squadFlee();
        if (fleeing) { return; }

        super.clearActions();
    }

}

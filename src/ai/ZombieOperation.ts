import {Operation} from "./operations/Operation";
import {Empire} from "./Empire";
import {OperationPriority} from "../config/constants";
import {ZombieMission} from "./ZombieMission";
export class ZombieOperation extends Operation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.Low;
    }

    initOperation() {
        this.spawnGroup = this.getRemoteSpawnGroup(4, 8);
        if (!this.spawnGroup) return;
        this.addMission(new ZombieMission(this));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}
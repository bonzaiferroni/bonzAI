import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {OperationPriority} from "../../config/constants";
import {ZombieMission} from "../missions/ZombieMission";
export class ZombieOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
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
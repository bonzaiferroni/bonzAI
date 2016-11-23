import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {TransportMission} from "./TransportMission";
export class TransportOperation extends Operation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
    }

    initOperation() {
        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
        this.findOperationWaypoints();

        let max = this.memory.max !== undefined ? this.memory.max : 1;
        this.addMission(new TransportMission(this, max, undefined, undefined, this.memory.resourceType, this.memory.offRoad));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}
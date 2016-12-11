import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {OperationPriority} from "./constants";
import {HarvestMission} from "./HarvestMission";
export class BaseOperation extends Operation {

    // create our constructor (this is boilerplate and will be nearly the same for every operation)
    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom
    }

    initOperation() {
        // instantiate our mission
        this.addMission(new HarvestMission(this))
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

}
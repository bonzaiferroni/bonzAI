import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {DemolishMission} from "../missions/DemolishMission";
import {empire} from "../../helpers/loopHelper";
export class DemolishOperation extends Operation {

    /**
     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove the
     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful.
     * To have it spawn a scavanger to harvest energy, place a flag with name "opName_store" over a container/storage/terminal
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
    }

    initOperation() {
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);

        this.addMission(new DemolishMission(this));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }
}
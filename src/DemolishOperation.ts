import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {DemolishMission} from "./DemolishMission";
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

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
    }

    initOperation() {
        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);

        let storeStructure = this.checkStoreStructure();
        this.addMission(new DemolishMission(this, this.memory.potency, storeStructure, this.memory.enableDemo));
    }

    finalizeOperation() {
    }

    invalidateOperationCache() {
    }

    private checkStoreStructure(): StructureContainer | StructureStorage | StructureTerminal {

        let flag = Game.flags[`${this.name}_store`];
        if (flag && flag.room) {
            let storeStructure = _(flag.pos.lookFor(LOOK_STRUCTURES))
                .filter((s: any) => s.store !== undefined)
                .head() as StructureContainer | StructureStorage | StructureTerminal;
            if (storeStructure) return storeStructure;
        }
    }
}
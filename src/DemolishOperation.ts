import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {DemolishMission} from "./DemolishMission";
export class DemolishOperation extends Operation {

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
        if (this.memory.storeId) {
            let storeStructure = Game.getObjectById(this.memory.storeId) as StructureContainer | StructureTerminal | StructureStorage;
            if (storeStructure) {
                return storeStructure;
            }
            else {
                this.memory.storeId = undefined;
                console.log("couldn't find storeStructure for", this.name, ", removing cached reference");
            }
        }
    }
}
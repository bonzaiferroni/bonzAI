import {Operation, OperationMemory} from "./Operation";
import {OperationPriority, USERNAME} from "../../config/constants";
import {CombatMission} from "../missions/CombatMission";
import {empire} from "../Empire";
import {Viz} from "../../helpers/Viz";
import {PeaceMission} from "../missions/PeaceMission";

export interface PeaceCommander {
}

interface PeaceOperationMemory extends OperationMemory {
}

export class PeaceOperation extends Operation {

    public memory: PeaceOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.VeryLow;
    }

    protected init() {
        if (!Memory.peaceCommander) { Memory.peaceCommander = {}; }

        this.updateRemoteSpawn(8, 500);
        let foundSpawn = this.assignRemoteSpawn();
        if (!foundSpawn) { return; }

        this.addMission(new PeaceMission(this, Memory.peaceCommander));
    }

    protected update() {
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }
}

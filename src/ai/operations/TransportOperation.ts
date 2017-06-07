
import {Operation} from "./Operation";
import {TransportMission} from "../missions/TransportMission";
import {OperationPriority} from "../../config/constants";
import {empire} from "../Empire";

export class TransportOperation extends Operation {

    public memory: any;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public init() {
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);

        let max = this.memory.max !== undefined ? this.memory.max : 1;
        this.addMission(new TransportMission(this, max, undefined, undefined, this.memory.resourceType,
            this.memory.offRoad));
    }

    public update() { }

    public finalize() {
    }

    public invalidateCache() {
    }

}

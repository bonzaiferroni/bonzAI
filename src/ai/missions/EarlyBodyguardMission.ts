import {BodyguardMission} from "./BodyguardMission";
import {Operation} from "../operations/Operation";
export class EarlyBodyguardMission extends BodyguardMission {

    constructor(operation: Operation) {
        super(operation, operation.roomName);
    }

    protected maxBodyguards = () => {
        if (this.room.findStructures(STRUCTURE_TOWER).length === 0) {
            return 1;
        } else {
            return 0;
        }
    };
}
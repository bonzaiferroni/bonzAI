import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {OperationPriority} from "../../config/constants";

export class RaidOperation extends Operation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.VeryHigh;
    }

    initOperation() {

    }

    invalidateOperationCache() {
    }

    finalizeOperation() {
    }
}
import {Operation} from "./Operation";
import {OperationPriority} from "../../config/constants";
export class SwapOperation extends Operation {

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public initOperation() {
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }

}
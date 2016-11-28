import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {NightsWatchMission} from "./NightsWatchMission";
import {OperationPriority} from "./constants";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";
export class FlexOperation extends ControllerOperation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    protected repairWalls() {
        if (this.flag.room.findStructures(STRUCTURE_RAMPART).length > 0 && !this.memory.noMason) {
            this.addMission(new BuildMission(this, "mason", this.calcMasonPotency()));
        }
    }

    protected addDefense() {
        this.addMission(new NightsWatchMission(this));
    }

    protected allowedCount(structureType: string, level: number): number {
        return undefined;
    }

    protected findStructureCount(structureType: string): number {
        return undefined;
    }

    protected layoutCoords(structureType: string): Coord[] {
        return undefined;
    }

    protected temporaryPlacement(controllerLevel: number) {
    }
}
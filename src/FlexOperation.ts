import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
export class FlexOperation extends ControllerOperation {

    protected repairWalls() {
    }

    protected addDefense() {
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
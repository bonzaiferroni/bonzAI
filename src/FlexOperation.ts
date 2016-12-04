import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {DefenseMission} from "./DefenseMission";
import {OperationPriority} from "./constants";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";
import {FlexGenerator} from "./FlexGenerator";

export class FlexOperation extends ControllerOperation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    protected repairStructures() {
        if (this.flag.room.findStructures(STRUCTURE_RAMPART).length > 0 && !this.memory.noMason) {
            this.addMission(new BuildMission(this, "mason", this.calcMasonPotency()));
        }
    }

    protected addDefense() {
        this.addMission(new DefenseMission(this));
    }

    protected temporaryPlacement(controllerLevel: number) {
    }

    protected initAutoLayout() {
        this.staticLayout = FlexGenerator.staticStructures;

        if(!this.memory.layoutMap) {

            if (this.memory.flexLayoutMap) {
                // temporary patch for variable identifier change
                this.memory.layoutMap = this.memory.flexLayoutMap;
                this.memory.radius = this.memory.flexRadius;
            }
            else {
                let map = new FlexGenerator(this.memory.centerPosition, this.memory.rotation);
                this.memory.layoutMap = map.generate(true);
                this.memory.radius = map.radius + 1;
            }
        }
    }
}
import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {NightsWatchMission} from "./NightsWatchMission";
import {OperationPriority} from "./constants";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";
import {FlexGenerator} from "./FlexGenerator";

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
        if (!this.memory.flexLayoutMap) {
            this.buildFlexLayoutMap()
        }

        if (level < 3 && (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_WALL)) {
            return 0;
        }

        return Math.min(CONTROLLER_STRUCTURES[structureType][level], this.layoutCoords(structureType).length)
    }

    protected findStructureCount(structureType: string): number {
        let centerPosition = new RoomPosition(this.memory.centerPosition.x, this.memory.centerPosition.y, this.flag.room.name);

        let constructionCount = centerPosition.findInRange(FIND_MY_CONSTRUCTION_SITES, this.memory.flexRadius,
            {filter: (c: ConstructionSite) => c.structureType === structureType}).length;
        let count = _.filter(this.flag.room.findStructures(structureType),
                (s: Structure) => { return centerPosition.inRangeTo(s, this.memory.flexRadius)}).length + constructionCount;

        return count;
    }

    protected layoutCoords(structureType: string): Coord[] {
        if (FlexGenerator.staticStructures[structureType]) {
            return FlexGenerator.staticStructures[structureType]
        }
        else if (this.memory.flexLayoutMap[structureType]) {
            return this.memory.flexLayoutMap[structureType];
        }
        else {
            return [];
        }
    }

    protected temporaryPlacement(controllerLevel: number) {
    }

    private buildFlexLayoutMap() {

        let map = new FlexGenerator(this.memory.centerPosition, this.memory.rotation);

        this.memory.flexLayoutMap = map.generate(true);
        this.memory.flexRadius = map.radius + 1;
    }
}
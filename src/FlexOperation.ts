import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {NightsWatchMission} from "./NightsWatchMission";
import {OperationPriority} from "./constants";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";

const WALL_ALLOWANCE = 1;

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

        return 0;

        /*
        let allowedCount = this.findAllowedCount();

        if (allowedCount[structureType]) {
            // override amounts that aren't really limited
            return allowedCount[structureType][level]
        }
        else if (this.layoutMap[structureType]) {
            // build max structures for all others included in layout map
            return CONTROLLER_STRUCTURES[structureType][this.flag.room.controller.level];
        }
        else {
            // do not autobuild the rest (extractor, containers, links, etc.)
            return 0;
        }
        */
    }

    protected findStructureCount(structureType: string): number {
        return 0;
    }

    protected layoutCoords(structureType: string): Coord[] {
        return [];

        /*
        if (this.memory.flexLayoutMap[structureType]) {
            return this.memory.flexLayoutMap[structureType];
        }
        else if (this.layoutMap[structureType]) {
            return this.layoutMap[structureType];
        }
        else {
            return [];
        }
        */
    }

    protected temporaryPlacement(controllerLevel: number) {
    }

    private findAllowedCount() {
        let totalWallCount = this.layoutCoords(STRUCTURE_WALL).length;
    }

    layoutMap = {
        [STRUCTURE_STORAGE]: [{x: 0, y: -3}],
        [STRUCTURE_TERMINAL]: [{x: -2, y: -1}],
        [STRUCTURE_SPAWN]: [{x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: -3}],
        [STRUCTURE_NUKER]: [{x: 3, y: 0}],
        [STRUCTURE_POWER_SPAWN]: [{x: 0, y: -3}],
        [STRUCTURE_LAB]: [
            {x: 1, y: 0}, {x: 2, y: 1}, {x: 0, y: 1},
            {x: 1, y: 2}, {x: 2, y: 0}, {x: 0, y: 2},
            {x: 0, y: -1}, {x: -1, y: 0}, {x: 1, y: -1}, {x: -1, y: 1},],
    };

    private buildFlexLayoutMap() {
        // spawns
        // extensions
        // towers
        // roads
        // ramparts
        // constructedWall

        let map = new PositionMap();
        this.addFixedStructuresToMap(map);

        // place stems
        let xBoundaryReached;
        let yBoundaryReached;
        let towersRemaining = 6;
        let extensionsRemaining = 60;
        let observersRemaining = 1;
        let radius = 0;
        while (towersRemaining + observersRemaining + extensionsRemaining > 0) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                let x = this.memory.centerPoint.x + xDelta;
                if (x < 3 || x > 46) {
                    if (xBoundaryReached === undefined) {
                        xBoundaryReached = xDelta;
                    }
                    continue;
                }

                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    // only consider points on perimeter of gradually expanding square
                    if (Math.abs(yDelta) !== radius && Math.abs(xDelta) !== radius) continue;

                    let y = this.memory.centerPoint.y + yDelta;
                    if (y < 3 || y > 46) {
                        if (yBoundaryReached === undefined) {
                            yBoundaryReached = yDelta;
                        }
                        continue;
                    }

                    // already being used
                    if (map.checkIfUsed(x, y)) continue;

                    let position = new RoomPosition(x, y, this.flag.room.name);
                    if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;

                    let foundStructurePos = false;
                    let combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
                    if (combinedDeviance % 2 !== 0 ) {
                        foundStructurePos = true;
                    }
                    else if (x % 2 === 0 && combinedDeviance % 4 !== 0) {
                        foundStructurePos = true;
                    }

                    if (foundStructurePos) {
                        if (towersRemaining > 0) {
                            map.add(x, y, STRUCTURE_TOWER);
                            towersRemaining--;
                        }
                        else if (extensionsRemaining > 0) {
                            map.add(x, y, STRUCTURE_EXTENSION);
                            extensionsRemaining--;
                        }
                        else if (observersRemaining > 0) {
                            map.add(x, y, STRUCTURE_OBSERVER);
                            observersRemaining--;
                        }
                        else {
                            // do nothing
                        }
                    }
                    else {
                        map.add(x, y, STRUCTURE_ROAD);
                    }
                }
            }
            radius++;
        }

        for (let x in map.map) {
            for (let y in map.map[x]) {
                let structureType = map.map[x][y];
                let position = new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.flag.room.name);
                let color = COLOR_GREY;
                if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN || structureType === STRUCTURE_STORAGE) {
                    color = COLOR_YELLOW;
                }
                else if (structureType === STRUCTURE_TOWER || structureType === STRUCTURE_LAB) {
                    color = COLOR_CYAN;
                }
                else if (structureType === STRUCTURE_POWER_SPAWN) {
                    color = COLOR_RED;
                }
                else if (structureType === STRUCTURE_OBSERVER) {
                    color = COLOR_GREEN;
                }
                position.createFlag("layout_" + x + y + structureType, color);
            }
        }

        this.memory.flexLayoutMap = {};

        // place walls

    }

    private addFixedStructuresToMap(map: PositionMap) {

        this.layoutMap[STRUCTURE_ROAD] = [
            {x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}, {x: -1, y: -1}, {x: -2, y: -2},
            {x: -2, y: 0}, {x: 0, y: -2}, {x: 0, y: -4}, {x: 1, y: -3}, {x: 2, y: -2},
            {x: 3, y: -1}, {x: 4, y: 0}, {x: 3, y: 1}, {x: 1, y: 3}, {x: 0, y: 4},
            {x: -1, y: 3}, {x: -3, y: 1}, {x: -4, y: 0}, {x: -3, y: -1}, {x: -1, y: -3},
        ];

        this.layoutMap["empty"] = [
            {x: -1, y: -2}, {x: 1, y: -2}, {x: 2, y: -1}
        ];

        for (let structureType in this.layoutMap) {
            let coords = this.layoutMap[structureType];
            for (let coord of coords) {
                let position = this.coordToPosition(coord);
                map.add(position.x, position.y, structureType);
            }
        }
    }
}

class PositionMap {
    map: {[x: number]: {[y: number]: string }} = {};
    add(x: number, y: number, structureType: string) {
        if (!this.map[x]) this.map[x] = {};
        this.map[x][y] = structureType;
    }
    checkIfUsed(x: number, y: number): boolean {
        return this.map[x] !== undefined && this.map[x][y] !== undefined;
    }
}
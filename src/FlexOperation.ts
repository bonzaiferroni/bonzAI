import {ControllerOperation} from "./ControllerOperation";
import {Coord} from "./interfaces";
import {NightsWatchMission} from "./NightsWatchMission";
import {OperationPriority} from "./constants";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";
import {helper} from "./helper";

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

        if (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_WALL) {
            // currently not building due to ongoing layout modifications
            return 0;
        }

        if (structureType === STRUCTURE_ROAD && level < 4) {
            return 29;
        }

        return Math.min(CONTROLLER_STRUCTURES[structureType][level], this.layoutCoords(structureType).length)
    }

    protected findStructureCount(structureType: string): number {
        let centerPosition = new RoomPosition(this.memory.centerPoint.x, this.memory.centerPoint.y, this.flag.room.name);

        let constructionCount = centerPosition.findInRange(FIND_MY_CONSTRUCTION_SITES, this.memory.flexRadius,
            {filter: (c: ConstructionSite) => c.structureType === structureType}).length;
        let count = _.filter(this.flag.room.findStructures(structureType),
                (s: Structure) => { return centerPosition.inRangeTo(s, this.memory.flexRadius)}).length + constructionCount;

        return count;
    }

    protected layoutCoords(structureType: string): Coord[] {
        if (this.layoutMap[structureType]) {
            return this.layoutMap[structureType]
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

    layoutMap = {
        [STRUCTURE_STORAGE]: [{x: 0, y: -3}],
        [STRUCTURE_TERMINAL]: [{x: -2, y: -1}],
        [STRUCTURE_SPAWN]: [{x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: 3}],
        [STRUCTURE_NUKER]: [{x: 3, y: 0}],
        [STRUCTURE_POWER_SPAWN]: [{x: -3, y: 0}],
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

        let map = new PositionMap(this.flag.room.name, this.memory.centerPoint, this.memory.rotation);
        this.addFixedStructuresToMap(map);

        // place structures and roads
        let towersRemaining = 6;
        let extensionsRemaining = 60;
        let observersRemaining = 1;
        let radius = 0;
        let recheckCoords = [];
        let iterations = 0;

        while (towersRemaining + observersRemaining + extensionsRemaining > 0 && iterations < 100) {
            iterations++;

            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                let x = this.memory.centerPoint.x + xDelta;
                if (x < 3 || x > 46) { continue; }

                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    // only consider points on perimeter of gradually expanding square
                    if (Math.abs(yDelta) !== radius && Math.abs(xDelta) !== radius) continue;

                    let y = this.memory.centerPoint.y + yDelta;
                    if (y < 3 || y > 46) { continue; }

                    let position = new RoomPosition(x, y, this.flag.room.name);
                    if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;

                    let isRoadCoord = this.checkValidRoadCoord(xDelta, yDelta);

                    if (isRoadCoord) {
                        let success = map.add(xDelta, yDelta, STRUCTURE_ROAD);
                        if (!success) recheckCoords.push({x: xDelta, y: yDelta});
                    }
                    else {
                        if (towersRemaining > 0) {
                            let success = map.add(xDelta, yDelta, STRUCTURE_TOWER);
                            if (success) towersRemaining--;
                            else recheckCoords.push({x: xDelta, y: yDelta});
                        }
                        else if (extensionsRemaining > 0) {
                            let success = map.add(xDelta, yDelta, STRUCTURE_EXTENSION);
                            if (success) extensionsRemaining--;
                            else recheckCoords.push({x: xDelta, y: yDelta});
                        }
                        else if (observersRemaining > 0) {
                            let success = map.add(xDelta, yDelta, STRUCTURE_OBSERVER);
                            if (success) observersRemaining--;
                            else recheckCoords.push({x: xDelta, y: yDelta});
                        }
                        else {
                            // do nothing
                        }
                    }
                }
            }

            for (let i = 0; i < recheckCoords.length; i++) {
                let coord = recheckCoords[i];

                let isRoadCoord = this.checkValidRoadCoord(coord.x, coord.y);
                if (isRoadCoord) {
                    let success = map.add(coord.x, coord.y, STRUCTURE_ROAD);
                    if (success) i = -1; // start over
                }
                else {
                    if (towersRemaining > 0) {
                        let success = map.add(coord.x, coord.y, STRUCTURE_TOWER);
                        if (success) towersRemaining--;
                    }
                    else if (extensionsRemaining > 0) {
                        let success = map.add(coord.x, coord.y, STRUCTURE_EXTENSION);
                        if (success) extensionsRemaining--;
                    }
                    else if (observersRemaining > 0) {
                        let success = map.add(coord.x, coord.y, STRUCTURE_OBSERVER);
                        if (success) observersRemaining--;
                    }
                    else {
                        // do nothing
                    }
                }
            }

            radius++;
        }

        this.addWalls(map);

        /*
        for (let xDelta = leftWall; xDelta <= rightWall; xDelta++) {

            for (let yDelta = topWall; yDelta <= bottomWall; yDelta++) {
                let x = this.memory.centerPoint.x + xDelta;
                let y = this.memory.centerPoint.y + yDelta;

                let position = new RoomPosition(x, y, this.flag.room.name);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;

                let wallType;
                if ((xDelta === leftWall || xDelta === rightWall) &&
                    (yDelta === topWall || yDelta === bottomWall)) {
                    wallType = STRUCTURE_RAMPART;
                }
                else if (xDelta === leftWall || xDelta === rightWall ||
                    yDelta === topWall || yDelta === bottomWall) {
                    let combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
                    if (combinedDeviance % 2 === 0) {
                        wallType = STRUCTURE_RAMPART;
                    }
                    else {
                        wallType = STRUCTURE_WALL;
                    }
                }

                if (!wallType) continue;

                let success = map.add(xDelta, yDelta, wallType);
                if (!success) {
                    if (position.isNearTo(position.findClosestByRange(wallPositions))){
                        success = map.add(xDelta, yDelta, wallType, false);
                    }
                }

                if (success) {
                    wallPositions.push(position);
                    // start over to fill in contiguous walls
                    xDelta = leftWall - 1;
                    yDelta = topWall;
                    break;
                }
            }
        }
        console.log("bottomost", bottomWall, "radius", radius);
        */

        this.debugMap(map);

        if (iterations === 100) {
            console.log("WARNING: layout process entered endless loop, life is terrible, give up all hope");
        }

        this.memory.flexLayoutMap = this.generateCoords(map);
        this.memory.flexRadius = radius + 1;
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
                map.add(coord.x, coord.y, structureType, false);
            }
        }
    }

    private checkValidRoadCoord(xDelta: number, yDelta: number): boolean {
        // creates the 5-cluster pattern for extensions/roads that you can see in my rooms
        let combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
        if (combinedDeviance % 2 !== 0 ) {
            return false;
        }
        else if (xDelta % 2 === 0 && combinedDeviance % 4 !== 0) {
            return false;
        }
        else {
            return true;
        }
    }

    private debugMap(map: PositionMap) {
        for (let x in map.map) {
            for (let y in map.map[x]) {
                let structureType = map.map[x][y];
                let position = new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.flag.room.name);
                let color = COLOR_WHITE;
                if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN
                    || structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_NUKER) {
                    color = COLOR_YELLOW;
                }
                else if (structureType === STRUCTURE_TOWER) {
                    color = COLOR_BLUE;
                }
                else if (structureType === STRUCTURE_LAB || structureType === STRUCTURE_TERMINAL) {
                    color = COLOR_CYAN;
                }
                else if (structureType === STRUCTURE_POWER_SPAWN) {
                    color = COLOR_RED;
                }
                else if (structureType === STRUCTURE_OBSERVER) {
                    color = COLOR_BROWN;
                }
                else if (structureType === STRUCTURE_ROAD) {
                    color = COLOR_GREY;
                }
                else if (structureType === STRUCTURE_RAMPART) {
                    color = COLOR_GREEN;
                }
                position.createFlag("layout_" + x + y + structureType, color);
            }
        }
    }

    private generateCoords(map: PositionMap) {
        let roomPositions = {};

        for (let x in map.map) {
            for (let y in map.map[x]) {
                let structureType = map.map[x][y];
                if (structureType !== STRUCTURE_ROAD && _.includes(Object.keys(this.layoutMap), structureType)) continue;
                if (!roomPositions[structureType]) roomPositions[structureType] = [];
                roomPositions[structureType].push(new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.flag.room.name));
            }
        }

        let flexLayoutMap = {};
        let centerPosition = new RoomPosition(this.memory.centerPoint.x, this.memory.centerPoint.y, this.flag.room.name);
        for (let structureType in roomPositions) {
            let sortedByDistance = _.sortBy(roomPositions[structureType], (pos: RoomPosition) => pos.getRangeTo(centerPosition) );
            flexLayoutMap[structureType] = [];
            for (let position of sortedByDistance) {
                let coord = this.positionToCoord(position);
                flexLayoutMap[structureType].push(coord);
            }
        }

        return flexLayoutMap;
    }

    private addWalls(map: PositionMap) {
        // push edge by 1 to make room for walls
        let leftWall = map.leftMost - 1;
        let rightWall = map.rightMost + 1;
        let topWall = map.topMost - 1;
        let bottomWall = map.bottomMost + 1;
        let allWallPositions: RoomPosition[] = [];
        let validWallPositions: RoomPosition[] = [];

        // mark off matrix, natural walls are impassible, all other tiles get 1
        let exitPositions: RoomPosition[] = [];
        let matrix = new PathFinder.CostMatrix();
        let lastPositionWasExit = { left: false, right: false, top: false, bottom: false };
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                let currentBorder;
                if (x === 0) currentBorder = "left";
                else if (x === 49) currentBorder = "right";
                else if (y === 0) currentBorder = "top";
                else if (y === 49) currentBorder = "bottom";

                let position = new RoomPosition(x, y, this.flag.room.name);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") {
                    matrix.set(x, y, 0xff);
                    if (currentBorder) {
                        lastPositionWasExit[currentBorder] = false;
                    }
                }
                else {
                    matrix.set(x, y, 1);
                    if (currentBorder) {
                        if (!lastPositionWasExit[currentBorder]) {
                            exitPositions.push(position);
                        }
                        lastPositionWasExit[currentBorder] = true;
                    }
                }
            }
        }

        console.log(`LAYOUT: found ${exitPositions.length} exits to path from`);

        // start with every wall position being valid around the border
        for (let xDelta = leftWall; xDelta <= rightWall; xDelta++) {
            for (let yDelta = topWall; yDelta <= bottomWall; yDelta++) {
                if (xDelta !== leftWall && xDelta !== rightWall && yDelta !== topWall && yDelta !== bottomWall) continue;
                let x = this.memory.centerPoint.x + xDelta;
                let y = this.memory.centerPoint.y + yDelta;

                let position = new RoomPosition(x, y, this.flag.room.name);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
                allWallPositions.push(position);
                matrix.set(x, y, 0xff);
            }
        }

        // send theoretical invaders at the center from each exit and remove the walls that don't make a
        // difference on whether they reach the center
        let centerPosition = new RoomPosition(this.memory.centerPoint.x, this.memory.centerPoint.y, this.flag.room.name);
        for (let wallPosition of allWallPositions) {
            let breach = false;
            matrix.set(wallPosition.x, wallPosition.y, 1);
            for (let exitPosition of exitPositions) {
                let ret = PathFinder.search(exitPosition, [{pos: centerPosition, range: 0}], {
                    maxRooms: 1,
                    roomCallback: (roomName: string): CostMatrix => {
                        if (roomName === this.flag.room.name) {
                            return matrix;
                        }
                    }});
                if (!ret.incomplete && ret.path[ret.path.length - 1].inRangeTo(centerPosition, 0)) {
                    breach = true;
                    break;
                }
            }
            if (breach) {
                validWallPositions.push(wallPosition);
                matrix.set(wallPosition.x, wallPosition.y, 0xff);
            }
            else {

            }
        }

        for (let position of validWallPositions) {
            let xDelta = position.x - this.memory.centerPoint.x;
            let yDelta = position.y - this.memory.centerPoint.y;
            map.add(xDelta, yDelta, STRUCTURE_RAMPART, false);
        }
    }
}

class PositionMap {
    leftMost = 0;
    rightMost = 0;
    topMost = 0;
    bottomMost = 0;

    centerPoint: Coord;
    rotation: number;

    roomName: string;
    map: {[x: number]: {[y: number]: string }} = {};
    roadPositions: RoomPosition[] = [];

    constructor(roomName: string, centerPoint: Coord, rotation: number) {
        this.roomName = roomName;
        this.centerPoint = centerPoint;
        this.rotation = rotation;
    }

    add(xDelta: number, yDelta: number, structureType: string, checkAdjacentRoad = true): boolean {
        let x = this.centerPoint.x + xDelta;
        let y = this.centerPoint.y + yDelta;
        let alreadyUsed = this.checkIfUsed(x, y);
        if (alreadyUsed) return false;

        let position = new RoomPosition(x, y, this.roomName);
        if (!checkAdjacentRoad || position.isNearTo(position.findClosestByRange<RoomPosition>(this.roadPositions))) {
            if (!this.map[x]) this.map[x] = {};
            this.map[x][y] = structureType;
            if (structureType === STRUCTURE_ROAD) {
                this.roadPositions.push(position);
            }

            if (xDelta < this.leftMost) { this.leftMost = xDelta; }
            if (xDelta > this.rightMost) { this.rightMost = xDelta; }
            if (yDelta < this.topMost) { this.topMost = yDelta; }
            if (yDelta > this.bottomMost) { this.bottomMost = yDelta; }

            return true;
        }
        else {
            return false;
        }
    }
    checkIfUsed(x: number, y: number): boolean {
        return this.map[x] !== undefined && this.map[x][y] !== undefined;
    }
}
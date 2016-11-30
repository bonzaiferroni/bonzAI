import {Coord} from "./interfaces";
import {helper} from "./helper";
export class FlexGenerator {

    leftMost = 0;
    rightMost = 0;
    topMost = 0;
    bottomMost = 0;

    radius = 0;
    centerPosition: RoomPosition;
    rotation: number;

    coreStructureCoordinates: {[structureType: string]: Coord[]};
    remaining = {
        [STRUCTURE_TOWER]: 6,
        [STRUCTURE_EXTENSION]: 60,
        [STRUCTURE_OBSERVER]: 1,
    };

    roomName: string;
    map: {[x: number]: {[y: number]: string }} = {};

    roadPositions: RoomPosition[] = [];
    noRoadAccess: Coord[] = [];
    wallCount: number;
    recheckCount = 0;

    static staticStructures = {
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

    constructor(centerPosition: RoomPosition, rotation: number) {
        if (!(centerPosition instanceof RoomPosition)) {
            centerPosition = helper.deserializeRoomPosition(centerPosition);
        }

        this.centerPosition = centerPosition;
        this.roomName = centerPosition.roomName;
        this.rotation = rotation;
        this.leftMost = centerPosition.x;
        this.rightMost = centerPosition.x;
        this.topMost = centerPosition.y;
        this.bottomMost = centerPosition.y;

        this.coreStructureCoordinates = FlexGenerator.staticStructures;
    }

    generate(debug: boolean): {[structureType: string]: Coord[]} {
        let room = Game.rooms[this.roomName];
        if (!room) return;

        this.addFixedStructuresToMap();
        this.addUsingExpandingRadius();
        this.addWalls();
        if (debug) this.debugMap();
        return this.generateCoords();
    }

    private addFixedStructuresToMap() {

        this.coreStructureCoordinates[STRUCTURE_ROAD] = [
            {x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}, {x: -1, y: -1}, {x: -2, y: -2},
            {x: -2, y: 0}, {x: 0, y: -2}, {x: 0, y: -4}, {x: 1, y: -3}, {x: 2, y: -2},
            {x: 3, y: -1}, {x: 4, y: 0}, {x: 3, y: 1}, {x: 1, y: 3}, {x: 0, y: 4},
            {x: -1, y: 3}, {x: -3, y: 1}, {x: -4, y: 0}, {x: -3, y: -1}, {x: -1, y: -3},
        ];

        this.coreStructureCoordinates["empty"] = [
            {x: -1, y: -2}, {x: 1, y: -2}, {x: 2, y: -1}
        ];

        for (let structureType in this.coreStructureCoordinates) {
            let coords = this.coreStructureCoordinates[structureType];
            for (let coord of coords) {
                let position = helper.coordToPosition(coord, this.centerPosition);
                this.addStructurePosition(position, structureType);
            }
        }
    }

    addUsingExpandingRadius() {
        let iterations = 0;
        while (_.sum(this.remaining) > 0 && iterations < 100) {
            iterations++;
            for (let xDelta = -this.radius; xDelta <= this.radius; xDelta++) {
                let x = this.centerPosition.x + xDelta;
                if (x < 3 || x > 46) { continue; }

                for (let yDelta = -this.radius; yDelta <= this.radius; yDelta++) {
                    // only consider points on perimeter of gradually expanding rectangle
                    if (Math.abs(yDelta) !== this.radius && Math.abs(xDelta) !== this.radius) continue;

                    let y = this.centerPosition.y + yDelta;
                    if (y < 3 || y > 46) { continue; }

                    let position = new RoomPosition(x, y, this.roomName);
                    if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;

                    this.addRemaining(xDelta, yDelta);
                }
            }
            this.radius++;
        }

        if (iterations === 100) {
            console.log("WARNING: layout process entered endless loop, life is terrible, give up all hope");
        }
    }

    addRemaining(xDelta: number, yDelta: number, save = true): boolean {

        let x = this.centerPosition.x + xDelta;
        let y = this.centerPosition.y + yDelta;
        let alreadyUsed = this.checkIfUsed(x, y);
        if (alreadyUsed) return;

        let position = new RoomPosition(x, y, this.roomName);
        if (position.isNearTo(position.findClosestByRange<RoomPosition>(this.roadPositions))) {

            let structureType = this.findStructureType(xDelta, yDelta);
            if (structureType) {
                this.addStructurePosition(position, structureType);
                this.remaining[structureType]--
            }
        }
        else if (save) {
            this.noRoadAccess.push({x: xDelta, y: yDelta});
        }
    }

    private recheckNonAccess() {
        if (this.recheckCount > 100) return;
        this.recheckCount++;
        console.log("rechecking" + this.recheckCount, this.noRoadAccess.length);
        for (let coord of this.noRoadAccess) {
            this.addRemaining(coord.x, coord.y, false);
        }
    }

    checkIfUsed(x: number, y: number): boolean {
        return this.map[x] !== undefined && this.map[x][y] !== undefined;
    }

    addStructurePosition(pos: RoomPosition, structureType: string, overwrite = false) {
        if (!this.map[pos.x]) this.map[pos.x] = {};
        let existingStructureType = this.map[pos.x][pos.y];
        if (existingStructureType) {
            if (overwrite) { this.remaining[existingStructureType]++; }
            else { return; }
        }

        if (structureType === STRUCTURE_ROAD) {
            this.roadPositions.push(pos);
            this.recheckNonAccess()
        }
        else if (structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL) {
            if (pos.x < this.leftMost) { this.leftMost = pos.x; }
            if (pos.x > this.rightMost) { this.rightMost = pos.x; }
            if (pos.y < this.topMost) { this.topMost = pos.y; }
            if (pos.y > this.bottomMost) { this.bottomMost = pos.y; }
        }

        this.map[pos.x][pos.y] = structureType;
    }

    private findStructureType(xDelta: number, yDelta: number): string {
        let isRoadCoord = this.checkValidRoadCoord(xDelta, yDelta);

        if (isRoadCoord) {
            return STRUCTURE_ROAD;
        }
        else {
            for (let structureType in this.remaining) {
                if (this.remaining[structureType]) {
                    return structureType;
                }
            }
        }
    }

    addWalls() {
        // push edge by 1 to make room for walls
        let leftWall = this.leftMost - 1;
        let rightWall = this.rightMost + 1;
        let topWall = this.topMost - 1;
        let bottomWall = this.bottomMost + 1;
        let allWallPositions: RoomPosition[] = [];
        let validWallPositions: RoomPosition[] = [];

        console.log(leftWall, rightWall, topWall, bottomWall);

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

                let position = new RoomPosition(x, y, this.roomName);
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
        for (let x = leftWall; x <= rightWall; x++) {
            for (let y = topWall; y <= bottomWall; y++) {
                if (x !== leftWall && x !== rightWall && y !== topWall && y !== bottomWall) continue;

                let position = new RoomPosition(x, y, this.roomName);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
                allWallPositions.push(position);
                matrix.set(x, y, 0xff);
            }
        }

        // send theoretical invaders at the center from each exit and remove the walls that don't make a
        // difference on whether they reach the center
        let centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
        for (let wallPosition of allWallPositions) {
            let breach = false;
            matrix.set(wallPosition.x, wallPosition.y, 1);
            for (let exitPosition of exitPositions) {
                let ret = PathFinder.search(exitPosition, [{pos: centerPosition, range: 0}], {
                    maxRooms: 1,
                    roomCallback: (roomName: string): CostMatrix => {
                        if (roomName === this.roomName) {
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
            this.addStructurePosition(position, STRUCTURE_RAMPART, true);
        }
        this.wallCount = validWallPositions.length;
    }

    private generateCoords(): {[structureType: string]: Coord[]} {
        let roomPositions = {};

        for (let x in this.map) {
            for (let y in this.map[x]) {
                let structureType = this.map[x][y];
                if (structureType !== STRUCTURE_ROAD && _.includes(Object.keys(FlexGenerator.staticStructures), structureType)) continue;
                if (!roomPositions[structureType]) roomPositions[structureType] = [];
                roomPositions[structureType].push(new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.roomName));
            }
        }

        let flexLayoutMap = {};
        let centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
        for (let structureType in roomPositions) {
            let sortedByDistance = _.sortBy(roomPositions[structureType], (pos: RoomPosition) => pos.getRangeTo(centerPosition) );
            flexLayoutMap[structureType] = [];
            for (let position of sortedByDistance) {
                let coord = helper.positionToCoord(position, this.centerPosition, this.rotation);
                flexLayoutMap[structureType].push(coord);
            }
        }

        return flexLayoutMap;
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

    private debugMap() {
        for (let x in this.map) {
            for (let y in this.map[x]) {
                let structureType = this.map[x][y];
                let position = new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.roomName);
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
}
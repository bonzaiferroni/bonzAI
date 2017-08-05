import {Coord} from "../interfaces";
import {helper} from "../helpers/helper";
import {RoomMap} from "./layouts/RoomMap";
import {PositionMap} from "./layouts/Layout";
import {LayoutDisplay} from "./layouts/LayoutDisplay";
import {PosHelper} from "../helpers/PosHelper";
export class FlexGenerator {

    private leftMost = 0;
    private rightMost = 0;
    private topMost = 0;
    private bottomMost = 0;

    private radius = 0;
    private centerPosition: RoomPosition;

    private remaining = {
        [STRUCTURE_TOWER]: 6,
        [STRUCTURE_EXTENSION]: 60,
        [STRUCTURE_OBSERVER]: 1,
    };

    private roomName: string;
    private flexMap = new RoomMap<string>();
    private fixedMap: RoomMap<string>;
    private rampartMap = new RoomMap<string>();
    private turtleMap = new RoomMap<string>();

    private roadPositions: RoomPosition[] = [];
    private noRoadAccess: Coord[] = [];
    private insidePositions: RoomPosition[] = [];
    private wallCount: number;
    private recheckCount = 0;

    constructor(roomName: string, anchor: Vector2, fixedMap: PositionMap) {
        this.centerPosition = new RoomPosition(anchor.x, anchor.y, roomName);
        this.roomName = roomName;
        this.leftMost = anchor.x;
        this.rightMost = anchor.x;
        this.topMost = anchor.y;
        this.bottomMost = anchor.y;
        this.fixedMap = this.generateFixedMap(fixedMap);
        this.roadPositions = fixedMap[STRUCTURE_ROAD];
    }

    public generate(): PositionMap {
        this.addUsingExpandingRadius();
        this.addWalls();
        this.removeStragglingRoads();
        return this.generatePositions();
    }

    private addUsingExpandingRadius() {
        let iterations = 0;
        while (_.sum(this.remaining) > 0 && this.radius < 10) {
            iterations++;
            for (let xDelta = -this.radius; xDelta <= this.radius; xDelta++) {
                let x = this.centerPosition.x + xDelta;
                if (x < 3 || x > 46) { continue; }

                for (let yDelta = -this.radius; yDelta <= this.radius; yDelta++) {
                    // only consider points on perimeter of gradually expanding rectangle
                    if (Math.abs(yDelta) !== this.radius && Math.abs(xDelta) !== this.radius) { continue; }

                    let y = this.centerPosition.y + yDelta;
                    if (y < 3 || y > 46) { continue; }

                    let position = new RoomPosition(x, y, this.roomName);
                    if (Game.map.getTerrainAt(x, y, this.roomName) === "wall") { continue; }
                    this.insidePositions.push(position);
                    this.addRemaining(xDelta, yDelta);
                }
            }
            this.radius++;
        }

        if (_.sum(this.remaining) > 0) {
            console.log(`warning, did not finish flex process, layout is incomplete. \n remaining: ${
                JSON.stringify(this.remaining)}`);
        }
    }

    private addRemaining(xDelta: number, yDelta: number, save = true): boolean {

        let x = this.centerPosition.x + xDelta;
        let y = this.centerPosition.y + yDelta;
        let alreadyUsed = this.checkIfUsed(x, y);
        if (alreadyUsed) { return; }

        let position = new RoomPosition(x, y, this.roomName);
        if (Game.rooms[this.roomName]) {
            if (position.inRangeTo(position.findClosestByRange<Source>(FIND_SOURCES), 2)) { return; }
            if (position.inRangeTo(Game.rooms[this.roomName].controller, 3)) { return; }
        }

        let foundRoad = false;
        for (let roadPos of this.roadPositions) {
            if (position.isNearTo(roadPos)) {
                let structureType = this.findStructureType(xDelta, yDelta);
                if (structureType) {
                    this.addStructurePosition(position, structureType);
                    this.remaining[structureType]--;
                    foundRoad = true;
                    break;
                }
            }
        }

        if (!foundRoad && save) {
            this.noRoadAccess.push({x: xDelta, y: yDelta});
        }
    }

    private recheckNonAccess() {
        // if (this.recheckCount > 100) return;
        this.recheckCount++;
        if (this.recheckCount > 100) { throw "rechecking too many times, something must be wrong"; }
        this.noRoadAccess = _.filter(this.noRoadAccess, (c: Coord) => !this.checkIfUsed(c.x, c.y));
        for (let coord of this.noRoadAccess) {
            this.addRemaining(coord.x, coord.y, false);
        }
    }

    private checkIfUsed(x: number, y: number): boolean {
        let structureType = this.flexMap.get(x, y);
        if (structureType) { return true; }
        structureType = this.fixedMap.get(x, y);
        if (structureType) { return true; }
        return false;
    }

    private addRampart(pos: RoomPosition) {
        this.rampartMap.setPos(pos, STRUCTURE_RAMPART);
    }

    private addStructurePosition(pos: RoomPosition, structureType: string, overwrite = false) {
        let existingStructureType = this.flexMap.getPos(pos);
        if (existingStructureType) {
            if (overwrite) {
                this.remaining[existingStructureType]++;
            } else {
                return;
            }
        }

        this.flexMap.setPos(pos, structureType);

        if (structureType === STRUCTURE_ROAD) {
            this.roadPositions.push(pos);
            this.recheckNonAccess();
        } else if (structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL) {
            if (pos.x < this.leftMost) { this.leftMost = pos.x; }
            if (pos.x > this.rightMost) { this.rightMost = pos.x; }
            if (pos.y < this.topMost) { this.topMost = pos.y; }
            if (pos.y > this.bottomMost) { this.bottomMost = pos.y; }
        }
    }

    private findStructureType(xDelta: number, yDelta: number): string {
        let isRoadCoord = this.checkValidRoadCoord(xDelta, yDelta);

        if (isRoadCoord) {
            return STRUCTURE_ROAD;
        } else {
            for (let structureType in this.remaining) {
                if (this.remaining[structureType]) {
                    return structureType;
                }
            }
        }
    }

    private addWalls() {
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
                if (x === 0) {
                    currentBorder = "left";
                } else if (x === 49) {
                    currentBorder = "right";
                } else if (y === 0) {
                    currentBorder = "top";
                } else if (y === 49) {
                    currentBorder = "bottom";
                }

                let position = new RoomPosition(x, y, this.roomName);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") {
                    matrix.set(x, y, 0xff);
                    if (currentBorder) {
                        lastPositionWasExit[currentBorder] = false;
                    }
                } else {
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
                if (x !== leftWall && x !== rightWall && y !== topWall && y !== bottomWall) { continue; }

                let position = new RoomPosition(x, y, this.roomName);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") { continue; }
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
            } else {
                this.insidePositions.push(wallPosition);
            }
        }

        for (let rampartPos of validWallPositions) {
            this.addRampart(rampartPos);
            for (let insidePos of this.insidePositions) {
                if (this.turtleMap.getPos(insidePos)) { continue; }
                if (this.rampartMap.getPos(insidePos)) { continue; }
                if (insidePos.getRangeTo(rampartPos) > 2) { continue; }
                let ret = PathFinder.search(rampartPos, [{pos: insidePos, range: 0}], {
                    maxRooms: 1,
                    roomCallback: roomName => matrix,
                });
                if (ret.incomplete) { continue; }
                this.turtleMap.setPos(insidePos, "turtle");
            }
        }
        this.wallCount = validWallPositions.length;
    }

    private generatePositions(): PositionMap {
        let structurePositions = this.flexMap.getAllPositions(this.roomName);

        for (let structureType in structurePositions) {
            structurePositions[structureType] = _.sortBy(structurePositions[structureType],
                x => x.getRangeTo(this.centerPosition));
        }

        structurePositions[STRUCTURE_RAMPART] = this.rampartMap.getPositions(STRUCTURE_RAMPART, this.roomName);
        structurePositions["turtle"] = this.turtleMap.getPositions("turtle", this.roomName);
        return structurePositions;
    }

    private checkValidRoadCoord(xDelta: number, yDelta: number): boolean {
        // creates the 5-cluster pattern for extensions/roads that you can see in my rooms
        let combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
        if (combinedDeviance % 2 !== 0 ) {
            return false;
        } else if (xDelta % 2 === 0 && combinedDeviance % 4 !== 0) {
            let pos = helper.coordToPosition({x: xDelta, y: yDelta}, this.centerPosition);

            // check narrow passage due to natural walls
            for (let direction = 2; direction <= 8; direction += 2) {
                if (PosHelper.relativePos(pos, direction).lookFor(LOOK_TERRAIN)[0] === "wall") {
                    return true;
                }
            }

            return false;
        } else {
            return true;
        }
    }

    private removeStragglingRoads() {
        let roadPositions = this.flexMap.getPositions(STRUCTURE_ROAD, this.roomName);
        for (let position of roadPositions) {
            if (position.x < this.leftMost || position.x > this.rightMost
                || position.y < this.topMost || position.y > this.bottomMost ) {
                this.flexMap.setPos(position, undefined);
            }
        }
    }

    private generateFixedMap(fixedMap: PositionMap): RoomMap<string> {
        let map = new RoomMap<string>();
        for (let structureType in fixedMap) {
            let positions = fixedMap[structureType];
            for (let position of positions) {
                map.setPos(position, structureType);
            }
        }
        return map;
    }
}

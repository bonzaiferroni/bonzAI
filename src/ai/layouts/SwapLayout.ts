import {Layout, LAYOUT_SEGMENTID, PositionMap} from "./Layout";
import {Viz} from "../../helpers/Viz";
import {LayoutDisplay} from "./LayoutDisplay";
import {helper} from "../../helpers/helper";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {Archiver} from "../Archiver";
export class SwapLayout extends Layout {
    private controller: Controller;
    private room: Room;
    protected hasFlex = true;

    public generateFlex(): boolean {
        let flexMap = this.generateSwapLayout();
        this.archiveMap(flexMap);
        return true;
    }

    private generateSwapLayout(): PositionMap {
        this.room = Game.rooms[this.roomName];
        this.controller = this.room.controller;

        let stubs = this.findStoragePostions(this.controller.pos);
        stubs = _.sortBy(stubs, x => -x.score);
        stubs = this.findTerminals(stubs.slice(0, 10));
        stubs = _.sortBy(stubs, x => -x.score);
        stubs = this.findTowers(stubs.slice(0, 10));
        stubs = _.sortBy(stubs, x => -x.score);
        if (stubs.length === 0) { console.log("couldn't find any stubs"); }
        this.findRamparts(stubs[0]);
        return stubs[0].positions;
    }

    private findStoragePostions(controllerPos: RoomPosition): ScoreMap[] {

        let stubsWithStorages: ScoreMap[] = [];

        // Viz.colorPos(controllerPos, "yellow");
        let radius = 3;
        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
            let x = controllerPos.x + xDelta;
            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                let y = controllerPos.y + yDelta;
                let position = new RoomPosition(x, y, this.roomName);
                if (this.invalidPos(position)) { continue; }

                let nearbyPositions = position.openAdjacentSpots(true);
                if (nearbyPositions.length < 5) { continue; }
                nearbyPositions = _.filter(nearbyPositions, x => x.getRangeTo(controllerPos) <= 3);
                if (nearbyPositions.length < 3) { continue; }
                stubsWithStorages.push({
                    score: nearbyPositions.length * 100,
                    positions: {
                        [STRUCTURE_STORAGE]: [position],
                    },
                });
            }
        }

        return stubsWithStorages;
    }

    private findTerminals(stubs: ScoreMap[]): ScoreMap[] {
        let stubsWithTerminals: ScoreMap[] = [];

        for (let stub of stubs) {
            let storagePos = stub.positions[STRUCTURE_STORAGE][0];
            let directions = [2, 4, 6, 8];
            for (let direction of directions) {
                let terminalPos = storagePos.getPositionAtDirection(direction, 2);
                if (this.invalidPos(terminalPos)) { continue; }
                let middlePos = storagePos.getPositionAtDirection(direction);
                if (this.invalidPos(middlePos)) { continue; }
                let newStub = _.cloneDeep(stub);
                newStub.positions[STRUCTURE_TERMINAL] = [terminalPos];
                stubsWithTerminals.push(newStub);
            }
        }

        return stubsWithTerminals;
    }

    private findTowers(stubs: ScoreMap[]) {

        let towerDirections: {[terminalDir: number]: number[] } = {
            [2]: [1, 3],
            [4]: [3, 5],
            [6]: [5, 7],
            [8]: [7, 1],
        };

        for (let stub of stubs) {
            let storagePos = stub.positions[STRUCTURE_STORAGE][0];
            let terminalPos = stub.positions[STRUCTURE_TERMINAL][0];
            let terminalDir = storagePos.getDirectionTo(terminalPos);
            let towerDirs = towerDirections[terminalDir];
            let tower1pos = storagePos.getPositionAtDirection(towerDirs[0], 2);
            let tower2pos = storagePos.getPositionAtDirection(towerDirs[1], 2);
            stub.positions[STRUCTURE_TOWER] = [];
            if (!this.invalidPos(tower1pos)) {
                stub.positions[STRUCTURE_TOWER].push(tower1pos);
                stub.score += 1000;
            }
            if (!this.invalidPos(tower2pos)) {
                stub.positions[STRUCTURE_TOWER].push(tower2pos);
                stub.score += 1000;
            }
        }
        return stubs;
    }

    private findRamparts(stub: ScoreMap) {
        let rampartPositions = stub.positions[STRUCTURE_TERMINAL]
            .concat(stub.positions[STRUCTURE_STORAGE])
            .concat(stub.positions[STRUCTURE_TOWER]);
        stub.positions[STRUCTURE_RAMPART] = rampartPositions;
    }

    private closeToEdge(n: number, rangeFromEdge: number): boolean  {
        // be some distance from edge
        let edgeDistance = 2;
        return n > 49 - edgeDistance || n < edgeDistance;
    };

    private posCloseToEdge(position: RoomPosition, rangeFromEdge: number): boolean {
        return this.closeToEdge(position.x, rangeFromEdge) || this.closeToEdge(position.y, rangeFromEdge);
    }

    private invalidPos(position: RoomPosition, matrix?: CostMatrix, rangeFromEdge = 2): boolean {
        if (matrix && matrix.get(position.x, position.y) === 0xff) { return true; }
        return this.posCloseToEdge(position, rangeFromEdge) || this.isWall(position);
    }

    private isWall(position: RoomPosition): boolean {
        return Game.map.getTerrainAt(position) === "wall";
    }

    /*private findStructurePath(stubs: ScoreMap[]): ScoreMap[] {
        let newStubs: ScoreMap[] = [];

        let matrix = new PathFinder.CostMatrix();
        MatrixHelper.blockOffExits(matrix, 0xff, 0, this.roomName);
        MatrixHelper.blockOffExits(matrix, 0xff, 1, this.roomName);
        MatrixHelper.blockOffExits(matrix, 50, 2, this.roomName);
        MatrixHelper.blockOffPosition(matrix, this.controller, 3, 0xff);
        for (let source of this.room.find<Source>(FIND_SOURCES)) {
            MatrixHelper.blockOffPosition(matrix, source, 3, 0xff);
        }

        for (let stub of stubs) {
            let terminalPos = stub.positions[STRUCTURE_TERMINAL][0];
            let storagePos = stub.positions[STRUCTURE_STORAGE][0];
            let terminalRangeToStorage = terminalPos.getRangeTo(storagePos);

            let directions = [1, 3, 5, 7];
            for (let direction of directions) {
                let position = terminalPos.getPositionAtDirection(direction);
                let rangeToStorage = position.getRangeTo(storagePos);
                if (rangeToStorage <= terminalRangeToStorage) { continue; }
                let pathMap = this.findPathMap(position, terminalPos, storagePos, matrix.clone());
                if (!pathMap) { continue; }
                let newStub = _.cloneDeep(stub);
                newStub.positions[STRUCTURE_SPAWN] = pathMap.positions[STRUCTURE_SPAWN];
                newStub.positions[STRUCTURE_TOWER] = pathMap.positions[STRUCTURE_TOWER];
                newStub.positions[STRUCTURE_EXTENSION] = pathMap.positions[STRUCTURE_EXTENSION];
                newStub.positions[STRUCTURE_ROAD] = pathMap.positions[STRUCTURE_ROAD];
                newStub.score += pathMap.score;
                newStubs.push(newStub);

            }

        }

        return newStubs;
    }*/

    /*private findPathMap(currentPos: RoomPosition, terminalPos: RoomPosition, storagePos: RoomPosition,
                        matrix: CostMatrix): ScoreMap {
        let remaining = {
            [STRUCTURE_SPAWN]: 1,
            [STRUCTURE_TOWER]: 2,
            [STRUCTURE_EXTENSION]: 40,
        };

        let pathMap: ScoreMap = {
            positions: {
                [STRUCTURE_ROAD]: [],
            },
            score: 0,
        };

        let placeRemaining = (position: RoomPosition) => {
            for (let structureType in remaining) {
                let count = remaining[structureType];
                if (count === 0) { continue; }
                if (!pathMap.positions[structureType]) { pathMap.positions[structureType] = []; }
                pathMap.positions[structureType].push(position);
                remaining[structureType]--;
                break;
            }
        };

        let fleeRange = 14;
        MatrixHelper.blockOffPosition(matrix, {pos: storagePos}, 2, 0xff);
        MatrixHelper.blockOffPosition(matrix, {pos: terminalPos}, 1, 0xff);

        while (_.sum(remaining) > 0) {
            pathMap.score -= 10;

            if (Game.map.getTerrainAt(currentPos) === "swamp") {
                pathMap.positions[STRUCTURE_ROAD].push(currentPos);
                pathMap.score--;
            }
            let directions = [1, 3, 5, 7];
            for (let direction of directions) {
                let position = currentPos.getPositionAtDirection(direction);
                if (this.invalidPos(position, matrix)) { continue; }
                matrix.set(position.x, position.y, 5);
            }
            let ret = PathFinder.search(currentPos, [{pos: terminalPos, range: fleeRange }], {
                flee: true,
                swampCost: 2,
                maxRooms: 1,
                roomCallback: (roomName: string): CostMatrix | boolean => {
                    if (roomName !== this.roomName) { return false; }
                    return matrix;
                },
            });
            if (ret.path.length === 0) { return; }
            let nextPos = ret.path[0];
            let nextDirection = currentPos.getDirectionTo(nextPos);
            if (nextDirection % 2 === 0) {
                // bonus for going in a diagonal direction
                pathMap.score++;
            }
            for (let direction = 1; direction <= 8; direction++) {
                if (direction === nextDirection) { continue; }
                let position = currentPos.getPositionAtDirection(direction);
                if (this.invalidPos(position, matrix)) { continue; }
                placeRemaining(position);
                matrix.set(position.x, position.y, 0xff);
            }

            matrix.set(currentPos.x, currentPos.y, 0xff);
            currentPos = nextPos;
        }

        return pathMap;
    }*/
}

interface ScoreMap {
    positions: PositionMap;
    score: number;
}

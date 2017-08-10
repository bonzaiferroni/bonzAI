import {HostileAgent} from "../ai/agents/HostileAgent";
import {Traveler} from "../ai/Traveler";
import {Viz} from "./Viz";
export class MatrixHelper {

    private static STRATEGY_CREEP_MATRIX_COST = 20;
    private static structureMatrices: {[roomName: string]: {
        structureCount: number,
        matrix: CostMatrix,
    }} = {};
    private static strategyMatrices: {[roomName: string]: CostMatrix };

    public static update() {
        this.strategyMatrices = {};
    }

    public static blockOffPosition(costs: CostMatrix, roomObject: {pos: RoomPosition}, range: number, cost = 30, add = false) {
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            let x = roomObject.pos.x + xDelta;
            if (x < 0 || x > 49) { continue; }
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                let y = roomObject.pos.y + yDelta;
                if (y < 0 || y > 49) { continue; }
                let terrain = Game.map.getTerrainAt(x, y, roomObject.pos.roomName);
                if (terrain === "wall") { continue; }
                let currentCost = costs.get(x, y);
                if (currentCost === 0) {
                    if (terrain === "plain") {
                        currentCost += 2;
                    } else {
                        currentCost += 10;
                    }
                }
                if (currentCost >= 0xff) { continue; }
                if (add) {
                    costs.set(x, y, Math.min(cost + currentCost, 200));
                    continue;
                }
                if (currentCost > cost) {
                    continue;
                }
                costs.set(x, y, cost);
            }
        }
    }

    private static addCreepsToMatrix(matrix: CostMatrix, room: Room) {
        for (let agent of HostileAgent.findInRoom(room.name)) {
            if (agent.getPotential(ATTACK) > 300) {
                this.blockOffPosition(matrix, agent, 2, 5, true);
                this.blockOffPosition(matrix, agent, 5, 5, true);
            }
            if (agent.getPotential(RANGED_ATTACK) > 100) {
                this.blockOffPosition(matrix, agent, 3, 10, true);
            }
        }

        // prefer not to path through creeps but don't set them to impassable
        for (let creep of room.find<Creep>(FIND_CREEPS)) {
            this.blockOffPosition(matrix, creep, 0, this.STRATEGY_CREEP_MATRIX_COST, true);
        }
    }

    public static getStrategyMatrix(roomName: string): CostMatrix {

        if (this.strategyMatrices[roomName]) { return this.strategyMatrices[roomName]; }

        let room = Game.rooms[roomName];
        if (!room) {
            return this.getStructureMatrix(roomName);
        }

        let strategyMatrix = this.getStructureMatrix(roomName).clone();
        this.addCreepsToMatrix(strategyMatrix, room);
        this.strategyMatrices[roomName] = strategyMatrix;
        return strategyMatrix;
    }

    public static getStructureMatrix(roomName: string): CostMatrix {
        let room = Game.rooms[roomName];
        if (!room) {
            if (this.structureMatrices[roomName]) {
                return this.structureMatrices[roomName].matrix;
            } else {
                return;
            }
        }

        let structureCount = room.find(FIND_STRUCTURES).length;
        let cachedData = this.structureMatrices[roomName];
        if (cachedData && cachedData.structureCount === structureCount) {
            return cachedData.matrix;
        }

        let structureMatrix = this.generateStructureMatrix(room);
        this.structureMatrices[roomName] = {
            matrix: structureMatrix,
            structureCount: structureCount,
        };

        return structureMatrix;
    }

    private static generateStructureMatrix(room: Room): CostMatrix {
        let matrix = new PathFinder.CostMatrix();
        Traveler.addStructuresToMatrix(room, matrix, 1);

        for (let tower of room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
            if (tower.my) { continue; }
            this.blockOffPosition(matrix, tower, 10, 1, true);
        }

        let avoidFlag = Game.flags[`avoidArea`];
        if (avoidFlag && avoidFlag.room === room) {
            this.blockOffPosition(matrix, avoidFlag, 5, 30, true);
        }

        return matrix;
    }

    public static adjustCreepPos(creepPos: RoomPosition, destination: RoomPosition) {
        let strategyMatrix = this.getStrategyMatrix(creepPos.roomName);
        this.adjustCost(creepPos, strategyMatrix, -this.STRATEGY_CREEP_MATRIX_COST);
        this.adjustCost(destination, strategyMatrix, this.STRATEGY_CREEP_MATRIX_COST);
    }

    public static adjustCost(position: RoomPosition, matrix: CostMatrix, adjustment: number) {
        let cost = matrix.get(position.x, position.y) + adjustment;
        matrix.set(position.x, position.y, cost);
    }

    public static addTerrainToMatrix(matrix: CostMatrix, roomName: string): CostMatrix {
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                let terrain = Game.map.getTerrainAt(x, y, roomName);
                if (terrain === "wall") {
                    matrix.set(x, y, 0xff);
                } else if (terrain === "swamp") {
                    matrix.set(x, y, 5);
                } else {
                    matrix.set(x, y, 1);
                }
            }
        }
        return;
    }

    public static blockOffExits(matrix: CostMatrix, cost = 0xff, range = 0, roomName?: string): CostMatrix {
        if (roomName && cost < 0xff) {
            // adjust based on terrain
            for (let x = range; x < 50 - range; x += 49 - range * 2) {
                for (let y = range; y < 50 - range; y++) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                }
            }
            for (let x = range; x < 50 - range; x++) {
                for (let y = range; y < 50 - range; y += 49 - range * 2) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                }
            }
        } else {
            // make impassable
            for (let x = range; x < 50 - range; x += 49 - range * 2) {
                for (let y = range; y < 50 - range; y++) {
                    matrix.set(x, y, 0xff);
                }
            }
            for (let x = range; x < 50 - range; x++) {
                for (let y = range; y < 50 - range; y += 49 - range * 2) {
                    matrix.set(x, y, 0xff);
                }
            }
        }
        return matrix;
    }

    public static showMatrix(matrix: CostMatrix, roomName: string, maxValue = 255, consoleReport = false) {
        // showMatrix
        for (let y = 0; y < 50; y++) {
            let line = "";
            for (let x = 0; x < 50; x++) {
                let position = new RoomPosition(x, y, roomName);
                let value = matrix.get(x, y);
                if (value >= 0xff) {
                    if (consoleReport) {
                        line += "ff ";
                    }
                    Viz.colorPos(position, "red");
                } else {
                    Viz.colorPos(position, "green", value / maxValue);
                    if (consoleReport) {
                        line += `${value}${value < 10 ? " " : ""}${value < 100 ? " " : ""}`;
                    }
                }
            }
            if (consoleReport) {
                console.log(line);
            }
        }
    }
}

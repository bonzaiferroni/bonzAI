import {PowerFlagScan, Coord} from "../interfaces";
export var helper = {
    getStoredAmount(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType];
        } else if (target.hasOwnProperty("store")) {
            return target.store[resourceType];
        } else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy;
        }
    },

    getCapacity(target: any) {
        if (target instanceof Creep) {
            return target.carryCapacity;
        } else if (target.hasOwnProperty("store")) {
            return target.storeCapacity;
        } else if (target.hasOwnProperty("energyCapacity")) {
            return target.energyCapacity;
        }
    },

    isFull(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType] === target.carryCapacity;
        } else if (target.hasOwnProperty("store")) {
            return target.store[resourceType] === target.storeCapacity;
        } else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy === target.energyCapacity;
        }
    },

    clampDirection(direction: number): number {
        while (direction < 1) { direction += 8; }
        while (direction > 8) { direction -= 8; }
        return direction;
    },

    deserializeRoomPosition(roomPosition: RoomPosition): RoomPosition {
        return new RoomPosition(roomPosition.x, roomPosition.y, roomPosition.roomName);
    },

    blockOffPosition(costs: CostMatrix, roomObject: RoomObject, range: number, cost = 30) {
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                if (Game.map.getTerrainAt(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, roomObject.room.name) === "wall") { continue; }
                costs.set(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, cost);
            }
        }
    },

    addTerrainToMatrix(matrix: CostMatrix, roomName: string): CostMatrix {
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
    },

    blockOffExits(matrix: CostMatrix, cost = 0xff, roomName?: string): CostMatrix {
        for (let x = 0; x < 50; x += 49) {
            for (let y = 0; y < 50; y++) {
                if (roomName) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                } else { matrix.set(x, y, 0xff); }
            }
        }
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y += 49) {
                if (roomName) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                } else { matrix.set(x, y, 0xff); }
            }
        }
        return matrix;
    },

    showMatrix(matrix: CostMatrix) {
        // showMatrix
        for (let y = 0; y < 50; y++) {
            let line = "";
            for (let x = 0; x < 50; x++) {
                let value = matrix.get(x, y);
                if (value === 0xff) { line += "f"; } else { line += value % 10; }
            }
            console.log(line);
        }
    },

    coordToPosition(coord: Coord, centerPosition: RoomPosition, rotation = 0) {
        if (!(centerPosition instanceof RoomPosition)) {
            centerPosition = this.deserializeRoomPosition(centerPosition);
        }
        let xCoord = coord.x;
        let yCoord = coord.y;
        if (rotation === 1) {
            xCoord = -coord.y;
            yCoord = coord.x;
        } else if (rotation === 2) {
            xCoord = -coord.x;
            yCoord = -coord.y;
        } else if (rotation === 3) {
            xCoord = coord.y;
            yCoord = -coord.x;
        }
        return new RoomPosition(centerPosition.x + xCoord, centerPosition.y + yCoord, centerPosition.roomName);
    },

    positionToCoord(pos: {x: number, y: number}, centerPoint: {x: number, y: number}, rotation = 0): Coord {
        let xCoord = pos.x - centerPoint.x;
        let yCoord = pos.y - centerPoint.y;
        if (rotation === 0) {
            return {x: xCoord, y: yCoord };
        } else if (rotation === 1) {
            return {x: yCoord, y: -xCoord };
        } else if (rotation === 2) {
            return {x: -xCoord, y: -yCoord };
        } else if (rotation === 3) {
            return {x: -yCoord, y: xCoord};
        }
    },

    serializePath(startPos: RoomPosition, path: RoomPosition[]): string {
        let serializedPath = "";
        let lastPosition = startPos;
        for (let position of path) {
            if (position.roomName === lastPosition.roomName) {
                serializedPath += lastPosition.getDirectionTo(position);
            }
            lastPosition = position;
        }
        return serializedPath;
    },

    pathablePosition(roomName: string): RoomPosition {
        for (let radius = 0; radius < 20; radius++) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    if (Math.abs(yDelta) !== radius && Math.abs(xDelta) !== radius) {
                        continue;
                    }
                    let x = 25 + xDelta;
                    let y = 25 + yDelta;
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") {
                        return new RoomPosition(x, y, roomName);
                    }
                }
            }
        }
    },

    debugPath(path: RoomPosition[], identifier = "") {
        let count = 0;
        for (let position of path) {
            let room = Game.rooms[position.roomName];
            if (room) {
                let name = "debugPath" + identifier + count;
                count++;
                let flag = Game.flags[name];
                if (flag) {
                    flag.setPosition(position);
                } else {
                    position.createFlag(name, COLOR_ORANGE);
                }
            }
        }

        for (let i = count; i < 1000; i++) {
            let name = "debugPath" + identifier + i;
            let flag = Game.flags[name];
            if (flag) {
                flag.remove();
            } else {
                break;
            }
        }

        return `placed ${count} out of ${path.length} flags`;
    },

    towerDamageAtRange(range: number): number {
        if (range <= TOWER_OPTIMAL_RANGE) { return TOWER_POWER_ATTACK; }
        if (range >= TOWER_FALLOFF_RANGE) { range = TOWER_FALLOFF_RANGE; }
        return TOWER_POWER_ATTACK - (TOWER_POWER_ATTACK * TOWER_FALLOFF *
            (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE));
    },

    towerDamageAtPosition(position: RoomPosition, towers: Tower[]): number {
        if (towers.length === 0) { return 0; }
        let expectedDamage = 0;
        for (let tower of towers) {
            let range = position.getRangeTo(tower);
            expectedDamage += helper.towerDamageAtRange(range);
        }
        return expectedDamage;
    },

    permutator(inputArr): number[][] {
        let result = [];

        const permute = (arr, m = []) => {
            if (arr.length === 0) {
                result.push(m);
            } else {
                for (let i = 0; i < arr.length; i++) {
                    let curr = arr.slice();
                    let next = curr.splice(i, 1);
                    permute(curr.slice(), m.concat(next));
                }
            }
        };

        permute(inputArr);

        return result;
    },

    randomInterval(interval: number): number {
        return interval + Math.floor((Math.random() - .5) * interval * .2);
    },
};

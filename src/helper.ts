import {ALLIES} from "./constants";
import {PowerFlagScan} from "./interfaces";
export var helper = {
    getStoredAmount(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType];
        }
        else if (target.hasOwnProperty("store")) {
            return target.store[resourceType];
        }
        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy;
        }
    },

    getCapacity(target: any) {
        if (target instanceof Creep) {
            return target.carryCapacity;
        }
        else if (target.hasOwnProperty("store")) {
            return target.storeCapacity;
        }
        else if (target.hasOwnProperty("energyCapacity")) {
            return target.energyCapacity;
        }
    },

    isFull(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType] === target.carryCapacity;
        }
        else if (target.hasOwnProperty("store")) {
            return target.store[resourceType] === target.storeCapacity;
        }
        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy === target.energyCapacity;
        }
    },

    clampDirection(direction: number): number {
        while (direction < 1) direction += 8;
        while (direction > 8) direction -= 8;
        return direction;
    },

    deserializeRoomPosition(roomPosition: RoomPosition): RoomPosition {
        return new RoomPosition(roomPosition.x, roomPosition.y, roomPosition.roomName);
    },

    checkEnemy(username: string, roomName: string) {
        if ( ALLIES[username] ) {
            return false;
        }

        // make note of non-ally, non-npc creeps
        if (username !== "Invader" && username !== "Source Keeper") {
            this.strangerDanger(username, roomName);
        }
        return true;
    },

    strangerDanger(username: string, roomName: string) {
        if (!Memory.strangerDanger) { Memory.strangerDanger = {}; }
        if (!Memory.strangerDanger[username]) { Memory.strangerDanger[username] = []; }
        let lastReport = _.last(Memory.strangerDanger[username]) as StrangerReport;
        if (!lastReport || lastReport.tickSeen < Game.time - 2000 ) {
            let report = { tickSeen: Game.time, roomName: roomName };
            console.log("STRANGER DANGER: one of", username, "\'s creeps seen in", roomName);
            Memory.strangerDanger[username].push(report);
            while (Memory.strangerDanger[username].length > 10) Memory.strangerDanger[username].shift();
        }
    },

    findCore(roomName: string) {

        let coreName = "";
        let digit;

        for (let i of roomName) {
            let parse = parseInt(i);
            if (isNaN(parse)) {
                if (digit !== undefined) {
                    coreName += Math.floor(digit / 10) * 10 + 5;
                    digit = undefined;
                }
                coreName += i;
            }
            else {
                if (digit === undefined) {
                    digit = 0;
                }
                else {
                    digit *= 10;
                }
                digit += parse;
            }
        }

        coreName += Math.floor(digit / 10) * 10 + 5;

        return coreName;
    },

    /**
     * Return room coordinates for a given Room, authored by tedivm
     * @param roomName
     * @returns {{x: (string|any), y: (string|any), x_dir: (string|any), y_dir: (string|any)}}
     */

    getRoomCoordinates(roomName: string): {x: number, y: number, xDir: string, yDir: string } {

        let coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
        let match = coordinateRegex.exec(roomName);

        let xDir = match[1];
        let x = match[2];
        let yDir = match[3];
        let y = match[4];

        return {
            x: Number(x),
            y: Number(y),
            xDir: xDir,
            yDir: yDir,
        };
    },

    findSightedPath(start: RoomPosition, goal: RoomPosition, goalRange: number, observer: StructureObserver, cache: PowerFlagScan) {

        if (Game.cpu.bucket < 8000) {
            console.log("PATH: waiting for full bucket");
            return;
        }

        let invalid = false;
        let ret = PathFinder.search(start, [{pos: goal, range: goalRange}], {
            maxOps: 10000,
            maxRooms: 16,
            roomCallback: (roomName: string) => {
                if (invalid) {
                    return false;
                }

                if (cache.matrices[roomName]) {
                    return cache.matrices[roomName];
                }

                if (_.includes(cache.avoidRooms, roomName)) {
                    return false;
                }

                let room = Game.rooms[roomName];
                if (!room) {
                    console.log("PATH: can't see", roomName + ", aiming observer at it");
                    observer.observeRoom(roomName);
                    invalid = true;
                    return false;
                }

                if (room.controller && room.controller.level > 0) {
                    if (room.controller.my) {
                        return;
                    }
                    else {
                        cache.avoidRooms.push(roomName);
                        return false;
                    }
                }

                let costs = new PathFinder.CostMatrix();
                room.find(FIND_STRUCTURES).forEach((s: Structure) => {
                    if (s.structureType !== STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 0xff);
                });

                cache.matrices[roomName] = costs;
                return costs;
            }
        });

        if (!invalid) {
            console.log("PATH: successfully found sighted path");
            return ret;
        }
    },

    negaDirection(dir: string): string {
        switch (dir) {
            case "W":
                return "E";
            case "E":
                return "W";
            case "N":
                return "S";
            case "S":
                return "N";
        }
    },

    blockOffMatrix(costs: CostMatrix, roomObject: RoomObject, range: number) {
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                costs.set(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, 30);
            }
        }
    },

    addStructuresToMatrix(costs: CostMatrix, room: Room): CostMatrix {
        room.find(FIND_STRUCTURES).forEach(function(structure: Structure) {
            if (structure.structureType === STRUCTURE_ROAD) {
                // Favor roads over plain tiles
                costs.set(structure.pos.x, structure.pos.y, 1);
            } else if (structure.structureType !== STRUCTURE_CONTAINER) {
                // Can't walk through non-walkable buildings
                costs.set(structure.pos.x, structure.pos.y, 0xff);
            }
        });
        return costs;
    },

    findRelativeRoomName(room: Room, xDelta, yDelta): string {
        if (!room) return;

        let xDir = room.coords.xDir;
        let yDir = room.coords.yDir;
        let x = room.coords.x + xDelta;
        let y = room.coords.y + yDelta;
        if (x < 0) {
            x = Math.abs(x) - 1;
            xDir = this.negaDirection(xDir);
        }
        if (y < 0) {
            y = Math.abs(y) - 1;
            yDir = this.negaDirection(yDir);
        }

        return xDir + x + yDir + y;
    },

    blockOffExits(matrix: CostMatrix): CostMatrix {
        for (let i = 0; i < 50; i += 49) {
            for (let j = 0; j < 50; j++) {
                matrix.set(i, j, 0xff);
            }
        }
        for (let i = 0; i < 50; i++) {
            for (let j = 0; j < 50; j += 49) {
                matrix.set(i, j, 0xff);
            }
        }
        return matrix;
    }
};
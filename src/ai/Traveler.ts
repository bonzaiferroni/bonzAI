/**
 * To start using Traveler, require it in main.js:
 * Example: var Traveler = require('Traveler.js');
 *
 * Check the footer of this file for suggestions on how to access it at various scopes
 *
 */

export interface TravelData {
    stuck: number;
    dest: RoomPosition;
    prev: RoomPosition;
    path: string;
    cpu: number;
    count: number;
    repath?: number;
}

export interface TravelToOptions {
    ignoreRoads?: boolean;
    ignoreCreeps?: boolean;
    ignoreStuck?: boolean;
    ignoreStructures?: boolean;
    preferHighway?: boolean;
    allowHostile?: boolean;
    allowSK?: boolean;
    range?: number;
    obstacles?: {pos: RoomPosition}[];
    roomCallback?: (roomName: string, matrix: CostMatrix) => CostMatrix | boolean;
    routeCallback?: (roomName: string) => number;
    returnData?: { nextPos: RoomPosition; };
    restrictDistance?: number;
    useFindRoute?: boolean;
    maxOps?: number;
    movingTarget?: boolean;
    freshMatrix?: boolean;
    offRoad?: boolean;
    stuckValue?: number;
    maxRooms?: number;
    repath?: number;
    route?: {[roomName: string]: boolean};
}

interface PathfinderReturn {
    path: RoomPosition[];
    ops: number;
    cost: number;
    incomplete: boolean;
}

interface CachedPath {
    start: RoomPosition;
    finish: RoomPosition;
    path: string;
}

interface CachedTravelData {
    progress: number;
    phase: number;
    tempDest: RoomPosition;
}

const REPORT_CPU_THRESHOLD = 1000;
const DEFAULT_MAXOPS = 20000;
const DEFAULT_STUCK_VALUE = 2;

export class Traveler {

    private structureMatrixCache: {[roomName: number]: CostMatrix} = {};
    private creepMatrixCache: {[roomName: string]: CostMatrix} = {};
    private creepMatrixTick: number;
    private structureMatrixTick: number;

    public findRoute(origin: string, destination: string,
                     options: TravelToOptions = {}): {[roomName: string]: boolean } {
        _.defaults(options, { restrictDistance: 16 });
        if (Game.map.getRoomLinearDistance(origin, destination) > options.restrictDistance) { return; }
        let allowedRooms = { [ origin ]: true, [ destination ]: true };
        let ret = Game.map.findRoute(origin, destination, {
            routeCallback: (roomName: string) => {

                if (options.routeCallback) {
                    let outcome = options.routeCallback(roomName);
                    if (outcome !== undefined) {
                        return outcome;
                    }
                }

                if (Game.map.getRoomLinearDistance(origin, roomName) > options.restrictDistance) { return false; }
                let parsed;
                if (options.preferHighway) {
                    parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName) as any;
                    let isHighway = (parsed[1] % 10 === 0) || (parsed[2] % 10 === 0);
                    if (isHighway) {
                        return 1;
                    }
                }
                // SK rooms are avoided when there is no vision in the room, harvested-from SK rooms are allowed
                if (!options.allowSK && !Game.rooms[roomName]) {
                    if (!parsed) { parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName) as any; }
                    let fMod = parsed[1] % 10;
                    let sMod = parsed[2] % 10;
                    let isSK =  !(fMod === 5 && sMod === 5) &&
                        ((fMod >= 4) && (fMod <= 6)) &&
                        ((sMod >= 4) && (sMod <= 6));
                    if (isSK) {
                        return 10;
                    }
                }
                if (!options.allowHostile && Traveler.checkOccupied(roomName) &&
                    roomName !== destination && roomName !== origin) {
                    return Number.POSITIVE_INFINITY;
                }

                return 2.5;
            },
        });
        if (!_.isArray(ret)) {
            console.log(`couldn't findRoute to ${destination}`);
            return;
        }
        for (let value of ret) {
            allowedRooms[value.room] = true;
        }

        return allowedRooms;
    }

    public routeDistance(origin: string, destination: string): number {
        let linearDistance = Game.map.getRoomLinearDistance(origin, destination);
        if (linearDistance >= 20) {
            return linearDistance;
        }

        let allowedRooms = this.findRoute(origin, destination);
        if (allowedRooms) {
            return Object.keys(allowedRooms).length;
        }
    }

    public findTravelPath(origin: {pos: RoomPosition}, destination: {pos: RoomPosition},
                          options: TravelToOptions = {}): PathfinderReturn {
        _.defaults(options, {
            ignoreCreeps: true,
            maxOps: DEFAULT_MAXOPS,
            range: 1,
            obstacles: [],
        });

        if (options.movingTarget) {
            options.range = 0;
        }

        let roomDistance = Game.map.getRoomLinearDistance(origin.pos.roomName, destination.pos.roomName);
        let allowedRooms = options.route;
        if (!allowedRooms && (options.useFindRoute || (options.useFindRoute === undefined && roomDistance > 2))) {
            allowedRooms = this.findRoute(origin.pos.roomName, destination.pos.roomName, options);
        }

        let callback = (roomName: string): CostMatrix | boolean => {

            if (allowedRooms) {
                if (!allowedRooms[roomName]) {
                    return false;
                }
            } else if (!options.allowHostile && Traveler.checkOccupied(roomName)
                && roomName !== destination.pos.roomName && roomName !== origin.pos.roomName) {
                return false;
            }

            let matrix: CostMatrix;
            let room = Game.rooms[roomName];
            if (room) {
                if (options.ignoreStructures) {
                    matrix = new PathFinder.CostMatrix();
                    if (!options.ignoreCreeps) {
                        Traveler.addCreepsToMatrix(room, matrix);
                    }
                } else if (options.ignoreCreeps || roomName !== origin.pos.roomName) {
                    matrix = this.getStructureMatrix(room, options.freshMatrix);
                } else {
                    matrix = this.getCreepMatrix(room);
                }

                for (let obstacle of options.obstacles) {
                    // warning, this is adding obstacles to the matrix used by all creeps, do so with caution
                    // TODO: make obstacle avoidance particular to the creep calling the function
                    if (obstacle.pos.roomName !== roomName) { continue; }
                    matrix.set(obstacle.pos.x, obstacle.pos.y, 0xff);
                }
            }

            if (options.roomCallback) {
                if (!matrix) { matrix = new PathFinder.CostMatrix(); }
                let outcome = options.roomCallback(roomName, matrix.clone());
                if (outcome !== undefined) {
                    return outcome;
                }
            }

            return matrix;
        };

        let ret = PathFinder.search(origin.pos, {pos: destination.pos, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 2,
            swampCost: options.offRoad ? 1 : options.ignoreRoads ? 5 : 10,
            roomCallback: callback,
        } );

        if (ret.incomplete && roomDistance === 2 && options.useFindRoute === undefined) {
            console.log(`TRAVELER: path failed without findroute, trying with options.useFindRoute = true`);
            console.log(`from: ${origin.pos}, destination: ${destination.pos}`);
            options.useFindRoute = true;
            return this.findTravelPath(origin, destination, options);
        }

        return ret;
    }

    public travelTo(creep: Creep, destination: {pos: RoomPosition} | RoomPosition,
                    options: TravelToOptions = {}): number {

        if (destination instanceof RoomPosition) {
            destination = {pos: destination};
        }

        /* uncomment if you would like to register hostile rooms entered
        if (creep.room.controller) {
            if (creep.room.controller.owner && !creep.room.controller.my) {
                creep.room.memory.occupied = true;
            } else {
                delete creep.room.memory.occupied;
            }
        }
        */

        // initialize data object
        if (!creep.memory._travel) {
            creep.memory._travel = {stuck: 0, cpu: 0, count: 0} as TravelData;
        }
        let travelData: TravelData = creep.memory._travel;

        if (creep.fatigue > 0) {
            new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                radius: .4, fill: "transparent", stroke: "aqua", opacity: .3});
            return ERR_BUSY;
        }

        if (!destination) {
            return ERR_INVALID_ARGS;
        }

        // manage case where creep is nearby destination
        let rangeToDestination = creep.pos.getRangeTo(destination);
        if (rangeToDestination <= options.range) {
            return OK;
        } else if (rangeToDestination <= 1) {
            if (rangeToDestination === 1 && !options.range) {
                new RoomVisual(destination.pos.roomName).circle(destination.pos, {fill: "green", opacity: .2});
                if (options.returnData) { options.returnData.nextPos = destination.pos; }
                return creep.move(creep.pos.getDirectionTo(destination));
            }
            return OK;
        }

        // mark destination
        // new RoomVisual(destination.pos.roomName).circle(destination.pos, {fill: "green"});

        // check if creep is stuck
        if (travelData.prev) {
            travelData.prev = Traveler.initPosition(travelData.prev);
            if (creep.pos.inRangeTo(travelData.prev, 0)) {
                travelData.stuck++;
                new RoomVisual(creep.pos.roomName).circle(creep.pos,
                    {fill: "blue", opacity: .3 * travelData.stuck});
            } else {
                travelData.stuck = 0;
            }
        }

        // handle case where creep is stuck
        if (!options.stuckValue) { options.stuckValue = DEFAULT_STUCK_VALUE; }
        if (travelData.stuck >= options.stuckValue && !options.ignoreStuck) {
            options.ignoreCreeps = false;
            options.freshMatrix = true;
            delete travelData.path;
        }

        // TODO:handle case where creep moved by some other function, but destination is still the same

        // delete path cache if destination is different
        if (!travelData.dest || travelData.dest.x !== destination.pos.x || travelData.dest.y !== destination.pos.y ||
            travelData.dest.roomName !== destination.pos.roomName) {
            if (travelData.dest && options.movingTarget) {
                let dest = Traveler.initPosition(travelData.dest);
                if (dest.isNearTo(destination)) {
                    travelData.path += dest.getDirectionTo(destination);
                    travelData.dest = destination.pos;
                } else {
                    delete travelData.path;
                }
            } else {
                delete travelData.path;
            }
        }

        if (options.repath !== undefined && travelData.repath !== undefined) {
            travelData.repath--;
            // randomness can mitigating a lot of repathing on the same tick
            if (travelData.repath <= 0 && Math.random() < .5) {
                delete travelData.path;
            }
        }

        // pathfinding
        if (!travelData.path) {
            if (options.repath !== undefined) {
                travelData.repath = options.repath;
            }
            if (creep.spawning) { return ERR_BUSY; }
            /*// TODO: have this not rely on prototype addition
            if (creep.pos.isNearExit(0)) {
                let directions = [1, 2, 3, 4, 5, 6, 7, 8];
                for (let direction of directions) {
                    let pos = creep.pos.getPositionAtDirection(direction);
                    if (pos.isPassible()) { return creep.move (direction); }
                }
            }*/

            travelData.dest = destination.pos;
            travelData.prev = undefined;
            let cpu = Game.cpu.getUsed();
            let ret = this.findTravelPath(creep, destination, options);
            travelData.count++;
            if (ret.incomplete) {
                // console.log(`TRAVELER: incomplete path for ${creep.name}`);
                if (ret.ops < 2000 && options.useFindRoute === undefined && travelData.stuck < DEFAULT_STUCK_VALUE) {
                    options.useFindRoute = false;
                    ret = this.findTravelPath(creep, destination, options);
                    console.log(`attempting path without findRoute was ${ret.incomplete ? "not" : ""} successful: ${
                        creep.name}`);
                }
            }

            let cpuUsed = Game.cpu.getUsed() - cpu;
            travelData.cpu = _.round(cpuUsed + travelData.cpu, 1);
            if (travelData.cpu > REPORT_CPU_THRESHOLD) {
                console.log(`TRAVELER: heavy cpu use: ${creep.name}, cpu: ${travelData.cpu},\n` +
                    `origin: ${creep.pos}, dest: ${destination.pos}`);
            }
            // new RoomVisual(creep.pos.roomName).text(`${_.round(cpuUsed, 1)}`, creep.pos, {color: "orange"});

            let color = "orange";
            if (ret.incomplete) {
                color = "red";
            }

            travelData.path = Traveler.serializePath(creep.pos, ret.path, color);
            travelData.stuck = 0;
        }
        if (!travelData.path || travelData.path.length === 0) {
            return ERR_NO_PATH;
        }

        // consume path and move
        if (travelData.prev && travelData.stuck === 0) {
            travelData.path = travelData.path.substr(1);
        }
        travelData.prev = creep.pos;
        let nextDirection = parseInt(travelData.path[0], 10);
        if (options.returnData) { options.returnData.nextPos = Traveler.positionAtDirection(creep.pos, nextDirection); }
        return creep.move(nextDirection);
    }

    // unused and untested so far
    public generateCachedPath(origin: {pos: RoomPosition}, destination: {pos: RoomPosition}): CachedPath {
        let ret = this.findTravelPath(origin, destination);
        if (ret.incomplete) {
            console.log(`TRAVELER: cachedPath generation incomplete, ${origin.pos} -> ${destination.pos}, ${ret.ops}`);
            return;
        }

        return {
            start: _.head(ret.path),
            finish: _.last(ret.path),
            path: Traveler.serializePath(_.head(ret.path), ret.path),
        };
    }

    // unused and untested so far
    public travelByCachedPath(creep: Creep, cachedPath: CachedPath) {
        if (!creep.memory._ctrav) { creep.memory._ctrav =  { progress: 0, phase: 0 }; }
        let travelData = creep.memory._ctrav as CachedTravelData;

        if (travelData.tempDest) {
            let tempDest = Traveler.initPosition(travelData.tempDest);
            if (creep.pos.inRangeTo(tempDest, 0)) {
                delete travelData.tempDest;
            } else {
                return this.travelTo(creep, {pos: tempDest});
            }
        }

        if (travelData.phase === 0) {
            let startPos = Traveler.initPosition(cachedPath.start);
            if (creep.pos.inRangeTo(startPos, 0)) {
                travelData.phase++;
                travelData.progress = 0;
            } else {
                travelData.tempDest = startPos;
                return this.travelByCachedPath(creep, cachedPath);
            }
        }

        if (travelData.phase === 1) {
            let nextDirection = cachedPath.path[travelData.progress];
        }
    }

    public getStructureMatrix(room: Room, freshMatrix?: boolean): CostMatrix {
        if (!this.structureMatrixCache[room.name] || (freshMatrix && Game.time !== this.structureMatrixTick)) {
            this.structureMatrixTick = Game.time;
            let matrix = new PathFinder.CostMatrix();
            this.structureMatrixCache[room.name] = Traveler.addStructuresToMatrix(room, matrix, 1);
        }
        return this.structureMatrixCache[room.name];
    }

    public static initPosition(pos: RoomPosition) {
        return new RoomPosition(pos.x, pos.y, pos.roomName);
    }

    public static addStructuresToMatrix(room: Room, matrix: CostMatrix, roadCost: number): CostMatrix {

        let impassibleStructures: Structure[] = [];
        for (let structure of room.find<Structure>(FIND_STRUCTURES)) {
            if (structure instanceof StructureRampart) {
                if (!structure.my) {
                    impassibleStructures.push(structure);
                }
            } else if (structure instanceof StructureRoad) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure instanceof StructureContainer) {
                matrix.set(structure.pos.x, structure.pos.y, 5);
            } else {
                impassibleStructures.push(structure);
            }
        }

        for (let site of room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES)) {
            if (site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_ROAD
                || site.structureType === STRUCTURE_RAMPART) { continue; }
            matrix.set(site.pos.x, site.pos.y, 0xff);
        }

        for (let structure of impassibleStructures) {
            matrix.set(structure.pos.x, structure.pos.y, 0xff);
        }

        return matrix;
    }

    public getCreepMatrix(room: Room) {
        if (!this.creepMatrixCache[room.name] || Game.time !== this.creepMatrixTick) {
            this.creepMatrixTick = Game.time;
            this.creepMatrixCache[room.name] = Traveler.addCreepsToMatrix(room,
                this.getStructureMatrix(room, true).clone());
        }
        return this.creepMatrixCache[room.name];
    }

    public static addCreepsToMatrix(room: Room, matrix: CostMatrix): CostMatrix {
        room.find<Creep>(FIND_CREEPS).forEach((creep: Creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff) );
        return matrix;
    }

    public static serializePath(startPos: RoomPosition, path: RoomPosition[], color = "orange"): string {
        let serializedPath = "";
        let lastPosition = startPos;
        new RoomVisual(startPos.roomName).circle(startPos, {
            radius: .5, fill: "transparent", stroke: color});
        for (let position of path) {
            if (position.roomName === lastPosition.roomName) {
                new RoomVisual(position.roomName)
                    .line(position, lastPosition, {color: color, lineStyle: "dashed"});
                serializedPath += lastPosition.getDirectionTo(position);
            }
            lastPosition = position;
        }
        return serializedPath;
    }

    private static positionAtDirection(origin: RoomPosition, direction: number): RoomPosition {
        let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
        let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
        let x = origin.x + offsetX[direction];
        let y = origin.y + offsetY[direction];
        if (x > 49 || x < 0 || y > 49 || y < 0) { return; }
        try {
            return new RoomPosition(x, y, origin.roomName);
        } catch (e) {
            console.log(`---------------------traveler pos args: ${x}, ${y}, ${origin.roomName}`);
            console.log(`---------------------traveler pos args: ${origin}, ${direction}, ${offsetY[direction]}, ${
                offsetX[direction]}`);
        }
    }

    public static checkOccupied(roomName: string) {
        return Memory.rooms[roomName] && Memory.rooms[roomName].occupied;
    }
}

// uncomment this to have an instance of traveler available through import
export const traveler = new Traveler();

// uncomment to assign an instance to init
// init.traveler = new Traveler();

// uncomment this block to assign a function to Creep.prototype: creep.travelTo(destination)
/*
const traveler = new Traveler();
Creep.prototype.travelTo = function(destination: {pos: RoomPosition}, options?: TravelToOptions) {
    return traveler.travelTo(this, destination, options);
};
*/

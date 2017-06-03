import {Profiler} from "../Profiler";
/**
 * To start using Traveler, require it in main.js:
 * Example: var Traveler = require('Traveler.js');
 *
 * Check the footer of this file for suggestions on how to access it at various scopes
 *
 */

export class Traveler {

    private structureMatrixCache: {[roomName: number]: CostMatrix} = {};
    private creepMatrixCache: {[roomName: string]: CostMatrix} = {};
    private creepMatrixTick: number;
    private structureMatrixTick: number;

    public travelTo(creep: Creep, destination: HasPos|RoomPosition, options: TravelToOptions = {}): number {

        // uncomment if you would like to register hostile rooms entered
        // this.updateRoomStatus(creep);

        if (!destination) {
            return ERR_INVALID_ARGS;
        }

        if (creep.fatigue > 0) {
            Traveler.circle(creep.pos, "aqua", .3);
            return ERR_BUSY;
        }

        if (!(destination instanceof RoomPosition)) {
            destination = destination.pos;
        }

        // manage case where creep is nearby destination
        let rangeToDestination = creep.pos.getRangeTo(destination);
        if (rangeToDestination <= options.range) {
            return OK;
        } else if (rangeToDestination <= 1) {
            if (rangeToDestination === 1 && !options.range) {
                if (options.returnData) { options.returnData.nextPos = destination; }
                return creep.move(creep.pos.getDirectionTo(destination));
            }
            return OK;
        }

        // initialize data object
        if (!creep.memory._trav) {
            delete creep.memory._travel;
            creep.memory._trav = {};
        }
        let travelData = creep.memory._trav as TravelData;

        let state = this.deserializeState(travelData, destination);

        // uncomment to visualize destination
        // this.circle(destination.pos, "orange");

        // check if creep is stuck
        if (this.isStuck(creep, state)) {
            state.stuckCount++;
            Traveler.circle(creep.pos, "purple", state.stuckCount * .3);
        } else {
            state.stuckCount = 0;
        }

        // handle case where creep is stuck
        if (!options.stuckValue) { options.stuckValue = DEFAULT_STUCK_VALUE; }
        if (state.stuckCount >= options.stuckValue && Math.random() > .5) {
            options.ignoreCreeps = false;
            options.freshMatrix = true;
            delete travelData.path;
        }

        // TODO:handle case where creep moved by some other function, but destination is still the same

        // delete path cache if destination is different
        if (!this.samePos(state.destination, destination)) {
            if (options.movingTarget && state.destination.isNearTo(destination)) {
                travelData.path += state.destination.getDirectionTo(destination);
                state.destination = destination;
            } else {
                delete travelData.path;
            }
        }

        if (options.repath && Math.random() < options.repath) {
            // add some chance that you will find a new path randomly
            delete travelData.path;
        }

        // pathfinding
        let newPath = false;
        if (!travelData.path) {
            newPath = true;
            if (creep.spawning) { return ERR_BUSY; }

            state.destination = destination;

            let cpu = Game.cpu.getUsed();
            let ret = this.findTravelPath(creep.pos, destination, options);

            if (ret.incomplete) {
                if (options.useFindRoute === undefined && state.stuckCount < DEFAULT_STUCK_VALUE) {
                    options.useFindRoute = false;
                    ret = this.findTravelPath(creep.pos, destination, options);
                    console.log(`attempting path without findRoute was ${ret.incomplete ? "not" : ""} successful: ${
                        creep.name}`);
                }
            }

            let cpuUsed = Game.cpu.getUsed() - cpu;
            state.cpu = _.round(cpuUsed + state.cpu);
            if (state.cpu > REPORT_CPU_THRESHOLD) {
                console.log(`TRAVELER: heavy cpu use: ${creep.name}, cpu: ${state.cpu},\n` +
                    `origin: ${creep.pos}, dest: ${destination}`);
            }

            let color = "orange";
            if (ret.incomplete) {
                color = "red";
            }

            travelData.path = Traveler.serializePath(creep.pos, ret.path, color);
            state.stuckCount = 0;
        }

        this.serializeState(creep, destination, state, travelData);

        if (!travelData.path || travelData.path.length === 0) {
            return ERR_NO_PATH;
        }

        // consume path
        if (state.stuckCount === 0 && !newPath) {
            travelData.path = travelData.path.substr(1);
        }

        let nextDirection = parseInt(travelData.path[0], 10);
        if (options.returnData && nextDirection) {
            options.returnData.nextPos = Traveler.positionAtDirection(creep.pos, nextDirection);
        }
        return creep.move(nextDirection);
    }

    private deserializeState(travelData: TravelData, destination: RoomPosition): TravelState {
        let state = {} as TravelState;
        if (travelData.state) {
            state.lastCoord = {x: travelData.state[STATE_PREV_X], y: travelData.state[STATE_PREV_Y] };
            state.cpu = travelData.state[STATE_CPU];
            state.stuckCount = travelData.state[STATE_STUCK];
            state.destination = new RoomPosition(travelData.state[STATE_DEST_X], travelData.state[STATE_DEST_Y],
                travelData.state[STATE_DEST_ROOMNAME]);
        } else {
            state.cpu = 0;
            state.destination = destination;
        }
        return state;
    }

    private serializeState(creep: Creep, destination: RoomPosition, state: TravelState, travelData: TravelData) {
        travelData.state = [creep.pos.x, creep.pos.y, state.stuckCount, state.cpu, destination.x, destination.y,
            destination.roomName];
    }

    public static checkOccupied(roomName: string) {
        return Memory.rooms[roomName] && Memory.rooms[roomName].occ;
    }

    public isExit(pos: Coord): boolean {
        return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
    }

    private isStuck(creep: Creep, state: TravelState): boolean {
        let stuck = false;
        if (state.lastCoord !== undefined) {
            if (this.sameCoord(creep.pos, state.lastCoord)) {
                // didn't move
                stuck = true;
            } else if (this.isExit(creep.pos) && this.isExit(state.lastCoord)) {
                // moved against exit
                stuck = true;
            }
        } else {
            state.lastCoord = {} as Coord;
        }

        state.lastCoord.x = creep.pos.x;
        state.lastCoord.y = creep.pos.y;
        return stuck;
    }

    public sameCoord(pos1: Coord, pos2: Coord): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }

    public samePos(pos1: RoomPosition, pos2: RoomPosition) {
        return this.sameCoord(pos1, pos2) && pos1.roomName === pos2.roomName;
    }

    private static circle(pos: RoomPosition, color: string, opacity?: number) {
        new RoomVisual(pos.roomName).circle(pos, {
            radius: .45, fill: "transparent", stroke: color, strokeWidth: .15, opacity: opacity});
    }

    private updateRoomStatus(creep: Creep) {
        if (creep.room.controller) {
            if (creep.room.controller.owner && !creep.room.controller.my) {
                creep.room.memory.occ = 1;
            } else {
                delete creep.room.memory.occ;
            }
        }
    }

    public findTravelPath(origin: RoomPosition, destination: RoomPosition,
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

        let roomDistance = Game.map.getRoomLinearDistance(origin.roomName, destination.roomName);
        let allowedRooms = options.route;
        if (!allowedRooms && (options.useFindRoute || (options.useFindRoute === undefined && roomDistance > 2))) {
            allowedRooms = this.findRoute(origin.roomName, destination.roomName, options);
        }

        let callback = (roomName: string): CostMatrix | boolean => {

            if (allowedRooms) {
                if (!allowedRooms[roomName]) {
                    return false;
                }
            } else if (!options.allowHostile && Traveler.checkOccupied(roomName)
                && roomName !== destination.roomName && roomName !== origin.roomName) {
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
                } else if (options.ignoreCreeps || roomName !== origin.roomName) {
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

        let ret = PathFinder.search(origin, {pos: destination, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 2,
            swampCost: options.offRoad ? 1 : options.ignoreRoads ? 5 : 10,
            roomCallback: callback,
        } );

        if (ret.incomplete && roomDistance === 2 && options.useFindRoute === undefined) {
            console.log(`TRAVELER: path failed without findroute, trying with options.useFindRoute = true`);
            console.log(`from: ${origin}, destination: ${destination}`);
            options.useFindRoute = true;
            return this.findTravelPath(origin, destination, options);
        }

        return ret;
    }

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

    public getStructureMatrix(room: Room, freshMatrix?: boolean): CostMatrix {
        if (!this.structureMatrixCache[room.name] || (freshMatrix && Game.time !== this.structureMatrixTick)) {
            this.structureMatrixTick = Game.time;
            let matrix = new PathFinder.CostMatrix();
            this.structureMatrixCache[room.name] = Traveler.addStructuresToMatrix(room, matrix, 1);
        }
        return this.structureMatrixCache[room.name];
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
        this.circle(startPos, color);
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
}

type Coord = {x: number, y: number};
type HasPos = {pos: RoomPosition}

export interface TravelData {
    state: any[];
    path: string;
}

export interface TravelState {
    stuckCount: number;
    lastCoord: Coord;
    destination: RoomPosition;
    cpu: number;
}

export interface TravelToOptions {
    ignoreRoads?: boolean;
    ignoreCreeps?: boolean;
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

const REPORT_CPU_THRESHOLD = 1000;
const DEFAULT_MAXOPS = 20000;
const DEFAULT_STUCK_VALUE = 2;
const STATE_PREV_X = 0;
const STATE_PREV_Y = 1;
const STATE_STUCK = 2;
const STATE_CPU = 3;
const STATE_DEST_X = 4;
const STATE_DEST_Y = 5;
const STATE_DEST_ROOMNAME = 6;

// uncomment to assign an instance to init
// init.traveler = new Traveler();

// uncomment this block to assign a function to Creep.prototype: creep.travelTo(destination)
/*
const traveler = new Traveler();
Creep.prototype.travelTo = function(destination: {pos: RoomPosition}, options?: TravelToOptions) {
    return traveler.travelTo(this, destination, options);
};
*/

// uncomment this to have an instance of traveler available through import
export const traveler = new Traveler();

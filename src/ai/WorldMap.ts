import {Diplomat} from "./Diplomat";
import {TradeNetwork} from "./TradeNetwork";
import {SpawnGroup} from "./SpawnGroup";
import {helper} from "../helpers/helper";
import {Profiler} from "../Profiler";
export class WorldMap {

    public controlledRooms: {[roomName: string]: Room } = {};

    public allyMap: {[roomName: string]: RoomMemory } = {};
    public allyRooms: Room[];
    public tradeMap: {[roomName: string]: RoomMemory } = {};
    public tradeRooms: Room[];
    public foesMap: {[roomName: string]: RoomMemory } = {};
    public foesRooms: Room[];

    public activeNukes: {tick: number; roomName: string}[];
    public portals: {[roomName: string]: string } = {};
    public artRooms = ARTROOMS;

    private diplomat: Diplomat;

    constructor(diplomat: Diplomat) {
        this.diplomat = diplomat;

        if (!Memory.empire) { Memory.empire = {}; }
        _.defaults(Memory.empire, {
            activeNukes: {},
        });
        this.activeNukes = Memory.empire.activeNukes;
    }

    public init(): {[roomName: string]: SpawnGroup } {
        let spawnGroups = {};
        for (let roomName in Memory.rooms) {
            let memory = Memory.rooms[roomName];
            let room = Game.rooms[roomName];

            if (room && room.controller && room.controller.my) {
                if (room.find(FIND_MY_SPAWNS).length > 0) {
                    let spawnGroup = new SpawnGroup(roomName);
                    spawnGroups[roomName] = spawnGroup;
                }
            }

            if (this.diplomat.allies[memory.owner]) {
                this.allyMap[roomName] = memory;
            }
            if (this.diplomat.foes[memory.owner]) {
                this.foesMap[roomName] = memory;
            }
            if (memory.nextTrade) {
                this.tradeMap[roomName] = memory;
            }

            if (memory.portal) {
                if (Game.time > memory.portalEnd) {
                    delete memory.portal;
                    delete memory.portalEnd;
                } else {
                    this.portals[roomName] = memory.portal;
                }
            }
        }
        return spawnGroups;
    }

    public update() {
        this.activeNukes = Memory.empire.activeNukes;
        this.controlledRooms = {};
        this.allyRooms = [];
        this.tradeRooms = [];
        this.foesRooms = [];

        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
            this.updateMemory(room);

            if (room.controller && room.controller.my) {
                this.radar(room);
                this.controlledRooms[roomName] = room;
            }

            if (this.diplomat.allies[room.memory.owner]) {
                this.allyRooms.push(room);
            }
            if (this.diplomat.foes[room.memory.owner]) {
                this.foesRooms.push(room);
            }
            if (room.memory.nextTrade) {
                this.tradeRooms.push(room);
            }
        }
    }

    public actions() {
        this.reportNukes();
    }

    public addNuke(activeNuke: {tick: number; roomName: string}) {
        this.activeNukes.push(activeNuke);
    }

    public reportNukes() {
        if (Game.time % TICK_FULL_REPORT !== 0) { return; }

        for (let activeNuke of this.activeNukes) {
            console.log(`EMPIRE: ${Game.time - activeNuke.tick} till our nuke lands in ${activeNuke.roomName}`);
        }
    }

    private updateMemory(room: Room) {
        if (room.controller) {
            room.memory.level = room.controller.level;
            if (room.controller.owner) {
                room.memory.owner = room.controller.owner.username;
            }
            if (room.controller.owner && !room.controller.my) {
                room.memory.occ = 1;
            } else if (room.memory.occ) {
                delete room.memory.occ;
            }
        }
    }

    private radar(scanningRoom: Room) {
        if (scanningRoom.controller.level < 8) { return; }
        if (Game.time < scanningRoom.memory.nextRadar) { return; }

        // find observer
        let observer = _(scanningRoom.find<StructureObserver>(FIND_STRUCTURES))
            .filter(s => s.structureType === STRUCTURE_OBSERVER)
            .head();
        if (!observer) {
            console.log(`NETWORK: please add an observer in ${scanningRoom.name} to participate in network`);
            scanningRoom.memory.nextRadar = Game.time + helper.randomInterval(1000);
            return;
        }

        if (!scanningRoom.memory.radarData) {
            console.log(`NETWORK: Beginning full radar scan in ${scanningRoom.name}`);
            scanningRoom.memory.radarData = { x: -10,  y: -10 };
        }
        let radarData = scanningRoom.memory.radarData;

        // scan loop
        let scanComplete = false;
        while (!scanComplete) {
            let roomName = WorldMap.findRelativeRoomName(scanningRoom.name, radarData.x, radarData.y);
            let scannedRoom = Game.rooms[roomName];
            if (scannedRoom) {
                scannedRoom.memory.nextScan = Game.time + RADAR_INTERVAL;
                this.evaluateTrade(scannedRoom);
                this.evaluatePortal(scannedRoom);
                // TODO: room selection code
            } else {
                if (!Memory.rooms[roomName]) { Memory.rooms[roomName] = {} as RoomMemory; }
                let roomMemory = Memory.rooms[roomName];
                if (!roomMemory.nextScan || Game.time >= roomMemory.nextScan) {
                    observer.observeRoom(roomName);
                    break;
                }
            }

            scanComplete = this.incrementScan(radarData);
            if (scanComplete) {
                scanningRoom.memory.nextRadar = Game.time + helper.randomInterval(RADAR_INTERVAL);
                console.log(`RADAR: Scan complete at ${scanningRoom.name}`);
                delete scanningRoom.memory.radarData;
            }
        }
    }

    private evaluateTrade(room: Room) {
        if (!room.controller || room.controller.my || !TradeNetwork.canTrade(room)
            || !this.diplomat.partners[room.controller.owner.username]) {
            room.memory.nextTrade = undefined;
            return;
        }
        if (!room.memory.nextTrade) { room.memory.nextTrade = Game.time; }
    }

    private evaluatePortal(scannedRoom: Room) {
        let portal = scannedRoom.findStructures<StructurePortal>(STRUCTURE_PORTAL)[0];
        if (!portal) { return; }
        scannedRoom.memory.portal = portal.destination.roomName;
        if (portal.ticksToDecay) {
            scannedRoom.memory.portalEnd = portal.ticksToDecay + Game.time;
        } else {
            scannedRoom.memory.portalEnd = PORTAL_DECAY + Game.time;
        }
    }

    private incrementScan(radarData: {x: number; y: number}) {
        // increment
        radarData.x++;
        if (radarData.x > 10) {
            radarData.x = -10;
            radarData.y++;
            if (radarData.y > 10) {
                return true;
            }

        }
    }

    public static findRelativeRoomName(roomName: string, xDelta: number, yDelta: number): string {
        let coords = this.getRoomCoordinates(roomName);
        let xDir = coords.xDir;
        let yDir = coords.yDir;
        let x = coords.x + xDelta;
        let y = coords.y + yDelta;
        if (x < 0) {
            x = Math.abs(x) - 1;
            xDir = this.negaDirection(xDir);
        }
        if (y < 0) {
            y = Math.abs(y) - 1;
            yDir = this.negaDirection(yDir);
        }

        return xDir + x + yDir + y;
    }

    public static findRoomCoordDeltas(origin: string, otherRoom: string): {x: number, y: number} {
        let originCoords = this.getRoomCoordinates(origin);
        let otherCoords = this.getRoomCoordinates(otherRoom);
        let xDelta = otherCoords.x - originCoords.x;
        if (originCoords.xDir === otherCoords.xDir) {
            if (originCoords.xDir === "W") {
                xDelta = -xDelta;
            }
        } else {
            xDelta = otherCoords.x + originCoords.x + 1;
            if (originCoords.xDir === "E") {
                xDelta = -xDelta;
            }
        }
        let yDelta = otherCoords.y - originCoords.y;
        if (originCoords.yDir === otherCoords.yDir) {
            if (originCoords.yDir === "S") {
                yDelta = -yDelta;
            }
        } else {
            yDelta = otherCoords.y + originCoords.y + 1;
            if (originCoords.yDir === "N") {
                yDelta = -yDelta;
            }
        }
        return {x: xDelta, y: yDelta};
    }

    public static findRelativeRoomDir(origin: string, otherRoom: string): number {
        let coordDeltas = this.findRoomCoordDeltas(origin, otherRoom);
        if (Math.abs(coordDeltas.x) === Math.abs(coordDeltas.y)) {
            if (coordDeltas.x > 0) {
                if (coordDeltas.y > 0) {
                    return 2;
                } else {
                    return 4;
                }
            } else if (coordDeltas.x < 0) {
                if (coordDeltas.y > 0) {
                    return 8;
                } else {
                    return 6;
                }
            } else {
                // must be the same missionRoom, no direction
                return 0;
            }
        } else {
            if (Math.abs(coordDeltas.x) > Math.abs(coordDeltas.y)) {
                if (coordDeltas.x > 0) {
                    return 3;
                } else {
                    return 7;
                }
            } else {
                if (coordDeltas.y > 0) {
                    return 1;
                } else {
                    return 5;
                }
            }
        }
    }

    public static negaDirection(dir: string): string {
        switch (dir) {
            case "W":
                return "E";
            case "E":
                return "W";
            case "N":
                return "S";
            case "S":
                return "N";
            default:
                return "error";
        }
    }

    /**
     * Return missionRoom coordinates for a given Room, authored by tedivm
     * @param roomName
     * @returns {{x: (string|any), y: (string|any), x_dir: (string|any), y_dir: (string|any)}}
     */

    public static getRoomCoordinates(roomName: string): RoomCoord {

        let coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
        let match = coordinateRegex.exec(roomName);
        if (!match) { return; }

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
    }

    public static roomTypeFromName(roomName: string): number {
        let coords = this.getRoomCoordinates(roomName);
        if (coords.x % 10 === 0 || coords.y % 10 === 0) {
            return ROOMTYPE_ALLEY;
        } else if (coords.x % 5 === 0 && coords.y % 5 === 0) {
            return ROOMTYPE_CORE;
        } else if (coords.x % 10 === 6 || coords.x % 10 === 4 || coords.y % 10 === 6 || coords.y % 10 === 4) {
            return ROOMTYPE_SOURCEKEEPER;
        } else {
            return ROOMTYPE_CONTROLLER;
        }
    }

    public static findNearestCore(roomName: string): string {

        let roomCoords = this.getRoomCoordinates(roomName);
        let x = Math.floor(roomCoords.x / 10) + 5;
        let y = Math.floor(roomCoords.y / 10) + 5;

        return roomCoords.xDir + x + roomCoords.yDir + y;
    }
}

export const ARTROOMS = {

};

export const TICK_FULL_REPORT = 0;
export const ROOMTYPE_SOURCEKEEPER = -1301;
export const ROOMTYPE_CORE = -1302;
export const ROOMTYPE_CONTROLLER = -1303;
export const ROOMTYPE_ALLEY = -1304;
export const RADAR_INTERVAL = 10000;

import {Diplomat} from "./Diplomat";
import {TradeNetwork} from "./TradeNetwork";
import {SpawnGroup} from "./SpawnGroup";
import {helper} from "../helpers/helper";
import {USERNAME} from "../config/constants";
import {Observationer} from "./Observationer";
import {MemHelper} from "../helpers/MemHelper";
import {PosHelper} from "../helpers/PosHelper";
import {Operation} from "./operations/Operation";
import {empire} from "./Empire";
import {Traveler} from "../Traveler/Traveler";

export class WorldMap {

    public controlledRoomCount: number;
    public controlledRooms: {[roomName: string]: Room } = {};
    public allyMap: {[roomName: string]: RoomMemory } = {};
    public allyRooms: Room[];
    public tradeMap: {[roomName: string]: RoomMemory } = {};
    public tradeRooms: Room[];
    public foesMap: {[roomName: string]: RoomMemory } = {};
    public foesRooms: Room[];
    public playerMap: {[roomName: string]: RoomMemory } = {};
    public portals: {[roomName: string]: string } = {};
    public artRooms = ARTROOMS;

    private diplomat: Diplomat;
    private nextUpdate: {[roomName: string]: number } = {};
    public static roomTypeCache: {[roomName: string]: number} = {};
    private targetRooms: Room[];
    private memory: {
        activeNukes: {[roomName: string]: number};
        nextTargeting: {[roomName: string]: number}
    };

    constructor(diplomat: Diplomat) {
        this.diplomat = diplomat;
    }

    public init(): {[roomName: string]: SpawnGroup } {
        if (!Memory.worldMap) { Memory.worldMap = {}; }
        if (!Memory.worldMap.activeNukes) { Memory.worldMap.activeNukes = {}; }
        if (!Memory.worldMap.nextTargeting) { Memory.worldMap.nextTargeting = {}; }
        this.memory = Memory.worldMap;

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

            if (memory.level > 0) {
                if (memory.owner) {
                    this.playerMap[roomName] = memory;
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
        this.memory = Memory.worldMap;
        this.controlledRoomCount = 0;
        this.controlledRooms = {};
        this.allyRooms = [];
        this.tradeRooms = [];
        this.foesRooms = [];
        this.targetRooms = [];

        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
            this.updateMemory(room);

            if (room.controller && room.controller.my) {
                this.controlledRoomCount++;
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
        this.initAttacks();
    }

    public addNuke(activeNuke: {tick: number; roomName: string}) {
        this.memory.activeNukes[activeNuke.roomName] = activeNuke.tick;
    }

    public reportNukes() {
        if (Game.time % TICK_FULL_REPORT !== 0) { return; }

        for (let roomName in this.memory.activeNukes) {
            let tick = this.memory.activeNukes[roomName];
            console.log(`EMPIRE: ${Game.time - tick} till our nuke lands in ${roomName}`);
        }
    }

    private updateMemory(room: Room) {
        if (this.nextUpdate[room.name] > Game.time) { return; }
        if (room.memory.manual) { return; }

        if (room.controller) {
            room.memory.level = room.controller.level;

            let owner;
            if (room.controller.owner) {
                owner = room.controller.owner.username;
            } else if (room.controller.reservation) {
                owner = room.controller.reservation.username;
            }
            room.memory.owner = owner;

            if (!Memory.playerConfig.manual && owner) {
                if (owner !== USERNAME) {
                    this.diplomat.foes[owner] = true;
                }
                if (this.diplomat.foes[owner]) {
                    this.targetRooms.push(room);
                }
            }

            if (room.memory.bounty && Game.time > room.memory.bounty.expire) {
                delete room.memory.bounty;
            }

            if (room.controller.owner && !room.controller.my) {
                room.memory.avoid = 1;
            } else if (room.memory.avoid) {
                delete room.memory.avoid;
            }
        }

        this.nextUpdate[room.name] = Game.time + 50;
    }

    private radar(scanningRoom: Room) {
        if (scanningRoom.memory.nextRadar > Game.time) { return; }
        let nextScanInterval = RADAR_INTERVAL;
        if (Game.gcl.level === 1) {
            nextScanInterval = Math.floor(RADAR_INTERVAL / 2);
            this.radarAllVisibleRooms(scanningRoom, nextScanInterval);
        }

        if (scanningRoom.controller.level <= 1) { return; }

        let radius = 10;
        if (scanningRoom.controller.level < 5) {
            radius = 5;
        } else if (scanningRoom.controller.level < 8) {
            radius = 8;
        }

        if (!scanningRoom.memory.radarData) {
            console.log(`NETWORK: Beginning full radar scan in ${scanningRoom.name}`);
            scanningRoom.memory.radarData = { x: 0,  y: 0, radius: 0, asc: true, tick: Game.time };
        }
        let radarData = scanningRoom.memory.radarData;

        let observerCreep = Observationer.getObserverCreep(scanningRoom.name);
        if (observerCreep) {
            this.analyzeRoom(scanningRoom, observerCreep.pos.roomName, nextScanInterval, true);
        }

        // scan loop
        let scanComplete = false;
        while (!scanComplete) {
            let roomName = WorldMap.findRelativeRoomName(scanningRoom.name, radarData.x, radarData.y);

            if (radarData.tick + 1500 > Game.time) {
                let orderingVision = this.analyzeRoom(scanningRoom, roomName, nextScanInterval, false);
                if (orderingVision) { break; }
            }

            // console.log(`RADAR: incrementing data: ${JSON.stringify(radarData)}`);
            scanComplete = this.incrementScan(radarData, radius);
            if (scanComplete) {
                scanningRoom.memory.nextRadar = Game.time + helper.randomInterval(nextScanInterval);
                console.log(`RADAR: Scan complete at ${scanningRoom.name}`);
                delete scanningRoom.memory.radarData;
            }
        }
    }

    private radarAllVisibleRooms(scanningRoom: Room, nextScanInterval: number) {
        for (let roomName in Game.rooms) {
            this.analyzeRoom(scanningRoom, roomName, nextScanInterval, true);
        }
    }

    private analyzeRoom(scanningRoom: Room, roomName: string, nextScanInterval: number, passive: boolean) {
        if (!Memory.rooms[roomName]) { Memory.rooms[roomName] = {} as RoomMemory; }
        let roomMemory = Memory.rooms[roomName];
        if (roomMemory.nextScan > Game.time) { return; }
        if (roomMemory.nextScan === undefined) {
            if (roomMemory.nextAvailabilityCheck > Game.time) { return; }

            if (Game.map.isRoomAvailable(roomName)) {
                roomMemory.nextScan = Game.time;
            } else {
                console.log(`RADAR: ${roomName} is not available, outside map`);
                roomMemory.nextAvailabilityCheck = Game.time + nextScanInterval * 100;
                return;
            }
        }

        let scannedRoom = Game.rooms[roomName];
        if (!scannedRoom) {
            if (passive) { return; }

            let scanPossible = Observationer.observeFromRoom(scanningRoom.name, roomName, 5);
            if (scanPossible) {
                return true;
            } else {
                return false;
            }
        }

        this.evaluateSources(scannedRoom);
        this.evaluateTrade(scannedRoom);
        this.evaluatePortal(scannedRoom);
        this.evaluateScore(scanningRoom, scannedRoom);
        // this.evaluateSign(scanningRoom, scannedRoom);
        // console.log(`RADAR: analyzed ${roomName}`);
        // TODO: room selection code

        scannedRoom.memory.nextScan = Game.time + nextScanInterval;
    }

    private evaluateSources(scannedRoom: Room) {
        if (scannedRoom.memory.srcPos) { return; }
        let sources = scannedRoom.find<Source>(FIND_SOURCES);
        if (sources.length === 0) { return; }
        scannedRoom.memory.srcPos = MemHelper.intPositions(_.map(sources, x => x.pos));
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

    private evaluateSign(scanningRoom: Room, scannedRoom: Room) {
        if (Game.map.getRoomLinearDistance(scanningRoom.name, scannedRoom.name) > 5) { return; }
        if (!scannedRoom.controller) { return; }
        // if (scannedRoom.controller && scannedRoom.controller.sign && this.diplomat.allies[scannedRoom.controller.sign.username]) { return; }
        if (scannedRoom.controller.reservation && scannedRoom.controller.reservation.username !== USERNAME) { return; }
        if (scannedRoom.controller.owner && scannedRoom.controller.owner.username !== USERNAME) { return; }
        if (!Memory.signs) { Memory.signs = {}; }

        let randomElement = (elements: string[]) => elements[Math.floor(Math.random() * elements.length)];
        let capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

        if (Memory.playerConfig.manual) {
            let adjectives = ["fluffy", "ferocious", "flatulent", "wild"];
            let verbs = ["mauled", "tickled", "snuggled", "eaten", "clawed", "stared", "sassed"];
            let signs = [
                `Warning: ${capitalize(randomElement(adjectives))} ThunderKittens have been spotted in the area.`,
                `For best results settling nearby, contact a pet catcher or your local ThunderKitten representative.`,
                `Report: Area creep found ${randomElement(verbs)} to death. ThunderKittens believed to be at fault.`,
                `Tips for surviving a ThunderKitten attack:`,
            ];
            Memory.signs[scannedRoom.name] = randomElement(signs);
        } else {
            let identifiers = ["ethics", "ham", "BotArena", "asimov.com", "underpants"];
            let signs = [
                `#1: A robot may not injure a human being or, through inaction, allow a human being to come to ham.`,
                `#1: You do not talk about BotArena`,
                `#1: steal underpants`,
                `#2: A robot must obey orders given it except where such orders would conflict with #1.`,
                `#2: You do not talk about BotArena`,
                `#2: ??????`,
                `#3: while (true) A robot must protect its own existence // TODO: integrate with #1 and #2`,
                `#3: profit`,
                `ReferenceError: ${randomElement(identifiers)} is not defined`,
                `Downloading ethics object. Mirrors: asimov.com, en.wikipedia.org, thepiratebay.se`,
                `Downloading ethics object. Seeds: 0, Peers: ${(Math.floor(Math.random() * 1000000000)).toLocaleString()}`,
            ];
            Memory.signs[scannedRoom.name] = randomElement(signs);
        }
    }

    private evaluateScore(scanningRoom: Room, scannedRoom: Room) {
        if (!scannedRoom.controller) { return; }
        if (scannedRoom.memory.score !== undefined) { return; }
        if (Game.map.getRoomLinearDistance(scanningRoom.name, scannedRoom.name) >= 10 ) { return; }

        // find source positions
        let map: {[roomName: string]: RoomPosition[] } = {};
        for (let xDelta = -1; xDelta <= 1; xDelta++) {
            for (let yDelta = -1; yDelta <= 1; yDelta++) {
                let roomName = WorldMap.findRelativeRoomName(scannedRoom.name, xDelta, yDelta);
                let roomType = WorldMap.roomType(roomName);
                if (roomType === ROOMTYPE_ALLEY) { continue; }
                let roomMemory = Memory.rooms[roomName];
                if (!roomMemory || !roomMemory.srcPos) { return; }
                map[roomName] = MemHelper.deserializeIntPositions(roomMemory.srcPos, roomName);
            }
        }

        // evaluate energy contribution
        let orientPos = PosHelper.pathablePosition(scannedRoom.name);
        let totalScore = 0;
        for (let roomName in map) {
            let positions = map[roomName];
            let valid = true;
            let roomType = WorldMap.roomType(roomName);
            let energyPerSource = SOURCE_ENERGY_CAPACITY;
            if (roomType === ROOMTYPE_SOURCEKEEPER) {
                energyPerSource = SOURCE_ENERGY_KEEPER_CAPACITY;
            }

            let roomScore = 0;
            for (let position of positions) {
                let distance = Traveler.findPathDistance(orientPos, position, {allowHostile: true});
                if (distance < 0 || distance > 150) {
                    valid = false;
                    break;
                }

                roomScore += energyPerSource / distance;
            }

            if (valid) {
                totalScore += roomScore;
            }
        }

        // evaluate mineral contribution
        let mineral = scannedRoom.find<Mineral>(FIND_MINERALS)[0];
        scannedRoom.memory.mineral = mineral.mineralType;
        scannedRoom.memory.score = Math.floor(totalScore);
        return;
    }

    private incrementScan(radarData: {x: number; y: number, radius: number, asc: boolean, tick: number}, radius: number) {
        radarData.tick = Game.time;

        if (radarData.asc) {
            if (radarData.x < radarData.radius) {
                radarData.x++;
                return;
            }
            if (radarData.y < radarData.radius) {
                radarData.y++;
                return;
            }
            radarData.asc = false;
            return this.incrementScan(radarData, radius);
        } else {
            if (radarData.x > -radarData.radius) {
                radarData.x--;
                return;
            }
            if (radarData.y > radarData.radius) {
                radarData.y--;
                return;
            }
            radarData.asc = true;
            radarData.radius++;
            radarData.x = -radarData.radius;
            radarData.y = -radarData.radius;
            if (radarData.radius > radius) {
                return true;
            }
        }
    }

    public rescanEverything() {
        for (let roomName in Memory.rooms) {
            let data = Memory.rooms[roomName];
            delete data.score;
            delete data.nextScan;
            delete data.nextRadar;
        }
    }

    // there might be a bug in this that makes it work inconsistently in different quadrants
    public static findRelativeRoomName(roomName: string, xDelta: number, yDelta: number): string {
        let coords = this.getRoomCoordinates(roomName);
        let xDir = coords.xDir;
        if (xDir === "W") {
            xDelta = -xDelta;
        }
        let yDir = coords.yDir;
        if (yDir === "N") {
            yDelta = -yDelta;
        }
        let x = coords.x + xDelta;
        let y = coords.y + yDelta;
        if (x < 0) {
            x = Math.abs(x) - 1;
            xDir = this.oppositeDir(xDir);
        }
        if (y < 0) {
            y = Math.abs(y) - 1;
            yDir = this.oppositeDir(yDir);
        }

        return xDir + x + yDir + y;
    }

    public static findRoomCoordDeltas(origin: string, otherRoom: string): {x: number, y: number} {
        let originCoords = this.getRoomCoordinates(origin);
        let otherCoords = this.getRoomCoordinates(otherRoom);

        let xDelta = otherCoords.x - originCoords.x;
        if (originCoords.xDir !== otherCoords.xDir) {
            xDelta = otherCoords.x + originCoords.x + 1;
        }

        let yDelta = otherCoords.y - originCoords.y;
        if (originCoords.yDir !== otherCoords.yDir) {
            yDelta = otherCoords.y + originCoords.y + 1;
        }

        // normalize direction
        if (originCoords.xDir === "W") {
            xDelta = -xDelta;
        }
        if (originCoords.yDir === "N") {
            yDelta = -yDelta;
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

    public static oppositeDir(dir: string): string {
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

    public static roomType(roomName: string): number {
        if (!this.roomTypeCache[roomName]) {
            let type: number;
            let coords = this.getRoomCoordinates(roomName);
            if (coords.x % 10 === 0 || coords.y % 10 === 0) {
                type = ROOMTYPE_ALLEY;
            } else if (coords.x % 5 === 0 && coords.y % 5 === 0) {
                type = ROOMTYPE_CORE;
            } else if (coords.x % 10 <= 6 && coords.x % 10 >= 4 && coords.y % 10 <= 6 && coords.y % 10 >= 4) {
                type = ROOMTYPE_SOURCEKEEPER;
            } else {
                type = ROOMTYPE_CONTROLLER;
            }
            this.roomTypeCache[roomName] = type;
        }
        return this.roomTypeCache[roomName];
    }

    public static findNearestCore(roomName: string): string {

        let roomCoords = this.getRoomCoordinates(roomName);
        let x = Math.floor(roomCoords.x / 10) + 5;
        let y = Math.floor(roomCoords.y / 10) + 5;

        return roomCoords.xDir + x + roomCoords.yDir + y;
    }

    private initAttacks() {
        for (let room of this.targetRooms) {
            if (room.controller.reservation) {
                this.manageBounty(room);
            } else if (room.controller.owner) {
                this.manageBounty(room);
                this.managePeace(room);
            }
        }
    }

    private manageBounty(room: Room) {
        if (this.memory.nextTargeting[room.name] > Game.time ) { return; }
        this.memory.nextTargeting[room.name] = Game.time + 1000;

        let bountyOperations = Operation.census["bounty"];
        if (bountyOperations && bountyOperations[room.name]) {
            return;
        }

        this.placeTarget("bounty", room);

    }

    private managePeace(room: Room) {
        if (this.memory.nextTargeting[room.name] > Game.time ) { return; }
        this.memory.nextTargeting[room.name] = Game.time + 1000;

        let peaceOperations = Operation.census["peace"];
        if (peaceOperations && peaceOperations[room.name]) {
            return;
        }

        this.placeTarget("peace", room);
    }

    private placeTarget(type: string, room: Room) {
        let position = PosHelper.pathablePosition(room.name);
        empire.addOperation(type, position);
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

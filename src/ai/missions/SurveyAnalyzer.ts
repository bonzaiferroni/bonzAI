import {SurveyMission} from "./SurveyMission";
import {helper} from "../../helpers/helper";
import {SpawnGroup} from "../SpawnGroup";
import {Notifier} from "../../notifier";
import {Mission} from "./Mission";
import {WorldMap, ROOMTYPE_ALLEY, ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CORE} from "../WorldMap";
import {Traveler} from "../Traveler";
import {USERNAME} from "../../config/constants";
import {empire} from "../Empire";
import {PosHelper} from "../../helpers/PosHelper";
import {Profiler} from "../../Profiler";
import {Operation} from "../operations/Operation";

interface SurveyData {
    danger: boolean;
    chooseAgainDelay?: number;
    mineralType?: string;
    sourceCount?: number;
    averageDistance?: number;
    owner?: string;
    nextOwnerCheck?: number;
    hasWalls?: boolean;
}

export class SurveyAnalyzer {

    private room: Room;
    private spawnGroup: SpawnGroup;
    private opName: string;
    private memory: {
        chosenRoom: string;
        nextAnalysis: number;
        surveyRooms: {[roomName: string]: SurveyData};
        dataComplete: boolean;
    };

    constructor(mission: SurveyMission) {
        this.room = mission.room;
        this.spawnGroup = mission.spawnGroup;
        this.memory = mission.memory as any;
        this.opName = mission.operation.name;
    }

    public run(): string {

        // place flag in chosen missionRoom
        if (this.memory.nextAnalysis > Game.time) { return; }
        if (!empire.underCPULimit()) {
            this.memory.nextAnalysis = Game.time + 100;
            return;
        }
        if (!this.underMinerLimit()) {
            this.memory.nextAnalysis = Game.time + 100;
            return;
        }
        if (!this.findOriginPos()) { return; }

        if (this.memory.chosenRoom) {
            let room = Game.rooms[this.memory.chosenRoom];
            if (room) {
                this.placeFlag(room);
                delete this.memory.chosenRoom;
                if (Object.keys(this.memory.surveyRooms).length === 0) {
                    Notifier.log(`SURVEY: no more rooms to evaluate in ${this.room.name}`);
                } else {
                    this.memory.nextAnalysis = Game.time + helper.randomInterval(1000);
                }
            }
            return this.memory.chosenRoom;
        }

        // analyze rooms
        let exploreRoomName;
        if (!this.memory.surveyRooms) { this.memory.surveyRooms = this.initSurveyData(); }
        exploreRoomName = this.completeSurveyData(this.memory.surveyRooms);
        if (exploreRoomName) { return exploreRoomName; }
        exploreRoomName = this.updateOwnershipData();
        if (exploreRoomName) { return exploreRoomName; }

        let chosenRoom;
        let readyList = this.checkReady();
        if (readyList && Object.keys(readyList).length > 0) {
            chosenRoom = this.chooseRoom(readyList);
        }
        if (chosenRoom) {
            this.memory.surveyRooms[chosenRoom].chooseAgainDelay = Game.time + 100000;
            this.memory.chosenRoom = chosenRoom;
        } else if (this.memory.nextAnalysis < Game.time) {
            this.memory.nextAnalysis = Game.time + helper.randomInterval(1000);
        }

    }

    private initSurveyData(): {[roomName: string]: SurveyData} {
        let data: {[roomName: string]: SurveyData} = {};

        // find core
        let roomCoords = WorldMap.getRoomCoordinates(this.room.name);
        let coreX = "" + Math.floor(roomCoords.x / 10) + 5;
        let coreY = "" + Math.floor(roomCoords.y / 10) + 5;
        let nearestCore = roomCoords.xDir + coreX + roomCoords.yDir + coreY;
        if (Game.map.getRoomLinearDistance(this.room.name, nearestCore)) {
            data[nearestCore] = { danger: true };
        }

        let adjacentRoomNames = this.findAdjacentRooms(this.room.name, 1, [ROOMTYPE_ALLEY]);
        for (let roomName of adjacentRoomNames) {

            let noSafePath = false;
            let roomsInPath = Traveler.findRoute(this.room.name, roomName,
                { allowHostile: true, restrictDistance: 1, useFindRoute: true });
            if (roomsInPath) {
                for (let roomName in roomsInPath) {
                    if (Traveler.checkAvoid(roomName)) {
                        noSafePath = true;
                    }
                }
            } else {
                noSafePath = true;
            }

            let type = WorldMap.roomType(roomName);
            if (type === ROOMTYPE_SOURCEKEEPER || noSafePath) {
                data[roomName] = { danger: true };
            } else {
                data[roomName] = { danger: false };
            }
        }

        return data;
    }

    private findAdjacentRooms(startRoomName: string, distance = 1, filterOut: number[] = []): string[] {
        let alreadyChecked: {[roomName: string]: boolean } = { [startRoomName]: true };
        let adjacentRooms: string[] = [];
        let testRooms: string[] = [startRoomName];
        while (testRooms.length > 0) {
            let testRoom = testRooms.pop();
            alreadyChecked[testRoom] = true;
            for (let value of _.values<string>(Game.map.describeExits(testRoom))) {
                if (alreadyChecked[value]) { continue; }
                if (Game.map.getRoomLinearDistance(startRoomName, value) > distance) { continue; }
                if (_.includes(filterOut, WorldMap.roomType(value))) { continue; }
                adjacentRooms.push(value);
                testRooms.push(value);
                alreadyChecked[value] = true;
            }
        }
        return adjacentRooms;
    }

    private completeSurveyData(surveyRooms: {[roomName: string]: SurveyData}): string {

        for (let roomName in surveyRooms) {
            let data = surveyRooms[roomName];
            if (data.sourceCount) { continue; }
            let room = Game.rooms[roomName];
            if (room) {
                this.analyzeRoom(room, data);
                continue;
            }
            if (!data.danger) {
                return roomName;
            } else {
                if (this.room.controller.level < 8) { continue; }
                return roomName;
            }
        }
    }

    private analyzeRoom(room: Room, data: SurveyData) {

        // mineral
        let mineral = room.find<Mineral>(FIND_MINERALS)[0];
        if (mineral) {
            data.mineralType = mineral.mineralType;
        }

        // owner
        data.owner = this.checkOwnership(room);
        data.nextOwnerCheck = Game.time + helper.randomInterval(10000);
        if (data.owner === USERNAME) {
            return;
        }

        // origin
        let originPos = this.findOriginPos();

        // source info
        let roomDistance = Game.map.getRoomLinearDistance(this.room.name, room.name);
        let sources = room.find<Source>(FIND_SOURCES);
        if (sources.length === 0) {
            delete this.memory.surveyRooms[room.name];
            return;
        }
        let distances = [];
        data.sourceCount = sources.length;

        for (let source of sources) {
            let ret = PathFinder.search(originPos, { pos: source.pos, range: 1}, {
                swampCost: 1,
                plainCost: 1,
                roomCallback: (roomName: string) => {
                    if (Game.map.getRoomLinearDistance(this.room.name, roomName) > roomDistance) {
                        return false;
                    }
                },
            });
            if (ret.incomplete) {
                Notifier.log(`SURVEY: Incomplete path from ${originPos} to ${source.pos}`);
            }

            let pathDanger = this.findPathDanger(ret.path);
            if (pathDanger) {
                data.danger = true;
            }

            let distance = ret.path.length;
            distances.push(distance);
            let cartsNeeded = Mission.analyzeTransport(distance, Mission.loadFromSource(source), 12900).cartsNeeded;

            // disqualify due to source distance
            if (cartsNeeded > data.sourceCount) {
                Notifier.log(`SURVEY: disqualified ${room.name} due to distance to source: ${cartsNeeded}`);
                delete this.memory.surveyRooms[room.name];
                return;
            }
        }
        data.averageDistance = _.sum(distances) / distances.length;

        // walls
        data.hasWalls = room.findStructures(STRUCTURE_WALL).length > 0;
    }

    private checkOwnership(room: Room): string {
        let flags = room.find<Flag>(FIND_FLAGS);
        for (let flag of flags) {
            if (flag.name.indexOf("mining") >= 0 || flag.name.indexOf("keeper") >= 0) {
                return USERNAME;
            }
        }

        if (room.controller) {
            if (room.controller.reservation) {
                return room.controller.reservation.username;
            } else if (room.controller.owner) {
                return room.controller.owner.username;
            }
        } else {
            for (let source of room.find<Source>(FIND_SOURCES)) {
                let nearbyCreeps = _.filter(source.pos.findInRange<Creep>(FIND_CREEPS, 1),
                    (c: Creep) => !c.owner || c.owner.username !== "Source Keeper");
                if (nearbyCreeps.length === 0) { continue; }
                return nearbyCreeps[0].owner.username;
            }
        }
    }

    private updateOwnershipData(): string {

        for (let roomName in this.memory.surveyRooms) {
            let data = this.memory.surveyRooms[roomName];
            // owner
            if (Game.time > data.nextOwnerCheck) {
                let room = Game.rooms[roomName];
                if (room) {
                    data.owner = this.checkOwnership(room);
                } else {
                    return roomName;
                }
            }
        }
    }

    private checkReady(): {[roomName: string]: SurveyData} {

        if (this.spawnGroup.refillEfficiency < .5) {
            console.log(`SURVEY: poor spawn refill efficiency`);
            this.memory.nextAnalysis = Game.time + helper.randomInterval(1000);
            return;
        }

        let readyList = {};

        for (let roomName in this.memory.surveyRooms) {
            let data = this.memory.surveyRooms[roomName];
            // owner
            if (!data.sourceCount ) { continue; }
            // don't claim rooms if any nearby rooms with another owner
            if (data.owner) { continue; }
            if (data.chooseAgainDelay > Game.time) { continue; }
            let roomType = WorldMap.roomType(roomName);
            if (roomType === ROOMTYPE_SOURCEKEEPER && this.room.controller.level < 7) { continue; }

            // TODO: handle core settlement
            if (Game.map.getRoomLinearDistance(this.room.name, roomName) > 1) { continue; }
            readyList[roomName] = data;
        }

        return readyList;
    }

    private chooseRoom(readySurveyRooms: {[roomName: string]: SurveyData}): string {

        let bestScore = 0;
        let bestChoice;
        for (let roomName in readySurveyRooms) {
            let data = readySurveyRooms[roomName];
            let score = data.sourceCount * 50 - data.averageDistance;
            if (score > bestScore) {
                bestChoice = roomName;
                bestScore = score;
            }
        }

        return bestChoice;
    }

    private placeFlag(room: Room) {

        let opType = "mining";
        if (WorldMap.roomType(room.name) === ROOMTYPE_SOURCEKEEPER) {
            opType = "keeper";
        } else if (WorldMap.roomType(room.name) === ROOMTYPE_CORE) {
        }
        let position = PosHelper.pathablePosition(room.name);
        empire.addOperation(opType, position);
    }

    private underMinerLimit() {
        let supportCount = this.findSupportedRooms();
        if (this.room.controller.level < 7) {
            return supportCount < 4;
        } else if (this.room.controller.level === 7) {
            return supportCount < 8;
        } else {
            return supportCount < 16;
        }
    }

    private findOriginPos(): RoomPosition {
        let origin: Structure = this.room.storage;
        if (!origin) {
            origin = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            if (!origin) {
                return;
            }
        }
        return origin.pos;
    }

    private findPathDanger(path: RoomPosition[]) {
        let roomsChecked: {[roomName: string]: boolean} = {};

        for (let position of path) {
            if (roomsChecked[position.roomName]) { continue; }
            roomsChecked[position.roomName] = true;
            let roomType = WorldMap.roomType(position.roomName);
            if (roomType === ROOMTYPE_SOURCEKEEPER) {
                return true;
            }
        }
    }

    private findSupportedRooms() {
        let supportedCount = 0;
        let keeperOperations = Operation.census["keeper"];
        if (keeperOperations) {
            for (let roomName in keeperOperations) {
                if (Game.map.getRoomLinearDistance(this.room.name, roomName) > 2) { continue; }
                let operations = keeperOperations[roomName];
                for (let opName in operations) {
                    let operation = operations[opName];
                    if (!operation.spawnGroup || operation.spawnGroup.pos.roomName === this.room.name) {
                        supportedCount += 3;
                    }
                }
            }
        }

        let miningOperations = Operation.census["mining"];
        if (miningOperations) {
            for (let roomName in miningOperations) {
                if (Game.map.getRoomLinearDistance(this.room.name, roomName) > 2) { continue; }
                let operations = miningOperations[roomName];
                for (let opName in operations) {
                    let operation = operations[opName];
                    if (!operation.spawnGroup || operation.spawnGroup.pos.roomName === this.room.name) {
                        let sourceCount = 2;
                        let room = Game.rooms[roomName];
                        if (room) {
                            sourceCount = room.find(FIND_SOURCES).length;
                        }
                        supportedCount += sourceCount;
                    }
                }
            }
        }
        return supportedCount;
    }
}

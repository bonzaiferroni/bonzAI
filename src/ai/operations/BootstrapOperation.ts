import {Operation, OperationMemory} from "./Operation";
import {OperationPriority, USERNAME} from "../../config/constants";
import {empire} from "../Empire";
import {BootstrapMiningData, BootstrapMiningMission} from "../missions/BootstrapMinerMission";
import {ROOMTYPE_CONTROLLER, WorldMap} from "../WorldMap";
import {PosHelper} from "../../helpers/PosHelper";
import {Traveler} from "../Traveler";
import {BootMiningGuru} from "../missions/BootMiningGuru";
import {BootstrapBuilderMission} from "../missions/BootstrapBuilderMission";
import {Mission} from "../missions/Mission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {CreepHelper} from "../../helpers/CreepHelper";

interface BootstrapOperationMemory extends OperationMemory {
    addRooms: string[];
    roomData: {[roomName: string]: BootstrapMiningData[] };
    bootGuru: any;
    spawnDelay: {[roomName: string]: number};
    dangerDelay: {[roomName: string]: number};
}

export class BootstrapOperation extends Operation {

    public memory: BootstrapOperationMemory;
    private static bootCensus: {[roomName: string]: string } = {};

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        let room = Game.rooms[this.roomName];
        if (!room || room.controller.level >= 3) {
            this.priority = OperationPriority.VeryLow;
        } else {
            this.priority = OperationPriority.Emergency;
        }
    }

    protected init() {
        if (!this.memory.roomData) { this.memory.roomData = {}; }
        if (!this.memory.spawnDelay) { this.memory.spawnDelay = {}; }
        if (!this.memory.dangerDelay) { this.memory.dangerDelay = {}; }
    }

    private addMissions() {
        if (!this.memory.roomData) { return; }

        this.spawnGroup = empire.getSpawnGroup(this.roomName);
        if (!this.spawnGroup) { return; }

        let guru = new BootMiningGuru(this);

        let bodyguardMission = new BodyguardMission(this, this.roomName);
        this.addMissionLate(bodyguardMission);

        let builderMission = new BootstrapBuilderMission(this);
        this.addMissionLate(builderMission);
        builderMission.allowSpawn = guru.spawnSaturated() && this.room.storage === undefined;

        let sentGuard = false;
        for (let roomName in this.memory.roomData) {
            let allowSpawn = this.checkAllowSpawn(roomName);
            if (!sentGuard) {
                let dangerous = this.checkDangerous(roomName);
                let room = Game.rooms[roomName];
                if (!dangerous && room && room.hostiles.length > 0) {
                    sentGuard = true;
                    bodyguardMission.updateTargetRoom(roomName);
                }
            }

            let index = 0;
            let roomData = this.memory.roomData[roomName];
            if (!roomData) { continue; }
            for (let data of roomData) {
                let mission = new BootstrapMiningMission(this, index, data, guru);
                this.addMissionLate(mission);
                mission.allowSpawn = allowSpawn;
                index++;
            }
        }
    }

    protected update() {
        this.findAddRooms();
        this.findRoomData();
        this.addMissions();
    }

    protected finalize() {
        if (this.room && this.room.controller.level === 8) {
            delete Memory.flags[`${this.type}_${this.name}`];
            this.flag.remove();
        }
    }

    protected invalidateCache() {
    }

    private findAddRooms() {
        if (!this.room) { return; }

        let spawn = this.room.findStructures(STRUCTURE_SPAWN)[0];
        if (!spawn) { return; }

        if (!this.memory.addRooms) {
            let originPos = spawn.pos;
            let roomNames = [];
            let distances: {[roomName: string]: number } = {};
            for (let xDelta = -2; xDelta <= 2; xDelta++) {
                for (let yDelta = -2; yDelta <= 2; yDelta++) {

                    let roomName = WorldMap.findRelativeRoomName(this.roomName, xDelta, yDelta);
                    let roomType = WorldMap.roomType(roomName);
                    if (roomType !== ROOMTYPE_CONTROLLER) { continue; }
                    if (!Game.map.isRoomAvailable(roomName)) { continue; }

                    // disqualify/sort based on distance
                    let position = PosHelper.pathablePosition(roomName);
                    let distance = Traveler.findPathDistance(originPos, position);
                    if (distance < 0 || distance > 150) { continue; }
                    roomNames.push(roomName);
                    distances[roomName] = distance;
                }
            }
            this.memory.addRooms = _.sortBy(roomNames, x => distances[x]);
        }
    }

    private findRoomData() {
        if (!this.room) { return; }
        if (!this.memory.addRooms) { return; }

        for (let roomName of this.memory.addRooms) {
            if (!this.memory.roomData[roomName]) {
                this.memory.roomData[roomName] = this.exploreRoom(roomName);
                return;
            }
        }
    }

    private exploreRoom(roomName: string): BootstrapMiningData[] {
        let room = Game.rooms[roomName];
        if (room) {
            let originPos = this.room.findStructures(STRUCTURE_SPAWN)[0].pos;
            let array: BootstrapMiningData[] = [];
            let sources = room.find<Source>(FIND_SOURCES);
            for (let source of sources) {
                let ret = Traveler.findTravelPath(originPos, source, {range: 1});
                if (ret.incomplete) {
                    console.log(`BOOTSTRAP: unable to reach source at ${source.pos}`);
                    continue;
                }
                let containerPos = this.findContainerPos(source, _.last(ret.path));
                array.push({
                    sourceId: source.id,
                    containerPos: containerPos,
                    posCount: source.pos.openAdjacentSpots(true).length,
                    distance: ret.path.length,
                    spawnDelay: undefined,
                });
            }
            return array;
        } else {
            let creepName = `${this.name}_bootExplorer`;
            let creep = Game.creeps[creepName];
            if (creep) {
                let position = PosHelper.pathablePosition(roomName);
                Traveler.travelTo(creep, position, {offRoad: true});
            } else {
                if (Object.keys(Game.creeps).length < 6) { return; }
                empire.spawnFromClosest(this.roomName, [MOVE], creepName, true);
            }
        }
    }

    private findContainerPos(source: Source, orientPos: RoomPosition) {
        let container = source.pos.findInRange(source.room.findStructures(STRUCTURE_CONTAINER), 1)[0];
        if (container) {
            return container.pos;
        }
        let site = source.pos.findInRange(_.filter(source.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES),
            x => x.structureType === STRUCTURE_CONTAINER), 1)[0];
        if (site) {
            return site.pos;
        }

        let positions = source.pos.openAdjacentSpots(true);
        let bestPos = _(positions)
            .filter(x => x.isNearTo(orientPos))
            .max(x => x.findInRange(positions, 1).length);
        if (_.isObject(bestPos)) {
            return bestPos;
        } else {
            return orientPos;
        }
    }

    private checkAllowSpawn(roomName: string): boolean {
        if (this.memory.spawnDelay[roomName] > Game.time) { return false; }
        if (this.memory.dangerDelay[roomName] > Game.time) { return false; }

        let roomMemory = Memory.rooms[roomName];
        if (roomMemory && roomMemory.owner && roomMemory.owner !== USERNAME) {
            this.memory.spawnDelay[roomName] = Game.time + 3000;
            return false;
        }

        let currentBootOp = BootstrapOperation.bootCensus[roomName];
        if (currentBootOp && currentBootOp !== this.name) {
            this.memory.spawnDelay[roomName] = Game.time + 3000;
            return false;
        }
        BootstrapOperation.bootCensus[roomName] = this.name;

        let room = Game.rooms[roomName];
        if (!room) {
            return true;
        }

        let attacker = _.find(room.hostiles, x => CreepHelper.partCount(x, ATTACK) + CreepHelper.partCount(x, RANGED_ATTACK) > 0);
        if (attacker) {
            this.memory.spawnDelay[roomName] = Game.time + attacker.ticksToLive;
            return false;
        }

        if (Math.random() > .9) {
            for (let missionName in Mission.census[roomName]) {
                if (missionName !== "miner0") { continue; }
                let mission = Mission.census[roomName][missionName];
                if (mission.roleCount("miner0") > 0) {
                    this.memory.spawnDelay[roomName] = Game.time + 3000;
                    return false;
                }
            }
        }

        if (room.controller && room.controller.reservation) {
            this.memory.spawnDelay[roomName] = Game.time + 3000;
            return false;
        }

        return true;
    }

    private checkDangerous(roomName: string): boolean {
        if (this.memory.dangerDelay[roomName] > Game.time) { return true; }

        let room = Game.rooms[roomName];
        if (!room) {
            return false;
        }

        let hostileDanger = _.find(this.room.hostiles,
                x => !CreepHelper.isNpc(x) && CreepHelper.rating(x) > 100);
        if (hostileDanger) {
            this.memory.dangerDelay[roomName] = Game.time + hostileDanger.ticksToLive * 2;
            return true;
        }

        if (room.memory.avoid) {
            this.memory.dangerDelay[roomName] = Game.time + 10000;
            return true;
        }
    }
}

import {Scheduler} from "../Scheduler";
import {core} from "./Empire";
import {Notifier} from "../notifier";
import {Observationer} from "./Observationer";
import {PosHelper} from "../helpers/PosHelper";
import {ROOMTYPE_CONTROLLER, WorldMap} from "./WorldMap";
import {Viz} from "../helpers/Viz";
import {helper} from "../helpers/helper";
import {MemHelper} from "../helpers/MemHelper";
import {Tick} from "../Tick";
import {USERNAME} from "../config/constants";
import {Traveler} from "../Traveler";
export class RoomPlanter {
    private static memory: {
        checkPlant: number;
        chosen: string;
        chosenCount: number;
        chooseAgainDelay: {[roomName: string]: number }
        available: {[roomName: string]: boolean }
        abortPlant: number;
        growing: string;
        chosenTick: number;
        yDelta: number;
        xDelta: number;
    };
    private static visCache: {
        pos: RoomPosition,
        color: string,
        opacity?: number,
    }[];

    public static initMemory() {
        if (!Memory.roomPlanter) { Memory.roomPlanter = {}; }
        this.memory = Memory.roomPlanter;
        if (!this.memory.chooseAgainDelay) { this.memory.chooseAgainDelay = {}; }
        if (!this.memory.available) { this.memory.available = {}; }
    }

    public static update() {
        this.initMemory();
        this.visualizeChoiceMap();

        let planting = this.plantChosen();
        if (planting) { return; }

        let growing = this.checkGrowth();
        if (growing) { return; }

        this.chooseRoom();
    }

    private static plantChosen(): boolean {
        if (this.memory.chosen) {
            let room = Game.rooms[this.memory.chosen];
            if (room) {
                let position = PosHelper.pathablePosition(this.memory.chosen);
                core.addOperation("layout", position);
                this.memory.growing = this.memory.chosen;
                this.memory.abortPlant = Game.time + 5000;
                delete this.memory.chosen;
            } else {
                Observationer.observeRoom(this.memory.chosen, 0);
            }
            return true;
        }
    }

    private static checkGrowth() {
        if (this.memory.growing) {

            if (Game.time > this.memory.abortPlant) {
                delete this.memory.abortPlant;
                delete this.memory.growing;
            }

            let room = Game.rooms[this.memory.growing];
            if (room && room.controller && room.controller.my) {
                let spawn = room.findStructures<StructureSpawn>(STRUCTURE_SPAWN)[0];
                if (spawn && spawn.my) {
                    delete this.memory.abortPlant;
                    delete this.memory.growing;
                }
            }
            return true;
        }
    }

    private static chooseRoom() {
        if (Memory.playerConfig.manual) { return; }
        let controlledCount = core.map.controlledRoomCount;
        if (controlledCount === 0 || controlledCount >= Game.gcl.level) { return; }
        if (Scheduler.delay(this.memory, "checkPlant", 1000)) { return; }

        // find potential rooms
        let bestRoomName;
        let bestScore = -Number.MAX_VALUE;
        for (let roomName in Memory.rooms) {
            let roomMemory = Memory.rooms[roomName];
            if (!roomMemory.score) { continue; }
            if (this.memory.chooseAgainDelay[roomName] > Game.time) { continue; }
            if (this.memory.available[roomName] === undefined || Math.random() > .9) {
                this.memory.available[roomName] = Game.map.isRoomAvailable(roomName);
            }

            if (!this.memory.available[roomName]) { continue; }

            let room = Game.rooms[roomName];
            if (room && room.controller && room.controller.my) {
                continue;
            }
            if (core.map.playerMap[roomName]) {
                continue;
            }

            let closestControlled = this.findClosestControlled(roomName);
            if (!closestControlled) { continue; }
            let adjacentPlayer = this.findAdjacentUsername(roomName);
            let adjustedScore = this.adjustScore(roomName, roomMemory, closestControlled, adjacentPlayer);

            if (adjustedScore > bestScore) {
                let closestSpawn = this.findClosestSpawn(roomName);
                if (!closestSpawn) { continue; }
                let origin = PosHelper.pathablePosition(closestSpawn);
                let destination = PosHelper.pathablePosition(roomName);
                let distance = Traveler.findPathDistance(origin, destination);
                if (distance < 0 || distance > 950) { continue; }
                bestRoomName = roomName;
                bestScore = adjustedScore;
            }
        }

        if (!bestRoomName) { return; }

        Notifier.log(`ROOMPLANTER: best ${bestRoomName}, score ${bestScore}`);
        this.memory.chosen = bestRoomName;
        this.memory.chooseAgainDelay[bestRoomName] = Game.time + 1000000;
    }

    private static visualizeChoiceMap() {
        if (!Memory.visRoom) { return; }

        let x = 25;
        if (this.memory.xDelta) {
            x += this.memory.xDelta;
        }
        let y = 25;
        if (this.memory.yDelta) {
            y += this.memory.yDelta;
        }
        let displayPos = new RoomPosition(x, y, Memory.visRoom);

        if (!this.visCache) {
            this.visCache = [];
            // find potential rooms
            for (let roomName in Memory.rooms) {

                if (this.memory.available[roomName] === undefined) {
                    this.memory.available[roomName] = Game.map.isRoomAvailable(roomName);
                }

                if (!this.memory.available[roomName]) { continue; }

                let roomMemory = Memory.rooms[roomName];
                let roomType = WorldMap.roomType(roomName);
                if (roomType !== ROOMTYPE_CONTROLLER) { continue; }
                let ret = WorldMap.findRoomCoordDeltas(displayPos.roomName, roomName);
                let pos = new RoomPosition(displayPos.x + ret.x, displayPos.y + ret.y, displayPos.roomName);
                let room = Game.rooms[roomName];
                if (room && room.controller && room.controller.my) {
                    this.visCache.push({pos: pos, color: "green"});
                    continue;
                }
                if (core.map.playerMap[roomName]) {
                    this.visCache.push({pos: pos, color: "red"});
                    continue;
                }
                if (roomMemory.score === undefined) {
                    this.visCache.push({pos: pos, color: "magenta"});
                    continue;
                }

                let closestControlled = this.findClosestControlled(roomName);
                if (!closestControlled) { continue; }
                let username = this.findAdjacentUsername(roomName);
                let adjustedScore = this.adjustScore(roomName, roomMemory, closestControlled, username);

                this.visCache.push({pos: pos, color: "white", opacity: adjustedScore / 1200});
            }
        }

        let estimatedChoice;
        let bestScore = -Number.MAX_VALUE;
        for (let data of this.visCache) {
            Viz.colorPos(data.pos, data.color, data.opacity);

            if (data.opacity > bestScore) {
                bestScore = data.opacity;
                estimatedChoice = data.pos;
            }
        }

        if (estimatedChoice) {
            Viz.animatedPos(estimatedChoice, "cyan", .5, .5, 18);
        }

        Notifier.addMessage(Memory.visRoom, ``);
        Notifier.addMessage(displayPos.roomName, `-----RoomPlanter-----`);
        Notifier.addMessage(displayPos.roomName, `nextCheck: ${this.memory.checkPlant - Game.time}`);
        if (this.memory.chosen) {
            Notifier.addMessage(displayPos.roomName, `chosen: ${this.memory.chosen}`);
        }
        if (this.memory.growing) {
            Notifier.addMessage(displayPos.roomName, `growing: ${this.memory.growing}`);
            Notifier.addMessage(displayPos.roomName, `growing timout: ${this.memory.abortPlant - Game.time}`);
        }
    }

    private static findClosestControlled(roomName: string): string {
        return _.min(Object.keys(core.map.controlledRooms), x => Game.map.getRoomLinearDistance(x, roomName));
    }

    private static findAdjacentUsername(roomName: string): string {
        for (let otherRoomName in core.map.playerMap) {
            let data = core.map.playerMap[otherRoomName];
            if (Game.map.getRoomLinearDistance(roomName, otherRoomName) > 1) { continue; }

            let exits = Game.map.describeExits(otherRoomName);
            for (let direction in exits) {
                let destination = exits[direction];
                if (destination === roomName) {
                    return data.owner;
                }
            }
        }
    }

    private static findClosestSpawn(roomName: string): string {
        let closestControlled = _(Object.keys(core.map.controlledRooms))
            .filter( x => {
                let spawnGroup = core.getSpawnGroup(x);
                if (!spawnGroup) { return false; }
                return spawnGroup.maxSpawnEnergy >= 950;
            })
            .min(x => Game.map.getRoomLinearDistance(x, roomName));
        if (_.isString(closestControlled)) {
            return closestControlled;
        }
    }

    private static adjustScore(roomName: string, data: RoomMemory, closestControlled: string, adjacentPlayer: string) {
        let score = data.score;

        let mineralScore = 0;
        if (data.mineral === RESOURCE_CATALYST) {
            mineralScore = 1000;
        } else if (data.mineral === RESOURCE_HYDROGEN || data.mineral === RESOURCE_OXYGEN) {
            mineralScore = 500;
        } else if (!Tick.cache.mineralCount[data.mineral]) {
            mineralScore = 500;
        }
        score += mineralScore;

        let distanceToClosest = Game.map.getRoomLinearDistance(closestControlled, roomName);
        if (distanceToClosest <= 2) {
            score *= distanceToClosest / 3;
        } else {
            score *= 3 / distanceToClosest;
        }

        if (adjacentPlayer) {
            score *= .5;
        }

        return score;
    }
}

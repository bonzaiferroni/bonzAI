import {Notifier} from "../notifier";
import {empire} from "./Empire";
import {PosHelper} from "../helpers/PosHelper";
import {CreepHelper} from "../helpers/CreepHelper";
import {TravelToReturnData} from "../Traveler/Traveler";
export class Observationer {

    public static memory: {
        observing: {[from: string]: {priority: number, toName: string }};
        spawnDelay: {[creepName: string]: number};
        unavailable: {[roomName: string]: number};
    };

    public static init() {
        if (!Memory.observ) { Memory.observ = {}; }
        _.defaultsDeep(Memory.observ, {
            observing: {},
            spawnDelay: {},
            unavailable: {},
            });
        this.memory = Memory.observ;
    }

    public static actions() {
        this.observe();
    }

    public static observeFromRoom(fromName: string, toName: string, priority: number): boolean {
        let currentRequest = this.memory.observing[fromName];
        if (currentRequest && currentRequest.priority < priority) { return true; }
        if (this.memory.unavailable[toName] > Game.time) { return false; }
        this.memory.observing[fromName] = {priority: priority, toName: toName};
        return true;
    }

    public static observeRoom(toName: string, priority: number, structureOnly = false): boolean {
        let observingRoomName = this.findObserverRoom(toName, structureOnly);
        if (!observingRoomName) {
            return false;
        }
        return this.observeFromRoom(observingRoomName, toName, priority);
    }

    private static findObserverRoom(observedRoomName: string, structureOnly: boolean): string  {
        let observer: Structure;
        let shortestDistance = Number.MAX_VALUE;
        let best: string;
        for (let observingRoomName in empire.map.controlledRooms) {
            let rangeToRoom = Game.map.getRoomLinearDistance(observedRoomName, observingRoomName);
            if (rangeToRoom > 10) { continue; }
            let room = empire.map.controlledRooms[observingRoomName];
            if (room.controller.level >= 8) {
                observer = room.findStructures(STRUCTURE_OBSERVER)[0];
                if (observer) {
                    break;
                }
            }
            if (rangeToRoom < shortestDistance) {
                shortestDistance = rangeToRoom;
                best = observingRoomName;
            }
        }

        if (observer) {
            return observer.room.name;
        } else if (structureOnly) {
            return;
        } else {
            return best;
        }
    }

    public static getObserverCreep(fromName: string): Creep {
        return Game.creeps[`${fromName}_observer`];
    }

    private static observe() {
        for (let fromName in this.memory.observing) {
            let data = this.memory.observing[fromName];
            let toRoom = Game.rooms[data.toName];
            if (toRoom) {
                delete this.memory.observing[fromName];
                continue;
            }

            let fromRoom = Game.rooms[fromName];
            if (!fromRoom) {
                delete this.memory.observing[fromName];
                Notifier.log(`OBSERVE: fromRoom has no vision`);
                continue;
            }

            let observer = fromRoom.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (observer) {
                observer.observeRoom(data.toName);
                continue;
            }

            let creepName = `${fromName}_observer`;
            let creepObserver = Game.creeps[creepName];
            if (creepObserver) {
                let estimatedTravelTime = Game.map.getRoomLinearDistance(creepObserver.pos.roomName, data.toName) * 60;
                if (estimatedTravelTime > creepObserver.ticksToLive) {
                    creepObserver.suicide();
                } else {
                    let ret = {} as TravelToReturnData;
                    CreepHelper.avoidSK(creepObserver, {pos: PosHelper.pathablePosition(data.toName) }, {
                        offRoad: true,
                        ensurePath: true,
                        returnData: ret,
                    } );

                    if (ret.pathfinderReturn && ret.pathfinderReturn.incomplete && Math.random() > .9) {
                        delete this.memory.observing[fromName];
                        this.memory.unavailable[data.toName] = Game.time + 1000;
                    }
                }
            } else {
                if (Memory.creeps) { delete Memory.creeps[creepName]; }
                if (this.memory.spawnDelay[creepName] > Game.time) { continue; }
                delete this.memory.spawnDelay[creepName];
                let outcome = empire.spawnFromClosest(fromName, [MOVE], creepName, true);
                if (_.isString(outcome)) {
                    this.memory.spawnDelay[creepName] = Game.time + 500;
                }
            }
        }
    }
}

import {helper} from "../helpers/helper";
import {initRoomPrototype} from "./initRoomPrototype";
import {initRoomPositionPrototype} from "./initRoomPositionPrototype";
export function initPrototypes() {

    initRoomPrototype();
    initRoomPositionPrototype();

    // misc prototype modifications

    /**
     * Will remember an instance of structureType that it finds within range, good for storing mining containers, etc.
     * There should only be one instance of that structureType within range, per object
     * @param structureType
     * @param range
     * @param immediate
     * @returns Structure[]
     */
    RoomObject.prototype.findMemoStructure = function<T>(structureType: string, range: number, immediate = false): T {
        if (!this.room.memory[structureType]) this.room.memory[structureType] = {};
        if (this.room.memory[structureType][this.id]) {
            let structure = Game.getObjectById(this.room.memory[structureType][this.id]);
            if (structure) {
                return structure as T;
            } else {
                this.room.memory[structureType][this.id] = undefined;
                return this.findMemoStructure(structureType, range, immediate);
            }
        } else if (Game.time % 10 === 7 || immediate) {
            let structures = this.pos.findInRange(this.room.findStructures(structureType), range);
            if (structures.length > 0) {
               this.room.memory[structureType][this.id] = structures[0].id;
               return structures[0];
            }
        }
    };

    /**
     * Looks for structure to be used as an energy holder for upgraders
     * @returns { StructureLink | StructureStorage | StructureContainer }
     */
    StructureController.prototype.getBattery = function (structureType?: string): StructureLink | StructureStorage | StructureContainer {
        if (this.room.memory.controllerBatteryId) {
            let batt = Game.getObjectById(this.room.memory.controllerBatteryId) as StructureLink | StructureStorage | StructureContainer;
            if (batt) {
                return batt;
            } else {
                this.room.memory.controllerBatteryId = undefined;
                this.room.memory.upgraderPositions = undefined;
            }
        } else {
            let battery = _(this.pos.findInRange(FIND_STRUCTURES, 3))
                .filter((structure: Structure) => {
                if (structureType) {
                    return structure.structureType === structureType;
                } else {
                    if (structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_LINK) {
                        let sourcesInRange = structure.pos.findInRange(FIND_SOURCES, 2);
                        return sourcesInRange.length === 0;
                    }
                }})
                .head() as Terminal | Link | Container;
            if (battery) {
                this.room.memory.controllerBatteryId = battery.id;
                return battery;
            }
        }
    };

    /**
     * Positions on which it is viable for an upgrader to stand relative to battery/controller
     * @returns {Array}
     */
    StructureController.prototype.getUpgraderPositions = function(): RoomPosition[] {
        if (this.upgraderPositions) {
            return this.upgraderPositions;
        }
        else {
            if (this.room.memory.upgraderPositions && Math.random() > .001) {
                this.upgraderPositions = [];
                for (let position of this.room.memory.upgraderPositions) {
                    this.upgraderPositions.push(helper.deserializeRoomPosition(position));
                }
                return this.upgraderPositions;
            } else {
                let controller = this;
                let battery = this.getBattery();
                if (!battery) { return; }

                let positions = [];
                for (let i = 1; i <= 8; i++) {
                    let position = battery.pos.getPositionAtDirection(i);
                    if (!position.isPassible(true) || !position.inRangeTo(controller, 3)
                        || position.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    positions.push(position);
                }
                this.room.memory.upgraderPositions = positions;
                return positions;
            }
        }
    };

    StructureObserver.prototype._observeRoom = StructureObserver.prototype.observeRoom;

    StructureObserver.prototype.observeRoom = function(roomName: string, purpose = "unknown", override = false): number {
        let makeObservation = (observation: Observation): number => {
            this.observation; // load the current observation before overwriting
            this.room.memory.observation = observation;
            this.alreadyObserved = true;
            return this._observeRoom(observation.roomName);
        };

        if (override) {
            return makeObservation({roomName: roomName, purpose: purpose});
        }
        else {
            if (!this.room.memory.obsQueue) this.room.memory.obsQueue = [];
            let queue = this.room.memory.obsQueue as Observation[];
            if (!_.find(queue, (item) => item.purpose === purpose)) {
                queue.push({purpose: purpose, roomName: roomName});
            }
            if (!this.alreadyObserved) {
                return makeObservation(queue.shift());
            }
            else {
                return OK;
            }
        }
    };

    Object.defineProperty(StructureObserver.prototype, "observation", {
        get: function() {
            if (!this._observation) {
                let observation = this.room.memory.observation as Observation;
                if (observation) {
                    let room = Game.rooms[observation.roomName];
                    if (room) {
                        observation.room = room;
                        this._observation = observation;
                    }
                    else {
                        // console.log("bad observation:", JSON.stringify(observation));
                    }
                }
            }
            return this._observation;
        }
    });

    StructureTerminal.prototype._send = StructureTerminal.prototype.send;

    StructureTerminal.prototype.send = function(resourceType: string, amount: number, roomName: string, description?: string) {
        if (this.alreadySent) {
            return ERR_BUSY;
        }
        else {
            this.alreadySent = true;
            return this._send(resourceType, amount, roomName, description);
        }
    };

    StructureTower.prototype._repair = StructureTower.prototype.repair;
    StructureTower.prototype.repair = function (target: Structure | Spawn): number {
        if (!this.alreadyFired) {
            this.alreadyFired = true;
            return this._repair(target);
        }
        else {
            return ERR_BUSY;
        }
    };

    Creep.prototype.partCount = function(partType: string): number {
        let count = 0;
        for (let part of this.body) {
            if (part.type === partType) {
                count++;
            }
        }
        return count;
    };

    /**
     * General-purpose cpu-efficient movement function that uses ignoreCreeps: true, a high reusePath value and stuck-detection
     * @param destination
     * @param ops - pathfinding ops, ignoreCreeps and reusePath will be overwritten
     * @param dareDevil
     * @returns {number} - Error code
     */
    Creep.prototype.blindMoveTo = function(destination: RoomPosition | {pos: RoomPosition}, ops?: any, dareDevil = false): number {

        if (this.spawning) {
            return 0;
        }

        if (this.fatigue > 0) {
            return ERR_TIRED;
        }

        if (!this.memory.position) {
            this.memory.position = this.pos;
        }

        if (!ops) {
            ops = {};
        }

        // check if trying to move last tick
        let movingLastTick = true;
        if (!this.memory.lastTickMoving) this.memory.lastTickMoving = 0;
        if (Game.time - this.memory.lastTickMoving > 1) {
            movingLastTick = false;
        }
        this.memory.lastTickMoving = Game.time;

        // check if stuck
        let stuck = this.pos.inRangeTo(this.memory.position.x, this.memory.position.y, 0);
        this.memory.position = this.pos;
        if (stuck && movingLastTick) {
            if (!this.memory.stuckCount) this.memory.stuckCount = 0;
            this.memory.stuckCount++;
            if (dareDevil && this.memory.stuckCount > 0) {
                this.memory.detourTicks = 5;
            }
            else if (this.memory.stuckCount >= 2) {
                this.memory.detourTicks = 5;
                // this.say("excuse me", true);
            }
            if (this.memory.stuckCount > 500 && !this.memory.stuckNoted) {
                console.log(this.name, "is stuck at", this.pos, "stuckCount:", this.memory.stuckCount);
                this.memory.stuckNoted = true;
            }
        }
        else {
            this.memory.stuckCount = 0;
        }

        if (this.memory.detourTicks > 0) {
            this.memory.detourTicks--;
            if (dareDevil) {
                ops.reusePath = 0;
            }
            else {
                ops.reusePath = 5;
            }
            return this.moveTo(destination, ops);
        }
        else {
            ops.reusePath = 50;
            ops.ignoreCreeps = true;
            return this.moveTo(destination, ops);
        }
    };
}
import {helper} from "../helpers/helper";
import {initRoomPrototype} from "./initRoomPrototype";
import {initRoomPositionPrototype} from "./initRoomPositionPrototype";
export function initPrototypes() {

    initRoomPrototype();
    initRoomPositionPrototype();

    // misc prototype modifications
    StructureTerminal.prototype._send = StructureTerminal.prototype.send;

    StructureTerminal.prototype.send = function(resourceType: string, amount: number, roomName: string,
                                                description?: string) {
        if (this.alreadySent) {
            return ERR_BUSY;
        } else {
            this.alreadySent = true;
            return this._send(resourceType, amount, roomName, description);
        }
    };

    StructureTower.prototype._repair = StructureTower.prototype.repair;
    StructureTower.prototype.repair = function (target: Structure | Spawn): number {
        if (!this.alreadyFired) {
            this.alreadyFired = true;
            return this._repair(target);
        } else {
            return ERR_BUSY;
        }
    };

    /**
     * General-purpose cpu-efficient movement function that uses ignoreCreeps: true, a high reusePath value and
     * stuck-detection
     * @param destination
     * @param ops - pathfinding ops, ignoreCreeps and reusePath will be overwritten
     * @param dareDevil
     * @returns {number} - Error code
     */
    Creep.prototype.blindMoveTo = function(destination: RoomPosition | {pos: RoomPosition}, ops?: any,
                                           dareDevil = false): number {
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
        if (!this.memory.lastTickMoving) { this.memory.lastTickMoving = 0; }
        if (Game.time - this.memory.lastTickMoving > 1) {
            movingLastTick = false;
        }
        this.memory.lastTickMoving = Game.time;

        // check if stuck
        let stuck = this.pos.inRangeTo(this.memory.position.x, this.memory.position.y, 0);
        this.memory.position = this.pos;
        if (stuck && movingLastTick) {
            if (!this.memory.stuckCount) { this.memory.stuckCount = 0; }
            this.memory.stuckCount++;
            if (dareDevil && this.memory.stuckCount > 0) {
                this.memory.detourTicks = 5;
            } else if (this.memory.stuckCount >= 2) {
                this.memory.detourTicks = 5;
                // this.say("excuse me", true);
            }
            if (this.memory.stuckCount > 500 && !this.memory.stuckNoted) {
                console.log(this.name, "is stuck at", this.pos, "stuckCount:", this.memory.stuckCount);
                this.memory.stuckNoted = true;
            }
        } else {
            this.memory.stuckCount = 0;
        }

        if (this.memory.detourTicks > 0) {
            this.memory.detourTicks--;
            if (dareDevil) {
                ops.reusePath = 0;
            } else {
                ops.reusePath = 5;
            }
            return this.moveTo(destination, ops);
        } else {
            ops.reusePath = 50;
            ops.ignoreCreeps = true;
            return this.moveTo(destination, ops);
        }
    };
}

import {RaidAgent} from "./RaidAgent";
import {ZombieMission} from "./ZombieMission";
import {notifier} from "../../notifier";
export class ZombieAgent extends RaidAgent {

    memory: {
        reachedFallback: boolean;
        registered: boolean;
        safeCount: number;
        demolishing: boolean;
    };

    moveZombie(destination: {pos: RoomPosition}, ignoreStuck: boolean): number | RoomPosition {
        let zombies = (this.mission as ZombieMission).zombies;

        let roomCallback = (roomName: string) => {
            if (roomName === this.guru.raidRoomName) {
                let matrix = this.guru.matrix;

                // add other zombies, whitelist nearby exits, and attack same target
                for (let otherZomb of zombies) {
                    if (this.creep === otherZomb || otherZomb.room !== this.room || otherZomb.pos.isNearExit(0)) { continue; }
                    matrix.set(otherZomb.pos.x, otherZomb.pos.y, 0xff);
                    for (let direction = 1; direction <= 8; direction ++) {
                        let position = otherZomb.pos.getPositionAtDirection(direction);
                        if (position.isNearExit(0)) {
                            matrix.set(position.x, position.y, 1);
                        }
                        else if (position.lookForStructure(STRUCTURE_WALL) ||
                            position.lookForStructure(STRUCTURE_RAMPART)){
                            let currentCost = matrix.get(position.x, position.y);
                            matrix.set(position.x, position.y, Math.ceil(currentCost / 2));
                        }
                    }
                }

                // avoid plowing into storages/terminals
                if (this.guru.raidRoom) {
                    if (this.room.storage) {
                        matrix.set(this.guru.raidRoom.storage.pos.x, this.room.storage.pos.y, 0xff);
                    }

                    if (this.room.terminal) {
                        matrix.set(this.guru.raidRoom.terminal.pos.x, this.room.terminal.pos.y, 0xff);
                    }
                }

                return matrix;
            }
        };

        return this.travelTo(destination, {
            ignoreStuck: ignoreStuck,
            returnPosition: true,
            roomCallback: roomCallback,
        })
    }

    findDestination() {
        let destination: {pos: RoomPosition} = this.mission.flag;
        if (this.pos.roomName === destination.pos.roomName) {
            let closestSpawn = this.pos.findClosestByRange<Structure>(
                this.room.findStructures<Structure>(STRUCTURE_SPAWN));
            if (closestSpawn) {
                destination = closestSpawn;
            }
        }
        return destination;
    }
}
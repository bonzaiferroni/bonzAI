import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class ObserverMission extends Mission {

    roomsToObserve: string[];
    observer: StructureObserver;

    /**
     * Manages observing a collections of rooms
     * @param {Object} operation
     * @param {string[]} rooms
     */

    constructor(operation: Operation, rooms: string[]) {
        super(operation, "observer");
        this.roomsToObserve = rooms;
    }

    initMission() {
        if (_.isEmpty(this.roomsToObserve)) {
            for (let i = 0; i < 10; i++) {
                let flag = Game.flags[this.opName + "_observe_" + i];
                if (!_.isEmpty(flag)) {
                    this.roomsToObserve.push(flag.pos.roomName);
                    if (Game.rooms[this.roomsToObserve[i]]) {
                        this.empire.register(Game.rooms[this.roomsToObserve[i]]);
                    }
                }
            }
        }
    }

    roleCall() {
        if (_.isEmpty(this.roomsToObserve)) return;
        this.observer = this.room.findStructures(STRUCTURE_OBSERVER)[0] as StructureObserver;
    }

    missionActions() {
        if (_.isEmpty(this.roomsToObserve)) return;
        this.observer.observeRoom(this.roomsToObserve[Game.time % this.roomsToObserve.length]);
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}
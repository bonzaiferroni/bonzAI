import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {ARTROOMS} from "../../config/constants";
export class ReserveMission extends Mission {

    reservers: Creep[];
    controller: StructureController;

    memory: {
        wallCheck: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    initMission() {
        if (!this.hasVision) return; //
        this.controller = this.room.controller;
    }

    roleCall() {
        let needReserver = this.controller && !this.controller.my
            && (!this.controller.reservation || this.controller.reservation.ticksToEnd < 3000);
        let maxReservers = needReserver ? 1 : 0;
        let potency = this.spawnGroup.room.controller.level === 8 ? 5 : 2;
        let reserverBody = () => this.configBody({
            claim: potency,
            move: potency
        });
        this.reservers = this.headCount("claimer", reserverBody, maxReservers);
    }

    missionActions() {
        for (let reserver of this.reservers) {
            this.reserverActions(reserver);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private reserverActions(reserver: Creep) {
        if (!this.controller) {
            reserver.blindMoveTo(this.flag);
            return; // early
        }

        if (reserver.pos.isNearTo(this.controller)) {
            reserver.reserveController(this.controller);
            if (!this.memory.wallCheck) {
                this.memory.wallCheck = this.destroyWalls(reserver, this.room)
            }
        }
        else {
            reserver.blindMoveTo(this.controller);
        }
    }

    private destroyWalls(surveyor: Creep, room: Room): boolean {
        if (!room.controller) return true;

        if (room.controller.my) {
            room.findStructures(STRUCTURE_WALL).forEach((w: Structure) => w.destroy());
            if (room.controller.level === 1) {
                room.controller.unclaim();
            }
            return true;
        }
        else {
            let roomAvailable = Game.gcl.level - _.filter(Game.rooms, (r: Room) => r.controller && r.controller.my).length;
            if (this.room.findStructures(STRUCTURE_WALL).length > 0 && !ARTROOMS[room.name] && roomAvailable > 0) {
                surveyor.claimController(room.controller);
                return false;
            }
            else {
                return true;
            }
        }
    }
}
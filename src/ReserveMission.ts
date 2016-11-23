import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class ReserveMission extends Mission {

    reservers: Creep[];
    controller: StructureController;

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
        }
        else {
            reserver.blindMoveTo(this.controller);
        }
    }
}
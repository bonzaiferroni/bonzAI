import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class ClaimMission extends Mission {

    claimers: Creep[];
    controller: StructureController;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    initMission() {
        //if (!this.hasVision) return; // early
        if(this.room) {
            this.controller = this.room.controller;
        }
    }

    roleCall() {
        let needClaimer = (this.controller && !this.controller.my) || !this.hasVision;
        let maxClaimers = needClaimer ? 1 : 0;
        this.claimers = this.headCount("claimer", () => [CLAIM, MOVE], maxClaimers, { blindSpawn: true });
    }

    missionActions() {

        for (let claimer of this.claimers) {
            this.claimerActions(claimer);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private claimerActions(claimer: Creep) {

        if (!this.controller) {
            this.moveToFlag(claimer);
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        }
        else {
            claimer.blindMoveTo(this.controller);
        }
    }
}
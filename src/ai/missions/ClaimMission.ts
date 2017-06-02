import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
export class ClaimMission extends Mission {

    claimers: Agent[];
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

    getMax = () => (this.controller && !this.controller.my) || !this.hasVision ? 1 : 0;

    roleCall() {
        let parts = [CLAIM, MOVE];
        if (this.memory.offRoad) {
            parts = [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE];
        }
        this.claimers = this.headCount("claimer", () => parts, this.getMax, { blindSpawn: true });
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

    private claimerActions(claimer: Agent) {

        console.log(`ey`);
        if (!this.controller) {
            claimer.idleOffRoad();
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        }
        else {
            claimer.travelTo(this.controller);
        }
    }
}

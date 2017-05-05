import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
export class ClaimMission extends Mission {

    private claimers: Agent[];
    private controller: StructureController;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public initMission() {
        if (this.room) {
            this.controller = this.room.controller;
        }
    }

    private getMax = () => (this.controller && !this.controller.my) || !this.hasVision ? 1 : 0;

    public roleCall() {
        this.claimers = this.headCount("claimer", () => [CLAIM, MOVE], this.getMax, { blindSpawn: true });
    }

    public missionActions() {

        for (let claimer of this.claimers) {
            this.claimerActions(claimer);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private claimerActions(claimer: Agent) {

        if (!this.controller) {
            claimer.idleOffRoad();
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        } else {
            claimer.travelTo(this.controller);
        }
    }
}

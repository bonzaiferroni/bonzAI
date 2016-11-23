import {Mission} from "./Mission";
export class ScoutMission extends Mission {

    scouts: Creep[];

    constructor(operation) {
        super(operation, "scout");
    }

    initMission() {
    }

    roleCall() {
        let maxScouts = this.hasVision ? 0 : 1;
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    missionActions() {
        for (let scout of this.scouts) {

            let fleeing = scout.fleeHostiles();
            if (fleeing) return;

            if (!scout.pos.isNearTo(this.flag)) {
                scout.blindMoveTo(this.flag);
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}
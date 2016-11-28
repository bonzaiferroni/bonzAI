import {Mission} from "./Mission";
export class ScoutMission extends Mission {

    scouts: Creep[];

    constructor(operation) {
        super(operation, "scout");
    }

    initMission() {
    }

    roleCall() {
        let maxScouts = 0;
        if (!this.hasVision) {
            maxScouts = 1;
        }
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    missionActions() {
        for (let scout of this.scouts) {

            if (!scout.pos.isNearTo(this.flag)) {
                scout.avoidSK(this.flag);
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}
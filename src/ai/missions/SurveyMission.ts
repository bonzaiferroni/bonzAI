import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {SurveyAnalyzer} from "./SurveyAnalyzer";
import {traveler} from "../Traveler";

export class SurveyMission extends Mission {

    surveyors: Creep[];
    needsVision: string;
    chosenRoom: {roomName: string, orderDemolition: boolean};
    memory: {
        surveyComplete: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "survey");
    }

    initMission() {
        if (this.memory.surveyComplete) { return; }
        let analyzer = new SurveyAnalyzer(this);
        this.needsVision = analyzer.run();
    }

    roleCall() {
        let maxSurveyors = 0;
        if (this.needsVision && !this.room.findStructures(STRUCTURE_OBSERVER)[0] || this.chosenRoom) {
            maxSurveyors = 1;
        }

        this.surveyors = this.headCount("surveyor", () => this.workerBody(0, 0, 1), maxSurveyors);
    }

    missionActions() {

        for (let surveyor of this.surveyors) {
            if (this.needsVision) {
                this.explorerActions(surveyor);
            }
        }

        if (this.needsVision) {
            let observer = this.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (!observer) { return; }
            observer.observeRoom(this.needsVision);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    explorerActions(explorer: Creep) {
        if (this.needsVision) {
            traveler.travelTo(explorer, {pos: helper.pathablePosition(this.needsVision)});
        }
    }
}
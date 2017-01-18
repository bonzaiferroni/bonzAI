import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {SurveyAnalyzer} from "./SurveyAnalyzer";
import {empire} from "../../helpers/loopHelper";
import {Agent} from "./Agent";

export class SurveyMission extends Mission {

    surveyors: Agent[];
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

    maxSurveyors = () => {
        if (this.needsVision && !this.room.findStructures(STRUCTURE_OBSERVER)[0] || this.chosenRoom) {
            return 1;
        } else {
            return 0;
        }
    };

    roleCall() {


        this.surveyors = this.headCount2("surveyor", () => this.workerBody(0, 0, 1), this.maxSurveyors);
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

    explorerActions(explorer: Agent) {
        if (this.needsVision) {
            explorer.travelTo({pos: helper.pathablePosition(this.needsVision)});
        }
    }
}
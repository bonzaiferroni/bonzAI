import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {SurveyAnalyzer} from "./SurveyAnalyzer";
import {Agent} from "../agents/Agent";

export class SurveyMission extends Mission {

    private surveyors: Agent[];
    private needsVision: string;
    private chosenRoom: {roomName: string, orderDemolition: boolean};
    public memory: {
        surveyComplete: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "survey");
    }

    public init() { }

    public refresh() {
        this.chosenRoom = undefined;
        this.needsVision = undefined;
        if (this.memory.surveyComplete) { return; }
        let analyzer = new SurveyAnalyzer(this);
        this.needsVision = analyzer.run();
    }

    private maxSurveyors = () => {
        if (this.needsVision && !this.room.findStructures(STRUCTURE_OBSERVER)[0] || this.chosenRoom) {
            return 1;
        } else {
            return 0;
        }
    };

    public roleCall() {
        this.surveyors = this.headCount("surveyor", () => this.workerBody(0, 0, 1), this.maxSurveyors);
    }

    public actions() {

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

    public finalize() {
    }

    public invalidateCache() {
    }

    private explorerActions(explorer: Agent) {
        if (this.needsVision) {
            explorer.travelTo({pos: helper.pathablePosition(this.needsVision)});
        }
    }
}
